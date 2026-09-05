/**
 * 3D Engine for Theme Park Ride Grouper Simulator.
 * Manages Three.js scene, lighting, coaster train models, gates, queue lines,
 * procedural NPCs, first-person player camera/controls, pathfinding, and animations.
 */

import * as THREE from 'three';
import { soundEngine } from '../audio/soundEngine';
import {
  CONSOLE_POS,
  GATE_COUNT,
  GATE_LINE_X,
  GATE_Z_POSITIONS,
  MAIN_QUEUE_STOP_X,
  MAIN_QUEUE_STOP_Z,
  SINGLE_QUEUE_STOP_X,
  SINGLE_QUEUE_STOP_Z,
  TRACK_X,
  VEHICLE_COUNT,
  VEHICLE_Z_CENTERS
} from './constants';
import {
  GameState,
  GateState,
  GroupData,
  InteractionTarget,
  KeybindsConfig,
  DEFAULT_KEYBINDS,
  NPCData,
  VehicleState
} from '../types';

export interface SceneCallbacks {
  onTargetChange: (target: InteractionTarget) => void;
  onSelectMainQueue: () => void;
  onSelectSingleQueue: () => void;
  onAssignToGate: (gateIndex: number) => void;
  onConfirmGrouping?: () => void;
  onTriggerDispatch: () => void;
  onDeselect: () => void;
  onTogglePause?: () => void;
  onSwitchKartBank?: (bank: 0 | 1) => void;
}

export interface TrainInstance {
  id: string;
  group: THREE.Group;
  vehicleMeshes: THREE.Group[];
  lapBarGroups: THREE.Group[];
  color: string;
}

export class RideStation3D {
  public container: HTMLElement;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private clock: THREE.Clock;
  private callbacks: SceneCallbacks;

  // Animation frame id
  private animationFrameId: number | null = null;

  // Lighting References
  private ambientLight: THREE.AmbientLight | null = null;
  private spotLights: THREE.SpotLight[] = [];
  private pointLights: THREE.PointLight[] = [];

  // Player & First-Person Controls with Platform Jump Physics
  public playerPos = new THREE.Vector3(0.5, 1.65, 2.5);
  private cameraEuler = new THREE.Euler(0, -Math.PI / 2, 0, 'YXZ'); // looking towards gates
  private playerVelocityY = 0;
  private isGrounded = true;
  private readonly JUMP_FORCE = 6.4;
  private readonly GRAVITY = -18.0;
  private readonly EYE_HEIGHT = 1.65;

  private moveForward = false;
  private moveBackward = false;
  private moveLeft = false;
  private moveRight = false;
  private isSprinting = false;
  public isPointerLocked = false;
  public mouseSensitivity = 0.0022;
  public isPaused = false;
  public isZenMode = true;
  public keybinds: KeybindsConfig = DEFAULT_KEYBINDS;

  // Raycasting & Interaction
  private raycaster = new THREE.Raycaster();
  private screenCenter = new THREE.Vector2(0, 0);
  private interactables: THREE.Object3D[] = [];
  public currentHoverTarget: InteractionTarget = { type: 'none', label: '', description: '' };

  // 3D Objects & Hierarchy
  private activeTrain: TrainInstance | null = null;
  private waitingTrainQueue: TrainInstance[] = [];
  private trainColorPalette: string[] = ['#0284c7', '#dc2626', '#059669', '#7c3aed', '#d97706', '#0891b2', '#e11d48'];
  private trainColorCounter = 0;
  private trainGroup = new THREE.Group();
  private vehicleMeshes: THREE.Group[] = [];
  private lapBarGroups: THREE.Group[] = [];
  private gateIndicators: {
    baseMesh: THREE.Mesh;
    lightMesh: THREE.Mesh;
    labelMesh: THREE.Sprite;
    gateBarrier: THREE.Group;
  }[] = [];
  private npcMeshes: Map<string, THREE.Group> = new Map();
  private dispatchButtonMesh: THREE.Mesh | null = null;
  private dispatchButtonBase: THREE.Group | null = null;
  private consoleScreenMesh: THREE.Mesh | null = null;
  private consoleCanvas: HTMLCanvasElement | null = null;
  private consoleTexture: THREE.CanvasTexture | null = null;

  // Gate Hover Ghost Highlights & Grouping Stage Visual Indicators
  private gateGhostHighlights: THREE.Mesh[] = [];
  private pendingGateAllocations: { [gateIndex: number]: number } = {};
  private selectedGateIndices: number[] = [];
  private lastMainQueue: GroupData[] = [];
  private lastSingleQueue: GroupData[] = [];

  // Queues 3D Visuals
  private mainQueueGroup = new THREE.Group();
  private singleQueueGroup = new THREE.Group();
  private mainStopLineMesh: THREE.Mesh | null = null;
  private singleStopLineMesh: THREE.Mesh | null = null;
  private mainQueueBadge: THREE.Sprite | null = null;
  private singleQueueBadge: THREE.Sprite | null = null;

  // State caches
  private currentGameState: GameState = 'LOAD_STATE';
  private selectedGroup: GroupData | null = null;
  private gatesState: GateState[] = [];
  private vehiclesState: VehicleState[] = [];
  private currentPatience = 100;
  private trainOffsetZ = 0; // for dispatch / reset train animation
  private trainSpeedZ = 0;
  private lapBarAngle = 0; // 0 = open, Math.PI / 2.2 = closed

  // Pathfinding Active Walkers
  private walkingNPCs: {
    npc: NPCData;
    mesh: THREE.Group;
    waypoints: THREE.Vector3[];
    currentSegment: number;
    segmentProgress: number;
    speed: number;
    onComplete?: () => void;
  }[] = [];

  // Particle launch sparks
  private launchParticles: THREE.Points | null = null;

  constructor(container: HTMLElement, callbacks: SceneCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.clock = new THREE.Clock();

    // 1. Scene setup - Clean, bright, airy modern station environment
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#253347');
    this.scene.fog = new THREE.FogExp2('#253347', 0.012);

    // 2. Camera setup
    const aspect = container.clientWidth / container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 100);
    this.camera.position.copy(this.playerPos);
    this.camera.rotation.copy(this.cameraEuler);

    // 3. Renderer setup - Enhanced brightness & exposure
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.75; // Bright, clear, beautiful lighting
    container.appendChild(this.renderer.domElement);

    // 4. Build Environment & 3D Components
    this.buildLighting();
    this.buildStationArchitecture();
    this.buildRollerCoasterTrack();
    this.buildCoasterTrain();
    this.buildGates();
    this.buildQueueLines();
    this.buildControlConsole();
    this.buildLaunchParticles();

    // 5. Attach Input Listeners
    this.setupEventListeners();

    // 6. Start Loop
    this.animate = this.animate.bind(this);
    this.animationFrameId = requestAnimationFrame(this.animate);
  }

  // --- Lighting ---
  private buildLighting() {
    // Ambient soft neutral-white fill for high clarity
    this.ambientLight = new THREE.AmbientLight('#e2e8f0', 2.2);
    this.scene.add(this.ambientLight);

    // Overhead hemisphere light for natural station sky/ground bounce illumination
    const hemiLight = new THREE.HemisphereLight('#f8fafc', '#64748b', 1.8);
    hemiLight.position.set(0, 8, 0);
    this.scene.add(hemiLight);

    // Primary Overhead Sunlight / Station Atrium Skylight
    const sunLight = new THREE.DirectionalLight('#ffffff', 2.8);
    sunLight.position.set(4, 9, 2);
    sunLight.target.position.set(0, 0, 0);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.bias = -0.0005;
    this.scene.add(sunLight);
    this.scene.add(sunLight.target);

    // Overhead industrial spotlights above boarding gates
    const spot1 = new THREE.SpotLight('#ffffff', 4.0, 28, Math.PI / 3.2, 0.4, 1.0);
    spot1.position.set(0.5, 6.5, 3.0);
    spot1.target.position.set(-1.2, 0, 3.0);
    spot1.castShadow = true;
    spot1.shadow.mapSize.width = 1024;
    spot1.shadow.mapSize.height = 1024;
    this.scene.add(spot1);
    this.scene.add(spot1.target);
    this.spotLights.push(spot1);

    const spot2 = new THREE.SpotLight('#ffffff', 4.0, 28, Math.PI / 3.2, 0.4, 1.0);
    spot2.position.set(0.5, 6.5, -3.0);
    spot2.target.position.set(-1.2, 0, -3.0);
    spot2.castShadow = true;
    spot2.shadow.mapSize.width = 1024;
    spot2.shadow.mapSize.height = 1024;
    this.scene.add(spot2);
    this.scene.add(spot2.target);
    this.spotLights.push(spot2);

    // Central Platform Overhead Floodlight
    const centerSpot = new THREE.SpotLight('#f8fafc', 3.2, 24, Math.PI / 2.8, 0.5, 1.2);
    centerSpot.position.set(1.5, 6.0, 0);
    centerSpot.target.position.set(0, 0, 0);
    this.scene.add(centerSpot);
    this.scene.add(centerSpot.target);
    this.spotLights.push(centerSpot);

    // Queue Warm Amber Pendant Illumination (makes guests pop)
    const queueLight = new THREE.PointLight('#fbbf24', 3.8, 18);
    queueLight.position.set(3.5, 3.5, 1.5);
    this.scene.add(queueLight);
    this.pointLights.push(queueLight);

    const queueLight2 = new THREE.PointLight('#38bdf8', 3.5, 18);
    queueLight2.position.set(3.5, 3.5, -2.0);
    this.scene.add(queueLight2);
    this.pointLights.push(queueLight2);

    // Track Brilliant Underglow & Safety Lights
    const trackLight = new THREE.PointLight('#0284c7', 4.2, 20);
    trackLight.position.set(TRACK_X, 0.6, 0);
    this.scene.add(trackLight);
    this.pointLights.push(trackLight);

    // Wall Sconces & Platform Linear Accent Fixtures
    const backWallLight = new THREE.PointLight('#ffffff', 2.8, 14);
    backWallLight.position.set(5.2, 4.0, 0);
    this.scene.add(backWallLight);
    this.pointLights.push(backWallLight);

    // Dispatch Station Beacon Light
    const consoleLight = new THREE.PointLight('#10b981', 3.0, 12);
    consoleLight.position.set(CONSOLE_POS.x, CONSOLE_POS.y + 2.0, CONSOLE_POS.z);
    this.scene.add(consoleLight);
    this.pointLights.push(consoleLight);
  }

  // --- Station Architecture ---
  private buildStationArchitecture() {
    // Station Floor (Polished Slate steel platform with high visibility)
    const floorGeo = new THREE.PlaneGeometry(16, 22);
    const floorMat = new THREE.MeshStandardMaterial({
      color: '#334155',
      roughness: 0.35,
      metalness: 0.5,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0.5, 0, 0);
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Yellow/Black Hazard Strip along track edge
    const hazardGeo = new THREE.PlaneGeometry(0.35, 18);
    const hazardMat = new THREE.MeshBasicMaterial({
      color: '#fbbf24',
    });
    const hazardStrip = new THREE.Mesh(hazardGeo, hazardMat);
    hazardStrip.rotation.x = -Math.PI / 2;
    hazardStrip.position.set(-2.0, 0.005, 0);
    this.scene.add(hazardStrip);

    // Back Wall (Behind Queue at X = 6.5) - Lighter Slate Panel Architecture
    const backWallGeo = new THREE.BoxGeometry(0.5, 7, 22);
    const wallMat = new THREE.MeshStandardMaterial({
      color: '#475569',
      roughness: 0.6,
      metalness: 0.3,
    });
    const backWall = new THREE.Mesh(backWallGeo, wallMat);
    backWall.position.set(6.0, 3.5, 0);
    this.scene.add(backWall);

    // Outer Track Wall at X = -6.5
    const trackWall = new THREE.Mesh(backWallGeo, wallMat);
    trackWall.position.set(-6.5, 3.5, 0);
    this.scene.add(trackWall);

    // North & South Station Portal Walls (Built with 3.2m open tunnel archways at TRACK_X = -3.5)
    const portalMat = new THREE.MeshStandardMaterial({
      color: '#334155',
      roughness: 0.5,
      metalness: 0.5,
    });
    const portalRimMat = new THREE.MeshStandardMaterial({
      color: '#0284c7',
      emissive: '#38bdf8',
      emissiveIntensity: 1.2,
      roughness: 0.2,
    });

    [-10.5, 10.5].forEach((endZ) => {
      // Platform Side Wall Slab (X = -1.9 to 6.0)
      const platWallGeo = new THREE.BoxGeometry(8.0, 7.0, 0.5);
      const platWall = new THREE.Mesh(platWallGeo, wallMat);
      platWall.position.set(2.0, 3.5, endZ);
      this.scene.add(platWall);

      // Outer Maintenance Side Wall Slab (X = -6.5 to -5.1)
      const outerWallGeo = new THREE.BoxGeometry(1.5, 7.0, 0.5);
      const outerWall = new THREE.Mesh(outerWallGeo, wallMat);
      outerWall.position.set(-5.75, 3.5, endZ);
      this.scene.add(outerWall);

      // Tunnel Header Beam overhead (Y = 3.6 to 7.0)
      const headerGeo = new THREE.BoxGeometry(3.3, 3.4, 0.5);
      const headerWall = new THREE.Mesh(headerGeo, portalMat);
      headerWall.position.set(TRACK_X, 5.3, endZ);
      this.scene.add(headerWall);

      // Glowing Neon Tunnel Portal Arch Ring around the train opening
      const archTopGeo = new THREE.BoxGeometry(3.3, 0.2, 0.65);
      const archTop = new THREE.Mesh(archTopGeo, portalRimMat);
      archTop.position.set(TRACK_X, 3.6, endZ);
      this.scene.add(archTop);

      const archSideGeo = new THREE.BoxGeometry(0.2, 3.6, 0.65);
      const archLeft = new THREE.Mesh(archSideGeo, portalRimMat);
      archLeft.position.set(TRACK_X - 1.6, 1.8, endZ);
      this.scene.add(archLeft);

      const archRight = new THREE.Mesh(archSideGeo, portalRimMat);
      archRight.position.set(TRACK_X + 1.6, 1.8, endZ);
      this.scene.add(archRight);
    });

    // Steel Box Trusses overhead with Integrated Linear Light Fixtures
    const trussMat = new THREE.MeshStandardMaterial({ color: '#64748b', metalness: 0.8, roughness: 0.3 });
    const fixtureMat = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      emissive: '#f8fafc',
      emissiveIntensity: 2.0,
      roughness: 0.1,
    });

    for (let z = -8; z <= 8; z += 4) {
      const beamGeo = new THREE.BoxGeometry(12, 0.3, 0.3);
      const beam = new THREE.Mesh(beamGeo, trussMat);
      beam.position.set(0, 5.8, z);
      this.scene.add(beam);

      // Linear LED Light Bar under each beam
      const lightBarGeo = new THREE.BoxGeometry(10, 0.08, 0.12);
      const lightBar = new THREE.Mesh(lightBarGeo, fixtureMat);
      lightBar.position.set(0, 5.62, z);
      this.scene.add(lightBar);
    }

    // Overhead Banner "MARIO KART • STATION PLATFORM 01"
    const bannerCanvas = document.createElement('canvas');
    bannerCanvas.width = 1024;
    bannerCanvas.height = 128;
    const ctx = bannerCanvas.getContext('2d')!;
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(0, 0, 1024, 128);
    // Gold Checkered Border
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, 1016, 120);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 44px "Chakra Petch", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🏁 MARIO KART • GROUPER STATION PLATFORM 🏁', 512, 64);

    const bannerTex = new THREE.CanvasTexture(bannerCanvas);
    const bannerMat = new THREE.MeshBasicMaterial({ map: bannerTex });
    const bannerGeo = new THREE.PlaneGeometry(9, 1.1);
    const bannerMesh = new THREE.Mesh(bannerGeo, bannerMat);
    bannerMesh.position.set(0, 4.8, 9.8);
    bannerMesh.rotation.y = Math.PI;
    this.scene.add(bannerMesh);
  }

  // --- Roller Coaster Track ---
  private buildRollerCoasterTrack() {
    const trackGroup = new THREE.Group();

    // Two steel tubular rails running down X = -3.5 spanning station, staging queue, and launch run
    const railMat = new THREE.MeshStandardMaterial({ color: '#0284c7', metalness: 0.9, roughness: 0.2 });
    const trackLength = 160;
    const trackCenterZ = 0;
    const railGeo = new THREE.CylinderGeometry(0.06, 0.06, trackLength, 16);

    const leftRail = new THREE.Mesh(railGeo, railMat);
    leftRail.position.set(TRACK_X - 0.5, 0.35, trackCenterZ);
    leftRail.rotation.x = Math.PI / 2;
    trackGroup.add(leftRail);

    const rightRail = new THREE.Mesh(railGeo, railMat);
    rightRail.position.set(TRACK_X + 0.5, 0.35, trackCenterZ);
    rightRail.rotation.x = Math.PI / 2;
    trackGroup.add(rightRail);

    // Center Spine Pipe
    const spineGeo = new THREE.CylinderGeometry(0.12, 0.12, trackLength, 16);
    const spine = new THREE.Mesh(spineGeo, railMat);
    spine.position.set(TRACK_X, 0.15, trackCenterZ);
    spine.rotation.x = Math.PI / 2;
    trackGroup.add(spine);

    // Cross ties & magnetic launch stators (LSM magnets)
    const tieMat = new THREE.MeshStandardMaterial({ color: '#334155', metalness: 0.8, roughness: 0.4 });
    const statorMat = new THREE.MeshStandardMaterial({ color: '#e11d48', metalness: 0.6, roughness: 0.3, emissive: '#881337', emissiveIntensity: 0.4 });

    for (let z = -75; z <= 75; z += 0.8) {
      const tieGeo = new THREE.BoxGeometry(1.3, 0.05, 0.1);
      const tie = new THREE.Mesh(tieGeo, tieMat);
      tie.position.set(TRACK_X, 0.32, z);
      trackGroup.add(tie);

      // Launch stator block in the middle
      const statorGeo = new THREE.BoxGeometry(0.35, 0.12, 0.4);
      const stator = new THREE.Mesh(statorGeo, statorMat);
      stator.position.set(TRACK_X, 0.28, z);
      trackGroup.add(stator);
    }

    this.scene.add(trackGroup);
  }

  // --- Procedural 4-Car Coaster Train Builder ---
  private createTrainInstance(colorHex: string, initialZ: number): TrainInstance {
    const group = new THREE.Group();
    group.position.set(0, 0, initialZ);

    const vehicleMeshes: THREE.Group[] = [];
    const lapBarGroups: THREE.Group[] = [];

    const carBodyMat = new THREE.MeshStandardMaterial({
      color: colorHex,
      metalness: 0.75,
      roughness: 0.2,
    });
    const carAccentMat = new THREE.MeshStandardMaterial({
      color: '#1e293b',
      metalness: 0.85,
      roughness: 0.25,
    });
    const seatMat = new THREE.MeshStandardMaterial({
      color: '#334155',
      roughness: 0.5,
    });
    const chromeMat = new THREE.MeshStandardMaterial({
      color: '#f8fafc',
      metalness: 0.95,
      roughness: 0.1,
    });
    const wheelMat = new THREE.MeshStandardMaterial({
      color: '#0f172a',
      metalness: 0.9,
      roughness: 0.3,
    });
    const couplerMat = new THREE.MeshStandardMaterial({
      color: '#475569',
      metalness: 0.9,
      roughness: 0.25,
    });
    const headlightMat = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      emissive: '#e0f2fe',
      emissiveIntensity: 2.5,
      roughness: 0.1,
    });

    for (let v = 0; v < VEHICLE_COUNT; v++) {
      const zCenter = VEHICLE_Z_CENTERS[v];
      const vehicle = new THREE.Group();
      vehicle.position.set(TRACK_X, 0.42, zCenter);

      // Vehicle Chassis
      const chassisGeo = new THREE.BoxGeometry(1.6, 0.35, 2.5);
      const chassis = new THREE.Mesh(chassisGeo, carBodyMat);
      chassis.position.set(0, 0.18, 0);
      chassis.castShadow = true;
      chassis.receiveShadow = true;
      vehicle.add(chassis);

      // Front nose cone & dual headlights if vehicle 0
      if (v === 0) {
        const noseGeo = new THREE.ConeGeometry(0.7, 0.9, 4);
        const nose = new THREE.Mesh(noseGeo, carBodyMat);
        nose.rotation.x = -Math.PI / 2;
        nose.rotation.y = Math.PI / 4;
        nose.position.set(0, 0.22, 1.4);
        vehicle.add(nose);

        // High-beam LED Headlights
        const hlGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.05, 16);
        const hlLeft = new THREE.Mesh(hlGeo, headlightMat);
        hlLeft.rotation.x = Math.PI / 2;
        hlLeft.position.set(-0.35, 0.28, 1.55);
        vehicle.add(hlLeft);

        const hlRight = new THREE.Mesh(hlGeo, headlightMat);
        hlRight.rotation.x = Math.PI / 2;
        hlRight.position.set(0.35, 0.28, 1.55);
        vehicle.add(hlRight);
      }

      // Side rail guards with cyan running light trim
      const railLeftGeo = new THREE.BoxGeometry(0.08, 0.2, 2.4);
      const railLeft = new THREE.Mesh(railLeftGeo, carAccentMat);
      railLeft.position.set(-0.8, 0.4, 0);
      vehicle.add(railLeft);

      const railRight = new THREE.Mesh(railLeftGeo, carAccentMat);
      railRight.position.set(0.8, 0.4, 0);
      vehicle.add(railRight);

      // Wheel Bogie Assemblies (Front & Rear running wheels on track rails)
      const wheelGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.06, 16);
      [-0.85, 0.85].forEach(bogieZ => {
        const wLeft = new THREE.Mesh(wheelGeo, wheelMat);
        wLeft.rotation.z = Math.PI / 2;
        wLeft.position.set(-0.5, -0.05, bogieZ);
        vehicle.add(wLeft);

        const wRight = new THREE.Mesh(wheelGeo, wheelMat);
        wRight.rotation.z = Math.PI / 2;
        wRight.position.set(0.5, -0.05, bogieZ);
        vehicle.add(wRight);

        const axleGeo = new THREE.CylinderGeometry(0.03, 0.03, 1.1, 8);
        const axle = new THREE.Mesh(axleGeo, couplerMat);
        axle.rotation.z = Math.PI / 2;
        axle.position.set(0, -0.05, bogieZ);
        vehicle.add(axle);
      });

      // 4 Seats in 2 rows
      const rowZOffsets = [0.65, -0.65];
      const seatXOffsets = [-0.4, 0.4];

      const lapBarVehicleGroup = new THREE.Group();
      lapBarVehicleGroup.position.set(0, 0.45, 0);

      rowZOffsets.forEach((rowZ) => {
        seatXOffsets.forEach(seatX => {
          const seatBaseGeo = new THREE.BoxGeometry(0.48, 0.18, 0.48);
          const seatBase = new THREE.Mesh(seatBaseGeo, seatMat);
          seatBase.position.set(seatX, 0.38, rowZ);
          vehicle.add(seatBase);

          const seatBackGeo = new THREE.BoxGeometry(0.46, 0.55, 0.12);
          const seatBack = new THREE.Mesh(seatBackGeo, seatMat);
          seatBack.position.set(seatX, 0.65, rowZ - 0.22);
          vehicle.add(seatBack);
        });

        // Individual Lap Bar for this row
        const rowLapBar = new THREE.Group();
        rowLapBar.position.set(0, 0.25, rowZ - 0.2);

        const barGeo = new THREE.TorusGeometry(0.55, 0.04, 8, 16, Math.PI);
        const bar = new THREE.Mesh(barGeo, chromeMat);
        bar.rotation.x = Math.PI / 2;
        bar.position.set(0, 0.25, 0.25);
        rowLapBar.add(bar);

        const padGeo = new THREE.CylinderGeometry(0.08, 0.08, 1.1, 12);
        const padMat = new THREE.MeshStandardMaterial({ color: '#f59e0b', roughness: 0.7 });
        const pad = new THREE.Mesh(padGeo, padMat);
        pad.rotation.z = Math.PI / 2;
        pad.position.set(0, 0.25, 0.45);
        rowLapBar.add(pad);

        lapBarVehicleGroup.add(rowLapBar);
      });

      vehicle.add(lapBarVehicleGroup);
      lapBarGroups.push(lapBarVehicleGroup);
      vehicleMeshes.push(vehicle);
      group.add(vehicle);
    }

    // Connect all 4 cars together with Articulated Coupling Hitches & Pneumatic Air Lines
    for (let v = 0; v < VEHICLE_COUNT - 1; v++) {
      const z1 = VEHICLE_Z_CENTERS[v] - 1.25;
      const z2 = VEHICLE_Z_CENTERS[v + 1] + 1.25;
      const midZ = (z1 + z2) / 2;
      const gapLength = Math.abs(z1 - z2);

      const couplingGroup = new THREE.Group();
      couplingGroup.position.set(TRACK_X, 0.42, midZ);

      const drawbarGeo = new THREE.BoxGeometry(0.22, 0.12, gapLength + 0.3);
      const drawbar = new THREE.Mesh(drawbarGeo, couplerMat);
      drawbar.position.set(0, 0.15, 0);
      couplingGroup.add(drawbar);

      const pinGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.28, 12);
      const pin1 = new THREE.Mesh(pinGeo, chromeMat);
      pin1.position.set(0, 0.15, 0.25);
      couplingGroup.add(pin1);

      const pin2 = new THREE.Mesh(pinGeo, chromeMat);
      pin2.position.set(0, 0.15, -0.25);
      couplingGroup.add(pin2);

      const hoseGeo = new THREE.CylinderGeometry(0.02, 0.02, gapLength + 0.2, 8);
      const hoseLeft = new THREE.Mesh(hoseGeo, wheelMat);
      hoseLeft.rotation.x = Math.PI / 2;
      hoseLeft.position.set(-0.35, 0.18, 0);
      couplingGroup.add(hoseLeft);

      const hoseRight = new THREE.Mesh(hoseGeo, wheelMat);
      hoseRight.rotation.x = Math.PI / 2;
      hoseRight.position.set(0.35, 0.18, 0);
      couplingGroup.add(hoseRight);

      group.add(couplingGroup);
    }

    this.scene.add(group);

    return {
      id: `train_${Date.now()}_${Math.random()}`,
      group,
      vehicleMeshes,
      lapBarGroups,
      color: colorHex,
    };
  }

  // --- Initialize Station Train & Waiting Queue of Trains ---
  private buildCoasterTrain() {
    // 1. Create active station loading train at Z = 0
    this.activeTrain = this.createTrainInstance(this.trainColorPalette[0], 0);
    this.trainGroup = this.activeTrain.group;
    this.vehicleMeshes = this.activeTrain.vehicleMeshes;
    this.lapBarGroups = this.activeTrain.lapBarGroups;
    this.trainColorCounter = 1;

    // 2. Create visible queue of trains waiting behind the station on staging track
    this.waitingTrainQueue = [
      this.createTrainInstance(this.trainColorPalette[1], -17),
      this.createTrainInstance(this.trainColorPalette[2], -34),
      this.createTrainInstance(this.trainColorPalette[3], -51),
    ];
  }

  // --- 8 Loading Gates & LED Floor Pads ---
  private buildGates() {
    this.gateIndicators = [];
    this.gateGhostHighlights = [];

    const padGeo = new THREE.PlaneGeometry(1.1, 1.2);
    const frameGeo = new THREE.BoxGeometry(1.2, 0.04, 1.3);
    const frameMat = new THREE.MeshStandardMaterial({ color: '#334155', metalness: 0.8, roughness: 0.3 });

    for (let i = 0; i < GATE_COUNT; i++) {
      const zPos = GATE_Z_POSITIONS[i];
      const gateGroup = new THREE.Group();
      gateGroup.position.set(GATE_LINE_X, 0, zPos);

      // Metal border frame
      const frame = new THREE.Mesh(frameGeo, frameMat);
      frame.position.set(0, 0.02, 0);
      frame.receiveShadow = true;
      gateGroup.add(frame);

      // LED Floor Light (starts Red for 0/2)
      const ledMat = new THREE.MeshStandardMaterial({
        color: '#ef4444',
        emissive: '#dc2626',
        emissiveIntensity: 0.9,
        roughness: 0.3,
      });
      const ledPad = new THREE.Mesh(padGeo, ledMat);
      ledPad.rotation.x = -Math.PI / 2;
      ledPad.position.set(0, 0.045, 0);
      ledPad.name = `gate_${i}`;
      gateGroup.add(ledPad);

      // Register for raycasting
      this.interactables.push(ledPad);

      // Ghost highlight mesh for hover preview (starts invisible)
      const ghostGeo = new THREE.PlaneGeometry(1.15, 1.25);
      const ghostMat = new THREE.MeshBasicMaterial({
        color: '#38bdf8',
        transparent: true,
        opacity: 0.0,
        side: THREE.DoubleSide,
      });
      const ghostMesh = new THREE.Mesh(ghostGeo, ghostMat);
      ghostMesh.rotation.x = -Math.PI / 2;
      ghostMesh.position.set(0, 0.055, 0);
      gateGroup.add(ghostMesh);
      this.gateGhostHighlights.push(ghostMesh);

      // Yellow Pneumatic Gate Barrier Rails (swing open on dispatch)
      const barrierGroup = new THREE.Group();
      barrierGroup.position.set(-0.6, 0, 0);

      const postGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.1, 12);
      const postMat = new THREE.MeshStandardMaterial({ color: '#eab308', metalness: 0.6, roughness: 0.3 });
      const post1 = new THREE.Mesh(postGeo, postMat);
      post1.position.set(0, 0.55, 0.55);
      barrierGroup.add(post1);

      const post2 = new THREE.Mesh(postGeo, postMat);
      post2.position.set(0, 0.55, -0.55);
      barrierGroup.add(post2);

      const bar1Geo = new THREE.CylinderGeometry(0.025, 0.025, 1.1, 12);
      const barTop = new THREE.Mesh(bar1Geo, postMat);
      barTop.rotation.x = Math.PI / 2;
      barTop.position.set(0, 0.95, 0);
      barrierGroup.add(barTop);

      const barMid = new THREE.Mesh(bar1Geo, postMat);
      barMid.rotation.x = Math.PI / 2;
      barMid.position.set(0, 0.45, 0);
      barrierGroup.add(barMid);

      gateGroup.add(barrierGroup);

      // Overhead Gate Sign with 3D Canvas Texture
      const gateSignCanvas = document.createElement('canvas');
      gateSignCanvas.width = 256;
      gateSignCanvas.height = 128;
      const gCtx = gateSignCanvas.getContext('2d')!;
      gCtx.fillStyle = '#0f172a';
      gCtx.fillRect(0, 0, 256, 128);
      gCtx.strokeStyle = '#ef4444';
      gCtx.lineWidth = 8;
      gCtx.strokeRect(4, 4, 248, 120);
      gCtx.fillStyle = '#ffffff';
      gCtx.font = 'bold 50px "Chakra Petch", sans-serif';
      gCtx.textAlign = 'center';
      gCtx.textBaseline = 'middle';
      gCtx.fillText(`GATE 0${i + 1}`, 128, 48);
      gCtx.fillStyle = '#ef4444';
      gCtx.font = 'bold 32px "JetBrains Mono", monospace';
      gCtx.fillText(`0 / 2`, 128, 92);

      const signTexture = new THREE.CanvasTexture(gateSignCanvas);
      const spriteMat = new THREE.SpriteMaterial({ map: signTexture });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.position.set(-0.8, 2.2, 0);
      sprite.scale.set(1.4, 0.7, 1);
      gateGroup.add(sprite);

      this.gateIndicators.push({
        baseMesh: frame,
        lightMesh: ledPad,
        labelMesh: sprite,
        gateBarrier: barrierGroup,
      });

      this.scene.add(gateGroup);
    }
  }

  // --- Queue Stanchions & Stop Lines ---
  private buildQueueLines() {
    // 1. Main Queue (Group Queue)
    const stanchionMat = new THREE.MeshStandardMaterial({ color: '#475569', metalness: 0.9, roughness: 0.2 });
    const beltMat = new THREE.MeshStandardMaterial({ color: '#ef4444', roughness: 0.5 });

    // Main Queue Railings
    for (let z = MAIN_QUEUE_STOP_Z; z <= MAIN_QUEUE_STOP_Z + 6; z += 1.5) {
      const poleGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.0, 12);
      const pole = new THREE.Mesh(poleGeo, stanchionMat);
      pole.position.set(MAIN_QUEUE_STOP_X + 0.8, 0.5, z);
      this.mainQueueGroup.add(pole);

      const pole2 = new THREE.Mesh(poleGeo, stanchionMat);
      pole2.position.set(MAIN_QUEUE_STOP_X - 0.8, 0.5, z);
      this.mainQueueGroup.add(pole2);
    }

    // Main Queue Stop Line at X = 2.8, Z = 2.0
    const stopGeo = new THREE.PlaneGeometry(1.6, 0.6);
    const stopMat = new THREE.MeshStandardMaterial({
      color: '#3b82f6',
      emissive: '#1d4ed8',
      emissiveIntensity: 0.7,
    });
    this.mainStopLineMesh = new THREE.Mesh(stopGeo, stopMat);
    this.mainStopLineMesh.rotation.x = -Math.PI / 2;
    this.mainStopLineMesh.position.set(MAIN_QUEUE_STOP_X, 0.03, MAIN_QUEUE_STOP_Z);
    this.mainStopLineMesh.name = 'main_queue_stop';
    this.mainQueueGroup.add(this.mainStopLineMesh);
    this.interactables.push(this.mainStopLineMesh);

    // Volumetric large invisible hitbox for Main Queue selection (covers guests, line, and sign)
    const mainHitboxGeo = new THREE.BoxGeometry(2.4, 2.8, 6.0);
    const invisibleMat = new THREE.MeshBasicMaterial({ visible: false });
    const mainHitbox = new THREE.Mesh(mainHitboxGeo, invisibleMat);
    mainHitbox.position.set(MAIN_QUEUE_STOP_X, 1.4, MAIN_QUEUE_STOP_Z + 2.0);
    mainHitbox.name = 'main_queue_stop';
    this.mainQueueGroup.add(mainHitbox);
    this.interactables.push(mainHitbox);

    // Overhead Holographic Badge for Main Queue
    const mainBadgeCanvas = document.createElement('canvas');
    mainBadgeCanvas.width = 512;
    mainBadgeCanvas.height = 180;
    const mbCtx = mainBadgeCanvas.getContext('2d')!;
    mbCtx.fillStyle = 'rgba(15, 23, 42, 0.92)';
    mbCtx.roundRect(10, 10, 492, 160, 20);
    mbCtx.fill();
    mbCtx.strokeStyle = '#ef4444';
    mbCtx.lineWidth = 8;
    mbCtx.stroke();
    mbCtx.fillStyle = '#f87171';
    mbCtx.font = 'bold 36px "Chakra Petch", sans-serif';
    mbCtx.textAlign = 'center';
    mbCtx.fillText('MARIO KART MAIN LINE', 256, 60);
    mbCtx.fillStyle = '#ffffff';
    mbCtx.font = 'bold 44px "JetBrains Mono", monospace';
    mbCtx.fillText('GROUP OF 4', 256, 125);

    const mainBadgeTex = new THREE.CanvasTexture(mainBadgeCanvas);
    this.mainQueueBadge = new THREE.Sprite(new THREE.SpriteMaterial({ map: mainBadgeTex }));
    this.mainQueueBadge.position.set(MAIN_QUEUE_STOP_X, 2.5, MAIN_QUEUE_STOP_Z);
    this.mainQueueBadge.scale.set(2.4, 0.85, 1);
    this.mainQueueGroup.add(this.mainQueueBadge);
    this.scene.add(this.mainQueueGroup);

    // 2. Single Rider Queue at Z = -2.0
    for (let z = SINGLE_QUEUE_STOP_Z; z >= SINGLE_QUEUE_STOP_Z - 6; z -= 1.5) {
      const poleGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.0, 12);
      const pole = new THREE.Mesh(poleGeo, stanchionMat);
      pole.position.set(SINGLE_QUEUE_STOP_X + 0.6, 0.5, z);
      this.singleQueueGroup.add(pole);

      const pole2 = new THREE.Mesh(poleGeo, stanchionMat);
      pole2.position.set(SINGLE_QUEUE_STOP_X - 0.6, 0.5, z);
      this.singleQueueGroup.add(pole2);
    }

    // Single Rider Stop Line
    const singleStopGeo = new THREE.PlaneGeometry(1.2, 0.6);
    const singleStopMat = new THREE.MeshStandardMaterial({
      color: '#06b6d4',
      emissive: '#0891b2',
      emissiveIntensity: 0.7,
    });
    this.singleStopLineMesh = new THREE.Mesh(singleStopGeo, singleStopMat);
    this.singleStopLineMesh.rotation.x = -Math.PI / 2;
    this.singleStopLineMesh.position.set(SINGLE_QUEUE_STOP_X, 0.03, SINGLE_QUEUE_STOP_Z);
    this.singleStopLineMesh.name = 'single_queue_stop';
    this.singleQueueGroup.add(this.singleStopLineMesh);
    this.interactables.push(this.singleStopLineMesh);

    // Volumetric large invisible hitbox for Single Queue selection
    const singleHitboxGeo = new THREE.BoxGeometry(2.2, 2.8, 6.0);
    const singleHitbox = new THREE.Mesh(singleHitboxGeo, invisibleMat);
    singleHitbox.position.set(SINGLE_QUEUE_STOP_X, 1.4, SINGLE_QUEUE_STOP_Z - 2.0);
    singleHitbox.name = 'single_queue_stop';
    this.singleQueueGroup.add(singleHitbox);
    this.interactables.push(singleHitbox);

    // Overhead Single Rider Badge
    const singleBadgeCanvas = document.createElement('canvas');
    singleBadgeCanvas.width = 512;
    singleBadgeCanvas.height = 180;
    const sbCtx = singleBadgeCanvas.getContext('2d')!;
    sbCtx.fillStyle = 'rgba(15, 23, 42, 0.92)';
    sbCtx.roundRect(10, 10, 492, 160, 20);
    sbCtx.fill();
    sbCtx.strokeStyle = '#06b6d4';
    sbCtx.lineWidth = 8;
    sbCtx.stroke();
    sbCtx.fillStyle = '#22d3ee';
    sbCtx.font = 'bold 36px "Chakra Petch", sans-serif';
    sbCtx.textAlign = 'center';
    sbCtx.fillText('MARIO KART SINGLE RIDER', 256, 60);
    sbCtx.fillStyle = '#ffffff';
    sbCtx.font = 'bold 44px "JetBrains Mono", monospace';
    sbCtx.fillText('SOLO GUEST (1)', 256, 125);

    const singleBadgeTex = new THREE.CanvasTexture(singleBadgeCanvas);
    this.singleQueueBadge = new THREE.Sprite(new THREE.SpriteMaterial({ map: singleBadgeTex }));
    this.singleQueueBadge.position.set(SINGLE_QUEUE_STOP_X, 2.5, SINGLE_QUEUE_STOP_Z);
    this.singleQueueBadge.scale.set(2.4, 0.85, 1);
    this.singleQueueGroup.add(this.singleQueueBadge);
    this.scene.add(this.singleQueueGroup);
  }

  // --- Control Console Podium ---
  private buildControlConsole() {
    this.dispatchButtonBase = new THREE.Group();
    this.dispatchButtonBase.position.set(CONSOLE_POS.x, CONSOLE_POS.y, CONSOLE_POS.z);

    // Podium Pedestal
    const podiumGeo = new THREE.BoxGeometry(1.3, 1.1, 0.9);
    const podiumMat = new THREE.MeshStandardMaterial({ color: '#1e293b', metalness: 0.8, roughness: 0.3 });
    const podium = new THREE.Mesh(podiumGeo, podiumMat);
    podium.position.set(0, 0.55, 0);
    podium.castShadow = true;
    this.dispatchButtonBase.add(podium);

    // Angled Top Surface
    const topGeo = new THREE.BoxGeometry(1.2, 0.1, 0.8);
    const top = new THREE.Mesh(topGeo, podiumMat);
    top.position.set(0, 1.12, 0);
    top.rotation.x = -Math.PI / 8;
    this.dispatchButtonBase.add(top);

    // Big 3D Red Dispatch Button with Yellow Hazard Bezel
    const buttonBezelGeo = new THREE.CylinderGeometry(0.18, 0.2, 0.08, 24);
    const bezelMat = new THREE.MeshStandardMaterial({ color: '#eab308', metalness: 0.7, roughness: 0.3 });
    const bezel = new THREE.Mesh(buttonBezelGeo, bezelMat);
    bezel.position.set(0.32, 1.18, 0.05);
    bezel.rotation.x = -Math.PI / 8;
    this.dispatchButtonBase.add(bezel);

    const buttonGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.08, 24);
    const buttonMat = new THREE.MeshStandardMaterial({
      color: '#ef4444',
      emissive: '#dc2626',
      emissiveIntensity: 0.6,
      roughness: 0.2,
    });
    this.dispatchButtonMesh = new THREE.Mesh(buttonGeo, buttonMat);
    this.dispatchButtonMesh.position.set(0.32, 1.22, 0.05);
    this.dispatchButtonMesh.rotation.x = -Math.PI / 8;
    this.dispatchButtonMesh.name = 'dispatch_button';
    this.dispatchButtonBase.add(this.dispatchButtonMesh);
    this.interactables.push(this.dispatchButtonMesh);

    // Diegetic CRT Monitor on Left side of Podium
    this.consoleCanvas = document.createElement('canvas');
    this.consoleCanvas.width = 512;
    this.consoleCanvas.height = 384;
    this.consoleTexture = new THREE.CanvasTexture(this.consoleCanvas);

    const screenGeo = new THREE.PlaneGeometry(0.48, 0.36);
    const screenMat = new THREE.MeshBasicMaterial({ map: this.consoleTexture });
    this.consoleScreenMesh = new THREE.Mesh(screenGeo, screenMat);
    this.consoleScreenMesh.position.set(-0.25, 1.22, 0.02);
    this.consoleScreenMesh.rotation.x = -Math.PI / 8;
    this.dispatchButtonBase.add(this.consoleScreenMesh);

    this.scene.add(this.dispatchButtonBase);
    this.updateConsoleScreen();
  }

  // --- Launch Particle Effects ---
  private buildLaunchParticles() {
    const particleCount = 180;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);

    const c1 = new THREE.Color('#38bdf8');
    const c2 = new THREE.Color('#f59e0b');

    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = TRACK_X + (Math.random() - 0.5) * 1.5;
      positions[i * 3 + 1] = 0.3 + Math.random() * 1.2;
      positions[i * 3 + 2] = 2.0 + Math.random() * 25.0;

      const c = Math.random() > 0.5 ? c1 : c2;
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.08,
      vertexColors: true,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
    });

    this.launchParticles = new THREE.Points(geometry, material);
    this.scene.add(this.launchParticles);
  }

  // --- Update Diegetic Console CRT Screen ---
  public updateConsoleScreen() {
    if (!this.consoleCanvas || !this.consoleTexture) return;
    const ctx = this.consoleCanvas.getContext('2d')!;
    const totalFilled = this.gatesState.reduce((acc, g) => acc + (g.occupants?.length || 0), 0);
    const efficiency = Math.round((totalFilled / 16) * 100);

    // Background
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, 512, 384);

    // CRT Scanlines
    ctx.fillStyle = 'rgba(0, 255, 255, 0.03)';
    for (let y = 0; y < 384; y += 4) {
      ctx.fillRect(0, y, 512, 2);
    }

    // Border
    ctx.strokeStyle = this.currentGameState === 'READY_STATE' ? '#10b981' : '#38bdf8';
    ctx.lineWidth = 6;
    ctx.strokeRect(6, 6, 500, 372);

    // Header
    ctx.fillStyle = '#facc15';
    ctx.font = 'bold 26px "Chakra Petch", sans-serif';
    ctx.fillText('🏎️ MARIO KART • GROUPER DESK', 24, 40);

    // State Banner
    let stateText = 'SYSTEM: LOADING';
    let stateColor = '#38bdf8';
    if (this.currentGameState === 'READY_STATE') {
      stateText = 'TRAIN ARMED • READY';
      stateColor = '#10b981';
    } else if (this.currentGameState === 'DISPATCH_STATE') {
      stateText = 'DISPATCH IN PROGRESS';
      stateColor = '#f59e0b';
    } else if (this.currentGameState === 'RESET_STATE') {
      stateText = 'ADVANCING NEXT TRAIN';
      stateColor = '#a855f7';
    }
    ctx.fillStyle = stateColor;
    ctx.font = 'bold 22px "JetBrains Mono", monospace';
    ctx.fillText(stateText, 24, 75);

    // Train Fill Bar
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(24, 95, 464, 30);
    const barWidth = (totalFilled / 16) * 464;
    ctx.fillStyle = totalFilled === 16 ? '#10b981' : totalFilled > 8 ? '#f59e0b' : '#38bdf8';
    ctx.fillRect(24, 95, barWidth, 30);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px "JetBrains Mono", monospace';
    ctx.fillText(`SEATS: ${totalFilled} / 16 (${efficiency}%)`, 34, 117);

    // Patience Meter / Zen Mode Display
    ctx.fillStyle = '#94a3b8';
    ctx.font = '18px "Chakra Petch", sans-serif';

    if (this.isZenMode) {
      ctx.fillText('GUEST PATIENCE: [ZEN MODE ∞]', 24, 160);
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(24, 175, 464, 25);
      ctx.fillStyle = '#10b981';
      ctx.fillRect(24, 175, 464, 25);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 14px "JetBrains Mono", monospace';
      ctx.fillText('RELAXED SHIFT • NO TIME PRESSURE', 75, 192);
    } else {
      ctx.fillText('GUEST PATIENCE METRIC:', 24, 160);
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(24, 175, 464, 25);
      const pWidth = (this.currentPatience / 100) * 464;
      ctx.fillStyle = this.currentPatience > 50 ? '#10b981' : this.currentPatience > 25 ? '#f59e0b' : '#ef4444';
      ctx.fillRect(24, 175, pWidth, 25);
    }

    // 8 Gate Mini Status Grid
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('GATE MATRIX [1-8]:', 24, 235);

    const cellW = 52;
    for (let i = 0; i < 8; i++) {
      const g = this.gatesState[i];
      const occ = g?.occupants?.length || 0;
      const x = 24 + i * (cellW + 6);
      const y = 250;

      ctx.fillStyle = occ === 2 ? '#065f46' : occ === 1 ? '#78350f' : '#1e293b';
      ctx.strokeStyle = occ === 2 ? '#10b981' : occ === 1 ? '#f59e0b' : '#475569';
      ctx.lineWidth = 2;
      ctx.fillRect(x, y, cellW, 55);
      ctx.strokeRect(x, y, cellW, 55);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 18px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`G${i + 1}`, x + cellW / 2, y + 24);
      ctx.fillStyle = occ === 2 ? '#34d399' : occ === 1 ? '#fbbf24' : '#64748b';
      ctx.font = '16px "JetBrains Mono", monospace';
      ctx.fillText(`${occ}/2`, x + cellW / 2, y + 46);
    }
    ctx.textAlign = 'left';

    // Footer prompt
    ctx.fillStyle = '#64748b';
    ctx.font = '15px "Chakra Petch", sans-serif';
    ctx.fillText('SELECT NUMBER [1-8] • [ENTER] CONFIRM • BUTTON TO DISPATCH', 24, 345);

    this.consoleTexture.needsUpdate = true;
  }

  // --- Procedural NPC 3D Mesh Generator ---
  private createNPCMesh(npc: NPCData): THREE.Group {
    const group = new THREE.Group();

    // Materials
    const skinTones = ['#ffd1b3', '#f2c199', '#c68642', '#8d5524', '#5c3818'];
    const skinMat = new THREE.MeshStandardMaterial({
      color: skinTones[Math.abs(npc.id.split('').reduce((a, b) => a + b.charCodeAt(0), 0)) % skinTones.length],
      roughness: 0.6,
    });
    const shirtMat = new THREE.MeshStandardMaterial({ color: npc.color, roughness: 0.45 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.7 });
    const hairColors = ['#1e1b18', '#4a3728', '#8b5a2b', '#b5835a', '#dcd0c0'];
    const hairMat = new THREE.MeshStandardMaterial({
      color: hairColors[Math.abs(npc.name.charCodeAt(0)) % hairColors.length],
      roughness: 0.8,
    });

    const scaleY = npc.height || 1.0;

    // Torso / Shirt
    const torsoGeo = new THREE.CylinderGeometry(0.18, 0.16, 0.55 * scaleY, 12);
    const torso = new THREE.Mesh(torsoGeo, shirtMat);
    torso.position.set(0, 0.75 * scaleY, 0);
    torso.castShadow = true;
    group.add(torso);

    // Head
    const headGeo = new THREE.SphereGeometry(0.15, 16, 16);
    const head = new THREE.Mesh(headGeo, skinMat);
    head.position.set(0, 1.18 * scaleY, 0);
    head.castShadow = true;
    group.add(head);

    // Hair / Cap / Accessories
    if (npc.hatType === 'cap') {
      const capGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.08, 16);
      const capMat = new THREE.MeshStandardMaterial({ color: '#0f172a' });
      const cap = new THREE.Mesh(capGeo, capMat);
      cap.position.set(0, 1.28 * scaleY, 0);
      group.add(cap);

      const visorGeo = new THREE.BoxGeometry(0.18, 0.02, 0.16);
      const visor = new THREE.Mesh(visorGeo, capMat);
      visor.position.set(0, 1.25 * scaleY, 0.14);
      group.add(visor);
    } else if (npc.hatType === 'ears') {
      // Theme park headband ears!
      const earGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.02, 16);
      const earMat = new THREE.MeshStandardMaterial({ color: '#111827' });
      const leftEar = new THREE.Mesh(earGeo, earMat);
      leftEar.rotation.x = Math.PI / 2;
      leftEar.position.set(-0.12, 1.38 * scaleY, 0);
      group.add(leftEar);

      const rightEar = new THREE.Mesh(earGeo, earMat);
      rightEar.rotation.x = Math.PI / 2;
      rightEar.position.set(0.12, 1.38 * scaleY, 0);
      group.add(rightEar);
    } else {
      // Standard hair
      const hairGeo = new THREE.SphereGeometry(0.16, 12, 12);
      const hair = new THREE.Mesh(hairGeo, hairMat);
      hair.position.set(0, 1.22 * scaleY, -0.02);
      group.add(hair);
    }

    // Left & Right Legs
    const legGeo = new THREE.CylinderGeometry(0.06, 0.05, 0.5 * scaleY, 8);
    const leftLeg = new THREE.Mesh(legGeo, pantsMat);
    leftLeg.name = 'leftLeg';
    leftLeg.position.set(-0.09, 0.25 * scaleY, 0);
    leftLeg.castShadow = true;
    group.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeo, pantsMat);
    rightLeg.name = 'rightLeg';
    rightLeg.position.set(0.09, 0.25 * scaleY, 0);
    rightLeg.castShadow = true;
    group.add(rightLeg);

    // Left & Right Arms
    const armGeo = new THREE.CylinderGeometry(0.045, 0.04, 0.45 * scaleY, 8);
    const leftArm = new THREE.Mesh(armGeo, shirtMat);
    leftArm.name = 'leftArm';
    leftArm.position.set(-0.24, 0.72 * scaleY, 0);
    group.add(leftArm);

    const rightArm = new THREE.Mesh(armGeo, shirtMat);
    rightArm.name = 'rightArm';
    rightArm.position.set(0.24, 0.72 * scaleY, 0);
    group.add(rightArm);

    return group;
  }

  // --- Synchronize Queues 3D Visuals ---
  public syncQueues(mainQueue: GroupData[], singleQueue: GroupData[]) {
    this.lastMainQueue = mainQueue;
    this.lastSingleQueue = singleQueue;

    // 1. Sync Main Queue NPCs
    let currentMainZ = MAIN_QUEUE_STOP_Z;
    const mainFrontGroup = mainQueue[0];

    // Update Main Queue Header Badge
    if (this.mainQueueBadge) {
      const mbCanvas = document.createElement('canvas');
      mbCanvas.width = 512;
      mbCanvas.height = 180;
      const ctx = mbCanvas.getContext('2d')!;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
      ctx.roundRect(10, 10, 492, 160, 20);
      ctx.fill();
      ctx.strokeStyle = mainFrontGroup ? mainFrontGroup.color : '#3b82f6';
      ctx.lineWidth = 8;
      ctx.stroke();

      ctx.fillStyle = '#60a5fa';
      ctx.font = 'bold 34px "Chakra Petch", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('MAIN QUEUE', 256, 58);

      if (mainFrontGroup) {
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 44px "JetBrains Mono", monospace';
        ctx.fillText(`GROUP OF ${mainFrontGroup.size}`, 256, 120);
      } else {
        ctx.fillStyle = '#94a3b8';
        ctx.font = 'italic 32px "Chakra Petch", sans-serif';
        ctx.fillText('(EMPTY QUEUE)', 256, 115);
      }

      const tex = new THREE.CanvasTexture(mbCanvas);
      this.mainQueueBadge.material.map = tex;
      this.mainQueueBadge.material.needsUpdate = true;
    }

    // Position NPCs in line
    mainQueue.slice(0, 5).forEach((group, gIdx) => {
      const zOffset = MAIN_QUEUE_STOP_Z + gIdx * 1.3;
      group.members.forEach((npc, mIdx) => {
        let mesh = this.npcMeshes.get(npc.id);
        if (!mesh) {
          mesh = this.createNPCMesh(npc);
          this.npcMeshes.set(npc.id, mesh);
          this.scene.add(mesh);
        }

        // If not actively walking to a gate, snap into line position
        if (!npc.isWalking) {
          const sideOffset = (mIdx - (group.size - 1) / 2) * 0.35;
          mesh.position.set(MAIN_QUEUE_STOP_X + sideOffset, 0, zOffset);
          mesh.rotation.y = -Math.PI / 2; // face towards platform
          mesh.visible = true;
        }
      });
    });

    // 2. Sync Single Queue NPCs
    const singleFront = singleQueue[0];
    if (this.singleQueueBadge) {
      const sbCanvas = document.createElement('canvas');
      sbCanvas.width = 512;
      sbCanvas.height = 180;
      const ctx = sbCanvas.getContext('2d')!;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
      ctx.roundRect(10, 10, 492, 160, 20);
      ctx.fill();
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 8;
      ctx.stroke();

      ctx.fillStyle = '#22d3ee';
      ctx.font = 'bold 34px "Chakra Petch", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('SINGLE RIDER LINE', 256, 58);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 44px "JetBrains Mono", monospace';
      ctx.fillText(singleFront ? 'SOLO GUEST (1)' : '(EMPTY)', 256, 120);

      const tex = new THREE.CanvasTexture(sbCanvas);
      this.singleQueueBadge.material.map = tex;
      this.singleQueueBadge.material.needsUpdate = true;
    }

    singleQueue.slice(0, 5).forEach((group, gIdx) => {
      const zOffset = SINGLE_QUEUE_STOP_Z - gIdx * 1.1;
      const npc = group.members[0];
      if (!npc) return;

      let mesh = this.npcMeshes.get(npc.id);
      if (!mesh) {
        mesh = this.createNPCMesh(npc);
        this.npcMeshes.set(npc.id, mesh);
        this.scene.add(mesh);
      }

      if (!npc.isWalking) {
        mesh.position.set(SINGLE_QUEUE_STOP_X, 0, zOffset);
        mesh.rotation.y = -Math.PI / 2;
        mesh.visible = true;
      }
    });
  }

  // --- Assign Group Pathfinding Walk Animation ---
  public walkGroupToGates(group: GroupData, assignments: { gateIndex: number; seatSlot: number; npc: NPCData }[]) {
    assignments.forEach(assign => {
      const npc = assign.npc;
      let mesh = this.npcMeshes.get(npc.id);
      if (!mesh) {
        mesh = this.createNPCMesh(npc);
        this.npcMeshes.set(npc.id, mesh);
        this.scene.add(mesh);
      }

      npc.isWalking = true;
      const startPos = mesh.position.clone();
      const gateZ = GATE_Z_POSITIONS[assign.gateIndex];
      const slotZOffset = assign.seatSlot === 0 ? 0.28 : -0.28;

      // NavMesh Waypoints:
      // Point 0: Current queue position
      // Point 1: Step out into station aisle at X = 0.8, start Z
      // Point 2: Walk down aisle to X = 0.8, target gate Z
      // Point 3: Step onto gate floor pad at X = GATE_LINE_X, gate Z + slotZOffset
      const waypoints = [
        startPos,
        new THREE.Vector3(0.8, 0, startPos.z),
        new THREE.Vector3(0.8, 0, gateZ),
        new THREE.Vector3(GATE_LINE_X, 0, gateZ + slotZOffset),
      ];

      this.walkingNPCs.push({
        npc,
        mesh,
        waypoints,
        currentSegment: 0,
        segmentProgress: 0,
        speed: 4.8 + Math.random() * 0.6,
        onComplete: () => {
          npc.isWalking = false;
          mesh!.position.set(GATE_LINE_X, 0, gateZ + slotZOffset);
          mesh!.rotation.y = -Math.PI / 2; // Face towards the train tracks
        },
      });
    });
  }

  // --- Update Pending Gate Allocations for Grouping Stage ---
  public setPendingGateAllocations(allocations: { [gateIndex: number]: number }, selectedIndices?: number[]) {
    this.pendingGateAllocations = { ...allocations };
    if (selectedIndices) {
      this.selectedGateIndices = [...selectedIndices];
    } else {
      this.selectedGateIndices = Object.keys(allocations).map(Number);
    }
    this.updateGateHighlights();
  }

  private updateGateHighlights() {
    this.gateGhostHighlights.forEach((g, idx) => {
      const isSelected = this.selectedGateIndices.includes(idx);
      if (isSelected) {
        (g.material as THREE.MeshBasicMaterial).color.set('#38bdf8');
        (g.material as THREE.MeshBasicMaterial).opacity = 0.65;
      } else {
        (g.material as THREE.MeshBasicMaterial).opacity = 0;
      }
    });
  }

  // --- Update Gates 3D State (Colors, Labels, Barrier open/close) ---
  public updateGates(gates: GateState[]) {
    this.gatesState = gates;
    for (let i = 0; i < GATE_COUNT; i++) {
      const g = gates[i];
      const ind = this.gateIndicators[i];
      if (!g || !ind) continue;

      const occCount = g.occupants ? g.occupants.length : 0;
      let col = '#ef4444';
      let emissive = '#dc2626';

      if (occCount === 1) {
        col = '#f59e0b';
        emissive = '#d97706';
      } else if (occCount === 2) {
        col = '#10b981';
        emissive = '#059669';
      }

      (ind.lightMesh.material as THREE.MeshStandardMaterial).color.set(col);
      (ind.lightMesh.material as THREE.MeshStandardMaterial).emissive.set(emissive);

      // Redraw overhead gate label
      const gCanvas = document.createElement('canvas');
      gCanvas.width = 256;
      gCanvas.height = 128;
      const ctx = gCanvas.getContext('2d')!;
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, 256, 128);
      ctx.strokeStyle = col;
      ctx.lineWidth = 8;
      ctx.strokeRect(4, 4, 248, 120);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 50px "Chakra Petch", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`GATE 0${i + 1}`, 128, 48);
      ctx.fillStyle = col;
      ctx.font = 'bold 34px "JetBrains Mono", monospace';
      ctx.fillText(`${occCount} / 2`, 128, 92);

      const tex = new THREE.CanvasTexture(gCanvas);
      ind.labelMesh.material.map = tex;
      ind.labelMesh.material.needsUpdate = true;
    }

    this.updateConsoleScreen();
  }

  // --- Preview Group Hover Over Gates ---
  public updateGateHoverPreview(hoverGateIndex: number | null, group: GroupData | null) {
    // If we have active pending allocations in the grouping stage, show those
    const hasPending = Object.keys(this.pendingGateAllocations).length > 0;
    if (hasPending) {
      this.updateGateHighlights();
      return;
    }

    // Reset all ghost highlights
    this.gateGhostHighlights.forEach(g => {
      (g.material as THREE.MeshBasicMaterial).opacity = 0;
    });

    if (hoverGateIndex === null || !group) return;

    // Check how many seats this group would fill sequentially starting from hoverGateIndex
    let remaining = group.size;
    let valid = true;

    // Check validity first
    let tempRemaining = group.size;
    for (let i = hoverGateIndex; i < GATE_COUNT; i++) {
      const g = this.gatesState[i];
      const occ = g ? g.occupants.length : 0;
      const free = 2 - occ;
      tempRemaining -= free;
      if (tempRemaining <= 0) break;
    }
    if (tempRemaining > 0) valid = false;

    // Apply glowing preview
    for (let i = hoverGateIndex; i < GATE_COUNT; i++) {
      const g = this.gatesState[i];
      const occ = g ? g.occupants.length : 0;
      const free = 2 - occ;
      if (free <= 0 && remaining > 0) {
        continue;
      }
      const ghost = this.gateGhostHighlights[i];
      if (ghost) {
        (ghost.material as THREE.MeshBasicMaterial).color.set(valid ? '#38bdf8' : '#ef4444');
        (ghost.material as THREE.MeshBasicMaterial).opacity = 0.55;
      }
      remaining -= free;
      if (remaining <= 0) break;
    }
  }

  // --- Dispatch State Trigger ---
  public triggerDispatchAnimation(onFinishDispatch: () => void) {
    this.currentGameState = 'DISPATCH_STATE';
    soundEngine.playDispatchButton();
    soundEngine.playLapBarsLock();

    // 1. Swing open gate barriers & move NPCs into seats
    this.gateIndicators.forEach(ind => {
      ind.gateBarrier.rotation.y = -Math.PI / 2.2;
    });

    const activeTrainGroup = this.activeTrain?.group || this.trainGroup;

    // Move sitting NPCs into vehicle seat slots
    this.gatesState.forEach((g, gIdx) => {
      const vIdx = Math.floor(gIdx / 2);
      const rowInCar = gIdx % 2; // 0 is front row, 1 is rear row
      const zRowOffset = rowInCar === 0 ? 0.65 : -0.65;
      const vCenterZ = VEHICLE_Z_CENTERS[vIdx];

      g.occupants.forEach((npc, slotIdx) => {
        const mesh = this.npcMeshes.get(npc.id);
        if (mesh) {
          mesh.userData.isRider = true;
          const seatXOffset = slotIdx === 0 ? 0.4 : -0.4;
          // Step into car and attach to active train group
          mesh.position.set(TRACK_X + seatXOffset, 0.42 + 0.38 * (npc.height || 1), vCenterZ + zRowOffset);
          mesh.rotation.y = -Math.PI / 2;
          activeTrainGroup.add(mesh);
          // Set seated pose (bend legs)
          const leftLeg = mesh.getObjectByName('leftLeg');
          const rightLeg = mesh.getObjectByName('rightLeg');
          if (leftLeg) leftLeg.rotation.x = Math.PI / 2.2;
          if (rightLeg) rightLeg.rotation.x = Math.PI / 2.2;
        }
      });
    });

    // 2. Lower lap bars smoothly
    this.lapBarAngle = Math.PI / 2.3;

    // 3. Launch Coaster Train (Accelerate forward down track toward positive Z)
    setTimeout(() => {
      soundEngine.playCoasterLaunch();
      this.trainSpeedZ = 1.2; // Accelerate forward out of station into launch tunnel
      if (this.launchParticles) {
        (this.launchParticles.material as THREE.PointsMaterial).opacity = 0.9;
      }
    }, 600);

    // 4. Complete Dispatch & Begin Reset
    setTimeout(() => {
      onFinishDispatch();
    }, 2400);
  }

  // --- Reset Next Train from Queue Animation ---
  public triggerResetAnimation(onFinishReset: () => void) {
    this.currentGameState = 'RESET_STATE';

    // 1. Remove dispatched rider NPC meshes from scene and train groups
    const toDeleteIds: string[] = [];
    this.npcMeshes.forEach((mesh, id) => {
      if (mesh.userData.isRider || (this.activeTrain && mesh.parent === this.activeTrain.group)) {
        if (mesh.parent) mesh.parent.remove(mesh);
        this.scene.remove(mesh);
        toDeleteIds.push(id);
      }
    });
    toDeleteIds.forEach(id => this.npcMeshes.delete(id));

    // 2. Safely remove dispatched train from scene
    if (this.activeTrain) {
      this.scene.remove(this.activeTrain.group);
    }

    // 3. Close gate barriers back
    this.gateIndicators.forEach(ind => {
      ind.gateBarrier.rotation.y = 0;
    });

    // 4. Pop the next waiting train from queue (at Z = -17) to become incoming station train
    const incomingTrain = this.waitingTrainQueue.shift() || this.createTrainInstance(this.trainColorPalette[1], -17);

    // Cycle train color palette and spawn a new train at the back of the queue (Z = -68)
    const nextColor = this.trainColorPalette[this.trainColorCounter % this.trainColorPalette.length];
    this.trainColorCounter++;
    const newQueueTrain = this.createTrainInstance(nextColor, -68);
    this.waitingTrainQueue.push(newQueueTrain);

    // Train queue positions before and after forward movement
    const movingTrains = [
      { train: incomingTrain, startZ: incomingTrain.group.position.z, targetZ: 0 },
      ...this.waitingTrainQueue.map((wt, idx) => ({
        train: wt,
        startZ: wt.group.position.z,
        targetZ: -(idx + 1) * 17,
      })),
    ];

    const startTime = performance.now();
    const duration = 1300; // ms

    const animateArrival = () => {
      const now = performance.now();
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / duration);
      // Smooth cubic ease out curve
      const easeOut = 1 - Math.pow(1 - t, 3);

      movingTrains.forEach(item => {
        item.train.group.position.z = item.startZ + (item.targetZ - item.startZ) * easeOut;
      });

      if (t < 1) {
        requestAnimationFrame(animateArrival);
      } else {
        // Arrival Complete: lock incoming train into active station spot
        incomingTrain.group.position.z = 0;
        this.activeTrain = incomingTrain;
        this.trainGroup = incomingTrain.group;
        this.vehicleMeshes = incomingTrain.vehicleMeshes;
        this.lapBarGroups = incomingTrain.lapBarGroups;
        this.trainSpeedZ = 0;

        soundEngine.playTrainBrakes();
        // Lift lap bars open
        this.lapBarAngle = 0;
        this.currentGameState = 'LOAD_STATE';

        if (this.launchParticles) {
          (this.launchParticles.material as THREE.PointsMaterial).opacity = 0.0;
        }

        // Restore/sync waiting queue visuals so guests never disappear
        if (this.lastMainQueue.length > 0 || this.lastSingleQueue.length > 0) {
          this.syncQueues(this.lastMainQueue, this.lastSingleQueue);
        }

        onFinishReset();
      }
    };

    requestAnimationFrame(animateArrival);
  }

  // --- Set Game State & Patience ---
  public setGameState(state: GameState) {
    this.currentGameState = state;
    if (this.dispatchButtonMesh) {
      const mat = this.dispatchButtonMesh.material as THREE.MeshStandardMaterial;
      if (state === 'READY_STATE') {
        mat.color.set('#22c55e');
        mat.emissive.set('#16a34a');
        mat.emissiveIntensity = 1.0;
      } else {
        mat.color.set('#ef4444');
        mat.emissive.set('#dc2626');
        mat.emissiveIntensity = 0.4;
      }
    }
    this.updateConsoleScreen();
  }

  public setSelectedGroup(group: GroupData | null) {
    this.selectedGroup = group;
  }

  public setPatience(patience: number) {
    this.currentPatience = Math.max(0, Math.min(100, patience));
    this.updateConsoleScreen();
  }

  public setZenMode(isZen: boolean) {
    this.isZenMode = isZen;
    this.updateConsoleScreen();
  }

  public setPaused(paused: boolean) {
    this.isPaused = paused;
    if (paused) {
      this.exitPointerLock();
      this.moveForward = false;
      this.moveBackward = false;
      this.moveLeft = false;
      this.moveRight = false;
      this.isSprinting = false;
    }
  }

  public setBrightness(exposure: number) {
    this.renderer.toneMappingExposure = exposure;
    if (this.ambientLight) {
      this.ambientLight.intensity = (exposure / 1.75) * 2.2;
    }
    this.spotLights.forEach((spot) => {
      spot.intensity = (exposure / 1.75) * 4.0;
    });
    this.pointLights.forEach((pLight) => {
      pLight.intensity = (exposure / 1.75) * 3.8;
    });
  }

  public setGraphicsConfig(options: { shadows?: boolean; fov?: number }) {
    if (options.shadows !== undefined) {
      this.renderer.shadowMap.enabled = options.shadows;
      this.spotLights.forEach((s) => (s.castShadow = options.shadows!));
    }
    if (options.fov !== undefined) {
      this.camera.fov = options.fov;
      this.camera.updateProjectionMatrix();
    }
  }

  public activeKartBank: 0 | 1 = 0;

  public setActiveKartBank(bank: 0 | 1) {
    this.activeKartBank = bank;
    this.updateRaycasting();
  }

  public setKeybinds(keybinds: KeybindsConfig) {
    this.keybinds = { ...keybinds };
  }

  // --- Input & Event Handling ---
  private setupEventListeners() {
    window.addEventListener('resize', this.onWindowResize.bind(this));
    window.addEventListener('keydown', this.onKeyDown.bind(this));
    window.addEventListener('keyup', this.onKeyUp.bind(this));

    const dom = this.container;

    // Pointer Lock & Mouse Look (Left Click only)
    dom.addEventListener('click', (e) => {
      if (this.isPaused) return;
      if (e.button !== 0) return;
      this.handleInteractionClick();
    });

    // Right Click to confirm grouping stage and let the group go
    dom.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.callbacks.onConfirmGrouping?.();
    });

    // Mouse buttons: 2 = Right Click, 3 = Back (Karts 1-2), 4 = Forward (Karts 3-4)
    dom.addEventListener('mousedown', (e) => {
      if (e.button === 2) {
        e.preventDefault();
        this.callbacks.onConfirmGrouping?.();
      } else if (e.button === 4) {
        // Forward button: select karts 3-4 (no wrapping)
        e.preventDefault();
        e.stopPropagation();
        if (this.activeKartBank !== 1) {
          this.activeKartBank = 1;
          this.callbacks.onSwitchKartBank?.(1);
        }
      } else if (e.button === 3) {
        // Back button: select karts 1-2 (no wrapping)
        e.preventDefault();
        e.stopPropagation();
        if (this.activeKartBank !== 0) {
          this.activeKartBank = 0;
          this.callbacks.onSwitchKartBank?.(0);
        }
      }
    });

    // Suppress browser forward/back navigation on mouse buttons 3 and 4
    window.addEventListener('mouseup', (e) => {
      if (e.button === 3 || e.button === 4) {
        e.preventDefault();
        e.stopPropagation();
      }
    }, true);

    window.addEventListener('auxclick', (e) => {
      if (e.button === 3 || e.button === 4) {
        e.preventDefault();
        e.stopPropagation();
      }
    }, true);

    document.addEventListener('mousemove', (e) => {
      if (this.isPointerLocked && !this.isPaused) {
        this.cameraEuler.y -= e.movementX * this.mouseSensitivity;
        this.cameraEuler.x -= e.movementY * this.mouseSensitivity;
        this.cameraEuler.x = Math.max(-Math.PI / 2.3, Math.min(Math.PI / 2.3, this.cameraEuler.x));
        this.camera.quaternion.setFromEuler(this.cameraEuler);
      }
    });

    // Pointer lock change listeners
    document.addEventListener('pointerlockchange', () => {
      this.isPointerLocked = document.pointerLockElement === this.container;
    });
  }

  public requestPointerLock() {
    if (!this.isPaused) {
      this.container.requestPointerLock();
    }
  }

  public exitPointerLock() {
    if (document.exitPointerLock) {
      document.exitPointerLock();
    }
  }

  private onKeyDown(e: KeyboardEvent) {
    const kb = this.keybinds;

    // Pause / Escape Handler
    if (e.code === (kb?.pause || 'KeyP') || e.code === 'KeyP' || e.key === 'p' || e.key === 'P') {
      e.preventDefault();
      this.callbacks.onTogglePause?.();
      return;
    }

    if (e.code === 'Escape') {
      if (this.selectedGroup) {
        this.callbacks.onDeselect();
      } else {
        this.callbacks.onTogglePause?.();
      }
      return;
    }

    if (this.isPaused) return;

    // Call Main Queue shortcut
    if (e.code === (kb?.callMainQueue || 'KeyM') || e.code === 'KeyM' || e.key === 'm' || e.key === 'M') {
      this.callbacks.onSelectMainQueue();
      return;
    }

    // Call Single Rider Queue shortcut
    if (e.code === (kb?.callSingleQueue || 'KeyN') || e.code === 'KeyN' || e.key === 'n' || e.key === 'N') {
      this.callbacks.onSelectSingleQueue();
      return;
    }

    // Deselect active group
    if (e.code === (kb?.deselect || 'KeyQ') || e.code === 'KeyQ' || e.key === 'q' || e.key === 'Q') {
      this.callbacks.onDeselect();
      return;
    }

    // Confirm grouping with Enter as secondary option
    if (e.code === (kb?.confirmGroup || 'Enter') || e.code === 'Enter' || e.code === 'NumpadEnter') {
      e.preventDefault();
      this.callbacks.onConfirmGrouping?.();
      return;
    }

    // Jump on platform with Space
    if (e.code === (kb?.jump || 'Space') || e.code === 'Space') {
      e.preventDefault();
      if (this.isGrounded) {
        this.playerVelocityY = this.JUMP_FORCE;
        this.isGrounded = false;
        soundEngine.playJump();
      }
      return;
    }

    // Interact / Raycast Action (Dispatch button, gates, or queue stoplines)
    if (e.code === (kb?.interact || 'KeyE') || e.code === 'KeyE' || e.code === 'KeyF') {
      this.handleInteractionClick();
      return;
    }

    // Movement Key Actions
    if (e.code === (kb?.moveForward || 'KeyW') || e.code === 'KeyW' || e.code === 'ArrowUp') {
      this.moveForward = true;
    } else if (e.code === (kb?.moveBackward || 'KeyS') || e.code === 'KeyS' || e.code === 'ArrowDown') {
      this.moveBackward = true;
    } else if (e.code === (kb?.moveLeft || 'KeyA') || e.code === 'KeyA' || e.code === 'ArrowLeft') {
      this.moveLeft = true;
    } else if (e.code === (kb?.moveRight || 'KeyD') || e.code === 'KeyD' || e.code === 'ArrowRight') {
      this.moveRight = true;
    } else if (e.code === (kb?.sprint || 'ShiftLeft') || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
      this.isSprinting = true;
    }
  }

  private onKeyUp(e: KeyboardEvent) {
    const kb = this.keybinds;

    if (e.code === (kb?.moveForward || 'KeyW') || e.code === 'KeyW' || e.code === 'ArrowUp') {
      this.moveForward = false;
    } else if (e.code === (kb?.moveBackward || 'KeyS') || e.code === 'KeyS' || e.code === 'ArrowDown') {
      this.moveBackward = false;
    } else if (e.code === (kb?.moveLeft || 'KeyA') || e.code === 'KeyA' || e.code === 'ArrowLeft') {
      this.moveLeft = false;
    } else if (e.code === (kb?.moveRight || 'KeyD') || e.code === 'KeyD' || e.code === 'ArrowRight') {
      this.moveRight = false;
    } else if (e.code === (kb?.sprint || 'ShiftLeft') || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
      this.isSprinting = false;
    }
  }

  private handleInteractionClick() {
    if (this.currentHoverTarget.type === 'main_queue') {
      if (!this.selectedGroup) {
        this.callbacks.onSelectMainQueue();
      }
    } else if (this.currentHoverTarget.type === 'single_queue') {
      if (!this.selectedGroup) {
        this.callbacks.onSelectSingleQueue();
      }
    } else if (this.currentHoverTarget.type === 'gate' && this.currentHoverTarget.index !== undefined) {
      this.callbacks.onAssignToGate(this.currentHoverTarget.index);
    } else if (this.currentHoverTarget.type === 'dispatch_button') {
      this.callbacks.onTriggerDispatch();
    }
  }

  // --- Raycast Target Evaluation ---
  private updateRaycasting() {
    this.raycaster.setFromCamera(this.screenCenter, this.camera);
    const intersects = this.raycaster.intersectObjects(this.interactables, false);

    let newTarget: InteractionTarget = { type: 'none', label: '', description: '' };
    let hoverGate: number | null = null;

    if (intersects.length > 0) {
      const hit = intersects[0].object;
      const hitName = hit.name;

      if (hitName === 'main_queue_stop') {
        newTarget = {
          type: 'main_queue',
          label: 'MAIN QUEUE STOP LINE',
          description: this.selectedGroup ? 'Switch to Main Group' : 'Call Next Main Group [E / Click]',
          isValid: true,
        };
      } else if (hitName === 'single_queue_stop') {
        newTarget = {
          type: 'single_queue',
          label: 'SINGLE RIDER STOP LINE',
          description: this.selectedGroup ? 'Switch to Single Rider' : 'Call Solo Rider [E / Click]',
          isValid: true,
        };
      } else if (hitName.startsWith('gate_')) {
        const gateIdx = parseInt(hitName.replace('gate_', ''), 10);
        hoverGate = gateIdx;
        const gate = this.gatesState[gateIdx];
        const occ = gate ? gate.occupants.length : 0;

        if (this.selectedGroup) {
          const isGateInActiveBank = (this.activeKartBank === 0 && gateIdx < 4) || (this.activeKartBank === 1 && gateIdx >= 4);
          const keyNumber = gateIdx < 4 ? gateIdx + 1 : gateIdx - 3;
          const hotkeyHint = isGateInActiveBank
            ? `[Key ${keyNumber} or Click]`
            : gateIdx < 4
            ? '[Switch: Mouse Back]'
            : '[Switch: Mouse Forward]';

          newTarget = {
            type: 'gate',
            index: gateIdx,
            label: `GATE 0${gateIdx + 1} (${occ}/2)`,
            description: `Assign Group of ${this.selectedGroup.size} to Gate ${gateIdx + 1} ${hotkeyHint}`,
            isValid: true,
          };
        } else {
          newTarget = {
            type: 'gate',
            index: gateIdx,
            label: `GATE 0${gateIdx + 1} (${occ}/2)`,
            description: `Select a group from Main or Single queue first!`,
            isValid: false,
          };
        }
      } else if (hitName === 'dispatch_button') {
        const canDispatch = this.currentGameState === 'READY_STATE';
        newTarget = {
          type: 'dispatch_button',
          label: 'DISPATCH CONSOLE',
          description: canDispatch ? 'TRIGGER DISPATCH! [E / Click Button]' : 'Fill at least 1 seat before dispatching',
          isValid: canDispatch,
        };
      }
    }

    // Update ghost hover on gates
    this.updateGateHoverPreview(hoverGate, this.selectedGroup);

    // Notify callback if target changed
    if (
      newTarget.type !== this.currentHoverTarget.type ||
      newTarget.index !== this.currentHoverTarget.index ||
      newTarget.label !== this.currentHoverTarget.label
    ) {
      this.currentHoverTarget = newTarget;
      this.callbacks.onTargetChange(newTarget);
    }
  }

  // --- Main Animation Loop ---
  private animate() {
    this.animationFrameId = requestAnimationFrame(this.animate);
    
    if (this.isPaused) {
      this.renderer.render(this.scene, this.camera);
      return;
    }

    const delta = Math.min(this.clock.getDelta(), 0.1);
    const time = this.clock.getElapsedTime();

    // 1. Move Player on Platform with Jump Gravity Physics
    const speed = (this.isSprinting ? 7.0 : 4.2) * delta;
    const moveDir = new THREE.Vector3();

    if (this.moveForward) moveDir.z -= 1;
    if (this.moveBackward) moveDir.z += 1;
    if (this.moveLeft) moveDir.x -= 1;
    if (this.moveRight) moveDir.x += 1;

    if (moveDir.lengthSq() > 0) {
      moveDir.normalize();
      // Rotate move direction relative to camera yaw
      moveDir.applyEuler(new THREE.Euler(0, this.cameraEuler.y, 0, 'YXZ'));
      this.playerPos.addScaledVector(moveDir, speed);

      // Clamping bounds to keep player on platform
      this.playerPos.x = Math.max(-1.4, Math.min(3.6, this.playerPos.x));
      this.playerPos.z = Math.max(-6.5, Math.min(6.5, this.playerPos.z));
    }

    // Apply Jumping & Gravity Physics
    if (!this.isGrounded || this.playerPos.y > this.EYE_HEIGHT) {
      this.playerVelocityY += this.GRAVITY * delta;
      this.playerPos.y += this.playerVelocityY * delta;

      if (this.playerPos.y <= this.EYE_HEIGHT) {
        this.playerPos.y = this.EYE_HEIGHT;
        this.playerVelocityY = 0;
        this.isGrounded = true;
      }
    }

    // Update Camera position
    this.camera.position.copy(this.playerPos);

    // 2. Animate Walking NPCs
    for (let i = this.walkingNPCs.length - 1; i >= 0; i--) {
      const walker = this.walkingNPCs[i];
      const p1 = walker.waypoints[walker.currentSegment];
      const p2 = walker.waypoints[walker.currentSegment + 1];

      if (!p1 || !p2) {
        walker.onComplete?.();
        this.walkingNPCs.splice(i, 1);
        continue;
      }

      const segmentDist = p1.distanceTo(p2);
      if (segmentDist < 0.001) {
        walker.currentSegment++;
        continue;
      }

      walker.segmentProgress += (walker.speed * delta) / segmentDist;

      if (walker.segmentProgress >= 1.0) {
        walker.currentSegment++;
        walker.segmentProgress = 0;
        if (walker.currentSegment >= walker.waypoints.length - 1) {
          walker.onComplete?.();
          this.walkingNPCs.splice(i, 1);
          continue;
        }
      } else {
        // Interpolate along path
        walker.mesh.position.lerpVectors(p1, p2, walker.segmentProgress);
        // Face forward along segment
        const dir = new THREE.Vector3().subVectors(p2, p1).normalize();
        if (dir.lengthSq() > 0.01) {
          walker.mesh.rotation.y = Math.atan2(dir.x, dir.z);
        }

        // Leg swing animation
        const legSwing = Math.sin(time * 12) * 0.5;
        const leftLeg = walker.mesh.getObjectByName('leftLeg');
        const rightLeg = walker.mesh.getObjectByName('rightLeg');
        if (leftLeg) leftLeg.rotation.x = legSwing;
        if (rightLeg) rightLeg.rotation.x = -legSwing;
      }
    }

    // 3. Animate Train in Dispatch / Launch (Accelerate forward down track to positive Z)
    if (this.currentGameState === 'DISPATCH_STATE') {
      if (this.trainSpeedZ > 0.1) {
        this.trainSpeedZ += 18.0 * delta; // Magnetic launch acceleration forward!
        this.trainGroup.position.z += this.trainSpeedZ * delta;
      }
    }

    // 4. Animate Lap Bars
    this.lapBarGroups.forEach(lapGroup => {
      lapGroup.children.forEach(rowBar => {
        rowBar.rotation.x = THREE.MathUtils.lerp(rowBar.rotation.x, this.lapBarAngle, delta * 6);
      });
    });

    // 5. Pulsing visual indicators (Dispatch button glow, badges floating)
    if (this.dispatchButtonMesh && this.currentGameState === 'READY_STATE') {
      const pulse = 0.8 + Math.sin(time * 6) * 0.35;
      (this.dispatchButtonMesh.material as THREE.MeshStandardMaterial).emissiveIntensity = pulse;
    }

    if (this.mainQueueBadge) {
      this.mainQueueBadge.position.y = 2.5 + Math.sin(time * 2.5) * 0.08;
    }
    if (this.singleQueueBadge) {
      this.singleQueueBadge.position.y = 2.5 + Math.sin(time * 2.5 + 1.0) * 0.08;
    }

    // 6. Update Raycasting Targets
    this.updateRaycasting();

    // 7. Render Scene
    this.renderer.render(this.scene, this.camera);
  }

  private onWindowResize() {
    if (!this.container) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  public dispose() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }
    window.removeEventListener('resize', this.onWindowResize.bind(this));
    window.removeEventListener('keydown', this.onKeyDown.bind(this));
    window.removeEventListener('keyup', this.onKeyUp.bind(this));
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
    }
  }
}
