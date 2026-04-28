// ============================================================
// ui/Outliner.tsx — Maya-style scene hierarchy panel
//
//   Displays all CustomTransformNodes in a tree view with
//   selection, expand/collapse, and type icons. Supports
//   clicking to select a node and highlighting the selection.
// ============================================================

import React, { useState, useMemo } from 'react';
import { T } from './theme';
import type { CustomTransformNode } from '../CustomTransformNode';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OutlinerNode {
  /** The CustomTransformNode reference */
  node: CustomTransformNode;
  /** Display label */
  label: string;
  /** Node type for icon rendering */
  type: 'transform' | 'mesh' | 'group' | 'light' | 'camera';
  /** Children in the hierarchy */
  children: OutlinerNode[];
  /** Accent color (from the scene) */
  color?: string;
}

interface OutlinerProps {
  /** Root-level nodes to display */
  nodes: OutlinerNode[];
  /** Currently selected node name */
  selectedName: string | null;
  /** Called when a node is selected */
  onSelect: (node: CustomTransformNode, name: string) => void;
  /** Current panel width */
  width?: number;
}

// ---------------------------------------------------------------------------
// Icon mapping
// ---------------------------------------------------------------------------

const TYPE_ICONS: Record<string, { icon: string; color: string }> = {
  transform: { icon: '⊕', color: T.nodeTransform },
  mesh:      { icon: '◆', color: T.nodeMesh },
  group:     { icon: '▣', color: '#aaaacc' },
  light:     { icon: '☀', color: T.nodeLight },
  camera:    { icon: '📷', color: T.nodeCamera },
};

// ---------------------------------------------------------------------------
// TreeItem — recursive tree node
// ---------------------------------------------------------------------------

function TreeItem({
  item,
  depth,
  selectedName,
  onSelect,
}: {
  item: OutlinerNode;
  depth: number;
  selectedName: string | null;
  onSelect: (node: CustomTransformNode, name: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const isSelected = selectedName === item.label;
  const hasChildren = item.children.length > 0;
  const typeInfo = TYPE_ICONS[item.type] || TYPE_ICONS.transform;

  return (
    <div>
      {/* Row */}
      <div
        onClick={() => onSelect(item.node, item.label)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          paddingLeft: 12 + depth * 16,
          paddingRight: 8,
          paddingTop: 3,
          paddingBottom: 3,
          cursor: 'pointer',
          background: isSelected ? T.accentGlow : 'transparent',
          borderLeft: isSelected ? `2px solid ${T.accent}` : '2px solid transparent',
          transition: 'background 0.1s ease',
          userSelect: 'none',
        }}
        onMouseEnter={e => {
          if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = T.bgHover;
        }}
        onMouseLeave={e => {
          if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'transparent';
        }}
      >
        {/* Expand/collapse toggle */}
        {hasChildren ? (
          <span
            onClick={e => { e.stopPropagation(); setExpanded(!expanded); }}
            style={{
              fontSize: 8,
              color: T.textDim,
              width: 12,
              textAlign: 'center',
              cursor: 'pointer',
              transition: 'transform 0.15s ease',
              transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
              display: 'inline-block',
            }}
          >
            ▶
          </span>
        ) : (
          <span style={{ width: 12 }} />
        )}

        {/* Type icon */}
        <span style={{
          fontSize: 11,
          color: item.color || typeInfo.color,
          width: 14,
          textAlign: 'center',
          flexShrink: 0,
        }}>
          {typeInfo.icon}
        </span>

        {/* Name */}
        <span style={{
          fontSize: 11,
          color: isSelected ? T.accent : T.text,
          fontWeight: isSelected ? 600 : 400,
          fontFamily: T.font,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flex: 1,
        }}>
          {item.label}
        </span>

        {/* Visibility toggle (placeholder) */}
        <span style={{
          fontSize: 10,
          color: T.textMuted,
          cursor: 'pointer',
          opacity: 0.5,
          flexShrink: 0,
        }}>
          👁
        </span>
      </div>

      {/* Children */}
      {expanded && hasChildren && (
        <div>
          {item.children.map(child => (
            <TreeItem
              key={child.label}
              item={child}
              depth={depth + 1}
              selectedName={selectedName}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Outliner Panel
// ---------------------------------------------------------------------------

export default function Outliner({ nodes, selectedName, onSelect, width = 220 }: OutlinerProps) {
  const [searchFilter, setSearchFilter] = useState('');

  // Filter nodes by search
  const filteredNodes = useMemo(() => {
    if (!searchFilter) return nodes;
    const q = searchFilter.toLowerCase();
    const filter = (items: OutlinerNode[]): OutlinerNode[] => {
      return items.reduce<OutlinerNode[]>((acc, item) => {
        const childMatch = filter(item.children);
        if (item.label.toLowerCase().includes(q) || childMatch.length > 0) {
          acc.push({ ...item, children: childMatch });
        }
        return acc;
      }, []);
    };
    return filter(nodes);
  }, [nodes, searchFilter]);

  return (
    <div style={{
      width,
      background: T.bg,
      borderRight: `1px solid ${T.border}`,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      fontFamily: T.font,
      flexShrink: 0,
    }}>
      {/* Header */}
      <div style={{
        padding: '8px 12px',
        borderBottom: `1px solid ${T.border}`,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}>
        <span style={{ fontSize: 12, color: T.accent }}>▣</span>
        <span style={{
          fontSize: 11,
          fontWeight: 600,
          color: T.textDim,
          letterSpacing: 1,
          textTransform: 'uppercase',
        }}>
          Outliner
        </span>
      </div>

      {/* Search */}
      <div style={{ padding: '6px 8px', borderBottom: `1px solid ${T.borderDim}` }}>
        <input
          type="text"
          placeholder="Search..."
          value={searchFilter}
          onChange={e => setSearchFilter(e.target.value)}
          style={{
            width: '100%',
            background: T.bgInput,
            border: `1px solid ${T.borderDim}`,
            borderRadius: 4,
            color: T.text,
            fontSize: 11,
            padding: '4px 8px',
            outline: 'none',
            fontFamily: T.font,
          }}
        />
      </div>

      {/* Tree */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        overflowX: 'hidden',
        paddingTop: 4,
        paddingBottom: 4,
      }}>
        {filteredNodes.map(item => (
          <TreeItem
            key={item.label}
            item={item}
            depth={0}
            selectedName={selectedName}
            onSelect={onSelect}
          />
        ))}

        {filteredNodes.length === 0 && (
          <div style={{
            padding: '20px 12px',
            color: T.textMuted,
            fontSize: 11,
            textAlign: 'center',
          }}>
            No objects found
          </div>
        )}
      </div>

      {/* Footer — node count */}
      <div style={{
        padding: '4px 12px',
        borderTop: `1px solid ${T.borderDim}`,
        fontSize: 10,
        color: T.textMuted,
        textAlign: 'right',
      }}>
        {nodes.length} object{nodes.length !== 1 ? 's' : ''}
      </div>
    </div>
  );
}
