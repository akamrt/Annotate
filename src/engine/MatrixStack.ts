// ============================================================
// MatrixStack.ts — A composable, user-orderable stack of
//   transform operations that evaluates to a single matrix.
//
//   Layers are multiplied in order (index 0 first).  Each layer
//   can be enabled/disabled and weighted for blending.
// ============================================================

import { Matrix } from '@babylonjs/core/Maths/math.vector';

// ---------------------------------------------------------------------------
// Layer interface — each layer computes a single matrix contribution
// ---------------------------------------------------------------------------

export interface MatrixStackLayer {
  /** Unique identifier for this layer. */
  readonly id: string;
  /** Human-readable name (for UI display). */
  name: string;
  /** When false, this layer's matrix is treated as Identity. */
  enabled: boolean;
  /**
   * Blend weight in [0, 1].  At 0 the layer is Identity; at 1 it's fully
   * applied.  Intermediate values perform a matrix lerp (slerp for the
   * rotation component) between Identity and the layer's output.
   */
  weight: number;
  /**
   * Compute this layer's matrix contribution for the current frame.
   * This is called each time the stack is evaluated and the stack is dirty.
   */
  computeMatrix(): Matrix;
}

// ---------------------------------------------------------------------------
// MatrixStack — ordered collection of layers → single result matrix
// ---------------------------------------------------------------------------

export class MatrixStack {
  private _layers: MatrixStackLayer[] = [];
  private _cachedResult: Matrix = Matrix.Identity();
  private _isDirty: boolean = true;
  private _version: number = 0;

  // ---- Layer management ---------------------------------------------------

  /** Append or insert a layer at the given index. */
  addLayer(layer: MatrixStackLayer, index?: number): void {
    if (index !== undefined && index >= 0 && index <= this._layers.length) {
      this._layers.splice(index, 0, layer);
    } else {
      this._layers.push(layer);
    }
    this._markDirty();
  }

  /** Remove a layer by its id. */
  removeLayer(id: string): void {
    const idx = this._layers.findIndex(l => l.id === id);
    if (idx !== -1) {
      this._layers.splice(idx, 1);
      this._markDirty();
    }
  }

  /** Get a layer by id. */
  getLayer(id: string): MatrixStackLayer | undefined {
    return this._layers.find(l => l.id === id);
  }

  /** Re-order layers by providing an ordered array of ids. */
  reorderLayers(orderedIds: string[]): void {
    const map = new Map(this._layers.map(l => [l.id, l]));
    const reordered: MatrixStackLayer[] = [];
    for (const id of orderedIds) {
      const layer = map.get(id);
      if (layer) {
        reordered.push(layer);
        map.delete(id);
      }
    }
    // Append any layers not mentioned in orderedIds (preserve them at the end)
    for (const remaining of map.values()) {
      reordered.push(remaining);
    }
    this._layers = reordered;
    this._markDirty();
  }

  /** Read-only snapshot of the current layer order. */
  get layers(): ReadonlyArray<Readonly<MatrixStackLayer>> {
    return this._layers;
  }

  /** Number of layers in the stack. */
  get count(): number {
    return this._layers.length;
  }

  // ---- Evaluation ---------------------------------------------------------

  /**
   * Evaluate the stack: multiply all enabled layers in order.
   *
   * If the stack is not dirty, returns the cached result immediately.
   * Disabled layers contribute Identity.  Layers with weight < 1 are
   * interpolated toward Identity (simple lerp on the 16 matrix elements;
   * for more accuracy a decompose → slerp path could be used).
   */
  evaluate(): Matrix {
    if (!this._isDirty) {
      return this._cachedResult;
    }

    let result = Matrix.Identity();

    for (const layer of this._layers) {
      if (!layer.enabled) continue;

      let layerMatrix = layer.computeMatrix();

      // Apply weight blending (lerp toward Identity for weight < 1)
      if (layer.weight < 1.0) {
        layerMatrix = MatrixStack._lerpMatrix(Matrix.Identity(), layerMatrix, layer.weight);
      }

      result = result.multiply(layerMatrix);
    }

    this._cachedResult = result;
    this._isDirty = false;
    return result;
  }

  // ---- Dirty tracking -----------------------------------------------------

  /** Mark the stack as needing re-evaluation. */
  markDirty(): void {
    this._markDirty();
  }

  /** Monotonically increasing version counter — cheap external dirty check. */
  get version(): number {
    return this._version;
  }

  get isDirty(): boolean {
    return this._isDirty;
  }

  // ---- Private helpers ----------------------------------------------------

  private _markDirty(): void {
    this._isDirty = true;
    this._version++;
  }

  /**
   * Element-wise lerp between two matrices.
   *
   * This is a simple but effective approach for additive/offset layers.
   * For layers that contain significant rotation, a decompose → slerp
   * approach would be more geometrically correct, but also more expensive.
   */
  private static _lerpMatrix(a: Matrix, b: Matrix, t: number): Matrix {
    const am = a.m;
    const bm = b.m;
    const result = new Float32Array(16);
    for (let i = 0; i < 16; i++) {
      result[i] = am[i] + (bm[i] - am[i]) * t;
    }
    return Matrix.FromArray(result);
  }
}
