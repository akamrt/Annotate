// ============================================================
// FCurve.ts — Deterministic F-Curve (function curve) system
//   designed for a Graph Editor UI.
//
//   An FCurve holds an ordered list of Keyframes and evaluates
//   at any time t to return an interpolated float value.
//   Supports Bézier, Linear, Step, and Hermite Spline modes.
// ============================================================

import { TangentMode, InfinityMode, type TangentHandle } from './types';

// ---------------------------------------------------------------------------
// Keyframe
// ---------------------------------------------------------------------------

export interface Keyframe {
  /** Time position (frame number; can be fractional for sub-frame). */
  time: number;
  /** Value at this keyframe. */
  value: number;
  /** Incoming tangent handle (relative to key position). */
  inTangent: TangentHandle;
  /** Outgoing tangent handle (relative to key position). */
  outTangent: TangentHandle;
  /** Interpolation mode OUT of this key (to the next key). */
  tangentMode: TangentMode;

  // ---- Graph Editor metadata (not used during evaluation) ----
  /** Whether this key is selected in the UI. */
  selected?: boolean;
  /** Whether this key is locked from editing. */
  locked?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a default keyframe at the given time and value. */
export function createKeyframe(
  time: number,
  value: number,
  mode: TangentMode = TangentMode.Bezier,
): Keyframe {
  return {
    time,
    value,
    inTangent:  { x: -1, y: 0 },
    outTangent: { x:  1, y: 0 },
    tangentMode: mode,
  };
}

// ---------------------------------------------------------------------------
// FCurve
// ---------------------------------------------------------------------------

export class FCurve {
  /** Keyframes — always kept sorted by time ascending. */
  public keys: Keyframe[] = [];

  /** Behaviour before the first keyframe. */
  public preInfinity: InfinityMode = InfinityMode.Constant;

  /** Behaviour after the last keyframe. */
  public postInfinity: InfinityMode = InfinityMode.Constant;

  // ---- Keyframe CRUD ------------------------------------------------------

  /** Insert a key, maintaining sort order by time. Returns the insertion index. */
  addKey(key: Keyframe): number {
    // Binary search for insertion point
    let lo = 0;
    let hi = this.keys.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.keys[mid].time < key.time) lo = mid + 1;
      else hi = mid;
    }

    // If a key already exists at the exact same time, replace it
    if (lo < this.keys.length && this.keys[lo].time === key.time) {
      this.keys[lo] = key;
      return lo;
    }

    this.keys.splice(lo, 0, key);
    return lo;
  }

  /** Remove the key at the given index. */
  removeKey(index: number): void {
    if (index >= 0 && index < this.keys.length) {
      this.keys.splice(index, 1);
    }
  }

  /** Move a key to a new time and value, re-sorting as needed. */
  moveKey(index: number, newTime: number, newValue: number): void {
    if (index < 0 || index >= this.keys.length) return;
    const key = this.keys[index];
    key.time = newTime;
    key.value = newValue;
    // Re-sort (remove and re-insert)
    this.keys.splice(index, 1);
    this.addKey(key);
  }

  /** Number of keyframes. */
  get length(): number {
    return this.keys.length;
  }

  // ---- Core evaluation ----------------------------------------------------

  /**
   * Evaluate the curve at the given time, returning an interpolated float.
   *
   * This is the hot path — called once per channel per frame.
   */
  evaluate(time: number): number {
    const n = this.keys.length;
    if (n === 0) return 0;
    if (n === 1) return this.keys[0].value;

    const firstKey = this.keys[0];
    const lastKey  = this.keys[n - 1];

    // Pre-infinity
    if (time <= firstKey.time) {
      return this._evaluatePreInfinity(time, firstKey, lastKey);
    }

    // Post-infinity
    if (time >= lastKey.time) {
      return this._evaluatePostInfinity(time, firstKey, lastKey);
    }

    // Find the surrounding keys (binary search)
    let lo = 0;
    let hi = n - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >>> 1;
      if (this.keys[mid].time <= time) lo = mid;
      else hi = mid;
    }

    const k1 = this.keys[lo];
    const k2 = this.keys[hi];

    // Dispatch to the appropriate interpolation method
    return this._interpolate(k1, k2, time);
  }

  // ---- Interpolation methods ----------------------------------------------

  private _interpolate(k1: Keyframe, k2: Keyframe, time: number): number {
    switch (k1.tangentMode) {
      case TangentMode.Step:
        return k1.value;

      case TangentMode.Linear:
        return this._evaluateLinear(k1, k2, time);

      case TangentMode.Spline:
        return this._evaluateHermite(k1, k2, time);

      case TangentMode.Bezier:
      default:
        return this._evaluateBezier(k1, k2, time);
    }
  }

  /** Linear interpolation between two keys. */
  private _evaluateLinear(k1: Keyframe, k2: Keyframe, time: number): number {
    const dt = k2.time - k1.time;
    if (dt === 0) return k1.value;
    const t = (time - k1.time) / dt;
    return k1.value + (k2.value - k1.value) * t;
  }

  /** Step / hold — return k1's value until we reach k2. */
  private _evaluateStep(_k1: Keyframe): number {
    return _k1.value;
  }

  /**
   * Cubic Bézier interpolation.
   *
   * The four control points in value-space are:
   *   P0 = (k1.time, k1.value)
   *   P1 = (k1.time + k1.outTangent.x, k1.value + k1.outTangent.y)
   *   P2 = (k2.time + k2.inTangent.x,  k2.value + k2.inTangent.y)
   *   P3 = (k2.time, k2.value)
   *
   * We need to find the parametric t ∈ [0,1] such that the x-component
   * of the cubic matches `time`, then evaluate the y-component.
   */
  private _evaluateBezier(k1: Keyframe, k2: Keyframe, time: number): number {
    // Control points (time axis)
    const x0 = k1.time;
    const x1 = k1.time + k1.outTangent.x;
    const x2 = k2.time + k2.inTangent.x;
    const x3 = k2.time;

    // Control points (value axis)
    const y0 = k1.value;
    const y1 = k1.value + k1.outTangent.y;
    const y2 = k2.value + k2.inTangent.y;
    const y3 = k2.value;

    // Find parameter t where cubic-x(t) = time using Newton-Raphson
    const t = this._solveCubicForT(x0, x1, x2, x3, time);

    // Evaluate cubic-y at that t
    return FCurve._cubicBezier(t, y0, y1, y2, y3);
  }

  /**
   * Hermite spline interpolation.
   *
   * Uses the Catmull-Rom style auto-tangent from the in/out tangent slopes.
   */
  private _evaluateHermite(k1: Keyframe, k2: Keyframe, time: number): number {
    const dt = k2.time - k1.time;
    if (dt === 0) return k1.value;
    const t = (time - k1.time) / dt;

    // Derive tangent magnitudes from the tangent handles
    const m0 = k1.outTangent.y / (k1.outTangent.x || 1) * dt;
    const m1 = k2.inTangent.y  / (k2.inTangent.x  || 1) * dt;

    // Hermite basis functions
    const t2 = t * t;
    const t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;

    return h00 * k1.value + h10 * m0 + h01 * k2.value + h11 * m1;
  }

  // ---- Infinity handling --------------------------------------------------

  private _evaluatePreInfinity(
    time: number,
    firstKey: Keyframe,
    lastKey: Keyframe,
  ): number {
    switch (this.preInfinity) {
      case InfinityMode.Linear: {
        if (this.keys.length < 2) return firstKey.value;
        const k2 = this.keys[1];
        const slope = (k2.value - firstKey.value) / (k2.time - firstKey.time || 1);
        return firstKey.value + slope * (time - firstKey.time);
      }
      case InfinityMode.Cycle: {
        const range = lastKey.time - firstKey.time;
        if (range <= 0) return firstKey.value;
        const cycled = firstKey.time + ((time - firstKey.time) % range + range) % range;
        return this.evaluate(cycled);
      }
      case InfinityMode.Constant:
      default:
        return firstKey.value;
    }
  }

  private _evaluatePostInfinity(
    time: number,
    firstKey: Keyframe,
    lastKey: Keyframe,
  ): number {
    switch (this.postInfinity) {
      case InfinityMode.Linear: {
        if (this.keys.length < 2) return lastKey.value;
        const k1 = this.keys[this.keys.length - 2];
        const slope = (lastKey.value - k1.value) / (lastKey.time - k1.time || 1);
        return lastKey.value + slope * (time - lastKey.time);
      }
      case InfinityMode.Cycle: {
        const range = lastKey.time - firstKey.time;
        if (range <= 0) return lastKey.value;
        const cycled = firstKey.time + ((time - firstKey.time) % range);
        return this.evaluate(cycled);
      }
      case InfinityMode.Constant:
      default:
        return lastKey.value;
    }
  }

  // ---- Bézier utilities ---------------------------------------------------

  /** Evaluate a 1D cubic Bézier at parameter t. */
  private static _cubicBezier(t: number, p0: number, p1: number, p2: number, p3: number): number {
    const mt = 1 - t;
    return mt * mt * mt * p0
      + 3 * mt * mt * t * p1
      + 3 * mt * t * t * p2
      + t * t * t * p3;
  }

  /** Derivative of 1D cubic Bézier. */
  private static _cubicBezierDerivative(t: number, p0: number, p1: number, p2: number, p3: number): number {
    const mt = 1 - t;
    return 3 * mt * mt * (p1 - p0)
      + 6 * mt * t * (p2 - p1)
      + 3 * t * t * (p3 - p2);
  }

  /**
   * Solve for the parametric t ∈ [0,1] where the x-component of the
   * Bézier equals `targetX`.  Uses Newton-Raphson with bisection fallback.
   */
  private _solveCubicForT(
    x0: number, x1: number, x2: number, x3: number,
    targetX: number,
    iterations = 12,
    tolerance = 1e-6,
  ): number {
    // Initial guess: linear approximation
    const range = x3 - x0;
    let t = range !== 0 ? (targetX - x0) / range : 0;
    t = Math.max(0, Math.min(1, t));

    for (let i = 0; i < iterations; i++) {
      const currentX = FCurve._cubicBezier(t, x0, x1, x2, x3);
      const error = currentX - targetX;

      if (Math.abs(error) < tolerance) return t;

      const derivative = FCurve._cubicBezierDerivative(t, x0, x1, x2, x3);

      if (Math.abs(derivative) < 1e-10) {
        // Derivative too small — bisection step
        if (error > 0) t -= 0.05;
        else t += 0.05;
        t = Math.max(0, Math.min(1, t));
      } else {
        t -= error / derivative;
        t = Math.max(0, Math.min(1, t));
      }
    }

    return t;
  }
}
