// ============================================================
// engine/index.ts — Barrel export for the 3D Transform &
//   Animation engine.
// ============================================================

// Types & enums
export { RotationOrder, TangentMode, InfinityMode } from './types';
export type {
  ChannelPath,
  TangentHandle,
  TransformChannels,
  MayaTransformParams,
} from './types';
export { defaultTransformChannels } from './types';

// Maya math
export {
  buildRotationMatrix,
  buildMayaLocalMatrix,
  freezeTransform,
  decomposeMatrix,
} from './MayaMatrixMath';
export type { FreezeResult } from './MayaMatrixMath';

// Matrix stack
export { MatrixStack } from './MatrixStack';
export type { MatrixStackLayer } from './MatrixStack';

// Transform node
export { CustomTransformNode } from './CustomTransformNode';

// F-Curve
export { FCurve, createKeyframe } from './FCurve';
export type { Keyframe } from './FCurve';

// Channel binding
export { AnimationClip, createBinding } from './ChannelBinding';
export type { ChannelBinding } from './ChannelBinding';

// Animation evaluator
export { AnimationEvaluator } from './AnimationEvaluator';

// Constraints
export { ConstraintBase, ConstraintStack } from './ConstraintBase';
