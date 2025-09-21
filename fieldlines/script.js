class FieldLines {
    constructor() {
        this.fieldPointsSvg = document.getElementById('fieldPointsSvg');
        this.fieldPointsGroup = document.getElementById('field-points');
        this.drawnLinesGroup = document.getElementById('drawn-lines');
        this.modal = document.getElementById('pointModal');
        this.selectedPointIndex = -1;
        this.svgContainer = document.getElementById('svgContainer');

        this.points = [];
        this.drawnLines = [];
        this.pixelsPerMm = 4; // A scaling factor for SVG units

        this.drawMode = false;
        this.isDrawing = false;
        this.currentDrawing = [];

        // Layer system - simple approach like moiremaker
        this.layers = [];
        this.numLayers = 1; // Default number of layers
        this.selectedLayerIndex = -1; // Currently selected layer for editing
        this.regenerateTimeout = null; // For debouncing layer regeneration
        this.interactiveCanvasTimeout = null; // For debouncing InteractiveCanvas updates

        this.previewArea = document.querySelector('.preview-area');
        this.interactiveCanvas = new InteractiveCanvas(this.previewArea);

        // Configuration management
        this.configManager = new ConfigManager();
        this.toolId = 'fieldlines';

        this.setupEventListeners();
        this.updateCanvasSize();
        this.initializeLayers();
        this.generateAllLayers();
        this.draw();
        
        // Check for URL config parameter
        this.checkForUrlConfig();
    }
    
    initializeCurveEditors() {
        // Initialize new point curve editor
        const newPointContainer = document.getElementById('newPointCurveEditor');
        this.newPointCurveEditor = new CurveEditor(newPointContainer, {
            width: 160,
            height: 120,
            backgroundColor: '#ffffff',
            curveColor: '#007bff',
            pointColor: '#007bff'
        });
        
        // Set default curve (similar to falloff 0.7)
        this.newPointCurveEditor.setCurve([
            { x: 0, y: 1 },      // Full force at center
            { x: 0.7, y: 0.3 },  // Moderate falloff 
            { x: 1, y: 0 }       // No force at edge
        ]);
        
        this.newPointCurveEditor.on('change', () => {
            // Don't redraw automatically - curve only affects new points
            // this.draw();
        });
        
        // Initialize modal curve editor
        const modalContainer = document.getElementById('pointCurveEditor');
        this.modalCurveEditor = new CurveEditor(modalContainer, {
            width: 160,
            height: 120,
            backgroundColor: '#ffffff',
            curveColor: '#007bff',
            pointColor: '#007bff'
        });
        
        this.modalCurveEditor.on('change', (curveData) => {
            if (this.selectedPointIndex !== -1) {
                // Create independent curve data for this point
                const controlPoints = curveData.points.map(p => ({ x: p.x, y: p.y })); // Deep copy points
                this.points[this.selectedPointIndex].curveData = {
                    points: controlPoints,
                    evaluate: this.createCurveEvaluator(controlPoints)
                };
                // Regenerate automatically with smooth curves
                this.generateAllLayers();
                this.draw();
            }
        });
    }

    createCurveEvaluator(controlPoints) {
        // Create a static evaluator function based on control points
        // This avoids creating temporary CurveEditor instances
        return function(x) {
            x = Math.max(0, Math.min(1, x));
            
            if (controlPoints.length < 2) return 0;
            if (controlPoints.length === 2) {
                // Pure linear interpolation for 2 points
                const p0 = controlPoints[0];
                const p1 = controlPoints[1];
                if (p1.x === p0.x) return p0.y;
                const t = (x - p0.x) / (p1.x - p0.x);
                return Math.max(0, Math.min(1, p0.y + (p1.y - p0.y) * t));
            }
            
            // Find segment
            let i = 0;
            for (i = 0; i < controlPoints.length - 1; i++) {
                if (x <= controlPoints[i + 1].x) break;
            }
            
            // Boundary conditions
            if (i === 0 && x < controlPoints[0].x) return controlPoints[0].y;
            if (i >= controlPoints.length - 1) return controlPoints[controlPoints.length - 1].y;
            
            // Get 4 points for cubic interpolation (with proper boundary handling)
            const p0 = i > 0 ? controlPoints[i - 1] : controlPoints[i];
            const p1 = controlPoints[i];
            const p2 = controlPoints[i + 1];
            const p3 = i < controlPoints.length - 2 ? controlPoints[i + 2] : controlPoints[i + 1];
            
            // Parameterize within segment
            const t = (x - p1.x) / (p2.x - p1.x);
            
            // Hermite cubic interpolation (stable alternative to Catmull-Rom)
            const t2 = t * t;
            const t3 = t2 * t;
            
            // Calculate tangents
            const m0 = i > 0 ? 0.5 * ((p2.y - p0.y) / Math.max(0.001, p2.x - p0.x)) : 0;
            const m1 = i < controlPoints.length - 2 ? 0.5 * ((p3.y - p1.y) / Math.max(0.001, p3.x - p1.x)) : 0;
            
            // Hermite basis functions
            const h00 = 2*t3 - 3*t2 + 1;
            const h10 = t3 - 2*t2 + t;
            const h01 = -2*t3 + 3*t2;
            const h11 = t3 - t2;
            
            const result = h00 * p1.y + h10 * m0 * (p2.x - p1.x) + h01 * p2.y + h11 * m1 * (p2.x - p1.x);
            
            return Math.max(0, Math.min(1, result));
        };
    }

    setupEventListeners() {
        // Canvas size
        document.getElementById('canvasWidthValue').addEventListener('input', () => { this.updateCanvasSize(); this.generateAllLayers(); this.updateLayerPanel(); this.draw(); });
        document.getElementById('canvasHeightValue').addEventListener('input', () => { this.updateCanvasSize(); this.generateAllLayers(); this.updateLayerPanel(); this.draw(); });
        
        // Layer management
        document.getElementById('addLayerBtn').addEventListener('click', () => this.addLayer());
        document.getElementById('removeCurrentLayerBtn').addEventListener('click', () => this.removeCurrentLayer());
        
        // Set up pen diameter
        document.getElementById('penDiameterValue').addEventListener('input', () => this.draw());

        // Layer editor controls
        document.getElementById('layerColorValue').addEventListener('input', () => this.updateSelectedLayerProperty('color', document.getElementById('layerColorValue').value));
        document.getElementById('lineAngleValue').addEventListener('input', () => this.updateSelectedLayerProperty('angle', parseFloat(document.getElementById('lineAngleValue').value)));
        document.getElementById('lineSpacingValue').addEventListener('input', () => this.updateSelectedLayerProperty('spacing', parseFloat(document.getElementById('lineSpacingValue').value)));
        document.getElementById('layerOffsetXValue').addEventListener('input', () => this.updateSelectedLayerProperty('offsetX', parseFloat(document.getElementById('layerOffsetXValue').value)));
        document.getElementById('layerOffsetYValue').addEventListener('input', () => this.updateSelectedLayerProperty('offsetY', parseFloat(document.getElementById('layerOffsetYValue').value)));
        document.getElementById('maxSegmentLengthValue').addEventListener('input', () => this.updateSelectedLayerProperty('maxSegmentLength', parseFloat(document.getElementById('maxSegmentLengthValue').value)));

        // Layer panel event delegation
        document.getElementById('layerList').addEventListener('click', (e) => {
            const layerItem = e.target.closest('.layer-item');
            if (layerItem) {
                const layerIndex = parseInt(layerItem.dataset.layerIndex);
                this.selectLayer(layerIndex);
            }
        });

        // New point settings
        this.syncInputs('newPointForce', 'newPointForceValue');
        this.syncInputs('newPointRadius', 'newPointRadiusValue');
        
        // Initialize curve editors
        this.initializeCurveEditors();

        // Buttons
        document.getElementById('drawModeBtn').addEventListener('click', (e) => this.toggleDrawMode(e));
        document.getElementById('clearPointsBtn').addEventListener('click', () => {
            this.points = [];
            this.drawnLines = [];
            this.draw();
        });
        document.getElementById('saveConfigBtn').addEventListener('click', () => this.saveConfiguration());
        document.getElementById('loadConfigBtn').addEventListener('click', () => this.loadConfiguration());
        document.getElementById('fitToContentBtn').addEventListener('click', () => this.interactiveCanvas.fitToContent());
        document.getElementById('resetViewBtn').addEventListener('click', () => this.interactiveCanvas.resetTransform());

        // Download buttons
        document.getElementById('downloadSvgBtn').addEventListener('click', () => this.downloadCombinedSvg());
        document.getElementById('downloadIndividualSvgBtn').addEventListener('click', () => this.downloadIndividualSvgs());
        document.getElementById('downloadGcodeBtn').addEventListener('click', () => this.downloadCombinedGcode());
        document.getElementById('downloadIndividualGcodeBtn').addEventListener('click', () => this.downloadIndividualGcodes());

        // SVG interaction
        this.fieldPointsSvg.addEventListener('pointerdown', (e) => this.handlePointerDown(e));
        document.addEventListener('pointermove', (e) => this.handlePointerMove(e));
        document.addEventListener('pointerup', (e) => this.handlePointerUp(e));
        this.fieldPointsSvg.addEventListener('click', (e) => this.handleCanvasClick(e));
        this.fieldPointsGroup.addEventListener('click', (e) => this.handlePointClick(e));

        // Modal events
        this.modal.querySelector('.close-button').addEventListener('click', () => this.closeModal());
        document.querySelectorAll('input[name="pointMode"]').forEach(radio => {
            radio.addEventListener('change', (e) => this.updatePointMode(e));
        });
        this.syncInputs('pointForce', 'pointForceValue', () => this.updatePointData());
        this.syncInputs('pointRadius', 'pointRadiusValue', () => this.updatePointData());
        document.getElementById('pointAllowCrossing').addEventListener('change', (e) => this.updatePointAllowCrossing(e));
        document.getElementById('deletePointBtn').addEventListener('click', () => this.deletePoint());
        
        // Visualization toggle
        document.getElementById('showVisualization').addEventListener('change', () => this.draw());
    }

    toggleDrawMode(e) {
        this.drawMode = !this.drawMode;
        const btn = e.target;
        if (this.drawMode) {
            btn.classList.add('active');
            this.interactiveCanvas.disable();
            this.previewArea.style.pointerEvents = 'auto';
        } else {
            btn.classList.remove('active');
            this.interactiveCanvas.enable();
        }
    }

    handlePointerDown(e) {
        if (!this.drawMode) return;
        e.stopPropagation();
        this.isDrawing = true;
        this.currentDrawing = [this.getSVGPoint(e)];
    }

    handlePointerMove(e) {
        if (!this.isDrawing) return;
        e.preventDefault();
        this.currentDrawing.push(this.getSVGPoint(e));
        this.draw(); // Redraw to show the line being drawn
    }

    handlePointerUp(e) {
        if (!this.isDrawing) return;
        this.isDrawing = false;

        if (this.currentDrawing.length < 5) { // Threshold for click vs drag
            this.createPoint(this.getSVGPoint(e));
        } else {
            const smoothedLine = this.smoothLine(this.currentDrawing, 0.5);
            const newPointMode = document.querySelector('input[name="newPointMode"]:checked').value;
            const newPointForce = document.getElementById('newPointForceValue').value;
            const newPointRadius = document.getElementById('newPointRadiusValue').value * this.pixelsPerMm;
            const newPointAllowCrossing = document.getElementById('newPointAllowCrossing').checked;

            const curveData = this.newPointCurveEditor.getCurveData();
            const controlPoints = curveData.points.map(p => ({ x: p.x, y: p.y })); // Deep copy points
            this.drawnLines.push({
                points: smoothedLine,
                mode: newPointMode,
                force: newPointForce,
                radius: newPointRadius,
                curveData: {
                    points: controlPoints,
                    evaluate: this.createCurveEvaluator(controlPoints)
                },
                allowCrossing: newPointAllowCrossing
            });
        }
        this.currentDrawing = [];
        this.draw();
    }

    getSVGPoint(e) {
        // Use the same coordinate space as line generation (this.width × this.height)
        // instead of relying on SVG's potentially non-square rendered dimensions
        const svgRect = this.fieldPointsSvg.getBoundingClientRect();
        
        // Force square mapping - use the smaller dimension to ensure accuracy
        const size = Math.min(svgRect.width, svgRect.height);
        const offsetX = (svgRect.width - size) / 2;
        const offsetY = (svgRect.height - size) / 2;
        
        const relativeX = e.clientX - svgRect.left - offsetX;
        const relativeY = e.clientY - svgRect.top - offsetY;
        
        // Map to our internal coordinate space (this.width × this.height)
        const x = (relativeX / size) * this.width;
        const y = (relativeY / size) * this.height;
        
        return { x, y };
    }

    createPoint(point) {
        const newPointMode = document.querySelector('input[name="newPointMode"]:checked').value;
        const newPointForce = document.getElementById('newPointForceValue').value;
        const newPointRadius = document.getElementById('newPointRadiusValue').value * this.pixelsPerMm;
        const newPointAllowCrossing = document.getElementById('newPointAllowCrossing').checked;

        const curveData = this.newPointCurveEditor.getCurveData();
        const controlPoints = curveData.points.map(p => ({ x: p.x, y: p.y })); // Deep copy points
        this.points.push({
            x: point.x,
            y: point.y,
            mode: newPointMode,
            force: newPointForce,
            radius: newPointRadius,
            curveData: {
                points: controlPoints,
                evaluate: this.createCurveEvaluator(controlPoints)
            },
            allowCrossing: newPointAllowCrossing
        });
    }

    syncInputs(sliderId, numberId, callback) {
        const slider = document.getElementById(sliderId);
        const number = document.getElementById(numberId);

        slider.addEventListener('input', () => {
            number.value = slider.value;
            if (callback) callback();
        });
        number.addEventListener('input', () => {
            slider.value = number.value;
            if (callback) callback();
        });
    }

    updateCanvasSize() {
        const widthMm = this.getCanvasWidth();
        const heightMm = this.getCanvasHeight();
        const widthPx = Math.round(widthMm * this.pixelsPerMm);
        const heightPx = Math.round(heightMm * this.pixelsPerMm);
        
        this.width = widthPx;
        this.height = heightPx;
        
        // Update field points SVG
        this.fieldPointsSvg.setAttribute('viewBox', `0 0 ${widthPx} ${heightPx}`);
        
        // Update all layer SVGs
        this.layers.forEach(layer => {
            if (layer.svg) {
                layer.svg.setAttribute('viewBox', `0 0 ${widthPx} ${heightPx}`);
            }
        });
    }

    // Removed - replaced by layer-based line generation

    // Layer Management
    initializeLayers() {
        this.layers = [];
        for (let i = 0; i < this.numLayers; i++) {
            this.layers.push({
                svg: null,
                group: null,
                svgContent: "",
                lines: [],
                color: this.getLayerColor(i),
                offsetX: 0,
                offsetY: 0,
                angle: 0 + i * 15, // Vary angle for each layer
                spacing: 1,
                maxSegmentLength: 2, // mm
            });
        }
        this.updateSvgStack();
        this.updateLayerPanel();

        // Update InteractiveCanvas content
        this.updateInteractiveCanvas();
    }

    updateInteractiveCanvas() {
        // Debounce the InteractiveCanvas updates to prevent zoom jittering
        if (this.interactiveCanvasTimeout) {
            clearTimeout(this.interactiveCanvasTimeout);
        }
        
        this.interactiveCanvasTimeout = setTimeout(() => {
            const svgStack = document.getElementById("svgContainer");
            if (this.interactiveCanvas && svgStack) {
                // Update content while trying to preserve zoom state
                this.interactiveCanvas.setContent(svgStack);
            }
        }, 50); // 50ms debounce
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
        const svgStack = document.getElementById("svgContainer");
        svgStack.innerHTML = "";

        // Add the field points SVG first (background layer for interaction)
        svgStack.appendChild(this.fieldPointsSvg);

        for (let i = 0; i < this.layers.length; i++) {
            const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            svg.id = `outputSvgLayer${i}`;
            svg.classList.add("layer-svg");
            svg.setAttribute(
                "viewBox",
                `0 0 ${this.width} ${this.height}`
            );
            svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
            svg.style.position = "absolute";
            svg.style.top = "0";
            svg.style.left = "0";
            svg.style.pointerEvents = "none";

            const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
            group.id = `pen-plotter-lines-Layer${i}`;
            group.setAttribute("stroke", this.layers[i].color);
            group.setAttribute("fill", "none");
            group.setAttribute("stroke-linecap", "round");
            group.setAttribute("stroke-linejoin", "round");

            if (i > 0) {
                group.setAttribute("opacity", "0.8");
            }

            svg.appendChild(group);
            svgStack.appendChild(svg);

            this.layers[i].svg = svg;
            this.layers[i].group = group;
        }
    }

    updateLayerPanel() {
        const layerList = document.getElementById("layerList");
        layerList.innerHTML = "";

        this.layers.forEach((layer, index) => {
            const layerItem = document.createElement("div");
            layerItem.className = `layer-item ${index === this.selectedLayerIndex ? 'selected' : ''}`;
            layerItem.dataset.layerIndex = index;
            
            layerItem.innerHTML = `
                <svg class="layer-edit-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
                <div class="layer-color-indicator" style="background-color: ${layer.color}"></div>
                <div class="layer-info">
                    <span class="layer-name">Layer ${index + 1}</span>
                    <span class="layer-params">${layer.angle}° • ${layer.spacing}mm • (${layer.offsetX}, ${layer.offsetY})</span>
                </div>
            `;
            
            layerList.appendChild(layerItem);
        });
    }

    updateLayerPanelDisplay() {
        // Update only the parameter display for existing layer items
        const layerItems = document.querySelectorAll('.layer-item');
        layerItems.forEach((item, index) => {
            if (index < this.layers.length) {
                const layer = this.layers[index];
                const colorIndicator = item.querySelector('.layer-color-indicator');
                const paramsSpan = item.querySelector('.layer-params');
                
                if (colorIndicator) {
                    colorIndicator.style.backgroundColor = layer.color;
                }
                if (paramsSpan) {
                    paramsSpan.textContent = `${layer.angle}° • ${layer.spacing}mm • (${layer.offsetX}, ${layer.offsetY})`;
                }
                
                // Update selection state
                item.className = `layer-item ${index === this.selectedLayerIndex ? 'selected' : ''}`;
            }
        });
    }

    selectLayer(index) {
        this.selectedLayerIndex = index;
        this.updateLayerPanelDisplay();
        this.showLayerEditor(index);
    }

    showLayerEditor(index) {
        const layer = this.layers[index];
        const layerEditor = document.getElementById("layerEditor");
        
        // Show the editor
        layerEditor.style.display = "block";
        
        // Update header
        document.getElementById("currentLayerColor").style.backgroundColor = layer.color;
        document.getElementById("currentLayerName").textContent = `Layer ${index + 1}`;
        
        // Update form values
        document.getElementById("layerColorValue").value = layer.color;
        document.getElementById("lineAngleValue").value = layer.angle;
        document.getElementById("lineSpacingValue").value = layer.spacing;
        document.getElementById("layerOffsetXValue").value = layer.offsetX;
        document.getElementById("layerOffsetYValue").value = layer.offsetY;
        document.getElementById("maxSegmentLengthValue").value = layer.maxSegmentLength;
    }

    updateSelectedLayerProperty(property, value) {
        if (this.selectedLayerIndex === -1) return;
        
        this.layers[this.selectedLayerIndex][property] = value;
        
        // Update SVG stroke color if color changed
        if (property === 'color' && this.layers[this.selectedLayerIndex].group) {
            this.layers[this.selectedLayerIndex].group.setAttribute('stroke', value);
            document.getElementById("currentLayerColor").style.backgroundColor = value;
        }
        
        // Only regenerate geometry if necessary and debounce it
        if (['angle', 'spacing'].includes(property)) {
            clearTimeout(this.regenerateTimeout);
            this.regenerateTimeout = setTimeout(() => {
                this.generateLayerLines(this.selectedLayerIndex);
                this.draw();
            }, 100); // 100ms debounce
        } else if (property === 'maxSegmentLength') {
            // Subdivision parameter only affects drawing, not line generation
            this.draw();
        } else {
            this.draw();
        }
        
        // Update layer panel (only the parameter display, not rebuild)
        this.updateLayerPanelDisplay();
    }

    addLayer() {
        this.numLayers++;
        
        // Add new layer data to layers array
        const newLayerIndex = this.numLayers - 1;
        this.layers.push({
            svg: null,
            group: null,
            svgContent: "",
            lines: [],
            color: this.getLayerColor(newLayerIndex),
            offsetX: 0,
            offsetY: 0,
            angle: 0 + newLayerIndex * 15,
            spacing: 1,
            maxSegmentLength: 2, // mm
        });

        this.updateSvgStack();
        this.updateLayerPanel();
        
        // Update InteractiveCanvas content
        this.updateInteractiveCanvas();

        // Generate the new layer
        this.generateLayerLines(newLayerIndex);
        this.draw();
    }

    removeCurrentLayer() {
        if (this.selectedLayerIndex === -1 || this.layers.length <= 1) {
            return; // Don't allow deleting if no layer selected or only one layer
        }

        // Remove the selected layer
        this.layers.splice(this.selectedLayerIndex, 1);
        this.numLayers = this.layers.length;
        
        // Adjust selection - select previous layer or hide editor if removing first layer
        if (this.selectedLayerIndex >= this.layers.length) {
            this.selectedLayerIndex = this.layers.length - 1;
        }
        
        // If no layers left, hide editor
        if (this.layers.length === 0) {
            this.selectedLayerIndex = -1;
            document.getElementById("layerEditor").style.display = "none";
        }

        this.updateSvgStack();
        this.updateLayerPanel();

        // Update InteractiveCanvas content
        this.updateInteractiveCanvas();

        // If there are still layers and we have a selection, show the editor
        if (this.selectedLayerIndex !== -1) {
            this.showLayerEditor(this.selectedLayerIndex);
        }

        // Regenerate all remaining layers
        this.generateAllLayers();
        this.draw();
    }






    generateAllLayers() {
        this.layers.forEach((_, index) => {
            this.generateLayerLines(index);
        });
    }

    getCanvasWidth() {
        return parseFloat(document.getElementById("canvasWidthValue").value) || 200;
    }

    getCanvasHeight() {
        return parseFloat(document.getElementById("canvasHeightValue").value) || 200;
    }

    generateLayerLines(layerIndex) {
        const layer = this.layers[layerIndex];
        layer.lines = [];
        
        const spacing = layer.spacing * this.pixelsPerMm;
        const angle = layer.angle * (Math.PI / 180);
        
        const diagonal = Math.sqrt(this.width * this.width + this.height * this.height);
        const numLines = Math.ceil(diagonal / spacing);

        const ca = Math.cos(angle);
        const sa = Math.sin(angle);

        for (let i = 0; i < numLines; i++) {
            const line = [];
            const offset = (i - numLines / 2) * spacing;
            const lineLength = diagonal * 1.2;

            const startX = this.width / 2 + offset * ca - (lineLength / 2) * sa;
            const startY = this.height / 2 + offset * sa + (lineLength / 2) * ca;
            const endX = this.width / 2 + offset * ca + (lineLength / 2) * sa;
            const endY = this.height / 2 + offset * sa - (lineLength / 2) * ca;

            this.generateAdaptiveLineSegments(line, startX, startY, endX, endY);
            layer.lines.push(line);
        }
    }

    generateAdaptiveLineSegments(line, startX, startY, endX, endY) {
        const lineLength = Math.sqrt((endX - startX) ** 2 + (endY - startY) ** 2);
        const baseStep = lineLength / 20; // Reduced from 50 to 20 - fewer initial points
        const maxPoints = 500; // Much reduced limit since subdivision will handle details
        
        let currentDistance = 0;
        let pointCount = 0;
        
        while (currentDistance <= lineLength && pointCount < maxPoints) {
            const t = currentDistance / lineLength;
            const x = startX + (endX - startX) * t;
            const y = startY + (endY - startY) * t;
            
            // Check distance to nearest force field
            let minDistToField = Infinity;
            
            this.points.forEach(point => {
                const dist = Math.sqrt((x - point.x) ** 2 + (y - point.y) ** 2);
                const fieldDist = Math.max(0, dist - point.radius);
                if (fieldDist < minDistToField) minDistToField = fieldDist;
            });
            
            this.drawnLines.forEach(drawnLine => {
                for (let i = 0; i < drawnLine.points.length; i++) {
                    const p2 = drawnLine.points[i];
                    const dist = Math.sqrt((x - p2.x) ** 2 + (y - p2.y) ** 2);
                    const fieldDist = Math.max(0, dist - drawnLine.radius);
                    if (fieldDist < minDistToField) minDistToField = fieldDist;
                }
            });
            
            // Much simpler step size calculation - only 2x increase near fields
            let stepSize = baseStep;
            if (minDistToField < 50) {
                stepSize = baseStep * 0.5; // 2x more resolution near force fields
            }
            
            line.push({
                x: x,
                y: y,
                originalX: x,
                originalY: y
            });
            
            currentDistance += stepSize;
            pointCount++;
        }
        
        // Ensure we always include the end point
        if (line.length === 0 || line[line.length - 1].x !== endX || line[line.length - 1].y !== endY) {
            line.push({
                x: endX,
                y: endY,
                originalX: endX,
                originalY: endY
            });
        }
    }

    handleCanvasClick(e) {
        if (e.target.closest('#field-points') || this.drawMode) return;
        this.createPoint(this.getSVGPoint(e));
        this.draw();
    }

    handlePointClick(e) {
        if (e.target.tagName !== 'circle') return;
        e.stopPropagation();
        this.selectedPointIndex = parseInt(e.target.dataset.index, 10);
        this.openModal();
    }

    openModal() {
        if (this.selectedPointIndex === -1) return;
        const point = this.points[this.selectedPointIndex];

        document.querySelector(`input[name="pointMode"][value="${point.mode}"]`).checked = true;
        document.getElementById('pointForce').value = point.force;
        document.getElementById('pointForceValue').value = point.force;
        document.getElementById('pointRadius').value = point.radius / this.pixelsPerMm;
        document.getElementById('pointRadiusValue').value = point.radius / this.pixelsPerMm;
        // Set curve editor with point's curve data or default
        if (point.curveData && point.curveData.points) {
            this.modalCurveEditor.setCurve(point.curveData.points);
        } else {
            // Default curve for legacy points
            this.modalCurveEditor.setCurve([
                { x: 0, y: 1 },
                { x: 0.7, y: 0.3 },
                { x: 1, y: 0 }
            ]);
        }
        document.getElementById('pointAllowCrossing').checked = point.allowCrossing;

        this.modal.style.display = 'block';
    }

    closeModal() {
        this.modal.style.display = 'none';
        this.selectedPointIndex = -1;
    }

    updatePointMode(e) {
        if (this.selectedPointIndex === -1) return;
        this.points[this.selectedPointIndex].mode = e.target.value;
        this.draw();
    }

    updatePointData() {
        if (this.selectedPointIndex === -1) return;
        this.points[this.selectedPointIndex].force = document.getElementById('pointForceValue').value;
        this.points[this.selectedPointIndex].radius = document.getElementById('pointRadiusValue').value * this.pixelsPerMm;
        this.draw();
    }

    updatePointAllowCrossing(e) {
        if (this.selectedPointIndex === -1) return;
        this.points[this.selectedPointIndex].allowCrossing = e.target.checked;
        this.draw();
    }

    deletePoint() {
        if (this.selectedPointIndex === -1) return;
        this.points.splice(this.selectedPointIndex, 1);
        this.closeModal();
        this.draw();
    }

    draw() {
        this.fieldPointsGroup.innerHTML = '';
        this.drawnLinesGroup.innerHTML = '';

        // Clear all layer groups
        this.layers.forEach(layer => {
            if (layer.group) {
                layer.group.innerHTML = '';
            }
        });

        // Draw the line currently being drawn
        if (this.isDrawing && this.currentDrawing.length > 1) {
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            let d = `M ${this.currentDrawing[0].x} ${this.currentDrawing[0].y}`;
            for (let i = 1; i < this.currentDrawing.length; i++) {
                d += ` L ${this.currentDrawing[i].x} ${this.currentDrawing[i].y}`;
            }
            path.setAttribute('d', d);
            path.setAttribute('stroke', 'gray');
            path.setAttribute('stroke-width', '2');
            path.setAttribute('fill', 'none');
            this.drawnLinesGroup.appendChild(path);
        }

        // Draw drawn lines
        this.drawnLines.forEach(line => {
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            let d = `M ${line.points[0].x} ${line.points[0].y}`;
            for (let i = 1; i < line.points.length; i++) {
                d += ` L ${line.points[i].x} ${line.points[i].y}`;
            }
            path.setAttribute('d', d);
            path.setAttribute('stroke', line.mode === 'attract' ? 'blue' : 'red');
            path.setAttribute('stroke-width', '2');
            path.setAttribute('fill', 'none');
            this.drawnLinesGroup.appendChild(path);
        });

        // Draw all layers
        this.layers.forEach(layer => {
            if (!layer.group) return;
            
            layer.lines.forEach(line => {
                // First pass: calculate deformation for each point
                const deformedLine = line.map(p => {
                    // Apply offset to the position first
                    const offsetX = p.originalX + (layer.offsetX * this.pixelsPerMm);
                    const offsetY = p.originalY + (layer.offsetY * this.pixelsPerMm);
                    
                    let dx = 0, dy = 0;

                    this.points.forEach(fieldPoint => {
                        const dist = Math.sqrt(Math.pow(offsetX - fieldPoint.x, 2) + Math.pow(offsetY - fieldPoint.y, 2));
                        if (dist < fieldPoint.radius) {
                            const normalizedDist = dist / fieldPoint.radius;
                            let curveValue;
                            if (fieldPoint.curveData && fieldPoint.curveData.evaluate) {
                                curveValue = fieldPoint.curveData.evaluate(normalizedDist);
                                // Clamp curve value to prevent artifacts
                                curveValue = Math.max(0, Math.min(1, curveValue));
                            } else {
                                curveValue = 1 - normalizedDist; // Linear fallback
                            }
                            let force = fieldPoint.force * curveValue;
                            const angle = Math.atan2(offsetY - fieldPoint.y, offsetX - fieldPoint.x);
                            const direction = fieldPoint.mode === 'attract' ? -1 : 1;

                            if (!fieldPoint.allowCrossing) {
                                force = Math.min(force, dist);
                            }

                            dx += Math.cos(angle) * force * direction;
                            dy += Math.sin(angle) * force * direction;
                        }
                    });

                    this.drawnLines.forEach(drawnLine => {
                        for (let i = 0; i < drawnLine.points.length; i++) {
                            const p2 = drawnLine.points[i];
                            const dist = Math.sqrt(Math.pow(offsetX - p2.x, 2) + Math.pow(offsetY - p2.y, 2));
                            if (dist < drawnLine.radius) {
                                const normalizedDist = dist / drawnLine.radius;
                                let curveValue;
                                if (drawnLine.curveData && drawnLine.curveData.evaluate) {
                                    curveValue = drawnLine.curveData.evaluate(normalizedDist);
                                    // Clamp curve value to prevent artifacts
                                    curveValue = Math.max(0, Math.min(1, curveValue));
                                } else {
                                    curveValue = 1 - normalizedDist; // Linear fallback
                                }
                                let force = drawnLine.force * curveValue;
                                const angle = Math.atan2(offsetY - p2.y, offsetX - p2.x);
                                const direction = drawnLine.mode === 'attract' ? -1 : 1;

                                if (!drawnLine.allowCrossing) {
                                    force = Math.min(force, dist);
                                }

                                dx += Math.cos(angle) * force * direction;
                                dy += Math.sin(angle) * force * direction;
                            }
                        }
                    });

                    const deformation = Math.sqrt(dx * dx + dy * dy);
                    return { 
                        x: offsetX + dx, 
                        y: offsetY + dy, 
                        originalX: p.originalX,
                        originalY: p.originalY,
                        deformation: deformation 
                    };
                });

                // Second pass: recursively subdivide segments that are too long
                const finalLine = this.recursiveSubdivision(deformedLine, layer);
                
                // Third pass: remove redundant clamped points for cleaner SVG
                const cleanedLine = this.removeRedundantClampedPointsForSvg(finalLine);
                
                if (cleanedLine.length >= 2) { // Only create path if we have at least 2 points
                    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                    let d = `M ${cleanedLine[0].x} ${cleanedLine[0].y}`;
                    for (let i = 1; i < cleanedLine.length; i++) {
                        d += ` L ${cleanedLine[i].x} ${cleanedLine[i].y}`;
                    }
                    path.setAttribute('d', d);
                    path.setAttribute('stroke', layer.color);
                    path.setAttribute('fill', 'none');
                    const penDiameter = document.getElementById('penDiameterValue').value;
                    path.setAttribute('stroke-width', penDiameter);
                    layer.group.appendChild(path);
                }
            });
        });

        // Draw points
        const showVisualization = document.getElementById('showVisualization').checked;
        
        this.points.forEach((point, i) => {
            // Draw visualization elements only if enabled
            if (showVisualization) {
                // Draw the force field radius circle (debug)
                const radiusCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                radiusCircle.setAttribute('cx', point.x);
                radiusCircle.setAttribute('cy', point.y);
                radiusCircle.setAttribute('r', point.radius);
                radiusCircle.setAttribute('fill', 'none');
                radiusCircle.setAttribute('stroke', point.mode === 'attract' ? 'blue' : 'red');
                radiusCircle.setAttribute('stroke-width', '1');
                radiusCircle.setAttribute('stroke-dasharray', '5,5');
                radiusCircle.setAttribute('opacity', '0.3');
                radiusCircle.setAttribute('pointer-events', 'none'); // Make non-interactive
                this.fieldPointsGroup.appendChild(radiusCircle);
                
                // Draw force field strength grid (debug)
                this.drawForceFieldGrid(point);
            }
            
            // Always draw the center point
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', point.x);
            circle.setAttribute('cy', point.y);
            circle.setAttribute('r', '5'); // Fixed radius
            circle.setAttribute('fill', point.mode === 'attract' ? 'blue' : 'red');
            circle.dataset.index = i;
            this.fieldPointsGroup.appendChild(circle);
        });
    }

    drawForceFieldGrid(point) {
        const gridSize = Math.max(20, point.radius / 8); // Larger, adaptive grid spacing
        const startX = point.x - point.radius;
        const startY = point.y - point.radius;
        const endX = point.x + point.radius;
        const endY = point.y + point.radius;
        
        for (let x = startX; x <= endX; x += gridSize) {
            for (let y = startY; y <= endY; y += gridSize) {
                const dist = Math.sqrt(Math.pow(x - point.x, 2) + Math.pow(y - point.y, 2));
                if (dist <= point.radius) {
                    const falloff = point.falloff || 1;
                    const normalizedDist = dist / point.radius;
                    const force = point.force * Math.pow(1 - normalizedDist, falloff);
                    const forceRatio = force / point.force; // 0-1
                    
                    // Only show dots with significant force (reduce visual clutter)
                    if (forceRatio > 0.1) {
                        const forceCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                        forceCircle.setAttribute('cx', x);
                        forceCircle.setAttribute('cy', y);
                        forceCircle.setAttribute('r', '3');
                        forceCircle.setAttribute('fill', point.mode === 'attract' ? 'blue' : 'red');
                        forceCircle.setAttribute('opacity', forceRatio * 0.6);
                        forceCircle.setAttribute('pointer-events', 'none');
                        this.fieldPointsGroup.appendChild(forceCircle);
                    }
                }
            }
        }
    }

    recursiveSubdivision(line, layer) {
        const maxSegmentLengthPx = layer.maxSegmentLength * this.pixelsPerMm;
        const maxTotalPoints = 5000; // Safety limit to prevent infinite recursion
        
        const subdivideSegment = (point1, point2, depth = 0) => {
            // Safety check: prevent infinite recursion
            if (depth > 10 || this.totalPoints > maxTotalPoints) {
                return [point2]; // Just return the end point
            }
            
            // Calculate distance between deformed points
            const dx = point2.x - point1.x;
            const dy = point2.y - point1.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // If segment is short enough, no subdivision needed
            if (distance <= maxSegmentLengthPx) {
                return [point2];
            }
            
            // Create midpoint by interpolating original positions
            const midOriginalX = (point1.originalX + point2.originalX) / 2;
            const midOriginalY = (point1.originalY + point2.originalY) / 2;
            
            // Apply layer offset to interpolated position
            const midOffsetX = midOriginalX + (layer.offsetX * this.pixelsPerMm);
            const midOffsetY = midOriginalY + (layer.offsetY * this.pixelsPerMm);
            
            // Calculate field deformation for midpoint
            let dx_deform = 0, dy_deform = 0;
            
            // Apply field point forces
            this.points.forEach(fieldPoint => {
                const dist = Math.sqrt(Math.pow(midOffsetX - fieldPoint.x, 2) + Math.pow(midOffsetY - fieldPoint.y, 2));
                if (dist < fieldPoint.radius) {
                    const normalizedDist = dist / fieldPoint.radius;
                    let curveValue;
                    if (fieldPoint.curveData && fieldPoint.curveData.evaluate) {
                        curveValue = fieldPoint.curveData.evaluate(normalizedDist);
                        curveValue = Math.max(0, Math.min(1, curveValue));
                    } else {
                        curveValue = 1 - normalizedDist; // Linear fallback
                    }
                    let force = fieldPoint.force * curveValue;
                    const angle = Math.atan2(midOffsetY - fieldPoint.y, midOffsetX - fieldPoint.x);
                    const direction = fieldPoint.mode === 'attract' ? -1 : 1;
                    
                    if (!fieldPoint.allowCrossing) {
                        force = Math.min(force, dist);
                    }
                    
                    dx_deform += Math.cos(angle) * force * direction;
                    dy_deform += Math.sin(angle) * force * direction;
                }
            });
            
            // Apply drawn line forces
            this.drawnLines.forEach(drawnLine => {
                for (let j = 0; j < drawnLine.points.length; j++) {
                    const p2 = drawnLine.points[j];
                    const dist = Math.sqrt(Math.pow(midOffsetX - p2.x, 2) + Math.pow(midOffsetY - p2.y, 2));
                    if (dist < drawnLine.radius) {
                        const normalizedDist = dist / drawnLine.radius;
                        let curveValue;
                        if (drawnLine.curveData && drawnLine.curveData.evaluate) {
                            curveValue = drawnLine.curveData.evaluate(normalizedDist);
                            curveValue = Math.max(0, Math.min(1, curveValue));
                        } else {
                            curveValue = 1 - normalizedDist; // Linear fallback
                        }
                        let force = drawnLine.force * curveValue;
                        const angle = Math.atan2(midOffsetY - p2.y, midOffsetX - p2.x);
                        const direction = drawnLine.mode === 'attract' ? -1 : 1;
                        
                        if (!drawnLine.allowCrossing) {
                            force = Math.min(force, dist);
                        }
                        
                        dx_deform += Math.cos(angle) * force * direction;
                        dy_deform += Math.sin(angle) * force * direction;
                    }
                }
            });
            
            // Create the deformed midpoint
            const midPoint = {
                x: midOffsetX + dx_deform,
                y: midOffsetY + dy_deform,
                originalX: midOriginalX,
                originalY: midOriginalY
            };
            
            this.totalPoints++;
            
            // Recursively subdivide both halves
            const firstHalf = subdivideSegment(point1, midPoint, depth + 1);
            const secondHalf = subdivideSegment(midPoint, point2, depth + 1);
            
            return [...firstHalf, ...secondHalf];
        };
        
        // Initialize point counter
        this.totalPoints = line.length;
        
        const result = [line[0]]; // Start with first point
        
        // Process each segment
        for (let i = 0; i < line.length - 1; i++) {
            const subdivided = subdivideSegment(line[i], line[i + 1]);
            result.push(...subdivided);
        }
        
        return result;
    }


    // Configuration Management
    saveConfiguration() {
        const configName = prompt("Enter a name for this configuration:");
        if (!configName || configName.trim() === "") {
            return;
        }

        // Get all current parameter values
        const parameters = this.getAllParameters();

        try {
            this.configManager.saveConfig(
                this.toolId,
                configName.trim(),
                parameters,
                null // No image data for fieldlines
            );
            alert(`Configuration "${configName}" saved successfully!`);
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

    checkForUrlConfig() {
        const urlParams = new URLSearchParams(window.location.search);
        const configId = urlParams.get('loadConfig');
        
        if (configId) {
            const config = this.configManager.getConfig(this.toolId, configId);
            if (config) {
                this.applyConfiguration(config);
                // Clear the URL parameter
                const newUrl = new URL(window.location);
                newUrl.searchParams.delete('loadConfig');
                window.history.replaceState({}, document.title, newUrl.toString());
            } else {
                console.warn(`Configuration with ID ${configId} not found for tool ${this.toolId}`);
            }
        }
    }

    getAllParameters() {
        return {
            // Canvas settings
            canvasWidth: document.getElementById('canvasWidthValue').value,
            canvasHeight: document.getElementById('canvasHeightValue').value,
            
            // Pen settings
            penDiameter: document.getElementById('penDiameterValue').value,
            
            // New point defaults
            newPointForce: document.getElementById('newPointForceValue').value,
            newPointRadius: document.getElementById('newPointRadiusValue').value,
            newPointCurve: this.newPointCurveEditor.getCurveData(),
            newPointMode: document.querySelector('input[name="newPointMode"]:checked').value,
            newPointAllowCrossing: document.getElementById('newPointAllowCrossing').checked,
            
            // Visualization
            showVisualization: document.getElementById('showVisualization').checked,
            
            // Layer data
            layers: this.layers.map(layer => ({
                id: layer.id,
                name: layer.name,
                color: layer.color,
                angle: layer.angle,
                spacing: layer.spacing,
                offsetX: layer.offsetX,
                offsetY: layer.offsetY,
                maxSegmentLength: layer.maxSegmentLength
            })),
            activeLayerIndex: this.activeLayerIndex,
            
            // Points and drawn lines data
            points: this.points,
            drawnLines: this.drawnLines
        };
    }

    applyConfiguration(config) {
        const params = config.parameters;

        // Apply canvas settings
        document.getElementById('canvasWidthValue').value = params.canvasWidth || "200";
        document.getElementById('canvasHeightValue').value = params.canvasHeight || "200";
        
        // Apply pen settings
        document.getElementById('penDiameterValue').value = params.penDiameter || "0.5";
        
        // Apply new point defaults
        document.getElementById('newPointForceValue').value = params.newPointForce || "50";
        document.getElementById('newPointForce').value = params.newPointForce || "50";
        document.getElementById('newPointRadiusValue').value = params.newPointRadius || "24";
        document.getElementById('newPointRadius').value = params.newPointRadius || "24";
        
        // Restore curve editor data
        if (params.newPointCurve && params.newPointCurve.points) {
            this.newPointCurveEditor.setCurve(params.newPointCurve.points);
        }
        
        if (params.newPointMode) {
            document.querySelector(`input[name="newPointMode"][value="${params.newPointMode}"]`).checked = true;
        } else {
            document.querySelector(`input[name="newPointMode"][value="repulse"]`).checked = true;
        }
        document.getElementById('newPointAllowCrossing').checked = params.newPointAllowCrossing !== undefined ? params.newPointAllowCrossing : true;
        
        // Apply visualization setting
        document.getElementById('showVisualization').checked = params.showVisualization !== undefined ? params.showVisualization : false;
        
        // Clear existing layers and their SVGs
        this.layers.forEach(layer => {
            if (layer.svg) layer.svg.remove();
        });
        
        // Apply layers
        if (params.layers && params.layers.length > 0) {
            this.layers = params.layers.map(layerData => ({
                ...layerData,
                lines: [],
                svg: null,
                group: null
            }));
            this.activeLayerIndex = params.activeLayerIndex || 0;
        } else {
            // Fallback to default layer
            this.layers = [{
                id: 0,
                name: 'Layer 1',
                color: '#000000',
                angle: 0,
                spacing: 1,
                offsetX: 0,
                offsetY: 0,
                maxSegmentLength: 2,
                lines: [],
                svg: null,
                group: null
            }];
            this.activeLayerIndex = 0;
        }
        
        this.numLayers = this.layers.length;
        
        // Recreate layer SVGs and update UI
        this.updateSvgStack();
        this.updateLayerPanel();
        
        // Update InteractiveCanvas content
        this.updateInteractiveCanvas();
        
        // Apply points and drawn lines
        this.points = params.points || [];
        this.drawnLines = params.drawnLines || [];
        
        // Update canvas and regenerate
        this.updateCanvasSize();
        this.generateAllLayers();
        this.draw();
        
        alert(`Configuration "${config.name}" loaded successfully!`);
    }

    // Download Methods
    downloadCombinedSvg() {
        const svgContent = this.generateCombinedSvg();
        this.downloadFile(svgContent, 'fieldlines_combined.svg', 'image/svg+xml');
    }

    downloadIndividualSvgs() {
        this.layers.forEach((layer, index) => {
            const svgContent = this.generateLayerSvg(layer, index);
            this.downloadFile(svgContent, `fieldlines_layer_${index + 1}.svg`, 'image/svg+xml');
        });
    }

    downloadCombinedGcode() {
        const gcodeContent = this.generateCombinedGcode();
        this.downloadFile(gcodeContent, 'fieldlines_combined.gcode', 'text/plain');
    }

    downloadIndividualGcodes() {
        this.layers.forEach((layer, index) => {
            const gcodeContent = this.generateLayerGcode(layer, index);
            this.downloadFile(gcodeContent, `fieldlines_layer_${index + 1}.gcode`, 'text/plain');
        });
    }

    generateCombinedSvg() {
        const widthMm = this.getCanvasWidth();
        const heightMm = this.getCanvasHeight();
        
        let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${widthMm}mm" height="${heightMm}mm" viewBox="0 0 ${this.width} ${this.height}">
`;
        
        // Add each layer's paths
        this.layers.forEach((layer, index) => {
            if (layer.group) {
                const paths = layer.group.querySelectorAll('path');
                if (paths.length > 0) {
                    svg += `  <g id="layer-${index + 1}" stroke="${layer.color}" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="${document.getElementById('penDiameterValue').value}">\n`;
                    paths.forEach(path => {
                        svg += `    <path d="${path.getAttribute('d')}" />\n`;
                    });
                    svg += `  </g>\n`;
                }
            }
        });
        
        svg += `</svg>`;
        return svg;
    }

    generateLayerSvg(layer, index) {
        const widthMm = this.getCanvasWidth();
        const heightMm = this.getCanvasHeight();
        
        let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${widthMm}mm" height="${heightMm}mm" viewBox="0 0 ${this.width} ${this.height}">
  <g id="layer-${index + 1}" stroke="${layer.color}" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="${document.getElementById('penDiameterValue').value}">
`;
        
        if (layer.group) {
            const paths = layer.group.querySelectorAll('path');
            paths.forEach(path => {
                svg += `    <path d="${path.getAttribute('d')}" />\n`;
            });
        }
        
        svg += `  </g>
</svg>`;
        return svg;
    }

    generateCombinedGcode() {
        // Collect all paths from all layers with their path data
        const allPaths = [];
        let totalPaths = 0;
        
        this.layers.forEach((layer, layerIndex) => {
            if (layer.group) {
                const paths = layer.group.querySelectorAll('path');
                totalPaths += paths.length;
                paths.forEach(path => {
                    const pathData = this.parsePathData(path.getAttribute('d'));
                    if (pathData.length > 0) {
                        allPaths.push({
                            pathData: pathData,
                            layerIndex: layerIndex,
                            originalPath: path.getAttribute('d')
                        });
                    }
                });
            }
        });
        
        console.log(`Processing ${allPaths.length} paths for G-code generation`);
        
        // If too many paths, fall back to simple layer-by-layer processing
        if (allPaths.length > 200) {
            console.log('Too many paths for full optimization, using simple approach');
            return this.generateCombinedGcodeSimple();
        }

        const generator = this.createGcodeGenerator();
        generator.beginProgram({
            toolName: 'FieldLines - LineMaker',
            canvasWidth: this.getCanvasWidth(),
            canvasHeight: this.getCanvasHeight(),
            headerLines: [`Paths: ${allPaths.length}`]
        });

        // Optimize path order to minimize travel moves
        const optimizedPaths = this.optimizePathOrderSafe(allPaths);

        // Convert optimized paths to G-code
        optimizedPaths.forEach((pathInfo, index) => {
            if (index % 50 === 0) {
                console.log(`Processing path ${index + 1}/${optimizedPaths.length}`);
            }
            this.emitPathSegmentsToGenerator(generator, pathInfo.pathData);
        });

        generator.finishProgram();
        return generator.toString();
    }

    generateCombinedGcodeSimple() {
        const generator = this.createGcodeGenerator();
        generator.beginProgram({
            toolName: 'FieldLines - LineMaker',
            canvasWidth: this.getCanvasWidth(),
            canvasHeight: this.getCanvasHeight(),
            headerLines: ['Simple export']
        });

        this.layers.forEach((layer) => {
            if (!layer.group) return;
            const paths = layer.group.querySelectorAll('path');
            paths.forEach((path) => {
                this.appendPathDataToGenerator(path.getAttribute('d'), generator);
            });
        });

        generator.finishProgram();
        return generator.toString();
    }

    generateLayerGcode(layer, index) {
        const generator = this.createGcodeGenerator();
        generator.beginProgram({
            toolName: 'FieldLines - LineMaker',
            canvasWidth: this.getCanvasWidth(),
            canvasHeight: this.getCanvasHeight(),
            headerLines: [`Layer ${index + 1}`]
        });

        // Collect paths from this layer only
        const layerPaths = [];
        if (layer.group) {
            const paths = layer.group.querySelectorAll('path');
            paths.forEach(path => {
                const pathData = this.parsePathData(path.getAttribute('d'));
                if (pathData.length > 0) {
                    layerPaths.push({
                        pathData: pathData,
                        layerIndex: index,
                        originalPath: path.getAttribute('d')
                    });
                }
            });
        }
        
        console.log(`Layer ${index + 1}: Processing ${layerPaths.length} paths`);
        
        // Use safer optimization for individual layers
        const optimizedPaths = this.optimizePathOrderSafe(layerPaths);
        
        // Convert optimized paths to G-code
        optimizedPaths.forEach(pathInfo => {
            this.emitPathSegmentsToGenerator(generator, pathInfo.pathData);
        });

        generator.finishProgram();
        return generator.toString();
    }

    createGcodeGenerator() {
        const feedInput = Number.parseFloat(document.getElementById('feedRateValue').value);
        const penDownInput = Number.parseFloat(document.getElementById('penDownZValue').value);
        const penUpInput = Number.parseFloat(document.getElementById('penUpZValue').value);
        const preventZhopInput = Number.parseFloat(document.getElementById('preventZhopValue').value);

        const feedRate = Number.isFinite(feedInput) ? feedInput : 0;
        const penDownZ = Number.isFinite(penDownInput) ? penDownInput : 0;
        const penUpZ = Number.isFinite(penUpInput) ? penUpInput : 0;
        const preventZhop = Number.isFinite(preventZhopInput) ? preventZhopInput : 0;

        return new GCodeGenerator({
            toolName: 'FieldLines - LineMaker',
            canvasWidth: this.getCanvasWidth(),
            canvasHeight: this.getCanvasHeight(),
            feedRate,
            penDownZ,
            penUpZ,
            preventZhop,
            homeCommand: 'G28 ; Home',
            footerLines: [
                () => '; End of program',
                'G28 ; Home',
                'M30 ; Program end'
            ]
        });
    }

    appendPathDataToGenerator(pathData, generator) {
        if (!pathData || !generator) return;
        const pathSegments = this.parsePathData(pathData);
        if (!Array.isArray(pathSegments) || pathSegments.length === 0) return;
        this.emitPathSegmentsToGenerator(generator, pathSegments);
    }

    emitPathSegmentsToGenerator(generator, pathSegments) {
        if (!generator || !Array.isArray(pathSegments)) return;

        pathSegments.forEach((segment) => {
            if (!Array.isArray(segment) || segment.length === 0) return;
            const cleanedSegment = this.removeRedundantClampedPoints(segment);
            if (!Array.isArray(cleanedSegment) || cleanedSegment.length < 2) return;

            const polyline = cleanedSegment.map((point) => this.pixelPointToMillimeters(point));
            generator.drawPolyline(polyline, {
                feedRate: generator.feedRate,
                preventZhop: generator.options.preventZhop,
                segmentComment: 'Draw line'
            });
        });
    }

    pixelPointToMillimeters(point) {
        const canvasWidthMm = this.getCanvasWidth();
        const canvasHeightMm = this.getCanvasHeight();
        const pixelsPerMm = this.pixelsPerMm;

        const xValue = Number(point?.x);
        const yValue = Number(point?.y);

        const rawX = Number.isFinite(xValue) ? xValue : 0;
        const rawY = Number.isFinite(yValue) ? yValue : 0;

        const xMm = rawX / pixelsPerMm;
        const yMm = rawY / pixelsPerMm;

        return {
            x: Math.max(0, Math.min(canvasWidthMm, xMm)),
            y: Math.max(0, Math.min(canvasHeightMm, yMm))
        };
    }

    downloadFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    // Path optimization methods
    parsePathData(pathData) {
        const segments = [];
        const commands = pathData.match(/[MLZ][^MLZ]*/gi) || [];
        
        let currentSegment = [];
        
        commands.forEach(command => {
            const type = command[0];
            const coords = command.slice(1).trim().split(/[\s,]+/).map(parseFloat);
            
            if (type === 'M' && coords.length >= 2) {
                // Start new segment
                if (currentSegment.length > 0) {
                    segments.push([...currentSegment]);
                }
                currentSegment = [{x: coords[0], y: coords[1]}];
            } else if (type === 'L' && coords.length >= 2) {
                // Add point to current segment
                currentSegment.push({x: coords[0], y: coords[1]});
            }
        });
        
        // Add final segment
        if (currentSegment.length > 0) {
            segments.push(currentSegment);
        }
        
        return segments;
    }

    optimizePathOrderSafe(pathInfos) {
        if (pathInfos.length <= 1) return pathInfos;
        
        // Limit the number of paths we try to optimize to prevent crashes
        if (pathInfos.length > 100) {
            console.log(`Too many paths (${pathInfos.length}) for optimization, using simple nearest neighbor`);
            return this.optimizePathOrderSimple(pathInfos);
        }
        
        return this.optimizePathOrder(pathInfos);
    }

    optimizePathOrder(pathInfos) {
        if (pathInfos.length <= 1) return pathInfos;
        
        // For large numbers of paths, use a more sophisticated approach
        if (pathInfos.length > 50) {
            return this.optimizePathOrderAdvanced(pathInfos);
        }
        
        const optimized = [];
        const remaining = [...pathInfos];
        let currentPosition = {x: 0, y: 0}; // Start at origin
        
        while (remaining.length > 0) {
            let closestIndex = 0;
            let shortestDistance = Infinity;
            let shouldReverse = false;
            
            // Find the closest path start or end
            remaining.forEach((pathInfo, index) => {
                if (pathInfo.pathData.length === 0) return;
                
                // Check first segment
                const firstSegment = pathInfo.pathData[0];
                const lastSegment = pathInfo.pathData[pathInfo.pathData.length - 1];
                
                if (firstSegment.length === 0) return;
                
                // Distance to start of path
                const startPoint = firstSegment[0];
                const distToStart = Math.sqrt(
                    Math.pow(currentPosition.x - startPoint.x, 2) + 
                    Math.pow(currentPosition.y - startPoint.y, 2)
                );
                
                // Distance to end of path (if we can reverse)
                const endPoint = lastSegment[lastSegment.length - 1];
                const distToEnd = Math.sqrt(
                    Math.pow(currentPosition.x - endPoint.x, 2) + 
                    Math.pow(currentPosition.y - endPoint.y, 2)
                );
                
                if (distToStart < shortestDistance) {
                    shortestDistance = distToStart;
                    closestIndex = index;
                    shouldReverse = false;
                } else if (distToEnd < shortestDistance) {
                    shortestDistance = distToEnd;
                    closestIndex = index;
                    shouldReverse = true;
                }
            });
            
            // Add the closest path to optimized list
            const selectedPath = remaining.splice(closestIndex, 1)[0];
            
            if (shouldReverse) {
                // Reverse all segments and points within segments
                selectedPath.pathData = selectedPath.pathData.map(segment => 
                    [...segment].reverse()
                ).reverse();
            }
            
            optimized.push(selectedPath);
            
            // Update current position to end of this path
            if (selectedPath.pathData.length > 0) {
                const lastSegment = selectedPath.pathData[selectedPath.pathData.length - 1];
                if (lastSegment.length > 0) {
                    currentPosition = lastSegment[lastSegment.length - 1];
                }
            }
        }
        
        return optimized;
    }

    optimizePathOrderAdvanced(pathInfos) {
        // For large numbers of paths, use spatial clustering and local optimization
        const clusters = this.clusterPathsSpatially(pathInfos, 4); // Create 4 spatial clusters
        const optimizedClusters = [];
        let currentPosition = {x: 0, y: 0};
        
        // Process each cluster in order of proximity
        const remainingClusters = [...clusters];
        
        while (remainingClusters.length > 0) {
            // Find closest cluster
            let closestClusterIndex = 0;
            let shortestDistanceToCluster = Infinity;
            
            remainingClusters.forEach((cluster, index) => {
                const clusterCenter = this.getClusterCenter(cluster);
                const distanceToCenter = Math.sqrt(
                    Math.pow(currentPosition.x - clusterCenter.x, 2) + 
                    Math.pow(currentPosition.y - clusterCenter.y, 2)
                );
                
                if (distanceToCenter < shortestDistanceToCluster) {
                    shortestDistanceToCluster = distanceToCenter;
                    closestClusterIndex = index;
                }
            });
            
            // Optimize within the closest cluster
            const selectedCluster = remainingClusters.splice(closestClusterIndex, 1)[0];
            const optimizedCluster = this.optimizePathOrder(selectedCluster);
            optimizedClusters.push(...optimizedCluster);
            
            // Update position to end of cluster
            if (optimizedCluster.length > 0) {
                const lastPath = optimizedCluster[optimizedCluster.length - 1];
                if (lastPath.pathData.length > 0) {
                    const lastSegment = lastPath.pathData[lastPath.pathData.length - 1];
                    if (lastSegment.length > 0) {
                        currentPosition = lastSegment[lastSegment.length - 1];
                    }
                }
            }
        }
        
        return optimizedClusters;
    }

    clusterPathsSpatially(pathInfos, numClusters) {
        if (pathInfos.length <= numClusters) {
            return pathInfos.map(path => [path]);
        }
        
        // Initialize clusters with k-means style approach
        const clusters = [];
        for (let i = 0; i < numClusters; i++) {
            clusters.push([]);
        }
        
        // Assign each path to nearest cluster center
        pathInfos.forEach(pathInfo => {
            if (pathInfo.pathData.length === 0) return;
            
            const pathCenter = this.getPathCenter(pathInfo);
            let closestCluster = 0;
            let shortestDistance = Infinity;
            
            for (let i = 0; i < numClusters; i++) {
                // Use grid-based cluster centers
                const clusterCenterX = (i % 2) * this.width;
                const clusterCenterY = Math.floor(i / 2) * this.height;
                
                const distance = Math.sqrt(
                    Math.pow(pathCenter.x - clusterCenterX, 2) + 
                    Math.pow(pathCenter.y - clusterCenterY, 2)
                );
                
                if (distance < shortestDistance) {
                    shortestDistance = distance;
                    closestCluster = i;
                }
            }
            
            clusters[closestCluster].push(pathInfo);
        });
        
        return clusters.filter(cluster => cluster.length > 0);
    }

    getPathCenter(pathInfo) {
        if (pathInfo.pathData.length === 0) return {x: 0, y: 0};
        
        let totalX = 0, totalY = 0, totalPoints = 0;
        
        pathInfo.pathData.forEach(segment => {
            segment.forEach(point => {
                totalX += point.x;
                totalY += point.y;
                totalPoints++;
            });
        });
        
        return totalPoints > 0 ? {
            x: totalX / totalPoints,
            y: totalY / totalPoints
        } : {x: 0, y: 0};
    }

    getClusterCenter(cluster) {
        if (cluster.length === 0) return {x: 0, y: 0};
        
        let totalX = 0, totalY = 0;
        
        cluster.forEach(pathInfo => {
            const center = this.getPathCenter(pathInfo);
            totalX += center.x;
            totalY += center.y;
        });
        
        return {
            x: totalX / cluster.length,
            y: totalY / cluster.length
        };
    }

    optimizePathOrderSimple(pathInfos) {
        // Very simple optimization: just use nearest neighbor without complex calculations
        if (pathInfos.length <= 1) return pathInfos;
        
        const optimized = [];
        const remaining = [...pathInfos];
        let currentPosition = {x: 0, y: 0}; // Start at origin
        
        // Process in batches to avoid hanging the browser
        const batchSize = 20;
        let processed = 0;
        
        while (remaining.length > 0 && processed < pathInfos.length) {
            let closestIndex = 0;
            let shortestDistance = Infinity;
            
            // Only check a limited number of paths to find the closest
            const searchLimit = Math.min(batchSize, remaining.length);
            
            for (let i = 0; i < searchLimit; i++) {
                const pathInfo = remaining[i];
                if (pathInfo.pathData.length === 0) continue;
                
                const firstSegment = pathInfo.pathData[0];
                if (firstSegment.length === 0) continue;
                
                // Just check distance to start of path (no reversal optimization)
                const startPoint = firstSegment[0];
                const distToStart = Math.sqrt(
                    Math.pow(currentPosition.x - startPoint.x, 2) + 
                    Math.pow(currentPosition.y - startPoint.y, 2)
                );
                
                if (distToStart < shortestDistance) {
                    shortestDistance = distToStart;
                    closestIndex = i;
                }
            }
            
            // Add the closest path to optimized list
            const selectedPath = remaining.splice(closestIndex, 1)[0];
            optimized.push(selectedPath);
            
            // Update current position to end of this path
            if (selectedPath.pathData.length > 0) {
                const lastSegment = selectedPath.pathData[selectedPath.pathData.length - 1];
                if (lastSegment.length > 0) {
                    currentPosition = lastSegment[lastSegment.length - 1];
                }
            }
            
            processed++;
            
            // Give browser a chance to breathe
            if (processed % 10 === 0) {
                console.log(`Simple optimization progress: ${processed}/${pathInfos.length}`);
            }
        }
        
        // Add any remaining paths without optimization
        if (remaining.length > 0) {
            console.log(`Adding ${remaining.length} remaining paths without optimization`);
            optimized.push(...remaining);
        }
        
        return optimized;
    }

    removeRedundantClampedPoints(segment) {
        if (segment.length <= 2) return segment;
        
        const pixelsPerMm = this.pixelsPerMm;
        const canvasWidthPx = this.getCanvasWidth() * pixelsPerMm;
        const canvasHeightPx = this.getCanvasHeight() * pixelsPerMm;
        
        const cleaned = [];
        let i = 0;
        
        while (i < segment.length) {
            const currentPoint = segment[i];
            const currentClamped = this.getClampedPosition(currentPoint, canvasWidthPx, canvasHeightPx);
            
            if (currentClamped.isEdge) {
                // Find all consecutive points that are clamped to the same edge
                let j = i + 1;
                const sameEdgePoints = [currentPoint];
                
                while (j < segment.length) {
                    const nextPoint = segment[j];
                    const nextClamped = this.getClampedPosition(nextPoint, canvasWidthPx, canvasHeightPx);
                    
                    // Check if on same edge
                    const sameEdge = this.areOnSameEdgeGcode(currentClamped, nextClamped, canvasWidthPx, canvasHeightPx);
                    
                    if (nextClamped.isEdge && sameEdge) {
                        sameEdgePoints.push(nextPoint);
                        j++;
                    } else {
                        break;
                    }
                }
                
                // For multiple points on the same edge, keep only first and last
                if (sameEdgePoints.length > 2) {
                    cleaned.push(sameEdgePoints[0]);
                    cleaned.push(sameEdgePoints[sameEdgePoints.length - 1]);
                } else {
                    // Keep all points if 2 or fewer
                    cleaned.push(...sameEdgePoints);
                }
                
                i = j; // Skip to next non-edge point
            } else {
                cleaned.push(currentPoint);
                i++;
            }
        }
        
        return cleaned;
    }

    getClampedPosition(point, canvasWidth, canvasHeight) {
        const x = Math.max(0, Math.min(canvasWidth, point.x));
        const y = Math.max(0, Math.min(canvasHeight, point.y));
        
        const isEdge = (x === 0 || x === canvasWidth || y === 0 || y === canvasHeight);
        
        return { x, y, isEdge };
    }

    removeRedundantClampedPointsForSvg(line) {
        if (line.length <= 2) return line;
        
        const cleaned = [];
        let i = 0;
        
        while (i < line.length) {
            const currentPoint = line[i];
            const currentClamped = {
                x: Math.max(0, Math.min(this.width, currentPoint.x)),
                y: Math.max(0, Math.min(this.height, currentPoint.y))
            };
            
            // Check if current point is on an edge
            const currentOnEdge = (currentClamped.x === 0 || currentClamped.x === this.width || 
                                 currentClamped.y === 0 || currentClamped.y === this.height);
            
            if (currentOnEdge) {
                // Find all consecutive points that are clamped to the same edge
                let j = i + 1;
                const sameEdgePoints = [currentPoint];
                
                while (j < line.length) {
                    const nextPoint = line[j];
                    const nextClamped = {
                        x: Math.max(0, Math.min(this.width, nextPoint.x)),
                        y: Math.max(0, Math.min(this.height, nextPoint.y))
                    };
                    
                    const nextOnEdge = (nextClamped.x === 0 || nextClamped.x === this.width || 
                                      nextClamped.y === 0 || nextClamped.y === this.height);
                    
                    // Check if on same edge
                    const sameEdge = this.areOnSameEdge(currentClamped, nextClamped);
                    
                    if (nextOnEdge && sameEdge) {
                        sameEdgePoints.push(nextPoint);
                        j++;
                    } else {
                        break;
                    }
                }
                
                // For multiple points on the same edge, keep only first and last
                if (sameEdgePoints.length > 2) {
                    cleaned.push(sameEdgePoints[0]);
                    cleaned.push(sameEdgePoints[sameEdgePoints.length - 1]);
                } else {
                    // Keep all points if 2 or fewer
                    cleaned.push(...sameEdgePoints);
                }
                
                i = j; // Skip to next non-edge point
            } else {
                cleaned.push(currentPoint);
                i++;
            }
        }
        
        return cleaned;
    }

    areOnSameEdge(point1, point2) {
        // Check if both points are on the same edge of the canvas
        const tolerance = 0.1;
        
        // Left edge
        if (Math.abs(point1.x) < tolerance && Math.abs(point2.x) < tolerance) return true;
        // Right edge  
        if (Math.abs(point1.x - this.width) < tolerance && Math.abs(point2.x - this.width) < tolerance) return true;
        // Top edge
        if (Math.abs(point1.y) < tolerance && Math.abs(point2.y) < tolerance) return true;
        // Bottom edge
        if (Math.abs(point1.y - this.height) < tolerance && Math.abs(point2.y - this.height) < tolerance) return true;
        
        return false;
    }

    areOnSameEdgeGcode(point1, point2, canvasWidth, canvasHeight) {
        // Check if both points are on the same edge of the canvas (for G-code coordinates)
        const tolerance = 0.1;
        
        // Left edge
        if (Math.abs(point1.x) < tolerance && Math.abs(point2.x) < tolerance) return true;
        // Right edge  
        if (Math.abs(point1.x - canvasWidth) < tolerance && Math.abs(point2.x - canvasWidth) < tolerance) return true;
        // Top edge
        if (Math.abs(point1.y) < tolerance && Math.abs(point2.y) < tolerance) return true;
        // Bottom edge
        if (Math.abs(point1.y - canvasHeight) < tolerance && Math.abs(point2.y - canvasHeight) < tolerance) return true;
        
        return false;
    }
}

document.addEventListener('DOMContentLoaded', () => new FieldLines());
