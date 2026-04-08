// ============================================================
// CustomTransformNode.ts — Maya-style transform node extending
//   Babylon.js TransformNode.
//
//   Instead of overriding computeWorldMatrix() (which breaks
//   Babylon's internal bookkeeping), we hook into the
//   onAfterWorldMatrixUpdateObservable to inject our custom
//   matrix math AFTER Babylon has done its internal work.
//
//   Strategy:
//     1. Use Babylon's native position/scaling for basic placement
//     2. Before each render, evaluate our MatrixStack
//     3. Decompose the result into Babylon's native TRS properties
//     4. Let Babylon's native computeWorldMatrix() do the rest
// ============================================================

import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Matrix, Vector3, Quaternion } from '@babylonjs/core/Maths/math.vector';
import type { Scene } from '@babylonjs/core/scene';
import type { Nullable } from '@babylonjs/core/types';

import { RotationOrder, TransformOp, DEFAULT_OP_ORDER } from './types';
import { buildMayaLocalMatrix, freezeTransform } from './MayaMatrixMath';
import { MatrixStack, type MatrixStackLayer } from './MatrixStack';

// ---------------------------------------------------------------------------
// MayaTransformLayer — the default MatrixStack layer implementing the
//   Maya transform formula.  It reads channel values from its parent node.
// ---------------------------------------------------------------------------

class MayaTransformLayer implements MatrixStackLayer {
  readonly id = '__maya_transform__';
  name = 'Maya Transform';
  enabled = true;
  weight = 1.0;

  constructor(private _node: CustomTransformNode) {}

  computeMatrix(): Matrix {
    return buildMayaLocalMatrix(
      {
        translate:     { x: this._node.translateX, y: this._node.translateY, z: this._node.translateZ },
        rotate:        { x: this._node.rotateX,    y: this._node.rotateY,    z: this._node.rotateZ },
        scale:         { x: this._node.scaleX,     y: this._node.scaleY,     z: this._node.scaleZ },
        rotatePivot:   this._node.rotatePivot,
        scalePivot:    this._node.scalePivot,
        rotateAxis:    this._node.rotateAxis,
        rotationOrder: this._node.rotationOrder,
      },
      this._node.offsetMatrix,
      this._node.opOrder,
    );
  }
}

// ---------------------------------------------------------------------------
// CustomTransformNode
// ---------------------------------------------------------------------------

export class CustomTransformNode extends TransformNode {
  // ---- Maya-style animatable float channels ----
  public translateX = 0;
  public translateY = 0;
  public translateZ = 0;
  public rotateX = 0;
  public rotateY = 0;
  public rotateZ = 0;
  public scaleX = 1;
  public scaleY = 1;
  public scaleZ = 1;

  // ---- Pivots & orientation ----
  public rotatePivot  = { x: 0, y: 0, z: 0 };
  public scalePivot   = { x: 0, y: 0, z: 0 };
  public rotateAxis   = { x: 0, y: 0, z: 0 };
  public rotationOrder: RotationOrder = RotationOrder.XYZ;

  // ---- Operation order (drag-reorderable in the Attributes tab) ----
  public opOrder: TransformOp[] = [...DEFAULT_OP_ORDER];

  // ---- Frozen offset ----
  public offsetMatrix: Matrix = Matrix.Identity();

  // ---- Matrix stack ----
  public readonly matrixStack: MatrixStack;

  // ---- Constraint hook (Phase 4) ----
  public constraintOverride: ((localMatrix: Matrix, time: number) => Matrix) | null = null;

  // ---- Internal dirty tracking ----
  private _customDirtyVersion = 0;
  private _lastSyncedVersion = -1;
  private _onDirtyCallbacks: (() => void)[] = [];
  
  // ---- Bidirectional Sync tracking ----
  private _lastSyncedPosition: Vector3;
  private _lastSyncedRot: Quaternion;
  private _lastSyncedScale: Vector3;

  // ---- Current evaluation time (set by AnimationEvaluator) ----
  public currentTime = 0;

  constructor(name: string, scene?: Nullable<Scene>) {
    super(name, scene);

    // Create the matrix stack with the default Maya layer
    this.matrixStack = new MatrixStack();
    this.matrixStack.addLayer(new MayaTransformLayer(this));

    // Use a quaternion for rotation so we can set arbitrary orientations
    this.rotationQuaternion = Quaternion.Identity();
    
    // Bidirectional sync tracking
    this._lastSyncedPosition = Vector3.Zero();
    this._lastSyncedRot = Quaternion.Identity();
    this._lastSyncedScale = Vector3.One();
  }

  // ---- Channel setters that auto-dirty ----

  /** Set a named channel value. Marks the node dirty. */
  setChannel(path: string, value: number): void {
    switch (path) {
      case 'translateX': this.translateX = value; break;
      case 'translateY': this.translateY = value; break;
      case 'translateZ': this.translateZ = value; break;
      case 'rotateX':    this.rotateX = value; break;
      case 'rotateY':    this.rotateY = value; break;
      case 'rotateZ':    this.rotateZ = value; break;
      case 'scaleX':     this.scaleX = value; break;
      case 'scaleY':     this.scaleY = value; break;
      case 'scaleZ':     this.scaleZ = value; break;
      default:
        console.warn(`CustomTransformNode: unknown channel "${path}"`);
        return;
    }
    this.markCustomDirty();
  }

  /** Get a named channel value. */
  getChannel(path: string): number {
    switch (path) {
      case 'translateX': return this.translateX;
      case 'translateY': return this.translateY;
      case 'translateZ': return this.translateZ;
      case 'rotateX':    return this.rotateX;
      case 'rotateY':    return this.rotateY;
      case 'rotateZ':    return this.rotateZ;
      case 'scaleX':     return this.scaleX;
      case 'scaleY':     return this.scaleY;
      case 'scaleZ':     return this.scaleZ;
      default:           return 0;
    }
  }

  /** Register a callback for when this node's channels change */
  onDirty(callback: () => void): () => void {
    this._onDirtyCallbacks.push(callback);
    return () => {
      this._onDirtyCallbacks = this._onDirtyCallbacks.filter(c => c !== callback);
    };
  }

  /** Increment the dirty version so we re-evaluate on next frame. */
  markCustomDirty(): void {
    this._customDirtyVersion++;
    this.matrixStack.markDirty();
    this._onDirtyCallbacks.forEach(cb => cb());
  }

  // ---- Sync Maya channels → Babylon native TRS -------------------------
  //
  // This is the KEY method. Instead of overriding computeWorldMatrix(),
  // we evaluate our MatrixStack and decompose the result into Babylon's
  // native position, rotationQuaternion, and scaling properties.
  // Babylon then computes the world matrix normally.
  //
  // Call this BEFORE each render (via scene.onBeforeRenderObservable).

  /**
   * Evaluate the Maya MatrixStack and push the result into Babylon's
   * native TRS properties. Must be called before rendering.
   */
  syncToBabylon(): void {
    // 0. Bidirectional Sync: Check if Babylon's native properties were modified externally (e.g. by a Gizmo)
    const posChanged = !this.position.equals(this._lastSyncedPosition);
    const rotChanged = this.rotationQuaternion && !this.rotationQuaternion.equals(this._lastSyncedRot);
    const scaleChanged = !this.scaling.equals(this._lastSyncedScale);
    
    if (posChanged || rotChanged || scaleChanged) {
      if (posChanged) {
        this.translateX = this.position.x;
        this.translateY = this.position.y;
        this.translateZ = this.position.z;
      }
      if (rotChanged && this.rotationQuaternion) {
        // Explicitly get generic Euler angles from changing rotation quaternion
        const euler = this.rotationQuaternion.toEulerAngles();
        this.rotateX = euler.x;
        this.rotateY = euler.y;
        this.rotateZ = euler.z;
      }
      if (scaleChanged) {
        this.scaleX = this.scaling.x;
        this.scaleY = this.scaling.y;
        this.scaleZ = this.scaling.z;
      }
      this.markCustomDirty();
    }

    if (this._lastSyncedVersion === this._customDirtyVersion && !this.matrixStack.isDirty) {
      return; // Nothing changed
    }

    // 1. Evaluate the matrix stack → local matrix
    let localMatrix = this.matrixStack.evaluate();

    // 2. Apply constraint override (Phase 4 hook)
    if (this.constraintOverride) {
      localMatrix = this.constraintOverride(localMatrix, this.currentTime);
    }

    // 3. Decompose into TRS
    const scaleVec = new Vector3();
    const rotQuat = new Quaternion();
    const transVec = new Vector3();
    localMatrix.decompose(scaleVec, rotQuat, transVec);

    // 4. Push to Babylon's native properties
    this.position.copyFrom(transVec);
    if (this.rotationQuaternion) {
      this.rotationQuaternion.copyFrom(rotQuat);
    }
    this.scaling.copyFrom(scaleVec);
    
    // Track for bidirectional sync
    this._lastSyncedPosition.copyFrom(this.position);
    if (this.rotationQuaternion) this._lastSyncedRot.copyFrom(this.rotationQuaternion);
    this._lastSyncedScale.copyFrom(this.scaling);

    // 5. Update tracking
    this._lastSyncedVersion = this._customDirtyVersion;
  }

  // ---- Freeze Transforms -----------------------------------------------

  /**
   * Bake the current world-space position into the offset matrix and
   * zero all TRS channels.  The object stays visually in place.
   */
  freezeTransforms(): void {
    // Ensure world matrix is current
    this.syncToBabylon();
    this.computeWorldMatrix(true);

    const parentNode = this.parent as Nullable<TransformNode>;
    const parentWorld = parentNode
      ? parentNode.computeWorldMatrix(true)
      : Matrix.Identity();

    const result = freezeTransform(this._worldMatrix, parentWorld);

    // Apply zeroed channels
    this.translateX = result.channels.translateX;
    this.translateY = result.channels.translateY;
    this.translateZ = result.channels.translateZ;
    this.rotateX    = result.channels.rotateX;
    this.rotateY    = result.channels.rotateY;
    this.rotateZ    = result.channels.rotateZ;
    this.scaleX     = result.channels.scaleX;
    this.scaleY     = result.channels.scaleY;
    this.scaleZ     = result.channels.scaleZ;

    // Store the offset
    this.offsetMatrix = result.offsetMatrix;

    // Force recomputation
    this.markCustomDirty();
    this.syncToBabylon();
  }

  // ---- Utility ----------------------------------------------------------

  /** Returns the class name for serialization. */
  public override getClassName(): string {
    return 'CustomTransformNode';
  }
}
