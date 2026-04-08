// ============================================================
// ConstraintBase.ts — Abstract base class for transform
//   constraints (IK, Aim, Parent, Point, Orient, etc.)
//
//   Constraints are evaluated AFTER F-Curve animation but
//   BEFORE the final world matrix is computed.  They modify
//   the local matrix via CustomTransformNode.constraintOverride.
//
//   DAG Evaluation Order:
//     1. AnimationEvaluator pushes F-Curve values → channels
//     2. CustomTransformNode.computeWorldMatrix():
//        a. MatrixStack evaluates → localMatrix
//        b. constraintOverride(localMatrix) → modified localMatrix
//        c. localMatrix × parentWorld → worldMatrix
//     3. Babylon renders
// ============================================================

import { Matrix } from '@babylonjs/core/Maths/math.vector';
import type { CustomTransformNode } from './CustomTransformNode';

// ---------------------------------------------------------------------------
// ConstraintBase — abstract
// ---------------------------------------------------------------------------

export abstract class ConstraintBase {
  /** Constraint blend weight [0..1]. At 0, the constraint has no effect. */
  public weight: number = 1.0;

  /** When false, this constraint is skipped entirely. */
  public enabled: boolean = true;

  /**
   * Evaluation priority.  Lower numbers are evaluated first.
   * Use this when multiple constraints are chained on a single node.
   */
  public priority: number = 0;

  /** Human-readable name for UI display. */
  public name: string;

  constructor(name: string) {
    this.name = name;
  }

  /**
   * Evaluate the constraint and return a potentially modified local matrix.
   *
   * @param node         The CustomTransformNode being constrained.
   * @param localMatrix  The local matrix BEFORE this constraint (output of MatrixStack or previous constraint).
   * @param time         Current evaluation time (frame number).
   * @returns            The modified local matrix.  Return `localMatrix` unchanged to pass through.
   */
  abstract evaluate(
    node: CustomTransformNode,
    localMatrix: Matrix,
    time: number,
  ): Matrix;
}

// ---------------------------------------------------------------------------
// ConstraintStack — manages multiple constraints on a single node
// ---------------------------------------------------------------------------

export class ConstraintStack {
  private _constraints: ConstraintBase[] = [];

  /** Add a constraint and re-sort by priority. */
  add(constraint: ConstraintBase): void {
    this._constraints.push(constraint);
    this._constraints.sort((a, b) => a.priority - b.priority);
  }

  /** Remove a constraint by name. */
  remove(name: string): void {
    this._constraints = this._constraints.filter(c => c.name !== name);
  }

  /** Get all constraints (read-only). */
  get constraints(): ReadonlyArray<ConstraintBase> {
    return this._constraints;
  }

  /**
   * Evaluate all enabled constraints in priority order.
   *
   * Each constraint receives the output of the previous one,
   * forming a sequential pipeline:
   *   localMatrix → constraint1 → constraint2 → ... → final localMatrix
   */
  evaluate(node: CustomTransformNode, localMatrix: Matrix, time: number): Matrix {
    let result = localMatrix;

    for (const constraint of this._constraints) {
      if (!constraint.enabled) continue;

      const constrained = constraint.evaluate(node, result, time);

      // Apply weight blending
      if (constraint.weight < 1.0) {
        result = ConstraintStack._blendMatrices(result, constrained, constraint.weight);
      } else {
        result = constrained;
      }
    }

    return result;
  }

  /** Element-wise blend between two matrices. */
  private static _blendMatrices(a: Matrix, b: Matrix, weight: number): Matrix {
    const am = a.m;
    const bm = b.m;
    const result = new Float32Array(16);
    for (let i = 0; i < 16; i++) {
      result[i] = am[i] + (bm[i] - am[i]) * weight;
    }
    return Matrix.FromArray(result);
  }

  /**
   * Install this stack as the constraintOverride on a CustomTransformNode.
   *
   * Call this once during setup:
   *   ```
   *   const stack = new ConstraintStack();
   *   stack.add(myIKConstraint);
   *   stack.install(myNode);
   *   ```
   */
  install(node: CustomTransformNode): void {
    node.constraintOverride = (localMatrix: Matrix, time: number) => {
      return this.evaluate(node, localMatrix, time);
    };
  }

  /** Remove the constraint override from a node. */
  uninstall(node: CustomTransformNode): void {
    node.constraintOverride = null;
  }
}
