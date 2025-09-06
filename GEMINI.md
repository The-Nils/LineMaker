# Gemini Project Analysis: Pen Plotter Tools

## Project Overview

This project is a collection of web-based tools for generating line art for CNC pen plotters. It is written entirely in vanilla JavaScript, HTML, and CSS, with no external dependencies or build process. The project is structured as a set of standalone tools, each with its own HTML, CSS, and JavaScript files.

The main tools available are:

*   **HatchMaker**: Converts images into hatched line art, with support for CMYK color separation.
*   **HatchMoiréMaker**: Creates moiré effects by overlaying multiple hatched layers from the same image.
*   **FieldLines**: A generative art tool that creates line fields based on attractor and repulsor points.

The project is designed to be simple to use and run, requiring only a web browser.

## Building and Running

There is no build process for this project. To run any of the tools, simply open the corresponding `index.html` file in a web browser.

*   **Main Page**: `index.html`
*   **HatchMaker**: `hatchmaker/index.html`
*   **HatchMoiréMaker**: `moiremaker/index.html`
*   **FieldLines**: `fieldlines/index.html`

## Development Conventions

*   **Framework**: Vanilla JavaScript.
*   **Styling**: Standard CSS. Each tool has its own stylesheet, and there are also global stylesheets (`styles.css` and `tool-styles.css`).
*   **Architecture**: Each tool is self-contained in its own directory. There is a `configManager.js` for saving and loading tool configurations, and an `interactiveCanvas.js` for pan and zoom functionality in the preview area.
*   **Testing**: There are no automated tests in this project. Testing is done manually.
*   **Dependencies**: There are no external dependencies.

## Key Files

*   `index.html`: The main landing page that links to the different tools.
*   `configManager.js`: A utility for saving, loading, and managing tool configurations in the browser's local storage.
*   `interactiveCanvas.js`: Provides interactive pan and zoom functionality for the SVG previews.
*   `hatchmaker/`: Directory for the HatchMaker tool.
    *   `index.html`: The UI for the HatchMaker tool.
    *   `script.js`: The core logic for the HatchMaker tool.
    *   `styles.css`: Styles specific to the HatchMaker tool.
*   `moiremaker/`: Directory for the HatchMoiréMaker tool.
    *   `index.html`: The UI for the HatchMoiréMaker tool.
    *   `script.js`: The core logic for the HatchMoiréMaker tool.
    *   `styles.css`: Styles specific to the HatchMoiréMaker tool.
*   `fieldlines/`: Directory for the FieldLines tool.
    *   `index.html`: The UI for the FieldLines tool.
    *   `script.js`: The core logic for the FieldLines tool.
    *   `styles.css`: Styles specific to the FieldLines tool.
