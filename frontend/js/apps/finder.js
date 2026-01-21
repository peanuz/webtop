import { getItems, registerObserver, moveToTrash, moveToFolder, moveToPath, isProtectedPath } from '../core/fileSystem.js';
import { showModal, showConfirm } from '../utils/helpers.js';
import { ContextMenu } from '../ui/contextMenu.js';
import { windowManager } from '../core/windowManager.js';
import { makeDraggable, bringToFront } from '../utils/dragDrop.js';

export const FinderApp = {
    name: 'Finder',
    content: `
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

    init(windowEl, startPath = 'Desktop') {
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

        // Open file in editor helper
        async function openFileInEditor(path, name) {
            let editorWindow = document.querySelector('.window[data-app="Editor"]');
        
            if (!editorWindow) {
                editorWindow = windowManager.open('Editor', 'ph-atom');
            } else {
                bringToFront(editorWindow);
            }
        
            setTimeout(() => {
                if (editorWindow.editorOpenFile) {
                    editorWindow.editorOpenFile(path, name);
                }
            }, 100);
        }
    
        // Setup item interactions
        function setupItemInteractions(el, item) {
            // Context menu
            el.oncontextmenu = (e) => {
                e.preventDefault();
                e.stopPropagation();
                // Clear finder selections (using global helper if available, or manual)
                if (window.clearAllSelections) window.clearAllSelections('finder');
                
                if (!el.classList.contains('selected')) {
                    contentDiv.querySelectorAll('.finder-item, .finder-list-item').forEach(i => i.classList.remove('selected'));
                    el.classList.add('selected');
                }
                ContextMenu.show(e.clientX, e.clientY, item.type === 'folder' ? 'folder' : 'file', null, currentPath);
            };
    
            // Draggable Logic
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
    
                if (window.clearAllSelections) window.clearAllSelections('finder');
    
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
                            pendingDeselect = false;
    
                            const selectedEls = contentDiv.querySelectorAll('.finder-item.selected, .finder-list-item.selected');
                            const draggedItems = [];
                            selectedEls.forEach(sel => {
                                draggedItems.push({
                                    path: sel.dataset.path,
                                    name: sel.dataset.path.split('/').pop(),
                                    type: sel.querySelector('.folder') || sel.querySelector('.ph-folder') ? 'folder' : 'file'
                                });
                            });
                            
                            if (draggedItems.length === 0) {
                                draggedItems.push({ path: item.path, name: item.name, type: item.type });
                            }
    
                            window.draggedFiles = draggedItems;
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
    
        function renderListView(items, sb) {
            const header = document.createElement('div');
            header.className = 'finder-list-header';
            header.innerHTML = `
                <span class="list-col name">Name</span>
                <span class="list-col size">Size</span>
                <span class="list-col kind">Kind</span>
            `;
            contentDiv.appendChild(header);
    
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
        
        function enableSelection(container, sb) {
            let isSelecting = false, startX, startY, cr;
            container.addEventListener('mousedown', (e) => {
                if (e.target !== container || e.button !== 0) return;
                if (window.clearAllSelections) window.clearAllSelections();
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
    
            async function render(path) {
                currentPath = path;
                contentDiv.dataset.currentPath = path;
                window.dispatchEvent(new Event('save-window-state')); // Notify WindowManager
                const pathEl = windowEl.querySelector('.finder-path');            pathEl.textContent = path || 'Home';
            
            pathEl.style.cursor = 'pointer';
            pathEl.title = 'Click to copy path';
            pathEl.onclick = async () => {
                try {
                    await navigator.clipboard.writeText(path || 'Home');
                    const originalText = pathEl.textContent;
                    pathEl.textContent = 'Copied!';
                    setTimeout(() => { pathEl.textContent = originalText; }, 1000);
                } catch (err) { console.error('Failed to copy path:', err); }
            };
    
            const backBtn = windowEl.querySelector('.back-btn');
            if (path === '') backBtn.style.display = 'none';
            else backBtn.style.display = 'block';
    
            let emptyBtn = windowEl.querySelector('.empty-trash-btn');
            if (path === 'Trash') {
                if (!emptyBtn) {
                    emptyBtn = document.createElement('button');
                    emptyBtn.className = 'finder-nav-btn empty-trash-btn';
                    emptyBtn.innerHTML = '<i class="ph ph-trash"></i> Empty';
                    emptyBtn.onclick = async () => {
                        const confirmed = await showConfirm({
                            title: 'Empty Trash',
                            content: 'Are you sure you want to permanently delete all items in Trash?',
                            confirmText: 'Empty Trash',
                            type: 'danger'
                        });
                        if (confirmed) {
                             const items = await getItems('Trash');
                             for (const item of items) await window.api.deleteItem(item.path);
                             render('Trash');
                        }
                    };
                    windowEl.querySelector('.finder-view-toggle').insertAdjacentElement('beforebegin', emptyBtn);
                }
                emptyBtn.style.display = 'block';
            } else {
                if (emptyBtn) emptyBtn.style.display = 'none';
            }
    
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
    
            if (viewMode === 'icons') renderIconsView(items, sb);
            else renderListView(items, sb);
        }
    
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
    
        const observer = (updatedPath) => {
            if (windowEl.offsetParent !== null) {
                 render(currentPath);
            }
        };
        registerObserver(observer);
    
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
            if (window.clearAllSelections) window.clearAllSelections();
            ContextMenu.show(e.clientX, e.clientY, 'desktop', null, currentPath);
        };
        
        render(startPath);
        windowEl.finderNavigate = render;
    }
};
