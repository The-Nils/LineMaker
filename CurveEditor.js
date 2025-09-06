/**
 * CurveEditor - Reusable Photoshop-style curve editor component
 * 
 * Usage:
 *   const curveEditor = new CurveEditor(containerElement, options);
 *   curveEditor.on('change', (curveData) => { ... });
 *   const value = curveEditor.evaluate(0.5); // Get curve value at position 0.5
 */

class CurveEditor {
    constructor(container, options = {}) {
        this.container = container;
        this.options = {
            width: options.width || 200,
            height: options.height || 200,
            gridLines: options.gridLines !== false, // Default true
            backgroundColor: options.backgroundColor || '#f8f9fa',
            gridColor: options.gridColor || '#dee2e6',
            curveColor: options.curveColor || '#007bff',
            pointColor: options.pointColor || '#007bff',
            pointHoverColor: options.pointHoverColor || '#0056b3',
            pointRadius: options.pointRadius || 4,
            minPoints: options.minPoints || 2,
            maxPoints: options.maxPoints || 8,
            ...options
        };
        
        // Control points (always include corners)
        this.controlPoints = [
            { x: 0, y: 1 }, // Bottom-left (0,1) - no force at distance 0
            { x: 1, y: 0 }  // Top-right (1,0) - max force at distance 1
        ];
        
        this.isDragging = false;
        this.dragPoint = null;
        this.hoveredPoint = null;
        this.eventListeners = {};
        
        this.init();
    }
    
    init() {
        this.createCanvas();
        this.setupEventListeners();
        this.draw();
    }
    
    createCanvas() {
        // Create container div
        this.wrapper = document.createElement('div');
        this.wrapper.className = 'curve-editor-wrapper';
        this.wrapper.style.cssText = `
            position: relative;
            width: ${this.options.width}px;
            height: ${this.options.height}px;
            border: 1px solid ${this.options.gridColor};
            border-radius: 4px;
            background: ${this.options.backgroundColor};
            cursor: crosshair;
            user-select: none;
        `;
        
        // Create canvas
        this.canvas = document.createElement('canvas');
        this.canvas.width = this.options.width;
        this.canvas.height = this.options.height;
        this.canvas.style.cssText = `
            display: block;
            width: 100%;
            height: 100%;
        `;
        
        this.ctx = this.canvas.getContext('2d');
        this.wrapper.appendChild(this.canvas);
        this.container.appendChild(this.wrapper);
    }
    
    setupEventListeners() {
        this.canvas.addEventListener('mousedown', this.onMouseDown.bind(this));
        this.canvas.addEventListener('mousemove', this.onMouseMove.bind(this));
        this.canvas.addEventListener('mouseup', this.onMouseUp.bind(this));
        this.canvas.addEventListener('mouseleave', this.onMouseLeave.bind(this));
        this.canvas.addEventListener('dblclick', this.onDoubleClick.bind(this));
    }
    
    onMouseDown(e) {
        const pos = this.getMousePos(e);
        const point = this.getPointAt(pos);
        
        if (point) {
            this.isDragging = true;
            this.dragPoint = point;
            this.wrapper.style.cursor = 'grabbing';
        }
    }
    
    onMouseMove(e) {
        const pos = this.getMousePos(e);
        
        if (this.isDragging && this.dragPoint) {
            // Update point position (constrain to canvas bounds)
            this.dragPoint.x = Math.max(0, Math.min(1, pos.x));
            this.dragPoint.y = Math.max(0, Math.min(1, pos.y));
            
            // Keep corner points locked to their X positions
            if (this.dragPoint === this.controlPoints[0]) {
                this.dragPoint.x = 0; // Lock left corner
            } else if (this.dragPoint === this.controlPoints[this.controlPoints.length - 1]) {
                this.dragPoint.x = 1; // Lock right corner
            }
            
            // Sort points by X position to maintain order
            this.controlPoints.sort((a, b) => a.x - b.x);
            
            this.draw();
            this.emit('change', this.getCurveData());
        } else {
            // Update hover state
            const hoveredPoint = this.getPointAt(pos);
            if (hoveredPoint !== this.hoveredPoint) {
                this.hoveredPoint = hoveredPoint;
                this.wrapper.style.cursor = hoveredPoint ? 'grab' : 'crosshair';
                this.draw();
            }
        }
    }
    
    onMouseUp(e) {
        this.isDragging = false;
        this.dragPoint = null;
        this.wrapper.style.cursor = this.hoveredPoint ? 'grab' : 'crosshair';
    }
    
    onMouseLeave(e) {
        this.isDragging = false;
        this.dragPoint = null;
        this.hoveredPoint = null;
        this.wrapper.style.cursor = 'crosshair';
        this.draw();
    }
    
    onDoubleClick(e) {
        const pos = this.getMousePos(e);
        const existingPoint = this.getPointAt(pos);
        
        if (existingPoint) {
            // Remove point (except corner points)
            if (existingPoint !== this.controlPoints[0] && 
                existingPoint !== this.controlPoints[this.controlPoints.length - 1] &&
                this.controlPoints.length > this.options.minPoints) {
                const index = this.controlPoints.indexOf(existingPoint);
                this.controlPoints.splice(index, 1);
            }
        } else {
            // Add new point
            if (this.controlPoints.length < this.options.maxPoints) {
                this.controlPoints.push({ x: pos.x, y: pos.y });
                this.controlPoints.sort((a, b) => a.x - b.x);
            }
        }
        
        this.draw();
        this.emit('change', this.getCurveData());
    }
    
    getMousePos(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) / rect.width,
            y: 1 - (e.clientY - rect.top) / rect.height // Flip Y axis
        };
    }
    
    getPointAt(pos) {
        const threshold = this.options.pointRadius / this.options.width;
        
        return this.controlPoints.find(point => {
            const dx = Math.abs(point.x - pos.x);
            const dy = Math.abs(point.y - pos.y);
            return dx < threshold && dy < threshold;
        });
    }
    
    draw() {
        const ctx = this.ctx;
        const width = this.canvas.width;
        const height = this.canvas.height;
        
        // Clear canvas
        ctx.clearRect(0, 0, width, height);
        
        // Draw grid
        if (this.options.gridLines) {
            this.drawGrid();
        }
        
        // Draw curve
        this.drawCurve();
        
        // Draw control points
        this.drawControlPoints();
    }
    
    drawGrid() {
        const ctx = this.ctx;
        const width = this.canvas.width;
        const height = this.canvas.height;
        
        ctx.strokeStyle = this.options.gridColor;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.3;
        
        // Vertical lines
        for (let i = 1; i < 4; i++) {
            const x = (width / 4) * i;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }
        
        // Horizontal lines
        for (let i = 1; i < 4; i++) {
            const y = (height / 4) * i;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }
        
        ctx.globalAlpha = 1;
    }
    
    drawCurve() {
        const ctx = this.ctx;
        const width = this.canvas.width;
        const height = this.canvas.height;
        
        ctx.strokeStyle = this.options.curveColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        // Draw perfectly smooth curve with much higher resolution
        const samples = width * 2; // Higher resolution for smoother curves
        for (let i = 0; i <= samples; i++) {
            const normalizedX = i / samples;
            const y = this.evaluate(normalizedX);
            const canvasX = normalizedX * width;
            const canvasY = height - (y * height); // Flip Y axis
            
            if (i === 0) {
                ctx.moveTo(canvasX, canvasY);
            } else {
                ctx.lineTo(canvasX, canvasY);
            }
        }
        
        ctx.stroke();
    }
    
    drawControlPoints() {
        const ctx = this.ctx;
        const width = this.canvas.width;
        const height = this.canvas.height;
        
        this.controlPoints.forEach(point => {
            const x = point.x * width;
            const y = height - (point.y * height); // Flip Y axis
            const isHovered = point === this.hoveredPoint;
            const isDragging = point === this.dragPoint;
            
            // Draw point
            ctx.fillStyle = isHovered || isDragging ? 
                this.options.pointHoverColor : this.options.pointColor;
            ctx.beginPath();
            ctx.arc(x, y, this.options.pointRadius, 0, Math.PI * 2);
            ctx.fill();
            
            // Draw white center
            ctx.fillStyle = 'white';
            ctx.beginPath();
            ctx.arc(x, y, this.options.pointRadius - 1, 0, Math.PI * 2);
            ctx.fill();
        });
    }
    
    // Evaluate curve at position x (0-1) with smooth cubic interpolation
    evaluate(x) {
        x = Math.max(0, Math.min(1, x));
        
        if (this.controlPoints.length < 2) return 0;
        if (this.controlPoints.length === 2) {
            // Pure linear interpolation for 2 points
            const p0 = this.controlPoints[0];
            const p1 = this.controlPoints[1];
            if (p1.x === p0.x) return p0.y;
            const t = (x - p0.x) / (p1.x - p0.x);
            return Math.max(0, Math.min(1, p0.y + (p1.y - p0.y) * t));
        }
        
        // Find segment
        let i = 0;
        for (i = 0; i < this.controlPoints.length - 1; i++) {
            if (x <= this.controlPoints[i + 1].x) break;
        }
        
        // Boundary conditions
        if (i === 0 && x < this.controlPoints[0].x) return this.controlPoints[0].y;
        if (i >= this.controlPoints.length - 1) return this.controlPoints[this.controlPoints.length - 1].y;
        
        // Get 4 points for cubic interpolation (with proper boundary handling)
        const p0 = i > 0 ? this.controlPoints[i - 1] : this.controlPoints[i];
        const p1 = this.controlPoints[i];
        const p2 = this.controlPoints[i + 1];
        const p3 = i < this.controlPoints.length - 2 ? this.controlPoints[i + 2] : this.controlPoints[i + 1];
        
        // Parameterize within segment
        const t = (x - p1.x) / (p2.x - p1.x);
        
        // Hermite cubic interpolation (stable alternative to Catmull-Rom)
        const t2 = t * t;
        const t3 = t2 * t;
        
        // Calculate tangents
        const m0 = i > 0 ? 0.5 * ((p2.y - p0.y) / Math.max(0.001, p2.x - p0.x)) : 0;
        const m1 = i < this.controlPoints.length - 2 ? 0.5 * ((p3.y - p1.y) / Math.max(0.001, p3.x - p1.x)) : 0;
        
        // Hermite basis functions
        const h00 = 2*t3 - 3*t2 + 1;
        const h10 = t3 - 2*t2 + t;
        const h01 = -2*t3 + 3*t2;
        const h11 = t3 - t2;
        
        const result = h00 * p1.y + h10 * m0 * (p2.x - p1.x) + h01 * p2.y + h11 * m1 * (p2.x - p1.x);
        
        return Math.max(0, Math.min(1, result));
    }
    
    // Set curve data
    setCurve(points) {
        if (Array.isArray(points) && points.length >= this.options.minPoints) {
            this.controlPoints = points.map(p => ({ x: p.x, y: p.y }));
            this.controlPoints.sort((a, b) => a.x - b.x);
            this.draw();
        }
    }
    
    // Get curve data
    getCurveData() {
        return {
            points: this.controlPoints.map(p => ({ x: p.x, y: p.y })),
            evaluate: this.evaluate.bind(this)
        };
    }
    
    // Event system
    on(event, callback) {
        if (!this.eventListeners[event]) {
            this.eventListeners[event] = [];
        }
        this.eventListeners[event].push(callback);
    }
    
    off(event, callback) {
        if (this.eventListeners[event]) {
            const index = this.eventListeners[event].indexOf(callback);
            if (index > -1) {
                this.eventListeners[event].splice(index, 1);
            }
        }
    }
    
    emit(event, data) {
        if (this.eventListeners[event]) {
            this.eventListeners[event].forEach(callback => callback(data));
        }
    }
    
    // Destroy component
    destroy() {
        if (this.wrapper && this.wrapper.parentNode) {
            this.wrapper.parentNode.removeChild(this.wrapper);
        }
        this.eventListeners = {};
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CurveEditor;
} else if (typeof window !== 'undefined') {
    window.CurveEditor = CurveEditor;
}