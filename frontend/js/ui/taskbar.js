import { windowManager } from '../core/windowManager.js';
import { ContextMenu } from './contextMenu.js';

export const Taskbar = {
    init() {
        const dockItems = document.querySelectorAll('.dock-item');
        dockItems.forEach(item => {
            // Click Handler
            item.addEventListener('click', () => {
                // Parse args from onclick string in HTML (legacy support) or data-attributes
                // But better: Use data-app attribute or extract from tooltip
                const tooltip = item.querySelector('.tooltip').textContent;
                // Mapping tooltip to App Name and Icon
                const iconClass = item.querySelector('i').className.split(' ').find(c => c.startsWith('ph-'));
                
                windowManager.open(tooltip, iconClass);
            });

            // Context Menu
            item.addEventListener('contextmenu', (e) => {
                e.preventDefault(); e.stopPropagation();
                const appName = item.querySelector('.tooltip').textContent;
                const iconClass = item.querySelector('i').className.split(' ').find(c => c.startsWith('ph-'));
                ContextMenu.show(e.clientX, e.clientY, 'dock', { name: appName, icon: iconClass });
            });
        });

        // Listen for Window events to update Dock indicators
        windowManager.registerObserver((appName, action, windowEl) => {
            this.updateIndicators(appName);
        });
    },

    updateIndicators(appName) {
        const dockItems = document.querySelectorAll('.dock-item');
        dockItems.forEach(item => {
            const tooltip = item.querySelector('.tooltip').textContent;
            if (tooltip === appName) {
                const windows = document.querySelectorAll(`.window[data-app="${appName}"]`);
                if (windows.length > 0) item.classList.add('is-open');
                else item.classList.remove('is-open');
            }
        });
    }
};
