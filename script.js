class PenPlotterConverter {
    constructor() {
        this.originalCanvas = document.createElement('canvas'); // Hidden canvas for processing
        this.outputCanvas = document.getElementById('outputCanvas');
        this.originalCtx = this.originalCanvas.getContext('2d');
        this.outputCtx = this.outputCanvas.getContext('2d');
        this.thumbnail = document.getElementById('imageThumbnail');
        this.imageData = null;
        this.originalImage = null;
        this.svgContent = '';
        this.gcodeLines = []; // Store G-code line commands
        this.pixelsPerMm = 96 / 25.4; // Standard web DPI conversion
        
        this.setupEventListeners();
        this.updateCanvasSize();
    }

    setupEventListeners() {
        // File input
        document.getElementById('imageInput').addEventListener('change', (e) => {
            this.loadImage(e.target.files[0]);
        });

        // Setup number input listeners
        this.setupNumberInput('canvasWidthValue', () => {
            this.updateCanvasSize();
            if (this.originalImage) this.redrawImage();
        });
        this.setupNumberInput('canvasHeightValue', () => {
            this.updateCanvasSize();
            if (this.originalImage) this.redrawImage();
        });
        this.setupNumberInput('penDiameterValue', () => {
            if (this.imageData) this.processImage();
        });
        this.setupNumberInput('lineAngleValue', () => {
            if (this.imageData) this.processImage();
        });
        this.setupNumberInput('sectionWidthValue', () => {
            if (this.imageData) this.processImage();
        });
        this.setupNumberInput('lineSpacingValue', () => {
            if (this.imageData) this.processImage();
        });
        this.setupNumberInput('contrastValue', () => {
            if (this.imageData) this.processImage();
        });
        this.setupNumberInput('feedRateValue', () => {});
        this.setupNumberInput('penDownZValue', () => {});
        this.setupNumberInput('penUpZValue', () => {});


        // Download button
        document.getElementById('downloadBtn').addEventListener('click', () => {
            this.downloadSVG();
        });

        // Download G-code button
        document.getElementById('downloadGcodeBtn').addEventListener('click', () => {
            this.downloadGcode();
        });
    }

    setupNumberInput(inputId, callback) {
        const input = document.getElementById(inputId);
        input.addEventListener('input', callback);
    }


    showStatus(message, type = 'processing') {
        const status = document.getElementById('status');
        status.textContent = message;
        status.className = `status ${type}`;
        status.style.display = 'block';
    }

    updateCanvasSize() {
        const widthMm = parseFloat(document.getElementById('canvasWidthValue').value);
        const heightMm = parseFloat(document.getElementById('canvasHeightValue').value);
        
        // Calculate actual canvas size in pixels (full resolution)
        const widthPx = Math.round(widthMm * this.pixelsPerMm);
        const heightPx = Math.round(heightMm * this.pixelsPerMm);
        
        // Set canvas to full resolution
        this.originalCanvas.width = widthPx;
        this.originalCanvas.height = heightPx;
        this.outputCanvas.width = widthPx;
        this.outputCanvas.height = heightPx;
        
        // Calculate auto-scale to fit preview area
        const previewContainer = this.outputCanvas.parentElement;
        const containerWidth = previewContainer.clientWidth - 40; // Account for padding
        const containerHeight = window.innerHeight - 200; // Account for header and margins
        
        const scaleX = containerWidth / widthPx;
        const scaleY = containerHeight / heightPx;
        const autoScale = Math.min(scaleX, scaleY, 1); // Don't scale up beyond 1x
        
        // Set canvas display size and apply auto-scaling
        this.outputCanvas.style.width = widthPx + 'px';
        this.outputCanvas.style.height = heightPx + 'px';
        this.outputCanvas.style.transform = `scale(${autoScale})`;
        
        // Clear canvases with white background
        this.originalCtx.fillStyle = 'white';
        this.originalCtx.fillRect(0, 0, widthPx, heightPx);
        this.outputCtx.fillStyle = 'white';
        this.outputCtx.fillRect(0, 0, widthPx, heightPx);
    }

    loadImage(file) {
        if (!file) return;

        // Check file type
        if (!file.type.startsWith('image/')) {
            this.showStatus('Please select a valid image file.', 'error');
            return;
        }

        this.showStatus('Loading image...', 'processing');

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
                    this.thumbnail.classList.add('show');
                    
                    // Draw image fitted to current canvas
                    this.redrawImage();
                    
                    this.showStatus('Image loaded successfully!', 'complete');
                } catch (error) {
                    console.error('Error processing image:', error);
                    this.showStatus('Error processing image. Please try another file.', 'error');
                }
            };

            img.onerror = (error) => {
                console.error('Image loading error:', error);
                this.showStatus(`Error loading image: ${file.name}. Please try another file.`, 'error');
            };

            // Load the base64 data
            img.src = e.target.result;
        };

        reader.onerror = (error) => {
            console.error('FileReader error:', error);
            this.showStatus('Error reading file. Please try another image.', 'error');
        };

        // Read the file as base64 data URL
        reader.readAsDataURL(file);
    }

    redrawImage() {
        if (!this.originalImage) return;
        
        const canvasWidth = this.originalCanvas.width;
        const canvasHeight = this.originalCanvas.height;
        
        // Clear canvas with white background
        this.originalCtx.fillStyle = 'white';
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
        this.originalCtx.drawImage(this.originalImage, drawX, drawY, drawWidth, drawHeight);
        
        // Get image data for processing (entire canvas including white areas)
        this.imageData = this.originalCtx.getImageData(0, 0, canvasWidth, canvasHeight);
        
        this.processImage();
    }

    processImage() {
        if (!this.imageData) return;

        this.showStatus('Converting to line art...', 'processing');

        const penDiameter = parseFloat(document.getElementById('penDiameterValue').value);
        const lineAngle = parseInt(document.getElementById('lineAngleValue').value);
        const sectionWidth = parseFloat(document.getElementById('sectionWidthValue').value);
        const contrast = parseFloat(document.getElementById('contrastValue').value);
        const canvasWidthMm = parseFloat(document.getElementById('canvasWidthValue').value);
        const canvasHeightMm = parseFloat(document.getElementById('canvasHeightValue').value);

        // Convert to grayscale intensity map
        const { width, height, data } = this.imageData;
        const intensityMap = new Float32Array(width * height);

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const gray = 0.299 * r + 0.587 * g + 0.114 * b;
            let intensity = 1 - (gray / 255); // Invert so dark areas = high intensity
            
            // Apply contrast adjustment
            intensity = Math.pow(intensity, contrast);
            intensity = Math.max(0, Math.min(1, intensity)); // Clamp between 0 and 1
            
            intensityMap[i / 4] = intensity;
        }

        // Clear output canvas
        this.outputCtx.fillStyle = 'white';
        this.outputCtx.fillRect(0, 0, width, height);
        this.outputCtx.strokeStyle = 'black';
        this.outputCtx.lineWidth = 1;

        // Generate proper SVG header with all required attributes
        this.svgContent = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg width="${canvasWidthMm}mm" height="${canvasHeightMm}mm" 
     viewBox="0 0 ${width} ${height}" 
     version="1.1" 
     xmlns="http://www.w3.org/2000/svg" 
     xmlns:xlink="http://www.w3.org/1999/xlink">
  <defs/>
  <g id="pen-plotter-lines" stroke="black" fill="none" stroke-linecap="round" stroke-linejoin="round">
`;

        // Clear G-code lines array
        this.gcodeLines = [];

        // Convert angle to radians
        const angleRad = (lineAngle * Math.PI) / 180;
        const dx = Math.cos(angleRad);
        const dy = Math.sin(angleRad);

        // Calculate section spacing in pixels
        const sectionSpacing = sectionWidth * this.pixelsPerMm;

        // Generate lines perpendicular to the main angle
        const perpAngle = angleRad + Math.PI / 2;
        const perpDx = Math.cos(perpAngle);
        const perpDy = Math.sin(perpAngle);

        // Calculate how many sections we need
        const diagonal = Math.sqrt(width * width + height * height);
        const numSections = Math.ceil(diagonal / sectionSpacing) * 2;

        for (let section = 0; section < numSections; section++) {
            // Calculate the center line for this section
            const offset = (section - numSections / 2) * sectionSpacing;
            const centerX = width / 2 + perpDx * offset;
            const centerY = height / 2 + perpDy * offset;

            // Find the line segment within the image bounds
            const linePoints = this.clipLineToCanvas(
                centerX, centerY, dx, dy, width, height
            );

            if (linePoints.length === 2) {
                const [start, end] = linePoints;
                this.drawOptimizedVariableThicknessLine(
                    start.x, start.y, end.x, end.y,
                    intensityMap, width, height, penDiameter
                );
            }
        }

        this.svgContent += `  </g>
</svg>`;
        document.getElementById('downloadBtn').disabled = false;
        document.getElementById('downloadGcodeBtn').disabled = false;
        this.showStatus('Conversion complete!', 'complete');
    }

    clipLineToCanvas(centerX, centerY, dx, dy, width, height) {
        const points = [];
        const edges = [
            { x: 0, y: 0, nx: 1, ny: 0 }, // Left edge
            { x: width, y: 0, nx: -1, ny: 0 }, // Right edge
            { x: 0, y: 0, nx: 0, ny: 1 }, // Top edge
            { x: 0, y: height, nx: 0, ny: -1 } // Bottom edge
        ];

        edges.forEach(edge => {
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
        edges.forEach(edge => {
            if ((Math.abs(dx) > Math.abs(dy) && edge.ny !== 0) ||
                (Math.abs(dx) <= Math.abs(dy) && edge.nx !== 0)) {
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
        const uniquePoints = points.filter((point, index, arr) => 
            index === arr.findIndex(p => 
                Math.abs(p.x - point.x) < 0.1 && Math.abs(p.y - point.y) < 0.1
            )
        );

        uniquePoints.sort((a, b) => a.t - b.t);
        return uniquePoints.slice(0, 2);
    }

    drawOptimizedVariableThicknessLine(x1, y1, x2, y2, intensityMap, width, height, penDiameter) {
        const length = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
        const steps = Math.ceil(length / 2);
        
        // Sample intensity along the entire line first
        const intensities = [];
        for (let i = 0; i < steps; i++) {
            const t = i / (steps - 1);
            const x = x1 + (x2 - x1) * t;
            const y = y1 + (y2 - y1) * t;
            const intensity = this.sampleIntensity(x, y, intensityMap, width, height);
            intensities.push({ x, y, intensity, t });
        }

        // Group consecutive points with same line count, but extend groups to eliminate gaps
        const lineGroups = [];
        let currentGroup = null;

        intensities.forEach((point, index) => {
            const lineCount = Math.ceil(5 * point.intensity);
            
            if (!currentGroup || currentGroup.lineCount !== lineCount) {
                // Start new group
                if (currentGroup && currentGroup.points.length > 0) {
                    lineGroups.push(currentGroup);
                }
                currentGroup = {
                    lineCount,
                    points: [point],
                    startT: point.t,
                    endT: point.t
                };
            } else {
                // Add to current group
                currentGroup.points.push(point);
                currentGroup.endT = point.t;
            }
        });

        // Don't forget the last group
        if (currentGroup && currentGroup.points.length > 0) {
            lineGroups.push(currentGroup);
        }

        // Extend groups to connect seamlessly (eliminate gaps)
        for (let i = 0; i < lineGroups.length - 1; i++) {
            const currentGroupEnd = lineGroups[i].endT;
            const nextGroupStart = lineGroups[i + 1].startT;
            
            // If there's a gap, extend current group to meet next group
            if (nextGroupStart > currentGroupEnd) {
                lineGroups[i].endT = nextGroupStart;
            }
        }

        // Draw each group as straight continuous lines
        const penWidthPx = penDiameter * this.pixelsPerMm;
        const dx = x2 - x1;
        const dy = y2 - y1;
        const lineLength = Math.sqrt(dx * dx + dy * dy);
        const perpX = -dy / lineLength;
        const perpY = dx / lineLength;
        
        // Use user-defined line spacing instead of pen diameter calculation
        const userLineSpacing = parseFloat(document.getElementById('lineSpacingValue').value);
        const lineSpacingPx = userLineSpacing * this.pixelsPerMm;

        lineGroups.forEach(group => {
            if (group.lineCount === 0) return;

            // Calculate start and end points for this group (straight line segment)
            const startX = x1 + dx * group.startT;
            const startY = y1 + dy * group.startT;
            const endX = x1 + dx * group.endT;
            const endY = y1 + dy * group.endT;

            // Draw multiple parallel straight lines for this group
            // First line is always at center (offset = 0), then alternate top/bottom
            for (let line = 0; line < group.lineCount; line++) {
                let offset;
                if (line === 0) {
                    // First segment always at center
                    offset = 0;
                } else {
                    // Alternate between positive (top) and negative (bottom) offsets
                    const segmentIndex = Math.ceil(line / 2);
                    const isTop = line % 2 === 1;
                    offset = isTop ? segmentIndex * lineSpacingPx : -segmentIndex * lineSpacingPx;
                }
                
                const lineStartX = startX + perpX * offset;
                const lineStartY = startY + perpY * offset;
                const lineEndX = endX + perpX * offset;
                const lineEndY = endY + perpY * offset;

                // Draw on canvas
                this.outputCtx.lineWidth = penWidthPx;
                this.outputCtx.beginPath();
                this.outputCtx.moveTo(lineStartX, lineStartY);
                this.outputCtx.lineTo(lineEndX, lineEndY);
                this.outputCtx.stroke();

                // Add straight line to SVG with proper formatting
                this.svgContent += `    <line x1="${lineStartX.toFixed(3)}" y1="${lineStartY.toFixed(3)}" x2="${lineEndX.toFixed(3)}" y2="${lineEndY.toFixed(3)}" stroke-width="${penWidthPx.toFixed(3)}"/>
`;

                // Add line to G-code (convert pixels to mm)
                const gcodeX1 = (lineStartX / this.pixelsPerMm).toFixed(3);
                const gcodeY1 = (lineStartY / this.pixelsPerMm).toFixed(3);
                const gcodeX2 = (lineEndX / this.pixelsPerMm).toFixed(3);
                const gcodeY2 = (lineEndY / this.pixelsPerMm).toFixed(3);
                
                this.gcodeLines.push({
                    x1: parseFloat(gcodeX1),
                    y1: parseFloat(gcodeY1),
                    x2: parseFloat(gcodeX2),
                    y2: parseFloat(gcodeY2)
                });
            }
        });
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
        if (!this.svgContent) return;

        const blob = new Blob([this.svgContent], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'pen-plotter-output.svg';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    downloadGcode() {
        if (this.gcodeLines.length === 0) return;

        const feedRate = parseInt(document.getElementById('feedRateValue').value);
        const penDownZ = parseFloat(document.getElementById('penDownZValue').value);
        const penUpZ = parseFloat(document.getElementById('penUpZValue').value);

        let gcode = '';
        
        // G-code header
        gcode += '; Generated by Pen Plotter Converter\n';
        gcode += '; Image to G-code conversion\n';
        gcode += `; Feed rate: ${feedRate} mm/min\n`;
        gcode += `; Pen down Z: ${penDownZ} mm\n`;
        gcode += `; Pen up Z: ${penUpZ} mm\n`;
        gcode += '\n';
        
        // Initialize
        gcode += 'G21 ; Set units to millimeters\n';
        gcode += 'G90 ; Absolute positioning\n';
        gcode += 'G94 ; Feed rate per minute\n';
        gcode += `F${feedRate} ; Set feed rate\n`;
        gcode += `G0 Z${penUpZ} ; Pen up\n`;
        gcode += 'G0 X0 Y0 ; Move to origin\n';
        gcode += '\n';

        let currentX = 0;
        let currentY = 0;
        let penIsDown = false;

        // Process each line
        this.gcodeLines.forEach((line) => {
            // Move to start position if needed
            if (currentX !== line.x1 || currentY !== line.y1) {
                if (penIsDown) {
                    gcode += `G0 Z${penUpZ} ; Pen up\n`;
                    penIsDown = false;
                }
                gcode += `G0 X${line.x1} Y${line.y1} ; Move to start\n`;
                currentX = line.x1;
                currentY = line.y1;
            }

            // Pen down and draw line
            if (!penIsDown) {
                gcode += `G1 Z${penDownZ} ; Pen down\n`;
                penIsDown = true;
            }
            
            gcode += `G1 X${line.x2} Y${line.y2} ; Draw line\n`;
            currentX = line.x2;
            currentY = line.y2;
        });

        // Footer
        gcode += '\n';
        gcode += `G0 Z${penUpZ} ; Pen up\n`;
        gcode += 'G0 X0 Y0 ; Return to origin\n';
        gcode += 'M30 ; Program end\n';

        // Download file
        const blob = new Blob([gcode], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'pen-plotter-output.gcode';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}

// Initialize the converter when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new PenPlotterConverter();
});