import { ContextMenu } from '../ui/contextMenu.js';

export const BrowserApp = {
    name: 'Browser',
    content: `
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

    init(windowEl) {
        const header = windowEl.querySelector('.window-header');
        const title = windowEl.querySelector('.window-title');
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
    
        const renderTabs = () => {
            tabsContainer.querySelectorAll('.browser-tab').forEach(t => t.remove());
            tabs.forEach(tab => {
                const tabEl = document.createElement('div');
                tabEl.className = 'browser-tab' + (tab.id === activeTabId ? ' active' : '');
                tabEl.innerHTML = `<span>${tab.title}</span> <i class="ph ph-x"></i>`;
                tabEl.onclick = (e) => { 
                    e.stopPropagation(); 
                    activeTabId = tab.id; 
                    input.value = tab.url.startsWith('data:') ? 'local://test' : tab.url; 
                    
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
        };
    
        newTabBtn.onclick = (e) => { 
            e.stopPropagation(); 
            const url = 'https://www.google.com/search?igu=1'; 
            const nt = { id: Date.now(), title: 'New Tab', url: url }; 
            tabs.push(nt); 
            activeTabId = nt.id; 
            iframe.src = `/api/v1/proxy?url=${encodeURIComponent(url)}`; 
            renderTabs(); 
        };
    
        input.onkeydown = (e) => { 
            if (e.key === 'Enter') { 
                let url = input.value.trim(); 
                if (!url.startsWith('http') && !url.startsWith('data:')) url = 'https://' + url; 
                
                let targetSrc = url;
                if (url.startsWith('http')) {
                    targetSrc = `/api/v1/proxy?url=${encodeURIComponent(url)}`;
                }
    
                            iframe.src = targetSrc; 
                            const tab = tabs.find(t => t.id === activeTabId); 
                            tab.url = url; 
                            tab.title = url.startsWith('data:') ? 'Local' : (url.split('/')[2] || url); 
                            
                            // Save state
                            windowEl.dataset.url = url;
                            window.dispatchEvent(new Event('save-window-state'));
                
                            renderTabs(); 
                            setTimeout(renderDOMTree, 1000); 
                        } 
                    };        
        const contextHandler = (e) => { 
            e.preventDefault(); 
            // Mocking the global helper call - we need to decide where to put currentBrowserDevTools
            window.currentBrowserDevTools = { pane: devToolsPane, render: renderDOMTree }; 
            ContextMenu.show(e.clientX, e.clientY, 'browser'); 
        };

        windowEl.querySelector('.browser-toolbar').oncontextmenu = contextHandler;
        header.oncontextmenu = contextHandler;
        windowEl.querySelector('.reload').onclick = () => { iframe.src = iframe.src; setTimeout(renderDOMTree, 500); };
        
        renderTabs();
        iframe.src = demoHTML;
        iframe.onload = () => { renderDOMTree(); if (iframe.contentWindow) { const l = iframe.contentWindow.console.log; iframe.contentWindow.console.log = (...a) => { l(...a); logToDevTools(a.join(' ')); }; } };
    }
};
