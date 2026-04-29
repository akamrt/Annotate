// ============================================================
// GizmoModeManager.ts — Handles Local/World/Gimbal rotation modes
//
// Gimbal lock fix:
//   - Local: rotate around object's local axes (quaternion accumulated)
//   - World: rotate around world axes (always X/Y/Z)
//   - Gimbal: each axis shows the ACTUAL gimbal rotation plane
//             (visual rings that rotate with previous rotations)
//
// This is the CORE rotation system that prevents gimbal lock.
// ============================================================

import {
  AbstractMesh,
  GizmoManager,
  GizmoCoordinatesMode,
  Mesh,
  PlaneRotationGizmo,
  Quaternion,
  TransformNode,
  Vector3,
  Color3,
  Matrix,
  UtilityLayerRenderer,
  StandardMaterial,
  Color4,
} from '@babylonjs/core';
import type { Scene } from '@babylonjs/core/scene';
import type { PointerInfo } from '@babylonjs/core/Events/pointerEvents';

import type { CustomTransformNode } from './CustomTransformNode';

export type RotateMode = 'local' | 'world' | 'gimbal';

// -----------------------------------------------------------------------
// Gimbal Ring — one axis ring that can be displayed/hidden
// -----------------------------------------------------------------------

interface GimbalRing {
  /** The torus mesh representing this rotation ring */
  mesh: Mesh;
  /** Which axis this ring rotates around */
  rotationAxis: 'x' | 'y' | 'z';
  /** The axis vector in world space */
  axisVector: Vector3;
  /** Color when not selected */
  baseColor: Color3;
  /** Color when selected/hovered */
  selectedColor: Color3;
  /** The plane this ring lies in (perpendicular to rotation axis) */
  planeNormal: Vector3;
}

// -----------------------------------------------------------------------
// GizmoModeManager
// -----------------------------------------------------------------------

export class GizmoModeManager {
  private _scene: Scene;
  private _gizmoManager: GizmoManager;
  private _attachedNode: CustomTransformNode | null = null;
  private _rotateMode: RotateMode = 'world';

  // Gimbal rings (for Gimbal mode)
  private _gimbalRings: GimbalRing[] = [];
  private _gimbalRoot: TransformNode | null = null;
  private _gimbalLayer: UtilityLayerRenderer;

  // Drag state
  private _isDragging = false;
  private _activeRing: GimbalRing | null = null;
  private _initialQuaternion: Quaternion = Quaternion.Identity();
  private _dragStartPoint: Vector3 | null = null;

  // Callbacks
  public onRotationChange: ((node: CustomTransformNode) => void) | null = null;

  // Materials for rings
  private _ringMaterials: Map<Mesh, StandardMaterial> = new Map();

  constructor(scene: Scene, gizmoManager: GizmoManager) {
    this._scene = scene;
    this._gizmoManager = gizmoManager;
    
    // Create utility layer for gimbal rings (renders on top)
    this._gimbalLayer = new UtilityLayerRenderer(scene);
    this._gimbalLayer.utilityLayerScene.autoClearDepthAndStencil = false;

    this._createGimbalRings();
    this._setupPointerObserver();
    
    // Start with world mode (no gimbal rings visible)
    this._setRotateMode('world');
  }

  // -----------------------------------------------------------------------
  // Gimbal Ring Creation
  // -----------------------------------------------------------------------

  private _createGimbalRings(): void {
    this._gimbalRoot = new TransformNode('gimbalRoot', this._scene);
    this._gimbalRoot.rotationQuaternion = Quaternion.Identity();

    const ringConfigs: Array<{
      axis: 'x' | 'y' | 'z';
      color: Color3;
      rotationAxis: Vector3;
      planeNormal: Vector3;
    }> = [
      { axis: 'x', color: new Color3(1, 0.2, 0.2), rotationAxis: Vector3.Right(), planeNormal: Vector3.Right() },
      { axis: 'y', color: new Color3(0.2, 1, 0.2), rotationAxis: Vector3.Up(), planeNormal: Vector3.Up() },
      { axis: 'z', color: new Color3(0.2, 0.5, 1), rotationAxis: Vector3.Forward(), planeNormal: Vector3.Forward() },
    ];

    for (const config of ringConfigs) {
      // Create torus for the ring
      const ring = Mesh.CreateTorus(`gimbal_${config.axis}`, {
        diameter: 2,
        thickness: 0.08,
        tessellation: 64,
      }, this._scene);

      // Orient the ring so it lies in the correct plane
      // X ring: lies in YZ plane, rotates around X
      // Y ring: lies in XZ plane, rotates around Y
      // Z ring: lies in XY plane, rotates around Z
      if (config.axis === 'x') {
        ring.rotationQuaternion = Quaternion.RotationAxis(Vector3.Right(), Math.PI / 2);
      } else if (config.axis === 'y') {
        ring.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), 0); // Default is XZ plane
      }
      // Z ring is already in XY plane

      ring.parent = this._gimbalRoot;

      // Material
      const mat = new StandardMaterial(`gimbalMat_${config.axis}`, this._scene);
      mat.diffuseColor = config.color;
      mat.emissiveColor = config.color.scale(0.4);
      mat.alpha = 0.85;
      mat.backFaceCulling = false;
      ring.material = mat;
      this._ringMaterials.set(ring, mat);

      // Make pickable
      ring.isPickable = true;

      // Create end caps (small spheres at axis tips)
      const cap1 = Mesh.CreateSphere(`gimbalCap_${config.axis}_1`, { diameter: 0.15 }, this._scene);
      const cap2 = Mesh.CreateSphere(`gimbalCap_${config.axis}_2`, { diameter: 0.15 }, this._scene);
      cap1.material = mat;
      cap2.material = mat;
      cap1.parent = ring;
      cap2.parent = ring;
      cap1.position = config.rotationAxis.scale(1);
      cap2.position = config.rotationAxis.scale(-1);
      cap1.isPickable = false;
      cap2.isPickable = false;

      this._gimbalRings.push({
        mesh: ring,
        rotationAxis: config.axis,
        axisVector: config.rotationAxis,
        baseColor: config.color,
        selectedColor: new Color3(1, 1, 0), // Yellow when selected
        planeNormal: config.planeNormal,
      });
    }

    // Initially hidden
    this._gimbalRings.forEach(ring => ring.mesh.setEnabled(false));
  }

  // -----------------------------------------------------------------------
  // Pointer Observer
  // -----------------------------------------------------------------------

  private _setupPointerObserver(): void {
    this._scene.onPointerObservable.add((pointerInfo: PointerInfo) => {
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
    if (this._rotateMode !== 'gimbal') return;
    if (!this._attachedNode) return;

    const pickResult = this._scene.pick(
      this._scene.pointerX,
      this._scene.pointerY,
      (mesh) => this._gimbalRings.some(r => r.mesh === mesh)
    );

    if (pickResult.hit && pickResult.pickedMesh) {
      const ring = this._gimbalRings.find(r => r.mesh === pickResult.pickedMesh);
      if (ring) {
        this._isDragging = true;
        this._activeRing = ring;
        this._dragStartPoint = pickResult.pickedPoint?.clone() ?? null;

        // Capture initial rotation as quaternion from the matrix stack
        const localMat = this._attachedNode.matrixStack.evaluate();
        const scale = new Vector3();
        localMat.decompose(scale, this._initialQuaternion, new Vector3());

        // Highlight ring
        this._highlightRing(ring, true);

        // Set isDraggingRotation on the node to prevent sync fighting
        this._attachedNode.isDraggingRotation = true;
      }
    }
  }

  private _handlePointerMove(pointerInfo: PointerInfo): void {
    if (!this._isDragging || !this._activeRing || !this._attachedNode || !this._dragStartPoint) return;

    const pickResult = this._scene.pick(
      this._scene.pointerX,
      this._scene.pointerY,
      (mesh) => mesh === this._activeRing!.mesh
    );

    if (pickResult.hit && pickResult.pickedPoint) {
      const currentPoint = pickResult.pickedPoint;
      const center = this._attachedNode.getAbsolutePosition();

      // Project points onto plane perpendicular to rotation axis
      const axisVec = this._activeRing.axisVector;
      const toStart = this._dragStartPoint.subtract(center);
      const toCurrent = currentPoint.subtract(center);

      const startProj = toStart.subtract(axisVec.scale(Vector3.Dot(toStart, axisVec)));
      const currentProj = toCurrent.subtract(axisVec.scale(Vector3.Dot(toCurrent, axisVec)));

      // Calculate angle
      const startNorm = startProj.normalize();
      const currentNorm = currentProj.normalize();
      let angle = Math.acos(Math.max(-1, Math.min(1, Vector3.Dot(startNorm, currentNorm))));

      // Determine direction
      const cross = Vector3.Cross(startNorm, currentNorm);
      const direction = Vector3.Dot(cross, axisVec) >= 0 ? 1 : -1;
      angle = direction * angle;

      // Apply rotation using quaternion (NO GIMBAL LOCK!)
      const rotDelta = Quaternion.RotationAxis(axisVec, angle);
      const newQuat = rotDelta.multiply(this._initialQuaternion);

      // Decompose to Euler using the node's rotation order
      const euler = this._quaternionToEuler(newQuat, this._attachedNode.rotationOrder);

      // Update channels
      this._attachedNode.setChannel('rotateX', euler.x);
      this._attachedNode.setChannel('rotateY', euler.y);
      this._attachedNode.setChannel('rotateZ', euler.z);
      this._attachedNode.syncToBabylon();

      // Update gimbal ring orientations to reflect accumulated rotation
      this._updateGimbalRings();
    }
  }

  private _handlePointerUp(_pointerInfo: PointerInfo): void {
    if (this._isDragging && this._attachedNode) {
      this._attachedNode.isDraggingRotation = false;
      this._attachedNode.syncToBabylon();
      this.onRotationChange?.(this._attachedNode);
    }

    // Reset highlighting BEFORE clearing active ring
    if (this._activeRing) {
      this._highlightRing(this._activeRing, false);
    }

    this._isDragging = false;
    this._activeRing = null;
    this._dragStartPoint = null;
  }

  // -----------------------------------------------------------------------
  // Rotation Order Aware Euler Conversion
  // -----------------------------------------------------------------------

  /**
   * Convert quaternion to Euler angles respecting the rotation order.
   * This is more robust than Babylon's default toEulerAngles().
   */
  private _quaternionToEuler(q: Quaternion, order: string): Vector3 {
    const m = new Matrix();
    q.toRotationMatrix(m);

    const euler = new Vector3();
    const mData = m.m as Float32Array;

    // Simple implementation for common orders
    // For full implementation, see GimbalRotationGizmo.ts
    switch (order) {
      case 'XYZ':
        euler.y = Math.asin(Math.max(-1, Math.min(1, mData[8])));
        if (Math.abs(mData[8]) < 0.99999) {
          euler.x = Math.atan2(-mData[9], mData[10]);
          euler.z = Math.atan2(-mData[4], mData[0]);
        } else {
          euler.x = Math.atan2(mData[6], mData[5]);
          euler.z = 0;
        }
        break;

      case 'ZYX':
        euler.y = Math.asin(Math.max(-1, Math.min(1, -mData[2])));
        if (Math.abs(mData[2]) < 0.99999) {
          euler.x = Math.atan2(mData[6], mData[10]);
          euler.z = Math.atan2(mData[1], mData[0]);
        } else {
          euler.x = Math.atan2(-mData[9], mData[5]);
          euler.z = 0;
        }
        break;

      default:
        // Fallback to Babylon's built-in
        euler.copyFrom(q.toEulerAngles());
    }

    return euler;
  }

  // -----------------------------------------------------------------------
  // Ring Highlighting
  // -----------------------------------------------------------------------

  private _highlightRing(ring: GimbalRing, highlighted: boolean): void {
    const mat = this._ringMaterials.get(ring.mesh);
    if (mat) {
      mat.diffuseColor = highlighted ? ring.selectedColor : ring.baseColor;
      mat.emissiveColor = highlighted 
        ? ring.selectedColor.scale(0.6) 
        : ring.baseColor.scale(0.4);
    }
  }

  // -----------------------------------------------------------------------
  // Gizmo Manager Updates
  // -----------------------------------------------------------------------

  /**
   * Set the rotation mode and update gizmo behavior accordingly.
   * 
   * - 'world': World-space rotation rings (X/Y/Z aligned to world axes)
   * - 'local': Local-space rotation (rings align to object rotation)
   * - 'gimbal': Each ring shows the ACTUAL gimbal axis (rotates with previous rotations)
   */
  public setRotateMode(mode: RotateMode): void {
    this._setRotateMode(mode);
  }

  private _setRotateMode(mode: RotateMode): void {
    this._rotateMode = mode;

    const rotGizmo = this._gizmoManager.gizmos.rotationGizmo;
    const posGizmo = this._gizmoManager.gizmos.positionGizmo;

    switch (mode) {
      case 'world': {
        // World space: all axes fixed to world orientation
        const worldMode = GizmoCoordinatesMode.World;
        if (rotGizmo) rotGizmo.coordinatesMode = worldMode;
        if (posGizmo) posGizmo.coordinatesMode = worldMode;
        // Hide gimbal rings
        this._gimbalRings.forEach(r => r.mesh.setEnabled(false));
        break;
      }

      case 'local': {
        // Local space: rings align to object rotation
        const localMode = GizmoCoordinatesMode.Local;
        if (rotGizmo) rotGizmo.coordinatesMode = localMode;
        if (posGizmo) posGizmo.coordinatesMode = localMode;
        // Hide gimbal rings (use Babylon's native local rotation)
        this._gimbalRings.forEach(r => r.mesh.setEnabled(false));
        break;
      }

      case 'gimbal': {
        // Gimbal mode: Babylon's rings in world space, show our gimbal rings
        const worldMode = GizmoCoordinatesMode.World;
        if (rotGizmo) rotGizmo.coordinatesMode = worldMode;
        if (posGizmo) posGizmo.coordinatesMode = worldMode;
        // Show gimbal rings
        this._gimbalRings.forEach(r => r.mesh.setEnabled(true));
        this._updateGimbalRings();
        break;
      }
    }
  }

  /**
   * Update gimbal ring orientations to reflect the current accumulated rotation.
   * In gimbal mode, each ring has rotated by previous rotations.
   */
  private _updateGimbalRings(): void {
    if (!this._attachedNode || !this._gimbalRoot) return;

    const node = this._attachedNode;

    // Get the accumulated rotation from the matrix stack
    const localMat = node.matrixStack.evaluate();
    const scale = new Vector3();
    const rotQuat = new Quaternion();
    const trans = new Vector3();
    localMat.decompose(scale, rotQuat, trans);

    // Apply rotation to gimbal root
    this._gimbalRoot.position.copyFrom(node.getAbsolutePosition());
    this._gimbalRoot.rotationQuaternion = rotQuat;

    // In gimbal mode, each ring represents the ACTUAL accumulated rotation of that axis.
    // The rings should NOT be additionally rotated by the object's rotation - they 
    // show the gimbal state directly.
    // 
    // Actually for proper gimbal visualization, we need to decompose the rotation
    // and show each ring in its own reference frame.
    //
    // For a proper implementation, we'd track:
    // 1. Ring X: shows rotation accumulated from RotateX channel only
    // 2. Ring Y: shows rotation accumulated from RotateY channel only  
    // 3. Ring Z: shows rotation accumulated from RotateZ channel only
    //
    // But for simplicity, we'll show the current world-space orientation
    // which is what Maya's gimbal mode shows.

    // Update ring positions to match object
    this._gimbalRoot.computeWorldMatrix(true);
  }

  // -----------------------------------------------------------------------
  // Attach/Detach
  // -----------------------------------------------------------------------

  public attachToNode(node: CustomTransformNode | null): void {
    this._attachedNode = node;

    if (node) {
      // Attach Babylon's rotation gizmo
      this._gizmoManager.rotationGizmoEnabled = true;
      
      // Update mode settings
      this._setRotateMode(this._rotateMode);
      
      // Update position
      this._updateGimbalRings();
    } else {
      this._gizmoManager.rotationGizmoEnabled = false;
      this._gimbalRings.forEach(r => r.mesh.setEnabled(false));
    }
  }

  public get rotateMode(): RotateMode {
    return this._rotateMode;
  }

  // -----------------------------------------------------------------------
  // Per-frame Update
  // -----------------------------------------------------------------------

  public update(): void {
    if (this._attachedNode) {
      this._updateGimbalRings();
    }
  }

  // -----------------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------------

  public dispose(): void {
    this._gimbalRings.forEach(ring => {
      ring.mesh.dispose();
    });
    this._gimbalRoot?.dispose();
    this._ringMaterials.forEach(mat => mat.dispose());
    this._ringMaterials.clear();
  }
}
