import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAI, GoogleAIBackend, type AI } from 'firebase/ai';
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
  type AppCheck,
} from 'firebase/app-check';
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
  type Auth,
  type User,
} from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import {
  getRemoteConfig,
  fetchAndActivate,
  getString,
  type RemoteConfig,
} from 'firebase/remote-config';
import type { HybridModeKey } from '../types/spec';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
};

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId
);

export interface FirebaseRuntime {
  app: FirebaseApp | null;
  ai: AI | null;
  auth: Auth | null;
  db: Firestore | null;
  appCheck: AppCheck | null;
  remoteConfig: RemoteConfig | null;
  appCheckMode: 'recaptcha-enterprise' | 'debug-token' | 'unconfigured';
}

export interface RemoteConfigValues {
  cloudFallbackModel: string;
  defaultInferenceMode: HybridModeKey;
  studioTagline: string;
  fetchedFromRemote: boolean;
}

let runtime: FirebaseRuntime | null = null;

export function getFirebaseRuntime(): FirebaseRuntime {
  if (runtime) return runtime;

  if (!isFirebaseConfigured) {
    runtime = {
      app: null,
      ai: null,
      auth: null,
      db: null,
      appCheck: null,
      remoteConfig: null,
      appCheckMode: 'unconfigured',
    };
    return runtime;
  }

  const app = initializeApp(firebaseConfig);

  // Initialize Firebase App Check when reCAPTCHA Enterprise site key is configured
  // or when running on localhost with debug tokens (accepted for #BuildHybridAI 2026).
  let appCheck: AppCheck | null = null;
  let appCheckMode: FirebaseRuntime['appCheckMode'] = 'unconfigured';
  const recaptchaSiteKey = import.meta.env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY || '';
  const debugTokenEnv = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN || '';
  const isLocalhost =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  try {
    if (recaptchaSiteKey) {
      appCheck = initializeAppCheck(app, {
        provider: new ReCaptchaEnterpriseProvider(recaptchaSiteKey),
        isTokenAutoRefreshEnabled: true,
      });
      appCheckMode = 'recaptcha-enterprise';
    } else if (isLocalhost && typeof self !== 'undefined') {
      (self as unknown as Record<string, unknown>).FIREBASE_APPCHECK_DEBUG_TOKEN =
        debugTokenEnv === 'true' || !debugTokenEnv ? true : debugTokenEnv;
      appCheck = initializeAppCheck(app, {
        provider: new ReCaptchaEnterpriseProvider('6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI'),
        isTokenAutoRefreshEnabled: true,
      });
      appCheckMode = 'debug-token';
    } else {
      appCheckMode = 'debug-token';
    }
  } catch (err) {
    console.warn('[ArchSpec] App Check initialization notice:', err);
  }

  // Initialize Firebase AI Logic with Gemini Developer API (no billing required for gemini-3.5-flash-lite)
  const ai = getAI(app, { backend: new GoogleAIBackend() });

  // Auth + Offline-first Firestore persistence
  const auth = getAuth(app);
  const db = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  });

  // Remote Config with offline-first defaults (dynamically updates cloud fallback model without redeploy)
  let remoteConfig: RemoteConfig | null = null;
  try {
    remoteConfig = getRemoteConfig(app);
    remoteConfig.settings.minimumFetchIntervalMillis = 60_000;
    remoteConfig.defaultConfig = {
      cloud_fallback_model: 'gemini-3.5-flash-lite',
      default_inference_mode: 'PREFER_ON_DEVICE',
      studio_tagline: 'Offline-First Hybrid AI Architectural & 3D Material Studio',
    };
  } catch (err) {
    console.warn('[ArchSpec] Remote Config fallback:', err);
  }

  runtime = { app, ai, auth, db, appCheck, remoteConfig, appCheckMode };
  return runtime;
}

export async function ensureAnonymousUser(): Promise<User | null> {
  const { auth } = getFirebaseRuntime();
  if (!auth) return null;

  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, async (existing) => {
      unsub();
      if (existing) {
        resolve(existing);
        return;
      }
      try {
        const cred = await signInAnonymously(auth);
        resolve(cred.user);
      } catch (err) {
        console.warn('[ArchSpec] Anonymous auth skipped (offline or not enabled):', err);
        resolve(null);
      }
    });
  });
}

export async function loadRemoteConfigValues(): Promise<RemoteConfigValues> {
  const defaults: RemoteConfigValues = {
    cloudFallbackModel: 'gemini-3.5-flash-lite',
    defaultInferenceMode: 'PREFER_ON_DEVICE',
    studioTagline: 'Offline-First Hybrid AI Architectural & 3D Material Studio',
    fetchedFromRemote: false,
  };

  const { remoteConfig } = getFirebaseRuntime();
  if (!remoteConfig) return defaults;

  try {
    const activated = await fetchAndActivate(remoteConfig);
    const model = getString(remoteConfig, 'cloud_fallback_model') || defaults.cloudFallbackModel;
    const modeRaw = getString(remoteConfig, 'default_inference_mode') as HybridModeKey;
    const tagline = getString(remoteConfig, 'studio_tagline') || defaults.studioTagline;
    const validModes: HybridModeKey[] = [
      'PREFER_ON_DEVICE',
      'ONLY_ON_DEVICE',
      'PREFER_IN_CLOUD',
      'ONLY_IN_CLOUD',
    ];
    return {
      cloudFallbackModel: model,
      defaultInferenceMode: validModes.includes(modeRaw) ? modeRaw : defaults.defaultInferenceMode,
      studioTagline: tagline,
      fetchedFromRemote: activated,
    };
  } catch {
    return defaults;
  }
}
