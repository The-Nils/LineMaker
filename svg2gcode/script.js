const PROCESSING_SLICE_MS = 12;
const PROCESSING_TOTAL_LIMIT_MS = Infinity;
const YIELD_CHECK_INTERVAL = 64;

class SvgToGcodeTool {
  constructor() {
    this.dropZone = document.getElementById("svgDropZone");
    this.dropZoneContent = document.getElementById("dropZoneContent");
    this.fileNameDisplay = document.getElementById("fileNameDisplay");
    this.fileInput = document.getElementById("svgInput");
    this.downloadGcodeBtn = document.getElementById("downloadGcodeBtn");
    this.downloadSvgBtn = document.getElementById("downloadSvgBtn");

    this.previewArea = document.querySelector(".preview-area");
    this.previewSvg = document.getElementById("previewSvg");
    this.drawGroup = document.getElementById("drawGroup");
    this.travelGroup = document.getElementById("travelGroup");
    this.penUpGroup = document.getElementById("penUpGroup");
    this.penDownGroup = document.getElementById("penDownGroup");

    this.status = document.getElementById("status");
    this.sandbox = document.getElementById("svgSandbox");

    this.pathCountEl = document.getElementById("pathCount");
    this.segmentCountEl = document.getElementById("segmentCount");
    this.drawLengthEl = document.getElementById("drawLength");
    this.travelLengthEl = document.getElementById("travelLength");

    this.interactiveCanvas = new InteractiveCanvas(this.previewArea, {
      minZoom: 0.05,
      maxZoom: 30,
      zoomSpeed: 0.05,
    });

    this.sourceSvgMarkup = "";
    this.generatedGcode = "";
    this.previewSvgMarkup = "";
    this.lines = [];
    this.polylines = [];
    this.fileName = "toolpath";

    this.debounceTimer = null;
    this.debounceDelay = 200;
    this.statusTimer = null;

    this.currentProcessingToken = null;
    this.statusMessageEl = null;
    this.statusProgressEl = null;
    this.statusProgressBar = null;
    this.optimizationNotice = "";

    this.createStatusElements();

    this.bindEvents();
    this.updateButtons();
  }

  showProcessingStatus(message, percent = 0) {
    if (!this.status) return;

    const clamped = Math.max(0, Math.min(100, Number(percent) || 0));
    const text = message || "Processing…";

    if (this.statusMessageEl) {
      this.statusMessageEl.textContent = text;
    } else {
      this.status.textContent = text;
    }

    if (this.statusProgressEl && this.statusProgressBar) {
      this.statusProgressEl.style.display = "block";
      this.statusProgressBar.style.width = `${clamped}%`;
    }

    this.status.className = "status-notification show processing";
    clearTimeout(this.statusTimer);
    this.statusTimer = null;
  }

  setProcessingProgress(token, percent, message) {
    if (!token || token.cancelled || this.currentProcessingToken !== token) return;

    if (Number.isFinite(percent)) {
      token.progressPercent = Math.max(0, Math.min(100, percent));
    }
    if (typeof message === "string" && message.length) {
      token.progressMessage = message;
    }

    this.showProcessingStatus(
      token.progressMessage || "Processing…",
      token.progressPercent ?? 0
    );
  }

  beginProcessing(initialMessage = "Processing…") {
    if (this.currentProcessingToken) {
      this.currentProcessingToken.cancelled = true;
    }

    const token = {
      cancelled: false,
      startTime: performance.now(),
      lastYield: performance.now(),
      progressPercent: 0,
      progressMessage: initialMessage,
    };

    this.currentProcessingToken = token;
    this.optimizationNotice = "";
    this.setProcessingProgress(token, 0, initialMessage);

    return token;
  }

  endProcessing(token) {
    if (this.currentProcessingToken === token) {
      this.currentProcessingToken = null;
    }
  }

  completeProcessing(token, message = "Done.", type = "complete") {
    if (!token || token.cancelled || this.currentProcessingToken !== token) return;
    this.currentProcessingToken = null;
    this.showStatus(message, type);
  }

  failProcessing(token, message) {
    if (!token) return;
    if (token.cancelled && this.currentProcessingToken !== token) return;
    if (this.currentProcessingToken === token) {
      this.currentProcessingToken = null;
    }
    this.showStatus(message, "error");
  }

  async yieldProcessing(token, force = false) {
    if (!token) return;

    if (token.cancelled || this.currentProcessingToken !== token) {
      throw this.createProcessingCancelledError();
    }

    const now = performance.now();
    const elapsed = now - token.startTime;
    if (elapsed > PROCESSING_TOTAL_LIMIT_MS) {
      throw this.createProcessingTimeoutError();
    }

    if (!force && now - token.lastYield < PROCESSING_SLICE_MS) {
      return;
    }

    await new Promise((resolve) => requestAnimationFrame(resolve));

    const resumed = performance.now();
    token.lastYield = resumed;

    if (token.cancelled || this.currentProcessingToken !== token) {
      throw this.createProcessingCancelledError();
    }

    if (resumed - token.startTime > PROCESSING_TOTAL_LIMIT_MS) {
      throw this.createProcessingTimeoutError();
    }
  }

  createProcessingCancelledError() {
    const error = new Error("Processing cancelled");
    error.name = "ProcessingCancelled";
    error.isProcessingCancelled = true;
    return error;
  }

  createProcessingTimeoutError() {
    const error = new Error("Processing time limit reached");
    error.name = "ProcessingTimeout";
    error.isProcessingTimeout = true;
    return error;
  }

  isProcessingCancellation(error) {
    return Boolean(error && (error.isProcessingCancelled || error.name === "ProcessingCancelled"));
  }

  isProcessingTimeout(error) {
    return Boolean(error && (error.isProcessingTimeout || error.name === "ProcessingTimeout"));
  }

  assertProcessingActive(token) {
    if (!token || token.cancelled || this.currentProcessingToken !== token) {
      throw this.createProcessingCancelledError();
    }
  }

  createStageProgressUpdater(token, offset, weight, label) {
    return (fraction) => {
      const clampedFraction = Math.max(0, Math.min(1, Number(fraction) || 0));
      const overallProgress = offset + clampedFraction * weight;
      const overallPercent = overallProgress * 100;
      const stagePercent = Math.round(clampedFraction * 100);
      const message = `Processing ${Math.round(overallPercent)}% — ${label}… ${stagePercent}%`;
      this.setProcessingProgress(token, overallPercent, message);
    };
  }

  createStatusElements() {
    if (!this.status) return;

    this.status.innerHTML = "";

    this.statusMessageEl = document.createElement("div");
    this.statusMessageEl.className = "status-message";
    this.status.appendChild(this.statusMessageEl);

    this.statusProgressEl = document.createElement("div");
    this.statusProgressEl.className = "status-progress";
    this.statusProgressBar = document.createElement("div");
    this.statusProgressBar.className = "status-progress-bar";
    this.statusProgressEl.appendChild(this.statusProgressBar);
    this.status.appendChild(this.statusProgressEl);

    this.statusProgressEl.style.display = "none";
  }

  bindEvents() {
    ["dragenter", "dragover"].forEach((eventName) => {
      this.dropZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.dropZone.classList.add("dragover");
      });
    });

    ["dragleave", "drop"].forEach((eventName) => {
      this.dropZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.dropZone.classList.remove("dragover");
      });
    });

    this.dropZone.addEventListener("drop", (event) => {
      const file = event.dataTransfer?.files?.[0];
      if (file) {
        this.loadFile(file);
      }
    });

    this.dropZone.addEventListener("click", () => {
      this.fileInput.click();
    });

    this.fileInput.addEventListener("change", (event) => {
      const file = event.target.files?.[0];
      if (file) {
        this.loadFile(file);
      }
    });

    document
      .getElementById("fitToContentBtn")
      .addEventListener("click", () => {
        this.interactiveCanvas.fitToContent();
      });

    document
      .getElementById("resetViewBtn")
      .addEventListener("click", () => {
        this.interactiveCanvas.resetTransform();
      });

    this.downloadGcodeBtn.addEventListener("click", () => {
      if (!this.generatedGcode) return;
      const blob = new Blob([this.generatedGcode], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${this.fileName || "toolpath"}.gcode`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    });

    this.downloadSvgBtn.addEventListener("click", () => {
      if (!this.previewSvgMarkup) return;
      const blob = new Blob([this.previewSvgMarkup], {
        type: "image/svg+xml",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${this.fileName || "toolpath"}-preview.svg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    });

    const inputs = [
      "mmPerUnitInput",
      "marginInput",
      "offsetXInput",
      "offsetYInput",
      "segmentLengthInput",
      "circleSegmentsInput",
      "feedRateInput",
      "travelRateInput",
      "penDownInput",
      "penUpInput",
      "preventZhopInput",
      "startXInput",
      "startYInput",
    ];

    inputs.forEach((id) => {
      const element = document.getElementById(id);
      if (!element) return;
      element.addEventListener("input", () => this.debounceRecompute());
    });

    ["autoOriginInput", "flipYInput", "optimizeInput"].forEach((id) => {
      const element = document.getElementById(id);
      if (!element) return;
      element.addEventListener("change", () => this.debounceRecompute());
    });
  }

  async loadFile(file) {
    try {
      if (!file.name.toLowerCase().endsWith(".svg")) {
        this.showStatus("Please select an SVG file.", "error");
        return;
      }

      const text = await file.text();
      this.sourceSvgMarkup = text;
      this.fileName = file.name.replace(/\.svg$/i, "");
      this.fileNameDisplay.textContent = file.name;
      this.showStatus(`Loaded ${file.name}`, "complete");
      this.recompute();
    } catch (error) {
      console.error(error);
      this.showStatus("Failed to load SVG file.", "error");
    }
  }

  debounceRecompute() {
    if (!this.sourceSvgMarkup) return;
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.recompute(), this.debounceDelay);
  }

  async recompute() {
    if (!this.sourceSvgMarkup) return;

    const token = this.beginProcessing("Parsing SVG…");
    const steps = [
      { weight: 0.35, label: "Parsing SVG" },
      { weight: 0.15, label: "Transforming geometry" },
      { weight: 0.2, label: "Building segments" },
      { weight: 0.2, label: "Generating toolpath" },
      { weight: 0.1, label: "Rendering preview" },
    ];

    let offset = 0;

    try {
      const extractProgress = this.createStageProgressUpdater(
        token,
        offset,
        steps[0].weight,
        steps[0].label
      );
      const { polylines, bounds } = await this.extractGeometry(
        token,
        extractProgress
      );
      this.assertProcessingActive(token);
      extractProgress(1);
      this.polylines = polylines;
      offset += steps[0].weight;

      if (polylines.length === 0) {
        this.resetPreview();
        this.failProcessing(token, "No drawable elements found in SVG.");
        this.updateButtons();
        return;
      }

      const transformProgress = this.createStageProgressUpdater(
        token,
        offset,
        steps[1].weight,
        steps[1].label
      );
      const transformed = await this.transformPolylines(
        token,
        polylines,
        bounds,
        transformProgress
      );
      this.assertProcessingActive(token);
      transformProgress(1);
      offset += steps[1].weight;

      const segmentProgress = this.createStageProgressUpdater(
        token,
        offset,
        steps[2].weight,
        steps[2].label
      );
      const lines = await this.polylinesToSegments(
        token,
        transformed.polylines,
        segmentProgress
      );
      this.assertProcessingActive(token);
      segmentProgress(1);
      this.lines = lines;
      offset += steps[2].weight;

      const toolpathProgress = this.createStageProgressUpdater(
        token,
        offset,
        steps[3].weight,
        steps[3].label
      );
      const toolpath = await this.generateToolpath(
        token,
        lines,
        transformed.bounds,
        toolpathProgress
      );
      this.assertProcessingActive(token);
      toolpathProgress(1);
      offset += steps[3].weight;

      this.generatedGcode = toolpath.gcode;
      await this.yieldProcessing(token);
      this.previewSvgMarkup = this.buildPreviewSvg(
        transformed.polylines,
        transformed.bounds,
        toolpath.penDownEvents,
        toolpath.penUpEvents
      );

      const renderProgress = this.createStageProgressUpdater(
        token,
        offset,
        steps[4].weight,
        steps[4].label
      );
      await this.renderPreview(token, toolpath, transformed.bounds, renderProgress);
      renderProgress(1);
      offset += steps[4].weight;

      this.assertProcessingActive(token);
      this.updateStats(transformed.polylines.length, lines.length, toolpath);
      this.updateButtons();

      await this.yieldProcessing(token, true);
      this.interactiveCanvas.fitToContent();

      const finalMessage = this.optimizationNotice
        ? `Toolpath updated. ${this.optimizationNotice}`
        : "Toolpath updated.";
      this.completeProcessing(token, finalMessage, "complete");
    } catch (error) {
      if (this.isProcessingCancellation(error)) {
        return;
      }

      console.error(error);
      this.resetPreview();
      this.updateButtons();

      if (this.isProcessingTimeout(error)) {
        this.failProcessing(
          token,
          "Stopped: processing took too long. Try reducing detail."
        );
        return;
      }

      this.failProcessing(token, "Failed to generate toolpath.");
    } finally {
      this.endProcessing(token);
    }
  }

  async extractGeometry(token, onProgress) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(this.sourceSvgMarkup, "image/svg+xml");
    const parseError = doc.querySelector("parsererror");
    if (parseError) {
      throw new Error(parseError.textContent || "Invalid SVG");
    }

    let svg = doc.querySelector("svg");
    if (!svg) {
      throw new Error("No <svg> root element found.");
    }

    svg = svg.cloneNode(true);

    if (!svg.getAttribute("xmlns")) {
      svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    }

    const viewBox = svg.getAttribute("viewBox");
    let box = null;
    if (viewBox) {
      const values = viewBox.split(/[\s,]+/).map(parseFloat);
      if (values.length === 4) {
        box = {
          x: values[0],
          y: values[1],
          width: values[2],
          height: values[3],
        };
      }
    }

    if (!svg.getAttribute("width") && box) {
      svg.setAttribute("width", box.width);
    }
    if (!svg.getAttribute("height") && box) {
      svg.setAttribute("height", box.height);
    }

    this.sandbox.innerHTML = "";
    this.sandbox.appendChild(svg);

    const segmentLengthMm = this.getNumber("segmentLengthInput", 1);
    const mmPerUnit = Math.max(this.getNumber("mmPerUnitInput", 1), 0.0001);
    const segmentLengthSvg = segmentLengthMm / mmPerUnit;
    const circleSegments = Math.max(
      8,
      Math.min(720, Math.round(this.getNumber("circleSegmentsInput", 72)))
    );

    const elements = Array.from(
      svg.querySelectorAll("path, line, polyline, polygon, rect, circle, ellipse")
    );

    const polylines = [];
    const total = Math.max(1, elements.length);
    let processed = 0;

    const report = () => {
      if (typeof onProgress === "function") {
        const ratio = Math.min(1, Math.max(0, processed / total));
        onProgress(ratio);
      }
    };

    report();

    try {
      for (const element of elements) {
        const tag = element.tagName.toLowerCase();
        let curves = [];
        switch (tag) {
          case "path":
            curves = await this.convertPath(token, element, segmentLengthSvg);
            break;
          case "line":
            curves = this.convertLine(element);
            break;
          case "polyline":
            curves = this.convertPolyline(element, false);
            break;
          case "polygon":
            curves = this.convertPolyline(element, true);
            break;
          case "rect":
            curves = this.convertRect(element);
            break;
          case "circle":
            curves = this.convertCircle(element, circleSegments);
            break;
          case "ellipse":
            curves = this.convertEllipse(element, circleSegments);
            break;
          default:
            curves = [];
        }

        curves.forEach((curve) => {
          if (curve.length >= 2) {
            polylines.push(curve);
          }
        });

        processed += 1;
        if (processed % YIELD_CHECK_INTERVAL === 0) {
          await this.yieldProcessing(token);
        }
        report();
      }
    } finally {
      this.sandbox.innerHTML = "";
    }

    processed = total;
    report();

    this.assertProcessingActive(token);
    const bounds = this.computeBounds(polylines);

    return { polylines, bounds };
  }

  async transformPolylines(token, polylines, originalBounds, onProgress) {
    if (!Array.isArray(polylines) || polylines.length === 0) {
      return {
        polylines: [],
        bounds: this.computeBounds([]),
        originalBounds,
      };
    }

    const mmPerUnit = Math.max(this.getNumber("mmPerUnitInput", 1), 0.0001);
    const autoOrigin = document.getElementById("autoOriginInput").checked;
    const flipY = document.getElementById("flipYInput").checked;
    const margin = this.getNumber("marginInput", 0);
    const offsetX = this.getNumber("offsetXInput", 0);
    const offsetY = this.getNumber("offsetYInput", 0);

    const totalPoints = polylines.reduce(
      (sum, polyline) => sum + (Array.isArray(polyline) ? polyline.length : 0),
      0
    );
    const totalUnits = Math.max(1, totalPoints * 2);
    let processedUnits = 0;

    const report = () => {
      if (typeof onProgress === "function") {
        onProgress(Math.min(1, processedUnits / totalUnits));
      }
    };

    report();

    const scaled = [];
    for (const polyline of polylines) {
      const scaledPolyline = [];
      for (const point of polyline) {
        if (!point) continue;
        scaledPolyline.push({
          x: point.x * mmPerUnit,
          y: (flipY ? -point.y : point.y) * mmPerUnit,
        });
        processedUnits += 1;
        if (processedUnits % YIELD_CHECK_INTERVAL === 0) {
          await this.yieldProcessing(token);
          report();
        }
      }
      scaled.push(scaledPolyline);
    }

    report();

    const bounds = this.computeBounds(scaled);

    let shiftX = offsetX;
    let shiftY = offsetY;

    if (autoOrigin) {
      shiftX += margin - bounds.minX;
      shiftY += margin - bounds.minY;
    } else if (margin !== 0) {
      shiftX += margin;
      shiftY += margin;
    }

    const transformed = [];
    for (const polyline of scaled) {
      const transformedPolyline = [];
      for (const point of polyline) {
        transformedPolyline.push({
          x: point.x + shiftX,
          y: point.y + shiftY,
        });
        processedUnits += 1;
        if (processedUnits % YIELD_CHECK_INTERVAL === 0) {
          await this.yieldProcessing(token);
          report();
        }
      }
      transformed.push(transformedPolyline);
    }

    processedUnits = totalUnits;
    report();

    this.assertProcessingActive(token);
    const transformedBounds = this.computeBounds(transformed);

    return {
      polylines: transformed,
      bounds: transformedBounds,
      originalBounds,
    };
  }

  async polylinesToSegments(token, polylines, onProgress) {
    const segments = [];
    if (!Array.isArray(polylines) || polylines.length === 0) {
      if (typeof onProgress === "function") onProgress(1);
      return segments;
    }

    const total = polylines.reduce(
      (sum, polyline) => sum + Math.max(0, polyline.length - 1),
      0
    );
    const cappedTotal = Math.max(1, total);
    let processed = 0;

    const report = () => {
      if (typeof onProgress === "function") {
        onProgress(Math.min(1, processed / cappedTotal));
      }
    };

    report();

    for (let pathIndex = 0; pathIndex < polylines.length; pathIndex++) {
      const polyline = polylines[pathIndex];
      if (!Array.isArray(polyline)) continue;
      for (let i = 1; i < polyline.length; i++) {
        const prev = polyline[i - 1];
        const current = polyline[i];
        if (!prev || !current) continue;
        if (this.distance(prev, current) < 1e-5) continue;
        segments.push({
          x1: prev.x,
          y1: prev.y,
          x2: current.x,
          y2: current.y,
          pathIndex,
        });
        processed += 1;
        if (processed % YIELD_CHECK_INTERVAL === 0) {
          await this.yieldProcessing(token);
          report();
        }
      }
    }

    processed = cappedTotal;
    report();

    this.assertProcessingActive(token);
    return segments;
  }

  async generateToolpath(token, segments, bounds, onProgress) {
    if (!segments.length) {
      if (typeof onProgress === "function") {
        onProgress(1);
      }
      this.optimizationNotice = "";
      return {
        gcode: "",
        draws: [],
        travels: [],
        drawLength: 0,
        travelLength: 0,
        penDownEvents: [],
        penUpEvents: [],
      };
    }

    const feedRate = this.getNumber("feedRateInput", 1500);
    const travelRate = this.getNumber("travelRateInput", feedRate);
    const penDownZ = this.getNumber("penDownInput", 0);
    const penUpZ = this.getNumber("penUpInput", 2);
    const preventZhop = Math.max(0, this.getNumber("preventZhopInput", 3));
    const startX = this.getNumber("startXInput", 0);
    const startY = this.getNumber("startYInput", 0);
    const optimize = document.getElementById("optimizeInput").checked;

    const generator = new GCodeGenerator({
      feedRate,
      penDownZ,
      penUpZ,
      preventZhop,
      startX,
      startY,
      toolName: "SVG2GCode",
      canvasWidth: Math.max(bounds.maxX - bounds.minX, 0),
      canvasHeight: Math.max(bounds.maxY - bounds.minY, 0),
    });

    generator.beginProgram();

    let orderedSegments = optimize ? segments : [...segments];
    let optimizationAborted = false;

    const optimizationWeight = optimize ? 0.3 : 0;
    const drawingWeight = 1 - optimizationWeight;

    if (optimize) {
      const result = await this.optimizeSegments(
        token,
        segments,
        startX,
        startY,
        (fraction) => {
          if (typeof onProgress === "function") {
            const clamped = Math.max(0, Math.min(1, fraction || 0));
            onProgress(clamped * optimizationWeight);
          }
        }
      );

      if (result && Array.isArray(result.segments)) {
        orderedSegments = result.segments;
      } else if (result && result.aborted) {
        optimizationAborted = true;
      }
    }

    if (optimizationWeight > 0 && typeof onProgress === "function") {
      onProgress(Math.min(1, optimizationWeight));
    }

    const draws = [];
    const travels = [];
    const penDownEvents = [];
    const penUpEvents = [];
    let drawLength = 0;
    let travelLength = 0;

    let currentX = startX;
    let currentY = startY;
    let penIsDown = false;

    const totalSegments = Math.max(1, orderedSegments.length);
    let processed = 0;

    for (const segment of orderedSegments) {
      const distanceToStart = this.distance(
        { x: currentX, y: currentY },
        { x: segment.x1, y: segment.y1 }
      );

      const shouldLift = penIsDown && distanceToStart > preventZhop;

      if (distanceToStart > 1e-3) {
        if (shouldLift) {
          generator.ensurePenUp({ force: true, feedRate: travelRate });
          penUpEvents.push({ x: currentX, y: currentY });
          penIsDown = false;
          travels.push([
            { x: currentX, y: currentY },
            { x: segment.x1, y: segment.y1 },
          ]);
          travelLength += distanceToStart;
        }

        const rapid = !penIsDown;
        generator.moveTo(segment.x1, segment.y1, {
          rapid,
          feedRate: rapid ? travelRate : feedRate,
          comment: rapid ? "Move" : "Drag",
        });

        if (rapid) {
          travels.push([
            { x: currentX, y: currentY },
            { x: segment.x1, y: segment.y1 },
          ]);
          travelLength += distanceToStart;
        } else if (!shouldLift && distanceToStart > 1e-5) {
          draws.push([
            { x: currentX, y: currentY },
            { x: segment.x1, y: segment.y1 },
          ]);
          drawLength += distanceToStart;
        }
      }

      const wasPenDown = penIsDown;
      generator.ensurePenDown({ feedRate, penDownZ });
      if (!wasPenDown) {
        penDownEvents.push({ x: segment.x1, y: segment.y1 });
        penIsDown = true;
      }
      generator.drawLineTo(segment.x2, segment.y2, {
        feedRate,
        comment: "Draw",
      });

      draws.push([
        { x: segment.x1, y: segment.y1 },
        { x: segment.x2, y: segment.y2 },
      ]);
      drawLength += this.distance(
        { x: segment.x1, y: segment.y1 },
        { x: segment.x2, y: segment.y2 }
      );

      currentX = segment.x2;
      currentY = segment.y2;

      processed += 1;
      if (processed % YIELD_CHECK_INTERVAL === 0) {
        await this.yieldProcessing(token);
        if (typeof onProgress === "function") {
          const fraction = processed / totalSegments;
          const progress = optimizationWeight + fraction * drawingWeight;
          onProgress(Math.min(1, progress));
        }
      }
    }

    if (penIsDown) {
      penUpEvents.push({ x: currentX, y: currentY });
      penIsDown = false;
    }
    generator.ensurePenUp({ force: true, feedRate: travelRate });
    generator.finishProgram();

    if (typeof onProgress === "function") {
      onProgress(1);
    }

    this.assertProcessingActive(token);
    if (optimizationAborted) {
      this.optimizationNotice = "Optimization paused early to keep things responsive.";
    } else {
      this.optimizationNotice = "";
    }

    return {
      gcode: generator.toString(),
      draws,
      travels,
      drawLength,
      travelLength,
      penDownEvents,
      penUpEvents,
    };
  }

  async optimizeSegments(token, segments, startX, startY, onProgress) {
    if (!Array.isArray(segments) || segments.length === 0) {
      if (typeof onProgress === "function") onProgress(1);
      return { segments: [] };
    }

    const remaining = segments.map((segment) => ({ ...segment }));
    const optimized = [];
    let currentX = startX;
    let currentY = startY;

    const total = Math.max(1, remaining.length);
    let processed = 0;

    const report = () => {
      if (typeof onProgress === "function") {
        onProgress(Math.min(1, processed / total));
      }
    };

    report();

    while (remaining.length > 0) {
      let bestIndex = 0;
      let bestDistance = Infinity;
      let bestReversed = false;

      for (let i = 0; i < remaining.length; i++) {
        const line = remaining[i];
        if (!line) continue;
        const distToStart = GCodeGenerator.distance(
          currentX,
          currentY,
          line.x1,
          line.y1
        );
        if (distToStart < bestDistance) {
          bestDistance = distToStart;
          bestIndex = i;
          bestReversed = false;
        }

        const distToEnd = GCodeGenerator.distance(
          currentX,
          currentY,
          line.x2,
          line.y2
        );
        if (distToEnd < bestDistance) {
          bestDistance = distToEnd;
          bestIndex = i;
          bestReversed = true;
        }
      }

      const bestLine = remaining.splice(bestIndex, 1)[0];
      if (!bestLine) continue;

      if (bestReversed) {
        const reversed = {
          ...bestLine,
          x1: bestLine.x2,
          y1: bestLine.y2,
          x2: bestLine.x1,
          y2: bestLine.y1,
        };
        optimized.push(reversed);
        currentX = reversed.x2;
        currentY = reversed.y2;
      } else {
        optimized.push(bestLine);
        currentX = bestLine.x2;
        currentY = bestLine.y2;
      }

      processed += 1;

      if (processed % YIELD_CHECK_INTERVAL === 0) {
        await this.yieldProcessing(token);
        report();
      }
    }

    processed = total;
    report();

    this.assertProcessingActive(token);
    return { segments: optimized };
  }

  async renderPreview(token, toolpath, bounds, onProgress) {
    if (this.drawGroup) this.drawGroup.textContent = "";
    if (this.travelGroup) this.travelGroup.textContent = "";
    if (this.penUpGroup) this.penUpGroup.textContent = "";
    if (this.penDownGroup) this.penDownGroup.textContent = "";

    const viewBox = `${Math.floor(bounds.minX)} ${Math.floor(
      bounds.minY
    )} ${Math.ceil(bounds.maxX - bounds.minX || 1)} ${Math.ceil(
      bounds.maxY - bounds.minY || 1
    )}`;
    this.previewSvg.setAttribute("viewBox", viewBox);

    const travels = toolpath.travels || [];
    const draws = toolpath.draws || [];
    const penUpEvents = toolpath.penUpEvents || [];
    const penDownEvents = toolpath.penDownEvents || [];

    const totalItems = Math.max(
      1,
      travels.length + draws.length + penUpEvents.length + penDownEvents.length
    );
    let processed = 0;

    const report = () => {
      if (typeof onProgress === "function") {
        onProgress(Math.min(1, processed / totalItems));
      }
    };

    report();

    const arrowSize = this.computeArrowSize(bounds);

    if (this.travelGroup && travels.length) {
      const travelFragment = document.createDocumentFragment();
      for (const segment of travels) {
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", segment[0].x);
        line.setAttribute("y1", segment[0].y);
        line.setAttribute("x2", segment[1].x);
        line.setAttribute("y2", segment[1].y);
        travelFragment.appendChild(line);
        processed += 1;
        if (processed % YIELD_CHECK_INTERVAL === 0) {
          await this.yieldProcessing(token);
          report();
        }
      }
      this.travelGroup.appendChild(travelFragment);
    }

    if (this.drawGroup && draws.length) {
      const drawFragment = document.createDocumentFragment();
      for (const segment of draws) {
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", segment[0].x);
        line.setAttribute("y1", segment[0].y);
        line.setAttribute("x2", segment[1].x);
        line.setAttribute("y2", segment[1].y);
        drawFragment.appendChild(line);
        processed += 1;
        if (processed % YIELD_CHECK_INTERVAL === 0) {
          await this.yieldProcessing(token);
          report();
        }
      }
      this.drawGroup.appendChild(drawFragment);
    }

    if (this.penUpGroup && penUpEvents.length) {
      const penUpFragment = document.createDocumentFragment();
      for (const point of penUpEvents) {
        this.addArrowMarker(penUpFragment, point, "up", arrowSize);
        processed += 1;
        if (processed % YIELD_CHECK_INTERVAL === 0) {
          await this.yieldProcessing(token);
          report();
        }
      }
      this.penUpGroup.appendChild(penUpFragment);
    }

    if (this.penDownGroup && penDownEvents.length) {
      const penDownFragment = document.createDocumentFragment();
      for (const point of penDownEvents) {
        this.addArrowMarker(penDownFragment, point, "down", arrowSize);
        processed += 1;
        if (processed % YIELD_CHECK_INTERVAL === 0) {
          await this.yieldProcessing(token);
          report();
        }
      }
      this.penDownGroup.appendChild(penDownFragment);
    }

    processed = totalItems;
    report();

    this.assertProcessingActive(token);
  }

  computeArrowSize(bounds) {
    if (!bounds) return 1.5;
    const width = Math.max(bounds.maxX - bounds.minX, 1);
    const height = Math.max(bounds.maxY - bounds.minY, 1);
    const extent = Math.max(width, height);
    const size = Math.min(Math.max(extent / 100, 1.2), Math.max(extent / 30, 6));
    return Number.isFinite(size) ? size : 1.5;
  }

  addArrowMarker(group, point, direction, size) {
    if (!group || !point) return;
    const NS = "http://www.w3.org/2000/svg";
    const color = direction === "down" ? "#2ecc71" : "#e74c3c";
    const scale = Math.max(size, 0.5);
    const shaftLength = scale * 0.6;
    const shaft = document.createElementNS(NS, "line");

    if (direction === "down") {
      shaft.setAttribute("x1", point.x);
      shaft.setAttribute("y1", point.y - scale);
      shaft.setAttribute("x2", point.x);
      shaft.setAttribute("y2", point.y + shaftLength);
    } else {
      shaft.setAttribute("x1", point.x);
      shaft.setAttribute("y1", point.y + scale);
      shaft.setAttribute("x2", point.x);
      shaft.setAttribute("y2", point.y - shaftLength);
    }

    shaft.setAttribute("stroke", color);
    shaft.setAttribute("stroke-width", Math.max(scale * 0.15, 0.2));
    shaft.setAttribute("stroke-linecap", "round");
    shaft.setAttribute("vector-effect", "non-scaling-stroke");

    const head = document.createElementNS(NS, "polygon");
    const headWidth = scale * 0.8;
    if (direction === "down") {
      const tipY = point.y + scale;
      const baseY = point.y + shaftLength;
      head.setAttribute(
        "points",
        `${point.x},${tipY} ${point.x - headWidth},${baseY} ${point.x + headWidth},${baseY}`
      );
    } else {
      const tipY = point.y - scale;
      const baseY = point.y - shaftLength;
      head.setAttribute(
        "points",
        `${point.x},${tipY} ${point.x - headWidth},${baseY} ${point.x + headWidth},${baseY}`
      );
    }
    head.setAttribute("fill", color);
    head.setAttribute("stroke", color);
    head.setAttribute("stroke-width", Math.max(scale * 0.1, 0.15));
    head.setAttribute("vector-effect", "non-scaling-stroke");

    group.appendChild(shaft);
    group.appendChild(head);
  }

  createArrowMarkup(point, direction, size) {
    if (!point) return "";
    const color = direction === "down" ? "#2ecc71" : "#e74c3c";
    const scale = Math.max(size, 0.5);
    const shaftLength = scale * 0.6;
    const shaftWidth = Math.max(scale * 0.15, 0.2);
    const headWidth = scale * 0.8;
    const headStroke = Math.max(scale * 0.1, 0.15);

    if (direction === "down") {
      const tipY = point.y + scale;
      const baseY = point.y + shaftLength;
      return `  <line x1="${this.formatNumber(point.x)}" y1="${this.formatNumber(
        point.y - scale
      )}" x2="${this.formatNumber(point.x)}" y2="${this.formatNumber(
        baseY
      )}" stroke="${color}" stroke-width="${this.formatNumber(shaftWidth)}" stroke-linecap="round" vector-effect="non-scaling-stroke" />\n  <polygon points="${this.formatNumber(point.x)},${this.formatNumber(
        tipY
      )} ${this.formatNumber(point.x - headWidth)},${this.formatNumber(
        baseY
      )} ${this.formatNumber(point.x + headWidth)},${this.formatNumber(
        baseY
      )}" fill="${color}" stroke="${color}" stroke-width="${this.formatNumber(
        headStroke
      )}" vector-effect="non-scaling-stroke" />`;
    }

    const tipY = point.y - scale;
    const baseY = point.y - shaftLength;
    return `  <line x1="${this.formatNumber(point.x)}" y1="${this.formatNumber(
      point.y + scale
    )}" x2="${this.formatNumber(point.x)}" y2="${this.formatNumber(
      baseY
    )}" stroke="${color}" stroke-width="${this.formatNumber(shaftWidth)}" stroke-linecap="round" vector-effect="non-scaling-stroke" />\n  <polygon points="${this.formatNumber(point.x)},${this.formatNumber(
      tipY
    )} ${this.formatNumber(point.x - headWidth)},${this.formatNumber(
      baseY
    )} ${this.formatNumber(point.x + headWidth)},${this.formatNumber(
      baseY
    )}" fill="${color}" stroke="${color}" stroke-width="${this.formatNumber(
      headStroke
    )}" vector-effect="non-scaling-stroke" />`;
  }

  updateStats(pathCount, segmentCount, toolpath) {
    this.pathCountEl.textContent = pathCount;
    this.segmentCountEl.textContent = segmentCount;
    this.drawLengthEl.textContent = `${toolpath.drawLength.toFixed(2)} mm`;
    this.travelLengthEl.textContent = `${toolpath.travelLength.toFixed(2)} mm`;
  }

  buildPreviewSvg(polylines, bounds, penDownEvents = [], penUpEvents = []) {
    const width = Math.max(bounds.maxX - bounds.minX, 0.001);
    const height = Math.max(bounds.maxY - bounds.minY, 0.001);
    const lines = polylines
      .map((polyline) => {
        const points = polyline.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).join(" ");
        return `<polyline points="${points}" fill="none" stroke="#000" stroke-width="0.25" stroke-linecap="round" stroke-linejoin="round"/>`;
      })
      .join("\n");
    const arrowSize = this.computeArrowSize(bounds);
    const penDown = (penDownEvents || [])
      .map((point) => this.createArrowMarkup(point, "down", arrowSize))
      .join("\n");
    const penUp = (penUpEvents || [])
      .map((point) => this.createArrowMarkup(point, "up", arrowSize))
      .join("\n");

    const content = [lines, penUp, penDown].filter(Boolean).join("\n");

    return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bounds.minX} ${bounds.minY} ${width} ${height}" stroke="black" fill="none">\n${content}\n</svg>`;
  }

  resetPreview() {
    this.generatedGcode = "";
    this.previewSvgMarkup = "";
    while (this.drawGroup.firstChild) {
      this.drawGroup.removeChild(this.drawGroup.firstChild);
    }
    while (this.travelGroup.firstChild) {
      this.travelGroup.removeChild(this.travelGroup.firstChild);
    }
    if (this.penUpGroup) {
      while (this.penUpGroup.firstChild) {
        this.penUpGroup.removeChild(this.penUpGroup.firstChild);
      }
    }
    if (this.penDownGroup) {
      while (this.penDownGroup.firstChild) {
        this.penDownGroup.removeChild(this.penDownGroup.firstChild);
      }
    }
    this.pathCountEl.textContent = "0";
    this.segmentCountEl.textContent = "0";
    this.drawLengthEl.textContent = "0 mm";
    this.travelLengthEl.textContent = "0 mm";
    this.previewSvg.setAttribute("viewBox", "0 0 200 200");
    this.updateButtons();
  }

  updateButtons() {
    const hasData = Boolean(this.generatedGcode);
    this.downloadGcodeBtn.disabled = !hasData;
    this.downloadSvgBtn.disabled = !this.previewSvgMarkup;
  }

  showStatus(message, type = "info") {
    if (!this.status) return;

    const text = message || "";
    if (this.statusMessageEl) {
      this.statusMessageEl.textContent = text;
    } else {
      this.status.textContent = text;
    }

    if (this.statusProgressEl) {
      this.statusProgressEl.style.display = "none";
      if (this.statusProgressBar) {
        this.statusProgressBar.style.width = "0%";
      }
    }

    this.status.className = "status-notification";
    this.status.classList.add("show");
    if (type) {
      this.status.classList.add(type);
    }

    clearTimeout(this.statusTimer);
    this.statusTimer = setTimeout(() => {
      this.status.classList.remove("show");
    }, 2500);
  }

  async convertPath(token, element, segmentLengthSvg) {
    const path = element;
    const matrix = this.getTransformMatrix(path);

    let length = 0;
    try {
      length = path.getTotalLength();
    } catch (error) {
      console.warn("Unable to measure path length", error);
      return [];
    }

    if (!Number.isFinite(length) || length === 0) return [];

    const step = Math.max(segmentLengthSvg || length / 200, length / 500);
    const sampleCount = Math.max(2, Math.ceil(length / step));
    const gapThreshold = step * 4;

    const polylines = [];
    let current = [];
    let previousPoint = null;

    for (let i = 0; i <= sampleCount; i++) {
      const distance = (length * i) / sampleCount;
      const point = path.getPointAtLength(distance);
      const transformed = this.applyMatrix(point, matrix);

      if (!previousPoint) {
        current.push(transformed);
        previousPoint = transformed;
        continue;
      }

      const gap = this.distance(previousPoint, transformed);
      if (gap > gapThreshold && current.length >= 2) {
        polylines.push(current);
        current = [transformed];
      } else if (gap > 1e-5) {
        current.push(transformed);
      }
      previousPoint = transformed;

      if (i % YIELD_CHECK_INTERVAL === 0) {
        await this.yieldProcessing(token);
      }
    }

    if (current.length >= 2) {
      polylines.push(current);
    }

    return polylines;
  }

  convertLine(element) {
    const x1 = parseFloat(element.getAttribute("x1") || "0");
    const y1 = parseFloat(element.getAttribute("y1") || "0");
    const x2 = parseFloat(element.getAttribute("x2") || "0");
    const y2 = parseFloat(element.getAttribute("y2") || "0");
    const matrix = this.getTransformMatrix(element);

    const start = this.applyMatrix({ x: x1, y: y1 }, matrix);
    const end = this.applyMatrix({ x: x2, y: y2 }, matrix);

    return [[start, end]];
  }

  convertPolyline(element, closePath) {
    const pointsAttr = element.getAttribute("points");
    if (!pointsAttr) return [];

    const coords = pointsAttr
      .trim()
      .split(/[\s,]+/)
      .map((value) => parseFloat(value));

    const points = [];
    for (let i = 0; i < coords.length; i += 2) {
      if (!Number.isFinite(coords[i]) || !Number.isFinite(coords[i + 1])) continue;
      points.push({ x: coords[i], y: coords[i + 1] });
    }

    if (closePath && points.length >= 2) {
      points.push({ ...points[0] });
    }

    const matrix = this.getTransformMatrix(element);
    const transformed = points
      .map((point) => this.applyMatrix(point, matrix))
      .filter(Boolean);

    return transformed.length >= 2 ? [transformed] : [];
  }

  convertRect(element) {
    const x = parseFloat(element.getAttribute("x") || "0");
    const y = parseFloat(element.getAttribute("y") || "0");
    const width = parseFloat(element.getAttribute("width") || "0");
    const height = parseFloat(element.getAttribute("height") || "0");
    const matrix = this.getTransformMatrix(element);

    const points = [
      { x, y },
      { x: x + width, y },
      { x: x + width, y: y + height },
      { x, y: y + height },
      { x, y },
    ]
      .map((point) => this.applyMatrix(point, matrix))
      .filter(Boolean);

    return points.length >= 2 ? [points] : [];
  }

  convertCircle(element, segments) {
    const cx = parseFloat(element.getAttribute("cx") || "0");
    const cy = parseFloat(element.getAttribute("cy") || "0");
    const r = parseFloat(element.getAttribute("r") || "0");
    if (!Number.isFinite(r) || r <= 0) return [];
    return this.approximateEllipse(cx, cy, r, r, this.getTransformMatrix(element), segments);
  }

  convertEllipse(element, segments) {
    const cx = parseFloat(element.getAttribute("cx") || "0");
    const cy = parseFloat(element.getAttribute("cy") || "0");
    const rx = parseFloat(element.getAttribute("rx") || "0");
    const ry = parseFloat(element.getAttribute("ry") || "0");
    if (!Number.isFinite(rx) || !Number.isFinite(ry) || rx <= 0 || ry <= 0)
      return [];
    return this.approximateEllipse(cx, cy, rx, ry, this.getTransformMatrix(element), segments);
  }

  approximateEllipse(cx, cy, rx, ry, matrix, segments) {
    const points = [];
    for (let i = 0; i <= segments; i++) {
      const angle = (2 * Math.PI * i) / segments;
      const point = {
        x: cx + rx * Math.cos(angle),
        y: cy + ry * Math.sin(angle),
      };
      points.push(this.applyMatrix(point, matrix));
    }
    return [points];
  }

  computeBounds(polylines) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    polylines.forEach((polyline) => {
      polyline.forEach((point) => {
        if (!point) return;
        if (point.x < minX) minX = point.x;
        if (point.x > maxX) maxX = point.x;
        if (point.y < minY) minY = point.y;
        if (point.y > maxY) maxY = point.y;
      });
    });

    if (!Number.isFinite(minX)) {
      minX = 0;
      maxX = 0;
      minY = 0;
      maxY = 0;
    }

    return { minX, maxX, minY, maxY };
  }

  getTransformMatrix(element) {
    try {
      const ctm = element.getCTM?.();
      if (!ctm) return null;
      return new DOMMatrix([
        ctm.a,
        ctm.b,
        ctm.c,
        ctm.d,
        ctm.e,
        ctm.f,
      ]);
    } catch (error) {
      return null;
    }
  }

  applyMatrix(point, matrix) {
    if (!matrix) return { x: point.x, y: point.y };
    const domPoint = new DOMPoint(point.x, point.y);
    const transformed = domPoint.matrixTransform(matrix);
    return { x: transformed.x, y: transformed.y };
  }

  distance(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.hypot(dx, dy);
  }

  formatNumber(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "0";
    return number.toFixed(3);
  }

  getNumber(id, fallback) {
    const element = document.getElementById(id);
    if (!element) return fallback;
    const value = parseFloat(element.value);
    return Number.isFinite(value) ? value : fallback;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  window.svgToGcodeTool = new SvgToGcodeTool();
});
