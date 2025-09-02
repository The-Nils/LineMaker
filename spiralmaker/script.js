class SpiralMaker {
  constructor() {
    this.originalCanvas = document.createElement("canvas"); // Hidden canvas for processing
    this.originalCtx = this.originalCanvas.getContext("2d");
    this.thumbnail = document.getElementById("imageThumbnail");
    this.imageData = null;
    this.originalImage = null;
    this.pixelsPerMm = 96 / 25.4; // Standard web DPI conversion

    this.outputSvg = document.getElementById("outputSvg");
    this.linesGroup = document.getElementById("pen-plotter-lines");
    this.svgContent = "";
    this.gcodeLines = [];

    // Processing state
    this.isProcessing = false;
    this.processingCancelled = false;

    this.setupEventListeners();
    this.updateSvgSize();
  }

  setupEventListeners() {
    // File input
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
      this.cancelProcessing();
      if (this.imageData) this.processImage();
    });
    this.setupNumberInput("spiralCountValue", () => {
      this.cancelProcessing();
      if (this.imageData) this.processImage();
    });
    this.setupNumberInput("turnsValue", () => {
      this.cancelProcessing();
      if (this.imageData) this.processImage();
    });
    this.setupNumberInput("spiralSpacingValue", () => {
      this.cancelProcessing();
      if (this.imageData) this.processImage();
    });
    this.setupNumberInput("maxDisplacementValue", () => {
      this.cancelProcessing();
      if (this.imageData) this.processImage();
    });
    this.setupNumberInput("displacementPowerValue", () => {
      this.cancelProcessing();
      if (this.imageData) this.processImage();
    });
    this.setupNumberInput("midtoneCenterValue", () => {
      this.cancelProcessing();
      if (this.imageData) this.processImage();
    });
    this.setupNumberInput("curveStrengthValue", () => {
      this.cancelProcessing();
      if (this.imageData) this.processImage();
    });
    this.setupNumberInput("minDisplacementValue", () => {
      this.cancelProcessing();
      if (this.imageData) this.processImage();
    });
    this.setupNumberInput("sensitivityValue", () => {
      this.cancelProcessing();
      if (this.imageData) this.processImage();
    });
    this.setupNumberInput("viewingAngleValue", () => {
      this.cancelProcessing();
      if (this.imageData) this.processImage();
    });
    this.setupNumberInput("lightDirectionValue", () => {
      this.cancelProcessing();
      if (this.imageData) this.processImage();
    });
    this.setupNumberInput("surfaceHeightValue", () => {
      this.cancelProcessing();
      if (this.imageData) this.processImage();
    });
    this.setupNumberInput("baseResolutionValue", () => {
      this.cancelProcessing();
      if (this.imageData) this.processImage();
    });
    this.setupNumberInput("resolutionMultiplierValue", () => {
      this.cancelProcessing();
      if (this.imageData) this.processImage();
    });
    this.setupNumberInput("darknessThresholdValue", () => {
      this.cancelProcessing();
      if (this.imageData) this.processImage();
    });
    this.setupNumberInput("smoothingFactorValue", () => {
      this.cancelProcessing();
      if (this.imageData) this.processImage();
    });
    this.setupNumberInput("curveSegmentsValue", () => {
      this.cancelProcessing();
      if (this.imageData) this.processImage();
    });
    this.setupNumberInput("feedRateValue", () => {});
    this.setupNumberInput("penDownZValue", () => {});
    this.setupNumberInput("penUpZValue", () => {});

    // Smoothing checkbox
    document.getElementById("enableSmoothing").addEventListener("change", () => {
      this.cancelProcessing();
      if (this.imageData) this.processImage();
    });

    // Spiral type dropdown
    document.getElementById("spiralType").addEventListener("change", () => {
      this.cancelProcessing();
      if (this.imageData) this.processImage();
    });

    // Displacement mode dropdown
    document.getElementById("displacementMode").addEventListener("change", () => {
      this.cancelProcessing();
      if (this.imageData) this.processImage();
    });

    // Curve type dropdown
    document.getElementById("curveType").addEventListener("change", () => {
      this.cancelProcessing();
      if (this.imageData) this.processImage();
    });

    // Setup zoom controls
    this.syncInputs("canvasZoom", "canvasZoomValue");
    this.setupNumberInput("canvasZoomValue", () => {
      this.updateSvgZoom();
    });

    // Download buttons
    document.getElementById("downloadBtn").addEventListener("click", () => {
      this.downloadSVG();
    });

    document.getElementById("downloadGcodeBtn").addEventListener("click", () => {
      this.downloadGcode();
    });
  }

  setupNumberInput(inputId, callback) {
    const input = document.getElementById(inputId);
    input.addEventListener("input", callback);
  }

  syncInputs(sliderId, numberId) {
    const slider = document.getElementById(sliderId);
    const number = document.getElementById(numberId);

    slider.addEventListener("input", () => {
      number.value = slider.value;
      this.updateSvgZoom();
    });

    number.addEventListener("input", () => {
      slider.value = number.value;
      this.updateSvgZoom();
    });
  }

  showStatus(message, type = "processing") {
    const status = document.getElementById("status");
    status.textContent = message;
    status.className = `status ${type}`;
    status.style.display = "block";
  }

  updateSvgSize() {
    const widthMm = parseFloat(document.getElementById("canvasWidthValue").value);
    const heightMm = parseFloat(document.getElementById("canvasHeightValue").value);

    // Calculate actual canvas size in pixels (full resolution)
    const widthPx = Math.round(widthMm * this.pixelsPerMm);
    const heightPx = Math.round(heightMm * this.pixelsPerMm);

    // Set canvas to full resolution for image processing
    this.originalCanvas.width = widthPx;
    this.originalCanvas.height = heightPx;

    // Update SVG
    this.outputSvg.setAttribute("viewBox", `0 0 ${widthPx} ${heightPx}`);
    this.outputSvg.setAttribute("width", widthMm + "mm");
    this.outputSvg.setAttribute("height", heightMm + "mm");
    this.outputSvg.style.width = widthPx + "px";
    this.outputSvg.style.height = heightPx + "px";
    
    // Clear SVG lines
    this.linesGroup.innerHTML = "";

    // Apply zoom
    this.updateSvgZoom();

    // Clear canvas with white background for image processing
    this.originalCtx.fillStyle = "white";
    this.originalCtx.fillRect(0, 0, widthPx, heightPx);
  }

  updateSvgZoom() {
    if (!this.outputSvg || !this.outputSvg.parentElement) return;

    // Get current zoom value
    const zoom = parseFloat(document.getElementById("canvasZoomValue").value) || 1;

    // Calculate auto-fit scale to prevent SVG from being too big by default
    const previewContainer = this.outputSvg.parentElement.parentElement; // svg-stack -> preview-area
    const containerWidth = previewContainer.clientWidth - 40;
    const containerHeight = previewContainer.clientHeight - 40;

    // Make sure container has dimensions
    if (containerWidth <= 0 || containerHeight <= 0) {
      // Retry after a short delay if container isn't ready
      setTimeout(() => this.updateSvgZoom(), 100);
      return;
    }

    const svgWidth = parseInt(this.outputSvg.style.width) || 200;
    const svgHeight = parseInt(this.outputSvg.style.height) || 200;

    // Make sure SVG has dimensions
    if (svgWidth <= 0 || svgHeight <= 0) return;

    const scaleX = containerWidth / svgWidth;
    const scaleY = containerHeight / svgHeight;
    const autoFitScale = Math.min(scaleX, scaleY, 1); // Don't scale up beyond 1x

    // Apply both auto-fit and user zoom
    const finalScale = autoFitScale * zoom;
    this.outputSvg.style.transformOrigin = "center center";
    this.outputSvg.style.transform = `translateX(-50%) scale(${finalScale})`;
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

          // Draw image fitted to current canvas
          this.redrawImage();

          this.showStatus("Image loaded successfully!", "complete");
        } catch (error) {
          console.error("Error processing image:", error);
          this.showStatus("Error processing image. Please try another file.", "error");
        }
      };

      img.onerror = (error) => {
        console.error("Image loading error:", error);
        this.showStatus(`Error loading image: ${file.name}. Please try another file.`, "error");
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
    this.imageData = this.originalCtx.getImageData(0, 0, canvasWidth, canvasHeight);

    this.processImage();
  }

  async processImage() {
    if (!this.imageData || this.isProcessing) return;

    this.isProcessing = true;
    this.processingCancelled = false;
    this.showProgress("Generating spirals...");
    this.showStatus("Converting to spiral art...", "processing");

    try {
      // Clear previous results
      this.linesGroup.innerHTML = "";
      this.gcodeLines = [];

      const canvasWidthMm = parseFloat(document.getElementById("canvasWidthValue").value);
      const canvasHeightMm = parseFloat(document.getElementById("canvasHeightValue").value);

      // Create intensity map from image (using K channel like in hatchmaker)
      const intensityMap = this.createIntensityMap(this.imageData.data, this.imageData.width, this.imageData.height);

      // Generate SVG header
      this.svgContent = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg width="${canvasWidthMm}mm" height="${canvasHeightMm}mm" 
     viewBox="0 0 ${this.imageData.width} ${this.imageData.height}" 
     version="1.1" 
     xmlns="http://www.w3.org/2000/svg" 
     xmlns:xlink="http://www.w3.org/1999/xlink">
  <defs/>
  <g id="pen-plotter-lines" stroke="black" fill="none" stroke-linecap="round" stroke-linejoin="round">
`;

      // Generate spirals with displacement
      await this.generateSpiralsWithDisplacement(intensityMap, this.imageData.width, this.imageData.height);

      this.svgContent += `  </g>
</svg>`;

      if (!this.processingCancelled) {
        // Update segment count display
        document.getElementById("segmentCount").textContent = this.gcodeLines.length.toLocaleString();

        // Enable download buttons
        document.getElementById("downloadBtn").disabled = false;
        document.getElementById("downloadGcodeBtn").disabled = false;

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

  createIntensityMap(data, width, height) {
    const intensityMap = new Float32Array(width * height);

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i] / 255;
      const g = data[i + 1] / 255;
      const b = data[i + 2] / 255;

      // Convert RGB to grayscale (K channel equivalent)
      const k = 1 - Math.max(r, g, b);
      
      intensityMap[i / 4] = k;
    }

    return intensityMap;
  }

  async generateSpiralsWithDisplacement(intensityMap, width, height) {
    const spiralCount = parseInt(document.getElementById("spiralCountValue").value);
    const turns = parseFloat(document.getElementById("turnsValue").value);
    const spiralSpacing = parseFloat(document.getElementById("spiralSpacingValue").value);
    const maxDisplacementMm = parseFloat(document.getElementById("maxDisplacementValue").value);
    const displacementPower = parseFloat(document.getElementById("displacementPowerValue").value);
    const spiralType = document.getElementById("spiralType").value;
    const penDiameter = parseFloat(document.getElementById("penDiameterValue").value);
    const baseResolution = parseInt(document.getElementById("baseResolutionValue").value);
    const resolutionMultiplier = parseFloat(document.getElementById("resolutionMultiplierValue").value);
    const darknessThreshold = parseFloat(document.getElementById("darknessThresholdValue").value);
    const enableSmoothing = document.getElementById("enableSmoothing").checked;

    const centerX = width / 2;
    const centerY = height / 2;
    const maxDisplacementPx = maxDisplacementMm * this.pixelsPerMm;
    const spiralSpacingPx = spiralSpacing * this.pixelsPerMm;
    const penWidthPx = penDiameter * this.pixelsPerMm;

    for (let spiralIndex = 0; spiralIndex < spiralCount; spiralIndex++) {
      if (this.processingCancelled) break;
      
      this.updateProgress(`Processing spiral ${spiralIndex + 1}/${spiralCount}`);

      const spiralOffset = (spiralIndex - (spiralCount - 1) / 2) * spiralSpacingPx;
      
      // Generate spiral points with dynamic resolution
      const points = await this.generateDynamicResolutionSpiral(
        turns, spiralType, centerX, centerY, spiralOffset, spiralSpacingPx,
        intensityMap, width, height, maxDisplacementPx, displacementPower,
        baseResolution, resolutionMultiplier, darknessThreshold
      );

      // Apply smoothing if enabled
      let processedPoints = points;
      if (enableSmoothing && points.length > 2) {
        processedPoints = this.applySmoothingToPoints(points);
      }

      // Convert points to curves or line segments and add to SVG
      if (processedPoints.length > 1) {
        if (enableSmoothing) {
          this.addSmoothSpiralToSVG(processedPoints, penWidthPx);
        } else {
          this.addSpiralToSVG(processedPoints, penWidthPx);
        }
      }
    }
  }

  async generateDynamicResolutionSpiral(turns, spiralType, centerX, centerY, spiralOffset, spiralSpacingPx,
                                        intensityMap, width, height, maxDisplacementPx, displacementPower,
                                        baseResolution, resolutionMultiplier, darknessThreshold) {
    const points = [];
    const totalAngle = turns * 2 * Math.PI;
    const displacementMode = document.getElementById("displacementMode").value;
    const minDisplacementPx = parseFloat(document.getElementById("minDisplacementValue").value) * this.pixelsPerMm;
    const sensitivity = parseFloat(document.getElementById("sensitivityValue").value);
    
    // Start with base resolution
    let currentAngle = 0;
    let previousIntensity = 0;
    
    while (currentAngle <= totalAngle) {
      let radius;
      
      if (spiralType === "archimedean") {
        // Archimedean spiral: r = a * t
        radius = (currentAngle / (2 * Math.PI)) * spiralSpacingPx + spiralSpacingPx;
      } else {
        // Logarithmic spiral: r = a * e^(b*t)
        const a = spiralSpacingPx / 4;
        const b = 0.2;
        radius = a * Math.exp(b * currentAngle);
      }

      // Base spiral position
      let x = centerX + radius * Math.cos(currentAngle);
      let y = centerY + radius * Math.sin(currentAngle) + spiralOffset;

      // Check bounds before sampling intensity
      if (x >= 0 && x < width && y >= 0 && y < height) {
        // Sample intensity at this position
        const intensity = this.sampleIntensity(x, y, intensityMap, width, height);
        
        // Calculate displacement based on selected mode
        const displacement = this.calculateDisplacement(
          x, y, intensity, centerX, centerY, intensityMap, width, height,
          minDisplacementPx, maxDisplacementPx, displacementPower, sensitivity, displacementMode
        );
        
        // Apply displacement
        x += displacement.x;
        y += displacement.y;

        points.push({ x, y, intensity, angle: currentAngle });
        
        // Calculate dynamic step size based on intensity change
        const intensityChange = Math.abs(intensity - previousIntensity);
        let dynamicResolution = baseResolution;
        
        // Increase resolution in areas with significant darkness changes
        if (intensityChange > darknessThreshold) {
          dynamicResolution = Math.min(baseResolution * resolutionMultiplier, 200);
        }
        
        // Convert resolution to angular step size
        const stepSize = (2 * Math.PI) / dynamicResolution;
        currentAngle += stepSize;
        previousIntensity = intensity;
      } else {
        // If out of bounds, use base resolution step
        const stepSize = (2 * Math.PI) / baseResolution;
        currentAngle += stepSize;
      }

      // Yield control periodically
      if (points.length % 50 === 0) {
        await this.yield();
      }
    }

    return points;
  }

  calculateDisplacement(x, y, intensity, centerX, centerY, intensityMap, width, height,
                       minDisplacementPx, maxDisplacementPx, displacementPower, sensitivity, mode) {
    
    switch (mode) {
      case "surface3d":
        return this.get3DSurfaceDisplacement(x, y, intensity, centerX, centerY, intensityMap, width, height,
                                           minDisplacementPx, maxDisplacementPx, displacementPower, sensitivity);
      
      case "radial":
        const enhancedIntensity = Math.pow(intensity * sensitivity, displacementPower);
        const displacementMagnitude = minDisplacementPx + (enhancedIntensity * (maxDisplacementPx - minDisplacementPx));
        return this.getRadialDisplacement(x, y, centerX, centerY, displacementMagnitude);
      
      case "gradient":
        const enhancedIntensity2 = Math.pow(intensity * sensitivity, displacementPower);
        const displacementMagnitude2 = minDisplacementPx + (enhancedIntensity2 * (maxDisplacementPx - minDisplacementPx));
        return this.getGradientDisplacement(x, y, intensityMap, width, height, displacementMagnitude2);
      
      case "normal":
        const enhancedIntensity3 = Math.pow(intensity * sensitivity, displacementPower);
        const displacementMagnitude3 = minDisplacementPx + (enhancedIntensity3 * (maxDisplacementPx - minDisplacementPx));
        return this.getNormalDisplacement(x, y, intensityMap, width, height, displacementMagnitude3);
      
      case "mixed":
        const enhancedIntensity4 = Math.pow(intensity * sensitivity, displacementPower);
        const displacementMagnitude4 = minDisplacementPx + (enhancedIntensity4 * (maxDisplacementPx - minDisplacementPx));
        const radial = this.getRadialDisplacement(x, y, centerX, centerY, displacementMagnitude4 * 0.5);
        const gradient = this.getGradientDisplacement(x, y, intensityMap, width, height, displacementMagnitude4 * 0.5);
        return { x: radial.x + gradient.x, y: radial.y + gradient.y };
      
      default:
        return { x: 0, y: 0 };
    }
  }

  get3DSurfaceDisplacement(x, y, intensity, centerX, centerY, intensityMap, width, height,
                          minDisplacementPx, maxDisplacementPx, displacementPower, sensitivity) {
    // Get 3D projection parameters
    const viewingAngle = parseFloat(document.getElementById("viewingAngleValue").value);
    const lightDirection = parseFloat(document.getElementById("lightDirectionValue").value);
    const surfaceHeight = parseFloat(document.getElementById("surfaceHeightValue").value);
    
    // Convert viewing angle to radians
    const viewAngleRad = (viewingAngle * Math.PI) / 180;
    const lightAngleRad = (lightDirection * Math.PI) / 180;
    
    // Apply the displacement curve to get proper 3D surface feeling
    const processedIntensity = this.applyDisplacementCurve(intensity, sensitivity, displacementPower);
    
    const surfaceHeightPx = (surfaceHeight * this.pixelsPerMm);
    const zHeight = processedIntensity * surfaceHeightPx;
    
    // Calculate surface normal (gradient)
    const gradient = this.calculateGradient(x, y, intensityMap, width, height);
    
    // Create surface normal vector (gradient points in steepest ascent direction)
    const surfaceNormal = {
      x: gradient.x,
      y: gradient.y,
      z: 1.0 // Base normal pointing up
    };
    
    // Normalize the surface normal
    const normalMagnitude = Math.sqrt(
      surfaceNormal.x * surfaceNormal.x + 
      surfaceNormal.y * surfaceNormal.y + 
      surfaceNormal.z * surfaceNormal.z
    );
    
    if (normalMagnitude > 0) {
      surfaceNormal.x /= normalMagnitude;
      surfaceNormal.y /= normalMagnitude;
      surfaceNormal.z /= normalMagnitude;
    }
    
    // Calculate how the surface appears when viewed from the viewing angle
    // This simulates projecting a 3D surface onto a 2D plane
    
    // 1. Calculate the apparent displacement due to viewing angle
    const viewingDisplacement = zHeight * Math.sin(viewAngleRad);
    
    // 2. Calculate the direction based on the surface normal and viewing angle
    // The surface slopes will appear displaced in different directions
    const slopeDisplacementX = surfaceNormal.x * viewingDisplacement;
    const slopeDisplacementY = surfaceNormal.y * viewingDisplacement;
    
    // 3. Add perspective foreshortening effect
    const perspectiveFactor = Math.cos(viewAngleRad);
    const perspectiveDisplacementX = slopeDisplacementX * perspectiveFactor;
    const perspectiveDisplacementY = slopeDisplacementY * perspectiveFactor;
    
    // 4. Add lighting-based displacement for depth perception
    const lightX = Math.cos(lightAngleRad);
    const lightY = Math.sin(lightAngleRad);
    
    // Calculate how much the surface faces the light
    const lightDotNormal = (surfaceNormal.x * lightX + surfaceNormal.y * lightY + surfaceNormal.z * 0.5);
    const lightingFactor = Math.max(0, lightDotNormal);
    
    // Shadows and highlights create additional apparent displacement
    const lightingDisplacementX = lightX * lightingFactor * zHeight * 0.3;
    const lightingDisplacementY = lightY * lightingFactor * zHeight * 0.3;
    
    // 5. Combine all displacement factors
    const totalDisplacementX = perspectiveDisplacementX + lightingDisplacementX;
    const totalDisplacementY = perspectiveDisplacementY + lightingDisplacementY;
    
    // 6. Add minimum displacement to ensure visibility
    const minDisp = minDisplacementPx;
    const displacementMagnitude = Math.sqrt(totalDisplacementX * totalDisplacementX + totalDisplacementY * totalDisplacementY);
    
    if (displacementMagnitude > 0) {
      const scaleFactor = Math.max(minDisp, displacementMagnitude) / displacementMagnitude;
      return {
        x: totalDisplacementX * scaleFactor,
        y: totalDisplacementY * scaleFactor
      };
    }
    
    // Fallback: small displacement based on intensity
    const fallbackDisp = minDisp + (processedIntensity * (maxDisplacementPx - minDisp));
    return {
      x: Math.cos(lightAngleRad) * fallbackDisp,
      y: Math.sin(lightAngleRad) * fallbackDisp
    };
  }

  applyDisplacementCurve(intensity, sensitivity, displacementPower) {
    const curveType = document.getElementById("curveType").value;
    const midtoneCenter = parseFloat(document.getElementById("midtoneCenterValue").value);
    const curveStrength = parseFloat(document.getElementById("curveStrengthValue").value);
    
    // Apply sensitivity first
    let processedIntensity = intensity * sensitivity;
    
    // Clamp to 0-1 range
    processedIntensity = Math.max(0, Math.min(1, processedIntensity));
    
    switch (curveType) {
      case "inverted":
        // Inverted curve: dark areas have less displacement, light areas more
        // Good for heightmaps where white = high, black = low
        processedIntensity = 1.0 - processedIntensity;
        processedIntensity = Math.pow(processedIntensity, displacementPower);
        return processedIntensity;
      
      case "midtone":
        // Bell curve centered around midtone - emphasizes mid-range values
        // Perfect for surface details where mid-grays represent the main surface
        const distanceFromCenter = Math.abs(processedIntensity - midtoneCenter);
        const normalizedDistance = distanceFromCenter / Math.max(midtoneCenter, 1.0 - midtoneCenter);
        const bellCurve = Math.exp(-Math.pow(normalizedDistance * curveStrength, 2));
        processedIntensity = bellCurve;
        processedIntensity = Math.pow(processedIntensity, displacementPower);
        return processedIntensity;
      
      case "linear":
        // Linear response - no curve modification
        return processedIntensity;
      
      case "normal":
        // Standard power curve (original behavior)
        processedIntensity = Math.pow(processedIntensity, displacementPower);
        return processedIntensity;
      
      default:
        return processedIntensity;
    }
  }

  getRadialDisplacement(x, y, centerX, centerY, magnitude) {
    // Original radial displacement from center
    const directionX = x - centerX;
    const directionY = y - centerY;
    const directionLength = Math.sqrt(directionX * directionX + directionY * directionY);
    
    if (directionLength > 0) {
      const normalizedDirX = directionX / directionLength;
      const normalizedDirY = directionY / directionLength;
      
      return {
        x: normalizedDirX * magnitude,
        y: normalizedDirY * magnitude
      };
    }
    return { x: 0, y: 0 };
  }

  getGradientDisplacement(x, y, intensityMap, width, height, magnitude) {
    // Calculate gradient (steepest intensity change direction)
    const gradient = this.calculateGradient(x, y, intensityMap, width, height);
    const gradientMagnitude = Math.sqrt(gradient.x * gradient.x + gradient.y * gradient.y);
    
    if (gradientMagnitude > 0.01) { // Avoid division by zero
      return {
        x: (gradient.x / gradientMagnitude) * magnitude,
        y: (gradient.y / gradientMagnitude) * magnitude
      };
    }
    return { x: 0, y: 0 };
  }

  getNormalDisplacement(x, y, intensityMap, width, height, magnitude) {
    // Calculate gradient and use perpendicular direction (normal)
    const gradient = this.calculateGradient(x, y, intensityMap, width, height);
    const gradientMagnitude = Math.sqrt(gradient.x * gradient.x + gradient.y * gradient.y);
    
    if (gradientMagnitude > 0.01) {
      // Perpendicular to gradient
      const normalX = -gradient.y / gradientMagnitude;
      const normalY = gradient.x / gradientMagnitude;
      
      return {
        x: normalX * magnitude,
        y: normalY * magnitude
      };
    }
    return { x: 0, y: 0 };
  }

  calculateGradient(x, y, intensityMap, width, height) {
    const radius = 2; // Sample radius for gradient calculation
    
    // Sample intensities in a small neighborhood
    const samples = [];
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const sx = Math.round(x + dx);
        const sy = Math.round(y + dy);
        
        if (sx >= 0 && sx < width && sy >= 0 && sy < height) {
          samples.push({
            x: dx,
            y: dy,
            intensity: intensityMap[sy * width + sx]
          });
        }
      }
    }
    
    if (samples.length < 4) return { x: 0, y: 0 };
    
    // Calculate gradient using Sobel-like operators
    let gradX = 0;
    let gradY = 0;
    let count = 0;
    
    for (const sample of samples) {
      if (Math.abs(sample.x) <= 1 && Math.abs(sample.y) <= 1) {
        gradX += sample.intensity * sample.x;
        gradY += sample.intensity * sample.y;
        count++;
      }
    }
    
    if (count > 0) {
      return {
        x: gradX / count,
        y: gradY / count
      };
    }
    
    return { x: 0, y: 0 };
  }

  applySmoothingToPoints(points) {
    if (points.length < 3) return points;
    
    const smoothingFactor = parseFloat(document.getElementById("smoothingFactorValue").value);
    const smoothedPoints = [points[0]]; // Keep first point unchanged
    
    // Apply smoothing using weighted average
    for (let i = 1; i < points.length - 1; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const next = points[i + 1];
      
      // Calculate smoothed position
      const smoothedX = curr.x * (1 - smoothingFactor) + 
                       (prev.x + next.x) * smoothingFactor / 2;
      const smoothedY = curr.y * (1 - smoothingFactor) + 
                       (prev.y + next.y) * smoothingFactor / 2;
      
      smoothedPoints.push({
        x: smoothedX,
        y: smoothedY,
        intensity: curr.intensity,
        angle: curr.angle
      });
    }
    
    smoothedPoints.push(points[points.length - 1]); // Keep last point unchanged
    return smoothedPoints;
  }

  addSpiralToSVG(points, penWidthPx) {
    // Create line segments from points
    for (let i = 0; i < points.length - 1; i++) {
      const point1 = points[i];
      const point2 = points[i + 1];

      // Validate coordinates before adding to SVG
      const x1 = isFinite(point1.x) ? point1.x.toFixed(3) : "0";
      const y1 = isFinite(point1.y) ? point1.y.toFixed(3) : "0";
      const x2 = isFinite(point2.x) ? point2.x.toFixed(3) : "0";
      const y2 = isFinite(point2.y) ? point2.y.toFixed(3) : "0";
      const strokeWidth = isFinite(penWidthPx) ? penWidthPx.toFixed(3) : "1";

      // Only add if line has non-zero length
      if (
        Math.abs(parseFloat(x2) - parseFloat(x1)) > 0.001 ||
        Math.abs(parseFloat(y2) - parseFloat(y1)) > 0.001
      ) {
        // Add to SVG content string
        this.svgContent += `    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke-width="${strokeWidth}"/>
`;
        
        // Draw directly to SVG DOM
        const lineElement = document.createElementNS("http://www.w3.org/2000/svg", "line");
        lineElement.setAttribute("x1", x1);
        lineElement.setAttribute("y1", y1);
        lineElement.setAttribute("x2", x2);
        lineElement.setAttribute("y2", y2);
        lineElement.setAttribute("stroke-width", strokeWidth);
        this.linesGroup.appendChild(lineElement);

        // Add to G-code
        const gcodeX1 = parseFloat(x1) / this.pixelsPerMm;
        const gcodeY1 = parseFloat(y1) / this.pixelsPerMm;
        const gcodeX2 = parseFloat(x2) / this.pixelsPerMm;
        const gcodeY2 = parseFloat(y2) / this.pixelsPerMm;

        this.gcodeLines.push({
          x1: gcodeX1,
          y1: gcodeY1,
          x2: gcodeX2,
          y2: gcodeY2,
        });
      }
    }
  }

  addSmoothSpiralToSVG(points, penWidthPx) {
    if (points.length < 4) {
      // Fall back to line segments if not enough points for curves
      this.addSpiralToSVG(points, penWidthPx);
      return;
    }

    const curveSegments = parseInt(document.getElementById("curveSegmentsValue").value);
    const strokeWidth = isFinite(penWidthPx) ? penWidthPx.toFixed(3) : "1";

    // Create smooth path using cubic Bezier curves
    let pathData = "";
    let startPoint = points[0];
    
    // Validate starting point
    if (isFinite(startPoint.x) && isFinite(startPoint.y)) {
      pathData = `M${startPoint.x.toFixed(3)},${startPoint.y.toFixed(3)}`;
      
      // Generate Bezier curves through the points
      for (let i = 0; i < points.length - 1; i += curveSegments) {
        const segmentPoints = points.slice(i, i + curveSegments + 1);
        
        if (segmentPoints.length >= 4) {
          // Create cubic Bezier curve through these points
          const curves = this.generateBezierCurves(segmentPoints);
          curves.forEach(curve => {
            if (curve && curve.cp1 && curve.cp2 && curve.end) {
              pathData += ` C${curve.cp1.x.toFixed(3)},${curve.cp1.y.toFixed(3)} ${curve.cp2.x.toFixed(3)},${curve.cp2.y.toFixed(3)} ${curve.end.x.toFixed(3)},${curve.end.y.toFixed(3)}`;
            }
          });
        } else if (segmentPoints.length >= 2) {
          // Use line to for remaining points
          for (let j = 1; j < segmentPoints.length; j++) {
            const point = segmentPoints[j];
            if (isFinite(point.x) && isFinite(point.y)) {
              pathData += ` L${point.x.toFixed(3)},${point.y.toFixed(3)}`;
            }
          }
        }
      }
    }

    if (pathData) {
      // Add smooth path to SVG content
      this.svgContent += `    <path d="${pathData}" stroke-width="${strokeWidth}" fill="none"/>
`;
      
      // Draw directly to SVG DOM
      const pathElement = document.createElementNS("http://www.w3.org/2000/svg", "path");
      pathElement.setAttribute("d", pathData);
      pathElement.setAttribute("stroke-width", strokeWidth);
      pathElement.setAttribute("fill", "none");
      this.linesGroup.appendChild(pathElement);

      // Convert curves to line segments for G-code (approximate the curves)
      this.convertCurvesToGcode(points, curveSegments);
    }
  }

  generateBezierCurves(points) {
    const curves = [];
    
    for (let i = 0; i < points.length - 3; i += 3) {
      const p0 = points[i];
      const p1 = points[i + 1];
      const p2 = points[i + 2];
      const p3 = points[i + 3];
      
      if (p0 && p1 && p2 && p3) {
        // Calculate control points for smooth Bezier curve
        const cp1 = {
          x: p0.x + (p1.x - p0.x) * 0.6,
          y: p0.y + (p1.y - p0.y) * 0.6
        };
        
        const cp2 = {
          x: p3.x - (p3.x - p2.x) * 0.6,
          y: p3.y - (p3.y - p2.y) * 0.6
        };
        
        curves.push({
          start: p0,
          cp1: cp1,
          cp2: cp2,
          end: p3
        });
      }
    }
    
    return curves;
  }

  convertCurvesToGcode(points, curveSegments) {
    // Approximate curves with line segments for G-code
    const approximationSteps = 10; // Number of line segments per curve section
    
    for (let i = 0; i < points.length - 1; i++) {
      const point1 = points[i];
      const point2 = points[i + 1];
      
      if (isFinite(point1.x) && isFinite(point1.y) && 
          isFinite(point2.x) && isFinite(point2.y)) {
        
        // Add line segment to G-code
        const gcodeX1 = point1.x / this.pixelsPerMm;
        const gcodeY1 = point1.y / this.pixelsPerMm;
        const gcodeX2 = point2.x / this.pixelsPerMm;
        const gcodeY2 = point2.y / this.pixelsPerMm;

        this.gcodeLines.push({
          x1: gcodeX1,
          y1: gcodeY1,
          x2: gcodeX2,
          y2: gcodeY2,
        });
      }
    }
  }

  sampleIntensity(x, y, intensityMap, width, height) {
    const sampleRadius = 3; // Fixed sample radius
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

  // Yield control back to the browser to prevent freezing
  yield() {
    return new Promise(resolve => setTimeout(resolve, 0));
  }

  // Cancel current processing if parameters change
  cancelProcessing() {
    if (this.isProcessing) {
      this.processingCancelled = true;
      this.hideProgress();
    }
  }

  downloadSVG() {
    if (!this.svgContent) return;

    const blob = new Blob([this.svgContent], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "spiral-art.svg";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  downloadGcode() {
    if (this.gcodeLines.length === 0) return;

    const feedRate = parseInt(document.getElementById("feedRateValue").value);
    const penDownZ = parseFloat(document.getElementById("penDownZValue").value);
    const penUpZ = parseFloat(document.getElementById("penUpZValue").value);

    let gcode = "";

    // G-code header
    gcode += "; Generated by SpiralMaker\n";
    gcode += "; Image to spiral G-code conversion\n";
    gcode += `; Feed rate: ${feedRate} mm/min\n`;
    gcode += `; Pen down Z: ${penDownZ} mm\n`;
    gcode += `; Pen up Z: ${penUpZ} mm\n`;
    gcode += "\n";

    // Initialize
    gcode += "G21 ; Set units to millimeters\n";
    gcode += "G90 ; Absolute positioning\n";
    gcode += "G94 ; Feed rate per minute\n";
    gcode += `F${feedRate} ; Set feed rate\n`;
    gcode += `G0 Z${penUpZ} ; Pen up\n`;
    gcode += "G0 X0 Y0 ; Move to origin\n";
    gcode += "\n";

    let currentX = 0;
    let currentY = 0;
    let penIsDown = false;

    // Optimize path to minimize travel distance
    const optimizedPath = this.optimizeGcodePath(this.gcodeLines, currentX, currentY);
    
    optimizedPath.forEach((segment) => {
      const { startX, startY, endX, endY } = segment;

      // Move to start position if needed
      if (
        Math.abs(currentX - startX) > 0.001 ||
        Math.abs(currentY - startY) > 0.001
      ) {
        if (penIsDown) {
          gcode += `G0 Z${penUpZ} ; Pen up\n`;
          penIsDown = false;
        }
        gcode += `G0 X${startX.toFixed(3)} Y${startY.toFixed(3)} ; Move to start\n`;
        currentX = startX;
        currentY = startY;
      }

      // Pen down and draw line
      if (!penIsDown) {
        gcode += `G1 Z${penDownZ} ; Pen down\n`;
        penIsDown = true;
      }

      gcode += `G1 X${endX.toFixed(3)} Y${endY.toFixed(3)} ; Draw line\n`;
      currentX = endX;
      currentY = endY;
    });

    // Footer
    gcode += "\n";
    gcode += `G0 Z${penUpZ} ; Pen up\n`;
    gcode += "G0 X0 Y0 ; Return to origin\n";
    gcode += "M30 ; Program end\n";

    // Download file
    const blob = new Blob([gcode], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "spiral-art.gcode";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  optimizeGcodePath(lines, startX, startY) {
    if (lines.length === 0) return [];
    
    // Create a copy of lines to work with
    const availableLines = [...lines];
    const optimizedPath = [];
    let currentX = startX;
    let currentY = startY;
    
    while (availableLines.length > 0) {
      let closestLineIndex = -1;
      let closestDistance = Infinity;
      let useReversed = false;
      
      // Find the closest endpoint among all remaining lines
      availableLines.forEach((line, index) => {
        // Check distance to start of line (x1, y1)
        const distToStart = Math.sqrt(
          (currentX - line.x1) ** 2 + (currentY - line.y1) ** 2
        );
        
        // Check distance to end of line (x2, y2)
        const distToEnd = Math.sqrt(
          (currentX - line.x2) ** 2 + (currentY - line.y2) ** 2
        );
        
        // Update closest if we found a better option
        if (distToStart < closestDistance) {
          closestDistance = distToStart;
          closestLineIndex = index;
          useReversed = false; // Start from x1,y1 -> x2,y2
        }
        
        if (distToEnd < closestDistance) {
          closestDistance = distToEnd;
          closestLineIndex = index;
          useReversed = true; // Start from x2,y2 -> x1,y1
        }
      });
      
      // Add the closest line to the optimized path
      const selectedLine = availableLines[closestLineIndex];
      let startX, startY, endX, endY;
      
      if (useReversed) {
        startX = selectedLine.x2;
        startY = selectedLine.y2;
        endX = selectedLine.x1;
        endY = selectedLine.y1;
      } else {
        startX = selectedLine.x1;
        startY = selectedLine.y1;
        endX = selectedLine.x2;
        endY = selectedLine.y2;
      }
      
      optimizedPath.push({ startX, startY, endX, endY });
      
      // Update current position and remove the used line
      currentX = endX;
      currentY = endY;
      availableLines.splice(closestLineIndex, 1);
    }
    
    return optimizedPath;
  }
}

// Initialize the spiral maker when the page loads
document.addEventListener("DOMContentLoaded", () => {
  new SpiralMaker();
});