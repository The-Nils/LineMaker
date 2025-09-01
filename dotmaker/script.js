class DotMaker {
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
    this.isProcessing = false; // Prevent concurrent processing

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
    this.setupNumberInput("maxDotSpacingValue", () => {
      if (this.imageData) this.processImage();
    });
    this.setupNumberInput("minDotSpacingValue", () => {
      if (this.imageData) this.processImage();
    });
    this.setupNumberInput("dotDensityValue", () => {
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
      // Image is wider than canvas
      drawWidth = this.originalCanvas.width;
      drawHeight = drawWidth / imageAspect;
      offsetX = 0;
      offsetY = (this.originalCanvas.height - drawHeight) / 2;
    } else {
      // Image is taller than canvas
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
    if (this.isProcessing) return; // Prevent concurrent processing
    
    this.isProcessing = true;
    this.showStatus("Generating dots...", "processing");
    
    // Clear output canvas
    this.outputCtx.clearRect(0, 0, this.outputCanvas.width, this.outputCanvas.height);
    this.outputCtx.fillStyle = "white";
    this.outputCtx.fillRect(0, 0, this.outputCanvas.width, this.outputCanvas.height);

    try {
      const dots = await this.generateDotsAsync();
      await this.drawDotsAsync(dots);
      this.generateSVG(dots);
      this.generateGcode(dots);
      
      // Update statistics
      document.getElementById("dotCount").textContent = dots.length;
      
      // Enable download buttons
      document.getElementById("downloadBtn").disabled = false;
      document.getElementById("downloadGcodeBtn").disabled = false;
      
      this.hideStatus();
    } catch (error) {
      console.error("Processing error:", error);
      this.showStatus("Processing failed. Try reducing canvas size or dot density.", "error");
    } finally {
      this.isProcessing = false;
    }
  }

  async generateDotsAsync() {
    const data = this.imageData.data;
    const width = this.imageData.width;
    const height = this.imageData.height;
    
    // Get parameters
    const dotSize = parseFloat(document.getElementById("penDiameterValue").value);
    const maxSpacing = parseFloat(document.getElementById("maxDotSpacingValue").value);
    const minSpacing = parseFloat(document.getElementById("minDotSpacingValue").value);
    const dotDensity = parseFloat(document.getElementById("dotDensityValue").value);
    const contrast = parseFloat(document.getElementById("contrastValue").value);
    
    const maxSpacingPx = maxSpacing * this.pixelsPerMm;
    const minSpacingPx = minSpacing * this.pixelsPerMm;
    
    // Use deterministic grid-based approach instead of random Poisson sampling
    const dots = [];
    
    // Create a seeded random number generator for consistent results
    let seed = 12345; // Fixed seed for reproducible results
    const seededRandom = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    
    this.showStatus("Analyzing image brightness...");
    
    // First pass: analyze brightness to determine grid density
    const brightnessMap = [];
    const sampleSize = 4; // Sample every 4th pixel for performance
    
    for (let y = 0; y < height; y += sampleSize) {
      const row = [];
      for (let x = 0; x < width; x += sampleSize) {
        const pixelIndex = x * 4 + y * width * 4;
        const r = data[pixelIndex] || 255;
        const g = data[pixelIndex + 1] || 255;
        const b = data[pixelIndex + 2] || 255;
        const brightness = (r + g + b) / 3;
        
        // Apply contrast adjustment
        const adjustedBrightness = Math.pow(brightness / 255, 1 / contrast) * 255;
        row.push(adjustedBrightness);
      }
      brightnessMap.push(row);
      
      // Yield control periodically
      if (y % (sampleSize * 50) === 0) {
        this.showStatus(`Analyzing brightness... ${Math.floor((y / height) * 100)}%`);
        await this.sleep(1);
      }
    }
    
    this.showStatus("Placing dots deterministically...");
    
    // Second pass: place dots based on brightness with consistent spacing
    const mapWidth = Math.ceil(width / sampleSize);
    const mapHeight = Math.ceil(height / sampleSize);
    
    let dotCount = 0;
    const maxDots = 50000;
    
    for (let mapY = 0; mapY < mapHeight && dotCount < maxDots; mapY++) {
      for (let mapX = 0; mapX < mapWidth && dotCount < maxDots; mapX++) {
        const brightness = brightnessMap[mapY] ? brightnessMap[mapY][mapX] || 255 : 255;
        const normalizedBrightness = brightness / 255;
        
        // Skip very bright areas
        if (brightness > 240) continue;
        
        // Determine if we should place a dot here based on brightness and density
        // Higher dotDensity = more dots, lower threshold for placement
        const baseThreshold = 200; // Base brightness threshold
        const densityAdjustment = (1 - dotDensity) * 60; // Higher density = lower threshold
        const brightnesThreshold = baseThreshold + densityAdjustment;
        
        const shouldPlaceDot = brightness < brightnesThreshold;
        
        if (shouldPlaceDot) {
          // Convert map coordinates back to pixel coordinates
          const centerX = mapX * sampleSize + sampleSize / 2;
          const centerY = mapY * sampleSize + sampleSize / 2;
          
          // Add small deterministic jitter to avoid perfect grid
          const jitterX = (seededRandom() - 0.5) * sampleSize * 0.5;
          const jitterY = (seededRandom() - 0.5) * sampleSize * 0.5;
          
          const finalX = Math.max(0, Math.min(width - 1, centerX + jitterX));
          const finalY = Math.max(0, Math.min(height - 1, centerY + jitterY));
          
          // Check spacing with existing dots in nearby area (simplified)
          let tooClose = false;
          
          for (let i = Math.max(0, dots.length - 100); i < dots.length; i++) {
            const existingDot = dots[i];
            const existingX = existingDot.x * this.pixelsPerMm;
            const existingY = existingDot.y * this.pixelsPerMm;
            
            const distance = Math.sqrt((finalX - existingX) ** 2 + (finalY - existingY) ** 2);
            if (distance < minSpacingPx) {
              tooClose = true;
              break;
            }
          }
          
          if (!tooClose) {
            dots.push({
              x: finalX / this.pixelsPerMm,
              y: finalY / this.pixelsPerMm,
              size: dotSize
            });
            dotCount++;
          }
        }
      }
      
      // Update progress and yield control
      if (mapY % 10 === 0) {
        this.showStatus(`Placing dots... ${dotCount} dots, ${Math.floor((mapY / mapHeight) * 100)}%`);
        await this.sleep(1);
      }
    }
    
    // Clear references for garbage collection
    brightnessMap.length = 0;
    
    this.showStatus(`Generated ${dots.length} dots consistently`);
    await this.sleep(100); // Brief pause to show final status
    
    return dots;
  }

  // Helper method to create non-blocking delays
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async drawDotsAsync(dots) {
    this.outputCtx.strokeStyle = "black";
    this.outputCtx.fillStyle = "none";
    this.outputCtx.lineWidth = 1;
    
    const batchSize = 500; // Draw dots in batches to prevent blocking
    
    for (let i = 0; i < dots.length; i += batchSize) {
      const endIndex = Math.min(i + batchSize, dots.length);
      
      // Draw batch of dots
      for (let j = i; j < endIndex; j++) {
        const dot = dots[j];
        const x = dot.x * this.pixelsPerMm;
        const y = dot.y * this.pixelsPerMm;
        const radius = (dot.size / 2) * this.pixelsPerMm;
        
        this.outputCtx.beginPath();
        this.outputCtx.arc(x, y, radius, 0, 2 * Math.PI);
        this.outputCtx.stroke();
      }
      
      // Update progress and yield control
      if (i % batchSize === 0) {
        this.showStatus(`Drawing dots... ${Math.floor((i / dots.length) * 100)}%`);
        await this.sleep(1);
      }
    }
  }

  generateSVG(dots) {
    const widthMm = parseFloat(document.getElementById("canvasWidthValue").value);
    const heightMm = parseFloat(document.getElementById("canvasHeightValue").value);
    
    let svg = `<svg width="${widthMm}mm" height="${heightMm}mm" viewBox="0 0 ${widthMm} ${heightMm}" xmlns="http://www.w3.org/2000/svg">\n`;
    svg += `  <rect width="100%" height="100%" fill="white"/>\n`;
    
    for (const dot of dots) {
      const radius = dot.size / 2;
      svg += `  <circle cx="${dot.x.toFixed(3)}" cy="${dot.y.toFixed(3)}" r="${radius.toFixed(3)}" fill="none" stroke="black" stroke-width="0.1"/>\n`;
    }
    
    svg += `</svg>`;
    this.svgContent = svg;
  }

  generateGcode(dots) {
    this.gcodeLines = [];
    
    const feedRate = parseFloat(document.getElementById("feedRateValue").value);
    const penDownZ = parseFloat(document.getElementById("penDownZValue").value);
    const penUpZ = parseFloat(document.getElementById("penUpZValue").value);
    const dotSize = parseFloat(document.getElementById("penDiameterValue").value); // Use pen diameter as dot size
    
    // G-code header
    this.gcodeLines.push("; DotMaker G-code");
    this.gcodeLines.push("; Generated dots: " + dots.length);
    this.gcodeLines.push("G21 ; Set units to millimeters");
    this.gcodeLines.push("G90 ; Use absolute coordinates");
    this.gcodeLines.push("G28 ; Home all axes");
    this.gcodeLines.push(`G1 Z${penUpZ} F${feedRate} ; Pen up`);
    this.gcodeLines.push("");
    
    // Generate dots by moving to position and making small circular motion
    for (let i = 0; i < dots.length; i++) {
      const dot = dots[i];
      
      this.gcodeLines.push(`; Dot ${i + 1}`);
      this.gcodeLines.push(`G1 X${dot.x.toFixed(3)} Y${dot.y.toFixed(3)} F${feedRate}`);
      this.gcodeLines.push(`G1 Z${penDownZ} F${feedRate/4} ; Pen down`);
      
      // Create circular motion for the dot using pen diameter
      const radius = dotSize / 2; // Use full pen diameter radius
      this.gcodeLines.push(`G2 X${dot.x.toFixed(3)} Y${dot.y.toFixed(3)} I${radius.toFixed(3)} J0 F${feedRate/2}`);
      
      this.gcodeLines.push(`G1 Z${penUpZ} F${feedRate/4} ; Pen up`);
      this.gcodeLines.push("");
    }
    
    // G-code footer
    this.gcodeLines.push("G28 ; Home all axes");
    this.gcodeLines.push("M84 ; Disable motors");
  }

  downloadSVG() {
    if (!this.svgContent) return;
    
    const blob = new Blob([this.svgContent], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "dotmaker-output.svg";
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
    a.download = "dotmaker-output.gcode";
    a.click();
    URL.revokeObjectURL(url);
  }
}

// Initialize the application
new DotMaker();