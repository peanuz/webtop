import { showConfirm, showModal } from '../utils/helpers.js';
import { windowManager } from '../core/windowManager.js';

export const EditorApp = {
    name: 'Editor',
    content: `
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

    init(windowEl) {
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

        // Editor State (local to module/instance)
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
    
        let activeFilePath = null;
        let projectPath = null;
        let localOpenFiles = new Map();
        let expandedFolders = new Set();
    
        // Integrate toolbar
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
    
        function getFileIcon(name, isDir = false) {
            if (isDir) return 'ph-folder-simple';
            const ext = name.split('.').pop().toLowerCase();
            const icons = {
                'html': 'ph-file-html', 'htm': 'ph-file-html', 'css': 'ph-file-css',
                'js': 'ph-file-js', 'ts': 'ph-file-ts', 'tsx': 'ph-file-ts', 'jsx': 'ph-file-js',
                'json': 'ph-file-code', 'md': 'ph-file-text', 'txt': 'ph-file-text',
                'png': 'ph-file-image', 'jpg': 'ph-file-image', 'py': 'ph-file-py',
            };
            return icons[ext] || 'ph-file';
        }
    
        async function loadProjectTree(path) {
            try {
                const result = await window.api.listDir(path);
                return result.items.map(item => ({
                    name: item.name,
                    path: item.path,
                    isDir: item.isDirectory,
                    children: null 
                }));
            } catch (err) {
                console.error('Failed to load directory:', err);
                return [];
            }
        }
    
        async function renderProjectTree() {
            if (!projectPath) {
                projectTree.innerHTML = `<div class="no-project-msg"><i class="ph ph-folder-open"></i><p>Open a folder to see project files</p></div>`;
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
    
        async function openProject(path) {
            projectPath = path;
            projectName.textContent = path.split('/').pop() || path;
            editorState.setLastProject(path);
            windowEl.dataset.projectPath = path; // Expose for WindowManager
            expandedFolders.clear();
            await renderProjectTree();
            window.dispatchEvent(new Event('save-window-state'));
        }
    
        function renderTabs() {
            tabsContainer.innerHTML = '';
            if (localOpenFiles.size === 0) {
                tabsContainer.innerHTML = '<div class="no-tabs-msg" style="padding: 0 10px; font-size: 12px; opacity: 0.5; line-height: 30px; white-space: nowrap;">No open files</div>';
                return;
            }
            localOpenFiles.forEach((fileData, path) => {
                const name = path.split('/').pop();
                const tab = document.createElement('div');
                tab.className = 'editor-tab' + (path === activeFilePath ? ' active' : '');
                tab.innerHTML = `<i class="ph ${getFileIcon(name)}"></i><span>${name}${fileData.isModified ? ' •' : ''}</span><i class="ph ph-x tab-close"></i>`;
                tab.onclick = (e) => { if (!e.target.classList.contains('tab-close')) switchToFile(path); };
                tab.querySelector('.tab-close').onclick = (e) => { e.stopPropagation(); closeFile(path); };
                tabsContainer.appendChild(tab);
            });
        }
    
        function renderOpenFilesList() {
            openFilesList.innerHTML = '';
            localOpenFiles.forEach((fileData, path) => {
                const name = path.split('/').pop();
                const el = document.createElement('div');
                el.className = 'open-file-item' + (path === activeFilePath ? ' active' : '');
                el.innerHTML = `<i class="ph ${getFileIcon(name)}"></i><span>${name}${fileData.isModified ? ' •' : ''}</span><i class="ph ph-x close-btn"></i>`;
                el.onclick = (e) => { if (!e.target.classList.contains('close-btn')) switchToFile(path); };
                el.querySelector('.close-btn').onclick = (e) => { e.stopPropagation(); closeFile(path); };
                openFilesList.appendChild(el);
            });
        }
    
        function updateHighlight() {
            // Allow highlight even if no active file (default text)
            const content = textarea.value;
            if (!activeFilePath) {
                 code.textContent = content; // Simple text, no highlight
                 return;
            }
            const ext = activeFilePath.split('.').pop();
            if (window.Syntax) code.innerHTML = window.Syntax.highlight(content, ext);
            else code.textContent = content;
        }
    
        function switchToFile(path) {
            if (!localOpenFiles.has(path)) return;
            if (activeFilePath && localOpenFiles.has(activeFilePath)) {
                localOpenFiles.get(activeFilePath).content = textarea.value;
            }
            activeFilePath = path;
            windowEl.dataset.activeFile = path; // Expose state
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
            window.dispatchEvent(new Event('save-window-state'));
        }
    
        async function openFile(path, name) {
            if (localOpenFiles.has(path)) {
                switchToFile(path);
                return;
            }
            try {
                const result = await window.api.readFile(path);
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
                    delete windowEl.dataset.activeFile; // Clear state
                    textarea.value = ''; // Clear content
                    statusFile.textContent = 'Untitled';
                    statusType.textContent = 'TXT';
                    code.textContent = '';
                    updateCursorPosition();
                    window.dispatchEvent(new Event('save-window-state'));
                }
            }
            renderTabs();
            renderOpenFilesList();
        }
    
        async function saveCurrentFile() {
            if (!activeFilePath) {
                // Save As Logic (Untitled)
                const content = textarea.value;
                
                const fileName = await showModal({
                    title: 'Save As',
                    content: 'Enter file name:',
                    placeholder: 'untitled.txt',
                    confirmText: 'Save'
                });
                
                if (!fileName) return;
    
                // Determine path: use project path or Desktop
                const basePath = projectPath || 'Desktop';
                const fullPath = `${basePath}/${fileName}`;
    
                try {
                    await window.api.writeFile(fullPath, content);
                    await openFile(fullPath, fileName);
                    if (projectPath) await renderProjectTree();
                } catch (err) {
                    alert('Failed to save: ' + err.message);
                }
                return;
            }
    
            const fileData = localOpenFiles.get(activeFilePath);
            if (!fileData) return;
            try {
                await window.api.writeFile(activeFilePath, fileData.content);
                fileData.originalContent = fileData.content;
                fileData.isModified = false;
                renderTabs();
                renderOpenFilesList();
            } catch (err) {
                alert('Failed to save: ' + err.message);
            }
        }
    
        function updateCursorPosition() {
            const text = textarea.value.substring(0, textarea.selectionStart);
            const lines = text.split('\n');
            const line = lines.length;
            const col = lines[lines.length - 1].length + 1;
            statusPos.textContent = `Ln ${line}, Col ${col}`;
        }
    
        textarea.oninput = () => {
            if (!activeFilePath) {
                // "Scratchpad" mode
                statusFile.textContent = 'Untitled •';
                updateHighlight();
                updateCursorPosition();
                return;
            }
            
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
            const picker = windowManager.open('Finder', 'ph-folder-notch');
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
            const basePath = projectPath || 'Desktop';
            const filePath = `${basePath}/${fileName}`;
            try {
                await window.api.writeFile(filePath, '');
                await openFile(filePath, fileName);
                if (projectPath) await renderProjectTree();
            } catch (err) {
                alert('Failed to create file: ' + err.message);
            }
        };
    
        renderTabs();
        renderOpenFilesList();
        if (editorState.lastProject) openProject(editorState.lastProject);
    
        windowEl.editorOpenFile = openFile;
        windowEl.editorOpenProject = openProject;
    }
};