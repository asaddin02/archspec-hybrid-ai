# Devpost #BuildHybridAI 2026 — Ready-to-Submit Package

## Project Name
**ArchSpec Hybrid AI**

## Tagline (<= 60 chars)
Offline-first Hybrid AI Architectural & 3D Material Studio

## Live URL (Hosted on Firebase Hosting)
`https://archspec-hybrid-ai-2026.web.app`

## Public Open-Source GitHub Repository (Apache-2.0)
`https://github.com/asaddin02/archspec-hybrid-ai`

## Platform Category
**Web (Chrome)**

## Built With (Tags)
`firebase-ai-logic`, `firebase-app-check`, `firebase-remote-config`, `firebase-firestore`, `firebase-auth`, `firebase-hosting`, `gemini-nano`, `gemini-3.8-flash`, `three.js`, `react`, `typescript`, `vite`, `webgl`, `antigravity`

---

## Story / Description (Copy-Paste into Devpost "About the project")

### Inspiration
As a 3D architectural visualization developer working with villa developers, boutique architects, and clinics across Southeast Asia, I repeatedly ran into two real-world barriers on construction sites and client meetings:
1. **Unreliable Connectivity on Site:** Remote villa plots and active construction sites frequently have dead zones where cloud-only AI tools fail completely.
2. **Client NDA Privacy & 2D-to-3D Communication Gaps:** Pre-launch architectural briefs and floor plans are confidential, yet clients struggle to approve finishes from static 2D tables without seeing live PBR lighting and materials in 3D.

### What it does
**ArchSpec Hybrid AI** is an offline-first architectural material & 3D lighting studio built on a single **Firebase AI Logic Hybrid Inference SDK**:
- **4 Selectable Hybrid Inference Modes (`PREFER_ON_DEVICE`, `ONLY_ON_DEVICE`, `PREFER_IN_CLOUD`, `ONLY_IN_CLOUD`):** Architects can run confidential NDA briefs locally on Chrome's **Gemini Nano** at **$0 cost and 0 bytes sent to the cloud**, or let Firebase AI Logic automatically fall back to **Gemini 3.8 Flash / Gemini 3.5 Flash-Lite / Gemini 4 Hydrogen** on browsers without local models or for deep multimodal floor-plan/photo analysis.
- **Structured JSON $\rightarrow$ Real-Time 60 FPS 3D PBR Pavilion (Three.js):** Every AI call outputs a strictly validated JSON schema (`Schema.object` for cloud + `responseConstraint` on-device) containing PBR hex palettes, surface roughness/metalness, Kelvin sun temperature, lighting mood (`daylight` / `golden_hour` / `dusk`), and room-by-room material & cost specs — **immediately updating an interactive 3D architectural pavilion in real time**.
- **Live Streaming Site-Inspection Critique (`generateContentStream`):** Streams actionable 4-point glare, humidity/durability, acoustics, and value-engineering audits directly from the active hybrid model.
- **Live Hybrid Telemetry HUD:** Displays real `result.response.inferenceSource` (`ON_DEVICE` vs `IN_CLOUD`), latency (ms), and exact cloud payload bytes (`0 B Cloud` when running locally).
- **Offline-First Cloud Firestore Sync & Export:** Saves specifications per authenticated user (`users/{uid}/specs/{specId}`) via Anonymous Auth + Firestore `persistentLocalCache` protected by strict owner-only schema-validated security rules, plus 1-click `.md` and `.json` exports.

### How we built it
- **Firebase AI Logic (`firebase/ai`):** `getAI(app, { backend: new GoogleAIBackend() })`, `getGenerativeModel` invoked on user interaction with `InferenceMode`, `inCloudParams` (with resilient multi-model failover across zero-billing Gemini models), `onDeviceParams`, `Schema.object`, multimodal PNG/JPEG `InlineDataPart`, and `generateContentStream`.
- **Firebase App Check (`firebase/app-check`):** Integrated with `ReCaptchaEnterpriseProvider` and `FIREBASE_APPCHECK_DEBUG_TOKEN` support.
- **Firebase Remote Config (`firebase/remote-config`):** Dynamically manages `cloud_fallback_model`, `default_inference_mode`, and `studio_tagline` without redeployment.
- **Cloud Firestore + Firebase Auth + Firebase Hosting:** Full offline persistence, strict `firestore.rules` with `hasOnly`/type/length/enum/immutability validation, and CDN deployment.
- **Built with Google Antigravity & Official Firebase Agent Skills** (`firebase-ai-logic-basics`, `firebase-hosting-basics`, `firebase-remote-config-basics`, `firestore-rules-author`, and `modern-web-guidance`).

### Challenges we ran into
- Ensuring **identical structured JSON output** across both Chrome's on-device Prompt API (`responseConstraint`) and Firebase AI Logic cloud models (`responseSchema`) so the Three.js PBR material engine never crashes on partial/malformed fields.
- Handling transient cloud high-demand spikes (`500` / `503`) gracefully by implementing a resilient zero-billing failover chain (`gemini-3.8-flash` $\rightarrow$ `gemini-3.5-flash-lite` $\rightarrow$ `gemini-4-hydrogen`).

### What's next for ArchSpec Hybrid AI
- Native Android & iOS companion apps using Flutter + Firebase AI Logic (Gemini Nano on Android + Apple Foundation Models on iOS) sharing the exact same Firestore offline spec library.
- Custom `.GLB` floor-plan upload directly into the Hybrid AI PBR material mapper.

---

## 2.5-Minute English Demo Video Script (For YouTube Upload — Strictly < 3:00!)

- **0:00 – 0:25 (Hook & Problem):** Show `https://archspec-hybrid-ai-2026.web.app` live. *"Architects on construction sites deal with dead Wi-Fi and strict client NDAs. ArchSpec Hybrid AI uses Firebase AI Logic Hybrid Inference to run private architectural specs locally on-device with Gemini Nano, and fall back seamlessly to the cloud — driving a live 3D PBR pavilion in real time."*
- **0:25 – 0:55 (Architecture & Status Bar):** Point to the header badges: Online/Offline status, Chrome On-Device Gemini Nano status, Remote Config cloud fallback model (`gemini-3.8-flash`), and Firebase App Check. Show the 4 Firebase AI Logic modes (`PREFER_ON_DEVICE`, `ONLY_ON_DEVICE`, `PREFER_IN_CLOUD`, `ONLY_IN_CLOUD`).
- **0:55 – 1:45 (Live Hybrid AI -> 3D PBR Generation + Multimodal):** Click **Bali Tropical Villa (Dusk)** preset, click **Generate 3D Spec**. Show the live HUD updating (`IN_CLOUD` or `ON_DEVICE`, exact latency ms), the 3D pavilion transforming instantaneously to warm dusk lighting + Sukabumi reflecting pool + ironwood louvers, orbit the camera, switch to **Interior Lounge** & **Floorplan Top**, and scroll down to the Room-by-Room PBR Material & Lighting Spec Sheet.
- **1:45 – 2:15 (Streaming Critique + Offline/Cloud Proof):** Click **Site Critique** to demonstrate real-time `generateContentStream`. Click **Save to Firestore** to show Anonymous Auth + Firestore offline-first persistence + strict `firestore.rules`. Click **Export Spec (.md)**.
- **2:15 – 2:35 (Closing):** Show public Apache-2.0 GitHub repo `github.com/asaddin02/archspec-hybrid-ai` and `src/lib/hybridAi.ts`. *"One hybrid SDK, zero billing barriers, real 3D architectural impact. Thank you!"*
