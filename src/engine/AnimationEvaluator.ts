// ============================================================
// AnimationEvaluator.ts — Render-loop integration.
//
//   Hooks into Babylon's scene.onBeforeRenderObservable to
//   evaluate all animation clips and push F-Curve values to
//   CustomTransformNodes BEFORE Babylon renders the frame.
//
//   Evaluation order per frame:
//     1. Advance currentTime
//     2. Evaluate all clips (push F-Curve values → node channels)
//     3. Babylon calls computeWorldMatrix() on each dirty node
//     4. Babylon renders
// ============================================================

import type { Scene } from '@babylonjs/core/scene';
import type { Observer } from '@babylonjs/core/Misc/observable';
import { AnimationClip } from './ChannelBinding';

// ---------------------------------------------------------------------------
// AnimationEvaluator
// ---------------------------------------------------------------------------

export class AnimationEvaluator {
  private _scene: Scene;
  private _clips: AnimationClip[] = [];
  private _observer: Observer<Scene> | null = null;

  // ---- Playback state ----
  private _currentTime: number = 0;
  private _isPlaying: boolean = false;
  private _playbackSpeed: number = 1.0;
  private _fps: number = 24;

  // ---- Loop / range ----
  private _loopStart: number = 0;
  private _loopEnd: number = 100;
  private _loopEnabled: boolean = true;

  constructor(scene: Scene, fps: number = 24) {
    this._scene = scene;
    this._fps = fps;

    // Register on the pre-render observable
    this._observer = this._scene.onBeforeRenderObservable.add(() => {
      this._onBeforeRender();
    });
  }

  // ---- Clip management ----------------------------------------------------

  addClip(clip: AnimationClip): void {
    if (!this._clips.includes(clip)) {
      this._clips.push(clip);
    }
  }

  removeClip(name: string): void {
    this._clips = this._clips.filter(c => c.name !== name);
  }

  getClip(name: string): AnimationClip | undefined {
    return this._clips.find(c => c.name === name);
  }

  get clips(): ReadonlyArray<AnimationClip> {
    return this._clips;
  }

  // ---- Playback controls --------------------------------------------------

  play(): void {
    this._isPlaying = true;
  }

  pause(): void {
    this._isPlaying = false;
  }

  stop(): void {
    this._isPlaying = false;
    this._currentTime = this._loopStart;
    this._evaluateAllClips();
  }

  /** Jump to a specific frame (also used for scrubbing). */
  setTime(frame: number): void {
    this._currentTime = frame;
    this._evaluateAllClips();
  }

  get currentTime(): number {
    return this._currentTime;
  }

  get isPlaying(): boolean {
    return this._isPlaying;
  }

  set playbackSpeed(speed: number) {
    this._playbackSpeed = speed;
  }

  get playbackSpeed(): number {
    return this._playbackSpeed;
  }

  set fps(value: number) {
    this._fps = Math.max(1, value);
  }

  get fps(): number {
    return this._fps;
  }

  // ---- Loop range ---------------------------------------------------------

  setLoopRange(start: number, end: number): void {
    this._loopStart = start;
    this._loopEnd = end;
  }

  set loopEnabled(value: boolean) {
    this._loopEnabled = value;
  }

  get loopEnabled(): boolean {
    return this._loopEnabled;
  }

  // ---- Core render-loop callback ------------------------------------------

  private _onBeforeRender(): void {
    if (!this._isPlaying) return;

    // Advance time based on engine delta
    const deltaMs = this._scene.getEngine().getDeltaTime();
    const deltaFrames = (deltaMs / 1000) * this._fps * this._playbackSpeed;
    this._currentTime += deltaFrames;

    // Handle looping
    if (this._loopEnabled) {
      const range = this._loopEnd - this._loopStart;
      if (range > 0 && this._currentTime > this._loopEnd) {
        this._currentTime = this._loopStart + ((this._currentTime - this._loopStart) % range);
      }
    } else {
      // Clamp and stop at end
      if (this._currentTime >= this._loopEnd) {
        this._currentTime = this._loopEnd;
        this._isPlaying = false;
      }
    }

    this._evaluateAllClips();
  }

  /** Evaluate all registered clips at the current time. */
  private _evaluateAllClips(): void {
    for (const clip of this._clips) {
      const clippedTime = clip.clampTime(this._currentTime);
      clip.evaluate(clippedTime);
    }
  }

  // ---- Cleanup ------------------------------------------------------------

  /** Remove the render-loop observer and release references. */
  dispose(): void {
    if (this._observer) {
      this._scene.onBeforeRenderObservable.remove(this._observer);
      this._observer = null;
    }
    this._clips = [];
  }
}
