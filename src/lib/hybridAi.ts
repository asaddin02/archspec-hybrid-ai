import {
  getGenerativeModel,
  InferenceMode,
  Schema,
  type Part,
} from 'firebase/ai';
import { getFirebaseRuntime } from './firebase';
import type {
  ArchMaterialSpec,
  HybridModeKey,
  HybridTelemetry,
  InferenceSourceTag,
} from '../types/spec';

export type OnDeviceStatus =
  | 'available'
  | 'downloadable'
  | 'downloading'
  | 'unavailable'
  | 'unsupported';

interface ChromeLanguageModelAPI {
  availability: () => Promise<string>;
  create: (opts?: {
    monitor?: (m: EventTarget) => void;
  }) => Promise<{ destroy?: () => void }>;
}

function getChromeLanguageModel(): ChromeLanguageModelAPI | null {
  if (typeof globalThis === 'undefined') return null;
  const lm = (globalThis as unknown as { LanguageModel?: ChromeLanguageModelAPI })
    .LanguageModel;
  return lm && typeof lm.availability === 'function' ? lm : null;
}

export async function checkOnDeviceModelStatus(): Promise<OnDeviceStatus> {
  const lm = getChromeLanguageModel();
  if (!lm) return 'unsupported';
  try {
    const status = await lm.availability();
    if (
      status === 'available' ||
      status === 'downloadable' ||
      status === 'downloading' ||
      status === 'unavailable'
    ) {
      return status;
    }
    return 'unavailable';
  } catch {
    return 'unsupported';
  }
}

export async function triggerOnDeviceModelDownload(
  onProgress: (percent: number) => void
): Promise<OnDeviceStatus> {
  const lm = getChromeLanguageModel();
  if (!lm) return 'unsupported';
  const session = await lm.create({
    monitor(m) {
      m.addEventListener('downloadprogress', (evt) => {
        const loaded = (evt as unknown as { loaded?: number }).loaded ?? 0;
        onProgress(Math.min(100, Math.round(loaded * 100)));
      });
    },
  });
  session?.destroy?.();
  return checkOnDeviceModelStatus();
}

function mapInferenceMode(mode: HybridModeKey): InferenceMode {
  switch (mode) {
    case 'ONLY_ON_DEVICE':
      return InferenceMode.ONLY_ON_DEVICE;
    case 'PREFER_IN_CLOUD':
      return InferenceMode.PREFER_IN_CLOUD;
    case 'ONLY_IN_CLOUD':
      return InferenceMode.ONLY_IN_CLOUD;
    case 'PREFER_ON_DEVICE':
    default:
      return InferenceMode.PREFER_ON_DEVICE;
  }
}

const ARCH_SPEC_FIREBASE_SCHEMA = Schema.object({
  properties: {
    projectTitle: Schema.string(),
    architecturalStyle: Schema.string(),
    roomType: Schema.string(),
    summary: Schema.string(),
    lightingMood: Schema.enumString({
      enum: ['daylight', 'golden_hour', 'dusk'],
    }),
    sunKelvin: Schema.number(),
    estimatedBudgetUsd: Schema.string(),
    privacyAuditNote: Schema.string(),
    palette: Schema.object({
      properties: {
        wallHex: Schema.string(),
        floorHex: Schema.string(),
        woodHex: Schema.string(),
        accentHex: Schema.string(),
        waterHex: Schema.string(),
        ambientIntensity: Schema.number(),
        sunIntensity: Schema.number(),
      },
    }),
    materials: Schema.array({
      items: Schema.object({
        properties: {
          zone: Schema.string(),
          materialName: Schema.string(),
          finish: Schema.string(),
          pbrRoughness: Schema.number(),
          pbrMetalness: Schema.number(),
          lightingSpec: Schema.string(),
          estimatedCostPerSqmUsd: Schema.number(),
        },
      }),
    }),
  },
});

const ARCH_SPEC_ONDEVICE_CONSTRAINT = {
  type: 'object',
  properties: {
    projectTitle: { type: 'string' },
    architecturalStyle: { type: 'string' },
    roomType: { type: 'string' },
    summary: { type: 'string' },
    lightingMood: { type: 'string', enum: ['daylight', 'golden_hour', 'dusk'] },
    sunKelvin: { type: 'number' },
    estimatedBudgetUsd: { type: 'string' },
    privacyAuditNote: { type: 'string' },
    palette: {
      type: 'object',
      properties: {
        wallHex: { type: 'string' },
        floorHex: { type: 'string' },
        woodHex: { type: 'string' },
        accentHex: { type: 'string' },
        waterHex: { type: 'string' },
        ambientIntensity: { type: 'number' },
        sunIntensity: { type: 'number' },
      },
      required: [
        'wallHex',
        'floorHex',
        'woodHex',
        'accentHex',
        'waterHex',
        'ambientIntensity',
        'sunIntensity',
      ],
    },
    materials: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          zone: { type: 'string' },
          materialName: { type: 'string' },
          finish: { type: 'string' },
          pbrRoughness: { type: 'number' },
          pbrMetalness: { type: 'number' },
          lightingSpec: { type: 'string' },
          estimatedCostPerSqmUsd: { type: 'number' },
        },
        required: [
          'zone',
          'materialName',
          'finish',
          'pbrRoughness',
          'pbrMetalness',
          'lightingSpec',
          'estimatedCostPerSqmUsd',
        ],
      },
    },
  },
  required: [
    'projectTitle',
    'architecturalStyle',
    'roomType',
    'summary',
    'lightingMood',
    'sunKelvin',
    'estimatedBudgetUsd',
    'privacyAuditNote',
    'palette',
    'materials',
  ],
};

async function fileToGenerativePart(file: File): Promise<Part> {
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const str = String(reader.result || '');
      resolve(str.includes(',') ? str.split(',')[1] : str);
    };
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.readAsDataURL(file);
  });
  return {
    type: 'inlineData',
    inlineData: {
      data: base64,
      mimeType: file.type || 'image/jpeg',
    },
  };
}

function sanitizeHex(hex: string | undefined, fallback: string): string {
  if (typeof hex === 'string' && /^#[0-9a-fA-F]{6}$/.test(hex.trim())) {
    return hex.trim();
  }
  return fallback;
}

function normalizeSpec(raw: Partial<ArchMaterialSpec>, roomTypeFallback: string): ArchMaterialSpec {
  const p = raw.palette || ({} as ArchMaterialSpec['palette']);
  const mood =
    raw.lightingMood === 'daylight' ||
    raw.lightingMood === 'golden_hour' ||
    raw.lightingMood === 'dusk'
      ? raw.lightingMood
      : 'golden_hour';

  const mats = Array.isArray(raw.materials) && raw.materials.length > 0
    ? raw.materials.slice(0, 6).map((m) => ({
        zone: String(m.zone || 'Interior Zone'),
        materialName: String(m.materialName || 'Architectural Finish'),
        finish: String(m.finish || 'Matte Natural'),
        pbrRoughness: Math.min(1, Math.max(0.05, Number(m.pbrRoughness ?? 0.65))),
        pbrMetalness: Math.min(1, Math.max(0, Number(m.pbrMetalness ?? 0.05))),
        lightingSpec: String(m.lightingSpec || '3000K CRI 95+ LED'),
        estimatedCostPerSqmUsd: Math.max(15, Math.round(Number(m.estimatedCostPerSqmUsd ?? 85))),
      }))
    : [
        {
          zone: 'Primary Walls',
          materialName: 'Mineral Lime Plaster',
          finish: 'Matte Hand-Troweled',
          pbrRoughness: 0.85,
          pbrMetalness: 0,
          lightingSpec: '2700K Recessed Linear Wash',
          estimatedCostPerSqmUsd: 70,
        },
      ];

  return {
    projectTitle: String(raw.projectTitle || 'Custom Architectural Material Specification'),
    architecturalStyle: String(raw.architecturalStyle || 'Contemporary Architectural'),
    roomType: String(raw.roomType || roomTypeFallback),
    summary: String(
      raw.summary ||
        'Balanced PBR material and lighting specification tailored for photoreal 3D walkthroughs and construction documentation.'
    ),
    lightingMood: mood,
    sunKelvin: Math.min(6500, Math.max(2200, Math.round(Number(raw.sunKelvin ?? 3400)))),
    estimatedBudgetUsd: String(raw.estimatedBudgetUsd || '$15,000 – $25,000'),
    privacyAuditNote: String(
      raw.privacyAuditNote ||
        'Generated via Firebase AI Logic Hybrid Inference with automatic local/cloud routing.'
    ),
    palette: {
      wallHex: sanitizeHex(p.wallHex, '#e8e2d5'),
      floorHex: sanitizeHex(p.floorHex, '#b8ae9e'),
      woodHex: sanitizeHex(p.woodHex, '#8c5a34'),
      accentHex: sanitizeHex(p.accentHex, '#3e5c50'),
      waterHex: sanitizeHex(p.waterHex, '#2d6e75'),
      ambientIntensity: Math.min(1.4, Math.max(0.25, Number(p.ambientIntensity ?? 0.65))),
      sunIntensity: Math.min(2.6, Math.max(0.5, Number(p.sunIntensity ?? 1.75))),
    },
    materials: mats,
  };
}

function extractInferenceSource(response: unknown, mode: HybridModeKey): InferenceSourceTag {
  const src = (response as { inferenceSource?: string })?.inferenceSource;
  if (src === 'ON_DEVICE') return 'ON_DEVICE';
  if (src === 'IN_CLOUD') return 'IN_CLOUD';
  return mode === 'ONLY_ON_DEVICE' ? 'ON_DEVICE' : 'IN_CLOUD';
}

export async function generateHybridArchSpec(params: {
  brief: string;
  roomType: string;
  mode: HybridModeKey;
  cloudModel: string;
  imageFile?: File | null;
}): Promise<{ spec: ArchMaterialSpec; telemetry: HybridTelemetry }> {
  const { ai } = getFirebaseRuntime();
  if (!ai) {
    throw new Error(
      'Firebase is not configured. Copy .env.example to .env.local and add your Firebase Web SDK keys.'
    );
  }

  const startedAt = performance.now();
  const onlineAtCall = typeof navigator !== 'undefined' ? navigator.onLine : true;

  const instruction = `You are a Principal Architectural Material & 3D PBR Lighting Director.
Given the client brief (and optional floor plan / room photo), output ONLY a valid JSON object matching the exact schema with realistic architectural hex colors, PBR roughness (0.05-1.0), PBR metalness (0.0-1.0), Kelvin color temperature (2200-6500), 4-5 distinct material zones, and an NDA privacy audit note.

Room Category: ${params.roomType}
Client Brief: ${params.brief}`;

  const candidateModels =
    params.mode === 'ONLY_ON_DEVICE'
      ? [params.cloudModel || 'gemini-3.8-flash']
      : Array.from(
          new Set([
            params.cloudModel || 'gemini-3.8-flash',
            'gemini-3.8-flash',
            'gemini-3.5-flash-lite',
            'gemini-4-hydrogen',
          ])
        );

  let approxBytes = new TextEncoder().encode(instruction).length;
  let imgPart: Part | null = null;
  if (params.imageFile) {
    imgPart = await fileToGenerativePart(params.imageFile);
    approxBytes += params.imageFile.size;
  }

  let result: Awaited<ReturnType<ReturnType<typeof getGenerativeModel>['generateContent']>> | null =
    null;
  let usedCloudModel = candidateModels[0];
  let lastError: unknown = null;

  for (const candidate of candidateModels) {
    usedCloudModel = candidate;
    // Call getGenerativeModel directly on user action as required by Firebase AI Logic Hybrid Inference docs
    const model = getGenerativeModel(ai, {
      mode: mapInferenceMode(params.mode),
      inCloudParams: {
        model: candidate,
        generationConfig: {
          temperature: 0.6,
          maxOutputTokens: 2048,
          responseMimeType: 'application/json',
          responseSchema: ARCH_SPEC_FIREBASE_SCHEMA,
        },
      },
      onDeviceParams: {
        createOptions: {
          expectedOutputs: [{ type: 'text', languages: ['en'] }],
        },
        promptOptions: {
          responseConstraint: ARCH_SPEC_ONDEVICE_CONSTRAINT,
        },
      },
    });

    try {
      result = imgPart
        ? await model.generateContent([instruction, imgPart])
        : await model.generateContent(instruction);
      break;
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isTransient = /500|503|429|high demand|overloaded|unavailable/i.test(msg);
      if (!isTransient || params.mode === 'ONLY_ON_DEVICE') {
        throw err;
      }
      console.warn(`[ArchSpec] Transient cloud spike on ${candidate}, failing over to next model...`);
    }
  }

  if (!result) {
    throw lastError instanceof Error ? lastError : new Error('Hybrid AI request failed.');
  }

  const response = result.response;
  const rawText = response.text().trim();
  const cleaned = rawText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  const parsed = JSON.parse(cleaned) as Partial<ArchMaterialSpec>;
  const spec = normalizeSpec(parsed, params.roomType);
  const inferenceSource = extractInferenceSource(response, params.mode);
  const latencyMs = Math.round(performance.now() - startedAt);

  return {
    spec,
    telemetry: {
      inferenceSource,
      inferenceMode: params.mode,
      modelUsed:
        inferenceSource === 'ON_DEVICE'
          ? 'Gemini Nano (Chrome Prompt API)'
          : usedCloudModel,
      latencyMs,
      timestamp: new Date().toLocaleTimeString(),
      onlineAtCall,
      cloudBytesSent: inferenceSource === 'ON_DEVICE' ? 0 : approxBytes,
    },
  };
}

export async function streamSiteInspectionCritique(params: {
  brief: string;
  currentSpec: ArchMaterialSpec;
  mode: HybridModeKey;
  cloudModel: string;
  onChunk: (fullText: string) => void;
}): Promise<HybridTelemetry> {
  const { ai } = getFirebaseRuntime();
  if (!ai) {
    throw new Error('Firebase is not configured.');
  }

  const startedAt = performance.now();
  const onlineAtCall = typeof navigator !== 'undefined' ? navigator.onLine : true;

  const prompt = `You are an on-site Senior Architect conducting a fast construction-site inspection review.
Project: ${params.currentSpec.projectTitle} (${params.currentSpec.architecturalStyle})
Lighting: ${params.currentSpec.lightingMood} at ${params.currentSpec.sunKelvin}K
Key Materials: ${params.currentSpec.materials.map((m) => `${m.zone}: ${m.materialName} (${m.finish})`).join('; ')}
Client Notes / Brief: ${params.brief}

Provide a concise, high-signal 4-bullet field checklist covering:
1) Glare & daylighting risk,
2) Durability & humidity/maintenance warning for the specified finishes,
3) Acoustic or circulation improvement,
4) Value-engineering tip to save 10-15% without hurting visual luxury.`;

  const candidateModels =
    params.mode === 'ONLY_ON_DEVICE'
      ? [params.cloudModel || 'gemini-3.8-flash']
      : Array.from(
          new Set([
            params.cloudModel || 'gemini-3.8-flash',
            'gemini-3.8-flash',
            'gemini-3.5-flash-lite',
            'gemini-4-hydrogen',
          ])
        );

  let usedCloudModel = candidateModels[0];
  let finalResponse: unknown = null;
  let lastError: unknown = null;

  for (const candidate of candidateModels) {
    usedCloudModel = candidate;
    const model = getGenerativeModel(ai, {
      mode: mapInferenceMode(params.mode),
      inCloudParams: {
        model: candidate,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 900,
        },
      },
      onDeviceParams: {
        createOptions: {
          expectedOutputs: [{ type: 'text', languages: ['en'] }],
        },
      },
    });

    try {
      const streamResult = await model.generateContentStream(prompt);
      let accumulated = '';
      for await (const chunk of streamResult.stream) {
        accumulated += chunk.text();
        params.onChunk(accumulated);
      }
      finalResponse = await streamResult.response;
      break;
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isTransient = /500|503|429|high demand|overloaded|unavailable/i.test(msg);
      if (!isTransient || params.mode === 'ONLY_ON_DEVICE') {
        throw err;
      }
      console.warn(`[ArchSpec] Stream spike on ${candidate}, failing over...`);
    }
  }

  if (!finalResponse) {
    throw lastError instanceof Error ? lastError : new Error('Hybrid AI stream failed.');
  }

  const inferenceSource = extractInferenceSource(finalResponse, params.mode);
  const latencyMs = Math.round(performance.now() - startedAt);

  return {
    inferenceSource,
    inferenceMode: params.mode,
    modelUsed:
      inferenceSource === 'ON_DEVICE'
        ? 'Gemini Nano (Chrome Prompt API)'
        : usedCloudModel,
    latencyMs,
    timestamp: new Date().toLocaleTimeString(),
    onlineAtCall,
    cloudBytesSent:
      inferenceSource === 'ON_DEVICE' ? 0 : new TextEncoder().encode(prompt).length,
  };
}
