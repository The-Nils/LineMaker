class Kaleidoscope {
    constructor() {
        this.svg = document.getElementById('kaleidoscopeSvg');
        this.sectionOverlay = document.getElementById('section-overlay');
        this.layerList = document.getElementById('layerList');
        
        // Drawing state
        this.isDrawing = false;
        this.currentPath = null;
        this.currentKaleidoscopeGroup = null;
        this.currentKaleidoscopePaths = [];
        this.points = [];
        this.smoothedPoints = [];

        // Layer system
        this.layers = [];
        this.activeLayerId = null;
        this.layerIdCounter = 1;
        this.selectedLayerIndex = -1;

        // Settings
        this.settings = {
            repetitions: 6,
            canvasWidth: 200,
            canvasHeight: 200,
            penDiameter: 0.5,
            inputSmoothing: 0.5,
            showSections: false,
            // G-code settings
            feedRate: 2500,
            penDownZ: -1,
            penUpZ: 2,
            preventZhop: 2
        };

        this.pixelsPerMm = 4; // Scaling factor for SVG units
        
        // Interactive canvas
        this.previewArea = document.querySelector('.preview-area');
        this.interactiveCanvas = new InteractiveCanvas(this.previewArea);

        // Configuration management
        this.configManager = new ConfigManager();
        this.toolId = 'kaleidoscope';

        this.setupEventListeners();
        this.syncSettingsFromUI(); // Read actual input values on page load
        this.updateCanvas();
        this.updateSectionOverlay();
        this.toggleSectionOverlay(); // Apply the show sections setting
        this.createDefaultLayer();
        this.updateRepetitionDisplay();

        // Set up InteractiveCanvas with the SVG stack
        const svgContainer = document.getElementById('svgContainer');
        if (this.interactiveCanvas && svgContainer) {
            this.interactiveCanvas.setContent(svgContainer);
        }

        // Check for URL config parameter
        this.checkForUrlConfig();
    }

    setupEventListeners() {
        // Control listeners
        this.setupSliderSync('repetitions');
        this.setupSliderSync('inputSmoothing');
        
        // Canvas size
        document.getElementById('canvasWidthValue').addEventListener('input', (e) => {
            this.settings.canvasWidth = parseFloat(e.target.value);
            this.updateCanvas();
            this.updateSectionOverlay();
        });

        document.getElementById('canvasHeightValue').addEventListener('input', (e) => {
            this.settings.canvasHeight = parseFloat(e.target.value);
            this.updateCanvas();
            this.updateSectionOverlay();
        });

        // Pen settings
        document.getElementById('penDiameterValue').addEventListener('input', (e) => {
            this.settings.penDiameter = parseFloat(e.target.value);
        });

        // G-code settings
        document.getElementById('feedRateValue').addEventListener('input', (e) => {
            this.settings.feedRate = parseFloat(e.target.value);
        });

        document.getElementById('penDownZValue').addEventListener('input', (e) => {
            this.settings.penDownZ = parseFloat(e.target.value);
        });

        document.getElementById('penUpZValue').addEventListener('input', (e) => {
            this.settings.penUpZ = parseFloat(e.target.value);
        });

        document.getElementById('preventZhopValue').addEventListener('input', (e) => {
            this.settings.preventZhop = parseFloat(e.target.value);
        });

        // Display options
        document.getElementById('showSectionsValue').addEventListener('change', (e) => {
            this.settings.showSections = e.target.checked;
            this.toggleSectionOverlay();
        });

        // Layer management
        document.getElementById('addLayerBtn').addEventListener('click', () => this.addLayer());
        document.getElementById('removeCurrentLayerBtn').addEventListener('click', () => this.removeCurrentLayer());
        
        // Layer editor color
        document.getElementById('layerColorValue').addEventListener('input', (e) => {
            this.updateSelectedLayerProperty('color', e.target.value);
        });

        // Actions
        document.getElementById('clearCanvasBtn').addEventListener('click', () => this.clearCanvas());

        // Download handlers  
        document.getElementById('downloadSvgBtn').addEventListener('click', () => this.downloadCombinedSVG());
        document.getElementById('downloadIndividualSvgBtn').addEventListener('click', () => this.downloadIndividualSVGs());
        document.getElementById('downloadGcodeBtn').addEventListener('click', () => this.downloadCombinedGcode());
        document.getElementById('downloadIndividualGcodeBtn').addEventListener('click', () => this.downloadIndividualGcodes());

        // Config management
        document.getElementById('saveConfigBtn').addEventListener('click', () => this.saveConfiguration());
        document.getElementById('loadConfigBtn').addEventListener('click', () => this.loadConfiguration());

        // Canvas controls
        document.getElementById('fitToContentBtn').addEventListener('click', () => this.fitToContent());
        document.getElementById('resetViewBtn').addEventListener('click', () => this.resetView());

        // Drawing listeners - use both mouse and pointer events for better compatibility
        this.svg.addEventListener('mousedown', (e) => this.startDrawing(e));
        this.svg.addEventListener('mousemove', (e) => this.draw(e));
        this.svg.addEventListener('mouseup', () => this.stopDrawing());
        this.svg.addEventListener('mouseleave', () => this.stopDrawing());
        
        this.svg.addEventListener('pointerdown', (e) => this.startDrawing(e));
        this.svg.addEventListener('pointermove', (e) => this.draw(e));
        this.svg.addEventListener('pointerup', () => this.stopDrawing());
        this.svg.addEventListener('pointerleave', () => this.stopDrawing());
        
        // Prevent default touch behavior
        this.svg.addEventListener('touchstart', (e) => e.preventDefault());
        this.svg.addEventListener('touchmove', (e) => e.preventDefault());
        this.svg.addEventListener('touchend', (e) => e.preventDefault());
    }

    syncSettingsFromUI() {
        // Read current input values and update settings object
        this.settings.repetitions = parseInt(document.getElementById('repetitionsValue').value) || 6;
        this.settings.canvasWidth = parseFloat(document.getElementById('canvasWidthValue').value) || 200;
        this.settings.canvasHeight = parseFloat(document.getElementById('canvasHeightValue').value) || 200;
        this.settings.penDiameter = parseFloat(document.getElementById('penDiameterValue').value) || 0.5;
        this.settings.inputSmoothing = parseFloat(document.getElementById('inputSmoothingValue').value) || 0.5;
        this.settings.feedRate = parseFloat(document.getElementById('feedRateValue').value) || 2500;
        this.settings.penDownZ = parseFloat(document.getElementById('penDownZValue').value) || -1;
        this.settings.penUpZ = parseFloat(document.getElementById('penUpZValue').value) || 2;
        this.settings.preventZhop = parseFloat(document.getElementById('preventZhopValue').value) || 2;
        this.settings.showSections = document.getElementById('showSectionsValue').checked || false;
        
        // Sync sliders with their input counterparts
        const repetitionsSlider = document.getElementById('repetitionsSlider');
        if (repetitionsSlider) repetitionsSlider.value = this.settings.repetitions;
        
        const inputSmoothingSlider = document.getElementById('inputSmoothingSlider');
        if (inputSmoothingSlider) inputSmoothingSlider.value = this.settings.inputSmoothing;
    }

    setupSliderSync(settingName) {
        const slider = document.getElementById(settingName + 'Slider');
        const input = document.getElementById(settingName + 'Value');
        
        if (!slider || !input) return;
        
        const updateSetting = (value) => {
            this.settings[settingName] = parseFloat(value);
            slider.value = value;
            input.value = value;
            
            if (settingName === 'repetitions') {
                this.updateRepetitionDisplay();
                this.updateSectionOverlay();
            }
        };
        
        slider.addEventListener('input', (e) => updateSetting(e.target.value));
        input.addEventListener('input', (e) => updateSetting(e.target.value));
    }

    // Layer Management
    createDefaultLayer() {
        this.addLayer("Layer 1", "#ff6b35");
    }

    addLayer(name = null, color = null) {
        const layerId = `layer-${this.layerIdCounter++}`;
        const layerName = name || `Layer ${this.layers.length + 1}`;
        const layerColor = color || this.getRandomColor();

        const layer = {
            id: layerId,
            name: layerName,
            color: layerColor,
            visible: true,
            svg: null, // Will be created by updateSvgStack
            group: null,
            originalGroup: null,
            kaleidoscopeGroup: null,
        };

        // Create SVG groups for this layer (SVG will be created by updateSvgStack)
        layer.group = document.createElementNS("http://www.w3.org/2000/svg", "g");
        layer.group.setAttribute("id", layerId);
        layer.group.setAttribute("data-layer-color", layerColor);

        layer.originalGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
        layer.originalGroup.setAttribute("class", "original-drawing");

        layer.kaleidoscopeGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
        layer.kaleidoscopeGroup.setAttribute("class", "kaleidoscope-group");

        layer.group.appendChild(layer.originalGroup);
        layer.group.appendChild(layer.kaleidoscopeGroup);
        
        this.layers.push(layer);
        this.updateSvgStack();
        this.updateLayerPanel();
        this.setActiveLayer(layerId);

        return layer;
    }

    getRandomColor() {
        const colors = [
            "#ff6b35", "#f7931e", "#ffd100", "#4caf50", 
            "#2196f3", "#9c27b0", "#e91e63", "#00bcd4"
        ];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    setActiveLayer(layerId) {
        this.activeLayerId = layerId;
        this.selectedLayerIndex = this.layers.findIndex(l => l.id === layerId);
        this.updateActiveLayerInfo();
        this.updateLayerPanel();
    }

    updateActiveLayerInfo() {
        const layer = this.layers.find(l => l.id === this.activeLayerId);
        if (!layer) return;

        const layerEditor = document.getElementById('layerEditor');
        if (this.selectedLayerIndex !== -1) {
            layerEditor.style.display = 'block';
            document.getElementById('currentLayerColor').style.backgroundColor = layer.color;
            document.getElementById('currentLayerName').textContent = layer.name;
            document.getElementById('layerColorValue').value = layer.color;
        } else {
            layerEditor.style.display = 'none';
        }
    }

    updateSelectedLayerProperty(property, value) {
        if (this.selectedLayerIndex === -1) return;
        
        this.layers[this.selectedLayerIndex][property] = value;
        
        if (property === 'color') {
            const layer = this.layers[this.selectedLayerIndex];
            layer.group.setAttribute('data-layer-color', value);
            
            // Update all paths in this layer
            const paths = layer.group.querySelectorAll('path');
            paths.forEach(path => {
                path.setAttribute('stroke', value);
            });
            
            document.getElementById('currentLayerColor').style.backgroundColor = value;
        }
        
        this.updateLayerPanel();
    }

    updateSvgStack() {
        const svgContainer = document.getElementById('svgContainer');
        svgContainer.innerHTML = "";
        
        // Add the main kaleidoscope SVG first (background layer for interaction and overlay)
        svgContainer.appendChild(this.svg);

        // Create layer SVGs similar to fieldlines approach
        this.layers.forEach((layer, index) => {
            if (layer.svg) {
                layer.svg.remove(); // Remove old svg if exists
            }
            
            // Create new SVG for this layer
            const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            svg.id = `kaleidoscopeLayer${index}`;
            svg.classList.add("layer-svg");
            svg.setAttribute("viewBox", `0 0 ${this.settings.canvasWidth * this.pixelsPerMm} ${this.settings.canvasHeight * this.pixelsPerMm}`);
            svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
            svg.style.position = "absolute";
            svg.style.top = "0";
            svg.style.left = "0";
            svg.style.pointerEvents = "none";
            
            // Move layer group to this SVG
            svg.appendChild(layer.group);
            svgContainer.appendChild(svg);
            
            // Update layer reference
            layer.svg = svg;
        });

        // Set up InteractiveCanvas with the SVG stack
        if (this.interactiveCanvas) {
            this.interactiveCanvas.setContent(svgContainer);
        }
    }

    updateLayerPanel() {
        this.layerList.innerHTML = '';
        
        // Render layers in reverse order (top to bottom)
        for (let i = this.layers.length - 1; i >= 0; i--) {
            const layer = this.layers[i];
            const layerElement = this.createLayerElement(layer, i);
            this.layerList.appendChild(layerElement);
        }
    }

    createLayerElement(layer, index) {
        const layerItem = document.createElement('div');
        layerItem.className = `layer-item ${layer.id === this.activeLayerId ? 'active' : ''}`;
        layerItem.setAttribute('data-layer-id', layer.id);

        const pathCount = layer.originalGroup ? layer.originalGroup.children.length : 0;
        const visibilityText = layer.visible ? "Visible" : "Hidden";

        layerItem.innerHTML = `
            <div class="layer-color-indicator" style="background-color: ${layer.color}"></div>
            <div class="layer-name">${layer.name}</div>
            <div class="layer-controls">
                <button class="visibility-btn ${layer.visible ? 'visible' : ''}" data-action="toggle-visibility" title="Toggle Visibility">
                    ${layer.visible ? '👁' : '🚫'}
                </button>
                <button class="action-btn small" data-action="move-up" title="Move Up" ${index === this.layers.length - 1 ? 'disabled' : ''}>↑</button>
                <button class="action-btn small" data-action="move-down" title="Move Down" ${index === 0 ? 'disabled' : ''}>↓</button>
                <button class="action-btn small" data-action="delete" title="Delete Layer" ${this.layers.length === 1 ? 'disabled' : ''} style="background: #e74c3c; color: white;">🗑</button>
            </div>
        `;

        // Add event listeners
        layerItem.addEventListener('click', (e) => {
            if (e.target.closest('.layer-controls')) return;
            this.setActiveLayer(layer.id);
        });

        const colorDiv = layerItem.querySelector('.layer-color-indicator');
        colorDiv.addEventListener('click', (e) => {
            e.stopPropagation();
            this.showColorPicker(layer.id);
        });

        const controls = layerItem.querySelectorAll('[data-action]');
        controls.forEach(control => {
            control.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = e.target.getAttribute('data-action');
                this.handleLayerAction(action, layer.id, index);
            });
        });

        return layerItem;
    }

    showColorPicker(layerId) {
        const layer = this.layers.find(l => l.id === layerId);
        if (!layer) return;

        const input = document.createElement('input');
        input.type = 'color';
        input.value = layer.color;
        input.style.position = 'absolute';
        input.style.opacity = '0';
        input.style.pointerEvents = 'none';

        input.addEventListener('change', (e) => {
            this.changeLayerColor(layerId, e.target.value);
            document.body.removeChild(input);
        });

        document.body.appendChild(input);
        input.click();
    }

    changeLayerColor(layerId, newColor) {
        const layer = this.layers.find(l => l.id === layerId);
        if (!layer) return;

        layer.color = newColor;
        layer.group.setAttribute('data-layer-color', newColor);

        // Update all paths in this layer
        const paths = layer.group.querySelectorAll('path');
        paths.forEach(path => {
            path.setAttribute('stroke', newColor);
        });

        this.updateLayerPanel();
        this.updateActiveLayerInfo();
    }

    handleLayerAction(action, layerId, index) {
        switch (action) {
            case 'toggle-visibility':
                this.toggleLayerVisibility(layerId);
                break;
            case 'move-up':
                this.moveLayer(index, index + 1);
                break;
            case 'move-down':
                this.moveLayer(index, index - 1);
                break;
            case 'delete':
                this.deleteLayer(layerId);
                break;
        }
    }

    toggleLayerVisibility(layerId) {
        const layer = this.layers.find(l => l.id === layerId);
        if (!layer) return;

        layer.visible = !layer.visible;
        layer.svg.style.display = layer.visible ? 'block' : 'none';

        this.updateLayerPanel();
        this.updateActiveLayerInfo();
    }

    moveLayer(fromIndex, toIndex) {
        if (toIndex < 0 || toIndex >= this.layers.length) return;

        const layer = this.layers[fromIndex];
        this.layers.splice(fromIndex, 1);
        this.layers.splice(toIndex, 0, layer);

        this.updateSvgStack();
        this.updateLayerPanel();
    }

    deleteLayer(layerId) {
        if (this.layers.length <= 1) return;

        const layerIndex = this.layers.findIndex(l => l.id === layerId);
        if (layerIndex === -1) return;

        const layer = this.layers[layerIndex];
        layer.svg.remove();
        this.layers.splice(layerIndex, 1);

        // Set new active layer
        if (this.activeLayerId === layerId) {
            const newActiveIndex = Math.min(layerIndex, this.layers.length - 1);
            this.setActiveLayer(this.layers[newActiveIndex].id);
        }

        this.updateLayerPanel();
    }

    removeCurrentLayer() {
        if (this.selectedLayerIndex === -1 || this.layers.length <= 1) return;
        this.deleteLayer(this.activeLayerId);
    }

    // Canvas and Display
    updateCanvas() {
        const widthPx = this.settings.canvasWidth * this.pixelsPerMm;
        const heightPx = this.settings.canvasHeight * this.pixelsPerMm;

        this.svg.setAttribute("viewBox", `0 0 ${widthPx} ${heightPx}`);
        
        // Update all layer SVGs viewBox
        this.layers.forEach(layer => {
            if (layer.svg) {
                layer.svg.setAttribute("viewBox", `0 0 ${widthPx} ${heightPx}`);
            }
        });
        
        // Recreate SVG stack to ensure proper sizing
        this.updateSvgStack();
    }

    updateSectionOverlay() {
        this.sectionOverlay.innerHTML = "";

        if (this.settings.repetitions === 1) return;

        const widthPx = this.settings.canvasWidth * this.pixelsPerMm;
        const heightPx = this.settings.canvasHeight * this.pixelsPerMm;
        const centerX = widthPx / 2;
        const centerY = heightPx / 2;
        const maxRadius = Math.sqrt(widthPx * widthPx + heightPx * heightPx);
        const angle = (2 * Math.PI) / this.settings.repetitions;

        // Draw radial lines from center
        for (let i = 0; i < this.settings.repetitions; i++) {
            const lineAngle = i * angle;
            const x = centerX + maxRadius * Math.cos(lineAngle);
            const y = centerY + maxRadius * Math.sin(lineAngle);

            const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
            line.setAttribute("x1", centerX);
            line.setAttribute("y1", centerY);
            line.setAttribute("x2", x);
            line.setAttribute("y2", y);

            this.sectionOverlay.appendChild(line);
        }

        // Draw concentric circles as reference
        const numCircles = 3;
        const maxCircleRadius = Math.min(centerX, centerY) * 0.9;
        for (let i = 1; i <= numCircles; i++) {
            const radius = (maxCircleRadius * i) / numCircles;
            const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            circle.setAttribute("cx", centerX);
            circle.setAttribute("cy", centerY);
            circle.setAttribute("r", radius);

            this.sectionOverlay.appendChild(circle);
        }
    }

    toggleSectionOverlay() {
        this.sectionOverlay.style.display = this.settings.showSections ? "block" : "none";
    }

    updateRepetitionDisplay() {
        let displayText;
        if (this.settings.repetitions === 1) {
            displayText = "1 segment (no repetition)";
        } else {
            const angle = 360 / this.settings.repetitions;
            displayText = `${this.settings.repetitions} segments (${angle.toFixed(1)}°)`;
        }

        const displays = document.querySelectorAll('#repetitionsDisplay, #angleDisplay');
        displays.forEach(display => {
            display.textContent = displayText;
        });
    }

    // Drawing Functions
    getMousePosition(e) {
        // Use the same approach as fieldlines - work directly with SVG coordinates
        const svgRect = this.svg.getBoundingClientRect();
        
        // Force square mapping - use the smaller dimension to ensure accuracy
        const size = Math.min(svgRect.width, svgRect.height);
        const offsetX = (svgRect.width - size) / 2;
        const offsetY = (svgRect.height - size) / 2;
        
        const relativeX = e.clientX - svgRect.left - offsetX;
        const relativeY = e.clientY - svgRect.top - offsetY;
        
        // Map to our internal coordinate space
        const canvasSize = this.settings.canvasWidth * this.pixelsPerMm;
        const x = (relativeX / size) * canvasSize;
        const y = (relativeY / size) * canvasSize;
        
        return { x, y };
    }

    startDrawing(e) {
        // Don't draw on right-click (that's for panning)
        if (e.button === 2) return;
        
        const activeLayer = this.layers.find(l => l.id === this.activeLayerId);
        if (!activeLayer || !activeLayer.visible) return;

        this.isDrawing = true;
        const pos = this.getMousePosition(e);
        this.points = [pos];
        this.smoothedPoints = [pos];

        const strokeWidth = this.settings.penDiameter * this.pixelsPerMm;

        this.currentPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
        this.currentPath.setAttribute("fill", "none");
        this.currentPath.setAttribute("stroke", activeLayer.color);
        this.currentPath.setAttribute("stroke-width", strokeWidth);
        this.currentPath.setAttribute("stroke-linecap", "round");
        this.currentPath.setAttribute("stroke-linejoin", "round");
        this.currentPath.setAttribute("class", "kaleidoscope-drawing");

        activeLayer.originalGroup.appendChild(this.currentPath);

        // Create kaleidoscope group for current drawing session
        this.currentKaleidoscopeGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
        this.currentKaleidoscopeGroup.setAttribute("data-repetitions", this.settings.repetitions);
        activeLayer.kaleidoscopeGroup.appendChild(this.currentKaleidoscopeGroup);

        this.createKaleidoscopeSegments(activeLayer);
    }

    draw(e) {
        if (!this.isDrawing) return;
        // Don't draw on right-click (that's for panning)
        if (e.button === 2) return;

        const pos = this.getMousePosition(e);
        
        // Skip points that are too close to the last point (reduces jankiness)
        if (this.points.length > 0) {
            const lastPoint = this.points[this.points.length - 1];
            const distance = Math.sqrt(
                Math.pow(pos.x - lastPoint.x, 2) + Math.pow(pos.y - lastPoint.y, 2)
            );
            // Skip if points are too close together (adjust threshold as needed)
            if (distance < 2) return;
        }
        
        this.points.push(pos);

        if (this.settings.inputSmoothing > 0) {
            this.smoothedPoints.push(this.smoothPoint(pos));
        } else {
            this.smoothedPoints.push(pos);
        }

        this.updateCurrentPath();
        this.updateCurrentKaleidoscopeSegments();
    }

    smoothPoint(currentPoint) {
        if (this.smoothedPoints.length === 0) return currentPoint;

        // Use exponential smoothing for more responsive but still smooth results
        const lastSmoothed = this.smoothedPoints[this.smoothedPoints.length - 1];
        const factor = this.settings.inputSmoothing * 0.8; // Make smoothing more effective

        return {
            x: lastSmoothed.x + (currentPoint.x - lastSmoothed.x) * (1 - factor),
            y: lastSmoothed.y + (currentPoint.y - lastSmoothed.y) * (1 - factor),
        };
    }

    // Create smooth Bézier curves from points
    createSmoothPath(points) {
        if (points.length < 2) return '';
        if (points.length === 2) {
            return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
        }

        let pathData = `M ${points[0].x} ${points[0].y}`;
        
        // Create smooth curves using quadratic Bézier curves
        for (let i = 1; i < points.length - 1; i++) {
            const prev = points[i - 1];
            const curr = points[i];
            const next = points[i + 1];
            
            // Calculate control point for smooth curve
            const cpX = curr.x;
            const cpY = curr.y;
            
            // End point is halfway to next point for smoother curves
            const endX = (curr.x + next.x) / 2;
            const endY = (curr.y + next.y) / 2;
            
            pathData += ` Q ${cpX} ${cpY} ${endX} ${endY}`;
        }
        
        // Final line to last point
        const lastPoint = points[points.length - 1];
        pathData += ` L ${lastPoint.x} ${lastPoint.y}`;
        
        return pathData;
    }

    updateCurrentPath() {
        if (this.smoothedPoints.length < 2) return;

        // Use smooth curve generation instead of straight lines
        const pathData = this.createSmoothPath(this.smoothedPoints);
        this.currentPath.setAttribute("d", pathData);
    }

    createKaleidoscopeSegments(layer) {
        if (this.settings.repetitions === 1) {
            this.currentKaleidoscopePaths = [];
            return;
        }

        const angle = 360 / this.settings.repetitions;
        const widthPx = this.settings.canvasWidth * this.pixelsPerMm;
        const heightPx = this.settings.canvasHeight * this.pixelsPerMm;
        const centerX = widthPx / 2;
        const centerY = heightPx / 2;
        const strokeWidth = this.settings.penDiameter * this.pixelsPerMm;

        this.currentKaleidoscopePaths = [];
        for (let i = 1; i < this.settings.repetitions; i++) {
            const segmentPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
            segmentPath.setAttribute("fill", "none");
            segmentPath.setAttribute("stroke", layer.color);
            segmentPath.setAttribute("stroke-width", strokeWidth);
            segmentPath.setAttribute("stroke-linecap", "round");
            segmentPath.setAttribute("stroke-linejoin", "round");
            segmentPath.setAttribute("class", "kaleidoscope-drawing");
            segmentPath.setAttribute("transform", `rotate(${i * angle} ${centerX} ${centerY})`);

            this.currentKaleidoscopeGroup.appendChild(segmentPath);
            this.currentKaleidoscopePaths.push(segmentPath);
        }
    }

    updateCurrentKaleidoscopeSegments() {
        if (!this.currentKaleidoscopePaths || this.smoothedPoints.length < 2) return;

        // Use the same smooth curve generation for kaleidoscope segments
        const pathData = this.createSmoothPath(this.smoothedPoints);
        this.currentKaleidoscopePaths.forEach(path => {
            path.setAttribute("d", pathData);
        });
    }

    stopDrawing() {
        this.isDrawing = false;
        this.currentPath = null;
        this.currentKaleidoscopeGroup = null;
        this.currentKaleidoscopePaths = [];
        this.points = [];
        this.smoothedPoints = [];
    }

    clearCanvas() {
        this.layers.forEach(layer => {
            layer.originalGroup.innerHTML = "";
            layer.kaleidoscopeGroup.innerHTML = "";
        });
    }

    // Canvas Controls
    fitToContent() {
        if (this.interactiveCanvas) {
            this.interactiveCanvas.fitToContent();
        }
    }

    resetView() {
        if (this.interactiveCanvas) {
            this.interactiveCanvas.resetView();
        }
    }

    // Download Functions
    downloadCombinedSVG() {
        const downloadSVG = this.createCombinedSVG();
        this.downloadSVGFile(downloadSVG, `kaleidoscope-combined-${this.settings.repetitions}x-${this.settings.canvasWidth}x${this.settings.canvasHeight}mm.svg`);
    }

    downloadIndividualSVGs() {
        this.layers.forEach((layer, index) => {
            const downloadSVG = this.createLayerSVG(layer);
            this.downloadSVGFile(downloadSVG, `kaleidoscope-layer${index + 1}-${this.settings.repetitions}x-${this.settings.canvasWidth}x${this.settings.canvasHeight}mm.svg`);
        });
    }

    createCombinedSVG() {
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        svg.setAttribute("width", `${this.settings.canvasWidth}mm`);
        svg.setAttribute("height", `${this.settings.canvasHeight}mm`);
        svg.setAttribute("viewBox", `0 0 ${this.settings.canvasWidth * this.pixelsPerMm} ${this.settings.canvasHeight * this.pixelsPerMm}`);

        this.layers.forEach(layer => {
            if (layer.visible) {
                const layerGroup = layer.group.cloneNode(true);
                svg.appendChild(layerGroup);
            }
        });

        return svg;
    }

    createLayerSVG(layer) {
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        svg.setAttribute("width", `${this.settings.canvasWidth}mm`);
        svg.setAttribute("height", `${this.settings.canvasHeight}mm`);
        svg.setAttribute("viewBox", `0 0 ${this.settings.canvasWidth * this.pixelsPerMm} ${this.settings.canvasHeight * this.pixelsPerMm}`);

        if (layer.visible) {
            const layerGroup = layer.group.cloneNode(true);
            svg.appendChild(layerGroup);
        }

        return svg;
    }

    downloadSVGFile(svg, filename) {
        const serializer = new XMLSerializer();
        const svgString = serializer.serializeToString(svg);
        const blob = new Blob([svgString], { type: "image/svg+xml" });
        const url = URL.createObjectURL(blob);

        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        URL.revokeObjectURL(url);
    }

    // G-code Functions
    downloadCombinedGcode() {
        let allPaths = [];
        this.layers.forEach(layer => {
            if (layer.visible) {
                const paths = this.extractPathsFromSVG(layer.group);
                allPaths = allPaths.concat(paths);
            }
        });
        
        const gcode = this.generateGcode(allPaths);
        this.downloadGcodeFile(gcode, `kaleidoscope-combined-${this.settings.repetitions}x-${this.settings.canvasWidth}x${this.settings.canvasHeight}mm.gcode`);
    }

    downloadIndividualGcodes() {
        this.layers.forEach((layer, index) => {
            if (layer.visible) {
                const paths = this.extractPathsFromSVG(layer.group);
                const gcode = this.generateGcode(paths);
                this.downloadGcodeFile(gcode, `kaleidoscope-layer${index + 1}-${this.settings.repetitions}x-${this.settings.canvasWidth}x${this.settings.canvasHeight}mm.gcode`);
            }
        });
    }

    extractPathsFromSVG(element) {
        const paths = [];
        const pathElements = element.querySelectorAll('path');
        
        console.log(`Found ${pathElements.length} path elements in SVG`);
        
        pathElements.forEach((pathEl, index) => {
            const pathData = pathEl.getAttribute('d');
            const transform = pathEl.getAttribute('transform');
            
            console.log(`Path ${index + 1}:`, pathData?.substring(0, 100) + '...', transform ? `(transform: ${transform})` : '');
            
            if (pathData && pathData.trim() !== '') {
                let parsedPath = this.parseSVGPath(pathData);
                
                // Apply transform if it exists
                if (transform && parsedPath.length > 0) {
                    parsedPath = this.applyTransformToPath(parsedPath, transform);
                }
                
                if (parsedPath.length > 0) {
                    paths.push(parsedPath);
                }
            }
        });
        
        console.log(`Extracted ${paths.length} valid paths for G-code`);
        return paths;
    }

    // Apply SVG transform to path coordinates
    applyTransformToPath(path, transformString) {
        const rotateMatch = transformString.match(/rotate\(([^)]+)\)/);
        if (!rotateMatch) return path;
        
        const params = rotateMatch[1].split(/\s+|,/).map(parseFloat);
        const angle = params[0] * Math.PI / 180; // Convert to radians
        const centerX = params[1] / this.pixelsPerMm || 0; // Convert to mm
        const centerY = (this.settings.canvasHeight * this.pixelsPerMm - params[2]) / this.pixelsPerMm || 0; // Convert and flip Y
        
        return path.map(point => {
            // Translate to origin
            const x = point.x - centerX;
            const y = point.y - centerY;
            
            // Rotate
            const rotatedX = x * Math.cos(angle) - y * Math.sin(angle);
            const rotatedY = x * Math.sin(angle) + y * Math.cos(angle);
            
            // Translate back
            return {
                x: rotatedX + centerX,
                y: rotatedY + centerY,
                move: point.move
            };
        });
    }

    parseSVGPath(pathData) {
        // Enhanced path parser that handles M, L, and Q commands
        const commands = pathData.match(/[MLQ][^MLQ]*/g);
        const points = [];
        let currentPos = { x: 0, y: 0 };
        
        commands?.forEach(command => {
            const type = command[0];
            const coords = command.slice(1).trim().split(/\s+|,/).map(parseFloat);
            
            if (type === 'M' && coords.length >= 2) {
                // Move to
                const x = coords[0] / this.pixelsPerMm;
                const y = (this.settings.canvasHeight * this.pixelsPerMm - coords[1]) / this.pixelsPerMm; // Flip Y
                currentPos = { x, y };
                points.push({ x, y, move: true });
                
            } else if (type === 'L' && coords.length >= 2) {
                // Line to
                const x = coords[0] / this.pixelsPerMm;
                const y = (this.settings.canvasHeight * this.pixelsPerMm - coords[1]) / this.pixelsPerMm; // Flip Y
                currentPos = { x, y };
                points.push({ x, y, move: false });
                
            } else if (type === 'Q' && coords.length >= 4) {
                // Quadratic Bézier curve - flatten to line segments
                const cpX = coords[0] / this.pixelsPerMm;
                const cpY = (this.settings.canvasHeight * this.pixelsPerMm - coords[1]) / this.pixelsPerMm; // Flip Y
                const endX = coords[2] / this.pixelsPerMm;
                const endY = (this.settings.canvasHeight * this.pixelsPerMm - coords[3]) / this.pixelsPerMm; // Flip Y
                
                // Flatten Bézier curve to line segments
                const segments = this.flattenQuadraticBezier(
                    currentPos.x, currentPos.y,
                    cpX, cpY,
                    endX, endY,
                    10 // Number of segments
                );
                
                segments.forEach((point, index) => {
                    points.push({ x: point.x, y: point.y, move: false });
                });
                
                currentPos = { x: endX, y: endY };
            }
        });
        
        return points;
    }

    // Flatten quadratic Bézier curve to line segments
    flattenQuadraticBezier(x0, y0, x1, y1, x2, y2, segments) {
        const points = [];
        for (let i = 1; i <= segments; i++) {
            const t = i / segments;
            const x = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * x1 + t * t * x2;
            const y = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * y1 + t * t * y2;
            points.push({ x, y });
        }
        return points;
    }

    generateGcode(paths) {
        let gcode = "; Kaleidoscope G-code\n";
        gcode += "; Generated by LineMaker Kaleidoscope Tool\n";
        gcode += `; Canvas: ${this.settings.canvasWidth}mm x ${this.settings.canvasHeight}mm\n`;
        gcode += `; Repetitions: ${this.settings.repetitions}\n\n`;
        
        // G-code header
        gcode += "G21 ; Set units to millimeters\n";
        gcode += "G90 ; Use absolute positioning\n";
        gcode += "G28 ; Home all axes\n";
        gcode += `G0 Z${this.settings.penUpZ} ; Pen up\n\n`;
        
        paths.forEach((path, pathIndex) => {
            gcode += `; Path ${pathIndex + 1}\n`;
            
            // Clip path to canvas boundaries
            const clippedSegments = this.clipPathToCanvas(path);
            
            clippedSegments.forEach((segment, segmentIndex) => {
                if (segment.length === 0) return;
                
                gcode += `; Segment ${segmentIndex + 1}\n`;
                
                // Move to start of segment with pen up
                const startPoint = segment[0];
                gcode += `G0 Z${this.settings.penUpZ} ; Pen up\n`;
                gcode += `G0 X${startPoint.x.toFixed(3)} Y${startPoint.y.toFixed(3)} F${this.settings.feedRate} ; Move to start\n`;
                gcode += `G0 Z${this.settings.penDownZ} ; Pen down\n`;
                
                // Draw the segment
                for (let i = 1; i < segment.length; i++) {
                    const point = segment[i];
                    const prevPoint = segment[i - 1];
                    const distance = Math.sqrt(Math.pow(point.x - prevPoint.x, 2) + Math.pow(point.y - prevPoint.y, 2));
                    
                    if (distance > this.settings.preventZhop) {
                        gcode += `G0 Z${this.settings.penUpZ} ; Pen up for long move\n`;
                        gcode += `G0 X${point.x.toFixed(3)} Y${point.y.toFixed(3)} F${this.settings.feedRate}\n`;
                        gcode += `G0 Z${this.settings.penDownZ} ; Pen down\n`;
                    } else {
                        gcode += `G1 X${point.x.toFixed(3)} Y${point.y.toFixed(3)} F${this.settings.feedRate}\n`;
                    }
                }
                
                gcode += `G0 Z${this.settings.penUpZ} ; Pen up at end of segment\n`;
            });
            
            gcode += "\n";
        });
        
        // G-code footer
        gcode += `G0 Z${this.settings.penUpZ} ; Final pen up\n`;
        gcode += "G28 ; Home all axes\n";
        gcode += "M30 ; Program end\n";
        
        return gcode;
    }

    // Clip path to canvas boundaries and return array of valid segments
    clipPathToCanvas(path) {
        if (path.length === 0) return [];
        
        const segments = [];
        let currentSegment = [];
        
        for (let i = 0; i < path.length; i++) {
            const point = path[i];
            const isInside = this.isPointInsideCanvas(point);
            
            if (isInside) {
                // Point is inside canvas
                if (currentSegment.length === 0) {
                    // Starting a new segment
                    if (i > 0) {
                        // Check if we need to add intersection point from previous point
                        const prevPoint = path[i - 1];
                        if (!this.isPointInsideCanvas(prevPoint)) {
                            const intersection = this.findCanvasIntersection(prevPoint, point);
                            if (intersection) {
                                currentSegment.push(intersection);
                            }
                        }
                    }
                }
                currentSegment.push(point);
            } else {
                // Point is outside canvas
                if (currentSegment.length > 0) {
                    // End current segment at canvas boundary
                    const lastInsidePoint = currentSegment[currentSegment.length - 1];
                    const intersection = this.findCanvasIntersection(lastInsidePoint, point);
                    if (intersection) {
                        currentSegment.push(intersection);
                    }
                    
                    // Save segment and start new one
                    if (currentSegment.length > 1) {
                        segments.push(currentSegment);
                    }
                    currentSegment = [];
                }
            }
        }
        
        // Add final segment if it exists
        if (currentSegment.length > 1) {
            segments.push(currentSegment);
        }
        
        return segments;
    }

    // Check if point is inside canvas boundaries
    isPointInsideCanvas(point) {
        return point.x >= 0 && point.x <= this.settings.canvasWidth &&
               point.y >= 0 && point.y <= this.settings.canvasHeight;
    }

    // Find intersection of line segment with canvas boundary
    findCanvasIntersection(p1, p2) {
        const intersections = [];
        
        // Check intersection with each canvas edge
        const edges = [
            { x1: 0, y1: 0, x2: this.settings.canvasWidth, y2: 0 }, // Top edge
            { x1: this.settings.canvasWidth, y1: 0, x2: this.settings.canvasWidth, y2: this.settings.canvasHeight }, // Right edge
            { x1: this.settings.canvasWidth, y1: this.settings.canvasHeight, x2: 0, y2: this.settings.canvasHeight }, // Bottom edge
            { x1: 0, y1: this.settings.canvasHeight, x2: 0, y2: 0 } // Left edge
        ];
        
        edges.forEach(edge => {
            const intersection = this.lineIntersection(p1, p2, edge);
            if (intersection) {
                intersections.push(intersection);
            }
        });
        
        if (intersections.length === 0) return null;
        
        // Return the intersection closest to p1
        return intersections.reduce((closest, current) => {
            const distCurrent = Math.sqrt(Math.pow(current.x - p1.x, 2) + Math.pow(current.y - p1.y, 2));
            const distClosest = Math.sqrt(Math.pow(closest.x - p1.x, 2) + Math.pow(closest.y - p1.y, 2));
            return distCurrent < distClosest ? current : closest;
        });
    }

    // Calculate intersection between two line segments
    lineIntersection(line1p1, line1p2, line2) {
        const x1 = line1p1.x, y1 = line1p1.y;
        const x2 = line1p2.x, y2 = line1p2.y;
        const x3 = line2.x1, y3 = line2.y1;
        const x4 = line2.x2, y4 = line2.y2;
        
        const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
        if (Math.abs(denom) < 1e-10) return null; // Lines are parallel
        
        const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
        const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;
        
        // Check if intersection is within both line segments
        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
            return {
                x: x1 + t * (x2 - x1),
                y: y1 + t * (y2 - y1),
                move: false
            };
        }
        
        return null;
    }

    downloadGcodeFile(gcode, filename) {
        const blob = new Blob([gcode], { type: "text/plain" });
        const url = URL.createObjectURL(blob);

        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        URL.revokeObjectURL(url);
    }

    // Configuration Management
    saveConfiguration() {
        const parameters = {
            ...this.settings,
            layers: this.layers.map(layer => ({
                name: layer.name,
                color: layer.color,
                visible: layer.visible
            }))
        };

        const canvas = this.createCombinedSVG();
        const serializer = new XMLSerializer();
        const svgString = serializer.serializeToString(canvas);
        const base64Image = btoa(svgString);

        this.configManager.saveConfig(this.toolId, 'Kaleidoscope Configuration', parameters, base64Image);
    }

    loadConfiguration() {
        this.configManager.loadConfig(this.toolId, (config) => {
            if (config.parameters) {
                // Apply settings
                Object.assign(this.settings, config.parameters);
                
                // Update UI
                this.updateControls();
                this.updateCanvas();
                this.updateSectionOverlay();
                this.updateRepetitionDisplay();
                
                // Recreate layers
                if (config.parameters.layers) {
                    this.clearCanvas();
                    this.layers = [];
                    this.layerIdCounter = 1;
                    
                    config.parameters.layers.forEach(layerData => {
                        this.addLayer(layerData.name, layerData.color);
                    });
                    
                    this.updateLayerPanel();
                }
            }
        });
    }

    updateControls() {
        // Update form controls with current settings
        Object.keys(this.settings).forEach(key => {
            const input = document.getElementById(key + 'Value');
            const slider = document.getElementById(key + 'Slider');
            
            if (input) input.value = this.settings[key];
            if (slider) slider.value = this.settings[key];
        });
        
        // Update checkboxes
        document.getElementById('showSectionsValue').checked = this.settings.showSections;
    }

    checkForUrlConfig() {
        const urlParams = new URLSearchParams(window.location.search);
        const configParam = urlParams.get('config');
        
        if (configParam) {
            try {
                const configId = decodeURIComponent(configParam);
                const config = this.configManager.getConfigById(this.toolId, configId);
                if (config) {
                    // Load the configuration
                    Object.assign(this.settings, config.parameters);
                    this.updateControls();
                    this.updateCanvas();
                    this.updateSectionOverlay();
                    this.updateRepetitionDisplay();
                }
            } catch (error) {
                console.warn('Failed to load config from URL:', error);
            }
        }
    }
}

// Initialize the kaleidoscope when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new Kaleidoscope();
});