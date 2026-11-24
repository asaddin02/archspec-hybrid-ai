import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { ArchMaterialSpec, HybridTelemetry } from '../types/spec';

interface Props {
  spec: ArchMaterialSpec;
  telemetry: HybridTelemetry | null;
  isGenerating: boolean;
}

type CameraPresetKey = 'hero' | 'lounge' | 'courtyard' | 'floorplan';

const CAMERA_PRESETS: Record<
  CameraPresetKey,
  { label: string; pos: [number, number, number]; target: [number, number, number] }
> = {
  hero: { label: 'Hero Pavilion', pos: [11.5, 6.2, 11.8], target: [0.5, 1.5, 0] },
  lounge: { label: 'Interior Lounge', pos: [4.2, 2.2, 5.2], target: [-1.4, 1.3, -1.2] },
  courtyard: { label: 'Reflecting Pool', pos: [8.5, 2.3, -5.8], target: [0.5, 1.4, 0.5] },
  floorplan: { label: 'Floorplan Top', pos: [0.2, 16.5, 0.25], target: [0.2, 0, 0] },
};

function kelvinToHex(kelvin: number): number {
  const k = Math.min(6500, Math.max(2200, kelvin));
  const t = (k - 2200) / (6500 - 2200);
  const r = Math.round(255 - t * 22);
  const g = Math.round(170 + t * 78);
  const b = Math.round(105 + t * 150);
  return (r << 16) | (g << 8) | b;
}

export const Arch3DViewport: React.FC<Props> = ({ spec, telemetry, isGenerating }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [activeCam, setActiveCam] = useState<CameraPresetKey>('hero');

  const sceneRefs = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    wallMat: THREE.MeshStandardMaterial;
    floorMat: THREE.MeshStandardMaterial;
    woodMat: THREE.MeshStandardMaterial;
    accentMat: THREE.MeshStandardMaterial;
    waterMat: THREE.MeshPhysicalMaterial;
    sunLight: THREE.DirectionalLight;
    ambientLight: THREE.AmbientLight;
    hemiLight: THREE.HemisphereLight;
    coveLight1: THREE.PointLight;
    coveLight2: THREE.PointLight;
    targetCamPos: THREE.Vector3;
    targetLookAt: THREE.Vector3;
    isTransitioning: boolean;
  } | null>(null);

  // Initialize Three.js architectural pavilion once
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || 720;
    const height = container.clientHeight || 440;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#1a1f29');
    scene.fog = new THREE.FogExp2('#1a1f29', 0.018);

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 120);
    camera.position.set(...CAMERA_PRESETS.hero.pos);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.maxPolarAngle = Math.PI / 2 - 0.04;
    controls.minDistance = 4;
    controls.maxDistance = 24;
    controls.target.set(...CAMERA_PRESETS.hero.target);

    // Stop preset lerp as soon as user drags manually
    const onControlStart = () => {
      if (sceneRefs.current) sceneRefs.current.isTransitioning = false;
    };
    controls.addEventListener('start', onControlStart);

    // PBR Materials driven dynamically by Hybrid AI JSON output
    const wallMat = new THREE.MeshStandardMaterial({
      color: spec.palette.wallHex,
      roughness: 0.85,
      metalness: 0.02,
    });
    const floorMat = new THREE.MeshStandardMaterial({
      color: spec.palette.floorHex,
      roughness: 0.65,
      metalness: 0.04,
    });
    const woodMat = new THREE.MeshStandardMaterial({
      color: spec.palette.woodHex,
      roughness: 0.52,
      metalness: 0.02,
    });
    const accentMat = new THREE.MeshStandardMaterial({
      color: spec.palette.accentHex,
      roughness: 0.82,
      metalness: 0.12,
    });
    const waterMat = new THREE.MeshPhysicalMaterial({
      color: spec.palette.waterHex,
      roughness: 0.12,
      metalness: 0.08,
      transmission: 0.35,
      reflectivity: 0.92,
      clearcoat: 1.0,
      clearcoatRoughness: 0.08,
    });
    const darkMetalMat = new THREE.MeshStandardMaterial({
      color: '#25282c',
      roughness: 0.35,
      metalness: 0.78,
    });
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: '#d8eef2',
      transparent: true,
      opacity: 0.24,
      roughness: 0.06,
      metalness: 0.1,
    });
    const glowMat = new THREE.MeshBasicMaterial({ color: '#ffebd0' });

    // Lighting rig
    const ambientLight = new THREE.AmbientLight('#ffffff', spec.palette.ambientIntensity);
    scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight('#d9ecff', '#5c4d3e', 0.55);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(kelvinToHex(spec.sunKelvin), spec.palette.sunIntensity);
    sunLight.position.set(12, 11, 8);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(1024, 1024);
    sunLight.shadow.camera.near = 1;
    sunLight.shadow.camera.far = 40;
    sunLight.shadow.camera.left = -12;
    sunLight.shadow.camera.right = 12;
    sunLight.shadow.camera.top = 12;
    sunLight.shadow.camera.bottom = -12;
    sunLight.shadow.bias = -0.0005;
    scene.add(sunLight);

    const coveLight1 = new THREE.PointLight('#ffcf96', 4.5, 11, 1.6);
    coveLight1.position.set(-1.5, 3.1, -1.0);
    scene.add(coveLight1);

    const coveLight2 = new THREE.PointLight('#ffd7a8', 3.5, 10, 1.6);
    coveLight2.position.set(2.8, 2.5, 1.8);
    scene.add(coveLight2);

    // === ARCHITECTURAL GEOMETRY ===
    const archGroup = new THREE.Group();
    scene.add(archGroup);

    const addBox = (
      w: number,
      h: number,
      d: number,
      x: number,
      y: number,
      z: number,
      mat: THREE.Material,
      cast = true,
      receive = true
    ) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = cast;
      mesh.receiveShadow = receive;
      archGroup.add(mesh);
      return mesh;
    };

    // Ground site surround
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.MeshStandardMaterial({ color: '#26292e', roughness: 0.95 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.32;
    ground.receiveShadow = true;
    scene.add(ground);

    // Main architectural travertine plinth
    addBox(12.4, 0.32, 9.6, 0.2, -0.16, 0.2, floorMat, false, true);
    // Main pavilion floor deck
    addBox(7.2, 0.14, 7.6, -2.0, 0.07, -0.2, floorMat, true, true);
    // Poolside timber deck walkway
    addBox(4.2, 0.12, 2.4, 3.8, 0.06, 2.4, woodMat, true, true);

    // Courtyard reflecting pool basin + water surface
    addBox(4.4, 0.16, 4.9, 3.9, 0.02, -1.45, darkMetalMat, false, true);
    const waterMesh = new THREE.Mesh(new THREE.PlaneGeometry(4.1, 4.6, 24, 24), waterMat);
    waterMesh.rotation.x = -Math.PI / 2;
    waterMesh.position.set(3.9, 0.11, -1.45);
    waterMesh.receiveShadow = true;
    archGroup.add(waterMesh);

    // Stepping stones across pool
    for (let i = 0; i < 3; i++) {
      addBox(0.95, 0.14, 0.65, 2.6 + i * 1.2, 0.09, -0.1, floorMat);
    }

    // Back sculptural feature wall & left privacy wall
    addBox(7.2, 3.6, 0.34, -2.0, 1.94, -3.85, wallMat);
    addBox(0.34, 3.6, 7.6, -5.45, 1.94, -0.2, wallMat);
    // Exterior courtyard stone screen wall
    addBox(0.3, 2.35, 5.4, 6.0, 1.18, -1.4, wallMat);

    // Cantilevered minimalist roof slab + warm wood ceiling soffit
    addBox(9.2, 0.28, 8.6, -1.2, 3.86, -0.1, wallMat);
    addBox(8.7, 0.08, 8.1, -1.2, 3.68, -0.1, woodMat, false, true);

    // Recessed linear architectural LED cove strip
    addBox(6.2, 0.05, 0.08, -2.0, 3.63, -3.52, glowMat, false, false);

    // Vertical timber louvers (brise-soleil screen along facade)
    for (let i = 0; i < 11; i++) {
      addBox(0.11, 3.55, 0.22, -4.8 + i * 0.32, 1.92, 3.55, woodMat);
    }

    // Structural slim steel columns & frameless glazing
    addBox(0.16, 3.6, 0.16, 1.5, 1.94, 3.5, darkMetalMat);
    addBox(0.16, 3.6, 0.16, 1.5, 1.94, -3.7, darkMetalMat);
    addBox(0.05, 3.52, 4.8, 1.5, 1.9, -1.1, glassMat, false, false);

    // Interior Designer Furniture (L-Shaped Lounge Sofa + Coffee Table + Rug + Pendant)
    addBox(3.4, 0.03, 2.6, -2.1, 0.16, -0.8, accentMat, false, true);
    // Sofa base & cushions
    addBox(2.9, 0.38, 0.95, -2.2, 0.35, -2.35, accentMat);
    addBox(2.9, 0.52, 0.24, -2.2, 0.68, -2.72, accentMat);
    addBox(0.95, 0.38, 1.8, -3.2, 0.35, -1.2, accentMat);
    addBox(0.24, 0.52, 1.8, -3.58, 0.68, -1.2, accentMat);
    // Timber & stone coffee table
    addBox(1.5, 0.1, 0.9, -1.7, 0.45, -0.8, woodMat);
    addBox(1.1, 0.32, 0.55, -1.7, 0.25, -0.8, darkMetalMat);
    // Sculptural dining / feature pendant light
    addBox(0.04, 1.1, 0.04, -1.7, 3.1, -0.8, darkMetalMat, false, false);
    const pendant = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.55, 0.18, 24), woodMat);
    pendant.position.set(-1.7, 2.52, -0.8);
    pendant.castShadow = true;
    archGroup.add(pendant);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 16), glowMat);
    bulb.position.set(-1.7, 2.44, -0.8);
    archGroup.add(bulb);

    // Architectural planter & minimalist courtyard tree
    addBox(1.2, 0.55, 1.2, 4.8, 0.28, 1.9, wallMat);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.13, 1.9, 10), woodMat);
    trunk.position.set(4.8, 1.35, 1.9);
    trunk.castShadow = true;
    archGroup.add(trunk);
    const foliageMat = new THREE.MeshStandardMaterial({ color: '#3b5c43', roughness: 0.88 });
    const canopy1 = new THREE.Mesh(new THREE.DodecahedronGeometry(0.85, 1), foliageMat);
    canopy1.position.set(4.8, 2.55, 1.9);
    canopy1.castShadow = true;
    archGroup.add(canopy1);
    const canopy2 = new THREE.Mesh(new THREE.DodecahedronGeometry(0.58, 1), foliageMat);
    canopy2.position.set(4.35, 2.25, 1.55);
    canopy2.castShadow = true;
    archGroup.add(canopy2);

    sceneRefs.current = {
      scene,
      camera,
      controls,
      wallMat,
      floorMat,
      woodMat,
      accentMat,
      waterMat,
      sunLight,
      ambientLight,
      hemiLight,
      coveLight1,
      coveLight2,
      targetCamPos: new THREE.Vector3(...CAMERA_PRESETS.hero.pos),
      targetLookAt: new THREE.Vector3(...CAMERA_PRESETS.hero.target),
      isTransitioning: false,
    };

    let animId = 0;
    const clock = new THREE.Clock();

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();

      // Subtle living shimmer on courtyard pool water
      waterMat.roughness = 0.1 + Math.sin(t * 1.4) * 0.025;

      // Smooth camera transition between presets
      const refs = sceneRefs.current;
      if (refs && refs.isTransitioning) {
        camera.position.lerp(refs.targetCamPos, 0.07);
        controls.target.lerp(refs.targetLookAt, 0.07);
        if (camera.position.distanceTo(refs.targetCamPos) < 0.06) {
          refs.isTransitioning = false;
        }
      }

      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth || 720;
      const h = container.clientHeight || 440;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', onResize);
      controls.removeEventListener('start', onControlStart);
      controls.dispose();
      renderer.dispose();
    };
  }, []);

  // Hot-swap PBR materials, sun Kelvin, and mood sky whenever Hybrid AI outputs a new spec!
  useEffect(() => {
    const refs = sceneRefs.current;
    if (!refs) return;

    refs.wallMat.color.set(spec.palette.wallHex);
    refs.floorMat.color.set(spec.palette.floorHex);
    refs.woodMat.color.set(spec.palette.woodHex);
    refs.accentMat.color.set(spec.palette.accentHex);
    refs.waterMat.color.set(spec.palette.waterHex);

    // Apply PBR roughness/metalness from top AI materials
    if (spec.materials[0]) {
      refs.wallMat.roughness = spec.materials[0].pbrRoughness;
      refs.wallMat.metalness = spec.materials[0].pbrMetalness;
    }
    if (spec.materials[1]) {
      refs.floorMat.roughness = spec.materials[1].pbrRoughness;
      refs.floorMat.metalness = spec.materials[1].pbrMetalness;
    }
    if (spec.materials[2]) {
      refs.woodMat.roughness = spec.materials[2].pbrRoughness;
    }

    refs.sunLight.color.setHex(kelvinToHex(spec.sunKelvin));
    refs.sunLight.intensity = spec.palette.sunIntensity;
    refs.ambientLight.intensity = spec.palette.ambientIntensity;

    if (spec.lightingMood === 'daylight') {
      refs.scene.background = new THREE.Color('#c7daea');
      refs.scene.fog = new THREE.FogExp2('#c7daea', 0.012);
      refs.sunLight.position.set(8, 16, 10);
      refs.hemiLight.intensity = 0.85;
      refs.coveLight1.intensity = 1.6;
      refs.coveLight2.intensity = 1.2;
    } else if (spec.lightingMood === 'dusk') {
      refs.scene.background = new THREE.Color('#131926');
      refs.scene.fog = new THREE.FogExp2('#131926', 0.02);
      refs.sunLight.position.set(14, 5.5, 9);
      refs.hemiLight.intensity = 0.35;
      refs.coveLight1.intensity = 7.5;
      refs.coveLight2.intensity = 6.0;
    } else {
      // golden_hour
      refs.scene.background = new THREE.Color('#27232c');
      refs.scene.fog = new THREE.FogExp2('#27232c', 0.016);
      refs.sunLight.position.set(14, 8.5, 7);
      refs.hemiLight.intensity = 0.55;
      refs.coveLight1.intensity = 4.8;
      refs.coveLight2.intensity = 3.6;
    }
  }, [spec]);

  const jumpCamera = (key: CameraPresetKey) => {
    setActiveCam(key);
    const refs = sceneRefs.current;
    if (!refs) return;
    refs.targetCamPos.set(...CAMERA_PRESETS[key].pos);
    refs.targetLookAt.set(...CAMERA_PRESETS[key].target);
    refs.isTransitioning = true;
  };

  return (
    <div className="viewport-card">
      <div className="viewport-canvas-wrap">
        <div ref={containerRef} className="viewport-canvas" aria-label="Interactive 3D Architectural Material Preview" />

        {/* Top-left Live Hybrid Telemetry HUD */}
        <div className="hud-top-left">
          <span
            className={`telemetry-pill ${
              telemetry?.inferenceSource === 'ON_DEVICE'
                ? 'pill-local'
                : telemetry?.inferenceSource === 'IN_CLOUD'
                ? 'pill-cloud'
                : 'pill-ready'
            }`}
          >
            {isGenerating
              ? 'Running Hybrid AI...'
              : telemetry
              ? `${telemetry.inferenceSource} · ${telemetry.latencyMs}ms · ${
                  telemetry.cloudBytesSent === 0 ? '0 B Cloud (NDA Private)' : `${(telemetry.cloudBytesSent / 1024).toFixed(1)} KB Cloud`
                }`
              : 'Real-Time PBR 3D Preview Ready'}
          </span>
          <span className="mood-pill">
            {spec.lightingMood.replace('_', ' ').toUpperCase()} · {spec.sunKelvin}K
          </span>
        </div>

        {/* Bottom Camera Preset Switcher */}
        <div className="hud-bottom-bar">
          {(Object.keys(CAMERA_PRESETS) as CameraPresetKey[]).map((k) => (
            <button
              key={k}
              type="button"
              className={`cam-btn ${activeCam === k ? 'active' : ''}`}
              onClick={() => jumpCamera(k)}
            >
              {CAMERA_PRESETS[k].label}
            </button>
          ))}
        </div>
      </div>

      {/* Live Color Swatches Bar */}
      <div className="swatch-bar">
        {[
          { label: 'Wall', hex: spec.palette.wallHex },
          { label: 'Floor', hex: spec.palette.floorHex },
          { label: 'Timber', hex: spec.palette.woodHex },
          { label: 'Accent', hex: spec.palette.accentHex },
          { label: 'Pool', hex: spec.palette.waterHex },
        ].map((s) => (
          <div key={s.label} className="swatch-chip">
            <span className="swatch-dot" style={{ backgroundColor: s.hex }} />
            <span>{s.label}</span>
            <code>{s.hex}</code>
          </div>
        ))}
      </div>
    </div>
  );
};
