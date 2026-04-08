// ============================================================
// ui/ChannelBox.tsx — Maya-style Channel Box / Attribute Editor
//
//   Displays the selected object's name, transform channels
//   (Translate XYZ, Rotate XYZ, Scale XYZ), rotation order,
//   and visibility. Each channel value is editable via
//   click-to-type or drag-to-scrub.
// ============================================================

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { T } from './theme';
import type { CustomTransformNode } from '../CustomTransformNode';
import { RotationOrder } from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChannelBoxProps {
  /** The currently selected node (null = nothing selected) */
  selectedNode: CustomTransformNode | null;
  /** Display name */
  selectedName: string | null;
  /** Called when a channel value is changed by the user */
  onChannelChange: (node: CustomTransformNode, channel: string, value: number) => void;
  /** Width of the panel */
  width?: number;
  /** Current frame (for display) */
  currentFrame?: number;
  /** Check if the current channel is keyed on the current frame */
  checkIsKeyed?: (channel: string) => boolean;
  /** Handler to set a key on the given channel (or all if undefined) */
  onSetKey?: (channel?: string) => void;
}

// ---------------------------------------------------------------------------
// Channel row component — editable value with drag-to-scrub
// ---------------------------------------------------------------------------

interface ChannelDef {
  label: string;
  channel: string;
  color: string;
  precision: number;
}

function ChannelRow({
  def,
  value,
  onChange,
  isKeyed,
}: {
  def: ChannelDef;
  value: number;
  onChange: (v: number) => void;
  isKeyed?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const dragStartRef = useRef<{ x: number; startValue: number } | null>(null);

  // Start editing
  const handleDoubleClick = useCallback(() => {
    setEditValue(value.toFixed(def.precision));
    setEditing(true);
  }, [value, def.precision]);

  // Submit edit
  const handleSubmit = useCallback(() => {
    const parsed = parseFloat(editValue);
    if (!isNaN(parsed)) {
      onChange(parsed);
    }
    setEditing(false);
  }, [editValue, onChange]);

  // Drag-to-scrub
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (editing) return;
    e.preventDefault();
    dragStartRef.current = { x: e.clientX, startValue: value };

    const handleMouseMove = (me: MouseEvent) => {
      if (!dragStartRef.current) return;
      const dx = me.clientX - dragStartRef.current.x;
      const sensitivity = me.shiftKey ? 0.001 : me.ctrlKey ? 0.1 : 0.01;
      const newValue = dragStartRef.current.startValue + dx * sensitivity;
      onChange(parseFloat(newValue.toFixed(def.precision)));
    };

    const handleMouseUp = () => {
      dragStartRef.current = null;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [editing, value, onChange, def.precision]);

  // Focus input on edit
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  // Convert radians to degrees for rotation display
  const isRotation = def.channel.startsWith('rotate');
  const displayValue = isRotation ? (value * 180 / Math.PI) : value;
  const displayStr = displayValue.toFixed(def.precision);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        height: 22,
        borderBottom: `1px solid ${T.borderDim}`,
      }}
    >
      {/* Keyed indicator */}
      <div style={{
        width: 14,
        textAlign: 'center',
        fontSize: 8,
        color: isKeyed ? T.keyBezier : 'transparent',
        flexShrink: 0,
      }}>
        ◆
      </div>

      {/* Channel label */}
      <div style={{
        width: 80,
        fontSize: 11,
        color: T.textDim,
        paddingLeft: 4,
        flexShrink: 0,
        userSelect: 'none',
      }}>
        <span style={{ color: def.color, fontWeight: 500 }}>
          {def.label.slice(-1)}
        </span>
        <span style={{ marginLeft: 4 }}>
          {def.label.slice(0, -2)}
        </span>
      </div>

      {/* Value */}
      <div
        style={{
          flex: 1,
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          background: editing ? T.bgInput : 'transparent',
          cursor: editing ? 'text' : 'ew-resize',
          paddingRight: 8,
        }}
        onDoubleClick={handleDoubleClick}
        onMouseDown={!editing ? handleMouseDown : undefined}
      >
        {editing ? (
          <input
            ref={inputRef}
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onBlur={handleSubmit}
            onKeyDown={e => {
              if (e.key === 'Enter') handleSubmit();
              if (e.key === 'Escape') setEditing(false);
            }}
            style={{
              width: '100%',
              background: 'transparent',
              border: 'none',
              color: T.accent,
              fontSize: 11,
              fontFamily: T.fontMono,
              outline: 'none',
              padding: 0,
              textAlign: 'right',
            }}
          />
        ) : (
          <span style={{
            width: '100%',
            fontSize: 11,
            fontFamily: T.fontMono,
            color: T.text,
            textAlign: 'right',
            userSelect: 'none',
          }}>
            {displayStr}
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Channel group definitions
// ---------------------------------------------------------------------------

const TRANSLATE_CHANNELS: ChannelDef[] = [
  { label: 'Translate X', channel: 'translateX', color: T.channelX, precision: 3 },
  { label: 'Translate Y', channel: 'translateY', color: T.channelY, precision: 3 },
  { label: 'Translate Z', channel: 'translateZ', color: T.channelZ, precision: 3 },
];

const ROTATE_CHANNELS: ChannelDef[] = [
  { label: 'Rotate X', channel: 'rotateX', color: T.channelX, precision: 3 },
  { label: 'Rotate Y', channel: 'rotateY', color: T.channelY, precision: 3 },
  { label: 'Rotate Z', channel: 'rotateZ', color: T.channelZ, precision: 3 },
];

const SCALE_CHANNELS: ChannelDef[] = [
  { label: 'Scale X', channel: 'scaleX', color: T.channelX, precision: 3 },
  { label: 'Scale Y', channel: 'scaleY', color: T.channelY, precision: 3 },
  { label: 'Scale Z', channel: 'scaleZ', color: T.channelZ, precision: 3 },
];

// ---------------------------------------------------------------------------
// Section header
// ---------------------------------------------------------------------------

function SectionHeader({ title }: { title: string }) {
  return (
    <div style={{
      padding: '6px 8px 4px',
      fontSize: 10,
      fontWeight: 600,
      color: T.textMuted,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      borderBottom: `1px solid ${T.borderDim}`,
      background: 'rgba(255,255,255,0.02)',
    }}>
      {title}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ChannelBox Panel
// ---------------------------------------------------------------------------

export default function ChannelBox({
  selectedNode,
  selectedName,
  onChannelChange,
  width = 260,
  currentFrame = 0,
  checkIsKeyed,
  onSetKey,
}: ChannelBoxProps) {
  if (!selectedNode) {
    return (
      <div style={{
        width,
        background: T.bg,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: T.font,
        flexShrink: 0,
      }}>
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: T.textMuted,
          fontSize: 11,
          padding: 20,
          textAlign: 'center',
        }}>
          No object selected
          <br />
          <span style={{ fontSize: 10, marginTop: 4, display: 'block' }}>
            Click an object in the Outliner to view its channels
          </span>
        </div>
      </div>
    );
  }

  const handleChange = (channel: string) => (value: number) => {
    // For rotation, convert degrees input back to radians
    if (channel.startsWith('rotate')) {
      value = value * Math.PI / 180;
    }
    onChannelChange(selectedNode, channel, value);
  };

  return (
    <div style={{
      width,
      background: T.bg,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      fontFamily: T.font,
      flexShrink: 0,
    }}>

      {/* Object name */}
      <div style={{
        padding: '8px 12px',
        borderBottom: `1px solid ${T.border}`,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <span style={{ fontSize: 12, color: T.nodeTransform }}>⊕</span>
        <span style={{
          fontSize: 12,
          fontWeight: 600,
          color: T.accent,
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {selectedName}
        </span>
        <span style={{
          fontSize: 9,
          color: T.textMuted,
          fontFamily: T.fontMono,
        }}>
          F{currentFrame.toFixed(0)}
        </span>
      </div>

      {/* Scrollable channels */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* Translate */}
        <SectionHeader title="Translate" />
        {TRANSLATE_CHANNELS.map(def => (
          <ChannelRow
            key={def.channel}
            def={def}
            value={selectedNode.getChannel(def.channel)}
            onChange={handleChange(def.channel)}
            isKeyed={checkIsKeyed?.(def.channel)}
          />
        ))}

        {/* Rotate */}
        <SectionHeader title="Rotate" />
        {ROTATE_CHANNELS.map(def => (
          <ChannelRow
            key={def.channel}
            def={def}
            value={selectedNode.getChannel(def.channel)}
            onChange={handleChange(def.channel)}
            isKeyed={checkIsKeyed?.(def.channel)}
          />
        ))}

        {/* Scale */}
        <SectionHeader title="Scale" />
        {SCALE_CHANNELS.map(def => (
          <ChannelRow
            key={def.channel}
            def={def}
            value={selectedNode.getChannel(def.channel)}
            onChange={handleChange(def.channel)}
            isKeyed={checkIsKeyed?.(def.channel)}
          />
        ))}

        {/* Rotation Order */}
        <SectionHeader title="Attributes" />
        <div style={{
          display: 'flex',
          alignItems: 'center',
          height: 24,
          paddingLeft: 18,
          borderBottom: `1px solid ${T.borderDim}`,
        }}>
          <span style={{ fontSize: 11, color: T.textDim, width: 80 }}>Rot Order</span>
          <select
            value={selectedNode.rotationOrder}
            onChange={e => {
              selectedNode.rotationOrder = e.target.value as RotationOrder;
              selectedNode.markCustomDirty();
            }}
            style={{
              flex: 1,
              background: T.bgInput,
              border: `1px solid ${T.borderDim}`,
              borderRadius: 3,
              color: T.text,
              fontSize: 11,
              padding: '2px 4px',
              outline: 'none',
              fontFamily: T.fontMono,
              cursor: 'pointer',
              marginRight: 8,
            }}
          >
            {Object.values(RotationOrder).map(order => (
              <option key={order} value={order}>{order}</option>
            ))}
          </select>
        </div>

        {/* Visibility */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          height: 24,
          paddingLeft: 18,
          borderBottom: `1px solid ${T.borderDim}`,
        }}>
          <span style={{ fontSize: 11, color: T.textDim, width: 80 }}>Visibility</span>
          <span style={{
            flex: 1,
            fontSize: 11,
            fontFamily: T.fontMono,
            color: T.success,
            textAlign: 'right',
            paddingRight: 8,
          }}>
            on
          </span>
        </div>

        {/* Actions */}
        <div style={{ padding: '8px 12px' }}>
          <button
            onClick={() => onSetKey?.()}
            style={{
              width: '100%',
              padding: '6px',
              background: T.bgSurface,
              border: `1px solid ${T.borderDim}`,
              borderRadius: 4,
              color: T.accent,
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.1s ease',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = T.bgHover)}
            onMouseLeave={e => (e.currentTarget.style.background = T.bgSurface)}
            onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.98)')}
            onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
          >
            Set Key (S)
          </button>
        </div>
      </div>

      {/* Footer — hint */}
      <div style={{
        padding: '4px 8px',
        borderTop: `1px solid ${T.borderDim}`,
        fontSize: 9,
        color: T.textMuted,
        textAlign: 'center',
      }}>
        Double-click to type · Drag to scrub · Shift = fine
      </div>
    </div>
  );
}
