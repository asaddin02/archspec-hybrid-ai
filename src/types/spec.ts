export type HybridModeKey =
  | 'PREFER_ON_DEVICE'
  | 'ONLY_ON_DEVICE'
  | 'PREFER_IN_CLOUD'
  | 'ONLY_IN_CLOUD';

export type LightingMood = 'daylight' | 'golden_hour' | 'dusk';

export type InferenceSourceTag = 'ON_DEVICE' | 'IN_CLOUD' | 'DEMO_LOCAL';

export interface ScenePalette {
  wallHex: string;
  floorHex: string;
  woodHex: string;
  accentHex: string;
  waterHex: string;
  ambientIntensity: number;
  sunIntensity: number;
}

export interface MaterialZoneItem {
  zone: string;
  materialName: string;
  finish: string;
  pbrRoughness: number;
  pbrMetalness: number;
  lightingSpec: string;
  estimatedCostPerSqmUsd: number;
}

export interface ArchMaterialSpec {
  projectTitle: string;
  architecturalStyle: string;
  roomType: string;
  summary: string;
  lightingMood: LightingMood;
  sunKelvin: number;
  estimatedBudgetUsd: string;
  privacyAuditNote: string;
  palette: ScenePalette;
  materials: MaterialZoneItem[];
}

export interface HybridTelemetry {
  inferenceSource: InferenceSourceTag;
  inferenceMode: HybridModeKey;
  modelUsed: string;
  latencyMs: number;
  timestamp: string;
  onlineAtCall: boolean;
  cloudBytesSent: number;
  fallbackReason?: string;
}

export interface SavedSpecRecord {
  id: string;
  projectTitle: string;
  architecturalStyle: string;
  roomType: string;
  inferenceSource: InferenceSourceTag;
  inferenceMode: HybridModeKey;
  latencyMs: number;
  spec: ArchMaterialSpec;
  createdAt?: string;
  storageOrigin?: 'firestore' | 'local';
}

export const DEFAULT_ARCH_SPEC: ArchMaterialSpec = {
  projectTitle: 'House of Serenity — Japanese-Modern Courtyard Pavilion',
  architecturalStyle: 'Japandi Courtyard Minimalism',
  roomType: 'Living Pavilion & Reflecting Pool',
  summary:
    'Warm lime-plaster volumes paired with vertical Hinoki cedar louvers, honed limestone flooring, and a tranquil indoor-outdoor reflecting court balanced for golden-hour glare control.',
  lightingMood: 'golden_hour',
  sunKelvin: 3400,
  estimatedBudgetUsd: '$18,500 – $24,000',
  privacyAuditNote:
    'NDA safe: Client floor-plan brief processes locally whenever on-device Gemini Nano is available; falls back to Firebase AI Logic cloud only when permitted by routing mode.',
  palette: {
    wallHex: '#e9e2d6',
    floorHex: '#b9ae9d',
    woodHex: '#8d5b34',
    accentHex: '#3f5a4f',
    waterHex: '#2f6d73',
    ambientIntensity: 0.65,
    sunIntensity: 1.85,
  },
  materials: [
    {
      zone: 'Primary feature walls',
      materialName: 'Mineral limewash plaster (Warm Chalk)',
      finish: 'Matte hand-troweled',
      pbrRoughness: 0.86,
      pbrMetalness: 0.0,
      lightingSpec: '2700K recessed linear wall washer (CRI 95+)',
      estimatedCostPerSqmUsd: 68,
    },
    {
      zone: 'Flooring & terrace continuity',
      materialName: 'Honed Roman travertine slabs (90x90 cm)',
      finish: 'Open-pore matte anti-slip R10',
      pbrRoughness: 0.68,
      pbrMetalness: 0.02,
      lightingSpec: 'Low-glare 3000K step perimeter grazing',
      estimatedCostPerSqmUsd: 135,
    },
    {
      zone: 'Brise-soleil & ceiling soffit',
      materialName: 'Kiln-dried Japanese Hinoki / teak slats',
      finish: 'Clear Rubio Monocoat oil',
      pbrRoughness: 0.54,
      pbrMetalness: 0.0,
      lightingSpec: 'Filtered daylight with 2700K cove uplight',
      estimatedCostPerSqmUsd: 112,
    },
    {
      zone: 'Lounge upholstery & millwork',
      materialName: 'Moss-green boucle linen & brushed bronze',
      finish: 'Textured matte fabric / satin metal',
      pbrRoughness: 0.9,
      pbrMetalness: 0.15,
      lightingSpec: '3000K 24-deg accent spotlights over table',
      estimatedCostPerSqmUsd: 95,
    },
    {
      zone: 'Courtyard reflecting pool',
      materialName: 'Green Sukabumi volcanic stone basin',
      finish: 'Split-face wet seal',
      pbrRoughness: 0.24,
      pbrMetalness: 0.08,
      lightingSpec: 'Submerged 2700K IP68 underwater washers',
      estimatedCostPerSqmUsd: 148,
    },
  ],
};

export const PRESET_BRIEFS = [
  {
    id: 'bali-villa',
    label: 'Bali Tropical Villa (Dusk)',
    roomType: 'Off-Plan Luxury Villa & Pool Deck',
    prompt:
      'Design a luxury off-plan tropical villa pavilion in Canggu, Bali for overseas investors. Emphasize warm Ulin ironwood timber soffits, cream Palimanan limestone walls, emerald Sukabumi reflecting pool, and dramatic 2700K dusk hospitality lighting with zero glare.',
  },
  {
    id: 'nordic-clinic',
    label: 'Esthetic & Dental Clinic (Daylight)',
    roomType: 'Medical Wellness & Consultation Lounge',
    prompt:
      'Design a calming, hygienic modern dental and esthetic clinic consultation lounge. Use crisp warm alabaster walls, antimicrobial terrazzo flooring, pale white-oak acoustic slats, serene sage-blue accents, and high-CRI 4800K natural daylight illumination.',
  },
  {
    id: 'tokyo-serenity',
    label: 'Tokyo Zen Courtyard (Golden Hour)',
    roomType: 'Japanese-Modern Residential Living',
    prompt:
      'Design a quiet 3-story Japanese-modern residential sanctuary inspired by House of Serenity. Combine wabi-sabi mineral plaster, roasted cedar louvers, dark basalt courtyard stones, warm 3400K golden-hour sunlight, and calm moss-green textiles.',
  },
];
