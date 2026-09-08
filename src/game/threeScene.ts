/**
 * 3D Engine for Theme Park Ride Grouper Simulator.
 * Manages Three.js scene, lighting, coaster train models, gates, queue lines,
 * procedural NPCs, first-person player camera/controls, pathfinding, and animations.
 */

import * as THREE from 'three';
import { TRACKS, TrackScope } from './trackState';
import { TRACK_LAYOUT } from './constants';
import { soundEngine } from '../audio/soundEngine';
import { GuestReactions, type GuestReactionEvent } from './guestReactions';
import { initialQueuePressure, type QueuePressure } from './queueService';
import {
  CONSOLE_POS,
  GATE_COUNT,
  GATE_Z_POSITIONS,
  INSIDE_GATE_LINE_X,
  INSIDE_TRACK_X,
  MAIN_QUEUE_STOP_Z,
  OUTSIDE_GATE_LINE_X,
  OUTSIDE_TRACK_X,
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
  TrackType,
  VehicleState
} from '../types';

export interface SceneCallbacks {
  onTargetChange: (target: InteractionTarget) => void;
  onSelectMainQueue: (track?: TrackType) => void;
  onSelectSingleQueue: () => void;
  onAssignToGate: (gateIndex: number) => void;
  onConfirmGrouping?: () => void;
  onTriggerDispatch: () => void;
  onTriggerDispatchTrack?: (track: TrackType) => void;
  onSwitchTrack?: () => void;
  onSelectTrack?: (track: TrackType) => void;
  onDeselect: () => void;
  onTogglePause?: () => void;
  onSwitchKartBank?: (bank: 0 | 1) => void;
  onCycleGate?: (direction: 1 | -1) => void;
  onToggleGateSelection?: (gateIndex?: number) => void;
  onGateHover?: (gateIndex: number | null) => void;
  onDispatchProgress?: (label: string, seconds: number, track: TrackType) => void;
  onGuestReactionEvent?: (event: GuestReactionEvent) => void;
}

export interface TrainInstance {
  id: string;
  group: THREE.Group;
  vehicleMeshes: THREE.Group[];
  lapBarGroups: THREE.Group[];
  color: string;
}

function createSceneTrack() {
  return {
    dispatchSequence: null as {
    elapsed: number;
    launched: boolean;
    restraintsLocked: boolean;
    lastProgress: string;
    onFinish: () => void;
    riders: { mesh: THREE.Group; start: THREE.Vector3; seat: THREE.Vector3; attached: boolean }[];
  } | null,
    resetAnimation: null as ((delta: number) => void) | null,
    activeTrain: null as TrainInstance | null,
    waitingTrainQueue: [] as TrainInstance[],
    trainGroup: new THREE.Group(),
    vehicleMeshes: [] as THREE.Group[],
    lapBarGroups: [] as THREE.Group[],
    gateIndicators: [] as {
    baseMesh: THREE.Mesh;
    lightMesh: THREE.Mesh;
    queueLightMesh?: THREE.Mesh;
    labelMesh: THREE.Sprite;
    gateBarrier: THREE.Group;
  }[],
    queuePressure: initialQueuePressure(),
    dispatchButtonMesh: null as THREE.Mesh | null,
    gateGhostHighlights: [] as THREE.Mesh[],
    gateFloorLines: [] as THREE.Mesh[],
    pendingGateAllocations: {} as { [gateIndex: number]: number },
    selectedGateIndices: [] as number[],
    hoveredGateIndex: null as number | null,
    lastMainQueue: [] as GroupData[],
    mainQueueGroup: new THREE.Group(),
    mainStopLineMesh: null as THREE.Mesh | null,
    mainQueueBadge: null as THREE.Sprite | null,
    mainQueueHighlight: null as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> | null,
    currentGameState: 'LOAD_STATE' as GameState,
    selectedGroup: null as GroupData | null,
    gatesState: [] as GateState[],
    trainSpeedZ: 0,
    lapBarAngle: 0,
    launchParticles: null as THREE.Points | null
  };
}
type SceneTrack = ReturnType<typeof createSceneTrack>;

export class RideStation3D {
  private trackScope = new TrackScope();
  private tracks: Record<TrackType, SceneTrack> = { inside: createSceneTrack(), outside: createSceneTrack() };
  private get trackData() {
    this.tracks ??= { inside: createSceneTrack(), outside: createSceneTrack() };
    return this.tracks[this.trackScope?.current ?? 'inside'];
  }
  public withTrack<T>(track: TrackType, action: () => T): T {
    this.trackScope ??= new TrackScope();
    return this.trackScope.run(track, action);
  }
  private get layout() { return TRACK_LAYOUT[this.trackScope?.current ?? 'inside']; }

  public container: HTMLElement;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private clock: THREE.Clock;
  private callbacks: SceneCallbacks;
  private eventListenerController = new AbortController();
  private get dispatchSequence(): SceneTrack['dispatchSequence'] { return this.trackData.dispatchSequence; }
  private set dispatchSequence(value: SceneTrack['dispatchSequence']) { this.trackData.dispatchSequence = value; }
  private get resetAnimation(): SceneTrack['resetAnimation'] { return this.trackData.resetAnimation; }
  private set resetAnimation(value: SceneTrack['resetAnimation']) { this.trackData.resetAnimation = value; }

  // Animation frame id
  private animationFrameId: number | null = null;

  // Lighting References
  private ambientLight: THREE.AmbientLight | null = null;
  private spotLights: THREE.SpotLight[] = [];
  private pointLights: THREE.PointLight[] = [];

  // Player & First-Person Controls with Platform Jump Physics
  public playerPos = new THREE.Vector3(0, 1.65, 12.5);
  private cameraEuler = new THREE.Euler(0, 0, 0, 'YXZ'); // looking towards gates
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
  private controllerMove = new THREE.Vector2();
  private controllerLook = new THREE.Vector2();
  private controllerSprint = false;
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
  private get activeTrain(): SceneTrack['activeTrain'] { return this.trackData.activeTrain; }
  private set activeTrain(value: SceneTrack['activeTrain']) { this.trackData.activeTrain = value; }
  private get waitingTrainQueue(): SceneTrack['waitingTrainQueue'] { return this.trackData.waitingTrainQueue; }
  private set waitingTrainQueue(value: SceneTrack['waitingTrainQueue']) { this.trackData.waitingTrainQueue = value; }
  private trainColorPalette: string[] = ['#0284c7', '#dc2626', '#059669', '#7c3aed', '#d97706', '#0891b2', '#e11d48'];
  private trainColorCounter = 0;
  private get trainGroup(): SceneTrack['trainGroup'] { return this.trackData.trainGroup; }
  private set trainGroup(value: SceneTrack['trainGroup']) { this.trackData.trainGroup = value; }
  private get vehicleMeshes(): SceneTrack['vehicleMeshes'] { return this.trackData.vehicleMeshes; }
  private set vehicleMeshes(value: SceneTrack['vehicleMeshes']) { this.trackData.vehicleMeshes = value; }
  private get lapBarGroups(): SceneTrack['lapBarGroups'] { return this.trackData.lapBarGroups; }
  private set lapBarGroups(value: SceneTrack['lapBarGroups']) { this.trackData.lapBarGroups = value; }
  private get gateIndicators(): SceneTrack['gateIndicators'] { return this.trackData.gateIndicators; }
  private set gateIndicators(value: SceneTrack['gateIndicators']) { this.trackData.gateIndicators = value; }
  private npcMeshes: Map<string, THREE.Group> = new Map();
  private guestReactions = new GuestReactions();
  private get queuePressure(): SceneTrack['queuePressure'] { return this.trackData.queuePressure; }
  private set queuePressure(value: SceneTrack['queuePressure']) { this.trackData.queuePressure = value; }
  private get dispatchButtonMesh(): SceneTrack['dispatchButtonMesh'] { return this.trackData.dispatchButtonMesh; }
  private set dispatchButtonMesh(value: SceneTrack['dispatchButtonMesh']) { this.trackData.dispatchButtonMesh = value; }
  private dispatchButtonBase: THREE.Group | null = null;
  private consoleScreenMesh: THREE.Mesh | null = null;
  private consoleCanvas: HTMLCanvasElement | null = null;
  private consoleTexture: THREE.CanvasTexture | null = null;

  // Gate Hover Ghost Highlights & Grouping Stage Visual Indicators
  private get gateGhostHighlights(): SceneTrack['gateGhostHighlights'] { return this.trackData.gateGhostHighlights; }
  private set gateGhostHighlights(value: SceneTrack['gateGhostHighlights']) { this.trackData.gateGhostHighlights = value; }
  private get gateFloorLines(): SceneTrack['gateFloorLines'] { return this.trackData.gateFloorLines; }
  private set gateFloorLines(value: SceneTrack['gateFloorLines']) { this.trackData.gateFloorLines = value; }
  private get pendingGateAllocations(): SceneTrack['pendingGateAllocations'] { return this.trackData.pendingGateAllocations; }
  private set pendingGateAllocations(value: SceneTrack['pendingGateAllocations']) { this.trackData.pendingGateAllocations = value; }
  private get selectedGateIndices(): SceneTrack['selectedGateIndices'] { return this.trackData.selectedGateIndices; }
  private set selectedGateIndices(value: SceneTrack['selectedGateIndices']) { this.trackData.selectedGateIndices = value; }
  private get hoveredGateIndex(): SceneTrack['hoveredGateIndex'] { return this.trackData.hoveredGateIndex; }
  private set hoveredGateIndex(value: SceneTrack['hoveredGateIndex']) { this.trackData.hoveredGateIndex = value; }
  private get lastMainQueue(): SceneTrack['lastMainQueue'] { return this.trackData.lastMainQueue; }
  private set lastMainQueue(value: SceneTrack['lastMainQueue']) { this.trackData.lastMainQueue = value; }
  private lastSingleQueue: GroupData[] = [];

  // Queues 3D Visuals
  private get mainQueueGroup(): SceneTrack['mainQueueGroup'] { return this.trackData.mainQueueGroup; }
  private set mainQueueGroup(value: SceneTrack['mainQueueGroup']) { this.trackData.mainQueueGroup = value; }
  private singleQueueGroup = new THREE.Group();
  private get mainStopLineMesh(): SceneTrack['mainStopLineMesh'] { return this.trackData.mainStopLineMesh; }
  private set mainStopLineMesh(value: SceneTrack['mainStopLineMesh']) { this.trackData.mainStopLineMesh = value; }
  private singleStopLineMesh: THREE.Mesh | null = null;
  private get mainQueueBadge(): SceneTrack['mainQueueBadge'] { return this.trackData.mainQueueBadge; }
  private set mainQueueBadge(value: SceneTrack['mainQueueBadge']) { this.trackData.mainQueueBadge = value; }
  private singleQueueBadge: THREE.Sprite | null = null;
  private get mainQueueHighlight(): SceneTrack['mainQueueHighlight'] { return this.trackData.mainQueueHighlight; }
  private set mainQueueHighlight(value: SceneTrack['mainQueueHighlight']) { this.trackData.mainQueueHighlight = value; }
  private singleQueueHighlight: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> | null = null;

  public activeTrack: TrackType = 'inside';
  // State caches
  private get currentGameState(): SceneTrack['currentGameState'] { return this.trackData.currentGameState; }
  private set currentGameState(value: SceneTrack['currentGameState']) { this.trackData.currentGameState = value; }
  private get selectedGroup(): SceneTrack['selectedGroup'] { return this.trackData.selectedGroup; }
  private set selectedGroup(value: SceneTrack['selectedGroup']) { this.trackData.selectedGroup = value; }
  private get gatesState(): SceneTrack['gatesState'] { return this.trackData.gatesState; }
  private set gatesState(value: SceneTrack['gatesState']) { this.trackData.gatesState = value; }
  private vehiclesState: VehicleState[] = [];
  private currentPatience = 100;
  private trainOffsetZ = 0; // for dispatch / reset train animation
  private get trainSpeedZ(): SceneTrack['trainSpeedZ'] { return this.trackData.trainSpeedZ; }
  private set trainSpeedZ(value: SceneTrack['trainSpeedZ']) { this.trackData.trainSpeedZ = value; }
  private get lapBarAngle(): SceneTrack['lapBarAngle'] { return this.trackData.lapBarAngle; }
  private set lapBarAngle(value: SceneTrack['lapBarAngle']) { this.trackData.lapBarAngle = value; } // 0 = open, Math.PI / 2.2 = closed

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
  private get launchParticles(): SceneTrack['launchParticles'] { return this.trackData.launchParticles; }
  private set launchParticles(value: SceneTrack['launchParticles']) { this.trackData.launchParticles = value; }

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
    for (const track of TRACKS) this.withTrack(track, () => {
      this.buildCoasterTrain();
      this.buildGates();
      this.buildLaunchParticles();
    });
    this.buildQueueLines();
    this.buildControlConsole();

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

    for (const track of TRACKS) {
      const light = new THREE.PointLight(TRACK_LAYOUT[track].color, 8, 20, 2);
      light.position.set(TRACK_LAYOUT[track].gateX, 4, 0); this.scene.add(light); this.pointLights.push(light);
    }
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
    // Station Floor (Expanded steel platform encompassing inside track, central station, and outside track)
    const floorGeo = new THREE.PlaneGeometry(26, 30);
    const floorMat = new THREE.MeshStandardMaterial({
      color: '#334155',
      roughness: 0.35,
      metalness: 0.5,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, 0);
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Hazard Strip along Inside Track edge (X = -4.0)
    const hazardGeo = new THREE.PlaneGeometry(0.35, 20);
    const hazardMat = new THREE.MeshBasicMaterial({
      color: '#fbbf24',
    });
    const insideHazardStrip = new THREE.Mesh(hazardGeo, hazardMat);
    insideHazardStrip.rotation.x = -Math.PI / 2;
    insideHazardStrip.position.set(INSIDE_GATE_LINE_X - 0.25, 0.005, 0);
    this.scene.add(insideHazardStrip);

    // Hazard Strip along Outside Track edge (X = +4.0)
    const outsideHazardStrip = new THREE.Mesh(hazardGeo, hazardMat);
    outsideHazardStrip.rotation.x = -Math.PI / 2;
    outsideHazardStrip.position.set(OUTSIDE_GATE_LINE_X + 0.25, 0.005, 0);
    this.scene.add(outsideHazardStrip);

    // Outer Boundary Track Walls at X = -8.2 and X = +8.2
    const wallMat = new THREE.MeshStandardMaterial({
      color: '#475569',
      roughness: 0.6,
      metalness: 0.3,
    });
    const leftTrackWall = new THREE.Mesh(new THREE.BoxGeometry(0.5, 7, 30), wallMat);
    leftTrackWall.position.set(-12.2, 3.5, 0);
    this.scene.add(leftTrackWall);

    const rightTrackWall = new THREE.Mesh(new THREE.BoxGeometry(0.5, 7, 30), wallMat);
    rightTrackWall.position.set(12.2, 3.5, 0);
    this.scene.add(rightTrackWall);

    // North & South Station Portal Walls (Built with open tunnel archways at INSIDE_TRACK_X and OUTSIDE_TRACK_X)
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

    [-14.5, 14.5].forEach((endZ) => {
      // Central Platform Wall between the two tracks (X = -3.8 to +3.8)
      const centerPlatWall = new THREE.Mesh(new THREE.BoxGeometry(15.4, 3, 0.5), wallMat);
      centerPlatWall.position.set(0, 5.5, endZ);
      this.scene.add(centerPlatWall);

      // Portals for both tracks
      [INSIDE_TRACK_X, OUTSIDE_TRACK_X].forEach((tX) => {
        // Tunnel Header Beam overhead
        const headerWall = new THREE.Mesh(new THREE.BoxGeometry(3.3, 3.4, 0.5), portalMat);
        headerWall.position.set(tX, 5.3, endZ);
        this.scene.add(headerWall);

        // Glowing Neon Tunnel Portal Arch Ring around the train opening
        const archTop = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.2, 0.65), portalRimMat);
        archTop.position.set(tX, 3.6, endZ);
        this.scene.add(archTop);

        const archLeft = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.6, 0.65), portalRimMat);
        archLeft.position.set(tX - 1.6, 1.8, endZ);
        this.scene.add(archLeft);

        const archRight = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.6, 0.65), portalRimMat);
        archRight.position.set(tX + 1.6, 1.8, endZ);
        this.scene.add(archRight);
      });

      // Outer maintenance wall flanks
      const leftOuterWall = new THREE.Mesh(new THREE.BoxGeometry(1.2, 7.0, 0.5), wallMat);
      leftOuterWall.position.set(-11.5, 3.5, endZ);
      this.scene.add(leftOuterWall);

      const rightOuterWall = new THREE.Mesh(new THREE.BoxGeometry(1.2, 7.0, 0.5), wallMat);
      rightOuterWall.position.set(11.5, 3.5, endZ);
      this.scene.add(rightOuterWall);
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
      const beamGeo = new THREE.BoxGeometry(24.5, 0.3, 0.3);
      const beam = new THREE.Mesh(beamGeo, trussMat);
      beam.position.set(0, 5.8, z);
      this.scene.add(beam);

      // Linear LED Light Bar under each beam
      const lightBarGeo = new THREE.BoxGeometry(23, 0.08, 0.12);
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

  // --- Roller Coaster Track (Dual mirrored tracks: Inside & Outside) ---
  private buildRollerCoasterTrack() {
    const trackGroup = new THREE.Group();
    const railMat = new THREE.MeshStandardMaterial({ color: '#0284c7', metalness: 0.9, roughness: 0.2 });
    const trackLength = 160;
    const trackCenterZ = 0;
    const railGeo = new THREE.CylinderGeometry(0.06, 0.06, trackLength, 16);
    const spineGeo = new THREE.CylinderGeometry(0.12, 0.12, trackLength, 16);
    const tieMat = new THREE.MeshStandardMaterial({ color: '#334155', metalness: 0.8, roughness: 0.4 });
    const statorMat = new THREE.MeshStandardMaterial({ color: '#e11d48', metalness: 0.6, roughness: 0.3, emissive: '#881337', emissiveIntensity: 0.4 });

    [INSIDE_TRACK_X, OUTSIDE_TRACK_X].forEach((tX) => {
      // Two steel tubular rails running down tX spanning station, staging queue, and launch run
      const leftRail = new THREE.Mesh(railGeo, railMat);
      leftRail.position.set(tX - 0.5, 0.35, trackCenterZ);
      leftRail.rotation.x = Math.PI / 2;
      trackGroup.add(leftRail);

      const rightRail = new THREE.Mesh(railGeo, railMat);
      rightRail.position.set(tX + 0.5, 0.35, trackCenterZ);
      rightRail.rotation.x = Math.PI / 2;
      trackGroup.add(rightRail);

      // Center Spine Pipe
      const spine = new THREE.Mesh(spineGeo, railMat);
      spine.position.set(tX, 0.15, trackCenterZ);
      spine.rotation.x = Math.PI / 2;
      trackGroup.add(spine);

      // Cross ties & magnetic launch stators (LSM magnets)
      for (let z = -75; z <= 75; z += 0.8) {
        const tieGeo = new THREE.BoxGeometry(1.3, 0.05, 0.1);
        const tie = new THREE.Mesh(tieGeo, tieMat);
        tie.position.set(tX, 0.32, z);
        trackGroup.add(tie);

        // Launch stator block in the middle
        const statorGeo = new THREE.BoxGeometry(0.35, 0.12, 0.4);
        const stator = new THREE.Mesh(statorGeo, statorMat);
        stator.position.set(tX, 0.28, z);
        trackGroup.add(stator);
      }
    });

    this.scene.add(trackGroup);
  }

  // --- Procedural 4-Car Coaster Train Builder ---
  private createTrainInstance(colorHex: string, initialZ: number, trackX: number = INSIDE_TRACK_X): TrainInstance {
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
      vehicle.position.set(trackX, 0.42, zCenter);

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
      couplingGroup.position.set(trackX, 0.42, midZ);

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

  // --- Initialize Station Train & Waiting Queue of Trains for Both Tracks ---
  private buildCoasterTrain() {
    const index = this.trackScope.current === 'inside' ? 0 : 4;
    this.activeTrain = this.createTrainInstance(this.trainColorPalette[index], 0, this.layout.trackX);
    this.trainGroup = this.activeTrain.group;
    this.vehicleMeshes = this.activeTrain.vehicleMeshes;
    this.lapBarGroups = this.activeTrain.lapBarGroups;
    this.waitingTrainQueue = [1, 2, 3].map(i => this.createTrainInstance(this.trainColorPalette[(index + i) % 7], -17 * i, this.layout.trackX));
  }

  // --- 8 Loading Gates & LED Floor Pads ---
  private buildGates() {
    this.gateIndicators = [];
    this.gateGhostHighlights = [];
    this.gateFloorLines = [];

    const padGeo = new THREE.PlaneGeometry(0.8, 1.15);
    const queuePadGeo = new THREE.PlaneGeometry(0.65, 1.15);
    const frameGeo = new THREE.BoxGeometry(1.68, 0.04, 1.3);
    const frameMat = new THREE.MeshStandardMaterial({ color: '#334155', metalness: 0.8, roughness: 0.3 });

    for (let i = 0; i < GATE_COUNT; i++) {
      const zPos = GATE_Z_POSITIONS[i];
      const gateGroup = new THREE.Group();
      gateGroup.position.set(this.layout.gateX, 0, zPos);
      gateGroup.scale.x = -this.layout.direction;

      // Metal border frame encompassing front row and queue row
      const frame = new THREE.Mesh(frameGeo, frameMat);
      frame.position.set(0.325, 0.02, 0);
      frame.receiveShadow = true;
      gateGroup.add(frame);

      // LED Floor Light (Front Row: Ready for train, starts Red for 0/2)
      const ledMat = new THREE.MeshStandardMaterial({
        color: '#ef4444',
        emissive: '#dc2626',
        emissiveIntensity: 0.9,
        roughness: 0.3,
      });
      const ledPad = new THREE.Mesh(padGeo, ledMat);
      ledPad.rotation.x = -Math.PI / 2;
      ledPad.position.set(0, 0.045, 0);
      ledPad.name = `${this.trackScope.current}_gate_${i}`;
      gateGroup.add(ledPad);

      // LED Floor Light (Queue Row: Standing behind front row)
      const queueLedMat = new THREE.MeshStandardMaterial({
        color: '#1e293b',
        emissive: '#0f172a',
        emissiveIntensity: 0.5,
        roughness: 0.4,
      });
      const queueLedPad = new THREE.Mesh(queuePadGeo, queueLedMat);
      queueLedPad.rotation.x = -Math.PI / 2;
      queueLedPad.position.set(0.65, 0.044, 0);
      queueLedPad.name = `${this.trackScope.current}_gate_${i}`;
      gateGroup.add(queueLedPad);

      // Register both pads for raycasting
      this.interactables.push(ledPad);
      this.interactables.push(queueLedPad);

      // Ghost highlight mesh for hover preview (starts invisible)
      const ghostGeo = new THREE.PlaneGeometry(1.68, 1.25);
      const ghostMat = new THREE.MeshBasicMaterial({
        color: '#38bdf8',
        transparent: true,
        opacity: 0.0,
        side: THREE.DoubleSide,
      });
      const ghostMesh = new THREE.Mesh(ghostGeo, ghostMat);
      ghostMesh.rotation.x = -Math.PI / 2;
      ghostMesh.position.set(0.325, 0.055, 0);
      gateGroup.add(ghostMesh);
      this.gateGhostHighlights.push(ghostMesh);

      // Luminous line directly under the gate threshold on the floor
      const lineGeo = new THREE.PlaneGeometry(0.12, 1.28);
      const lineMat = new THREE.MeshBasicMaterial({
        color: '#f59e0b',
        transparent: true,
        opacity: 0.0,
        side: THREE.DoubleSide,
      });
      const lineMesh = new THREE.Mesh(lineGeo, lineMat);
      lineMesh.rotation.x = -Math.PI / 2;
      lineMesh.position.set(-0.55, 0.058, 0);
      gateGroup.add(lineMesh);
      this.gateFloorLines.push(lineMesh);

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
      gCtx.fillText(`0 / 4`, 128, 92);

      const signTexture = new THREE.CanvasTexture(gateSignCanvas);
      const spriteMat = new THREE.SpriteMaterial({ map: signTexture });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.position.set(-0.8, 2.2, 0);
      sprite.scale.set(1.4, 0.7, 1);
      gateGroup.add(sprite);

      this.gateIndicators.push({
        baseMesh: frame,
        lightMesh: ledPad,
        queueLightMesh: queueLedPad,
        labelMesh: sprite,
        gateBarrier: barrierGroup,
      });

      this.scene.add(gateGroup);
    }
  }

  // --- Queue Stanchions & Stop Lines ---
  private makeQueueBadge(title: string, detail: string, color: string) {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 180;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, 512, 180);
    ctx.strokeStyle = color; ctx.lineWidth = 8; ctx.strokeRect(4, 4, 504, 172);
    ctx.textAlign = 'center'; ctx.fillStyle = color; ctx.font = 'bold 34px sans-serif';
    ctx.fillText(title, 256, 62); ctx.fillStyle = '#ffffff'; ctx.font = 'bold 28px sans-serif';
    ctx.fillText(detail, 256, 128);
    return new THREE.CanvasTexture(canvas);
  }

  private buildQueueLines() {
    const makeLane = (x: number, z: number, width: number, direction: number, color: string, name: string, title: string) => {
      const group = new THREE.Group(); this.scene.add(group);
      const mat = new THREE.MeshStandardMaterial({ color, metalness: 0.3, roughness: 0.6 });
      for (const side of [-1, 1]) {
        const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 9), new THREE.MeshBasicMaterial({ color }));
        stripe.rotation.x = -Math.PI / 2; stripe.position.set(x + side * width / 2, 0.015, z + direction * 4.5); group.add(stripe);
        for (let step = 0; step <= 9; step += 1.5) {
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.8, 8), mat);
          post.position.set(x + side * width / 2, 0.4, z + direction * step); group.add(post);
        }
      }
      const stop = new THREE.Mesh(new THREE.PlaneGeometry(width, 0.5), mat);
      stop.rotation.x = -Math.PI / 2; stop.position.set(x, 0.025, z); stop.name = name;
      group.add(stop); this.interactables.push(stop);
      const hit = new THREE.Mesh(new THREE.BoxGeometry(width, 3, 9), new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.set(x, 1.5, z + direction * 4.5); hit.name = name; group.add(hit); this.interactables.push(hit);
      const badge = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.makeQueueBadge(title, 'WAIT HERE', color), toneMapped: false }));
      badge.position.set(x, 3.1, z); badge.scale.set(2.8, 0.98, 1); badge.name = name;
      group.add(badge); this.interactables.push(badge);
      const highlight = this.createQueueAreaHighlight(width, 9, color);
      highlight.position.set(x, 0.02, z + direction * 4.5); highlight.visible = false; group.add(highlight);
      return { group, stop, badge, highlight };
    };
    for (const track of TRACKS) this.withTrack(track, () => {
      const lane = makeLane(this.layout.queueX, MAIN_QUEUE_STOP_Z, 2.4, 1, this.layout.color, track + '_main_queue_stop', track.toUpperCase() + ' GROUPS');
      this.mainQueueGroup = lane.group; this.mainStopLineMesh = lane.stop;
      this.mainQueueBadge = lane.badge; this.mainQueueHighlight = lane.highlight;
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.makeQueueBadge(track.toUpperCase() + ' TRACK', 'GATES 1-8', this.layout.color), toneMapped: false }));
      label.position.set(this.layout.gateX, 3.8, 0); label.scale.set(3.5, 1.2, 1); this.scene.add(label);
    });
    const lane = makeLane(SINGLE_QUEUE_STOP_X, SINGLE_QUEUE_STOP_Z, 1.3, -1, '#2dd4bf', 'single_queue_stop', 'SHARED SINGLE RIDERS');
    this.singleQueueGroup = lane.group; this.singleStopLineMesh = lane.stop;
    this.singleQueueBadge = lane.badge; this.singleQueueHighlight = lane.highlight;
  }

  private createQueueAreaHighlight(width: number, depth: number, color: THREE.ColorRepresentation) {
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const highlight = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), material);
    highlight.rotation.x = -Math.PI / 2;
    highlight.visible = false;
    highlight.renderOrder = 2;

    // Outer perimeter glowing border
    const border = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.PlaneGeometry(width, depth)),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 1.0, depthWrite: false }),
    );
    border.position.z = 0.005;
    highlight.add(border);

    // Runway guide lines along the queue floor
    const hatchGroup = new THREE.Group();
    const hatchCount = 5;
    const hatchStep = depth / (hatchCount + 1);
    const hatchMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false });
    for (let i = 1; i <= hatchCount; i++) {
      const yPos = -depth / 2 + i * hatchStep;
      const hatchPoints = [
        new THREE.Vector3(-width * 0.38, yPos, 0.006),
        new THREE.Vector3(width * 0.38, yPos, 0.006),
      ];
      const hatchGeo = new THREE.BufferGeometry().setFromPoints(hatchPoints);
      const hatchLine = new THREE.Line(hatchGeo, hatchMat);
      hatchGroup.add(hatchLine);
    }
    highlight.add(hatchGroup);

    // Front-of-queue caller spotlight pad under the leading party
    const ringGeo = new THREE.RingGeometry(0.2, 0.65, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.position.set(0, -depth / 2 + 0.75, 0.007);
    highlight.add(ringMesh);

    return highlight;
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
    const buttonBezelGeo = new THREE.CylinderGeometry(0.30, 0.33, 0.16, 24);
    const bezelMat = new THREE.MeshStandardMaterial({ color: '#eab308', metalness: 0.7, roughness: 0.3 });
    const bezel = new THREE.Mesh(buttonBezelGeo, bezelMat);
    bezel.position.set(-0.38, 1.2, 0.05);
    bezel.rotation.x = -Math.PI / 8;
    this.dispatchButtonBase.add(bezel);

    const buttonGeo = new THREE.CylinderGeometry(0.23, 0.23, 0.16, 24);
    const buttonMat = new THREE.MeshStandardMaterial({
      color: '#ef4444',
      emissive: '#dc2626',
      emissiveIntensity: 0.6,
      roughness: 0.2,
    });
    this.dispatchButtonMesh = new THREE.Mesh(buttonGeo, buttonMat);
    this.dispatchButtonMesh.position.set(-0.38, 1.28, 0.05);
    this.dispatchButtonMesh.rotation.x = -Math.PI / 8;
    this.dispatchButtonMesh.name = 'dispatch_button_inside';
    this.dispatchButtonBase.add(this.dispatchButtonMesh);
    this.interactables.push(this.dispatchButtonMesh);

    // Mirrored outside-track dispatch control beside the inside button.
    const outsideButtonMat = buttonMat.clone();
    outsideButtonMat.color.set('#38bdf8');
    outsideButtonMat.emissive.set('#0369a1');
    const outsideBezel = new THREE.Mesh(buttonBezelGeo, bezelMat.clone());
    outsideBezel.position.set(0.38, 1.2, 0.05);
    outsideBezel.rotation.x = -Math.PI / 8;
    this.dispatchButtonBase.add(outsideBezel);
    this.tracks.outside.dispatchButtonMesh = new THREE.Mesh(buttonGeo, outsideButtonMat);
    this.tracks.outside.dispatchButtonMesh.position.set(0.38, 1.28, 0.05);
    this.tracks.outside.dispatchButtonMesh.rotation.x = -Math.PI / 8;
    this.tracks.outside.dispatchButtonMesh.name = 'dispatch_button_outside';
    this.dispatchButtonBase.add(this.tracks.outside.dispatchButtonMesh);
    this.interactables.push(this.tracks.outside.dispatchButtonMesh);
    for (const [label, x, color] of [['OUTSIDE', 0.38, '#38bdf8'], ['INSIDE', -0.38, '#fbbf24']] as const) {
      const canvas = document.createElement('canvas');
      canvas.width = 256; canvas.height = 64;
      const ctx = canvas.getContext('2d')!;
      ctx.font = 'bold 28px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = color;
      ctx.fillText(label, 128, 40);
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthWrite: false }));
      sprite.position.set(x, 1.62, 0.02);
      sprite.scale.set(0.42, 0.105, 1);
      this.dispatchButtonBase.add(sprite);
    }

    // Diegetic CRT Monitor on Left side of Podium
    this.consoleCanvas = document.createElement('canvas');
    this.consoleCanvas.width = 512;
    this.consoleCanvas.height = 384;
    this.consoleTexture = new THREE.CanvasTexture(this.consoleCanvas);

    const screenGeo = new THREE.PlaneGeometry(1.4, 1.05);
    const screenMat = new THREE.MeshBasicMaterial({ map: this.consoleTexture });
    this.consoleScreenMesh = new THREE.Mesh(screenGeo, screenMat);
    this.consoleScreenMesh.position.set(0, 1.5, -0.3);
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
      positions[i * 3] = this.layout.trackX + (Math.random() - 0.5) * 1.5;
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
    ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, 512, 384);
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 28px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('DISPATCH | ' + this.activeTrack.toUpperCase(), 20, 40);
    TRACKS.forEach((track, index) => {
      const data = this.tracks[track]; const y = 90 + index * 125;
      const seats = data.gatesState.reduce((n, gate) => n + Math.min(2, gate.occupants.length), 0);
      ctx.fillStyle = TRACK_LAYOUT[track].color; ctx.font = 'bold 30px sans-serif';
      ctx.fillText(track.toUpperCase() + '   ' + seats + ' / 16', 20, y);
      ctx.font = '22px sans-serif';
      ctx.fillText(data.currentGameState.replace('_STATE', '').replace('_', ' '), 20, y + 35);
      ctx.fillStyle = '#334155'; ctx.fillRect(20, y + 48, 470, 15);
      ctx.fillStyle = TRACK_LAYOUT[track].color; ctx.fillRect(20, y + 48, 470 * seats / 16, 15);
    });
    ctx.fillStyle = '#ffffff'; ctx.font = '20px sans-serif'; ctx.fillText('T / SCROLL: SWITCH TRACK', 20, 365);
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
    head.name = 'head';
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

    this.guestReactions.register(npc, group);
    group.userData.npc = npc;
    group.userData.groupId = npc.groupId;
    return group;
  }

  // --- Synchronize Queues 3D Visuals ---
  public syncQueues(mainQueue: GroupData[], singleQueue: GroupData[]) {
    this.lastMainQueue = mainQueue; this.lastSingleQueue = singleQueue;
    const updateBadge = (badge: THREE.Sprite | null, title: string, queue: GroupData[], color: string) => {
      if (!badge) return;
      const size = queue[0]?.size ?? 0;
      if (badge.userData.groupSize === size) return;
      if (badge.userData.groupSize !== undefined) badge.userData.changeRemaining = 0.45;
      badge.userData.groupSize = size;
      badge.material.map?.dispose();
      badge.material.map = this.makeQueueBadge(title, size ? `GROUP OF ${size}` : 'EMPTY', color);
      badge.material.needsUpdate = true;
    };
    updateBadge(this.mainQueueBadge, this.trackScope.current.toUpperCase() + ' GROUPS', mainQueue, this.layout.color);
    updateBadge(this.singleQueueBadge, 'SHARED SINGLE RIDERS', singleQueue, '#2dd4bf');
    const position = (npc: NPCData, x: number, z: number, direction: number) => {
      let mesh = this.npcMeshes.get(npc.id);
      if (!mesh) { mesh = this.createNPCMesh(npc); this.npcMeshes.set(npc.id, mesh); this.scene.add(mesh); }
      if (!npc.isWalking && !mesh.userData.isRider && !mesh.userData.isDeparting) {
        mesh.position.set(x, 0, z); mesh.rotation.y = direction * Math.PI / 2; mesh.visible = true;
      }
    };
    let row = MAIN_QUEUE_STOP_Z + 0.4;
    for (const group of mainQueue) {
      const rows = Math.ceil(group.size / 4);
      if (row + (rows - 1) * 0.55 > 12) break;
      group.members.forEach((npc, index) => {
        const columns = Math.min(4, group.size - Math.floor(index / 4) * 4);
        position(npc, this.layout.queueX + (index % 4 - (columns - 1) / 2) * 0.5, row + Math.floor(index / 4) * 0.55, this.layout.direction);
        const mesh = this.npcMeshes.get(npc.id)!; mesh.userData.queueTrack = this.trackScope.current;
      });
      row += rows * 0.55 + 0.7;
    }
    singleQueue.slice(0, 10).forEach((group, index) => {
      if (group.members[0]) position(group.members[0], SINGLE_QUEUE_STOP_X, SINGLE_QUEUE_STOP_Z - index * 0.85, -1);
    });
  }

  // --- Assign Group Pathfinding Walk Animation ---
  public walkGroupToGates(group: GroupData, assignments: { gateIndex: number; seatSlot: number; npc: NPCData }[]) {
    const direction = this.layout.direction;
    const aisleX = direction * 5.6;
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
      const routeZ = group.type === 'single' ? -1.8 : 2.2;
      const gateZ = GATE_Z_POSITIONS[assign.gateIndex];
      // Front row: slot 0 & 1 at GATE_LINE_X
      // Queue row behind: slot 2 & 3 at GATE_LINE_X + 0.65
      const isQueueRow = assign.seatSlot >= 2;
      const slotZOffset = (assign.seatSlot % 2 === 0) ? 0.28 : -0.28;
      const targetX = this.layout.gateX - (isQueueRow ? direction * 0.65 : 0);

      // Leave through the queue mouth, follow this side's boarding aisle, then enter the gate.
      const waypoints = [
        startPos,
        new THREE.Vector3(startPos.x, 0, routeZ),
        new THREE.Vector3(aisleX, 0, routeZ),
        new THREE.Vector3(aisleX, 0, gateZ),
        new THREE.Vector3(targetX, 0, gateZ + slotZOffset),
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
          mesh!.position.set(targetX, 0, gateZ + slotZOffset);
          mesh!.rotation.y = direction * Math.PI / 2; // Face the assigned track
        },
      });
    });
  }

  // --- Update Hovered Gate (Pre-selection Stage) ---
  public setHoveredGate(gateIndex: number | null) {
    if (!this.selectedGroup || gateIndex === null) {
      this.hoveredGateIndex = null;
    } else {
      this.hoveredGateIndex = gateIndex;
    }
    this.updateGateHighlights();
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

  public updateGateHighlights() {
    this.gateGhostHighlights.forEach((g, idx) => {
      const isSelected = this.trackScope.current === this.activeTrack && this.selectedGateIndices.includes(idx);
      const isHovered = this.trackScope.current === this.activeTrack && this.hoveredGateIndex === idx;

      if (isSelected) {
        // Confirmed Selected Gate: Vibrant Sky Blue
        (g.material as THREE.MeshBasicMaterial).color.set('#38bdf8');
        (g.material as THREE.MeshBasicMaterial).opacity = 0.75;
      } else {
        (g.material as THREE.MeshBasicMaterial).opacity = 0;
      }

      // Under-gate floor line - ONLY appears if currently hovered (even if selected)
      const floorLine = this.gateFloorLines[idx];
      if (floorLine) {
        if (isHovered) {
          (floorLine.material as THREE.MeshBasicMaterial).color.set('#f59e0b');
          (floorLine.material as THREE.MeshBasicMaterial).opacity = 0.95;
        } else {
          (floorLine.material as THREE.MeshBasicMaterial).opacity = 0.0;
        }
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
      const frontCount = Math.min(2, occCount);
      const queueCount = Math.max(0, occCount - 2);

      // Front row light (Ready for train)
      let frontCol = '#ef4444';
      let frontEmissive = '#dc2626';
      if (frontCount === 1) {
        frontCol = '#f59e0b';
        frontEmissive = '#d97706';
      } else if (frontCount === 2) {
        frontCol = '#10b981';
        frontEmissive = '#059669';
      }

      (ind.lightMesh.material as THREE.MeshStandardMaterial).color.set(frontCol);
      (ind.lightMesh.material as THREE.MeshStandardMaterial).emissive.set(frontEmissive);

      // Queue row floor light (Behind front row)
      if (ind.queueLightMesh) {
        let queueCol = '#1e293b';
        let queueEmissive = '#0f172a';
        if (queueCount === 1) {
          queueCol = '#f59e0b';
          queueEmissive = '#b45309';
        } else if (queueCount === 2) {
          queueCol = '#38bdf8';
          queueEmissive = '#0284c7';
        }
        (ind.queueLightMesh.material as THREE.MeshStandardMaterial).color.set(queueCol);
        (ind.queueLightMesh.material as THREE.MeshStandardMaterial).emissive.set(queueEmissive);
      }

      // Border and accent color for overhead sign
      const headerBorderCol = occCount === 4 ? '#38bdf8' : frontCount === 2 ? '#10b981' : frontCount === 1 ? '#f59e0b' : '#ef4444';

      // Redraw overhead gate label
      const gCanvas = document.createElement('canvas');
      gCanvas.width = 256;
      gCanvas.height = 128;
      const ctx = gCanvas.getContext('2d')!;
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, 256, 128);
      ctx.strokeStyle = headerBorderCol;
      ctx.lineWidth = 8;
      ctx.strokeRect(4, 4, 248, 120);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 50px "Chakra Petch", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`GATE 0${i + 1}`, 128, 44);
      ctx.fillStyle = headerBorderCol;
      ctx.font = 'bold 32px "JetBrains Mono", monospace';
      ctx.fillText(`${occCount} / 4`, 128, 88);

      const tex = new THREE.CanvasTexture(gCanvas);
      ind.labelMesh.material.map?.dispose();
      ind.labelMesh.material.map = tex;
      ind.labelMesh.material.needsUpdate = true;
    }

    this.updateConsoleScreen();
  }

  // --- Preview Group Hover Over Gates ---
  public updateGateHoverPreview(hoverGateIndex: number | null, group: GroupData | null) {
    if (!group) {
      if (this.hoveredGateIndex !== null) {
        this.hoveredGateIndex = null;
        this.callbacks.onGateHover?.(null);
      }
      this.updateGateHighlights();
      return;
    }

    if (hoverGateIndex !== null && this.hoveredGateIndex !== hoverGateIndex) {
      this.hoveredGateIndex = hoverGateIndex;
      this.callbacks.onGateHover?.(hoverGateIndex);
    }
    this.updateGateHighlights();
  }

  public isTrackInTransit(track: TrackType) {
    return this.withTrack(track, () => !!(this.dispatchSequence || this.resetAnimation));
  }

  // --- Dispatch State Trigger ---
  public triggerDispatchAnimation(onFinishDispatch: () => void) {
    if (this.dispatchSequence || this.resetAnimation || this.isPaused) return;
    this.currentGameState = 'DISPATCH_STATE';
    this.trainSpeedZ = 0;
    this.lapBarAngle = 0;
    soundEngine.playDispatchButton();
    const riders: NonNullable<RideStation3D['dispatchSequence']>['riders'] = [];
    const boardingIds = new Set<string>();
    this.gatesState.forEach((g, gIdx) => {
      g.occupants.slice(0, 2).forEach((npc, slotIdx) => {
        boardingIds.add(npc.id);
        npc.isWalking = false;
        const mesh = this.npcMeshes.get(npc.id);
        if (mesh) {
          mesh.userData.isRider = true;
          riders.push({
            mesh,
            start: mesh.getWorldPosition(new THREE.Vector3()),
            seat: new THREE.Vector3(this.layout.trackX + (slotIdx === 0 ? 0.4 : -0.4),
              0.42 + 0.38 * (npc.height || 1), VEHICLE_Z_CENTERS[Math.floor(gIdx / 2)] + (gIdx % 2 === 0 ? 0.65 : -0.65)),
            attached: false,
          });
        }
      });
    });
    // Boarding owns these meshes now; their earlier gate walks must not compete.
    this.walkingNPCs = this.walkingNPCs.filter(walker => !boardingIds.has(walker.npc.id));
    this.dispatchSequence = { elapsed: 0, launched: false, restraintsLocked: false, lastProgress: '', onFinish: onFinishDispatch, riders };
    this.updateDispatchAnimation(0);
  }

  private updateDispatchAnimation(delta: number) {
    const sequence = this.dispatchSequence;
    if (!sequence || this.isPaused) return;
    sequence.elapsed += delta;
    const elapsed = sequence.elapsed;
    const smooth = (value: number) => THREE.MathUtils.smoothstep(value, 0, 1);
    const gateOpen = smooth(elapsed / 0.6) * (1 - smooth((elapsed - 2.6) / 0.6));
    this.gateIndicators.forEach(ind => { ind.gateBarrier.rotation.y = -Math.PI / 2.2 * gateOpen; });

    const activeTrainGroup = this.activeTrain?.group || this.trainGroup;
    const boardingProgress = smooth((elapsed - 0.6) / 2);
    for (const rider of sequence.riders) {
      if (rider.attached) continue;
      const seatWorld = activeTrainGroup.localToWorld(rider.seat.clone());
      rider.mesh.position.lerpVectors(rider.start, seatWorld, boardingProgress);
      rider.mesh.rotation.y = -Math.PI / 2;
      const seated = smooth((elapsed - 2.1) / 0.5);
      const stride = elapsed > 0.6 ? Math.sin(elapsed * 12) * 0.4 * (1 - seated) : 0;
      const leftLeg = rider.mesh.getObjectByName('leftLeg');
      const rightLeg = rider.mesh.getObjectByName('rightLeg');
      if (leftLeg) leftLeg.rotation.x = seated * Math.PI / 2.2 + stride;
      if (rightLeg) rightLeg.rotation.x = seated * Math.PI / 2.2 - stride;
      if (boardingProgress === 1) {
        activeTrainGroup.attach(rider.mesh);
        rider.mesh.position.copy(rider.seat);
        rider.attached = true;
      }
    }

    if (elapsed >= 3.2 && !sequence.restraintsLocked) {
      sequence.restraintsLocked = true;
      this.lapBarAngle = Math.PI / 2.3;
      soundEngine.playLapBarsLock();
    }
    const label = elapsed < 0.6 ? 'Opening boarding gates' : elapsed < 2.6 ? 'Riders boarding'
      : elapsed < 3.2 ? 'Closing boarding gates' : elapsed < 4.3 ? 'Securing restraints'
      : elapsed < 5 ? 'All clear' : 'Train departing';
    const seconds = Math.max(0, Math.ceil(5 - elapsed));
    if (`${label}:${seconds}` !== sequence.lastProgress) {
      sequence.lastProgress = `${label}:${seconds}`;
      this.callbacks.onDispatchProgress?.(label, seconds, this.trackScope.current);
    }

    // The train remains stationary for the full five-second boarding sequence.
    if (elapsed >= 5 && !sequence.launched) {
      sequence.launched = true;
      soundEngine.playCoasterLaunch();
      this.trainSpeedZ = 1.2;
      if (this.launchParticles) {
        (this.launchParticles.material as THREE.PointsMaterial).opacity = 0.9;
      }
    }
    if (elapsed >= 6.8) {
      this.dispatchSequence = null;
      sequence.onFinish();
    }
  }

  /** The train already captured its riders. Remaining gate occupants belong to the next train. */
  public releaseBoardingRow(gates: GateState[]) {
    this.updateGates(gates);
    const facing = this.layout.direction * Math.PI / 2;
    // Once the departing train clears, staged riders walk into the boarding row.
    this.gatesState.forEach((gate, gateIndex) => {
      gate.occupants.forEach((npc, slot) => {
        const mesh = this.npcMeshes.get(npc.id);
        if (!mesh) return;
        this.walkingNPCs = this.walkingNPCs.filter(walker => walker.npc.id !== npc.id);
        const target = new THREE.Vector3(this.layout.gateX, 0, GATE_Z_POSITIONS[gateIndex] + (slot === 0 ? 0.28 : -0.28));
        npc.isWalking = true;
        this.walkingNPCs.push({
          npc, mesh, waypoints: [mesh.position.clone(), target], currentSegment: 0, segmentProgress: 0, speed: 3.2,
          onComplete: () => {
            npc.isWalking = false;
            mesh.position.copy(target);
            mesh.rotation.y = facing;
            for (const name of ['leftLeg', 'rightLeg']) {
              const leg = mesh.getObjectByName(name);
              if (leg) leg.rotation.x = 0;
            }
          },
        });
      });
    });


  }

  // --- Reset Next Train from Queue Animation ---
  public triggerResetAnimation(onFinishReset: () => void) {
    this.currentGameState = 'RESET_STATE';

    // 1. Remove dispatched rider NPC meshes from scene and train groups
    const toDeleteIds: string[] = [];
    this.npcMeshes.forEach((mesh, id) => {
      if (this.activeTrain && mesh.parent === this.activeTrain.group) {
        if (mesh.parent) mesh.parent.remove(mesh);
        this.scene.remove(mesh);
        toDeleteIds.push(id);
      }
    });
    toDeleteIds.forEach(id => {
      this.guestReactions.forget(id);
      this.npcMeshes.delete(id);
    });

    // 2. Safely remove dispatched train from scene
    if (this.activeTrain) {
      this.scene.remove(this.activeTrain.group);
    }

    // 3. Close gate barriers back
    this.gateIndicators.forEach(ind => {
      ind.gateBarrier.rotation.y = 0;
    });

    // 4. Pop the next waiting train from queue (at Z = -17) to become incoming station train
    const incomingTrain = this.waitingTrainQueue.shift() || this.createTrainInstance(this.trainColorPalette[1], -17, this.layout.trackX);
    this.activeTrain = incomingTrain;
    this.trainGroup = incomingTrain.group;
    this.vehicleMeshes = incomingTrain.vehicleMeshes;
    this.lapBarGroups = incomingTrain.lapBarGroups;
    this.trainSpeedZ = 0;
    this.lapBarAngle = 0;

    // Cycle train color palette and spawn a new train at the back of the queue (Z = -68)
    const nextColor = this.trainColorPalette[this.trainColorCounter % this.trainColorPalette.length];
    this.trainColorCounter++;
    const newQueueTrain = this.createTrainInstance(nextColor, -68, this.layout.trackX);
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

    let elapsed = 0;
    const resetTrack = this.trackScope.current;
    this.resetAnimation = (delta) => this.withTrack(resetTrack, () => {
      elapsed += delta;
      const t = Math.min(1, elapsed / 1.3);
      // Smooth cubic ease out curve
      const easeOut = 1 - Math.pow(1 - t, 3);

      movingTrains.forEach(item => {
        item.train.group.position.z = item.startZ + (item.targetZ - item.startZ) * easeOut;
      });

      if (t === 1) {
        this.resetAnimation = null;
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
    });

  }

  public resetRide() {
    this.guestReactions.reset();
    for (const track of TRACKS) this.withTrack(track, () => {
    this.dispatchSequence = null;
    this.resetAnimation = null;
    this.trainSpeedZ = 0;
    this.lapBarAngle = 0;
    this.trainGroup.position.z = 0;
    this.waitingTrainQueue.forEach((train, index) => { train.group.position.z = -(index + 1) * 17; });
    this.gateIndicators.forEach(ind => { ind.gateBarrier.rotation.y = 0; });
    this.lapBarGroups.forEach(group => group.children.forEach(bar => { bar.rotation.x = 0; }));
    if (this.launchParticles) (this.launchParticles.material as THREE.PointsMaterial).opacity = 0;
    });
    this.walkingNPCs = [];
    this.npcMeshes.forEach(mesh => mesh.removeFromParent());
    this.npcMeshes.clear();
    this.gateIndicators.forEach(ind => { ind.gateBarrier.rotation.y = 0; });
    this.lapBarGroups.forEach(group => group.children.forEach(bar => { bar.rotation.x = 0; }));
    if (this.launchParticles) (this.launchParticles.material as THREE.PointsMaterial).opacity = 0;
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
    if (this.trackScope.current !== this.activeTrack) return;
    for (const track of TRACKS) {
      const highlight = this.tracks[track].mainQueueHighlight;
      if (highlight) highlight.visible = group?.type === 'main' && this.tracks[track].lastMainQueue.some(item => item.id === group.id);
    }
    if (this.singleQueueHighlight) this.singleQueueHighlight.visible = group?.type === 'single';
    if (!group) {
      this.hoveredGateIndex = null;
      this.updateGateHighlights();
    }
  }

  public showSplitDisappointment(group: GroupData) {
    this.guestReactions.showSplitDisappointment(group);
  }

  public setPatience(patience: number) {
    this.currentPatience = Math.max(0, Math.min(100, patience));
    this.updateConsoleScreen();
  }

  public setQueuePressure(pressure: QueuePressure) {
    this.queuePressure = pressure;
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
      this.controllerMove.set(0, 0);
      this.controllerLook.set(0, 0);
      this.controllerSprint = false;
    }
  }

  /** Analog controller input works with or without pointer lock. */
  public setControllerInput(moveX: number, moveY: number, lookX: number, lookY: number, sprint: boolean) {
    this.controllerMove.set(moveX, moveY);
    this.controllerLook.set(lookX, lookY);
    this.controllerSprint = sprint;
  }

  public controllerJump() {
    if (this.isGrounded && !this.isPaused) {
      this.playerVelocityY = this.JUMP_FORCE;
      this.isGrounded = false;
      soundEngine.playJump();
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

  public setActiveTrack(track: TrackType) {
    this.activeTrack = track;
    this.trackScope.current = track;
    for (const side of TRACKS) this.withTrack(side, () => this.updateGateHighlights());
    this.updateConsoleScreen();
  }

  public removeDepartedGroup(groupId: string) {
    for (const [id, mesh] of this.npcMeshes) {
      const npc = mesh.userData.npc as NPCData | undefined;
      if (!npc || npc.groupId !== groupId || npc.isWalking || mesh.userData.isRider || mesh.userData.isDeparting) continue;
      mesh.userData.isDeparting = true;
      npc.isWalking = true;
      const start = mesh.position.clone().setY(0);
      const outside = start.clone().setX(npc.sourceQueue === 'single' ? 1.4 : start.x < 0 ? -1.5 : 1.5);
      const exit = outside.clone().setZ(npc.sourceQueue === 'single' ? -16 : 16);
      this.walkingNPCs.push({
        npc, mesh, waypoints: [start, outside, exit], currentSegment: 0, segmentProgress: 0, speed: 2.2,
        onComplete: () => {
          this.guestReactions.forget(id);
          mesh.removeFromParent();
          this.npcMeshes.delete(id);
          npc.isWalking = false;
        },
      });
    }
  }

  // --- Input & Event Handling ---
  private setupEventListeners() {
    const { signal } = this.eventListenerController;
    window.addEventListener('resize', this.onWindowResize.bind(this), { signal });
    window.addEventListener('keydown', this.onKeyDown.bind(this), { signal });
    window.addEventListener('keyup', this.onKeyUp.bind(this), { signal });

    const dom = this.container;

    // Left click selects/deselects gates; right click confirms the active grouping.
    dom.addEventListener('pointerdown', (e) => {
      if (this.isPaused) return;
      if (e.button === 0) {
        if (!this.isPointerLocked) {
          this.requestPointerLock();
        }
        this.handleGateSelectionClick(e);
      }
    }, { signal });

    // Right click confirms grouping and suppresses the browser context menu.
    dom.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.callbacks.onConfirmGrouping?.();
    }, { signal });

    // Mouse buttons: 2 = Right Click to confirm grouping.
    dom.addEventListener('mousedown', (e) => {
      if (e.button === 2) {
        e.preventDefault();
        this.callbacks.onConfirmGrouping?.();
      }
    }, { signal });

    // Scroll selects the mirrored inside/outside loading line without changing gate choices.
    dom.addEventListener('wheel', (e) => {
      if (this.isPaused || e.deltaY === 0) return;
      e.preventDefault();
      this.callbacks.onSwitchTrack?.();
    }, { passive: false, signal });

    // Suppress browser forward/back navigation on mouse buttons 3 and 4
    window.addEventListener('mouseup', (e) => {
      if (e.button === 3 || e.button === 4) {
        e.preventDefault();
        e.stopPropagation();
      }
    }, { capture: true, signal });

    window.addEventListener('auxclick', (e) => {
      if (e.button === 3 || e.button === 4) {
        e.preventDefault();
        e.stopPropagation();
      }
    }, { capture: true, signal });

    document.addEventListener('mousemove', (e) => {
      if (this.isPointerLocked && !this.isPaused) {
        this.cameraEuler.y -= e.movementX * this.mouseSensitivity;
        this.cameraEuler.x -= e.movementY * this.mouseSensitivity;
        this.cameraEuler.x = Math.max(-Math.PI / 2.3, Math.min(Math.PI / 2.3, this.cameraEuler.x));
        this.camera.quaternion.setFromEuler(this.cameraEuler);
      }
    }, { signal });

    // Pointer lock change listeners
    document.addEventListener('pointerlockchange', () => {
      this.isPointerLocked = document.pointerLockElement === this.container;
    }, { signal });
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
      this.callbacks.onSelectMainQueue(this.currentHoverTarget.track);
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

    // Interact Key (E): Interacts with queue lines or dispatch button
    if (e.code === (kb?.interact || 'KeyE') || e.code === 'KeyE' || e.code === 'KeyF') {
      this.handleInteraction();
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

  private lastGateSelectionClickTime = 0;

  // Left click is reserved for selecting and deselecting a gate.
  public handleGateSelectionClick(e?: MouseEvent | PointerEvent) {
    const now = Date.now();
    if (now - this.lastGateSelectionClickTime < 150) {
      return;
    }
    this.lastGateSelectionClickTime = now;

    // Do NOT allow selecting gates if no queue is selected!
    if (!this.selectedGroup) {
      return;
    }

    if (this.currentHoverTarget.type === 'gate' && this.currentHoverTarget.track && this.currentHoverTarget.track !== this.activeTrack) {
      this.callbacks.onSelectTrack?.(this.currentHoverTarget.track);
      this.callbacks.onGateHover?.(this.currentHoverTarget.index ?? null);
      return;
    }
    // Selection always applies to the active underline, never to the gate under
    // the cursor or crosshair. This keeps multi-gate selection stable.
    if (this.hoveredGateIndex !== null) {
      this.callbacks.onToggleGateSelection?.(this.hoveredGateIndex);
      return;
    }
  }

  // Interacting with queues and dispatch occurs ONLY via the 'E' key
  public handleInteraction() {
    // 1. Direct crosshair target check
    if (this.currentHoverTarget.type === 'main_queue') {
      this.callbacks.onSelectMainQueue(this.currentHoverTarget.track);
      return;
    }
    if (this.currentHoverTarget.type === 'single_queue') {
      this.callbacks.onSelectSingleQueue();
      return;
    }
    if (this.currentHoverTarget.type === 'dispatch_button' || this.currentHoverTarget.type === 'dispatch_button_inside' || this.currentHoverTarget.type === 'dispatch_button_outside') {
      if (this.callbacks.onTriggerDispatchTrack) this.callbacks.onTriggerDispatchTrack(this.currentHoverTarget.track ?? this.activeTrack);
      else this.callbacks.onTriggerDispatch();
      return;
    }

  }

  // --- Raycast Target Evaluation ---
  private updateRaycasting() {
    this.raycaster.setFromCamera(this.screenCenter, this.camera);
    const intersects = this.raycaster.intersectObjects(this.interactables, false);

    let newTarget: InteractionTarget = { type: 'none', label: '', description: '' };

    if (intersects.length > 0) {
      const hit = intersects[0].object;
      const hitName = hit.name;

      if (hitName.endsWith('_main_queue_stop')) {
        newTarget = {
          type: 'main_queue',
          track: hitName.startsWith('outside') ? 'outside' : 'inside',
          label: (hitName.startsWith('outside') ? 'OUTSIDE' : 'INSIDE') + ' GROUP QUEUE',
          description: this.selectedGroup ? 'Switch to Main Queue [E]' : 'Call Main Queue [E]',
          isValid: true,
        };
      } else if (hitName === 'single_queue_stop') {
        newTarget = {
          type: 'single_queue',
          label: 'SINGLE RIDER STOP LINE',
          description: this.selectedGroup ? 'Switch to Single Rider [E]' : 'Call Single Rider [E]',
          isValid: true,
        };
      } else if (hitName.startsWith('inside_gate_') || hitName.startsWith('outside_gate_')) {
        const isOutsideGate = hitName.startsWith('outside_gate_');
        const gateIdx = parseInt(hitName.replace(isOutsideGate ? 'outside_gate_' : 'inside_gate_', ''), 10);
        const track: TrackType = isOutsideGate ? 'outside' : 'inside';
        const gate = this.tracks[track].gatesState[gateIdx];
        const occ = gate ? gate.occupants.length : 0;
        const isSelected = this.selectedGateIndices.includes(gateIdx);

        if (this.selectedGroup) {
          newTarget = {
            type: 'gate',
            track,
            index: gateIdx,
            label: `${isOutsideGate ? 'OUTSIDE ' : ''}GATE 0${gateIdx + 1} (${occ}/4)${isSelected ? ' [SELECTED]' : ''}`,
            description: isSelected
              ? `Left Click to Deselect Gate • Right Click / Enter to Let Group Go`
              : `Left Click to SELECT Gate • Forward/Back to Cycle Gate`,
            isValid: true,
          };
        } else {
          newTarget = {
            type: 'gate',
            index: gateIdx,
            label: `GATE 0${gateIdx + 1} (${occ}/4)`,
            description: `Call a Queue First [E] to Assign Groups`,
            isValid: false,
          };
        }
      } else if (hitName === 'dispatch_button_inside' || hitName === 'dispatch_button_outside') {
        const track: TrackType = hitName === 'dispatch_button_outside' ? 'outside' : 'inside';
        const canDispatch = this.tracks[track].currentGameState === 'READY_STATE';
        newTarget = {
          type: track === 'inside' ? 'dispatch_button_inside' : 'dispatch_button_outside',
          track,
          label: `${track.toUpperCase()} DISPATCH`,
          description: canDispatch ? `TRIGGER ${track.toUpperCase()} DISPATCH! [E]` : 'Fill at least 1 seat before dispatching',
          isValid: canDispatch,
        };
      }
    }

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
      this.clock.getDelta();
      this.renderer.render(this.scene, this.camera);
      return;
    }

    const delta = Math.min(this.clock.getDelta(), 0.1);
    const time = this.clock.getElapsedTime();

    // Hover feedback only affects the underline.
    if (this.hoveredGateIndex !== null) {
      // Underline indication stays solid on the currently hovered gate.
      const line = this.gateFloorLines[this.hoveredGateIndex];
      if (line) {
        (line.material as THREE.MeshBasicMaterial).color.set('#ffffff');
        (line.material as THREE.MeshBasicMaterial).opacity = 0.95;
      }
    }

    // Keep selected gates consistently illuminated (sky blue ghost pads)
    // Floor underline is NOT shown on selected gates unless that gate is also currently hovered!
    this.selectedGateIndices.forEach((selIdx) => {
      const ghost = this.gateGhostHighlights[selIdx];
      if (ghost) {
        (ghost.material as THREE.MeshBasicMaterial).color.set('#38bdf8');
        (ghost.material as THREE.MeshBasicMaterial).opacity = 0.75;
      }
    });

    // 1. Move Player on Platform with Jump Gravity Physics
    this.cameraEuler.y -= this.controllerLook.x * this.mouseSensitivity * 900 * delta;
    this.cameraEuler.x -= this.controllerLook.y * this.mouseSensitivity * 900 * delta;
    this.cameraEuler.x = Math.max(-Math.PI / 2.3, Math.min(Math.PI / 2.3, this.cameraEuler.x));
    this.camera.quaternion.setFromEuler(this.cameraEuler);

    const speed = (this.isSprinting || this.controllerSprint ? 7.0 : 4.2) * delta;
    const moveDir = new THREE.Vector3();

    if (this.moveForward) moveDir.z -= 1;
    if (this.moveBackward) moveDir.z += 1;
    if (this.moveLeft) moveDir.x -= 1;
    if (this.moveRight) moveDir.x += 1;
    moveDir.x += this.controllerMove.x;
    moveDir.z += this.controllerMove.y;

    if (moveDir.lengthSq() > 0) {
      moveDir.normalize();
      // Rotate move direction relative to camera yaw
      moveDir.applyEuler(new THREE.Euler(0, this.cameraEuler.y, 0, 'YXZ'));
      this.playerPos.addScaledVector(moveDir, speed);

      // Clamping bounds to keep player on platform
      this.playerPos.x = Math.max(-6.4, Math.min(6.4, this.playerPos.x));
      this.playerPos.z = Math.max(-13.5, Math.min(13.5, this.playerPos.z));
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

    const inside = this.tracks.inside, outside = this.tracks.outside;
    const loading = (state: GameState) => state !== 'GAME_OVER' && state !== 'PAUSED';
    for (const event of this.guestReactions.update(delta, inside.lastMainQueue, this.lastSingleQueue,
      inside.queuePressure, this.isZenMode, loading(inside.currentGameState),
      { queue: outside.lastMainQueue, pressure: outside.queuePressure, loading: loading(outside.currentGameState) })) {
      this.callbacks.onGuestReactionEvent?.(event);
    }

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

    for (const track of TRACKS) this.withTrack(track, () => {
    this.resetAnimation?.(delta);
    this.updateDispatchAnimation(delta);

    // 3. Animate Train in Dispatch / Launch (Accelerate forward down track to positive Z)
    if (this.dispatchSequence?.launched) {
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

    });

    // 5. Pulsing visual indicators (Dispatch button glow, badges floating)
    if (this.dispatchButtonMesh && this.currentGameState === 'READY_STATE') {
      const pulse = 0.8 + Math.sin(time * 6) * 0.35;
      (this.dispatchButtonMesh.material as THREE.MeshStandardMaterial).emissiveIntensity = pulse;
    }

    for (const badge of [this.tracks.inside.mainQueueBadge, this.tracks.outside.mainQueueBadge, this.singleQueueBadge]) {
      if (!badge) continue;
      const remaining = Math.max(0, (badge.userData.changeRemaining ?? 0) - delta);
      badge.userData.changeRemaining = remaining;
      const pop = Math.sin((1 - remaining / 0.45) * Math.PI) * (remaining > 0 ? 0.16 : 0);
      badge.scale.set(2.8 * (1 + pop), 0.98 * (1 + pop), 1);
      badge.position.y = 3.1 + pop * 0.5;
    }
    if (this.mainQueueHighlight?.visible) {
      this.mainQueueHighlight.material.opacity = 0.45 + Math.sin(time * 3.5) * 0.12;
      if (this.mainStopLineMesh) {
        (this.mainStopLineMesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.6 + Math.sin(time * 4) * 0.4;
        (this.mainStopLineMesh.material as THREE.MeshStandardMaterial).emissive.set('#f59e0b');
      }
    } else if (this.mainStopLineMesh) {
      (this.mainStopLineMesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.6;
      (this.mainStopLineMesh.material as THREE.MeshStandardMaterial).emissive.set('#1d4ed8');
    }

    if (this.singleQueueHighlight?.visible) {
      this.singleQueueHighlight.material.opacity = 0.45 + Math.sin(time * 3.5) * 0.12;
      if (this.singleStopLineMesh) {
        (this.singleStopLineMesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.6 + Math.sin(time * 4) * 0.4;
        (this.singleStopLineMesh.material as THREE.MeshStandardMaterial).emissive.set('#06b6d4');
      }
    } else if (this.singleStopLineMesh) {
      (this.singleStopLineMesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.6;
      (this.singleStopLineMesh.material as THREE.MeshStandardMaterial).emissive.set('#0891b2');
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
    this.guestReactions.dispose();
    // Remove every handler, including closures on the reused container, before
    // React mounts another scene. Otherwise stale gates receive clicks first.
    this.eventListenerController.abort();
    for (const track of TRACKS) this.withTrack(track, () => {
      this.dispatchSequence = null;
      this.resetAnimation = null;
    });
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
    }
  }
}
