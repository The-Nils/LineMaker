class PenPlotterConverter {
  constructor() {
    this.originalCanvas = document.createElement("canvas"); // Hidden canvas for processing
    this.outputCanvas = document.getElementById("outputCanvas");
    this.originalCtx = this.originalCanvas.getContext("2d");
    this.outputCtx = this.outputCanvas.getContext("2d");
    this.thumbnail = document.getElementById("imageThumbnail");
    this.imageData = null;
    this.originalImage = null;
    this.svgContent = "";
    this.gcodeLines = []; // Store G-code line commands
    this.pixelsPerMm = 96 / 25.4; // Standard web DPI conversion

    this.setupEventListeners();
    this.updateCanvasSize();
  }

  setupEventListeners() {
    // File input
    document.getElementById("imageInput").addEventListener("change", (e) => {
      this.loadImage(e.target.files[0]);
    });

    // Setup number input listeners
    this.setupNumberInput("canvasWidthValue", () => {
      this.updateCanvasSize();
      if (this.originalImage) this.redrawImage();
    });
    this.setupNumberInput("canvasHeightValue", () => {
      this.updateCanvasSize();
      if (this.originalImage) this.redrawImage();
    });
    this.setupNumberInput("penDiameterValue", () => {
      if (this.imageData) this.processImage();
    });
    this.setupNumberInput("lineAngleValue", () => {
      if (this.imageData) this.processImage();
    });
    this.setupNumberInput("sectionWidthValue", () => {
      if (this.imageData) this.processImage();
    });
    this.setupNumberInput("lineSpacingValue", () => {
      if (this.imageData) this.processImage();
    });
    this.setupNumberInput("minLineLengthValue", () => {
      if (this.imageData) this.processImage();
    });
    this.setupNumberInput("contrastValue", () => {
      if (this.imageData) this.processImage();
    });
    this.setupNumberInput("feedRateValue", () => {});
    this.setupNumberInput("penDownZValue", () => {});
    this.setupNumberInput("penUpZValue", () => {});

    // Setup zoom controls
    this.syncInputs("canvasZoom", "canvasZoomValue");
    this.setupNumberInput("canvasZoomValue", () => {
      this.updateCanvasZoom();
    });

    // Download button
    document.getElementById("downloadBtn").addEventListener("click", () => {
      this.downloadSVG();
    });

    // Download G-code button
    document
      .getElementById("downloadGcodeBtn")
      .addEventListener("click", () => {
        this.downloadGcode();
      });
  }

  setupNumberInput(inputId, callback) {
    const input = document.getElementById(inputId);
    input.addEventListener("input", callback);
  }

  syncInputs(sliderId, numberId) {
    const slider = document.getElementById(sliderId);
    const number = document.getElementById(numberId);

    slider.addEventListener("input", () => {
      number.value = slider.value;
      this.updateCanvasZoom();
    });

    number.addEventListener("input", () => {
      slider.value = number.value;
      this.updateCanvasZoom();
    });
  }

  showStatus(message, type = "processing") {
    const status = document.getElementById("status");
    status.textContent = message;
    status.className = `status ${type}`;
    status.style.display = "block";
  }

  updateCanvasSize() {
    const widthMm = parseFloat(
      document.getElementById("canvasWidthValue").value
    );
    const heightMm = parseFloat(
      document.getElementById("canvasHeightValue").value
    );

    // Calculate actual canvas size in pixels (full resolution)
    const widthPx = Math.round(widthMm * this.pixelsPerMm);
    const heightPx = Math.round(heightMm * this.pixelsPerMm);

    // Set canvas to full resolution
    this.originalCanvas.width = widthPx;
    this.originalCanvas.height = heightPx;
    this.outputCanvas.width = widthPx;
    this.outputCanvas.height = heightPx;

    // Set canvas display size
    this.outputCanvas.style.width = widthPx + "px";
    this.outputCanvas.style.height = heightPx + "px";
    // this.outputCanvas.style.transformOrigin = 'center center';

    // Apply zoom
    this.updateCanvasZoom();

    // Clear canvases with white background
    this.originalCtx.fillStyle = "white";
    this.originalCtx.fillRect(0, 0, widthPx, heightPx);
    this.outputCtx.fillStyle = "white";
    this.outputCtx.fillRect(0, 0, widthPx, heightPx);
  }

  updateCanvasZoom() {
    if (!this.outputCanvas || !this.outputCanvas.parentElement) return;

    // Get current zoom value
    const zoom =
      parseFloat(document.getElementById("canvasZoomValue").value) || 1;

    // Calculate auto-fit scale to prevent canvas from being too big by default
    const previewContainer = this.outputCanvas.parentElement;
    const containerWidth = previewContainer.clientWidth - 40;
    const containerHeight = previewContainer.clientHeight - 40;

    // Make sure container has dimensions
    if (containerWidth <= 0 || containerHeight <= 0) {
      // Retry after a short delay if container isn't ready
      setTimeout(() => this.updateCanvasZoom(), 100);
      return;
    }

    const canvasWidth =
      parseInt(this.outputCanvas.style.width) || this.outputCanvas.width;
    const canvasHeight =
      parseInt(this.outputCanvas.style.height) || this.outputCanvas.height;

    // Make sure canvas has dimensions
    if (canvasWidth <= 0 || canvasHeight <= 0) return;

    const scaleX = containerWidth / canvasWidth;
    const scaleY = containerHeight / canvasHeight;
    const autoFitScale = Math.min(scaleX, scaleY, 1); // Don't scale up beyond 1x

    // Apply both auto-fit and user zoom
    const finalScale = autoFitScale * zoom;
    this.outputCanvas.style.transform = `scale(${finalScale})`;
  }

  loadImage(file) {
    if (!file) return;

    // Check file type
    if (!file.type.startsWith("image/")) {
      this.showStatus("Please select a valid image file.", "error");
      return;
    }

    this.showStatus("Loading image...", "processing");

    // Use FileReader to convert to base64
    const reader = new FileReader();

    reader.onload = (e) => {
      const img = new Image();

      img.onload = () => {
        try {
          // Store original image for redrawing
          this.originalImage = img;

          // Show thumbnail
          this.thumbnail.src = e.target.result;
          this.thumbnail.classList.add("show");

          // Draw image fitted to current canvas
          this.redrawImage();

          this.showStatus("Image loaded successfully!", "complete");
        } catch (error) {
          console.error("Error processing image:", error);
          this.showStatus(
            "Error processing image. Please try another file.",
            "error"
          );
        }
      };

      img.onerror = (error) => {
        console.error("Image loading error:", error);
        this.showStatus(
          `Error loading image: ${file.name}. Please try another file.`,
          "error"
        );
      };

      // Load the base64 data
      img.src = e.target.result;
    };

    reader.onerror = (error) => {
      console.error("FileReader error:", error);
      this.showStatus("Error reading file. Please try another image.", "error");
    };

    // Read the file as base64 data URL
    reader.readAsDataURL(file);
  }

  redrawImage() {
    if (!this.originalImage) return;

    const canvasWidth = this.originalCanvas.width;
    const canvasHeight = this.originalCanvas.height;

    // Clear canvas with white background
    this.originalCtx.fillStyle = "white";
    this.originalCtx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Calculate fit dimensions (maintain aspect ratio, fit inside canvas)
    const imgAspect = this.originalImage.width / this.originalImage.height;
    const canvasAspect = canvasWidth / canvasHeight;

    let drawWidth, drawHeight, drawX, drawY;

    if (imgAspect > canvasAspect) {
      // Image is wider - fit to width
      drawWidth = canvasWidth;
      drawHeight = canvasWidth / imgAspect;
      drawX = 0;
      drawY = (canvasHeight - drawHeight) / 2;
    } else {
      // Image is taller - fit to height
      drawHeight = canvasHeight;
      drawWidth = canvasHeight * imgAspect;
      drawX = (canvasWidth - drawWidth) / 2;
      drawY = 0;
    }

    // Draw image fitted to canvas
    this.originalCtx.drawImage(
      this.originalImage,
      drawX,
      drawY,
      drawWidth,
      drawHeight
    );

    // Get image data for processing (entire canvas including white areas)
    this.imageData = this.originalCtx.getImageData(
      0,
      0,
      canvasWidth,
      canvasHeight
    );

    this.processImage();
  }

  processImage() {
    if (!this.imageData) return;

    this.showStatus("Converting to line art...", "processing");

    const penDiameter = parseFloat(
      document.getElementById("penDiameterValue").value
    );
    const lineAngle = parseInt(document.getElementById("lineAngleValue").value);
    const sectionWidth = parseFloat(
      document.getElementById("sectionWidthValue").value
    );
    const contrast = parseFloat(document.getElementById("contrastValue").value);
    const canvasWidthMm = parseFloat(
      document.getElementById("canvasWidthValue").value
    );
    const canvasHeightMm = parseFloat(
      document.getElementById("canvasHeightValue").value
    );

    // Convert to grayscale intensity map
    const { width, height, data } = this.imageData;
    const intensityMap = new Float32Array(width * height);

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      let intensity = 1 - gray / 255; // Invert so dark areas = high intensity

      // Apply contrast adjustment
      intensity = Math.pow(intensity, contrast);
      intensity = Math.max(0, Math.min(1, intensity)); // Clamp between 0 and 1

      intensityMap[i / 4] = intensity;
    }

    // Clear output canvas
    this.outputCtx.fillStyle = "white";
    this.outputCtx.fillRect(0, 0, width, height);
    this.outputCtx.strokeStyle = "black";
    this.outputCtx.lineWidth = 1;

    // Generate proper SVG header with all required attributes (matching working version)
    this.svgContent = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg width="${canvasWidthMm}mm" height="${canvasHeightMm}mm" 
     viewBox="0 0 ${width} ${height}" 
     version="1.1" 
     xmlns="http://www.w3.org/2000/svg" 
     xmlns:xlink="http://www.w3.org/1999/xlink">
  <defs/>
  <g id="pen-plotter-lines" stroke="black" fill="none" stroke-linecap="round" stroke-linejoin="round">
`;

    // Clear G-code lines array
    this.gcodeLines = [];

    // Convert angle to radians
    const angleRad = (lineAngle * Math.PI) / 180;
    const dx = Math.cos(angleRad);
    const dy = Math.sin(angleRad);

    // Calculate section spacing in pixels
    const sectionSpacing = sectionWidth * this.pixelsPerMm;

    // Generate lines perpendicular to the main angle
    const perpAngle = angleRad + Math.PI / 2;
    const perpDx = Math.cos(perpAngle);
    const perpDy = Math.sin(perpAngle);

    // Calculate how many sections we need
    const diagonal = Math.sqrt(width * width + height * height);
    const numSections = Math.ceil(diagonal / sectionSpacing) * 2;

    for (let section = 0; section < numSections; section++) {
      // Calculate the center line for this section
      const offset = (section - numSections / 2) * sectionSpacing;
      const centerX = width / 2 + perpDx * offset;
      const centerY = height / 2 + perpDy * offset;

      // Find the line segment within the image bounds
      const linePoints = this.clipLineToCanvas(
        centerX,
        centerY,
        dx,
        dy,
        width,
        height
      );

      if (linePoints.length === 2) {
        const [start, end] = linePoints;
        this.drawOptimizedVariableThicknessLine(
          start.x,
          start.y,
          end.x,
          end.y,
          intensityMap,
          width,
          height,
          penDiameter
        );
      }
    }

    this.svgContent += `  </g>
</svg>`;

    // Update line count display
    document.getElementById("lineCount").textContent =
      this.gcodeLines.length.toLocaleString();

    document.getElementById("downloadBtn").disabled = false;
    document.getElementById("downloadGcodeBtn").disabled = false;
    this.showStatus("Conversion complete!", "complete");
  }

  clipLineToCanvas(centerX, centerY, dx, dy, width, height) {
    const points = [];
    const edges = [
      { x: 0, y: 0, nx: 1, ny: 0 }, // Left edge
      { x: width, y: 0, nx: -1, ny: 0 }, // Right edge
      { x: 0, y: 0, nx: 0, ny: 1 }, // Top edge
      { x: 0, y: height, nx: 0, ny: -1 }, // Bottom edge
    ];

    edges.forEach((edge) => {
      let t;
      if (Math.abs(dx) > Math.abs(dy)) {
        if (edge.nx !== 0) {
          t = (edge.x - centerX) / dx;
          const y = centerY + dy * t;
          if (y >= 0 && y <= height) {
            points.push({ x: edge.x, y, t });
          }
        }
      } else {
        if (edge.ny !== 0) {
          t = (edge.y - centerY) / dy;
          const x = centerX + dx * t;
          if (x >= 0 && x <= width) {
            points.push({ x, y: edge.y, t });
          }
        }
      }
    });

    // Handle remaining edges
    edges.forEach((edge) => {
      if (
        (Math.abs(dx) > Math.abs(dy) && edge.ny !== 0) ||
        (Math.abs(dx) <= Math.abs(dy) && edge.nx !== 0)
      ) {
        let t;
        if (edge.nx !== 0) {
          t = (edge.x - centerX) / dx;
          const y = centerY + dy * t;
          if (y >= 0 && y <= height) {
            points.push({ x: edge.x, y, t });
          }
        } else {
          t = (edge.y - centerY) / dy;
          const x = centerX + dx * t;
          if (x >= 0 && x <= width) {
            points.push({ x, y: edge.y, t });
          }
        }
      }
    });

    // Remove duplicates and sort by parameter t
    const uniquePoints = points.filter(
      (point, index, arr) =>
        index ===
        arr.findIndex(
          (p) => Math.abs(p.x - point.x) < 0.1 && Math.abs(p.y - point.y) < 0.1
        )
    );

    uniquePoints.sort((a, b) => a.t - b.t);
    return uniquePoints.slice(0, 2);
  }

  drawOptimizedVariableThicknessLine(
    x1,
    y1,
    x2,
    y2,
    intensityMap,
    width,
    height,
    penDiameter
  ) {
    const length = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
    const steps = Math.ceil(length / 2);

    // Sample intensity along the entire line
    const intensities = [];
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      const x = x1 + (x2 - x1) * t;
      const y = y1 + (y2 - y1) * t;
      const intensity = this.sampleIntensity(x, y, intensityMap, width, height);
      intensities.push({ x, y, intensity, t });
    }

    // Calculate perpendicular direction for line spacing
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lineLength = Math.sqrt(dx * dx + dy * dy);
    const perpX = -dy / lineLength;
    const perpY = dx / lineLength;

    const penWidthPx = penDiameter * this.pixelsPerMm;
    const userLineSpacing = parseFloat(
      document.getElementById("lineSpacingValue").value
    );
    const lineSpacingPx = userLineSpacing * this.pixelsPerMm;

    // Determine maximum number of lines needed
    const maxIntensity = Math.max(...intensities.map((p) => p.intensity));
    const maxLines = Math.ceil(5 * maxIntensity);

    // For each possible line position (center + alternating)
    for (let lineIndex = 0; lineIndex < maxLines; lineIndex++) {
      // Calculate offset using center + alternating pattern
      let offset;
      if (lineIndex === 0) {
        offset = 0; // Center line
      } else {
        const segmentIndex = Math.ceil(lineIndex / 2);
        const isTop = lineIndex % 2 === 1;
        offset = isTop
          ? segmentIndex * lineSpacingPx
          : -segmentIndex * lineSpacingPx;
      }

      // Build the path for this line by collecting segments where it should exist
      let pathSegments = [];
      let currentSegment = null;

      for (let i = 0; i < intensities.length; i++) {
        const point = intensities[i];
        const requiredLines = Math.ceil(5 * point.intensity);
        const shouldDrawLine = lineIndex < requiredLines;

        if (shouldDrawLine) {
          const segmentX = point.x + perpX * offset;
          const segmentY = point.y + perpY * offset;

          if (!currentSegment) {
            // Start new segment
            currentSegment = {
              startX: segmentX,
              startY: segmentY,
              endX: segmentX,
              endY: segmentY,
              startT: point.t,
              endT: point.t,
            };
          } else {
            // Extend current segment
            currentSegment.endX = segmentX;
            currentSegment.endY = segmentY;
            currentSegment.endT = point.t;
          }
        } else if (currentSegment) {
          // End current segment and add to path
          pathSegments.push(currentSegment);
          currentSegment = null;
        }
      }

      // Don't forget the last segment
      if (currentSegment) {
        pathSegments.push(currentSegment);
      }

      // Filter out segments shorter than minimum length
      const minLineLengthMm = parseFloat(
        document.getElementById("minLineLengthValue").value
      );
      const filteredSegments = pathSegments.filter((segment) => {
        const gcodeX1 = segment.startX / this.pixelsPerMm;
        const gcodeY1 = segment.startY / this.pixelsPerMm;
        const gcodeX2 = segment.endX / this.pixelsPerMm;
        const gcodeY2 = segment.endY / this.pixelsPerMm;

        const lineLengthMm = Math.sqrt(
          (gcodeX2 - gcodeX1) ** 2 + (gcodeY2 - gcodeY1) ** 2
        );

        return lineLengthMm >= minLineLengthMm;
      });

      pathSegments = filteredSegments;

      // Draw and output each segment for this line
      pathSegments.forEach((segment) => {
        // Draw on canvas
        this.outputCtx.lineWidth = penWidthPx;
        this.outputCtx.beginPath();
        this.outputCtx.moveTo(segment.startX, segment.startY);
        this.outputCtx.lineTo(segment.endX, segment.endY);
        this.outputCtx.stroke();

        // Validate coordinates before adding to SVG
        const x1 = isFinite(segment.startX) ? segment.startX.toFixed(3) : "0";
        const y1 = isFinite(segment.startY) ? segment.startY.toFixed(3) : "0";
        const x2 = isFinite(segment.endX) ? segment.endX.toFixed(3) : "0";
        const y2 = isFinite(segment.endY) ? segment.endY.toFixed(3) : "0";
        const strokeWidth = isFinite(penWidthPx) ? penWidthPx.toFixed(3) : "1";

        // Only add if line has non-zero length
        if (
          Math.abs(parseFloat(x2) - parseFloat(x1)) > 0.001 ||
          Math.abs(parseFloat(y2) - parseFloat(y1)) > 0.001
        ) {
          this.svgContent += `    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke-width="${strokeWidth}"/>
`;
        }

        // Add to G-code
        const gcodeX1 = segment.startX / this.pixelsPerMm;
        const gcodeY1 = segment.startY / this.pixelsPerMm;
        const gcodeX2 = segment.endX / this.pixelsPerMm;
        const gcodeY2 = segment.endY / this.pixelsPerMm;

        this.gcodeLines.push({
          x1: gcodeX1,
          y1: gcodeY1,
          x2: gcodeX2,
          y2: gcodeY2,
        });
      });
    }
  }

  sampleIntensity(x, y, intensityMap, width, height) {
    const sampleRadius = 3; // Fixed sample radius - simpler approach
    let totalIntensity = 0;
    let sampleCount = 0;

    for (let dy = -sampleRadius; dy <= sampleRadius; dy++) {
      for (let dx = -sampleRadius; dx <= sampleRadius; dx++) {
        const sx = Math.round(x + dx);
        const sy = Math.round(y + dy);

        if (sx >= 0 && sx < width && sy >= 0 && sy < height) {
          totalIntensity += intensityMap[sy * width + sx];
          sampleCount++;
        }
      }
    }

    return sampleCount > 0 ? totalIntensity / sampleCount : 0;
  }

  downloadSVG() {
    if (!this.svgContent) return;

    const blob = new Blob([this.svgContent], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "pen-plotter-output.svg";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  downloadGcode() {
    if (this.gcodeLines.length === 0) return;

    const feedRate = parseInt(document.getElementById("feedRateValue").value);
    const penDownZ = parseFloat(document.getElementById("penDownZValue").value);
    const penUpZ = parseFloat(document.getElementById("penUpZValue").value);

    let gcode = "";

    // G-code header
    gcode += "; Generated by Pen Plotter Converter\n";
    gcode += "; Image to G-code conversion\n";
    gcode += `; Feed rate: ${feedRate} mm/min\n`;
    gcode += `; Pen down Z: ${penDownZ} mm\n`;
    gcode += `; Pen up Z: ${penUpZ} mm\n`;
    gcode += "\n";

    // Initialize
    gcode += "G21 ; Set units to millimeters\n";
    gcode += "G90 ; Absolute positioning\n";
    gcode += "G94 ; Feed rate per minute\n";
    gcode += `F${feedRate} ; Set feed rate\n`;
    gcode += `G0 Z${penUpZ} ; Pen up\n`;
    gcode += "G0 X0 Y0 ; Move to origin\n";
    gcode += "\n";

    let currentX = 0;
    let currentY = 0;
    let penIsDown = false;

    // Optimize line order for zig-zag pattern to minimize travel
    this.gcodeLines.forEach((line) => {
      // Calculate distance to both ends of the line
      const distToStart = Math.sqrt(
        (currentX - line.x1) ** 2 + (currentY - line.y1) ** 2
      );
      const distToEnd = Math.sqrt(
        (currentX - line.x2) ** 2 + (currentY - line.y2) ** 2
      );

      // Choose the closer end as start point, draw to the far end
      let startX, startY, endX, endY;
      if (distToStart <= distToEnd) {
        // Draw from x1,y1 to x2,y2
        startX = line.x1;
        startY = line.y1;
        endX = line.x2;
        endY = line.y2;
      } else {
        // Draw from x2,y2 to x1,y1 (reverse direction)
        startX = line.x2;
        startY = line.y2;
        endX = line.x1;
        endY = line.y1;
      }

      // Move to start position if needed
      if (
        Math.abs(currentX - startX) > 0.001 ||
        Math.abs(currentY - startY) > 0.001
      ) {
        if (penIsDown) {
          gcode += `G0 Z${penUpZ} ; Pen up\n`;
          penIsDown = false;
        }
        gcode += `G0 X${startX.toFixed(3)} Y${startY.toFixed(
          3
        )} ; Move to start\n`;
        currentX = startX;
        currentY = startY;
      }

      // Pen down and draw line
      if (!penIsDown) {
        gcode += `G1 Z${penDownZ} ; Pen down\n`;
        penIsDown = true;
      }

      gcode += `G1 X${endX.toFixed(3)} Y${endY.toFixed(3)} ; Draw line\n`;
      currentX = endX;
      currentY = endY;
    });

    // Footer
    gcode += "\n";
    gcode += `G0 Z${penUpZ} ; Pen up\n`;
    gcode += "G0 X0 Y0 ; Return to origin\n";
    gcode += "M30 ; Program end\n";

    // Download file
    const blob = new Blob([gcode], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "pen-plotter-output.gcode";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

// Initialize the converter when the page loads
document.addEventListener("DOMContentLoaded", () => {
  new PenPlotterConverter();
});
