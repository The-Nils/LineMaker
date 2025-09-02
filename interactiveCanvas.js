class InteractiveCanvas {
    constructor(container, options = {}) {
        this.container = container;
        this.options = {
            minZoom: 0.1,
            maxZoom: 10,
            zoomSpeed: 0.1,
            enablePan: true,
            enableZoom: true,
            fitOnResize: true,
            ...options
        };

        // Transform state
        this.transform = {
            x: 0,
            y: 0,
            scale: 1
        };

        // Interaction state
        this.isDragging = false;
        this.lastPointerPos = { x: 0, y: 0 };
        this.pointers = new Map();
        this.lastPinchDistance = 0;
        this.lastPinchCenter = { x: 0, y: 0 };

        // Content element - this will hold the actual content to be transformed
        this.content = null;

        this.init();
    }

    init() {
        this.setupContainer();
        this.setupEventListeners();
    }

    setupContainer() {
        // Make container relative positioned and add overflow hidden
        this.container.style.position = 'relative';
        this.container.style.overflow = 'hidden';
        this.container.style.cursor = 'grab';
        this.container.style.userSelect = 'none';
        this.container.style.touchAction = 'none';

        // Create content wrapper
        this.contentWrapper = document.createElement('div');
        this.contentWrapper.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            transform-origin: 0 0;
            will-change: transform;
        `;

        // Move existing content into wrapper
        while (this.container.firstChild) {
            this.contentWrapper.appendChild(this.container.firstChild);
        }
        this.container.appendChild(this.contentWrapper);
        
        this.content = this.contentWrapper;
    }

    setupEventListeners() {
        // Mouse events
        if (this.options.enablePan) {
            this.container.addEventListener('mousedown', this.handleMouseDown.bind(this));
            document.addEventListener('mousemove', this.handleMouseMove.bind(this));
            document.addEventListener('mouseup', this.handleMouseUp.bind(this));
        }

        // Mouse wheel for zoom
        if (this.options.enableZoom) {
            this.container.addEventListener('wheel', this.handleWheel.bind(this), { passive: false });
        }

        // Touch events for mobile/trackpad
        this.container.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: false });
        this.container.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
        this.container.addEventListener('touchend', this.handleTouchEnd.bind(this), { passive: false });

        // Pointer events (more modern approach, handles mouse, pen, and touch)
        if (window.PointerEvent) {
            this.container.addEventListener('pointerdown', this.handlePointerDown.bind(this));
            this.container.addEventListener('pointermove', this.handlePointerMove.bind(this));
            this.container.addEventListener('pointerup', this.handlePointerUp.bind(this));
            this.container.addEventListener('pointercancel', this.handlePointerUp.bind(this));
        }

        // Prevent context menu on right click
        this.container.addEventListener('contextmenu', (e) => e.preventDefault());

        // Handle resize if needed
        if (this.options.fitOnResize) {
            window.addEventListener('resize', this.handleResize.bind(this));
        }
    }

    // Mouse event handlers
    handleMouseDown(e) {
        if (e.button !== 0) return; // Only handle left mouse button
        
        this.isDragging = true;
        this.lastPointerPos = { x: e.clientX, y: e.clientY };
        this.container.style.cursor = 'grabbing';
        e.preventDefault();
    }

    handleMouseMove(e) {
        if (!this.isDragging || !this.options.enablePan) return;

        const deltaX = e.clientX - this.lastPointerPos.x;
        const deltaY = e.clientY - this.lastPointerPos.y;

        this.pan(deltaX, deltaY);
        this.lastPointerPos = { x: e.clientX, y: e.clientY };
        e.preventDefault();
    }

    handleMouseUp(e) {
        if (this.isDragging) {
            this.isDragging = false;
            this.container.style.cursor = 'grab';
        }
    }

    // Wheel event for zoom
    handleWheel(e) {
        if (!this.options.enableZoom) return;

        e.preventDefault();
        
        const rect = this.container.getBoundingClientRect();
        const centerX = e.clientX - rect.left;
        const centerY = e.clientY - rect.top;

        // Normalize wheel delta
        let delta = e.deltaY;
        if (e.deltaMode === 1) delta *= 40; // Line mode
        if (e.deltaMode === 2) delta *= 800; // Page mode

        // Calculate zoom factor
        const zoomFactor = Math.pow(0.999, delta);
        this.zoomAt(centerX, centerY, zoomFactor);
    }

    // Touch event handlers
    handleTouchStart(e) {
        e.preventDefault();
        
        if (e.touches.length === 1) {
            // Single touch - start panning
            this.isDragging = true;
            this.lastPointerPos = {
                x: e.touches[0].clientX,
                y: e.touches[0].clientY
            };
        } else if (e.touches.length === 2) {
            // Two finger touch - prepare for pinch zoom
            this.isDragging = false;
            const touch1 = e.touches[0];
            const touch2 = e.touches[1];
            
            this.lastPinchDistance = this.getDistance(touch1, touch2);
            this.lastPinchCenter = this.getCenter(touch1, touch2);
        }
    }

    handleTouchMove(e) {
        e.preventDefault();

        if (e.touches.length === 1 && this.isDragging && this.options.enablePan) {
            // Single touch pan
            const touch = e.touches[0];
            const deltaX = touch.clientX - this.lastPointerPos.x;
            const deltaY = touch.clientY - this.lastPointerPos.y;

            this.pan(deltaX, deltaY);
            this.lastPointerPos = { x: touch.clientX, y: touch.clientY };
        } else if (e.touches.length === 2 && this.options.enableZoom) {
            // Two finger pinch zoom
            const touch1 = e.touches[0];
            const touch2 = e.touches[1];
            
            const distance = this.getDistance(touch1, touch2);
            const center = this.getCenter(touch1, touch2);
            
            if (this.lastPinchDistance > 0) {
                const zoomFactor = distance / this.lastPinchDistance;
                
                const rect = this.container.getBoundingClientRect();
                const centerX = center.x - rect.left;
                const centerY = center.y - rect.top;
                
                this.zoomAt(centerX, centerY, zoomFactor);
            }
            
            this.lastPinchDistance = distance;
            this.lastPinchCenter = center;
        }
    }

    handleTouchEnd(e) {
        if (e.touches.length === 0) {
            this.isDragging = false;
            this.lastPinchDistance = 0;
        } else if (e.touches.length === 1) {
            // Switched from multi-touch to single touch
            this.isDragging = true;
            this.lastPointerPos = {
                x: e.touches[0].clientX,
                y: e.touches[0].clientY
            };
            this.lastPinchDistance = 0;
        }
    }

    // Modern Pointer Events (handles mouse, touch, and pen uniformly)
    handlePointerDown(e) {
        this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        
        if (this.pointers.size === 1) {
            this.isDragging = true;
            this.lastPointerPos = { x: e.clientX, y: e.clientY };
            this.container.style.cursor = 'grabbing';
        } else if (this.pointers.size === 2) {
            this.isDragging = false;
            this.container.style.cursor = 'grab';
            
            const pointers = Array.from(this.pointers.values());
            this.lastPinchDistance = this.getDistance(pointers[0], pointers[1]);
            this.lastPinchCenter = this.getCenter(pointers[0], pointers[1]);
        }
        
        e.preventDefault();
    }

    handlePointerMove(e) {
        if (!this.pointers.has(e.pointerId)) return;
        
        this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        
        if (this.pointers.size === 1 && this.isDragging && this.options.enablePan) {
            // Single pointer pan
            const deltaX = e.clientX - this.lastPointerPos.x;
            const deltaY = e.clientY - this.lastPointerPos.y;

            this.pan(deltaX, deltaY);
            this.lastPointerPos = { x: e.clientX, y: e.clientY };
        } else if (this.pointers.size === 2 && this.options.enableZoom) {
            // Two pointer pinch zoom
            const pointers = Array.from(this.pointers.values());
            const distance = this.getDistance(pointers[0], pointers[1]);
            const center = this.getCenter(pointers[0], pointers[1]);
            
            if (this.lastPinchDistance > 0) {
                const zoomFactor = distance / this.lastPinchDistance;
                
                const rect = this.container.getBoundingClientRect();
                const centerX = center.x - rect.left;
                const centerY = center.y - rect.top;
                
                this.zoomAt(centerX, centerY, zoomFactor);
            }
            
            this.lastPinchDistance = distance;
            this.lastPinchCenter = center;
        }
        
        e.preventDefault();
    }

    handlePointerUp(e) {
        this.pointers.delete(e.pointerId);
        
        if (this.pointers.size === 0) {
            this.isDragging = false;
            this.container.style.cursor = 'grab';
            this.lastPinchDistance = 0;
        } else if (this.pointers.size === 1) {
            // Switch back to single pointer mode
            const pointer = Array.from(this.pointers.values())[0];
            this.isDragging = true;
            this.lastPointerPos = { x: pointer.x, y: pointer.y };
            this.container.style.cursor = 'grabbing';
            this.lastPinchDistance = 0;
        }
    }

    // Handle window resize
    handleResize() {
        // Could implement auto-fit logic here if needed
        this.updateTransform();
    }

    // Transform methods
    pan(deltaX, deltaY) {
        this.transform.x += deltaX;
        this.transform.y += deltaY;
        this.updateTransform();
    }

    zoom(factor, centerX = null, centerY = null) {
        if (centerX === null) centerX = this.container.clientWidth / 2;
        if (centerY === null) centerY = this.container.clientHeight / 2;
        
        this.zoomAt(centerX, centerY, factor);
    }

    zoomAt(centerX, centerY, factor) {
        const newScale = Math.max(
            this.options.minZoom,
            Math.min(this.options.maxZoom, this.transform.scale * factor)
        );
        
        if (newScale === this.transform.scale) return; // No change needed
        
        const scaleFactor = newScale / this.transform.scale;
        
        // Adjust pan to zoom around the specified point
        this.transform.x = centerX - (centerX - this.transform.x) * scaleFactor;
        this.transform.y = centerY - (centerY - this.transform.y) * scaleFactor;
        this.transform.scale = newScale;
        
        this.updateTransform();
    }

    setTransform(x, y, scale) {
        this.transform.x = x;
        this.transform.y = y;
        this.transform.scale = Math.max(
            this.options.minZoom,
            Math.min(this.options.maxZoom, scale)
        );
        this.updateTransform();
    }

    resetTransform() {
        this.transform = { x: 0, y: 0, scale: 1 };
        this.updateTransform();
    }

    fitToContent() {
        if (!this.content) return;
        
        const containerRect = this.container.getBoundingClientRect();
        const contentRect = this.content.getBoundingClientRect();
        
        if (contentRect.width === 0 || contentRect.height === 0) return;
        
        const scaleX = containerRect.width / contentRect.width;
        const scaleY = containerRect.height / contentRect.height;
        const scale = Math.min(scaleX, scaleY, 1); // Don't scale up beyond 100%
        
        const centerX = (containerRect.width - contentRect.width * scale) / 2;
        const centerY = (containerRect.height - contentRect.height * scale) / 2;
        
        this.setTransform(centerX, centerY, scale);
    }

    updateTransform() {
        if (this.content) {
            this.content.style.transform = 
                `translate(${this.transform.x}px, ${this.transform.y}px) scale(${this.transform.scale})`;
        }
        
        // Emit custom event for listeners
        this.container.dispatchEvent(new CustomEvent('canvasTransform', {
            detail: { ...this.transform }
        }));
    }

    // Utility methods
    getDistance(point1, point2) {
        const dx = point1.x - point2.x;
        const dy = point1.y - point2.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    getCenter(point1, point2) {
        return {
            x: (point1.x + point2.x) / 2,
            y: (point1.y + point2.y) / 2
        };
    }

    // Public API methods
    getTransform() {
        return { ...this.transform };
    }

    setContent(element) {
        if (this.content) {
            // Clear existing content
            while (this.content.firstChild) {
                this.content.removeChild(this.content.firstChild);
            }
            
            // Add new content
            if (element) {
                this.content.appendChild(element);
            }
        }
    }

    enable() {
        this.container.style.pointerEvents = 'auto';
        this.options.enablePan = true;
        this.options.enableZoom = true;
    }

    disable() {
        this.container.style.pointerEvents = 'none';
        this.options.enablePan = false;
        this.options.enableZoom = false;
        this.isDragging = false;
    }

    destroy() {
        // Remove event listeners
        this.container.removeEventListener('mousedown', this.handleMouseDown);
        this.container.removeEventListener('wheel', this.handleWheel);
        this.container.removeEventListener('touchstart', this.handleTouchStart);
        this.container.removeEventListener('touchmove', this.handleTouchMove);
        this.container.removeEventListener('touchend', this.handleTouchEnd);
        this.container.removeEventListener('pointerdown', this.handlePointerDown);
        this.container.removeEventListener('pointermove', this.handlePointerMove);
        this.container.removeEventListener('pointerup', this.handlePointerUp);
        this.container.removeEventListener('pointercancel', this.handlePointerUp);
        this.container.removeEventListener('contextmenu', (e) => e.preventDefault());
        
        document.removeEventListener('mousemove', this.handleMouseMove);
        document.removeEventListener('mouseup', this.handleMouseUp);
        
        if (this.options.fitOnResize) {
            window.removeEventListener('resize', this.handleResize);
        }
        
        // Reset container
        this.container.style.position = '';
        this.container.style.overflow = '';
        this.container.style.cursor = '';
        this.container.style.userSelect = '';
        this.container.style.touchAction = '';
    }
}