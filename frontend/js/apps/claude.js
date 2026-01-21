import { windowManager } from '../core/windowManager.js';
import { showConfirm } from '../utils/helpers.js';

export const ClaudeApp = {
    name: 'Claude Code',
    content: `
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

    init(windowEl) {
        const projectsContainer = windowEl.querySelector('.claude-projects');
        const chatList = windowEl.querySelector('.chat-list');
        const mainContainer = windowEl.querySelector('.claude-main');
        const header = windowEl.querySelector('.claude-header');
    
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
    
        const existingXterm = windowEl.querySelector('.xterm-container');
        if (existingXterm) existingXterm.remove();
    
        if (!windowEl.querySelector('.chat-messages')) {
            header.after(chatMessages);
            mainContainer.appendChild(inputArea);
        }
    
        const input = inputArea.querySelector('input');
        const sendBtn = inputArea.querySelector('#send-btn');
        const modelSelector = windowEl.querySelector('.model-selector');
    
        let activeProject = null;
        let activeSessionId = null;
        let ws = null;
        let currentAiMessage = null;
        let isStreaming = false;
        let currentMode = 'normal'; 
    
        function initModeSelector() {
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
                };
                if (modelSelector) {
                    modelSelector.after(selector);
                } else {
                    header.appendChild(selector);
                }
            }
        }
    
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
    
        function createApprovalUI(toolName, toolInput) {
            const container = document.createElement('div');
            container.className = 'approval-card';
            let details = '';
            try { details = JSON.stringify(toolInput, null, 2); } catch (e) { details = String(toolInput); }
            container.innerHTML = `
                <div class="approval-header"><span><i class="ph ph-wrench"></i> Tool Use Request: ${toolName}</span></div>
                <div class="approval-details">${details}</div>
                <div class="approval-actions">
                    <button class="approval-btn reject">Reject</button>
                    <button class="approval-btn approve">Approve</button>
                </div>
            `;
            const approveBtn = container.querySelector('.approve');
            const rejectBtn = container.querySelector('.reject');
            function disableButtons() {
                approveBtn.disabled = true;
                rejectBtn.disabled = true;
                approveBtn.style.opacity = '0.5';
                rejectBtn.style.opacity = '0.5';
            }
            approveBtn.onclick = () => { disableButtons(); sendApproval(true); container.innerHTML += '<div style="margin-top:8px; color:#4caf50; font-size:12px;">Approved</div>'; };
            rejectBtn.onclick = () => { disableButtons(); sendApproval(false); container.innerHTML += '<div style="margin-top:8px; color:#f44336; font-size:12px;">Rejected</div>'; };
            return container;
        }
    
        function sendApproval(approved) {
            if (!ws || ws.readyState !== WebSocket.OPEN) return;
            ws.send(JSON.stringify({ type: 'approve', approved: approved }));
        }
    
        function ensureWebSocketConnected() {
            if (ws && ws.readyState === WebSocket.OPEN) return Promise.resolve();
            return new Promise((resolve, reject) => {
                const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                ws = new WebSocket(`${protocol}//${window.location.host}/ws/claude`);
                ws.onopen = () => { console.log('[Claude] WebSocket opened'); };
                ws.onmessage = (event) => {
                    const msg = JSON.parse(event.data);
                    handleWebSocketMessage(msg);
                    if (msg.type === 'connected') resolve();
                };
                ws.onerror = (error) => { isStreaming = false; reject(error); };
                ws.onclose = () => { isStreaming = false; currentAiMessage = null; };
            });
        }
    
        function handleWebSocketMessage(msg) {
            switch (msg.type) {
                case 'connected':
                    break;
                case 'start':
                    isStreaming = true;
                    currentAiMessage = addMessage('ai', '', true);
                    currentAiMessage.innerHTML = '<span class="thinking-indicator">Thinking<span class="dots">...</span></span>';
                    currentAiMessage.classList.add('thinking');
                    break;
                case 'tool_use':
                    if (currentAiMessage && currentAiMessage.classList.contains('thinking')) {
                        currentAiMessage.innerHTML = '';
                        currentAiMessage.classList.remove('thinking');
                    }
                    const approvalUI = createApprovalUI(msg.toolName, msg.toolInput);
                    chatMessages.appendChild(approvalUI);
                    chatMessages.scrollTop = chatMessages.scrollHeight;
                    if (currentMode === 'auto') {
                        setTimeout(() => {
                            const btn = approvalUI.querySelector('.approve');
                            if (btn && !btn.disabled) btn.click();
                        }, 500);
                    }
                    break;
                case 'text':
                    if (msg.content) {
                        if (currentAiMessage && currentAiMessage.classList.contains('thinking')) {
                            currentAiMessage.innerHTML = '';
                            currentAiMessage.classList.remove('thinking');
                        }
                        appendStreamText(msg.content);
                    }
                    break;
                case 'done':
                    isStreaming = false;
                    if (msg.sessionId) activeSessionId = msg.sessionId;
                    break;
                case 'error':
                    isStreaming = false;
                    if (currentAiMessage) currentAiMessage.innerHTML += `<br><span style="color: #f44;">Error: ${msg.content}</span>`;
                    else addMessage('ai', `Error: ${msg.content}`);
                    break;
                case 'permission_denied':
                     if (currentAiMessage) currentAiMessage.innerHTML += `<br><span style="color: #f44;">Permission Denied</span>`;
                    break;
                case 'exit':
                    isStreaming = false;
                    currentAiMessage = null;
                    if (msg.conversationId) activeSessionId = msg.conversationId;
                    if (activeProject) loadSessions(activeProject);
                    break;
            }
        }
    
        function appendStreamText(text) {
            if (!currentAiMessage) currentAiMessage = addMessage('ai', '', true);
            const htmlText = text.replace(/\n/g, '<br>');
            currentAiMessage.innerHTML += htmlText;
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
    
        async function sendMessage() {
            const text = input.value.trim();
            if (!text) return;
            if (!activeProject) { alert('Please select or create a project first.'); return; }
            input.value = '';
            addMessage('user', text);
            currentAiMessage = null;
            try {
                await ensureWebSocketConnected();
                ws.send(JSON.stringify({
                    type: 'message',
                    text: text,
                    path: activeProject,
                    resumeSessionId: activeSessionId || undefined,
                    mode: currentMode,
                    model: modelSelector?.value
                }));
            } catch (e) {
                addMessage('ai', `Connection error: ${e.message || 'Failed to connect'}`);
            }
        }
    
        input.onkeydown = (e) => { if (e.key === 'Enter') sendMessage(); };
        sendBtn.onclick = sendMessage;
        initModeSelector();
    
        async function loadProjects() {
            try {
                const projects = await window.api.getClaudeProjects();
                renderProjects(projects);
                if (!activeProject && projects.length > 0) selectProject(projects[0]);
            } catch (e) { console.error('Failed to load projects:', e); }
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
                    e.preventDefault(); e.stopPropagation();
                    const confirmed = await showConfirm({
                        title: 'Remove Project',
                        content: `Remove project "${path}"?`,
                        confirmText: 'Remove',
                        type: 'danger'
                    });
                    if (confirmed) window.api.removeClaudeProject(path).then(loadProjects);
                };
                projectsContainer.appendChild(icon);
            });
    
            const addBtn = document.createElement('div');
            addBtn.className = 'project-icon';
            addBtn.title = 'Add Project';
            addBtn.innerHTML = '<i class="ph ph-plus"></i>';
            addBtn.onclick = () => {
                const picker = windowManager.open('Finder', 'ph-folder-notch');
                setTimeout(() => {
                    const toolbar = picker.querySelector('.finder-toolbar');
                    if (toolbar && !toolbar.querySelector('.finder-select-btn')) {
                        const selectBtn = document.createElement('button');
                        selectBtn.className = 'finder-select-btn';
                        selectBtn.innerHTML = '<i class="ph ph-folder-open"></i> Select Project Folder';
                        selectBtn.onclick = async () => {
                            const currentPath = picker.querySelector('.finder-path').textContent;
                            try {
                                await window.api.addClaudeProject(currentPath);
                                loadProjects();
                                picker.querySelector('.close').click();
                            } catch (e) { alert(e.message); }
                        };
                        toolbar.appendChild(selectBtn);
                    }
                }, 100);
            };
            projectsContainer.appendChild(addBtn);
        }
    
        async function loadSessions(projectPath) {
            chatList.innerHTML = '<div style="padding:10px; opacity:0.5">Loading sessions...</div>';
            try {
                const sessions = await window.api.getClaudeSessions(projectPath);
                chatList.innerHTML = '';
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
                    if (!chatMessages.querySelector('.msg')) chatMessages.innerHTML = '<div style="text-align:center; padding: 20px; color: var(--text-muted);">Start a new conversation</div>';
                    return;
                }
    
                sessions.forEach(session => {
                    const item = document.createElement('div');
                    item.className = 'chat-list-item' + (activeSessionId === session.id ? ' active' : '');
                    const preview = session.preview || 'Session';
                    const dateStr = formatDate(session.modified || session.created);
                    const msgCount = session.messageCount || 0;
                    item.innerHTML = `<div class="session-preview" style="font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${preview}</div><div class="session-meta" style="font-size:10px; opacity:0.6; display:flex; gap:8px;"><span>${msgCount} msgs</span><span>${dateStr}</span>${session.gitBranch ? `<span><i class="ph ph-git-branch"></i> ${session.gitBranch}</span>` : ''}</div>`;
                    item.onclick = () => selectSession(session.id, projectPath);
                    chatList.appendChild(item);
                });
            } catch (e) {
                console.error('Failed to load sessions:', e);
                chatList.innerHTML = '<div style="padding:10px; opacity:0.5">Could not load sessions</div>';
            }
        }
    
        async function selectSession(sessionId, projectPath) {
            activeSessionId = sessionId;
            windowEl.dataset.session = sessionId; // Expose state
            window.dispatchEvent(new Event('save-window-state'));
            
            chatList.querySelectorAll('.chat-list-item').forEach(item => item.classList.remove('active'));
            const selectedItem = [...chatList.querySelectorAll('.chat-list-item')].find(item => item.textContent.includes(sessionId) || item.onclick?.toString().includes(sessionId));
            if (selectedItem) selectedItem.classList.add('active');
            chatMessages.innerHTML = '<div style="text-align:center; padding: 20px; color: var(--text-muted);">Loading session...</div>';
            try {
                const messages = await window.api.getClaudeSession(sessionId, projectPath);
                chatMessages.innerHTML = '';
                if (messages.length === 0) { chatMessages.innerHTML = '<div style="text-align:center; padding: 20px; color: var(--text-muted);">No messages in this session</div>'; return; }
                messages.forEach(msg => { addMessage(msg.role === 'user' ? 'user' : 'ai', msg.content); });
                const resumeBtn = document.createElement('div');
                resumeBtn.style.cssText = 'text-align:center; padding: 15px;';
                resumeBtn.innerHTML = `<button style="background: var(--accent-color); color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer;"><i class="ph ph-play"></i> Resume Session</button>`;
                resumeBtn.querySelector('button').onclick = () => resumeSession(sessionId, projectPath);
                chatMessages.appendChild(resumeBtn);
            } catch (e) { console.error(e); chatMessages.innerHTML = '<div style="text-align:center; padding: 20px; color: #ff5f56;">Failed to load session</div>'; }
        }
    
        function startNewSession() {
            activeSessionId = null;
            delete windowEl.dataset.session; // Clear session state
            window.dispatchEvent(new Event('save-window-state'));
            
            chatMessages.innerHTML = '<div style="text-align:center; padding: 20px; color: var(--text-muted);">Start a new conversation</div>';
            chatList.querySelectorAll('.chat-list-item').forEach(item => item.classList.remove('active'));
            chatList.querySelector('.chat-list-item').classList.add('active');
            if (ws && ws.readyState !== WebSocket.CLOSED) ws.close();
            isStreaming = false; currentAiMessage = null;
        }
    
        function resumeSession(sessionId, projectPath) {
            activeSessionId = sessionId;
            const resumeContainer = chatMessages.querySelector('div:last-child');
            if (resumeContainer && resumeContainer.querySelector('button')) resumeContainer.remove();
            ensureWebSocketConnected();
        }
    
        async function loadModels() {
            try {
                const models = await window.api.getClaudeModels();
                modelSelector.innerHTML = '';
                models.forEach(m => {
                    const opt = document.createElement('option');
                    opt.value = m.id; opt.textContent = m.name;
                    modelSelector.appendChild(opt);
                });
            } catch (e) { console.error(e); }
        }
    
        async function selectProject(path) {
            activeProject = path; activeSessionId = null;
            windowEl.dataset.project = path; // Expose state
            delete windowEl.dataset.session;
            window.dispatchEvent(new Event('save-window-state'));

            if (ws && ws.readyState !== WebSocket.CLOSED) ws.close();
            isStreaming = false; currentAiMessage = null;
            renderProjects(await window.api.getClaudeProjects());
            loadSessions(path);
            windowEl.querySelector('.chat-title').textContent = path.split('/').pop();
        }
    
        const closeBtn = windowEl.querySelector('.close');
        if (closeBtn) {
            const originalOnclick = closeBtn.onclick;
            closeBtn.onclick = (e) => {
                if (ws && ws.readyState !== WebSocket.CLOSED) ws.close();
                if (originalOnclick) originalOnclick(e);
            };
        }
        loadProjects();
        loadModels();
        
        // Expose for WindowManager restore
        windowEl.claudeOpenProject = selectProject;
        windowEl.claudeOpenSession = selectSession;
    }
};
