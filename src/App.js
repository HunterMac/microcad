import React, { useState, useRef, useEffect, useCallback } from "react";

const GRID_SIZE = 20;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;
const ZOOM_STEP = 0.1;
// 1 grid unit = 1cm at 100% zoom
const MM_PER_GRID = 10; // 1cm = 10mm
const STORAGE_KEY = "cad_project_data";
const TOP_MARGIN = 100; // Reduced from 120 to 100
const BOTTOM_MARGIN = 60; // Space for status information

export default function App() {
  const [lines, setLines] = useState([]);
  const [currentPoint, setCurrentPoint] = useState(null);
  const [hoverPoint, setHoverPoint] = useState(null);
  const [selectedPoint, setSelectedPoint] = useState(null);
  const [snapPoint, setSnapPoint] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [currentLength, setCurrentLength] = useState(0);
  const [inputLength, setInputLength] = useState("");
  const [isUpdateMode, setIsUpdateMode] = useState(false);
  const [selectedLine, setSelectedLine] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState(null);
  const [showDimensions, setShowDimensions] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [isHoveringEndpoint, setIsHoveringEndpoint] = useState(false);
  const [hoveredLineId, setHoveredLineId] = useState(null);
  const [canvasSize, setCanvasSize] = useState({ width: 1200, height: 800 });
  const [useFineGrid, setUseFineGrid] = useState(false);
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  // Calculate canvas size based on window dimensions
  useEffect(() => {
    const updateCanvasSize = () => {
      if (containerRef.current) {
        const containerWidth = containerRef.current.clientWidth;
        // Add a safety margin to ensure the canvas fits within the viewport
        const containerHeight = window.innerHeight - TOP_MARGIN - BOTTOM_MARGIN - 20; // Added 20px safety margin
        
        setCanvasSize({
          width: containerWidth,
          height: Math.max(400, containerHeight) // Ensure minimum height of 400px
        });
      }
    };

    // Initial calculation
    updateCanvasSize();

    // Add event listener for window resize
    window.addEventListener('resize', updateCanvasSize);
    
    // Cleanup
    return () => {
      window.removeEventListener('resize', updateCanvasSize);
    };
  }, []);

  // Update canvas dimensions when canvasSize changes
  useEffect(() => {
    if (canvasRef.current) {
      canvasRef.current.width = canvasSize.width;
      canvasRef.current.height = canvasSize.height;
    }
  }, [canvasSize]);

  // Load project from local storage on initial render
  useEffect(() => {
    const savedData = localStorage.getItem(STORAGE_KEY);
    if (savedData) {
      try {
        const parsedData = JSON.parse(savedData);
        if (Array.isArray(parsedData)) {
          setLines(parsedData);
        }
      } catch (error) {
        console.error("Error loading project from local storage:", error);
      }
    }
  }, []);

  // Debounce local storage saves to prevent excessive writes
  useEffect(() => {
    const saveTimeout = setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    }, 1000); // Save after 1 second of inactivity
    
    return () => clearTimeout(saveTimeout);
  }, [lines]);

  const distance = useCallback((p1, p2) => {
    return Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);
  }, []);

  const calculateLength = useCallback((p1, p2) => {
    if (!p1 || !p2) return 0;
    // Calculate length in grid units
    const gridLength = distance(p1, p2) / GRID_SIZE;
    // Convert to mm (1 grid unit = 1cm = 10mm)
    return Math.round(gridLength * MM_PER_GRID);
  }, [distance]);

  const calculateEndPointFromLength = useCallback((startPoint, length, direction = null) => {
    if (!startPoint || !length) return null;
    
    // Convert length from mm to grid units
    const gridLength = length / MM_PER_GRID;
    
    // Calculate angle based on direction or default to horizontal
    const angle = direction 
      ? Math.atan2(direction.y, direction.x)
      : 0;
    
    // Calculate end point using trigonometry
    return {
      x: startPoint.x + gridLength * GRID_SIZE * Math.cos(angle),
      y: startPoint.y + gridLength * GRID_SIZE * Math.sin(angle)
    };
  }, []); // No dependencies needed as we're using constants

  const drawGrid = useCallback((ctx) => {
    // Get the current canvas dimensions
    const canvasWidth = canvasRef.current.width;
    const canvasHeight = canvasRef.current.height;
    
    if (useFineGrid) {
      // Draw fine grid (1mm) only
      ctx.strokeStyle = "#ddd";
      const fineGridSize = GRID_SIZE / 10;
      
      // Calculate grid boundaries based on current canvas size
      const startX = Math.floor(-offset.x / zoom / fineGridSize) * fineGridSize;
      const startY = Math.floor(-offset.y / zoom / fineGridSize) * fineGridSize;
      const endX = Math.ceil((canvasWidth - offset.x) / zoom / fineGridSize) * fineGridSize;
      const endY = Math.ceil((canvasHeight - offset.y) / zoom / fineGridSize) * fineGridSize;

      // Save the current context state
      ctx.save();
      
      // Reset the transformation to ensure 1px lines
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      
      // Apply only the translation part of the transformation
      ctx.translate(offset.x, offset.y);
      
      // Set line width to 1px for fine grid
      ctx.lineWidth = 1;

      // Draw vertical fine grid lines
      for (let x = startX; x < endX; x += fineGridSize) {
        const screenX = x * zoom;
        ctx.beginPath();
        ctx.moveTo(screenX, startY * zoom);
        ctx.lineTo(screenX, endY * zoom);
        ctx.stroke();
      }
      
      // Draw horizontal fine grid lines
      for (let y = startY; y < endY; y += fineGridSize) {
        const screenY = y * zoom;
        ctx.beginPath();
        ctx.moveTo(startX * zoom, screenY);
        ctx.lineTo(endX * zoom, screenY);
        ctx.stroke();
      }
      
      // Restore the context state
      ctx.restore();
    } else {
      // Draw regular grid (10mm)
      ctx.strokeStyle = "#ddd";
      
      // Calculate grid boundaries based on current canvas size
      const startX = Math.floor(-offset.x / zoom / GRID_SIZE) * GRID_SIZE;
      const startY = Math.floor(-offset.y / zoom / GRID_SIZE) * GRID_SIZE;
      const endX = Math.ceil((canvasWidth - offset.x) / zoom / GRID_SIZE) * GRID_SIZE;
      const endY = Math.ceil((canvasHeight - offset.y) / zoom / GRID_SIZE) * GRID_SIZE;

      // Set minimum line width for regular grid
      ctx.lineWidth = Math.max(1, 1 / zoom);

      // Draw vertical grid lines
      for (let x = startX; x < endX; x += GRID_SIZE) {
        ctx.beginPath();
        ctx.moveTo(x, startY);
        ctx.lineTo(x, endY);
        ctx.stroke();
      }
      
      // Draw horizontal grid lines
      for (let y = startY; y < endY; y += GRID_SIZE) {
        ctx.beginPath();
        ctx.moveTo(startX, y);
        ctx.lineTo(endX, y);
        ctx.stroke();
      }
    }
  }, [zoom, offset, useFineGrid]);

  const drawLine = useCallback((ctx, line, color = "black") => {
    ctx.strokeStyle = color;
    // Set minimum line width for lines
    ctx.lineWidth = Math.max(1, 1 / zoom);
    ctx.beginPath();
    ctx.moveTo(line.start.x, line.start.y);
    ctx.lineTo(line.end.x, line.end.y);
    ctx.stroke();
    
    // Draw dimensions if enabled
    if (showDimensions) {
      const length = calculateLength(line.start, line.end);
      const midX = (line.start.x + line.end.x) / 2;
      const midY = (line.start.y + line.end.y) / 2;
      
      // Determine if the line is more horizontal or vertical
      const isHorizontal = Math.abs(line.end.x - line.start.x) > Math.abs(line.end.y - line.start.y);
      
      // Set text properties
      ctx.font = `${Math.max(10, 10 / zoom)}px Arial`;
      ctx.fillStyle = "blue";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      
      // Position text based on line orientation
      if (isHorizontal) {
        // For horizontal lines, place text below
        ctx.fillText(`${length} mm`, midX, midY + 12 / zoom);
      } else {
        // For vertical lines, place text to the right with a consistent margin
        // Use a fixed value that scales with zoom to maintain consistent distance
        const margin = 22; // Fixed pixel value
        ctx.fillText(`${length} mm`, midX + margin, midY);
      }
    }
  }, [zoom, showDimensions, calculateLength]);

  const drawSnapIndicator = useCallback((ctx, point) => {
    ctx.save();
    ctx.beginPath();
    ctx.arc(point.x, point.y, 6, 0, 2 * Math.PI);
    
    // Set color based on mode
    if ((isUpdateMode && selectedPoint) || (isUpdateMode && isHoveringEndpoint)) {
      // Red for update mode when selecting or hovering over an endpoint
      ctx.strokeStyle = "red";
    } else {
      // Green for normal drawing mode or when not hovering over an endpoint
      ctx.strokeStyle = "green";
    }
    
    // Set line width based on whether we're actively drawing a line
    if (currentPoint) {
      // When actively drawing, use a thicker line
      ctx.lineWidth = Math.max(2, 2 / zoom);
    } else {
      // When not actively drawing, use a thinner line
      ctx.lineWidth = Math.max(1, 1 / zoom);
    }
    
    ctx.stroke();
    ctx.restore();
  }, [zoom, currentPoint, isUpdateMode, selectedPoint, isHoveringEndpoint]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Apply zoom transformation
    ctx.save();
    ctx.translate(offset.x, offset.y);
    ctx.scale(zoom, zoom);
    
    // Only draw the grid if showGrid is true
    if (showGrid) {
      drawGrid(ctx);
    }
    
    // Draw all lines
    lines.forEach((line, index) => {
      // Determine line color based on selection and hover state
      let color = "black";
      if (index === selectedLine) {
        color = "red";
      } else if (line.id === hoveredLineId) {
        color = "red";
      }
      
      drawLine(ctx, line, color);
    });
    
    if (currentPoint && hoverPoint) {
      drawLine(ctx, { start: currentPoint, end: hoverPoint }, "red");
    }
    if (snapPoint) {
      drawSnapIndicator(ctx, snapPoint);
    }
    ctx.restore();
  }, [lines, currentPoint, hoverPoint, snapPoint, zoom, offset, drawGrid, selectedLine, drawLine, drawSnapIndicator, showDimensions, hoveredLineId, canvasSize, showGrid]);

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
      // Delete selected line when Delete key is pressed in update mode
      if (e.key === 'Delete' && isUpdateMode && selectedLine !== null) {
        const updatedLines = [...lines];
        updatedLines.splice(selectedLine, 1);
        setLines(updatedLines);
        setSelectedLine(null);
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
  }, [currentPoint, selectedLine, isUpdateMode, lines]);

  // Add keyboard event handler for Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        // Reset all selection states
        setSelectedPoint(null);
        setSelectedLine(null);
        setCurrentPoint(null);
        setHoverPoint(null);
        setSnapPoint(null);
        setCurrentLength(0);
        setInputLength("");
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const snapToGrid = (x, y) => {
    const scaledX = (x - offset.x) / zoom;
    const scaledY = (y - offset.y) / zoom;
    
    // Use fine grid size when fine grid is enabled
    const gridSize = useFineGrid ? GRID_SIZE / 10 : GRID_SIZE;
    
    return {
      x: Math.round(scaledX / gridSize) * gridSize,
      y: Math.round(scaledY / gridSize) * gridSize,
    };
  };

  const findNearbyPoint = (point, threshold = 10) => {
    // Convert point to canvas coordinates if needed
    const canvasPoint = {
      x: (point.x - offset.x) / zoom,
      y: (point.y - offset.y) / zoom
    };
    
    // First check if we're near any endpoint
    for (let line of lines) {
      if (distance(line.start, canvasPoint) < threshold) {
        return line.start;
      }
      if (distance(line.end, canvasPoint) < threshold) {
        return line.end;
      }
    }
    
    // If we're drawing a new line and have a current point, also check if we're near the current point
    if (currentPoint && distance(currentPoint, canvasPoint) < threshold) {
      return currentPoint;
    }
    
    return null;
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
    let closestLine = null;
    let closestDistance = threshold;
    let closestIndex = -1;
    let shortestLength = Infinity;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Check if point is close to the line
      const distanceToLine = distanceToLineSegment(point, line.start, line.end);
      
      // Calculate the length of the line
      const lineLength = distance(line.start, line.end);
      
      // If this line is closer than our current closest, or if it's equally close but shorter,
      // update our selection
      if (distanceToLine < closestDistance || 
          (distanceToLine === closestDistance && lineLength < shortestLength)) {
        closestDistance = distanceToLine;
        closestLine = line;
        closestIndex = i;
        shortestLength = lineLength;
      }
    }
    
    if (closestLine) {
      return { line: closestLine, index: closestIndex };
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
    
    // Convert to canvas coordinates for line detection
    const canvasPoint = {
      x: (x - offset.x) / zoom,
      y: (y - offset.y) / zoom
    };
    
    // Check for endpoint selection
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
    
    // Check for line selection - use the original canvas point
    const lineAtPoint = findLineAtPoint(canvasPoint);
    if (lineAtPoint) {
      const line = lines[lineAtPoint.index];
      setSelectedLine(lineAtPoint.index);
      setInputLength(calculateLength(line.start, line.end).toString());
      setIsDragging(true);
      setDragStart(canvasPoint);
    } else {
      setSelectedLine(null);
      setInputLength("");
    }
  };

  const handleMouseUp = () => {
    // If we were dragging an endpoint, reset the selection
    if (selectedPoint) {
      setSelectedPoint(null);
    }
    
    // Check if any lines have 0mm length and delete them
    const updatedLines = lines.filter(line => {
      const length = calculateLength(line.start, line.end);
      return length > 0;
    });
    
    // If any lines were deleted, update the state
    if (updatedLines.length !== lines.length) {
      setLines(updatedLines);
      setSelectedLine(null);
    }
    
    setIsDragging(false);
    setDragStart(null);
  };

  const handleMouseMove = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Convert to canvas coordinates for line detection
    const canvasPoint = {
      x: (x - offset.x) / zoom,
      y: (y - offset.y) / zoom
    };
    
    // First try to snap to existing endpoints
    let snapped = null;
    const nearbyPoint = findNearbyPoint({ x, y });
    
    if (nearbyPoint) {
      // If we found a nearby endpoint, use it
      snapped = nearbyPoint;
      setSnapPoint(nearbyPoint);
      if (isUpdateMode) {
        setIsHoveringEndpoint(true);
      }
    } else {
      // If no nearby endpoint, snap to grid
      snapped = snapToGrid(x, y);
      setSnapPoint(snapped);
      setIsHoveringEndpoint(false);
    }
    
    // Handle update mode hover effects - use the original canvas point for line detection
    if (isUpdateMode && !isDragging) {
      const lineAtPoint = findLineAtPoint(canvasPoint);
      setHoveredLineId(lineAtPoint ? lines[lineAtPoint.index].id : null);
    } else {
      setHoveredLineId(null);
    }
    
    // Handle dragging in update mode
    if (isUpdateMode && isDragging && dragStart) {
      // Don't hide snap indicator when dragging in update mode
      // setSnapPoint(null);
      
      if (selectedPoint) {
        // Moving a line endpoint
        const updatedLines = lines.map(line => 
          line.id === selectedPoint.lineId
            ? { ...line, [selectedPoint.pointKey]: snapped }
            : line
        );
        setLines(updatedLines);
        
        // Update input length if the selected line is the same as the currently selected line
        if (selectedLine !== null && lines[selectedLine].id === selectedPoint.lineId) {
          const updatedLine = updatedLines.find(line => line.id === selectedPoint.lineId);
          if (updatedLine) {
            setInputLength(calculateLength(updatedLine.start, updatedLine.end).toString());
          }
        }
      } else if (selectedLine !== null) {
        // Moving an entire line
        const line = lines[selectedLine];
        const dx = snapped.x - dragStart.x;
        const dy = snapped.y - dragStart.y;
        
        const newStart = {
          x: Math.round((line.start.x + dx) / GRID_SIZE) * GRID_SIZE,
          y: Math.round((line.start.y + dy) / GRID_SIZE) * GRID_SIZE
        };
        
        const newEnd = {
          x: Math.round((line.end.x + dx) / GRID_SIZE) * GRID_SIZE,
          y: Math.round((line.end.y + dy) / GRID_SIZE) * GRID_SIZE
        };
        
        const updated = [...lines];
        updated[selectedLine] = { ...line, start: newStart, end: newEnd };
        setLines(updated);
        
        // Update input length
        setInputLength(calculateLength(newStart, newEnd).toString());
        
        setDragStart(snapped);
      }
      return;
    }
    
    // Update hover point and current length for new line drawing
    if (currentPoint && !isUpdateMode) {
      setHoverPoint(snapped);
      setCurrentLength(calculateLength(currentPoint, snapped));
    } else if (!isUpdateMode) {
      setHoverPoint(snapped);
    }
  };

  const handleClick = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // First try to snap to existing endpoints, then to grid
    let snapped = null;
    const nearbyPoint = findNearbyPoint({ x, y });
    
    if (nearbyPoint) {
      // If we found a nearby endpoint, use it
      snapped = nearbyPoint;
    } else {
      // If no nearby endpoint, snap to grid
      snapped = snapToGrid(x, y);
    }

    // Handle update mode
    if (isUpdateMode) {
      // Convert to canvas coordinates for line detection
      const canvasPoint = {
        x: (x - offset.x) / zoom,
        y: (y - offset.y) / zoom
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

    // Handle point selection
    if (selectedPoint) {
      const updatedLines = lines.map(line => 
        line.id === selectedPoint.lineId
          ? { ...line, [selectedPoint.pointKey]: snapped }
          : line
      );
      setLines(updatedLines);
      
      // Update input length if the selected line is the same as the currently selected line
      if (selectedLine !== null) {
        const updatedLine = updatedLines.find(line => line.id === selectedPoint.lineId);
        if (updatedLine) {
          setInputLength(calculateLength(updatedLine.start, updatedLine.end).toString());
        }
      }
      
      setSelectedPoint(null);
      setSnapPoint(null);
      setCurrentLength(0);
      return;
    }

    // Handle line creation
    if (!currentPoint) {
      setCurrentPoint(snapped);
      setCurrentLength(0);
    } else {
      setLines([...lines, {
        id: Date.now(),
        start: currentPoint,
        end: snapped,
      }]);
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

  const handleClear = () => {
    if (window.confirm("Are you sure you want to clear all lines? This action cannot be undone.")) {
      setLines([]);
      setCurrentPoint(null);
      setHoverPoint(null);
      setSelectedPoint(null);
      setSnapPoint(null);
      setSelectedLine(null);
      setCurrentLength(0);
    }
  };

  // Line length input component
  const LineLengthInput = useCallback(({ value, onChange, id }) => (
    <div className="flex items-center gap-1">
      <label htmlFor={id}>Set length (mm):</label>
      <input
        id={id}
        type="number"
        value={value}
        onChange={onChange}
        className="w-20 px-1 py-0.5 border rounded"
        min="0"
        step="1"
        placeholder="Length"
      />
    </div>
  ), []);

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <div className="p-4 bg-gray-100 border-b">
        <div className="flex-wrapper flex-col gap-4">
          {/* First row: Action buttons */}
          <div className="flex flex-wrap items-center gap-4">
            <input
              type="button"
              value="Save"
              onClick={handleSave}
              className="px-4 py-2 border rounded cursor-pointer"
            />
            <input type="file" onChange={handleLoad} />
            <input
              type="button"
              value="Clear"
              onClick={handleClear}
              className="px-4 py-2 border rounded cursor-pointer bg-red-100 hover:bg-red-200"
            />
            <div className="flex items-center gap-2">
              <span>Zoom: {Math.round(zoom * 100)}%</span>
              <input
                type="button"
                value="Reset Zoom"
                onClick={handleResetZoom}
                className="px-4 py-2 border rounded cursor-pointer"
              />
            </div>
            <label>
              <input
                type="checkbox"
                checked={useFineGrid}
                onChange={(e) => setUseFineGrid(e.target.checked)}
              />
              Fine Grid (1mm)
            </label>
          </div>
          
          {/* Second row: Display options */}
          <div className="flex-wrapper" >
            <div>
              <input
                type="checkbox"
                id="showDimensions"
                checked={showDimensions}
                onChange={(e) => setShowDimensions(e.target.checked)}
                className="mr-1"
              />
              <label htmlFor="showDimensions">Display dimensions</label>
            </div>
            <div>
              <input
                type="checkbox"
                id="showGrid"
                checked={showGrid}
                onChange={(e) => setShowGrid(e.target.checked)}
                className="mr-1"
              />
              <label htmlFor="showGrid">Display grid</label>
            </div>
          </div>
        </div>
      </div>
      
      <div 
        ref={containerRef} 
        className="flex-grow pt-2 px-4 pb-4 overflow-auto"
        style={{ minHeight: '400px', maxHeight: 'calc(100vh - 160px)' }}
      >
        <canvas
          ref={canvasRef}
          width={canvasSize.width}
          height={canvasSize.height}
          onClick={handleClick}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseMove={handleMouseMove}
          onContextMenu={handlePointSelect}
          onWheel={handleWheel}
          style={{ 
            border: "1px solid black", 
            cursor: isUpdateMode ? "move" : "crosshair",
            width: '100%',
            height: '100%'
          }}
        />
      </div>
      
      <div className="p-3 bg-gray-100 border-t text-margin">
        <div className="text-sm">
          {currentPoint && hoverPoint ? (
            <span>Current line length: {currentLength} mm</span>
          ) : (
            <span>
              {isUpdateMode 
                ? selectedLine !== null 
                  ? (
                    <div className="flex items-center gap-2">
                      <span>Update Mode: Line selected. Length: {calculateLength(lines[selectedLine].start, lines[selectedLine].end)} mm. Click elsewhere to deselect.</span>
                      <LineLengthInput 
                        id="updateLineLength"
                        value={inputLength}
                        onChange={(e) => {
                          setInputLength(e.target.value);
                          if (e.target.value && !isNaN(e.target.value) && parseFloat(e.target.value) > 0) {
                            const line = lines[selectedLine];
                            const direction = {
                              x: line.end.x - line.start.x,
                              y: line.end.y - line.start.y
                            };
                            const newEnd = calculateEndPointFromLength(line.start, parseFloat(e.target.value), direction);
                            if (newEnd) {
                              const updated = [...lines];
                              updated[selectedLine] = {
                                ...line,
                                end: newEnd
                              };
                              setLines(updated);
                            }
                          }
                        }}
                      />
                    </div>
                  )
                  : "Update Mode: Hold Ctrl to select and move lines" 
                : "Click to start drawing a line"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
} 