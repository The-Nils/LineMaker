class PipeMazeGenerator {
  constructor() {
    this.settings = {
      seed: 12345,
      gridSize: 15,
      complexity: 70,
      placementMode: "random",
      startX: 0,
      startY: 0,
      endX: 14,
      endY: 14,
      canvasWidth: 200,
      canvasHeight: 200,
      penDiameter: 0.5,
      feedRate: 2500,
      penDownZ: -1,
      penUpZ: 2,
      preventZhop: 2,
      showSolution: false,
      showRawPath: false,
    };

    this.layers = [];
    this.currentLayerId = null;
    this.layerIdCounter = 1;

    this.maze = null;
    this.startPoint = null;
    this.endPoint = null;

    this.pixelsPerMm = 4;
    this.svg = null;
    this.interactiveCanvas = null;
    this.configManager = null;

    // Pipe sections will be loaded from external SVG files
    this.pipeSections = {
      N: { path: "", connections: ["N"] },
      NS: { path: "", connections: ["N", "S"] },
      NE: { path: "", connections: ["N", "E"] },
      NSE: { path: "", connections: ["N", "S", "E"] },
      NSEW: { path: "", connections: ["N", "S", "E", "W"] },
    };

    // Will be set to true once all sections are loaded
    this.sectionsLoaded = false;

    this.currentPipeEditor = null;
    this.isDrawingPipe = false;
    this.pipeDrawingMode = "line";
    this.tempPipePath = null;

    this.loadPipeSections().then(() => {
      this.init();
    });
  }

  async loadPipeSections() {
    const sectionFiles = {
      N: "maze-sections/n.svg",
      NS: "maze-sections/ns.svg",
      NE: "maze-sections/ne.svg",
      NSE: "maze-sections/nse.svg",
      NSEW: "maze-sections/nsew.svg",
    };

    const loadPromises = Object.entries(sectionFiles).map(
      async ([key, filename]) => {
        try {
          const response = await fetch(filename);
          const svgText = await response.text();
          const pathData = this.extractPathFromSVG(svgText);
          this.pipeSections[key].path = pathData;
        } catch (error) {
          console.error(`Failed to load section ${key}:`, error);
          // Fallback to simple paths if loading fails
          this.setFallbackPath(key);
        }
      }
    );

    await Promise.all(loadPromises);
    this.sectionsLoaded = true;
  }

  extractPathFromSVG(svgText) {
    // Parse SVG and extract path elements with class "pipe-drawing-path" (the actual drawing paths)
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(svgText, "image/svg+xml");
    const pathElements = svgDoc.querySelectorAll("path.pipe-drawing-path");

    let combinedPath = "";
    pathElements.forEach((path) => {
      const pathData = path.getAttribute("d");
      if (pathData) {
        if (combinedPath) combinedPath += " ";
        combinedPath += pathData;
      }
    });

    return combinedPath;
  }

  setFallbackPath(key) {
    // Fallback paths in case SVG loading fails
    const fallbacks = {
      N: "M 100 100 L 100 10",
      NS: "M 100 10 L 100 190",
      NE: "M 100 190 L 100 100 L 190 100",
      NSE: "M 100 10 L 100 100 L 190 100 M 100 100 L 100 190",
      NSEW: "M 100 10 L 100 190 M 10 100 L 190 100",
    };
    this.pipeSections[key].path = fallbacks[key] || "";
  }

  init() {
    this.setupDOM();
    this.setupEventListeners();
    this.setupInteractiveCanvas();
    this.setupConfigManager();
    this.addInitialLayer();
    this.syncSettingsFromUI();
    this.updateCanvasSize();

    // Generate initial maze only after sections are loaded
    if (this.sectionsLoaded) {
      this.generateMaze();
    } else {
      console.error("Pipe sections not loaded yet!");
    }
  }

  setupDOM() {
    this.svg = document.getElementById("pipeMazeSvg");
    this.mazeContainer = document.getElementById("maze-container");
    this.mazeInfo = document.getElementById("mazeInfo");

    // Pipe editor elements
    this.pipeModal = document.getElementById("pipeSectionModal");
    this.pipeEditorSvg = document.getElementById("pipeEditorSvg");
    this.pipeEditorTitle = document.getElementById("pipeEditorTitle");
    this.pipeShapeGroup = document.getElementById("pipeShape");
  }

  setupEventListeners() {
    // Main controls
    document
      .getElementById("clearMazeBtn")
      .addEventListener("click", () => this.clearMaze());
    document
      .getElementById("randomSeedBtn")
      .addEventListener("click", () => this.randomizeSeed());

    // Placement mode
    document
      .querySelectorAll('input[name="placementMode"]')
      .forEach((radio) => {
        radio.addEventListener("change", (e) => {
          this.settings.placementMode = e.target.value;
          this.updatePlacementControls();
          this.generateMaze();
        });
      });

    // Settings inputs
    this.setupSettingsListeners();

    // Pipe editor buttons
    document
      .getElementById("editPipeN")
      .addEventListener("click", () => this.openPipeEditor("N"));
    document
      .getElementById("editPipeNS")
      .addEventListener("click", () => this.openPipeEditor("NS"));
    document
      .getElementById("editPipeNE")
      .addEventListener("click", () => this.openPipeEditor("NE"));
    document
      .getElementById("editPipeNSE")
      .addEventListener("click", () => this.openPipeEditor("NSE"));
    document
      .getElementById("editPipeNSEW")
      .addEventListener("click", () => this.openPipeEditor("NSEW"));

    // Modal controls
    this.setupModalListeners();

    // Canvas controls
    document.getElementById("fitToContentBtn").addEventListener("click", () => {
      if (this.interactiveCanvas) this.interactiveCanvas.fitToContent();
    });

    document.getElementById("resetViewBtn").addEventListener("click", () => {
      if (this.interactiveCanvas) this.interactiveCanvas.resetTransform();
    });

    // Layer management
    this.setupLayerListeners();

    // Download functionality
    this.setupDownloadListeners();
  }

  setupSettingsListeners() {
    // Seed
    document.getElementById("seedValue").addEventListener("input", (e) => {
      this.settings.seed = parseInt(e.target.value) || 0;
      this.generateMaze();
    });

    // Grid size
    document.getElementById("gridSizeValue").addEventListener("input", (e) => {
      this.settings.gridSize = parseInt(e.target.value) || 5;
      this.updateManualPlacementLimits();
      this.generateMaze();
    });

    // Complexity
    const complexitySlider = document.getElementById("complexitySlider");
    const complexityValue = document.getElementById("complexityValue");

    complexitySlider.addEventListener("input", (e) => {
      const value = parseFloat(e.target.value);
      complexityValue.value = value;
      this.settings.complexity = value;
      this.generateMaze();
    });

    complexityValue.addEventListener("input", (e) => {
      const value = parseFloat(e.target.value);
      complexitySlider.value = value;
      this.settings.complexity = value;
      this.generateMaze();
    });

    // Canvas size
    document
      .getElementById("canvasWidthValue")
      .addEventListener("input", (e) => {
        this.settings.canvasWidth = parseFloat(e.target.value) || 10;
        this.updateCanvasSize();
      });

    document
      .getElementById("canvasHeightValue")
      .addEventListener("input", (e) => {
        this.settings.canvasHeight = parseFloat(e.target.value) || 10;
        this.updateCanvasSize();
      });

    // Manual placement
    ["startX", "startY", "endX", "endY"].forEach((setting) => {
      const input = document.getElementById(setting + "Value");
      input.addEventListener("input", (e) => {
        this.settings[setting] = parseInt(e.target.value) || 0;
        if (this.settings.placementMode === "manual") {
          this.generateMaze();
        }
      });
    });

    // Other settings
    ["feedRate", "penDownZ", "penUpZ", "preventZhop"].forEach((setting) => {
      const input = document.getElementById(setting + "Value");
      if (input) {
        input.addEventListener("input", (e) => {
          this.settings[setting] = parseFloat(e.target.value) || 0;
        });
      }
    });

    // Pen diameter with style update
    const penDiameterInput = document.getElementById("penDiameterValue");
    if (penDiameterInput) {
      penDiameterInput.addEventListener("input", (e) => {
        this.settings.penDiameter = parseFloat(e.target.value) || 0.5;
        // Update styles when pen diameter changes
        if (this.maze) {
          this.updateDynamicStyles();
        }
      });
    }

    // Show solution checkbox
    document
      .getElementById("showSolutionCheckbox")
      .addEventListener("change", (e) => {
        this.settings.showSolution = e.target.checked;
        if (this.maze) {
          this.renderMaze(); // Re-render to show/hide solution
        }
      });

    // Show raw path checkbox
    document
      .getElementById("showRawPathCheckbox")
      .addEventListener("change", (e) => {
        this.settings.showRawPath = e.target.checked;
        if (this.maze) {
          this.renderMaze(); // Re-render to show/hide raw path
        }
      });
  }

  setupModalListeners() {
    // Close modal
    document
      .querySelector("#pipeSectionModal .close-button")
      .addEventListener("click", () => {
        this.closePipeEditor();
      });

    // Connection point toggles
    ["N", "E", "S", "W"].forEach((dir) => {
      document.getElementById(`conn${dir}`).addEventListener("change", (e) => {
        this.updateConnectionPoint(dir, e.target.checked);
      });
    });

    // Drawing tools
    document.getElementById("drawLineBtn").addEventListener("click", () => {
      this.pipeDrawingMode = "line";
      this.updateDrawingMode();
    });

    document.getElementById("drawCurveBtn").addEventListener("click", () => {
      this.pipeDrawingMode = "curve";
      this.updateDrawingMode();
    });

    document.getElementById("clearShapeBtn").addEventListener("click", () => {
      this.clearPipeShape();
    });

    // Save/Reset buttons
    document.getElementById("savePipeBtn").addEventListener("click", () => {
      this.savePipeShape();
    });

    document.getElementById("resetPipeBtn").addEventListener("click", () => {
      this.resetPipeToDefault();
    });

    // Template and import buttons
    document
      .getElementById("downloadTemplateBtn")
      .addEventListener("click", () => {
        this.downloadTemplate();
      });

    document.getElementById("importSvgBtn").addEventListener("click", () => {
      document.getElementById("importSvgInput").click();
    });

    document
      .getElementById("importSvgInput")
      .addEventListener("change", (e) => {
        this.importSVG(e);
      });

    // Pipe editor SVG drawing
    this.pipeEditorSvg.addEventListener("mousedown", (e) =>
      this.startPipeDrawing(e)
    );
    this.pipeEditorSvg.addEventListener("mousemove", (e) =>
      this.continuePipeDrawing(e)
    );
    this.pipeEditorSvg.addEventListener("mouseup", (e) =>
      this.endPipeDrawing(e)
    );
  }

  setupLayerListeners() {
    document
      .getElementById("addLayerBtn")
      .addEventListener("click", () => this.addLayer());
  }

  setupDownloadListeners() {
    // SVG downloads
    document.getElementById("svgDownloadBtn").addEventListener("click", (e) => {
      e.preventDefault();
      const dropdown = document.getElementById("svgDropdown");
      dropdown.style.display =
        dropdown.style.display === "block" ? "none" : "block";
    });

    document.getElementById("downloadSvgBtn").addEventListener("click", (e) => {
      e.preventDefault();
      this.downloadSVG(false);
    });

    document
      .getElementById("downloadIndividualSvgBtn")
      .addEventListener("click", (e) => {
        e.preventDefault();
        this.downloadSVG(true);
      });

    // G-code downloads
    document
      .getElementById("gcodeDownloadBtn")
      .addEventListener("click", (e) => {
        e.preventDefault();
        const dropdown = document.getElementById("gcodeDropdown");
        dropdown.style.display =
          dropdown.style.display === "block" ? "none" : "block";
      });

    document
      .getElementById("downloadGcodeBtn")
      .addEventListener("click", (e) => {
        e.preventDefault();
        this.downloadGCode(false);
      });

    document
      .getElementById("downloadIndividualGcodeBtn")
      .addEventListener("click", (e) => {
        e.preventDefault();
        this.downloadGCode(true);
      });

    // Close dropdowns when clicking outside
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".download-dropdown")) {
        document.getElementById("svgDropdown").style.display = "none";
        document.getElementById("gcodeDropdown").style.display = "none";
      }
    });
  }

  setupInteractiveCanvas() {
    // Set up InteractiveCanvas like kaleidoscope does
    this.previewArea = document.querySelector(".preview-area");
    this.interactiveCanvas = new InteractiveCanvas(this.previewArea);
  }

  setupConfigManager() {
    this.configManager = new ConfigManager("pipeMazeSettings", this.settings);

    // Add save/load listeners
    document.getElementById("saveConfigBtn").addEventListener("click", () => {
      this.configManager.saveConfig(this.getAllSettings());
    });

    document.getElementById("loadConfigBtn").addEventListener("click", () => {
      this.configManager.loadConfig((config) => {
        this.applyLoadedConfig(config);
      });
    });
  }

  // Maze Generation Algorithm - Walking Fill Algorithm
  generateMaze() {
    this.seedRandom(this.settings.seed);

    const size = this.settings.gridSize;
    this.maze = Array(size)
      .fill(null)
      .map(() =>
        Array(size)
          .fill(null)
          .map(() => ({
            connections: [],
            visited: false,
            type: null,
            isEmpty: true,
          }))
      );

    // Set start and end points first
    this.setStartEndPoints();

    // Generate maze using walking fill algorithm
    this.generateWalkingFillMaze();

    // Determine pipe types for each cell
    this.determinePipeTypes();

    // Render the maze
    this.renderMaze();

    this.updateMazeInfo();
  }

  generateWalkingFillMaze() {
    // Go back to simple recursive backtracking that fills the entire grid
    const size = this.settings.gridSize;

    // Initialize all cells
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        this.maze[y][x].visited = false;
        this.maze[y][x].isEmpty = true;
        this.maze[y][x].connections = [];
      }
    }

    // Start recursive backtracking from the start point
    this.recursiveBacktrack(this.startPoint.x, this.startPoint.y);

    // Mark all visited cells as not empty
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (this.maze[y][x].visited) {
          this.maze[y][x].isEmpty = false;
        }
      }
    }
  }

  recursiveBacktrack(x, y, previousDirection = null) {
    // Mark current cell as visited
    this.maze[y][x].visited = true;

    // Get all unvisited neighbors
    const neighbors = this.getUnvisitedNeighbors(x, y);
    
    // Apply complexity-based direction selection
    const orderedNeighbors = this.orderNeighborsByComplexity(neighbors, previousDirection);

    // Visit each unvisited neighbor in complexity-ordered sequence
    for (const neighborInfo of orderedNeighbors) {
      const neighbor = neighborInfo.neighbor;
      if (!this.maze[neighbor.y][neighbor.x].visited) {
        // Connect current cell to neighbor
        this.connectCells({ x, y }, neighbor);

        // Recursively visit the neighbor, passing the direction we're going
        this.recursiveBacktrack(neighbor.x, neighbor.y, neighborInfo.direction);
      }
    }
  }

  getUnvisitedNeighbors(x, y) {
    const size = this.settings.gridSize;
    const neighbors = [];
    const directions = [
      { dx: 0, dy: -1, name: "N" }, // North
      { dx: 1, dy: 0, name: "E" }, // East
      { dx: 0, dy: 1, name: "S" }, // South
      { dx: -1, dy: 0, name: "W" }, // West
    ];

    directions.forEach((dir) => {
      const newX = x + dir.dx;
      const newY = y + dir.dy;

      if (newX >= 0 && newX < size && newY >= 0 && newY < size) {
        if (!this.maze[newY][newX].visited) {
          neighbors.push({ 
            neighbor: { x: newX, y: newY },
            direction: dir.name
          });
        }
      }
    });

    return neighbors;
  }

  orderNeighborsByComplexity(neighbors, previousDirection) {
    const complexity = (this.settings.complexity - 1) / 99; // Convert 1-100 to 0-1 range
    
    if (neighbors.length === 0) return [];
    
    // Calculate preference weights for each direction using continuous complexity value
    const weightedNeighbors = neighbors.map(neighborInfo => {
      let weight = this.seededRandom();
      
      if (previousDirection) {
        const isSameDirection = neighborInfo.direction === previousDirection;
        const isOppositeDirection = this.getOppositeDirection(previousDirection) === neighborInfo.direction;
        
        // Directly scale preferences based on complexity value (0.0 to 1.0)
        // Low complexity (0.0): heavily favor straight paths
        // High complexity (1.0): heavily favor turns
        
        if (isSameDirection) {
          // Continuing straight - weight decreases as complexity increases
          weight += (1 - complexity) * 3;
        } else if (!isOppositeDirection) {
          // Turning - weight increases as complexity increases  
          weight += complexity * 3;
        } else {
          // Going backwards - always penalize
          weight -= 2;
        }
      }
      
      return { ...neighborInfo, weight };
    });
    
    // Sort by weight with small random factor
    weightedNeighbors.sort((a, b) => {
      const randomFactor = (this.seededRandom() - 0.5) * 0.2;
      return (b.weight - a.weight) + randomFactor;
    });
    
    return weightedNeighbors;
  }

  shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(this.seededRandom() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }

  hasUnvisitedCells() {
    const size = this.settings.gridSize;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (!this.maze[y][x].inMaze) {
          return true;
        }
      }
    }
    return false;
  }

  getRandomUnvisitedCell() {
    const size = this.settings.gridSize;
    const unvisited = [];

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (!this.maze[y][x].inMaze) {
          unvisited.push({ x, y });
        }
      }
    }

    if (unvisited.length === 0) return null;

    // Prioritize the end point if it's still unvisited
    const endPointUnvisited = unvisited.find(
      (cell) => cell.x === this.endPoint.x && cell.y === this.endPoint.y
    );

    if (endPointUnvisited) {
      return endPointUnvisited;
    }

    return unvisited[Math.floor(this.seededRandom() * unvisited.length)];
  }

  loopErasedRandomWalk(start) {
    const path = [];
    const pathSet = new Set(); // Track positions in current path
    let current = start;

    while (true) {
      const key = `${current.x},${current.y}`;

      // If we've hit a cell already in the maze, we're done
      if (this.maze[current.y][current.x].inMaze) {
        path.push(current);
        break;
      }

      // If we've hit a cell already in our current path, erase the loop
      if (pathSet.has(key)) {
        // Find where the loop starts and erase everything after it
        const loopStartIndex = path.findIndex((p) => `${p.x},${p.y}` === key);

        // Remove all cells after the loop start from path and pathSet
        for (let i = loopStartIndex + 1; i < path.length; i++) {
          pathSet.delete(`${path[i].x},${path[i].y}`);
        }
        path.splice(loopStartIndex + 1);
      } else {
        // Add current cell to path
        pathSet.add(key);
        path.push(current);
      }

      // Move to random neighbor
      current = this.getRandomNeighbor(current);
      if (!current) {
        break;
      }
    }

    return path;
  }

  getRandomNeighbor(cell) {
    const size = this.settings.gridSize;
    const directions = [
      { dx: 0, dy: -1 }, // North
      { dx: 1, dy: 0 }, // East
      { dx: 0, dy: 1 }, // South
      { dx: -1, dy: 0 }, // West
    ];

    const neighbors = [];

    directions.forEach((dir) => {
      const newX = cell.x + dir.dx;
      const newY = cell.y + dir.dy;

      if (newX >= 0 && newX < size && newY >= 0 && newY < size) {
        neighbors.push({ x: newX, y: newY });
      }
    });

    if (neighbors.length === 0) return null;

    return neighbors[Math.floor(this.seededRandom() * neighbors.length)];
  }

  addPathToMaze(path) {
    // Add all cells in path to maze
    for (let i = 0; i < path.length; i++) {
      const cell = path[i];
      this.maze[cell.y][cell.x].inMaze = true;
      this.maze[cell.y][cell.x].isEmpty = false;
      this.maze[cell.y][cell.x].visited = true;
    }

    // Connect adjacent cells in path
    for (let i = 0; i < path.length - 1; i++) {
      this.connectCells(path[i], path[i + 1]);
    }
    // Debug: Check connections of start and end points if they're in this path
  }

  getNeighborInDirection(x, y, direction) {
    const size = this.settings.gridSize;
    const directions = {
      N: { dx: 0, dy: -1 },
      E: { dx: 1, dy: 0 },
      S: { dx: 0, dy: 1 },
      W: { dx: -1, dy: 0 },
    };

    const delta = directions[direction];
    if (!delta) return null;

    const nx = x + delta.dx;
    const ny = y + delta.dy;

    if (nx >= 0 && nx < size && ny >= 0 && ny < size) {
      return { x: nx, y: ny };
    }

    return null;
  }

  connectCells(cell1, cell2) {
    const dx = cell2.x - cell1.x;
    const dy = cell2.y - cell1.y;

    // Determine directions
    let dir1, dir2;

    if (dx === 1) {
      // cell2 is east of cell1
      dir1 = "E";
      dir2 = "W";
    } else if (dx === -1) {
      // cell2 is west of cell1
      dir1 = "W";
      dir2 = "E";
    } else if (dy === 1) {
      // cell2 is south of cell1
      dir1 = "S";
      dir2 = "N";
    } else if (dy === -1) {
      // cell2 is north of cell1
      dir1 = "N";
      dir2 = "S";
    } else {
      return; // Not adjacent
    }

    // Add connections if not already present
    const cellA = this.maze[cell1.y][cell1.x];
    const cellB = this.maze[cell2.y][cell2.x];

    if (!cellA.connections.includes(dir1)) {
      cellA.connections.push(dir1);
    }

    if (!cellB.connections.includes(dir2)) {
      cellB.connections.push(dir2);
    }
  }

  seedRandom(seed) {
    this._seed = seed;
  }

  seededRandom() {
    this._seed = (this._seed * 9301 + 49297) % 233280;
    return this._seed / 233280;
  }

  setStartEndPoints() {
    const size = this.settings.gridSize;

    if (this.settings.placementMode === "random") {
      // Random placement on edges only
      this.startPoint = this.getRandomEdgePoint();

      do {
        this.endPoint = this.getRandomEdgePoint();
      } while (
        this.endPoint.x === this.startPoint.x &&
        this.endPoint.y === this.startPoint.y
      );
    } else {
      // Manual placement - force to nearest edge
      this.startPoint = this.forceToEdge({
        x: Math.max(0, Math.min(size - 1, this.settings.startX)),
        y: Math.max(0, Math.min(size - 1, this.settings.startY)),
      });

      this.endPoint = this.forceToEdge({
        x: Math.max(0, Math.min(size - 1, this.settings.endX)),
        y: Math.max(0, Math.min(size - 1, this.settings.endY)),
      });
    }
  }

  getRandomEdgePoint() {
    const size = this.settings.gridSize;
    const edges = [];

    // Top edge
    for (let x = 0; x < size; x++) {
      edges.push({ x, y: 0 });
    }

    // Bottom edge
    for (let x = 0; x < size; x++) {
      edges.push({ x, y: size - 1 });
    }

    // Left edge (excluding corners already added)
    for (let y = 1; y < size - 1; y++) {
      edges.push({ x: 0, y });
    }

    // Right edge (excluding corners already added)
    for (let y = 1; y < size - 1; y++) {
      edges.push({ x: size - 1, y });
    }

    return edges[Math.floor(this.seededRandom() * edges.length)];
  }

  forceToEdge(point) {
    const size = this.settings.gridSize;

    // Calculate distance to each edge
    const distToTop = point.y;
    const distToBottom = size - 1 - point.y;
    const distToLeft = point.x;
    const distToRight = size - 1 - point.x;

    // Find minimum distance
    const minDist = Math.min(distToTop, distToBottom, distToLeft, distToRight);

    // Move to nearest edge
    if (minDist === distToTop) {
      return { x: point.x, y: 0 };
    } else if (minDist === distToBottom) {
      return { x: point.x, y: size - 1 };
    } else if (minDist === distToLeft) {
      return { x: 0, y: point.y };
    } else {
      return { x: size - 1, y: point.y };
    }
  }

  determinePipeTypes() {
    const size = this.settings.gridSize;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const cell = this.maze[y][x];
        const connectionCount = cell.connections.length;
        const connections = cell.connections.sort();

        if (connectionCount === 0) {
          cell.type = null; // Empty cell
        } else if (connectionCount === 1) {
          cell.type = "N"; // End cap (will be rotated)
        } else if (connectionCount === 2) {
          if (
            (connections.includes("N") && connections.includes("S")) ||
            (connections.includes("E") && connections.includes("W"))
          ) {
            cell.type = "NS"; // Straight pipe (will be rotated)
          } else {
            cell.type = "NE"; // 90° corner (will be rotated)
          }
        } else if (connectionCount === 3) {
          cell.type = "NSE"; // T-shape (will be rotated)
        } else if (connectionCount === 4) {
          cell.type = "NSEW"; // Cross
        }
      }
    }

    // Dead ends are now properly generated as part of the maze structure
    // No need to override existing cells
  }

  getOppositeDirection(dir) {
    const opposites = {
      N: "S",
      S: "N",
      E: "W",
      W: "E",
    };
    return opposites[dir];
  }

  recalculateCellType(x, y) {
    const cell = this.maze[y][x];
    const connectionCount = cell.connections.length;
    const connections = cell.connections.sort();

    if (connectionCount === 0) {
      cell.type = null;
    } else if (connectionCount === 1) {
      cell.type = "N"; // End cap
    } else if (connectionCount === 2) {
      if (
        (connections.includes("N") && connections.includes("S")) ||
        (connections.includes("E") && connections.includes("W"))
      ) {
        cell.type = "NS"; // Straight pipe
      } else {
        cell.type = "NE"; // 90° corner
      }
    } else if (connectionCount === 3) {
      cell.type = "NSE"; // T-shape
    } else if (connectionCount === 4) {
      cell.type = "NSEW"; // Cross
    }
  }

  renderMaze() {
    // Clear existing maze
    this.mazeContainer.innerHTML = "";

    // Update dynamic styles for layers
    this.updateDynamicStyles();

    const size = this.settings.gridSize;
    const cellSize = (this.settings.canvasWidth * this.pixelsPerMm) / size;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const cell = this.maze[y][x];
        // Render all visited cells (part of the maze)
        if (cell.visited && cell.type) {
          this.renderPipeCell(x, y, cell, cellSize);
        }
      }
    }

    // Render start and end markers
    this.renderMarkers(cellSize);

    // Render raw path if enabled
    if (this.settings.showRawPath) {
      this.renderRawPath(cellSize);
    }

    // Render solution if enabled
    if (this.settings.showSolution) {
      this.renderSolution(cellSize);
    }
  }

  renderPipeCell(x, y, cell, cellSize) {
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    group.setAttribute(
      "transform",
      `translate(${x * cellSize}, ${y * cellSize})`
    );

    // Get pipe section
    const pipeSection = this.pipeSections[cell.type];
    if (!pipeSection) return;

    // Calculate rotation based on connections
    const rotation = this.calculatePipeRotation(cell.connections, cell.type);

    // Scale pipe to fit cell
    const scale = cellSize / 200; // Pipe sections are designed in 200x200 space

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", pipeSection.path);

    // Apply layer-specific class for styling
    let pathClass = "maze-pipe";
    if (this.currentLayerId) {
      pathClass += ` maze-pipe-${this.currentLayerId}`;
    }
    path.setAttribute("class", pathClass);

    path.setAttribute(
      "transform",
      `scale(${scale}) rotate(${rotation} 100 100)`
    );

    group.appendChild(path);
    this.mazeContainer.appendChild(group);
  }

  updateDynamicStyles() {
    // Remove existing dynamic style element
    const existingStyle = document.getElementById("maze-dynamic-styles");
    if (existingStyle) {
      existingStyle.remove();
    }

    // Create new style element
    const styleElement = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "style"
    );
    styleElement.setAttribute("id", "maze-dynamic-styles");

    let cssRules = "";

    // Calculate the actual stroke width that accounts for scaling
    const cellSize =
      (this.settings.canvasWidth * this.pixelsPerMm) / this.settings.gridSize;
    const scale = cellSize / 200;
    const actualStrokeWidth =
      (this.settings.penDiameter * this.pixelsPerMm) / scale;

    // Create styles for each layer
    this.layers.forEach((layer) => {
      cssRules += `
        .maze-pipe-${layer.id} {
          stroke: ${layer.color};
          fill: none;
          stroke-width: ${actualStrokeWidth}px;
          stroke-linecap: round;
          stroke-linejoin: round;
        }
      `;
    });

    styleElement.textContent = cssRules;

    // Add style to SVG defs (or create defs if it doesn't exist)
    let defs = this.svg.querySelector("defs");
    if (!defs) {
      defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
      this.svg.insertBefore(defs, this.svg.firstChild);
    }
    defs.appendChild(styleElement);
  }

  calculatePipeRotation(connections, type) {
    // Calculate rotation needed to align pipe section with connections
    const sortedConnections = connections.sort().join("");

    const rotationMap = {
      N: { N: 0, E: 90, S: 180, W: 270 },
      NS: { NS: 0, EW: 90 },
      NE: { EN: 0, ES: 90, SW: 180, NW: 270 },
      NSE: {
        ENS: 0,
        ESW: 90,
        NSW: 180,
        ENW: 270,
      },
      NSEW: { ENSW: 0 },
    };

    const typeMap = rotationMap[type];
    const rotation = typeMap ? typeMap[sortedConnections] || 0 : 0;

    return rotation;
  }

  renderMarkers(cellSize) {
    // Start marker
    const startMarker = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "circle"
    );
    startMarker.setAttribute("cx", this.startPoint.x * cellSize + cellSize / 2);
    startMarker.setAttribute("cy", this.startPoint.y * cellSize + cellSize / 2);
    startMarker.setAttribute("r", cellSize / 4);
    startMarker.setAttribute("class", "maze-start");
    this.mazeContainer.appendChild(startMarker);

    // End marker
    const endMarker = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "circle"
    );
    endMarker.setAttribute("cx", this.endPoint.x * cellSize + cellSize / 2);
    endMarker.setAttribute("cy", this.endPoint.y * cellSize + cellSize / 2);
    endMarker.setAttribute("r", cellSize / 4);
    endMarker.setAttribute("class", "maze-end");
    this.mazeContainer.appendChild(endMarker);
  }

  findSolutionPath() {
    if (!this.startPoint || !this.endPoint) {
      return [];
    }

    // Use BFS to find path from start to end
    const size = this.settings.gridSize;
    const visited = Array(size)
      .fill(null)
      .map(() => Array(size).fill(false));
    const parent = Array(size)
      .fill(null)
      .map(() => Array(size).fill(null));
    const queue = [this.startPoint];

    visited[this.startPoint.y][this.startPoint.x] = true;

    while (queue.length > 0) {
      const current = queue.shift();

      // Found end point
      if (current.x === this.endPoint.x && current.y === this.endPoint.y) {
        return this.reconstructPath(parent);
      }

      // Check all connected neighbors
      const cell = this.maze[current.y][current.x];
      if (!cell || !cell.connections) {
        continue;
      }

      cell.connections.forEach((direction) => {
        const neighbor = this.getNeighborInDirection(
          current.x,
          current.y,
          direction
        );
        if (neighbor && !visited[neighbor.y][neighbor.x]) {
          visited[neighbor.y][neighbor.x] = true;
          parent[neighbor.y][neighbor.x] = current;
          queue.push(neighbor);
        }
      });
    }

    return []; // No path found
  }

  reconstructPath(parent) {
    const path = [];
    let current = this.endPoint;

    while (current) {
      path.unshift(current);
      current = parent[current.y][current.x];
    }

    return path;
  }

  renderSolution(cellSize) {
    const solutionPath = this.findSolutionPath();

    if (solutionPath.length < 2) {
      return;
    }

    // Create solution path as a red line
    const pathElement = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "path"
    );
    let pathData = "";

    for (let i = 0; i < solutionPath.length; i++) {
      const cell = solutionPath[i];
      const x = cell.x * cellSize + cellSize / 2;
      const y = cell.y * cellSize + cellSize / 2;

      if (i === 0) {
        pathData += `M ${x} ${y}`;
      } else {
        pathData += ` L ${x} ${y}`;
      }
    }

    pathElement.setAttribute("d", pathData);
    pathElement.setAttribute("stroke", "#ff0000");
    pathElement.setAttribute("stroke-width", "4"); // Made thicker for visibility
    pathElement.setAttribute("fill", "none");
    pathElement.setAttribute("class", "maze-solution");
    pathElement.setAttribute("stroke-linecap", "round");
    pathElement.setAttribute("stroke-linejoin", "round");

    this.mazeContainer.appendChild(pathElement);
  }

  renderRawPath(cellSize) {
    const size = this.settings.gridSize;

    // Show raw path connections as thin blue lines
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const cell = this.maze[y][x];
        if (cell.visited) {
          // Draw connections from this cell
          cell.connections.forEach((direction) => {
            const neighbor = this.getNeighborInDirection(x, y, direction);
            if (neighbor) {
              // Only draw each connection once (avoid duplicates)
              if (direction === "E" || direction === "S") {
                const x1 = x * cellSize + cellSize / 2;
                const y1 = y * cellSize + cellSize / 2;
                const x2 = neighbor.x * cellSize + cellSize / 2;
                const y2 = neighbor.y * cellSize + cellSize / 2;

                const line = document.createElementNS(
                  "http://www.w3.org/2000/svg",
                  "line"
                );
                line.setAttribute("x1", x1);
                line.setAttribute("y1", y1);
                line.setAttribute("x2", x2);
                line.setAttribute("y2", y2);
                line.setAttribute("stroke", "#0066ff");
                line.setAttribute("stroke-width", "1");
                line.setAttribute("class", "maze-raw-path");
                line.setAttribute("opacity", "0.6");

                this.mazeContainer.appendChild(line);
              }
            }
          });

          // Mark path cells with small blue dots
          const dot = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "circle"
          );
          dot.setAttribute("cx", x * cellSize + cellSize / 2);
          dot.setAttribute("cy", y * cellSize + cellSize / 2);
          dot.setAttribute("r", "2");
          dot.setAttribute("fill", "#0066ff");
          dot.setAttribute("class", "maze-raw-path-dot");
          dot.setAttribute("opacity", "0.8");

          this.mazeContainer.appendChild(dot);
        }
      }
    }
  }

  clearMaze() {
    this.mazeContainer.innerHTML = "";
    this.maze = null;
    this.startPoint = null;
    this.endPoint = null;
    this.updateMazeInfo();
  }

  randomizeSeed() {
    const newSeed = Math.floor(Math.random() * 1000000);
    this.settings.seed = newSeed;
    document.getElementById("seedValue").value = newSeed;
    this.generateMaze();
  }

  updatePlacementControls() {
    const manualControls = document.getElementById("manualPlacementControls");
    manualControls.style.display =
      this.settings.placementMode === "manual" ? "block" : "none";
  }

  updateManualPlacementLimits() {
    const max = this.settings.gridSize - 1;
    ["startX", "startY", "endX", "endY"].forEach((setting) => {
      const input = document.getElementById(setting + "Value");
      input.setAttribute("max", max);
    });
  }

  updateCanvasSize() {
    const widthMm = this.settings.canvasWidth;
    const heightMm = this.settings.canvasHeight;
    const widthPx = Math.round(widthMm * this.pixelsPerMm);
    const heightPx = Math.round(heightMm * this.pixelsPerMm);

    this.width = widthPx;
    this.height = heightPx;

    // Update SVG dimensions
    this.svg.setAttribute("viewBox", `0 0 ${widthPx} ${heightPx}`);
    this.svg.setAttribute("width", widthPx);
    this.svg.setAttribute("height", heightPx);
  }

  updateMazeInfo() {
    if (this.maze) {
      const totalCells = this.settings.gridSize * this.settings.gridSize;
      const filledCells = this.maze
        .flat()
        .filter((cell) => cell.visited).length;
      this.mazeInfo.textContent = `Maze: ${this.settings.gridSize}×${this.settings.gridSize} grid, ${filledCells}/${totalCells} cells with pipes`;
    } else {
      this.mazeInfo.textContent = "Click Generate Maze to create a new puzzle";
    }
  }

  // Pipe Section Editor Methods
  openPipeEditor(pipeType) {
    this.currentPipeEditor = pipeType;
    this.pipeEditorTitle.textContent = `Edit ${this.getPipeTypeName(pipeType)}`;

    // Set connection checkboxes
    const section = this.pipeSections[pipeType];
    ["N", "E", "S", "W"].forEach((dir) => {
      const checkbox = document.getElementById(`conn${dir}`);
      checkbox.checked = section.connections.includes(dir);
      this.updateConnectionPoint(dir, checkbox.checked);
    });

    // Load current pipe shape
    this.loadPipeShape(pipeType);

    this.pipeModal.style.display = "block";
  }

  closePipeEditor() {
    this.pipeModal.style.display = "none";
    this.currentPipeEditor = null;
    this.isDrawingPipe = false;
    this.tempPipePath = null;
  }

  getPipeTypeName(type) {
    const names = {
      N: "End Cap (N)",
      NS: "Straight Pipe (NS)",
      NE: "90° Corner (NE)",
      NSE: "T-Shape (NSE)",
      NSEW: "Cross (NSEW)",
    };
    return names[type] || type;
  }

  updateConnectionPoint(direction, isActive) {
    const point = this.pipeEditorSvg.querySelector(
      `[data-direction="${direction}"]`
    );
    if (point) {
      point.classList.toggle("active", isActive);
    }
  }

  loadPipeShape(pipeType) {
    this.pipeShapeGroup.innerHTML = "";
    const section = this.pipeSections[pipeType];

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", section.path);
    path.setAttribute("class", "pipe-shape-path");

    this.pipeShapeGroup.appendChild(path);
  }

  updateDrawingMode() {
    this.pipeEditorSvg.className = `drawing-${this.pipeDrawingMode}`;
  }

  startPipeDrawing(e) {
    if (!this.currentPipeEditor) return;

    const rect = this.pipeEditorSvg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 200;
    const y = ((e.clientY - rect.top) / rect.height) * 200;

    this.isDrawingPipe = true;
    this.tempPipePath = { startX: x, startY: y, currentX: x, currentY: y };
  }

  continuePipeDrawing(e) {
    if (!this.isDrawingPipe || !this.tempPipePath) return;

    const rect = this.pipeEditorSvg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 200;
    const y = ((e.clientY - rect.top) / rect.height) * 200;

    this.tempPipePath.currentX = x;
    this.tempPipePath.currentY = y;

    // Update preview line
    this.updateTempPipePath();
  }

  endPipeDrawing() {
    if (!this.isDrawingPipe || !this.tempPipePath) return;

    this.isDrawingPipe = false;

    // Add path to permanent shape
    this.addPathToShape();
    this.tempPipePath = null;
    this.removeTempPipePath();
  }

  updateTempPipePath() {
    // Remove existing temp path
    this.removeTempPipePath();

    // Add new temp path
    const tempPath = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "path"
    );
    const pathData = `M ${this.tempPipePath.startX} ${this.tempPipePath.startY} L ${this.tempPipePath.currentX} ${this.tempPipePath.currentY}`;
    tempPath.setAttribute("d", pathData);
    tempPath.setAttribute("class", "pipe-shape-path");
    tempPath.setAttribute("opacity", "0.5");
    tempPath.setAttribute("id", "temp-pipe-path");

    this.pipeShapeGroup.appendChild(tempPath);
  }

  removeTempPipePath() {
    const tempPath = document.getElementById("temp-pipe-path");
    if (tempPath) {
      tempPath.remove();
    }
  }

  addPathToShape() {
    const existingPaths = this.pipeShapeGroup.querySelectorAll(
      "path:not(#temp-pipe-path)"
    );
    let pathData = "";

    // Combine existing paths
    existingPaths.forEach((path) => {
      const d = path.getAttribute("d");
      if (d) pathData += (pathData ? " " : "") + d;
    });

    // Add new path
    const newPathData = `M ${this.tempPipePath.startX} ${this.tempPipePath.startY} L ${this.tempPipePath.currentX} ${this.tempPipePath.currentY}`;
    pathData += (pathData ? " " : "") + newPathData;

    // Clear and add combined path
    this.pipeShapeGroup.innerHTML = "";
    const combinedPath = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "path"
    );
    combinedPath.setAttribute("d", pathData);
    combinedPath.setAttribute("class", "pipe-shape-path");
    this.pipeShapeGroup.appendChild(combinedPath);
  }

  clearPipeShape() {
    this.pipeShapeGroup.innerHTML = "";
  }

  savePipeShape() {
    if (!this.currentPipeEditor) return;

    const pathElement = this.pipeShapeGroup.querySelector("path");
    if (pathElement) {
      const pathData = pathElement.getAttribute("d");

      // Get active connections
      const connections = [];
      ["N", "E", "S", "W"].forEach((dir) => {
        const checkbox = document.getElementById(`conn${dir}`);
        if (checkbox.checked) {
          connections.push(dir);
        }
      });

      // Update pipe section
      this.pipeSections[this.currentPipeEditor] = {
        path: pathData,
        connections: connections,
      };

      // Re-render maze if it exists
      if (this.maze) {
        this.renderMaze();
      }
    }

    this.closePipeEditor();
  }

  resetPipeToDefault() {
    if (!this.currentPipeEditor) return;

    // Reset to default shapes
    const defaults = {
      N: { path: "M 100 100 L 100 10", connections: ["N"] },
      NS: { path: "M 100 10 L 100 190", connections: ["N", "S"] },
      NSE: {
        path: "M 100 10 L 100 100 L 190 100 M 100 100 L 100 190",
        connections: ["N", "S", "E"],
      },
      NSEW: {
        path: "M 100 10 L 100 190 M 10 100 L 190 100",
        connections: ["N", "S", "E", "W"],
      },
    };

    this.pipeSections[this.currentPipeEditor] =
      defaults[this.currentPipeEditor];
    this.loadPipeShape(this.currentPipeEditor);

    // Update connection checkboxes
    const section = this.pipeSections[this.currentPipeEditor];
    ["N", "E", "S", "W"].forEach((dir) => {
      const checkbox = document.getElementById(`conn${dir}`);
      checkbox.checked = section.connections.includes(dir);
      this.updateConnectionPoint(dir, checkbox.checked);
    });
  }

  // Layer Management
  addInitialLayer() {
    this.addLayer("Maze Layer", "#333333");
  }

  addLayer(name = null, color = null) {
    const layerId = `layer-${this.layerIdCounter++}`;
    const layer = {
      id: layerId,
      name: name || `Layer ${this.layers.length + 1}`,
      color: color || this.getRandomColor(),
      visible: true,
      paths: [],
    };

    this.layers.push(layer);
    this.currentLayerId = layerId;
    this.updateLayersList();
    this.showLayerEditor(layer);

    return layer;
  }

  updateLayersList() {
    const layersList = document.getElementById("layerList");
    layersList.innerHTML = "";

    this.layers.forEach((layer) => {
      const layerItem = document.createElement("div");
      layerItem.className = "layer-item";
      layerItem.innerHTML = `
                <div class="layer-color" style="background-color: ${layer.color}"></div>
                <span class="layer-name">${layer.name}</span>
                <div class="layer-controls">
                    <button class="layer-btn" onclick="pipeMaze.editLayer('${layer.id}')">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                    </button>
                </div>
            `;

      if (this.currentLayerId === layer.id) {
        layerItem.classList.add("active");
      }

      layersList.appendChild(layerItem);
    });
  }

  editLayer(layerId) {
    const layer = this.layers.find((l) => l.id === layerId);
    if (layer) {
      this.currentLayerId = layerId;
      this.showLayerEditor(layer);
      this.updateLayersList();
      // Update styles when switching layers
      if (this.maze) {
        this.updateDynamicStyles();
      }
    }
  }

  showLayerEditor(layer) {
    const editor = document.getElementById("layerEditor");
    const colorIndicator = document.getElementById("currentLayerColor");
    const nameSpan = document.getElementById("currentLayerName");
    const colorInput = document.getElementById("layerColorValue");

    colorIndicator.style.backgroundColor = layer.color;
    nameSpan.textContent = layer.name;
    colorInput.value = layer.color;

    // Update color change listener
    colorInput.onchange = (e) => {
      layer.color = e.target.value;
      this.updateLayersList();
      this.showLayerEditor(layer);
      if (this.maze) this.renderMaze();
    };

    // Update remove button
    document.getElementById("removeCurrentLayerBtn").onclick = () => {
      this.removeLayer(layer.id);
    };

    editor.style.display = "block";
  }

  removeLayer(layerId) {
    if (this.layers.length <= 1) return;

    const layerIndex = this.layers.findIndex((l) => l.id === layerId);
    if (layerIndex !== -1) {
      this.layers.splice(layerIndex, 1);

      if (this.currentLayerId === layerId) {
        this.currentLayerId = this.layers[Math.max(0, layerIndex - 1)].id;
      }

      this.updateLayersList();

      const remainingLayer = this.layers.find(
        (l) => l.id === this.currentLayerId
      );
      if (remainingLayer) {
        this.showLayerEditor(remainingLayer);
      }
    }
  }

  getRandomColor() {
    const colors = [
      "#ff6b35",
      "#f7931e",
      "#ffd23f",
      "#06d6a0",
      "#118ab2",
      "#073b4c",
      "#e63946",
      "#a8dadc",
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  // Configuration Management
  syncSettingsFromUI() {
    this.settings.seed =
      parseInt(document.getElementById("seedValue").value) || 12345;
    this.settings.gridSize =
      parseInt(document.getElementById("gridSizeValue").value) || 15;
    this.settings.complexity =
      parseFloat(document.getElementById("complexityValue").value) || 70;
    this.settings.placementMode =
      document.querySelector('input[name="placementMode"]:checked').value ||
      "random";
    this.settings.startX =
      parseInt(document.getElementById("startXValue").value) || 0;
    this.settings.startY =
      parseInt(document.getElementById("startYValue").value) || 0;
    this.settings.endX =
      parseInt(document.getElementById("endXValue").value) || 14;
    this.settings.endY =
      parseInt(document.getElementById("endYValue").value) || 14;
    this.settings.canvasWidth =
      parseFloat(document.getElementById("canvasWidthValue").value) || 200;
    this.settings.canvasHeight =
      parseFloat(document.getElementById("canvasHeightValue").value) || 200;
    this.settings.penDiameter =
      parseFloat(document.getElementById("penDiameterValue").value) || 0.5;
    this.settings.feedRate =
      parseFloat(document.getElementById("feedRateValue").value) || 2500;
    this.settings.penDownZ =
      parseFloat(document.getElementById("penDownZValue").value) || -1;
    this.settings.penUpZ =
      parseFloat(document.getElementById("penUpZValue").value) || 2;
    this.settings.preventZhop =
      parseFloat(document.getElementById("preventZhopValue").value) || 2;
    this.settings.showSolution = document.getElementById(
      "showSolutionCheckbox"
    ).checked;
    this.settings.showRawPath = document.getElementById(
      "showRawPathCheckbox"
    ).checked;

    this.updatePlacementControls();
    this.updateManualPlacementLimits();
  }

  getAllSettings() {
    return {
      settings: this.settings,
      layers: this.layers,
      currentLayerId: this.currentLayerId,
      pipeSections: this.pipeSections,
    };
  }

  applyLoadedConfig(config) {
    if (config.settings) {
      Object.assign(this.settings, config.settings);

      // Update UI
      document.getElementById("seedValue").value = this.settings.seed;
      document.getElementById("gridSizeValue").value = this.settings.gridSize;
      document.getElementById("complexityValue").value =
        this.settings.complexity;
      document.getElementById("complexitySlider").value =
        this.settings.complexity;
      document.querySelector(
        `input[name="placementMode"][value="${this.settings.placementMode}"]`
      ).checked = true;
      document.getElementById("startXValue").value = this.settings.startX;
      document.getElementById("startYValue").value = this.settings.startY;
      document.getElementById("endXValue").value = this.settings.endX;
      document.getElementById("endYValue").value = this.settings.endY;
      document.getElementById("canvasWidthValue").value =
        this.settings.canvasWidth;
      document.getElementById("canvasHeightValue").value =
        this.settings.canvasHeight;
      document.getElementById("penDiameterValue").value =
        this.settings.penDiameter;
      document.getElementById("feedRateValue").value = this.settings.feedRate;
      document.getElementById("penDownZValue").value = this.settings.penDownZ;
      document.getElementById("penUpZValue").value = this.settings.penUpZ;
      document.getElementById("preventZhopValue").value =
        this.settings.preventZhop;
      document.getElementById("showSolutionCheckbox").checked =
        this.settings.showSolution;
      document.getElementById("showRawPathCheckbox").checked =
        this.settings.showRawPath;
    }

    if (config.layers) {
      this.layers = config.layers;
      this.currentLayerId = config.currentLayerId;
      this.updateLayersList();

      if (this.currentLayerId) {
        const layer = this.layers.find((l) => l.id === this.currentLayerId);
        if (layer) this.showLayerEditor(layer);
      }
    }

    if (config.pipeSections) {
      this.pipeSections = config.pipeSections;
    }

    this.updatePlacementControls();
    this.updateCanvasSize();
  }

  // Export Functions
  downloadSVG(individual) {
    if (!this.maze) {
      alert("Please generate a maze first");
      return;
    }

    if (individual) {
      this.layers.forEach((layer) => {
        const svgContent = this.generateLayerSVG(layer);
        this.downloadFile(
          `pipe-maze-${layer.name.replace(/\s+/g, "-").toLowerCase()}.svg`,
          svgContent,
          "image/svg+xml"
        );
      });
    } else {
      const svgContent = this.generateCombinedSVG();
      this.downloadFile("pipe-maze-combined.svg", svgContent, "image/svg+xml");
    }
  }

  downloadGCode(individual) {
    if (!this.maze) {
      alert("Please generate a maze first");
      return;
    }

    if (individual) {
      this.layers.forEach((layer) => {
        const gcode = this.generateLayerGCode(layer);
        this.downloadFile(
          `pipe-maze-${layer.name.replace(/\s+/g, "-").toLowerCase()}.gcode`,
          gcode,
          "text/plain"
        );
      });
    } else {
      const gcode = this.generateCombinedGCode();
      this.downloadFile("pipe-maze-combined.gcode", gcode, "text/plain");
    }
  }

  generateCombinedSVG() {
    const size = this.settings.gridSize;
    const cellSize = this.settings.canvasWidth / size;
    const svgSize = Math.max(
      this.settings.canvasWidth,
      this.settings.canvasHeight
    );

    let svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${svgSize}mm" height="${svgSize}mm" viewBox="0 0 ${svgSize} ${svgSize}" 
     xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="white"/>
`;

    // Add maze paths for each layer
    this.layers.forEach((layer) => {
      if (layer.visible) {
        svgContent += this.generateMazePathsForLayer(layer, cellSize);
      }
    });

    svgContent += "</svg>";
    return svgContent;
  }

  generateLayerSVG(layer) {
    const size = this.settings.gridSize;
    const cellSize = this.settings.canvasWidth / size;
    const svgSize = Math.max(
      this.settings.canvasWidth,
      this.settings.canvasHeight
    );

    let svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${svgSize}mm" height="${svgSize}mm" viewBox="0 0 ${svgSize} ${svgSize}" 
     xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="white"/>
`;

    svgContent += this.generateMazePathsForLayer(layer, cellSize);
    svgContent += "</svg>";
    return svgContent;
  }

  generateMazePathsForLayer(layer, cellSize) {
    if (!this.maze) return "";

    let pathsContent = "";
    const size = this.settings.gridSize;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const cell = this.maze[y][x];
        if (cell.visited && cell.type) {
          const pipeSection = this.pipeSections[cell.type];
          if (pipeSection) {
            const rotation = this.calculatePipeRotation(
              cell.connections,
              cell.type
            );
            const scale = cellSize / 200;
            const translateX = x * cellSize;
            const translateY = y * cellSize;

            pathsContent += `    <path d="${pipeSection.path}" 
                            fill="none" 
                            stroke="${layer.color}" 
                            stroke-width="${this.settings.penDiameter}" 
                            stroke-linecap="round" 
                            stroke-linejoin="round"
                            transform="translate(${translateX}, ${translateY}) scale(${scale}) rotate(${rotation} 100 100)"/>\n`;
          }
        }
      }
    }

    return pathsContent;
  }

  generateCombinedGCode() {
    let gcode = this.generateGCodeHeader();

    this.layers.forEach((layer) => {
      if (layer.visible) {
        gcode += `\n; Layer: ${layer.name}\n`;
        gcode += this.generateLayerGCodePaths(layer);
      }
    });

    gcode += this.generateGCodeFooter();
    return gcode;
  }

  generateLayerGCode(layer) {
    let gcode = this.generateGCodeHeader();
    gcode += `\n; Layer: ${layer.name}\n`;
    gcode += this.generateLayerGCodePaths(layer);
    gcode += this.generateGCodeFooter();
    return gcode;
  }

  generateLayerGCodePaths(_layer) {
    if (!this.maze) return "";

    // Collect all line segments using hatchmaker approach
    const gcodeLines = [];
    const size = this.settings.gridSize;
    const cellSize = (this.settings.canvasWidth * this.pixelsPerMm) / size;

    // Process each cell to extract line segments
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const cell = this.maze[y][x];
        if (cell.visited && cell.type) {
          const pipeSection = this.pipeSections[cell.type];
          if (pipeSection) {
            const cellLines = this.extractLinesFromCell(pipeSection, x, y, cell, cellSize);
            gcodeLines.push(...cellLines);
          }
        }
      }
    }

    // Convert line segments to G-code using hatchmaker approach
    return this.linesToGCode(gcodeLines);
  }

  extractLinesFromCell(pipeSection, gridX, gridY, cell, cellSize) {
    const lines = [];
    
    // Use the EXACT same approach as SVG generation
    const rotation = this.calculatePipeRotation(cell.connections, cell.type);
    const scale = cellSize / this.pixelsPerMm / 200;  // Convert to mm scale directly
    const translateX = gridX * cellSize / this.pixelsPerMm;  // Convert to mm
    const translateY = gridY * cellSize / this.pixelsPerMm;  // Convert to mm

    // Debug logging for NE segments
    if (cell.type === "NE") {
      console.log(`NE segment at ${gridX},${gridY}: connections=${cell.connections.join(",")}, rotation=${rotation}`);
      console.log(`Scale: ${scale}, translateX: ${translateX}, translateY: ${translateY}`);
    }

    // Parse SVG path into line segments
    const paths = this.parseSVGPath(pipeSection.path);
    
    if (cell.type === "NE") {
      console.log(`NE original paths:`, paths);
    }
    
    paths.forEach(path => {
      if (path.length >= 2) {
        // Apply the SAME transform as SVG: translate(x,y) scale(s) rotate(r, 100, 100)
        const transformedPoints = this.applySVGTransform(path, translateX, translateY, scale, rotation);
        
        if (cell.type === "NE") {
          console.log(`NE transformed points:`, transformedPoints);
        }
        
        // Convert path into line segments
        for (let i = 0; i < transformedPoints.length - 1; i++) {
          const p1 = transformedPoints[i];
          const p2 = transformedPoints[i + 1];
          
          // G-code coordinates (flip Y axis)
          const gcodeX1 = p1.x;
          const gcodeY1 = this.settings.canvasHeight - p1.y;
          const gcodeX2 = p2.x;
          const gcodeY2 = this.settings.canvasHeight - p2.y;
          
          if (cell.type === "NE") {
            console.log(`NE G-code line: (${gcodeX1.toFixed(2)},${gcodeY1.toFixed(2)}) -> (${gcodeX2.toFixed(2)},${gcodeY2.toFixed(2)})`);
          }
          
          lines.push({
            x1: gcodeX1,
            y1: gcodeY1,
            x2: gcodeX2,
            y2: gcodeY2
          });
        }
      }
    });

    return lines;
  }

  applySVGTransform(points, translateX, translateY, scale, rotation) {
    // Apply SVG transform exactly: translate(tx,ty) scale(s) rotate(r, 100, 100)
    const rotationRad = (rotation * Math.PI) / 180;
    const cos = Math.cos(rotationRad);
    const sin = Math.sin(rotationRad);
    
    return points.map(point => {
      // Step 1: Scale around origin
      let x = point.x * scale;
      let y = point.y * scale;
      
      // Step 2: Rotate around center point (100, 100) scaled
      const centerX = 100 * scale;
      const centerY = 100 * scale;
      
      const dx = x - centerX;
      const dy = y - centerY;
      
      const rotatedX = centerX + dx * cos - dy * sin;
      const rotatedY = centerY + dx * sin + dy * cos;
      
      // Step 3: Translate
      return {
        x: rotatedX + translateX,
        y: rotatedY + translateY
      };
    });
  }

  linesToGCode(lines) {
    if (lines.length === 0) return "";

    const feedRate = this.settings.feedRate;
    const penDownZ = this.settings.penDownZ;
    const penUpZ = this.settings.penUpZ;
    const preventZhop = this.settings.preventZhop;

    let gcode = "";
    let currentX = 0;
    let currentY = 0;
    let penIsDown = false;

    // Optimize path to minimize travel distance
    const optimizedLines = this.optimizeLinePath(lines, currentX, currentY);

    optimizedLines.forEach((line) => {
      const { x1, y1, x2, y2 } = line;

      // Check if we need to move to start position
      const moveDistance = Math.sqrt((currentX - x1) ** 2 + (currentY - y1) ** 2);
      
      if (moveDistance > 0.001) {
        // Decide whether to lift pen based on move distance
        if (penIsDown && moveDistance > preventZhop) {
          gcode += `G0 Z${penUpZ.toFixed(3)} ; Pen up\n`;
          penIsDown = false;
        }
        
        // Move to start position
        const moveCommand = penIsDown ? "G1" : "G0";
        gcode += `${moveCommand} X${x1.toFixed(3)} Y${y1.toFixed(3)} ; ${penIsDown ? "Drag" : "Move"} to start\n`;
        currentX = x1;
        currentY = y1;
      }

      // Pen down and draw line
      if (!penIsDown) {
        gcode += `G1 Z${penDownZ.toFixed(3)} ; Pen down\n`;
        penIsDown = true;
      }
      
      gcode += `G1 X${x2.toFixed(3)} Y${y2.toFixed(3)} ; Draw line\n`;
      currentX = x2;
      currentY = y2;
    });

    return gcode;
  }

  optimizeLinePath(lines, startX, startY) {
    if (lines.length === 0) return [];
    
    const optimized = [];
    const remaining = [...lines];
    let currentX = startX;
    let currentY = startY;

    while (remaining.length > 0) {
      let bestIndex = 0;
      let bestDistance = Infinity;
      let bestReversed = false;

      // Find closest line start or end point
      for (let i = 0; i < remaining.length; i++) {
        const line = remaining[i];
        
        // Distance to start of line
        const distToStart = Math.sqrt((currentX - line.x1) ** 2 + (currentY - line.y1) ** 2);
        if (distToStart < bestDistance) {
          bestDistance = distToStart;
          bestIndex = i;
          bestReversed = false;
        }
        
        // Distance to end of line (reversed)
        const distToEnd = Math.sqrt((currentX - line.x2) ** 2 + (currentY - line.y2) ** 2);
        if (distToEnd < bestDistance) {
          bestDistance = distToEnd;
          bestIndex = i;
          bestReversed = true;
        }
      }

      // Add best line to optimized path
      const bestLine = remaining.splice(bestIndex, 1)[0];
      if (bestReversed) {
        // Reverse the line
        optimized.push({
          x1: bestLine.x2,
          y1: bestLine.y2,
          x2: bestLine.x1,
          y2: bestLine.y1
        });
        currentX = bestLine.x1;
        currentY = bestLine.y1;
      } else {
        optimized.push(bestLine);
        currentX = bestLine.x2;
        currentY = bestLine.y2;
      }
    }

    return optimized;
  }

  convertPipeSectionToSegments(pipeSection, gridX, gridY, cell, cellSize) {
    const rotation = this.calculatePipeRotation(cell.connections, cell.type);
    const scale = cellSize / 200;
    const translateX = gridX * cellSize;
    const translateY = gridY * cellSize;

    console.log(`Converting pipe section at ${gridX},${gridY}: scale=${scale}, rotation=${rotation}`);

    // Parse SVG path and convert to segments
    const paths = this.parseSVGPath(pipeSection.path);
    console.log(`Parsed ${paths.length} paths from SVG:`, paths);
    
    const allSegments = [];

    paths.forEach((path, pathIndex) => {
      console.log(`Processing path ${pathIndex} with ${path.length} points`);
      const transformedPath = this.transformPath(
        path,
        translateX,
        translateY,
        scale,
        rotation
      );
      console.log(`Transformed path has ${transformedPath.length} points`);
      
      const clippedSegments = this.clipPathToCanvas(transformedPath);
      console.log(`Clipped into ${clippedSegments.length} segments`);
      
      allSegments.push(...clippedSegments);
    });

    console.log(`Total segments for this pipe section: ${allSegments.length}`);
    return allSegments;
  }

  mergeCloseSegments(segments) {
    if (segments.length === 0) return [];

    const mergeDistance = this.settings.preventZhop;
    const merged = [];
    let currentSegment = [...segments[0]];

    for (let i = 1; i < segments.length; i++) {
      const nextSegment = segments[i];
      
      if (nextSegment.length === 0) continue;

      // Check if we can connect current segment end to next segment start
      const currentEnd = currentSegment[currentSegment.length - 1];
      const nextStart = nextSegment[0];
      const distance = this.calculateDistance(currentEnd, nextStart);

      if (distance <= mergeDistance) {
        // Merge segments - append next segment (excluding first point to avoid duplication)
        currentSegment.push(...nextSegment.slice(1));
      } else {
        // Can't merge, save current segment and start new one
        if (currentSegment.length > 1) {
          merged.push(currentSegment);
        }
        currentSegment = [...nextSegment];
      }
    }

    // Don't forget the last segment
    if (currentSegment.length > 1) {
      merged.push(currentSegment);
    }

    return merged;
  }

  convertPipeSectionToGCode(pipeSection, gridX, gridY, cell, cellSize) {
    const segments = this.convertPipeSectionToSegments(pipeSection, gridX, gridY, cell, cellSize);
    let gcode = "";

    segments.forEach((segment) => {
      if (segment.length > 1) {
        gcode += this.pathSegmentToGCode(segment);
      }
    });

    return gcode;
  }

  parseSVGPath(pathData) {
    const paths = [];
    const commands = pathData.match(/[MLHVCSQTAZ][^MLHVCSQTAZ]*/gi) || [];
    let currentPath = [];
    let currentX = 0, currentY = 0;

    commands.forEach((command) => {
      const type = command[0].toUpperCase();
      const coords = command
        .slice(1)
        .trim()
        .split(/[\s,]+/)
        .filter((c) => c)
        .map(parseFloat);

      switch (type) {
        case "M":
          if (currentPath.length > 0) {
            paths.push(currentPath);
            currentPath = [];
          }
          currentX = coords[0];
          currentY = coords[1];
          currentPath.push({ x: currentX, y: currentY });
          break;

        case "L":
          for (let i = 0; i < coords.length; i += 2) {
            currentX = coords[i];
            currentY = coords[i + 1];
            currentPath.push({ x: currentX, y: currentY });
          }
          break;

        case "H": // Horizontal line
          for (let i = 0; i < coords.length; i++) {
            currentX = coords[i];
            currentPath.push({ x: currentX, y: currentY });
          }
          break;

        case "V": // Vertical line
          for (let i = 0; i < coords.length; i++) {
            currentY = coords[i];
            currentPath.push({ x: currentX, y: currentY });
          }
          break;
      }
    });

    if (currentPath.length > 0) {
      paths.push(currentPath);
    }

    return paths;
  }

  transformPath(path, translateX, translateY, scale, rotation) {
    const rotationRad = (rotation * Math.PI) / 180;
    const centerX = 100;
    const centerY = 100;

    return path.map((point) => {
      // Scale
      let x = point.x * scale;
      let y = point.y * scale;

      // Rotate around center
      const cosR = Math.cos(rotationRad);
      const sinR = Math.sin(rotationRad);
      const centerXScaled = centerX * scale;
      const centerYScaled = centerY * scale;

      const rotatedX =
        centerXScaled + (x - centerXScaled) * cosR - (y - centerYScaled) * sinR;
      const rotatedY =
        centerYScaled + (x - centerXScaled) * sinR + (y - centerYScaled) * cosR;

      // Translate
      return {
        x: rotatedX + translateX,
        y: this.settings.canvasHeight - (rotatedY + translateY), // Flip Y for G-code
      };
    });
  }

  clipPathToCanvas(path) {
    const segments = [];
    let currentSegment = [];

    for (let i = 0; i < path.length; i++) {
      const point = path[i];
      const isInside = this.isPointInsideCanvas(point);

      if (isInside) {
        if (currentSegment.length === 0 && i > 0) {
          const prevPoint = path[i - 1];
          if (!this.isPointInsideCanvas(prevPoint)) {
            const intersection = this.findCanvasIntersection(prevPoint, point);
            if (intersection) currentSegment.push(intersection);
          }
        }
        currentSegment.push(point);
      } else {
        if (currentSegment.length > 0) {
          const lastInsidePoint = currentSegment[currentSegment.length - 1];
          const intersection = this.findCanvasIntersection(
            lastInsidePoint,
            point
          );
          if (intersection) currentSegment.push(intersection);

          if (currentSegment.length > 1) {
            segments.push(currentSegment);
          }
          currentSegment = [];
        }
      }
    }

    if (currentSegment.length > 1) {
      segments.push(currentSegment);
    }

    return segments;
  }

  isPointInsideCanvas(point) {
    return (
      point.x >= 0 &&
      point.x <= this.settings.canvasWidth &&
      point.y >= 0 &&
      point.y <= this.settings.canvasHeight
    );
  }

  findCanvasIntersection(p1, p2) {
    const bounds = [
      { x1: 0, y1: 0, x2: this.settings.canvasWidth, y2: 0 }, // Top
      {
        x1: this.settings.canvasWidth,
        y1: 0,
        x2: this.settings.canvasWidth,
        y2: this.settings.canvasHeight,
      }, // Right
      {
        x1: this.settings.canvasWidth,
        y1: this.settings.canvasHeight,
        x2: 0,
        y2: this.settings.canvasHeight,
      }, // Bottom
      { x1: 0, y1: this.settings.canvasHeight, x2: 0, y2: 0 }, // Left
    ];

    for (const bound of bounds) {
      const intersection = this.lineIntersection(p1, p2, bound, bound);
      if (intersection) return intersection;
    }
    return null;
  }

  lineIntersection(line1Start, line1End, line2Start, line2End) {
    const x1 = line1Start.x,
      y1 = line1Start.y;
    const x2 = line1End.x,
      y2 = line1End.y;
    const x3 = line2Start.x,
      y3 = line2Start.y;
    const x4 = line2End.x,
      y4 = line2End.y;

    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(denom) < 1e-10) return null;

    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;

    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
      return {
        x: x1 + t * (x2 - x1),
        y: y1 + t * (y2 - y1),
      };
    }
    return null;
  }

  pathSegmentToGCode(segment) {
    if (segment.length === 0) return "";

    // Optimize segment by merging close points
    const optimizedSegment = this.optimizePathSegment(segment);
    
    if (optimizedSegment.length === 0) return "";

    let gcode = "";

    // Move to start
    gcode += `G0 X${optimizedSegment[0].x.toFixed(3)} Y${optimizedSegment[0].y.toFixed(3)}\n`;
    gcode += `G1 Z${this.settings.penDownZ.toFixed(3)} F${this.settings.feedRate}\n`;

    // Draw optimized path
    for (let i = 1; i < optimizedSegment.length; i++) {
      gcode += `G1 X${optimizedSegment[i].x.toFixed(3)} Y${optimizedSegment[i].y.toFixed(3)} F${this.settings.feedRate}\n`;
    }

    // Lift pen
    gcode += `G1 Z${this.settings.penUpZ.toFixed(3)}\n`;

    return gcode;
  }

  optimizePathSegment(segment) {
    if (segment.length <= 2) return segment;

    const mergeDistance = this.settings.preventZhop; // Use the "Skip Z-hop for moves <" parameter
    const optimized = [segment[0]]; // Always keep the first point

    for (let i = 1; i < segment.length; i++) {
      const currentPoint = segment[i];
      const lastOptimizedPoint = optimized[optimized.length - 1];
      
      // Calculate distance between current point and last optimized point
      const distance = this.calculateDistance(currentPoint, lastOptimizedPoint);
      
      if (distance >= mergeDistance) {
        // Points are far enough apart, keep this point
        optimized.push(currentPoint);
      }
      // If distance < mergeDistance, skip this point (merge it)
    }

    // Always keep the last point to ensure we reach the end
    if (optimized[optimized.length - 1] !== segment[segment.length - 1]) {
      optimized.push(segment[segment.length - 1]);
    }

    return optimized;
  }

  calculateDistance(point1, point2) {
    const dx = point2.x - point1.x;
    const dy = point2.y - point1.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  generateGCodeHeader() {
    return `; Generated by LineMaker - Pipe Maze
; Canvas size: ${this.settings.canvasWidth}mm x ${this.settings.canvasHeight}mm
; Grid size: ${this.settings.gridSize}x${this.settings.gridSize}
G21 ; Set units to millimeters
G90 ; Use absolute coordinates
G28 ; Home all axes
G1 Z${this.settings.penUpZ} F${this.settings.feedRate} ; Lift pen
`;
  }

  generateGCodeFooter() {
    return `
; End of program
G1 Z${this.settings.penUpZ} F${this.settings.feedRate} ; Lift pen
G28 X Y ; Home X and Y
M84 ; Disable motors
`;
  }

  downloadFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Template and Import Methods
  downloadTemplate() {
    if (!this.currentPipeEditor) {
      alert("Please open a pipe editor first");
      return;
    }

    const section = this.pipeSections[this.currentPipeEditor];
    const templateSvg = this.generateTemplateSVG(section.connections);
    const filename = `pipe-template-${this.currentPipeEditor.toLowerCase()}.svg`;

    this.downloadFile(filename, templateSvg, "image/svg+xml");
  }

  generateTemplateSVG(connections) {
    let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="200" height="200" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <style>
        .template-connection-point {
          fill: #ff6b35;
        }
        .template-background {
          fill: #fff;
        }
        .pipe-drawing-path {
          fill: none;
          stroke: #000;
          stroke-miterlimit: 10;
        }
        .template-center-point {
          fill: #333;
        }
      </style>
    </defs>
    <rect class="template-background" width="100%" height="100%"/>`;

    // Add connection points/poles
    const polePositions = {
      N: { cx: 100, cy: 10 },
      E: { cx: 190, cy: 100 },
      S: { cx: 100, cy: 190 },
      W: { cx: 10, cy: 100 },
    };

    connections.forEach((dir) => {
      const pole = polePositions[dir];
      if (pole) {
        svg += `
    <circle class="template-connection-point" cx="${pole.cx}" cy="${pole.cy}" r="5"/>`;
      }
    });

    // Add center reference point
    svg += `
    <circle class="template-center-point" cx="100" cy="100" r="2"/>
</svg>`;

    return svg;
  }

  importSVG(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!this.currentPipeEditor) {
      alert("Please open a pipe editor first");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const svgContent = e.target.result;
        this.parseSVGImport(svgContent);
      } catch (error) {
        alert("Error reading SVG file: " + error.message);
      }
    };
    reader.readAsText(file);

    // Clear the input for next time
    event.target.value = "";
  }

  parseSVGImport(svgContent) {
    // Create a temporary DOM element to parse the SVG
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(svgContent, "image/svg+xml");

    // Look for various drawing elements
    const paths = svgDoc.querySelectorAll("path");
    const lines = svgDoc.querySelectorAll("line");
    const polylines = svgDoc.querySelectorAll("polyline");
    const polygons = svgDoc.querySelectorAll("polygon");
    const circles = svgDoc.querySelectorAll("circle");
    const ellipses = svgDoc.querySelectorAll("ellipse");
    const rects = svgDoc.querySelectorAll("rect");

    if (
      paths.length === 0 &&
      lines.length === 0 &&
      polylines.length === 0 &&
      polygons.length === 0 &&
      circles.length === 0 &&
      ellipses.length === 0 &&
      rects.length === 0
    ) {
      alert("No drawable elements found in SVG file");
      return;
    }

    // Get SVG dimensions for scaling
    const svgElement = svgDoc.documentElement;
    const viewBox = svgElement.getAttribute("viewBox");
    let sourceWidth = 200,
      sourceHeight = 200;

    if (viewBox) {
      const [x, y, w, h] = viewBox.split(" ").map(parseFloat);
      sourceWidth = w;
      sourceHeight = h;
    } else {
      // Try to get width/height attributes
      const width = svgElement.getAttribute("width");
      const height = svgElement.getAttribute("height");
      if (width && height) {
        sourceWidth = parseFloat(width.replace(/[^\d.]/g, ""));
        sourceHeight = parseFloat(height.replace(/[^\d.]/g, ""));
      }
    }

    // Calculate scaling factor to fit 200x200
    const scaleX = 200 / sourceWidth;
    const scaleY = 200 / sourceHeight;
    const scale = Math.min(scaleX, scaleY); // Use uniform scaling

    // Extract and convert all elements to path data
    let combinedPath = "";

    // Handle existing path elements
    paths.forEach((path) => {
      const pathData = path.getAttribute("d");
      if (pathData) {
        const scaledPath =
          scale !== 1 ? this.scalePathData(pathData, scale) : pathData;
        combinedPath += (combinedPath ? " " : "") + scaledPath;
      }
    });

    // Convert line elements to path data
    lines.forEach((line) => {
      const x1 = parseFloat(line.getAttribute("x1") || 0);
      const y1 = parseFloat(line.getAttribute("y1") || 0);
      const x2 = parseFloat(line.getAttribute("x2") || 0);
      const y2 = parseFloat(line.getAttribute("y2") || 0);

      let pathData = `M ${x1} ${y1} L ${x2} ${y2}`;
      const scaledPath =
        scale !== 1 ? this.scalePathData(pathData, scale) : pathData;
      combinedPath += (combinedPath ? " " : "") + scaledPath;
    });

    // Convert polyline elements to path data
    polylines.forEach((polyline) => {
      const points = polyline.getAttribute("points");
      if (points) {
        const coords = points.trim().split(/[\s,]+/);
        let pathData = "";
        for (let i = 0; i < coords.length; i += 2) {
          const x = parseFloat(coords[i]);
          const y = parseFloat(coords[i + 1]);
          if (i === 0) {
            pathData += `M ${x} ${y}`;
          } else {
            pathData += ` L ${x} ${y}`;
          }
        }
        const scaledPath =
          scale !== 1 ? this.scalePathData(pathData, scale) : pathData;
        combinedPath += (combinedPath ? " " : "") + scaledPath;
      }
    });

    // Convert polygon elements to path data
    polygons.forEach((polygon) => {
      const points = polygon.getAttribute("points");
      if (points) {
        const coords = points.trim().split(/[\s,]+/);
        let pathData = "";
        for (let i = 0; i < coords.length; i += 2) {
          const x = parseFloat(coords[i]);
          const y = parseFloat(coords[i + 1]);
          if (i === 0) {
            pathData += `M ${x} ${y}`;
          } else {
            pathData += ` L ${x} ${y}`;
          }
        }
        pathData += " Z"; // Close polygon
        const scaledPath =
          scale !== 1 ? this.scalePathData(pathData, scale) : pathData;
        combinedPath += (combinedPath ? " " : "") + scaledPath;
      }
    });

    if (combinedPath) {
      // Clear current shape and set new one
      this.pipeShapeGroup.innerHTML = "";
      const newPath = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path"
      );
      newPath.setAttribute("d", combinedPath);
      newPath.setAttribute("class", "pipe-shape-path");
      this.pipeShapeGroup.appendChild(newPath);

      alert("SVG imported successfully! Remember to save your changes.");
    } else {
      alert("No valid path data found in SVG file");
    }
  }

  scalePathData(pathData, scale) {
    // Simple path scaling - replace numbers in the path data
    return pathData.replace(/-?\d+(?:\.\d+)?/g, (match) => {
      return (parseFloat(match) * scale).toFixed(2);
    });
  }

  // Test method to verify SVG is visible
  addTestRectangle() {
    const testRect = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "rect"
    );
    testRect.setAttribute("x", "50");
    testRect.setAttribute("y", "50");
    testRect.setAttribute("width", "100");
    testRect.setAttribute("height", "100");
    testRect.setAttribute("fill", "red");
    testRect.setAttribute("stroke", "black");
    testRect.setAttribute("stroke-width", "2");
    this.mazeContainer.appendChild(testRect);
  }
}

// Initialize the application
document.addEventListener("DOMContentLoaded", () => {
  new PipeMazeGenerator();
});
