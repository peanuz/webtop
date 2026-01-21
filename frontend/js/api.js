// WebTop API Client

const API_BASE = '/api/v1';

// Helper function that always includes credentials
async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    credentials: 'same-origin',
  });
  return res;
}

const api = {
  // Auth
  async getSession() {
    const res = await apiFetch(`${API_BASE}/auth/session`);
    return res.json();
  },

  async logout() {
    const res = await apiFetch(`${API_BASE}/auth/logout`, { method: 'POST' });
    return res.json();
  },

  // File System
  async listDir(path = '') {
    const res = await apiFetch(`${API_BASE}/fs/list?path=${encodeURIComponent(path)}`);
    if (!res.ok) throw new Error('Failed to list directory');
    return res.json();
  },

  async readFile(path) {
    const res = await apiFetch(`${API_BASE}/fs/read?path=${encodeURIComponent(path)}`);
    if (!res.ok) throw new Error('Failed to read file');
    return res.json();
  },

  async writeFile(path, content) {
    const res = await apiFetch(`${API_BASE}/fs/write`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, content }),
    });
    if (!res.ok) throw new Error('Failed to write file');
    return res.json();
  },

  async createDir(path) {
    const res = await apiFetch(`${API_BASE}/fs/mkdir`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    });
    if (!res.ok) throw new Error('Failed to create directory');
    return res.json();
  },

  async deleteItem(path) {
    const res = await apiFetch(`${API_BASE}/fs/delete?path=${encodeURIComponent(path)}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete');
    return res.json();
  },

  async trashItem(path) {
    const res = await apiFetch(`${API_BASE}/fs/trash`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    });
    if (!res.ok) throw new Error('Failed to move to trash');
    return res.json();
  },

  async moveItem(source, destination) {
    const res = await apiFetch(`${API_BASE}/fs/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source, destination }),
    });
    if (!res.ok) throw new Error('Failed to move');
    return res.json();
  },

  async copyItem(source, destination) {
    const res = await apiFetch(`${API_BASE}/fs/copy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source, destination }),
    });
    if (!res.ok) throw new Error('Failed to copy');
    return res.json();
  },

  async getFileInfo(path) {
    const res = await apiFetch(`${API_BASE}/fs/info?path=${encodeURIComponent(path)}`);
    if (!res.ok) throw new Error('Failed to get file info');
    return res.json();
  },

  async uploadFile(file, destPath = '') {
    const formData = new FormData();
    formData.append('file', file);
    if (destPath) formData.append('path', destPath);

    const res = await apiFetch(`${API_BASE}/fs/upload`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) throw new Error('Failed to upload file');
    return res.json();
  },

  getDownloadUrl(path) {
    return `${API_BASE}/fs/download?path=${encodeURIComponent(path)}`;
  },

  // Settings
  async getSettings() {
    const res = await apiFetch(`${API_BASE}/settings`);
    if (!res.ok) throw new Error('Failed to fetch settings');
    return res.json();
  },

  async updateSettings(settings) {
    const res = await apiFetch(`${API_BASE}/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    if (!res.ok) throw new Error('Failed to update settings');
    return res.json();
  },

  // Claude Code
  async getClaudeProjects() {
    const res = await apiFetch(`${API_BASE}/claude/projects`);
    if (!res.ok) throw new Error('Failed to fetch projects');
    return res.json();
  },

  async addClaudeProject(path) {
    const res = await apiFetch(`${API_BASE}/claude/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    });
    if (!res.ok) throw new Error('Failed to add project');
    return res.json();
  },

  async removeClaudeProject(path) {
    const res = await apiFetch(`${API_BASE}/claude/projects`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    });
    if (!res.ok) throw new Error('Failed to remove project');
    return res.json();
  },

  async getClaudeChats(path) {
    const res = await apiFetch(`${API_BASE}/claude/chats?path=${encodeURIComponent(path)}`);
    if (!res.ok) throw new Error('Failed to fetch chats');
    return res.json();
  },

  // Get sessions from Claude's sessions-index.json
  async getClaudeSessions(projectPath) {
    const res = await apiFetch(`${API_BASE}/claude/sessions?project=${encodeURIComponent(projectPath)}`);
    if (!res.ok) throw new Error('Failed to fetch sessions');
    return res.json();
  },

  // Get session transcript (messages history)
  async getClaudeSession(sessionId, projectPath) {
    const res = await apiFetch(`${API_BASE}/claude/session/${sessionId}?project=${encodeURIComponent(projectPath)}`);
    if (!res.ok) throw new Error('Failed to fetch session');
    return res.json();
  },

  async getClaudeModels() {
    const res = await apiFetch(`${API_BASE}/claude/models`);
    if (!res.ok) throw new Error('Failed to fetch models');
    return res.json();
  },

  // System
  async getWallpapers() {
    const res = await apiFetch(`${API_BASE}/system/wallpapers`);
    if (!res.ok) throw new Error('Failed to fetch wallpapers');
    return res.json();
  },

  async getSystemInfo() {
    const res = await apiFetch(`${API_BASE}/system/info`);
    if (!res.ok) throw new Error('Failed to fetch system info');
    return res.json();
  },

  // Update
  async getUpdateStatus() {
    const res = await apiFetch(`${API_BASE}/system/update/status`);
    if (!res.ok) throw new Error('Failed to fetch update status');
    return res.json();
  },

  async checkForUpdates() {
    const res = await apiFetch(`${API_BASE}/system/update/check`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to check for updates');
    return res.json();
  },

  async installUpdate() {
    const res = await apiFetch(`${API_BASE}/system/update/install`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to install update');
    return res.json();
  },
};

// Make api globally available
window.api = api;
