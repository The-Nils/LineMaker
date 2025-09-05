class FieldLines {
    constructor() {
        this.svg = document.getElementById('outputSvg');
        this.gridLinesGroup = document.getElementById('grid-lines');
        this.fieldPointsGroup = document.getElementById('field-points');
        this.drawnLinesGroup = document.getElementById('drawn-lines');
        this.modal = document.getElementById('pointModal');
        this.selectedPointIndex = -1;

        this.points = [];
        this.lines = [];
        this.drawnLines = [];
        this.pixelsPerMm = 4; // A scaling factor for SVG units

        this.drawMode = false;
        this.isDrawing = false;
        this.currentDrawing = [];

        this.previewArea = document.querySelector('.preview-area');
        this.interactiveCanvas = new InteractiveCanvas(this.previewArea);

        this.setupEventListeners();
        this.updateCanvasSize();
        this.generateLines();
        this.draw();
    }

    setupEventListeners() {
        // Canvas size
        document.getElementById('canvasWidthValue').addEventListener('input', () => { this.updateCanvasSize(); this.generateLines(); this.draw(); });
        document.getElementById('canvasHeightValue').addEventListener('input', () => { this.updateCanvasSize(); this.generateLines(); this.draw(); });
        
        // Line settings
        document.getElementById('lineAngleValue').addEventListener('input', () => { this.generateLines(); this.draw(); });
        document.getElementById('lineSpacingValue').addEventListener('input', () => { this.generateLines(); this.draw(); });
        this.syncInputs('lineTension', 'lineTensionValue', () => { this.draw(); });

        // New point settings
        this.syncInputs('newPointForce', 'newPointForceValue');
        this.syncInputs('newPointRadius', 'newPointRadiusValue');
        this.syncInputs('newPointFalloff', 'newPointFalloffValue');

        // Buttons
        document.getElementById('drawModeBtn').addEventListener('click', (e) => this.toggleDrawMode(e));
        document.getElementById('clearPointsBtn').addEventListener('click', () => {
            this.points = [];
            this.drawnLines = [];
            this.draw();
        });
        document.getElementById('fitToContentBtn').addEventListener('click', () => this.interactiveCanvas.fitToContent());
        document.getElementById('resetViewBtn').addEventListener('click', () => this.interactiveCanvas.resetTransform());

        // SVG interaction
        this.svg.addEventListener('pointerdown', (e) => this.handlePointerDown(e));
        document.addEventListener('pointermove', (e) => this.handlePointerMove(e));
        document.addEventListener('pointerup', (e) => this.handlePointerUp(e));
        this.svg.addEventListener('click', (e) => this.handleCanvasClick(e));
        this.fieldPointsGroup.addEventListener('click', (e) => this.handlePointClick(e));

        // Modal events
        this.modal.querySelector('.close-button').addEventListener('click', () => this.closeModal());
        document.querySelectorAll('input[name="pointMode"]').forEach(radio => {
            radio.addEventListener('change', (e) => this.updatePointMode(e));
        });
        this.syncInputs('pointForce', 'pointForceValue', () => this.updatePointData());
        this.syncInputs('pointRadius', 'pointRadiusValue', () => this.updatePointData());
        this.syncInputs('pointFalloff', 'pointFalloffValue', () => this.updatePointData());
        document.getElementById('pointAllowCrossing').addEventListener('change', (e) => this.updatePointAllowCrossing(e));
        document.getElementById('deletePointBtn').addEventListener('click', () => this.deletePoint());
        
        // Visualization toggle
        document.getElementById('showVisualization').addEventListener('change', () => this.draw());

        // Redraw on transform
        this.previewArea.addEventListener('canvasTransform', () => this.draw());
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
            const newPointFalloff = document.getElementById('newPointFalloffValue').value;
            const newPointAllowCrossing = document.getElementById('newPointAllowCrossing').checked;

            this.drawnLines.push({
                points: smoothedLine,
                mode: newPointMode,
                force: newPointForce,
                radius: newPointRadius,
                falloff: newPointFalloff,
                allowCrossing: newPointAllowCrossing
            });
        }
        this.currentDrawing = [];
        this.draw();
    }

    getSVGPoint(e) {
        // Use the same coordinate space as line generation (this.width × this.height)
        // instead of relying on SVG's potentially non-square rendered dimensions
        const svgRect = this.svg.getBoundingClientRect();
        
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
        const newPointFalloff = document.getElementById('newPointFalloffValue').value;
        const newPointAllowCrossing = document.getElementById('newPointAllowCrossing').checked;

        this.points.push({
            x: point.x,
            y: point.y,
            mode: newPointMode,
            force: newPointForce,
            radius: newPointRadius,
            falloff: newPointFalloff,
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
        const widthMm = document.getElementById('canvasWidthValue').value;
        const heightMm = document.getElementById('canvasHeightValue').value;
        const widthPx = Math.round(widthMm * this.pixelsPerMm);
        const heightPx = Math.round(heightMm * this.pixelsPerMm);
        
        this.width = widthPx;
        this.height = heightPx;

        this.svg.setAttribute('viewBox', `0 0 ${widthPx} ${heightPx}`);
        this.svg.setAttribute('width', `${widthMm}mm`);
        this.svg.setAttribute('height', `${heightMm}mm`);
        
        // Position SVG like hatchmaker for proper InteractiveCanvas behavior  
        this.svg.style.position = 'absolute';
        this.svg.style.top = '0';
        this.svg.style.left = '50%';
        this.svg.style.transform = 'translateX(-50%)';
        this.svg.style.minWidth = '0';
        this.svg.style.minHeight = '0';
        this.svg.style.border = '2px solid #ecf0f1';
        this.svg.style.borderRadius = '8px';
        this.svg.style.background = 'white';
        this.svg.style.transformOrigin = 'center center';
        this.svg.style.transition = 'transform 0.3s ease';
    }

    generateLines() {
        this.lines = [];
        const spacing = document.getElementById('lineSpacingValue').value * this.pixelsPerMm;
        const angle = document.getElementById('lineAngleValue').value * (Math.PI / 180);
        
        const diagonal = Math.sqrt(this.width * this.width + this.height * this.height);
        const numLines = Math.ceil(diagonal / spacing);

        const ca = Math.cos(angle);
        const sa = Math.sin(angle);

        for (let i = 0; i < numLines; i++) {
            const line = [];
            const offset = (i - numLines / 2) * spacing;
            const lineLength = diagonal * 1.2; // Make lines longer to ensure they cover the canvas when rotated

            const startX = this.width / 2 + offset * ca - (lineLength / 2) * sa;
            const startY = this.height / 2 + offset * sa + (lineLength / 2) * ca;
            const endX = this.width / 2 + offset * ca + (lineLength / 2) * sa;
            const endY = this.height / 2 + offset * sa - (lineLength / 2) * ca;

            // Generate line with adaptive resolution based on proximity to force fields
            this.generateAdaptiveLineSegments(line, startX, startY, endX, endY);
            this.lines.push(line);
        }
    }

    generateAdaptiveLineSegments(line, startX, startY, endX, endY) {
        const lineLength = Math.sqrt((endX - startX) ** 2 + (endY - startY) ** 2);
        const baseStep = lineLength / 50; // Base step size
        
        let currentDistance = 0;
        while (currentDistance <= lineLength) {
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
            
            // Calculate adaptive step size based on distance to nearest force field
            let stepSize = baseStep;
            if (minDistToField < 100) {
                // Much smaller steps near force fields
                const proximityFactor = Math.max(0.01, minDistToField / 100);
                stepSize = baseStep * proximityFactor * 0.01; // Up to 100x more resolution
            }
            
            line.push({
                x: x,
                y: y,
                originalX: x,
                originalY: y
            });
            
            currentDistance += stepSize;
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
        document.getElementById('pointFalloff').value = point.falloff || 1;
        document.getElementById('pointFalloffValue').value = point.falloff || 1;
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
        this.points[this.selectedPointIndex].falloff = document.getElementById('pointFalloffValue').value;
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
        this.gridLinesGroup.innerHTML = '';
        this.fieldPointsGroup.innerHTML = '';
        this.drawnLinesGroup.innerHTML = '';

        const tension = document.getElementById('lineTensionValue').value;

        // Draw the line currently being drawn
        if (this.isDrawing && this.currentDrawing.length > 1) {
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            let d = `M ${this.currentDrawing[0].x} ${this.currentDrawing[0].y}`;
            for (let i = 1; i < this.currentDrawing.length; i++) {
                d += ` L ${this.currentDrawing[i].x} ${this.currentDrawing[i].y}`;
            }
            path.setAttribute('d', d);
            path.setAttribute('stroke', 'gray');
            path.setAttribute('stroke-width', 2 / this.interactiveCanvas.getTransform().scale);
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
            path.setAttribute('stroke-width', 2 / this.interactiveCanvas.getTransform().scale);
            path.setAttribute('fill', 'none');
            this.drawnLinesGroup.appendChild(path);
        });

        // Draw lines
        this.lines.forEach(line => {
            // First pass: calculate deformation for each point
            const deformedLine = line.map(p => {
                let dx = 0, dy = 0;

                this.points.forEach(fieldPoint => {
                    const dist = Math.sqrt(Math.pow(p.originalX - fieldPoint.x, 2) + Math.pow(p.originalY - fieldPoint.y, 2));
                    if (dist < fieldPoint.radius) {
                        const falloff = fieldPoint.falloff || 1;
                        const normalizedDist = dist / fieldPoint.radius;
                        let force = fieldPoint.force * Math.pow(1 - normalizedDist, falloff);
                        const angle = Math.atan2(p.originalY - fieldPoint.y, p.originalX - fieldPoint.x);
                        const direction = fieldPoint.mode === 'attract' ? -1 : 1;

                        if (fieldPoint.mode === 'attract' && !fieldPoint.allowCrossing) {
                            force = Math.min(force, dist);
                        }

                        dx += Math.cos(angle) * force * direction;
                        dy += Math.sin(angle) * force * direction;
                    }
                });

                this.drawnLines.forEach(drawnLine => {
                    for (let i = 0; i < drawnLine.points.length; i++) {
                        const p2 = drawnLine.points[i];
                        const dist = Math.sqrt(Math.pow(p.originalX - p2.x, 2) + Math.pow(p.originalY - p2.y, 2));
                        if (dist < drawnLine.radius) {
                            const falloff = drawnLine.falloff || 1;
                            const normalizedDist = dist / drawnLine.radius;
                            let force = drawnLine.force * Math.pow(1 - normalizedDist, falloff);
                            const angle = Math.atan2(p.originalY - p2.y, p.originalX - p2.x);
                            const direction = drawnLine.mode === 'attract' ? -1 : 1;

                            if (drawnLine.mode === 'attract' && !drawnLine.allowCrossing) {
                                force = Math.min(force, dist);
                            }

                            dx += Math.cos(angle) * force * direction;
                            dy += Math.sin(angle) * force * direction;
                        }
                    }
                });

                const deformation = Math.sqrt(dx * dx + dy * dy);
                return { 
                    x: p.originalX + dx, 
                    y: p.originalY + dy, 
                    originalX: p.originalX,
                    originalY: p.originalY,
                    deformation: deformation 
                };
            });

            // Second pass: adaptively subdivide based on deformation
            const adaptiveLine = this.adaptiveSubdivision(deformedLine);

            // Apply tension
            const smoothedLine = this.smoothLine(adaptiveLine, tension);

            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            let d = `M ${smoothedLine[0].x} ${smoothedLine[0].y}`;
            for (let i = 1; i < smoothedLine.length; i++) {
                d += ` L ${smoothedLine[i].x} ${smoothedLine[i].y}`;
            }
            path.setAttribute('d', d);
            path.setAttribute('stroke', 'black');
            path.setAttribute('fill', 'none');
            this.gridLinesGroup.appendChild(path);
        });

        // Draw points
        const currentScale = this.interactiveCanvas.getTransform().scale;
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
                radiusCircle.setAttribute('stroke-width', 1 / currentScale);
                radiusCircle.setAttribute('stroke-dasharray', '5,5');
                radiusCircle.setAttribute('opacity', '0.3');
                radiusCircle.setAttribute('pointer-events', 'none'); // Make non-interactive
                this.fieldPointsGroup.appendChild(radiusCircle);
                
                // Draw force field strength grid (debug)
                this.drawForceFieldGrid(point, currentScale);
            }
            
            // Always draw the center point
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', point.x);
            circle.setAttribute('cy', point.y);
            circle.setAttribute('r', 5 / currentScale ); // Scale radius with zoom
            circle.setAttribute('fill', point.mode === 'attract' ? 'blue' : 'red');
            circle.dataset.index = i;
            this.fieldPointsGroup.appendChild(circle);
        });
    }

    drawForceFieldGrid(point, currentScale) {
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
                        forceCircle.setAttribute('r', 3 / currentScale);
                        forceCircle.setAttribute('fill', point.mode === 'attract' ? 'blue' : 'red');
                        forceCircle.setAttribute('opacity', forceRatio * 0.6);
                        forceCircle.setAttribute('pointer-events', 'none');
                        this.fieldPointsGroup.appendChild(forceCircle);
                    }
                }
            }
        }
    }

    adaptiveSubdivision(line) {
        const result = [];
        
        // Calculate minimum radius to adjust thresholds for small force fields
        let minRadius = Infinity;
        this.points.forEach(point => {
            if (point.radius < minRadius) minRadius = point.radius;
        });
        this.drawnLines.forEach(drawnLine => {
            if (drawnLine.radius < minRadius) minRadius = drawnLine.radius;
        });
        
        // Adjust thresholds based on smallest force field
        let deformationThreshold = 10; // Default threshold
        let maxSubdivisions = 3; // Default max subdivisions
        
        if (minRadius < 100) {
            // For small radii, be more aggressive with subdivision
            deformationThreshold = Math.max(2, minRadius / 10); // Much lower threshold
            maxSubdivisions = Math.min(6, Math.ceil(100 / minRadius)); // More subdivisions for smaller radii
        }
        
        for (let i = 0; i < line.length - 1; i++) {
            const current = line[i];
            const next = line[i + 1];
            
            result.push(current);
            
            // Calculate average deformation between current and next point
            const avgDeformation = (current.deformation + next.deformation) / 2;
            
            // Determine subdivision level based on deformation
            let subdivisions = 0;
            if (avgDeformation > deformationThreshold) {
                subdivisions = Math.min(maxSubdivisions, Math.floor(avgDeformation / deformationThreshold));
            }
            
            // Add subdivided points
            for (let sub = 1; sub <= subdivisions; sub++) {
                const t = sub / (subdivisions + 1);
                const interpX = current.originalX + (next.originalX - current.originalX) * t;
                const interpY = current.originalY + (next.originalY - current.originalY) * t;
                
                // Calculate deformation for interpolated point
                let dx = 0, dy = 0;
                this.points.forEach(fieldPoint => {
                    const dist = Math.sqrt(Math.pow(interpX - fieldPoint.x, 2) + Math.pow(interpY - fieldPoint.y, 2));
                    if (dist < fieldPoint.radius) {
                        const falloff = fieldPoint.falloff || 1;
                        const normalizedDist = dist / fieldPoint.radius;
                        let force = fieldPoint.force * Math.pow(1 - normalizedDist, falloff);
                        const angle = Math.atan2(interpY - fieldPoint.y, interpX - fieldPoint.x);
                        const direction = fieldPoint.mode === 'attract' ? -1 : 1;
                        
                        if (fieldPoint.mode === 'attract' && !fieldPoint.allowCrossing) {
                            force = Math.min(force, dist);
                        }
                        
                        dx += Math.cos(angle) * force * direction;
                        dy += Math.sin(angle) * force * direction;
                    }
                });
                
                this.drawnLines.forEach(drawnLine => {
                    for (let j = 0; j < drawnLine.points.length; j++) {
                        const p2 = drawnLine.points[j];
                        const dist = Math.sqrt(Math.pow(interpX - p2.x, 2) + Math.pow(interpY - p2.y, 2));
                        if (dist < drawnLine.radius) {
                            const falloff = drawnLine.falloff || 1;
                            const normalizedDist = dist / drawnLine.radius;
                            let force = drawnLine.force * Math.pow(1 - normalizedDist, falloff);
                            const angle = Math.atan2(interpY - p2.y, interpX - p2.x);
                            const direction = drawnLine.mode === 'attract' ? -1 : 1;
                            
                            if (drawnLine.mode === 'attract' && !drawnLine.allowCrossing) {
                                force = Math.min(force, dist);
                            }
                            
                            dx += Math.cos(angle) * force * direction;
                            dy += Math.sin(angle) * force * direction;
                        }
                    }
                });
                
                result.push({
                    x: interpX + dx,
                    y: interpY + dy,
                    originalX: interpX,
                    originalY: interpY
                });
            }
        }
        
        // Don't forget the last point
        if (line.length > 0) {
            result.push(line[line.length - 1]);
        }
        
        return result;
    }

    smoothLine(line, tension) {
        if (tension == 1) return line;
        const smoothed = [];
        const windowSize = Math.floor(line.length * (1 - tension) * 0.1);
        if (windowSize < 1) return line;

        for (let i = 0; i < line.length; i++) {
            let avgX = 0, avgY = 0;
            let count = 0;
            for (let j = -windowSize; j <= windowSize; j++) {
                if (i + j >= 0 && i + j < line.length) {
                    avgX += line[i+j].x;
                    avgY += line[i+j].y;
                    count++;
                }
            }
            smoothed.push({ x: avgX / count, y: avgY / count });
        }
        return smoothed;
    }
}

document.addEventListener('DOMContentLoaded', () => new FieldLines());
