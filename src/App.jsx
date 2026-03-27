import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
    Play,
    Pause,
    Volume2,
    VolumeX,
    Settings,
    ChevronRight,
    ChevronLeft,
    Repeat,
    Maximize,
    Zap,
    PenTool,
    Pencil,
    Eraser,
    Trash2,
    Undo,
    Redo,
    Palette,
    Brush,
    Download,
    Scissors,
    XCircle,
    Search,
    Focus,
    Layers,
    Droplet,
    SkipForward,
    SkipBack,
    Hand,
    MousePointer2,
    Copy,
    Sidebar,
    ClipboardCopy,
    Clipboard,
    ArrowLeft,
    ArrowRight,
    MoveLeft,
    MoveRight,
    BoxSelect,
    Type,
    X,
    FileImage,
    Film,
    Images,
    CheckCircle2,
    Plus,
    Eye,
    EyeOff,
    Lock,
    Unlock,
    GripVertical
} from 'lucide-react';

const FPS = 24;
const DRAWING_CANVAS_WIDTH = 1920;
const DRAWING_CANVAS_HEIGHT = 1080;
const PIXELS_PER_FRAME = 20;
const TRACK_HEIGHT = 64; // Height of layer row in pixels (h-16)

const FONTS = [
    { name: 'Sans Serif', value: 'sans-serif' },
    { name: 'Serif', value: 'serif' },
    { name: 'Monospace', value: 'monospace' },
    { name: 'Arial', value: 'Arial, sans-serif' },
    { name: 'Verdana', value: 'Verdana, sans-serif' },
    { name: 'Times New Roman', value: '"Times New Roman", serif' },
    { name: 'Georgia', value: 'Georgia, serif' },
    { name: 'Courier New', value: '"Courier New", monospace' },
    { name: 'Brush Script', value: '"Brush Script MT", cursive' }
];

// --- GEOMETRY HELPERS ---

const getStrokesBounds = (strokes) => {
    if (!strokes || strokes.length === 0) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    strokes.forEach(stroke => {
        if (stroke.type === 'text') {
            const p = stroke.points[0];
            const width = stroke.text.length * stroke.size * 0.6;
            const height = stroke.size;
            if (p.x < minX) minX = p.x;
            if (p.x + width > maxX) maxX = p.x + width;
            if (p.y - height / 2 < minY) minY = p.y - height / 2;
            if (p.y + height / 2 > maxY) maxY = p.y + height / 2;
        } else {
            stroke.points.forEach(p => {
                if (p.x < minX) minX = p.x;
                if (p.x > maxX) maxX = p.x;
                if (p.y < minY) minY = p.y;
                if (p.y > maxY) maxY = p.y;
            });
        }
    });

    if (minX === Infinity) return null;
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY, cx: minX + (maxX - minX) / 2, cy: minY + (maxY - minY) / 2 };
};

const pointInPoly = (point, vs) => {
    let x = point.x, y = point.y;
    let inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
        let xi = vs[i].x, yi = vs[i].y;
        let xj = vs[j].x, yj = vs[j].y;
        let intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
};

const getLineIntersection = (p1, p2, p3, p4) => {
    const x1 = p1.x, y1 = p1.y, x2 = p2.x, y2 = p2.y;
    const x3 = p3.x, y3 = p3.y, x4 = p4.x, y4 = p4.y;
    const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
    if (denom === 0) return null;
    const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
    const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;
    if (ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1) {
        return { x: x1 + ua * (x2 - x1), y: y1 + ua * (y2 - y1) };
    }
    return null;
};

const getBoxIntersection = (p1, p2, box) => {
    const edges = [
        [{ x: box.minX, y: box.minY }, { x: box.maxX, y: box.minY }],
        [{ x: box.maxX, y: box.minY }, { x: box.maxX, y: box.maxY }],
        [{ x: box.maxX, y: box.maxY }, { x: box.minX, y: box.maxY }],
        [{ x: box.minX, y: box.maxY }, { x: box.minX, y: box.minY }]
    ];
    for (const edge of edges) {
        const hit = getLineIntersection(p1, p2, edge[0], edge[1]);
        if (hit) return hit;
    }
    return null;
};

const isPointInStroke = (point, stroke) => {
    if (stroke.type === 'text') {
        const b = getStrokesBounds([stroke]);
        const padding = 10;
        return (b && point.x >= b.x - padding && point.x <= b.x + b.w + padding && point.y >= b.y - padding && point.y <= b.y + b.h + padding);
    }
    const b = getStrokesBounds([stroke]);
    if (!b || point.x < b.x - 15 || point.x > b.x + b.w + 15 || point.y < b.y - 15 || point.y > b.y + b.h + 15) return false;
    const threshold = Math.max(10, stroke.size);
    for (let i = 0; i < stroke.points.length; i += 2) {
        const p = stroke.points[i];
        if (Math.abs(p.x - point.x) < threshold && Math.abs(p.y - point.y) < threshold) return true;
    }
    return false;
}

// --- THUMBNAIL COMPONENT ---
const KeyframeThumbnail = ({ strokes, width, height }) => {
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const bounds = getStrokesBounds(strokes);
        ctx.clearRect(0, 0, width, height);
        if (!bounds) return;

        const scaleX = width / (bounds.w || 100);
        const scaleY = height / (bounds.h || 100);
        const scale = Math.min(scaleX, scaleY) * 0.8;
        const offsetX = (width - bounds.w * scale) / 2 - bounds.x * scale;
        const offsetY = (height - bounds.h * scale) / 2 - bounds.y * scale;

        ctx.save();
        ctx.translate(offsetX, offsetY);
        ctx.scale(scale, scale);

        strokes.forEach(stroke => {
            if (stroke.type === 'text') {
                ctx.font = `bold ${stroke.size}px ${stroke.fontFamily || 'sans-serif'}`;
                ctx.fillStyle = stroke.color;
                ctx.textBaseline = 'middle';
                if (stroke.points[0]) ctx.fillText(stroke.text, stroke.points[0].x, stroke.points[0].y);
            } else {
                ctx.beginPath();
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.lineWidth = stroke.size;
                ctx.strokeStyle = stroke.color;
                ctx.globalAlpha = stroke.opacity || 1;
                if (stroke.points.length > 0) {
                    ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
                    for (let i = 1; i < stroke.points.length; i++) {
                        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
                    }
                }
                ctx.stroke();
                ctx.globalAlpha = 1;
            }
        });
        ctx.restore();
    }, [strokes, width, height]);

    return <canvas ref={canvasRef} width={width} height={height} className="w-full h-full opacity-80" />;
};

// --- TIMELINE COMPONENT ---
const Timeline = ({
    layers,
    activeLayerId,
    keyframes,
    currentFrame,
    totalFrames,
    onSeek,
    onDragKeyframeDuration,
    onMoveKeyframes,
    onSelectLayer,
    rangeStart,
    rangeEnd,
    isRangeActive,
    togglePlay,
    isPlaying,
    selectedKeyframeIds,
    onSelectKeyframes
}) => {
    const scrollContainerRef = useRef(null);
    const [draggingId, setDraggingId] = useState(null);
    const [dragStartX, setDragStartX] = useState(null);
    const [originalDuration, setOriginalDuration] = useState(null);
    const [isScrubbing, setIsScrubbing] = useState(false);

    // Interaction State
    const [interactionMode, setInteractionMode] = useState('none');
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [currentMousePos, setCurrentMousePos] = useState({ x: 0, y: 0 });
    const [initialDragState, setInitialDragState] = useState(null);

    useEffect(() => {
        if (scrollContainerRef.current && isPlaying && !isScrubbing && interactionMode === 'none') {
            const targetScroll = (currentFrame * PIXELS_PER_FRAME) - (scrollContainerRef.current.clientWidth / 2);
            scrollContainerRef.current.scrollLeft = targetScroll;
        }
    }, [currentFrame, isPlaying, isScrubbing, interactionMode]);

    // --- HELPER: Coordinate Mapping ---
    const getLayerIndexFromY = (y) => {
        const trackY = y - 32;
        if (trackY < 0) return -1;
        return Math.floor(trackY / TRACK_HEIGHT);
    };

    const getFrameFromX = (x) => {
        if (!scrollContainerRef.current) return 0;
        const scrollLeft = scrollContainerRef.current.scrollLeft;
        return Math.max(0, Math.floor((x + scrollLeft) / PIXELS_PER_FRAME));
    };

    const displayLayers = [...layers].reverse();

    // --- HANDLERS ---
    const handleContainerMouseDown = (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (y < 32) {
            setInteractionMode('scrub');
            const frame = getFrameFromX(x);
            onSeek(frame);
            return;
        }

        setInteractionMode('marquee');
        setDragStart({ x: e.clientX, y: e.clientY });
        setCurrentMousePos({ x: e.clientX, y: e.clientY });

        if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
            onSelectKeyframes([]);
        }
    };

    const handleKeyframeMouseDown = (e, kf, isResize = false) => {
        e.stopPropagation();
        let newSelection = [...selectedKeyframeIds];
        const isSelected = newSelection.includes(kf.id);

        if (e.shiftKey || e.ctrlKey || e.metaKey) {
            if (isSelected) {
                if (!isResize) newSelection = newSelection.filter(id => id !== kf.id);
            } else {
                newSelection.push(kf.id);
            }
        } else {
            if (!isSelected) {
                newSelection = [kf.id];
            }
        }
        onSelectKeyframes(newSelection);

        if (scrollContainerRef.current) {
            const frame = getFrameFromX(e.clientX - scrollContainerRef.current.getBoundingClientRect().left);
            const layerIdx = getLayerIndexFromY(e.clientY - scrollContainerRef.current.getBoundingClientRect().top);

            setDragStart({ x: e.clientX, y: e.clientY, frame, layerIdx });
            setInitialDragState({
                keyframes: keyframes.filter(k => newSelection.includes(k.id)).map(k => ({ ...k })),
                clickedKeyframe: kf
            });

            setInteractionMode(isResize ? 'resize-keyframe' : 'drag-keyframe');
        }
    };

    useEffect(() => {
        const handleGlobalMouseMove = (e) => {
            if (interactionMode === 'none') return;

            if (interactionMode === 'scrub') {
                if (!scrollContainerRef.current) return;
                const rect = scrollContainerRef.current.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const frame = getFrameFromX(x);
                onSeek(frame);
            }
            else if (interactionMode === 'marquee' || interactionMode === 'drag-keyframe' || interactionMode === 'resize-keyframe') {
                setCurrentMousePos({ x: e.clientX, y: e.clientY });
            }
        };

        const handleGlobalMouseUp = (e) => {
            if (interactionMode === 'none') return;

            if (interactionMode === 'marquee') {
                if (scrollContainerRef.current) {
                    const rect = scrollContainerRef.current.getBoundingClientRect();
                    const scrollLeft = scrollContainerRef.current.scrollLeft;
                    const scrollTop = 32;

                    const x1 = Math.min(dragStart.x, currentMousePos.x) - rect.left + scrollLeft;
                    const x2 = Math.max(dragStart.x, currentMousePos.x) - rect.left + scrollLeft;
                    const y1 = Math.min(dragStart.y, currentMousePos.y) - rect.top - scrollTop;
                    const y2 = Math.max(dragStart.y, currentMousePos.y) - rect.top - scrollTop;

                    const selected = [];
                    keyframes.forEach(kf => {
                        const layerIndex = displayLayers.findIndex(l => l.id === kf.layerId);
                        if (layerIndex === -1) return;

                        const kfX = kf.startFrame * PIXELS_PER_FRAME;
                        const kfW = kf.duration * PIXELS_PER_FRAME;
                        const kfY = layerIndex * TRACK_HEIGHT;
                        const kfH = TRACK_HEIGHT;

                        if (x1 < kfX + kfW && x2 > kfX && y1 < kfY + kfH && y2 > kfY) {
                            selected.push(kf.id);
                        }
                    });

                    if (e.shiftKey) {
                        const unique = new Set([...selectedKeyframeIds, ...selected]);
                        onSelectKeyframes(Array.from(unique));
                    } else {
                        onSelectKeyframes(selected);
                    }
                }
            }
            else if (interactionMode === 'drag-keyframe') {
                const deltaX = e.clientX - dragStart.x;
                const deltaY = e.clientY - dragStart.y;
                const deltaFrames = Math.round(deltaX / PIXELS_PER_FRAME);
                const deltaLayerCount = Math.round(deltaY / TRACK_HEIGHT);

                if (deltaFrames !== 0 || deltaLayerCount !== 0) {
                    onMoveKeyframes(selectedKeyframeIds, deltaFrames, deltaLayerCount);
                }
            }
            else if (interactionMode === 'resize-keyframe') {
                const deltaX = e.clientX - dragStart.x;
                const deltaFrames = Math.round(deltaX / PIXELS_PER_FRAME);
                if (initialDragState && deltaFrames !== 0) {
                    const targetKf = initialDragState.clickedKeyframe;
                    onDragKeyframeDuration(targetKf.id, Math.max(1, targetKf.duration + deltaFrames));
                }
            }

            setInteractionMode('none');
            setInitialDragState(null);
        };

        window.addEventListener('mousemove', handleGlobalMouseMove);
        window.addEventListener('mouseup', handleGlobalMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleGlobalMouseMove);
            window.removeEventListener('mouseup', handleGlobalMouseUp);
        };
    }, [interactionMode, dragStart, currentMousePos, selectedKeyframeIds, keyframes, displayLayers, onSeek, onSelectKeyframes, onMoveKeyframes, onDragKeyframeDuration, initialDragState]);

    const dragDeltaFrames = interactionMode.startsWith('drag') || interactionMode === 'resize-keyframe'
        ? Math.round((currentMousePos.x - dragStart.x) / PIXELS_PER_FRAME)
        : 0;

    const dragDeltaLayers = interactionMode === 'drag-keyframe'
        ? Math.round((currentMousePos.y - dragStart.y) / TRACK_HEIGHT)
        : 0;

    return (
        <div className="flex flex-col h-64 bg-[#1e1e1e] border-t border-neutral-700 select-none relative group">
            <div className="h-10 flex items-center px-4 border-b border-neutral-700 bg-[#252525] gap-2 z-30 relative">
                <button onClick={togglePlay} className="p-1 hover:bg-neutral-600 rounded text-white">
                    {isPlaying ? <Pause size={16} /> : <Play size={16} />}
                </button>
                <div className="w-px h-4 bg-neutral-600 mx-2" />
                <div className="text-xs text-neutral-400 font-mono">{currentFrame} / {totalFrames}</div>
                <div className="flex-1" />
                <div className="text-[10px] text-neutral-500">
                    Shift+Click to Multi-Select | Drag to Move | Drag Empty to Marquee
                </div>
            </div>

            <div className="flex flex-1 overflow-hidden relative">
                <div className="w-48 flex-shrink-0 bg-[#252525] border-r border-neutral-700 z-20 shadow-lg overflow-y-auto custom-scrollbar no-scrollbar"
                    style={{ paddingTop: '32px' }}>
                    {displayLayers.map(layer => (
                        <div
                            key={layer.id}
                            onClick={() => onSelectLayer(layer.id)}
                            className={`flex items-center px-3 border-b border-neutral-800 cursor-pointer ${activeLayerId === layer.id ? 'bg-[#3a3a3a] border-l-4 border-l-orange-500' : 'hover:bg-[#2a2a2a]'}`}
                            style={{ height: TRACK_HEIGHT }}
                        >
                            <span className={`text-xs ${activeLayerId === layer.id ? 'text-white font-bold' : 'text-neutral-400'}`}>{layer.name}</span>
                        </div>
                    ))}
                </div>

                <div
                    ref={scrollContainerRef}
                    className="flex-1 overflow-x-auto overflow-y-hidden relative bg-[#1e1e1e] custom-scrollbar cursor-default"
                    onMouseDown={handleContainerMouseDown}
                >
                    <div className="h-8 bg-[#252525] border-b border-neutral-700 min-w-max sticky top-0 z-10 flex pointer-events-none">
                        {Array.from({ length: Math.max(totalFrames + 50, 200) }).map((_, i) => (
                            <div key={i} className="flex-shrink-0 relative border-r border-neutral-700/50 h-full" style={{ width: PIXELS_PER_FRAME }}>
                                {i % 5 === 0 && <span className="absolute left-1 top-1 text-[9px] text-neutral-500">{i}</span>}
                            </div>
                        ))}
                    </div>

                    <div className="relative min-w-max">
                        <div
                            className="absolute top-0 bottom-0 w-px bg-red-500 z-30 pointer-events-none"
                            style={{ left: (currentFrame * PIXELS_PER_FRAME) + (PIXELS_PER_FRAME / 2) }}
                        >
                            <div className="w-3 h-3 bg-red-500 -ml-1.5 rotate-45 transform -mt-1.5 shadow-sm" />
                        </div>

                        {isRangeActive && (
                            <div className="absolute top-0 bottom-0 bg-white/5 pointer-events-none"
                                style={{
                                    left: rangeStart * PIXELS_PER_FRAME,
                                    width: (rangeEnd - rangeStart) * PIXELS_PER_FRAME
                                }}
                            />
                        )}

                        {interactionMode === 'marquee' && scrollContainerRef.current && (
                            <div
                                className="absolute bg-blue-500/20 border border-blue-400 z-50 pointer-events-none"
                                style={{
                                    left: Math.min(dragStart.x, currentMousePos.x) - scrollContainerRef.current.getBoundingClientRect().left + scrollContainerRef.current.scrollLeft,
                                    top: Math.min(dragStart.y, currentMousePos.y) - scrollContainerRef.current.getBoundingClientRect().top - 32, // Offset ruler
                                    width: Math.abs(currentMousePos.x - dragStart.x),
                                    height: Math.abs(currentMousePos.y - dragStart.y)
                                }}
                            />
                        )}

                        {displayLayers.map((layer, layerIndex) => {
                            const layerKeyframes = keyframes.filter(kf => kf.layerId === layer.id);

                            return (
                                <div key={layer.id} className="border-b border-neutral-800 relative bg-[#1e1e1e]/50" style={{ height: TRACK_HEIGHT }}>
                                    <div className="absolute inset-0 flex pointer-events-none opacity-10">
                                        {Array.from({ length: Math.ceil(3000 / PIXELS_PER_FRAME) }).map((_, i) => (
                                            <div key={i} className="border-r border-white w-full h-full" style={{ width: PIXELS_PER_FRAME, flexShrink: 0 }} />
                                        ))}
                                    </div>

                                    {layerKeyframes.map(kf => {
                                        const isSelected = selectedKeyframeIds.includes(kf.id);
                                        let displayStart = kf.startFrame;
                                        let displayDuration = kf.duration;

                                        if (isSelected && interactionMode === 'resize-keyframe' && initialDragState?.clickedKeyframe.id === kf.id) {
                                            displayDuration += dragDeltaFrames;
                                        }

                                        return (
                                            <div
                                                key={kf.id}
                                                className={`absolute top-1 bottom-1 rounded-sm overflow-hidden group select-none transition-colors border ${isSelected ? 'border-orange-400 bg-orange-500/20' : 'bg-[#4a4a4a] border-neutral-600 hover:bg-[#555]'}`}
                                                style={{
                                                    left: displayStart * PIXELS_PER_FRAME,
                                                    width: Math.max(PIXELS_PER_FRAME, displayDuration * PIXELS_PER_FRAME),
                                                    zIndex: isSelected ? 10 : 1,
                                                    opacity: (isSelected && interactionMode === 'drag-keyframe') ? 0.5 : 1
                                                }}
                                                onMouseDown={(e) => handleKeyframeMouseDown(e, kf)}
                                            >
                                                <div className="w-full h-full flex items-center justify-start overflow-hidden px-1 pointer-events-none">
                                                    {displayDuration * PIXELS_PER_FRAME > 20 && (
                                                        <div className="aspect-video h-full py-1">
                                                            <KeyframeThumbnail strokes={kf.strokes} width={60} height={40} />
                                                        </div>
                                                    )}
                                                </div>

                                                <div
                                                    className="absolute top-0 bottom-0 right-0 w-3 cursor-e-resize hover:bg-orange-500/50 flex items-center justify-center group-hover:bg-white/10 z-20"
                                                    onMouseDown={(e) => handleKeyframeMouseDown(e, kf, true)}
                                                >
                                                    <div className="w-0.5 h-3 bg-white/30 rounded-full" />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            );
                        })}

                        {interactionMode === 'drag-keyframe' && initialDragState && (
                            <div className="absolute inset-0 pointer-events-none z-50">
                                {initialDragState.keyframes.map(kf => {
                                    const origLayerIdx = displayLayers.findIndex(l => l.id === kf.layerId);
                                    if (origLayerIdx === -1) return null;

                                    const targetLayerIdx = origLayerIdx + dragDeltaLayers;
                                    const targetStart = kf.startFrame + dragDeltaFrames;

                                    if (targetLayerIdx < 0 || targetLayerIdx >= displayLayers.length) return null;

                                    return (
                                        <div
                                            key={`ghost-${kf.id}`}
                                            className="absolute border border-white/50 bg-blue-500/40 rounded-sm"
                                            style={{
                                                left: targetStart * PIXELS_PER_FRAME,
                                                top: targetLayerIdx * TRACK_HEIGHT,
                                                width: Math.max(PIXELS_PER_FRAME, kf.duration * PIXELS_PER_FRAME),
                                                height: TRACK_HEIGHT - 8,
                                                marginTop: 4
                                            }}
                                        />
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- EXPORT MODAL COMPONENT ---
const ExportModal = ({ isOpen, onClose, onExport, range, totalFrames }) => {
    const [mode, setMode] = useState('frame');
    const [prefix, setPrefix] = useState('bunny');
    const [startIndex, setStartIndex] = useState(1);
    const [scale, setScale] = useState(1);
    const [format, setFormat] = useState('png');
    const [bitrate, setBitrate] = useState(25);
    const [isExporting, setIsExporting] = useState(false);
    const [progress, setProgress] = useState(0);

    if (!isOpen) return null;

    const handleAction = async () => {
        setIsExporting(true);
        setProgress(0);
        await onExport({
            mode,
            prefix,
            startIndex: parseInt(startIndex),
            scale: parseFloat(scale),
            format,
            bitrate: bitrate * 1000000,
            setProgress
        });
        setIsExporting(false);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div className="bg-neutral-900 border border-neutral-700 rounded-lg w-[480px] shadow-2xl overflow-hidden">
                <div className="p-4 border-b border-neutral-700 flex justify-between items-center bg-neutral-800">
                    <h2 className="text-white font-bold flex items-center gap-2"><Download size={18} /> Export</h2>
                    <button onClick={onClose} className="text-neutral-400 hover:text-white"><X size={18} /></button>
                </div>
                <div className="p-6 flex flex-col gap-6">
                    <div className="grid grid-cols-3 gap-2">
                        <button onClick={() => setMode('frame')} className={`flex flex-col items-center gap-2 p-3 rounded border transition-all ${mode === 'frame' ? 'bg-orange-500/20 border-orange-500 text-orange-400' : 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:bg-neutral-750'}`}><FileImage size={24} /><span className="text-xs font-bold">Current Frame</span></button>
                        <button onClick={() => setMode('sequence')} className={`flex flex-col items-center gap-2 p-3 rounded border transition-all ${mode === 'sequence' ? 'bg-orange-500/20 border-orange-500 text-orange-400' : 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:bg-neutral-750'}`}><Images size={24} /><span className="text-xs font-bold">Image Sequence</span></button>
                        <button onClick={() => setMode('video')} className={`flex flex-col items-center gap-2 p-3 rounded border transition-all ${mode === 'video' ? 'bg-orange-500/20 border-orange-500 text-orange-400' : 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:bg-neutral-750'}`}><Film size={24} /><span className="text-xs font-bold">Video</span></button>
                    </div>
                    <div className="flex flex-col gap-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="flex flex-col gap-1.5"><label className="text-xs font-bold text-neutral-500 uppercase">File Prefix</label><input type="text" value={prefix} onChange={e => setPrefix(e.target.value)} className="bg-neutral-800 border border-neutral-600 rounded px-2 py-1.5 text-sm text-white focus:border-orange-500 outline-none" /></div>
                            {mode !== 'video' && mode !== 'frame' && (<div className="flex flex-col gap-1.5"><label className="text-xs font-bold text-neutral-500 uppercase">Start Index</label><input type="number" value={startIndex} onChange={e => setStartIndex(e.target.value)} className="bg-neutral-800 border border-neutral-600 rounded px-2 py-1.5 text-sm text-white focus:border-orange-500 outline-none" /></div>)}
                        </div>
                        {mode !== 'video' ? (<div className="grid grid-cols-2 gap-4"><div className="flex flex-col gap-1.5"><label className="text-xs font-bold text-neutral-500 uppercase">Scale / Res</label><select value={scale} onChange={e => setScale(e.target.value)} className="bg-neutral-800 border border-neutral-600 rounded px-2 py-1.5 text-sm text-white focus:border-orange-500 outline-none"><option value="0.25">25% (480x270)</option><option value="0.5">50% (960x540)</option><option value="1">100% (1920x1080)</option><option value="2">200% (4K)</option></select></div><div className="flex flex-col gap-1.5"><label className="text-xs font-bold text-neutral-500 uppercase">Format</label><select value={format} onChange={e => setFormat(e.target.value)} className="bg-neutral-800 border border-neutral-600 rounded px-2 py-1.5 text-sm text-white focus:border-orange-500 outline-none"><option value="png">PNG</option><option value="jpeg">JPEG</option></select></div></div>) : (<div className="grid grid-cols-2 gap-4"><div className="flex flex-col gap-1.5"><label className="text-xs font-bold text-neutral-500 uppercase">Bitrate</label><select value={bitrate} onChange={e => setBitrate(Number(e.target.value))} className="bg-neutral-800 border border-neutral-600 rounded px-2 py-1.5 text-sm text-white focus:border-orange-500 outline-none"><option value={5}>5 Mbps</option><option value={8}>8 Mbps</option><option value={25}>25 Mbps</option><option value={50}>50 Mbps</option></select></div></div>)}
                        <button onClick={handleAction} disabled={isExporting} className="w-full py-3 bg-orange-600 hover:bg-orange-500 text-white font-bold rounded flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">{isExporting ? `Exporting... ${progress}%` : 'Export Files'}</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default function App() {
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const annotationRef = useRef(null);
    const containerRef = useRef(null);
    const animationFrameRef = useRef(null);
    const drawingAnimationFrameRef = useRef(null);
    const cachedRectRef = useRef(null);
    const lastDrawPointRef = useRef(null);
    const cursorRef = useRef(null);
    const audioContextRef = useRef(null);
    const audioBufferRef = useRef(null);
    const audioSourceNodeRef = useRef(null);

    const frameCache = useRef(new Map());
    const clipboard = useRef(null);

    const keyframesRef = useRef([]);
    const [keyframes, setKeyframes] = useState([]);

    // NEW: SELECTION STATE
    const [selectedKeyframeIds, setSelectedKeyframeIds] = useState([]);

    const undoStack = useRef([]);
    const redoStack = useRef([]);

    const [isPlaying, setIsPlaying] = useState(false);
    const [currentFrame, setCurrentFrame] = useState(0);
    const [totalFrames, setTotalFrames] = useState(0);
    const [duration, setDuration] = useState(0);
    const [playbackSpeed, setPlaybackSpeed] = useState(1);
    const [volume, setVolume] = useState(1);
    const [isMuted, setIsMuted] = useState(false);
    const [isScrubbing, setIsScrubbing] = useState(false);
    const [isLooping, setIsLooping] = useState(true);
    const [autoDeleteEmpty, setAutoDeleteEmpty] = useState(true);
    const [smartFill, setSmartFill] = useState(false);

    const [rangeStart, setRangeStart] = useState(0);
    const [rangeEnd, setRangeEnd] = useState(0);
    const [isRangeActive, setIsRangeActive] = useState(false);
    const [isZoomedToRange, setIsZoomedToRange] = useState(false);

    const [viewTransform, setViewTransform] = useState({ k: 1, x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const lastPanPosition = useRef({ x: 0, y: 0 });

    const [isCaching, setIsCaching] = useState(false);
    const [cacheProgress, setCacheProgress] = useState(0);
    const [hasCached, setHasCached] = useState(false);

    const [selectedTool, setSelectedTool] = useState('brush');
    const [brushColor, setBrushColor] = useState('#e11d48');
    const [brushSize, setBrushSize] = useState(15);
    const [brushOpacity, setBrushOpacity] = useState(1);
    const [currentFont, setCurrentFont] = useState('sans-serif');

    const [activeText, setActiveText] = useState(null);

    const [isOnionSkin, setIsOnionSkin] = useState(false);
    const [onionFramesBefore, setOnionFramesBefore] = useState(2);
    const [onionFramesAfter, setOnionFramesAfter] = useState(2);

    const [isDrawing, setIsDrawing] = useState(false);
    const isDrawingRef = useRef(false);

    const [hasAnnotations, setHasAnnotations] = useState(false);
    const [renderScale, setRenderScale] = useState(1);

    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [isPanelOpen, setIsPanelOpen] = useState(true);
    const [isLayersPanelOpen, setIsLayersPanelOpen] = useState(false);
    const [videoSrc, setVideoSrc] = useState("https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4");

    const [layers, setLayers] = useState([{ id: 'layer-1', name: 'Layer 1', visible: true, locked: false, opacity: 1 }]);
    const [activeLayerId, setActiveLayerId] = useState('layer-1');

    const selectionRef = useRef({
        active: false,
        indices: [],
        originalStrokes: [],
        bounds: null,
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
        marqueeStart: null,
        marqueeCurrent: null,
        dragMode: null,
        dragStart: null,
        pendingStrokes: null
    });
    const [selectionActive, setSelectionActive] = useState(false);

    // --- HELPERS ---
    const timeToFrame = (time) => Math.floor(time * FPS);
    const frameToTime = (frame) => frame / FPS;
    const formatTimecode = (frame) => {
        const seconds = Math.floor(frame / FPS);
        const f = frame % FPS;
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}:${f.toString().padStart(2, '0')}`;
    };

    const updateKeyframes = (newKeyframes) => {
        keyframesRef.current = newKeyframes;
        setKeyframes([...newKeyframes]);
        setHasAnnotations(p => !p);
    };

    const getActiveKeyframe = (layerId, frame) => {
        return keyframesRef.current.find(k => k.layerId === layerId && frame >= k.startFrame && frame < k.startFrame + k.duration);
    };

    const getCurrentFrameStrokes = (layerId, frame) => {
        const kf = getActiveKeyframe(layerId, frame);
        return kf ? kf.strokes : [];
    }

    const hasStrokes = useCallback((frame) => {
        return layers.some(layer => {
            if (!layer.visible) return false;
            const kf = getActiveKeyframe(layer.id, frame);
            return kf && kf.strokes.length > 0;
        });
    }, [layers]);

    const saveUndoState = useCallback(() => {
        undoStack.current.push(JSON.stringify(keyframesRef.current));
        if (undoStack.current.length > 50) undoStack.current.shift();
        redoStack.current = [];
    }, []);

    const performUndo = useCallback(() => {
        if (undoStack.current.length === 0) return;
        redoStack.current.push(JSON.stringify(keyframesRef.current));
        const previousState = JSON.parse(undoStack.current.pop());
        updateKeyframes(previousState);
        selectionRef.current.active = false;
        selectionRef.current.pendingStrokes = null;
        setSelectionActive(false);
    }, []);

    const performRedo = useCallback(() => {
        if (redoStack.current.length === 0) return;
        undoStack.current.push(JSON.stringify(keyframesRef.current));
        const nextState = JSON.parse(redoStack.current.pop());
        updateKeyframes(nextState);
        selectionRef.current.active = false;
        setSelectionActive(false);
    }, []);

    // --- AUDIO ---
    const initAudio = () => {
        if (!audioContextRef.current) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            audioContextRef.current = new AudioContext();
        }
        if (audioContextRef.current.state === 'suspended') {
            audioContextRef.current.resume();
        }
    };

    const loadAudio = async (url) => {
        try {
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            if (audioContextRef.current) {
                const decodedAudio = await audioContextRef.current.decodeAudioData(arrayBuffer);
                audioBufferRef.current = decodedAudio;
            }
        } catch (e) {
            console.error("Audio Load Failed", e);
        }
    };

    const playScrubSound = useCallback((time) => {
        if (!audioBufferRef.current || !audioContextRef.current || isMuted) return;
        if (audioSourceNodeRef.current) {
            try { audioSourceNodeRef.current.stop(); } catch (e) { }
        }
        const source = audioContextRef.current.createBufferSource();
        source.buffer = audioBufferRef.current;
        const gainNode = audioContextRef.current.createGain();
        source.connect(gainNode);
        gainNode.connect(audioContextRef.current.destination);
        gainNode.gain.value = volume;
        const duration = 0.08;
        source.start(0, time);
        source.stop(audioContextRef.current.currentTime + duration);
        gainNode.gain.setValueAtTime(volume, audioContextRef.current.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioContextRef.current.currentTime + duration);
        audioSourceNodeRef.current = source;
    }, [volume, isMuted]);


    // --- RENDERING ---
    const drawStroke = useCallback((ctx, stroke, isGhost, colorOverride = null) => {
        if (stroke.type === 'text') {
            const fontSize = stroke.size;
            const fontFamily = stroke.fontFamily || 'sans-serif';
            ctx.font = `bold ${fontSize}px ${fontFamily}`;

            if (isGhost) {
                ctx.globalAlpha = ctx.globalAlpha * 0.5;
            }

            ctx.fillStyle = colorOverride || stroke.color;
            ctx.textBaseline = 'middle';

            if (stroke.points && stroke.points.length > 0) {
                ctx.fillText(stroke.text, stroke.points[0].x, stroke.points[0].y);
            }
            ctx.globalAlpha = 1.0;
            return;
        }

        ctx.beginPath();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = stroke.size;

        if (stroke.tool === 'eraser') {
            if (!isGhost) {
                ctx.globalCompositeOperation = 'destination-out';
                ctx.strokeStyle = 'rgba(0,0,0,1)';
            } else {
                return;
            }
        } else {
            ctx.globalCompositeOperation = 'source-over';
            const currentAlpha = ctx.globalAlpha;
            ctx.globalAlpha = (stroke.opacity || 1) * currentAlpha;
            ctx.strokeStyle = colorOverride || stroke.color;
        }

        if (stroke.points.length > 0) {
            ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
            for (let i = 1; i < stroke.points.length; i++) {
                ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
            }
        }
        ctx.stroke();

        ctx.globalAlpha = 1.0;
        ctx.globalCompositeOperation = 'source-over';
    }, []);

    const getTransformedPoint = (p, center, t) => {
        let x = center.x + (p.x - center.x) * t.scaleX;
        let y = center.y + (p.y - center.y) * t.scaleY;
        if (t.rotation !== 0) {
            const cos = Math.cos(t.rotation);
            const sin = Math.sin(t.rotation);
            const dx = x - center.x;
            const dy = y - center.y;
            x = center.x + (dx * cos - dy * sin);
            y = center.y + (dx * sin + dy * cos);
        }
        x += t.x;
        y += t.y;
        return { x, y };
    };

    const renderAnnotations = useCallback((frame, contextOverride = null, scale = 1) => {
        const canvas = annotationRef.current;
        if (!canvas && !contextOverride) return;
        const ctx = contextOverride || canvas.getContext('2d');
        const sel = selectionRef.current;

        if (!contextOverride) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        if (scale !== 1) { ctx.save(); ctx.scale(scale, scale); }

        if (isOnionSkin && !contextOverride) {
            const activeLayer = layers.find(l => l.id === activeLayerId);
            // Only onion skin the active layer for clarity
            if (activeLayer && activeLayer.visible) {
                for (let i = onionFramesBefore; i >= 1; i--) {
                    const checkFrame = frame - i;
                    const kf = getActiveKeyframe(activeLayer.id, checkFrame);
                    if (kf && checkFrame >= 0) {
                        const onionOpacity = 0.3 * (1 - (i / (onionFramesBefore + 1)));
                        kf.strokes.forEach(stroke => {
                            ctx.globalAlpha = onionOpacity;
                            drawStroke(ctx, stroke, true, '#ef4444');
                        });
                    }
                }
                for (let i = onionFramesAfter; i >= 1; i--) {
                    const checkFrame = frame + i;
                    const kf = getActiveKeyframe(activeLayer.id, checkFrame);
                    if (kf && checkFrame <= totalFrames) {
                        const onionOpacity = 0.3 * (1 - (i / (onionFramesAfter + 1)));
                        kf.strokes.forEach(stroke => {
                            ctx.globalAlpha = onionOpacity;
                            drawStroke(ctx, stroke, true, '#3b82f6');
                        });
                    }
                }
            }
            ctx.globalAlpha = 1.0;
        }

        layers.forEach(layer => {
            if (!layer.visible) return;

            const kf = getActiveKeyframe(layer.id, frame);
            let strokesToDraw = kf ? kf.strokes : [];

            // Handle pending slice/marquee preview
            if (sel.active && sel.pendingStrokes && frame === currentFrame && layer.id === activeLayerId) {
                strokesToDraw = sel.pendingStrokes;
            }

            ctx.globalAlpha = layer.opacity !== undefined ? layer.opacity : 1;

            strokesToDraw.forEach((stroke, index) => {
                const isSelected = !contextOverride && sel.active && sel.indices.includes(index) && layer.id === activeLayerId;

                if (isSelected) {
                    const originalStroke = sel.originalStrokes[sel.indices.indexOf(index)];
                    if (originalStroke) {
                        const t = sel.transform;
                        const center = { x: sel.bounds.cx, y: sel.bounds.cy };
                        const transformedPoints = originalStroke.points.map(p => getTransformedPoint(p, center, t));
                        const avgScale = (Math.abs(t.scaleX) + Math.abs(t.scaleY)) / 2;
                        const scaledSize = Math.max(1, originalStroke.size * avgScale);
                        drawStroke(ctx, { ...originalStroke, points: transformedPoints, size: scaledSize }, false, null);
                    } else {
                        drawStroke(ctx, stroke, false, null);
                    }
                } else {
                    drawStroke(ctx, stroke, false, null);
                }
            });
        });

        if (!contextOverride && sel.dragMode === 'marquee' && sel.marqueeStart && sel.marqueeCurrent) {
            const x = Math.min(sel.marqueeStart.x, sel.marqueeCurrent.x);
            const y = Math.min(sel.marqueeStart.y, sel.marqueeCurrent.y);
            const w = Math.abs(sel.marqueeCurrent.x - sel.marqueeStart.x);
            const h = Math.abs(sel.marqueeCurrent.y - sel.marqueeStart.y);
            ctx.save();
            ctx.setLineDash([5, 5]);
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.strokeRect(x, y, w, h);
            ctx.fillStyle = 'rgba(59, 130, 246, 0.1)';
            ctx.fillRect(x, y, w, h);
            ctx.restore();
        }

        if (!contextOverride && sel.active && sel.bounds && activeLayerId) {
            const t = sel.transform;
            const b = sel.bounds;
            const center = { x: b.cx, y: b.cy };

            const tl = getTransformedPoint({ x: b.x, y: b.y }, center, t);
            const tr = getTransformedPoint({ x: b.x + b.w, y: b.y }, center, t);
            const br = getTransformedPoint({ x: b.x + b.w, y: b.y + b.h }, center, t);
            const bl = getTransformedPoint({ x: b.x, y: b.y + b.h }, center, t);
            const tm = getTransformedPoint({ x: b.cx, y: b.y }, center, t);

            ctx.save();
            ctx.beginPath();
            ctx.moveTo(tl.x, tl.y);
            ctx.lineTo(tr.x, tr.y);
            ctx.lineTo(br.x, br.y);
            ctx.lineTo(bl.x, bl.y);
            ctx.closePath();

            ctx.strokeStyle = '#3b82f6';
            ctx.lineWidth = 2;
            ctx.stroke();

            const handles = [tl, tr, br, bl,
                getTransformedPoint({ x: b.cx, y: b.y }, center, t),
                getTransformedPoint({ x: b.x + b.w, y: b.cy }, center, t),
                getTransformedPoint({ x: b.cx, y: b.y + b.h }, center, t),
                getTransformedPoint({ x: b.x, y: b.cy }, center, t)
            ];

            ctx.fillStyle = '#fff';
            ctx.strokeStyle = '#3b82f6';
            ctx.lineWidth = 1;

            handles.forEach(p => {
                ctx.beginPath();
                ctx.rect(p.x - 6, p.y - 6, 12, 12);
                ctx.fill();
                ctx.stroke();
            });

            const rotHandle = getTransformedPoint({ x: b.cx, y: b.y - 40 }, center, t);
            ctx.beginPath();
            ctx.moveTo(tm.x, tm.y);
            ctx.lineTo(rotHandle.x, rotHandle.y);
            ctx.strokeStyle = '#3b82f6';
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(rotHandle.x, rotHandle.y, 6, 0, Math.PI * 2);
            ctx.fillStyle = '#fff';
            ctx.fill();
            ctx.stroke();

            ctx.restore();
        }

        if (scale !== 1) { ctx.restore(); }

    }, [isOnionSkin, onionFramesBefore, onionFramesAfter, drawStroke, totalFrames, layers, currentFrame, activeLayerId]);

    useEffect(() => {
        renderAnnotations(currentFrame);
    }, [isOnionSkin, onionFramesBefore, onionFramesAfter, currentFrame, renderAnnotations, selectionActive, hasAnnotations, activeText, layers]);

    // --- COORDINATES ---
    // OPTIMIZED: Accepts optional cached rect to avoid getBoundingClientRect thrashing
    const canvasWrapperRef = useRef(null);

    // --- COORDINATES ---
    // OPTIMIZED: Robust coordinate mapping using the wrapper's bounding box
    const getCanvasCoordinates = (e, cachedRect = null) => {
        const wrapper = canvasWrapperRef.current;
        if (!wrapper) return null;

        const rect = cachedRect || wrapper.getBoundingClientRect();

        // Map screen pixels to canvas pixels
        // (clientX - rect.left) gives distance in screen pixels from left edge
        // (1920 / rect.width) gives the ratio of canvas pixels to screen pixels

        const x = (e.clientX - rect.left) * (DRAWING_CANVAS_WIDTH / rect.width);
        const y = (e.clientY - rect.top) * (DRAWING_CANVAS_HEIGHT / rect.height);

        return { x, y };
    };

    useEffect(() => {
        const updateScale = () => {
            const container = containerRef.current;
            if (!container) return;
            const rect = container.getBoundingClientRect();
            const videoAspect = DRAWING_CANVAS_WIDTH / DRAWING_CANVAS_HEIGHT;
            const containerAspect = rect.width / rect.height;
            let baseRenderWidth;
            if (containerAspect > videoAspect) {
                baseRenderWidth = rect.height * videoAspect;
            } else {
                baseRenderWidth = rect.width;
            }
            const currentScale = (baseRenderWidth / DRAWING_CANVAS_WIDTH) * viewTransform.k;
            setRenderScale(currentScale);
        };
        updateScale();
        window.addEventListener('resize', updateScale);
        return () => window.removeEventListener('resize', updateScale);
    }, [viewTransform.k]);

    // --- MOUSE HANDLERS ---
    const handleMouseDown = (e) => {
        // 1. Cache the rect immediately on interaction start
        if (canvasWrapperRef.current) {
            cachedRectRef.current = canvasWrapperRef.current.getBoundingClientRect();
        }

        const coords = getCanvasCoordinates(e, cachedRectRef.current);
        if (!coords) return;

        if (selectedTool === 'hand' || e.button === 1 || e.getModifierState('Space')) {
            setIsPanning(true);
            lastPanPosition.current = { x: e.clientX, y: e.clientY };
            return;
        }

        if (activeText) {
            confirmText();
            return;
        }

        const sel = selectionRef.current;

        // --- TEXT TOOL START ---
        if (selectedTool === 'text') {
            if (activeText) { confirmText(); return; }

            const activeLayer = layers.find(l => l.id === activeLayerId);
            if (activeLayer && (activeLayer.locked || !activeLayer.visible)) return;

            // Hit test for existing text
            const currentStrokes = getCurrentFrameStrokes(activeLayerId, currentFrame);

            for (let i = currentStrokes.length - 1; i >= 0; i--) {
                const stroke = currentStrokes[i];
                if (stroke.type === 'text') {
                    const b = getStrokesBounds([stroke]);
                    const padding = 10;
                    if (b && coords.x >= b.x - padding && coords.x <= b.x + b.w + padding && coords.y >= b.y - padding && coords.y <= b.y + b.h + padding) {

                        saveUndoState();
                        const activeKf = getActiveKeyframe(activeLayerId, currentFrame);
                        activeKf.strokes.splice(i, 1);
                        updateKeyframes([...keyframesRef.current]);

                        setBrushColor(stroke.color);
                        setBrushSize(Math.max(1, Math.floor(stroke.size / 2)));
                        setCurrentFont(stroke.fontFamily || 'sans-serif');

                        setIsPlaying(false);
                        setActiveText({
                            x: stroke.points[0].x,
                            y: stroke.points[0].y,
                            val: stroke.text,
                            layerId: activeLayerId
                        });

                        renderAnnotations(currentFrame);
                        setHasAnnotations(p => !p);
                        return;
                    }
                }
            }

            setIsPlaying(false);
            setActiveText({ x: coords.x, y: coords.y, val: '', layerId: activeLayerId });
            return;
        }

        if (selectedTool === 'select' || selectedTool === 'pointer') {
            if (sel.active && sel.bounds) {
                const t = sel.transform;
                const b = sel.bounds;
                const center = { x: b.cx, y: b.cy };

                const handles = {
                    'rotate': getTransformedPoint({ x: b.cx, y: b.y - 40 }, center, t),
                    'scale_tl': getTransformedPoint({ x: b.x, y: b.y }, center, t),
                    'scale_tr': getTransformedPoint({ x: b.x + b.w, y: b.y }, center, t),
                    'scale_br': getTransformedPoint({ x: b.x + b.w, y: b.y + b.h }, center, t),
                    'scale_bl': getTransformedPoint({ x: b.x, y: b.y + b.h }, center, t),
                    'scale_t': getTransformedPoint({ x: b.cx, y: b.y }, center, t),
                    'scale_r': getTransformedPoint({ x: b.x + b.w, y: b.cy }, center, t),
                    'scale_b': getTransformedPoint({ x: b.cx, y: b.y + b.h }, center, t),
                    'scale_l': getTransformedPoint({ x: b.x, y: b.cy }, center, t),
                };

                const hitDist = 20 / viewTransform.k;

                for (const [mode, p] of Object.entries(handles)) {
                    if (Math.hypot(p.x - coords.x, p.y - coords.y) < hitDist) {
                        if (sel.pendingStrokes) {
                            const activeKf = getActiveKeyframe(activeLayerId, currentFrame);
                            if (activeKf) activeKf.strokes = sel.pendingStrokes;
                            saveUndoState();
                            sel.pendingStrokes = null;
                        } else {
                            saveUndoState();
                        }
                        sel.dragMode = mode;
                        sel.dragStart = coords;
                        return;
                    }
                }

                const poly = [handles.scale_tl, handles.scale_tr, handles.scale_br, handles.scale_bl];
                if (pointInPoly(coords, poly)) {
                    if (sel.pendingStrokes) {
                        const activeKf = getActiveKeyframe(activeLayerId, currentFrame);
                        if (activeKf) activeKf.strokes = sel.pendingStrokes;
                        saveUndoState();
                        sel.pendingStrokes = null;
                    } else {
                        saveUndoState();
                    }
                    sel.dragMode = 'move';
                    sel.dragStart = coords;
                    return;
                }
            }

            if (selectedTool === 'pointer' || selectedTool === 'select') {
                const currentStrokes = getCurrentFrameStrokes(activeLayerId, currentFrame);
                for (let i = currentStrokes.length - 1; i >= 0; i--) {
                    const stroke = currentStrokes[i];
                    if (isPointInStroke(coords, stroke)) {
                        sel.active = true;
                        sel.indices = [i];
                        sel.originalStrokes = JSON.parse(JSON.stringify([stroke]));
                        sel.bounds = getStrokesBounds(sel.originalStrokes);
                        sel.transform = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 };
                        setSelectionActive(true);
                        sel.pendingStrokes = null;
                        renderAnnotations(currentFrame);
                        return;
                    }
                }
            }

            sel.active = false;
            sel.indices = [];
            sel.bounds = null;
            sel.dragMode = 'marquee';
            sel.marqueeStart = coords;
            sel.marqueeCurrent = coords;
            sel.transform = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 };
            setSelectionActive(false);
            renderAnnotations(currentFrame);
            return;
        }

        startDrawing(e);
    };

    const handleMouseMove = (e) => {
        // --- CRITICAL OPTIMIZATION: DIRECT DOM MANIPULATION FOR CURSOR ---
        // Update cursor position directly without React State
        if (cursorRef.current && selectedTool !== 'hand' && selectedTool !== 'select' && selectedTool !== 'text' && selectedTool !== 'pointer' && !isPanning) {
            cursorRef.current.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0) translate(-50%, -50%)`;
            cursorRef.current.style.display = 'block';
        } else if (cursorRef.current) {
            cursorRef.current.style.display = 'none';
        }

        if (isPanning) {
            const dx = e.clientX - lastPanPosition.current.x;
            const dy = e.clientY - lastPanPosition.current.y;
            setViewTransform(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
            lastPanPosition.current = { x: e.clientX, y: e.clientY };
            return;
        }

        const sel = selectionRef.current;
        // Pass cached rect to avoid reflows
        if (sel.dragMode === 'marquee') {
            const coords = getCanvasCoordinates(e, cachedRectRef.current);
            if (!coords) return;
            sel.marqueeCurrent = coords;

            if (!drawingAnimationFrameRef.current) {
                drawingAnimationFrameRef.current = requestAnimationFrame(() => {
                    renderAnnotations(currentFrame);
                    drawingAnimationFrameRef.current = null;
                });
            }
            return;
        }

        if (sel.dragMode && sel.active) {
            const coords = getCanvasCoordinates(e, cachedRectRef.current);
            if (!coords) return;
            const dx = coords.x - sel.dragStart.x;
            const dy = coords.y - sel.dragStart.y;
            const b = sel.bounds;

            if (sel.dragMode === 'move') {
                sel.transform.x += dx;
                sel.transform.y += dy;
            } else if (sel.dragMode === 'rotate') {
                const cx = b.cx + sel.transform.x;
                const cy = b.cy + sel.transform.y;
                const angleStart = Math.atan2(sel.dragStart.y - cy, sel.dragStart.x - cx);
                const angleNow = Math.atan2(coords.y - cy, coords.x - cx);
                sel.transform.rotation += (angleNow - angleStart);
            } else if (sel.dragMode.startsWith('scale')) {
                const isRight = sel.dragMode.includes('r');
                const isLeft = sel.dragMode.includes('l');
                const isBottom = sel.dragMode.includes('b');
                const isTop = sel.dragMode.includes('t');

                if (isRight) sel.transform.scaleX += (dx / b.w);
                if (isLeft) sel.transform.scaleX -= (dx / b.w);
                if (isBottom) sel.transform.scaleY += (dy / b.h);
                if (isTop) sel.transform.scaleY -= (dy / b.h);
            }

            sel.dragStart = coords;
            if (!drawingAnimationFrameRef.current) {
                drawingAnimationFrameRef.current = requestAnimationFrame(() => {
                    renderAnnotations(currentFrame);
                    drawingAnimationFrameRef.current = null;
                });
            }
            return;
        }

        draw(e);
    };

    const handleMouseUp = () => {
        cachedRectRef.current = null;
        if (isPanning) { setIsPanning(false); return; }

        const sel = selectionRef.current;

        if (sel.dragMode === 'marquee') {
            const minX = Math.min(sel.marqueeStart.x, sel.marqueeCurrent.x);
            const maxX = Math.max(sel.marqueeStart.x, sel.marqueeCurrent.x);
            const minY = Math.min(sel.marqueeStart.y, sel.marqueeCurrent.y);
            const maxY = Math.max(sel.marqueeStart.y, sel.marqueeCurrent.y);
            const box = { minX, maxX, minY, maxY };

            const currentStrokes = getCurrentFrameStrokes(activeLayerId, currentFrame);
            const nextStrokes = [];
            const nextIndices = [];

            currentStrokes.forEach((stroke) => {
                const b = getStrokesBounds([stroke]);
                if (!b) return;

                if (b.x > maxX || b.x + b.w < minX || b.y > maxY || b.y + b.h < minY) {
                    nextStrokes.push(stroke);
                    return;
                }

                if (b.x >= minX && b.x + b.w <= maxX && b.y >= minY && b.y + b.h <= maxY) {
                    nextStrokes.push(stroke);
                    nextIndices.push(nextStrokes.length - 1);
                    return;
                }

                if (stroke.type === 'text') {
                    if (stroke.points[0].x >= minX && stroke.points[0].x <= maxX && stroke.points[0].y >= minY && stroke.points[0].y <= maxY) {
                        nextStrokes.push(stroke);
                        nextIndices.push(nextStrokes.length - 1);
                    } else {
                        nextStrokes.push(stroke);
                    }
                    return;
                }

                let currentPoints = [];
                let currentIsInside = null;

                for (let i = 0; i < stroke.points.length; i++) {
                    const p = stroke.points[i];
                    const isInside = p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY;
                    if (i === 0) {
                        currentIsInside = isInside;
                        currentPoints.push(p);
                    } else {
                        const prevP = stroke.points[i - 1];
                        if (isInside === currentIsInside) {
                            currentPoints.push(p);
                        } else {
                            const hit = getBoxIntersection(prevP, p, box);
                            const cutPoint = hit || { x: (prevP.x + p.x) / 2, y: (prevP.y + p.y) / 2 };
                            currentPoints.push(cutPoint);
                            if (currentPoints.length > 0) {
                                nextStrokes.push({ ...stroke, points: currentPoints });
                                if (currentIsInside) nextIndices.push(nextStrokes.length - 1);
                            }
                            currentPoints = [cutPoint, p];
                            currentIsInside = isInside;
                        }
                    }
                }
                if (currentPoints.length > 0) {
                    nextStrokes.push({ ...stroke, points: currentPoints });
                    if (currentIsInside) nextIndices.push(nextStrokes.length - 1);
                }
            });

            if (nextIndices.length > 0) {
                sel.active = true;
                sel.indices = nextIndices;
                sel.originalStrokes = JSON.parse(JSON.stringify(nextIndices.map(i => nextStrokes[i])));
                sel.bounds = getStrokesBounds(sel.originalStrokes);
                setSelectionActive(true);
                sel.pendingStrokes = nextStrokes;
            } else {
                sel.active = false;
                setSelectionActive(false);
                sel.pendingStrokes = null;
            }
            sel.dragMode = null;
            renderAnnotations(currentFrame);
            return;
        }

        if (sel.dragMode && sel.active) {
            const currentKf = getActiveKeyframe(activeLayerId, currentFrame);
            if (currentKf) {
                const currentStrokes = currentKf.strokes;
                const t = sel.transform;
                const center = { x: sel.bounds.cx, y: sel.bounds.cy };
                const avgScale = (Math.abs(t.scaleX) + Math.abs(t.scaleY)) / 2;

                sel.indices.forEach((strokeIndex, i) => {
                    const original = sel.originalStrokes[i];
                    const transformedPoints = original.points.map(p => getTransformedPoint(p, center, t));
                    if (currentStrokes[strokeIndex]) {
                        currentStrokes[strokeIndex].points = transformedPoints;
                        currentStrokes[strokeIndex].size = Math.max(1, original.size * avgScale);
                    }
                });

                const newSelected = sel.indices.map(i => currentStrokes[i]);
                sel.originalStrokes = JSON.parse(JSON.stringify(newSelected));
                sel.bounds = getStrokesBounds(newSelected);
                sel.transform = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 };
            }
            sel.dragMode = null;
            renderAnnotations(currentFrame);
            return;
        }

        stopDrawing();
    };

    const handleViewportWheel = (e) => {
        e.preventDefault();
        const container = containerRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const worldX = (mouseX - viewTransform.x) / viewTransform.k;
        const worldY = (mouseY - viewTransform.y) / viewTransform.k;
        const zoomSensitivity = 0.001;
        const delta = -e.deltaY * zoomSensitivity;
        const newScale = Math.max(0.1, Math.min(10, viewTransform.k * (1 + delta)));
        const newX = mouseX - worldX * newScale;
        const newY = mouseY - worldY * newScale;
        setViewTransform({ k: newScale, x: newX, y: newY });
    };

    // --- DRAWING STATE ---
    const startDrawing = (e) => {
        if (isPlaying) setIsPlaying(false);
        const activeLayer = layers.find(l => l.id === activeLayerId);
        if (!activeLayer || !activeLayer.visible || activeLayer.locked) return;

        // REMOVED: saveUndoState() from here to prevent lag on mousedown
        const coords = getCanvasCoordinates(e, cachedRectRef.current);
        if (!coords) return;

        lastDrawPointRef.current = coords;

        // STATE UPDATE REMOVED: setIsDrawing(true); caused re-render
        isDrawingRef.current = true;

        const newStroke = {
            tool: selectedTool,
            color: brushColor,
            size: brushSize,
            opacity: brushOpacity,
            points: [{ x: coords.x, y: coords.y }],
            layerId: activeLayerId
        };

        let activeKeyframe = getActiveKeyframe(activeLayerId, currentFrame);
        if (!activeKeyframe) {
            // SMART FILL LOGIC
            let duration = 1;
            if (smartFill) {
                const layerKeyframes = keyframesRef.current.filter(k => k.layerId === activeLayerId).sort((a, b) => a.startFrame - b.startFrame);
                const nextKf = layerKeyframes.find(k => k.startFrame > currentFrame);
                const limit = nextKf ? nextKf.startFrame : totalFrames;
                duration = Math.max(1, limit - currentFrame);
            }

            activeKeyframe = {
                id: `kf-${Date.now()}`,
                layerId: activeLayerId,
                startFrame: currentFrame,
                duration: duration,
                strokes: []
            };
            // OPTIMIZATION: Push to ref only, defer state update to stopDrawing
            keyframesRef.current.push(activeKeyframe);
        }

        activeKeyframe.strokes.push(newStroke);

        // OPTIMIZATION: Draw only the initial point instead of full renderAnnotations
        const ctx = annotationRef.current.getContext('2d');
        ctx.save();
        ctx.fillStyle = brushColor;
        if (selectedTool === 'eraser') {
            ctx.globalCompositeOperation = 'destination-out';
        } else {
            ctx.globalAlpha = brushOpacity;
        }
        // Draw a single dot for the start
        ctx.beginPath();
        ctx.arc(coords.x, coords.y, brushSize / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    };

    const draw = (e) => {
        if (!isDrawingRef.current) return;
        const coords = getCanvasCoordinates(e, cachedRectRef.current);
        if (!coords) return;

        const activeKeyframe = getActiveKeyframe(activeLayerId, currentFrame);
        if (activeKeyframe && activeKeyframe.strokes.length > 0) {
            const activeStroke = activeKeyframe.strokes[activeKeyframe.strokes.length - 1];
            activeStroke.points.push({ x: coords.x, y: coords.y });

            const ctx = annotationRef.current.getContext('2d');
            ctx.save();
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.lineWidth = activeStroke.size;

            if (activeStroke.tool === 'eraser') {
                ctx.globalCompositeOperation = 'destination-out';
                ctx.strokeStyle = 'rgba(0,0,0,1)';
            } else {
                ctx.globalCompositeOperation = 'source-over';
                ctx.strokeStyle = activeStroke.color;
                ctx.globalAlpha = activeStroke.opacity || 1;
            }

            if (lastDrawPointRef.current) {
                ctx.beginPath();
                ctx.moveTo(lastDrawPointRef.current.x, lastDrawPointRef.current.y);
                ctx.lineTo(coords.x, coords.y);
                ctx.stroke();
            }

            ctx.restore();
            lastDrawPointRef.current = coords;
        }
    };

    const stopDrawing = () => {
        const currentKeyframes = keyframesRef.current;
        const activeKf = getActiveKeyframe(activeLayerId, currentFrame);

        if (activeKf && activeKf.strokes.length > 0) {
            const undoState = currentKeyframes.map(kf => {
                if (kf.id === activeKf.id) {
                    return { ...kf, strokes: kf.strokes.slice(0, -1) };
                }
                return kf;
            });
            undoStack.current.push(JSON.stringify(undoState));
            if (undoStack.current.length > 50) undoStack.current.shift();
            redoStack.current = [];
        }

        if (activeKf && activeKf.strokes.length === 0 && autoDeleteEmpty) {
            const idx = keyframesRef.current.findIndex(k => k.id === activeKf.id);
            if (idx !== -1) keyframesRef.current.splice(idx, 1);
        }

        isDrawingRef.current = false;
        lastDrawPointRef.current = null;

        renderAnnotations(currentFrame);
        setKeyframes([...keyframesRef.current]);
        setHasAnnotations(prev => !prev);
    };

    const confirmText = () => {
        if (!activeText || !activeText.val.trim()) {
            setActiveText(null);
            return;
        }

        saveUndoState();
        const newTextStroke = {
            type: 'text',
            tool: 'text',
            text: activeText.val,
            color: brushColor,
            size: brushSize * 2,
            fontFamily: currentFont,
            points: [{ x: activeText.x, y: activeText.y }],
            layerId: activeText.layerId || activeLayerId
        };

        let activeKeyframe = getActiveKeyframe(activeLayerId, currentFrame);
        if (!activeKeyframe) {
            let duration = 1;
            if (smartFill) {
                const layerKeyframes = keyframesRef.current.filter(k => k.layerId === activeLayerId).sort((a, b) => a.startFrame - b.startFrame);
                const nextKf = layerKeyframes.find(k => k.startFrame > currentFrame);
                const limit = nextKf ? nextKf.startFrame : totalFrames;
                duration = Math.max(1, limit - currentFrame);
            }
            activeKeyframe = {
                id: `kf-${Date.now()}`,
                layerId: activeLayerId,
                startFrame: currentFrame,
                duration: duration,
                strokes: []
            };
            keyframesRef.current.push(activeKeyframe);
        }

        activeKeyframe.strokes.push(newTextStroke);
        setActiveText(null);
        renderAnnotations(currentFrame);
        setKeyframes([...keyframesRef.current]);
        setHasAnnotations(prev => !prev);
    };

    const handleTextKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            confirmText();
        }
        if (e.key === 'Escape') {
            setActiveText(null);
        }
        e.stopPropagation();
    };

    const clearCurrentFrame = () => {
        saveUndoState();
        const sel = selectionRef.current;
        if (sel.active && sel.indices.length > 0) {
            const kf = getActiveKeyframe(activeLayerId, currentFrame);
            if (kf) {
                kf.strokes = kf.strokes.filter((_, index) => !sel.indices.includes(index));
                if (kf.strokes.length === 0 && autoDeleteEmpty) {
                    updateKeyframes(keyframesRef.current.filter(k => k.id !== kf.id));
                } else {
                    updateKeyframes([...keyframesRef.current]);
                }
            }
        } else {
            const kf = getActiveKeyframe(activeLayerId, currentFrame);
            if (kf) {
                if (kf.startFrame === currentFrame || autoDeleteEmpty) {
                    updateKeyframes(keyframesRef.current.filter(k => k.id !== kf.id));
                } else {
                    kf.strokes = [];
                    updateKeyframes([...keyframesRef.current]);
                }
            }
        }
        sel.active = false;
        sel.indices = [];
        sel.bounds = null;
        sel.transform = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 };
        setSelectionActive(false);
        renderAnnotations(currentFrame);
        setHasAnnotations(prev => !prev);
    };

    const copyToNextFrame = () => {
        const sel = selectionRef.current;
        const currentKf = getActiveKeyframe(activeLayerId, currentFrame);
        const nextFrame = currentFrame + 1;
        if (nextFrame >= totalFrames) return;

        saveUndoState();

        if (sel.active && sel.indices.length > 0) {
            const strokesToClone = currentKf.strokes.filter((_, i) => sel.indices.includes(i));
            const clonedStrokes = JSON.parse(JSON.stringify(strokesToClone));
            let nextKf = getActiveKeyframe(activeLayerId, nextFrame);
            if (!nextKf) {
                nextKf = {
                    id: `kf-${Date.now()}`,
                    layerId: activeLayerId,
                    startFrame: nextFrame,
                    duration: 1,
                    strokes: []
                };
                keyframesRef.current.push(nextKf);
            }
            const offset = nextKf.strokes.length;
            nextKf.strokes.push(...clonedStrokes);
            sel.indices = clonedStrokes.map((_, i) => offset + i);
            sel.originalStrokes = JSON.parse(JSON.stringify(clonedStrokes));
            sel.bounds = getStrokesBounds(sel.originalStrokes);
            updateKeyframes([...keyframesRef.current]);
            seekToFrame(nextFrame, true);
        } else if (currentKf) {
            let nextKf = getActiveKeyframe(activeLayerId, nextFrame);
            if (!nextKf) {
                nextKf = {
                    id: `kf-${Date.now()}`,
                    layerId: activeLayerId,
                    startFrame: nextFrame,
                    duration: 1,
                    strokes: []
                };
                keyframesRef.current.push(nextKf);
            }
            nextKf.strokes = [...nextKf.strokes, ...JSON.parse(JSON.stringify(currentKf.strokes))];
            seekToFrame(nextFrame);
        }
        setHasAnnotations(prev => !prev);
    };

    const copyFromPrevFrame = () => {
        const prevFrame = currentFrame - 1;
        if (prevFrame < 0) return;
        const prevKf = getActiveKeyframe(activeLayerId, prevFrame);
        if (!prevKf) return;

        saveUndoState();
        let currentKf = getActiveKeyframe(activeLayerId, currentFrame);
        if (!currentKf) {
            currentKf = {
                id: `kf-${Date.now()}`,
                layerId: activeLayerId,
                startFrame: currentFrame,
                duration: 1,
                strokes: []
            };
            keyframesRef.current.push(currentKf);
        }
        currentKf.strokes = [...currentKf.strokes, ...JSON.parse(JSON.stringify(prevKf.strokes))];
        updateKeyframes([...keyframesRef.current]);
        renderAnnotations(currentFrame);
        setHasAnnotations(prev => !prev);
    };

    const handleCopy = () => {
        const sel = selectionRef.current;
        if (sel.active && sel.indices.length > 0) {
            const kf = getActiveKeyframe(activeLayerId, currentFrame);
            if (kf) {
                const strokesToCopy = kf.strokes.filter((_, i) => sel.indices.includes(i));
                clipboardRef.current = JSON.parse(JSON.stringify(strokesToCopy));
            }
        }
    };

    const handlePaste = () => {
        if (!clipboardRef.current || clipboardRef.current.length === 0) return;
        saveUndoState();

        let kf = getActiveKeyframe(activeLayerId, currentFrame);
        if (!kf) {
            kf = {
                id: `kf-${Date.now()}`,
                layerId: activeLayerId,
                startFrame: currentFrame,
                duration: 1,
                strokes: []
            };
            keyframesRef.current.push(kf);
        }

        const pastedStrokes = JSON.parse(JSON.stringify(clipboardRef.current));
        pastedStrokes.forEach(s => {
            s.points.forEach(p => { p.x += 10; p.y += 10; });
        });

        const startIndex = kf.strokes.length;
        kf.strokes.push(...pastedStrokes);

        const sel = selectionRef.current;
        sel.active = true;
        sel.indices = pastedStrokes.map((_, i) => startIndex + i);
        sel.originalStrokes = JSON.parse(JSON.stringify(pastedStrokes));
        sel.bounds = getStrokesBounds(sel.originalStrokes);
        sel.transform = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 };
        setSelectionActive(true);

        updateKeyframes([...keyframesRef.current]);
        renderAnnotations(currentFrame);
        setHasAnnotations(prev => !prev);
    };

    const handleColorChange = (c) => setBrushColor(c);
    const handleSizeChange = (s) => setBrushSize(parseInt(s));
    const handleFontChange = (f) => setCurrentFont(f);

    const moveKeyframe = (direction) => {
        const targetFrame = currentFrame + direction;
        if (targetFrame < 0 || targetFrame >= totalFrames) return;

        const currentKf = getActiveKeyframe(activeLayerId, currentFrame);
        if (!currentKf) return;

        saveUndoState();

        const sel = selectionRef.current;
        if (sel.active && sel.indices.length > 0) {
            const strokesToMove = currentKf.strokes.filter((_, i) => sel.indices.includes(i));
            currentKf.strokes = currentKf.strokes.filter((_, i) => !sel.indices.includes(i));

            let targetKf = getActiveKeyframe(activeLayerId, targetFrame);
            if (!targetKf) {
                targetKf = {
                    id: `kf-${Date.now()}`,
                    layerId: activeLayerId,
                    startFrame: targetFrame,
                    duration: 1,
                    strokes: []
                };
                keyframesRef.current.push(targetKf);
            }

            const offset = targetKf.strokes.length;
            targetKf.strokes.push(...strokesToMove);
            sel.indices = strokesToMove.map((_, i) => offset + i);
            sel.originalStrokes = JSON.parse(JSON.stringify(strokesToMove));
            sel.bounds = getStrokesBounds(sel.originalStrokes);

            if (currentKf.strokes.length === 0 && autoDeleteEmpty) {
                const idx = keyframesRef.current.findIndex(k => k.id === currentKf.id);
                if (idx !== -1) keyframesRef.current.splice(idx, 1);
            }

            updateKeyframes([...keyframesRef.current]);
            seekToFrame(targetFrame, true);
        } else {
            currentKf.startFrame = targetFrame;
            updateKeyframes([...keyframesRef.current]);
            seekToFrame(targetFrame);
        }
    };

    const onDragKeyframe = (kfId, newDuration) => {
        const kf = keyframesRef.current.find(k => k.id === kfId);
        if (kf) {
            kf.duration = Math.max(1, newDuration);
            updateKeyframes([...keyframesRef.current]);
        }
    };

    const onMoveKeyframes = (kfIds, deltaFrames) => {
        const kfsToMove = keyframesRef.current.filter(k => kfIds.includes(k.id));
        kfsToMove.forEach(k => {
            k.startFrame = Math.max(0, k.startFrame + deltaFrames);
        });
        updateKeyframes([...keyframesRef.current]);
    };

    const addLayer = () => {
        const newLayer = { id: `layer-${Date.now()}`, name: `Layer ${layers.length + 1}`, visible: true, locked: false, opacity: 1 };
        setLayers([newLayer, ...layers]);
        setActiveLayerId(newLayer.id);
    };

    const deleteLayer = (id) => {
        if (layers.length <= 1) return;
        setLayers(layers.filter(l => l.id !== id));
        if (activeLayerId === id) setActiveLayerId(layers[0].id);
    };

    const toggleLayerVisible = (id) => {
        setLayers(layers.map(l => l.id === id ? { ...l, visible: !l.visible } : l));
    };

    const toggleLayerLock = (id) => {
        setLayers(layers.map(l => l.id === id ? { ...l, locked: !l.locked } : l));
    };

    const updateLayerName = (id, newName) => {
        setLayers(layers.map(l => l.id === id ? { ...l, name: newName } : l));
    };

    const updateLayerOpacity = (id, opacity) => {
        setLayers(layers.map(l => l.id === id ? { ...l, opacity: parseFloat(opacity) } : l));
    };

    const onLoadedMetadata = () => {
        if (videoRef.current) {
            setTotalFrames(Math.floor(videoRef.current.duration * 24));
        }
    };



    const seekToFrame = (targetFrame, keepSelection = false) => {
        const frame = Math.max(0, Math.min(targetFrame, totalFrames - 1));
        setCurrentFrame(frame);
        if (videoRef.current) {
            videoRef.current.currentTime = frameToTime(frame);
        }
        if (!keepSelection) {
            selectionRef.current.active = false;
            setSelectionActive(false);
        }
        renderAnnotations(frame);
    };

    const stepFrame = (dir) => {
        seekToFrame(currentFrame + dir);
    };

    const togglePlay = () => {
        if (videoRef.current) {
            if (isPlaying) {
                videoRef.current.pause();
                setIsPlaying(false);
            } else {
                videoRef.current.play();
                setIsPlaying(true);
            }
        }
    };

    useEffect(() => {
        if (isPlaying) {
            const loop = () => {
                if (!videoRef.current) return;
                const frame = Math.round(videoRef.current.currentTime * 24);
                if (frame !== currentFrame) {
                    setCurrentFrame(frame);
                    renderAnnotations(frame);
                }
                if (isRangeActive && frame >= rangeEnd) {
                    videoRef.current.currentTime = frameToTime(rangeStart);
                }
                animationFrameRef.current = requestAnimationFrame(loop);
            };
            animationFrameRef.current = requestAnimationFrame(loop);
        }
        return () => cancelAnimationFrame(animationFrameRef.current);
    }, [isPlaying, currentFrame, rangeStart, rangeEnd, isRangeActive]);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            if (e.code === 'Space') {
                e.preventDefault();
                if (!isDrawingRef.current && !isPanning) togglePlay();
            }
            if (e.code === 'ArrowRight') stepFrame(1);
            if (e.code === 'ArrowLeft') stepFrame(-1);
            if (e.key === 'Delete' || e.key === 'Backspace') {
                clearCurrentFrame();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isPlaying, currentFrame, isPanning]);

    const frameHasData = getActiveKeyframe(activeLayerId, currentFrame) !== undefined;

    // --- UI RENDER ---
    return (
        <div className="flex flex-col h-screen bg-neutral-950 text-neutral-300 font-sans overflow-hidden"
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
        >
            {/* --- CUSTOM CURSOR --- */}
            <div
                ref={cursorRef}
                className="fixed pointer-events-none z-[100] hidden border border-white rounded-full mix-blend-difference"
                style={{ width: brushSize, height: brushSize, transform: 'translate(-50%, -50%)', backgroundColor: 'rgba(255,255,255,0.2)' }}
            />
            {/* --- HEADER --- */}
            <div className="h-12 border-b border-neutral-800 bg-neutral-900 flex items-center px-4 justify-between shrink-0 z-50">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 text-white font-bold tracking-tight">
                        <Pencil size={18} className="text-blue-500" />
                        <span>Annotate</span>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <label className="cursor-pointer bg-neutral-800 hover:bg-neutral-700 text-xs px-3 py-1.5 rounded flex items-center gap-2 transition-colors">
                        <Film size={14} />
                        <span>Upload Video</span>
                        <input 
                            type="file" 
                            accept="video/*" 
                            className="hidden" 
                            onChange={(e) => {
                                const file = e.target.files[0];
                                if (file) {
                                    const url = URL.createObjectURL(file);
                                    setVideoSrc(url);
                                }
                            }}
                        />
                    </label>
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
                {/* --- LEFT TOOLBAR --- */}
                <div className="w-14 border-r border-neutral-800 bg-neutral-900 flex flex-col items-center py-4 gap-4 z-40 shrink-0">
                    <button onClick={() => setSelectedTool('pointer')} className={`p-2 rounded-lg transition-all ${selectedTool === 'pointer' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-neutral-400 hover:text-white hover:bg-neutral-800'}`} title="Pointer (V)">
                        <MousePointer2 size={20} />
                    </button>
                    <button onClick={() => setSelectedTool('brush')} className={`p-2 rounded-lg transition-all ${selectedTool === 'brush' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-neutral-400 hover:text-white hover:bg-neutral-800'}`} title="Brush (B)">
                        <Pencil size={20} />
                    </button>
                    <button onClick={() => setSelectedTool('eraser')} className={`p-2 rounded-lg transition-all ${selectedTool === 'eraser' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-neutral-400 hover:text-white hover:bg-neutral-800'}`} title="Eraser (E)">
                        <Eraser size={20} />
                    </button>
                    <button onClick={() => setSelectedTool('text')} className={`p-2 rounded-lg transition-all ${selectedTool === 'text' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-neutral-400 hover:text-white hover:bg-neutral-800'}`} title="Text (T)">
                        <Type size={20} />
                    </button>
                    <button onClick={() => setSelectedTool('select')} className={`p-2 rounded-lg transition-all ${selectedTool === 'select' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-neutral-400 hover:text-white hover:bg-neutral-800'}`} title="Select (S)">
                        <BoxSelect size={20} />
                    </button>
                    <button onClick={() => setSelectedTool('hand')} className={`p-2 rounded-lg transition-all ${selectedTool === 'hand' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-neutral-400 hover:text-white hover:bg-neutral-800'}`} title="Hand (H)">
                        <Hand size={20} />
                    </button>
                </div>

                {/* --- MAIN CANVAS AREA --- */}
                <div className="flex-1 relative bg-neutral-950 overflow-hidden flex items-center justify-center placeholder-checker" ref={containerRef} onWheel={handleViewportWheel} onMouseDown={handleMouseDown}>
                    {/* Video and Canvas Layers */}
                    <div
                        ref={canvasWrapperRef}
                        style={{
                            transform: `translate(${viewTransform.x}px, ${viewTransform.y}px) scale(${viewTransform.k})`,
                            transformOrigin: '0 0',
                            willChange: 'transform',
                            width: DRAWING_CANVAS_WIDTH,
                            height: DRAWING_CANVAS_HEIGHT,
                            position: 'relative',
                            boxShadow: '0 0 50px rgba(0,0,0,0.5)',
                            backgroundColor: '#000'
                        }}
                    >
                        <video
                            ref={videoRef}
                            src={videoSrc}
                            className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none"
                            crossOrigin="anonymous"
                            onLoadedMetadata={onLoadedMetadata}
                            style={{ display: 'block' }}
                        />
                        <canvas
                            ref={annotationRef}
                            className="absolute inset-0 w-full h-full pointer-events-none"
                            width={1920}
                            height={1080}
                        />
                        {/* Text Input Overlay */}
                        {activeText && (
                            <input
                                type="text"
                                value={activeText.val}
                                autoFocus
                                onChange={e => {
                                    setActiveText({ ...activeText, val: e.target.value });
                                    // Live preview?
                                }}
                                onKeyDown={handleTextKeyDown}
                                onBlur={confirmText}
                                style={{
                                    position: 'absolute',
                                    left: activeText.x,
                                    top: activeText.y,
                                    fontSize: `${brushSize * 2}px`,
                                    color: brushColor,
                                    fontFamily: currentFont,
                                    background: 'transparent',
                                    border: '1px dashed #4b5563',
                                    outline: 'none',
                                    padding: '2px 4px',
                                    transform: 'translate(0, -50%)',
                                    minWidth: '50px'
                                }}
                            />
                        )}
                        {/* Selection & Transform Overlay */}
                        {/* Selection & Transform Overlay - REMOVED (Handled by Canvas) */}
                    </div>
                </div>

                {/* --- RIGHT PANEL --- */}
                <div className="w-72 bg-neutral-900 border-l border-neutral-800 flex flex-col shrink-0 z-40 overflow-y-auto">
                    {/* Properties Panel content ... simplified for restoration */}
                    <div className="p-4 border-b border-neutral-800">
                        <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-widest mb-3">Properties</h3>

                        <div className="mb-4">
                            <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider block mb-2">Color</label>
                            <div className="flex flex-wrap gap-2">
                                {['#ffffff', '#000000', '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#d946ef', '#f43f5e'].map(c => (
                                    <button key={c} onClick={() => setBrushColor(c)} className={`w-6 h-6 rounded-full border border-neutral-700 ${brushColor === c ? 'ring-2 ring-blue-500' : ''}`} style={{ backgroundColor: c }} />
                                ))}
                                <input type="color" value={brushColor} onChange={e => setBrushColor(e.target.value)} className="w-6 h-6 p-0 border-0 rounded-full overflow-hidden" />
                            </div>
                        </div>

                        <div className="mb-4">
                            <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider block mb-2">Size</label>
                            <input type="range" min="1" max="100" value={brushSize} onChange={e => setBrushSize(parseInt(e.target.value))} className="w-full" />
                        </div>

                        <div className="mb-4">
                            <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-3 flex items-center gap-2"><Settings size={12} /> Timeline Behavior</h3>
                            <div className="flex flex-col gap-2">
                                <label className="flex items-center gap-2 text-xs text-neutral-400 cursor-pointer hover:text-white transition-colors">
                                    <input type="checkbox" checked={autoDeleteEmpty} onChange={e => setAutoDeleteEmpty(e.target.checked)} className="rounded border-neutral-700 bg-neutral-800 accent-blue-500" />
                                    <span>Auto-delete empty sections</span>
                                </label>
                                <label className="flex items-center gap-2 text-xs text-neutral-400 cursor-pointer hover:text-white transition-colors">
                                    <input type="checkbox" checked={smartFill} onChange={e => setSmartFill(e.target.checked)} className="rounded border-neutral-700 bg-neutral-800 accent-blue-500" />
                                    <span>Smart fill (Fill Empty Gaps)</span>
                                </label>
                            </div>
                        </div>
                    </div>

                    <div className="p-4 border-b border-neutral-800">
                        <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-widest mb-3">Keyframe Data</h3>
                        <div className="flex flex-col gap-2">
                            <button onClick={() => moveKeyframe(-1)} className="bg-neutral-800 p-2 rounded text-xs hover:bg-neutral-700">Move Prev</button>
                            <button onClick={() => moveKeyframe(1)} className="bg-neutral-800 p-2 rounded text-xs hover:bg-neutral-700">Move Next</button>
                            <button onClick={copyToNextFrame} className="bg-neutral-800 p-2 rounded text-xs hover:bg-neutral-700">Clone Next</button>
                            <button onClick={clearCurrentFrame} className="bg-red-900/20 text-red-500 p-2 rounded text-xs hover:bg-red-900/40">Clear/Delete</button>
                        </div>
                    </div>
                    <div className="p-4">
                        <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-widest mb-3">Layers</h3>
                        {layers.map(l => (
                            <div key={l.id} onClick={() => setActiveLayerId(l.id)} className={`p-2 mb-1 rounded cursor-pointer ${activeLayerId === l.id ? 'bg-neutral-800' : 'hover:bg-neutral-800/50'}`}>
                                <div className="text-sm">{l.name}</div>
                                <div className="text-xs text-neutral-500">Opacity: {l.opacity}</div>
                            </div>
                        ))}
                        <button onClick={addLayer} className="w-full mt-2 bg-neutral-800 hover:bg-neutral-700 text-xs py-1 rounded">Add Layer</button>
                    </div>
                </div>
            </div>

            {/* The Timeline component is already at the end of the file, we need to bridge to it */}



            {/* --- TIMELINE REPLACEMENT --- */}
            < Timeline
                layers={layers}
                activeLayerId={activeLayerId}
                keyframes={keyframes}
                currentFrame={currentFrame}
                totalFrames={totalFrames}
                onSeek={(f) => { setCurrentFrame(f); if (videoRef.current) videoRef.current.currentTime = frameToTime(f); }
                }
                onDragKeyframeDuration={onDragKeyframe}
                onMoveKeyframes={onMoveKeyframes}
                onSelectLayer={setActiveLayerId}
                rangeStart={rangeStart}
                rangeEnd={rangeEnd}
                isRangeActive={isRangeActive}
                togglePlay={togglePlay}
                isPlaying={isPlaying}
                selectedKeyframeIds={selectedKeyframeIds}
                onSelectKeyframes={setSelectedKeyframeIds}
            />
        </div >
    );
}