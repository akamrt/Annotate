import React, { useState, useRef, useEffect } from 'react';

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