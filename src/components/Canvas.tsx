import React, { useRef, useEffect } from 'react';

export interface CanvasProps {
  annotationRef: React.RefObject<HTMLCanvasElement | null>;
  onMouseDown: (e: React.MouseEvent) => void;
  onMouseMove: (e: React.MouseEvent) => void;
  onMouseUp: (e: React.MouseEvent) => void;
  onMouseLeave: (e: React.MouseEvent) => void;
  selectedTool: string;
  isPanning: boolean;
}

const Canvas: React.FC<CanvasProps> = ({
  annotationRef,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onMouseLeave,
  selectedTool,
  isPanning,
}) => {
  const overlayRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const sync = () => {
      const ann = annotationRef.current;
      const ov = overlayRef.current;
      if (!ann || !ov) return;
      const rect = ann.getBoundingClientRect();
      if (ov.width !== rect.width || ov.height !== rect.height) {
        ov.width = Math.floor(rect.width);
        ov.height = Math.floor(rect.height);
      }
    };
    sync();
    const ro = new ResizeObserver(sync);
    if (annotationRef.current) ro.observe(annotationRef.current);
    return () => ro.disconnect();
  }, [annotationRef]);

  const getCursor = () => {
    if (isPanning) return 'grabbing';
    if (selectedTool === 'hand') return 'grab';
    if (selectedTool in ('select', 'pointer', 'text')) return 'default';
    return 'crosshair';
  };

  return (
    <canvas
      ref={overlayRef}
      className="absolute inset-0 w-full h-full"
      style={{ cursor: getCursor() }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseLeave}
    />
  );
};

export default Canvas;
