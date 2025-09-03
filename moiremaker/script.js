class HatchMoireConverter {
  constructor() {
    this.originalCanvas = document.createElement("canvas");
    this.originalCtx = this.originalCanvas.getContext("2d");
    this.thumbnail = document.getElementById("imageThumbnail");
    this.imageData = null;
    this.originalImage = null;
    this.originalFilename = null;
    this.pixelsPerMm = 96 / 25.4;

    // Layer data - each layer contains SVG content and G-code lines
    this.layers = [];
    this.numLayers = 2; // Default number of layers

    // Chunked processing state
    this.isProcessing = false;
    this.processingCancelled = false;

    // Debouncing for input changes
    this.debounceTimer = null;
    this.singleLayerDebounceTimer = null;
    this.debounceDelay = 500;

    // Initialize ConfigManager
    this.configManager = new ConfigManager();
    this.toolId = "moiremaker";

    // Initialize InteractiveCanvas for preview area
    this.previewArea = document.querySelector(".preview-area");
    this.interactiveCanvas = new InteractiveCanvas(this.previewArea, {
      minZoom: 0.1,
      maxZoom: 20,
      enablePan: true,
      enableZoom: true,
    });

    this.setupEventListeners();
    this.updateSvgSize();
    this.initializeLayers();
    
    // Check for URL parameter to load a specific configuration
    this.checkForUrlConfig();
  }

  setupEventListeners() {
    // Setup drop zone functionality
    this.setupDropZone();

    // File input
    document.getElementById("imageInput").addEventListener("change", (e) => {
      this.loadImage(e.target.files[0]);
    });

    // Canvas size inputs
    this.setupNumberInput("canvasWidthValue", () => {
      this.updateSvgSize();
      if (this.originalImage) this.generateMoire();
    });
    this.setupNumberInput("canvasHeightValue", () => {
      this.updateSvgSize();
      if (this.originalImage) this.generateMoire();
    });

    // Base pattern inputs
    this.setupNumberInput("baseLineSpacingValue", () => {
      this.debouncedGenerateMoire();
    });
    this.setupNumberInput("baseMinLineLengthValue", () => {
      this.debouncedGenerateMoire();
    });
    this.setupNumberInput("baseContrastValue", () => {
      this.debouncedGenerateMoire();
    });
    this.setupNumberInput("baseMaxMergeDistanceValue", () => {
      this.debouncedGenerateMoire();
    });

    // Layer management will be handled by individual add/delete buttons

    // Redraw button
    document.getElementById("redrawBtn").addEventListener("click", () => {
      if (this.originalImage) {
        this.generateMoire();
      }
    });

    // Canvas controls
    document.getElementById("fitToContentBtn").addEventListener("click", () => {
      this.interactiveCanvas.fitToContent();
    });

    document.getElementById("resetViewBtn").addEventListener("click", () => {
      this.interactiveCanvas.resetTransform();
    });

    // Download buttons
    document.getElementById("downloadBtn").addEventListener("click", () => {
      this.downloadCombinedSvg();
    });

    document
      .getElementById("downloadIndividualBtn")
      .addEventListener("click", () => {
        this.downloadIndividualSvgs();
      });

    document
      .getElementById("downloadGcodeBtn")
      .addEventListener("click", () => {
        this.downloadCombinedGcode();
      });

    document
      .getElementById("downloadIndividualGcodeBtn")
      .addEventListener("click", () => {
        this.downloadIndividualGcodes();
      });

    // Config save/load
    document.getElementById("saveConfigBtn").addEventListener("click", () => {
      this.saveConfiguration();
    });

    document.getElementById("loadConfigBtn").addEventListener("click", () => {
      this.loadConfiguration();
    });

    // Initialize layer controls
    this.updateLayerControls();
  }

  setupDropZone() {
    const dropZone = document.getElementById("imageDropZone");

    dropZone.addEventListener("click", () => {
      document.getElementById("imageInput").click();
    });

    dropZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropZone.classList.add("dragover");
    });

    dropZone.addEventListener("dragleave", (e) => {
      e.preventDefault();
      if (!dropZone.contains(e.relatedTarget)) {
        dropZone.classList.remove("dragover");
      }
    });

    dropZone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropZone.classList.remove("dragover");

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        this.loadImage(files[0]);
      }
    });
  }

  setupNumberInput(id, callback) {
    const element = document.getElementById(id);
    if (element) {
      element.addEventListener("input", callback);
      element.addEventListener("change", callback);
    }
  }

  initializeLayers() {
    this.layers = [];
    for (let i = 0; i < this.numLayers; i++) {
      this.layers.push({
        svg: null,
        group: null,
        svgContent: "",
        gcodeLines: [],
        dragLines: [],
        color: this.getLayerColor(i),
        offsetX: 0,
        offsetY: 0,
        angle: 45 + i * 15, // Vary angle for each layer
        skew: 0,
        whitePoint: 0.8, // Much higher white point for denser patterns
        lineSpacing: 0.1, // Much tighter line spacing
      });
    }
    this.updateSvgStack();

    // Set up InteractiveCanvas with the SVG stack
    const svgStack = document.getElementById("svgStack");
    if (this.interactiveCanvas && svgStack) {
      this.interactiveCanvas.setContent(svgStack);
    }
  }

  getLayerColor(index) {
    const colors = [
      "#000000", // Black for first layer
      "#FF0000", // Red
      "#0000FF", // Blue
      "#00FF00", // Green
      "#FF8000", // Orange
      "#8000FF", // Purple
      "#00FFFF", // Cyan
      "#FF00FF", // Magenta
      "#808080", // Gray
      "#FFD700", // Gold
    ];
    return colors[index % colors.length];
  }

  updateSvgStack() {
    const svgStack = document.getElementById("svgStack");
    svgStack.innerHTML = "";

    for (let i = 0; i < this.layers.length; i++) {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.id = `outputSvgLayer${i}`;
      svg.classList.add("layer-svg");
      svg.setAttribute(
        "viewBox",
        `0 0 ${this.getCanvasWidth()} ${this.getCanvasHeight()}`
      );
      svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

      if (i > 0) {
        svg.style.display = "block";
      }

      const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
      group.id = `pen-plotter-lines-Layer${i}`;
      group.setAttribute("stroke", this.layers[i].color);
      group.setAttribute("fill", "none");
      group.setAttribute("stroke-linecap", "round");
      group.setAttribute("stroke-linejoin", "round");

      if (i > 0) {
        group.setAttribute("opacity", "0.8");
      }

      if (i === 0) {
        const rect = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "rect"
        );
        rect.setAttribute("width", "100%");
        rect.setAttribute("height", "100%");
        rect.setAttribute("fill", "white");
        svg.appendChild(rect);
      }

      svg.appendChild(group);
      svgStack.appendChild(svg);

      this.layers[i].svg = svg;
      this.layers[i].group = group;
    }
  }

  updateLayerControls() {
    const layerControls = document.getElementById("layerControls");
    layerControls.innerHTML = "";

    for (let i = 0; i < this.numLayers; i++) {
      const controlGroup = document.createElement("div");
      controlGroup.className = "layer-control-group";

      const title = document.createElement("h4");
      title.style.display = "flex";
      title.style.alignItems = "center";
      title.style.justifyContent = "space-between";
      title.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
          <div class="layer-color-indicator" style="background-color: ${this.getLayerColor(
            i
          )}"></div>
          Layer ${i + 1}
        </div>
        ${
          this.numLayers > 2
            ? `<button class="delete-layer-btn" data-layer="${i}" title="Delete Layer">×</button>`
            : ""
        }
      `;
      controlGroup.appendChild(title);

      // Offset X
      const offsetXRow = document.createElement("div");
      offsetXRow.className = "input-row";
      offsetXRow.innerHTML = `
        <label>Offset X:</label>
        <input type="range" id="layer${i}OffsetX" min="-50" max="50" step="0.1" value="0">
        <input type="number" id="layer${i}OffsetXValue" min="-50" max="50" step="0.1" value="0">
        <span class="unit-label">mm</span>
      `;
      controlGroup.appendChild(offsetXRow);

      // Offset Y
      const offsetYRow = document.createElement("div");
      offsetYRow.className = "input-row";
      offsetYRow.innerHTML = `
        <label>Offset Y:</label>
        <input type="range" id="layer${i}OffsetY" min="-50" max="50" step="0.1" value="0">
        <input type="number" id="layer${i}OffsetYValue" min="-50" max="50" step="0.1" value="0">
        <span class="unit-label">mm</span>
      `;
      controlGroup.appendChild(offsetYRow);

      // Angle
      const angleRow = document.createElement("div");
      angleRow.className = "input-row";
      angleRow.innerHTML = `
        <label>Angle:</label>
        <input type="range" id="layer${i}Angle" min="0" max="360" step="0.1" value="${
        45 + i * 15
      }">
        <input type="number" id="layer${i}AngleValue" min="0" max="360" step="0.1" value="${
        45 + i * 15
      }">
        <span class="unit-label">°</span>
      `;
      controlGroup.appendChild(angleRow);

      // Skew
      const skewRow = document.createElement("div");
      skewRow.className = "input-row";
      skewRow.innerHTML = `
        <label>Skew:</label>
        <input type="range" id="layer${i}Skew" min="-45" max="45" step="0.1" value="0">
        <input type="number" id="layer${i}SkewValue" min="-45" max="45" step="0.1" value="0">
        <span class="unit-label">°</span>
      `;
      controlGroup.appendChild(skewRow);

      // Line Spacing
      const lineSpacingRow = document.createElement("div");
      lineSpacingRow.className = "input-row";
      lineSpacingRow.innerHTML = `
        <label>Line Spacing:</label>
        <input type="range" id="layer${i}LineSpacing" min="0.01" max="5" step="0.01" value="0.1">
        <input type="number" id="layer${i}LineSpacingValue" min="0.01" max="5" step="0.01" value="0.1">
        <span class="unit-label">mm</span>
      `;
      controlGroup.appendChild(lineSpacingRow);


      // White Point
      const whitePointRow = document.createElement("div");
      whitePointRow.className = "input-row";
      whitePointRow.innerHTML = `
        <label>White Point:</label>
        <input type="range" id="layer${i}WhitePoint" min="0" max="1" step="0.01" value="0.8">
        <input type="number" id="layer${i}WhitePointValue" min="0" max="1" step="0.01" value="0.8">
      `;
      controlGroup.appendChild(whitePointRow);

      // Color
      const colorRow = document.createElement("div");
      colorRow.className = "input-row";
      colorRow.innerHTML = `
        <label>Color:</label>
        <input type="color" id="layer${i}Color" value="${this.getLayerColor(
        i
      )}">
      `;
      controlGroup.appendChild(colorRow);

      layerControls.appendChild(controlGroup);

      // Setup event listeners for layer controls
      this.setupLayerControls(i);
    }

    // Add "Add Layer" button
    const addLayerBtn = document.createElement("button");
    addLayerBtn.className = "add-layer-btn";
    addLayerBtn.innerHTML = "➕ Add Layer";
    addLayerBtn.addEventListener("click", () => this.addLayer());
    layerControls.appendChild(addLayerBtn);

    // Setup delete button listeners
    layerControls.querySelectorAll(".delete-layer-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const layerIndex = parseInt(e.target.getAttribute("data-layer"));
        this.deleteLayer(layerIndex);
      });
    });
  }

  setupLayerControls(layerIndex) {
    // Sync range and number inputs
    this.syncRangeNumberInputs(
      `layer${layerIndex}OffsetX`,
      `layer${layerIndex}OffsetXValue`
    );
    this.syncRangeNumberInputs(
      `layer${layerIndex}OffsetY`,
      `layer${layerIndex}OffsetYValue`
    );
    this.syncRangeNumberInputs(
      `layer${layerIndex}Angle`,
      `layer${layerIndex}AngleValue`
    );
    this.syncRangeNumberInputs(
      `layer${layerIndex}Skew`,
      `layer${layerIndex}SkewValue`
    );
    this.syncRangeNumberInputs(
      `layer${layerIndex}LineSpacing`,
      `layer${layerIndex}LineSpacingValue`
    );
    this.syncRangeNumberInputs(
      `layer${layerIndex}SectionWidth`,
      `layer${layerIndex}SectionWidthValue`
    );
    this.syncRangeNumberInputs(
      `layer${layerIndex}WhitePoint`,
      `layer${layerIndex}WhitePointValue`
    );

    // Add change listeners
    [
      `layer${layerIndex}OffsetXValue`,
      `layer${layerIndex}OffsetYValue`,
      `layer${layerIndex}AngleValue`,
      `layer${layerIndex}SkewValue`,
      `layer${layerIndex}LineSpacingValue`,
      `layer${layerIndex}SectionWidthValue`,
      `layer${layerIndex}WhitePointValue`,
      `layer${layerIndex}Color`,
    ].forEach((id) => {
      const element = document.getElementById(id);
      if (element) {
        element.addEventListener("input", () =>
          this.updateLayerProperties(layerIndex)
        );
        element.addEventListener("change", () =>
          this.updateLayerProperties(layerIndex)
        );
      }
    });
  }

  syncRangeNumberInputs(rangeId, numberId) {
    const rangeInput = document.getElementById(rangeId);
    const numberInput = document.getElementById(numberId);

    if (rangeInput && numberInput) {
      rangeInput.addEventListener("input", () => {
        numberInput.value = rangeInput.value;
        this.updateLayerProperties(parseInt(rangeId.match(/layer(\d+)/)[1]));
      });

      numberInput.addEventListener("input", () => {
        rangeInput.value = numberInput.value;
      });
    }
  }

  updateLayerProperties(layerIndex) {
    if (layerIndex >= this.layers.length) return;

    this.layers[layerIndex].offsetX =
      parseFloat(
        document.getElementById(`layer${layerIndex}OffsetXValue`).value
      ) || 0;
    this.layers[layerIndex].offsetY =
      parseFloat(
        document.getElementById(`layer${layerIndex}OffsetYValue`).value
      ) || 0;
    this.layers[layerIndex].angle =
      parseFloat(
        document.getElementById(`layer${layerIndex}AngleValue`).value
      ) || 0;
    this.layers[layerIndex].skew =
      parseFloat(
        document.getElementById(`layer${layerIndex}SkewValue`).value
      ) || 0;
    this.layers[layerIndex].lineSpacing =
      parseFloat(
        document.getElementById(`layer${layerIndex}LineSpacingValue`).value
      ) || 0.4;
    this.layers[layerIndex].whitePoint =
      parseFloat(
        document.getElementById(`layer${layerIndex}WhitePointValue`).value
      ) || 0.05;
    this.layers[layerIndex].color =
      document.getElementById(`layer${layerIndex}Color`).value || "#000000";

    // Update SVG stroke color
    if (this.layers[layerIndex].group) {
      this.layers[layerIndex].group.setAttribute(
        "stroke",
        this.layers[layerIndex].color
      );
    }

    // Only regenerate this specific layer
    this.debouncedGenerateSingleLayer(layerIndex);
  }

  addLayer() {
    // Save current layer configurations before adding
    const currentConfigs = [];
    for (let i = 0; i < this.numLayers; i++) {
      const config = {
        offsetX:
          parseFloat(document.getElementById(`layer${i}OffsetXValue`)?.value) ||
          0,
        offsetY:
          parseFloat(document.getElementById(`layer${i}OffsetYValue`)?.value) ||
          0,
        angle:
          parseFloat(document.getElementById(`layer${i}AngleValue`)?.value) ||
          45 + i * 15,
        skew:
          parseFloat(document.getElementById(`layer${i}SkewValue`)?.value) || 0,
        lineSpacing:
          parseFloat(
            document.getElementById(`layer${i}LineSpacingValue`)?.value
          ) || 0.1,
        whitePoint:
          parseFloat(
            document.getElementById(`layer${i}WhitePointValue`)?.value
          ) || 0.8,
        color:
          document.getElementById(`layer${i}Color`)?.value ||
          this.getLayerColor(i),
      };
      currentConfigs.push(config);
    }

    this.numLayers++;

    // Add new layer data to layers array
    const newLayerIndex = this.numLayers - 1;
    this.layers.push({
      svg: null,
      group: null,
      svgContent: "",
      gcodeLines: [],
      dragLines: [],
      color: this.getLayerColor(newLayerIndex),
      offsetX: 0,
      offsetY: 0,
      angle: 45 + newLayerIndex * 15,
      skew: 0,
      whitePoint: 0.8,
      lineSpacing: 0.1,
    });

    this.updateLayerControls();
    this.updateSvgStack();

    // Restore previous configurations
    currentConfigs.forEach((config, i) => {
      this.restoreLayerConfig(i, config);
    });

    // Set up InteractiveCanvas with the SVG stack
    const svgStack = document.getElementById("svgStack");
    if (this.interactiveCanvas && svgStack) {
      this.interactiveCanvas.setContent(svgStack);
    }

    // Only generate the new layer
    if (this.originalImage) {
      this.generateSingleLayer(newLayerIndex);
    }
  }

  deleteLayer(layerIndex) {
    if (this.numLayers <= 2) return; // Don't allow deleting below 2 layers

    // Save current layer configurations before deleting
    const currentConfigs = [];
    for (let i = 0; i < this.numLayers; i++) {
      if (i !== layerIndex) {
        // Skip the layer being deleted
        const config = {
          offsetX:
            parseFloat(
              document.getElementById(`layer${i}OffsetXValue`)?.value
            ) || 0,
          offsetY:
            parseFloat(
              document.getElementById(`layer${i}OffsetYValue`)?.value
            ) || 0,
          angle:
            parseFloat(document.getElementById(`layer${i}AngleValue`)?.value) ||
            45 + i * 15,
          skew:
            parseFloat(document.getElementById(`layer${i}SkewValue`)?.value) ||
            0,
          lineSpacing:
            parseFloat(
              document.getElementById(`layer${i}LineSpacingValue`)?.value
            ) || 0.1,
          whitePoint:
            parseFloat(
              document.getElementById(`layer${i}WhitePointValue`)?.value
            ) || 0.8,
          color:
            document.getElementById(`layer${i}Color`)?.value ||
            this.getLayerColor(i),
        };
        currentConfigs.push(config);
      }
    }

    this.layers.splice(layerIndex, 1);
    this.numLayers--;
    this.updateLayerControls();
    this.updateSvgStack();

    // Restore configurations for remaining layers
    currentConfigs.forEach((config, newIndex) => {
      this.restoreLayerConfig(newIndex, config);
    });

    // Set up InteractiveCanvas with the SVG stack
    const svgStack = document.getElementById("svgStack");
    if (this.interactiveCanvas && svgStack) {
      this.interactiveCanvas.setContent(svgStack);
    }

    // Regenerate all remaining layers (since indices changed)
    if (this.originalImage) {
      this.generateMoire();
    }
  }

  restoreLayerConfig(layerIndex, config) {
    // Restore all input values for this layer
    const inputs = [
      {
        id: `layer${layerIndex}OffsetXValue`,
        rangeId: `layer${layerIndex}OffsetX`,
        value: config.offsetX,
      },
      {
        id: `layer${layerIndex}OffsetYValue`,
        rangeId: `layer${layerIndex}OffsetY`,
        value: config.offsetY,
      },
      {
        id: `layer${layerIndex}AngleValue`,
        rangeId: `layer${layerIndex}Angle`,
        value: config.angle,
      },
      {
        id: `layer${layerIndex}SkewValue`,
        rangeId: `layer${layerIndex}Skew`,
        value: config.skew,
      },
      {
        id: `layer${layerIndex}LineSpacingValue`,
        rangeId: `layer${layerIndex}LineSpacing`,
        value: config.lineSpacing,
      },
      {
        id: `layer${layerIndex}WhitePointValue`,
        rangeId: `layer${layerIndex}WhitePoint`,
        value: config.whitePoint,
      },
      { id: `layer${layerIndex}Color`, value: config.color },
    ];

    inputs.forEach(({ id, rangeId, value }) => {
      const input = document.getElementById(id);
      if (input) {
        input.value = value;
        // Also update range input if it exists
        if (rangeId) {
          const rangeInput = document.getElementById(rangeId);
          if (rangeInput) {
            rangeInput.value = value;
          }
        }
      }
    });

    // Update layer properties
    this.updateLayerProperties(layerIndex);
  }

  async generateSingleLayer(layerIndex) {
    if (!this.originalImage || this.isProcessing) return;

    this.isProcessing = true;
    this.showProgressIndicator(`Regenerating Layer ${layerIndex + 1}...`);

    const baseSettings = {
      lineSpacing:
        parseFloat(document.getElementById("baseLineSpacingValue").value) ||
        0.1,
      minLineLength:
        parseFloat(document.getElementById("baseMinLineLengthValue").value) ||
        2,
      contrast:
        parseFloat(document.getElementById("baseContrastValue").value) || 1,
      maxMergeDistance:
        parseFloat(
          document.getElementById("baseMaxMergeDistanceValue").value
        ) || 2,
    };

    try {
      await this.generateLayer(layerIndex, baseSettings);
      this.updateStats();
    } catch (error) {
      console.error(`Error generating layer ${layerIndex}:`, error);
      this.showStatus(`Error generating layer ${layerIndex + 1}`, "error");
    } finally {
      this.isProcessing = false;
      this.hideProgressIndicator();
    }
  }

  debouncedGenerateMoire() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      if (this.originalImage) {
        this.generateMoire();
      }
    }, this.debounceDelay);
  }

  debouncedGenerateSingleLayer(layerIndex) {
    if (this.singleLayerDebounceTimer) {
      clearTimeout(this.singleLayerDebounceTimer);
    }
    this.singleLayerDebounceTimer = setTimeout(() => {
      if (this.originalImage) {
        this.generateSingleLayer(layerIndex);
      }
    }, this.debounceDelay);
  }

  async loadImage(file) {
    if (!file) return;

    this.originalFilename = file.name.replace(/\.[^/.]+$/, "");

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        this.originalImage = img;
        this.setupCanvas(img);
        this.showImageThumbnail(e.target.result);
        this.generateMoire();
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  setupCanvas(img) {
    // Get canvas size in pixels based on mm dimensions
    const canvasWidthMm = this.getCanvasWidth();
    const canvasHeightMm = this.getCanvasHeight();
    const canvasWidth = Math.round(canvasWidthMm * this.pixelsPerMm);
    const canvasHeight = Math.round(canvasHeightMm * this.pixelsPerMm);

    // Set canvas to full resolution for image processing
    this.originalCanvas.width = canvasWidth;
    this.originalCanvas.height = canvasHeight;

    // Clear canvas with white background
    this.originalCtx.fillStyle = "white";
    this.originalCtx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Calculate fit dimensions (maintain aspect ratio, fit inside canvas)
    const imgAspect = img.width / img.height;
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
    this.originalCtx.drawImage(img, drawX, drawY, drawWidth, drawHeight);

    // Get image data for processing (entire canvas including white areas)
    this.imageData = this.originalCtx.getImageData(0, 0, canvasWidth, canvasHeight);
  }

  showImageThumbnail(src) {
    document.getElementById("dropZoneContent").style.display = "none";
    const thumbnail = document.getElementById("imageThumbnail");
    thumbnail.src = src;
    thumbnail.style.display = "block";
  }

  getCanvasWidth() {
    return parseFloat(document.getElementById("canvasWidthValue").value) || 200;
  }

  getCanvasHeight() {
    return (
      parseFloat(document.getElementById("canvasHeightValue").value) || 200
    );
  }

  updateSvgSize() {
    const width = this.getCanvasWidth();
    const height = this.getCanvasHeight();

    this.layers.forEach((layer) => {
      if (layer.svg) {
        layer.svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
        layer.svg.style.width = `${width * 2}px`;
        layer.svg.style.height = `${height * 2}px`;
      }
    });

    // Only fit to content on initial setup, not on updates
    if (this.interactiveCanvas && !this.originalImage) {
      this.interactiveCanvas.fitToContent();
    }
  }

  async generateMoire() {
    if (!this.originalImage || this.isProcessing) return;

    this.isProcessing = true;
    this.processingCancelled = false;
    this.showProgressIndicator("Generating Moiré Effect...");

    try {
      // Clear existing content
      this.layers.forEach((layer) => {
        if (layer.group) {
          layer.group.innerHTML = "";
        }
        layer.svgContent = "";
        layer.gcodeLines = [];
        layer.dragLines = [];
      });

      // Get base pattern settings
      const baseSettings = {
        lineSpacing:
          parseFloat(document.getElementById("baseLineSpacingValue").value) ||
          0.4,
        minLineLength:
          parseFloat(document.getElementById("baseMinLineLengthValue").value) ||
          2,
        contrast:
          parseFloat(document.getElementById("baseContrastValue").value) || 1,
        maxMergeDistance:
          parseFloat(
            document.getElementById("baseMaxMergeDistanceValue").value
          ) || 2,
      };

      // Generate each layer
      for (let i = 0; i < this.layers.length; i++) {
        if (this.processingCancelled) break;

        await this.generateLayer(i, baseSettings);
      }

      this.updateStats();
      // Don't reset canvas position/zoom when regenerating
    } catch (error) {
      console.error("Error generating moiré effect:", error);
      this.showStatus("Error generating moiré effect", "error");
    } finally {
      this.isProcessing = false;
      this.hideProgressIndicator();
    }
  }

  async generateLayer(layerIndex, baseSettings) {
    const layer = this.layers[layerIndex];
    const canvasWidth = this.getCanvasWidth();
    const canvasHeight = this.getCanvasHeight();

    // Convert image to grayscale for this layer
    const grayData = this.convertToGrayscale(this.imageData);

    // Generate hatching lines with layer-specific parameters
    const layerSettings = {
      lineSpacing: layer.lineSpacing,
      minLineLength: baseSettings.minLineLength,
      contrast: baseSettings.contrast,
      maxMergeDistance: baseSettings.maxMergeDistance,
      whitePoint: layer.whitePoint,
      angle: layer.angle,
      offsetX: layer.offsetX,
      offsetY: layer.offsetY,
      skew: layer.skew,
    };

    const lines = await this.generateHatchingLines(
      grayData,
      this.imageData.width,
      this.imageData.height,
      layerSettings,
      canvasWidth,
      canvasHeight
    );

    // Convert lines to SVG lines with travel moves shown
    layer.svgContent = this.linesToSvgWithTravelMoves(lines);
    layer.dragLines = lines;

    // Update SVG display
    if (layer.group) {
      layer.group.innerHTML = layer.svgContent;
    }

    // Generate G-code
    layer.gcodeLines = this.generateGcode(lines, `Layer${layerIndex + 1}`);
  }

  convertToGrayscale(imageData) {
    const data = imageData.data;
    const grayData = new Uint8ClampedArray(imageData.width * imageData.height);

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      // Convert to grayscale using luminance formula
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      grayData[i / 4] = gray;
    }

    return grayData;
  }

  async generateHatchingLines(
    grayData,
    imgWidth,
    imgHeight,
    settings,
    canvasWidth,
    canvasHeight
  ) {
    const lines = [];
    const pixelsPerMm = this.pixelsPerMm;

    // Scale factors
    const scaleX = canvasWidth / imgWidth;
    const scaleY = canvasHeight / imgHeight;

    // Line spacing in pixels - convert mm to pixels directly like HatchMaker
    const spacingPx = settings.lineSpacing * pixelsPerMm;

    // Calculate line direction
    const angleRad = (settings.angle * Math.PI) / 180;
    const dx = Math.cos(angleRad);
    const dy = Math.sin(angleRad);

    // Generate lines perpendicular to the angle direction
    const perpDx = -dy;
    const perpDy = dx;

    // Calculate bounds for line generation
    const diagonal = Math.sqrt(imgWidth * imgWidth + imgHeight * imgHeight);
    const numLines = Math.ceil((diagonal * 2) / spacingPx); // Double the coverage

    for (let lineIndex = 0; lineIndex < numLines; lineIndex++) {
      if (this.processingCancelled) break;

      // Starting point for this line - extend range to cover entire image
      const t = (lineIndex - numLines / 2) * spacingPx;
      const centerX = imgWidth / 2;
      const centerY = imgHeight / 2;

      // Start from one side of the image
      const startX = centerX + t * perpDx - diagonal * dx;
      const startY = centerY + t * perpDy - diagonal * dy;

      // Trace line through image
      const lineSegments = this.traceLine(
        grayData,
        imgWidth,
        imgHeight,
        startX,
        startY,
        dx,
        dy,
        settings
      );

      // Transform and add segments
      lineSegments.forEach((segment) => {
        if (segment.length >= 2) {
          const transformedSegment = segment.map((point) => ({
            x: point.x * scaleX + settings.offsetX,
            y: point.y * scaleY + settings.offsetY,
          }));

          // Apply skew if specified
          if (settings.skew !== 0) {
            const skewRad = (settings.skew * Math.PI) / 180;
            transformedSegment.forEach((point) => {
              const originalX = point.x;
              point.x = originalX + point.y * Math.tan(skewRad);
            });
          }

          lines.push(transformedSegment);
        }
      });

      // Yield control periodically
      if (lineIndex % 10 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    return lines;
  }

  traceLine(grayData, imgWidth, imgHeight, startX, startY, dx, dy, settings) {
    const segments = [];
    let currentSegment = [];

    const stepSize = 0.5;
    const diagonal = Math.sqrt(imgWidth * imgWidth + imgHeight * imgHeight);
    const maxSteps = Math.ceil((diagonal * 2) / stepSize); // Ensure we cover the entire diagonal

    for (let step = 0; step < maxSteps; step++) {
      const x = startX + step * stepSize * dx;
      const y = startY + step * stepSize * dy;

      if (x < 0 || x >= imgWidth || y < 0 || y >= imgHeight) {
        if (currentSegment.length > 0) {
          segments.push([...currentSegment]);
          currentSegment = [];
        }
        continue;
      }

      const pixelIndex = Math.floor(y) * imgWidth + Math.floor(x);
      const grayValue = grayData[pixelIndex] / 255;

      // Apply contrast
      const adjustedGray = Math.pow(grayValue, 1 / settings.contrast);

      // Determine if we should draw at this point using white point threshold
      const threshold = 1.0 - settings.whitePoint; // Invert because darker areas have lower values
      const shouldDraw = adjustedGray < threshold;

      if (shouldDraw) {
        currentSegment.push({ x, y });
      } else {
        if (currentSegment.length > 0) {
          segments.push([...currentSegment]);
          currentSegment = [];
        }
      }
    }

    if (currentSegment.length > 0) {
      segments.push(currentSegment);
    }

    // First apply merging optimization, then filter by minimum length
    const maxMergeDistancePx = (settings.maxMergeDistance || 2) * this.pixelsPerMm;
    const optimizedSegments = this.optimizeSegments(segments, maxMergeDistancePx);

    // Filter optimized segments by minimum length
    const minLengthPx = settings.minLineLength * this.pixelsPerMm;
    return optimizedSegments.filter((segment) => {
      if (segment.length < 2) return false;
      const length = this.calculateSegmentLength(segment);
      return length >= minLengthPx;
    });
  }

  calculateSegmentLength(segment) {
    let length = 0;
    for (let i = 1; i < segment.length; i++) {
      const dx = segment[i].x - segment[i - 1].x;
      const dy = segment[i].y - segment[i - 1].y;
      length += Math.sqrt(dx * dx + dy * dy);
    }
    return length;
  }

  optimizeSegments(segments, maxMergeDistancePx) {
    // Convert multi-point segments to individual line segments that can be merged
    const individualSegments = [];
    
    segments.forEach((segment, segmentIndex) => {
      for (let i = 1; i < segment.length; i++) {
        const startPoint = segment[i - 1];
        const endPoint = segment[i];
        
        // Create a line segment in the format expected by mergeCloseSegments
        individualSegments.push({
          startX: startPoint.x,
          startY: startPoint.y,
          endX: endPoint.x,
          endY: endPoint.y,
          startT: (segmentIndex * 1000) + i - 1, // Unique ordering value
          endT: (segmentIndex * 1000) + i
        });
      }
    });
    
    // Apply HatchMaker's merging optimization
    const mergedSegments = this.mergeCloseSegments(individualSegments, maxMergeDistancePx);
    
    // Convert back to line format expected by the rest of the system
    return mergedSegments.map(segment => [
      { x: segment.startX, y: segment.startY },
      { x: segment.endX, y: segment.endY }
    ]);
  }

  linesToSvgLines(lines) {
    let svg = "";
    const penWidthMm = parseFloat(document.getElementById("penDiameterValue").value) || 0.5;
    
    lines.forEach((line) => {
      if (line.length >= 2) {
        // Convert multi-point line into individual line segments like HatchMaker
        for (let i = 1; i < line.length; i++) {
          const x1 = line[i-1].x.toFixed(3);
          const y1 = line[i-1].y.toFixed(3);
          const x2 = line[i].x.toFixed(3);
          const y2 = line[i].y.toFixed(3);
          svg += `    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke-width="${penWidthMm.toFixed(3)}"/>\n`;
        }
      }
    });
    return svg;
  }

  linesToSvgWithTravelMoves(lines) {
    let svg = "";
    const penWidthMm = parseFloat(document.getElementById("penDiameterValue").value) || 0.5;
    const preventZhopDistance = parseFloat(document.getElementById("preventZhopValue").value) || 2;
    
    // Optimize the path first to match G-code generation
    const optimizedLines = this.optimizeGcodePath(lines);
    
    let lastEndPoint = null;
    
    optimizedLines.forEach((line, index) => {
      if (line.length >= 2) {
        const startPoint = line[0];
        const endPoint = line[line.length - 1];
        
        // Add travel move line if Z-hop would be skipped
        if (lastEndPoint) {
          const dx = startPoint.x - lastEndPoint.x;
          const dy = startPoint.y - lastEndPoint.y;
          const travelDistance = Math.sqrt(dx * dx + dy * dy);
          
          if (travelDistance <= preventZhopDistance && travelDistance > 0.01) {
            // Add travel line with same style as drawing lines (pen stays down)
            svg += `    <line x1="${lastEndPoint.x.toFixed(3)}" y1="${lastEndPoint.y.toFixed(3)}" `;
            svg += `x2="${startPoint.x.toFixed(3)}" y2="${startPoint.y.toFixed(3)}" `;
            svg += `stroke-width="${penWidthMm.toFixed(3)}"/>\n`;
          }
        }
        
        // Add the actual drawing lines
        for (let i = 1; i < line.length; i++) {
          const x1 = line[i-1].x.toFixed(3);
          const y1 = line[i-1].y.toFixed(3);
          const x2 = line[i].x.toFixed(3);
          const y2 = line[i].y.toFixed(3);
          svg += `    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke-width="${penWidthMm.toFixed(3)}"/>\n`;
        }
        
        lastEndPoint = endPoint;
      }
    });
    
    return svg;
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

  optimizeGcodePath(lines) {
    if (lines.length === 0) return lines;
    
    const optimizedLines = [];
    const remainingLines = [...lines];
    let currentPosition = { x: 0, y: 0 }; // Start at origin
    
    // Always start with the line closest to origin
    let closestIndex = 0;
    let minDistance = Infinity;
    
    for (let i = 0; i < remainingLines.length; i++) {
      const line = remainingLines[i];
      if (line.length < 2) continue;
      
      const startPoint = line[0];
      const endPoint = line[line.length - 1];
      
      // Check distance to both start and end of line
      const distToStart = Math.sqrt(
        Math.pow(startPoint.x - currentPosition.x, 2) + 
        Math.pow(startPoint.y - currentPosition.y, 2)
      );
      const distToEnd = Math.sqrt(
        Math.pow(endPoint.x - currentPosition.x, 2) + 
        Math.pow(endPoint.y - currentPosition.y, 2)
      );
      
      const minDistToLine = Math.min(distToStart, distToEnd);
      if (minDistToLine < minDistance) {
        minDistance = minDistToLine;
        closestIndex = i;
      }
    }
    
    // Process lines using nearest neighbor strategy
    while (remainingLines.length > 0) {
      const selectedLine = remainingLines[closestIndex];
      remainingLines.splice(closestIndex, 1);
      
      if (selectedLine.length < 2) continue;
      
      const startPoint = selectedLine[0];
      const endPoint = selectedLine[selectedLine.length - 1];
      
      // Determine if we should draw the line forward or backward
      const distToStart = Math.sqrt(
        Math.pow(startPoint.x - currentPosition.x, 2) + 
        Math.pow(startPoint.y - currentPosition.y, 2)
      );
      const distToEnd = Math.sqrt(
        Math.pow(endPoint.x - currentPosition.x, 2) + 
        Math.pow(endPoint.y - currentPosition.y, 2)
      );
      
      let optimizedLine;
      if (distToStart <= distToEnd) {
        // Draw line forward (start to end)
        optimizedLine = [...selectedLine];
        currentPosition = { x: endPoint.x, y: endPoint.y };
      } else {
        // Draw line backward (end to start) 
        optimizedLine = [...selectedLine].reverse();
        currentPosition = { x: startPoint.x, y: startPoint.y };
      }
      
      optimizedLines.push(optimizedLine);
      
      // Find next closest line
      if (remainingLines.length > 0) {
        closestIndex = 0;
        minDistance = Infinity;
        
        for (let i = 0; i < remainingLines.length; i++) {
          const line = remainingLines[i];
          if (line.length < 2) continue;
          
          const lineStart = line[0];
          const lineEnd = line[line.length - 1];
          
          const distToStart = Math.sqrt(
            Math.pow(lineStart.x - currentPosition.x, 2) + 
            Math.pow(lineStart.y - currentPosition.y, 2)
          );
          const distToEnd = Math.sqrt(
            Math.pow(lineEnd.x - currentPosition.x, 2) + 
            Math.pow(lineEnd.y - currentPosition.y, 2)
          );
          
          const minDistToLine = Math.min(distToStart, distToEnd);
          if (minDistToLine < minDistance) {
            minDistance = minDistToLine;
            closestIndex = i;
          }
        }
      }
    }
    
    return optimizedLines;
  }

  generateGcode(lines, layerName) {
    const feedRate = parseInt(document.getElementById("feedRateValue").value) || 1500;
    const penDownZ = parseFloat(document.getElementById("penDownZValue").value) || -1;
    const penUpZ = parseFloat(document.getElementById("penUpZValue").value) || 2;
    const preventZhopDistance = parseFloat(document.getElementById("preventZhopValue").value) || 2;

    // Optimize path using closest point strategy
    const optimizedLines = this.optimizeGcodePath(lines);

    // Calculate travel distance reduction
    let originalTravelDistance = 0;
    let optimizedTravelDistance = 0;
    
    // Calculate original travel distance
    for (let i = 1; i < lines.length; i++) {
      if (lines[i-1].length >= 2 && lines[i].length >= 2) {
        const prevEnd = lines[i-1][lines[i-1].length - 1];
        const currentStart = lines[i][0];
        const dx = currentStart.x - prevEnd.x;
        const dy = currentStart.y - prevEnd.y;
        originalTravelDistance += Math.sqrt(dx * dx + dy * dy);
      }
    }
    
    // Calculate optimized travel distance  
    for (let i = 1; i < optimizedLines.length; i++) {
      if (optimizedLines[i-1].length >= 2 && optimizedLines[i].length >= 2) {
        const prevEnd = optimizedLines[i-1][optimizedLines[i-1].length - 1];
        const currentStart = optimizedLines[i][0];
        const dx = currentStart.x - prevEnd.x;
        const dy = currentStart.y - prevEnd.y;
        optimizedTravelDistance += Math.sqrt(dx * dx + dy * dy);
      }
    }
    
    const travelReduction = ((originalTravelDistance - optimizedTravelDistance) / originalTravelDistance * 100).toFixed(1);

    let gcode = [];
    gcode.push(`; ${layerName} G-code generated by HatchMoiréMaker`);
    gcode.push(`; Path optimized using closest point strategy`);
    gcode.push(`; Original travel distance: ${originalTravelDistance.toFixed(2)}mm`);
    gcode.push(`; Optimized travel distance: ${optimizedTravelDistance.toFixed(2)}mm`);
    gcode.push(`; Travel reduction: ${travelReduction}%`);
    gcode.push("G21 ; Set units to millimeters");
    gcode.push("G90 ; Absolute positioning");
    gcode.push(`G0 Z${penUpZ} ; Pen up`);
    gcode.push("");

    const canvasHeightMm = this.getCanvasHeight(); // Get canvas height for Y-axis flipping
    let lastEndPoint = null;
    
    optimizedLines.forEach((line, index) => {
      if (line.length >= 2) {
        const startPoint = line[0];
        const endPoint = line[line.length - 1];
        
        // Calculate travel distance from last end point (using flipped coordinates)
        let travelDistance = 0;
        if (lastEndPoint) {
          const dx = startPoint.x - lastEndPoint.x;
          const dy = startPoint.y - lastEndPoint.y;
          travelDistance = Math.sqrt(dx * dx + dy * dy);
        }
        
        // Flip Y coordinate for G-code (SVG: top-left origin, G-code: bottom-left origin)
        const gcodeStartY = canvasHeightMm - startPoint.y;
        
        // Move to start of line
        gcode.push(`G0 X${startPoint.x.toFixed(3)} Y${gcodeStartY.toFixed(3)}`);
        
        // Only do Z-hop if travel distance is greater than threshold
        if (!lastEndPoint || travelDistance > preventZhopDistance) {
          gcode.push(`G0 Z${penDownZ} ; Pen down`);
        }

        // Draw line segments with Y-axis flipping
        for (let i = 1; i < line.length; i++) {
          const gcodeY = canvasHeightMm - line[i].y;
          gcode.push(`G1 X${line[i].x.toFixed(3)} Y${gcodeY.toFixed(3)} F${feedRate}`);
        }

        // Only lift pen if this is the last line or next travel is long
        const isLastLine = index === optimizedLines.length - 1;
        let nextTravelDistance = 0;
        if (!isLastLine && optimizedLines[index + 1] && optimizedLines[index + 1].length >= 2) {
          const nextStart = optimizedLines[index + 1][0];
          const dx = nextStart.x - endPoint.x;
          const dy = nextStart.y - endPoint.y;
          nextTravelDistance = Math.sqrt(dx * dx + dy * dy);
        }
        
        if (isLastLine || nextTravelDistance > preventZhopDistance) {
          gcode.push(`G0 Z${penUpZ} ; Pen up`);
        }
        
        lastEndPoint = endPoint;
      }
    });

    gcode.push("M2 ; End program");
    return gcode;
  }

  updateStats() {
    let totalLines = 0;
    this.layers.forEach((layer) => {
      totalLines += layer.dragLines.length;
    });

    document.getElementById("totalLineCount").textContent = totalLines;
    document.getElementById("layerCount").textContent = this.layers.length;
  }

  downloadCombinedSvg() {
    const width = this.getCanvasWidth();
    const height = this.getCanvasHeight();

    let svg = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    svg += `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}mm" height="${height}mm">\n`;
    svg += `  <rect width="100%" height="100%" fill="white"/>\n`;

    this.layers.forEach((layer, index) => {
      if (layer.svgContent) {
        svg += `  <g id="layer-${index + 1}" stroke="${
          layer.color
        }" fill="none" stroke-linecap="round" stroke-linejoin="round">\n`;
        svg += `    ${layer.svgContent}\n`;
        svg += `  </g>\n`;
      }
    });

    svg += `</svg>`;

    const filename = `${this.originalFilename || "hatchmoire"}_combined.svg`;
    this.downloadFile(filename, svg, "image/svg+xml");
  }

  downloadIndividualSvgs() {
    this.layers.forEach((layer, index) => {
      if (layer.svgContent) {
        const width = this.getCanvasWidth();
        const height = this.getCanvasHeight();

        let svg = `<?xml version="1.0" encoding="UTF-8"?>\n`;
        svg += `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}mm" height="${height}mm">\n`;

        if (index === 0) {
          svg += `  <rect width="100%" height="100%" fill="white"/>\n`;
        }

        svg += `  <g stroke="${layer.color}" fill="none" stroke-linecap="round" stroke-linejoin="round">\n`;
        svg += `    ${layer.svgContent}\n`;
        svg += `  </g>\n`;
        svg += `</svg>`;

        const filename = `${this.originalFilename || "hatchmoire"}_layer${
          index + 1
        }.svg`;
        this.downloadFile(filename, svg, "image/svg+xml");
      }
    });
  }

  downloadCombinedGcode() {
    let allGcode = [];

    allGcode.push("; Combined HatchMoiré G-code generated by HatchMoiréMaker");
    allGcode.push("G21 ; Set units to millimeters");
    allGcode.push("G90 ; Absolute positioning");
    allGcode.push(
      `G0 Z${
        parseFloat(document.getElementById("penUpZValue").value) || 2
      } ; Pen up`
    );
    allGcode.push("");

    this.layers.forEach((layer, index) => {
      if (layer.gcodeLines.length > 0) {
        allGcode.push(`; ===== Layer ${index + 1} =====`);
        allGcode = allGcode.concat(layer.gcodeLines.slice(4, -1)); // Skip header/footer
        allGcode.push("");
      }
    });

    allGcode.push("M2 ; End program");

    const filename = `${this.originalFilename || "hatchmoire"}_combined.gcode`;
    this.downloadFile(filename, allGcode.join("\n"), "text/plain");
  }

  downloadIndividualGcodes() {
    this.layers.forEach((layer, index) => {
      if (layer.gcodeLines.length > 0) {
        const filename = `${this.originalFilename || "hatchmoire"}_layer${
          index + 1
        }.gcode`;
        this.downloadFile(filename, layer.gcodeLines.join("\n"), "text/plain");
      }
    });
  }

  downloadFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

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

  getAllParameters() {
    const config = {
      // Canvas settings
      canvasWidth: document.getElementById("canvasWidthValue").value,
      canvasHeight: document.getElementById("canvasHeightValue").value,

      // Pen settings
      penDiameter: document.getElementById("penDiameterValue").value,

      // G-code settings
      feedRate: document.getElementById("feedRateValue").value,
      penDownZ: document.getElementById("penDownZValue").value,
      penUpZ: document.getElementById("penUpZValue").value,
      preventZhop: document.getElementById("preventZhopValue").value,

      // Base pattern settings
      baseLineSpacing: document.getElementById("baseLineSpacingValue").value,
      baseMinLineLength: document.getElementById("baseMinLineLengthValue")
        .value,
      baseContrast: document.getElementById("baseContrastValue").value,
      baseMaxMergeDistance: document.getElementById("baseMaxMergeDistanceValue")
        .value,

      // Number of layers
      numLayers: this.numLayers,

      // Layer-specific settings
      layers: [],
    };

    // Save layer-specific settings
    for (let i = 0; i < this.numLayers; i++) {
      const layerConfig = {
        offsetX: document.getElementById(`layer${i}OffsetXValue`)?.value || "0",
        offsetY: document.getElementById(`layer${i}OffsetYValue`)?.value || "0",
        angle:
          document.getElementById(`layer${i}AngleValue`)?.value ||
          (45 + i * 15).toString(),
        skew: document.getElementById(`layer${i}SkewValue`)?.value || "0",
        lineSpacing:
          document.getElementById(`layer${i}LineSpacingValue`)?.value || "0.1",
        whitePoint:
          document.getElementById(`layer${i}WhitePointValue`)?.value || "0.8",
        color:
          document.getElementById(`layer${i}Color`)?.value ||
          this.getLayerColor(i),
      };
      config.layers.push(layerConfig);
    }

    return config;
  }

  applyConfiguration(config) {
    const params = config.parameters;

    // Apply canvas settings
    document.getElementById("canvasWidthValue").value =
      params.canvasWidth || "200";
    document.getElementById("canvasHeightValue").value =
      params.canvasHeight || "200";

    // Apply pen settings
    document.getElementById("penDiameterValue").value =
      params.penDiameter || "0.5";

    // Apply G-code settings
    document.getElementById("feedRateValue").value = params.feedRate || "1500";
    document.getElementById("penDownZValue").value = params.penDownZ || "-1";
    document.getElementById("penUpZValue").value = params.penUpZ || "2";
    document.getElementById("preventZhopValue").value =
      params.preventZhop || "2";

    // Apply base pattern settings
    document.getElementById("baseLineSpacingValue").value =
      params.baseLineSpacing || "0.1";
    document.getElementById("baseMinLineLengthValue").value =
      params.baseMinLineLength || "2";
    document.getElementById("baseContrastValue").value =
      params.baseContrast || "1";
    document.getElementById("baseMaxMergeDistanceValue").value =
      params.baseMaxMergeDistance || "2";

    // Apply number of layers (if different, rebuild layer controls)
    if (params.numLayers !== this.numLayers) {
      this.numLayers = params.numLayers || 2;
    }

    // Always rebuild layer controls to ensure they exist
    this.updateLayerControls();
    this.initializeLayers();

    // Apply layer-specific settings AFTER controls are rebuilt
    if (params.layers) {
      // Use setTimeout to ensure DOM is updated
      setTimeout(() => {
        params.layers.forEach((layerConfig, i) => {
          if (i < this.numLayers) {
            // Apply all layer parameters
            const inputs = [
              {
                id: `layer${i}OffsetXValue`,
                rangeId: `layer${i}OffsetX`,
                value: layerConfig.offsetX || "0",
              },
              {
                id: `layer${i}OffsetYValue`,
                rangeId: `layer${i}OffsetY`,
                value: layerConfig.offsetY || "0",
              },
              {
                id: `layer${i}AngleValue`,
                rangeId: `layer${i}Angle`,
                value: layerConfig.angle || (45 + i * 15).toString(),
              },
              {
                id: `layer${i}SkewValue`,
                rangeId: `layer${i}Skew`,
                value: layerConfig.skew || "0",
              },
              {
                id: `layer${i}LineSpacingValue`,
                rangeId: `layer${i}LineSpacing`,
                value: layerConfig.lineSpacing || "0.1",
              },
              {
                id: `layer${i}WhitePointValue`,
                rangeId: `layer${i}WhitePoint`,
                value: layerConfig.whitePoint || "0.8",
              },
              {
                id: `layer${i}Color`,
                value: layerConfig.color || this.getLayerColor(i),
              },
            ];

            inputs.forEach(({ id, rangeId, value }) => {
              const input = document.getElementById(id);
              if (input) {
                input.value = value;
                // Also update range input if it exists
                if (rangeId) {
                  const rangeInput = document.getElementById(rangeId);
                  if (rangeInput) {
                    rangeInput.value = value;
                  }
                }
              }
            });

            // Update layer properties
            this.updateLayerProperties(i);
          }
        });
      }, 10); // Small delay to ensure DOM is ready
    }

    // Load the saved image
    if (config.base64Image) {
      const img = new Image();
      img.onload = () => {
        this.originalImage = img;
        this.originalFilename = `loaded_config_${config.name}`;

        // Setup canvas with the loaded image
        this.setupCanvas(img);

        // Update thumbnail
        this.showImageThumbnail(config.base64Image);

        // Update canvas size and redraw
        this.updateSvgSize();

        // Don't call initializeLayers again as it was already called
        // Just set up InteractiveCanvas with the SVG stack
        const svgStack = document.getElementById("svgStack");
        if (this.interactiveCanvas && svgStack) {
          this.interactiveCanvas.setContent(svgStack);
        }

        // Generate moiré effect after a small delay to ensure layer params are applied
        setTimeout(() => {
          this.generateMoire();
        }, 50);

        this.showStatus(`Configuration "${config.name}" loaded successfully!`);
      };
      img.src = config.base64Image;
    } else {
      this.showStatus(`Configuration "${config.name}" loaded successfully!`);
    }
  }

  showProgressIndicator(message) {
    const indicator = document.getElementById("progressIndicator");
    const text = indicator.querySelector(".progress-text");
    text.textContent = message;
    indicator.style.display = "flex";
  }

  hideProgressIndicator() {
    const indicator = document.getElementById("progressIndicator");
    indicator.style.display = "none";
  }

  showStatus(message, type = "complete") {
    const status = document.getElementById("status");
    status.textContent = message;
    status.className = `status-notification show ${type}`;

    setTimeout(() => {
      status.classList.remove("show");
    }, 3000);
  }
}

// Initialize the converter when the page loads
document.addEventListener("DOMContentLoaded", () => {
  window.hatchMoireConverter = new HatchMoireConverter();
});
