class LineMaker {
  constructor() {
    this.originalCanvas = document.createElement("canvas");
    this.outputCanvas = document.getElementById("outputCanvas");
    this.originalCtx = this.originalCanvas.getContext("2d");
    this.outputCtx = this.outputCanvas.getContext("2d");
    this.thumbnail = document.getElementById("imageThumbnail");
    this.imageData = null;
    this.originalImage = null;
    this.svgContent = "";
    this.gcodeLines = [];
    this.pixelsPerMm = 96 / 25.4;
    this.isProcessing = false;

    this.setupEventListeners();
    this.updateCanvasSize();
  }

  setupEventListeners() {
    // File input
    document.getElementById("imageInput").addEventListener("change", (e) => {
      this.loadImage(e.target.files[0]);
    });

    // Setup input listeners
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
    this.setupNumberInput("lineSpacingValue", () => {
      if (this.imageData) this.processImage();
    });
    this.setupNumberInput("effectStrengthValue", () => {
      if (this.imageData) this.processImage();
    });
    this.setupNumberInput("contrastValue", () => {
      if (this.imageData) this.processImage();
    });
    this.setupNumberInput("smoothingValue", () => {
      if (this.imageData) this.processImage();
    });
    this.setupNumberInput("feedRateValue", () => {});
    this.setupNumberInput("penDownZValue", () => {});
    this.setupNumberInput("penUpZValue", () => {});

    // Line direction dropdown
    document.getElementById("lineDirectionValue").addEventListener("change", () => {
      if (this.imageData) this.processImage();
    });

    // Setup zoom controls
    this.syncInputs("canvasZoom", "canvasZoomValue");
    this.setupNumberInput("canvasZoomValue", () => {
      this.updateCanvasZoom();
    });

    // Download buttons
    document.getElementById("downloadBtn").addEventListener("click", () => {
      this.downloadSVG();
    });
    document.getElementById("downloadGcodeBtn").addEventListener("click", () => {
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

  hideStatus() {
    document.getElementById("status").style.display = "none";
  }

  loadImage(file) {
    if (!file) return;

    this.showStatus("Loading image...");
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        this.originalImage = img;
        this.thumbnail.src = e.target.result;
        this.thumbnail.style.display = "block";
        this.redrawImage();
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  updateCanvasSize() {
    const widthMm = parseFloat(document.getElementById("canvasWidthValue").value);
    const heightMm = parseFloat(document.getElementById("canvasHeightValue").value);
    
    const widthPx = widthMm * this.pixelsPerMm;
    const heightPx = heightMm * this.pixelsPerMm;

    this.originalCanvas.width = widthPx;
    this.originalCanvas.height = heightPx;
    this.outputCanvas.width = widthPx;
    this.outputCanvas.height = heightPx;

    this.updateCanvasZoom();
  }

  updateCanvasZoom() {
    const zoom = parseFloat(document.getElementById("canvasZoomValue").value);
    const canvas = this.outputCanvas;
    canvas.style.transform = `scale(${zoom})`;
    canvas.style.transformOrigin = "top left";
  }

  redrawImage() {
    if (!this.originalImage) return;

    this.showStatus("Processing image...");
    
    // Clear and draw image to original canvas
    this.originalCtx.clearRect(0, 0, this.originalCanvas.width, this.originalCanvas.height);
    this.originalCtx.fillStyle = "white";
    this.originalCtx.fillRect(0, 0, this.originalCanvas.width, this.originalCanvas.height);
    
    // Calculate scaling to fit image in canvas while maintaining aspect ratio
    const canvasAspect = this.originalCanvas.width / this.originalCanvas.height;
    const imageAspect = this.originalImage.width / this.originalImage.height;
    
    let drawWidth, drawHeight, offsetX, offsetY;
    
    if (imageAspect > canvasAspect) {
      drawWidth = this.originalCanvas.width;
      drawHeight = drawWidth / imageAspect;
      offsetX = 0;
      offsetY = (this.originalCanvas.height - drawHeight) / 2;
    } else {
      drawHeight = this.originalCanvas.height;
      drawWidth = drawHeight * imageAspect;
      offsetX = (this.originalCanvas.width - drawWidth) / 2;
      offsetY = 0;
    }

    this.originalCtx.drawImage(this.originalImage, offsetX, offsetY, drawWidth, drawHeight);
    
    // Get image data for processing
    this.imageData = this.originalCtx.getImageData(0, 0, this.originalCanvas.width, this.originalCanvas.height);
    
    this.processImage();
  }

  async processImage() {
    if (!this.imageData) return;
    if (this.isProcessing) return;
    
    this.isProcessing = true;
    
    // Immediate UI feedback - show status and clear canvas right away
    this.showStatus("Preparing 3D line generation...");
    
    // Use setTimeout to ensure UI updates before heavy processing starts
    setTimeout(async () => {
      try {
        // Clear output canvas
        this.outputCtx.clearRect(0, 0, this.outputCanvas.width, this.outputCanvas.height);
        this.outputCtx.fillStyle = "white";
        this.outputCtx.fillRect(0, 0, this.outputCanvas.width, this.outputCanvas.height);

        const lines = await this.generateDeformedLines();
        await this.drawLines(lines);
        this.generateSVG(lines);
        this.generateGcode(lines);
        
        // Update statistics
        document.getElementById("lineCount").textContent = lines.length;
        
        // Enable download buttons
        document.getElementById("downloadBtn").disabled = false;
        document.getElementById("downloadGcodeBtn").disabled = false;
        
        this.hideStatus();
      } catch (error) {
        console.error("Processing error:", error);
        this.showStatus("Processing failed. Try reducing canvas size.", "error");
      } finally {
        this.isProcessing = false;
      }
    }, 10); // Small delay to let UI update
  }

  async generateDeformedLines() {
    const data = this.imageData.data;
    const width = this.imageData.width;
    const height = this.imageData.height;
    
    // Get parameters
    const lineSpacing = parseFloat(document.getElementById("lineSpacingValue").value);
    const effectStrength = parseFloat(document.getElementById("effectStrengthValue").value);
    const contrast = parseFloat(document.getElementById("contrastValue").value);
    const smoothing = parseInt(document.getElementById("smoothingValue").value);
    const lineDirection = document.getElementById("lineDirectionValue").value;
    const penDiameter = parseFloat(document.getElementById("penDiameterValue").value);
    
    const lineSpacingPx = lineSpacing * this.pixelsPerMm;
    const effectStrengthPx = effectStrength * this.pixelsPerMm;
    
    const lines = [];
    
    this.showStatus("Analyzing brightness for 3D effect...");
    
    // Create brightness map with smoothing
    const brightnessMap = await this.createBrightnessMap(data, width, height, contrast, smoothing);
    
    this.showStatus("Generating deformed lines...");
    
    if (lineDirection === "horizontal") {
      // Horizontal lines deformed by brightness
      for (let y = lineSpacingPx / 2; y < height; y += lineSpacingPx) {
        const line = await this.generateHorizontalLine(y, width, brightnessMap, effectStrengthPx, penDiameter);
        if (line.points.length > 1) {
          lines.push(line);
        }
        
        if (lines.length % 10 === 0) {
          this.showStatus(`Generating lines... ${lines.length}`);
          await this.sleep(1);
        }
      }
    } else if (lineDirection === "vertical") {
      // Vertical lines deformed by brightness
      for (let x = lineSpacingPx / 2; x < width; x += lineSpacingPx) {
        const line = await this.generateVerticalLine(x, height, brightnessMap, effectStrengthPx, penDiameter);
        if (line.points.length > 1) {
          lines.push(line);
        }
        
        if (lines.length % 10 === 0) {
          this.showStatus(`Generating lines... ${lines.length}`);
          await this.sleep(1);
        }
      }
    } else if (lineDirection === "diagonal-45") {
      // Diagonal lines at 45 degrees
      lines.push(...await this.generateDiagonalLines(width, height, brightnessMap, effectStrengthPx, lineSpacingPx, penDiameter, 45));
    } else if (lineDirection === "diagonal-135") {
      // Diagonal lines at 135 degrees
      lines.push(...await this.generateDiagonalLines(width, height, brightnessMap, effectStrengthPx, lineSpacingPx, penDiameter, 135));
    }
    
    return lines;
  }

  async createBrightnessMap(data, width, height, contrast, smoothing) {
    const brightnessMap = [];
    
    // Create initial brightness map with batching
    this.showStatus("Creating brightness map...");
    const batchSize = 50; // Process 50 rows at a time
    
    for (let startY = 0; startY < height; startY += batchSize) {
      const endY = Math.min(startY + batchSize, height);
      
      for (let y = startY; y < endY; y++) {
        const row = [];
        for (let x = 0; x < width; x++) {
          const pixelIndex = x * 4 + y * width * 4;
          const r = data[pixelIndex] || 255;
          const g = data[pixelIndex + 1] || 255;
          const b = data[pixelIndex + 2] || 255;
          const brightness = (r + g + b) / 3;
          
          // Apply contrast
          const adjustedBrightness = Math.pow(brightness / 255, 1 / contrast) * 255;
          row.push(adjustedBrightness);
        }
        brightnessMap.push(row);
      }
      
      // Update progress and yield control
      if (startY % (batchSize * 4) === 0) {
        this.showStatus(`Creating brightness map... ${Math.floor((startY / height) * 100)}%`);
        await this.sleep(1);
      }
    }
    
    // Apply smoothing if requested
    if (smoothing > 0) {
      this.showStatus("Applying smoothing...");
      return await this.applySmoothingToBrightnessMapAsync(brightnessMap, width, height, smoothing);
    }
    
    return brightnessMap;
  }

  async applySmoothingToBrightnessMapAsync(brightnessMap, width, height, radius) {
    const smoothedMap = [];
    const batchSize = 25; // Process fewer rows for smoothing as it's more intensive
    
    for (let startY = 0; startY < height; startY += batchSize) {
      const endY = Math.min(startY + batchSize, height);
      
      for (let y = startY; y < endY; y++) {
        const row = [];
        for (let x = 0; x < width; x++) {
          let sum = 0;
          let count = 0;
          
          // Average brightness in radius
          for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
              const nx = x + dx;
              const ny = y + dy;
              
              if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                sum += brightnessMap[ny][nx];
                count++;
              }
            }
          }
          
          row.push(sum / count);
        }
        smoothedMap.push(row);
      }
      
      // Update progress and yield control
      if (startY % batchSize === 0) {
        this.showStatus(`Applying smoothing... ${Math.floor((startY / height) * 100)}%`);
        await this.sleep(1);
      }
    }
    
    return smoothedMap;
  }

  applySmoothingToBrightnessMap(brightnessMap, width, height, radius) {
    const smoothedMap = [];
    
    for (let y = 0; y < height; y++) {
      const row = [];
      for (let x = 0; x < width; x++) {
        let sum = 0;
        let count = 0;
        
        // Average brightness in radius
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              sum += brightnessMap[ny][nx];
              count++;
            }
          }
        }
        
        row.push(sum / count);
      }
      smoothedMap.push(row);
    }
    
    return smoothedMap;
  }

  async generateHorizontalLine(y, width, brightnessMap, effectStrengthPx, penDiameter) {
    const points = [];
    const step = 2; // Sample every 2 pixels for performance
    
    for (let x = 0; x < width; x += step) {
      const brightness = this.getBrightness(brightnessMap, x, Math.floor(y), width, brightnessMap.length);
      const normalizedBrightness = brightness / 255;
      
      // Deform line based on brightness (darker = more deformation)
      const deformation = (1 - normalizedBrightness) * effectStrengthPx;
      const deformedY = y + deformation;
      
      points.push({
        x: x / this.pixelsPerMm,
        y: deformedY / this.pixelsPerMm
      });
    }
    
    return {
      points: points,
      strokeWidth: penDiameter
    };
  }

  async generateVerticalLine(x, height, brightnessMap, effectStrengthPx, penDiameter) {
    const points = [];
    const step = 2; // Sample every 2 pixels for performance
    
    for (let y = 0; y < height; y += step) {
      const brightness = this.getBrightness(brightnessMap, Math.floor(x), y, brightnessMap[0].length, height);
      const normalizedBrightness = brightness / 255;
      
      // Deform line based on brightness (darker = more deformation)
      const deformation = (1 - normalizedBrightness) * effectStrengthPx;
      const deformedX = x + deformation;
      
      points.push({
        x: deformedX / this.pixelsPerMm,
        y: y / this.pixelsPerMm
      });
    }
    
    return {
      points: points,
      strokeWidth: penDiameter
    };
  }

  async generateDiagonalLines(width, height, brightnessMap, effectStrengthPx, lineSpacingPx, penDiameter, angle) {
    const lines = [];
    const step = 2;
    
    // Calculate line starts based on angle
    const rad = (angle * Math.PI) / 180;
    const dx = Math.cos(rad);
    const dy = Math.sin(rad);
    
    // Generate diagonal lines
    const maxDimension = Math.max(width, height);
    const numLines = Math.floor((width + height) / lineSpacingPx);
    
    for (let i = 0; i < numLines; i++) {
      const startOffset = i * lineSpacingPx - maxDimension;
      const points = [];
      
      // Generate points along diagonal
      for (let t = 0; t < maxDimension * 2; t += step) {
        const x = startOffset + t * dx;
        const y = t * dy;
        
        if (x < 0 || x >= width || y < 0 || y >= height) continue;
        
        const brightness = this.getBrightness(brightnessMap, Math.floor(x), Math.floor(y), width, height);
        const normalizedBrightness = brightness / 255;
        
        // Deform perpendicular to line direction
        const perpX = -dy;
        const perpY = dx;
        const deformation = (1 - normalizedBrightness) * effectStrengthPx;
        
        const deformedX = x + perpX * deformation;
        const deformedY = y + perpY * deformation;
        
        points.push({
          x: deformedX / this.pixelsPerMm,
          y: deformedY / this.pixelsPerMm
        });
      }
      
      if (points.length > 1) {
        lines.push({
          points: points,
          strokeWidth: penDiameter
        });
      }
      
      if (i % 10 === 0) {
        this.showStatus(`Generating diagonal lines... ${i}/${numLines}`);
        await this.sleep(1);
      }
    }
    
    return lines;
  }

  getBrightness(brightnessMap, x, y, width, height) {
    x = Math.max(0, Math.min(width - 1, Math.floor(x)));
    y = Math.max(0, Math.min(height - 1, Math.floor(y)));
    return brightnessMap[y] ? (brightnessMap[y][x] || 255) : 255;
  }

  async drawLines(lines) {
    this.outputCtx.strokeStyle = "black";
    this.outputCtx.lineCap = "round";
    this.outputCtx.lineJoin = "round";
    
    const batchSize = 50;
    
    for (let i = 0; i < lines.length; i += batchSize) {
      const endIndex = Math.min(i + batchSize, lines.length);
      
      for (let j = i; j < endIndex; j++) {
        const line = lines[j];
        this.outputCtx.lineWidth = line.strokeWidth * this.pixelsPerMm;
        
        this.outputCtx.beginPath();
        const firstPoint = line.points[0];
        this.outputCtx.moveTo(firstPoint.x * this.pixelsPerMm, firstPoint.y * this.pixelsPerMm);
        
        for (let k = 1; k < line.points.length; k++) {
          const point = line.points[k];
          this.outputCtx.lineTo(point.x * this.pixelsPerMm, point.y * this.pixelsPerMm);
        }
        
        this.outputCtx.stroke();
      }
      
      if (i % batchSize === 0) {
        this.showStatus(`Drawing lines... ${Math.floor((i / lines.length) * 100)}%`);
        await this.sleep(1);
      }
    }
  }

  generateSVG(lines) {
    const widthMm = parseFloat(document.getElementById("canvasWidthValue").value);
    const heightMm = parseFloat(document.getElementById("canvasHeightValue").value);
    
    let svg = `<svg width="${widthMm}mm" height="${heightMm}mm" viewBox="0 0 ${widthMm} ${heightMm}" xmlns="http://www.w3.org/2000/svg">\n`;
    svg += `  <rect width="100%" height="100%" fill="white"/>\n`;
    
    for (const line of lines) {
      if (line.points.length < 2) continue;
      
      let pathData = `M ${line.points[0].x.toFixed(3)} ${line.points[0].y.toFixed(3)}`;
      for (let i = 1; i < line.points.length; i++) {
        pathData += ` L ${line.points[i].x.toFixed(3)} ${line.points[i].y.toFixed(3)}`;
      }
      
      svg += `  <path d="${pathData}" fill="none" stroke="black" stroke-width="${line.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>\n`;
    }
    
    svg += `</svg>`;
    this.svgContent = svg;
  }

  generateGcode(lines) {
    this.gcodeLines = [];
    
    const feedRate = parseFloat(document.getElementById("feedRateValue").value);
    const penDownZ = parseFloat(document.getElementById("penDownZValue").value);
    const penUpZ = parseFloat(document.getElementById("penUpZValue").value);
    
    // G-code header
    this.gcodeLines.push("; LineMaker 3D Effect G-code");
    this.gcodeLines.push("; Generated lines: " + lines.length);
    this.gcodeLines.push("G21 ; Set units to millimeters");
    this.gcodeLines.push("G90 ; Use absolute coordinates");
    this.gcodeLines.push("G28 ; Home all axes");
    this.gcodeLines.push(`G1 Z${penUpZ} F${feedRate} ; Pen up`);
    this.gcodeLines.push("");
    
    // Generate G-code for each line
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.points.length < 2) continue;
      
      this.gcodeLines.push(`; Line ${i + 1}`);
      
      // Move to start of line
      const startPoint = line.points[0];
      this.gcodeLines.push(`G1 X${startPoint.x.toFixed(3)} Y${startPoint.y.toFixed(3)} F${feedRate}`);
      this.gcodeLines.push(`G1 Z${penDownZ} F${feedRate/4} ; Pen down`);
      
      // Draw line
      for (let j = 1; j < line.points.length; j++) {
        const point = line.points[j];
        this.gcodeLines.push(`G1 X${point.x.toFixed(3)} Y${point.y.toFixed(3)} F${feedRate}`);
      }
      
      this.gcodeLines.push(`G1 Z${penUpZ} F${feedRate/4} ; Pen up`);
      this.gcodeLines.push("");
    }
    
    // G-code footer
    this.gcodeLines.push("G28 ; Home all axes");
    this.gcodeLines.push("M84 ; Disable motors");
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  downloadSVG() {
    if (!this.svgContent) return;
    
    const blob = new Blob([this.svgContent], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "linemaker-3d-output.svg";
    a.click();
    URL.revokeObjectURL(url);
  }

  downloadGcode() {
    if (this.gcodeLines.length === 0) return;
    
    const gcode = this.gcodeLines.join("\n");
    const blob = new Blob([gcode], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "linemaker-3d-output.gcode";
    a.click();
    URL.revokeObjectURL(url);
  }
}

// Initialize the application
new LineMaker();