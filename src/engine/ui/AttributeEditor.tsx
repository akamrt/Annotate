// ============================================================
// ui/AttributeEditor.tsx — Draggable transform operation order
//
//   Shows the Maya transform operations in their current
//   multiplication order. Users can drag-and-drop operations
//   to reorder them, changing the matrix composition pipeline.
//
//   Turning a "bug" into a feature ™
// ============================================================

import React, { useState, useRef, useCallback } from 'react';
import { T } from './theme';
import type { CustomTransformNode } from '../CustomTransformNode';
import { TransformOp, DEFAULT_OP_ORDER, TRANSFORM_OP_META } from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AttributeEditorProps {
  /** The currently selected node */
  selectedNode: CustomTransformNode | null;
  selectedName: string | null;
  /** Called when the operation order changes */
  onOpOrderChange: (node: CustomTransformNode, newOrder: TransformOp[]) => void;
  width?: number;
}

// ---------------------------------------------------------------------------
// Preset orders
// ---------------------------------------------------------------------------

interface OpPreset {
  name: string;
  description: string;
  order: TransformOp[];
}

const PRESETS: OpPreset[] = [
  {
    name: 'Maya (Default)',
    description: 'Scale → Rotate → Translate — objects rotate in-place',
    order: [...DEFAULT_OP_ORDER],
  },
  {
    name: 'Translate First',
    description: 'Translate → Rotate → Scale — objects orbit around origin',
    order: [
      TransformOp.Translation,
      TransformOp.Offset,
      TransformOp.ScalePivotInv,
      TransformOp.Scale,
      TransformOp.ScalePivot,
      TransformOp.RotatePivotInv,
      TransformOp.Rotation,
      TransformOp.RotateAxis,
      TransformOp.RotatePivot,
    ],
  },
  {
    name: 'Rotate → Translate → Scale',
    description: 'Rotation first, then position, then scale',
    order: [
      TransformOp.Offset,
      TransformOp.RotatePivotInv,
      TransformOp.Rotation,
      TransformOp.RotateAxis,
      TransformOp.RotatePivot,
      TransformOp.Translation,
      TransformOp.ScalePivotInv,
      TransformOp.Scale,
      TransformOp.ScalePivot,
    ],
  },
];

// ---------------------------------------------------------------------------
// Draggable operation item
// ---------------------------------------------------------------------------

function DragItem({
  op,
  index,
  totalCount,
  dragIndex,
  dropIndex,
  onDragStart,
  onDragOver,
  onDragEnd,
}: {
  op: TransformOp;
  index: number;
  totalCount: number;
  dragIndex: number | null;
  dropIndex: number | null;
  onDragStart: (i: number) => void;
  onDragOver: (i: number) => void;
  onDragEnd: () => void;
}) {
  const meta = TRANSFORM_OP_META[op];
  const isDragging = dragIndex === index;
  const isDropTarget = dropIndex === index;

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        onDragStart(index);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        onDragOver(index);
      }}
      onDragEnd={onDragEnd}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 8px',
        marginBottom: 1,
        background: isDragging
          ? 'rgba(0,212,255,0.08)'
          : isDropTarget
            ? 'rgba(0,212,255,0.15)'
            : 'rgba(255,255,255,0.02)',
        border: `1px solid ${isDropTarget ? T.accent : isDragging ? T.accentDim : 'transparent'}`,
        borderRadius: 4,
        cursor: 'grab',
        opacity: isDragging ? 0.5 : 1,
        transition: 'all 0.1s ease',
        userSelect: 'none',
      }}
    >
      {/* Drag handle */}
      <span style={{
        fontSize: 10,
        color: T.textMuted,
        cursor: 'grab',
        letterSpacing: 1,
      }}>
        ⠿
      </span>

      {/* Order number */}
      <span style={{
        fontSize: 9,
        color: T.textMuted,
        fontFamily: T.fontMono,
        width: 16,
        textAlign: 'center',
        flexShrink: 0,
      }}>
        {index + 1}
      </span>

      {/* Color badge */}
      <span style={{
        display: 'inline-block',
        width: 24,
        height: 16,
        borderRadius: 3,
        background: meta.color,
        fontSize: 9,
        fontWeight: 700,
        color: '#000',
        textAlign: 'center',
        lineHeight: '16px',
        fontFamily: T.fontMono,
        flexShrink: 0,
      }}>
        {meta.shortLabel}
      </span>

      {/* Name */}
      <span style={{
        fontSize: 11,
        color: T.text,
        flex: 1,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {meta.label}
      </span>

      {/* Arrow indicator */}
      <span style={{
        fontSize: 8,
        color: T.textMuted,
      }}>
        {index === 0 ? '⬆ first' : index === totalCount - 1 ? '⬇ last' : ''}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AttributeEditor Panel
// ---------------------------------------------------------------------------

export default function AttributeEditor({
  selectedNode,
  selectedName,
  onOpOrderChange,
  width = 260,
}: AttributeEditorProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(true);

  const handleDragStart = useCallback((i: number) => {
    setDragIndex(i);
  }, []);

  const handleDragOver = useCallback((i: number) => {
    setDropIndex(i);
  }, []);

  const handleDragEnd = useCallback(() => {
    if (dragIndex !== null && dropIndex !== null && dragIndex !== dropIndex && selectedNode) {
      const newOrder = [...selectedNode.opOrder];
      const [moved] = newOrder.splice(dragIndex, 1);
      newOrder.splice(dropIndex, 0, moved);
      onOpOrderChange(selectedNode, newOrder);
    }
    setDragIndex(null);
    setDropIndex(null);
  }, [dragIndex, dropIndex, selectedNode, onOpOrderChange]);

  const applyPreset = useCallback((preset: OpPreset) => {
    if (!selectedNode) return;
    onOpOrderChange(selectedNode, [...preset.order]);
  }, [selectedNode, onOpOrderChange]);

  // Simplified 3-item view: Translation, Rotation, Scale
  const getSimplifiedOrder = () => {
    if (!selectedNode) return [];
    const order = selectedNode.opOrder;
    const groups = [
      { id: 'translate', label: 'Translation', color: '#44aaff', ops: [TransformOp.Translation] },
      { id: 'rotate', label: 'Rotation', color: '#44dd44', ops: [TransformOp.Rotation, TransformOp.RotateAxis, TransformOp.RotatePivot, TransformOp.RotatePivotInv] },
      { id: 'scale', label: 'Scale', color: '#ff6644', ops: [TransformOp.Scale, TransformOp.ScalePivot, TransformOp.ScalePivotInv] },
      { id: 'offset', label: 'Offset', color: '#aa88ff', ops: [TransformOp.Offset] },
    ];

    // Find first occurrence of each group
    const positions = groups.map(g => ({
      ...g,
      firstIndex: Math.min(...g.ops.map(op => order.indexOf(op)).filter(i => i >= 0)),
    }));

    return positions.sort((a, b) => a.firstIndex - b.firstIndex);
  };

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
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: T.textMuted, fontSize: 11, padding: 20, textAlign: 'center',
        }}>
          Select an object to edit its transform pipeline
        </div>
      </div>
    );
  }

  const simplifiedOrder = getSimplifiedOrder();

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
        padding: '6px 12px',
        borderBottom: `1px solid ${T.border}`,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span style={{ fontSize: 12, color: T.nodeTransform }}>⊕</span>
        <span style={{
          fontSize: 12, fontWeight: 600, color: T.accent,
          flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {selectedName}
        </span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* Simplified view — group order */}
        <div style={{
          padding: '8px 8px 4px',
          borderBottom: `1px solid ${T.borderDim}`,
        }}>
          <div style={{
            fontSize: 10, fontWeight: 600, color: T.textMuted,
            letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6,
          }}>
            Operation Order
          </div>
          <div style={{
            display: 'flex', gap: 3, alignItems: 'center',
            padding: '4px',
            background: 'rgba(255,255,255,0.02)',
            borderRadius: 6,
          }}>
            {simplifiedOrder.map((g, i) => (
              <React.Fragment key={g.id}>
                {i > 0 && (
                  <span style={{ fontSize: 10, color: T.textMuted }}>→</span>
                )}
                <span style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: g.color,
                  padding: '3px 8px',
                  borderRadius: 4,
                  background: `${g.color}18`,
                  border: `1px solid ${g.color}40`,
                  whiteSpace: 'nowrap',
                }}>
                  {g.label}
                </span>
              </React.Fragment>
            ))}
          </div>
          <div style={{
            fontSize: 9, color: T.textMuted, marginTop: 4, lineHeight: 1.3,
          }}>
            First = applied first to vertices. Drag below to reorder.
          </div>
        </div>

        {/* Presets */}
        <div style={{
          padding: '8px 8px 4px',
          borderBottom: `1px solid ${T.borderDim}`,
        }}>
          <div style={{
            fontSize: 10, fontWeight: 600, color: T.textMuted,
            letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6,
          }}>
            Presets
          </div>
          {PRESETS.map(preset => (
            <button
              key={preset.name}
              onClick={() => applyPreset(preset)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '4px 8px',
                marginBottom: 2,
                background: 'rgba(255,255,255,0.03)',
                border: `1px solid ${T.borderDim}`,
                borderRadius: 4,
                color: T.text,
                fontSize: 10,
                cursor: 'pointer',
                transition: 'all 0.12s ease',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.background = T.bgHover;
                (e.currentTarget as HTMLElement).style.borderColor = T.accent;
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)';
                (e.currentTarget as HTMLElement).style.borderColor = T.borderDim;
              }}
            >
              <div style={{ fontWeight: 600, color: T.accent, marginBottom: 1 }}>
                {preset.name}
              </div>
              <div style={{ fontSize: 9, color: T.textMuted }}>
                {preset.description}
              </div>
            </button>
          ))}
        </div>

        {/* Advanced: full operation list */}
        <div style={{ padding: '8px 8px 4px' }}>
          <div
            onClick={() => setShowAdvanced(!showAdvanced)}
            style={{
              fontSize: 10, fontWeight: 600, color: T.textMuted,
              letterSpacing: 0.8, textTransform: 'uppercase',
              cursor: 'pointer', userSelect: 'none', marginBottom: 6,
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            <span style={{
              fontSize: 8, transition: 'transform 0.15s',
              transform: showAdvanced ? 'rotate(90deg)' : 'rotate(0)',
              display: 'inline-block',
            }}>▶</span>
            Transform Pipeline ({selectedNode.opOrder.length} operations)
          </div>

          {showAdvanced && (
            <div>
              {selectedNode.opOrder.map((op, i) => (
                <DragItem
                  key={`${op}-${i}`}
                  op={op}
                  index={i}
                  totalCount={selectedNode.opOrder.length}
                  dragIndex={dragIndex}
                  dropIndex={dropIndex}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDragEnd={handleDragEnd}
                />
              ))}

              {/* Formula display */}
              <div style={{
                marginTop: 8,
                padding: '6px 8px',
                background: 'rgba(0,0,0,0.3)',
                borderRadius: 4,
                border: `1px solid ${T.borderDim}`,
              }}>
                <div style={{
                  fontSize: 9, color: T.textMuted, marginBottom: 3,
                  textTransform: 'uppercase', letterSpacing: 0.5,
                }}>
                  Formula (applied left → right)
                </div>
                <div style={{
                  fontSize: 10,
                  fontFamily: T.fontMono,
                  color: T.text,
                  wordBreak: 'break-all',
                  lineHeight: 1.5,
                }}>
                  {selectedNode.opOrder.map((op, i) => {
                    const meta = TRANSFORM_OP_META[op];
                    return (
                      <React.Fragment key={i}>
                        {i > 0 && <span style={{ color: T.textMuted }}> · </span>}
                        <span style={{ color: meta.color, fontWeight: 600 }}>
                          {meta.shortLabel}
                        </span>
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div style={{
        padding: '4px 8px',
        borderTop: `1px solid ${T.borderDim}`,
        fontSize: 9, color: T.textMuted, textAlign: 'center',
      }}>
        Drag operations to reorder the transform pipeline
      </div>
    </div>
  );
}
