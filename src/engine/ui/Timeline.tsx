// ============================================================
// ui/Timeline.tsx — Frame-based animation timeline with
//   playback controls, scrub bar, keyframe markers, and
//   frame number ruler.
//
//   Integrates with AnimationEvaluator for real-time playback.
// ============================================================

import React, { useRef, useCallback, useEffect, useState, useMemo } from 'react';
import { T } from './theme';
import type { AnimationEvaluator } from '../AnimationEvaluator';
import type { AnimationClip } from '../ChannelBinding';
import type { CustomTransformNode } from '../CustomTransformNode';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TimelineProps {
  /** The animation evaluator driving playback */
  evaluator: AnimationEvaluator | null;
  /** Currently selected node (for showing its keyframes) */
  selectedNode: CustomTransformNode | null;
  /** Whether animation is playing */
  isPlaying: boolean;
  /** Current frame number */
  currentFrame: number;
  /** Callback for play/pause toggle */
  onPlayPause: () => void;
  /** Callback for stop */
  onStop: () => void;
  /** Callback when user scrubs to a frame */
  onScrub: (frame: number) => void;
  /** Callback to go to previous keyframe */
  onPrevKey?: () => void;
  /** Callback to go to next keyframe */
  onNextKey?: () => void;
  /** Callback to go to start */
  onGoToStart?: () => void;
  /** Callback to go to end */
  onGoToEnd?: () => void;
  /** Timeline height */
  height?: number;
  /** Force update tick */
  tick?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RULER_HEIGHT = 22;
const TRACK_HEIGHT = 20;
const MIN_FRAME_SPACING = 8; // minimum pixels per frame

// ---------------------------------------------------------------------------
// Timeline Component
// ---------------------------------------------------------------------------

export default function Timeline({
  evaluator,
  selectedNode,
  isPlaying,
  currentFrame,
  onPlayPause,
  onStop,
  onScrub,
  onPrevKey,
  onNextKey,
  onGoToStart,
  onGoToEnd,
  height = 120,
  tick = 0,
}: TimelineProps) {
  const rulerRef = useRef<HTMLDivElement>(null);
  const [rulerWidth, setRulerWidth] = useState(800);
  const [isDragging, setIsDragging] = useState(false);
  const [loopRange, setLoopRange] = useState<[number, number]>([0, 120]);
  const [fps, setFps] = useState(24);
  const [autoKeyEnabled, setAutoKeyEnabled] = useState(false);

  // Update from evaluator
  useEffect(() => {
    if (!evaluator) return;
    setFps(evaluator.fps);
    setAutoKeyEnabled(evaluator.autoKeyEnabled);
  }, [evaluator]);

  const toggleAutoKey = useCallback(() => {
    if (!evaluator) return;
    evaluator.autoKeyEnabled = !evaluator.autoKeyEnabled;
    setAutoKeyEnabled(evaluator.autoKeyEnabled);
  }, [evaluator]);

  // Observe ruler width
  useEffect(() => {
    if (!rulerRef.current) return;
    const obs = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width;
      if (w) setRulerWidth(w);
    });
    obs.observe(rulerRef.current);
    return () => obs.disconnect();
  }, []);

  // Compute zoom level
  const frameRange = loopRange[1] - loopRange[0];
  const pixelsPerFrame = Math.max(MIN_FRAME_SPACING, rulerWidth / (frameRange || 1));
  const totalWidth = frameRange * pixelsPerFrame;

  // Frame → pixel
  const frameToPx = useCallback((frame: number) => {
    return (frame - loopRange[0]) * pixelsPerFrame;
  }, [loopRange, pixelsPerFrame]);

  // Pixel → frame
  const pxToFrame = useCallback((px: number) => {
    return loopRange[0] + px / pixelsPerFrame;
  }, [loopRange, pixelsPerFrame]);

  // Scrub via click/drag on ruler
  const handleRulerMouse = useCallback((e: React.MouseEvent) => {
    const rect = rulerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const frame = Math.round(pxToFrame(x));
    onScrub(Math.max(loopRange[0], Math.min(loopRange[1], frame)));
  }, [pxToFrame, onScrub, loopRange]);

  const handleRulerMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true);
    handleRulerMouse(e);

    const handleMove = (me: MouseEvent) => {
      const rect = rulerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = me.clientX - rect.left;
      const frame = Math.round(pxToFrame(x));
      onScrub(Math.max(loopRange[0], Math.min(loopRange[1], frame)));
    };

    const handleUp = () => {
      setIsDragging(false);
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
  }, [handleRulerMouse, pxToFrame, onScrub, loopRange]);

  // Gather keyframe positions for the selected node
  const keyframePositions = useMemo(() => {
    if (!evaluator || !selectedNode) return [];
    const positions = new Set<number>();
    for (const clip of evaluator.clips) {
      for (const binding of clip.bindings) {
        if (binding.targetNode === selectedNode && binding.enabled) {
          for (const key of binding.curve.keys) {
            positions.add(Math.round(key.time));
          }
        }
      }
    }
    return Array.from(positions).sort((a, b) => a - b);
  }, [evaluator, selectedNode, tick]);

  // Compute ruler tick marks
  const ticks = useMemo(() => {
    const result: { frame: number; major: boolean }[] = [];
    // Determine tick spacing based on zoom
    let tickSpacing = 1;
    const spacings = [1, 5, 10, 15, 30, 50, 100];
    for (const s of spacings) {
      if (s * pixelsPerFrame >= 50) {
        tickSpacing = s;
        break;
      }
    }
    for (let f = loopRange[0]; f <= loopRange[1]; f++) {
      if (f % tickSpacing === 0) {
        result.push({ frame: f, major: true });
      } else if (f % (tickSpacing / 5) === 0 && pixelsPerFrame >= 4) {
        result.push({ frame: f, major: false });
      }
    }
    return result;
  }, [loopRange, pixelsPerFrame]);

  // Playhead position
  const playheadX = frameToPx(currentFrame);

  // Format timecode
  const formatTimecode = (frame: number) => {
    const totalSeconds = frame / fps;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const frames = Math.round(frame % fps);
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;
  };

  return (
    <div style={{
      height,
      background: T.bg,
      borderTop: `1px solid ${T.border}`,
      display: 'flex',
      flexDirection: 'column',
      fontFamily: T.font,
      flexShrink: 0,
      userSelect: 'none',
    }}>
      {/* ---- Top bar: controls + info ---- */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '4px 8px',
        borderBottom: `1px solid ${T.borderDim}`,
        background: T.bgSurface,
        flexShrink: 0,
      }}>
        {/* Transport controls */}
        <TButton
          icon="⏮"
          title="Go to Start"
          onClick={onGoToStart || (() => onScrub(loopRange[0]))}
        />
        <TButton
          icon="⏪"
          title="Previous Keyframe"
          onClick={onPrevKey || (() => {
            const prev = keyframePositions.filter(k => k < currentFrame).pop();
            if (prev !== undefined) onScrub(prev);
          })}
        />
        <TButton
          icon={isPlaying ? '⏸' : '▶'}
          title={isPlaying ? 'Pause' : 'Play'}
          accent
          onClick={onPlayPause}
        />
        <TButton icon="⏹" title="Stop" onClick={onStop} />
        <TButton
          icon="⏩"
          title="Next Keyframe"
          onClick={onNextKey || (() => {
            const next = keyframePositions.find(k => k > currentFrame);
            if (next !== undefined) onScrub(next);
          })}
        />
        <TButton
          icon="⏭"
          title="Go to End"
          onClick={onGoToEnd || (() => onScrub(loopRange[1]))}
        />

        {/* Separator */}
        <div style={{
          width: 1,
          height: 16,
          background: T.borderDim,
          margin: '0 4px',
        }} />

        <TButton
          icon="Auto 🗝"
          title="Auto Keyframe Mode (keys changed attributes if they already have an animation curve)"
          accent={autoKeyEnabled}
          onClick={toggleAutoKey}
          style={{ width: 'auto', padding: '0 6px', color: autoKeyEnabled ? '#ff3366' : T.textDim, borderColor: autoKeyEnabled ? '#ff336644' : T.borderDim, background: autoKeyEnabled ? '#ff336622' : undefined }}
        />

        {/* Separator */}
        <div style={{
          width: 1,
          height: 16,
          background: T.borderDim,
          margin: '0 4px',
        }} />

        {/* Frame display */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginLeft: 4,
        }}>
          <span style={{ fontSize: 10, color: T.textMuted }}>Frame</span>
          <input
            type="number"
            value={Math.round(currentFrame)}
            onChange={e => onScrub(parseInt(e.target.value) || 0)}
            style={{
              width: 50,
              background: T.bgInput,
              border: `1px solid ${T.borderDim}`,
              borderRadius: 3,
              color: T.accent,
              fontSize: 11,
              fontFamily: T.fontMono,
              padding: '2px 4px',
              outline: 'none',
              textAlign: 'center',
            }}
          />
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Timecode */}
        <span style={{
          fontSize: 11,
          fontFamily: T.fontMono,
          color: T.textDim,
          marginRight: 8,
        }}>
          {formatTimecode(currentFrame)}
        </span>

        {/* FPS */}
        <span style={{
          fontSize: 10,
          color: T.textMuted,
          borderLeft: `1px solid ${T.borderDim}`,
          paddingLeft: 8,
        }}>
          {fps} fps
        </span>

        {/* Range display */}
        <span style={{
          fontSize: 10,
          color: T.textMuted,
          marginLeft: 8,
        }}>
          {loopRange[0]} – {loopRange[1]}
        </span>
      </div>

      {/* ---- Ruler + tracks area ---- */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        <div
          ref={rulerRef}
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            cursor: isDragging ? 'grabbing' : 'pointer',
            overflow: 'hidden',
          }}
          onMouseDown={handleRulerMouseDown}
        >
          {/* Frame number ruler */}
          <div style={{
            height: RULER_HEIGHT,
            position: 'relative',
            borderBottom: `1px solid ${T.borderDim}`,
            background: 'rgba(255,255,255,0.02)',
          }}>
            {ticks.map(({ frame, major }) => {
              const x = frameToPx(frame);
              if (x < -10 || x > rulerWidth + 10) return null;
              return (
                <div key={frame} style={{
                  position: 'absolute',
                  left: x,
                  top: 0,
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                }}>
                  {major && (
                    <span style={{
                      fontSize: 9,
                      color: T.textMuted,
                      fontFamily: T.fontMono,
                      transform: 'translateX(-50%)',
                      position: 'absolute',
                      top: 2,
                      whiteSpace: 'nowrap',
                    }}>
                      {frame}
                    </span>
                  )}
                  <div style={{
                    position: 'absolute',
                    bottom: 0,
                    width: 1,
                    height: major ? 8 : 4,
                    background: major ? T.textMuted : T.borderDim,
                    transform: 'translateX(-0.5px)',
                  }} />
                </div>
              );
            })}
          </div>

          {/* Keyframe track */}
          <div style={{
            height: TRACK_HEIGHT,
            position: 'relative',
            borderBottom: `1px solid ${T.borderDim}`,
            background: selectedNode ? 'rgba(0,212,255,0.03)' : 'transparent',
          }}>
            {selectedNode && (
              <div style={{
                position: 'absolute',
                left: 0,
                top: 0,
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                paddingLeft: 4,
              }}>
                {/* Track label */}
                <span style={{
                  position: 'absolute',
                  left: 4,
                  fontSize: 9,
                  color: T.textMuted,
                  zIndex: 2,
                  pointerEvents: 'none',
                }}>
                  Keyframes
                </span>
              </div>
            )}

            {/* Keyframe diamonds */}
            {keyframePositions.map(frame => {
              const x = frameToPx(frame);
              if (x < -10 || x > rulerWidth + 10) return null;
              return (
                <div
                  key={frame}
                  style={{
                    position: 'absolute',
                    left: x,
                    top: '50%',
                    transform: 'translate(-50%, -50%) rotate(45deg)',
                    width: 7,
                    height: 7,
                    background: Math.round(currentFrame) === frame ? T.keySelected : T.keyBezier,
                    borderRadius: 1,
                    boxShadow: Math.round(currentFrame) === frame
                      ? `0 0 6px ${T.accent}`
                      : 'none',
                    zIndex: 1,
                  }}
                  title={`Key at frame ${frame}`}
                />
              );
            })}
          </div>

          {/* Playhead line */}
          <div style={{
            position: 'absolute',
            left: playheadX,
            top: 0,
            bottom: 0,
            width: 1,
            background: T.accent,
            zIndex: 10,
            pointerEvents: 'none',
            transform: 'translateX(-0.5px)',
            boxShadow: `0 0 4px ${T.accent}`,
          }}>
            {/* Playhead triangle */}
            <div style={{
              position: 'absolute',
              top: -1,
              left: '50%',
              transform: 'translateX(-50%)',
              width: 0,
              height: 0,
              borderLeft: '5px solid transparent',
              borderRight: '5px solid transparent',
              borderTop: `7px solid ${T.accent}`,
            }} />
          </div>

          {/* Loop range highlight */}
          <div style={{
            position: 'absolute',
            left: frameToPx(loopRange[0]),
            width: frameToPx(loopRange[1]) - frameToPx(loopRange[0]),
            top: RULER_HEIGHT,
            height: TRACK_HEIGHT,
            background: 'rgba(0,212,255,0.04)',
            borderLeft: `1px solid rgba(0,212,255,0.2)`,
            borderRight: `1px solid rgba(0,212,255,0.2)`,
            pointerEvents: 'none',
          }} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Transport button
// ---------------------------------------------------------------------------

function TButton({
  icon,
  title,
  accent,
  onClick,
  style,
}: {
  icon: string;
  title: string;
  accent?: boolean;
  onClick: () => void;
  style?: React.CSSProperties;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 26,
        height: 22,
        background: accent ? 'rgba(0,212,255,0.12)' : 'rgba(255,255,255,0.04)',
        border: `1px solid ${accent ? T.accentDim : T.borderDim}`,
        borderRadius: 3,
        color: accent ? T.accent : T.textDim,
        fontSize: 12,
        cursor: 'pointer',
        transition: 'all 0.12s ease',
        padding: 0,
        ...style,
      }}
      onMouseEnter={e => {
        if (!style?.background) {
          (e.currentTarget as HTMLElement).style.background = accent
            ? 'rgba(0,212,255,0.25)'
            : 'rgba(255,255,255,0.1)';
        }
      }}
      onMouseLeave={e => {
        if (!style?.background) {
          (e.currentTarget as HTMLElement).style.background = accent
            ? 'rgba(0,212,255,0.12)'
            : 'rgba(255,255,255,0.04)';
        }
      }}
    >
      {icon}
    </button>
  );
}
