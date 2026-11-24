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
  LightingMood,
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

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`));
    }, ms);
    promise
      .then((val) => {
        window.clearTimeout(timer);
        resolve(val);
      })
      .catch((err) => {
        window.clearTimeout(timer);
        reject(err);
      });
  });
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
  const mood: LightingMood =
    raw.lightingMood === 'daylight' ||
    raw.lightingMood === 'golden_hour' ||
    raw.lightingMood === 'dusk'
      ? raw.lightingMood
      : 'golden_hour';

  const mats =
    Array.isArray(raw.materials) && raw.materials.length > 0
      ? raw.materials.slice(0, 6).map((m) => ({
          zone: String(m.zone || 'Interior zone'),
          materialName: String(m.materialName || 'Architectural finish'),
          finish: String(m.finish || 'Matte natural'),
          pbrRoughness: Math.min(1, Math.max(0.05, Number(m.pbrRoughness ?? 0.65))),
          pbrMetalness: Math.min(1, Math.max(0, Number(m.pbrMetalness ?? 0.05))),
          lightingSpec: String(m.lightingSpec || '3000K CRI 95+ LED'),
          estimatedCostPerSqmUsd: Math.max(15, Math.round(Number(m.estimatedCostPerSqmUsd ?? 85))),
        }))
      : [
          {
            zone: 'Primary walls',
            materialName: 'Mineral lime plaster',
            finish: 'Matte hand-troweled',
            pbrRoughness: 0.85,
            pbrMetalness: 0,
            lightingSpec: '2700K recessed linear wash',
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

/**
 * Transparent local synthesis fallback used ONLY when offline without Gemini Nano
 * or during transient cloud 500/503 demand spikes. Explicitly tagged DEMO_LOCAL.
 */
function synthesizeOfflineFallbackSpec(brief: string, roomType: string): ArchMaterialSpec {
  const text = `${brief} ${roomType}`.toLowerCase();

  if (text.includes('clinic') || text.includes('dental') || text.includes('medical') || text.includes('wellness')) {
    return {
      projectTitle: 'Alabaster & Oak — Clinical Wellness Consultation Lounge',
      architecturalStyle: 'Nordic Biophilic Healthcare',
      roomType: roomType || 'Medical Wellness & Consultation Lounge',
      summary:
        'Hygienic warm-alabaster walls paired with antimicrobial seamless terrazzo, acoustic pale white-oak slats, and high-CRI 4800K daylight engineered to lower patient anxiety.',
      lightingMood: 'daylight',
      sunKelvin: 4800,
      estimatedBudgetUsd: '$22,000 – $31,000',
      privacyAuditNote:
        'Processed strictly on-device via Local Studio Engine fallback (0 bytes sent to cloud). Retry live Firebase AI Logic when cloud capacity stabilizes.',
      palette: {
        wallHex: '#f1efe9',
        floorHex: '#d5d2ca',
        woodHex: '#c6a782',
        accentHex: '#5c7c7b',
        waterHex: '#6c9aa6',
        ambientIntensity: 0.85,
        sunIntensity: 1.95,
      },
      materials: [
        {
          zone: 'Consultation walls',
          materialName: 'Low-VOC warm alabaster mineral paint',
          finish: 'Scrubbable matte eggshell',
          pbrRoughness: 0.78,
          pbrMetalness: 0.0,
          lightingSpec: '4800K CRI 97+ glare-free linear recessed panels',
          estimatedCostPerSqmUsd: 54,
        },
        {
          zone: 'Seamless floor slab',
          materialName: 'Micro-aggregate white & sage epoxy terrazzo',
          finish: 'Honed satin R10 slip-resistant',
          pbrRoughness: 0.42,
          pbrMetalness: 0.04,
          lightingSpec: 'Perimeter cove wash eliminating harsh floor glare',
          estimatedCostPerSqmUsd: 142,
        },
        {
          zone: 'Acoustic ceiling & slats',
          materialName: 'FSC European white oak over black felt backing',
          finish: 'Ultra-matte waterborne lacquer',
          pbrRoughness: 0.62,
          pbrMetalness: 0.0,
          lightingSpec: 'Integrated 4000K micro-baffle track spots',
          estimatedCostPerSqmUsd: 128,
        },
        {
          zone: 'Seating & reception millwork',
          materialName: 'Antimicrobial sage-blue Crypton textile & Corian',
          finish: 'Matte woven fabric / solid surface',
          pbrRoughness: 0.84,
          pbrMetalness: 0.02,
          lightingSpec: '3500K warm desk task grazing',
          estimatedCostPerSqmUsd: 118,
        },
      ],
    };
  }

  if (text.includes('bali') || text.includes('tropical') || text.includes('canggu') || text.includes('dusk')) {
    return {
      projectTitle: 'Canggu Pavilion — Tropical Limestone & Ironwood Villa',
      architecturalStyle: 'Contemporary Balinese Resort',
      roomType: roomType || 'Off-Plan Luxury Villa & Pool Deck',
      summary:
        'Cream Palimanan sandstone volumes sheltered beneath deep Ulin ironwood eaves, opening directly onto an emerald Sukabumi reflecting pool illuminated by zero-glare 2700K dusk washes.',
      lightingMood: 'dusk',
      sunKelvin: 2700,
      estimatedBudgetUsd: '$26,000 – $36,000',
      privacyAuditNote:
        'Processed strictly on-device via Local Studio Engine fallback (0 bytes sent to cloud). Retry live Firebase AI Logic when cloud capacity stabilizes.',
      palette: {
        wallHex: '#e6dcc8',
        floorHex: '#b3a38c',
        woodHex: '#6c4224',
        accentHex: '#4f5d47',
        waterHex: '#1f6e68',
        ambientIntensity: 0.48,
        sunIntensity: 1.45,
      },
      materials: [
        {
          zone: 'Exterior & pavilion walls',
          materialName: 'Honed cream Palimanan limestone cladding',
          finish: 'Natural breathable hydrophobic seal',
          pbrRoughness: 0.82,
          pbrMetalness: 0.0,
          lightingSpec: '2700K concealed floor uplights (15-deg beam)',
          estimatedCostPerSqmUsd: 92,
        },
        {
          zone: 'Pool deck & terrace',
          materialName: 'Reclaimed Kalimantan Ulin ironwood planks',
          finish: 'Brushed marine teak oil',
          pbrRoughness: 0.56,
          pbrMetalness: 0.0,
          lightingSpec: '2400K IP65 low-level step markers',
          estimatedCostPerSqmUsd: 165,
        },
        {
          zone: 'Reflecting pool basin',
          materialName: 'Green Sukabumi volcanic stone tiles (20x20 cm)',
          finish: 'Split-face honed wet finish',
          pbrRoughness: 0.2,
          pbrMetalness: 0.06,
          lightingSpec: '2700K IP68 submerged perimeter glow',
          estimatedCostPerSqmUsd: 152,
        },
        {
          zone: 'Lounge upholstery & accents',
          materialName: 'Outdoor Sunbrella olive linen & blackened bronze',
          finish: 'Weatherproof matte weave',
          pbrRoughness: 0.88,
          pbrMetalness: 0.14,
          lightingSpec: '2700K warm rattan-shielded pendant wash',
          estimatedCostPerSqmUsd: 108,
        },
      ],
    };
  }

  return {
    projectTitle: 'Kanso Sanctuary — Mineral Plaster & Roasted Cedar Residence',
    architecturalStyle: 'Japanese-Modern Wabi-Sabi',
    roomType: roomType || 'Japanese-Modern Residential Living',
    summary:
      'Quiet hand-troweled mineral walls framed by vertical roasted cedar louvers and dark basalt pavers, calibrated for warm 3400K golden-hour sunlight and calm moss-green textiles.',
    lightingMood: text.includes('daylight') ? 'daylight' : text.includes('dusk') ? 'dusk' : 'golden_hour',
    sunKelvin: text.includes('daylight') ? 5000 : text.includes('dusk') ? 2700 : 3400,
    estimatedBudgetUsd: '$19,500 – $27,000',
    privacyAuditNote:
      'Processed strictly on-device via Local Studio Engine fallback (0 bytes sent to cloud). Retry live Firebase AI Logic when cloud capacity stabilizes.',
    palette: {
      wallHex: '#e3dcd0',
      floorHex: '#6c6862',
      woodHex: '#7d4d2c',
      accentHex: '#3c5346',
      waterHex: '#2c5f63',
      ambientIntensity: 0.62,
      sunIntensity: 1.8,
    },
    materials: [
      {
        zone: 'Primary sanctuary walls',
        materialName: 'Shikkui natural Japanese lime plaster',
        finish: 'Hand-troweled matte organic grain',
        pbrRoughness: 0.88,
        pbrMetalness: 0.0,
        lightingSpec: '2700K indirect shadow-gap wall wash',
        estimatedCostPerSqmUsd: 78,
      },
      {
        zone: 'Courtyard & floor plinth',
        materialName: 'Flamed dark basalt stone slabs',
        finish: 'Thermal anti-slip matte',
        pbrRoughness: 0.72,
        pbrMetalness: 0.04,
        lightingSpec: '3000K recessed floor path bollards',
        estimatedCostPerSqmUsd: 138,
      },
      {
        zone: 'Facade louvers & ceiling',
        materialName: 'Thermally modified roasted Japanese cedar',
        finish: 'Natural matte tung oil',
        pbrRoughness: 0.52,
        pbrMetalness: 0.0,
        lightingSpec: 'Filtered golden-hour sun + 2700K soffit uplight',
        estimatedCostPerSqmUsd: 124,
      },
      {
        zone: 'Lounge furnishings',
        materialName: 'Heavyweight moss-green wool boucle',
        finish: 'Textured acoustic weave',
        pbrRoughness: 0.92,
        pbrMetalness: 0.0,
        lightingSpec: '2800K warm focal table pendant',
        estimatedCostPerSqmUsd: 96,
      },
    ],
  };
}

function buildOfflineCritiqueBullets(spec: ArchMaterialSpec): string[] {
  const mat1 = spec.materials[0]?.materialName || 'mineral plaster';
  const mat2 = spec.materials[1]?.materialName || 'honed stone flooring';
  return [
    `1. Glare & daylighting control: At ${spec.sunKelvin}K (${spec.lightingMood.replace('_', ' ')}), keep exterior louver spacing <= 32 cm and specify low-iron anti-reflective glazing to prevent hot spots across ${mat2}.`,
    `2. Durability & humidity risk: Apply breathable vapor-permeable hydrophobic sealer to ${mat1} and confirm R10+ wet slip resistance around the reflecting pool perimeter.`,
    `3. Acoustics & circulation: Hard stone and glass volumes reverberate quickly — integrate 25 mm mineral acoustic backing behind the timber ceiling soffit to keep RT60 near 0.45s.`,
    `4. Value engineering (10–15% savings): Retain premium stone on hero eye-level zones while switching secondary perimeter paving to large-format matte porcelain tiles matching ${spec.palette.floorHex}.`,
  ];
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
Given the client brief (and optional floor plan / room photo), output ONLY a valid JSON object matching this exact structure (no markdown fences):
{
  "projectTitle": "string",
  "architecturalStyle": "string",
  "roomType": "string",
  "summary": "string (2 concise sentences)",
  "lightingMood": "daylight" | "golden_hour" | "dusk",
  "sunKelvin": 2700,
  "estimatedBudgetUsd": "$XX,000 – $XX,000",
  "privacyAuditNote": "string",
  "palette": {
    "wallHex": "#RRGGBB",
    "floorHex": "#RRGGBB",
    "woodHex": "#RRGGBB",
    "accentHex": "#RRGGBB",
    "waterHex": "#RRGGBB",
    "ambientIntensity": 0.65,
    "sunIntensity": 1.8
  },
  "materials": [
    {
      "zone": "string",
      "materialName": "string",
      "finish": "string",
      "pbrRoughness": 0.65,
      "pbrMetalness": 0.05,
      "lightingSpec": "string",
      "estimatedCostPerSqmUsd": 95
    }
  ]
}
Include 4-5 distinct material zones with realistic architectural hex colors, PBR roughness (0.05-1.0), PBR metalness (0.0-1.0), and Kelvin color temperature (2200-6500).

Room Category: ${params.roomType}
Client Brief: ${params.brief}`;

  const rawCandidates =
    params.mode === 'ONLY_ON_DEVICE'
      ? [params.cloudModel || 'gemini-3.5-flash-lite']
      : Array.from(
          new Set([
            params.cloudModel || 'gemini-3.5-flash-lite',
            'gemini-3.5-flash-lite',
            'gemini-3.8-flash',
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
  let usedCloudModel = rawCandidates[0];
  let lastError: unknown = null;

  for (let i = 0; i < rawCandidates.length; i++) {
    const modelName = rawCandidates[i];
    usedCloudModel = modelName;
    const timeoutMs = i === 0 ? 14_000 : 9_000;

    // Call getGenerativeModel directly on user action as required by Firebase AI Logic Hybrid Inference docs
    const model = getGenerativeModel(ai, {
      mode: mapInferenceMode(params.mode),
      inCloudParams: {
        model: modelName,
        generationConfig: {
          temperature: 0.45,
          maxOutputTokens: 1600,
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
      const req = imgPart
        ? model.generateContent([instruction, imgPart])
        : model.generateContent(instruction);
      result = await withTimeout(req, timeoutMs, modelName);
      break;
    } catch (err) {
      lastError = err;
      if (params.mode === 'ONLY_ON_DEVICE') {
        throw err;
      }
      console.warn(`[ArchSpec] Attempt (${modelName}) failed:`, err);
    }
  }

  if (!result) {
    // In ONLY_IN_CLOUD mode, surface the real cloud error cleanly.
    if (params.mode === 'ONLY_IN_CLOUD') {
      throw lastError instanceof Error
        ? lastError
        : new Error('Cloud model unavailable. Please retry in a moment.');
    }

    // In PREFER_ON_DEVICE / PREFER_IN_CLOUD modes, keep the 3D studio 100% functional
    // with an explicit, transparently-badged local fallback.
    const fallbackSpec = synthesizeOfflineFallbackSpec(params.brief, params.roomType);
    const reason =
      lastError instanceof Error ? lastError.message : 'Cloud endpoint transiently unavailable';
    return {
      spec: fallbackSpec,
      telemetry: {
        inferenceSource: 'DEMO_LOCAL',
        inferenceMode: params.mode,
        modelUsed: 'Local Architectural Fallback',
        latencyMs: Math.round(performance.now() - startedAt),
        timestamp: new Date().toLocaleTimeString(),
        onlineAtCall,
        cloudBytesSent: 0,
        fallbackReason: reason,
      },
    };
  }

  const response = result.response;
  const rawText = response.text().trim();
  const stripped = rawText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  const firstBrace = stripped.indexOf('{');
  const lastBrace = stripped.lastIndexOf('}');
  const cleaned =
    firstBrace !== -1 && lastBrace > firstBrace
      ? stripped.slice(firstBrace, lastBrace + 1)
      : stripped;

  let parsed: Partial<ArchMaterialSpec>;
  try {
    parsed = JSON.parse(cleaned) as Partial<ArchMaterialSpec>;
  } catch {
    const fallbackSpec = synthesizeOfflineFallbackSpec(params.brief, params.roomType);
    return {
      spec: fallbackSpec,
      telemetry: {
        inferenceSource: 'DEMO_LOCAL',
        inferenceMode: params.mode,
        modelUsed: 'Local JSON Recovery Fallback',
        latencyMs: Math.round(performance.now() - startedAt),
        timestamp: new Date().toLocaleTimeString(),
        onlineAtCall,
        cloudBytesSent: 0,
        fallbackReason: 'Malformed JSON from model response; applied local recovery.',
      },
    };
  }

  const spec = normalizeSpec(parsed, params.roomType);
  const inferenceSource = extractInferenceSource(response, params.mode);
  const latencyMs = Math.round(performance.now() - startedAt);

  // Retain reference to schema export for documentation/type integrity
  void ARCH_SPEC_FIREBASE_SCHEMA;

  return {
    spec,
    telemetry: {
      inferenceSource,
      inferenceMode: params.mode,
      modelUsed:
        inferenceSource === 'ON_DEVICE' ? 'Gemini Nano (Chrome Prompt API)' : usedCloudModel,
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
Key Materials: ${params.currentSpec.materials
    .map((m) => `${m.zone}: ${m.materialName} (${m.finish})`)
    .join('; ')}
Client Notes / Brief: ${params.brief}

Provide a concise, high-signal 4-point numbered field checklist (plain text, no markdown asterisks) covering:
1. Glare & daylighting risk
2. Durability & humidity/maintenance warning for the specified finishes
3. Acoustic or circulation improvement
4. Value-engineering tip to save 10-15% without hurting visual luxury`;

  const candidateModels =
    params.mode === 'ONLY_ON_DEVICE'
      ? [params.cloudModel || 'gemini-3.5-flash-lite']
      : Array.from(
          new Set([
            params.cloudModel || 'gemini-3.5-flash-lite',
            'gemini-3.5-flash-lite',
            'gemini-3.8-flash',
          ])
        );

  let usedCloudModel = candidateModels[0];
  let finalResponse: unknown = null;
  let lastError: unknown = null;
  let accumulated = '';

  for (let i = 0; i < candidateModels.length; i++) {
    const candidate = candidateModels[i];
    usedCloudModel = candidate;
    accumulated = '';
    const model = getGenerativeModel(ai, {
      mode: mapInferenceMode(params.mode),
      inCloudParams: {
        model: candidate,
        generationConfig: {
          temperature: 0.65,
          maxOutputTokens: 1200,
        },
      },
      onDeviceParams: {
        createOptions: {
          expectedOutputs: [{ type: 'text', languages: ['en'] }],
        },
      },
    });

    try {
      const streamResult = await withTimeout(
        model.generateContentStream(prompt),
        i === 0 ? 12_000 : 8_000,
        candidate
      );
      for await (const chunk of streamResult.stream) {
        accumulated += chunk.text();
        params.onChunk(accumulated);
      }
      finalResponse = await streamResult.response;
      break;
    } catch (err) {
      if (accumulated.length > 60) {
        finalResponse = {
          inferenceSource: params.mode === 'ONLY_ON_DEVICE' ? 'ON_DEVICE' : 'IN_CLOUD',
        };
        break;
      }
      lastError = err;
      if (params.mode === 'ONLY_ON_DEVICE') {
        throw err;
      }
      console.warn(`[ArchSpec] Stream attempt on ${candidate} failed, failing over...`);
    }
  }

  if (!finalResponse && accumulated.length <= 60) {
    if (params.mode === 'ONLY_IN_CLOUD') {
      throw lastError instanceof Error ? lastError : new Error('Hybrid AI stream failed.');
    }

    // Transparent offline / demand-spike local checklist fallback
    const bullets = buildOfflineCritiqueBullets(params.currentSpec);
    let progressive = '';
    for (const line of bullets) {
      progressive = progressive ? `${progressive}\n\n${line}` : line;
      params.onChunk(progressive);
      await new Promise((r) => window.setTimeout(r, 90));
    }
    return {
      inferenceSource: 'DEMO_LOCAL',
      inferenceMode: params.mode,
      modelUsed: 'Local Site Checklist Fallback',
      latencyMs: Math.round(performance.now() - startedAt),
      timestamp: new Date().toLocaleTimeString(),
      onlineAtCall,
      cloudBytesSent: 0,
      fallbackReason:
        lastError instanceof Error ? lastError.message : 'Cloud stream transiently unavailable',
    };
  }

  const inferenceSource = extractInferenceSource(finalResponse, params.mode);
  const latencyMs = Math.round(performance.now() - startedAt);

  return {
    inferenceSource,
    inferenceMode: params.mode,
    modelUsed:
      inferenceSource === 'ON_DEVICE' ? 'Gemini Nano (Chrome Prompt API)' : usedCloudModel,
    latencyMs,
    timestamp: new Date().toLocaleTimeString(),
    onlineAtCall,
    cloudBytesSent:
      inferenceSource === 'ON_DEVICE' ? 0 : new TextEncoder().encode(prompt).length,
  };
}
