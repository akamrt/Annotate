// ============================================================
// ChannelBinding.ts — Connects F-Curves to specific float
//   properties on a CustomTransformNode.
//
//   An AnimationClip groups multiple bindings and evaluates
//   them at a given time, pushing values to their target nodes.
// ============================================================

import type { ChannelPath } from './types';
import type { CustomTransformNode } from './CustomTransformNode';
import type { FCurve } from './FCurve';

// ---------------------------------------------------------------------------
// ChannelBinding — one F-Curve driving one property on one node
// ---------------------------------------------------------------------------

export interface ChannelBinding {
  /** The node whose property is being driven. */
  targetNode: CustomTransformNode;
  /** Which property this curve drives (e.g. 'rotateX'). */
  channelPath: ChannelPath;
  /** The F-Curve providing values over time. */
  curve: FCurve;
  /** When false, this binding is muted (not evaluated). */
  enabled: boolean;
}

/** Create a ChannelBinding with sensible defaults. */
export function createBinding(
  targetNode: CustomTransformNode,
  channelPath: ChannelPath,
  curve: FCurve,
): ChannelBinding {
  return {
    targetNode,
    channelPath,
    curve,
    enabled: true,
  };
}

// ---------------------------------------------------------------------------
// AnimationClip — a named collection of channel bindings
// ---------------------------------------------------------------------------

export class AnimationClip {
  /** Human-readable clip name. */
  public name: string;

  /** All channel bindings in this clip. */
  public bindings: ChannelBinding[] = [];

  /** Frame range [start, end] for this clip. */
  public frameRange: [number, number] = [0, 100];

  /** Playback speed multiplier (1.0 = normal). */
  public speed: number = 1.0;

  /** Global weight for the entire clip (0 = off, 1 = full). */
  public weight: number = 1.0;

  /** Whether this clip is active. */
  public enabled: boolean = true;

  constructor(name: string) {
    this.name = name;
  }

  // ---- Binding management -------------------------------------------------

  /** Add a channel binding to this clip. */
  addBinding(binding: ChannelBinding): void {
    this.bindings.push(binding);
  }

  /** Remove all bindings targeting a specific node. */
  removeBindingsForNode(node: CustomTransformNode): void {
    this.bindings = this.bindings.filter(b => b.targetNode !== node);
  }

  /** Find a binding by node + channel path. */
  findBinding(node: CustomTransformNode, path: ChannelPath): ChannelBinding | undefined {
    return this.bindings.find(b => b.targetNode === node && b.channelPath === path);
  }

  // ---- Evaluation ---------------------------------------------------------

  /**
   * Evaluate all bindings at the given time.
   *
   * For each enabled binding:
   *   1. Evaluate the F-Curve at `time` → float value
   *   2. Blend with clip weight
   *   3. Push the value to the target node's channel
   *
   * This does NOT trigger computeWorldMatrix() — that happens later
   * in the render pipeline after all clips have been evaluated.
   */
  evaluate(time: number): void {
    if (!this.enabled) return;

    // Track which nodes were modified so we can mark them dirty
    const dirtyNodes = new Set<CustomTransformNode>();

    for (const binding of this.bindings) {
      if (!binding.enabled) continue;

      const rawValue = binding.curve.evaluate(time);

      // Apply clip weight (blend toward the node's current value)
      if (this.weight < 1.0) {
        const currentValue = binding.targetNode.getChannel(binding.channelPath);
        const blended = currentValue + (rawValue - currentValue) * this.weight;
        binding.targetNode.setChannel(binding.channelPath, blended);
      } else {
        binding.targetNode.setChannel(binding.channelPath, rawValue);
      }

      dirtyNodes.add(binding.targetNode);
    }

    // Mark all affected nodes dirty (setChannel already does this,
    // but this is a safety net for external modifications)
    for (const node of dirtyNodes) {
      node.currentTime = time;
    }
  }

  // ---- Utilities ----------------------------------------------------------

  /** Get the duration in frames. */
  get duration(): number {
    return this.frameRange[1] - this.frameRange[0];
  }

  /** Clamp a time value to the clip's frame range. */
  clampTime(time: number): number {
    return Math.max(this.frameRange[0], Math.min(this.frameRange[1], time));
  }
}
