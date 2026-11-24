import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Play, Pause, Grid2x2, RotateCcw } from 'lucide-react';
import type {
  ArchMaterialSpec,
  HybridTelemetry,
  LightingMood,
  ScenePalette,
} from '../types/spec';

interface Props {
  spec: ArchMaterialSpec;
  telemetry: HybridTelemetry | null;
  isGenerating: boolean;
  onUpdatePalette: (key: keyof Pick<ScenePalette, 'wallHex' | 'floorHex' | 'woodHex' | 'accentHex' | 'waterHex'>, hex: string) => void;
  onUpdateLighting: (mood: LightingMood, sunKelvin: number) => void;
}

type CameraPresetKey = 'hero' | 'lounge' | 'courtyard' | 'floorplan';

const CAMERA_PRESETS: Record<
  CameraPresetKey,
  { label: string; pos: [number, number, number]; target: [number, number, number] }
> = {
  hero: { label: 'Hero pavilion', pos: [11.8, 6.0, 11.4], target: [0.3, 1.45, 0] },
  lounge: { label: 'Interior lounge', pos: [4.3, 2.15, 5.1], target: [-1.7, 1.25, -1.3] },
  courtyard: { label: 'Reflecting pool', pos: [8.8, 2.35, -5.6], target: [0.6, 1.35, 0.3] },
  floorplan: { label: 'Plan view', pos: [0.15, 16.2, 0.25], target: [0.15, 0, 0] },
};

const MOOD_OPTIONS: { key: LightingMood; label: string; defaultKelvin: number }[] = [
  { key: 'daylight', label: 'Daylight', defaultKelvin: 5200 },
  { key: 'golden_hour', label: 'Golden hour', defaultKelvin: 3400 },
  { key: 'dusk', label: 'Dusk', defaultKelvin: 2700 },
];

function kelvinToHex(kelvin: number): number {
  const k = Math.min(6500, Math.max(2200, kelvin));
  const t = (k - 2200) / (6500 - 2200);
  const r = Math.round(255 - t * 20);
  const g = Math.round(172 + t * 76);
  const b = Math.round(108 + t * 147);
  return (r << 16) | (g << 8) | b;
}

function createTravertineTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#f2f0eb';
  ctx.fillRect(0, 0, 512, 512);

  // Subtle horizontal sedimentary veining
  for (let i = 0; i < 160; i++) {
    const y = Math.random() * 512;
    const h = 1 + Math.random() * 4;
    const alpha = 0.025 + Math.random() * 0.045;
    ctx.fillStyle = i % 2 === 0 ? `rgba(110,102,90,${alpha})` : `rgba(255,255,255,${alpha})`;
    ctx.fillRect(0, y, 512, h);
  }

  // Fine mineral grain
  for (let i = 0; i < 2400; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    ctx.fillStyle = `rgba(95,88,78,${0.03 + Math.random() * 0.05})`;
    ctx.fillRect(x, y, 1.5, 1.5);
  }

  // Large-format 90x90 cm architectural tile joints
  ctx.strokeStyle = 'rgba(70, 64, 58, 0.22)';
  ctx.lineWidth = 2;
  for (let p = 0; p <= 512; p += 128) {
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, 512);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(512, p);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  return tex;
}

function createLimePlasterTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#f4f2ee';
  ctx.fillRect(0, 0, 512, 512);

  // Soft hand-troweled limewash clouds
  for (let i = 0; i < 95; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const r = 24 + Math.random() * 72;
    const grad = ctx.createRadialGradient(x, y, 2, x, y, r);
    const shade = i % 2 === 0 ? 'rgba(130,122,110,0.06)' : 'rgba(255,255,255,0.08)';
    grad.addColorStop(0, shade);
    grad.addColorStop(1, 'rgba(244,242,238,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // Fine tactile plaster specks
  for (let i = 0; i < 3200; i++) {
    ctx.fillStyle = `rgba(100,94,86,${0.02 + Math.random() * 0.045})`;
    ctx.fillRect(Math.random() * 512, Math.random() * 512, 1.5, 1.5);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  return tex;
}

function createTimberGrainTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ece6dc';
  ctx.fillRect(0, 0, 512, 512);

  // Longitudinal wood fibers
  for (let x = 0; x < 512; x += 2) {
    const wave = Math.sin(x * 0.08) * 0.04;
    const alpha = 0.05 + Math.abs(wave) + Math.random() * 0.05;
    ctx.fillStyle = `rgba(62, 36, 18, ${alpha})`;
    ctx.fillRect(x, 0, 1.5, 512);
  }

  // Plank join lines
  ctx.strokeStyle = 'rgba(42, 24, 12, 0.25)';
  ctx.lineWidth = 2;
  for (let x = 0; x <= 512; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 512);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  return tex;
}

function createBoucleTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ecebe8';
  ctx.fillRect(0, 0, 256, 256);

  for (let y = 0; y < 256; y += 4) {
    for (let x = 0; x < 256; x += 4) {
      const a = 0.04 + Math.random() * 0.08;
      ctx.fillStyle = (x + y) % 8 === 0 ? `rgba(40,40,38,${a})` : `rgba(255,255,255,${a})`;
      ctx.fillRect(x, y, 2, 2);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  return tex;
}

export const Arch3DViewport: React.FC<Props> = ({
  spec,
  telemetry,
  isGenerating,
  onUpdatePalette,
  onUpdateLighting,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [activeCam, setActiveCam] = useState<CameraPresetKey>('hero');
  const [autoOrbit, setAutoOrbit] = useState<boolean>(false);
  const [wireframe, setWireframe] = useState<boolean>(false);

  const autoOrbitRef = useRef(autoOrbit);
  autoOrbitRef.current = autoOrbit;

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
    poolLight: THREE.PointLight;
    targetCamPos: THREE.Vector3;
    targetLookAt: THREE.Vector3;
    isTransitioning: boolean;
  } | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || 760;
    const height = container.clientHeight || 480;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#242126');
    scene.fog = new THREE.FogExp2('#242126', 0.015);

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 120);
    camera.position.set(...CAMERA_PRESETS.hero.pos);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.maxPolarAngle = Math.PI / 2 - 0.04;
    controls.minDistance = 4;
    controls.maxDistance = 24;
    controls.autoRotate = false;
    controls.autoRotateSpeed = 0.65;
    controls.target.set(...CAMERA_PRESETS.hero.target);

    const onControlStart = () => {
      if (sceneRefs.current) sceneRefs.current.isTransitioning = false;
    };
    controls.addEventListener('start', onControlStart);

    // Procedural architectural textures (zero network cost)
    const plasterTex = createLimePlasterTexture();
    const stoneTex = createTravertineTexture();
    const timberTex = createTimberGrainTexture();
    const fabricTex = createBoucleTexture();

    const wallMat = new THREE.MeshStandardMaterial({
      color: spec.palette.wallHex,
      map: plasterTex,
      bumpMap: plasterTex,
      bumpScale: 0.015,
      roughness: 0.86,
      metalness: 0.02,
    });
    const floorMat = new THREE.MeshStandardMaterial({
      color: spec.palette.floorHex,
      map: stoneTex,
      bumpMap: stoneTex,
      bumpScale: 0.012,
      roughness: 0.66,
      metalness: 0.03,
    });
    const woodMat = new THREE.MeshStandardMaterial({
      color: spec.palette.woodHex,
      map: timberTex,
      bumpMap: timberTex,
      bumpScale: 0.018,
      roughness: 0.54,
      metalness: 0.02,
    });
    const accentMat = new THREE.MeshStandardMaterial({
      color: spec.palette.accentHex,
      map: fabricTex,
      roughness: 0.88,
      metalness: 0.06,
    });
    const waterMat = new THREE.MeshPhysicalMaterial({
      color: spec.palette.waterHex,
      roughness: 0.1,
      metalness: 0.08,
      transmission: 0.36,
      reflectivity: 0.94,
      clearcoat: 1.0,
      clearcoatRoughness: 0.06,
    });
    const darkMetalMat = new THREE.MeshStandardMaterial({
      color: '#232528',
      roughness: 0.32,
      metalness: 0.82,
    });
    const brassMat = new THREE.MeshStandardMaterial({
      color: '#b58d58',
      roughness: 0.3,
      metalness: 0.78,
    });
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: '#d8eef2',
      transparent: true,
      opacity: 0.22,
      roughness: 0.05,
      metalness: 0.1,
    });
    const glowMat = new THREE.MeshBasicMaterial({ color: '#ffecd2' });
    const artCanvasMat = new THREE.MeshStandardMaterial({
      color: '#d8cfc0',
      roughness: 0.92,
    });

    // Architectural lighting rig
    const ambientLight = new THREE.AmbientLight('#fffcf7', spec.palette.ambientIntensity);
    scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight('#dce9f7', '#5a4b3c', 0.58);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(
      kelvinToHex(spec.sunKelvin),
      spec.palette.sunIntensity
    );
    sunLight.position.set(14, 9.5, 7.5);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(2048, 2048);
    sunLight.shadow.camera.near = 1;
    sunLight.shadow.camera.far = 42;
    sunLight.shadow.camera.left = -13;
    sunLight.shadow.camera.right = 13;
    sunLight.shadow.camera.top = 13;
    sunLight.shadow.camera.bottom = -13;
    sunLight.shadow.bias = -0.0004;
    scene.add(sunLight);

    const coveLight1 = new THREE.PointLight('#ffd09a', 4.6, 12, 1.6);
    coveLight1.position.set(-1.7, 3.15, -1.2);
    scene.add(coveLight1);

    const coveLight2 = new THREE.PointLight('#ffd9ad', 3.4, 10, 1.6);
    coveLight2.position.set(2.6, 2.55, 1.7);
    scene.add(coveLight2);

    const poolLight = new THREE.PointLight('#6ec8c4', 2.4, 7.5, 1.8);
    poolLight.position.set(3.9, 0.45, -1.4);
    scene.add(poolLight);

    // Architectural pavilion assembly
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

    // Surround architectural ground plane
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(70, 70),
      new THREE.MeshStandardMaterial({ color: '#242321', roughness: 0.96 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.34;
    ground.receiveShadow = true;
    scene.add(ground);

    // Stepped architectural travertine plinth + floating shadow gap
    addBox(12.8, 0.24, 10.0, 0.2, -0.22, 0.2, darkMetalMat, false, true);
    addBox(12.4, 0.26, 9.6, 0.2, -0.08, 0.2, floorMat, true, true);
    // Main living pavilion slab
    addBox(7.2, 0.14, 7.6, -2.0, 0.11, -0.2, floorMat, true, true);
    // Timber deck planks alongside reflecting pool
    for (let i = 0; i < 6; i++) {
      addBox(4.2, 0.11, 0.36, 3.8, 0.1, 1.45 + i * 0.4, woodMat, true, true);
    }

    // Reflecting pool coping & water plane
    addBox(4.6, 0.18, 5.1, 3.9, 0.04, -1.45, darkMetalMat, false, true);
    const waterMesh = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 4.7, 28, 28), waterMat);
    waterMesh.rotation.x = -Math.PI / 2;
    waterMesh.position.set(3.9, 0.15, -1.45);
    waterMesh.receiveShadow = true;
    archGroup.add(waterMesh);

    // Floating travertine stepping stones over pool
    for (let i = 0; i < 3; i++) {
      addBox(0.95, 0.13, 0.68, 2.55 + i * 1.25, 0.13, -0.15, floorMat);
    }

    // Architectural walls with top coping & sculptural artwork niche
    addBox(7.2, 3.62, 0.36, -2.0, 1.98, -3.86, wallMat);
    addBox(0.36, 3.62, 7.6, -5.44, 1.98, -0.2, wallMat);
    // Courtyard privacy screen wall with vertical stone reveals
    addBox(0.3, 2.42, 5.4, 6.02, 1.24, -1.42, wallMat);
    addBox(0.34, 0.06, 5.46, 6.02, 2.48, -1.42, darkMetalMat);

    // Framed minimalist gallery painting on rear feature wall
    addBox(2.15, 1.35, 0.05, -2.1, 2.15, -3.66, darkMetalMat);
    addBox(1.98, 1.18, 0.06, -2.1, 2.15, -3.65, artCanvasMat, false, true);
    addBox(0.62, 0.46, 0.07, -1.75, 2.02, -3.64, accentMat, false, false);

    // Cantilevered roof slab with metal fascia edge & timber ceiling soffit
    addBox(9.35, 0.24, 8.75, -1.15, 3.92, -0.1, wallMat);
    addBox(9.42, 0.07, 8.82, -1.15, 4.05, -0.1, darkMetalMat);
    addBox(8.8, 0.09, 8.2, -1.15, 3.74, -0.1, woodMat, false, true);

    // Recessed architectural linear cove LED + 3 ceiling downlight bezels
    addBox(6.3, 0.05, 0.07, -2.0, 3.68, -3.52, glowMat, false, false);
    for (const [dx, dz] of [
      [-3.4, -0.8],
      [-0.4, -0.8],
      [-1.9, 1.6],
    ]) {
      const bezel = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.04, 18), darkMetalMat);
      bezel.position.set(dx, 3.69, dz);
      archGroup.add(bezel);
      const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.045, 16), glowMat);
      lens.position.set(dx, 3.685, dz);
      archGroup.add(lens);
    }

    // Vertical timber brise-soleil screen along front facade
    for (let i = 0; i < 12; i++) {
      addBox(0.1, 3.58, 0.22, -4.85 + i * 0.31, 1.96, 3.55, woodMat);
    }

    // Structural steel columns & mullioned frameless sliding glazing
    addBox(0.15, 3.62, 0.15, 1.5, 1.98, 3.52, darkMetalMat);
    addBox(0.15, 3.62, 0.15, 1.5, 1.98, -3.72, darkMetalMat);
    // Mullions
    addBox(0.08, 0.07, 4.9, 1.5, 3.66, -1.1, darkMetalMat);
    addBox(0.08, 0.05, 4.9, 1.5, 0.2, -1.1, darkMetalMat);
    addBox(0.07, 3.48, 0.06, 1.5, 1.93, -1.1, darkMetalMat);
    addBox(0.04, 3.46, 4.82, 1.5, 1.93, -1.1, glassMat, false, false);

    // Interior furniture ensemble (area rug, L-sofa with plinth & pillows, coffee table, pendant, floor lamp)
    addBox(3.55, 0.03, 2.75, -2.05, 0.2, -0.85, accentMat, false, true);
    // Low timber sofa plinth
    addBox(3.0, 0.12, 1.0, -2.18, 0.27, -2.35, woodMat);
    addBox(1.0, 0.12, 1.85, -3.18, 0.27, -1.2, woodMat);
    // Cushions & backrest
    addBox(2.92, 0.34, 0.94, -2.18, 0.5, -2.35, accentMat);
    addBox(2.92, 0.48, 0.24, -2.18, 0.82, -2.72, accentMat);
    addBox(0.94, 0.34, 1.78, -3.18, 0.5, -1.2, accentMat);
    addBox(0.24, 0.48, 1.78, -3.56, 0.82, -1.2, accentMat);

    // Sculptural travertine + wood coffee table + ceramic vessel
    addBox(1.55, 0.09, 0.92, -1.68, 0.49, -0.82, woodMat);
    addBox(0.28, 0.28, 0.65, -2.15, 0.32, -0.82, floorMat);
    addBox(0.28, 0.28, 0.65, -1.2, 0.32, -0.82, floorMat);
    const vessel = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 0.24, 16), wallMat);
    vessel.position.set(-1.42, 0.66, -0.75);
    vessel.castShadow = true;
    archGroup.add(vessel);

    // Brushed-brass sculptural pendant above coffee table
    addBox(0.03, 1.15, 0.03, -1.68, 3.14, -0.82, darkMetalMat, false, false);
    const pendant = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.56, 0.16, 28), brassMat);
    pendant.position.set(-1.68, 2.54, -0.82);
    pendant.castShadow = true;
    archGroup.add(pendant);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 16), glowMat);
    bulb.position.set(-1.68, 2.47, -0.82);
    archGroup.add(bulb);

    // Poolside minimalist daybed lounger
    addBox(1.85, 0.12, 0.82, 3.3, 0.24, 2.45, woodMat);
    addBox(1.72, 0.14, 0.74, 3.3, 0.37, 2.45, wallMat);

    // Courtyard architectural planter & olive-style sculpted tree
    addBox(1.25, 0.58, 1.25, 4.95, 0.34, 2.25, wallMat);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.12, 1.85, 10), woodMat);
    trunk.position.set(4.95, 1.4, 2.25);
    trunk.castShadow = true;
    archGroup.add(trunk);

    const foliageMat = new THREE.MeshStandardMaterial({ color: '#425d46', roughness: 0.9 });
    const canopyClusters: [number, number, number, number][] = [
      [4.95, 2.58, 2.25, 0.78],
      [4.42, 2.26, 1.92, 0.56],
      [5.38, 2.32, 2.56, 0.52],
      [4.88, 3.05, 2.18, 0.48],
    ];
    for (const [cx, cy, cz, rad] of canopyClusters) {
      const c = new THREE.Mesh(new THREE.DodecahedronGeometry(rad, 1), foliageMat);
      c.position.set(cx, cy, cz);
      c.castShadow = true;
      archGroup.add(c);
    }

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
      poolLight,
      targetCamPos: new THREE.Vector3(...CAMERA_PRESETS.hero.pos),
      targetLookAt: new THREE.Vector3(...CAMERA_PRESETS.hero.target),
      isTransitioning: false,
    };

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let animId = 0;
    const clock = new THREE.Clock();

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();

      if (!reduceMotion) {
        waterMat.roughness = 0.09 + Math.sin(t * 1.35) * 0.022;
      }

      controls.autoRotate = autoOrbitRef.current;

      const refs = sceneRefs.current;
      if (refs && refs.isTransitioning) {
        const speed = reduceMotion ? 0.35 : 0.08;
        camera.position.lerp(refs.targetCamPos, speed);
        controls.target.lerp(refs.targetLookAt, speed);
        if (camera.position.distanceTo(refs.targetCamPos) < 0.05) {
          refs.isTransitioning = false;
        }
      }

      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || 760;
      const h = container.clientHeight || 480;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    const ro = new ResizeObserver(handleResize);
    ro.observe(container);
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
      window.removeEventListener('resize', handleResize);
      controls.removeEventListener('start', onControlStart);
      controls.dispose();
      plasterTex.dispose();
      stoneTex.dispose();
      timberTex.dispose();
      fabricTex.dispose();
      renderer.dispose();
    };
  }, []);

  // Synchronize PBR materials, lighting mood, and wireframe mode whenever spec changes
  useEffect(() => {
    const refs = sceneRefs.current;
    if (!refs) return;

    refs.wallMat.color.set(spec.palette.wallHex);
    refs.floorMat.color.set(spec.palette.floorHex);
    refs.woodMat.color.set(spec.palette.woodHex);
    refs.accentMat.color.set(spec.palette.accentHex);
    refs.waterMat.color.set(spec.palette.waterHex);

    refs.wallMat.wireframe = wireframe;
    refs.floorMat.wireframe = wireframe;
    refs.woodMat.wireframe = wireframe;
    refs.accentMat.wireframe = wireframe;

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
      refs.scene.background = new THREE.Color('#cfdbe6');
      refs.scene.fog = new THREE.FogExp2('#cfdbe6', 0.011);
      refs.sunLight.position.set(8, 16, 10);
      refs.hemiLight.intensity = 0.85;
      refs.coveLight1.intensity = 1.6;
      refs.coveLight2.intensity = 1.2;
      refs.poolLight.intensity = 0.7;
    } else if (spec.lightingMood === 'dusk') {
      refs.scene.background = new THREE.Color('#141720');
      refs.scene.fog = new THREE.FogExp2('#141720', 0.018);
      refs.sunLight.position.set(14, 5.2, 9);
      refs.hemiLight.intensity = 0.34;
      refs.coveLight1.intensity = 7.2;
      refs.coveLight2.intensity = 5.6;
      refs.poolLight.intensity = 4.2;
    } else {
      refs.scene.background = new THREE.Color('#272228');
      refs.scene.fog = new THREE.FogExp2('#272228', 0.015);
      refs.sunLight.position.set(14, 8.8, 7.2);
      refs.hemiLight.intensity = 0.56;
      refs.coveLight1.intensity = 4.8;
      refs.coveLight2.intensity = 3.6;
      refs.poolLight.intensity = 2.4;
    }
  }, [spec, wireframe]);

  const jumpCamera = (key: CameraPresetKey) => {
    setActiveCam(key);
    const refs = sceneRefs.current;
    if (!refs) return;
    refs.targetCamPos.set(...CAMERA_PRESETS[key].pos);
    refs.targetLookAt.set(...CAMERA_PRESETS[key].target);
    refs.isTransitioning = true;
  };

  const telemetryLabel = isGenerating
    ? 'Synthesizing specification'
    : telemetry
    ? telemetry.inferenceSource === 'ON_DEVICE'
      ? 'On-device Gemini Nano'
      : telemetry.inferenceSource === 'IN_CLOUD'
      ? `Firebase Cloud (${telemetry.modelUsed})`
      : 'Local studio fallback'
    : 'Real-time PBR preview';

  const telemetryTone =
    telemetry?.inferenceSource === 'ON_DEVICE'
      ? 'tone-local'
      : telemetry?.inferenceSource === 'IN_CLOUD'
      ? 'tone-cloud'
      : telemetry?.inferenceSource === 'DEMO_LOCAL'
      ? 'tone-fallback'
      : 'tone-idle';

  const swatchItems: {
    key: 'wallHex' | 'floorHex' | 'woodHex' | 'accentHex' | 'waterHex';
    label: string;
    hex: string;
  }[] = [
    { key: 'wallHex', label: 'Wall', hex: spec.palette.wallHex },
    { key: 'floorHex', label: 'Floor', hex: spec.palette.floorHex },
    { key: 'woodHex', label: 'Timber', hex: spec.palette.woodHex },
    { key: 'accentHex', label: 'Accent', hex: spec.palette.accentHex },
    { key: 'waterHex', label: 'Pool', hex: spec.palette.waterHex },
  ];

  return (
    <section className="viewport-stage" aria-label="Interactive 3D Architectural Material Viewport">
      {/* Stage top bar: honest inference readout without pill clutter */}
      <div className="stage-header">
        <div className="stage-status">
          <span className={`status-indicator ${telemetryTone}`} aria-hidden="true" />
          <span className="stage-status-label">{telemetryLabel}</span>
        </div>

        <dl className="stage-metrics">
          <div>
            <dt>Latency</dt>
            <dd className="mono">{telemetry ? `${telemetry.latencyMs} ms` : '—'}</dd>
          </div>
          <div>
            <dt>Cloud payload</dt>
            <dd className="mono">
              {telemetry
                ? telemetry.cloudBytesSent === 0
                  ? '0 B'
                  : `${(telemetry.cloudBytesSent / 1024).toFixed(1)} KB`
                : '0 B'}
            </dd>
          </div>
          <div>
            <dt>Sun</dt>
            <dd className="mono">{spec.sunKelvin}K</dd>
          </div>
        </dl>
      </div>

      {/* 3D WebGL Canvas */}
      <div className="stage-canvas-frame">
        <div
          ref={containerRef}
          className="stage-canvas"
          role="img"
          aria-label={`Interactive 3D architectural model for ${spec.projectTitle}. Drag to orbit, scroll to zoom.`}
        />
        {isGenerating && (
          <div className="stage-loading-scrim" role="status" aria-live="polite">
            <span>Updating PBR shaders &amp; lighting rig…</span>
          </div>
        )}
      </div>

      {/* Docked Camera & Viewport Controls */}
      <div className="stage-toolbar">
        <div className="camera-tabs" role="group" aria-label="Camera views">
          {(Object.keys(CAMERA_PRESETS) as CameraPresetKey[]).map((k) => (
            <button
              key={k}
              type="button"
              className={`seg-btn ${activeCam === k ? 'is-active' : ''}`}
              aria-pressed={activeCam === k}
              onClick={() => jumpCamera(k)}
            >
              {CAMERA_PRESETS[k].label}
            </button>
          ))}
        </div>

        <div className="viewport-toggles">
          <button
            type="button"
            className={`icon-toggle ${autoOrbit ? 'is-active' : ''}`}
            aria-pressed={autoOrbit}
            onClick={() => setAutoOrbit((v) => !v)}
          >
            {autoOrbit ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
            <span>{autoOrbit ? 'Pause orbit' : 'Auto orbit'}</span>
          </button>

          <button
            type="button"
            className={`icon-toggle ${wireframe ? 'is-active' : ''}`}
            aria-pressed={wireframe}
            onClick={() => setWireframe((v) => !v)}
          >
            <Grid2x2 size={14} aria-hidden="true" />
            <span>Wireframe</span>
          </button>

          <button
            type="button"
            className="icon-toggle"
            onClick={() => jumpCamera('hero')}
            aria-label="Reset camera to hero pavilion view"
          >
            <RotateCcw size={14} aria-hidden="true" />
            <span>Reset</span>
          </button>
        </div>
      </div>

      {/* Interactive Live Lighting & Material Swatch Fine-Tuner */}
      <div className="tuner-dock">
        <div className="tuner-lighting">
          <div className="mood-group" role="group" aria-label="Lighting atmosphere">
            {MOOD_OPTIONS.map((m) => (
              <button
                key={m.key}
                type="button"
                className={`mood-btn ${spec.lightingMood === m.key ? 'is-active' : ''}`}
                aria-pressed={spec.lightingMood === m.key}
                onClick={() => onUpdateLighting(m.key, m.defaultKelvin)}
              >
                {m.label}
              </button>
            ))}
          </div>

          <label className="kelvin-control" htmlFor="sun-kelvin-slider">
            <span>Color temp</span>
            <input
              id="sun-kelvin-slider"
              type="range"
              min={2200}
              max={6200}
              step={100}
              value={spec.sunKelvin}
              onChange={(e) => onUpdateLighting(spec.lightingMood, Number(e.target.value))}
            />
            <output className="mono">{spec.sunKelvin}K</output>
          </label>
        </div>

        <div className="swatch-dock" aria-label="Live PBR palette editor">
          {swatchItems.map((s) => (
            <label key={s.key} className="swatch-picker">
              <span className="swatch-chip-box" style={{ backgroundColor: s.hex }}>
                <input
                  type="color"
                  value={s.hex}
                  aria-label={`Customize ${s.label} color`}
                  onChange={(e) => onUpdatePalette(s.key, e.target.value)}
                />
              </span>
              <span className="swatch-meta">
                <span className="swatch-name">{s.label}</span>
                <code className="mono swatch-hex">{s.hex}</code>
              </span>
            </label>
          ))}
        </div>
      </div>
    </section>
  );
};
