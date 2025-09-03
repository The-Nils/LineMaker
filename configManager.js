class ConfigManager {
    constructor() {
        this.storageKey = 'penPlotterConfigs';
    }

    /**
     * Save a configuration for a specific tool
     * @param {string} toolId - The tool identifier (e.g., 'hatchmaker')
     * @param {string} name - The name for this configuration
     * @param {Object} parameters - All the tool parameters
     * @param {string} base64Image - Base64 encoded image data
     */
    saveConfig(toolId, name, parameters, base64Image) {
        const configs = this.getAllConfigs();
        
        if (!configs[toolId]) {
            configs[toolId] = [];
        }

        const config = {
            id: this.generateId(),
            name: name,
            toolId: toolId,
            parameters: parameters,
            base64Image: base64Image,
            timestamp: new Date().toISOString()
        };

        configs[toolId].push(config);
        this.saveAllConfigs(configs);
        return config.id;
    }

    /**
     * Get all configurations for a specific tool
     * @param {string} toolId - The tool identifier
     * @returns {Array} Array of configurations
     */
    getConfigsForTool(toolId) {
        const configs = this.getAllConfigs();
        return configs[toolId] || [];
    }

    /**
     * Get a specific configuration by ID
     * @param {string} toolId - The tool identifier
     * @param {string} configId - The configuration ID
     * @returns {Object|null} The configuration or null if not found
     */
    getConfig(toolId, configId) {
        const configs = this.getConfigsForTool(toolId);
        return configs.find(config => config.id === configId) || null;
    }

    /**
     * Delete a configuration
     * @param {string} toolId - The tool identifier
     * @param {string} configId - The configuration ID
     */
    deleteConfig(toolId, configId) {
        const allConfigs = this.getAllConfigs();
        if (allConfigs[toolId]) {
            allConfigs[toolId] = allConfigs[toolId].filter(config => config.id !== configId);
            this.saveAllConfigs(allConfigs);
        }
    }

    /**
     * Update a configuration name
     * @param {string} toolId - The tool identifier
     * @param {string} configId - The configuration ID
     * @param {string} newName - The new name
     */
    updateConfigName(toolId, configId, newName) {
        const allConfigs = this.getAllConfigs();
        if (allConfigs[toolId]) {
            const config = allConfigs[toolId].find(config => config.id === configId);
            if (config) {
                config.name = newName;
                this.saveAllConfigs(allConfigs);
            }
        }
    }

    /**
     * Show modal with saved configurations for a tool
     * @param {string} toolId - The tool identifier
     * @param {Function} onSelect - Callback function when a config is selected
     */
    showConfigModal(toolId, onSelect) {
        const configs = this.getConfigsForTool(toolId);
        
        // Create modal HTML
        const modal = this.createModal(toolId, configs, onSelect);
        document.body.appendChild(modal);
        
        // Show modal
        modal.style.display = 'flex';
    }

    /**
     * Create the modal HTML element
     * @param {string} toolId - The tool identifier
     * @param {Array} configs - Array of configurations
     * @param {Function} onSelect - Callback function when a config is selected
     * @returns {HTMLElement} The modal element
     */
    createModal(toolId, configs, onSelect) {
        const modal = document.createElement('div');
        modal.className = 'config-modal';
        modal.style.cssText = `
            display: none;
            position: fixed;
            z-index: 1000;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0,0,0,0.5);
            justify-content: center;
            align-items: center;
        `;

        const modalContent = document.createElement('div');
        modalContent.className = 'config-modal-content';
        modalContent.style.cssText = `
            background-color: white;
            padding: 20px;
            border-radius: 8px;
            width: 600px;
            max-width: 90vw;
            max-height: 80vh;
            overflow-y: auto;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        `;

        const header = document.createElement('div');
        header.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            border-bottom: 1px solid #eee;
            padding-bottom: 10px;
        `;

        const title = document.createElement('h2');
        title.textContent = `Saved ${toolId} Configurations`;
        title.style.margin = '0';

        const headerActions = document.createElement('div');
        headerActions.style.cssText = `
            display: flex;
            gap: 10px;
            align-items: center;
        `;

        const importBtn = document.createElement('button');
        importBtn.textContent = 'Import from File';
        importBtn.style.cssText = `
            background-color: #f39c12;
            color: white;
            border: none;
            padding: 8px 15px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 0.9em;
        `;
        importBtn.onclick = (e) => {
            e.stopPropagation();
            this.importConfigFromFile(toolId, onSelect, modal);
        };

        const closeBtn = document.createElement('button');
        closeBtn.textContent = '×';
        closeBtn.style.cssText = `
            background: none;
            border: none;
            font-size: 24px;
            cursor: pointer;
            color: #999;
            padding: 0;
            width: 30px;
            height: 30px;
            display: flex;
            align-items: center;
            justify-content: center;
        `;
        closeBtn.onclick = () => this.closeModal(modal);

        headerActions.appendChild(importBtn);
        headerActions.appendChild(closeBtn);

        header.appendChild(title);
        header.appendChild(headerActions);

        const configList = document.createElement('div');
        configList.className = 'config-list';

        if (configs.length === 0) {
            const emptyMessage = document.createElement('div');
            emptyMessage.textContent = 'No saved configurations found.';
            emptyMessage.style.cssText = `
                text-align: center;
                color: #999;
                padding: 40px;
                font-style: italic;
            `;
            configList.appendChild(emptyMessage);
        } else {
            configs.forEach(config => {
                const configItem = this.createConfigItem(config, toolId, onSelect, modal);
                configList.appendChild(configItem);
            });
        }

        modalContent.appendChild(header);
        modalContent.appendChild(configList);
        modal.appendChild(modalContent);

        // Close modal when clicking outside
        modal.onclick = (e) => {
            if (e.target === modal) {
                this.closeModal(modal);
            }
        };

        return modal;
    }

    /**
     * Create a configuration item element
     * @param {Object} config - The configuration object
     * @param {string} toolId - The tool identifier
     * @param {Function} onSelect - Callback function when config is selected
     * @param {HTMLElement} modal - The modal element
     * @returns {HTMLElement} The config item element
     */
    createConfigItem(config, toolId, onSelect, modal) {
        const item = document.createElement('div');
        item.className = 'config-item';
        item.style.cssText = `
            display: flex;
            align-items: center;
            padding: 15px;
            border: 1px solid #ddd;
            border-radius: 8px;
            margin-bottom: 10px;
            background-color: #f9f9f9;
            cursor: pointer;
            transition: background-color 0.2s;
        `;

        const thumbnail = document.createElement('img');
        thumbnail.src = config.base64Image;
        thumbnail.style.cssText = `
            width: 60px;
            height: 60px;
            object-fit: cover;
            border-radius: 4px;
            margin-right: 15px;
        `;

        const info = document.createElement('div');
        info.style.cssText = `
            flex: 1;
            min-width: 0;
        `;

        const name = document.createElement('div');
        name.textContent = config.name;
        name.style.cssText = `
            font-weight: bold;
            margin-bottom: 5px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        `;

        const date = document.createElement('div');
        date.textContent = new Date(config.timestamp).toLocaleString();
        date.style.cssText = `
            color: #666;
            font-size: 0.9em;
        `;

        info.appendChild(name);
        info.appendChild(date);

        const actions = document.createElement('div');
        actions.style.cssText = `
            display: flex;
            gap: 10px;
        `;

        const loadBtn = document.createElement('button');
        loadBtn.textContent = 'Load';
        loadBtn.style.cssText = `
            background-color: #3498db;
            color: white;
            border: none;
            padding: 8px 15px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 0.9em;
        `;
        loadBtn.onclick = (e) => {
            e.stopPropagation();
            onSelect(config);
            this.closeModal(modal);
        };

        const downloadBtn = document.createElement('button');
        downloadBtn.textContent = 'Download';
        downloadBtn.style.cssText = `
            background-color: #27ae60;
            color: white;
            border: none;
            padding: 8px 15px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 0.9em;
        `;
        downloadBtn.onclick = (e) => {
            e.stopPropagation();
            this.downloadConfig(config);
        };

        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = 'Delete';
        deleteBtn.style.cssText = `
            background-color: #e74c3c;
            color: white;
            border: none;
            padding: 8px 15px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 0.9em;
        `;
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            if (confirm(`Are you sure you want to delete "${config.name}"?`)) {
                this.deleteConfig(toolId, config.id);
                item.remove();
            }
        };

        actions.appendChild(loadBtn);
        actions.appendChild(downloadBtn);
        actions.appendChild(deleteBtn);

        item.appendChild(thumbnail);
        item.appendChild(info);
        item.appendChild(actions);

        // Hover effect
        item.onmouseenter = () => {
            item.style.backgroundColor = '#f0f0f0';
        };
        item.onmouseleave = () => {
            item.style.backgroundColor = '#f9f9f9';
        };

        return item;
    }

    /**
     * Close and remove the modal
     * @param {HTMLElement} modal - The modal element to close
     */
    closeModal(modal) {
        modal.style.display = 'none';
        document.body.removeChild(modal);
    }

    /**
     * Get all configurations from localStorage
     * @returns {Object} All configurations object
     */
    getAllConfigs() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            return stored ? JSON.parse(stored) : {};
        } catch (error) {
            console.error('Error loading configurations:', error);
            return {};
        }
    }

    /**
     * Get all configurations across all tools, sorted by date
     * @param {number} limit - Maximum number of configs to return (default: 10)
     * @returns {Array} Array of configurations sorted by timestamp (newest first)
     */
    getRecentConfigs(limit = 10) {
        const allConfigs = this.getAllConfigs();
        const recentConfigs = [];
        
        // Collect all configurations from all tools
        Object.keys(allConfigs).forEach(toolId => {
            if (allConfigs[toolId] && Array.isArray(allConfigs[toolId])) {
                allConfigs[toolId].forEach(config => {
                    recentConfigs.push({
                        ...config,
                        toolId: toolId
                    });
                });
            }
        });
        
        // Sort by timestamp (newest first) and limit results
        recentConfigs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        return recentConfigs.slice(0, limit);
    }

    /**
     * Get configurations by tool ID
     * @param {string} toolId - The tool identifier
     * @param {number} limit - Maximum number of configs to return (optional)
     * @returns {Array} Array of configurations for the specified tool
     */
    getConfigsByTool(toolId, limit = null) {
        const configs = this.getConfigsForTool(toolId);
        if (limit) {
            return configs.slice(0, limit);
        }
        return configs;
    }

    /**
     * Search configurations by name across all tools
     * @param {string} searchTerm - Search term to match against config names
     * @param {number} limit - Maximum number of configs to return (default: 10)
     * @returns {Array} Array of matching configurations
     */
    searchConfigs(searchTerm, limit = 10) {
        const allConfigs = this.getAllConfigs();
        const matchingConfigs = [];
        const searchLower = searchTerm.toLowerCase();
        
        Object.keys(allConfigs).forEach(toolId => {
            if (allConfigs[toolId] && Array.isArray(allConfigs[toolId])) {
                allConfigs[toolId].forEach(config => {
                    if (config.name.toLowerCase().includes(searchLower)) {
                        matchingConfigs.push({
                            ...config,
                            toolId: toolId
                        });
                    }
                });
            }
        });
        
        // Sort by timestamp (newest first) and limit results
        matchingConfigs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        return matchingConfigs.slice(0, limit);
    }

    /**
     * Get configuration statistics
     * @returns {Object} Statistics about saved configurations
     */
    getStats() {
        const allConfigs = this.getAllConfigs();
        const stats = {
            totalConfigs: 0,
            configsByTool: {},
            oldestConfig: null,
            newestConfig: null
        };
        
        const allConfigsList = [];
        
        Object.keys(allConfigs).forEach(toolId => {
            if (allConfigs[toolId] && Array.isArray(allConfigs[toolId])) {
                const toolConfigCount = allConfigs[toolId].length;
                stats.configsByTool[toolId] = toolConfigCount;
                stats.totalConfigs += toolConfigCount;
                
                allConfigs[toolId].forEach(config => {
                    allConfigsList.push({
                        ...config,
                        toolId: toolId
                    });
                });
            }
        });
        
        if (allConfigsList.length > 0) {
            allConfigsList.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
            stats.oldestConfig = allConfigsList[0];
            stats.newestConfig = allConfigsList[allConfigsList.length - 1];
        }
        
        return stats;
    }

    /**
     * Save all configurations to localStorage
     * @param {Object} configs - The configurations object to save
     */
    saveAllConfigs(configs) {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(configs));
        } catch (error) {
            console.error('Error saving configurations:', error);
            alert('Failed to save configuration. Your browser storage might be full.');
        }
    }

    /**
     * Generate a unique ID for configurations
     * @returns {string} A unique identifier
     */
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    }

    /**
     * Download a configuration as a JSON file
     * @param {Object} config - The configuration to download
     */
    downloadConfig(config) {
        const filename = `${config.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${config.toolId}_config.json`;
        const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /**
     * Import a configuration from a JSON file
     * @param {string} toolId - The tool identifier
     * @param {Function} onSelect - Callback function when config is loaded
     * @param {HTMLElement} modal - The modal element
     */
    importConfigFromFile(toolId, onSelect, modal) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.style.display = 'none';
        
        input.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    try {
                        const config = JSON.parse(event.target.result);
                        
                        // Validate that it's a valid configuration
                        if (!config.toolId || !config.parameters || !config.name) {
                            throw new Error('Invalid configuration file format');
                        }
                        
                        // Check if it's for the right tool
                        if (config.toolId !== toolId) {
                            if (!confirm(`This configuration is for "${config.toolId}" but you're using "${toolId}". Load anyway?`)) {
                                return;
                            }
                        }
                        
                        // Load the configuration directly
                        onSelect(config);
                        this.closeModal(modal);
                        
                        // Optionally save it to storage
                        if (confirm(`Would you like to save "${config.name}" to your saved configurations?`)) {
                            // Generate new ID to avoid conflicts
                            config.id = this.generateId();
                            config.timestamp = new Date().toISOString();
                            
                            const allConfigs = this.getAllConfigs();
                            if (!allConfigs[toolId]) {
                                allConfigs[toolId] = [];
                            }
                            allConfigs[toolId].push(config);
                            this.saveAllConfigs(allConfigs);
                        }
                        
                    } catch (error) {
                        console.error("Error loading config:", error);
                        alert('Error loading configuration file. Please check that it\'s a valid configuration file.');
                    }
                };
                reader.readAsText(file);
            }
        });
        
        document.body.appendChild(input);
        input.click();
        document.body.removeChild(input);
    }
}