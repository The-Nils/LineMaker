# Canvas Handling Guide

## Setup
```javascript
// Initialize InteractiveCanvas
this.previewArea = document.querySelector('.preview-area');
this.interactiveCanvas = new InteractiveCanvas(this.previewArea);
```

## SVG Structure
```html
<div class="svg-stack">
    <svg id="outputSvg" viewBox="0 0 200 200" preserveAspectRatio="xMidYMid meet">
        <rect width="100%" height="100%" fill="white"/>
        <g id="content"></g>
    </svg>
</div>
```

## Canvas Sizing
```javascript
updateCanvasSize() {
    const widthMm = document.getElementById('canvasWidthValue').value;
    const heightMm = document.getElementById('canvasHeightValue').value;
    const widthPx = Math.round(widthMm * this.pixelsPerMm);
    const heightPx = Math.round(heightMm * this.pixelsPerMm);
    
    this.width = widthPx;
    this.height = heightPx;

    // Update SVG attributes
    this.svg.setAttribute('viewBox', `0 0 ${widthPx} ${heightPx}`);
    this.svg.setAttribute('width', `${widthMm}mm`);
    this.svg.setAttribute('height', `${heightMm}mm`);
    
    // Position for InteractiveCanvas
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
}
```

## Mouse Coordinates
```javascript
getSVGPoint(e) {
    const transform = this.interactiveCanvas.getTransform();
    const rect = this.previewArea.getBoundingClientRect();
    const x = (e.clientX - rect.left - transform.x) / transform.scale;
    const y = (e.clientY - rect.top - transform.y) / transform.scale;
    return {x, y};
}
```

## Key Rules
- **Never** set `svg.style.width/height` in pixels
- Always use `position: absolute` with `left: 50%; transform: translateX(-50%)`
- Let InteractiveCanvas handle all scaling and transforms
- Use `pixelsPerMm = 4` for consistent scaling across tools