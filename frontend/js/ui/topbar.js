import { DesignSystem } from '../core/designSystem.js';
import { windowManager } from '../core/windowManager.js';

export const TopBar = {
    init() {
        this.initClock();
        this.initActions();
        this.initImmersiveTriggers();
    },

    initClock() {
        const dateEl = document.querySelector('.clock .date');
        const timeEl = document.querySelector('.clock .time');

        const update = () => {
            dateEl.textContent = DesignSystem.getFormattedDate();
            timeEl.textContent = DesignSystem.getFormattedTime();
        };

        // Make update globally accessible for DesignSystem (legacy support)
        window.updateClock = update;

        update();
        setInterval(update, 1000);
    },

    initActions() {
        document.getElementById('user-btn').addEventListener('click', () => {
            const settingsWin = windowManager.open('Settings', 'ph-gear');
            setTimeout(() => {
                const userTab = settingsWin.querySelector('.sidebar-item[data-section="user"]');
                if (userTab) userTab.click();
            }, 100);
        });
    
        document.getElementById('logout-btn').addEventListener('click', async () => {
            try {
                await window.api.logout();
                window.location.href = '/login';
            } catch (e) {
                console.error('Logout failed:', e);
                window.location.href = '/login';
            }
        });
    },

    initImmersiveTriggers() {
        const topTrigger = document.querySelector('.edge-trigger-top');
        const bottomTrigger = document.querySelector('.edge-trigger-bottom');
        const topBar = document.querySelector('.top-bar-container');
        const dock = document.querySelector('.dock-container');
        
        function show(el) { el.classList.add('reveal'); }
        function hide(el) { el.classList.remove('reveal'); }
        
        if (topTrigger) {
            topTrigger.addEventListener('mouseenter', () => show(topBar));
            topBar.addEventListener('mouseleave', () => hide(topBar));
        }
        if (bottomTrigger) {
            bottomTrigger.addEventListener('mouseenter', () => show(dock));
            dock.addEventListener('mouseleave', () => hide(dock));
        }
    }
};
