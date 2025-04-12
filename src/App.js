import React, { useState, useRef, useEffect, useCallback } from "react";

const GRID_SIZE = 20;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;
const ZOOM_STEP = 0.1;
// 1 grid unit = 1cm at 100% zoom
const MM_PER_GRID = 10; // 1cm = 10mm

export default function App() {
  const [lines, setLines] = useState([]);
  const [currentPoint, setCurrentPoint] = useState(null);
  const [hoverPoint, setHoverPoint] = useState(null);
  const [selectedPoint, setSelectedPoint] = useState(null);
  const [snapPoint, setSnapPoint] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [currentLength, setCurrentLength] = useState(0);
  const [isUpdateMode, setIsUpdateMode] = useState(false);
  const [selectedLine, setSelectedLine] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState(null);
  const canvasRef = useRef(null);

  const drawGrid = useCallback((ctx) => {
    ctx.strokeStyle = "#ddd";
    const scaledGridSize = GRID_SIZE;
    const startX = Math.floor(-offset.x / zoom / scaledGridSize) * scaledGridSize;
    const startY = Math.floor(-offset.y / zoom / scaledGridSize) * scaledGridSize;
    const endX = Math.ceil((1200 - offset.x) / zoom / scaledGridSize) * scaledGridSize;
    const endY = Math.ceil((800 - offset.y) / zoom / scaledGridSize) * scaledGridSize;

    // Set minimum line width for grid
    ctx.lineWidth = Math.max(1, 1 / zoom);

    for (let x = startX; x < endX; x += scaledGridSize) {
      ctx.beginPath();
      ctx.moveTo(x, startY);
      ctx.lineTo(x, endY);
      ctx.stroke();
    }
    for (let y = startY; y < endY; y += scaledGridSize) {
      ctx.beginPath();
      ctx.moveTo(startX, y);
      ctx.lineTo(endX, y);
      ctx.stroke();
    }
  }, [zoom, offset]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Apply zoom transformation
    ctx.save();
    ctx.translate(offset.x, offset.y);
    ctx.scale(zoom, zoom);
    
    drawGrid(ctx);
    
    // Draw all lines
    lines.forEach((line, index) => {
      const color = index === selectedLine ? "red" : "black";
      drawLine(ctx, line, color);
    });
    
    if (currentPoint && hoverPoint) {
      drawLine(ctx, { start: currentPoint, end: hoverPoint }, "red");
    }
    if (snapPoint) {
      drawSnapIndicator(ctx, snapPoint);
    }
    ctx.restore();
  }, [lines, currentPoint, hoverPoint, snapPoint, zoom, offset, drawGrid, selectedLine]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (currentPoint) {
          setCurrentPoint(null);
          setHoverPoint(null);
          setSnapPoint(null);
        }
        // Exit update mode and clear selections
        setIsUpdateMode(false);
        setSelectedLine(null);
        setSelectedPoint(null);
      }
      if (e.key === 'Control') {
        setIsUpdateMode(true);
      }
    };

    const handleKeyUp = (e) => {
      if (e.key === 'Control') {
        // Only exit update mode if no line is selected
        if (selectedLine === null) {
          setIsUpdateMode(false);
        }
        // Only reset selectedPoint, keep selectedLine
        setSelectedPoint(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [currentPoint, selectedLine]);

  const drawLine = (ctx, line, color = "black") => {
    ctx.strokeStyle = color;
    // Set minimum line width for lines
    ctx.lineWidth = Math.max(1, 1 / zoom);
    ctx.beginPath();
    ctx.moveTo(line.start.x, line.start.y);
    ctx.lineTo(line.end.x, line.end.y);
    ctx.stroke();
  };

  const drawSnapIndicator = (ctx, point) => {
    ctx.save();
    ctx.beginPath();
    ctx.arc(point.x, point.y, 6, 0, 2 * Math.PI);
    ctx.strokeStyle = "green";
    // Set minimum line width for snap indicator
    ctx.lineWidth = Math.max(2, 2 / zoom);
    ctx.stroke();
    ctx.restore();
  };

  const snapToGrid = (x, y) => {
    const scaledX = (x - offset.x) / zoom;
    const scaledY = (y - offset.y) / zoom;
    return {
      x: Math.round(scaledX / GRID_SIZE) * GRID_SIZE,
      y: Math.round(scaledY / GRID_SIZE) * GRID_SIZE,
    };
  };

  const distance = (p1, p2) => {
    return Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);
  };

  const findNearbyPoint = (point, threshold = 10) => {
    for (let line of lines) {
      if (distance(line.start, point) < threshold) {
        return line.start;
      }
      if (distance(line.end, point) < threshold) {
        return line.end;
      }
    }
    return null;
  };

  const calculateLength = (p1, p2) => {
    if (!p1 || !p2) return 0;
    // Calculate length in grid units
    const gridLength = distance(p1, p2) / GRID_SIZE;
    // Convert to mm (1 grid unit = 1cm = 10mm)
    return Math.round(gridLength * MM_PER_GRID);
  };

  const handleWheel = (e) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Calculate zoom direction
    const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom + delta));

    // Calculate new offset to zoom towards mouse position
    const scale = newZoom / zoom;
    const newOffset = {
      x: mouseX - (mouseX - offset.x) * scale,
      y: mouseY - (mouseY - offset.y) * scale
    };

    setZoom(newZoom);
    setOffset(newOffset);
  };

  const findLineAtPoint = (point, threshold = 10) => {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Check if point is close to the line
      const distanceToLine = distanceToLineSegment(point, line.start, line.end);
      if (distanceToLine < threshold) {
        return { line, index: i };
      }
    }
    return null;
  };

  const distanceToLineSegment = (point, lineStart, lineEnd) => {
    const A = point.x - lineStart.x;
    const B = point.y - lineStart.y;
    const C = lineEnd.x - lineStart.x;
    const D = lineEnd.y - lineStart.y;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;

    if (lenSq !== 0) {
      param = dot / lenSq;
    }

    let xx, yy;

    if (param < 0) {
      xx = lineStart.x;
      yy = lineStart.y;
    } else if (param > 1) {
      xx = lineEnd.x;
      yy = lineEnd.y;
    } else {
      xx = lineStart.x + param * C;
      yy = lineStart.y + param * D;
    }

    const dx = point.x - xx;
    const dy = point.y - yy;

    return Math.sqrt(dx * dx + dy * dy);
  };

  const handleMouseDown = (e) => {
    if (!isUpdateMode) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const point = { x, y };
    
    // Convert point to canvas coordinates considering zoom and offset
    const canvasPoint = {
      x: (point.x - offset.x) / zoom,
      y: (point.y - offset.y) / zoom
    };
    
    // First check if we're clicking on a line endpoint
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (distance(line.start, canvasPoint) < 10) {
        setSelectedPoint({ lineId: line.id, pointKey: "start" });
        setIsDragging(true);
        setDragStart(canvasPoint);
        return;
      }
      if (distance(line.end, canvasPoint) < 10) {
        setSelectedPoint({ lineId: line.id, pointKey: "end" });
        setIsDragging(true);
        setDragStart(canvasPoint);
        return;
      }
    }
    
    // Then check if we're clicking on a line
    const lineAtPoint = findLineAtPoint(canvasPoint);
    if (lineAtPoint) {
      setSelectedLine(lineAtPoint.index);
      setIsDragging(true);
      setDragStart(canvasPoint);
    } else {
      setSelectedLine(null);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setDragStart(null);
  };

  const handleMouseMove = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // First try to snap to grid
    let snapped = snapToGrid(x, y);
    
    // Check for nearby endpoints even when not drawing a line
    const nearbyPoint = findNearbyPoint(snapped);
    if (nearbyPoint) {
      snapped = nearbyPoint;
      setSnapPoint(nearbyPoint);
    } else {
      setSnapPoint(null);
    }
    
    // Handle dragging in update mode
    if (isUpdateMode && isDragging && dragStart) {
      if (selectedPoint) {
        // Moving a line endpoint - ensure it snaps to grid
        const updated = lines.map((line) => {
          if (line.id === selectedPoint.lineId) {
            return {
              ...line,
              [selectedPoint.pointKey]: snapped
            };
          }
          return line;
        });
        setLines(updated);
      } else if (selectedLine !== null) {
        // Moving an entire line - ensure both endpoints snap to grid
        const line = lines[selectedLine];
        const dx = snapped.x - dragStart.x;
        const dy = snapped.y - dragStart.y;
        
        // Calculate new positions for both endpoints
        const newStart = {
          x: Math.round((line.start.x + dx) / GRID_SIZE) * GRID_SIZE,
          y: Math.round((line.start.y + dy) / GRID_SIZE) * GRID_SIZE
        };
        
        const newEnd = {
          x: Math.round((line.end.x + dx) / GRID_SIZE) * GRID_SIZE,
          y: Math.round((line.end.y + dy) / GRID_SIZE) * GRID_SIZE
        };
        
        const updated = [...lines];
        updated[selectedLine] = {
          ...line,
          start: newStart,
          end: newEnd
        };
        
        setLines(updated);
        setDragStart(snapped);
      }
      return;
    }
    
    // Only update hover point if we're currently drawing a line and not in update mode
    if (currentPoint && !isUpdateMode) {
      setHoverPoint(snapped);
      // Calculate and update the current length
      const length = calculateLength(currentPoint, snapped);
      setCurrentLength(length);
    }
  };

  const handleClick = (e) => {
    // If we're in update mode, deselect the line when clicking on empty space
    if (isUpdateMode) {
      const rect = canvasRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const point = { x, y };
      
      // Convert point to canvas coordinates considering zoom and offset
      const canvasPoint = {
        x: (point.x - offset.x) / zoom,
        y: (point.y - offset.y) / zoom
      };
      
      // Check if we clicked on a line or endpoint
      const lineAtPoint = findLineAtPoint(canvasPoint);
      const isNearEndpoint = lines.some(line => 
        distance(line.start, canvasPoint) < 10 || 
        distance(line.end, canvasPoint) < 10
      );
      
      // If we didn't click on a line or endpoint, deselect everything
      if (!lineAtPoint && !isNearEndpoint) {
        setSelectedLine(null);
        setSelectedPoint(null);
      }
      return;
    }
    
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Use the snap point if available, otherwise snap to grid
    let snapped = snapPoint || snapToGrid(x, y);

    if (selectedPoint) {
      const updated = lines.map((line) => {
        if (line.id === selectedPoint.lineId) {
          line[selectedPoint.pointKey] = snapped;
        }
        return line;
      });
      setLines(updated);
      setSelectedPoint(null);
      setSnapPoint(null);
      setCurrentLength(0);
      return;
    }

    if (!currentPoint) {
      setCurrentPoint(snapped);
      setCurrentLength(0);
    } else {
      const newLine = {
        id: Date.now(),
        start: currentPoint,
        end: snapped,
      };
      setLines([...lines, newLine]);
      setCurrentPoint(null);
      setHoverPoint(null);
      setSnapPoint(null);
      setCurrentLength(0);
    }
  };

  const handlePointSelect = (e) => {
    e.preventDefault();
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Convert point to canvas coordinates considering zoom and offset
    const canvasPoint = {
      x: (x - offset.x) / zoom,
      y: (y - offset.y) / zoom
    };

    for (let line of lines) {
      if (distance(line.start, canvasPoint) < 10) {
        setSelectedPoint({ lineId: line.id, pointKey: "start" });
        return;
      }
      if (distance(line.end, canvasPoint) < 10) {
        setSelectedPoint({ lineId: line.id, pointKey: "end" });
        return;
      }
    }
  };

  const handleSave = (e) => {
    console.log('Save clicked!');
    const text = JSON.stringify(lines);
    const blob = new Blob([text], { type: "text/plain" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "project.txt";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleLoad = (e) => {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = () => {
      const loadedLines = JSON.parse(reader.result);
      setLines(loadedLines);
    };
    reader.readAsText(file);
  };

  const handleResetZoom = () => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  };

  return (
    <div className="p-4">
      <div className="mb-2 flex items-center gap-4">
        <input
          type="button"
          value="Save"
          onClick={(e) => {
            e.preventDefault();
            console.log('in tag event click save!');
            handleSave();
          }}
          className="mr-2 px-4 py-2 border rounded cursor-pointer"
        />
        <input type="file" onChange={handleLoad} />
        <div className="flex items-center gap-2">
          <span>Zoom: {Math.round(zoom * 100)}%</span>
          <input
            type="button"
            value="Reset Zoom"
            onClick={handleResetZoom}
            className="px-4 py-2 border rounded cursor-pointer"
          />
        </div>
      </div>
      <canvas
        ref={canvasRef}
        width={1200}
        height={800}
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseMove={handleMouseMove}
        onContextMenu={handlePointSelect}
        onWheel={handleWheel}
        style={{ border: "1px solid black", cursor: isUpdateMode ? "move" : "crosshair" }}
      />
      <div className="mt-2 text-sm">
        {currentPoint && hoverPoint ? (
          <span>Current line length: {currentLength} mm</span>
        ) : (
          <span>
            {isUpdateMode 
              ? selectedLine !== null 
                ? `Update Mode: Line selected. Length: ${calculateLength(lines[selectedLine].start, lines[selectedLine].end)} mm. Click elsewhere to deselect.` 
                : "Update Mode: Hold Ctrl to select and move lines" 
              : "Click to start drawing a line"}
          </span>
        )}
      </div>
    </div>
  );
} 