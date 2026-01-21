import { getItems, registerObserver } from '../core/fileSystem.js';
import { windowManager } from '../core/windowManager.js';
import { ContextMenu } from './contextMenu.js';

export const Desktop = {
    init() {
        this.layer = document.getElementById('desktop-icons-layer');
        this.desktop = document.getElementById('desktop');
        this.GRID_X = 100;
        this.GRID_Y = 110;
        this.positions = JSON.parse(localStorage.getItem('desktopIconPositions') || '{}');

        // Initial render
        this.render();

        // Listen for FS updates
        registerObserver((path) => {
            // Always refresh desktop if something changed
            this.render();
        });

        // Listen for Wallpaper changes
        window.addEventListener('set-wallpaper', (e) => {
            this.setWallpaper(e.detail.url);
        });
        
        // Init Wallpaper
        const savedWP = localStorage.getItem('desktopWallpaper');
        if (savedWP) this.setWallpaper(savedWP);

        // Interaction Listeners
        this.setupInteractions();

        // Register globally for other modules (like ContextMenu) calling window.setWallpaper
        // Though we prefer EventBus, legacy support is good.
        window.setWallpaper = (url) => this.setWallpaper(url);
    },

    setWallpaper(pathOrUrl) {
        if (!pathOrUrl) return;
        let url = pathOrUrl;
        if (!pathOrUrl.startsWith('http') && !pathOrUrl.startsWith('data:') && !pathOrUrl.startsWith('/')) {
            url = window.api.getDownloadUrl(pathOrUrl);
        }
        
        this.desktop.style.backgroundImage = `url('${url}')`;
        this.desktop.style.backgroundSize = 'cover';
        this.desktop.style.backgroundPosition = 'center';
        localStorage.setItem('desktopWallpaper', pathOrUrl);
    },

    savePositions() {
        localStorage.setItem('desktopIconPositions', JSON.stringify(this.positions));
    },

    getNextFreeSlot(occupiedSlots) {
        let index = 0;
        while (true) {
            const col = Math.floor(index / 6);
            const row = index % 6;
            if (!occupiedSlots.has(`${col},${row}`)) {
                occupiedSlots.add(`${col},${row}`);
                return { x: 20 + col * this.GRID_X, y: 20 + row * this.GRID_Y };
            }
            index++;
        }
    },

    createIconElement(item, occupiedSlots) {
        const el = document.createElement('div');
        el.className = 'desktop-icon-item';
        el.dataset.path = item.path;

        const posKey = item.path;
        if (!this.positions[posKey]) {
            this.positions[posKey] = this.getNextFreeSlot(occupiedSlots);
            this.savePositions();
        }

        const pos = this.positions[posKey];
        el.style.left = `${pos.x}px`;
        el.style.top = `${pos.y}px`;

        const iconClass = item.type === 'folder' ? 'ph-folder' : 'ph-file-text';
        const typeClass = item.type === 'folder' ? 'folder' : 'file';
        const iconColor = item.type === 'folder' ? '#8ecae6' : 'white';
        const iconWeight = item.type === 'folder' ? 'ph-fill' : '';

        el.innerHTML = `<i class="ph ${iconClass} ${iconWeight} ${typeClass}" style="color:${iconColor}"></i><span>${item.name}</span>`;

        this.makeIconDraggable(el, item);

        el.addEventListener('contextmenu', (e) => {
            e.preventDefault(); e.stopPropagation();
            if (window.clearAllSelections) window.clearAllSelections('desktop');
            if (!el.classList.contains('selected')) {
                document.querySelectorAll('.desktop-icon-item').forEach(i => i.classList.remove('selected'));
                el.classList.add('selected');
            }
            ContextMenu.show(e.clientX, e.clientY, item.type === 'folder' ? 'folder' : 'file', null, 'Desktop');
        });

        return el;
    },

    async render() {
        if (document.body.classList.contains('is-interacting')) return;

        const items = await getItems('Desktop');
        const newPaths = new Set(items.map(item => item.path));

        const existingIcons = this.layer.querySelectorAll('.desktop-icon-item');
        const existingPaths = new Set();

        existingIcons.forEach(icon => {
            const path = icon.dataset.path;
            if (!newPaths.has(path)) {
                icon.remove();
                if (this.positions[path]) {
                    delete this.positions[path];
                    this.savePositions();
                }
            } else {
                existingPaths.add(path);
            }
        });

        const occupiedSlots = new Set();
        Object.values(this.positions).forEach(pos => {
            const x = Math.round((pos.x - 20) / this.GRID_X);
            const y = Math.round((pos.y - 20) / this.GRID_Y);
            if (x >= 0 && y >= 0) occupiedSlots.add(`${x},${y}`);
        });

        items.forEach(item => {
            if (!existingPaths.has(item.path)) {
                const el = this.createIconElement(item, occupiedSlots);
                this.layer.appendChild(el);
            }
        });
    },

    makeIconDraggable(el, itemData) {
        let isDragging = false, potentialDrag = false;
        let startX, startY, initialPositions = [];
        let ghost = null;
        let lastClickTime = 0;

        el.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            const now = Date.now();
            if (now - lastClickTime < 300) {
                // Double Click
                potentialDrag = false; isDragging = false; lastClickTime = 0;
                if (itemData.type === 'folder') {
                    windowManager.create('Finder', 'ph-folder-notch', itemData.path);
                } else {
                    const editor = windowManager.open('Editor', 'ph-atom');
                    setTimeout(() => editor.editorOpenFile(itemData.path, itemData.name), 100);
                }
                return;
            }
            lastClickTime = now;

            if (window.clearAllSelections) window.clearAllSelections('desktop');
            if (!el.classList.contains('selected')) {
                if (!e.metaKey && !e.ctrlKey) document.querySelectorAll('.desktop-icon-item').forEach(i => i.classList.remove('selected'));
                el.classList.add('selected');
            }

            potentialDrag = true; startX = e.clientX; startY = e.clientY;
        });

        window.addEventListener('mousemove', (e) => {
            if (potentialDrag && !isDragging) {
                if (Math.abs(e.clientX - startX) > 5 || Math.abs(e.clientY - startY) > 5) {
                    isDragging = true; potentialDrag = false;
                    const selectedEls = document.querySelectorAll('.desktop-icon-item.selected');
                    const draggedItems = [];
                    selectedEls.forEach(sel => {
                        draggedItems.push({
                            path: sel.dataset.path,
                            name: sel.dataset.path.split('/').pop(),
                            type: sel.querySelector('.folder') || sel.querySelector('.ph-folder') ? 'folder' : 'file'
                        });
                    });
                    if (draggedItems.length === 0) draggedItems.push({ path: itemData.path, name: itemData.name, type: itemData.type });
                    
                    window.draggedFiles = draggedItems;
                    window.draggedFile = draggedItems[0];
                    
                    ghost = el.cloneNode(true);
                    ghost.className = 'drag-ghost';
                    ghost.innerHTML = draggedItems.length > 1 
                        ? `<i class="ph ph-files"></i><span>${draggedItems.length} items</span>`
                        : `<i class="ph ${itemData.type === 'folder' ? 'ph-folder ph-fill' : 'ph-file-text'}"></i><span>${itemData.name}</span>`;
                    
                    ghost.style.left = `${e.clientX - 40}px`; ghost.style.top = `${e.clientY - 45}px`;
                    document.body.appendChild(ghost);

                    initialPositions = [];
                    document.querySelectorAll('.desktop-icon-item.selected').forEach(item => {
                        initialPositions.push({ el: item, left: parseInt(item.style.left || 0), top: parseInt(item.style.top || 0), path: item.dataset.path });
                        item.classList.add('dragging'); item.style.opacity = '0.5';
                    });
                    document.body.classList.add('is-interacting');
                }
            }

            if (isDragging) {
                if (ghost) { ghost.style.left = `${e.clientX - 40}px`; ghost.style.top = `${e.clientY - 45}px`; }
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
                    pos.el.classList.remove('dragging'); pos.el.style.opacity = '';
                    if (!window.draggedFiles && !window.draggedFile) {
                        pos.el.style.left = `${pos.left}px`; pos.el.style.top = `${pos.top}px`; return;
                    }
                    // Snap to grid
                    const cl = parseInt(pos.el.style.left || 0); const ct = parseInt(pos.el.style.top || 0);
                    const newX = 20 + Math.max(0, Math.round((cl - 20) / this.GRID_X)) * this.GRID_X;
                    const newY = 20 + Math.max(0, Math.round((ct - 20) / this.GRID_Y)) * this.GRID_Y;
                    pos.el.style.transition = 'top 0.2s, left 0.2s';
                    pos.el.style.left = `${newX}px`; pos.el.style.top = `${newY}px`;
                    if (pos.path) {
                        this.positions[pos.path] = { x: newX, y: newY };
                        this.savePositions();
                    }
                    setTimeout(() => pos.el.style.transition = '', 200);
                });
                if (window.draggedFiles) window.draggedFiles = null;
                if (window.draggedFile) window.draggedFile = null;
            }
        });
    },

    setupInteractions() {
        // Context Menu on Desktop Background
        this.desktop.addEventListener('contextmenu', (e) => {
            if (e.target === this.desktop || e.target.id === 'desktop-icons-layer') {
                e.preventDefault();
                if (window.clearAllSelections) window.clearAllSelections();
                ContextMenu.show(e.clientX, e.clientY, 'desktop', null, 'Desktop');
            }
        });

        // Selection Box logic (simplified port)
        const dsb = document.getElementById('selection-box');
        let isSelecting = false, startX, startY;
        
        this.desktop.addEventListener('mousedown', (e) => {
            if (e.target !== this.desktop && e.target.id !== 'desktop-icons-layer') return;
            if (e.button !== 0) return;
            if (window.clearAllSelections) window.clearAllSelections();
            isSelecting = true; startX = e.clientX; startY = e.clientY;
            dsb.style.display = 'block'; dsb.style.width = '0px'; dsb.style.height = '0px';
            dsb.style.left = `${startX}px`; dsb.style.top = `${startY}px`;
        });

        window.addEventListener('mousemove', (e) => {
            if (isSelecting) {
                const w = Math.abs(e.clientX - startX), h = Math.abs(e.clientY - startY);
                const cx = Math.min(e.clientX, startX), cy = Math.min(e.clientY, startY);
                dsb.style.width = `${w}px`; dsb.style.height = `${h}px`;
                dsb.style.left = `${cx}px`; dsb.style.top = `${cy}px`;
                
                const br = dsb.getBoundingClientRect();
                document.querySelectorAll('.desktop-icon-item').forEach(item => {
                    const r = item.getBoundingClientRect();
                    if (br.left < r.right && br.right > r.left && br.top < r.bottom && br.bottom > r.top) item.classList.add('selected');
                    else if (!e.metaKey && !e.ctrlKey) item.classList.remove('selected');
                });
            }
        });

        window.addEventListener('mouseup', () => { if (isSelecting) { isSelecting = false; dsb.style.display = 'none'; } });
    }
};
