class PenPlotterConverter {
  constructor() {
    this.originalCanvas = document.createElement("canvas"); // Hidden canvas for processing
    this.originalCtx = this.originalCanvas.getContext("2d");
    this.thumbnail = document.getElementById("imageThumbnail");
    this.imageData = null;
    this.originalImage = null;
    this.pixelsPerMm = 96 / 25.4; // Standard web DPI conversion

    // CMYK channel data
    this.channels = {
      C: { svg: document.getElementById("outputSvgC"), group: document.getElementById("pen-plotter-lines-C"), svgContent: "", gcodeLines: [], color: "#00FFFF" },
      M: { svg: document.getElementById("outputSvgM"), group: document.getElementById("pen-plotter-lines-M"), svgContent: "", gcodeLines: [], color: "#FF00FF" },
      Y: { svg: document.getElementById("outputSvgY"), group: document.getElementById("pen-plotter-lines-Y"), svgContent: "", gcodeLines: [], color: "#FFFF00" },
      K: { svg: document.getElementById("outputSvgK"), group: document.getElementById("pen-plotter-lines-K"), svgContent: "", gcodeLines: [], color: "#000000" }
    };

    // Chunked processing state
    this.isProcessing = false;
    this.processingCancelled = false;

    this.setupEventListeners();
    this.updateSvgSize();
  }

  setupEventListeners() {
    // File input
    document.getElementById("imageInput").addEventListener("change", (e) => {
      this.loadImage(e.target.files[0]);
    });

    // Setup number input listeners
    this.setupNumberInput("canvasWidthValue", () => {
      this.updateSvgSize();
      if (this.originalImage) this.redrawImage();
    });
    this.setupNumberInput("canvasHeightValue", () => {
      this.updateSvgSize();
      if (this.originalImage) this.redrawImage();
    });
    this.setupNumberInput("penDiameterValue", () => {
      this.cancelProcessing();
      if (this.imageData) this.processImage();
    });
    this.setupNumberInput("lineAngleValue", () => {
      this.cancelProcessing();
      if (this.imageData) this.processImage();
    });
    this.setupNumberInput("sectionWidthValue", () => {
      this.cancelProcessing();
      if (this.imageData) this.processImage();
    });
    this.setupNumberInput("lineSpacingValue", () => {
      this.cancelProcessing();
      if (this.imageData) this.processImage();
    });
    this.setupNumberInput("minLineLengthValue", () => {
      this.cancelProcessing();
      if (this.imageData) this.processImage();
    });
    this.setupNumberInput("contrastValue", () => {
      this.cancelProcessing();
      if (this.imageData) this.processImage();
    });
    this.setupNumberInput("maxMergeDistanceValue", () => {
      this.cancelProcessing();
      if (this.imageData) this.processImage();
    });
    this.setupNumberInput("feedRateValue", () => {});
    this.setupNumberInput("penDownZValue", () => {});
    this.setupNumberInput("penUpZValue", () => {});

    // CMYK channel checkboxes
    ["C", "M", "Y", "K"].forEach(channel => {
      document.getElementById(`enable${channel}`).addEventListener("change", () => {
        this.updateChannelVisibility();
        this.cancelProcessing();
        if (this.imageData) this.processImage();
      });
    });

    // Setup zoom controls
    this.syncInputs("canvasZoom", "canvasZoomValue");
    this.setupNumberInput("canvasZoomValue", () => {
      this.updateSvgZoom();
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

    // Individual channel download buttons
    ["C", "M", "Y", "K"].forEach(channel => {
      document.getElementById(`download${channel}Btn`).addEventListener("click", () => {
        this.downloadChannelSVG(channel);
      });
      document.getElementById(`download${channel}GcodeBtn`).addEventListener("click", () => {
        this.downloadChannelGcode(channel);
      });
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
      this.updateSvgZoom();
    });

    number.addEventListener("input", () => {
      slider.value = number.value;
      this.updateSvgZoom();
    });
  }

  showStatus(message, type = "processing") {
    const status = document.getElementById("status");
    status.textContent = message;
    status.className = `status ${type}`;
    status.style.display = "block";
  }

  updateSvgSize() {
    const widthMm = parseFloat(
      document.getElementById("canvasWidthValue").value
    );
    const heightMm = parseFloat(
      document.getElementById("canvasHeightValue").value
    );

    // Calculate actual canvas size in pixels (full resolution)
    const widthPx = Math.round(widthMm * this.pixelsPerMm);
    const heightPx = Math.round(heightMm * this.pixelsPerMm);

    // Set canvas to full resolution for image processing
    this.originalCanvas.width = widthPx;
    this.originalCanvas.height = heightPx;

    // Update all channel SVGs
    Object.keys(this.channels).forEach(channel => {
      const channelData = this.channels[channel];
      channelData.svg.setAttribute("viewBox", `0 0 ${widthPx} ${heightPx}`);
      channelData.svg.setAttribute("width", widthMm + "mm");
      channelData.svg.setAttribute("height", heightMm + "mm");
      channelData.svg.style.width = widthPx + "px";
      channelData.svg.style.height = heightPx + "px";
      
      // Clear SVG lines
      channelData.group.innerHTML = "";
    });

    // Apply zoom
    this.updateSvgZoom();

    // Clear canvas with white background for image processing
    this.originalCtx.fillStyle = "white";
    this.originalCtx.fillRect(0, 0, widthPx, heightPx);
  }

  updateSvgZoom() {
    const kSvg = this.channels.K.svg;
    if (!kSvg || !kSvg.parentElement) return;

    // Get current zoom value
    const zoom =
      parseFloat(document.getElementById("canvasZoomValue").value) || 1;

    // Calculate auto-fit scale to prevent SVG from being too big by default
    const previewContainer = kSvg.parentElement.parentElement; // svg-stack -> preview-area
    const containerWidth = previewContainer.clientWidth - 40;
    const containerHeight = previewContainer.clientHeight - 40;

    // Make sure container has dimensions
    if (containerWidth <= 0 || containerHeight <= 0) {
      // Retry after a short delay if container isn't ready
      setTimeout(() => this.updateSvgZoom(), 100);
      return;
    }

    const svgWidth =
      parseInt(kSvg.style.width) || 200;
    const svgHeight =
      parseInt(kSvg.style.height) || 200;

    // Make sure SVG has dimensions
    if (svgWidth <= 0 || svgHeight <= 0) return;

    const scaleX = containerWidth / svgWidth;
    const scaleY = containerHeight / svgHeight;
    const autoFitScale = Math.min(scaleX, scaleY, 1); // Don't scale up beyond 1x

    // Apply both auto-fit and user zoom
    const finalScale = autoFitScale * zoom;
    Object.keys(this.channels).forEach(channel => {
      const channelSvg = this.channels[channel].svg;
      channelSvg.style.transformOrigin = "center center";
      channelSvg.style.transform = `translateX(-50%) scale(${finalScale})`;
    });
  }

  updateChannelVisibility() {
    ["C", "M", "Y", "K"].forEach(channel => {
      const isEnabled = document.getElementById(`enable${channel}`).checked;
      const channelSvg = this.channels[channel].svg;
      channelSvg.style.display = isEnabled ? "block" : "none";
      
      // Update download buttons
      document.getElementById(`download${channel}Btn`).disabled = !isEnabled;
      document.getElementById(`download${channel}GcodeBtn`).disabled = !isEnabled;
    });
  }

  showProgress(text = "Processing...") {
    document.getElementById("progressIndicator").style.display = "flex";
    document.querySelector(".progress-text").textContent = text;
  }

  hideProgress() {
    document.getElementById("progressIndicator").style.display = "none";
  }

  updateProgress(text) {
    document.querySelector(".progress-text").textContent = text;
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

  async processImage() {
    if (!this.imageData || this.isProcessing) return;

    this.isProcessing = true;
    this.processingCancelled = false;
    this.showProgress("Initializing...");
    this.showStatus("Converting to line art...", "processing");

    try {
      // Get enabled channels
      const enabledChannels = ["C", "M", "Y", "K"].filter(channel => 
        document.getElementById(`enable${channel}`).checked
      );

      // Clear all channels first
      enabledChannels.forEach(channel => {
        this.channels[channel].group.innerHTML = "";
        this.channels[channel].gcodeLines = [];
      });

      // Process each enabled channel with chunked rendering
      for (let i = 0; i < enabledChannels.length; i++) {
        if (this.processingCancelled) break;
        
        const channel = enabledChannels[i];
        this.updateProgress(`Processing ${channel} channel (${i + 1}/${enabledChannels.length})`);
        
        await this.processChannelChunked(channel, i, enabledChannels.length);
      }

      if (!this.processingCancelled) {
        // Update line count display (sum of all channels)
        const totalLines = enabledChannels.reduce((sum, channel) => 
          sum + this.channels[channel].gcodeLines.length, 0
        );
        document.getElementById("lineCount").textContent = totalLines.toLocaleString();

        // Enable download buttons
        document.getElementById("downloadBtn").disabled = false;
        document.getElementById("downloadGcodeBtn").disabled = false;
        this.updateChannelVisibility();

        this.showStatus("Conversion complete!", "complete");
      }
    } catch (error) {
      console.error("Processing error:", error);
      this.showStatus("Processing error occurred", "error");
    } finally {
      this.isProcessing = false;
      this.hideProgress();
    }
  }

  async processChannelChunked(channel, channelIndex, totalChannels) {
    const penDiameter = parseFloat(document.getElementById("penDiameterValue").value);
    const lineAngle = parseInt(document.getElementById("lineAngleValue").value);
    const sectionWidth = parseFloat(document.getElementById("sectionWidthValue").value);
    const contrast = parseFloat(document.getElementById("contrastValue").value);
    const canvasWidthMm = parseFloat(document.getElementById("canvasWidthValue").value);
    const canvasHeightMm = parseFloat(document.getElementById("canvasHeightValue").value);
    const lineSpacing = parseFloat(document.getElementById("lineSpacingValue").value);

    const { width, height, data } = this.imageData;
    const channelData = this.channels[channel];

    // Clear channel data
    channelData.group.innerHTML = "";
    channelData.gcodeLines = [];

    // Create channel-specific intensity map using CMYK conversion
    const intensityMap = this.createChannelIntensityMap(data, width, height, channel, contrast);

    // Generate SVG header for this channel
    channelData.svgContent = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg width="${canvasWidthMm}mm" height="${canvasHeightMm}mm" 
     viewBox="0 0 ${width} ${height}" 
     version="1.1" 
     xmlns="http://www.w3.org/2000/svg" 
     xmlns:xlink="http://www.w3.org/1999/xlink">
  <defs/>
  <g id="pen-plotter-lines-${channel}" stroke="${channelData.color}" fill="none" stroke-linecap="round" stroke-linejoin="round">
`;

    // Calculate channel offset to avoid overlapping
    const penDiameterPx = penDiameter * this.pixelsPerMm;
    const channelOffset = channelIndex * penDiameterPx;

    // Convert angle to radians
    const angleRad = (lineAngle * Math.PI) / 180;
    const dx = Math.cos(angleRad);
    const dy = Math.sin(angleRad);

    // Calculate section spacing adjusted for multiple channels
    const adjustedLineSpacing = lineSpacing * totalChannels;
    const sectionSpacing = sectionWidth * this.pixelsPerMm;

    // Generate lines perpendicular to the main angle
    const perpAngle = angleRad + Math.PI / 2;
    const perpDx = Math.cos(perpAngle);
    const perpDy = Math.sin(perpAngle);

    // Calculate how many sections we need
    const diagonal = Math.sqrt(width * width + height * height);
    const numSections = Math.ceil(diagonal / sectionSpacing) * 2;

    // Process sections in chunks to prevent freezing
    const CHUNK_SIZE = 50; // Process 50 sections at a time
    const MAX_CPU_TIME = 30; // Max 30ms per chunk (30% of 100ms frame)
    
    for (let chunkStart = 0; chunkStart < numSections; chunkStart += CHUNK_SIZE) {
      if (this.processingCancelled) break;
      
      const chunkEnd = Math.min(chunkStart + CHUNK_SIZE, numSections);
      const progress = Math.round((chunkStart / numSections) * 100);
      this.updateProgress(`Processing ${channel} channel ${progress}%`);
      
      // Process chunk with CPU time limiting
      const startTime = performance.now();
      
      for (let section = chunkStart; section < chunkEnd; section++) {
        // Check CPU time every 10 sections
        if (section % 10 === 0 && performance.now() - startTime > MAX_CPU_TIME) {
          // If we're taking too long, yield control and continue in next chunk
          await this.yield();
          continue;
        }
        
        // Calculate the center line for this section with channel offset
        const baseOffset = (section - numSections / 2) * sectionSpacing;
        const offset = baseOffset + channelOffset;
        const centerX = width / 2 + perpDx * offset;
        const centerY = height / 2 + perpDy * offset;

        // Find the line segment within the image bounds
        const linePoints = this.clipLineToCanvas(centerX, centerY, dx, dy, width, height);

        if (linePoints.length === 2) {
          const [start, end] = linePoints;
          this.drawChannelLine(
            start.x, start.y, end.x, end.y,
            intensityMap, width, height,
            penDiameter, channel, adjustedLineSpacing
          );
        }
      }
      
      // Yield control between chunks
      await this.yield();
    }

    channelData.svgContent += `  </g>\n</svg>`;
  }

  // Yield control back to the browser to prevent freezing
  yield() {
    return new Promise(resolve => setTimeout(resolve, 0));
  }

  // Cancel current processing if parameters change
  cancelProcessing() {
    if (this.isProcessing) {
      this.processingCancelled = true;
      this.hideProgress();
    }
  }

  createChannelIntensityMap(data, width, height, channel, contrast) {
    const intensityMap = new Float32Array(width * height);

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i] / 255;
      const g = data[i + 1] / 255;
      const b = data[i + 2] / 255;

      // Convert RGB to CMYK
      const k = 1 - Math.max(r, g, b);
      const c = k >= 1 ? 0 : (1 - r - k) / (1 - k);
      const m = k >= 1 ? 0 : (1 - g - k) / (1 - k);
      const y = k >= 1 ? 0 : (1 - b - k) / (1 - k);

      // Get intensity for the specific channel
      let intensity = 0;
      switch (channel) {
        case 'C': intensity = c; break;
        case 'M': intensity = m; break;
        case 'Y': intensity = y; break;
        case 'K': intensity = k; break;
      }

      // Apply contrast adjustment
      intensity = Math.pow(intensity, contrast);
      intensity = Math.max(0, Math.min(1, intensity)); // Clamp between 0 and 1

      intensityMap[i / 4] = intensity;
    }

    return intensityMap;
  }

  drawChannelLine(x1, y1, x2, y2, intensityMap, width, height, penDiameter, channel, lineSpacing) {
    // This is a modified version of drawOptimizedVariableThicknessLine for channels
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
    const lineSpacingPx = lineSpacing * this.pixelsPerMm;

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

      // Merge close segments BEFORE filtering by minimum length
      const maxMergeDistanceMm = parseFloat(
        document.getElementById("maxMergeDistanceValue").value
      );
      const maxMergeDistancePx = maxMergeDistanceMm * this.pixelsPerMm;
      
      if (maxMergeDistanceMm > 0 && pathSegments.length > 1) {
        pathSegments = this.mergeCloseSegments(pathSegments, maxMergeDistancePx);
      }

      // Filter out segments shorter than minimum length AFTER merging
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
          // Add to channel SVG content string
          this.channels[channel].svgContent += `    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke-width="${strokeWidth}"/>
`;
          
          // Draw directly to channel SVG DOM
          const lineElement = document.createElementNS("http://www.w3.org/2000/svg", "line");
          lineElement.setAttribute("x1", x1);
          lineElement.setAttribute("y1", y1);
          lineElement.setAttribute("x2", x2);
          lineElement.setAttribute("y2", y2);
          lineElement.setAttribute("stroke-width", strokeWidth);
          this.channels[channel].group.appendChild(lineElement);
        }

        // Add to channel G-code
        const gcodeX1 = segment.startX / this.pixelsPerMm;
        const gcodeY1 = segment.startY / this.pixelsPerMm;
        const gcodeX2 = segment.endX / this.pixelsPerMm;
        const gcodeY2 = segment.endY / this.pixelsPerMm;

        this.channels[channel].gcodeLines.push({
          x1: gcodeX1,
          y1: gcodeY1,
          x2: gcodeX2,
          y2: gcodeY2,
        });
      });
    }
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

      // Merge close segments on the same line BEFORE filtering by minimum length
      const maxMergeDistanceMm = parseFloat(
        document.getElementById("maxMergeDistanceValue").value
      );
      const maxMergeDistancePx = maxMergeDistanceMm * this.pixelsPerMm;
      
      if (maxMergeDistanceMm > 0 && pathSegments.length > 1) {
        pathSegments = this.mergeCloseSegments(pathSegments, maxMergeDistancePx);
      }

      // Filter out segments shorter than minimum length AFTER merging
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
          // Add to SVG content string
          this.svgContent += `    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke-width="${strokeWidth}"/>
`;
          
          // Draw directly to SVG DOM
          const lineElement = document.createElementNS("http://www.w3.org/2000/svg", "line");
          lineElement.setAttribute("x1", x1);
          lineElement.setAttribute("y1", y1);
          lineElement.setAttribute("x2", x2);
          lineElement.setAttribute("y2", y2);
          lineElement.setAttribute("stroke-width", strokeWidth);
          this.linesGroup.appendChild(lineElement);
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

  mergeCloseSegments(segments, maxMergeDistancePx) {
    if (segments.length < 2) return segments;
    
    // Sort segments by their start position along the line
    segments.sort((a, b) => {
      // Use the t parameter to sort along the line direction
      return a.startT - b.startT;
    });
    
    const mergedSegments = [];
    let currentSegment = segments[0];
    
    for (let i = 1; i < segments.length; i++) {
      const nextSegment = segments[i];
      
      // Calculate distance between end of current segment and start of next segment
      const distanceX = nextSegment.startX - currentSegment.endX;
      const distanceY = nextSegment.startY - currentSegment.endY;
      const distance = Math.sqrt(distanceX * distanceX + distanceY * distanceY);
      
      if (distance <= maxMergeDistancePx) {
        // Merge segments by extending current segment to include next segment
        currentSegment.endX = nextSegment.endX;
        currentSegment.endY = nextSegment.endY;
        currentSegment.endT = nextSegment.endT;
      } else {
        // Gap is too large, finish current segment and start new one
        mergedSegments.push(currentSegment);
        currentSegment = nextSegment;
      }
    }
    
    // Don't forget the last segment
    mergedSegments.push(currentSegment);
    
    return mergedSegments;
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
    // Download combined SVG with all enabled channels
    const enabledChannels = ["C", "M", "Y", "K"].filter(channel => 
      document.getElementById(`enable${channel}`).checked
    );

    if (enabledChannels.length === 0) return;

    const canvasWidthMm = parseFloat(document.getElementById("canvasWidthValue").value);
    const canvasHeightMm = parseFloat(document.getElementById("canvasHeightValue").value);
    const { width, height } = this.imageData;

    let combinedSvg = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg width="${canvasWidthMm}mm" height="${canvasHeightMm}mm" 
     viewBox="0 0 ${width} ${height}" 
     version="1.1" 
     xmlns="http://www.w3.org/2000/svg" 
     xmlns:xlink="http://www.w3.org/1999/xlink">
  <defs/>
`;

    // Add each enabled channel's lines
    enabledChannels.forEach(channel => {
      const channelData = this.channels[channel];
      combinedSvg += `  <g id="pen-plotter-lines-${channel}" stroke="${channelData.color}" fill="none" stroke-linecap="round" stroke-linejoin="round">\n`;
      
      // Extract just the line elements from the channel's SVG content
      const lines = channelData.svgContent.match(/<line[^>]*\/>/g) || [];
      lines.forEach(line => {
        combinedSvg += `    ${line}\n`;
      });
      
      combinedSvg += `  </g>\n`;
    });

    combinedSvg += `</svg>`;

    const blob = new Blob([combinedSvg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "pen-plotter-combined.svg";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  downloadChannelSVG(channel) {
    const channelData = this.channels[channel];
    if (!channelData.svgContent) return;

    const blob = new Blob([channelData.svgContent], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pen-plotter-${channel}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  optimizeGcodePath(lines, startX, startY) {
    if (lines.length === 0) return [];
    
    // Create a copy of lines to work with
    const availableLines = [...lines];
    const optimizedPath = [];
    let currentX = startX;
    let currentY = startY;
    
    while (availableLines.length > 0) {
      let closestLineIndex = -1;
      let closestDistance = Infinity;
      let useReversed = false;
      
      // Find the closest endpoint among all remaining lines
      availableLines.forEach((line, index) => {
        // Check distance to start of line (x1, y1)
        const distToStart = Math.sqrt(
          (currentX - line.x1) ** 2 + (currentY - line.y1) ** 2
        );
        
        // Check distance to end of line (x2, y2)
        const distToEnd = Math.sqrt(
          (currentX - line.x2) ** 2 + (currentY - line.y2) ** 2
        );
        
        // Update closest if we found a better option
        if (distToStart < closestDistance) {
          closestDistance = distToStart;
          closestLineIndex = index;
          useReversed = false; // Start from x1,y1 -> x2,y2
        }
        
        if (distToEnd < closestDistance) {
          closestDistance = distToEnd;
          closestLineIndex = index;
          useReversed = true; // Start from x2,y2 -> x1,y1
        }
      });
      
      // Add the closest line to the optimized path
      const selectedLine = availableLines[closestLineIndex];
      let startX, startY, endX, endY;
      
      if (useReversed) {
        startX = selectedLine.x2;
        startY = selectedLine.y2;
        endX = selectedLine.x1;
        endY = selectedLine.y1;
      } else {
        startX = selectedLine.x1;
        startY = selectedLine.y1;
        endX = selectedLine.x2;
        endY = selectedLine.y2;
      }
      
      optimizedPath.push({ startX, startY, endX, endY });
      
      // Update current position and remove the used line
      currentX = endX;
      currentY = endY;
      availableLines.splice(closestLineIndex, 1);
    }
    
    return optimizedPath;
  }

  downloadGcode() {
    // Download combined G-code with all enabled channels
    const enabledChannels = ["C", "M", "Y", "K"].filter(channel => 
      document.getElementById(`enable${channel}`).checked
    );

    if (enabledChannels.length === 0) return;

    // Combine all G-code lines from enabled channels
    const allLines = [];
    enabledChannels.forEach(channel => {
      allLines.push(...this.channels[channel].gcodeLines);
    });

    if (allLines.length === 0) return;

    this.generateGcodeFile(allLines, "pen-plotter-combined.gcode");
  }

  downloadChannelGcode(channel) {
    const channelData = this.channels[channel];
    if (channelData.gcodeLines.length === 0) return;

    this.generateGcodeFile(channelData.gcodeLines, `pen-plotter-${channel}.gcode`);
  }

  generateGcodeFile(lines, filename) {
    if (lines.length === 0) return;

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

    // Optimize path globally to minimize total travel distance
    const optimizedPath = this.optimizeGcodePath(lines, currentX, currentY);
    
    optimizedPath.forEach((segment) => {
      const { startX, startY, endX, endY } = segment;

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
    a.download = filename;
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
