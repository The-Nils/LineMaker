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

        header.appendChild(title);
        header.appendChild(closeBtn);

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
}