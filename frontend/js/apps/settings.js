import { DesignSystem } from '../core/designSystem.js';
import { windowManager } from '../core/windowManager.js';

export const SettingsApp = {
    name: 'Settings',
    content: `
        <div class="app-layout settings-layout">
            <div class="sidebar">
                <div class="sidebar-item active" data-section="system"><i class="ph ph-desktop-tower"></i> System</div>
                <div class="sidebar-item" data-section="design"><i class="ph ph-palette"></i> Design</div>
                <div class="sidebar-item" data-section="user"><i class="ph ph-user"></i> User</div>
            </div>
            <div class="main-content">
                <!-- System Section -->
                <div class="settings-section active" data-section="system">
                    <h3>System</h3>
                    <div class="setting-group">
                        <label>Hostname</label>
                        <input type="text" value="webtop-local" class="setting-input" data-setting="hostname">
                    </div>
                    <div class="setting-group">
                        <label>Version</label>
                        <span class="setting-value" id="system-version">Loading...</span>
                    </div>
                    <div class="setting-group">
                        <label>Repository</label>
                        <span class="setting-value" id="system-repository">-</span>
                    </div>

                    <h3 style="margin-top: 30px;">Software Update</h3>
                    <div class="update-panel" id="update-panel">
                        <div class="update-info">
                            <div class="update-version-row">
                                <span class="update-label">Current Version:</span>
                                <span class="update-current-version" id="update-current">-</span>
                            </div>
                            <div class="update-version-row" id="update-remote-row" style="display: none;">
                                <span class="update-label">Available Version:</span>
                                <span class="update-remote-version" id="update-remote">-</span>
                            </div>
                            <div class="update-last-check" id="update-last-check">Never checked</div>
                        </div>
                        <div class="update-status-container">
                            <span class="update-status" id="update-status">Not checked</span>
                        </div>
                        <div class="update-actions">
                            <button class="setting-btn" id="btn-check-update">
                                <i class="ph ph-arrows-clockwise"></i> Check for Updates
                            </button>
                            <button class="setting-btn primary" id="btn-install-update" style="display: none;">
                                <i class="ph ph-download"></i> Install Update
                            </button>
                        </div>
                    </div>

                    <div class="setting-group" style="margin-top: 20px;">
                        <label>Show Hidden Files</label>
                        <div class="toggle-switch" data-setting="showHiddenFiles"></div>
                    </div>
                </div>
                <!-- Design Section -->
                <div class="settings-section" data-section="design">
                    <h3>Design</h3>
                    <div class="setting-group" style="display: block;">
                        <label style="margin-bottom: 10px; display: block;">Wallpaper</label>
                        <div class="wallpaper-grid" id="wallpaper-grid" style="display: flex; flex-wrap: wrap; gap: 15px; align-items: start;">
                            <div style="padding:10px; color:#888;">Loading wallpapers...</div>
                        </div>
                    </div>
                    <div class="setting-group">
                        <label>Theme</label>
                        <select class="setting-select" data-setting="theme">
                            <option value="dark">Dark</option>
                            <option value="light">Light</option>
                        </select>
                    </div>
                    <div class="setting-group">
                        <label>Accent Color</label>
                        <div class="color-options" data-setting="accentColor">
                            <div class="color-option" style="background:#007acc;" data-color="#007acc" title="Blue"></div>
                            <div class="color-option" style="background:#0dbc79;" data-color="#0dbc79" title="Green"></div>
                            <div class="color-option" style="background:#bc3fbc;" data-color="#bc3fbc" title="Purple"></div>
                            <div class="color-option" style="background:#f5a623;" data-color="#f5a623" title="Orange"></div>
                            <div class="color-option" style="background:#cd3131;" data-color="#cd3131" title="Red"></div>
                        </div>
                    </div>
                    <div class="setting-group">
                        <label>Font Size</label>
                        <select class="setting-select" data-setting="fontSize">
                            <option value="small">Small</option>
                            <option value="medium">Medium</option>
                            <option value="large">Large</option>
                        </select>
                    </div>
                </div>
                <!-- User Section -->
                <div class="settings-section" data-section="user">
                    <h3>Account</h3>

                    <!-- Username -->
                    <div class="setting-group">
                        <label>Username</label>
                        <div class="setting-row-right">
                            <span class="setting-value" id="current-username">-</span>
                            <button class="setting-btn" id="btn-open-username-modal">Change</button>
                        </div>
                    </div>

                    <!-- Password -->
                    <div class="setting-group">
                        <label>Password</label>
                        <div class="setting-row-right">
                            <span class="setting-value">••••••••</span>
                            <button class="setting-btn" id="btn-open-password-modal">Change</button>
                        </div>
                    </div>

                    <!-- 2FA -->
                    <div class="setting-group">
                        <label>Two-Factor Authentication</label>
                        <div class="setting-row-right" id="totp-row">
                            <span class="setting-value totp-status-text">Loading...</span>
                            <button class="setting-btn" id="btn-open-totp-modal">Setup</button>
                        </div>
                    </div>

                    <h3 style="margin-top: 30px;">Preferences</h3>
                    <div class="setting-group">
                        <label>Language</label>
                        <select class="setting-select" data-setting="language">
                            <option value="de">Deutsch</option>
                            <option value="en">English</option>
                            <option value="es">Español</option>
                            <option value="fr">Français</option>
                        </select>
                    </div>
                    <div class="setting-group">
                        <label>Timezone</label>
                        <select class="setting-select" data-setting="timezone">
                            <option value="Europe/Berlin">Europe/Berlin</option>
                            <option value="Europe/London">Europe/London</option>
                            <option value="America/New_York">America/New_York</option>
                            <option value="America/Los_Angeles">America/Los_Angeles</option>
                            <option value="Asia/Tokyo">Asia/Tokyo</option>
                            <option value="UTC">UTC</option>
                        </select>
                    </div>
                    <div class="setting-group">
                        <label>Manual Time</label>
                        <input type="time" class="setting-input setting-time" data-setting="manualTime">
                    </div>
                    <div class="setting-group">
                        <label>Use Manual Time</label>
                        <div class="toggle-switch" data-setting="useManualTime"></div>
                    </div>

                    <!-- Logout -->
                    <div class="setting-group" style="margin-top: 30px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.1);">
                        <button class="setting-btn danger" id="btn-logout">
                            <i class="ph ph-sign-out"></i> Logout
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `,

    init(windowEl) {
        windowEl.style.width = '800px';
        windowEl.style.height = '600px';

        const sidebar = windowEl.querySelector('.settings-layout .sidebar');
        const mainContent = windowEl.querySelector('.settings-layout .main-content');
        if (!sidebar || !mainContent) return;

        // Sidebar navigation
        const sidebarItems = sidebar.querySelectorAll('.sidebar-item');
        const sections = mainContent.querySelectorAll('.settings-section');

        sidebarItems.forEach(item => {
            item.addEventListener('click', () => {
                const sectionName = item.dataset.section;
                sidebarItems.forEach(i => i.classList.remove('active'));
                item.classList.add('active');
                sections.forEach(s => {
                    s.classList.toggle('active', s.dataset.section === sectionName);
                });

                if (sectionName === 'design') {
                    this.loadWallpapers(windowEl);
                }
                if (sectionName === 'user') {
                    this.loadUserData(windowEl);
                    this.loadTOTPStatus(windowEl);
                }
            });
        });

        this.loadSettingsToUI(windowEl);
        this.setupEventListeners(windowEl);
        this.setupAccountHandlers(windowEl);
        this.loadSystemInfo(windowEl);
        this.loadUpdateStatus(windowEl);
        this.setupUpdateHandlers(windowEl);
    },

    async loadSystemInfo(windowEl) {
        try {
            const info = await window.api.getSystemInfo();
            const versionEl = windowEl.querySelector('#system-version');
            const repoEl = windowEl.querySelector('#system-repository');
            const currentEl = windowEl.querySelector('#update-current');

            if (versionEl) versionEl.textContent = `WebTop ${info.version}`;
            if (repoEl) repoEl.textContent = `${info.docker.repository}:${info.docker.tag}`;
            if (currentEl) currentEl.textContent = info.version;
        } catch (e) {
            console.error('Failed to load system info:', e);
        }
    },

    async loadUpdateStatus(windowEl) {
        try {
            const status = await window.api.getUpdateStatus();
            this.lastUpdateStatus = status;
            this.updateStatusUI(windowEl, status);
        } catch (e) {
            console.error('Failed to load update status:', e);
        }
    },

    updateStatusUI(windowEl, status) {
        // Store for modal access
        this.lastUpdateStatus = status;

        const statusEl = windowEl.querySelector('#update-status');
        const currentEl = windowEl.querySelector('#update-current');
        const remoteEl = windowEl.querySelector('#update-remote');
        const remoteRow = windowEl.querySelector('#update-remote-row');
        const lastCheckEl = windowEl.querySelector('#update-last-check');
        const checkBtn = windowEl.querySelector('#btn-check-update');
        const installBtn = windowEl.querySelector('#btn-install-update');

        if (currentEl) currentEl.textContent = status.currentVersion;

        if (status.isChecking) {
            statusEl.textContent = 'Checking...';
            statusEl.className = 'update-status checking';
            checkBtn.disabled = true;
            checkBtn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Checking...';
        } else if (status.isUpdating) {
            statusEl.textContent = 'Installing update...';
            statusEl.className = 'update-status updating';
            checkBtn.disabled = true;
            installBtn.disabled = true;
            installBtn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Installing...';
        } else if (status.hasUpdate) {
            statusEl.textContent = 'Update available!';
            statusEl.className = 'update-status available';
            remoteRow.style.display = 'flex';
            remoteEl.textContent = status.remoteVersion;
            checkBtn.disabled = false;
            checkBtn.innerHTML = '<i class="ph ph-arrows-clockwise"></i> Check for Updates';
            installBtn.style.display = 'inline-flex';
            installBtn.disabled = false;
            installBtn.innerHTML = '<i class="ph ph-download"></i> Install Update';
        } else if (status.updateError) {
            statusEl.textContent = `Error: ${status.updateError}`;
            statusEl.className = 'update-status error';
            checkBtn.disabled = false;
            checkBtn.innerHTML = '<i class="ph ph-arrows-clockwise"></i> Check for Updates';
            installBtn.style.display = 'none';
        } else if (status.lastCheck) {
            statusEl.textContent = 'Up to date';
            statusEl.className = 'update-status uptodate';
            remoteRow.style.display = 'none';
            checkBtn.disabled = false;
            checkBtn.innerHTML = '<i class="ph ph-arrows-clockwise"></i> Check for Updates';
            installBtn.style.display = 'none';
        } else {
            statusEl.textContent = 'Not checked';
            statusEl.className = 'update-status';
            checkBtn.disabled = false;
            checkBtn.innerHTML = '<i class="ph ph-arrows-clockwise"></i> Check for Updates';
            installBtn.style.display = 'none';
        }

        if (status.lastCheck) {
            const date = new Date(status.lastCheck);
            lastCheckEl.textContent = `Last checked: ${date.toLocaleString()}`;
        }
    },

    setupUpdateHandlers(windowEl) {
        const checkBtn = windowEl.querySelector('#btn-check-update');
        const installBtn = windowEl.querySelector('#btn-install-update');

        if (checkBtn) {
            checkBtn.addEventListener('click', async () => {
                checkBtn.disabled = true;
                checkBtn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Checking...';

                try {
                    const status = await window.api.checkForUpdates();
                    this.updateStatusUI(windowEl, status);
                } catch (e) {
                    console.error('Update check failed:', e);
                    const statusEl = windowEl.querySelector('#update-status');
                    statusEl.textContent = 'Check failed';
                    statusEl.className = 'update-status error';
                    checkBtn.disabled = false;
                    checkBtn.innerHTML = '<i class="ph ph-arrows-clockwise"></i> Check for Updates';
                }
            });
        }

        if (installBtn) {
            installBtn.addEventListener('click', () => {
                this.openUpdateConfirmModal(windowEl);
            });
        }
    },

    openUpdateConfirmModal(windowEl) {
        const status = this.lastUpdateStatus || {};
        const { overlay, closeModal } = this.createModal('Install Update', `
            <div class="modal-form">
                <div class="update-confirm-info">
                    <div class="update-confirm-row">
                        <span class="update-confirm-label">Current Version:</span>
                        <span class="update-confirm-value">${status.currentVersion || '-'}</span>
                    </div>
                    <div class="update-confirm-row">
                        <span class="update-confirm-label">New Version:</span>
                        <span class="update-confirm-value new-version">${status.remoteVersion || '-'}</span>
                    </div>
                </div>
                <p class="update-confirm-warning">
                    <i class="ph ph-warning"></i>
                    WebTop will restart and be unavailable during the update. Do not power off this device.
                </p>
                <div class="modal-message" id="modal-update-msg"></div>
                <div class="modal-actions">
                    <button class="setting-btn secondary modal-cancel">Cancel</button>
                    <button class="setting-btn primary" id="modal-confirm-update">
                        <i class="ph ph-download"></i> Install Now
                    </button>
                </div>
            </div>
        `, windowEl);

        overlay.querySelector('.modal-cancel').addEventListener('click', closeModal);

        overlay.querySelector('#modal-confirm-update').addEventListener('click', async () => {
            const btn = overlay.querySelector('#modal-confirm-update');
            const msg = overlay.querySelector('#modal-update-msg');

            btn.disabled = true;
            btn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Installing...';

            try {
                const result = await window.api.installUpdate();
                if (result.success) {
                    closeModal();
                    this.showUpdateScreen();
                } else {
                    msg.textContent = result.message;
                    msg.className = 'modal-message error';
                    btn.disabled = false;
                    btn.innerHTML = '<i class="ph ph-download"></i> Install Now';
                }
            } catch (e) {
                console.error('Update install failed:', e);
                msg.textContent = e.message;
                msg.className = 'modal-message error';
                btn.disabled = false;
                btn.innerHTML = '<i class="ph ph-download"></i> Install Now';
            }
        });
    },

    showUpdateScreen() {
        // Create fullscreen update overlay
        const overlay = document.createElement('div');
        overlay.id = 'update-overlay';
        overlay.className = 'update-overlay';
        overlay.innerHTML = `
            <div class="update-screen">
                <div class="update-icon">
                    <i class="ph ph-arrows-clockwise ph-spin"></i>
                </div>
                <h1>Updating WebTop</h1>
                <p class="update-message">Please wait while the update is being installed.</p>
                <div class="update-progress">
                    <div class="update-progress-bar"></div>
                </div>
                <p class="update-warning">
                    <i class="ph ph-warning"></i>
                    Do not restart or power off this device during the update.
                </p>
                <p class="update-submessage">WebTop will automatically restart when the update is complete.</p>
            </div>
        `;
        document.body.appendChild(overlay);

        // Start polling for server availability
        this.pollForRestart();
    },

    async pollForRestart() {
        const maxAttempts = 60; // 5 minutes
        let attempts = 0;

        const checkServer = async () => {
            attempts++;
            try {
                const res = await fetch('/api/v1/system/health', {
                    method: 'GET',
                    cache: 'no-store'
                });
                if (res.ok) {
                    // Server is back up, reload the page
                    window.location.reload();
                    return;
                }
            } catch (e) {
                // Server not ready yet
            }

            if (attempts < maxAttempts) {
                setTimeout(checkServer, 5000);
            } else {
                // Give up and show message
                const overlay = document.querySelector('#update-overlay');
                if (overlay) {
                    overlay.querySelector('.update-message').textContent =
                        'Update is taking longer than expected. Please refresh the page manually.';
                    overlay.querySelector('.update-progress').style.display = 'none';
                }
            }
        };

        // Wait a bit before starting to poll
        setTimeout(checkServer, 10000);
    },

    loadSettingsToUI(windowEl) {
        // Text inputs
        windowEl.querySelectorAll('.setting-input[data-setting]').forEach(input => {
            const key = input.dataset.setting;
            if (key && DesignSystem.settings[key] !== undefined) {
                input.value = DesignSystem.get(key);
            }
        });
    
        // Selects
        windowEl.querySelectorAll('.setting-select[data-setting]').forEach(select => {
            const key = select.dataset.setting;
            if (key && DesignSystem.settings[key] !== undefined) {
                select.value = DesignSystem.get(key);
            }
        });
    
        // Toggle switches
        windowEl.querySelectorAll('.toggle-switch[data-setting]').forEach(toggle => {
            const key = toggle.dataset.setting;
            if (key && DesignSystem.settings[key] !== undefined) {
                toggle.classList.toggle('checked', DesignSystem.get(key));
            }
        });
    
        // Color options
        const accentColor = DesignSystem.get('accentColor');
        windowEl.querySelectorAll('.color-option').forEach(option => {
            option.classList.toggle('active', option.dataset.color === accentColor);
        });
    },

    setupEventListeners(windowEl) {
        // Text input handlers
        windowEl.querySelectorAll('.setting-input[data-setting]').forEach(input => {
            input.addEventListener('change', () => {
                DesignSystem.set(input.dataset.setting, input.value);
            });
        });
    
        // Select handlers
        windowEl.querySelectorAll('.setting-select[data-setting]').forEach(select => {
            select.addEventListener('change', () => {
                DesignSystem.set(select.dataset.setting, select.value);
            });
        });
    
        // Toggle switch handlers
        windowEl.querySelectorAll('.toggle-switch[data-setting]').forEach(toggle => {
            toggle.addEventListener('click', () => {
                const isChecked = !toggle.classList.contains('checked');
                toggle.classList.toggle('checked', isChecked);
                DesignSystem.set(toggle.dataset.setting, isChecked);
            });
        });

        // Color option handlers
        const colorOptions = windowEl.querySelectorAll('.color-option');
        colorOptions.forEach(option => {
            option.addEventListener('click', () => {
                colorOptions.forEach(o => o.classList.remove('active'));
                option.classList.add('active');
                DesignSystem.set('accentColor', option.dataset.color);
            });
        });
    },

    async loadWallpapers(windowEl) {
        const grid = windowEl.querySelector('#wallpaper-grid');
        if (!grid) return;

        // Only load once to save bandwidth
        if (grid.dataset.loaded === 'true') return;

        try {
            const wallpapers = await window.api.getWallpapers();
            grid.innerHTML = '';

            wallpapers.forEach(url => {
                const el = document.createElement('div');
                el.className = 'wallpaper-option';
                el.style.cssText = `
                    background-image: url('${url}');
                    background-size: cover;
                    background-position: center;
                    width: 120px;
                    height: 75px;
                    border-radius: 6px;
                    cursor: pointer;
                    border: 2px solid transparent;
                    transition: all 0.2s;
                    box-shadow: 0 2px 5px rgba(0,0,0,0.2);
                `;
                el.title = url.split('/').pop();

                // Add hover effect via JS since we use inline styles
                el.onmouseenter = () => el.style.transform = 'scale(1.05)';
                el.onmouseleave = () => el.style.transform = 'scale(1)';

                el.onclick = () => {
                    // Dispatch wallpaper change (Desktop will listen)
                    window.dispatchEvent(new CustomEvent('set-wallpaper', { detail: { url } }));
                    grid.querySelectorAll('.wallpaper-option').forEach(o => {
                        o.style.borderColor = 'transparent';
                        o.classList.remove('active');
                    });
                    el.classList.add('active');
                    el.style.borderColor = 'var(--accent-color)';
                };

                // Mark active if matches current
                const current = localStorage.getItem('desktopWallpaper');
                if (current === url) {
                    el.classList.add('active');
                    el.style.borderColor = 'var(--accent-color)';
                }

                grid.appendChild(el);
            });

            grid.dataset.loaded = 'true';
        } catch (e) {
            console.error(e);
            grid.innerHTML = '<div style="color:red; font-size:12px;">Failed to load wallpapers</div>';
        }
    },

    async loadUserData(windowEl) {
        try {
            const res = await fetch('/api/v1/auth/session', { credentials: 'same-origin' });
            const data = await res.json();
            if (data.authenticated && data.user) {
                const usernameEl = windowEl.querySelector('#current-username');
                if (usernameEl) {
                    usernameEl.textContent = data.user.username;
                }
                this.currentUsername = data.user.username;
            }
        } catch (e) {
            console.error('Failed to load user data:', e);
        }
    },

    async loadTOTPStatus(windowEl) {
        const row = windowEl.querySelector('#totp-row');
        if (!row) return;

        const statusText = row.querySelector('.totp-status-text');
        const btn = row.querySelector('#btn-open-totp-modal');

        try {
            const res = await fetch('/api/v1/auth/totp/status', { credentials: 'same-origin' });
            const data = await res.json();

            this.totpEnabled = data.enabled;

            if (data.enabled) {
                statusText.textContent = 'Enabled';
                statusText.classList.add('enabled');
                btn.textContent = 'Disable';
                btn.classList.add('danger');
            } else {
                statusText.textContent = 'Not enabled';
                statusText.classList.remove('enabled');
                btn.textContent = 'Setup';
                btn.classList.remove('danger');
            }
        } catch (e) {
            console.error('Failed to load TOTP status:', e);
            statusText.textContent = 'Error';
        }
    },

    setupAccountHandlers(windowEl) {
        // Username modal
        const usernameBtn = windowEl.querySelector('#btn-open-username-modal');
        if (usernameBtn) {
            usernameBtn.addEventListener('click', () => this.openUsernameModal(windowEl));
        }

        // Password modal
        const passwordBtn = windowEl.querySelector('#btn-open-password-modal');
        if (passwordBtn) {
            passwordBtn.addEventListener('click', () => this.openPasswordModal(windowEl));
        }

        // TOTP modal
        const totpBtn = windowEl.querySelector('#btn-open-totp-modal');
        if (totpBtn) {
            totpBtn.addEventListener('click', () => this.openTOTPModal(windowEl));
        }

        // Logout
        const logoutBtn = windowEl.querySelector('#btn-logout');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async () => {
                logoutBtn.disabled = true;
                logoutBtn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Logging out...';
                try {
                    await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'same-origin' });
                    window.location.href = '/login';
                } catch (e) {
                    logoutBtn.disabled = false;
                    logoutBtn.innerHTML = '<i class="ph ph-sign-out"></i> Logout';
                }
            });
        }
    },

    createModal(title, content, windowEl) {
        const overlay = document.createElement('div');
        overlay.className = 'settings-modal-overlay';
        overlay.innerHTML = `
            <div class="settings-modal">
                <div class="settings-modal-header">
                    <span>${title}</span>
                    <button class="settings-modal-close"><i class="ph ph-x"></i></button>
                </div>
                <div class="settings-modal-content">${content}</div>
            </div>
        `;

        const closeModal = () => overlay.remove();
        overlay.querySelector('.settings-modal-close').addEventListener('click', closeModal);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeModal();
        });

        windowEl.querySelector('.window-content').appendChild(overlay);
        return { overlay, closeModal };
    },

    openUsernameModal(windowEl) {
        const { overlay, closeModal } = this.createModal('Change Username', `
            <div class="modal-form">
                <label>New Username</label>
                <input type="text" id="modal-new-username" class="setting-input" value="${this.currentUsername || ''}" placeholder="Enter new username">
                <div class="modal-message" id="modal-username-msg"></div>
                <div class="modal-actions">
                    <button class="setting-btn secondary modal-cancel">Cancel</button>
                    <button class="setting-btn primary" id="modal-save-username">Save</button>
                </div>
            </div>
        `, windowEl);

        overlay.querySelector('.modal-cancel').addEventListener('click', closeModal);
        overlay.querySelector('#modal-new-username').focus();

        overlay.querySelector('#modal-save-username').addEventListener('click', async () => {
            const input = overlay.querySelector('#modal-new-username');
            const msg = overlay.querySelector('#modal-username-msg');
            const btn = overlay.querySelector('#modal-save-username');
            const newUsername = input.value.trim();

            if (newUsername.length < 3) {
                msg.textContent = 'Username must be at least 3 characters';
                msg.className = 'modal-message error';
                return;
            }

            btn.disabled = true;
            btn.innerHTML = '<i class="ph ph-spinner ph-spin"></i>';

            try {
                const res = await fetch('/api/v1/auth/username', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: newUsername }),
                    credentials: 'same-origin'
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Failed');

                this.currentUsername = newUsername;
                windowEl.querySelector('#current-username').textContent = newUsername;
                closeModal();
            } catch (e) {
                msg.textContent = e.message;
                msg.className = 'modal-message error';
                btn.disabled = false;
                btn.textContent = 'Save';
            }
        });
    },

    openPasswordModal(windowEl) {
        const { overlay, closeModal } = this.createModal('Change Password', `
            <div class="modal-form">
                <label>Current Password</label>
                <input type="password" id="modal-current-pw" class="setting-input" placeholder="Enter current password">
                <label>New Password</label>
                <input type="password" id="modal-new-pw" class="setting-input" placeholder="Enter new password (min 6 chars)">
                <label>Confirm Password</label>
                <input type="password" id="modal-confirm-pw" class="setting-input" placeholder="Confirm new password">
                <div class="modal-message" id="modal-pw-msg"></div>
                <div class="modal-actions">
                    <button class="setting-btn secondary modal-cancel">Cancel</button>
                    <button class="setting-btn primary" id="modal-save-pw">Change Password</button>
                </div>
            </div>
        `, windowEl);

        overlay.querySelector('.modal-cancel').addEventListener('click', closeModal);
        overlay.querySelector('#modal-current-pw').focus();

        overlay.querySelector('#modal-save-pw').addEventListener('click', async () => {
            const currentPw = overlay.querySelector('#modal-current-pw').value;
            const newPw = overlay.querySelector('#modal-new-pw').value;
            const confirmPw = overlay.querySelector('#modal-confirm-pw').value;
            const msg = overlay.querySelector('#modal-pw-msg');
            const btn = overlay.querySelector('#modal-save-pw');

            if (!currentPw || !newPw || !confirmPw) {
                msg.textContent = 'Please fill in all fields';
                msg.className = 'modal-message error';
                return;
            }
            if (newPw.length < 6) {
                msg.textContent = 'New password must be at least 6 characters';
                msg.className = 'modal-message error';
                return;
            }
            if (newPw !== confirmPw) {
                msg.textContent = 'Passwords do not match';
                msg.className = 'modal-message error';
                return;
            }

            btn.disabled = true;
            btn.innerHTML = '<i class="ph ph-spinner ph-spin"></i>';

            try {
                const res = await fetch('/api/v1/auth/password', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
                    credentials: 'same-origin'
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Failed');
                closeModal();
            } catch (e) {
                msg.textContent = e.message;
                msg.className = 'modal-message error';
                btn.disabled = false;
                btn.textContent = 'Change Password';
            }
        });
    },

    openTOTPModal(windowEl) {
        if (this.totpEnabled) {
            this.openTOTPDisableModal(windowEl);
        } else {
            this.openTOTPSetupModal(windowEl);
        }
    },

    async openTOTPSetupModal(windowEl) {
        const { overlay, closeModal } = this.createModal('Setup Two-Factor Authentication', `
            <div class="modal-form totp-setup-modal">
                <div class="totp-loading-state"><i class="ph ph-spinner ph-spin"></i> Generating...</div>
            </div>
        `, windowEl);

        try {
            const res = await fetch('/api/v1/auth/totp/setup', { method: 'POST', credentials: 'same-origin' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed');

            overlay.querySelector('.modal-form').innerHTML = `
                <p class="totp-instruction">Scan this QR code with your authenticator app:</p>
                <div class="qr-container">
                    <img src="https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(data.qrUri)}" alt="QR Code">
                </div>
                <p class="totp-secret">Or enter manually: <code>${data.secret}</code></p>
                <label>Verification Code</label>
                <input type="text" id="modal-totp-code" class="setting-input totp-code-input" placeholder="000000" maxlength="6" inputmode="numeric">
                <div class="modal-message" id="modal-totp-msg"></div>
                <div class="modal-actions">
                    <button class="setting-btn secondary modal-cancel">Cancel</button>
                    <button class="setting-btn primary" id="modal-verify-totp">Verify & Enable</button>
                </div>
            `;

            overlay.querySelector('.modal-cancel').addEventListener('click', closeModal);
            overlay.querySelector('#modal-totp-code').focus();

            const verify = async () => {
                const code = overlay.querySelector('#modal-totp-code').value.trim();
                const msg = overlay.querySelector('#modal-totp-msg');
                const btn = overlay.querySelector('#modal-verify-totp');

                if (code.length !== 6) {
                    msg.textContent = 'Please enter a 6-digit code';
                    msg.className = 'modal-message error';
                    return;
                }

                btn.disabled = true;
                btn.innerHTML = '<i class="ph ph-spinner ph-spin"></i>';

                try {
                    const res = await fetch('/api/v1/auth/totp/verify', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ code }),
                        credentials: 'same-origin'
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error || 'Invalid code');

                    this.loadTOTPStatus(windowEl);
                    closeModal();
                } catch (e) {
                    msg.textContent = e.message;
                    msg.className = 'modal-message error';
                    btn.disabled = false;
                    btn.textContent = 'Verify & Enable';
                }
            };

            overlay.querySelector('#modal-verify-totp').addEventListener('click', verify);
            overlay.querySelector('#modal-totp-code').addEventListener('keypress', (e) => {
                if (e.key === 'Enter') verify();
            });
        } catch (e) {
            overlay.querySelector('.modal-form').innerHTML = `
                <div class="modal-message error">${e.message}</div>
                <div class="modal-actions">
                    <button class="setting-btn secondary modal-cancel">Close</button>
                </div>
            `;
            overlay.querySelector('.modal-cancel').addEventListener('click', closeModal);
        }
    },

    openTOTPDisableModal(windowEl) {
        const { overlay, closeModal } = this.createModal('Disable Two-Factor Authentication', `
            <div class="modal-form">
                <p class="totp-warning"><i class="ph ph-warning"></i> This will remove 2FA protection from your account.</p>
                <label>Enter your password to confirm</label>
                <input type="password" id="modal-disable-pw" class="setting-input" placeholder="Password">
                <div class="modal-message" id="modal-disable-msg"></div>
                <div class="modal-actions">
                    <button class="setting-btn secondary modal-cancel">Cancel</button>
                    <button class="setting-btn danger" id="modal-disable-totp">Disable 2FA</button>
                </div>
            </div>
        `, windowEl);

        overlay.querySelector('.modal-cancel').addEventListener('click', closeModal);
        overlay.querySelector('#modal-disable-pw').focus();

        overlay.querySelector('#modal-disable-totp').addEventListener('click', async () => {
            const password = overlay.querySelector('#modal-disable-pw').value;
            const msg = overlay.querySelector('#modal-disable-msg');
            const btn = overlay.querySelector('#modal-disable-totp');

            if (!password) {
                msg.textContent = 'Please enter your password';
                msg.className = 'modal-message error';
                return;
            }

            btn.disabled = true;
            btn.innerHTML = '<i class="ph ph-spinner ph-spin"></i>';

            try {
                const res = await fetch('/api/v1/auth/totp', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password }),
                    credentials: 'same-origin'
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Failed');

                this.loadTOTPStatus(windowEl);
                closeModal();
            } catch (e) {
                msg.textContent = e.message;
                msg.className = 'modal-message error';
                btn.disabled = false;
                btn.textContent = 'Disable 2FA';
            }
        });
    }
};
