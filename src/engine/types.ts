// ============================================================
// types.ts — Shared enums, interfaces, and type aliases for
//            the 3D Transform & Animation engine.
// ============================================================

// ---------------------------------------------------------------------------
// Rotation Orders — all six Euler permutations.
// The enum value encodes the multiplication sequence:
//   e.g. XYZ  →  Rx * Ry * Rz  (inner-most rotation applied first)
// ---------------------------------------------------------------------------
export enum RotationOrder {
  XYZ = 'XYZ',
  XZY = 'XZY',
  YXZ = 'YXZ',
  YZX = 'YZX',
  ZXY = 'ZXY',
  ZYX = 'ZYX',
}

// ---------------------------------------------------------------------------
// Tangent / Interpolation modes used by F-Curve keyframes
// ---------------------------------------------------------------------------
export enum TangentMode {
  /** Cubic Bézier – handles define a parametric cubic. */
  Bezier  = 'Bezier',
  /** Linear – straight line between keys. */
  Linear  = 'Linear',
  /** Step / Hold – value snaps instantly at each key. */
  Step    = 'Step',
  /** Hermite spline – auto-tangent from neighbouring keys. */
  Spline  = 'Spline',
}

// ---------------------------------------------------------------------------
// Infinity behaviour for F-Curves outside the key range
// ---------------------------------------------------------------------------
export enum InfinityMode {
  Constant = 'Constant',
  Linear   = 'Linear',
  Cycle    = 'Cycle',
}

// ---------------------------------------------------------------------------
// Channel paths — target property on a CustomTransformNode
// ---------------------------------------------------------------------------
export type ChannelPath =
  | 'translateX' | 'translateY' | 'translateZ'
  | 'rotateX'    | 'rotateY'    | 'rotateZ'
  | 'scaleX'     | 'scaleY'     | 'scaleZ'
  | (string & {}); // extensible for user-defined attributes

// ---------------------------------------------------------------------------
// 2D tangent handle (used by Keyframe in/out tangents)
// ---------------------------------------------------------------------------
export interface TangentHandle {
  /** Horizontal component (time delta relative to key). */
  x: number;
  /** Vertical component (value delta relative to key). */
  y: number;
}

// ---------------------------------------------------------------------------
// Float channels that describe a Maya-style transform node
// ---------------------------------------------------------------------------
export interface TransformChannels {
  translateX: number;
  translateY: number;
  translateZ: number;
  rotateX: number;
  rotateY: number;
  rotateZ: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
}

// ---------------------------------------------------------------------------
// Parameters fed into the Maya local-matrix formula
// ---------------------------------------------------------------------------
export interface MayaTransformParams {
  translate:    { x: number; y: number; z: number };
  rotate:       { x: number; y: number; z: number };
  scale:        { x: number; y: number; z: number };
  rotatePivot:  { x: number; y: number; z: number };
  scalePivot:   { x: number; y: number; z: number };
  rotateAxis:   { x: number; y: number; z: number };
  rotationOrder: RotationOrder;
}

// ---------------------------------------------------------------------------
// Default (identity) transform channels
// ---------------------------------------------------------------------------
export function defaultTransformChannels(): TransformChannels {
  return {
    translateX: 0, translateY: 0, translateZ: 0,
    rotateX: 0,    rotateY: 0,    rotateZ: 0,
    scaleX: 1,     scaleY: 1,     scaleZ: 1,
  };
}

// ---------------------------------------------------------------------------
// Transform Operation — individual matrix operations that can be reordered
// ---------------------------------------------------------------------------

/**
 * Each value represents one matrix operation in the transform pipeline.
 * The order of these operations in an array determines the multiplication
 * order, turning the "Maya formula" into a user-configurable pipeline.
 *
 * In Babylon's row-vector convention, the FIRST operation in the array
 * is the INNERMOST (applied first to vertices), and the LAST is the
 * OUTERMOST (applied last).
 */
export enum TransformOp {
  Offset         = 'Offset',
  ScalePivotInv  = 'Scale Pivot⁻¹',
  Scale          = 'Scale',
  ScalePivot     = 'Scale Pivot',
  RotatePivotInv = 'Rotate Pivot⁻¹',
  Rotation       = 'Rotation',
  RotateAxis     = 'Rotate Axis',
  RotatePivot    = 'Rotate Pivot',
  Translation    = 'Translation',
}

/**
 * Default Maya-correct operation order for Babylon's row-vector convention.
 * Read top-to-bottom = applied first to last:
 *   Offset → Scale (around pivot) → Rotate (around pivot) → Translate
 */
export const DEFAULT_OP_ORDER: TransformOp[] = [
  TransformOp.Offset,
  TransformOp.ScalePivotInv,
  TransformOp.Scale,
  TransformOp.ScalePivot,
  TransformOp.RotatePivotInv,
  TransformOp.Rotation,
  TransformOp.RotateAxis,
  TransformOp.RotatePivot,
  TransformOp.Translation,
];

/** Metadata for each operation (for UI display) */
export const TRANSFORM_OP_META: Record<TransformOp, {
  label: string;
  shortLabel: string;
  color: string;
  group: 'translate' | 'rotate' | 'scale' | 'pivot' | 'offset';
  description: string;
}> = {
  [TransformOp.Translation]:    { label: 'Translation',       shortLabel: 'T',   color: '#44aaff', group: 'translate', description: 'Move the object in space' },
  [TransformOp.Rotation]:       { label: 'Rotation',          shortLabel: 'R',   color: '#44dd44', group: 'rotate',    description: 'Rotate around the axis' },
  [TransformOp.RotateAxis]:     { label: 'Rotate Axis',       shortLabel: 'Ro',  color: '#33aa33', group: 'rotate',    description: 'Joint orient / rotate axis' },
  [TransformOp.RotatePivot]:    { label: 'Rotate Pivot',      shortLabel: 'Rp',  color: '#338833', group: 'pivot',     description: 'Rotate pivot offset' },
  [TransformOp.RotatePivotInv]: { label: 'Rotate Pivot⁻¹',    shortLabel: 'Rp⁻¹', color: '#338833', group: 'pivot',   description: 'Inverse rotate pivot' },
  [TransformOp.Scale]:          { label: 'Scale',             shortLabel: 'S',   color: '#ff6644', group: 'scale',     description: 'Scale the object' },
  [TransformOp.ScalePivot]:     { label: 'Scale Pivot',       shortLabel: 'Sp',  color: '#993322', group: 'pivot',     description: 'Scale pivot offset' },
  [TransformOp.ScalePivotInv]:  { label: 'Scale Pivot⁻¹',     shortLabel: 'Sp⁻¹', color: '#993322', group: 'pivot',   description: 'Inverse scale pivot' },
  [TransformOp.Offset]:         { label: 'Offset Matrix',     shortLabel: 'Mo',  color: '#aa88ff', group: 'offset',    description: 'Frozen / baked offset' },
};
