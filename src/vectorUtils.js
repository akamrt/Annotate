// ============================================================
// vectorUtils.js — Cubic Bézier vector path utilities
// ============================================================

let _vertexIdCounter = 0;

/**
 * Create a new vertex with default (retracted) handles.
 */
export const createVertex = (x, y) => {
    const id = `v-${Date.now()}-${_vertexIdCounter++}`;
    return {
        id,
        anchor: { x, y },
        handleIn: { x, y },   // retracted = same as anchor
        handleOut: { x, y },   // retracted = same as anchor
        transform: { x: 0, y: 0, rotation: 0, scale: 1 }
    };
};

/**
 * Get the effective anchor position (anchor + transform offset).
 */
export const getEffectiveAnchor = (v) => ({
    x: v.anchor.x + v.transform.x,
    y: v.anchor.y + v.transform.y
});

/**
 * Get the effective handle positions (handle + transform offset).
 */
export const getEffectiveHandleIn = (v) => ({
    x: v.handleIn.x + v.transform.x,
    y: v.handleIn.y + v.transform.y
});

export const getEffectiveHandleOut = (v) => ({
    x: v.handleOut.x + v.transform.x,
    y: v.handleOut.y + v.transform.y
});

// -----------------------------------------------
// Bézier math
// -----------------------------------------------

/**
 * Evaluate a cubic Bézier at parameter t ∈ [0, 1].
 */
export const pointOnBezier = (t, p0, cp1, cp2, p1) => {
    const mt = 1 - t;
    const mt2 = mt * mt;
    const t2 = t * t;
    return {
        x: mt2 * mt * p0.x + 3 * mt2 * t * cp1.x + 3 * mt * t2 * cp2.x + t2 * t * p1.x,
        y: mt2 * mt * p0.y + 3 * mt2 * t * cp1.y + 3 * mt * t2 * cp2.y + t2 * t * p1.y
    };
};

/**
 * Get the four Bézier control points for the segment between v1 and v2,
 * with per-vertex transforms applied.
 */
export const getEffectiveBezierPoints = (v1, v2) => {
    const p0 = getEffectiveAnchor(v1);
    const cp1 = getEffectiveHandleOut(v1);
    const cp2 = getEffectiveHandleIn(v2);
    const p1 = getEffectiveAnchor(v2);
    return { p0, cp1, cp2, p1 };
};

/**
 * Split a Bézier segment at parameter t using De Casteljau's algorithm.
 * Returns a new vertex that sits on the curve at t, with correct handles
 * for the two resulting sub-segments.
 */
export const splitBezierAt = (t, v1, v2) => {
    const { p0, cp1, cp2, p1 } = getEffectiveBezierPoints(v1, v2);

    // De Casteljau
    const a = lerp2D(p0, cp1, t);
    const b = lerp2D(cp1, cp2, t);
    const c = lerp2D(cp2, p1, t);
    const d = lerp2D(a, b, t);
    const e = lerp2D(b, c, t);
    const mid = lerp2D(d, e, t);

    // The new vertex at the split point
    const newVertex = createVertex(mid.x, mid.y);
    newVertex.handleIn = { ...d };
    newVertex.handleOut = { ...e };

    // Update v1's handleOut and v2's handleIn for the two sub-curves
    const updatedV1HandleOut = { ...a };
    const updatedV2HandleIn = { ...c };

    return { newVertex, updatedV1HandleOut, updatedV2HandleIn };
};

const lerp2D = (a, b, t) => ({
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t
});

// -----------------------------------------------
// Rendering
// -----------------------------------------------

/**
 * Draw a vector stroke path onto a Canvas 2D context.
 */
export const drawVectorStroke = (ctx, stroke, isGhost = false, colorOverride = null) => {
    const verts = stroke.vertices;
    if (!verts || verts.length < 2) {
        // Single anchor — draw a dot
        if (verts && verts.length === 1) {
            const p = getEffectiveAnchor(verts[0]);
            ctx.beginPath();
            ctx.arc(p.x, p.y, (stroke.size || 2) / 2, 0, Math.PI * 2);
            ctx.fillStyle = colorOverride || stroke.color;
            ctx.globalAlpha = isGhost ? 0.5 : (stroke.opacity || 1);
            ctx.fill();
            ctx.globalAlpha = 1;
        }
        return;
    }

    ctx.beginPath();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = stroke.size || 2;
    ctx.strokeStyle = colorOverride || stroke.color;
    ctx.globalAlpha = isGhost ? 0.5 : (stroke.opacity || 1);

    const start = getEffectiveAnchor(verts[0]);
    ctx.moveTo(start.x, start.y);

    for (let i = 0; i < verts.length - 1; i++) {
        const { cp1, cp2, p1 } = getEffectiveBezierPoints(verts[i], verts[i + 1]);
        ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, p1.x, p1.y);
    }

    if (stroke.closed && verts.length > 2) {
        const { cp1, cp2, p1 } = getEffectiveBezierPoints(verts[verts.length - 1], verts[0]);
        ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, p1.x, p1.y);
        ctx.closePath();
    }

    ctx.stroke();

    if (stroke.fill) {
        ctx.fillStyle = stroke.fill;
        ctx.fill();
    }

    ctx.globalAlpha = 1;
};

/**
 * Draw anchor points and control handles for editing.
 * `selectedVertexIds` controls which vertices show their handles.
 */
export const drawVectorHandles = (ctx, stroke, selectedVertexIds = [], hoveredVertexId = null) => {
    const verts = stroke.vertices;
    if (!verts) return;

    ctx.save();

    verts.forEach((v) => {
        const anchor = getEffectiveAnchor(v);
        const isSelected = selectedVertexIds.includes(v.id);
        const isHovered = v.id === hoveredVertexId;

        // Draw handles if selected
        if (isSelected) {
            const hIn = getEffectiveHandleIn(v);
            const hOut = getEffectiveHandleOut(v);

            // Handle lines
            ctx.beginPath();
            ctx.strokeStyle = '#8b8b8b';
            ctx.lineWidth = 1;
            ctx.setLineDash([]);

            // handleIn line
            ctx.moveTo(anchor.x, anchor.y);
            ctx.lineTo(hIn.x, hIn.y);
            // handleOut line
            ctx.moveTo(anchor.x, anchor.y);
            ctx.lineTo(hOut.x, hOut.y);
            ctx.stroke();

            // Handle dots (diamonds)
            [hIn, hOut].forEach(h => {
                const dist = Math.hypot(h.x - anchor.x, h.y - anchor.y);
                if (dist > 1) { // only show if not retracted
                    ctx.beginPath();
                    ctx.save();
                    ctx.translate(h.x, h.y);
                    ctx.rotate(Math.PI / 4);
                    ctx.rect(-4, -4, 8, 8);
                    ctx.restore();
                    ctx.fillStyle = '#fff';
                    ctx.strokeStyle = '#3b82f6';
                    ctx.lineWidth = 1.5;
                    ctx.fill();
                    ctx.stroke();
                }
            });
        }

        // Draw anchor point (square for selected, circle for unselected)
        ctx.beginPath();
        if (isSelected) {
            ctx.rect(anchor.x - 5, anchor.y - 5, 10, 10);
        } else {
            ctx.arc(anchor.x, anchor.y, 4, 0, Math.PI * 2);
        }
        ctx.fillStyle = isSelected ? '#3b82f6' : (isHovered ? '#60a5fa' : '#fff');
        ctx.strokeStyle = isSelected ? '#1d4ed8' : '#3b82f6';
        ctx.lineWidth = 1.5;
        ctx.fill();
        ctx.stroke();
    });

    ctx.restore();
};

// -----------------------------------------------
// Hit testing
// -----------------------------------------------

/**
 * Hit-test vertex anchors and handles.
 * Returns { vertexId, vertexIndex, part: 'anchor'|'handleIn'|'handleOut' } or null.
 */
export const hitTestAnchor = (point, vertices, threshold = 10) => {
    // Test in reverse order so top-most (last drawn) is hit first
    for (let i = vertices.length - 1; i >= 0; i--) {
        const v = vertices[i];
        const anchor = getEffectiveAnchor(v);

        // Check handleOut first (on top)
        const hOut = getEffectiveHandleOut(v);
        if (Math.hypot(hOut.x - anchor.x, hOut.y - anchor.y) > 1) {
            if (Math.hypot(point.x - hOut.x, point.y - hOut.y) < threshold) {
                return { vertexId: v.id, vertexIndex: i, part: 'handleOut' };
            }
        }

        // Check handleIn
        const hIn = getEffectiveHandleIn(v);
        if (Math.hypot(hIn.x - anchor.x, hIn.y - anchor.y) > 1) {
            if (Math.hypot(point.x - hIn.x, point.y - hIn.y) < threshold) {
                return { vertexId: v.id, vertexIndex: i, part: 'handleIn' };
            }
        }

        // Check anchor
        if (Math.hypot(point.x - anchor.x, point.y - anchor.y) < threshold) {
            return { vertexId: v.id, vertexIndex: i, part: 'anchor' };
        }
    }
    return null;
};

/**
 * Hit test a point against a Bézier curve segment by sampling.
 * Returns the minimum distance.
 */
export const hitTestCurveSegment = (point, v1, v2, samples = 30) => {
    const { p0, cp1, cp2, p1 } = getEffectiveBezierPoints(v1, v2);
    let minDist = Infinity;
    for (let i = 0; i <= samples; i++) {
        const t = i / samples;
        const p = pointOnBezier(t, p0, cp1, cp2, p1);
        const d = Math.hypot(point.x - p.x, point.y - p.y);
        if (d < minDist) minDist = d;
    }
    return minDist;
};

/**
 * Hit-test a point against the entire vector stroke (all segments).
 */
export const hitTestVectorStroke = (point, stroke, threshold = 12) => {
    const verts = stroke.vertices;
    if (!verts || verts.length < 2) {
        if (verts && verts.length === 1) {
            const a = getEffectiveAnchor(verts[0]);
            return Math.hypot(point.x - a.x, point.y - a.y) < threshold;
        }
        return false;
    }

    for (let i = 0; i < verts.length - 1; i++) {
        const d = hitTestCurveSegment(point, verts[i], verts[i + 1]);
        if (d < threshold) return true;
    }

    if (stroke.closed && verts.length > 2) {
        const d = hitTestCurveSegment(point, verts[verts.length - 1], verts[0]);
        if (d < threshold) return true;
    }

    return false;
};

// -----------------------------------------------
// Bounds
// -----------------------------------------------

/**
 * Compute axis-aligned bounding box for a vector stroke by sampling all segments.
 */
export const getVectorStrokeBounds = (stroke) => {
    const verts = stroke.vertices;
    if (!verts || verts.length === 0) return null;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    const updateBounds = (p) => {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
    };

    // Include all anchor points
    verts.forEach(v => {
        updateBounds(getEffectiveAnchor(v));
    });

    // Sample curves for tighter bounds
    const segments = verts.length - 1 + (stroke.closed && verts.length > 2 ? 1 : 0);
    for (let i = 0; i < segments; i++) {
        const v1 = verts[i];
        const v2 = verts[(i + 1) % verts.length];
        const { p0, cp1, cp2, p1 } = getEffectiveBezierPoints(v1, v2);
        for (let t = 0; t <= 1; t += 0.05) {
            updateBounds(pointOnBezier(t, p0, cp1, cp2, p1));
        }
    }

    if (minX === Infinity) return null;

    // Add padding for stroke width
    const pad = (stroke.size || 2) / 2;
    minX -= pad; minY -= pad; maxX += pad; maxY += pad;

    return {
        x: minX, y: minY,
        w: maxX - minX, h: maxY - minY,
        cx: (minX + maxX) / 2, cy: (minY + maxY) / 2
    };
};

// -----------------------------------------------
// Sculpt / Falloff (used in Phase 3, defined here for completeness)
// -----------------------------------------------

/**
 * Smooth Hermite falloff: 0 at edge, 1 at center, C1 continuous.
 */
export const smoothFalloff = (distance, radius) => {
    if (distance >= radius) return 0;
    const t = 1 - (distance / radius) ** 2;
    return t * t;
};

/**
 * Apply grab deformation to vertices.
 * `center` = mouse position, `delta` = mouse movement, `radius` = brush radius.
 * Returns a new array of vertices with updated transforms.
 */
export const applySculptGrab = (vertices, center, delta, radius) => {
    return vertices.map(v => {
        const anchor = getEffectiveAnchor(v);
        const dist = Math.hypot(anchor.x - center.x, anchor.y - center.y);
        const weight = smoothFalloff(dist, radius);
        if (weight <= 0) return v;
        return {
            ...v,
            transform: {
                ...v.transform,
                x: v.transform.x + delta.x * weight,
                y: v.transform.y + delta.y * weight
            }
        };
    });
};

/**
 * Apply push deformation along a direction vector.
 */
export const applySculptPush = (vertices, center, direction, radius, strength = 1) => {
    const len = Math.hypot(direction.x, direction.y);
    if (len === 0) return vertices;
    const nx = direction.x / len;
    const ny = direction.y / len;

    return vertices.map(v => {
        const anchor = getEffectiveAnchor(v);
        const dist = Math.hypot(anchor.x - center.x, anchor.y - center.y);
        const weight = smoothFalloff(dist, radius) * strength;
        if (weight <= 0) return v;
        return {
            ...v,
            transform: {
                ...v.transform,
                x: v.transform.x + nx * weight * len,
                y: v.transform.y + ny * weight * len
            }
        };
    });
};

/**
 * Apply pull deformation toward a target position.
 */
export const applySculptPull = (vertices, targetPos, radius, strength = 0.1) => {
    return vertices.map(v => {
        const anchor = getEffectiveAnchor(v);
        const dist = Math.hypot(anchor.x - targetPos.x, anchor.y - targetPos.y);
        const weight = smoothFalloff(dist, radius) * strength;
        if (weight <= 0) return v;
        return {
            ...v,
            transform: {
                ...v.transform,
                x: v.transform.x + (targetPos.x - anchor.x) * weight,
                y: v.transform.y + (targetPos.y - anchor.y) * weight
            }
        };
    });
};

/**
 * Bake transforms into anchor/handle positions (reset transforms to zero).
 */
export const bakeTransforms = (vertices) => {
    return vertices.map(v => ({
        ...v,
        anchor: {
            x: v.anchor.x + v.transform.x,
            y: v.anchor.y + v.transform.y
        },
        handleIn: {
            x: v.handleIn.x + v.transform.x,
            y: v.handleIn.y + v.transform.y
        },
        handleOut: {
            x: v.handleOut.x + v.transform.x,
            y: v.handleOut.y + v.transform.y
        },
        transform: { x: 0, y: 0, rotation: 0, scale: 1 }
    }));
};

// -----------------------------------------------
// Animation keys (per-vertex keyframes)
// -----------------------------------------------

const lerpScalar = (a, b, t) => a + (b - a) * t;
const lerpPoint = (a, b, t) => ({
    x: lerpScalar(a.x, b.x, t),
    y: lerpScalar(a.y, b.y, t)
});

/**
 * Resolve a vertex's anchor/handles at a given localFrame.
 * If the vertex has animKeys, linearly interpolate between surrounding keys.
 * Otherwise, return the base values.
 */
export const getVertexAtFrame = (vertex, localFrame) => {
    if (!vertex.animKeys || vertex.animKeys.length === 0) {
        return {
            anchor: { ...vertex.anchor },
            handleIn: { ...vertex.handleIn },
            handleOut: { ...vertex.handleOut }
        };
    }

    const keys = vertex.animKeys;

    // Before the first key → clamp to first
    if (localFrame <= keys[0].frameOffset) {
        return {
            anchor: { ...keys[0].anchor },
            handleIn: { ...keys[0].handleIn },
            handleOut: { ...keys[0].handleOut }
        };
    }
    // After the last key → clamp to last
    const last = keys[keys.length - 1];
    if (localFrame >= last.frameOffset) {
        return {
            anchor: { ...last.anchor },
            handleIn: { ...last.handleIn },
            handleOut: { ...last.handleOut }
        };
    }

    // Find surrounding keys and interpolate
    for (let i = 0; i < keys.length - 1; i++) {
        const k1 = keys[i];
        const k2 = keys[i + 1];
        if (localFrame >= k1.frameOffset && localFrame <= k2.frameOffset) {
            const span = k2.frameOffset - k1.frameOffset;
            const t = span === 0 ? 0 : (localFrame - k1.frameOffset) / span;
            return {
                anchor: lerpPoint(k1.anchor, k2.anchor, t),
                handleIn: lerpPoint(k1.handleIn, k2.handleIn, t),
                handleOut: lerpPoint(k1.handleOut, k2.handleOut, t)
            };
        }
    }

    // Fallback (unreachable)
    return {
        anchor: { ...vertex.anchor },
        handleIn: { ...vertex.handleIn },
        handleOut: { ...vertex.handleOut }
    };
};

/**
 * Return a copy of `vertices` with anchor/handleIn/handleOut resolved at `localFrame`.
 * Vertex identity (id, transform, animKeys) is preserved.
 */
export const resolveVerticesAtFrame = (vertices, localFrame) => {
    if (!vertices) return vertices;
    return vertices.map(v => {
        const resolved = getVertexAtFrame(v, localFrame);
        return {
            ...v,
            anchor: resolved.anchor,
            handleIn: resolved.handleIn,
            handleOut: resolved.handleOut
        };
    });
};

/**
 * Insert or update an animation key on a vertex (mutating).
 * - If `vertex.animKeys` is missing, it is created.
 * - On first edit, a baseline key at offset 0 is seeded from the current base values
 *   so that interpolation has a sensible starting state.
 * - If a key already exists at `localFrame`, it is updated; otherwise a new key is inserted.
 */
export const setVertexAnimKey = (vertex, localFrame, anchor, handleIn, handleOut) => {
    if (!vertex.animKeys) {
        vertex.animKeys = [];
    }

    // Seed a baseline key at offset 0 from the current base values, so the curve
    // animates *from* its original shape rather than snapping.
    if (vertex.animKeys.length === 0 && localFrame !== 0) {
        vertex.animKeys.push({
            frameOffset: 0,
            anchor: { ...vertex.anchor },
            handleIn: { ...vertex.handleIn },
            handleOut: { ...vertex.handleOut }
        });
    }

    const newKey = {
        frameOffset: localFrame,
        anchor: { ...anchor },
        handleIn: { ...handleIn },
        handleOut: { ...handleOut }
    };

    const existingIdx = vertex.animKeys.findIndex(k => k.frameOffset === localFrame);
    if (existingIdx >= 0) {
        vertex.animKeys[existingIdx] = newKey;
    } else {
        vertex.animKeys.push(newKey);
        vertex.animKeys.sort((a, b) => a.frameOffset - b.frameOffset);
    }
};

/**
 * Collect every unique frame offset that has at least one vertex anim key,
 * across all vector strokes in the given list.
 * Returns a sorted array of integers.
 */
export const collectAnimKeyOffsets = (strokes) => {
    if (!strokes) return [];
    const offsets = new Set();
    strokes.forEach(stroke => {
        if (stroke.type !== 'vector' || !stroke.vertices) return;
        stroke.vertices.forEach(v => {
            if (v.animKeys && v.animKeys.length > 0) {
                v.animKeys.forEach(k => offsets.add(k.frameOffset));
            }
        });
    });
    return Array.from(offsets).sort((a, b) => a - b);
};
