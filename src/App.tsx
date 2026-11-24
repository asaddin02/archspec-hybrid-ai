import React, { useEffect, useMemo, useState } from 'react';
import {
  Cpu,
  Cloud,
  ShieldCheck,
  Sparkles,
  Wifi,
  WifiOff,
  Download,
  Save,
  Trash2,
  FileText,
  MessageSquare,
  Sun,
  Moon,
  Upload,
  X,
  RefreshCw,
} from 'lucide-react';
import { Arch3DViewport } from './components/Arch3DViewport';
import {
  ensureAnonymousUser,
  getFirebaseRuntime,
  isFirebaseConfigured,
  loadRemoteConfigValues,
  type RemoteConfigValues,
} from './lib/firebase';
import {
  checkOnDeviceModelStatus,
  generateHybridArchSpec,
  streamSiteInspectionCritique,
  triggerOnDeviceModelDownload,
  type OnDeviceStatus,
} from './lib/hybridAi';
import {
  deleteSavedSpec,
  loadSavedSpecs,
  saveSpecToFirestore,
} from './lib/firestoreStore';
import {
  DEFAULT_ARCH_SPEC,
  PRESET_BRIEFS,
  type ArchMaterialSpec,
  type HybridModeKey,
  type HybridTelemetry,
  type LightingMood,
  type SavedSpecRecord,
  type ScenePalette,
} from './types/spec';

type ThemePref = 'light' | 'dark';

const LOCAL_STORAGE_KEY = 'archspec_local_specs_v2';

const MODE_OPTIONS: { key: HybridModeKey; title: string; subtitle: string }[] = [
  {
    key: 'PREFER_ON_DEVICE',
    title: 'Prefer on-device',
    subtitle: 'Gemini Nano first, cloud fallback',
  },
  {
    key: 'ONLY_ON_DEVICE',
    title: 'Only on-device',
    subtitle: 'Strict air-gapped NDA mode',
  },
  {
    key: 'PREFER_IN_CLOUD',
    title: 'Prefer in-cloud',
    subtitle: 'Cloud Gemini first, local fallback',
  },
  {
    key: 'ONLY_IN_CLOUD',
    title: 'Only in-cloud',
    subtitle: 'Cloud reference benchmark',
  },
];

function readLocalSpecs(): SavedSpecRecord[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function App() {
  const [theme, setTheme] = useState<ThemePref>(() => {
    if (typeof window === 'undefined') return 'light';
    const saved = localStorage.getItem('archspec_theme');
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  const [spec, setSpec] = useState<ArchMaterialSpec>(DEFAULT_ARCH_SPEC);
  const [brief, setBrief] = useState<string>(PRESET_BRIEFS[0].prompt);
  const [roomType, setRoomType] = useState<string>(PRESET_BRIEFS[0].roomType);
  const [activePresetId, setActivePresetId] = useState<string>(PRESET_BRIEFS[0].id);
  const [mode, setMode] = useState<HybridModeKey>('PREFER_ON_DEVICE');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);

  const [telemetry, setTelemetry] = useState<HybridTelemetry | null>(null);
  const [critiqueText, setCritiqueText] = useState<string>('');
  const [critiqueTelemetry, setCritiqueTelemetry] = useState<HybridTelemetry | null>(null);

  const [isGenerating, setIsGenerating] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  const [online, setOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [onDeviceStatus, setOnDeviceStatus] = useState<OnDeviceStatus>('unsupported');
  const [downloadPct, setDownloadPct] = useState<number | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [savedSpecs, setSavedSpecs] = useState<SavedSpecRecord[]>(() => readLocalSpecs());
  const [remoteCfg, setRemoteCfg] = useState<RemoteConfigValues>({
    cloudFallbackModel: 'gemini-3.5-flash-lite',
    defaultInferenceMode: 'PREFER_ON_DEVICE',
    studioTagline: 'Offline-first architectural 3D & material studio',
    fetchedFromRemote: false,
  });

  const runtime = getFirebaseRuntime();

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('archspec_theme', theme);
  }, [theme]);

  useEffect(() => {
    if (!imageFile) {
      setImagePreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setImagePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    checkOnDeviceModelStatus().then(setOnDeviceStatus);

    loadRemoteConfigValues().then((cfg) => {
      setRemoteCfg(cfg);
      setMode(cfg.defaultInferenceMode);
    });

    ensureAnonymousUser().then(async (user) => {
      if (user) {
        setUid(user.uid);
        try {
          const cloudList = await loadSavedSpecs(user.uid);
          const taggedCloud = cloudList.map((item) => ({
            ...item,
            storageOrigin: 'firestore' as const,
          }));
          const localOnly = readLocalSpecs().filter(
            (loc) => !taggedCloud.some((c) => c.id === loc.id)
          );
          setSavedSpecs([...taggedCloud, ...localOnly].slice(0, 12));
        } catch {
          // Offline cache may be empty on first visit
        }
      }
    });

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const averageSqmCost = useMemo(() => {
    if (!spec.materials.length) return 0;
    const total = spec.materials.reduce((sum, m) => sum + m.estimatedCostPerSqmUsd, 0);
    return Math.round(total / spec.materials.length);
  }, [spec.materials]);

  const handleUpdatePalette = (
    key: keyof Pick<ScenePalette, 'wallHex' | 'floorHex' | 'woodHex' | 'accentHex' | 'waterHex'>,
    hex: string
  ) => {
    setSpec((prev) => ({
      ...prev,
      palette: {
        ...prev.palette,
        [key]: hex,
      },
    }));
  };

  const handleUpdateLighting = (mood: LightingMood, sunKelvin: number) => {
    setSpec((prev) => ({
      ...prev,
      lightingMood: mood,
      sunKelvin,
    }));
  };

  const handleDownloadLocalModel = async () => {
    setErrorMsg(null);
    setDownloadPct(0);
    try {
      const nextStatus = await triggerOnDeviceModelDownload((pct) => setDownloadPct(pct));
      setOnDeviceStatus(nextStatus);
      setDownloadPct(null);
      setStatusNotice('On-device Gemini Nano model is ready in Chrome.');
    } catch (err) {
      setDownloadPct(null);
      setErrorMsg(err instanceof Error ? err.message : 'Could not trigger local model download.');
    }
  };

  const handleGenerateSpec = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!brief.trim()) {
      setErrorMsg('Enter an architectural brief or select a preset before generating.');
      return;
    }
    setErrorMsg(null);
    setStatusNotice(null);
    setIsGenerating(true);

    try {
      const { spec: generated, telemetry: tel } = await generateHybridArchSpec({
        brief: brief.trim(),
        roomType: roomType.trim() || 'Architectural Pavilion',
        mode,
        cloudModel: remoteCfg.cloudFallbackModel,
        imageFile,
      });
      setSpec(generated);
      setTelemetry(tel);
      if (tel.inferenceSource === 'DEMO_LOCAL') {
        setStatusNotice(
          `Applied local studio fallback in ${tel.latencyMs} ms (${tel.fallbackReason || 'cloud temporarily busy'}). You can retry live Firebase AI anytime.`
        );
      } else {
        setStatusNotice(
          `Updated 3D PBR scene and specification via ${
            tel.inferenceSource === 'ON_DEVICE' ? 'On-Device Gemini Nano' : tel.modelUsed
          } in ${tel.latencyMs} ms.`
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setErrorMsg(
        mode === 'ONLY_ON_DEVICE'
          ? `Strict on-device mode blocked cloud fallback because Chrome Gemini Nano is currently "${onDeviceStatus}". Switch to "Prefer on-device" to use Firebase AI Logic cloud fallback (${remoteCfg.cloudFallbackModel}).`
          : `Hybrid AI request could not complete: ${message}`
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleStreamCritique = async () => {
    setErrorMsg(null);
    setCritiqueText('');
    setCritiqueTelemetry(null);
    setIsStreaming(true);

    try {
      const tel = await streamSiteInspectionCritique({
        brief: brief.trim() || spec.summary,
        currentSpec: spec,
        mode,
        cloudModel: remoteCfg.cloudFallbackModel,
        onChunk: (txt) => setCritiqueText(txt),
      });
      setCritiqueTelemetry(tel);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setIsStreaming(false);
    }
  };

  const handleSaveToFirestore = async () => {
    setErrorMsg(null);
    setIsSaving(true);
    const tel: HybridTelemetry = telemetry || {
      inferenceSource: 'DEMO_LOCAL',
      inferenceMode: mode,
      modelUsed: remoteCfg.cloudFallbackModel,
      latencyMs: 0,
      timestamp: new Date().toLocaleTimeString(),
      onlineAtCall: online,
      cloudBytesSent: 0,
    };

    try {
      let currentUid = uid;
      if (!currentUid) {
        const user = await ensureAnonymousUser();
        currentUid = user?.uid || null;
        setUid(currentUid);
      }

      if (currentUid) {
        await saveSpecToFirestore(currentUid, spec, tel);
        const updated = (await loadSavedSpecs(currentUid)).map((item) => ({
          ...item,
          storageOrigin: 'firestore' as const,
        }));
        const localOnly = readLocalSpecs().filter((l) => !updated.some((c) => c.id === l.id));
        setSavedSpecs([...updated, ...localOnly].slice(0, 12));
        setStatusNotice('Saved material specification to Cloud Firestore (offline-synced).');
      } else {
        const localRecord: SavedSpecRecord = {
          id: `local-${Date.now()}`,
          projectTitle: spec.projectTitle,
          architecturalStyle: spec.architecturalStyle,
          roomType: spec.roomType,
          inferenceSource: tel.inferenceSource,
          inferenceMode: tel.inferenceMode,
          latencyMs: tel.latencyMs,
          spec,
          createdAt: new Date().toLocaleString(),
          storageOrigin: 'local',
        };
        const nextLocal = [localRecord, ...readLocalSpecs()].slice(0, 12);
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(nextLocal));
        setSavedSpecs((prev) => [localRecord, ...prev].slice(0, 12));
        setStatusNotice('Saved locally on this device.');
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteSaved = async (record: SavedSpecRecord) => {
    setErrorMsg(null);
    try {
      if (record.storageOrigin === 'local' || record.id.startsWith('local-')) {
        const remaining = readLocalSpecs().filter((item) => item.id !== record.id);
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(remaining));
      } else if (uid) {
        await deleteSavedSpec(uid, record.id);
      }
      setSavedSpecs((prev) => prev.filter((item) => item.id !== record.id));
      setStatusNotice(`Removed "${record.projectTitle}" from saved archive.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to delete saved specification.');
    }
  };

  const exportMarkdown = () => {
    const md = [
      `# ${spec.projectTitle}`,
      `Style: ${spec.architecturalStyle} | Zone: ${spec.roomType}`,
      `Lighting: ${spec.lightingMood.replace('_', ' ')} (${spec.sunKelvin}K) | Est. Budget: ${spec.estimatedBudgetUsd}`,
      '',
      `> ${spec.summary}`,
      '',
      '## Material & Lighting Specification Schedule',
      '| Zone | Material | Finish | PBR Roughness / Metalness | Lighting Spec | Est. USD / m² |',
      '|---|---|---|---|---|---:|',
      ...spec.materials.map(
        (m) =>
          `| ${m.zone} | ${m.materialName} | ${m.finish} | R ${m.pbrRoughness.toFixed(2)} / M ${m.pbrMetalness.toFixed(2)} | ${m.lightingSpec} | $${m.estimatedCostPerSqmUsd} |`
      ),
      '',
      `Palette: Wall ${spec.palette.wallHex}, Floor ${spec.palette.floorHex}, Timber ${spec.palette.woodHex}, Accent ${spec.palette.accentHex}, Pool ${spec.palette.waterHex}`,
      `Privacy Audit: ${spec.privacyAuditNote}`,
      '',
      'Generated with ArchSpec Hybrid AI (Firebase AI Logic) — Dream House 3D Lab',
    ].join('\n');

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${spec.projectTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-spec.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ spec, telemetry }, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'archspec-pbr-preset.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const critiqueLines = useMemo(() => {
    if (!critiqueText) return [];
    return critiqueText
      .split(/\n+/)
      .map((line) => line.replace(/^\*+\s*/, '').replace(/\*\*/g, '').trim())
      .filter(Boolean);
  }, [critiqueText]);

  return (
    <div className="studio-shell">
      <a href="#studio-main" className="skip-link">
        Skip to architectural workspace
      </a>

      {/* Architectural Masthead */}
      <header className="studio-masthead">
        <div className="masthead-inner">
          <div className="brand-lockup">
            <svg
              className="brand-mark"
              width="34"
              height="34"
              viewBox="0 0 34 34"
              fill="none"
              aria-hidden="true"
            >
              <rect x="0.75" y="0.75" width="32.5" height="32.5" rx="3" stroke="currentColor" strokeWidth="1.5" />
              <path d="M8 25L17 9L26 25H8Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="miter" />
              <rect x="15.2" y="19" width="3.6" height="3.6" fill="var(--accent)" />
            </svg>
            <div>
              <h1 className="brand-title">ArchSpec Hybrid AI</h1>
              <p className="brand-subtitle">{remoteCfg.studioTagline}</p>
            </div>
          </div>

          <div className="masthead-right">
            <ul className="runtime-strip" aria-label="Runtime status">
              <li className={online ? 'state-ok' : 'state-warn'}>
                {online ? <Wifi size={13} aria-hidden="true" /> : <WifiOff size={13} aria-hidden="true" />}
                <span>{online ? 'Online' : 'Offline site mode'}</span>
              </li>
              <li className={onDeviceStatus === 'available' ? 'state-ok' : ''}>
                <Cpu size={13} aria-hidden="true" />
                <span>Nano: {onDeviceStatus}</span>
              </li>
              <li>
                <Cloud size={13} aria-hidden="true" />
                <span className="mono">{remoteCfg.cloudFallbackModel}</span>
              </li>
              <li className={isFirebaseConfigured ? 'state-ok' : 'state-warn'}>
                <ShieldCheck size={13} aria-hidden="true" />
                <span>App Check: {runtime.appCheckMode}</span>
              </li>
            </ul>

            {onDeviceStatus === 'downloadable' && (
              <button
                type="button"
                className="btn-compact"
                onClick={handleDownloadLocalModel}
                disabled={downloadPct !== null}
              >
                {downloadPct !== null ? `Downloading ${downloadPct}%` : 'Download Gemini Nano'}
              </button>
            )}

            <button
              type="button"
              className="theme-switch"
              onClick={() => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))}
              aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} studio theme`}
            >
              {theme === 'light' ? <Moon size={15} aria-hidden="true" /> : <Sun size={15} aria-hidden="true" />}
              <span>{theme === 'light' ? 'Dark' : 'Light'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Asymmetric Architectural Workbench */}
      <main id="studio-main" className="studio-container">
        <div className="workbench-grid">
          {/* Left Console: Hybrid AI Routing & Brief Composer */}
          <aside className="brief-console" aria-label="Hybrid AI Specification Console">
            <form onSubmit={handleGenerateSpec} noValidate>
              <fieldset className="console-block">
                <legend className="block-heading">Inference routing</legend>
                <div className="mode-selector" role="radiogroup" aria-label="Firebase AI Logic inference mode">
                  {MODE_OPTIONS.map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      role="radio"
                      aria-checked={mode === opt.key}
                      className={`mode-option ${mode === opt.key ? 'is-selected' : ''}`}
                      onClick={() => setMode(opt.key)}
                    >
                      <span className="mode-title">{opt.title}</span>
                      <span className="mode-desc">{opt.subtitle}</span>
                    </button>
                  ))}
                </div>
              </fieldset>

              <div className="console-block">
                <div className="block-header-inline">
                  <span className="block-heading">Architectural brief</span>
                  <span className="block-hint">Select preset or write custom</span>
                </div>

                <div className="preset-list" role="group" aria-label="Sample architectural briefs">
                  {PRESET_BRIEFS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className={`preset-btn ${activePresetId === p.id ? 'is-active' : ''}`}
                      aria-pressed={activePresetId === p.id}
                      onClick={() => {
                        setActivePresetId(p.id);
                        setBrief(p.prompt);
                        setRoomType(p.roomType);
                        setErrorMsg(null);
                      }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                <div className="field-group">
                  <label className="field-label" htmlFor="room-type-input">
                    Space or project category
                  </label>
                  <input
                    id="room-type-input"
                    className="field-input"
                    type="text"
                    value={roomType}
                    onChange={(e) => {
                      setRoomType(e.target.value);
                      setActivePresetId('');
                    }}
                    placeholder="e.g. Off-Plan Tropical Villa, Dental Wellness Lounge"
                  />
                </div>

                <div className="field-group">
                  <label className="field-label" htmlFor="brief-textarea">
                    Client design brief &amp; site notes
                  </label>
                  <textarea
                    id="brief-textarea"
                    className="field-textarea"
                    rows={5}
                    value={brief}
                    aria-describedby="brief-helper"
                    onChange={(e) => {
                      setBrief(e.target.value);
                      setActivePresetId('');
                    }}
                    placeholder="Specify architectural style, climate, finishes, lighting temperature, or NDA constraints..."
                  />
                  <p id="brief-helper" className="field-hint">
                    Generates live PBR hex palette, roughness/metalness values, lighting Kelvin, and itemized finish schedule.
                  </p>
                </div>

                {/* Multimodal Floor Plan / Site Photo Input */}
                <div className="field-group">
                  <span className="field-label">Reference floor plan or site photo (optional)</span>
                  {imagePreviewUrl && imageFile ? (
                    <div className="upload-preview">
                      <img src={imagePreviewUrl} alt={`Uploaded reference ${imageFile.name}`} />
                      <div className="upload-preview-meta">
                        <span className="upload-filename">{imageFile.name}</span>
                        <span className="mono upload-size">
                          {(imageFile.size / 1024).toFixed(0)} KB
                        </span>
                      </div>
                      <button
                        type="button"
                        className="icon-clear"
                        onClick={() => setImageFile(null)}
                        aria-label="Remove uploaded reference image"
                      >
                        <X size={15} aria-hidden="true" />
                      </button>
                    </div>
                  ) : (
                    <label className="upload-dropzone" htmlFor="multimodal-file-input">
                      <Upload size={15} aria-hidden="true" />
                      <span>Attach PNG or JPEG reference image</span>
                      <input
                        id="multimodal-file-input"
                        type="file"
                        accept="image/png,image/jpeg"
                        onChange={(e) => setImageFile(e.target.files?.[0] || null)}
                      />
                    </label>
                  )}
                </div>
              </div>

              {/* Primary Studio Actions */}
              <div className="console-actions">
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={isGenerating || isStreaming}
                >
                  <Sparkles size={16} aria-hidden="true" />
                  <span>{isGenerating ? 'Synthesizing spec…' : 'Generate 3D spec'}</span>
                </button>

                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleStreamCritique}
                  disabled={isGenerating || isStreaming}
                >
                  <MessageSquare size={15} aria-hidden="true" />
                  <span>{isStreaming ? 'Streaming review…' : 'Stream site critique'}</span>
                </button>
              </div>

              {statusNotice && (
                <div className="notice-box" role="status" aria-live="polite">
                  <span>{statusNotice}</span>
                  {telemetry?.inferenceSource === 'DEMO_LOCAL' && (
                    <button
                      type="button"
                      className="btn-inline-retry"
                      onClick={() => handleGenerateSpec()}
                      disabled={isGenerating}
                    >
                      <RefreshCw size={13} aria-hidden="true" />
                      <span>Retry live AI</span>
                    </button>
                  )}
                </div>
              )}

              {errorMsg && (
                <div className="alert-box" role="alert">
                  {errorMsg}
                </div>
              )}
            </form>
          </aside>

          {/* Right Dominant Column: Interactive 3D Viewport + Streaming Site Critique */}
          <div className="stage-column">
            <Arch3DViewport
              spec={spec}
              telemetry={telemetry}
              isGenerating={isGenerating}
              onUpdatePalette={handleUpdatePalette}
              onUpdateLighting={handleUpdateLighting}
            />

            {(critiqueLines.length > 0 || isStreaming) && (
              <section className="critique-panel" aria-live="polite" aria-label="Streaming Construction-Site Critique">
                <div className="critique-header">
                  <h2>Construction-site inspection critique</h2>
                  {critiqueTelemetry && (
                    <span className="mono critique-meta">
                      {critiqueTelemetry.inferenceSource === 'ON_DEVICE'
                        ? 'On-device'
                        : critiqueTelemetry.inferenceSource === 'IN_CLOUD'
                        ? critiqueTelemetry.modelUsed
                        : 'Local fallback'}{' '}
                      ({critiqueTelemetry.latencyMs} ms)
                    </span>
                  )}
                </div>

                {critiqueLines.length === 0 ? (
                  <p className="critique-placeholder">Streaming architectural inspection notes…</p>
                ) : (
                  <ol className="critique-list">
                    {critiqueLines.map((line, i) => (
                      <li key={i}>{line.replace(/^\d+[\.)]\s*/, '')}</li>
                    ))}
                  </ol>
                )}
              </section>
            )}
          </div>
        </div>

        {/* Architectural Material & Lighting Schedule */}
        <section className="schedule-section" aria-labelledby="schedule-heading">
          <div className="schedule-header">
            <div className="schedule-intro">
              <span className="schedule-kicker">{spec.architecturalStyle}</span>
              <h2 id="schedule-heading">{spec.projectTitle}</h2>
              <p className="schedule-summary">{spec.summary}</p>
            </div>

            <div className="schedule-actions">
              <button
                type="button"
                className="btn-primary"
                onClick={handleSaveToFirestore}
                disabled={isSaving}
              >
                <Save size={15} aria-hidden="true" />
                <span>{isSaving ? 'Saving…' : 'Save to Firestore'}</span>
              </button>
              <button type="button" className="btn-secondary" onClick={exportMarkdown}>
                <FileText size={15} aria-hidden="true" />
                <span>Export spec (.md)</span>
              </button>
              <button type="button" className="btn-secondary" onClick={exportJson}>
                <Download size={15} aria-hidden="true" />
                <span>Export PBR (.json)</span>
              </button>
            </div>
          </div>

          <dl className="spec-summary-band">
            <div>
              <dt>Program zone</dt>
              <dd>{spec.roomType}</dd>
            </div>
            <div>
              <dt>Lighting rig</dt>
              <dd className="mono">
                {spec.lightingMood.replace('_', ' ')} / {spec.sunKelvin}K
              </dd>
            </div>
            <div>
              <dt>Estimated budget</dt>
              <dd className="mono">{spec.estimatedBudgetUsd}</dd>
            </div>
            <div>
              <dt>Avg. finish rate</dt>
              <dd className="mono">${averageSqmCost} / m²</dd>
            </div>
          </dl>

          <div className="table-scroll">
            <table className="schedule-table">
              <caption className="sr-only">
                Architectural material, PBR shader parameters, lighting specification, and estimated cost per square meter
              </caption>
              <thead>
                <tr>
                  <th scope="col">Zone</th>
                  <th scope="col">Material specification</th>
                  <th scope="col">Surface finish</th>
                  <th scope="col">PBR roughness / metal</th>
                  <th scope="col">Lighting specification</th>
                  <th scope="col" className="num-col">Est. USD / m²</th>
                </tr>
              </thead>
              <tbody>
                {spec.materials.map((m, idx) => (
                  <tr key={`${m.zone}-${idx}`}>
                    <th scope="row">{m.zone}</th>
                    <td>{m.materialName}</td>
                    <td>{m.finish}</td>
                    <td className="mono">
                      R {m.pbrRoughness.toFixed(2)} / M {m.pbrMetalness.toFixed(2)}
                    </td>
                    <td>{m.lightingSpec}</td>
                    <td className="mono num-col">${m.estimatedCostPerSqmUsd}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="audit-footnote">
            <strong>Hybrid privacy audit:</strong> {spec.privacyAuditNote}
          </p>
        </section>

        {/* Cloud Firestore Offline-Synced Saved Archive */}
        <section className="archive-section" aria-labelledby="archive-heading">
          <div className="archive-header">
            <div>
              <h2 id="archive-heading">Saved specification archive</h2>
              <p className="archive-subtitle">
                Cloud Firestore with offline persistence enabled across site visits.
              </p>
            </div>
            <span className="mono archive-uid">
              {uid ? `Session ${uid.slice(0, 8)}` : 'Local cache active'}
            </span>
          </div>

          {savedSpecs.length === 0 ? (
            <p className="archive-empty">
              No saved specifications yet. Customize or generate a 3D material spec above, then select{' '}
              <strong>Save to Firestore</strong> to persist presets across sessions.
            </p>
          ) : (
            <div className="archive-grid">
              {savedSpecs.map((item) => (
                <article key={item.id} className="archive-item">
                  <div className="archive-palette-bar" aria-hidden="true">
                    <span style={{ backgroundColor: item.spec.palette.wallHex }} />
                    <span style={{ backgroundColor: item.spec.palette.floorHex }} />
                    <span style={{ backgroundColor: item.spec.palette.woodHex }} />
                    <span style={{ backgroundColor: item.spec.palette.accentHex }} />
                    <span style={{ backgroundColor: item.spec.palette.waterHex }} />
                  </div>
                  <div className="archive-item-body">
                    <h3>{item.projectTitle}</h3>
                    <p className="archive-style">{item.architecturalStyle}</p>
                    <div className="archive-meta mono">
                      <span>{item.inferenceSource}</span>
                      <span>{item.latencyMs} ms</span>
                    </div>
                    {item.createdAt && <time className="archive-time">{item.createdAt}</time>}
                    <div className="archive-actions">
                      <button
                        type="button"
                        className="btn-compact"
                        onClick={() => {
                          setSpec(item.spec);
                          setRoomType(item.roomType);
                          setStatusNotice(`Loaded "${item.projectTitle}" into the live 3D viewport.`);
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                      >
                        Load in 3D
                      </button>
                      <button
                        type="button"
                        className="btn-icon-danger"
                        onClick={() => handleDeleteSaved(item)}
                        aria-label={`Delete ${item.projectTitle}`}
                      >
                        <Trash2 size={14} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>

      <footer className="studio-footer">
        <div className="footer-inner">
          <p>
            Built for <strong>#BuildHybridAI 2026</strong> with Firebase AI Logic, App Check, Remote Config, Firestore, and Three.js (Apache-2.0).
          </p>
          <p>
            Created by <strong>Prasada Arif Nurudin</strong> (Dream House 3D Lab) —{' '}
            <a href="https://github.com/asaddin02/archspec-hybrid-ai" target="_blank" rel="noreferrer">
              github.com/asaddin02/archspec-hybrid-ai
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;
