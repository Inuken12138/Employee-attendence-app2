import '@babylonjs/loaders/glTF';

import {
  AbstractMesh,
  ArcRotateCamera,
  Color3,
  Color4,
  DirectionalLight,
  Engine,
  HavokPlugin,
  HemisphericLight,
  Mesh,
  MeshBuilder,
  PointerEventTypes,
  Scene,
  SceneLoader,
  ShadowGenerator,
  StandardMaterial,
  TransformNode,
  Vector3,
} from '@babylonjs/core';
import * as GUI from '@babylonjs/gui';
import HavokPhysics from '@babylonjs/havok';

import type { PlannerInteractionMode, PlannerNode, PlannerRoom } from '../types/planner';
import {
  MM_TO_SCENE,
  clampPositionToRoom,
  clampVerticalPosition,
  getCameraFrame,
  normalizeRotation,
  resolveNodePlacement,
  snapRotation,
} from './plannerMath';

interface PlannerRuntimeCallbacks {
  onSelectNode: (nodeId: string | null) => void;
  onDeleteNode: (nodeId: string) => void;
  onSetInteractionMode: (mode: PlannerInteractionMode) => void;
  onUpdateNodePosition: (nodeId: string, position: Partial<{ x: number; y: number; z: number }>) => void;
  onUpdateNodeRotation: (nodeId: string, rotationY: number) => void;
}

type RoomWallName = 'back' | 'left' | 'right';

interface PlannerRuntimeState {
  room: PlannerRoom;
  nodes: PlannerNode[];
  selectedNodeId: string | null;
  interactionMode: PlannerInteractionMode;
}

interface PlannerRuntimeOptions {
  canvas: HTMLCanvasElement;
  compact?: boolean;
  callbacks: PlannerRuntimeCallbacks;
}

interface PlannerRuntime {
  sync: (state: PlannerRuntimeState) => void;
  dispose: () => void;
}

interface NodeHandle {
  root: TransformNode;
  proxyMesh: Mesh;
  pickMesh: Mesh;
  contourMesh: Mesh;
  assetRoot: TransformNode | null;
  renderMeshes: AbstractMesh[];
  assetUrl: string | null;
  assetLoadId: number;
}

type DragState =
  | {
      type: 'move';
      nodeId: string;
      offsetX: number;
      offsetZ: number;
      planeY: number;
    }
  | {
      type: 'rotate';
      nodeId: string;
      startClientX: number;
      startRotationY: number;
    }
  | {
      type: 'vertical';
      nodeId: string;
      startClientY: number;
      startY: number;
    };

const FLOOR_COLOR = new Color3(0.917, 0.824, 0.671);
const PROXY_COLOR = new Color3(0.843, 0.875, 0.894);
const SELECT_COLOR = new Color3(0.345, 0.792, 1);
const HOVER_COLOR = new Color3(0.969, 0.769, 0.435);
const INVALID_COLOR = new Color3(1, 0.42, 0.42);
const WALL_COLORS = ['#d8d8d6', '#cfd0d2', '#e2e1df'];
const BASEBOARD_COLOR = '#f4f1ec';
const DRAG_VERTICAL_MM_PER_PIXEL = 4;
const ROOM_WALL_NAMES: RoomWallName[] = ['back', 'left', 'right'];
const CAMERA_PAN_LIMIT_RATIO = 0.18;
const CAMERA_MIN_TARGET_HEIGHT_RATIO = 0.18;
const CAMERA_MAX_TARGET_HEIGHT_RATIO = 0.58;
const BACK_WALL_HIDE_THRESHOLD = -0.28;
const SIDE_WALL_HIDE_THRESHOLD = 0.7;
const SIDE_ONLY_Z_THRESHOLD = 0.28;
const CORNER_HIDE_Z_THRESHOLD = -0.08;
const CORNER_HIDE_X_THRESHOLD = 0.38;

function clampValue(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function splitAssetUrl(url: string) {
  const lastSlashIndex = url.lastIndexOf('/');

  if (lastSlashIndex === -1) {
    return { rootUrl: '', sceneFilename: url };
  }

  return {
    rootUrl: url.slice(0, lastSlashIndex + 1),
    sceneFilename: url.slice(lastSlashIndex + 1),
  };
}

function setButtonState(button: GUI.Button, active: boolean) {
  button.background = active ? '#58caff' : 'rgba(255,255,255,0.92)';
  button.color = active ? '#ffffff' : '#2f2a23';
  button.thickness = active ? 0 : 1;
}

function disposeMeshes(meshes: AbstractMesh[]) {
  meshes.forEach((mesh) => mesh.dispose(false, true));
}

export async function createPlannerRuntime({ canvas, compact = false, callbacks }: PlannerRuntimeOptions): Promise<PlannerRuntime> {
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true, adaptToDeviceRatio: true });
  const scene = new Scene(engine);
  scene.clearColor = Color4.FromHexString('#ebe7e1ff');
  scene.fogMode = Scene.FOGMODE_LINEAR;
  scene.fogColor = Color3.FromHexString('#ebe7e1');
  scene.fogStart = 8;
  scene.fogEnd = 18;

  try {
    const havokInstance = await HavokPhysics();
    scene.enablePhysics(new Vector3(0, 0, 0), new HavokPlugin(true, havokInstance));
  } catch (error) {
    console.warn('Babylon Havok initialization failed; continuing without active physics scene.', error);
  }

  const initialFrame = getCameraFrame(undefined, compact);
  const camera = new ArcRotateCamera(
    'planner-camera',
    initialFrame.alpha,
    initialFrame.beta,
    initialFrame.radius,
    new Vector3(initialFrame.target.x, initialFrame.target.y, initialFrame.target.z),
    scene,
  );
  const attachCameraControls = () => {
    camera.attachControl(true, false, 2);
  };
  attachCameraControls();
  camera.lowerRadiusLimit = initialFrame.minRadius;
  camera.upperRadiusLimit = initialFrame.maxRadius;
  camera.wheelDeltaPercentage = 0.01;
  camera.useNaturalPinchZoom = true;
  camera.panningSensibility = 140;
  camera.inertia = 0.72;
  camera.upperBetaLimit = Math.PI / 2.03;
  canvas.oncontextmenu = (event) => {
    event.preventDefault();
  };

  const hemiLight = new HemisphericLight('planner-hemi', new Vector3(0, 1, 0), scene);
  hemiLight.intensity = 0.8;
  hemiLight.groundColor = new Color3(0.35, 0.34, 0.33);

  const dirLight = new DirectionalLight('planner-dir', new Vector3(-0.38, -1, 0.28), scene);
  dirLight.position = new Vector3(3.4, 5.8, 3.6);
  dirLight.intensity = 1.1;
  const shadowGenerator = new ShadowGenerator(1024, dirLight);
  shadowGenerator.useBlurExponentialShadowMap = true;
  shadowGenerator.blurKernel = 32;

  const roomRoot = new TransformNode('planner-room-root', scene);
  const roomWalls: Partial<Record<RoomWallName, Mesh>> = {};
  const roomBaseboards: Partial<Record<RoomWallName, Mesh>> = {};
  const nodeHandles = new Map<string, NodeHandle>();
  let roomSignature = '';
  let cameraSignature = '';
  let roomMeshes: Mesh[] = [];
  let currentState: PlannerRuntimeState = {
    room: {
      shape: 'rectangle',
      topMm: 4000,
      rightMm: 4000,
      bottomMm: 4000,
      leftMm: 4000,
      widthMm: 4000,
      depthMm: 4000,
      heightMm: 2500,
    },
    nodes: [],
    selectedNodeId: null,
    interactionMode: 'inspect',
  };
  let dragState: DragState | null = null;
  let hoveredNodeId: string | null = null;
  let pointerDownInfo: { x: number; y: number; nodeId: string | null; button: number } | null = null;
  let invalidNodeId: string | null = null;

  const ui = GUI.AdvancedDynamicTexture.CreateFullscreenUI('planner-ui', true, scene);
  const actionPanel = new GUI.StackPanel('planner-action-panel');
  actionPanel.isVertical = true;
  actionPanel.width = '356px';
  actionPanel.paddingBottom = '24px';
  actionPanel.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
  actionPanel.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_BOTTOM;
  actionPanel.isVisible = false;
  ui.addControl(actionPanel);

  const selectionLabel = new GUI.TextBlock('planner-selection-label', '');
  selectionLabel.height = '28px';
  selectionLabel.color = '#372f24';
  selectionLabel.fontSize = 15;
  selectionLabel.fontWeight = '600';
  selectionLabel.paddingBottom = '6px';
  actionPanel.addControl(selectionLabel);

  const feedbackLabel = new GUI.TextBlock('planner-feedback-label', '');
  feedbackLabel.height = '22px';
  feedbackLabel.color = '#7a6750';
  feedbackLabel.fontSize = 12;
  feedbackLabel.paddingBottom = '8px';
  actionPanel.addControl(feedbackLabel);

  const buttonRow = new GUI.StackPanel('planner-button-row');
  buttonRow.isVertical = false;
  buttonRow.height = '58px';
  buttonRow.spacing = 8;
  actionPanel.addControl(buttonRow);

  const moveButton = GUI.Button.CreateSimpleButton('planner-action-move', 'Move');
  const rotateButton = GUI.Button.CreateSimpleButton('planner-action-rotate', 'Rotate');
  const verticalButton = GUI.Button.CreateSimpleButton('planner-action-vertical', 'Lift');
  const deleteButton = GUI.Button.CreateSimpleButton('planner-action-delete', 'Delete');

  for (const button of [moveButton, rotateButton, verticalButton, deleteButton]) {
    button.width = '80px';
    button.height = '46px';
    button.cornerRadius = 24;
    button.color = '#2f2a23';
    button.background = 'rgba(255,255,255,0.92)';
    button.thickness = 1;
    button.fontSize = 14;
    button.fontWeight = '700';
    button.hoverCursor = 'pointer';
    button.shadowColor = 'rgba(84,74,56,0.12)';
    button.shadowBlur = 12;
    button.shadowOffsetY = 6;
    button.shadowOffsetX = 0;
    button.paddingLeft = '2px';
    button.paddingRight = '2px';
    buttonRow.addControl(button);
  }

  deleteButton.background = 'rgba(153, 27, 27, 0.95)';
  deleteButton.color = '#fff1f2';
  deleteButton.thickness = 0;

  function mutateLocalNode(nodeId: string, patch: Partial<PlannerNode>) {
    currentState = {
      ...currentState,
      nodes: currentState.nodes.map((node) => (node.nodeId === nodeId ? { ...node, ...patch } : node)),
    };
  }

  function mutateLocalNodePosition(nodeId: string, position: Partial<{ x: number; y: number; z: number }>) {
    currentState = {
      ...currentState,
      nodes: currentState.nodes.map((node) =>
        node.nodeId === nodeId
          ? {
              ...node,
              position: {
                ...node.position,
                ...position,
              },
            }
          : node,
      ),
    };
  }

  function setSelectedNode(nodeId: string | null) {
    currentState = {
      ...currentState,
      selectedNodeId: nodeId,
      interactionMode: nodeId ? currentState.interactionMode : 'inspect',
    };
    callbacks.onSelectNode(nodeId);
    if (!nodeId) {
      callbacks.onSetInteractionMode('inspect');
    }
    syncUi();
    syncNodeVisuals();
  }

  function setInteractionMode(mode: PlannerInteractionMode) {
    currentState = {
      ...currentState,
      interactionMode: mode,
    };
    callbacks.onSetInteractionMode(mode);
    syncUi();
  }

  function getSelectedNode() {
    return currentState.nodes.find((node) => node.nodeId === currentState.selectedNodeId) ?? null;
  }

  function syncCamera() {
    const nextSignature = JSON.stringify([
      currentState.room.widthMm,
      currentState.room.depthMm,
      currentState.room.heightMm,
      compact,
    ]);

    if (nextSignature === cameraSignature) {
      return;
    }

    cameraSignature = nextSignature;
    const frame = getCameraFrame(currentState.room, compact);
    camera.setTarget(new Vector3(frame.target.x, frame.target.y, frame.target.z));
    camera.alpha = frame.alpha;
    camera.beta = frame.beta;
    camera.radius = frame.radius;
    camera.lowerRadiusLimit = frame.minRadius;
    camera.upperRadiusLimit = frame.maxRadius;
  }

  function clampCameraTarget() {
    const roomWidth = currentState.room.widthMm * MM_TO_SCENE;
    const roomDepth = currentState.room.depthMm * MM_TO_SCENE;
    const roomHeight = currentState.room.heightMm * MM_TO_SCENE;
    const nextTarget = camera.target.clone();
    const xLimit = Math.max(roomWidth * CAMERA_PAN_LIMIT_RATIO, 0.28);
    const zLimit = Math.max(roomDepth * CAMERA_PAN_LIMIT_RATIO, 0.28);

    nextTarget.x = clampValue(nextTarget.x, -xLimit, xLimit);
    nextTarget.y = clampValue(
      nextTarget.y,
      Math.max(roomHeight * CAMERA_MIN_TARGET_HEIGHT_RATIO, 0.34),
      Math.max(roomHeight * CAMERA_MAX_TARGET_HEIGHT_RATIO, 0.92),
    );
    nextTarget.z = clampValue(nextTarget.z, -zLimit, zLimit);

    if (!camera.target.equalsWithEpsilon(nextTarget, 0.0001)) {
      camera.setTarget(nextTarget);
    }
  }

  function getHiddenWallNames() {
    const hiddenWalls = new Set<RoomWallName>();
    const roomHalfWidth = Math.max((currentState.room.widthMm * MM_TO_SCENE) / 2, 0.001);
    const roomHalfDepth = Math.max((currentState.room.depthMm * MM_TO_SCENE) / 2, 0.001);
    const xNorm = camera.position.x / roomHalfWidth;
    const zNorm = camera.position.z / roomHalfDepth;

    if (zNorm > SIDE_ONLY_Z_THRESHOLD) {
      return hiddenWalls;
    }

    if (zNorm <= CORNER_HIDE_Z_THRESHOLD && xNorm <= -CORNER_HIDE_X_THRESHOLD) {
      hiddenWalls.add('back');
      hiddenWalls.add('left');
      return hiddenWalls;
    }

    if (zNorm <= CORNER_HIDE_Z_THRESHOLD && xNorm >= CORNER_HIDE_X_THRESHOLD) {
      hiddenWalls.add('back');
      hiddenWalls.add('right');
      return hiddenWalls;
    }

    if (zNorm <= BACK_WALL_HIDE_THRESHOLD) {
      hiddenWalls.add('back');
      return hiddenWalls;
    }

    if (zNorm <= SIDE_ONLY_Z_THRESHOLD && xNorm <= -SIDE_WALL_HIDE_THRESHOLD) {
      hiddenWalls.add('left');
    } else if (zNorm <= SIDE_ONLY_Z_THRESHOLD && xNorm >= SIDE_WALL_HIDE_THRESHOLD) {
      hiddenWalls.add('right');
    }

    return hiddenWalls;
  }

  function syncWallVisibility() {
    const hiddenWalls = getHiddenWallNames();

    ROOM_WALL_NAMES.forEach((wallName) => {
      const visible = !hiddenWalls.has(wallName);
      roomWalls[wallName]?.setEnabled(visible);
      roomBaseboards[wallName]?.setEnabled(visible);
    });
  }

  function buildRoomMaterial(name: string, color: string) {
    const material = new StandardMaterial(name, scene);
    material.diffuseColor = Color3.FromHexString(color);
    material.specularColor = Color3.Black();
    material.roughness = 0.96;
    return material;
  }

  function rebuildRoom() {
    const nextSignature = JSON.stringify([
      currentState.room.widthMm,
      currentState.room.depthMm,
      currentState.room.heightMm,
    ]);

    if (nextSignature === roomSignature) {
      return;
    }

    roomSignature = nextSignature;
    roomMeshes.forEach((mesh) => mesh.dispose(false, true));
    roomMeshes = [];
    ROOM_WALL_NAMES.forEach((wallName) => {
      delete roomWalls[wallName];
      delete roomBaseboards[wallName];
    });

    const width = currentState.room.widthMm * MM_TO_SCENE;
    const depth = currentState.room.depthMm * MM_TO_SCENE;
    const height = currentState.room.heightMm * MM_TO_SCENE;

    const floor = MeshBuilder.CreateGround('planner-room-floor', { width, height: depth }, scene);
    floor.parent = roomRoot;
    floor.receiveShadows = true;
    const floorMaterial = new StandardMaterial('planner-room-floor-material', scene);
    floorMaterial.diffuseColor = FLOOR_COLOR;
    floorMaterial.specularColor = Color3.Black();
    floor.material = floorMaterial;

    const outerGround = MeshBuilder.CreateGround(
      'planner-room-outer-ground',
      { width: Math.max(width + 4, 8), height: Math.max(depth + 4, 8) },
      scene,
    );
    outerGround.parent = roomRoot;
    outerGround.position.y = -0.035;
    outerGround.receiveShadows = true;
    const outerMaterial = new StandardMaterial('planner-room-outer-ground-material', scene);
    outerMaterial.diffuseColor = Color3.FromHexString('#ece8df');
    outerMaterial.specularColor = Color3.Black();
    outerGround.material = outerMaterial;

    const wallSpecs = [
      { name: 'back', position: new Vector3(0, height / 2, -depth / 2), size: new Vector3(width, height, 0.045), color: WALL_COLORS[0] },
      { name: 'left', position: new Vector3(-width / 2, height / 2, 0), size: new Vector3(0.045, height, depth), color: WALL_COLORS[1] },
      { name: 'right', position: new Vector3(width / 2, height / 2, 0), size: new Vector3(0.045, height, depth), color: WALL_COLORS[2] },
    ];

    for (const spec of wallSpecs) {
      const wall = MeshBuilder.CreateBox(`planner-room-wall-${spec.name}`, {
        width: spec.size.x,
        height: spec.size.y,
        depth: spec.size.z,
      }, scene);
      wall.parent = roomRoot;
      wall.position = spec.position;
      wall.receiveShadows = true;
      wall.material = buildRoomMaterial(`planner-room-wall-${spec.name}-material`, spec.color);
      roomWalls[spec.name] = wall;
      roomMeshes.push(wall);
    }

    const baseboardSpecs = [
      { name: 'back', position: new Vector3(0, 0.04, -depth / 2 + 0.01), size: new Vector3(Math.max(width - 0.04, 0.04), 0.08, 0.02) },
      { name: 'left', position: new Vector3(-width / 2 + 0.01, 0.04, 0), size: new Vector3(0.02, 0.08, Math.max(depth - 0.04, 0.04)) },
      { name: 'right', position: new Vector3(width / 2 - 0.01, 0.04, 0), size: new Vector3(0.02, 0.08, Math.max(depth - 0.04, 0.04)) },
    ];

    for (const spec of baseboardSpecs) {
      const baseboard = MeshBuilder.CreateBox(`planner-room-baseboard-${spec.name}`, {
        width: spec.size.x,
        height: spec.size.y,
        depth: spec.size.z,
      }, scene);
      baseboard.parent = roomRoot;
      baseboard.position = spec.position;
      baseboard.material = buildRoomMaterial(`planner-room-baseboard-${spec.name}-material`, BASEBOARD_COLOR);
      roomBaseboards[spec.name] = baseboard;
      roomMeshes.push(baseboard);
    }

    roomMeshes.push(floor, outerGround);
    syncWallVisibility();
  }

  function disposeNodeAsset(handle: NodeHandle) {
    if (handle.assetRoot) {
      handle.assetRoot.dispose(false, true);
      handle.assetRoot = null;
    }

    handle.renderMeshes = [handle.proxyMesh];
    handle.assetUrl = null;
    handle.proxyMesh.isVisible = true;
    handle.pickMesh.isVisible = false;
  }

  function updateProxyDimensions(handle: NodeHandle, node: PlannerNode) {
    handle.proxyMesh.scaling.set(node.widthMm * MM_TO_SCENE, node.heightMm * MM_TO_SCENE, node.depthMm * MM_TO_SCENE);
    handle.pickMesh.scaling.set(node.widthMm * MM_TO_SCENE, node.heightMm * MM_TO_SCENE, node.depthMm * MM_TO_SCENE);
    handle.contourMesh.scaling.set(node.widthMm * MM_TO_SCENE + 0.02, node.heightMm * MM_TO_SCENE + 0.02, node.depthMm * MM_TO_SCENE + 0.02);
  }

  function updateNodeTransforms(handle: NodeHandle, node: PlannerNode) {
    handle.root.position.set(node.position.x * MM_TO_SCENE, node.position.y * MM_TO_SCENE, node.position.z * MM_TO_SCENE);
    handle.root.rotation.set(0, node.rotationY, 0);
    updateProxyDimensions(handle, node);
  }

  function applyRenderState(handle: NodeHandle, nodeId: string) {
    const selected = currentState.selectedNodeId === nodeId;
    const hovered = hoveredNodeId === nodeId;
    const invalid = invalidNodeId === nodeId;
    const contourColor = invalid ? INVALID_COLOR : selected ? SELECT_COLOR : HOVER_COLOR;

    handle.contourMesh.setEnabled(selected || hovered || invalid);
    handle.contourMesh.edgesColor = new Color4(contourColor.r, contourColor.g, contourColor.b, invalid || selected ? 1 : 0.72);
    handle.contourMesh.edgesWidth = invalid || selected ? 4 : 2;

    for (const mesh of handle.renderMeshes) {
      mesh.renderOverlay = selected || hovered || invalid;
      mesh.overlayColor = invalid ? INVALID_COLOR : selected ? SELECT_COLOR : HOVER_COLOR;
      mesh.overlayAlpha = invalid ? 0.3 : selected ? 0.18 : 0.11;
    }

    const proxyMaterial = handle.proxyMesh.material as StandardMaterial | null;
    if (proxyMaterial) {
      proxyMaterial.diffuseColor = selected ? SELECT_COLOR.scale(0.58).add(PROXY_COLOR.scale(0.42)) : PROXY_COLOR;
    }
  }

  function syncNodeVisuals() {
    nodeHandles.forEach((handle, nodeId) => {
      applyRenderState(handle, nodeId);
    });

    canvas.style.cursor = hoveredNodeId ? 'pointer' : 'default';
  }

  async function ensureNodeAsset(handle: NodeHandle, node: PlannerNode) {
    if (!node.glbFileUrl) {
      disposeNodeAsset(handle);
      return;
    }

    if (handle.assetUrl === node.glbFileUrl) {
      return;
    }

    disposeNodeAsset(handle);
    const loadId = handle.assetLoadId + 1;
    handle.assetLoadId = loadId;
    const { rootUrl, sceneFilename } = splitAssetUrl(node.glbFileUrl);

    try {
      const result = await SceneLoader.ImportMeshAsync(undefined, rootUrl, sceneFilename, scene);

      if (handle.assetLoadId !== loadId) {
        disposeMeshes(result.meshes);
        result.transformNodes.forEach((transformNode) => transformNode.dispose(false, true));
        return;
      }

      const assetRoot = new TransformNode(`${node.nodeId}-asset-root`, scene);
      assetRoot.parent = handle.root;

      const importedNodes = [...result.transformNodes, ...result.meshes];
      const topLevelNodes = importedNodes.filter((child) => !child.parent || child.parent === scene.rootNodes[0]);
      const parentNodes = topLevelNodes.length > 0 ? topLevelNodes : importedNodes;

      parentNodes.forEach((child) => {
        child.parent = assetRoot;
      });

      const renderMeshes = result.meshes.filter((mesh) => mesh !== handle.proxyMesh && mesh !== handle.pickMesh && mesh !== handle.contourMesh);
      renderMeshes.forEach((mesh) => {
        mesh.isPickable = false;
        mesh.receiveShadows = true;
        shadowGenerator.addShadowCaster(mesh, true);
      });

      let minX = Number.POSITIVE_INFINITY;
      let minY = Number.POSITIVE_INFINITY;
      let minZ = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      let maxY = Number.NEGATIVE_INFINITY;
      let maxZ = Number.NEGATIVE_INFINITY;

      renderMeshes.forEach((mesh) => {
        mesh.computeWorldMatrix(true);
        const box = mesh.getBoundingInfo().boundingBox;
        minX = Math.min(minX, box.minimumWorld.x);
        minY = Math.min(minY, box.minimumWorld.y);
        minZ = Math.min(minZ, box.minimumWorld.z);
        maxX = Math.max(maxX, box.maximumWorld.x);
        maxY = Math.max(maxY, box.maximumWorld.y);
        maxZ = Math.max(maxZ, box.maximumWorld.z);
      });

      if (renderMeshes.length > 0 && Number.isFinite(minX)) {
        const size = new Vector3(maxX - minX, maxY - minY, maxZ - minZ);
        const center = new Vector3(minX + size.x / 2, minY + size.y / 2, minZ + size.z / 2);
        const scaleX = (node.widthMm * MM_TO_SCENE) / Math.max(size.x, 0.0001);
        const scaleY = (node.heightMm * MM_TO_SCENE) / Math.max(size.y, 0.0001);
        const scaleZ = (node.depthMm * MM_TO_SCENE) / Math.max(size.z, 0.0001);

        assetRoot.scaling.set(scaleX, scaleY, scaleZ);
        assetRoot.position.set(-center.x * scaleX, -center.y * scaleY, -center.z * scaleZ);
      }

      handle.assetRoot = assetRoot;
      handle.renderMeshes = renderMeshes.length > 0 ? renderMeshes : [handle.proxyMesh];
      handle.assetUrl = node.glbFileUrl;
      handle.proxyMesh.isVisible = false;
      handle.pickMesh.isVisible = true;
      syncNodeVisuals();
    } catch (error) {
      console.warn(`Failed to load planner asset for ${node.nodeId}. Falling back to proxy box.`, error);
      handle.renderMeshes = [handle.proxyMesh];
      handle.proxyMesh.isVisible = true;
      handle.pickMesh.isVisible = false;
    }
  }

  function createNodeHandle(node: PlannerNode) {
    const root = new TransformNode(`planner-node-${node.nodeId}`, scene);

    const proxyMesh = MeshBuilder.CreateBox(`planner-node-proxy-${node.nodeId}`, { size: 1 }, scene);
    proxyMesh.parent = root;
    proxyMesh.receiveShadows = true;
    proxyMesh.isPickable = true;
    proxyMesh.metadata = { nodeId: node.nodeId };
    shadowGenerator.addShadowCaster(proxyMesh, true);
    const proxyMaterial = new StandardMaterial(`planner-node-proxy-material-${node.nodeId}`, scene);
    proxyMaterial.diffuseColor = PROXY_COLOR;
    proxyMaterial.specularColor = Color3.FromHexString('#474038');
    proxyMesh.material = proxyMaterial;

    const pickMesh = MeshBuilder.CreateBox(`planner-node-pick-${node.nodeId}`, { size: 1 }, scene);
    pickMesh.parent = root;
    const pickMaterial = new StandardMaterial(`planner-node-pick-material-${node.nodeId}`, scene);
    pickMaterial.alpha = 0.001;
    pickMaterial.disableLighting = true;
    pickMesh.material = pickMaterial;
    pickMesh.isPickable = true;
    pickMesh.metadata = { nodeId: node.nodeId };
    pickMesh.isVisible = false;

    const contourMesh = MeshBuilder.CreateBox(`planner-node-contour-${node.nodeId}`, { size: 1 }, scene);
    contourMesh.parent = root;
    const contourMaterial = new StandardMaterial(`planner-node-contour-material-${node.nodeId}`, scene);
    contourMaterial.alpha = 0;
    contourMaterial.disableLighting = true;
    contourMesh.material = contourMaterial;
    contourMesh.enableEdgesRendering();
    contourMesh.isPickable = false;
    contourMesh.setEnabled(false);

    const handle: NodeHandle = {
      root,
      proxyMesh,
      pickMesh,
      contourMesh,
      assetRoot: null,
      renderMeshes: [proxyMesh],
      assetUrl: null,
      assetLoadId: 0,
    };

    updateNodeTransforms(handle, node);
    nodeHandles.set(node.nodeId, handle);
    void ensureNodeAsset(handle, node);
  }

  function removeNodeHandle(nodeId: string) {
    const handle = nodeHandles.get(nodeId);

    if (!handle) {
      return;
    }

    handle.root.dispose(false, true);
    nodeHandles.delete(nodeId);
  }

  function syncNodes() {
    const liveIds = new Set(currentState.nodes.map((node) => node.nodeId));

    nodeHandles.forEach((_, nodeId) => {
      if (!liveIds.has(nodeId)) {
        removeNodeHandle(nodeId);
      }
    });

    currentState.nodes.forEach((node) => {
      const handle = nodeHandles.get(node.nodeId);

      if (!handle) {
        createNodeHandle(node);
        return;
      }

      updateNodeTransforms(handle, node);
      void ensureNodeAsset(handle, node);
    });

    syncNodeVisuals();
  }

  function syncUi() {
    const selectedNode = getSelectedNode();
    actionPanel.isVisible = Boolean(selectedNode);

    if (!selectedNode) {
      selectionLabel.text = '';
      feedbackLabel.text = '';
      verticalButton.isVisible = false;
      deleteButton.isVisible = false;
      setButtonState(moveButton, false);
      setButtonState(rotateButton, false);
      setButtonState(verticalButton, false);
      return;
    }

    selectionLabel.text = `${selectedNode.label} · ${Math.round((normalizeRotation(selectedNode.rotationY) * 180) / Math.PI)}°`;
    feedbackLabel.text = invalidNodeId === selectedNode.nodeId ? 'Collision blocked · move back into free space.' : 'Select Move, Rotate, Lift, or Delete.';
    verticalButton.isVisible = Boolean(selectedNode.allowVerticalMovement);
    deleteButton.isVisible = true;
    setButtonState(moveButton, currentState.interactionMode === 'move');
    setButtonState(rotateButton, currentState.interactionMode === 'rotate');
    setButtonState(verticalButton, currentState.interactionMode === 'vertical');
  }

  function getPickedNodeId(mesh: AbstractMesh | null | undefined) {
    let current: AbstractMesh | null | undefined = mesh;

    while (current) {
      if (typeof current.metadata?.nodeId === 'string') {
        return current.metadata.nodeId as string;
      }

      current = current.parent as AbstractMesh | null | undefined;
    }

    return null;
  }

  function updateHoveredNodeId(nodeId: string | null) {
    if (hoveredNodeId === nodeId) {
      return;
    }

    hoveredNodeId = nodeId;
    syncNodeVisuals();
  }

  function pickPointOnHorizontalPlane(yMm: number) {
    const ray = scene.createPickingRay(scene.pointerX, scene.pointerY, null, camera);
    const planeY = yMm * MM_TO_SCENE;
    const denominator = ray.direction.y;

    if (Math.abs(denominator) < 0.000001) {
      return null;
    }

    const distance = (planeY - ray.origin.y) / denominator;
    if (distance < 0) {
      return null;
    }

    return ray.origin.add(ray.direction.scale(distance));
  }

  function beginDrag(node: PlannerNode, event: PointerEvent) {
    if (currentState.interactionMode === 'inspect') {
      return;
    }

    if (currentState.interactionMode === 'move') {
      const hitPoint = pickPointOnHorizontalPlane(node.position.y);

      if (!hitPoint) {
        return;
      }

      dragState = {
        type: 'move',
        nodeId: node.nodeId,
        offsetX: node.position.x - hitPoint.x / MM_TO_SCENE,
        offsetZ: node.position.z - hitPoint.z / MM_TO_SCENE,
        planeY: node.position.y,
      };
      camera.detachControl();
      canvas.style.cursor = 'grabbing';
      event.preventDefault();
      return;
    }

    if (currentState.interactionMode === 'rotate') {
      dragState = {
        type: 'rotate',
        nodeId: node.nodeId,
        startClientX: event.clientX,
        startRotationY: node.rotationY,
      };
      camera.detachControl();
      canvas.style.cursor = 'grabbing';
      event.preventDefault();
      return;
    }

    if (currentState.interactionMode === 'vertical' && node.allowVerticalMovement) {
      dragState = {
        type: 'vertical',
        nodeId: node.nodeId,
        startClientY: event.clientY,
        startY: node.position.y,
      };
      camera.detachControl();
      canvas.style.cursor = 'grabbing';
      event.preventDefault();
    }
  }

  function endDrag() {
    dragState = null;
    invalidNodeId = null;
    feedbackLabel.text = getSelectedNode() ? 'Select an action, then drag the cabinet.' : '';
    attachCameraControls();
    canvas.style.cursor = hoveredNodeId ? 'pointer' : 'default';
    syncNodeVisuals();
  }

  function updateDrag(event: PointerEvent) {
    if (!dragState) {
      return;
    }

    const node = currentState.nodes.find((item) => item.nodeId === dragState?.nodeId);
    if (!node) {
      endDrag();
      return;
    }

    if (dragState.type === 'move') {
      const hitPoint = pickPointOnHorizontalPlane(dragState.planeY);

      if (!hitPoint) {
        return;
      }

      const desiredPosition = {
        x: hitPoint.x / MM_TO_SCENE + dragState.offsetX,
        y: node.position.y,
        z: hitPoint.z / MM_TO_SCENE + dragState.offsetZ,
      };
      const resolved = resolveNodePlacement(node, currentState.nodes, currentState.room, desiredPosition, node.rotationY);

      if (resolved.collides) {
        invalidNodeId = node.nodeId;
        syncUi();
        syncNodeVisuals();
        return;
      }

      invalidNodeId = null;
      mutateLocalNodePosition(node.nodeId, resolved.position);
      callbacks.onUpdateNodePosition(node.nodeId, resolved.position);

      if (resolved.rotationY !== node.rotationY) {
        mutateLocalNode(node.nodeId, { rotationY: resolved.rotationY });
        callbacks.onUpdateNodeRotation(node.nodeId, resolved.rotationY);
      }

      const handle = nodeHandles.get(node.nodeId);
      if (handle) {
        const nextNode = currentState.nodes.find((item) => item.nodeId === node.nodeId);
        if (nextNode) {
          updateNodeTransforms(handle, nextNode);
        }
      }

      syncUi();
      syncNodeVisuals();
      return;
    }

    if (dragState.type === 'rotate') {
      const desiredRotation = snapRotation(dragState.startRotationY - (event.clientX - dragState.startClientX) * 0.01);
      const resolved = resolveNodePlacement(node, currentState.nodes, currentState.room, node.position, desiredRotation);

      if (resolved.collides) {
        invalidNodeId = node.nodeId;
        syncUi();
        syncNodeVisuals();
        return;
      }

      invalidNodeId = null;
      mutateLocalNode(node.nodeId, { rotationY: resolved.rotationY });
      callbacks.onUpdateNodeRotation(node.nodeId, resolved.rotationY);
      const handle = nodeHandles.get(node.nodeId);
      if (handle) {
        const nextNode = currentState.nodes.find((item) => item.nodeId === node.nodeId);
        if (nextNode) {
          updateNodeTransforms(handle, nextNode);
        }
      }
      syncUi();
      syncNodeVisuals();
      return;
    }

    if (dragState.type === 'vertical') {
      const nextY = clampVerticalPosition(
        node,
        currentState.room,
        dragState.startY - (event.clientY - dragState.startClientY) * DRAG_VERTICAL_MM_PER_PIXEL,
      );
      const nextPosition = clampPositionToRoom(
        node,
        currentState.room,
        { ...node.position, y: nextY },
        node.rotationY,
      );
      const collides = resolveNodePlacement(node, currentState.nodes, currentState.room, nextPosition, node.rotationY).collides;

      if (collides) {
        invalidNodeId = node.nodeId;
        syncUi();
        syncNodeVisuals();
        return;
      }

      invalidNodeId = null;
      mutateLocalNodePosition(node.nodeId, { y: nextPosition.y });
      callbacks.onUpdateNodePosition(node.nodeId, { y: nextPosition.y });
      const handle = nodeHandles.get(node.nodeId);
      if (handle) {
        const nextNode = currentState.nodes.find((item) => item.nodeId === node.nodeId);
        if (nextNode) {
          updateNodeTransforms(handle, nextNode);
        }
      }
      syncUi();
      syncNodeVisuals();
    }
  }

  moveButton.onPointerUpObservable.add(() => {
    setInteractionMode(currentState.interactionMode === 'move' ? 'inspect' : 'move');
  });
  rotateButton.onPointerUpObservable.add(() => {
    setInteractionMode(currentState.interactionMode === 'rotate' ? 'inspect' : 'rotate');
  });
  verticalButton.onPointerUpObservable.add(() => {
    setInteractionMode(currentState.interactionMode === 'vertical' ? 'inspect' : 'vertical');
  });
  deleteButton.onPointerUpObservable.add(() => {
    const selectedNode = getSelectedNode();

    if (!selectedNode) {
      return;
    }

    hoveredNodeId = hoveredNodeId === selectedNode.nodeId ? null : hoveredNodeId;
    invalidNodeId = invalidNodeId === selectedNode.nodeId ? null : invalidNodeId;
    currentState = {
      ...currentState,
      nodes: currentState.nodes.filter((node) => node.nodeId !== selectedNode.nodeId),
      selectedNodeId: null,
      interactionMode: 'inspect',
    };
    removeNodeHandle(selectedNode.nodeId);
    callbacks.onDeleteNode(selectedNode.nodeId);
    syncUi();
    syncNodeVisuals();
  });

  scene.onPointerObservable.add((pointerInfo) => {
    const nativeEvent = pointerInfo.event as PointerEvent;

    if (pointerInfo.type === PointerEventTypes.POINTERMOVE) {
      if (dragState) {
        updateDrag(nativeEvent);
        return;
      }

      const pickResult = scene.pick(scene.pointerX, scene.pointerY, (mesh) => typeof mesh.metadata?.nodeId === 'string');
      updateHoveredNodeId(getPickedNodeId(pickResult?.pickedMesh));
      return;
    }

    if (pointerInfo.type === PointerEventTypes.POINTERDOWN) {
      const pickedNodeId = getPickedNodeId(pointerInfo.pickInfo?.pickedMesh as AbstractMesh | null | undefined);
      pointerDownInfo = {
        x: nativeEvent.clientX,
        y: nativeEvent.clientY,
        nodeId: pickedNodeId,
        button: nativeEvent.button,
      };

      if (nativeEvent.button !== 0) {
        return;
      }

      if (pickedNodeId) {
        camera.detachControl();
        const node = currentState.nodes.find((item) => item.nodeId === pickedNodeId);
        if (node && currentState.selectedNodeId === pickedNodeId) {
          beginDrag(node, nativeEvent);
        }
      }

      return;
    }

    if (pointerInfo.type === PointerEventTypes.POINTERUP) {
      const wasDragging = Boolean(dragState);
      if (dragState) {
        endDrag();
      }

      if (!pointerDownInfo) {
        return;
      }

      if (pointerDownInfo.button !== 0) {
        pointerDownInfo = null;
        return;
      }

      const delta = Math.hypot(nativeEvent.clientX - pointerDownInfo.x, nativeEvent.clientY - pointerDownInfo.y);
      const clickedNodeId = getPickedNodeId(pointerInfo.pickInfo?.pickedMesh as AbstractMesh | null | undefined);

      if (!wasDragging && delta < 6) {
        if (clickedNodeId) {
          setSelectedNode(clickedNodeId);
        } else {
          setSelectedNode(null);
        }
      }

      if (!dragState) {
        attachCameraControls();
        canvas.style.cursor = hoveredNodeId ? 'pointer' : 'default';
      }

      pointerDownInfo = null;
    }
  });

  engine.runRenderLoop(() => {
    clampCameraTarget();
    syncWallVisibility();
    scene.render();
  });

  const handleResize = () => {
    engine.resize();
  };
  window.addEventListener('resize', handleResize);

  return {
    sync(nextState) {
      currentState = {
        room: nextState.room,
        nodes: nextState.nodes,
        selectedNodeId: nextState.selectedNodeId,
        interactionMode: nextState.interactionMode,
      };
      rebuildRoom();
      syncCamera();
      syncNodes();
      syncUi();
    },
    dispose() {
      window.removeEventListener('resize', handleResize);
      nodeHandles.forEach((handle) => {
        handle.root.dispose(false, true);
      });
      roomMeshes.forEach((mesh) => mesh.dispose(false, true));
      ui.dispose();
      scene.dispose();
      engine.dispose();
    },
  };
}