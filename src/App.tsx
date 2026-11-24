import React, { useEffect, useState } from 'react';
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
  Layers,
  MessageSquare,
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
  type SavedSpecRecord,
} from './types/spec';

const MODE_OPTIONS: { key: HybridModeKey; title: string; subtitle: string }[] = [
  {
    key: 'PREFER_ON_DEVICE',
    title: 'Prefer On-Device',
    subtitle: 'Local Gemini Nano first → Cloud fallback',
  },
  {
    key: 'ONLY_ON_DEVICE',
    title: 'Only On-Device',
    subtitle: 'Strict offline / NDA air-gapped mode',
  },
  {
    key: 'PREFER_IN_CLOUD',
    title: 'Prefer In-Cloud',
    subtitle: 'Gemini 3.5 Flash-Lite first → Local fallback',
  },
  {
    key: 'ONLY_IN_CLOUD',
    title: 'Only In-Cloud',
    subtitle: 'Cloud reference benchmark mode',
  },
];

export function App() {
  const [spec, setSpec] = useState<ArchMaterialSpec>(DEFAULT_ARCH_SPEC);
  const [brief, setBrief] = useState<string>(PRESET_BRIEFS[0].prompt);
  const [roomType, setRoomType] = useState<string>(PRESET_BRIEFS[0].roomType);
  const [mode, setMode] = useState<HybridModeKey>('PREFER_ON_DEVICE');
  const [imageFile, setImageFile] = useState<File | null>(null);

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
  const [savedSpecs, setSavedSpecs] = useState<SavedSpecRecord[]>([]);
  const [remoteCfg, setRemoteCfg] = useState<RemoteConfigValues>({
    cloudFallbackModel: 'gemini-3.5-flash-lite',
    defaultInferenceMode: 'PREFER_ON_DEVICE',
    studioTagline: 'Offline-First Hybrid AI Architectural & 3D Material Studio',
    fetchedFromRemote: false,
  });

  const runtime = getFirebaseRuntime();

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
          const list = await loadSavedSpecs(user.uid);
          setSavedSpecs(list);
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

  const handleDownloadLocalModel = async () => {
    setErrorMsg(null);
    setDownloadPct(0);
    try {
      const nextStatus = await triggerOnDeviceModelDownload((pct) => setDownloadPct(pct));
      setOnDeviceStatus(nextStatus);
      setDownloadPct(null);
      setStatusNotice('On-device Gemini Nano model is ready in Chrome!');
    } catch (err) {
      setDownloadPct(null);
      setErrorMsg(err instanceof Error ? err.message : 'Could not trigger local model download.');
    }
  };

  const handleGenerateSpec = async () => {
    if (!brief.trim()) return;
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
      setStatusNotice(
        `3D PBR scene & material spec updated via ${tel.inferenceSource} (${tel.modelUsed}) in ${tel.latencyMs}ms.`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setErrorMsg(
        mode === 'ONLY_ON_DEVICE'
          ? `On-device model unavailable (${onDeviceStatus}). Switch to "Prefer On-Device" to trigger seamless Firebase AI Logic cloud fallback (${remoteCfg.cloudFallbackModel}). Details: ${message}`
          : `Hybrid AI error: ${message}`
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
        const updated = await loadSavedSpecs(currentUid);
        setSavedSpecs(updated);
        setStatusNotice('Saved Material Specification Sheet to Cloud Firestore (offline-synced).');
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
        };
        const next = [localRecord, ...savedSpecs].slice(0, 12);
        setSavedSpecs(next);
        localStorage.setItem('archspec_local_specs', JSON.stringify(next));
        setStatusNotice('Saved locally on device (enable Firebase Anonymous Auth for cloud sync).');
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteSaved = async (specId: string) => {
    if (!uid) return;
    await deleteSavedSpec(uid, specId);
    setSavedSpecs((prev) => prev.filter((item) => item.id !== specId));
  };

  const exportMarkdown = () => {
    const md = [
      `# ${spec.projectTitle}`,
      `**Style:** ${spec.architecturalStyle} | **Zone:** ${spec.roomType}`,
      `**Lighting:** ${spec.lightingMood} (${spec.sunKelvin}K) | **Est. Budget:** ${spec.estimatedBudgetUsd}`,
      '',
      `> ${spec.summary}`,
      '',
      '## Material & Lighting Specification Sheet',
      '| Zone | Material | Finish | PBR Roughness / Metalness | Lighting Spec | Est. USD / m² |',
      '|---|---|---|---|---|---:|',
      ...spec.materials.map(
        (m) =>
          `| ${m.zone} | ${m.materialName} | ${m.finish} | R:${m.pbrRoughness.toFixed(2)} / M:${m.pbrMetalness.toFixed(2)} | ${m.lightingSpec} | $${m.estimatedCostPerSqmUsd} |`
      ),
      '',
      `**Palette:** Wall \`${spec.palette.wallHex}\` · Floor \`${spec.palette.floorHex}\` · Timber \`${spec.palette.woodHex}\` · Accent \`${spec.palette.accentHex}\` · Pool \`${spec.palette.waterHex}\``,
      `**Privacy Audit:** ${spec.privacyAuditNote}`,
      '',
      `Generated with ArchSpec Hybrid AI (Firebase AI Logic) — Dream House 3D Lab`,
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
    a.download = `archspec-pbr-preset.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="app-shell">
      {/* Top Status & Telemetry Header */}
      <header className="top-header">
        <div className="brand-block">
          <div className="brand-icon" aria-hidden="true">
            <Layers size={22} />
          </div>
          <div>
            <h1>ArchSpec Hybrid AI</h1>
            <p>{remoteCfg.studioTagline}</p>
          </div>
        </div>

        <div className="status-pills">
          <span className={`status-badge ${online ? 'ok' : 'warn'}`}>
            {online ? <Wifi size={14} /> : <WifiOff size={14} />}
            {online ? 'Online' : 'Offline Site Mode'}
          </span>

          <span className={`status-badge ${onDeviceStatus === 'available' ? 'ok' : ''}`}>
            <Cpu size={14} />
            On-Device: {onDeviceStatus}
          </span>

          {onDeviceStatus === 'downloadable' && (
            <button
              type="button"
              className="btn-mini"
              onClick={handleDownloadLocalModel}
              disabled={downloadPct !== null}
            >
              {downloadPct !== null ? `Downloading ${downloadPct}%` : 'Download Gemini Nano'}
            </button>
          )}

          <span className="status-badge">
            <Cloud size={14} />
            Cloud Fallback: {remoteCfg.cloudFallbackModel}
          </span>

          <span className={`status-badge ${isFirebaseConfigured ? 'ok' : 'warn'}`}>
            <ShieldCheck size={14} />
            App Check: {runtime.appCheckMode}
          </span>
        </div>
      </header>

      {/* Main Split Studio */}
      <main className="workspace-grid">
        {/* Left: Hybrid AI Controls & Brief Composer */}
        <section className="panel-card" aria-label="Hybrid AI Studio Controls">
          <h2 className="section-title">
            <span>1. Firebase AI Logic Routing</span>
          </h2>

          <div className="mode-grid" role="radiogroup" aria-label="Hybrid Inference Mode">
            {MODE_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                role="radio"
                aria-checked={mode === opt.key}
                className={`mode-btn ${mode === opt.key ? 'active' : ''}`}
                onClick={() => setMode(opt.key)}
              >
                <strong>{opt.title}</strong>
                <span>{opt.subtitle}</span>
              </button>
            ))}
          </div>

          <h2 className="section-title">
            <span>2. Architectural Brief & Floor Plan</span>
          </h2>

          <div className="preset-row">
            {PRESET_BRIEFS.map((p) => (
              <button
                key={p.id}
                type="button"
                className="preset-chip"
                onClick={() => {
                  setBrief(p.prompt);
                  setRoomType(p.roomType);
                }}
              >
                {p.label}
              </button>
            ))}
          </div>

          <label className="field-label" htmlFor="room-type-input">
            Space / Project Type
          </label>
          <input
            id="room-type-input"
            className="text-input"
            type="text"
            value={roomType}
            onChange={(e) => setRoomType(e.target.value)}
            placeholder="e.g. Luxury Off-Plan Villa, Dental Clinic Lounge"
          />

          <label className="field-label" htmlFor="brief-textarea">
            Client Design Brief or Site Inspection Notes
          </label>
          <textarea
            id="brief-textarea"
            className="text-area"
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            placeholder="Describe architecture style, climate, materials, lighting mood, or NDA requirements..."
          />

          <div className="upload-box">
            <div>
              <strong>Multimodal Input (Optional)</strong>
              <div style={{ color: 'var(--muted)', fontSize: '0.73rem' }}>
                {imageFile ? imageFile.name : 'Upload PNG/JPEG floor plan or site photo'}
              </div>
            </div>
            <input
              type="file"
              accept="image/png,image/jpeg"
              aria-label="Upload floor plan or site photo"
              onChange={(e) => setImageFile(e.target.files?.[0] || null)}
            />
          </div>

          <div className="action-row">
            <button
              type="button"
              className="btn-primary"
              onClick={handleGenerateSpec}
              disabled={isGenerating || isStreaming}
            >
              <Sparkles size={16} />
              {isGenerating ? 'Synthesizing...' : 'Generate 3D Spec'}
            </button>

            <button
              type="button"
              className="btn-secondary"
              onClick={handleStreamCritique}
              disabled={isGenerating || isStreaming}
            >
              <MessageSquare size={16} />
              {isStreaming ? 'Streaming...' : 'Site Critique'}
            </button>
          </div>

          {statusNotice && (
            <div className="privacy-note" role="status">
              {statusNotice}
            </div>
          )}

          {errorMsg && (
            <div className="error-banner" role="alert">
              {errorMsg}
            </div>
          )}
        </section>

        {/* Right: Real-Time 3D Architectural Preview + Streaming Critique */}
        <div>
          <Arch3DViewport spec={spec} telemetry={telemetry} isGenerating={isGenerating} />

          {(critiqueText || isStreaming) && (
            <section className="critique-box" aria-live="polite">
              <div className="section-title" style={{ marginBottom: 8 }}>
                <span>Live Streaming Construction-Site Critique</span>
                {critiqueTelemetry && (
                  <span style={{ fontSize: '0.74rem', color: 'var(--brand)' }}>
                    {critiqueTelemetry.inferenceSource} · {critiqueTelemetry.latencyMs}ms
                  </span>
                )}
              </div>
              <p className="critique-text">{critiqueText || 'Streaming insights...'}</p>
            </section>
          )}
        </div>
      </main>

      {/* Full Room-by-Room Material & Lighting Specification Sheet */}
      <section className="panel-card spec-section">
        <div className="spec-header-row">
          <div>
            <h2>{spec.projectTitle}</h2>
            <p style={{ margin: '4px 0 0', fontSize: '0.88rem', color: 'var(--muted)' }}>
              {spec.summary}
            </p>
            <div className="spec-meta">
              <span className="meta-tag">Style: {spec.architecturalStyle}</span>
              <span className="meta-tag">Zone: {spec.roomType}</span>
              <span className="meta-tag">Sun: {spec.sunKelvin}K</span>
              <span className="meta-tag">Est. Budget: {spec.estimatedBudgetUsd}</span>
            </div>
          </div>

          <div className="toolbar-btns">
            <button
              type="button"
              className="btn-primary"
              onClick={handleSaveToFirestore}
              disabled={isSaving}
            >
              <Save size={15} />
              {isSaving ? 'Saving...' : 'Save to Firestore'}
            </button>
            <button type="button" className="btn-secondary" onClick={exportMarkdown}>
              <FileText size={15} />
              Export Spec (.md)
            </button>
            <button type="button" className="btn-secondary" onClick={exportJson}>
              <Download size={15} />
              Export PBR (.json)
            </button>
          </div>
        </div>

        <div className="table-wrap">
          <table className="spec-table">
            <thead>
              <tr>
                <th>Architectural Zone</th>
                <th>Material Specification</th>
                <th>Surface Finish</th>
                <th>PBR (Rough / Metal)</th>
                <th>Lighting & Color Temp</th>
                <th>Est. USD / m²</th>
              </tr>
            </thead>
            <tbody>
              {spec.materials.map((m, idx) => (
                <tr key={`${m.zone}-${idx}`}>
                  <td>
                    <strong>{m.zone}</strong>
                  </td>
                  <td>{m.materialName}</td>
                  <td>{m.finish}</td>
                  <td>
                    <code>
                      R:{m.pbrRoughness.toFixed(2)} · M:{m.pbrMetalness.toFixed(2)}
                    </code>
                  </td>
                  <td>{m.lightingSpec}</td>
                  <td>
                    <strong>${m.estimatedCostPerSqmUsd}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="privacy-note">
          <strong>Hybrid Privacy & Delivery Audit:</strong> {spec.privacyAuditNote}
        </div>
      </section>

      {/* Cloud Firestore Offline-Synced Saved Specifications */}
      <section className="panel-card spec-section">
        <div className="section-title">
          <span>Saved Material Specifications (Cloud Firestore Offline-First Sync)</span>
          <span>{uid ? `Session UID: ${uid.slice(0, 8)}...` : 'Connecting Auth...'}</span>
        </div>

        {savedSpecs.length === 0 ? (
          <p style={{ fontSize: '0.84rem', color: 'var(--muted)', margin: 0 }}>
            No saved specifications yet. Generate a 3D Material Spec above and click{' '}
            <strong>Save to Firestore</strong> to persist presets across sessions and offline site visits.
          </p>
        ) : (
          <div className="saved-grid">
            {savedSpecs.map((item) => (
              <div key={item.id} className="saved-card">
                <h4>{item.projectTitle}</h4>
                <small>
                  {item.architecturalStyle} · {item.inferenceSource} ({item.latencyMs}ms)
                </small>
                {item.createdAt && <small>{item.createdAt}</small>}
                <div className="saved-actions">
                  <button
                    type="button"
                    className="btn-mini"
                    onClick={() => {
                      setSpec(item.spec);
                      setRoomType(item.roomType);
                      setStatusNotice(`Loaded "${item.projectTitle}" into live 3D viewport.`);
                    }}
                  >
                    Load in 3D
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ padding: '4px 8px', fontSize: '0.72rem' }}
                    onClick={() => handleDeleteSaved(item.id)}
                    aria-label={`Delete ${item.projectTitle}`}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <footer className="studio-footer">
        <span>
          Built for <strong>#BuildHybridAI 2026</strong> with Firebase AI Logic, App Check, Remote
          Config, Firestore & Three.js · Apache-2.0 Open Source
        </span>
        <span>
          Created by <strong>Prasada Arif Nurudin</strong> (Dream House 3D Lab) ·{' '}
          <a href="https://github.com/asaddin02" target="_blank" rel="noreferrer">
            github.com/asaddin02
          </a>
        </span>
      </footer>
    </div>
  );
}

export default App;
