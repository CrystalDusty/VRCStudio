import { useState, useCallback, useRef } from 'react';
import { CanvasEditState, DEFAULT_EDIT_STATE } from '../utils/canvasFilters';

export type DrawingTool = 'none' | 'pen' | 'eraser' | 'line' | 'arrow' | 'text';

interface DrawingState {
  isDrawing: boolean;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  color: string;
  brushSize: number;
}

export function useCanvasEditor(canvasRef: React.RefObject<HTMLCanvasElement>) {
  const [editState, setEditState] = useState<CanvasEditState>(DEFAULT_EDIT_STATE);
  const [currentTool, setCurrentTool] = useState<DrawingTool>('none');
  const [drawingState, setDrawingState] = useState<DrawingState>({
    isDrawing: false,
    startX: 0,
    startY: 0,
    endX: 0,
    endY: 0,
    color: '#ffffff',
    brushSize: 3,
  });

  const undoStackRef = useRef<ImageData[]>([]);
  const redoStackRef = useRef<ImageData[]>([]);

  /**
   * Save current canvas state to undo stack
   */
  const saveToUndoStack = useCallback(() => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    const imageData = ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height);
    undoStackRef.current.push(imageData);
    // Limit undo history to 20 steps
    if (undoStackRef.current.length > 20) {
      undoStackRef.current.shift();
    }
    redoStackRef.current = [];
  }, [canvasRef]);

  /**
   * Undo last action
   */
  const undo = useCallback(() => {
    if (!canvasRef.current || undoStackRef.current.length === 0) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    // Save current state to redo stack
    const currentImageData = ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height);
    redoStackRef.current.push(currentImageData);

    // Restore previous state
    const previousImageData = undoStackRef.current.pop();
    if (previousImageData) {
      ctx.putImageData(previousImageData, 0, 0);
    }
  }, [canvasRef]);

  /**
   * Redo last undone action
   */
  const redo = useCallback(() => {
    if (!canvasRef.current || redoStackRef.current.length === 0) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    // Save current state to undo stack
    const currentImageData = ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height);
    undoStackRef.current.push(currentImageData);

    // Restore next state
    const nextImageData = redoStackRef.current.pop();
    if (nextImageData) {
      ctx.putImageData(nextImageData, 0, 0);
    }
  }, [canvasRef]);

  /**
   * Start drawing
   */
  const startDrawing = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (currentTool === 'none') return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    saveToUndoStack();
    setDrawingState(prev => ({
      ...prev,
      isDrawing: true,
      startX: x,
      startY: y,
      endX: x,
      endY: y,
    }));
  }, [currentTool, canvasRef, saveToUndoStack]);

  /**
   * Continue drawing
   */
  const continueDrawing = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawingState.isDrawing || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    setDrawingState(prev => ({
      ...prev,
      endX: x,
      endY: y,
    }));

    // Draw based on tool
    if (currentTool === 'pen') {
      ctx.strokeStyle = drawingState.color;
      ctx.lineWidth = drawingState.brushSize;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(drawingState.endX, drawingState.endY);
      ctx.lineTo(x, y);
      ctx.stroke();
    } else if (currentTool === 'eraser') {
      ctx.clearRect(x - drawingState.brushSize / 2, y - drawingState.brushSize / 2, drawingState.brushSize, drawingState.brushSize);
    }
  }, [drawingState, currentTool, canvasRef]);

  /**
   * Stop drawing
   */
  const stopDrawing = useCallback(() => {
    if (!drawingState.isDrawing || !canvasRef.current) return;

    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    // Draw line or arrow if needed
    if (currentTool === 'line') {
      ctx.strokeStyle = drawingState.color;
      ctx.lineWidth = drawingState.brushSize;
      ctx.beginPath();
      ctx.moveTo(drawingState.startX, drawingState.startY);
      ctx.lineTo(drawingState.endX, drawingState.endY);
      ctx.stroke();
    } else if (currentTool === 'arrow') {
      drawArrow(ctx, drawingState.startX, drawingState.startY, drawingState.endX, drawingState.endY, drawingState.color, drawingState.brushSize);
    }

    setDrawingState(prev => ({
      ...prev,
      isDrawing: false,
    }));
  }, [drawingState, currentTool, canvasRef]);

  /**
   * Clear canvas
   */
  const clear = useCallback(() => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    saveToUndoStack();
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
  }, [canvasRef, saveToUndoStack]);

  return {
    editState,
    setEditState,
    currentTool,
    setCurrentTool,
    drawingState,
    setDrawingState,
    startDrawing,
    continueDrawing,
    stopDrawing,
    undo,
    redo,
    clear,
    canUndo: undoStackRef.current.length > 0,
    canRedo: redoStackRef.current.length > 0,
  };
}

/**
 * Helper function to draw arrow
 */
function drawArrow(
  ctx: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  color: string,
  size: number
) {
  const headlen = 15;
  const angle = Math.atan2(toY - fromY, toX - fromX);

  ctx.strokeStyle = color;
  ctx.lineWidth = size;
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.stroke();

  // Draw arrowhead
  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(toX - headlen * Math.cos(angle - Math.PI / 6), toY - headlen * Math.sin(angle - Math.PI / 6));
  ctx.moveTo(toX, toY);
  ctx.lineTo(toX - headlen * Math.cos(angle + Math.PI / 6), toY - headlen * Math.sin(angle + Math.PI / 6));
  ctx.stroke();
}
