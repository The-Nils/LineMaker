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

    this.bindEvents();
    this.updateButtons();
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

  recompute() {
    if (!this.sourceSvgMarkup) return;

    try {
      const { polylines, bounds } = this.extractGeometry();
      this.polylines = polylines;

      if (polylines.length === 0) {
        this.resetPreview();
        this.showStatus("No drawable elements found in SVG.", "error");
        return;
      }

      const transformed = this.transformPolylines(polylines, bounds);
      const lines = this.polylinesToSegments(transformed.polylines);
      this.lines = lines;

      const toolpath = this.generateToolpath(lines, transformed.bounds);

      this.generatedGcode = toolpath.gcode;
      this.previewSvgMarkup = this.buildPreviewSvg(
        transformed.polylines,
        transformed.bounds,
        toolpath.penDownEvents,
        toolpath.penUpEvents
      );

      this.renderPreview(toolpath, transformed.bounds);
      this.updateStats(transformed.polylines.length, lines.length, toolpath);
      this.showStatus("Toolpath updated.", "complete");
      this.updateButtons();
      this.interactiveCanvas.fitToContent();
    } catch (error) {
      console.error(error);
      this.showStatus("Failed to generate toolpath.", "error");
      this.resetPreview();
    }
  }

  extractGeometry() {
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

    const elements = svg.querySelectorAll(
      "path, line, polyline, polygon, rect, circle, ellipse"
    );

    const polylines = [];

    elements.forEach((element) => {
      const tag = element.tagName.toLowerCase();
      let curves = [];
      switch (tag) {
        case "path":
          curves = this.convertPath(element, segmentLengthSvg);
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
    });

    this.sandbox.innerHTML = "";

    const bounds = this.computeBounds(polylines);

    return { polylines, bounds };
  }

  transformPolylines(polylines, originalBounds) {
    const mmPerUnit = Math.max(this.getNumber("mmPerUnitInput", 1), 0.0001);
    const autoOrigin = document.getElementById("autoOriginInput").checked;
    const flipY = document.getElementById("flipYInput").checked;
    const margin = this.getNumber("marginInput", 0);
    const offsetX = this.getNumber("offsetXInput", 0);
    const offsetY = this.getNumber("offsetYInput", 0);

    const scaled = polylines.map((polyline) =>
      polyline.map((point) => ({
        x: point.x * mmPerUnit,
        y: (flipY ? -point.y : point.y) * mmPerUnit,
      }))
    );

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

    const transformed = scaled.map((polyline) =>
      polyline.map((point) => ({
        x: point.x + shiftX,
        y: point.y + shiftY,
      }))
    );

    const transformedBounds = this.computeBounds(transformed);

    return {
      polylines: transformed,
      bounds: transformedBounds,
      originalBounds,
    };
  }

  polylinesToSegments(polylines) {
    const segments = [];
    polylines.forEach((polyline, pathIndex) => {
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
      }
    });
    return segments;
  }

  generateToolpath(segments, bounds) {
    if (!segments.length) {
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
    const preventZhop = this.getNumber("preventZhopInput", 3);
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

    const orderedSegments = optimize
      ? GCodeGenerator.optimizeLineOrder(segments, startX, startY)
      : [...segments];

    const draws = [];
    const travels = [];
    const penDownEvents = [];
    const penUpEvents = [];
    let drawLength = 0;
    let travelLength = 0;

    let currentX = startX;
    let currentY = startY;
    let penIsDown = false;

    orderedSegments.forEach((segment) => {
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
    });

    if (penIsDown) {
      penUpEvents.push({ x: currentX, y: currentY });
      penIsDown = false;
    }
    generator.ensurePenUp({ force: true, feedRate: travelRate });
    generator.finishProgram();

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

  renderPreview(toolpath, bounds) {
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

    const viewBox = `${Math.floor(bounds.minX)} ${Math.floor(
      bounds.minY
    )} ${Math.ceil(bounds.maxX - bounds.minX || 1)} ${Math.ceil(
      bounds.maxY - bounds.minY || 1
    )}`;
    this.previewSvg.setAttribute("viewBox", viewBox);

    const arrowSize = this.computeArrowSize(bounds);

    toolpath.travels.forEach((segment) => {
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", segment[0].x);
      line.setAttribute("y1", segment[0].y);
      line.setAttribute("x2", segment[1].x);
      line.setAttribute("y2", segment[1].y);
      this.travelGroup.appendChild(line);
    });

    toolpath.draws.forEach((segment) => {
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", segment[0].x);
      line.setAttribute("y1", segment[0].y);
      line.setAttribute("x2", segment[1].x);
      line.setAttribute("y2", segment[1].y);
      this.drawGroup.appendChild(line);
    });

    const penUpEvents = toolpath.penUpEvents || [];
    if (this.penUpGroup) {
      penUpEvents.forEach((point) => {
        this.addArrowMarker(this.penUpGroup, point, "up", arrowSize);
      });
    }

    const penDownEvents = toolpath.penDownEvents || [];
    if (this.penDownGroup) {
      penDownEvents.forEach((point) => {
        this.addArrowMarker(this.penDownGroup, point, "down", arrowSize);
      });
    }
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
    this.status.textContent = message;
    this.status.className = "status-notification";
    this.status.classList.add("show");
    this.status.classList.add(type);

    clearTimeout(this.statusTimer);
    this.statusTimer = setTimeout(() => {
      this.status.classList.remove("show");
    }, 2500);
  }

  convertPath(element, segmentLengthSvg) {
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
