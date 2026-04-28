// ============================================================
// useGimbalGizmo.ts — React hook for GimbalRotationGizmo
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { Scene, Engine, Mesh, Quaternion } from '@babylonjs/core';
import { GimbalRotationGizmo, RotationOrder } from '../engine/GimbalRotationGizmo';

export interface UseGimbalGizmoOptions {
  /** Babylon scene */
  scene: Scene | null;
  /** The mesh to attach the gizmo to */
  mesh: Mesh | null;
  /** Rotation order (default: XYZ) */
  rotationOrder?: RotationOrder;
  /** Called when rotation changes */
  onRotationChange?: (quaternion: Quaternion) => void;
  /** Called when drag starts */
  onDragStart?: () => void;
  /** Called when drag ends */
  onDragEnd?: () => void;
}

export interface UseGimbalGizmoReturn {
  /** The gimbal gizmo instance */
  gizmo: GimbalRotationGizmo | null;
  /** Whether user is currently dragging */
  isDragging: boolean;
  /** Current rotation order */
  rotationOrder: RotationOrder;
  /** Set rotation order */
  setRotationOrder: (order: RotationOrder) => void;
  /** Enable/disable gizmo */
  setEnabled: (enabled: boolean) => void;
}

/**
 * Hook to manage a Maya/Blender-style gimbal rotation gizmo.
 * Uses quaternion math to avoid gimbal lock.
 */
export function useGimbalGizmo({
  scene,
  mesh,
  rotationOrder = RotationOrder.XYZ,
  onRotationChange,
  onDragStart,
  onDragEnd,
}: UseGimbalGizmoOptions): UseGimbalGizmoReturn {
  const gizmoRef = useRef<GimbalRotationGizmo | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [currentRotationOrder, setCurrentRotationOrder] = useState<RotationOrder>(rotationOrder);

  // Create gizmo when scene is ready
  useEffect(() => {
    if (!scene) return;

    const gizmo = new GimbalRotationGizmo({
      scene,
      rotationOrder,
      size: 1,
    });

    // Wire up callbacks
    if (onRotationChange) {
      gizmo.onRotationChangeObservable.push(onRotationChange);
    }
    if (onDragStart) {
      gizmo.onDragStartObservable.push(onDragStart);
    }
    if (onDragEnd) {
      gizmo.onDragEndObservable.push(onDragEnd);
    }

    gizmo.onDragStartObservable.push(() => setIsDragging(true));
    gizmo.onDragEndObservable.push(() => setIsDragging(false));

    gizmoRef.current = gizmo;

    return () => {
      gizmo.dispose();
      gizmoRef.current = null;
    };
  }, [scene]);

  // Attach/detach mesh
  useEffect(() => {
    if (gizmoRef.current) {
      gizmoRef.current.attachedMesh = mesh;
    }
  }, [mesh]);

  // Update rotation order
  useEffect(() => {
    if (gizmoRef.current) {
      gizmoRef.current.rotationOrder = rotationOrder;
      setCurrentRotationOrder(rotationOrder);
    }
  }, [rotationOrder]);

  const setRotationOrder = (order: RotationOrder) => {
    if (gizmoRef.current) {
      gizmoRef.current.rotationOrder = order;
      setCurrentRotationOrder(order);
    }
  };

  const setEnabled = (enabled: boolean) => {
    if (gizmoRef.current) {
      gizmoRef.current.setEnabled(enabled);
    }
  };

  return {
    gizmo: gizmoRef.current,
    isDragging,
    rotationOrder: currentRotationOrder,
    setRotationOrder,
    setEnabled,
  };
}

export { RotationOrder };
