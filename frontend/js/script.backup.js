// Show body after auth check passes
document.body.style.opacity = '1';

let zIndexCounter = 100;
window.draggedFile = null; // Global state for file dragging
window.clipboard = null; // { path, name, type, operation: 'copy'|'cut' }

// ============================================
// Design System with Persistence
// ============================================
const DesignSystem = {
    defaults: {
        theme: 'dark',
        accentColor: '#007acc',
        fontSize: 'medium',
        hostname: 'webtop-local',
        showHiddenFiles: false,
        username: 'admin',
        language: 'en',
        timezone: 'Europe/Berlin',
        manualTime: '',
        useManualTime: false
    },

    settings: {},

    async init() {
        try {
            const saved = await api.getSettings();
            // If backend has settings, merge them. Otherwise, save defaults.
            if (saved && Object.keys(saved).length > 0) {
                // Convert string "true"/"false" back to boolean if needed, or handle in get
                // Since our API returns strings for everything in current implementation, 
                // we might need to parse types if we want strict typing, 
                // but JS is loose. Let's ensure types match defaults.
                this.settings = { ...this.defaults };
                for (const [key, val] of Object.entries(saved)) {
                    if (key in this.defaults) {
                        // Type conversion
                        const defaultType = typeof this.defaults[key];
                        if (defaultType === 'boolean') {
                            this.settings[key] = val === 'true';
                        } else if (defaultType === 'number') {
                            this.settings[key] = Number(val);
                        } else {
                            this.settings[key] = val;
                        }
                    }
                }
            } else {
                // First run or no settings in DB
                this.settings = { ...this.defaults };
                await this.save();
            }
        } catch (e) {
            console.error('Failed to load settings:', e);
            // Fallback to defaults
            this.settings = { ...this.defaults };
        }
        this.apply();
    },

    get(key) {
        return this.settings[key] ?? this.defaults[key];
    },

    async set(key, value) {
        this.settings[key] = value;
        await this.save();
        this.apply();
    },

    async save() {
        try {
            await api.updateSettings(this.settings);
        } catch (e) {
            console.error('Failed to save settings:', e);
        }
    },

    apply() {
        const root = document.documentElement;

        // Theme
        root.setAttribute('data-theme', this.settings.theme);

        // Accent Color
        root.style.setProperty('--accent-color', this.settings.accentColor);
        root.style.setProperty('--accent-hover', this.lightenColor(this.settings.accentColor, 20));
        
        // Calculate contrast text color (white or black)
        const rgb = this.hexToRgb(this.settings.accentColor);
        const brightness = Math.round(((parseInt(rgb.r) * 299) + (parseInt(rgb.g) * 587) + (parseInt(rgb.b) * 114)) / 1000);
        const textColor = brightness > 125 ? '#000000' : '#ffffff';
        root.style.setProperty('--accent-text', textColor);

        // Font Size
        root.setAttribute('data-font-size', this.settings.fontSize);

        // Update clock if timezone changed
        if (window.updateClock) window.updateClock();

        // Dispatch theme change event
        window.dispatchEvent(new CustomEvent('theme-changed', { detail: { theme: this.settings.theme } }));
    },

    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    },

    lightenColor(color, percent) {
        const num = parseInt(color.replace('#', ''), 16);
        const amt = Math.round(2.55 * percent);
        const R = Math.min(255, (num >> 16) + amt);
        const G = Math.min(255, ((num >> 8) & 0x00FF) + amt);
        const B = Math.min(255, (num & 0x0000FF) + amt);
        return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
    },

    getFormattedTime() {
        if (this.settings.useManualTime && this.settings.manualTime) {
            return this.settings.manualTime;
        }
        const options = {
            timeZone: this.settings.timezone,
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        };
        return new Date().toLocaleTimeString('en-GB', options);
    },

    getFormattedDate() {
        const options = {
            timeZone: this.settings.timezone,
            weekday: 'short',
            day: 'numeric',
            month: 'short'
        };
        return new Date().toLocaleDateString(this.settings.language === 'de' ? 'de-DE' : 'en-GB', options);
    }
};

// Initialize DesignSystem in DOMContentLoaded
// DesignSystem.init();

// Protected folders that cannot be trashed
const PROTECTED_FOLDERS = ['Desktop', 'Documents', 'Downloads', 'Pictures', 'Projects', 'Trash'];

function isProtectedPath(path) {
    // Check if path is exactly a protected folder (not inside one)
    return PROTECTED_FOLDERS.includes(path);
}

// Global File System Refresh Registry
window.fsObservers = new Set();

// Helper functions for file operations
async function moveToTrash(item) {
    // Don't allow trashing protected folders
    if (isProtectedPath(item.path)) {
        console.warn('Cannot trash protected folder:', item.path);
        return;
    }
    const parentDir = item.path.split('/').slice(0, -1).join('/') || 'Desktop';
    try {
        await api.trashItem(item.path);
        window.refreshFileSystem(parentDir);
        window.refreshFileSystem('Trash');
    } catch (err) {
        console.error('Move to trash failed:', err);
    }
}

async function moveToFolder(item, folderPath) {
    const parentDir = item.path.split('/').slice(0, -1).join('/') || 'Desktop';
    try {
        await api.moveItem(item.path, `${folderPath}/${item.name}`);
        window.refreshFileSystem(parentDir);
        window.refreshFileSystem(folderPath);
    } catch (err) {
        console.error('Move to folder failed:', err);
    }
}

async function moveToPath(item, targetPath) {
    const parentDir = item.path.split('/').slice(0, -1).join('/') || 'Desktop';
    if (parentDir === targetPath) return; // Same location, skip
    try {
        await api.moveItem(item.path, `${targetPath}/${item.name}`);
        window.refreshFileSystem(parentDir);
        window.refreshFileSystem(targetPath);
    } catch (err) {
        console.error('Move to path failed:', err);
    }
}

async function moveToDesktop(item) {
    const parentDir = item.path.split('/').slice(0, -1).join('/') || 'Desktop';
    if (parentDir === 'Desktop') return; // Already on Desktop
    try {
        await api.moveItem(item.path, `Desktop/${item.name}`);
        window.refreshFileSystem(parentDir);
        window.refreshFileSystem('Desktop');
    } catch (err) {
        console.error('Move to desktop failed:', err);
    }
}

window.refreshFileSystem = (path) => {
    // Notify all registered observers (Desktop, Finder windows)
    window.fsObservers.forEach(callback => callback(path));
};

// Global selection management
window.clearAllSelections = (except = null) => {
    if (except !== 'desktop') {
        document.querySelectorAll('.desktop-icon-item.selected').forEach(i => i.classList.remove('selected'));
    }
    if (except !== 'finder') {
        document.querySelectorAll('.finder-item.selected, .finder-list-item.selected').forEach(i => i.classList.remove('selected'));
    }
};

// --- File System uses API now ---
// Desktop icon positions (persistent via localStorage)
const desktopIconPositions = JSON.parse(localStorage.getItem('desktopIconPositions') || '{}');

function saveDesktopIconPositions() {
    localStorage.setItem('desktopIconPositions', JSON.stringify(desktopIconPositions));
}

// Context Menu Configurations
const menus = {
    desktop: [
        { label: 'New Folder', action: 'new_folder' },
        { label: 'Get Info', action: 'info' },
        { label: 'Change Wallpaper', action: 'change_wallpaper' },
        { separator: true },
        { label: 'Paste', action: 'paste' }
    ],
    file: [
        { label: 'Open', action: 'open' },
        { separator: true },
        { label: 'Copy', action: 'copy' },
        { label: 'Cut', action: 'cut' },
        { label: 'Rename', action: 'rename' },
        { separator: true },
        { label: 'Move to Trash', action: 'delete' }
    ],
    folder: [
        { label: 'Open', action: 'open' },
        { separator: true },
        { label: 'Copy', action: 'copy' },
        { label: 'Cut', action: 'cut' },
        { label: 'Rename', action: 'rename' },
        { label: 'Paste Item', action: 'paste' },
        { separator: true },
        { label: 'Move to Trash', action: 'delete' }
    ],
    // Trash-specific menus
    trash_file: [
        { label: 'Restore', action: 'restore' },
        { separator: true },
        { label: 'Delete Permanently', action: 'delete_permanent' }
    ],
    trash_folder: [
        { label: 'Restore', action: 'restore' },
        { separator: true },
        { label: 'Delete Permanently', action: 'delete_permanent' }
    ],
    dock: [
        { label: 'Open', action: 'open_app' },
        { label: 'Close All', action: 'close_app' }
    ],
    browser: [
        { label: 'New Tab', action: 'new_tab' },
        { label: 'Reload', action: 'reload' },
        { separator: true },
        { label: 'Inspect', action: 'inspect_browser' }
    ]
};

// Helper to get items from API
async function getItems(path) {
    try {
        const result = await api.listDir(path);
        return result.items.map(item => ({
            name: item.name,
            type: item.isDirectory ? 'folder' : 'file',
            path: item.path,
            size: item.size,
            mimeType: item.mimeType
        }));
    } catch (err) {
        console.error('Failed to list directory:', err);
        return [];
    }
}

const appContents = {
    'Settings': `
        <div class="app-layout settings-layout">
            <div class="sidebar">
                <div class="sidebar-item active" data-section="system"><i class="ph ph-desktop-tower"></i> System</div>
                <div class="sidebar-item" data-section="design"><i class="ph ph-palette"></i> Design</div>
                <div class="sidebar-item" data-section="user"><i class="ph ph-user"></i> User</div>
            </div>
            <div class="main-content">
                <!-- System Section -->
                <div class="settings-section active" data-section="system">
                    <h3>System</h3>
                    <div class="setting-group">
                        <label>Hostname</label>
                        <input type="text" value="webtop-local" class="setting-input" data-setting="hostname">
                    </div>
                    <div class="setting-group">
                        <label>Version</label>
                        <span class="setting-value">WebTop 1.0.0</span>
                    </div>
                    <div class="setting-group">
                        <label>Software Update</label>
                        <div class="update-controls">
                            <span class="update-status">Up to date</span>
                            <button class="setting-btn" data-action="check-update">Check</button>
                        </div>
                    </div>
                    <div class="setting-group">
                        <label>Show Hidden Files</label>
                        <div class="toggle-switch" data-setting="showHiddenFiles"></div>
                    </div>
                </div>
                <!-- Design Section -->
                <div class="settings-section" data-section="design">
                    <h3>Design</h3>
                    <div class="setting-group" style="display: block;">
                        <label style="margin-bottom: 10px; display: block;">Wallpaper</label>
                        <div class="wallpaper-grid" id="wallpaper-grid">
                            <div style="padding:10px; color:#888;">Loading wallpapers...</div>
                        </div>
                    </div>
                    <div class="setting-group">
                        <label>Theme</label>
                        <select class="setting-select" data-setting="theme">
                            <option value="dark">Dark</option>
                            <option value="light">Light</option>
                        </select>
                    </div>
                    <div class="setting-group">
                        <label>Accent Color</label>
                        <div class="color-options" data-setting="accentColor">
                            <div class="color-option" style="background:#007acc;" data-color="#007acc" title="Blue"></div>
                            <div class="color-option" style="background:#0dbc79;" data-color="#0dbc79" title="Green"></div>
                            <div class="color-option" style="background:#bc3fbc;" data-color="#bc3fbc" title="Purple"></div>
                            <div class="color-option" style="background:#f5a623;" data-color="#f5a623" title="Orange"></div>
                            <div class="color-option" style="background:#cd3131;" data-color="#cd3131" title="Red"></div>
                        </div>
                    </div>
                    <div class="setting-group">
                        <label>Font Size</label>
                        <select class="setting-select" data-setting="fontSize">
                            <option value="small">Small</option>
                            <option value="medium">Medium</option>
                            <option value="large">Large</option>
                        </select>
                    </div>
                </div>
                <!-- User Section -->
                <div class="settings-section" data-section="user">
                    <h3>User</h3>
                    <div class="setting-group">
                        <label>Username</label>
                        <input type="text" value="admin" class="setting-input" data-setting="username">
                    </div>
                    <div class="setting-group">
                        <label>Language</label>
                        <select class="setting-select" data-setting="language">
                            <option value="de">Deutsch</option>
                            <option value="en">English</option>
                            <option value="es">Español</option>
                            <option value="fr">Français</option>
                        </select>
                    </div>
                    <div class="setting-group">
                        <label>Timezone</label>
                        <select class="setting-select" data-setting="timezone">
                            <option value="Europe/Berlin">Europe/Berlin</option>
                            <option value="Europe/London">Europe/London</option>
                            <option value="America/New_York">America/New_York</option>
                            <option value="America/Los_Angeles">America/Los_Angeles</option>
                            <option value="Asia/Tokyo">Asia/Tokyo</option>
                            <option value="UTC">UTC</option>
                        </select>
                    </div>
                    <div class="setting-group">
                        <label>Manual Time</label>
                        <input type="time" class="setting-input setting-time" data-setting="manualTime">
                    </div>
                    <div class="setting-group">
                        <label>Use Manual Time</label>
                        <div class="toggle-switch" data-setting="useManualTime"></div>
                    </div>
                </div>
            </div>
        </div>
    `,
    'Editor': `
        <div class="app-layout editor-layout atom-style">
            <div class="editor-sidebar">
                <div class="editor-sidebar-tabs">
                    <div class="editor-sidebar-tab active" data-tab="project"><i class="ph ph-folder-simple"></i></div>
                    <div class="editor-sidebar-tab" data-tab="open"><i class="ph ph-files"></i></div>
                </div>
                <div class="editor-sidebar-content">
                    <div class="editor-panel project-panel active">
                        <div class="project-header">
                            <span class="project-name">No Project</span>
                        </div>
                        <div class="project-tree">
                            <div class="no-project-msg">
                                <i class="ph ph-folder-open"></i>
                                <p>Open a folder to see project files</p>
                            </div>
                        </div>
                    </div>
                    <div class="editor-panel open-files-panel">
                        <div class="open-files-header">Open Files</div>
                        <div class="open-files-list"></div>
                    </div>
                </div>
            </div>
            <div class="editor-main">
                <div class="editor-tabs-bar">
                    <div class="editor-tabs"></div>
                </div>
                <div class="editor-container">
                    <pre class="editor-pre" aria-hidden="true"><code class="language-html"></code></pre>
                    <textarea class="editor-textarea" spellcheck="false" placeholder="Open a file or project to start editing..."></textarea>
                </div>
                <div class="editor-status-bar">
                    <span class="editor-status-branch"><i class="ph ph-git-branch"></i> main</span>
                    <span class="editor-status-file">No file</span>
                    <span class="editor-status-pos">Ln 1, Col 1</span>
                    <span class="editor-status-type">UTF-8</span>
                </div>
            </div>
        </div>
    `,
    'Browser': `
        <div class="app-layout browser-layout">
            <div class="browser-tabs-container">
                <div class="browser-tabs">
                    <!-- Tabs injected here -->
                    <div class="new-tab-btn"><i class="ph ph-plus"></i></div>
                </div>
            </div>
            <div class="browser-toolbar">
                <button class="browser-btn back"><i class="ph ph-arrow-left"></i></button>
                <button class="browser-btn forward"><i class="ph ph-arrow-right"></i></button>
                <button class="browser-btn reload"><i class="ph ph-arrow-clockwise"></i></button>
                <div class="url-bar">
                    <i class="ph ph-lock-key"></i>
                    <input type="text" value="https://www.wikipedia.org" placeholder="Search or enter website name">
                </div>
            </div>
            <div class="browser-content" style="flex:1; display:flex;">
                <iframe class="browser-frame" src="https://www.wikipedia.org" style="width:100%; height:100%;"></iframe>
            </div>
        </div>
    `,
    'Claude Code': `
        <div class="app-layout claude-layout">
            <div class="claude-projects">
                <!-- Projects injected here -->
            </div>
            <div class="claude-sidebar">
                <div class="claude-sidebar-header">Recent Chats</div>
                <div class="chat-list">
                    <!-- Chats injected here -->
                </div>
            </div>
            <div class="claude-main">
                <div class="claude-header">
                    <div class="chat-title">Select a project</div>
                    <select class="model-selector">
                        <!-- Models injected here -->
                    </select>
                </div>
                <!-- Terminal injected here -->
            </div>
        </div>
    `,
    'Finder': `
        <div class="app-layout finder-layout">
            <div class="finder-sidebar">
                <div class="finder-sidebar-item active" data-path="Desktop"><i class="ph ph-desktop"></i> Desktop</div>
                <div class="finder-sidebar-item" data-path="Documents"><i class="ph ph-file-text"></i> Documents</div>
                <div class="finder-sidebar-item" data-path="Pictures"><i class="ph ph-image"></i> Pictures</div>
                <div class="finder-sidebar-item" data-path="Projects"><i class="ph ph-folder-simple-star"></i> Projects</div>
                <div style="flex:1"></div>
                <div class="finder-sidebar-item" data-path="Trash"><i class="ph ph-trash"></i> Trash</div>
            </div>
            <div class="finder-main">
                <div class="finder-toolbar">
                     <button class="finder-nav-btn back-btn"><i class="ph ph-caret-left"></i></button>
                     <span class="finder-path">Desktop</span>
                     <div class="finder-view-toggle">
                         <button class="view-btn active" data-view="icons" title="Icons"><i class="ph ph-squares-four"></i></button>
                         <button class="view-btn" data-view="list" title="List"><i class="ph ph-list"></i></button>
                     </div>
                </div>
                <div class="finder-content" id="finder-content-area">
                    <!-- Items injected here -->
                </div>
            </div>
        </div>
    `,
    'Trash': `
        <div class="app-layout finder-layout">
            <div class="finder-sidebar">
                <div class="finder-sidebar-item" data-path="Desktop"><i class="ph ph-desktop"></i> Desktop</div>
                <div class="finder-sidebar-item" data-path="Documents"><i class="ph ph-file-text"></i> Documents</div>
                <div class="finder-sidebar-item" data-path="Pictures"><i class="ph ph-image"></i> Pictures</div>
                <div class="finder-sidebar-item" data-path="Projects"><i class="ph ph-folder-simple-star"></i> Projects</div>
                <div style="flex:1"></div>
                <div class="finder-sidebar-item active" data-path="Trash"><i class="ph ph-trash"></i> Trash</div>
            </div>
            <div class="finder-main">
                <div class="finder-toolbar">
                     <button class="finder-nav-btn back-btn"><i class="ph ph-caret-left"></i></button>
                     <span class="finder-path">Trash</span>
                     <div class="finder-view-toggle">
                         <button class="view-btn active" data-view="icons" title="Icons"><i class="ph ph-squares-four"></i></button>
                         <button class="view-btn" data-view="list" title="List"><i class="ph ph-list"></i></button>
                     </div>
                </div>
                <div class="finder-content">
                    <!-- Items injected here -->
                </div>
            </div>
        </div>
    `,
    'Terminal': `
        <div class="app-layout terminal-layout">
            <div class="terminal-panels">
                <div class="terminal-panel active" data-panel-id="0">
                    <div class="xterm-container"></div>
                </div>
            </div>
        </div>
    `
};

const editorFiles = {
    'index.html': '<!DOCTYPE html>\n<html>\n<head>\n    <title>Hello</title>\n</head>\n<body>\n    <h1>Hello World</h1>\n</body>\n</html>',
    'style.css': 'body {\n    background: #333;\n    color: white;\n}',
    'script.js': 'console.log("Hello from Editor");'
};

function updateDockIndicator(appName) {
    const dockItems = document.querySelectorAll('.dock-item');
    dockItems.forEach(item => {
        const tooltip = item.querySelector('.tooltip').textContent;
        if (tooltip === appName) {
            const windows = document.querySelectorAll(`.window[data-app="${appName}"]`);
            if (windows.length > 0) item.classList.add('is-open');
            else item.classList.remove('is-open');
        }
    });
}

// Smart Open: Toggles existing window or creates new
function openWindow(appName, iconClass) {
    // Check if window exists
    const existingWindow = document.querySelector(`.window[data-app="${appName}"]`);
    
    if (existingWindow) {
        if (existingWindow.style.display === 'none') {
            existingWindow.style.display = 'flex';
            bringToFront(existingWindow);
            checkImmersiveState();
        } else {
            // If already focused and top, minimize? No, Mac style is just focus.
            bringToFront(existingWindow);
            
            // Optional: Shake animation to show it's already open
            existingWindow.animate([
                { transform: 'translateX(0)' },
                { transform: 'translateX(-5px)' },
                { transform: 'translateX(5px)' },
                { transform: 'translateX(0)' }
            ], { duration: 200 });
        }
        return existingWindow;
    } else {
        return createWindow(appName, iconClass);
    }
}

// Internal: Always creates a new window instance
function createWindow(appName, iconClass, initialPath = null) {
    const template = document.getElementById('window-template');
    const desktop = document.getElementById('desktop');
    const clone = template.content.cloneNode(true);
    const windowEl = clone.querySelector('.window');
    windowEl.dataset.app = appName;
    windowEl.querySelector('.title-text').textContent = appName;
    const iconEl = windowEl.querySelector('.window-title i');
    iconEl.className = 'ph ' + iconClass;
    const contentArea = windowEl.querySelector('.window-content');
    if (appContents[appName]) {
        contentArea.innerHTML = appContents[appName];
        if (appName === 'Finder') initFinder(windowEl, initialPath || 'Desktop');
        else if (appName === 'Trash') initFinder(windowEl, 'Trash');
        else if (appName === 'Terminal') initTerminal(windowEl);
        else if (appName === 'Editor') initEditor(windowEl);
        else if (appName === 'Browser') initBrowser(windowEl);
        else if (appName === 'Claude Code') initClaudeCode(windowEl);
        else if (appName === 'Settings') {
            windowEl.style.width = '800px';
            windowEl.style.height = '600px';
            initSettings(windowEl);
        }
    }
    const offset = Math.floor(Math.random() * 50) + 50;
    windowEl.style.top = `${100 + offset}px`;
    windowEl.style.left = `${100 + offset}px`;
    bringToFront(windowEl);
    windowEl.addEventListener('mousedown', () => bringToFront(windowEl));
    
    const closeBtn = windowEl.querySelector('.close');
    const maximizeBtn = windowEl.querySelector('.maximize');
    const minimizeBtn = windowEl.querySelector('.minimize');
    const header = windowEl.querySelector('.window-header');

    closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        windowEl.classList.add('closing');
        windowEl.addEventListener('animationend', () => { 
            windowEl.remove(); 
            updateDockIndicator(appName);
            checkImmersiveState();
        });
    });

    function toggleMaximize() {
        windowEl.classList.toggle('maximized');
        checkImmersiveState();
    }

    maximizeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleMaximize();
    });

    header.addEventListener('dblclick', () => toggleMaximize());

    minimizeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        windowEl.style.display = 'none';
        checkImmersiveState();
    });

    makeDraggable(windowEl, header);
    const resizeHandle = windowEl.querySelector('.resize-handle');
    makeResizable(windowEl, resizeHandle);

    desktop.appendChild(windowEl);
    updateDockIndicator(appName);
    checkImmersiveState();
    return windowEl;
}

function checkImmersiveState() {
    const anyMaximized = document.querySelector('.window.maximized:not([style*="display: none"])');
    if (anyMaximized) document.body.classList.add('immersive');
    else document.body.classList.remove('immersive');
}

function initImmersiveTriggers() {
    const topTrigger = document.querySelector('.edge-trigger-top');
    const bottomTrigger = document.querySelector('.edge-trigger-bottom');
    const topBar = document.querySelector('.top-bar-container');
    const dock = document.querySelector('.dock-container');
    function show(el) { el.classList.add('reveal'); }
    function hide(el) { el.classList.remove('reveal'); }
    topTrigger.addEventListener('mouseenter', () => show(topBar));
    topBar.addEventListener('mouseleave', () => hide(topBar));
    bottomTrigger.addEventListener('mouseenter', () => show(dock));
    dock.addEventListener('mouseleave', () => hide(dock));
}

// Global editor state
const editorState = {
    recentFiles: JSON.parse(localStorage.getItem('editorRecentFiles') || '[]').slice(0, 10),
    lastProject: localStorage.getItem('editorLastProject') || null,

    addRecent(path, name) {
        this.recentFiles = this.recentFiles.filter(f => f.path !== path);
        this.recentFiles.unshift({ path, name });
        this.recentFiles = this.recentFiles.slice(0, 10);
        localStorage.setItem('editorRecentFiles', JSON.stringify(this.recentFiles));
    },

    setLastProject(path) {
        this.lastProject = path;
        localStorage.setItem('editorLastProject', path);
    }
};

function initEditor(windowEl) {
    const header = windowEl.querySelector('.window-header');
    const title = windowEl.querySelector('.window-title');
    const controls = windowEl.querySelector('.window-controls');
    const textarea = windowEl.querySelector('.editor-textarea');
    const code = windowEl.querySelector('.editor-pre code');
    const tabsContainer = windowEl.querySelector('.editor-tabs');
    const projectTree = windowEl.querySelector('.project-tree');
    const projectName = windowEl.querySelector('.project-name');
    const openFilesList = windowEl.querySelector('.open-files-list');
    const sidebarTabs = windowEl.querySelectorAll('.editor-sidebar-tab');
    const panels = windowEl.querySelectorAll('.editor-panel');
    const statusFile = windowEl.querySelector('.editor-status-file');
    const statusType = windowEl.querySelector('.editor-status-type');
    const statusPos = windowEl.querySelector('.editor-status-pos');

    let activeFilePath = null;
    let projectPath = null;
    let projectFiles = []; // Cached project structure
    let localOpenFiles = new Map();
    let expandedFolders = new Set();

    // === Integrate toolbar into window header (like Browser) ===
    const editorToolbar = document.createElement('div');
    editorToolbar.className = 'editor-header-toolbar';
    editorToolbar.innerHTML = `
        <button class="editor-header-btn open-project-btn" title="Open Project"><i class="ph ph-folder-open"></i></button>
        <button class="editor-header-btn save-btn" title="Save (Cmd+S)"><i class="ph ph-floppy-disk"></i></button>
        <button class="editor-header-btn new-file-btn" title="New File"><i class="ph ph-file-plus"></i></button>
    `;
    title.style.display = 'none';
    header.insertBefore(editorToolbar, controls);
    header.classList.add('editor-header-integrated');

    const openProjectBtn = editorToolbar.querySelector('.open-project-btn');
    const saveBtn = editorToolbar.querySelector('.save-btn');
    const newFileBtn = editorToolbar.querySelector('.new-file-btn');

    // === Sidebar tab switching ===
    sidebarTabs.forEach(tab => {
        tab.onclick = () => {
            sidebarTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const tabName = tab.dataset.tab;
            panels.forEach(p => {
                p.classList.toggle('active', p.classList.contains(tabName + '-panel'));
            });
        };
    });

    // === File icons ===
    function getFileIcon(name, isDir = false) {
        if (isDir) return 'ph-folder-simple';
        const ext = name.split('.').pop().toLowerCase();
        const icons = {
            'html': 'ph-file-html', 'htm': 'ph-file-html',
            'css': 'ph-file-css',
            'js': 'ph-file-js', 'ts': 'ph-file-ts', 'tsx': 'ph-file-ts', 'jsx': 'ph-file-js',
            'json': 'ph-file-code',
            'md': 'ph-file-text', 'txt': 'ph-file-text',
            'png': 'ph-file-image', 'jpg': 'ph-file-image', 'jpeg': 'ph-file-image', 'gif': 'ph-file-image', 'svg': 'ph-file-image',
            'py': 'ph-file-py',
        };
        return icons[ext] || 'ph-file';
    }

    // === Render project tree ===
    async function loadProjectTree(path) {
        try {
            const result = await api.listDir(path);
            return result.items.map(item => ({
                name: item.name,
                path: item.path,
                isDir: item.isDirectory,
                children: null // Lazy load
            }));
        } catch (err) {
            console.error('Failed to load directory:', err);
            return [];
        }
    }

    async function renderProjectTree() {
        if (!projectPath) {
            projectTree.innerHTML = `
                <div class="no-project-msg">
                    <i class="ph ph-folder-open"></i>
                    <p>Open a folder to see project files</p>
                </div>
            `;
            return;
        }

        projectTree.innerHTML = '<div class="loading-tree">Loading...</div>';

        async function buildTree(items, parentEl, basePath = '') {
            for (const item of items) {
                const el = document.createElement('div');
                el.className = 'tree-item' + (item.isDir ? ' folder' : ' file');
                el.dataset.path = item.path;

                const row = document.createElement('div');
                row.className = 'tree-row';
                row.innerHTML = `
                    ${item.isDir ? `<i class="ph ${expandedFolders.has(item.path) ? 'ph-caret-down' : 'ph-caret-right'} tree-arrow"></i>` : '<span class="tree-arrow-placeholder"></span>'}
                    <i class="ph ${getFileIcon(item.name, item.isDir)}"></i>
                    <span class="tree-name">${item.name}</span>
                `;

                if (item.isDir) {
                    row.onclick = async (e) => {
                        e.stopPropagation();
                        const arrow = row.querySelector('.tree-arrow');
                        const childContainer = el.querySelector('.tree-children');

                        if (expandedFolders.has(item.path)) {
                            expandedFolders.delete(item.path);
                            arrow.className = 'ph ph-caret-right tree-arrow';
                            if (childContainer) childContainer.style.display = 'none';
                        } else {
                            expandedFolders.add(item.path);
                            arrow.className = 'ph ph-caret-down tree-arrow';

                            if (childContainer) {
                                childContainer.style.display = 'block';
                            } else {
                                const children = await loadProjectTree(item.path);
                                if (children.length > 0) {
                                    const container = document.createElement('div');
                                    container.className = 'tree-children';
                                    await buildTree(children, container, item.path);
                                    el.appendChild(container);
                                }
                            }
                        }
                    };
                } else {
                    row.onclick = () => openFile(item.path, item.name);
                }

                el.appendChild(row);
                parentEl.appendChild(el);
            }
        }

        const items = await loadProjectTree(projectPath);
        projectTree.innerHTML = '';
        await buildTree(items, projectTree);
    }

    // === Open project folder ===
    async function openProject(path) {
        projectPath = path;
        projectName.textContent = path.split('/').pop() || path;
        editorState.setLastProject(path);
        expandedFolders.clear();
        await renderProjectTree();
    }

    // === Tabs and open files ===
    function renderTabs() {
        tabsContainer.innerHTML = '';
        if (localOpenFiles.size === 0) {
            tabsContainer.innerHTML = '<div class="no-tabs-msg">No open files</div>';
            return;
        }

        localOpenFiles.forEach((fileData, path) => {
            const name = path.split('/').pop();
            const tab = document.createElement('div');
            tab.className = 'editor-tab' + (path === activeFilePath ? ' active' : '');
            tab.innerHTML = `
                <i class="ph ${getFileIcon(name)}"></i>
                <span>${name}${fileData.isModified ? ' •' : ''}</span>
                <i class="ph ph-x tab-close"></i>
            `;
            tab.onclick = (e) => {
                if (!e.target.classList.contains('tab-close')) switchToFile(path);
            };
            tab.querySelector('.tab-close').onclick = (e) => {
                e.stopPropagation();
                closeFile(path);
            };
            tabsContainer.appendChild(tab);
        });
    }

    function renderOpenFilesList() {
        openFilesList.innerHTML = '';
        localOpenFiles.forEach((fileData, path) => {
            const name = path.split('/').pop();
            const el = document.createElement('div');
            el.className = 'open-file-item' + (path === activeFilePath ? ' active' : '');
            el.innerHTML = `
                <i class="ph ${getFileIcon(name)}"></i>
                <span>${name}${fileData.isModified ? ' •' : ''}</span>
                <i class="ph ph-x close-btn"></i>
            `;
            el.onclick = (e) => {
                if (!e.target.classList.contains('close-btn')) switchToFile(path);
            };
            el.querySelector('.close-btn').onclick = (e) => {
                e.stopPropagation();
                closeFile(path);
            };
            openFilesList.appendChild(el);
        });
    }

    // === File operations ===
    function updateHighlight() {
        if (!activeFilePath) {
            code.textContent = '';
            return;
        }
        const ext = activeFilePath.split('.').pop();
        if (window.Syntax) code.innerHTML = Syntax.highlight(textarea.value, ext);
        else code.textContent = textarea.value;
    }

    function switchToFile(path) {
        if (!localOpenFiles.has(path)) return;

        if (activeFilePath && localOpenFiles.has(activeFilePath)) {
            localOpenFiles.get(activeFilePath).content = textarea.value;
        }

        activeFilePath = path;
        const fileData = localOpenFiles.get(path);
        textarea.value = fileData.content;

        const name = path.split('/').pop();
        const ext = name.split('.').pop().toUpperCase();
        statusFile.textContent = name;
        statusType.textContent = ext;

        updateHighlight();
        renderTabs();
        renderOpenFilesList();
        updateCursorPosition();
    }

    async function openFile(path, name) {
        if (localOpenFiles.has(path)) {
            switchToFile(path);
            return;
        }

        try {
            const result = await api.readFile(path);
            localOpenFiles.set(path, {
                content: result.content,
                originalContent: result.content,
                isModified: false
            });
            editorState.addRecent(path, name);
            switchToFile(path);
        } catch (err) {
            alert('Could not open file: ' + err.message);
        }
    }

    async function closeFile(path) {
        const fileData = localOpenFiles.get(path);
        if (fileData && fileData.isModified) {
            const confirmed = await showConfirm({
                title: 'Unsaved Changes',
                content: `${path.split('/').pop()} has unsaved changes. Close anyway?`,
                confirmText: 'Close',
                type: 'danger'
            });
            if (!confirmed) return;
        }

        localOpenFiles.delete(path);

        if (activeFilePath === path) {
            const remaining = Array.from(localOpenFiles.keys());
            if (remaining.length > 0) {
                switchToFile(remaining[remaining.length - 1]);
            } else {
                activeFilePath = null;
                textarea.value = '';
                statusFile.textContent = 'No file';
                statusType.textContent = '';
                code.textContent = '';
            }
        }

        renderTabs();
        renderOpenFilesList();
    }

    async function saveCurrentFile() {
        if (!activeFilePath) return;
        const fileData = localOpenFiles.get(activeFilePath);
        if (!fileData) return;

        try {
            await api.writeFile(activeFilePath, fileData.content);
            fileData.originalContent = fileData.content;
            fileData.isModified = false;
            renderTabs();
            renderOpenFilesList();
        } catch (err) {
            alert('Failed to save: ' + err.message);
        }
    }

    // === Cursor position tracking ===
    function updateCursorPosition() {
        const text = textarea.value.substring(0, textarea.selectionStart);
        const lines = text.split('\n');
        const line = lines.length;
        const col = lines[lines.length - 1].length + 1;
        statusPos.textContent = `Ln ${line}, Col ${col}`;
    }

    // === Event handlers ===
    textarea.oninput = () => {
        if (!activeFilePath) return;
        const fileData = localOpenFiles.get(activeFilePath);
        if (fileData) {
            fileData.content = textarea.value;
            fileData.isModified = fileData.content !== fileData.originalContent;
            renderTabs();
            renderOpenFilesList();
        }
        updateHighlight();
    };

    textarea.onscroll = () => {
        windowEl.querySelector('.editor-pre').scrollTop = textarea.scrollTop;
        windowEl.querySelector('.editor-pre').scrollLeft = textarea.scrollLeft;
    };

    textarea.onclick = updateCursorPosition;
    textarea.onkeyup = updateCursorPosition;

    textarea.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 's') {
            e.preventDefault();
            saveCurrentFile();
        }
    });

    saveBtn.onclick = saveCurrentFile;

    openProjectBtn.onclick = () => {
        // Show folder picker (using Finder for now)
        const picker = openWindow('Finder', 'ph-folder-notch');
        // Add select button to Finder
        setTimeout(() => {
            const finderToolbar = picker.querySelector('.finder-toolbar');
            if (finderToolbar) {
                const selectBtn = document.createElement('button');
                selectBtn.className = 'finder-select-btn';
                selectBtn.innerHTML = '<i class="ph ph-folder-open"></i> Open as Project';
                selectBtn.onclick = () => {
                    const currentPath = picker.querySelector('.finder-path').textContent;
                    openProject(currentPath);
                    picker.querySelector('.close').click();
                };
                finderToolbar.appendChild(selectBtn);
            }
        }, 100);
    };

    newFileBtn.onclick = async () => {
        const fileName = await showModal({
            title: 'New File',
            content: 'Enter file name:',
            placeholder: 'untitled.txt',
            confirmText: 'Create'
        });
        
        if (!fileName) return;

        // Determine base path: use project path if active, otherwise Desktop (as requested)
        const basePath = projectPath || 'Desktop';
        const filePath = `${basePath}/${fileName}`;

        try {
            await api.writeFile(filePath, '');
            await openFile(filePath, fileName);
            if (projectPath) await renderProjectTree();
            window.refreshFileSystem(filePath);
        } catch (err) {
            alert('Failed to create file: ' + err.message);
        }
    };

    // === Initialize ===
    renderTabs();
    renderOpenFilesList();

    // Auto-open last project
    if (editorState.lastProject) {
        openProject(editorState.lastProject);
    }

    // Expose methods
    windowEl.editorOpenFile = openFile;
    windowEl.editorOpenProject = openProject;
}

function initBrowser(windowEl) {
    const header = windowEl.querySelector('.window-header');
    const title = windowEl.querySelector('.window-title');
    const controls = windowEl.querySelector('.window-controls');
    const tabsContainer = windowEl.querySelector('.browser-tabs');
    const tabsWrapper = windowEl.querySelector('.browser-tabs-container'); 
    
    title.style.display = 'none';
    header.appendChild(tabsContainer);
    tabsWrapper.remove(); 
    header.classList.add('browser-header-integrated');

    const input = windowEl.querySelector('input');
    const iframe = windowEl.querySelector('iframe');
    const newTabBtn = windowEl.querySelector('.new-tab-btn');
    const browserContent = windowEl.querySelector('.browser-content');
    
    const devToolsHTML = `<div class="devtools-pane" style="display:none"><div class="devtools-header"><div class="devtools-tab active" data-tab="elements">Elements</div><div class="devtools-tab" data-tab="console">Console</div><div class="devtools-tab" onclick="this.closest('.devtools-pane').style.display='none'"><i class="ph ph-x"></i></div></div><div class="devtools-content" id="dt-elements"></div><div class="devtools-content" id="dt-console" style="display:none"><div class="dt-log-container"></div><input class="dt-console-input" placeholder=">"></div></div>`;
    browserContent.insertAdjacentHTML('beforeend', devToolsHTML);
    const devToolsPane = browserContent.querySelector('.devtools-pane');
    
    const dtTabs = devToolsPane.querySelectorAll('.devtools-tab[data-tab]');
    dtTabs.forEach(t => t.onclick = () => {
        dtTabs.forEach(x => x.classList.remove('active'));
        t.classList.add('active');
        devToolsPane.querySelectorAll('.devtools-content').forEach(c => c.style.display = 'none');
        devToolsPane.querySelector(`#dt-${t.dataset.tab}`).style.display = 'block';
    });

    const consoleContainer = devToolsPane.querySelector('.dt-log-container');
    const consoleInput = devToolsPane.querySelector('.dt-console-input');

    function logToDevTools(msg, type='info') {
        const div = document.createElement('div');
        div.className = `dt-console-msg ${type}`;
        div.textContent = typeof msg === 'object' ? JSON.stringify(msg) : msg;
        consoleContainer.appendChild(div);
        consoleContainer.scrollTop = consoleContainer.scrollHeight;
    }

    consoleInput.onkeydown = (e) => {
        if (e.key === 'Enter') {
            const val = consoleInput.value;
            logToDevTools(`> ${val}`);
            try { logToDevTools(iframe.contentWindow.eval(val)); } catch (err) { logToDevTools(err.message, 'error'); }
            consoleInput.value = '';
        }
    };

    function renderDOMTree() {
        const tree = devToolsPane.querySelector('#dt-elements');
        try {
            const doc = iframe.contentDocument;
            if(!doc) throw new Error();
            function buildTree(node, depth=0) {
                if (node.nodeType === 3) return node.nodeValue.trim() ? `<div style="padding-left:${depth*10}px"><span class="dt-text">"${node.nodeValue.trim()}"</span></div>` : '';
                if (node.nodeType === 1) {
                    let attrs = ''; Array.from(node.attributes).forEach(a => attrs += ` <span class="dt-attr">${a.name}</span>=<span class="dt-val">"${a.value}"</span>`);
                    let children = ''; node.childNodes.forEach(c => children += buildTree(c, depth+1));
                    return `<div style="padding-left:${depth*10}px"><span class="dt-tag">&lt;${node.tagName.toLowerCase()}</span>${attrs}<span class="dt-tag">&gt;</span>${children}<span class="dt-tag">&lt;/${node.tagName.toLowerCase()}&gt;</span></div>`;
                }
                return '';
            }
            tree.innerHTML = buildTree(doc.body);
        } catch(e) { tree.innerHTML = '<div style="padding:10px; color:#aaa">Cross-Origin DOM unavailable.</div>'; }
    }

    const demoHTML = `data:text/html,<html><body style="background:white;font-family:sans-serif;padding:20px;"><h1>Test Page</h1><button onclick="console.log('Clicked!')">Log</button><script>console.log('Loaded');</script></body></html>`;
    let tabs = [{ id: Date.now(), title: 'Test Page', url: demoHTML }];
    let activeTabId = tabs[0].id;

    function renderTabs() {
        tabsContainer.querySelectorAll('.browser-tab').forEach(t => t.remove());
        tabs.forEach(tab => {
            const tabEl = document.createElement('div');
            tabEl.className = 'browser-tab' + (tab.id === activeTabId ? ' active' : '');
            tabEl.innerHTML = `<span>${tab.title}</span> <i class="ph ph-x"></i>`;
            tabEl.onclick = (e) => { 
                e.stopPropagation(); 
                activeTabId = tab.id; 
                input.value = tab.url.startsWith('data:') ? 'local://test' : tab.url; 
                
                // Use Proxy for HTTP(S)
                let targetSrc = tab.url;
                if (tab.url.startsWith('http')) {
                    targetSrc = `/api/v1/proxy?url=${encodeURIComponent(tab.url)}`;
                }
                
                iframe.src = targetSrc; 
                renderTabs(); 
                setTimeout(renderDOMTree, 500); 
            };
            tabEl.querySelector('.ph-x').onclick = (e) => { e.stopPropagation(); if (tabs.length > 1) { tabs = tabs.filter(t => t.id !== tab.id); if (activeTabId === tab.id) activeTabId = tabs[0].id; renderTabs(); } };
            tabsContainer.insertBefore(tabEl, newTabBtn);
        });
    }

    newTabBtn.onclick = (e) => { 
        e.stopPropagation(); 
        const url = 'https://www.google.com/search?igu=1'; 
        const nt = { id: Date.now(), title: 'New Tab', url: url }; 
        tabs.push(nt); 
        activeTabId = nt.id; 
        // Use Proxy
        iframe.src = `/api/v1/proxy?url=${encodeURIComponent(url)}`; 
        renderTabs(); 
    };

    input.onkeydown = (e) => { 
        if (e.key === 'Enter') { 
            let url = input.value.trim(); 
            if (!url.startsWith('http') && !url.startsWith('data:')) url = 'https://' + url; 
            
            // Use Proxy
            let targetSrc = url;
            if (url.startsWith('http')) {
                targetSrc = `/api/v1/proxy?url=${encodeURIComponent(url)}`;
            }

            iframe.src = targetSrc; 
            const tab = tabs.find(t => t.id === activeTabId); 
            tab.url = url; 
            tab.title = url.startsWith('data:') ? 'Local' : (url.split('/')[2] || url); 
            renderTabs(); 
            setTimeout(renderDOMTree, 1000); 
        } 
    };
    
    const contextHandler = (e) => { e.preventDefault(); window.currentBrowserDevTools = { pane: devToolsPane, render: renderDOMTree }; showContextMenu(e.clientX, e.clientY, 'browser'); };
    windowEl.querySelector('.browser-toolbar').oncontextmenu = contextHandler;
    header.oncontextmenu = contextHandler;
    windowEl.querySelector('.reload').onclick = () => { iframe.src = iframe.src; setTimeout(renderDOMTree, 500); };
    renderTabs();
    iframe.src = demoHTML;
    iframe.onload = () => { renderDOMTree(); if (iframe.contentWindow) { const l = iframe.contentWindow.console.log; iframe.contentWindow.console.log = (...a) => { l(...a); logToDevTools(a.join(' ')); }; } };
}

async function initClaudeCode(windowEl) {
    const projectsContainer = windowEl.querySelector('.claude-projects');
    const chatList = windowEl.querySelector('.chat-list');
    const mainContainer = windowEl.querySelector('.claude-main');
    const header = windowEl.querySelector('.claude-header');

    // Restore Chat UI structure
    const chatMessages = document.createElement('div');
    chatMessages.className = 'chat-messages';

    const inputArea = document.createElement('div');
    inputArea.className = 'claude-input-area';
    inputArea.innerHTML = `
        <div class="claude-input-container">
            <i class="ph ph-paperclip"></i>
            <input type="text" placeholder="Message Claude...">
            <i class="ph ph-paper-plane-right" id="send-btn" style="cursor: pointer;"></i>
        </div>
    `;

    // Clear existing main content (remove xterm if any)
    const existingXterm = windowEl.querySelector('.xterm-container');
    if (existingXterm) existingXterm.remove();

    // Append new UI if not present
    if (!windowEl.querySelector('.chat-messages')) {
        header.after(chatMessages);
        mainContainer.appendChild(inputArea);
    }

    const input = inputArea.querySelector('input');
    const sendBtn = inputArea.querySelector('#send-btn');
    const modelSelector = windowEl.querySelector('.model-selector');

    // State
    let activeProject = null;
    let activeSessionId = null;
    let ws = null;
    let currentAiMessage = null;
    let isStreaming = false;
    let currentMode = 'normal'; // normal, auto, plan

    // --- Mode Selector ---
    function initModeSelector() {
        // Create selector if it doesn't exist
        if (!header.querySelector('.mode-selector')) {
            const selector = document.createElement('select');
            selector.className = 'mode-selector';
            selector.innerHTML = `
                <option value="normal">Normal Mode</option>
                <option value="auto">Auto Accept</option>
                <option value="plan">Plan Mode</option>
            `;
            selector.onchange = (e) => {
                currentMode = e.target.value;
                console.log('Mode switched to:', currentMode);
            };
            
            // Insert after model selector
            if (modelSelector) {
                modelSelector.after(selector);
            } else {
                header.appendChild(selector);
            }
        }
    }

    // --- Helper Functions ---

    function getProjectIcon(path) {
        const name = path.split('/').pop() || path;
        return name.charAt(0).toUpperCase();
    }

    function formatDate(dateStr) {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        const now = new Date();
        const diff = now - date;
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));

        if (days === 0) {
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } else if (days === 1) {
            return 'Yesterday';
        } else if (days < 7) {
            return date.toLocaleDateString([], { weekday: 'short' });
        }
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }

    // Strip ANSI escape codes and terminal UI elements for chat display
    function stripAnsi(str) {
        // OSC sequences: \x1B]...(\x07 or \x1B\\) - terminal title, hyperlinks, etc.
        str = str.replace(/\x1B\][^\x07\x1B]*(?:\x07|\x1B\\)/g, '');
        // CSI sequences: \x1B[...X - colors, cursor, formatting
        str = str.replace(/\x1B\[[0-9;?]*[A-Za-z]/g, '');
        // Single-char escape sequences: \x1B followed by single char
        str = str.replace(/\x1B[@-Z\\-_]/g, '');
        // DCS/PM/APC sequences
        str = str.replace(/\x1B[PX^_].*?\x1B\\/g, '');
        // Bell character
        str = str.replace(/\x07/g, '');
        // Carriage return (for line redraws)
        str = str.replace(/\r/g, '');
        // Box drawing characters (Claude CLI UI elements)
        str = str.replace(/[─│┌┐└┘├┤┬┴┼╔╗╚╝║═╠╣╦╩╬◆◇●○■□▪▫▶▷◀◁]/g, '');
        // Clean up multiple spaces/newlines left after stripping
        str = str.replace(/  +/g, ' ');
        str = str.replace(/\n\n+/g, '\n');
        return str;
    }

    function addMessage(role, text, isHtml = false) {
        const msgDiv = document.createElement('div');
        msgDiv.className = `msg ${role}`;
        if (isHtml) {
            msgDiv.innerHTML = text;
        } else {
            msgDiv.textContent = text;
        }
        chatMessages.appendChild(msgDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return msgDiv;
    }

    // Approval UI Helper
    function createApprovalUI(toolName, toolInput) {
        const container = document.createElement('div');
        container.className = 'approval-card';
        
        let details = '';
        try {
            details = JSON.stringify(toolInput, null, 2);
        } catch (e) { details = String(toolInput); }

        container.innerHTML = `
            <div class="approval-header">
                <span><i class="ph ph-wrench"></i> Tool Use Request: ${toolName}</span>
            </div>
            <div class="approval-details">${details}</div>
            <div class="approval-actions">
                <button class="approval-btn reject">Reject</button>
                <button class="approval-btn approve">Approve</button>
            </div>
        `;

        const approveBtn = container.querySelector('.approve');
        const rejectBtn = container.querySelector('.reject');

        // Disable buttons after click to prevent double submission
        function disableButtons() {
            approveBtn.disabled = true;
            rejectBtn.disabled = true;
            approveBtn.style.opacity = '0.5';
            rejectBtn.style.opacity = '0.5';
        }

        approveBtn.onclick = () => {
            disableButtons();
            sendApproval(true);
            container.innerHTML += '<div style="margin-top:8px; color:#4caf50; font-size:12px;">Approved</div>';
        };

        rejectBtn.onclick = () => {
            disableButtons();
            sendApproval(false);
            container.innerHTML += '<div style="margin-top:8px; color:#f44336; font-size:12px;">Rejected</div>';
        };

        return container;
    }

    function sendApproval(approved) {
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        ws.send(JSON.stringify({
            type: 'approve',
            approved: approved
        }));
    }

    // --- WebSocket Connection (Headless Mode) ---

    function ensureWebSocketConnected() {
        // Create WebSocket if not connected
        if (ws && ws.readyState === WebSocket.OPEN) {
            return Promise.resolve();
        }

        return new Promise((resolve, reject) => {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            ws = new WebSocket(`${protocol}//${window.location.host}/ws/claude`);

            ws.onopen = () => {
                console.log('[Claude] WebSocket opened');
            };

            ws.onmessage = (event) => {
                const msg = JSON.parse(event.data);
                handleWebSocketMessage(msg);

                // Resolve on first connected message
                if (msg.type === 'connected') {
                    resolve();
                }
            };

            ws.onerror = (error) => {
                console.error('[Claude] WebSocket error:', error);
                isStreaming = false;
                reject(error);
            };

            ws.onclose = () => {
                console.log('[Claude] WebSocket closed');
                isStreaming = false;
                currentAiMessage = null;
            };
        });
    }

    function handleWebSocketMessage(msg) {
        switch (msg.type) {
            case 'connected':
                console.log('[Claude] Connected, session:', msg.sessionId);
                break;

            case 'start':
                // Claude is processing our message
                console.log('[Claude] Processing started');
                isStreaming = true;
                // Show thinking indicator
                currentAiMessage = addMessage('ai', '', true);
                currentAiMessage.innerHTML = '<span class="thinking-indicator">Thinking<span class="dots">...</span></span>';
                currentAiMessage.classList.add('thinking');
                break;

            case 'tool_use':
                // Handle Tool Use Request
                console.log('[Claude] Tool Use Request:', msg.toolName);
                if (currentAiMessage && currentAiMessage.classList.contains('thinking')) {
                    currentAiMessage.innerHTML = '';
                    currentAiMessage.classList.remove('thinking');
                }
                
                // If auto mode, we might want to just show it happened or skip approval
                // But typically backend handles permissions. If backend asks for input (which we simulate via this message type logic I implemented in backend),
                // we show the UI.
                // Wait, I implemented 'tool_use' message in backend to be sent when it parses 'tool_use' from Claude stream.
                // But the actual permission prompt comes from Claude CLI as text/stdout usually?
                // Or does Claude CLI pause? 
                // If using `stream-json`, `tool_use` event is just information that tool is being used.
                // The permission prompt (y/n) usually appears in stdout/stderr and requires stdin.
                // My backend implementation of `parseStreamMessage` detects `tool_use` JSON event.
                // Does this event block Claude? No, Claude CLI waits for permission if not --dangerously-skip-permissions.
                // The prompt "Do you want to run this tool? [y/n]" usually comes as text.
                // BUT, if I see `tool_use` event, I can show the UI.
                // If the user clicks approve, we send 'y' to stdin.
                
                const approvalUI = createApprovalUI(msg.toolName, msg.toolInput);
                chatMessages.appendChild(approvalUI);
                chatMessages.scrollTop = chatMessages.scrollHeight;
                
                // If Auto Mode, maybe we should auto-approve?
                // In backend I added --dangerously-skip-permissions for auto mode, so this might not even appear/block.
                // But if it does (e.g. for some tools), we can handle it here.
                if (currentMode === 'auto') {
                    // Auto-click approve after a short delay for visual feedback
                    setTimeout(() => {
                        const btn = approvalUI.querySelector('.approve');
                        if (btn && !btn.disabled) btn.click();
                    }, 500);
                }
                break;

            case 'text':
                // Streaming text content - clean, no ANSI codes!
                if (msg.content) {
                    // Remove thinking indicator on first text
                    if (currentAiMessage && currentAiMessage.classList.contains('thinking')) {
                        currentAiMessage.innerHTML = '';
                        currentAiMessage.classList.remove('thinking');
                    }
                    appendStreamText(msg.content);
                }
                break;

            case 'done':
                // Response complete
                console.log('[Claude] Response complete');
                isStreaming = false;
                // Store conversation ID for resuming
                if (msg.sessionId) {
                    activeSessionId = msg.sessionId;
                }
                break;

            case 'error':
                console.error('[Claude] Error:', msg.content);
                isStreaming = false;
                if (currentAiMessage) {
                    currentAiMessage.innerHTML += `<br><span style="color: #f44;">Error: ${msg.content}</span>`;
                } else {
                    addMessage('ai', `Error: ${msg.content}`);
                }
                break;
            
            case 'permission_denied':
                 if (currentAiMessage) {
                    currentAiMessage.innerHTML += `<br><span style="color: #f44;">Permission Denied</span>`;
                }
                break;

            case 'exit':
                console.log('[Claude] Process exited with code:', msg.exitCode);
                isStreaming = false;
                currentAiMessage = null;
                // Store conversation ID for next message
                if (msg.conversationId) {
                    activeSessionId = msg.conversationId;
                }
                // Reload sessions after interaction
                if (activeProject) {
                    loadSessions(activeProject);
                }
                break;
        }
    }

    function appendStreamText(text) {
        if (!currentAiMessage) {
            currentAiMessage = addMessage('ai', '', true);
        }

        // Text is already clean from headless mode - just convert newlines
        const htmlText = text.replace(/\n/g, '<br>');
        currentAiMessage.innerHTML += htmlText;
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    async function sendMessage() {
        const text = input.value.trim();
        if (!text) return;

        if (!activeProject) {
            alert('Please select or create a project first.');
            return;
        }

        input.value = '';
        addMessage('user', text);

        // Create new AI message placeholder for streaming
        currentAiMessage = null;

        try {
            await ensureWebSocketConnected();

            // Send message with project path
            console.log('[Claude] Sending message to', activeProject);
            ws.send(JSON.stringify({
                type: 'message',
                text: text,
                path: activeProject,
                resumeSessionId: activeSessionId || undefined,
                mode: currentMode, // Send current mode
                model: modelSelector?.value // Send selected model
            }));
        } catch (e) {
            console.error('[Claude] Failed to send message:', e);
            addMessage('ai', `Connection error: ${e.message || 'Failed to connect'}`);
        }
    }

    input.onkeydown = (e) => {
        if (e.key === 'Enter') sendMessage();
    };

    sendBtn.onclick = sendMessage;

    // Init Mode Selector
    initModeSelector();

    async function loadProjects() {
        try {
            const projects = await api.getClaudeProjects();
            renderProjects(projects);

            if (!activeProject && projects.length > 0) {
                selectProject(projects[0]);
            }
        } catch (e) {
            console.error('Failed to load projects:', e);
        }
    }

    function renderProjects(projects) {
        projectsContainer.innerHTML = '';

        projects.forEach(path => {
            const icon = document.createElement('div');
            icon.className = 'project-icon' + (activeProject === path ? ' active' : '');
            icon.title = path;
            icon.textContent = getProjectIcon(path);
            icon.onclick = () => selectProject(path);

            icon.oncontextmenu = async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const confirmed = await showConfirm({
                    title: 'Remove Project',
                    content: `Remove project "${path}"?`,
                    confirmText: 'Remove',
                    type: 'danger'
                });
                if (confirmed) {
                    api.removeClaudeProject(path).then(loadProjects);
                }
            };

            projectsContainer.appendChild(icon);
        });

        // Add Button
        const addBtn = document.createElement('div');
        addBtn.className = 'project-icon';
        addBtn.title = 'Add Project';
        addBtn.innerHTML = '<i class="ph ph-plus"></i>';
        addBtn.onclick = () => {
            const picker = openWindow('Finder', 'ph-folder-notch');
            setTimeout(() => {
                const toolbar = picker.querySelector('.finder-toolbar');
                if (toolbar && !toolbar.querySelector('.finder-select-btn')) {
                    const selectBtn = document.createElement('button');
                    selectBtn.className = 'finder-select-btn';
                    selectBtn.innerHTML = '<i class="ph ph-folder-open"></i> Select Project Folder';
                    selectBtn.onclick = async () => {
                        const currentPath = picker.querySelector('.finder-path').textContent;
                        try {
                            await api.addClaudeProject(currentPath);
                            loadProjects();
                            picker.querySelector('.close').click();
                        } catch (e) {
                            alert(e.message);
                        }
                    };
                    toolbar.appendChild(selectBtn);
                }
            }, 100);
        };
        projectsContainer.appendChild(addBtn);
    }

    // Load sessions from Claude's sessions-index.json
    async function loadSessions(projectPath) {
        chatList.innerHTML = '<div style="padding:10px; opacity:0.5">Loading sessions...</div>';
        try {
            const sessions = await api.getClaudeSessions(projectPath);
            chatList.innerHTML = '';

            // Add "New Session" button
            const newSessionItem = document.createElement('div');
            newSessionItem.className = 'chat-list-item';
            newSessionItem.style.cssText = 'background: var(--accent-color); color: white; text-align: center;';
            newSessionItem.innerHTML = '<i class="ph ph-plus"></i> New Session';
            newSessionItem.onclick = () => startNewSession();
            chatList.appendChild(newSessionItem);

            if (sessions.length === 0) {
                const emptyMsg = document.createElement('div');
                emptyMsg.style.cssText = 'padding:10px; opacity:0.5; font-size:12px;';
                emptyMsg.textContent = 'No sessions yet';
                chatList.appendChild(emptyMsg);
                // Only clear chat if there's no active conversation
                if (!chatMessages.querySelector('.msg')) {
                    chatMessages.innerHTML = '<div style="text-align:center; padding: 20px; color: var(--text-muted);">Start a new conversation</div>';
                }
                return;
            }

            sessions.forEach(session => {
                const item = document.createElement('div');
                item.className = 'chat-list-item' + (activeSessionId === session.id ? ' active' : '');

                const preview = session.preview || 'Session';
                const dateStr = formatDate(session.modified || session.created);
                const msgCount = session.messageCount || 0;

                item.innerHTML = `
                    <div class="session-preview" style="font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${preview}</div>
                    <div class="session-meta" style="font-size:10px; opacity:0.6; display:flex; gap:8px;">
                        <span>${msgCount} msgs</span>
                        <span>${dateStr}</span>
                        ${session.gitBranch ? `<span><i class="ph ph-git-branch"></i> ${session.gitBranch}</span>` : ''}
                    </div>
                `;

                item.onclick = () => selectSession(session.id, projectPath);
                chatList.appendChild(item);
            });
        } catch (e) {
            console.error('Failed to load sessions:', e);
            chatList.innerHTML = '<div style="padding:10px; opacity:0.5">Could not load sessions</div>';
        }
    }

    // Load and display session history
    async function selectSession(sessionId, projectPath) {
        activeSessionId = sessionId;

        // Update UI selection
        chatList.querySelectorAll('.chat-list-item').forEach(item => item.classList.remove('active'));
        const selectedItem = [...chatList.querySelectorAll('.chat-list-item')].find(item =>
            item.textContent.includes(sessionId) || item.onclick?.toString().includes(sessionId)
        );
        if (selectedItem) selectedItem.classList.add('active');

        // Clear chat and show loading
        chatMessages.innerHTML = '<div style="text-align:center; padding: 20px; color: var(--text-muted);">Loading session...</div>';

        try {
            const messages = await api.getClaudeSession(sessionId, projectPath);
            chatMessages.innerHTML = '';

            if (messages.length === 0) {
                chatMessages.innerHTML = '<div style="text-align:center; padding: 20px; color: var(--text-muted);">No messages in this session</div>';
                return;
            }

            messages.forEach(msg => {
                addMessage(msg.role === 'user' ? 'user' : 'ai', msg.content);
            });

            // Add resume button
            const resumeBtn = document.createElement('div');
            resumeBtn.style.cssText = 'text-align:center; padding: 15px;';
            resumeBtn.innerHTML = `<button style="background: var(--accent-color); color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer;"><i class="ph ph-play"></i> Resume Session</button>`;
            resumeBtn.querySelector('button').onclick = () => resumeSession(sessionId, projectPath);
            chatMessages.appendChild(resumeBtn);

        } catch (e) {
            console.error('Failed to load session:', e);
            chatMessages.innerHTML = '<div style="text-align:center; padding: 20px; color: #ff5f56;">Failed to load session</div>';
        }
    }

    function startNewSession() {
        activeSessionId = null;
        chatMessages.innerHTML = '<div style="text-align:center; padding: 20px; color: var(--text-muted);">Start a new conversation</div>';

        // Update UI
        chatList.querySelectorAll('.chat-list-item').forEach(item => item.classList.remove('active'));
        chatList.querySelector('.chat-list-item').classList.add('active'); // "New Session" button

        // Close any existing WebSocket
        if (ws && ws.readyState !== WebSocket.CLOSED) {
            ws.close();
        }
        isStreaming = false;
        cliReady = false;
        pendingMessage = null;
        currentAiMessage = null;
    }

    function resumeSession(sessionId, projectPath) {
        activeSessionId = sessionId;

        // Remove resume button
        const resumeContainer = chatMessages.querySelector('div:last-child');
        if (resumeContainer && resumeContainer.querySelector('button')) {
            resumeContainer.remove();
        }

        // Connect WebSocket with resume ID
        connectWebSocket(projectPath, sessionId);
    }

    async function loadModels() {
        try {
            const models = await api.getClaudeModels();
            modelSelector.innerHTML = '';
            models.forEach(m => {
                const opt = document.createElement('option');
                opt.value = m.id;
                opt.textContent = m.name;
                modelSelector.appendChild(opt);
            });
        } catch (e) {
            console.error('Failed to load models:', e);
        }
    }

    async function selectProject(path) {
        activeProject = path;
        activeSessionId = null;

        // Close any existing WebSocket
        if (ws && ws.readyState !== WebSocket.CLOSED) {
            ws.close();
        }
        isStreaming = false;
        cliReady = false;
        pendingMessage = null;
        currentAiMessage = null;

        renderProjects(await api.getClaudeProjects());
        loadSessions(path);
        windowEl.querySelector('.chat-title').textContent = path.split('/').pop();
    }

    // Cleanup on window close
    const closeBtn = windowEl.querySelector('.close');
    if (closeBtn) {
        const originalOnclick = closeBtn.onclick;
        closeBtn.onclick = (e) => {
            if (ws && ws.readyState !== WebSocket.CLOSED) {
                ws.close();
            }
            if (originalOnclick) originalOnclick(e);
        };
    }

    // Initialize
    loadProjects();
    loadModels();
}

async function loadWallpapers(windowEl) {
    const grid = windowEl.querySelector('#wallpaper-grid');
    if (!grid) return;
    
    // Only load once to save bandwidth
    if (grid.dataset.loaded === 'true') return;

    try {
        const wallpapers = await api.getWallpapers();
        grid.innerHTML = '';
        
        wallpapers.forEach(url => {
            const el = document.createElement('div');
            el.className = 'wallpaper-option';
            el.style.backgroundImage = `url('${url}')`;
            el.title = url.split('/').pop();
            el.onclick = () => {
                window.setWallpaper(url);
                grid.querySelectorAll('.wallpaper-option').forEach(o => o.classList.remove('active'));
                el.classList.add('active');
            };
            
            // Mark active if matches current
            const current = localStorage.getItem('desktopWallpaper');
            if (current === url) el.classList.add('active');
            
            grid.appendChild(el);
        });
        
        grid.dataset.loaded = 'true';
    } catch (e) {
        console.error(e);
        grid.innerHTML = '<div style="color:red; font-size:12px;">Failed to load wallpapers</div>';
    }
}

function initSettings(windowEl) {
    const sidebar = windowEl.querySelector('.settings-layout .sidebar');
    const mainContent = windowEl.querySelector('.settings-layout .main-content');
    if (!sidebar || !mainContent) return;

    // Sidebar navigation
    const sidebarItems = sidebar.querySelectorAll('.sidebar-item');
    const sections = mainContent.querySelectorAll('.settings-section');

    sidebarItems.forEach(item => {
        item.addEventListener('click', () => {
            const sectionName = item.dataset.section;
            sidebarItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            sections.forEach(s => {
                s.classList.toggle('active', s.dataset.section === sectionName);
            });
            
            if (sectionName === 'design') {
                loadWallpapers(windowEl);
            }
        });
    });

    // Initialize UI from current settings
    function loadSettingsToUI() {
        // Text inputs
        windowEl.querySelectorAll('.setting-input[data-setting]').forEach(input => {
            const key = input.dataset.setting;
            if (key && DesignSystem.settings[key] !== undefined) {
                input.value = DesignSystem.get(key);
            }
        });

        // Selects
        windowEl.querySelectorAll('.setting-select[data-setting]').forEach(select => {
            const key = select.dataset.setting;
            if (key && DesignSystem.settings[key] !== undefined) {
                select.value = DesignSystem.get(key);
            }
        });

        // Toggle switches
        windowEl.querySelectorAll('.toggle-switch[data-setting]').forEach(toggle => {
            const key = toggle.dataset.setting;
            if (key && DesignSystem.settings[key] !== undefined) {
                toggle.classList.toggle('checked', DesignSystem.get(key));
            }
        });

        // Color options
        const accentColor = DesignSystem.get('accentColor');
        windowEl.querySelectorAll('.color-option').forEach(option => {
            option.classList.toggle('active', option.dataset.color === accentColor);
        });
    }

    loadSettingsToUI();

    // Text input handlers
    windowEl.querySelectorAll('.setting-input[data-setting]').forEach(input => {
        input.addEventListener('change', () => {
            DesignSystem.set(input.dataset.setting, input.value);
        });
    });

    // Select handlers
    windowEl.querySelectorAll('.setting-select[data-setting]').forEach(select => {
        select.addEventListener('change', () => {
            DesignSystem.set(select.dataset.setting, select.value);
        });
    });

    // Toggle switch handlers
    windowEl.querySelectorAll('.toggle-switch[data-setting]').forEach(toggle => {
        toggle.addEventListener('click', () => {
            const isChecked = !toggle.classList.contains('checked');
            toggle.classList.toggle('checked', isChecked);
            DesignSystem.set(toggle.dataset.setting, isChecked);
        });
    });

    // Color option handlers
    const colorOptions = windowEl.querySelectorAll('.color-option');
    colorOptions.forEach(option => {
        option.addEventListener('click', () => {
            colorOptions.forEach(o => o.classList.remove('active'));
            option.classList.add('active');
            DesignSystem.set('accentColor', option.dataset.color);
        });
    });

    // Software Update check button
    const checkUpdateBtn = windowEl.querySelector('[data-action="check-update"]');
    const updateStatus = windowEl.querySelector('.update-status');
    if (checkUpdateBtn && updateStatus) {
        checkUpdateBtn.addEventListener('click', () => {
            updateStatus.textContent = 'Checking...';
            updateStatus.className = 'update-status checking';
            checkUpdateBtn.disabled = true;

            // Simulate update check
            setTimeout(() => {
                const hasUpdate = Math.random() > 0.7;
                if (hasUpdate) {
                    updateStatus.textContent = 'Update available!';
                    updateStatus.className = 'update-status available';
                    checkUpdateBtn.textContent = 'Install';
                } else {
                    updateStatus.textContent = 'Up to date';
                    updateStatus.className = 'update-status';
                    checkUpdateBtn.textContent = 'Check';
                }
                checkUpdateBtn.disabled = false;
            }, 1500);
        });
    }
}

function initTerminal(windowEl) {
    const panelsContainer = windowEl.querySelector('.terminal-panels');
    if (!panelsContainer || !window.Terminal) return;

    // Terminal panel management
    let panelIdCounter = 0;
    const panels = new Map(); // panelId -> { term, fitAddon, ws, resizeObserver, ... }
    let activePanelId = null;

    const themes = {
        dark: {
            background: '#1e1e1e',
            foreground: '#d4d4d4',
            cursor: '#ffffff',
            selection: 'rgba(255, 255, 255, 0.3)',
            black: '#000000',
            red: '#cd3131',
            green: '#0dbc79',
            yellow: '#e5e510',
            blue: '#2472c8',
            magenta: '#bc3fbc',
            cyan: '#11a8cd',
            white: '#e5e5e5',
            brightBlack: '#666666',
            brightRed: '#f14c4c',
            brightGreen: '#23d18b',
            brightYellow: '#f5f543',
            brightBlue: '#3b8eea',
            brightMagenta: '#d670d6',
            brightCyan: '#29b8db',
            brightWhite: '#ffffff',
        },
        light: {
            background: '#ffffff',
            foreground: '#202124',
            cursor: '#202124',
            selection: 'rgba(0, 0, 0, 0.15)',
            black: '#000000',
            red: '#cd3131',
            green: '#0dbc79',
            yellow: '#e5e510',
            blue: '#2472c8',
            magenta: '#bc3fbc',
            cyan: '#11a8cd',
            white: '#e5e5e5',
            brightBlack: '#666666',
            brightRed: '#f14c4c',
            brightGreen: '#23d18b',
            brightYellow: '#f5f543',
            brightBlue: '#3b8eea',
            brightMagenta: '#d670d6',
            brightCyan: '#29b8db',
            brightWhite: '#ffffff',
        }
    };

    function getTerminalTheme() {
        return DesignSystem.settings.theme === 'light' ? themes.light : themes.dark;
    }

    function createTerminalPanel(panelEl) {
        const panelId = panelEl.dataset.panelId;
        const container = panelEl.querySelector('.xterm-container');
        if (!container) return null;

        // Create xterm instance
        const term = new Terminal({
            cursorBlink: true,
            fontSize: 14,
            fontFamily: '"SF Mono", "Menlo", "Monaco", "Courier New", monospace',
            scrollback: 10000,
            theme: getTerminalTheme(),
            allowProposedApi: true,
        });

        // Load addons
        const fitAddon = new FitAddon.FitAddon();
        term.loadAddon(fitAddon);

        if (window.WebLinksAddon) {
            const webLinksAddon = new WebLinksAddon.WebLinksAddon();
            term.loadAddon(webLinksAddon);
        }

        // Open terminal in container
        term.open(container);
        fitAddon.fit();

        // WebSocket connection
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/terminal`;
        let ws = null;
        let reconnectAttempts = 0;
        const maxReconnectAttempts = 5;

        function connect() {
            ws = new WebSocket(wsUrl);
            panelData.ws = ws;

            ws.onopen = () => {
                reconnectAttempts = 0;
                term.writeln('\x1b[32mConnected to WebTop Terminal\x1b[0m');
                term.writeln('');
                fitAddon.fit();
                ws.send(JSON.stringify({
                    type: 'open',
                    cols: term.cols,
                    rows: term.rows
                }));
            };

            ws.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    switch (msg.type) {
                        case 'output':
                            term.write(msg.data);
                            term.scrollToBottom();
                            break;
                        case 'opened':
                            panelData.sessionId = msg.sessionId;
                            ws.send(JSON.stringify({
                                type: 'resize',
                                cols: term.cols,
                                rows: term.rows
                            }));
                            break;
                        case 'exit':
                            term.writeln(`\r\n\x1b[33mProcess exited with code ${msg.exitCode}\x1b[0m`);
                            term.scrollToBottom();
                            break;
                        case 'error':
                            term.writeln(`\r\n\x1b[31mError: ${msg.message}\x1b[0m`);
                            term.scrollToBottom();
                            break;
                        case 'connected':
                            break;
                    }
                } catch (e) {
                    term.write(event.data);
                    term.scrollToBottom();
                }
            };

            ws.onclose = () => {
                term.writeln('\r\n\x1b[31mDisconnected from terminal\x1b[0m');
                if (reconnectAttempts < maxReconnectAttempts) {
                    reconnectAttempts++;
                    term.writeln(`\x1b[33mReconnecting (${reconnectAttempts}/${maxReconnectAttempts})...\x1b[0m`);
                    setTimeout(connect, 2000);
                }
            };

            ws.onerror = () => {
                term.writeln('\r\n\x1b[31mWebSocket error\x1b[0m');
            };
        }

        // Handle input
        term.onData((data) => {
            const pd = panels.get(panelId);
            if (pd?.ws && pd.ws.readyState === WebSocket.OPEN) {
                pd.ws.send(JSON.stringify({ type: 'input', data }));
            }
        });

        // Handle resize with debounce
        let resizeTimeout = null;
        let lastCols = 0;
        let lastRows = 0;

        function sendResize() {
            fitAddon.fit();
            if (term.cols !== lastCols || term.rows !== lastRows) {
                lastCols = term.cols;
                lastRows = term.rows;
                const pd = panels.get(panelId);
                if (pd?.ws && pd.ws.readyState === WebSocket.OPEN) {
                    pd.ws.send(JSON.stringify({
                        type: 'resize',
                        cols: term.cols,
                        rows: term.rows,
                    }));
                }
            }
        }

        const resizeObserver = new ResizeObserver(() => {
            if (resizeTimeout) clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(sendResize, 50);
        });
        resizeObserver.observe(container);

        // Click to focus panel
        panelEl.addEventListener('click', () => {
            setActivePanel(panelId);
        });

        const panelData = {
            panelId,
            panelEl,
            term,
            fitAddon,
            ws: null,
            resizeObserver,
            resizeTimeout: null,
            sessionId: null,
            cleanup: () => {
                if (resizeTimeout) clearTimeout(resizeTimeout);
                const pd = panels.get(panelId);
                if (pd?.ws) {
                    try {
                        pd.ws.send(JSON.stringify({ type: 'close' }));
                        pd.ws.close();
                    } catch {}
                }
                resizeObserver.disconnect();
                term.dispose();
            }
        };

        panels.set(panelId, panelData);
        connect();

        return panelData;
    }

    function setActivePanel(panelId) {
        if (!panels.has(panelId)) return;

        // Update active state
        activePanelId = panelId;

        // Update visual state
        panelsContainer.querySelectorAll('.terminal-panel').forEach(p => {
            p.classList.toggle('active', p.dataset.panelId === panelId);
        });

        // Focus terminal
        const panelData = panels.get(panelId);
        if (panelData?.term) {
            panelData.term.focus();
        }
    }

    function addNewPanel() {
        panelIdCounter++;
        const newPanelId = String(panelIdCounter);

        // Create new panel element
        const newPanelEl = document.createElement('div');
        newPanelEl.className = 'terminal-panel';
        newPanelEl.dataset.panelId = newPanelId;
        newPanelEl.innerHTML = '<div class="xterm-container"></div>';

        panelsContainer.appendChild(newPanelEl);

        // Initialize terminal in new panel
        createTerminalPanel(newPanelEl);

        // Set new panel as active
        setActivePanel(newPanelId);

        // Trigger resize on all panels
        setTimeout(() => {
            panels.forEach(p => p.fitAddon.fit());
        }, 50);

        return newPanelId;
    }

    function closePanel(panelId) {
        const panelData = panels.get(panelId);
        if (!panelData) return;

        // Don't close if it's the last panel
        if (panels.size <= 1) {
            return;
        }

        // Cleanup
        panelData.cleanup();

        // Remove from DOM
        panelData.panelEl.remove();

        // Remove from map
        panels.delete(panelId);

        // If we closed the active panel, activate another
        if (activePanelId === panelId) {
            const remainingIds = Array.from(panels.keys());
            if (remainingIds.length > 0) {
                setActivePanel(remainingIds[remainingIds.length - 1]);
            }
        }

        // Trigger resize on remaining panels
        setTimeout(() => {
            panels.forEach(p => p.fitAddon.fit());
        }, 50);
    }

    function closeActivePanel() {
        if (activePanelId) {
            closePanel(activePanelId);
        }
    }

    // Initialize first panel
    const firstPanel = panelsContainer.querySelector('.terminal-panel');
    if (firstPanel) {
        createTerminalPanel(firstPanel);
        setActivePanel(firstPanel.dataset.panelId);
    }

    // Keyboard shortcuts (Alt/Option + D/W)
    function handleKeydown(e) {
        // Only handle if this terminal window is focused
        if (!windowEl.classList.contains('focused')) return;

        if (e.altKey && e.key === 'd') {
            e.preventDefault();
            e.stopPropagation();
            addNewPanel();
        } else if (e.altKey && e.key === 'w') {
            e.preventDefault();
            e.stopPropagation();
            closeActivePanel();
        }
    }

    windowEl.addEventListener('keydown', handleKeydown);

    // Theme change listener
    const handleThemeChange = (e) => {
        const newTheme = e.detail.theme === 'light' ? themes.light : themes.dark;
        panels.forEach(pd => {
            if (pd.term) {
                pd.term.options.theme = newTheme;
            }
        });
    };
    window.addEventListener('theme-changed', handleThemeChange);

    // Store references for cleanup
    windowEl._terminalPanels = panels;
    windowEl._addTerminalPanel = addNewPanel;
    windowEl._closeTerminalPanel = closeActivePanel;

    // Override close button to cleanup all panels
    const originalCloseHandler = windowEl.querySelector('.close').onclick;
    windowEl.querySelector('.close').onclick = (e) => {
        // Cleanup all terminal panels
        window.removeEventListener('theme-changed', handleThemeChange);
        windowEl.removeEventListener('keydown', handleKeydown);
        panels.forEach(p => p.cleanup());
        panels.clear();

        // Call original close handler
        if (originalCloseHandler) originalCloseHandler(e);
    };
}

function initFinder(windowEl, startPath = 'Desktop') {
    let currentPath = startPath;
    let viewMode = 'icons'; // 'icons' or 'list'
    const contentDiv = windowEl.querySelector('.finder-content');

    // Helper to format file size
    function formatSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
        return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
    }

    // Setup item interactions (shared between icon and list views)
    function setupItemInteractions(el, item) {
        // Context menu
        el.oncontextmenu = (e) => {
            e.preventDefault();
            e.stopPropagation();
            // Clear desktop selection and select this item if not already selected
            window.clearAllSelections('finder');
            if (!el.classList.contains('selected')) {
                // If not part of selection, clear others and select this one
                contentDiv.querySelectorAll('.finder-item, .finder-list-item').forEach(i => i.classList.remove('selected'));
                el.classList.add('selected');
            }
            showContextMenu(e.clientX, e.clientY, item.type === 'folder' ? 'folder' : 'file', null, currentPath);
        };

        // Draggable Logic with Double Click Detection
        el.draggable = true;
        el.ondragstart = (e) => { e.preventDefault(); };

        let lastClickTime = 0;
        let isDragging = false;
        let potentialDrag = false;
        let startX, startY;
        let ghost = null;
        let moveHandler, upHandler;
        let pendingDeselect = false;

        el.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            e.stopPropagation();

            // Clear desktop selections when clicking in Finder
            window.clearAllSelections('finder');

            const now = Date.now();
            if (now - lastClickTime < 300) {
                // Double Click
                potentialDrag = false;
                isDragging = false;
                lastClickTime = 0;

                if (item.type === 'folder') {
                    render(item.path);
                } else {
                    openFileInEditor(item.path, item.name);
                }
                return;
            }
            lastClickTime = now;

            // Selection Logic
            const isSelected = el.classList.contains('selected');
            const isModifier = e.metaKey || e.ctrlKey;
            pendingDeselect = false;

            if (isModifier) {
                 if (isSelected) el.classList.remove('selected');
                 else el.classList.add('selected');
            } else {
                 if (!isSelected) {
                     contentDiv.querySelectorAll('.finder-item, .finder-list-item').forEach(i => i.classList.remove('selected'));
                     el.classList.add('selected');
                 } else {
                     // If already selected and no modifier, we might be starting a drag of multiple items.
                     // We shouldn't deselect others immediately.
                     // But if it turns out to be just a click (no drag), we should deselect others on mouseup.
                     pendingDeselect = true;
                 }
            }

            potentialDrag = true;
            startX = e.clientX;
            startY = e.clientY;

            moveHandler = (ev) => {
                if (potentialDrag && !isDragging) {
                    if (Math.abs(ev.clientX - startX) > 5 || Math.abs(ev.clientY - startY) > 5) {
                        isDragging = true;
                        potentialDrag = false;
                        pendingDeselect = false; // Drag started, don't deselect

                        // Collect dragged items
                        const selectedEls = contentDiv.querySelectorAll('.finder-item.selected, .finder-list-item.selected');
                        const draggedItems = [];
                        selectedEls.forEach(sel => {
                            draggedItems.push({
                                path: sel.dataset.path,
                                name: sel.dataset.path.split('/').pop(),
                                type: sel.querySelector('.folder') || sel.querySelector('.ph-folder') ? 'folder' : 'file'
                            });
                        });
                        
                        // Fallback if something went wrong
                        if (draggedItems.length === 0) {
                            draggedItems.push({ path: item.path, name: item.name, type: item.type });
                        }

                        window.draggedFiles = draggedItems;
                        // Backward compatibility for single item drop handlers (if any remain)
                        window.draggedFile = draggedItems[0];

                        ghost = document.createElement('div');
                        ghost.className = 'drag-ghost';
                        
                        if (draggedItems.length > 1) {
                             ghost.innerHTML = `<i class="ph ph-files"></i><span>${draggedItems.length} items</span>`;
                        } else {
                            const iconClass = item.type === 'folder' ? 'ph-folder ph-fill' : 'ph-file-text';
                            ghost.innerHTML = `<i class="ph ${iconClass}"></i><span>${item.name}</span>`;
                        }
                        
                        ghost.style.left = `${ev.clientX - 40}px`;
                        ghost.style.top = `${ev.clientY - 45}px`;
                        document.body.appendChild(ghost);

                        // Visual feedback on all selected items
                        selectedEls.forEach(sel => {
                            sel.classList.add('dragging-source');
                            sel.style.opacity = '0.5';
                        });
                        if (selectedEls.length === 0) {
                             el.classList.add('dragging-source');
                             el.style.opacity = '0.5';
                        }
                    }
                }

                if (isDragging && ghost) {
                    ghost.style.left = `${ev.clientX - 40}px`;
                    ghost.style.top = `${ev.clientY - 45}px`;
                }
            };

            upHandler = () => {
                potentialDrag = false;
                
                // If it was a simple click on a selected item (no drag, no modifier), clear other selections now
                if (pendingDeselect && !isDragging) {
                    contentDiv.querySelectorAll('.finder-item, .finder-list-item').forEach(i => i.classList.remove('selected'));
                    el.classList.add('selected');
                }

                if (isDragging) {
                    isDragging = false;
                    
                    document.querySelectorAll('.dragging-source').forEach(el => {
                        el.classList.remove('dragging-source');
                        el.style.opacity = '';
                    });

                    if (ghost) ghost.remove();

                    setTimeout(() => {
                        if (window.draggedFile) window.draggedFile = null;
                        if (window.draggedFiles) window.draggedFiles = null;
                    }, 50);
                }
                window.removeEventListener('mousemove', moveHandler);
                window.removeEventListener('mouseup', upHandler);
            };

            window.addEventListener('mousemove', moveHandler);
            window.addEventListener('mouseup', upHandler);
        });
    }

    // Render Icons View
    function renderIconsView(items, sb) {
        items.forEach(item => {
            const el = document.createElement('div');
            el.className = 'finder-item';
            el.dataset.path = item.path;

            const iconClass = item.type === 'folder' ? 'ph-folder' : 'ph-file-text';
            const iconWeight = item.type === 'folder' ? 'ph-fill' : '';
            const typeClass = item.type === 'folder' ? 'folder' : 'file';

            el.innerHTML = `<i class="ph ${iconClass} ${iconWeight} finder-icon ${typeClass}"></i><span class="finder-name">${item.name}</span>`;

            setupItemInteractions(el, item);
            contentDiv.appendChild(el);
        });
        enableSelection(contentDiv, sb);
    }

    // Render List View
    function renderListView(items, sb) {
        // Create list header
        const header = document.createElement('div');
        header.className = 'finder-list-header';
        header.innerHTML = `
            <span class="list-col name">Name</span>
            <span class="list-col size">Size</span>
            <span class="list-col kind">Kind</span>
        `;
        contentDiv.appendChild(header);

        // Create list items
        items.forEach(item => {
            const el = document.createElement('div');
            el.className = 'finder-list-item';
            el.dataset.path = item.path;

            const iconClass = item.type === 'folder' ? 'ph-folder ph-fill' : 'ph-file-text';
            const typeClass = item.type === 'folder' ? 'folder' : 'file';
            const kind = item.type === 'folder' ? 'Folder' : (item.mimeType || 'File').split('/').pop();
            const size = item.type === 'folder' ? '--' : formatSize(item.size);

            el.innerHTML = `
                <span class="list-col name"><i class="ph ${iconClass} ${typeClass}"></i> ${item.name}</span>
                <span class="list-col size">${size}</span>
                <span class="list-col kind">${kind}</span>
            `;

            setupItemInteractions(el, item);
            contentDiv.appendChild(el);
        });
        enableSelection(contentDiv, sb);
    }

    async function render(path) {
        currentPath = path;
        contentDiv.dataset.currentPath = path; // Store for keyboard shortcuts
        const pathEl = windowEl.querySelector('.finder-path');
        pathEl.textContent = path || 'Home';
        
        // Copy path on click
        pathEl.style.cursor = 'pointer';
        pathEl.title = 'Click to copy path';
        pathEl.onclick = async () => {
            try {
                await navigator.clipboard.writeText(path || 'Home');
                const originalText = pathEl.textContent;
                pathEl.textContent = 'Copied!';
                setTimeout(() => {
                    pathEl.textContent = originalText;
                }, 1000);
            } catch (err) {
                console.error('Failed to copy path:', err);
            }
        };

        // Hide/Show Back Button
        const backBtn = windowEl.querySelector('.back-btn');
        if (path === '') backBtn.style.display = 'none';
        else backBtn.style.display = 'block';

        // Empty Trash Button
        let emptyBtn = windowEl.querySelector('.empty-trash-btn');
        if (path === 'Trash') {
            if (!emptyBtn) {
                emptyBtn = document.createElement('button');
                emptyBtn.className = 'finder-nav-btn empty-trash-btn';
                emptyBtn.innerHTML = '<i class="ph ph-trash"></i> Empty';
                emptyBtn.onclick = async () => {
                    const confirmed = await showConfirm({
                        title: 'Empty Trash',
                        content: 'Are you sure you want to permanently delete all items in Trash? This cannot be undone.',
                        confirmText: 'Empty Trash',
                        type: 'danger'
                    });

                    if (confirmed) {
                         const items = await getItems('Trash');
                         for (const item of items) {
                             await api.deleteItem(item.path);
                         }
                         render('Trash');
                    }
                };
                windowEl.querySelector('.finder-view-toggle').insertAdjacentElement('beforebegin', emptyBtn);
            }
            emptyBtn.style.display = 'block';
        } else {
            if (emptyBtn) emptyBtn.style.display = 'none';
        }

        // Update Sidebar Active State
        windowEl.querySelectorAll('.finder-sidebar-item').forEach(item => {
            if (item.dataset.path === path) item.classList.add('active');
            else item.classList.remove('active');
        });

        contentDiv.innerHTML = '<div style="padding:20px;color:#888;">Loading...</div>';

        const sb = document.createElement('div');
        sb.className = 'selection-box';

        const items = await getItems(path);
        contentDiv.innerHTML = '';
        contentDiv.className = `finder-content ${viewMode === 'list' ? 'list-view' : 'icons-view'}`;
        contentDiv.appendChild(sb);

        if (items.length === 0) {
            contentDiv.innerHTML += '<div style="padding:20px;color:#666;">Empty folder</div>';
            return;
        }

        if (viewMode === 'icons') {
            renderIconsView(items, sb);
        } else {
            renderListView(items, sb);
        }
    }

    // View Toggle Handler
    windowEl.querySelectorAll('.view-btn').forEach(btn => {
        btn.onclick = () => {
            const newMode = btn.dataset.view;
            if (newMode === viewMode) return;

            viewMode = newMode;
            windowEl.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            render(currentPath);
        };
    });

    // Register for global updates
    const observer = (updatedPath) => {
        if (windowEl.offsetParent !== null) {
             render(currentPath);
        }
    };
    window.fsObservers.add(observer);

    windowEl.querySelectorAll('.finder-sidebar-item').forEach(item => {
        item.onclick = () => render(item.dataset.path);
    });
    windowEl.querySelector('.back-btn').onclick = () => {
        if (currentPath.includes('/')) {
            render(currentPath.substring(0, currentPath.lastIndexOf('/')));
        } else if (currentPath !== '') {
            render('');
        }
    };
    contentDiv.oncontextmenu = (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Clear all selections when right-clicking on empty Finder area
        window.clearAllSelections();
        showContextMenu(e.clientX, e.clientY, 'desktop', null, currentPath);
    };
    render(startPath);

    // Expose navigation method
    windowEl.finderNavigate = render;
}

// Open file in editor
async function openFileInEditor(path, name) {
    // Find existing editor window or create new one
    let editorWindow = document.querySelector('.window[data-app="Editor"]');

    if (!editorWindow) {
        editorWindow = openWindow('Editor', 'ph-atom');
    } else {
        bringToFront(editorWindow);
    }

    // Wait for editor to initialize, then open file
    setTimeout(() => {
        if (editorWindow.editorOpenFile) {
            editorWindow.editorOpenFile(path, name);
        }
    }, 100);
}

function bringToFront(el) { zIndexCounter++; el.style.zIndex = zIndexCounter; }

function makeDraggable(element, handle) {
    let isDragging = false, startX, startY, initialLeft, initialTop;
    handle.addEventListener('mousedown', (e) => {
        if (element.classList.contains('maximized')) return;
        isDragging = true; startX = e.clientX; startY = e.clientY;
        const rect = element.getBoundingClientRect(); initialLeft = rect.left; initialTop = rect.top;
        document.body.classList.add('is-interacting');
    });
    window.addEventListener('mousemove', (e) => { if (isDragging) { element.style.left = `${initialLeft + (e.clientX - startX)}px`; element.style.top = `${initialTop + (e.clientY - startY)}px`; } });
    window.addEventListener('mouseup', () => { isDragging = false; document.body.classList.remove('is-interacting'); });
}

function makeResizable(element, handle) {
    let isResizing = false, startX, startY, startWidth, startHeight;
    handle.addEventListener('mousedown', (e) => {
        if (element.classList.contains('maximized')) return;
        isResizing = true; startX = e.clientX; startY = e.clientY;
        const rect = element.getBoundingClientRect(); startWidth = rect.width; startHeight = rect.height;
        document.body.classList.add('is-interacting'); e.stopPropagation();
    });
    document.documentElement.addEventListener('mousemove', (e) => { if (isResizing) { element.style.width = `${Math.max(300, startWidth + (e.clientX - startX))}px`; element.style.height = `${Math.max(200, startHeight + (e.clientY - startY))}px`; } });
    window.addEventListener('mouseup', () => { isResizing = false; document.body.classList.remove('is-interacting'); });
}

function enableSelection(container, sb) {
    let isSelecting = false, startX, startY, cr;
    container.addEventListener('mousedown', (e) => {
        if (e.target !== container || e.button !== 0) return;
        // Clear all selections (including desktop) when clicking on empty Finder area
        window.clearAllSelections();
        isSelecting = true; cr = container.getBoundingClientRect();
        startX = e.clientX - cr.left + container.scrollLeft; startY = e.clientY - cr.top + container.scrollTop;
        sb.style.display = 'block'; sb.style.width = '0px'; sb.style.height = '0px';
        sb.style.left = `${startX}px`; sb.style.top = `${startY}px`;
    });
    window.addEventListener('mousemove', (e) => {
        if (isSelecting) {
            const curX = e.clientX - cr.left + container.scrollLeft, curY = e.clientY - cr.top + container.scrollTop;
            const w = Math.abs(curX - startX), h = Math.abs(curY - startY);
            sb.style.width = `${w}px`; sb.style.height = `${h}px`;
            sb.style.left = `${Math.min(curX, startX)}px`; sb.style.top = `${Math.min(curY, startY)}px`;
            const boxRect = sb.getBoundingClientRect();
            container.querySelectorAll('.finder-item').forEach(item => {
                const r = item.getBoundingClientRect();
                if (boxRect.left < r.right && boxRect.right > r.left && boxRect.top < r.bottom && boxRect.bottom > r.top) item.classList.add('selected');
            });
        }
    });
    window.addEventListener('mouseup', () => { isSelecting = false; sb.style.display = 'none'; });
}

function showContextMenu(x, y, type, targetData = null, currentPath = 'Desktop') {
    const contextMenu = document.getElementById('context-menu');
    contextMenu.innerHTML = '';

    // Determine if we're in Trash and adjust menu type accordingly
    const isInTrash = currentPath === 'Trash' || currentPath.startsWith('Trash/');
    let menuType = type;
    if (isInTrash && (type === 'file' || type === 'folder')) {
        menuType = type === 'file' ? 'trash_file' : 'trash_folder';
    }

    let menuItems = menus[menuType] || menus['desktop'];

    if (type === 'dock' && targetData) {
        menuItems = [
            { label: 'New Window', action: 'new_window' },
            { separator: true },
            ...menuItems
        ];

        if (document.querySelectorAll(`.window[data-app="${targetData.name}"]`).length === 0) {
            menuItems = menuItems.filter(i => i.action !== 'close_app');
        }
    }

    // Filter Set as Wallpaper for non-images
    if (type === 'file') {
        const selected = document.querySelector('.desktop-icon-item.selected, .finder-item.selected, .finder-list-item.selected');
        if (selected) {
            const path = selected.dataset.path;
            const ext = path.split('.').pop().toLowerCase();
            const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext);
            
            if (!isImage) {
                menuItems = menuItems.filter(i => i.action !== 'set_wallpaper');
            }
        }
    }

    // Disable paste if clipboard is empty
    if (!window.clipboard) {
        menuItems = menuItems.map(i => i.action === 'paste' ? { ...i, disabled: true } : i);
    }

    menuItems.forEach(item => {
        if (item.separator) {
            contextMenu.appendChild(Object.assign(document.createElement('div'), { className: 'menu-separator' }));
        } else {
            const el = Object.assign(document.createElement('div'), {
                className: 'menu-item' + (item.disabled ? ' disabled' : ''),
                textContent: item.label
            });

            if (item.disabled) {
                contextMenu.appendChild(el);
                return;
            }

            el.onclick = async () => {
                contextMenu.style.display = 'none';

                // Dock actions
                if (item.action === 'open_app') {
                    openWindow(targetData.name, targetData.icon);
                }
                else if (item.action === 'new_window') {
                    createWindow(targetData.name, targetData.icon);
                }
                else if (item.action === 'close_app') {
                    document.querySelectorAll(`.window[data-app="${targetData.name}"]`).forEach(w => w.remove());
                    updateDockIndicator(targetData.name);
                }

                else if (item.action === 'open') {
                    // Determine what to open
                    const selectedDesktop = document.querySelector('.desktop-icon-item.selected');
                    const selectedFinder = document.querySelector('.finder-item.selected, .finder-list-item.selected');
                    const selected = selectedDesktop || selectedFinder;

                    if (selected) {
                        const path = selected.dataset.path;
                        // Robust check for folder type based on icon class or data attribute if available
                        const isFolder = selected.querySelector('.folder') !== null || selected.querySelector('.ph-folder') !== null;
                        
                        if (isFolder) {
                            createWindow('Finder', 'ph-folder-notch', path);
                        } else {
                            openFileInEditor(path, path.split('/').pop());
                        }
                    }
                }

                // File operations
                else if (item.action === 'delete') {
                    // Move to Trash using the new API
                    const selectedDesktop = document.querySelectorAll('.desktop-icon-item.selected');
                    const selectedFinder = document.querySelectorAll('.finder-item.selected');
                    const items = [...selectedDesktop, ...selectedFinder];

                    for (const el of items) {
                        const path = el.dataset.path;
                        // Skip protected folders
                        if (isProtectedPath(path)) {
                            alert(`Cannot delete "${path}" - this is a system folder.`);
                            continue;
                        }
                        try {
                            await api.trashItem(path);
                            const parent = path.split('/').slice(0, -1).join('/') || 'Desktop';
                            window.refreshFileSystem(parent);
                            window.refreshFileSystem('Trash');
                        } catch (e) { console.error(e); }
                    }
                }

                else if (item.action === 'delete_permanent') {
                    // Permanently delete from Trash
                    const selected = document.querySelectorAll('.finder-item.selected');
                    if (selected.length === 0) return;

                    const confirmed = await showConfirm({
                        title: 'Delete Permanently',
                        content: 'Delete permanently? This cannot be undone.',
                        confirmText: 'Delete',
                        type: 'danger'
                    });
                    if (!confirmed) return;

                    for (const el of selected) {
                        try {
                            await api.deleteItem(el.dataset.path);
                            window.refreshFileSystem('Trash');
                        } catch (e) { console.error(e); }
                    }
                }

                else if (item.action === 'restore') {
                    // Restore from Trash to Desktop
                    const selected = document.querySelectorAll('.finder-item.selected');

                    for (const el of selected) {
                        const path = el.dataset.path;
                        const name = path.split('/').pop();
                        try {
                            await api.moveItem(path, `Desktop/${name}`);
                            window.refreshFileSystem('Trash');
                            window.refreshFileSystem('Desktop');
                        } catch (e) { console.error(e); }
                    }
                }

                else if (item.action === 'rename') {
                    const selected = document.querySelector('.desktop-icon-item.selected, .finder-item.selected');
                    if (!selected) return;

                    const oldPath = selected.dataset.path;
                    const oldName = oldPath.split('/').pop();
                    const parentDir = oldPath.split('/').slice(0, -1).join('/') || 'Desktop';

                    const newName = await showModal({
                        title: 'Rename',
                        content: 'Enter new name:',
                        placeholder: oldName,
                        confirmText: 'Rename'
                    });

                    if (newName && newName !== oldName) {
                        try {
                            const newPath = `${parentDir}/${newName}`;
                            await api.moveItem(oldPath, newPath);

                            // Update desktop icon position if it was on desktop
                            if (parentDir === 'Desktop' && desktopIconPositions[oldPath]) {
                                desktopIconPositions[newPath] = desktopIconPositions[oldPath];
                                delete desktopIconPositions[oldPath];
                                saveDesktopIconPositions();
                            }

                            window.refreshFileSystem(parentDir);
                        } catch (e) { alert(e.message); }
                    }
                }

                else if (item.action === 'copy') {
                    const selected = document.querySelector('.desktop-icon-item.selected, .finder-item.selected');
                    if (selected) {
                        // Clear previous cut visual
                        document.querySelectorAll('.cut-item').forEach(el => el.classList.remove('cut-item'));

                        const path = selected.dataset.path;
                        window.clipboard = {
                            path: path,
                            name: path.split('/').pop(),
                            type: selected.querySelector('.folder') ? 'folder' : 'file',
                            operation: 'copy'
                        };
                    }
                }

                else if (item.action === 'cut') {
                    const selected = document.querySelector('.desktop-icon-item.selected, .finder-item.selected');
                    if (selected) {
                        // Clear previous cut visual
                        document.querySelectorAll('.cut-item').forEach(el => el.classList.remove('cut-item'));

                        const path = selected.dataset.path;
                        window.clipboard = {
                            path: path,
                            name: path.split('/').pop(),
                            type: selected.querySelector('.folder') ? 'folder' : 'file',
                            operation: 'cut'
                        };

                        // Add visual feedback for cut item
                        selected.classList.add('cut-item');
                    }
                }

                else if (item.action === 'paste') {
                    if (!window.clipboard) return;

                    try {
                        // Generate unique name if needed
                        let destName = window.clipboard.name;
                        let destPath = `${currentPath}/${destName}`;

                        if (window.clipboard.operation === 'copy') {
                            await api.copyItem(window.clipboard.path, destPath);
                        } else {
                            // Cut operation
                            await api.moveItem(window.clipboard.path, destPath);
                            const srcParent = window.clipboard.path.split('/').slice(0, -1).join('/') || 'Desktop';
                            window.refreshFileSystem(srcParent);
                            // Clear cut visual feedback
                            document.querySelectorAll('.cut-item').forEach(el => el.classList.remove('cut-item'));
                            window.clipboard = null; // Clear after cut
                        }
                        window.refreshFileSystem(currentPath);
                    } catch (e) { alert(e.message); }
                }

                else if (item.action === 'change_wallpaper') {
                    const settingsWin = openWindow('Settings', 'ph-gear');
                    // Switch to Design tab
                    setTimeout(() => {
                        const designTab = settingsWin.querySelector('.sidebar-item[data-section="design"]');
                        if (designTab) designTab.click();
                    }, 100);
                }

                else if (item.action === 'set_wallpaper') {
                    const selected = document.querySelector('.desktop-icon-item.selected, .finder-item.selected, .finder-list-item.selected');
                    if (selected) {
                        window.setWallpaper(selected.dataset.path);
                    }
                }

                else if (item.action === 'new_folder') {
                    const name = await showModal({
                        title: 'New Folder',
                        content: 'Folder Name:',
                        placeholder: 'Untitled Folder',
                        confirmText: 'Create'
                    });
                    if (name) {
                        try {
                            await api.createDir(`${currentPath}/${name}`);
                            window.refreshFileSystem(currentPath);
                        } catch (e) { alert(e.message); }
                    }
                }

                else if (item.action === 'inspect_browser' && window.currentBrowserDevTools) {
                    window.currentBrowserDevTools.pane.style.display = 'flex';
                    window.currentBrowserDevTools.render();
                }
            };
            contextMenu.appendChild(el);
        }
    });

    contextMenu.style.display = 'block';
    const w = 200, h = contextMenu.offsetHeight || 100;
    contextMenu.style.left = `${Math.min(x, window.innerWidth - w)}px`;
    contextMenu.style.top = `${Math.min(y, window.innerHeight - h)}px`;
}

// Wallpaper Management
window.setWallpaper = function(pathOrUrl) {
    if (!pathOrUrl) return;
    let url = pathOrUrl;
    // Check if it's a system wallpaper path
    if (pathOrUrl.startsWith('/wallpapers/')) {
        url = pathOrUrl;
    }
    // If it doesn't look like a web URL or data URI, assume it's a local path
    else if (!pathOrUrl.startsWith('http') && !pathOrUrl.startsWith('data:')) {
        url = api.getDownloadUrl(pathOrUrl);
    }
    
    const desktop = document.getElementById('desktop');
    desktop.style.backgroundImage = `url('${url}')`;
    desktop.style.backgroundSize = 'cover';
    desktop.style.backgroundPosition = 'center';
    localStorage.setItem('desktopWallpaper', pathOrUrl);
    
    // Update input if settings is open
    const input = document.getElementById('wallpaper-input');
    if (input) input.value = pathOrUrl;
};

function initWallpaper() {
    const saved = localStorage.getItem('desktopWallpaper');
    if (saved) window.setWallpaper(saved);
}

async function initDesktopIcons() {
    const layer = document.getElementById('desktop-icons-layer');
    const GRID_X = 100, GRID_Y = 110;

    // Helper to find next free slot
    function getNextFreeSlot(occupiedSlots) {
        let index = 0;
        while (true) {
            const col = Math.floor(index / 6);
            const row = index % 6;

            if (!occupiedSlots.has(`${col},${row}`)) {
                occupiedSlots.add(`${col},${row}`);
                return {
                    x: 20 + col * GRID_X,
                    y: 20 + row * GRID_Y
                };
            }
            index++;
        }
    }

    // Create a single icon element
    function createIconElement(item, occupiedSlots) {
        const el = document.createElement('div');
        el.className = 'desktop-icon-item';
        el.dataset.path = item.path;

        // Use stored position or find next free
        const posKey = item.path;
        if (!desktopIconPositions[posKey]) {
            desktopIconPositions[posKey] = getNextFreeSlot(occupiedSlots);
            saveDesktopIconPositions();
        }

        const pos = desktopIconPositions[posKey];
        el.style.left = `${pos.x}px`;
        el.style.top = `${pos.y}px`;

        const iconClass = item.type === 'folder' ? 'ph-folder' : 'ph-file-text';
        const typeClass = item.type === 'folder' ? 'folder' : 'file';
        const iconColor = item.type === 'folder' ? '#8ecae6' : 'white';
        const iconWeight = item.type === 'folder' ? 'ph-fill' : '';

        el.innerHTML = `<i class="ph ${iconClass} ${iconWeight} ${typeClass}" style="color:${iconColor}"></i><span>${item.name}</span>`;

        makeIconDraggable(el, item);

        el.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            // Clear finder selections and select this item if not already selected
            window.clearAllSelections('desktop');
            if (!el.classList.contains('selected')) {
                document.querySelectorAll('.desktop-icon-item').forEach(i => i.classList.remove('selected'));
                el.classList.add('selected');
            }
            showContextMenu(e.clientX, e.clientY, item.type === 'folder' ? 'folder' : 'file', null, 'Desktop');
        });

        return el;
    }

    async function render() {
        // Don't refresh if dragging to avoid glitches
        if (document.body.classList.contains('is-interacting')) return;

        const items = await getItems('Desktop');
        const newPaths = new Set(items.map(item => item.path));

        // Get currently displayed paths
        const existingIcons = layer.querySelectorAll('.desktop-icon-item');
        const existingPaths = new Set();

        // Remove icons that no longer exist
        existingIcons.forEach(icon => {
            const path = icon.dataset.path;
            if (!newPaths.has(path)) {
                icon.remove();
                // Clean up position data for removed items
                if (desktopIconPositions[path]) {
                    delete desktopIconPositions[path];
                    saveDesktopIconPositions();
                }
            } else {
                existingPaths.add(path);
            }
        });

        // Build occupied slots set from remaining positions
        const occupiedSlots = new Set();
        Object.values(desktopIconPositions).forEach(pos => {
            const x = Math.round((pos.x - 20) / GRID_X);
            const y = Math.round((pos.y - 20) / GRID_Y);
            if (x >= 0 && y >= 0) {
                occupiedSlots.add(`${x},${y}`);
            }
        });

        // Add only new icons
        items.forEach(item => {
            if (!existingPaths.has(item.path)) {
                const el = createIconElement(item, occupiedSlots);
                layer.appendChild(el);
            }
        });
    }

    // Register for global updates
    window.fsObservers.add((updatedPath) => {
        // If the update is relevant to Desktop (e.g. root or inside Desktop), refresh
        // Simple approach: Always refresh Desktop for now
        render();
    });

    function makeIconDraggable(el, itemData) {
        let isDragging = false;
        let potentialDrag = false;
        let startX, startY, initialPositions = [];
        let ghost = null;
        let lastClickTime = 0;

        el.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            
            const now = Date.now();
            if (now - lastClickTime < 300) {
                // Double Click!
                potentialDrag = false;
                isDragging = false;
                lastClickTime = 0;
                
                // Open Logic
                if (itemData.type === 'folder') {
                    // Always create a new Finder window for folder navigation to avoid race conditions
                    const win = createWindow('Finder', 'ph-folder-notch', itemData.path);
                } else {
                    openFileInEditor(itemData.path, itemData.name);
                }
                return;
            }
            lastClickTime = now;

            // Clear finder selections when clicking on desktop
            window.clearAllSelections('desktop');

            if (!el.classList.contains('selected')) {
                if (!e.metaKey && !e.ctrlKey) document.querySelectorAll('.desktop-icon-item').forEach(i => i.classList.remove('selected'));
                el.classList.add('selected');
            }

            potentialDrag = true;
            startX = e.clientX;
            startY = e.clientY;
        });

        window.addEventListener('mousemove', (e) => {
            if (potentialDrag && !isDragging) {
                if (Math.abs(e.clientX - startX) > 5 || Math.abs(e.clientY - startY) > 5) {
                    isDragging = true;
                    potentialDrag = false;
                    
                    // Init Drag
                    // Collect all selected items
                    const selectedEls = document.querySelectorAll('.desktop-icon-item.selected');
                    const draggedItems = [];
                    selectedEls.forEach(sel => {
                        draggedItems.push({
                            path: sel.dataset.path,
                            name: sel.dataset.path.split('/').pop(),
                            type: sel.querySelector('.folder') || sel.querySelector('.ph-folder') ? 'folder' : 'file'
                        });
                    });

                    // Fallback
                    if (draggedItems.length === 0) {
                        draggedItems.push({ path: itemData.path, name: itemData.name, type: itemData.type });
                    }

                    window.draggedFiles = draggedItems;
                    window.draggedFile = draggedItems[0]; // Backward compatibility
                    
                    ghost = el.cloneNode(true);
                    ghost.className = 'drag-ghost';
                    
                    if (draggedItems.length > 1) {
                         ghost.innerHTML = `<i class="ph ph-files"></i><span>${draggedItems.length} items</span>`;
                    } else {
                        ghost.innerHTML = `<i class="ph ${itemData.type === 'folder' ? 'ph-folder ph-fill' : 'ph-file-text'}"></i><span>${itemData.name}</span>`;
                    }

                    ghost.style.left = `${e.clientX - 40}px`;
                    ghost.style.top = `${e.clientY - 45}px`;
                    document.body.appendChild(ghost);

                    initialPositions = [];
                    document.querySelectorAll('.desktop-icon-item.selected').forEach(item => {
                        initialPositions.push({
                            el: item,
                            left: parseInt(item.style.left || 0),
                            top: parseInt(item.style.top || 0),
                            path: item.dataset.path
                        });
                        item.classList.add('dragging');
                        item.style.opacity = '0.5';
                    });
                    document.body.classList.add('is-interacting');
                }
            }

            if (isDragging) {
                if (ghost) {
                    ghost.style.left = `${e.clientX - 40}px`;
                    ghost.style.top = `${e.clientY - 45}px`;
                }
                
                initialPositions.forEach(pos => {
                    pos.el.style.left = `${pos.left + (e.clientX - startX)}px`;
                    pos.el.style.top = `${pos.top + (e.clientY - startY)}px`;
                });
            }
        });

        window.addEventListener('mouseup', () => {
            potentialDrag = false;
            if (isDragging) {
                isDragging = false;
                document.body.classList.remove('is-interacting');
                if (ghost) ghost.remove();

                initialPositions.forEach(pos => {
                    pos.el.classList.remove('dragging');
                    pos.el.style.opacity = '';
                    
                    if (!window.draggedFiles && !window.draggedFile) {
                        pos.el.style.left = `${pos.left}px`;
                        pos.el.style.top = `${pos.top}px`;
                        return;
                    }

                    const cl = parseInt(pos.el.style.left || 0);
                    const ct = parseInt(pos.el.style.top || 0);
                    const newX = 20 + Math.max(0, Math.round((cl - 20) / GRID_X)) * GRID_X;
                    const newY = 20 + Math.max(0, Math.round((ct - 20) / GRID_Y)) * GRID_Y;
                    pos.el.style.transition = 'top 0.2s, left 0.2s';
                    pos.el.style.left = `${newX}px`;
                    pos.el.style.top = `${newY}px`;
                    if (pos.path) {
                        desktopIconPositions[pos.path] = { x: newX, y: newY };
                        saveDesktopIconPositions();
                    }
                    setTimeout(() => pos.el.style.transition = '', 200);
                });
                
                if (window.draggedFiles) window.draggedFiles = null;
                if (window.draggedFile) window.draggedFile = null;
            }
        });
    }

    render();
    // Periodic refresh as fallback (diff-based, no flicker)
    setInterval(render, 15000);
}

document.addEventListener('DOMContentLoaded', async () => {
    // Initialize Design System first
    await DesignSystem.init();

    const desktop = document.getElementById('desktop'), dsb = document.getElementById('selection-box'), cm = document.getElementById('context-menu');
    desktop.addEventListener('contextmenu', (e) => { if (e.target === desktop || e.target.id === 'desktop-icons-layer') { e.preventDefault(); window.clearAllSelections(); showContextMenu(e.clientX, e.clientY, 'desktop', null, 'Desktop'); } });
    document.querySelectorAll('.dock-item').forEach(item => { item.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); const appName = item.querySelector('.tooltip').textContent, iconClass = item.querySelector('i').className.split(' ').find(c => c.startsWith('ph-')); showContextMenu(e.clientX, e.clientY, 'dock', { name: appName, icon: iconClass }); }); });
    document.addEventListener('click', () => cm.style.display = 'none');
    let isSelecting = false, startX, startY;
    desktop.addEventListener('mousedown', (e) => { if (e.target !== desktop && e.target.id !== 'desktop-icons-layer') return; if (e.button !== 0) return; window.clearAllSelections(); isSelecting = true; startX = e.clientX; startY = e.clientY; dsb.style.display = 'block'; dsb.style.width = '0px'; dsb.style.height = '0px'; dsb.style.left = `${startX}px`; dsb.style.top = `${startY}px`; });
    window.addEventListener('mousemove', (e) => { if (isSelecting) { const w = Math.abs(e.clientX - startX), h = Math.abs(e.clientY - startY), cx = Math.min(e.clientX, startX), cy = Math.min(e.clientY, startY); dsb.style.width = `${w}px`; dsb.style.height = `${h}px`; dsb.style.left = `${cx}px`; dsb.style.top = `${cy}px`; const br = dsb.getBoundingClientRect(); document.querySelectorAll('.desktop-icon-item').forEach(item => { const r = item.getBoundingClientRect(); if (br.left < r.right && br.right > r.left && br.top < r.bottom && br.bottom > r.top) item.classList.add('selected'); else if (!e.metaKey && !e.ctrlKey) item.classList.remove('selected'); }); } });
    window.addEventListener('mouseup', () => { if (isSelecting) { isSelecting = false; dsb.style.display = 'none'; } });
    
    // Top Bar Actions
    document.getElementById('user-btn').addEventListener('click', () => {
        const settingsWin = openWindow('Settings', 'ph-gear');
        // Switch to User tab
        setTimeout(() => {
            const userTab = settingsWin.querySelector('.sidebar-item[data-section="user"]');
            if (userTab) userTab.click();
        }, 100);
    });

    document.getElementById('logout-btn').addEventListener('click', async () => {
        try {
            await api.logout();
            window.location.href = '/login';
        } catch (e) {
            console.error('Logout failed:', e);
            window.location.href = '/login';
        }
    });

    initDesktopIcons(); initImmersiveTriggers(); initClock(); initWallpaper();
});

function initClock() {
    const dateEl = document.querySelector('.clock .date');
    const timeEl = document.querySelector('.clock .time');

    function update() {
        dateEl.textContent = DesignSystem.getFormattedDate();
        timeEl.textContent = DesignSystem.getFormattedTime();
    }

    // Make update globally accessible for DesignSystem
    window.updateClock = update;

    update();
    setInterval(update, 1000);
}

// System Modal Helper
function showModal({ title, content, placeholder = '', confirmText = 'OK' }) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        
        overlay.innerHTML = `
            <div class="modal-window">
                <div class="modal-header">
                    <i class="ph ph-app-window"></i> ${title}
                </div>
                <div class="modal-content">
                    <label class="modal-label">${content}</label>
                    <input type="text" class="modal-input" value="${placeholder}" spellcheck="false">
                </div>
                <div class="modal-actions">
                    <button class="modal-btn cancel">Cancel</button>
                    <button class="modal-btn primary">${confirmText}</button>
                </div>
            </div>
        `;

        const input = overlay.querySelector('input');
        const cancelBtn = overlay.querySelector('.cancel');
        const primaryBtn = overlay.querySelector('.primary');

        function close(value) {
            overlay.style.opacity = '0';
            setTimeout(() => overlay.remove(), 200);
            resolve(value);
        }

        cancelBtn.onclick = () => close(null);
        
        primaryBtn.onclick = () => {
            const val = input.value.trim();
            if (val) close(val);
        };

        input.onkeydown = (e) => {
            if (e.key === 'Enter') primaryBtn.click();
            if (e.key === 'Escape') cancelBtn.click();
        };

        document.body.appendChild(overlay);
        input.focus();
        input.select();
    });
}

// System Confirm Helper
function showConfirm({ title, content, confirmText = 'OK', type = 'info' }) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        
        const iconClass = type === 'danger' ? 'ph-warning' : 'ph-app-window';
        
        overlay.innerHTML = `
            <div class="modal-window">
                <div class="modal-header">
                    <i class="ph ${iconClass}"></i> ${title}
                </div>
                <div class="modal-content">
                    <label class="modal-label" style="margin-bottom: 0;">${content}</label>
                </div>
                <div class="modal-actions">
                    <button class="modal-btn cancel">Cancel</button>
                    <button class="modal-btn primary ${type === 'danger' ? 'danger' : ''}">${confirmText}</button>
                </div>
            </div>
        `;

        const cancelBtn = overlay.querySelector('.cancel');
        const primaryBtn = overlay.querySelector('.primary');

        function close(value) {
            overlay.style.opacity = '0';
            setTimeout(() => overlay.remove(), 200);
            resolve(value);
        }

        cancelBtn.onclick = () => close(false);
        primaryBtn.onclick = () => close(true);
        
        // Focus primary button for Enter key support
        setTimeout(() => primaryBtn.focus(), 50);
        
        // Handle Escape
        overlay.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') close(false);
        });

        document.body.appendChild(overlay);
    });
}

// Global Drag Feedback
window.addEventListener('mousemove', (e) => {
    if (!window.draggedFile) return;

    const target = document.elementFromPoint(e.clientX, e.clientY);

    // Clear all highlights
    document.querySelectorAll('.dock-item').forEach(i => i.classList.remove('drag-over'));
    document.querySelectorAll('.finder-sidebar-item').forEach(i => i.classList.remove('drag-over'));

    // Highlight Dock Trash
    const dockItem = target?.closest('.dock-item');
    if (dockItem?.querySelector('.tooltip')?.textContent === 'Trash') {
        dockItem.classList.add('drag-over');
        return;
    }

    // Highlight Finder Sidebar Items
    const sidebarItem = target?.closest('.finder-sidebar-item');
    if (sidebarItem) {
        sidebarItem.classList.add('drag-over');
    }
});

// Global Drop Handler for File Dragging (Move & Open Logic)
window.addEventListener('mouseup', async (e) => {
    // Check if we have dragged items (either list or single legacy)
    const items = window.draggedFiles || (window.draggedFile ? [window.draggedFile] : []);
    if (items.length === 0) return;

    // We take the first item for single-file logic compatibility (like Editor open)
    const primaryItem = items[0];
    const target = document.elementFromPoint(e.clientX, e.clientY);

    // Get highlighted sidebar item BEFORE clearing (for fallback)
    const highlightedSidebarItem = document.querySelector('.finder-sidebar-item.drag-over');

    // Clear all drag-over highlights
    document.querySelectorAll('.dock-item').forEach(i => i.classList.remove('drag-over'));
    document.querySelectorAll('.finder-sidebar-item').forEach(i => i.classList.remove('drag-over'));

    // Helper to clear drag state
    const clearDragState = () => {
        window.draggedFile = null;
        window.draggedFiles = null;
    };

    // 1. Dock Trash - highest priority
    const dockItem = target?.closest('.dock-item');
    if (dockItem?.querySelector('.tooltip')?.textContent === 'Trash') {
        clearDragState();
        for (const item of items) await moveToTrash(item);
        return;
    }

    // 2. Editor Window - open file (Only opens the first one)
    const editorWindow = target?.closest('.window[data-app="Editor"]');
    if (editorWindow?.editorOpenFile) {
        clearDragState();
        editorWindow.editorOpenFile(primaryItem.path, primaryItem.name);
        return;
    }

    // 3. Finder Sidebar (check both direct target and highlighted item)
    let sidebarItem = target?.closest('.finder-sidebar-item');
    // Fallback: use the highlighted sidebar item (from mousemove)
    if (!sidebarItem) {
        sidebarItem = highlightedSidebarItem;
    }
    if (sidebarItem?.dataset.path) {
        const targetPath = sidebarItem.dataset.path;
        clearDragState();
        
        // Handle Trash sidebar item
        if (targetPath === 'Trash') {
            for (const item of items) await moveToTrash(item);
            return;
        }
        
        for (const item of items) await moveToPath(item, targetPath);
        return;
    }

    // 4. Finder Content Area
    const finderContent = target?.closest('.finder-content');
    if (finderContent) {
        const finderWindow = finderContent.closest('.window');
        const targetPath = finderWindow.querySelector('.finder-path').textContent;
        const dropTargetItem = target?.closest('.finder-item');

        clearDragState();

        // Dropped on a folder inside Finder
        if (dropTargetItem?.querySelector('.folder')) {
             const destPath = dropTargetItem.dataset.path;
             // Avoid moving folder into itself
             const validItems = items.filter(i => i.path !== destPath);
             for (const item of validItems) await moveToFolder(item, destPath);
             return;
        }

        // Dropped on empty area in Finder
        for (const item of items) await moveToPath(item, targetPath);
        return;
    }

    // 5. Desktop Area
    const desktopArea = target?.closest('#desktop');
    if (desktopArea) {
        const hitIcon = target?.closest('.desktop-icon-item');

        // Dropped on a folder icon on Desktop
        if (hitIcon?.querySelector('.folder')) {
            const destPath = hitIcon.dataset.path;
            clearDragState();
            
            const validItems = items.filter(i => i.path !== destPath);
            for (const item of validItems) await moveToFolder(item, destPath);
            return;
        }

        // Dropped on empty Desktop area (not on an icon)
        if (!hitIcon) {
            // Only move if coming from a different location
            // Filter items that are NOT already on Desktop
            const itemsToMove = items.filter(item => {
                 const parentDir = item.path.split('/').slice(0, -1).join('/') || 'Desktop';
                 return parentDir !== 'Desktop';
            });

            if (itemsToMove.length > 0) {
                clearDragState();
                for (const item of itemsToMove) await moveToDesktop(item);
                return;
            }
            
            // If rearranging on Desktop (and no items moved), do NOT clear drag state.
            // Let makeIconDraggable handle positioning.
            return;
        }
    }

    // If nothing consumed the drop, clear draggedFile
    clearDragState();
});

// Add keyframe for drop feedback if not exists
if (!document.getElementById('drop-anim')) {
    const style = document.createElement('style');
    style.id = 'drop-anim';
    style.innerHTML = '@keyframes fadeInOut { 0% { opacity: 0; } 50% { opacity: 1; } 100% { opacity: 0; } }';
    document.head.appendChild(style);
}

// Global keyboard shortcuts for Copy/Cut/Paste
document.addEventListener('keydown', async (e) => {
    // Skip if inside input/textarea (except if in editor which has its own handler)
    const target = e.target;
    const isEditable = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
    const isInEditor = target.closest('.editor-textarea, .xterm-container, .browser-iframe');

    if (isEditable || isInEditor) return;

    const isMod = e.metaKey || e.ctrlKey;

    // Copy: Cmd/Ctrl + C
    if (isMod && e.key === 'c') {
        const selected = document.querySelector('.desktop-icon-item.selected, .finder-item.selected');
        if (selected) {
            e.preventDefault();
            // Clear previous cut visual
            document.querySelectorAll('.cut-item').forEach(el => el.classList.remove('cut-item'));

            const path = selected.dataset.path;
            window.clipboard = {
                path: path,
                name: path.split('/').pop(),
                type: selected.querySelector('.folder') ? 'folder' : 'file',
                operation: 'copy'
            };
        }
    }

    // Cut: Cmd/Ctrl + X
    if (isMod && e.key === 'x') {
        const selected = document.querySelector('.desktop-icon-item.selected, .finder-item.selected');
        if (selected) {
            e.preventDefault();
            // Clear previous cut visual
            document.querySelectorAll('.cut-item').forEach(el => el.classList.remove('cut-item'));

            const path = selected.dataset.path;
            window.clipboard = {
                path: path,
                name: path.split('/').pop(),
                type: selected.querySelector('.folder') ? 'folder' : 'file',
                operation: 'cut'
            };

            // Add visual feedback
            selected.classList.add('cut-item');
        }
    }

    // Paste: Cmd/Ctrl + V
    if (isMod && e.key === 'v') {
        if (!window.clipboard) return;

        e.preventDefault();

        // Determine target path
        let targetPath = 'Desktop'; // Default to Desktop

        // Check if a folder is selected (paste into folder)
        const selectedFolder = document.querySelector('.desktop-icon-item.selected .folder, .finder-item.selected .folder');
        if (selectedFolder) {
            targetPath = selectedFolder.closest('[data-path]')?.dataset.path || targetPath;
        } else {
            // Check if we're in a Finder window
            const activeFinder = document.querySelector('.window[data-app="Finder"]:not(.minimized) .finder-content');
            if (activeFinder) {
                targetPath = activeFinder.dataset.currentPath || 'Desktop';
            }
        }

        try {
            const destPath = `${targetPath}/${window.clipboard.name}`;

            if (window.clipboard.operation === 'copy') {
                await api.copyItem(window.clipboard.path, destPath);
            } else {
                // Cut operation
                await api.moveItem(window.clipboard.path, destPath);
                const srcParent = window.clipboard.path.split('/').slice(0, -1).join('/') || 'Desktop';
                window.refreshFileSystem(srcParent);
                // Clear cut visual
                document.querySelectorAll('.cut-item').forEach(el => el.classList.remove('cut-item'));
                window.clipboard = null;
            }
            window.refreshFileSystem(targetPath);
        } catch (err) {
            console.error('Paste failed:', err);
        }
    }
});
