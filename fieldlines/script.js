class FieldLines {
    constructor() {
        this.svg = document.getElementById('outputSvg');
        this.gridLinesGroup = document.getElementById('grid-lines');
        this.fieldPointsGroup = document.getElementById('field-points');
        this.modal = document.getElementById('pointModal');
        this.selectedPointIndex = -1;

        this.points = [];
        this.lines = [];
        this.pixelsPerMm = 4; // A scaling factor for SVG units

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

        // Buttons
        document.getElementById('clearPointsBtn').addEventListener('click', () => {
            this.points = [];
            this.draw();
        });
        document.getElementById('fitToContentBtn').addEventListener('click', () => this.interactiveCanvas.fitToContent());
        document.getElementById('resetViewBtn').addEventListener('click', () => this.interactiveCanvas.resetTransform());

        // SVG interaction
        this.svg.addEventListener('click', (e) => this.handleCanvasClick(e));
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

        // Redraw on transform
        this.previewArea.addEventListener('canvasTransform', () => this.draw());
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
        this.width = widthMm * this.pixelsPerMm;
        this.height = heightMm * this.pixelsPerMm;

        this.svg.setAttribute('viewBox', `0 0 ${this.width} ${this.height}`);
        this.svg.setAttribute('width', `${this.width}px`);
        this.svg.setAttribute('height', `${this.height}px`);
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

            // Subdivide the line to allow for deformation
            const numSegments = 100;
            for (let j = 0; j <= numSegments; j++) {
                const t = j / numSegments;
                line.push({
                    x: startX + (endX - startX) * t,
                    y: startY + (endY - startY) * t,
                    originalX: startX + (endX - startX) * t,
                    originalY: startY + (endY - startY) * t
                });
            }
            this.lines.push(line);
        }
    }

    handleCanvasClick(e) {
        if (e.target.closest('#field-points')) return;

        const transform = this.interactiveCanvas.getTransform();
        const rect = this.previewArea.getBoundingClientRect();

        const x = (e.clientX - rect.left - transform.x) / transform.scale;
        const y = (e.clientY - rect.top - transform.y) / transform.scale;

        const newPointMode = document.querySelector('input[name="newPointMode"]:checked').value;
        const newPointForce = document.getElementById('newPointForceValue').value;
        const newPointRadius = document.getElementById('newPointRadiusValue').value * this.pixelsPerMm;
        const newPointAllowCrossing = document.getElementById('newPointAllowCrossing').checked;

        this.points.push({
            x: x,
            y: y,
            mode: newPointMode,
            force: newPointForce,
            radius: newPointRadius,
            allowCrossing: newPointAllowCrossing
        });

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
        this.gridLinesGroup.innerHTML = '';
        this.fieldPointsGroup.innerHTML = '';

        const tension = document.getElementById('lineTensionValue').value;

        // Draw lines
        this.lines.forEach(line => {
            const deformedLine = line.map(p => {
                let dx = 0, dy = 0;

                this.points.forEach(fieldPoint => {
                    const dist = Math.sqrt(Math.pow(p.originalX - fieldPoint.x, 2) + Math.pow(p.originalY - fieldPoint.y, 2));
                    if (dist < fieldPoint.radius) {
                        let force = fieldPoint.force * (1 - (dist / fieldPoint.radius));
                        const angle = Math.atan2(p.originalY - fieldPoint.y, p.originalX - fieldPoint.x);
                        const direction = fieldPoint.mode === 'attract' ? -1 : 1;

                        if (fieldPoint.mode === 'attract' && !fieldPoint.allowCrossing) {
                            force = Math.min(force, dist);
                        }

                        dx += Math.cos(angle) * force * direction;
                        dy += Math.sin(angle) * force * direction;
                    }
                });

                return { x: p.originalX + dx, y: p.originalY + dy };
            });

            // Apply tension
            const smoothedLine = this.smoothLine(deformedLine, tension);

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
        this.points.forEach((point, i) => {
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', point.x);
            circle.setAttribute('cy', point.y);
            circle.setAttribute('r', 5 / currentScale ); // Scale radius with zoom
            circle.setAttribute('fill', point.mode === 'attract' ? 'blue' : 'red');
            circle.dataset.index = i;
            this.fieldPointsGroup.appendChild(circle);
        });
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
