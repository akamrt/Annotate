// ============================================================
// MayaMatrixMath.ts — Pure-math implementation of Maya's
//   transform decomposition using Babylon.js Matrix types.
//
//   Maya local-matrix formula:
//     M = T · Rp · Ro · R · Rp⁻¹ · Sp · S · Sp⁻¹ · Moffset
//
//   Where:
//     T       = Translation
//     Rp      = Rotate-pivot translation
//     Ro      = Rotate-axis / orient (jointOrient)
//     R       = Rotation (Euler with custom order)
//     Rp⁻¹   = Inverse rotate-pivot
//     Sp      = Scale-pivot translation
//     S       = Scale
//     Sp⁻¹   = Inverse scale-pivot
//     Moffset = Frozen / baked offset matrix
// ============================================================

import { Matrix, Vector3, Quaternion } from '@babylonjs/core/Maths/math.vector';
import { RotationOrder, TransformOp, DEFAULT_OP_ORDER, type MayaTransformParams, type TransformChannels, defaultTransformChannels } from './types';

// ---------------------------------------------------------------------------
// Euler → Rotation matrix  (respects rotation order)
// ---------------------------------------------------------------------------

/**
 * Build a rotation matrix from Euler angles (radians) in the specified order.
 *
 * The multiplication follows inner-to-outer convention:
 *   XYZ  →  Rz · Ry · Rx   (X applied first)
 *
 * Babylon.js matrices are **row-major** and multiply on the LEFT,
 * so we compose:  result = Rfirst.multiply(Rsecond).multiply(Rthird)
 */
export function buildRotationMatrix(
  euler: { x: number; y: number; z: number },
  order: RotationOrder,
): Matrix {
  const rx = Matrix.RotationX(euler.x);
  const ry = Matrix.RotationY(euler.y);
  const rz = Matrix.RotationZ(euler.z);

  // Each case returns the matrix that applies rotations in the named order
  // (first letter = rotation applied first, i.e. innermost).
  switch (order) {
    case RotationOrder.XYZ: return rx.multiply(ry).multiply(rz);
    case RotationOrder.XZY: return rx.multiply(rz).multiply(ry);
    case RotationOrder.YXZ: return ry.multiply(rx).multiply(rz);
    case RotationOrder.YZX: return ry.multiply(rz).multiply(rx);
    case RotationOrder.ZXY: return rz.multiply(rx).multiply(ry);
    case RotationOrder.ZYX: return rz.multiply(ry).multiply(rx);
    default:                return rx.multiply(ry).multiply(rz);
  }
}

// ---------------------------------------------------------------------------
// Full Maya local-matrix computation
// ---------------------------------------------------------------------------

/**
 * Compute the Maya-style local matrix from the given transform parameters.
 *
 * Maya's formula (column-vector convention, read right-to-left):
 *   M = T · Rp · Ro · R · Rp⁻¹ · Sp · S · Sp⁻¹ · Moffset
 *
 * Babylon.js uses ROW-VECTOR convention where v' = v · M.
 * In this convention, A.multiply(B) means "apply A first, then B".
 *
 * The `opOrder` parameter controls the multiplication order. Each entry
 * specifies which matrix operation to apply next. The first entry is
 * applied first (innermost), the last entry is applied last (outermost).
 *
 * Default order (Maya-correct for row-vectors):
 *   Offset → Sp⁻¹ → S → Sp → Rp⁻¹ → R → Ro → Rp → T
 */
export function buildMayaLocalMatrix(
  params: MayaTransformParams,
  offsetMatrix: Matrix = Matrix.Identity(),
  opOrder: TransformOp[] = DEFAULT_OP_ORDER,
): Matrix {
  const { translate, rotate, scale, rotatePivot, scalePivot, rotateAxis, rotationOrder } = params;

  // Pre-compute all operation matrices
  const opMatrices: Record<TransformOp, Matrix> = {
    [TransformOp.Translation]:    Matrix.Translation(translate.x, translate.y, translate.z),
    [TransformOp.RotatePivot]:    Matrix.Translation(rotatePivot.x, rotatePivot.y, rotatePivot.z),
    [TransformOp.RotatePivotInv]: Matrix.Translation(-rotatePivot.x, -rotatePivot.y, -rotatePivot.z),
    [TransformOp.RotateAxis]:     buildRotationMatrix(rotateAxis, RotationOrder.XYZ),
    [TransformOp.Rotation]:       buildRotationMatrix(rotate, rotationOrder),
    [TransformOp.ScalePivot]:     Matrix.Translation(scalePivot.x, scalePivot.y, scalePivot.z),
    [TransformOp.ScalePivotInv]:  Matrix.Translation(-scalePivot.x, -scalePivot.y, -scalePivot.z),
    [TransformOp.Scale]:          Matrix.Scaling(scale.x, scale.y, scale.z),
    [TransformOp.Offset]:         offsetMatrix,
  };

  // Compose in the specified order
  let result = opMatrices[opOrder[0]];
  for (let i = 1; i < opOrder.length; i++) {
    result = result.multiply(opMatrices[opOrder[i]]);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Freeze Transforms — bake world position into offset, zero channels
// ---------------------------------------------------------------------------

export interface FreezeResult {
  /** The offset matrix that preserves the current world position. */
  offsetMatrix: Matrix;
  /** Zeroed-out channels to assign after freezing. */
  channels: TransformChannels;
}

/**
 * Compute the offset matrix that allows all TRS channels to be zeroed
 * while maintaining the node's current world-space position.
 *
 * Given:
 *   currentWorld = localMatrix × parentWorld
 *   identityLocal = buildMayaLocalMatrix(zeroedChannels)  ≈  Identity
 *   desiredWorld  = identityLocal × offset × parentWorld = currentWorld
 *
 * Therefore:
 *   offset = parentWorld⁻¹ × currentWorld
 *   (since identityLocal ≈ I when channels are zeroed)
 */
export function freezeTransform(
  currentWorldMatrix: Matrix,
  parentWorldMatrix: Matrix,
): FreezeResult {
  // Invert the parent world to isolate our local contribution
  const parentInverse = Matrix.Identity();
  parentWorldMatrix.invertToRef(parentInverse);

  const offsetMatrix = parentInverse.multiply(currentWorldMatrix);

  return {
    offsetMatrix,
    channels: defaultTransformChannels(),
  };
}

// ---------------------------------------------------------------------------
// Utility: decompose a matrix back into TRS (for debugging / display)
// ---------------------------------------------------------------------------

export function decomposeMatrix(m: Matrix): {
  translation: Vector3;
  rotation: Quaternion;
  scale: Vector3;
} {
  const scale = new Vector3();
  const rotation = new Quaternion();
  const translation = new Vector3();
  m.decompose(scale, rotation, translation);
  return { translation, rotation, scale };
}
