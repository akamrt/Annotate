// ============================================================
// GimbalModeToggle.tsx — Maya-style Transform Mode Toggle
//   with Local / World / Gimbal rotation mode switching
// ============================================================

import React, { useState, useCallback } from 'react';
import { T } from './theme';

export type TransformMode = 'move' | 'rotate' | 'scale';
export type RotateMode = 'local' | 'world' | 'gimbal';

interface TransformModeToggleProps {
  currentMode: TransformMode;
  onModeChange: (mode: TransformMode) => void;
  /** Current rotation mode (local/world/gimbal) */
  rotateMode: RotateMode;
  /** Called when rotation mode changes */
  onRotateModeChange: (mode: RotateMode) => void;
}

// Maya-style icons using CSS shapes
const MoveIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M7 1L7 13M7 1L4 4M7 1L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M1 7L13 7M1 7L4 4M1 7L4 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

const RotateIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M7 2.5V7L9 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M11 3L12 1.5L13.5 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const ScaleIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <rect x="3" y="3" width="8" height="8" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M6 3V1M8 3V1M6 13V11M8 13V11M3 6H1M3 8H1M13 6H11M13 8H11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

// Small triangle for gimbal indicator
const GimbalIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2"/>
    <circle cx="7" cy="7" r="3" stroke="currentColor" strokeWidth="1"/>
    <circle cx="7" cy="7" r="1" fill="currentColor"/>
  </svg>
);

const LocalIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
    <path d="M6 1L11 6L6 11L1 6L6 1Z" stroke="currentColor" strokeWidth="1.2"/>
    <circle cx="6" cy="6" r="1.5" fill="currentColor"/>
  </svg>
);

const WorldIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
    <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.2"/>
    <ellipse cx="6" cy="6" rx="2" ry="4.5" stroke="currentColor" strokeWidth="1"/>
    <path d="M1.5 6H10.5" stroke="currentColor" strokeWidth="1"/>
  </svg>
);

export function TransformModeToggle({
  currentMode,
  onModeChange,
  rotateMode,
  onRotateModeChange,
}: TransformModeToggleProps) {
  const modes: { mode: TransformMode; icon: React.ReactNode; label: string }[] = [
    { mode: 'move', icon: <MoveIcon />, label: 'Move (W)' },
    { mode: 'rotate', icon: <RotateIcon />, label: 'Rotate (E)' },
    { mode: 'scale', icon: <ScaleIcon />, label: 'Scale (R)' },
  ];

  const rotateModes: { mode: RotateMode; icon: React.ReactNode; label: string }[] = [
    { mode: 'local', icon: <LocalIcon />, label: 'Local' },
    { mode: 'world', icon: <WorldIcon />, label: 'World' },
    { mode: 'gimbal', icon: <GimbalIcon />, label: 'Gimbal' },
  ];

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 2,
      padding: '4px 6px',
      background: T.bg,
      borderBottom: `1px solid ${T.borderDim}`,
    }}>
      {/* Transform Mode Buttons */}
      <div style={{
        display: 'flex',
        gap: 2,
        marginRight: 8,
      }}>
        {modes.map(({ mode, icon, label }) => (
          <button
            key={mode}
            onClick={() => onModeChange(mode)}
            title={label}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 28,
              height: 28,
              background: currentMode === mode ? T.accentDim : 'transparent',
              border: `1px solid ${currentMode === mode ? T.accent : T.borderDim}`,
              borderRadius: 4,
              color: currentMode === mode ? T.text : T.textDim,
              cursor: 'pointer',
              transition: 'all 0.1s ease',
            }}
          >
            {icon}
          </button>
        ))}
      </div>

      {/* Rotation Mode Toggle (only visible when in rotate mode) */}
      {currentMode === 'rotate' && (
        <>
          <div style={{
            width: 1,
            height: 20,
            background: T.borderDim,
            margin: '0 4px',
          }} />
          
          {/* Rotate Mode Label */}
          <span style={{
            fontSize: 10,
            color: T.textMuted,
            marginRight: 4,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}>
            Rotate:
          </span>

          {/* Rotate Mode Buttons */}
          <div style={{
            display: 'flex',
            gap: 2,
          }}>
            {rotateModes.map(({ mode, icon, label }) => (
              <button
                key={mode}
                onClick={() => onRotateModeChange(mode)}
                title={label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 3,
                  height: 24,
                  padding: '0 6px',
                  background: rotateMode === mode ? T.accentDim : 'transparent',
                  border: `1px solid ${rotateMode === mode ? T.accent : T.borderDim}`,
                  borderRadius: 3,
                  color: rotateMode === mode ? T.text : T.textDim,
                  cursor: 'pointer',
                  fontSize: 10,
                  fontFamily: T.fontMono,
                  transition: 'all 0.1s ease',
                }}
              >
                {icon}
                {mode === 'gimbal' && (
                  <span style={{
                    fontSize: 9,
                    color: rotateMode === mode ? T.accent : T.textMuted,
                    marginLeft: 2,
                  }}>
                    G
                  </span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
