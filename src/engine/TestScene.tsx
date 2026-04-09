// ============================================================
// TestScene.tsx — Maya-style 3D workspace with integrated
//   Outliner, Channel Box, Timeline, and Viewport.
//
//   Layout:
//   ┌──────────┬────────────────────────┬───────────┐
//   │ Outliner │      3D Viewport       │ ChannelBox│
//   │          │                        │           │
//   ├──────────┴────────────────────────┴───────────┤
//   │                  Timeline                     │
//   └───────────────────────────────────────────────┘
// ============================================================

import React, { useRef, useEffect, useCallback, useState } from 'react';

// Babylon.js
import '@babylonjs/core';
import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { Vector3, Matrix } from '@babylonjs/core/Maths/math.vector';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { PointerEventTypes } from '@babylonjs/core/Events/pointerEvents';
import { HighlightLayer } from '@babylonjs/core/Layers/highlightLayer';
import { GizmoManager } from '@babylonjs/core/Gizmos/gizmoManager';

// Engine imports
import { CustomTransformNode } from './CustomTransformNode';
import { RotationOrder, TangentMode, type ChannelPath } from './types';
import { FCurve, createKeyframe } from './FCurve';
import { AnimationClip, createBinding } from './ChannelBinding';
import { AnimationEvaluator } from './AnimationEvaluator';
import { ConstraintStack, ConstraintBase } from './ConstraintBase';
import type { MatrixStackLayer } from './MatrixStack';

// UI panels
import Outliner, { type OutlinerNode } from './ui/Outliner';
import ChannelBox from './ui/ChannelBox';
import AttributeEditor from './ui/AttributeEditor';
import Timeline from './ui/Timeline';
import { T } from './ui/theme';
import { TransformOp } from './types';

// ---------------------------------------------------------------------------
// Simple Look-At Constraint (for demo)
// ---------------------------------------------------------------------------

class LookAtConstraint extends ConstraintBase {
  constructor(name: string, public targetPosition: Vector3) {
    super(name);
  }
  evaluate(
    _node: CustomTransformNode,
    localMatrix: Matrix,
    _time: number,
  ): Matrix {
    const pos = new Vector3(localMatrix.m[12], localMatrix.m[13], localMatrix.m[14]);
    const dir = this.targetPosition.subtract(pos).normalize();
    const up = Vector3.Up();
    const right = Vector3.Cross(up, dir).normalize();
    const correctedUp = Vector3.Cross(dir, right);
    const rotMatrix = Matrix.Identity();
    const m = rotMatrix.m as unknown as Float32Array;
    m[0] = right.x;       m[1] = right.y;       m[2] = right.z;
    m[4] = correctedUp.x;  m[5] = correctedUp.y;  m[6] = correctedUp.z;
    m[8] = dir.x;          m[9] = dir.y;          m[10] = dir.z;
    m[12] = pos.x; m[13] = pos.y; m[14] = pos.z;
    return rotMatrix;
  }
}

// ---------------------------------------------------------------------------
// Additive Noise Layer
// ---------------------------------------------------------------------------

class NoiseLayer implements MatrixStackLayer {
  readonly id = '__noise_layer__';
  name = 'Noise Shake';
  enabled = false;
  weight = 1.0;
  computeMatrix(): Matrix {
    const t = performance.now() * 0.005;
    return Matrix.Translation(
      Math.sin(t * 3.1) * 0.1,
      Math.cos(t * 4.7) * 0.1,
      Math.sin(t * 2.3 + 1) * 0.1,
    );
  }
}

// ---------------------------------------------------------------------------
// TestScene Component
// ---------------------------------------------------------------------------

interface TestSceneProps {
  onClose?: () => void;
}

const NODE_COLORS_HEX = ['#00d4ff', '#ff6633', '#80ff4d', '#ff3399', '#b380ff', '#ffd91a'];

export default function TestScene({ onClose }: TestSceneProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const evaluatorRef = useRef<AnimationEvaluator | null>(null);
  const nodesRef = useRef<CustomTransformNode[]>([]);
  const highlightLayerRef = useRef<HighlightLayer | null>(null);
  const gizmoManagerRef = useRef<GizmoManager | null>(null);
  const noiseLayerRef = useRef<NoiseLayer | null>(null);

  // Selection state
  const [selectedNode, setSelectedNode] = useState<CustomTransformNode | null>(null);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const selectedNodeRef = useRef<CustomTransformNode | null>(null);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(0);

  // Outliner data
  const [outlinerNodes, setOutlinerNodes] = useState<OutlinerNode[]>([]);

  // Right panel tab
  const [rightTab, setRightTab] = useState<'channels' | 'attributes'>('channels');

  // Force re-render for channel box updates
  const [tick, setTick] = useState(0);

  // ---- Scene setup ----
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Ensure canvas has dimensions from DOM layout
    const rect = canvas.parentElement?.getBoundingClientRect();
    if (rect) {
      canvas.width = rect.width * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
    }

    const engine = new Engine(canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true,
      adaptToDeviceRatio: true,
    });
    engineRef.current = engine;
    engine.resize();

    const scene = new Scene(engine);
    scene.clearColor = new Color4(0.05, 0.05, 0.08, 1);
    sceneRef.current = scene;

    // Highlight Layer for selection outline
    const hl = new HighlightLayer('hl_selection', scene);
    hl.innerGlow = false;
    hl.outerGlow = true;
    hl.blurHorizontalSize = 1;
    hl.blurVerticalSize = 1;
    highlightLayerRef.current = hl;

    // Gizmo Manager for translation/rotation tooling
    const gizmoManager = new GizmoManager(scene);
    gizmoManager.positionGizmoEnabled = true;
    gizmoManager.rotationGizmoEnabled = true;
    gizmoManager.scaleGizmoEnabled = true;
    gizmoManager.usePointerToAttachGizmos = false;
    gizmoManagerRef.current = gizmoManager;

    // Wire rotation gizmo drag events to our custom channels.
    // We read from selectedNodeRef (a ref) so the closure always sees
    // the latest selected node, not the initial null.
    if (gizmoManager.gizmos.rotationGizmo) {
      const rotG = gizmoManager.gizmos.rotationGizmo;
      let startX = 0, startY = 0, startZ = 0;

      if (rotG.xGizmo) {
        rotG.xGizmo.dragBehavior.onDragStartObservable.add(() => {
          const n = selectedNodeRef.current;
          if (n) startX = n.rotateX;
        });
        rotG.xGizmo.dragBehavior.onDragObservable.add(() => {
          const n = selectedNodeRef.current;
          if (n) { n.setChannel('rotateX', startX + rotG.xGizmo.angle); }
        });
      }
      if (rotG.yGizmo) {
        rotG.yGizmo.dragBehavior.onDragStartObservable.add(() => {
          const n = selectedNodeRef.current;
          if (n) startY = n.rotateY;
        });
        rotG.yGizmo.dragBehavior.onDragObservable.add(() => {
          const n = selectedNodeRef.current;
          if (n) { n.setChannel('rotateY', startY + rotG.yGizmo.angle); }
        });
      }
      if (rotG.zGizmo) {
        rotG.zGizmo.dragBehavior.onDragStartObservable.add(() => {
          const n = selectedNodeRef.current;
          if (n) startZ = n.rotateZ;
        });
        rotG.zGizmo.dragBehavior.onDragObservable.add(() => {
          const n = selectedNodeRef.current;
          if (n) { n.setChannel('rotateZ', startZ + rotG.zGizmo.angle); }
        });
      }
    }

    // Camera
    const camera = new ArcRotateCamera(
      'camera', -Math.PI / 4, Math.PI / 3, 12,
      new Vector3(0, 1, 0), scene,
    );
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 3;
    camera.upperRadiusLimit = 30;
    camera.wheelPrecision = 30;

    // Light
    const light = new HemisphericLight('light', new Vector3(0.3, 1, 0.5), scene);
    light.intensity = 0.9;
    light.groundColor = new Color3(0.1, 0.1, 0.2);

    // Ground
    const ground = MeshBuilder.CreateGround('ground', { width: 20, height: 20 }, scene);
    const groundMat = new StandardMaterial('groundMat', scene);
    groundMat.diffuseColor = new Color3(0.08, 0.08, 0.12);
    groundMat.specularColor = Color3.Black();
    groundMat.alpha = 0.6;
    ground.material = groundMat;

    // Grid lines
    for (let i = -10; i <= 10; i++) {
      const lx = MeshBuilder.CreateLines(`gridX${i}`, {
        points: [new Vector3(i, 0.01, -10), new Vector3(i, 0.01, 10)],
        colors: [new Color4(0.2, 0.2, 0.3, 0.3), new Color4(0.2, 0.2, 0.3, 0.3)],
      }, scene);
      lx.isPickable = false;
      const lz = MeshBuilder.CreateLines(`gridZ${i}`, {
        points: [new Vector3(-10, 0.01, i), new Vector3(10, 0.01, i)],
        colors: [new Color4(0.2, 0.2, 0.3, 0.3), new Color4(0.2, 0.2, 0.3, 0.3)],
      }, scene);
      lz.isPickable = false;
    }

    // Axis lines
    MeshBuilder.CreateLines('axisX', {
      points: [Vector3.Zero(), new Vector3(2, 0, 0)],
      colors: [new Color4(1, 0.2, 0.2, 1), new Color4(1, 0.2, 0.2, 1)],
    }, scene);
    MeshBuilder.CreateLines('axisY', {
      points: [Vector3.Zero(), new Vector3(0, 2, 0)],
      colors: [new Color4(0.2, 1, 0.2, 1), new Color4(0.2, 1, 0.2, 1)],
    }, scene);
    MeshBuilder.CreateLines('axisZ', {
      points: [Vector3.Zero(), new Vector3(0, 0, 2)],
      colors: [new Color4(0.3, 0.3, 1, 1), new Color4(0.3, 0.3, 1, 1)],
    }, scene);

    // =====================================================
    // CREATE NODES
    // =====================================================

    const colors = [
      new Color3(0, 0.83, 1), new Color3(1, 0.4, 0.2),
      new Color3(0.5, 1, 0.3), new Color3(1, 0.2, 0.6),
      new Color3(0.7, 0.5, 1), new Color3(1, 0.85, 0.1),
    ];
    const rotOrders = Object.values(RotationOrder);
    const nodes: CustomTransformNode[] = [];

    rotOrders.forEach((order, i) => {
      const node = new CustomTransformNode(`node_${order}`, scene);
      node.translateX = (i - 2.5) * 2.5;
      node.translateY = 1;
      node.rotationOrder = order;
      node.markCustomDirty();

      // Box mesh
      const box = MeshBuilder.CreateBox(`box_${order}`, { width: 0.8, height: 0.8, depth: 0.8 }, scene);
      const mat = new StandardMaterial(`mat_${order}`, scene);
      mat.diffuseColor = colors[i];
      mat.specularColor = new Color3(0.3, 0.3, 0.3);
      mat.emissiveColor = colors[i].scale(0.15);
      box.material = mat;
      box.parent = node;

      // Direction indicator
      const ind = MeshBuilder.CreateBox(`ind_${order}`, { width: 0.15, height: 0.15, depth: 0.6 }, scene);
      const indMat = new StandardMaterial(`indMat_${order}`, scene);
      indMat.diffuseColor = Color3.White();
      indMat.emissiveColor = new Color3(0.6, 0.6, 0.6);
      ind.material = indMat;
      ind.position.z = 0.5;
      ind.parent = node;

      // Color marker sphere
      const marker = MeshBuilder.CreateSphere(`marker_${order}`, { diameter: 0.15 }, scene);
      const markerMat = new StandardMaterial(`markerMat_${order}`, scene);
      markerMat.diffuseColor = colors[i];
      markerMat.emissiveColor = colors[i].scale(0.5);
      marker.material = markerMat;
      marker.position.y = 0.8;
      marker.parent = node;

      nodes.push(node);
    });

    nodesRef.current = nodes;
    nodes.forEach(n => n.syncToBabylon());

    // Build outliner tree
    const outlinerData: OutlinerNode[] = nodes.map((node, i) => ({
      node,
      label: node.name,
      type: 'transform' as const,
      color: NODE_COLORS_HEX[i],
      children: [
        { node, label: `box_${rotOrders[i]}`, type: 'mesh' as const, children: [], color: NODE_COLORS_HEX[i] },
        { node, label: `ind_${rotOrders[i]}`, type: 'mesh' as const, children: [] },
        { node, label: `marker_${rotOrders[i]}`, type: 'mesh' as const, children: [] },
      ],
    }));
    setOutlinerNodes(outlinerData);

    // Noise layer on node 0
    const noiseLayer = new NoiseLayer();
    nodes[0].matrixStack.addLayer(noiseLayer);
    noiseLayerRef.current = noiseLayer;

    // Constraint on node 5
    const lookAt = new LookAtConstraint('lookAt_demo', new Vector3(0, 2, 0));
    lookAt.enabled = false;
    const cStack = new ConstraintStack();
    cStack.add(lookAt);
    cStack.install(nodes[5]);

    // =====================================================
    // F-CURVE ANIMATION
    // =====================================================

    const clip = new AnimationClip('testClip');
    clip.frameRange = [0, 120];

    nodes.forEach((node, i) => {
      const curve = new FCurve();
      curve.addKey(createKeyframe(0, 0, TangentMode.Bezier));
      const k30 = createKeyframe(30, Math.PI / 2, TangentMode.Bezier);
      k30.inTangent = { x: -8, y: 0.2 }; k30.outTangent = { x: 8, y: -0.2 };
      curve.addKey(k30);
      const k60 = createKeyframe(60, Math.PI + (i * 0.3), TangentMode.Bezier);
      k60.inTangent = { x: -10, y: 0.8 }; k60.outTangent = { x: 10, y: -0.3 };
      curve.addKey(k60);
      const k90 = createKeyframe(90, Math.PI / 4, TangentMode.Bezier);
      k90.inTangent = { x: -8, y: -0.5 }; k90.outTangent = { x: 8, y: 0.2 };
      curve.addKey(k90);
      curve.addKey(createKeyframe(120, 0, TangentMode.Bezier));

      const curveX = new FCurve();
      curveX.addKey(createKeyframe(0, 0, TangentMode.Linear));
      curveX.addKey(createKeyframe(60, Math.PI / 6 * (i % 3), TangentMode.Linear));
      curveX.addKey(createKeyframe(120, 0, TangentMode.Linear));

      clip.addBinding(createBinding(node, 'rotateY', curve));
      clip.addBinding(createBinding(node, 'rotateX', curveX));
    });

    const evaluator = new AnimationEvaluator(scene, 24);
    evaluator.addClip(clip);
    evaluator.setLoopRange(0, 120);
    evaluator.loopEnabled = true;
    evaluatorRef.current = evaluator;

    // Pre-render sync
    scene.onBeforeRenderObservable.add(() => {
      for (const node of nodes) {
        node.syncToBabylon();
      }
      if (evaluator.isPlaying) {
        setCurrentFrame(Math.round(evaluator.currentTime * 10) / 10);
        setIsPlaying(true);
        // Trigger channel box re-render during playback
        setTick(t => t + 1);
      }
    });

    // Viewport Picking (Selection)
    scene.onPointerObservable.add((pointerInfo) => {
      if (pointerInfo.type === PointerEventTypes.POINTERDOWN && pointerInfo.event.button === 0) {
        // Prevent deselection if the user is interacting with the Gizmo handles directly.
        const gm = gizmoManagerRef.current;
        if (
          gm?.isHovered ||
          gm?.gizmos.positionGizmo?.isHovered ||
          gm?.gizmos.rotationGizmo?.isHovered ||
          gm?.gizmos.scaleGizmo?.isHovered
        ) {
          return;
        }

        if (pointerInfo.pickInfo?.hit && pointerInfo.pickInfo.pickedMesh) {
          const mesh = pointerInfo.pickInfo.pickedMesh;
          let currentParent = mesh.parent;
          let foundNode = false;
          while (currentParent) {
            if (currentParent instanceof CustomTransformNode) {
              setSelectedNode(currentParent);
              setSelectedName(currentParent.name);
              foundNode = true;
              break;
            }
            currentParent = currentParent.parent;
          }
          if (!foundNode) {
            // Clicked a mesh that isn't part of a CustomTransformNode (e.g. ground)
            setSelectedNode(null);
            setSelectedName(null);
          }
        } else {
          // Clicked empty space
          setSelectedNode(null);
          setSelectedName(null);
        }
      }
    });

    engine.runRenderLoop(() => scene.render());

    const handleResize = () => engine.resize();
    window.addEventListener('resize', handleResize);
    requestAnimationFrame(() => engine.resize());

    return () => {
      window.removeEventListener('resize', handleResize);
      evaluator.dispose();
      scene.dispose();
      engine.dispose();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Sync Selection to Babylon Visuals & UI Re-renders ----
  useEffect(() => {
    // Keep the ref in sync so gizmo callbacks always see the current node
    selectedNodeRef.current = selectedNode;

    const hl = highlightLayerRef.current;
    const gm = gizmoManagerRef.current;
    
    // Bind UI refresh to node changes
    let removeDirtyObserver: (() => void) | undefined;
    if (selectedNode) {
      removeDirtyObserver = selectedNode.onDirty(() => setTick(t => t + 1));
    }

    if (!hl || !gm) return removeDirtyObserver;

    // Clear previous highlight
    hl.removeAllMeshes();
    
    // Attach gizmo
    if (selectedNode) {
      gm.attachToNode(selectedNode);
      // Highlight all child meshes of the selected node
      selectedNode.getChildMeshes().forEach(mesh => {
        hl.addMesh(mesh as Mesh, Color3.White());
      });
    } else {
      gm.attachToNode(null);
    }
    
    return removeDirtyObserver;
  }, [selectedNode]);

  // ---- Handlers ----

  const handleSelect = useCallback((node: CustomTransformNode, name: string) => {
    setSelectedNode(node);
    setSelectedName(name);
  }, []);

  const handlePlayPause = useCallback(() => {
    const ev = evaluatorRef.current;
    if (!ev) return;
    if (ev.isPlaying) {
      ev.pause();
      setIsPlaying(false);
    } else {
      ev.play();
      setIsPlaying(true);
    }
  }, []);

  const handleStop = useCallback(() => {
    const ev = evaluatorRef.current;
    if (!ev) return;
    ev.stop();
    setIsPlaying(false);
    setCurrentFrame(0);
  }, []);

  const handleScrub = useCallback((frame: number) => {
    const ev = evaluatorRef.current;
    if (!ev) return;
    ev.setTime(frame);
    setCurrentFrame(frame);
  }, []);

  const handleChannelChange = useCallback((
    node: CustomTransformNode,
    channel: string,
    value: number,
  ) => {
    node.setChannel(channel, value);
    node.syncToBabylon();
  }, []);

  const handleOpOrderChange = useCallback((
    node: CustomTransformNode,
    newOrder: TransformOp[],
  ) => {
    node.opOrder = newOrder;
    node.markCustomDirty();
    node.syncToBabylon();
  }, []);

  const handleSetKey = useCallback((node: CustomTransformNode, channels?: string[]) => {
    const ev = evaluatorRef.current;
    if (!ev || ev.clips.length === 0) return;
    
    const clip = ev.clips[0];
    const frame = Math.round(currentFrame);
    
    const channelsToKey = channels && channels.length > 0
      ? channels
      : ['translateX', 'translateY', 'translateZ', 'rotateX', 'rotateY', 'rotateZ', 'scaleX', 'scaleY', 'scaleZ'];

    for (const channel of channelsToKey) {
      let binding = clip.findBinding(node, channel as ChannelPath);
      if (!binding) {
        const curve = new FCurve();
        binding = createBinding(node, channel as ChannelPath, curve);
        clip.addBinding(binding);
      }
      
      const val = node.getChannel(channel);
      binding.curve.addKey(createKeyframe(frame, val, TangentMode.Spline));
    }
    
    // Force UI tick to show the keys (if we add UI indicators later)
    setTick(t => t + 1);
  }, [currentFrame]);

  const checkIsKeyed = useCallback((channel: string) => {
    if (!selectedNode || !evaluatorRef.current || evaluatorRef.current.clips.length === 0) return false;
    const clip = evaluatorRef.current.clips[0];
    const binding = clip.findBinding(selectedNode, channel as ChannelPath);
    if (!binding) return false;
    
    // Check if there's a key on the *exact* current integer frame
    const frame = Math.round(currentFrame);
    return binding.curve.keys.some(k => Math.abs(k.time - frame) < 0.01);
  }, [selectedNode, currentFrame]);

  // Global hotkeys
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if typing in an input
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }
      if (e.key.toLowerCase() === 's' && selectedNode) {
        handleSetKey(selectedNode);
        
        // Optional snippet to pulse the UI or show feedback...
        console.log(`Set Key on ${selectedName} at frame ${Math.round(currentFrame)}`);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNode, selectedName, handleSetKey]);

  // ---- Render ----

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      background: '#000',
      fontFamily: T.font,
      color: T.text,
    }}>
      {/* Header bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '5px 12px',
        background: T.bg,
        borderBottom: `1px solid ${T.border}`,
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: T.accent }}>⬡</span>
          <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: 1 }}>
            ANNOTATE 3D
          </span>
          <span style={{ fontSize: 10, color: T.textDim, marginLeft: 4 }}>
            Transform · Animation · Constraints
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Frame pill */}
          <span style={{
            fontSize: 11,
            fontFamily: T.fontMono,
            color: T.accent,
            background: T.accentGlow,
            padding: '2px 10px',
            borderRadius: 10,
            fontWeight: 600,
          }}>
            F {currentFrame.toFixed(1)}
          </span>
          {onClose && (
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: `1px solid ${T.border}`,
                color: T.textDim,
                padding: '3px 10px',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 11,
              }}
            >
              ✕ Close
            </button>
          )}
        </div>
      </div>

      {/* Main workspace: Outliner | Viewport | Right Panel */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        {/* Left: Outliner */}
        <Outliner
          nodes={outlinerNodes}
          selectedName={selectedName}
          onSelect={handleSelect}
          width={200}
        />

        {/* Center: 3D Viewport */}
        <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
          <canvas
            ref={canvasRef}
            style={{ width: '100%', height: '100%', display: 'block' }}
          />

          {/* Rotation order label legend (floating) */}
          <div style={{
            position: 'absolute',
            bottom: 8,
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            gap: 6,
            padding: '4px 10px',
            background: 'rgba(0,0,0,0.7)',
            borderRadius: 6,
            backdropFilter: 'blur(8px)',
          }}>
            {Object.values(RotationOrder).map((order, i) => (
              <div key={order} style={{
                textAlign: 'center',
                padding: '1px 6px',
                borderRadius: 3,
                border: `1px solid ${selectedName === `node_${order}` ? T.accent : 'transparent'}`,
                background: selectedName === `node_${order}` ? T.accentGlow : 'transparent',
                cursor: 'pointer',
              }}
                onClick={() => handleSelect(nodesRef.current[i], `node_${order}`)}
              >
                <div style={{ fontSize: 8, color: NODE_COLORS_HEX[i], fontWeight: 700 }}>●</div>
                <div style={{ fontSize: 9, fontWeight: 600, color: NODE_COLORS_HEX[i] }}>{order}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Tabbed Panel (Channel Box / Attributes) */}
        <div style={{
          width: 260,
          background: T.bg,
          borderLeft: `1px solid ${T.border}`,
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
          overflow: 'hidden',
        }}>
          {/* Tab bar */}
          <div style={{
            display: 'flex',
            borderBottom: `1px solid ${T.border}`,
            flexShrink: 0,
          }}>
            {(['channels', 'attributes'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setRightTab(tab)}
                style={{
                  flex: 1,
                  padding: '6px 0',
                  background: rightTab === tab ? T.bgSurface : 'transparent',
                  border: 'none',
                  borderBottom: rightTab === tab ? `2px solid ${T.accent}` : '2px solid transparent',
                  color: rightTab === tab ? T.accent : T.textDim,
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: 0.8,
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                  fontFamily: T.font,
                  transition: 'all 0.12s ease',
                }}
              >
                {tab === 'channels' ? '☰ Channels' : '⚙ Attributes'}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
            {rightTab === 'channels' ? (
              <ChannelBox
                key={`cb_${selectedNode?.name || 'none'}_${tick}`} // Hard-force React reconciliation on dirty
                selectedNode={selectedNode}
                selectedName={selectedName}
                onChannelChange={handleChannelChange}
                width={260}
                currentFrame={currentFrame}
                checkIsKeyed={checkIsKeyed}
                onSetKey={(channel) => handleSetKey(selectedNode!, channel ? [channel] : undefined)}
              />
            ) : (
              <AttributeEditor
                selectedNode={selectedNode}
                selectedName={selectedName}
                onOpOrderChange={handleOpOrderChange}
                width={260}
              />
            )}
          </div>
        </div>
      </div>

      {/* Bottom: Timeline */}
      <Timeline
        evaluator={evaluatorRef.current}
        selectedNode={selectedNode}
        isPlaying={isPlaying}
        currentFrame={currentFrame}
        onPlayPause={handlePlayPause}
        onStop={handleStop}
        onScrub={handleScrub}
        height={100}
      />
    </div>
  );
}
