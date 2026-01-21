// Design System with Persistence
export const DesignSystem = {
    defaults: {
        theme: 'dark',
        accentColor: '#007acc',
        fontSize: 'medium',
        hostname: 'webtop-local',
        showHiddenFiles: false,
        username: 'admin',
        language: 'en',
        timezone: 'Europe/Berlin',
        manualTime: '',
        useManualTime: false
    },

    settings: {},

    async init() {
        try {
            const saved = await window.api.getSettings();
            if (saved && Object.keys(saved).length > 0) {
                this.settings = { ...this.defaults };
                for (const [key, val] of Object.entries(saved)) {
                    if (key in this.defaults) {
                        const defaultType = typeof this.defaults[key];
                        if (defaultType === 'boolean') {
                            this.settings[key] = val === 'true';
                        } else if (defaultType === 'number') {
                            this.settings[key] = Number(val);
                        } else {
                            this.settings[key] = val;
                        }
                    }
                }
            } else {
                this.settings = { ...this.defaults };
                await this.save();
            }
        } catch (e) {
            console.error('Failed to load settings:', e);
            this.settings = { ...this.defaults };
        }
        this.apply();
    },

    get(key) {
        return this.settings[key] ?? this.defaults[key];
    },

    async set(key, value) {
        this.settings[key] = value;
        await this.save();
        this.apply();
    },

    async save() {
        try {
            await window.api.updateSettings(this.settings);
        } catch (e) {
            console.error('Failed to save settings:', e);
        }
    },

    apply() {
        const root = document.documentElement;

        // Theme
        root.setAttribute('data-theme', this.settings.theme);

        // Accent Color
        root.style.setProperty('--accent-color', this.settings.accentColor);
        root.style.setProperty('--accent-hover', this.lightenColor(this.settings.accentColor, 20));
        
        // Calculate contrast text color
        const rgb = this.hexToRgb(this.settings.accentColor);
        const brightness = Math.round(((parseInt(rgb.r) * 299) + (parseInt(rgb.g) * 587) + (parseInt(rgb.b) * 114)) / 1000);
        const textColor = brightness > 125 ? '#000000' : '#ffffff';
        root.style.setProperty('--accent-text', textColor);

        // Font Size
        root.setAttribute('data-font-size', this.settings.fontSize);

        // Update clock if timezone changed
        if (window.updateClock) window.updateClock();

        window.dispatchEvent(new CustomEvent('theme-changed', { detail: { theme: this.settings.theme } }));
    },

    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    },

    lightenColor(color, percent) {
        const num = parseInt(color.replace('#', ''), 16);
        const amt = Math.round(2.55 * percent);
        const R = Math.min(255, (num >> 16) + amt);
        const G = Math.min(255, ((num >> 8) & 0x00FF) + amt);
        const B = Math.min(255, (num & 0x0000FF) + amt);
        return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
    },

    getFormattedTime() {
        if (this.settings.useManualTime && this.settings.manualTime) {
            return this.settings.manualTime;
        }
        const options = {
            timeZone: this.settings.timezone,
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        };
        return new Date().toLocaleTimeString('en-GB', options);
    },

    getFormattedDate() {
        const options = {
            timeZone: this.settings.timezone,
            weekday: 'short',
            day: 'numeric',
            month: 'short'
        };
        return new Date().toLocaleDateString(this.settings.language === 'de' ? 'de-DE' : 'en-GB', options);
    }
};
