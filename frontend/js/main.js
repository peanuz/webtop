import { DesignSystem } from './core/designSystem.js';
import { windowManager } from './core/windowManager.js';
import { moveToTrash, moveToPath, moveToFolder, moveToDesktop, isProtectedPath, refreshFileSystem } from './core/fileSystem.js';

// Apps
import { SettingsApp } from './apps/settings.js';
import { BrowserApp } from './apps/browser.js';
import { TerminalApp } from './apps/terminal.js';
import { FinderApp } from './apps/finder.js';
import { EditorApp } from './apps/editor.js';
import { ClaudeApp } from './apps/claude.js';

// UI
import { Desktop } from './ui/desktop.js';
import { Taskbar } from './ui/taskbar.js';
import { TopBar } from './ui/topbar.js';
import { ContextMenu } from './ui/contextMenu.js';

// Global Helpers
import './utils/helpers.js';

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Initialize Core Systems
    await DesignSystem.init();

    // 2. Register Apps
    windowManager.registerApp('Settings', SettingsApp.content, SettingsApp.init.bind(SettingsApp));
    windowManager.registerApp('Browser', BrowserApp.content, BrowserApp.init.bind(BrowserApp));
    windowManager.registerApp('Terminal', TerminalApp.content, TerminalApp.init.bind(TerminalApp));
    windowManager.registerApp('Finder', FinderApp.content, FinderApp.init.bind(FinderApp));
    windowManager.registerApp('Trash', FinderApp.content, (win) => FinderApp.init(win, 'Trash')); // Trash reuses Finder
    windowManager.registerApp('Editor', EditorApp.content, EditorApp.init.bind(EditorApp));
    windowManager.registerApp('Claude Code', ClaudeApp.content, ClaudeApp.init.bind(ClaudeApp));

    // Restore Windows
    await windowManager.restoreState();

    // 3. Initialize UI Components
    Desktop.init();
    Taskbar.init();
    TopBar.init();
    ContextMenu.init();

    // 4. Global Event Handlers
    
    // Global Helper for selection clearing (used by modules)
    window.clearAllSelections = (except = null) => {
        if (except !== 'desktop') {
            document.querySelectorAll('.desktop-icon-item.selected').forEach(i => i.classList.remove('selected'));
        }
        if (except !== 'finder') {
            document.querySelectorAll('.finder-item.selected, .finder-list-item.selected').forEach(i => i.classList.remove('selected'));
        }
    };

    // Global Drop Handler (System-wide Logic)
    window.addEventListener('mouseup', async (e) => {
        const items = window.draggedFiles || (window.draggedFile ? [window.draggedFile] : []);
        if (items.length === 0) return;

        const primaryItem = items[0];
        const target = document.elementFromPoint(e.clientX, e.clientY);
        const highlightedSidebarItem = document.querySelector('.finder-sidebar-item.drag-over');

        document.querySelectorAll('.dock-item').forEach(i => i.classList.remove('drag-over'));
        document.querySelectorAll('.finder-sidebar-item').forEach(i => i.classList.remove('drag-over'));

        const clearDragState = () => {
            window.draggedFile = null;
            window.draggedFiles = null;
        };

        // 1. Dock Trash
        const dockItem = target?.closest('.dock-item');
        if (dockItem?.querySelector('.tooltip')?.textContent === 'Trash') {
            clearDragState();
            for (const item of items) await moveToTrash(item);
            return;
        }

        // 2. Editor Window
        const editorWindow = target?.closest('.window[data-app="Editor"]');
        if (editorWindow?.editorOpenFile) {
            clearDragState();
            editorWindow.editorOpenFile(primaryItem.path, primaryItem.name);
            return;
        }

        // 3. Finder Sidebar
        let sidebarItem = target?.closest('.finder-sidebar-item');
        if (!sidebarItem) sidebarItem = highlightedSidebarItem;
        if (sidebarItem?.dataset.path) {
            const targetPath = sidebarItem.dataset.path;
            clearDragState();
            if (targetPath === 'Trash') {
                for (const item of items) await moveToTrash(item);
            } else {
                for (const item of items) await moveToPath(item, targetPath);
            }
            return;
        }

        // 4. Finder Content Area
        const finderContent = target?.closest('.finder-content');
        if (finderContent) {
            const finderWindow = finderContent.closest('.window');
            const targetPath = finderWindow.querySelector('.finder-path').textContent;
            const dropTargetItem = target?.closest('.finder-item');

            clearDragState();

            if (dropTargetItem?.querySelector('.folder')) {
                 const destPath = dropTargetItem.dataset.path;
                 const validItems = items.filter(i => i.path !== destPath);
                 for (const item of validItems) await moveToFolder(item, destPath);
                 return;
            }

            for (const item of items) await moveToPath(item, targetPath);
            return;
        }

        // 5. Desktop Area
        const desktopArea = target?.closest('#desktop');
        if (desktopArea) {
            const hitIcon = target?.closest('.desktop-icon-item');
            if (hitIcon?.querySelector('.folder')) {
                const destPath = hitIcon.dataset.path;
                clearDragState();
                const validItems = items.filter(i => i.path !== destPath);
                for (const item of validItems) await moveToFolder(item, destPath);
                return;
            }

            if (!hitIcon) {
                const itemsToMove = items.filter(item => {
                     const parentDir = item.path.split('/').slice(0, -1).join('/') || 'Desktop';
                     return parentDir !== 'Desktop';
                });

                if (itemsToMove.length > 0) {
                    clearDragState();
                    for (const item of itemsToMove) await moveToDesktop(item);
                    return;
                }
                return;
            }
        }

        clearDragState();
    });

    // Global Drag Feedback (Hover effects)
    window.addEventListener('mousemove', (e) => {
        if (!window.draggedFile && !window.draggedFiles) return;
        const target = document.elementFromPoint(e.clientX, e.clientY);

        document.querySelectorAll('.dock-item').forEach(i => i.classList.remove('drag-over'));
        document.querySelectorAll('.finder-sidebar-item').forEach(i => i.classList.remove('drag-over'));

        const dockItem = target?.closest('.dock-item');
        if (dockItem?.querySelector('.tooltip')?.textContent === 'Trash') {
            dockItem.classList.add('drag-over');
            return;
        }

        const sidebarItem = target?.closest('.finder-sidebar-item');
        if (sidebarItem) {
            sidebarItem.classList.add('drag-over');
        }
    });

    // Global Keyboard Shortcuts (Copy/Paste)
    document.addEventListener('keydown', async (e) => {
        const target = e.target;
        const isEditable = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
        const isInEditor = target.closest('.editor-textarea, .xterm-container, .browser-iframe');

        if (isEditable || isInEditor) return;

        const isMod = e.metaKey || e.ctrlKey;

        if (isMod && (e.key === 'c' || e.key === 'x')) {
            const selected = document.querySelector('.desktop-icon-item.selected, .finder-item.selected');
            if (selected) {
                e.preventDefault();
                document.querySelectorAll('.cut-item').forEach(el => el.classList.remove('cut-item'));
                const path = selected.dataset.path;
                window.clipboard = {
                    path: path,
                    name: path.split('/').pop(),
                    type: selected.querySelector('.folder') ? 'folder' : 'file',
                    operation: e.key === 'c' ? 'copy' : 'cut'
                };
                if (e.key === 'x') selected.classList.add('cut-item');
            }
        }

        if (isMod && e.key === 'v') {
            if (!window.clipboard) return;
            e.preventDefault();

            let targetPath = 'Desktop';
            // Check selection (paste into folder)
            const selectedFolder = document.querySelector('.desktop-icon-item.selected .folder, .finder-item.selected .folder');
            if (selectedFolder) {
                targetPath = selectedFolder.closest('[data-path]')?.dataset.path || targetPath;
            } else {
                // Check active Finder window
                const activeFinder = document.querySelector('.window[data-app="Finder"]:not(.minimized) .finder-content');
                if (activeFinder) {
                    targetPath = activeFinder.dataset.currentPath || 'Desktop';
                }
            }

            try {
                const destPath = `${targetPath}/${window.clipboard.name}`;
                if (window.clipboard.operation === 'copy') {
                    await window.api.copyItem(window.clipboard.path, destPath);
                } else {
                    await window.api.moveItem(window.clipboard.path, destPath);
                    const srcParent = window.clipboard.path.split('/').slice(0, -1).join('/') || 'Desktop';
                    refreshFileSystem(srcParent);
                    document.querySelectorAll('.cut-item').forEach(el => el.classList.remove('cut-item'));
                    window.clipboard = null;
                }
                refreshFileSystem(targetPath);
            } catch (err) {
                console.error('Paste failed:', err);
            }
        }
    });

    // Global expose for index.html legacy calls if any remain
    // Note: We removed onclicks in HTML, so this is just fallback
    window.openWindow = (name, icon) => windowManager.open(name, icon);
    window.createWindow = (name, icon) => windowManager.create(name, icon);
    
    // Reveal body after init
    document.body.style.opacity = '1';
});
