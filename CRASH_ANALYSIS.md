# Crash Analysis — Annotate

## Root Cause
`TypeError: Cannot read property 'getContext' of null` when drawing before canvas mount.

**Crash locations (App.tsx):**
- `startDrawing()` — `annotationRef.current.getContext('2d')` with no null guard
- `draw()` — same issue

## Fix Applied
Added null guard:
```ts
const annCanvas = annotationRef.current;
if (!annCanvas) return;
const ctx = annCanvas.getContext('2d');
```

## Additional Fixes
1. **Stale RAF closure** — `requestAnimationFrame` captured stale `currentFrame`
2. **cachedRectRef null** — Added null check in `getCanvasCoordinates`
3. **Canvas.tsx** — Extracted drawing canvas component
4. **Timeline.tsx** — Extracted timeline component

## Files Changed
- `src/App.tsx` — null guards + TS header
- `src/components/Canvas.tsx` — New component
- `src/components/Timeline.tsx` — New component
