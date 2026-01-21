import { DesignSystem } from '../core/designSystem.js';

export const TerminalApp = {
    name: 'Terminal',
    content: `
        <div class="app-layout terminal-layout">
            <div class="terminal-panels">
                <div class="terminal-panel active" data-panel-id="0">
                    <div class="xterm-container"></div>
                </div>
            </div>
        </div>
    `,

    init(windowEl, startPath = null) {
        const panelsContainer = windowEl.querySelector('.terminal-panels');
        if (!panelsContainer || !window.Terminal) return;
    
        let panelIdCounter = 0;
        const panels = new Map();
        let activePanelId = null;
        
        // Store initial path for new tabs
        windowEl._terminalStartPath = startPath;
    
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
    
            const term = new window.Terminal({
                cursorBlink: true,
                fontSize: 14,
                fontFamily: '"SF Mono", "Menlo", "Monaco", "Courier New", monospace',
                scrollback: 10000,
                theme: getTerminalTheme(),
                allowProposedApi: true,
            });

            // Enable browser clipboard hotkeys (Cmd+C, Cmd+V, Cmd+A)
            term.attachCustomKeyEventHandler((e) => {
                const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
                const modifier = isMac ? e.metaKey : e.ctrlKey;

                // Cmd/Ctrl+C: Copy if text selected, otherwise send to terminal
                if (modifier && e.key === 'c') {
                    const selection = term.getSelection();
                    if (selection) {
                        navigator.clipboard.writeText(selection);
                        return false; // Prevent terminal from handling
                    }
                    // No selection - let terminal handle as SIGINT
                    return true;
                }

                // Cmd/Ctrl+V: Paste from clipboard
                if (modifier && e.key === 'v') {
                    navigator.clipboard.readText().then(text => {
                        if (text) {
                            const pd = panels.get(panelId);
                            if (pd?.ws && pd.ws.readyState === WebSocket.OPEN) {
                                pd.ws.send(JSON.stringify({ type: 'input', data: text }));
                            }
                        }
                    }).catch(() => {});
                    return false;
                }

                // Cmd/Ctrl+A: Select all in terminal
                if (modifier && e.key === 'a') {
                    term.selectAll();
                    return false;
                }

                // Cmd/Ctrl+K: Clear terminal
                if (modifier && e.key === 'k') {
                    term.clear();
                    return false;
                }

                return true; // Let terminal handle other keys
            });
    
            const fitAddon = new window.FitAddon.FitAddon();
            term.loadAddon(fitAddon);
    
            if (window.WebLinksAddon) {
                const webLinksAddon = new window.WebLinksAddon.WebLinksAddon();
                term.loadAddon(webLinksAddon);
            }
    
            term.open(container);
            fitAddon.fit();
    
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
                                    rows: term.rows,
                                    path: windowEl._terminalStartPath || undefined
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
    
            term.onData((data) => {
                const pd = panels.get(panelId);
                if (pd?.ws && pd.ws.readyState === WebSocket.OPEN) {
                    pd.ws.send(JSON.stringify({ type: 'input', data }));
                }
            });
    
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
            activePanelId = panelId;
            panelsContainer.querySelectorAll('.terminal-panel').forEach(p => {
                p.classList.toggle('active', p.dataset.panelId === panelId);
            });
            const panelData = panels.get(panelId);
            if (panelData?.term) {
                panelData.term.focus();
            }
        }
    
        function addNewPanel() {
            panelIdCounter++;
            const newPanelId = String(panelIdCounter);
            const newPanelEl = document.createElement('div');
            newPanelEl.className = 'terminal-panel';
            newPanelEl.dataset.panelId = newPanelId;
            newPanelEl.innerHTML = '<div class="xterm-container"></div>';
            panelsContainer.appendChild(newPanelEl);
            createTerminalPanel(newPanelEl);
            setActivePanel(newPanelId);
            setTimeout(() => {
                panels.forEach(p => p.fitAddon.fit());
            }, 50);
            return newPanelId;
        }
    
        function closePanel(panelId) {
            const panelData = panels.get(panelId);
            if (!panelData) return;
            if (panels.size <= 1) return;
            panelData.cleanup();
            panelData.panelEl.remove();
            panels.delete(panelId);
            if (activePanelId === panelId) {
                const remainingIds = Array.from(panels.keys());
                if (remainingIds.length > 0) {
                    setActivePanel(remainingIds[remainingIds.length - 1]);
                }
            }
            setTimeout(() => {
                panels.forEach(p => p.fitAddon.fit());
            }, 50);
        }
    
        function closeActivePanel() {
            if (activePanelId) {
                closePanel(activePanelId);
            }
        }
    
        const firstPanel = panelsContainer.querySelector('.terminal-panel');
        if (firstPanel) {
            createTerminalPanel(firstPanel);
            setActivePanel(firstPanel.dataset.panelId);
        }
    
        function handleKeydown(e) {
            if (!windowEl.classList.contains('active')) return; // active class set by WindowManager
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
    
        const handleThemeChange = (e) => {
            const newTheme = e.detail.theme === 'light' ? themes.light : themes.dark;
            panels.forEach(pd => {
                if (pd.term) {
                    pd.term.options.theme = newTheme;
                }
            });
        };
        window.addEventListener('theme-changed', handleThemeChange);
    
        windowEl._terminalPanels = panels;
        windowEl._addTerminalPanel = addNewPanel;
        windowEl._closeTerminalPanel = closeActivePanel;
    
        const originalCloseHandler = windowEl.querySelector('.close').onclick;
        windowEl.querySelector('.close').onclick = (e) => {
            window.removeEventListener('theme-changed', handleThemeChange);
            windowEl.removeEventListener('keydown', handleKeydown);
            panels.forEach(p => p.cleanup());
            panels.clear();
            if (originalCloseHandler) originalCloseHandler(e);
        };
    }
};
