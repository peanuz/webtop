import { windowManager } from '../core/windowManager.js';
import { isProtectedPath, refreshFileSystem } from '../core/fileSystem.js';
import { showConfirm, showModal } from '../utils/helpers.js';

export const ContextMenu = {
    init() {
        // Definitions of menus
        this.menus = {
            desktop: [
                { label: 'New Folder', action: 'new_folder' },
                { label: 'Open Terminal Here', action: 'open_terminal' },
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
                { label: 'Open Terminal Here', action: 'open_terminal' },
                { separator: true },
                { label: 'Copy', action: 'copy' },
                { label: 'Cut', action: 'cut' },
                { label: 'Rename', action: 'rename' },
                { label: 'Paste Item', action: 'paste' },
                { separator: true },
                { label: 'Move to Trash', action: 'delete' }
            ],
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

        // Click anywhere closes menu
        document.addEventListener('click', () => {
            const menu = document.getElementById('context-menu');
            if (menu) menu.style.display = 'none';
        });
    },

    show(x, y, type, targetData = null, currentPath = 'Desktop') {
        const contextMenu = document.getElementById('context-menu');
        if (!contextMenu) return;

        contextMenu.innerHTML = '';

        const isInTrash = currentPath === 'Trash' || currentPath.startsWith('Trash/');
        let menuType = type;
        if (isInTrash && (type === 'file' || type === 'folder')) {
            menuType = type === 'file' ? 'trash_file' : 'trash_folder';
        }

        let menuItems = this.menus[menuType] || this.menus['desktop'];

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

        // Check clipboard from global state or simple property on window for now
        if (!window.clipboard) {
            menuItems = menuItems.map(i => i.action === 'paste' ? { ...i, disabled: true } : i);
        }
        
        // Hide "Open Terminal Here" if we are selecting specific items (should default to standard menus, but just in case)
        if (targetData && action !== 'open_terminal') {
             // Logic handles types automatically via menu definitions
        }

        menuItems.forEach(item => {
            if (item.separator) {
                const sep = document.createElement('div');
                sep.className = 'menu-separator';
                contextMenu.appendChild(sep);
            } else {
                const el = document.createElement('div');
                el.className = 'menu-item' + (item.disabled ? ' disabled' : '');
                el.textContent = item.label;

                if (!item.disabled) {
                    el.onclick = () => {
                        contextMenu.style.display = 'none';
                        this.handleAction(item.action, targetData, currentPath);
                    };
                }
                contextMenu.appendChild(el);
            }
        });

        contextMenu.style.display = 'block';
        const w = 200, h = contextMenu.offsetHeight || 100;
        contextMenu.style.left = `${Math.min(x, window.innerWidth - w)}px`;
        contextMenu.style.top = `${Math.min(y, window.innerHeight - h)}px`;
    },

    async handleAction(action, targetData, currentPath) {
        // Dock Actions
        if (action === 'open_app') {
            windowManager.open(targetData.name, targetData.icon);
        } else if (action === 'new_window') {
            windowManager.create(targetData.name, targetData.icon);
        } else if (action === 'close_app') {
            document.querySelectorAll(`.window[data-app="${targetData.name}"]`).forEach(w => w.remove());
        }

        // File/Folder Actions
        else if (action === 'open') {
             const selected = document.querySelector('.desktop-icon-item.selected') || 
                              document.querySelector('.finder-item.selected, .finder-list-item.selected');
             if (selected) {
                 const path = selected.dataset.path;
                 const isFolder = selected.querySelector('.folder') !== null || selected.querySelector('.ph-folder') !== null;
                 if (isFolder) {
                     windowManager.create('Finder', 'ph-folder-notch', path);
                 } else {
                     // Need access to editor. Can use windowManager to find/open editor
                     const editorWin = windowManager.open('Editor', 'ph-atom');
                     setTimeout(() => editorWin.editorOpenFile(path, path.split('/').pop()), 100);
                 }
             }
        }

        else if (action === 'delete') {
            const selected = [...document.querySelectorAll('.desktop-icon-item.selected'), ...document.querySelectorAll('.finder-item.selected')];
            for (const el of selected) {
                const path = el.dataset.path;
                if (isProtectedPath(path)) {
                    alert(`Cannot delete "${path}" - this is a system folder.`);
                    continue;
                }
                try {
                    await window.api.trashItem(path);
                    const parent = path.split('/').slice(0, -1).join('/') || 'Desktop';
                    refreshFileSystem(parent);
                    refreshFileSystem('Trash');
                } catch (e) { console.error(e); }
            }
        }

        else if (action === 'delete_permanent') {
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
                    await window.api.deleteItem(el.dataset.path);
                    refreshFileSystem('Trash');
                } catch (e) { console.error(e); }
            }
        }

        else if (action === 'restore') {
            const selected = document.querySelectorAll('.finder-item.selected');
            for (const el of selected) {
                const path = el.dataset.path;
                const name = path.split('/').pop();
                try {
                    await window.api.moveItem(path, `Desktop/${name}`);
                    refreshFileSystem('Trash');
                    refreshFileSystem('Desktop');
                } catch (e) { console.error(e); }
            }
        }

        else if (action === 'rename') {
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
                     await window.api.moveItem(oldPath, newPath);
                     // Update desktop icon position logic would be needed here if on desktop
                     // For now just refresh
                     refreshFileSystem(parentDir);
                 } catch (e) { alert(e.message); }
             }
        }

        else if (action === 'copy' || action === 'cut') {
             const selected = document.querySelector('.desktop-icon-item.selected, .finder-item.selected');
             if (selected) {
                 document.querySelectorAll('.cut-item').forEach(el => el.classList.remove('cut-item'));
                 const path = selected.dataset.path;
                 window.clipboard = {
                     path: path,
                     name: path.split('/').pop(),
                     type: selected.querySelector('.folder') ? 'folder' : 'file',
                     operation: action
                 };
                 if (action === 'cut') selected.classList.add('cut-item');
             }
        }

        else if (action === 'paste') {
             if (!window.clipboard) return;
             try {
                 const destPath = `${currentPath}/${window.clipboard.name}`;
                 if (window.clipboard.operation === 'copy') {
                     await window.api.copyItem(window.clipboard.path, destPath);
                 } else {
                     await window.api.moveItem(window.clipboard.path, destPath);
                     const srcParent = window.clipboard.path.split('/').slice(0, -1).join('/') || 'Desktop';
                     refreshFileSystem(srcParent);
                     document.querySelectorAll('.cut-item').forEach(el => el.classList.remove('cut-item'));
                     window.clipboard = null;
                 }
                 refreshFileSystem(currentPath);
             } catch (e) { alert(e.message); }
        }

        else if (action === 'change_wallpaper') {
            const settingsWin = windowManager.open('Settings', 'ph-gear');
            setTimeout(() => {
                const designTab = settingsWin.querySelector('.sidebar-item[data-section="design"]');
                if (designTab) designTab.click();
            }, 100);
        }

        else if (action === 'set_wallpaper') {
             const selected = document.querySelector('.desktop-icon-item.selected, .finder-item.selected');
             if (selected) {
                 window.dispatchEvent(new CustomEvent('set-wallpaper', { detail: { url: selected.dataset.path } }));
             }
        }

        else if (action === 'new_folder') {
             const name = await showModal({
                 title: 'New Folder',
                 content: 'Folder Name:',
                 placeholder: 'Untitled Folder',
                 confirmText: 'Create'
             });
             if (name) {
                 try {
                     await window.api.createDir(`${currentPath}/${name}`);
                     refreshFileSystem(currentPath);
                 } catch (e) { alert(e.message); }
             }
        }

        else if (action === 'open_terminal') {
            let targetPath = currentPath;
            
            // Check if a specific folder is selected
            const selected = document.querySelector('.desktop-icon-item.selected, .finder-item.selected, .finder-list-item.selected');
            if (selected) {
                const isFolder = selected.querySelector('.folder') !== null || selected.querySelector('.ph-folder') !== null;
                if (isFolder) {
                    targetPath = selected.dataset.path;
                }
            }
            
            windowManager.create('Terminal', 'ph-terminal-window', targetPath);
        }

        else if (action === 'inspect_browser' && window.currentBrowserDevTools) {
            window.currentBrowserDevTools.pane.style.display = 'flex';
            window.currentBrowserDevTools.render();
        }
    }
};
