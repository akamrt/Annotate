// ============================================================
// GimbalRotationGizmo.ts — Maya/Blender-style rotation gizmo
//   that properly handles gimbal lock using quaternion math.
//
// Key features:
//   - Quaternion-based rotation (no gimbal lock)
//   - Visual gimbal axes (shows actual rotation planes)
//   - Rotation order switching (XYZ, ZYX, Gimbal, etc.)
//   - Maya-style interaction (drag to rotate around axis)
//   - Works with CustomTransformNode
// ============================================================

import {
  AbstractMesh,
  Color3,
  Color4,
  Gizmo,
  GizmoManager,
  Mesh,
  Nullable,
  PlaneRotationGizmo,
  Quaternion,
  Ray,
  Vector3,
} from '@babylonjs/core';
import type { Scene } from '@babylonjs/core/scene';
import type { PointerInfo } from '@babylonjs/core/Events/pointerEvents';

import { RotationOrder } from './types';

// -----------------------------------------------------------------------
// Rotation order to quaternion conversion
// -----------------------------------------------------------------------

/**
 * Convert Euler angles to quaternion using specified rotation order.
 * This is the KEY to avoiding gimbal lock - we always work in quaternion
 * space and only convert to Euler for display.
 */
export function eulerToQuaternion(
  x: number, y: number, z: number,
  order: RotationOrder
): Quaternion {
  const qx = Quaternion.RotationAxis(Vector3.Right(), x);
  const qy = Quaternion.RotationAxis(Vector3.Up(), y);
  const qz = Quaternion.RotationAxis(Vector3.Forward(), z);

  switch (order) {
    case RotationOrder.XYZ:
      return qx.multiply(qy).multiply(qz);
    case RotationOrder.XZY:
      return qx.multiply(qz).multiply(qy);
    case RotationOrder.YXZ:
      return qy.multiply(qx).multiply(qz);
    case RotationOrder.YZX:
      return qy.multiply(qz).multiply(qx);
    case RotationOrder.ZXY:
      return qz.multiply(qx).multiply(qy);
    case RotationOrder.ZYX:
      return qz.multiply(qy).multiply(qx);
    default:
      return qx.multiply(qy).multiply(qz);
  }
}

/**
 * Convert quaternion to Euler angles using specified rotation order.
 * Used for displaying angles in the UI.
 */
export function quaternionToEuler(
  q: Quaternion,
  order: RotationOrder
): Vector3 {
  // Get the rotation matrix from quaternion
  const m = new Matrix();
  q.toRotationMatrix(m);

  // Extract Euler angles based on rotation order
  // This is a simplified version - for production, use a robust library
  const euler = new Vector3();

  switch (order) {
    case RotationOrder.XYZ:
      euler.y = Math.asin(Math.max(-1, Math.min(1, m.m[8])));
      if (Math.abs(m.m[8]) < 0.99999) {
        euler.x = Math.atan2(-m.m[9], m.m[10]);
        euler.z = Math.atan2(-m.m[4], m.m[0]);
      } else {
        euler.x = Math.atan2(m.m[6], m.m[5]);
        euler.z = 0;
      }
      break;
    case RotationOrder.ZYX:
      euler.y = Math.asin(Math.max(-1, Math.min(1, -m.m[2])));
      if (Math.abs(m.m[2]) < 0.99999) {
        euler.x = Math.atan2(m.m[6], m.m[10]);
        euler.z = Math.atan2(m.m[1], m.m[0]);
      } else {
        euler.x = Math.atan2(-m.m[9], m.m[5]);
        euler.z = 0;
      }
      break;
    default:
      // Fallback: use Babylon's built-in (may have gimbal lock for extreme angles)
      euler.copyFrom(q.toEulerAngles());
  }

  return euler;
}

// Matrix helper
const Matrix = {
  fromValues: (
    m00: number, m01: number, m02: number, m03: number,
    m10: number, m11: number, m12: number, m13: number,
    m20: number, m21: number, m22: number, m23: number,
    m30: number, m31: number, m32: number, m33: number
  ) => {
    const { Matrix: BM } = require('@babylonjs/core/Maths/math.matrix');
    return BM.FromValues(
      m00, m01, m02, m03,
      m10, m11, m12, m13,
      m20, m21, m22, m23,
      m30, m31, m32, m33
    );
  }
};

// -----------------------------------------------------------------------
// GizmoAxis — represents one rotation axis ring
// -----------------------------------------------------------------------

interface GizmoAxis {
  mesh: Mesh;
  axis: 'x' | 'y' | 'z';
  axisVector: Vector3;
  color: Color3;
  rotationAxis: Vector3; // The axis this ring rotates around
}

// -----------------------------------------------------------------------
// GimbalRotationGizmo
// -----------------------------------------------------------------------

export interface GimbalGizmoOptions {
  /** Scene to create gizmo in */
  scene: Scene;
  /** Color for X axis (default: red) */
  xColor?: Color3;
  /** Color for Y axis (default: green) */
  yColor?: Color3;
  /** Color for Z axis (default: blue) */
  zColor?: Color3;
  /** Color for selected axis (default: yellow) */
  selectedColor?: Color3;
  /** Size of gizmo (default: 1) */
  size?: number;
  /** Rotation order (default: XYZ) */
  rotationOrder?: RotationOrder;
  /** Utility layer for gizmo rendering */
  gizmoLayer?: any;
}

export class GimbalRotationGizmo {
  private _scene: Scene;
  private _rootNode: TransformNode;
  private _axes: GizmoAxis[] = [];
  private _attachedMesh: Nullable<AbstractMesh> = null;
  private _rotationOrder: RotationOrder;
  private _size: number;
  
  // Colors
  private _xColor: Color3;
  private _yColor: Color3;
  private _zColor: Color3;
  private _selectedColor: Color3;

  // Interaction state
  private _isDragging = false;
  private _activeAxis: GizmoAxis | null = null;
  private _dragStartPoint: Vector3 | null = null;
  private _initialQuaternion: Quaternion = Quaternion.Identity();

  // Callbacks
  public onRotationChangeObservable: Array<(quaternion: Quaternion) => void> = [];
  public onDragStartObservable: Array<() => void> = [];
  public onDragEndObservable: Array<() => void> = [];

  // Public accessors
  public get rotationOrder(): RotationOrder { return this._rotationOrder; }
  public set rotationOrder(order: RotationOrder) {
    this._rotationOrder = order;
    this._updateGizmoRotation();
  }

  public get attachedMesh(): Nullable<AbstractMesh> { return this._attachedMesh; }
  public set attachedMesh(mesh: Nullable<AbstractMesh>) {
    this._attachedMesh = mesh;
    this._updateGizmoRotation();
  }

  public get isDragging(): boolean { return this._isDragging; }

  constructor(options: GimbalGizmoOptions) {
    this._scene = options.scene;
    this._rotationOrder = options.rotationOrder ?? RotationOrder.XYZ;
    this._size = options.size ?? 1;
    this._xColor = options.xColor ?? new Color3(1, 0.2, 0.2);
    this._yColor = options.yColor ?? new Color3(0.2, 1, 0.2);
    this._zColor = options.zColor ?? new Color3(0.2, 0.5, 1);
    this._selectedColor = options.selectedColor ?? new Color3(1, 1, 0);

    // Create root transform node for the gizmo
    this._rootNode = new TransformNode('gimbalRoot', this._scene);

    this._createAxes();
    this._setupInteraction();
  }

  // -----------------------------------------------------------------------
  // Axis Creation
  // -----------------------------------------------------------------------

  private _createAxes(): void {
    // X-axis ring - rotates around X axis (ring lies in YZ plane)
    const xRing = this._createRing('x', this._xColor, Vector3.Right());
    
    // Y-axis ring - rotates around Y axis (ring lies in XZ plane)
    const yRing = this._createRing('y', this._yColor, Vector3.Up());
    
    // Z-axis ring - rotates around Z axis (ring lies in XY plane)
    const zRing = this._createRing('z', this._zColor, Vector3.Forward());

    this._axes = [xRing, yRing, zRing];
  }

  private _createRing(
    axis: 'x' | 'y' | 'z',
    color: Color3,
    rotationAxis: Vector3
  ): GizmoAxis {
    // Create a torus for the ring
    const ring = Mesh.CreateTorus(`ring_${axis}`, {
      diameter: this._size * 2,
      thickness: this._size * 0.1,
      tessellation: 64
    }, this._scene);

    // Rotate the ring so it faces the correct direction
    // For rotation around X axis, ring should be in YZ plane
    if (axis === 'x') {
      ring.rotation = new Vector3(0, 0, Math.PI / 2);
    } else if (axis === 'y') {
      ring.rotation = new Vector3(Math.PI / 2, 0, 0);
    }
    // Z ring is already in XY plane (default)

    // Create axis indicator (small sphere at the end)
    const indicator = Mesh.CreateSphere(`indicator_${axis}`, {
      diameter: this._size * 0.2
    }, this._scene);
    indicator.position = rotationAxis.scale(this._size);
    indicator.parent = ring;

    // Material
    const mat = this._scene.getEngine().hardwareScalingLevel;
    const material = this._createAxisMaterial(color);
    ring.material = material;
    indicator.material = material;

    // Parent to root
    ring.parent = this._rootNode;
    indicator.parent = this._rootNode;

    // Make it pickable
    ring.isPickable = true;
    indicator.isPickable = true;

    return {
      mesh: ring,
      axis,
      axisVector: rotationAxis,
      color,
      rotationAxis
    };
  }

  private _createAxisMaterial(color: Color3): any {
    const { StandardMaterial } = require('@babylonjs/core/Materials/standardMaterial');
    const { Color3: BC3 } = require('@babylonjs/core/Maths/math.color');

    const mat = new StandardMaterial(`axisMat_${Math.random()}`, this._scene);
    mat.diffuseColor = color;
    mat.specularColor = new BC3(0.3, 0.3, 0.3);
    mat.emissiveColor = color.scale(0.3);
    mat.alpha = 0.8;
    return mat;
  }

  // -----------------------------------------------------------------------
  // Interaction Setup
  // -----------------------------------------------------------------------

  private _setupInteraction(): void {
    const scene = this._scene;

    scene.onPointerObservable.add((pointerInfo: PointerInfo) => {
      switch (pointerInfo.type) {
        case PointerInfo.POINTERDOWN:
          this._handlePointerDown(pointerInfo);
          break;
        case PointerInfo.POINTERMOVE:
          this._handlePointerMove(pointerInfo);
          break;
        case PointerInfo.POINTERUP:
          this._handlePointerUp(pointerInfo);
          break;
      }
    });
  }

  private _handlePointerDown(pointerInfo: PointerInfo): void {
    if (!this._attachedMesh) return;

    const pickResult = this._scene.pick(
      this._scene.pointerX,
      this._scene.pointerY,
      (mesh) => this._axes.some(a => a.mesh === mesh)
    );

    if (pickResult.hit && pickResult.pickedMesh) {
      const axis = this._axes.find(a => a.mesh === pickResult.pickedMesh);
      if (axis) {
        this._isDragging = true;
        this._activeAxis = axis;
        this._dragStartPoint = pickResult.pickedPoint?.clone() ?? null;
        
        // Store initial rotation
        if (this._attachedMesh.rotationQuaternion) {
          this._initialQuaternion = this._attachedMesh.rotationQuaternion.clone();
        } else {
          this._initialQuaternion = Quaternion.RotationYawPitchRoll(
            this._attachedMesh.rotation.y,
            this._attachedMesh.rotation.x,
            this._attachedMesh.rotation.z
          );
        }

        // Highlight selected axis
        this._highlightAxis(axis);

        // Notify start
        this.onDragStartObservable.forEach(cb => cb());
      }
    }
  }

  private _handlePointerMove(pointerInfo: PointerInfo): void {
    if (!this._isDragging || !this._activeAxis || !this._attachedMesh || !this._dragStartPoint) return;

    // Get current pick point
    const pickResult = this._scene.pick(
      this._scene.pointerX,
      this._scene.pointerY,
      (mesh) => mesh === this._activeAxis!.mesh
    );

    if (pickResult.hit && pickResult.pickedPoint) {
      const currentPoint = pickResult.pickedPoint;
      
      // Calculate angle between start and current point around rotation axis
      const center = this._attachedMesh.getAbsolutePosition();
      const toStart = this._dragStartPoint.subtract(center);
      const toCurrent = currentPoint.subtract(center);
      
      // Project onto plane perpendicular to rotation axis
      const axisVec = this._activeAxis.axisVector;
      const startProj = toStart.subtract(axisVec.scale(Vector3.Dot(toStart, axisVec)));
      const currentProj = toCurrent.subtract(axisVec.scale(Vector3.Dot(toCurrent, axisVec)));
      
      // Calculate rotation angle
      const startNorm = startProj.normalize();
      const currentNorm = currentProj.normalize();
      const angle = Math.acos(Math.max(-1, Math.min(1, Vector3.Dot(startNorm, currentNorm))));
      
      // Determine rotation direction using cross product
      const cross = Vector3.Cross(startNorm, currentNorm);
      const direction = Vector3.Dot(cross, axisVec) >= 0 ? 1 : -1;
      const finalAngle = direction * angle;

      // Apply rotation using quaternion (NO GIMBAL LOCK!)
      const rotationQuat = Quaternion.RotationAxis(
        this._activeAxis.axisVector,
        finalAngle
      );
      const newQuat = rotationQuat.multiply(this._initialQuaternion);
      
      // Apply to mesh
      if (this._attachedMesh.rotationQuaternion) {
        this._attachedMesh.rotationQuaternion = newQuat;
      } else {
        // Convert back to Euler (less ideal but fallback)
        const euler = newQuat.toEulerAngles();
        this._attachedMesh.rotation = euler;
      }

      // Notify change
      this.onRotationChangeObservable.forEach(cb => cb(newQuat));
    }
  }

  private _handlePointerUp(pointerInfo: PointerInfo): void {
    if (this._isDragging) {
      this._isDragging = false;
      this._activeAxis = null;
      this._dragStartPoint = null;
      
      // Reset highlighting
      this._resetHighlighting();
      
      // Notify end
      this.onDragEndObservable.forEach(cb => cb());
    }
  }

  private _highlightAxis(axis: GizmoAxis): void {
    this._axes.forEach(a => {
      const mat = a.mesh.material as any;
      if (mat) {
        mat.diffuseColor = a === axis ? this._selectedColor : a.color.scale(0.5);
        mat.emissiveColor = a === axis ? this._selectedColor.scale(0.5) : a.color.scale(0.2);
      }
    });
  }

  private _resetHighlighting(): void {
    this._axes.forEach(a => {
      const mat = a.mesh.material as any;
      if (mat) {
        mat.diffuseColor = a.color;
        mat.emissiveColor = a.color.scale(0.3);
      }
    });
  }

  // -----------------------------------------------------------------------
  // Position & Rotation
  // -----------------------------------------------------------------------

  private _updateGizmoRotation(): void {
    if (!this._attachedMesh) return;

    // Get world position and rotation of attached mesh
    const worldMatrix = this._attachedMesh.getWorldMatrix();
    const position = Vector3.TransformCoordinates(Vector3.Zero(), worldMatrix);
    
    this._rootNode.position = position;

    // Get rotation - prefer quaternion
    let rotQuat: Quaternion;
    if (this._attachedMesh.rotationQuaternion) {
      rotQuat = this._attachedMesh.rotationQuaternion;
    } else {
      rotQuat = Quaternion.RotationYawPitchRoll(
        this._attachedMesh.rotation.y,
        this._attachedMesh.rotation.x,
        this._attachedMesh.rotation.z
      );
    }

    // Apply rotation to root
    if (this._rootNode.rotationQuaternion) {
      this._rootNode.rotationQuaternion = rotQuat;
    } else {
      const euler = rotQuat.toEulerAngles();
      this._rootNode.rotation = euler;
    }
  }

  public update(): void {
    this._updateGizmoRotation();
  }

  // -----------------------------------------------------------------------
  // Visibility
  // -----------------------------------------------------------------------

  public setEnabled(enabled: boolean): void {
    this._axes.forEach(axis => {
      axis.mesh.isVisible = enabled;
    });
  }

  // -----------------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------------

  public dispose(): void {
    this._axes.forEach(axis => {
      axis.mesh.dispose();
    });
    this._rootNode.dispose();
    this.onRotationChangeObservable = [];
    this.onDragStartObservable = [];
    this.onDragEndObservable = [];
  }
}

// Need TransformNode for the gizmo root
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
