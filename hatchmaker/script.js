class PenPlotterConverter {
  constructor() {
    this.originalCanvas = document.createElement("canvas"); // Hidden canvas for processing
    this.originalCtx = this.originalCanvas.getContext("2d");
    this.thumbnail = document.getElementById("imageThumbnail");
    this.imageData = null;
    this.originalImage = null;
    this.originalFilename = null; // Store original filename for downloads
    this.pixelsPerMm = 96 / 25.4; // Standard web DPI conversion

    // CMYK channel data
    this.channels = {
      C: {
        svg: document.getElementById("outputSvgC"),
        group: document.getElementById("pen-plotter-lines-C"),
        svgContent: "",
        lineCount: 0,
        lineSegments: [],
        color: "#00FFFF",
        renderColor: "#00FFFF",
      },
      M: {
        svg: document.getElementById("outputSvgM"),
        group: document.getElementById("pen-plotter-lines-M"),
        svgContent: "",
        lineCount: 0,
        lineSegments: [],
        color: "#FF00FF",
        renderColor: "#FF00FF",
      },
      Y: {
        svg: document.getElementById("outputSvgY"),
        group: document.getElementById("pen-plotter-lines-Y"),
        svgContent: "",
        lineCount: 0,
        lineSegments: [],
        color: "#FFFF00",
        renderColor: "#FFFF00",
      },
      K: {
        svg: document.getElementById("outputSvgK"),
        group: document.getElementById("pen-plotter-lines-K"),
        svgContent: "",
        lineCount: 0,
        lineSegments: [],
        color: "#000000",
        renderColor: "#000000",
      },
    };

    // Render order from top to bottom (last item is bottom-most)
    this.channelOrder = ["C", "M", "Y", "K"];

    // Chunked processing state
    this.isProcessing = false;
    this.processingCancelled = false;

    // Track manual adjustments to avoid overriding user changes
    this.lastManualAdjustment = 0;

    // Debouncing for input changes
    this.debounceTimer = null;
    this.debounceDelay = 500; // 500ms delay

    // Initialize ConfigManager
    this.configManager = new ConfigManager();
    this.toolId = "hatchmaker";

    // Initialize InteractiveCanvas for preview area
    this.previewArea = document.querySelector(".preview-area");
    this.interactiveCanvas = new InteractiveCanvas(this.previewArea, {
      minZoom: 0.1,
      maxZoom: 20,
      enablePan: true,
      enableZoom: true,
    });

    this.setupEventListeners();
    this.renderChannelOrderControls();
    this.applyChannelOrder();
    this.updateSvgSize();
    this.initializeChannelColors();
    // Initial auto-computation
    this.autoComputeSpacingParameters();
    
    // Check for URL parameter to load a specific configuration
    this.checkForUrlConfig();
  }

  setupEventListeners() {
    // Setup drop zone functionality
    this.setupDropZone();

    // File input (still used by drop zone)
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
      this.autoComputeSpacingParameters();
    });
    this.setupNumberInput("penDownZValue", () => {
      this.showStatus("Pen down Z updated for next G-code export.", "complete");
    });
    this.setupNumberInput("penUpZValue", () => {
      this.showStatus("Pen up Z updated for next G-code export.", "complete");
    });
    this.setupNumberInput("preventZhopValue", () => {
      this.showStatus("Prevent Z-hop threshold updated.", "complete");
    });
    this.setupNumberInput("lineAngleValue", () => {
      this.debouncedProcessImage();
    });
    this.setupNumberInput("sectionWidthValue", () => {
      this.debouncedProcessImage();
    });
    this.setupNumberInput("lineSpacingValue", () => {
      this.debouncedProcessImage();
    });
    this.setupNumberInput("minLineLengthValue", () => {
      this.debouncedProcessImage();
    });
    this.setupNumberInput("contrastValue", () => {
      this.debouncedProcessImage();
    });
    this.setupNumberInput("maxMergeDistanceValue", () => {
      this.debouncedProcessImage();
    });
    this.setupNumberInput("maxLinesPerChannelValue", () => {
      this.autoComputeSpacingParameters();
    });

    // CMYK channel checkboxes
    ["C", "M", "Y", "K"].forEach((channel) => {
      document
        .getElementById(`enable${channel}`)
        .addEventListener("change", () => {
          this.updateChannelVisibility();
          this.autoComputeSpacingParameters();
        });

      // Color picker event listeners
      document
        .getElementById(`renderColor${channel}`)
        .addEventListener("change", (e) => {
          this.updateChannelRenderColor(channel, e.target.value);
          this.renderChannelOrderControls();
        });

      // White point controls - sync slider and number input
      this.syncInputs(
        `whitePoint${channel}`,
        `whitePoint${channel}Value`,
        channel
      );
      document
        .getElementById(`whitePoint${channel}Value`)
        .addEventListener("input", () => {
          this.debouncedProcessImage(channel);
        });
    });

    // Channel order controls
    this.setupChannelOrderControls();

    // Setup zoom controls
    this.syncInputs("canvasZoom", "canvasZoomValue");
    this.setupNumberInput("canvasZoomValue", () => {
      this.updateSvgZoom();
    });

    // Note: Download buttons are now handled by setupDropdowns() method

    // Recalculate optimal values button
    document.getElementById("recalculateBtn").addEventListener("click", () => {
      this.calculateOptimalValues();
    });

    // Save/Load configuration buttons
    document.getElementById("saveConfigBtn").addEventListener("click", () => {
      this.saveConfiguration();
    });

    document.getElementById("loadConfigBtn").addEventListener("click", () => {
      this.loadConfiguration();
    });

    // Canvas control buttons
    document.getElementById("fitToContentBtn").addEventListener("click", () => {
      this.interactiveCanvas.fitToContent();
    });

    document.getElementById("resetViewBtn").addEventListener("click", () => {
      this.interactiveCanvas.resetTransform();
    });

    // Redraw button
    document.getElementById("redrawBtn").addEventListener("click", () => {
      if (this.originalImage) {
        this.redrawImage();
      }
    });

    // Setup dropdown functionality
    this.setupDropdowns();
  }

  setupNumberInput(inputId, callback) {
    const input = document.getElementById(inputId);
    input.addEventListener("input", callback);
  }

  syncInputs(sliderId, numberId, channel = null) {
    const slider = document.getElementById(sliderId);
    const number = document.getElementById(numberId);

    slider.addEventListener("input", () => {
      number.value = slider.value;
      // Handle different types of controls
      if (sliderId === "canvasZoom") {
        this.updateSvgZoom();
      } else if (sliderId.startsWith("whitePoint") && channel) {
        this.debouncedProcessImage(channel);
      }
    });

    number.addEventListener("input", () => {
      slider.value = number.value;
      // Handle different types of controls
      if (numberId === "canvasZoomValue") {
        this.updateSvgZoom();
      }
      // White point number inputs already have their own listeners
    });
  }

  showStatus(message, type = "processing") {
    const status = document.getElementById("status");
    status.textContent = message;
    status.className = `status-notification ${type}`;
    status.style.display = "block";

    // Add show class for animation
    setTimeout(() => status.classList.add("show"), 10);

    // Auto-hide after 4 seconds unless it's processing
    if (type !== "processing") {
      setTimeout(() => {
        status.classList.remove("show");
        setTimeout(() => (status.style.display = "none"), 300);
      }, 4000);
    }
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
    Object.keys(this.channels).forEach((channel) => {
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

    const svgWidth = parseInt(kSvg.style.width) || 200;
    const svgHeight = parseInt(kSvg.style.height) || 200;

    // Make sure SVG has dimensions
    if (svgWidth <= 0 || svgHeight <= 0) return;

    const scaleX = containerWidth / svgWidth;
    const scaleY = containerHeight / svgHeight;
    const autoFitScale = Math.min(scaleX, scaleY, 1); // Don't scale up beyond 1x

    // Apply both auto-fit and user zoom
    const finalScale = autoFitScale * zoom;
    Object.keys(this.channels).forEach((channel) => {
      const channelSvg = this.channels[channel].svg;
      channelSvg.style.transformOrigin = "center center";
      channelSvg.style.transform = `translateX(-50%) scale(${finalScale})`;
    });
  }

  updateChannelVisibility() {
    ["C", "M", "Y", "K"].forEach((channel) => {
      const isEnabled = document.getElementById(`enable${channel}`).checked;
      const channelSvg = this.channels[channel].svg;
      channelSvg.style.display = isEnabled ? "block" : "none";

      // Update download buttons
      const downloadBtn = document.getElementById(`download${channel}Btn`);
      if (downloadBtn) {
        downloadBtn.disabled = !isEnabled;
      }

      // Some views don't expose per-channel G-code buttons; guard to avoid null deref
      const downloadGcodeBtn = document.getElementById(
        `download${channel}GcodeBtn`
      );
      if (downloadGcodeBtn) {
        downloadGcodeBtn.disabled = !isEnabled;
        downloadGcodeBtn.classList.toggle("disabled", !isEnabled);
      }
    });

    this.updateGcodeButtonStates();
  }

  updateGcodeButtonStates() {
    const totalLines = this.getEnabledChannelsInOrder().reduce((sum, channel) => {
      return sum + (this.channels[channel].lineCount || 0);
    }, 0);
    const hasLines = totalLines > 0;

    const gcodeTrigger = document.getElementById("gcodeDownloadBtn");
    if (gcodeTrigger) {
      gcodeTrigger.disabled = !hasLines;
    }

    const combinedLink = document.getElementById("downloadGcodeCombinedBtn");
    if (combinedLink) {
      combinedLink.classList.toggle("disabled", !hasLines);
    }

    // Per-channel links get disabled via updateChannelVisibility; keep them in sync when no lines exist
    ["C", "M", "Y", "K"].forEach((channel) => {
      const link = document.getElementById(`download${channel}GcodeBtn`);
      if (link) {
        const channelEnabled =
          document.getElementById(`enable${channel}`)?.checked;
        const shouldDisable = !hasLines || !channelEnabled;
        link.classList.toggle("disabled", shouldDisable);
        link.disabled = shouldDisable;
      }
    });
  }

  getEnabledChannelsInOrder() {
    const enabledSet = new Set(
      ["C", "M", "Y", "K"].filter(
        (channel) => document.getElementById(`enable${channel}`).checked
      )
    );

    // Respect the user-defined order, append any enabled channels that were missing
    const ordered = this.channelOrder.filter((channel) =>
      enabledSet.has(channel)
    );
    ["C", "M", "Y", "K"].forEach((channel) => {
      if (enabledSet.has(channel) && !ordered.includes(channel)) {
        ordered.push(channel);
      }
    });

    return ordered;
  }

  sanitizeChannelOrder(order) {
    const allowed = ["C", "M", "Y", "K"];
    const deduped = [];

    (order || []).forEach((channel) => {
      if (allowed.includes(channel) && !deduped.includes(channel)) {
        deduped.push(channel);
      }
    });

    // Append any missing channels
    allowed.forEach((channel) => {
      if (!deduped.includes(channel)) {
        deduped.push(channel);
      }
    });

    // Keep K as the base layer to preserve the paper background
    const filtered = deduped.filter((channel) => channel !== "K");
    filtered.push("K");
    return filtered;
  }

  applyChannelOrder() {
    this.channelOrder = this.sanitizeChannelOrder(this.channelOrder);

    // Highest z-index should be first item (top of stack)
    this.channelOrder.forEach((channel, index) => {
      const svg = this.channels[channel]?.svg;
      if (svg) {
        svg.style.zIndex = this.channelOrder.length - index;
      }
    });
  }

  renderChannelOrderControls() {
    const list = document.getElementById("channelOrderList");
    if (!list) return;

    const names = {
      C: "Cyan",
      M: "Magenta",
      Y: "Yellow",
      K: "Black",
    };
    const maxMovableIndex = this.channelOrder.length - 2; // Last slot reserved for K

    list.innerHTML = "";

    this.channelOrder.forEach((channel, index) => {
      const color =
        this.channels[channel]?.renderColor ||
        this.channels[channel]?.color ||
        "#000";
      const isBlackChannel = channel === "K";
      const upDisabled = isBlackChannel || index === 0;
      const downDisabled = isBlackChannel || index >= maxMovableIndex;

      const row = document.createElement("div");
      row.className = "channel-order-row";
      row.dataset.channel = channel;
      row.innerHTML = `
        <div class="channel-order-label">
          <span class="channel-order-swatch" style="background: ${color};"></span>
          <span>${channel} (${names[channel] || channel})</span>
          ${
            isBlackChannel
              ? '<span class="channel-order-note">Paper/base</span>'
              : ""
          }
        </div>
        <div class="channel-order-buttons">
          <button type="button" class="reorder-btn" data-channel="${channel}" data-direction="up" ${
        upDisabled ? "disabled" : ""
      }>↑</button>
          <button type="button" class="reorder-btn" data-channel="${channel}" data-direction="down" ${
        downDisabled ? "disabled" : ""
      }>↓</button>
        </div>
      `;

      list.appendChild(row);
    });
  }

  setupChannelOrderControls() {
    const list = document.getElementById("channelOrderList");
    if (!list) return;

    list.addEventListener("click", (e) => {
      const button = e.target.closest(".reorder-btn");
      if (!button) return;

      const channel = button.dataset.channel;
      const direction = button.dataset.direction === "up" ? -1 : 1;
      this.moveChannel(channel, direction);
    });
  }

  moveChannel(channel, delta) {
    if (channel === "K") {
      // Keep black at the bottom to avoid covering other channels
      return;
    }

    const currentIndex = this.channelOrder.indexOf(channel);
    if (currentIndex === -1) return;

    const maxIndex = this.channelOrder.length - 2; // Prevent moving past K
    const targetIndex = currentIndex + delta;
    if (targetIndex < 0 || targetIndex > maxIndex) return;

    const newOrder = [...this.channelOrder];
    [newOrder[currentIndex], newOrder[targetIndex]] = [
      newOrder[targetIndex],
      newOrder[currentIndex],
    ];

    this.channelOrder = this.sanitizeChannelOrder(newOrder);
    this.applyChannelOrder();
    this.renderChannelOrderControls();
  }

  updateChannelRenderColor(channel, newColor) {
    // Update the renderColor for this channel
    this.channels[channel].renderColor = newColor;

    // Update the stroke color of the SVG group for preview
    const channelGroup = this.channels[channel].group;
    if (channelGroup) {
      channelGroup.setAttribute("stroke", newColor);
    }

    // Update all existing line elements in this channel to use the new color
    const lines = channelGroup.querySelectorAll("line");
    lines.forEach((line) => {
      line.setAttribute("stroke", newColor);
    });
  }

  initializeChannelColors() {
    // Initialize the color picker values and update SVG groups
    ["C", "M", "Y", "K"].forEach((channel) => {
      const colorInput = document.getElementById(`renderColor${channel}`);
      const channelData = this.channels[channel];

      // Set color input to match the initial renderColor
      colorInput.value = channelData.renderColor;

      // Set initial stroke color on SVG groups
      if (channelData.group) {
        channelData.group.setAttribute("stroke", channelData.renderColor);
      }
    });
  }

  generateMetadataComment() {
    // Get all current parameter values
    const params = {
      image: this.originalFilename || "unknown",
      canvasWidth: document.getElementById("canvasWidthValue").value + "mm",
      canvasHeight: document.getElementById("canvasHeightValue").value + "mm",
      penDiameter: document.getElementById("penDiameterValue").value + "mm",
      penDownZ: document.getElementById("penDownZValue").value + "mm",
      penUpZ: document.getElementById("penUpZValue").value + "mm",
      preventZhop:
        document.getElementById("preventZhopValue").value + "mm threshold",
      lineAngle: document.getElementById("lineAngleValue").value + "°",
      sectionWidth: document.getElementById("sectionWidthValue").value + "mm",
      lineSpacing: document.getElementById("lineSpacingValue").value + "mm",
      minLineLength: document.getElementById("minLineLengthValue").value + "mm",
      contrast: document.getElementById("contrastValue").value,
      maxMergeDistance:
        document.getElementById("maxMergeDistanceValue").value + "mm",
      maxLinesPerChannel:
        document.getElementById("maxLinesPerChannelValue").value + " lines",
      whitePointC: document.getElementById("whitePointCValue").value,
      whitePointM: document.getElementById("whitePointMValue").value,
      whitePointY: document.getElementById("whitePointYValue").value,
      whitePointK: document.getElementById("whitePointKValue").value,
      generatedAt: new Date().toISOString(),
    };

    // Get enabled channels
    const enabledChannels = this.getEnabledChannelsInOrder();

    params.channelOrder = this.channelOrder.join(" > ");

    return { params, enabledChannels };
  }

  calculateOptimalValues() {
    // Get current pen diameter
    const penDiameter = parseFloat(
      document.getElementById("penDiameterValue").value
    );

    // Get enabled channels count
    const enabledChannels = this.getEnabledChannelsInOrder();
    const channelCount = enabledChannels.length;

    if (channelCount === 0) {
      this.showStatus("Please enable at least one channel first", "error");
      return;
    }

    // Calculate optimal line spacing based on pen diameter
    // Line spacing equals pen diameter for no overlap
    const optimalLineSpacing = penDiameter;

    // Calculate optimal section width based on max lines per channel parameter
    const maxLinesPerChannel = parseInt(
      document.getElementById("maxLinesPerChannelValue").value
    );
    const channelLineSpacing = optimalLineSpacing * channelCount;
    const optimalSectionWidth = maxLinesPerChannel * channelLineSpacing;

    // Update both values
    document.getElementById("lineSpacingValue").value =
      optimalLineSpacing.toFixed(2);
    document.getElementById("sectionWidthValue").value =
      optimalSectionWidth.toFixed(1);

    // Show visual feedback
    this.showStatus(
      `Optimal values: Line spacing ${optimalLineSpacing.toFixed(
        2
      )}mm, Section width ${optimalSectionWidth.toFixed(1)}mm`,
      "complete"
    );

    // Reprocess the image with new parameters
    this.debouncedProcessImage();
  }

  autoComputeSpacingParameters() {
    // Get current pen diameter
    const penDiameter = parseFloat(
      document.getElementById("penDiameterValue").value
    );

    // Get enabled channels count
    const enabledChannels = this.getEnabledChannelsInOrder();
    const channelCount = enabledChannels.length;

    if (channelCount === 0) return;

    // Get current line spacing (user-set value)
    const currentLineSpacing = parseFloat(
      document.getElementById("lineSpacingValue").value
    );

    // Only auto-compute section width based on max lines per channel parameter and current line spacing
    const maxLinesPerChannel = parseInt(
      document.getElementById("maxLinesPerChannelValue").value
    );
    const channelLineSpacing = currentLineSpacing * channelCount;
    const autoSectionWidth = maxLinesPerChannel * channelLineSpacing;

    // Only update section width, leave line spacing as user set it
    document.getElementById("sectionWidthValue").value =
      autoSectionWidth.toFixed(1);

    // Show visual feedback that auto-computation happened
    this.showStatus(
      `Auto-adjusted section width to ${autoSectionWidth.toFixed(
        1
      )}mm (based on ${channelCount} channels × ${currentLineSpacing}mm spacing)`,
      "complete"
    );

    // Reprocess the image with new parameters
    this.debouncedProcessImage();
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

    // Store original filename (without extension for cleaner downloads)
    this.originalFilename = file.name.replace(/\.[^/.]+$/, "");

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

          // Update drop zone display if callback exists
          if (this.originalImageLoadCallback) {
            this.originalImageLoadCallback(img);
          }

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

    // Fit content to canvas after image is loaded
    setTimeout(() => {
      this.interactiveCanvas.fitToContent();
    }, 100);
  }

  async processImage() {
    if (!this.imageData || this.isProcessing) return;

    this.isProcessing = true;
    this.processingCancelled = false;
    this.showProgress("Initializing...");
    this.showStatus("Converting to line art...", "processing");

    try {
      // Get enabled channels
      const enabledChannels = this.getEnabledChannelsInOrder();

      // Clear all channels first
      enabledChannels.forEach((channel) => {
        const data = this.channels[channel];
        data.group.innerHTML = "";
        data.lineCount = 0;
      });

      // Process each enabled channel with chunked rendering
      for (let i = 0; i < enabledChannels.length; i++) {
        if (this.processingCancelled) break;

        const channel = enabledChannels[i];
        this.updateProgress(
          `Processing ${channel} channel (${i + 1}/${enabledChannels.length})`
        );

        await this.processChannelChunked(channel, i, enabledChannels.length);
      }

      if (!this.processingCancelled) {
        // Update line count display (sum of all channels)
        const totalLines = enabledChannels.reduce((sum, channel) => {
          return sum + (this.channels[channel].lineCount || 0);
        }, 0);
        document.getElementById("lineCount").textContent =
          totalLines.toLocaleString();

        // Enable download buttons
        document.getElementById("downloadBtn").disabled = false;
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
    const lineSpacing = parseFloat(
      document.getElementById("lineSpacingValue").value
    );

    const { width, height, data } = this.imageData;
    const channelData = this.channels[channel];

    // Clear channel data
    channelData.group.innerHTML = "";
    channelData.lineCount = 0;
    channelData.lineSegments = [];

    // Create channel-specific intensity map using CMYK conversion
    const intensityMap = this.createChannelIntensityMap(
      data,
      width,
      height,
      channel,
      contrast
    );

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

    // Calculate line spacing in pixels for absolute positioning
    const lineSpacingPx = lineSpacing * this.pixelsPerMm;

    // Convert angle to radians
    const angleRad = (lineAngle * Math.PI) / 180;
    const dx = Math.cos(angleRad);
    const dy = Math.sin(angleRad);

    // Calculate section spacing - no adjustment needed for interleaved channels
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

    for (
      let chunkStart = 0;
      chunkStart < numSections;
      chunkStart += CHUNK_SIZE
    ) {
      if (this.processingCancelled) break;

      const chunkEnd = Math.min(chunkStart + CHUNK_SIZE, numSections);
      const progress = Math.round((chunkStart / numSections) * 100);
      this.updateProgress(`Processing ${channel} channel ${progress}%`);

      // Process chunk with CPU time limiting
      const startTime = performance.now();

      for (let section = chunkStart; section < chunkEnd; section++) {
        // Check CPU time every 10 sections
        if (
          section % 10 === 0 &&
          performance.now() - startTime > MAX_CPU_TIME
        ) {
          // If we're taking too long, yield control and continue in next chunk
          await this.yield();
          continue;
        }

        // Calculate the center line for this section
        const baseOffset = (section - numSections / 2) * sectionSpacing;

        // For interleaved channels, distribute lines within each section
        // Each channel gets its position based on absolute line spacing
        const channelOffsetWithinSection = channelIndex * lineSpacingPx;
        const offset = baseOffset + channelOffsetWithinSection;

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
          this.drawChannelLine(
            start.x,
            start.y,
            end.x,
            end.y,
            intensityMap,
            width,
            height,
            penDiameter,
            channel,
            lineSpacing * totalChannels
          );
        }
      }

      // Yield control between chunks
      await this.yield();
    }

    channelData.svgContent += `  </g>\n</svg>`;

    // Store the base SVG content without drag lines for individual downloads
    // Drag lines will be added dynamically during download
  }

  // Yield control back to the browser to prevent freezing
  yield() {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  // Cancel current processing if parameters change
  cancelProcessing() {
    if (this.isProcessing) {
      this.processingCancelled = true;
      this.hideProgress();
    }
  }

  debouncedProcessImage(channel = null) {
    // Clear existing timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    // Cancel current processing
    this.cancelProcessing();

    // Set new timer
    this.debounceTimer = setTimeout(() => {
      if (this.imageData) {
        if (channel) {
          // Process only the specific channel
          this.processSpecificChannel(channel);
        } else {
          // Process all channels
          this.processImage();
        }
      }
      this.debounceTimer = null;
    }, this.debounceDelay);
  }

  async processSpecificChannel(targetChannel) {
    if (!this.imageData || this.isProcessing) return;

    this.isProcessing = true;
    this.processingCancelled = false;
    this.showProgress(`Processing ${targetChannel} channel...`);
    this.showStatus(`Updating ${targetChannel} channel...`, "processing");

    try {
      // Get enabled channels to find the index
      const enabledChannels = this.getEnabledChannelsInOrder();

      const channelIndex = enabledChannels.indexOf(targetChannel);
      if (channelIndex === -1) {
        // Channel is not enabled, just clear it
        const data = this.channels[targetChannel];
        data.group.innerHTML = "";
        data.lineCount = 0;
        this.hideProgress();
        this.isProcessing = false;
        return;
      }

      // Process only the target channel
      await this.processChannelChunked(
        targetChannel,
        channelIndex,
        enabledChannels.length
      );

      if (!this.processingCancelled) {
        // Update line count display (sum of all channels)
        const totalLines = this.getEnabledChannelsInOrder().reduce(
          (sum, channel) => sum + (this.channels[channel].lineCount || 0),
          0
        );
        document.getElementById("lineCount").textContent =
          totalLines.toLocaleString();

        // Update download button states
        this.updateChannelVisibility();

        this.showStatus(`${targetChannel} channel updated!`, "complete");
      }
    } catch (error) {
      console.error("Channel processing error:", error);
      this.showStatus(`Error updating ${targetChannel} channel`, "error");
    } finally {
      this.isProcessing = false;
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
        case "C":
          intensity = c;
          break;
        case "M":
          intensity = m;
          break;
        case "Y":
          intensity = y;
          break;
        case "K":
          intensity = k;
          break;
      }

      // Apply white point thresholding - values below white point become 0
      const whitePoint = parseFloat(
        document.getElementById(`whitePoint${channel}Value`).value
      );
      if (intensity <= whitePoint) {
        intensity = 0;
      } else {
        // Rescale intensity from white point to 1
        intensity = (intensity - whitePoint) / (1 - whitePoint);
      }

      // Apply contrast adjustment
      intensity = Math.pow(intensity, contrast);
      intensity = Math.max(0, Math.min(1, intensity)); // Clamp between 0 and 1

      intensityMap[i / 4] = intensity;
    }

    return intensityMap;
  }

  drawChannelLine(
    x1,
    y1,
    x2,
    y2,
    intensityMap,
    width,
    height,
    penDiameter,
    channel,
    lineSpacing
  ) {
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
    const maxLinesPerChannel = parseInt(
      document.getElementById("maxLinesPerChannelValue").value
    );
    const maxIntensity = Math.max(...intensities.map((p) => p.intensity));
    const maxLines = Math.ceil(maxLinesPerChannel * maxIntensity);

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
        const requiredLines = Math.ceil(maxLinesPerChannel * point.intensity);
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
        pathSegments = this.mergeCloseSegments(
          pathSegments,
          maxMergeDistancePx
        );
      }

      // Filter out segments shorter than minimum length AFTER merging
      const minLineLengthMm = parseFloat(
        document.getElementById("minLineLengthValue").value
      );
      const filteredSegments = pathSegments.filter((segment) => {
        const startMmX = segment.startX / this.pixelsPerMm;
        const startMmY = segment.startY / this.pixelsPerMm;
        const endMmX = segment.endX / this.pixelsPerMm;
        const endMmY = segment.endY / this.pixelsPerMm;

        const lineLengthMm = Math.sqrt(
          (endMmX - startMmX) ** 2 + (endMmY - startMmY) ** 2
        );

        return lineLengthMm >= minLineLengthMm;
      });

      pathSegments = filteredSegments;

      // Draw and output each segment for this line
      pathSegments.forEach((segment) => {
        // Keep raw coordinates for G-code ordering
        const rawSegment = {
          x1: segment.startX,
          y1: segment.startY,
          x2: segment.endX,
          y2: segment.endY,
          lineOrder: lineIndex,
        };

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
          this.channels[
            channel
          ].svgContent += `    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke-width="${strokeWidth}"/>
`;

          // Draw directly to channel SVG DOM using renderColor for preview
          const lineElement = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "line"
          );
          lineElement.setAttribute("x1", x1);
          lineElement.setAttribute("y1", y1);
          lineElement.setAttribute("x2", x2);
          lineElement.setAttribute("y2", y2);
          lineElement.setAttribute("stroke-width", strokeWidth);
          lineElement.setAttribute(
            "stroke",
            this.channels[channel].renderColor
          );
          this.channels[channel].group.appendChild(lineElement);
          this.channels[channel].lineSegments.push(rawSegment);

          if (typeof this.channels[channel].lineCount === "number") {
            this.channels[channel].lineCount += 1;
          } else {
            this.channels[channel].lineCount = 1;
          }
        }
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
    const { params, enabledChannels } = this.generateMetadataComment();

    if (enabledChannels.length === 0) return;

    const canvasWidthMm = parseFloat(
      document.getElementById("canvasWidthValue").value
    );
    const canvasHeightMm = parseFloat(
      document.getElementById("canvasHeightValue").value
    );
    const { width, height } = this.imageData;

    let combinedSvg = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!-- Generated by HatchMaker - CMYK Hatch Pattern Generator -->
<!-- Source image: ${params.image} -->
<!-- Parameters: -->
${Object.entries(params)
  .map(([key, value]) => `<!-- ${key}: ${value} -->`)
  .join("\n")}
<!-- Enabled channels: ${enabledChannels.join(", ")} -->
<svg width="${canvasWidthMm}mm" height="${canvasHeightMm}mm" 
     viewBox="0 0 ${width} ${height}" 
     version="1.1" 
     xmlns="http://www.w3.org/2000/svg" 
     xmlns:xlink="http://www.w3.org/1999/xlink">
  <defs/>
`;

    // Add each enabled channel's lines
    const exportOrder = [...enabledChannels].reverse(); // Draw bottom-first so top layers render last
    exportOrder.forEach((channel) => {
      const channelData = this.channels[channel];
      combinedSvg += `  <g id="pen-plotter-lines-${channel}" stroke="${channelData.color}" fill="none" stroke-linecap="round" stroke-linejoin="round">\n`;

      // Extract just the line elements from the channel's SVG content
      const lines = channelData.svgContent.match(/<line[^>]*\/>/g) || [];
      lines.forEach((line) => {
        combinedSvg += `    ${line}\n`;
      });

      combinedSvg += `  </g>\n`;
    });

    combinedSvg += `</svg>`;

    const filename = `${this.originalFilename || "hatch"}-combined.svg`;
    const blob = new Blob([combinedSvg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  downloadChannelSVG(channel) {
    const channelData = this.channels[channel];
    if (!channelData.svgContent) return;

    const { params } = this.generateMetadataComment();

    // Add metadata and drag lines to SVG content
    let svgWithMetadata = channelData.svgContent.replace(
      '<?xml version="1.0" encoding="UTF-8" standalone="no"?>',
      `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!-- Generated by HatchMaker - CMYK Hatch Pattern Generator -->
<!-- Source image: ${params.image} -->
<!-- Channel: ${channel} -->
<!-- Parameters: -->
${Object.entries(params)
  .map(([key, value]) => `<!-- ${key}: ${value} -->`)
  .join("\n")}`
    );

    const filename = `${this.originalFilename || "hatch"}-${channel}.svg`;
    const blob = new Blob([svgWithMetadata], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  downloadTextFile(content, filename) {
    if (!content || !filename) return;
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  getChannelSegmentsInMm(channel) {
    const channelData = this.channels[channel];
    if (!channelData || !channelData.group) return [];

    const pxToMm = 1 / this.pixelsPerMm;
    const sourceSegments =
      (channelData.lineSegments && channelData.lineSegments.length > 0
        ? channelData.lineSegments
        : Array.from(channelData.group.querySelectorAll("line")).map(
            (line) => ({
              x1: parseFloat(line.getAttribute("x1")),
              y1: parseFloat(line.getAttribute("y1")),
              x2: parseFloat(line.getAttribute("x2")),
              y2: parseFloat(line.getAttribute("y2")),
            })
          )) || [];

    return sourceSegments
      .map((segment) => {
        const { x1, y1, x2, y2, lineOrder } = segment || {};
        if (
          !Number.isFinite(x1) ||
          !Number.isFinite(y1) ||
          !Number.isFinite(x2) ||
          !Number.isFinite(y2)
        ) {
          return null;
        }

        return {
          x1: x1 * pxToMm,
          y1: y1 * pxToMm,
          x2: x2 * pxToMm,
          y2: y2 * pxToMm,
          lineOrder:
            Number.isFinite(lineOrder) && lineOrder >= 0
              ? Math.floor(lineOrder)
              : null,
          comment: `Channel ${channel}`,
        };
      })
      .filter(Boolean);
  }

  buildGcodeForChannels(channels) {
    if (typeof GCodeGenerator === "undefined") {
      alert("G-code generator not available.");
      return "";
    }

    const canvasWidthMm = parseFloat(
      document.getElementById("canvasWidthValue").value
    );
    const canvasHeightMm = parseFloat(
      document.getElementById("canvasHeightValue").value
    );
    const penDownZ = parseFloat(
      document.getElementById("penDownZValue").value
    );
    const penUpZ = parseFloat(document.getElementById("penUpZValue").value);
    const preventZhop = parseFloat(
      document.getElementById("preventZhopValue").value
    );

    const generator = new GCodeGenerator({
      feedRate: 1500,
      penDownZ: Number.isFinite(penDownZ) ? penDownZ : 0,
      penUpZ: Number.isFinite(penUpZ) ? penUpZ : 2,
      preventZhop: Number.isFinite(preventZhop) ? preventZhop : 0.5,
      toolName: "HatchMaker",
      canvasWidth: canvasWidthMm,
      canvasHeight: canvasHeightMm,
    });

    generator.beginProgram({
      headerLines: [`Channels: ${channels.join(", ")}`],
    });

    channels.forEach((channel) => {
      const segments = this.optimizeSegmentsNearest(
        this.getChannelSegmentsInMm(channel),
        generator.currentX,
        generator.currentY
      );
      if (!segments.length) return;
      generator.addComment(`--- Channel ${channel} ---`);
      generator.renderLineSegments(segments, {
        optimize: false, // already optimized
        startX: generator.currentX,
        startY: generator.currentY,
        preventZhop: generator.options.preventZhop,
      });
      generator.ensurePenUp({ force: true });
    });

    generator.finishProgram();
    return generator.toString();
  }

  downloadCombinedGcode() {
    const channels = this.getEnabledChannelsInOrder();
    if (!channels.length) {
      alert("Enable at least one channel before exporting G-code.");
      return;
    }
    const gcode = this.buildGcodeForChannels(channels);
    if (!gcode || !gcode.trim()) {
      alert("No G-code to export yet. Generate lines first.");
      return;
    }

    const filename = `${this.originalFilename || "hatch"}-combined.gcode`;
    this.downloadTextFile(gcode, filename);
  }

  downloadChannelGcode(channel) {
    if (!document.getElementById(`enable${channel}`)?.checked) return;
    const gcode = this.buildGcodeForChannels([channel]);
    if (!gcode || !gcode.trim()) {
      alert(`No lines found for channel ${channel}.`);
      return;
    }

    const filename = `${this.originalFilename || "hatch"}-${channel}.gcode`;
    this.downloadTextFile(gcode, filename);
  }

  optimizeSegmentsNearest(segments, startX = 0, startY = 0) {
    if (!Array.isArray(segments) || !segments.length) return [];

    // If the generator's optimizer is available, use it (it can reverse segments when beneficial)
    if (
      typeof GCodeGenerator !== "undefined" &&
      typeof GCodeGenerator.optimizeLineOrder === "function"
    ) {
      return GCodeGenerator.optimizeLineOrder(segments, startX, startY);
    }

    // Fallback: simple nearest-neighbor without reversal
    const remaining = [...segments];
    const ordered = [];
    let cx = startX;
    let cy = startY;

    while (remaining.length) {
      let bestIdx = 0;
      let bestDist = Infinity;

      for (let i = 0; i < remaining.length; i++) {
        const { x1, y1 } = remaining[i];
        const dx = x1 - cx;
        const dy = y1 - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = i;
        }
      }

      const next = remaining.splice(bestIdx, 1)[0];
      ordered.push(next);
      cx = next.x2;
      cy = next.y2;
    }

    return ordered;
  }

  /**
   * Save current configuration
   */
  saveConfiguration() {
    if (!this.originalImage) {
      alert("Please load an image first before saving configuration.");
      return;
    }

    const configName = prompt("Enter a name for this configuration:");
    if (!configName || configName.trim() === "") {
      return;
    }

    // Get all current parameter values
    const parameters = this.getAllParameters();

    // Get base64 image data
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    canvas.width = this.originalImage.width;
    canvas.height = this.originalImage.height;
    ctx.drawImage(this.originalImage, 0, 0);
    const base64Image = canvas.toDataURL("image/jpeg", 0.8);

    try {
      this.configManager.saveConfig(
        this.toolId,
        configName.trim(),
        parameters,
        base64Image
      );
      this.showStatus(`Configuration "${configName}" saved successfully!`);
    } catch (error) {
      console.error("Error saving configuration:", error);
      alert("Failed to save configuration. Please try again.");
    }
  }

  /**
   * Load configuration modal
   */
  loadConfiguration() {
    this.configManager.showConfigModal(this.toolId, (config) => {
      this.applyConfiguration(config);
    });
  }

  /**
   * Check for URL parameter to load a specific configuration
   */
  checkForUrlConfig() {
    const urlParams = new URLSearchParams(window.location.search);
    const configId = urlParams.get('loadConfig');
    
    if (configId) {
      // Load the specific configuration
      const config = this.configManager.getConfig(this.toolId, configId);
      if (config) {
        this.applyConfiguration(config);
        // Clear the URL parameter to prevent reloading on refresh
        const newUrl = new URL(window.location);
        newUrl.searchParams.delete('loadConfig');
        window.history.replaceState({}, document.title, newUrl.toString());
      } else {
        console.warn(`Configuration with ID ${configId} not found for tool ${this.toolId}`);
      }
    }
  }

  /**
   * Get all current parameter values
   */
  getAllParameters() {
    return {
      // Canvas settings
      canvasWidth: document.getElementById("canvasWidthValue").value,
      canvasHeight: document.getElementById("canvasHeightValue").value,
      canvasZoom: document.getElementById("canvasZoomValue").value,

      // Pen settings
      penDiameter: document.getElementById("penDiameterValue").value,
      penDownZ: document.getElementById("penDownZValue").value,
      penUpZ: document.getElementById("penUpZValue").value,
      preventZhop: document.getElementById("preventZhopValue").value,

      // CMYK settings
      enableC: document.getElementById("enableC").checked,
      enableM: document.getElementById("enableM").checked,
      enableY: document.getElementById("enableY").checked,
      enableK: document.getElementById("enableK").checked,

      // Render colors
      renderColorC: document.getElementById("renderColorC").value,
      renderColorM: document.getElementById("renderColorM").value,
      renderColorY: document.getElementById("renderColorY").value,
      renderColorK: document.getElementById("renderColorK").value,

      // White points
      whitePointC: document.getElementById("whitePointCValue").value,
      whitePointM: document.getElementById("whitePointMValue").value,
      whitePointY: document.getElementById("whitePointYValue").value,
      whitePointK: document.getElementById("whitePointKValue").value,

      // Line pattern
      lineAngle: document.getElementById("lineAngleValue").value,
      sectionWidth: document.getElementById("sectionWidthValue").value,
      lineSpacing: document.getElementById("lineSpacingValue").value,
      minLineLength: document.getElementById("minLineLengthValue").value,
      contrast: document.getElementById("contrastValue").value,
      maxMergeDistance: document.getElementById("maxMergeDistanceValue").value,
      maxLinesPerChannel: document.getElementById("maxLinesPerChannelValue")
        .value,
      channelOrder: this.channelOrder,
    };
  }

  /**
   * Apply configuration to all controls
   */
  applyConfiguration(config) {
    const params = config.parameters;

    // Apply canvas settings
    document.getElementById("canvasWidthValue").value =
      params.canvasWidth || "200";
    document.getElementById("canvasHeightValue").value =
      params.canvasHeight || "200";
    document.getElementById("canvasZoomValue").value = params.canvasZoom || "1";
    document.getElementById("canvasZoom").value = params.canvasZoom || "1";

    // Apply pen settings
    document.getElementById("penDiameterValue").value =
      params.penDiameter || "0.5";
    document.getElementById("penDownZValue").value =
      params.penDownZ !== undefined ? params.penDownZ : "0";
    document.getElementById("penUpZValue").value =
      params.penUpZ !== undefined ? params.penUpZ : "2";
    document.getElementById("preventZhopValue").value =
      params.preventZhop !== undefined ? params.preventZhop : "0.5";

    // Apply CMYK settings
    document.getElementById("enableC").checked = params.enableC || false;
    document.getElementById("enableM").checked = params.enableM || false;
    document.getElementById("enableY").checked = params.enableY || false;
    document.getElementById("enableK").checked =
      params.enableK !== undefined ? params.enableK : true;

    // Apply render colors
    document.getElementById("renderColorC").value =
      params.renderColorC || "#00FFFF";
    document.getElementById("renderColorM").value =
      params.renderColorM || "#FF00FF";
    document.getElementById("renderColorY").value =
      params.renderColorY || "#FFFF00";
    document.getElementById("renderColorK").value =
      params.renderColorK || "#000000";

    // Apply white points
    document.getElementById("whitePointCValue").value =
      params.whitePointC || "0.05";
    document.getElementById("whitePointC").value = params.whitePointC || "0.05";
    document.getElementById("whitePointMValue").value =
      params.whitePointM || "0.05";
    document.getElementById("whitePointM").value = params.whitePointM || "0.05";
    document.getElementById("whitePointYValue").value =
      params.whitePointY || "0.05";
    document.getElementById("whitePointY").value = params.whitePointY || "0.05";
    document.getElementById("whitePointKValue").value =
      params.whitePointK || "0.05";
    document.getElementById("whitePointK").value = params.whitePointK || "0.05";

    // Apply line pattern
    document.getElementById("lineAngleValue").value = params.lineAngle || "45";
    document.getElementById("sectionWidthValue").value =
      params.sectionWidth || "5";
    document.getElementById("lineSpacingValue").value =
      params.lineSpacing || "0.4";
    document.getElementById("minLineLengthValue").value =
      params.minLineLength || "2";
    document.getElementById("contrastValue").value = params.contrast || "1";
    document.getElementById("maxMergeDistanceValue").value =
      params.maxMergeDistance || "2";
    document.getElementById("maxLinesPerChannelValue").value =
      params.maxLinesPerChannel || "5";

    // Apply channel order (top -> bottom), keeping K at the base
    this.channelOrder = this.sanitizeChannelOrder(
      params.channelOrder || ["C", "M", "Y", "K"]
    );
    this.applyChannelOrder();
    this.renderChannelOrderControls();

    // Load the saved image
    if (config.base64Image) {
      const img = new Image();
      img.onload = () => {
        this.originalImage = img;
        this.originalFilename = `loaded_config_${config.name}`;

        // Update thumbnail
        this.thumbnail.src = config.base64Image;
        this.thumbnail.style.display = "block";

        // Update canvas size and redraw
        this.updateSvgSize();
        this.updateChannelVisibility();
        this.updateChannelRenderColors();
        this.redrawImage();
      };
      img.src = config.base64Image;
    }

    this.showStatus(`Configuration "${config.name}" loaded successfully!`);
  }

  /**
   * Update channel render colors from current UI values
   */
  updateChannelRenderColors() {
    ["C", "M", "Y", "K"].forEach((channel) => {
      const color = document.getElementById(`renderColor${channel}`).value;
      this.updateChannelRenderColor(channel, color);
    });
    this.renderChannelOrderControls();
  }

  /**
   * Setup drop zone functionality
   */
  setupDropZone() {
    const dropZone = document.getElementById("imageDropZone");
    const fileInput = document.getElementById("imageInput");
    const dropZoneContent = document.getElementById("dropZoneContent");
    const imageThumbnail = document.getElementById("imageThumbnail");

    // Click to upload
    dropZone.addEventListener("click", () => {
      fileInput.click();
    });

    // Drag and drop handlers
    dropZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropZone.classList.add("dragover");
    });

    dropZone.addEventListener("dragleave", (e) => {
      e.preventDefault();
      dropZone.classList.remove("dragover");
    });

    dropZone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropZone.classList.remove("dragover");

      const files = e.dataTransfer.files;
      if (files.length > 0 && files[0].type.startsWith("image/")) {
        this.loadImage(files[0]);
      }
    });

    // Update display when image is loaded
    this.originalImageLoadCallback = () => {
      dropZoneContent.style.display = "none";
      imageThumbnail.style.display = "block";
      // The thumbnail src is already set in loadImage method
    };
  }

  /**
   * Setup dropdown functionality
   */
  setupDropdowns() {
    // SVG dropdown items
    document.getElementById("downloadBtn").addEventListener("click", (e) => {
      e.preventDefault();
      this.downloadSVG();
    });
    document.getElementById("downloadCBtn").addEventListener("click", (e) => {
      e.preventDefault();
      this.downloadChannelSVG("C");
    });
    document.getElementById("downloadMBtn").addEventListener("click", (e) => {
      e.preventDefault();
      this.downloadChannelSVG("M");
    });
    document.getElementById("downloadYBtn").addEventListener("click", (e) => {
      e.preventDefault();
      this.downloadChannelSVG("Y");
    });
    document.getElementById("downloadKBtn").addEventListener("click", (e) => {
      e.preventDefault();
      this.downloadChannelSVG("K");
    });

    // G-code dropdown items
    const downloadGcodeCombined =
      document.getElementById("downloadGcodeCombinedBtn");
    if (downloadGcodeCombined) {
      downloadGcodeCombined.addEventListener("click", (e) => {
        e.preventDefault();
        if (downloadGcodeCombined.classList.contains("disabled")) return;
        this.downloadCombinedGcode();
      });
    }

    ["C", "M", "Y", "K"].forEach((channel) => {
      const link = document.getElementById(`download${channel}GcodeBtn`);
      if (link) {
        link.addEventListener("click", (e) => {
          e.preventDefault();
          if (link.classList.contains("disabled")) return;
          this.downloadChannelGcode(channel);
        });
      }
    });
  }
}

// Initialize the converter when the page loads
document.addEventListener("DOMContentLoaded", () => {
  new PenPlotterConverter();
});
