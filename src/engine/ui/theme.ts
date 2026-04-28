// ============================================================
// ui/theme.ts — Shared design tokens for all 3D engine panels
// ============================================================

export const T = {
  // Backgrounds
  bg:        '#0d0d0d',
  bgSurface: '#111118',
  bgHover:   '#1a1a24',
  bgActive:  '#0a1e28',
  bgInput:   '#0a0a10',

  // Borders
  border:    '#1a1a2e',
  borderDim: '#14141e',

  // Accents
  accent:     '#00d4ff',
  accentDim:  '#0099bb',
  accentGlow: 'rgba(0,212,255,0.15)',
  success:    '#00ff88',
  warning:    '#ffaa00',
  error:      '#ff4466',

  // Text
  text:      '#e0e0e0',
  textDim:   '#808090',
  textMuted: '#555566',

  // Typography
  font:      `'Segoe UI', 'Inter', system-ui, -apple-system, sans-serif`,
  fontMono:  `'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace`,

  // Channel colors (Maya convention: Red=X, Green=Y, Blue=Z)
  channelX: '#ff4444',
  channelY: '#44cc44',
  channelZ: '#4488ff',

  // Keyframe colors
  keyBezier:  '#ffcc00',
  keyLinear:  '#ff8800',
  keyStep:    '#ff4488',
  keySelected:'#ffffff',

  // Node type icon colors
  nodeTransform: '#00d4ff',
  nodeMesh:      '#ff8844',
  nodeLight:     '#ffdd44',
  nodeCamera:    '#88ff44',
} as const;

/** Shared small button style */
export const miniBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 4,
  background: 'rgba(255,255,255,0.06)',
  border: `1px solid ${T.borderDim}`,
  color: T.text,
  padding: '3px 8px',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 11,
  transition: 'all 0.12s ease',
  whiteSpace: 'nowrap' as const,
};

// We need the React import for CSSProperties — use a type-only import
import type React from 'react';
