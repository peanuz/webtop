// Window Manager Logic
import { makeDraggable, makeResizable, bringToFront } from '../utils/dragDrop.js';
import { debounce } from '../utils/helpers.js';

export class WindowManager {
    constructor() {
        this.desktop = document.getElementById('desktop');
        this.template = document.getElementById('window-template');
        this.apps = new Map(); // Registry for app initializers
        this.observers = new Set(); // For dock updates etc.
        
        // Auto-save state on changes (debounced)
        this.debouncedSave = debounce(() => this.saveState(), 1000);
        
        // Listen for internal app state changes
        window.addEventListener('save-window-state', () => this.debouncedSave());
        
        // Listen for layout changes
        window.addEventListener('mouseup', () => {
             // If we were dragging/resizing a window
             if (document.body.classList.contains('is-interacting')) {
                 this.debouncedSave();
             }
        });
    }

    async saveState() {
        const windows = [];
        document.querySelectorAll('.window').forEach(el => {
            // Skip windows being closed
            if (el.classList.contains('closing')) return;

            const rect = el.getBoundingClientRect();
            const appName = el.dataset.app;
            const iconClass = el.querySelector('.window-title i').className.replace('ph ', '');
            
            const state = {
                app: appName,
                icon: iconClass,
                x: el.style.left,
                y: el.style.top,
                w: el.style.width,
                h: el.style.height,
                z: el.style.zIndex,
                maximized: el.classList.contains('maximized'),
                data: {}
            };

            // App specific state
            if (appName === 'Finder' || appName === 'Trash') {
                const content = el.querySelector('.finder-content');
                if (content) state.data.path = content.dataset.currentPath;
            } else if (appName === 'Editor') {
                if (el.dataset.activeFile) state.data.file = el.dataset.activeFile;
                if (el.dataset.projectPath) state.data.project = el.dataset.projectPath;
            } else if (appName === 'Browser') {
                if (el.dataset.url) state.data.url = el.dataset.url;
            } else if (appName === 'Terminal') {
                if (el._terminalStartPath) state.data.path = el._terminalStartPath;
            } else if (appName === 'Claude Code') {
                if (el.dataset.project) state.data.project = el.dataset.project;
                if (el.dataset.session) state.data.session = el.dataset.session;
            }

            windows.push(state);
        });

        try {
            // Sort by z-index to preserve stacking order logic
            windows.sort((a, b) => (parseInt(a.z) || 0) - (parseInt(b.z) || 0));
            
            await window.api.updateSettings({ windowState: JSON.stringify(windows) });
        } catch (e) {
            console.error('Failed to save window state:', e);
        }
    }

    async restoreState() {
        try {
            const settings = await window.api.getSettings();
            if (!settings || !settings.windowState) return;

            const windows = JSON.parse(settings.windowState);
            
            // Open windows in order
            for (const win of windows) {
                // Construct args based on app type
                let args = [];
                if (win.app === 'Finder' || win.app === 'Terminal') {
                    if (win.data.path) args.push(win.data.path);
                }

                // Create window
                const windowEl = this.create(win.app, win.icon, ...args);
                
                // Restore dimensions/pos
                if (windowEl) {
                    windowEl.style.left = win.x;
                    windowEl.style.top = win.y;
                    if (win.w) windowEl.style.width = win.w;
                    if (win.h) windowEl.style.height = win.h;
                    if (win.z) windowEl.style.zIndex = win.z;
                    
                    if (win.maximized) {
                        windowEl.classList.add('maximized');
                    }

                    // Restore internal state
                    if (win.app === 'Editor') {
                        // Wait for init
                        setTimeout(() => {
                            if (win.data.project && windowEl.editorOpenProject) {
                                windowEl.editorOpenProject(win.data.project);
                            }
                            if (win.data.file && windowEl.editorOpenFile) {
                                windowEl.editorOpenFile(win.data.file, win.data.file.split('/').pop());
                            }
                        }, 100);
                    } else if (win.app === 'Browser' && win.data.url) {
                        // We need to inject URL into browser init or set it after
                        const input = windowEl.querySelector('.url-bar input');
                        const iframe = windowEl.querySelector('iframe');
                        if (input && iframe) {
                             input.value = win.data.url;
                             // Trigger load
                             iframe.src = win.data.url.startsWith('http') ? `/api/v1/proxy?url=${encodeURIComponent(win.data.url)}` : win.data.url;
                             // Update dataset for next save
                             windowEl.dataset.url = win.data.url;
                        }
                    } else if (win.app === 'Claude Code') {
                        setTimeout(() => {
                            if (win.data.project && windowEl.claudeOpenProject) {
                                windowEl.claudeOpenProject(win.data.project);
                                if (win.data.session && windowEl.claudeOpenSession) {
                                    // Give project load a moment
                                    setTimeout(() => windowEl.claudeOpenSession(win.data.session, win.data.project), 500);
                                }
                            }
                        }, 100);
                    }
                }
            }
            
            this.checkImmersiveState();

        } catch (e) {
            console.error('Failed to restore window state:', e);
        }
    }

    registerApp(name, content, initFunction) {
        this.apps.set(name, { content, init: initFunction });
    }

    registerObserver(callback) {
        this.observers.add(callback);
    }

    notifyObservers(appName, action, windowEl) {
        this.observers.forEach(cb => cb(appName, action, windowEl));
    }

    open(appName, iconClass, ...args) {
        const existingWindow = document.querySelector(`.window[data-app="${appName}"]`);
        
        if (existingWindow) {
            if (existingWindow.style.display === 'none') {
                existingWindow.style.display = 'flex';
                bringToFront(existingWindow);
                this.checkImmersiveState();
            } else {
                bringToFront(existingWindow);
                // Shake animation
                existingWindow.animate([
                    { transform: 'translateX(0)' },
                    { transform: 'translateX(-5px)' },
                    { transform: 'translateX(5px)' },
                    { transform: 'translateX(0)' }
                ], { duration: 200 });
            }
            return existingWindow;
        } else {
            return this.create(appName, iconClass, ...args);
        }
    }

    create(appName, iconClass, ...args) {
        const clone = this.template.content.cloneNode(true);
        const windowEl = clone.querySelector('.window');
        
        windowEl.dataset.app = appName;
        windowEl.querySelector('.title-text').textContent = appName;
        
        const iconEl = windowEl.querySelector('.window-title i');
        iconEl.className = 'ph ' + iconClass;
        
        const contentArea = windowEl.querySelector('.window-content');
        const app = this.apps.get(appName);
        
        if (app) {
            if (app.content) contentArea.innerHTML = app.content;
            if (app.init) app.init(windowEl, ...args);
        } else {
             contentArea.innerHTML = `
                <div style="padding: 20px;">
                    <h2>${appName}</h2>
                    <p>App definition not found.</p>
                </div>
             `;
        }

        // Positioning
        const offset = Math.floor(Math.random() * 50) + 50;
        windowEl.style.top = `${100 + offset}px`;
        windowEl.style.left = `${100 + offset}px`;
        
        bringToFront(windowEl);
        windowEl.addEventListener('mousedown', () => bringToFront(windowEl));

        // Controls
        const closeBtn = windowEl.querySelector('.close');
        const maximizeBtn = windowEl.querySelector('.maximize');
        const minimizeBtn = windowEl.querySelector('.minimize');
        const header = windowEl.querySelector('.window-header');

        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            windowEl.classList.add('closing');
            windowEl.addEventListener('animationend', () => { 
                windowEl.remove(); 
                this.notifyObservers(appName, 'close');
                this.checkImmersiveState();
                this.debouncedSave(); // Save on close
            });
        });

        const toggleMaximize = () => {
            windowEl.classList.toggle('maximized');
            this.checkImmersiveState();
            this.debouncedSave(); // Save on maximize
        };

        maximizeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleMaximize();
        });

        header.addEventListener('dblclick', () => toggleMaximize());

        minimizeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            windowEl.style.display = 'none';
            this.notifyObservers(appName, 'minimize');
            this.checkImmersiveState();
            // Minimizing is basically a state change, but we don't persist 'minimized' visible state yet easily.
            // But we should save that it's technically still there? 
            // Current persistence implementation re-opens them. If it was minimized, it will reopen as visible.
            // That's acceptable for now.
            this.debouncedSave();
        });

        makeDraggable(windowEl, header);
        const resizeHandle = windowEl.querySelector('.resize-handle');
        makeResizable(windowEl, resizeHandle);

        this.desktop.appendChild(windowEl);
        this.notifyObservers(appName, 'open', windowEl);
        this.checkImmersiveState();
        
        // Save state when new window opens (except during restore, but debouncing handles that somewhat)
        this.debouncedSave();

        return windowEl;
    }

    checkImmersiveState() {
        const anyMaximized = document.querySelector('.window.maximized:not([style*="display: none"])');
        if (anyMaximized) document.body.classList.add('immersive');
        else document.body.classList.remove('immersive');
    }
}

// Singleton Instance
export const windowManager = new WindowManager();
