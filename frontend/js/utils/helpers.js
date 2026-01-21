// Utilities

export function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

// System Modal Helper (Custom HTML)
export function showModal({ title, content, placeholder = '', confirmText = 'OK' }) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        
        overlay.innerHTML = `
            <div class="modal-window">
                <div class="modal-header">
                    <i class="ph ph-app-window"></i> ${title}
                </div>
                <div class="modal-content">
                    <label class="modal-label">${content}</label>
                    <input type="text" class="modal-input" value="${placeholder}" spellcheck="false">
                </div>
                <div class="modal-actions">
                    <button class="modal-btn cancel">Cancel</button>
                    <button class="modal-btn primary">${confirmText}</button>
                </div>
            </div>
        `;

        const input = overlay.querySelector('input');
        const cancelBtn = overlay.querySelector('.cancel');
        const primaryBtn = overlay.querySelector('.primary');

        function close(value) {
            overlay.style.opacity = '0';
            setTimeout(() => overlay.remove(), 200);
            resolve(value);
        }

        cancelBtn.onclick = () => close(null);
        
        primaryBtn.onclick = () => {
            const val = input.value.trim();
            if (val) close(val);
        };

        input.onkeydown = (e) => {
            if (e.key === 'Enter') primaryBtn.click();
            if (e.key === 'Escape') cancelBtn.click();
        };

        document.body.appendChild(overlay);
        // Add animation class
        setTimeout(() => overlay.style.opacity = '1', 10);
        input.focus();
        input.select();
    });
}

// System Confirm Helper (Custom HTML)
export function showConfirm({ title, content, confirmText = 'OK', type = 'info' }) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        
        const iconClass = type === 'danger' ? 'ph-warning' : 'ph-app-window';
        
        overlay.innerHTML = `
            <div class="modal-window">
                <div class="modal-header">
                    <i class="ph ${iconClass}"></i> ${title}
                </div>
                <div class="modal-content">
                    <label class="modal-label" style="margin-bottom: 0;">${content}</label>
                </div>
                <div class="modal-actions">
                    <button class="modal-btn cancel">Cancel</button>
                    <button class="modal-btn primary ${type === 'danger' ? 'danger' : ''}">${confirmText}</button>
                </div>
            </div>
        `;

        const cancelBtn = overlay.querySelector('.cancel');
        const primaryBtn = overlay.querySelector('.primary');

        function close(value) {
            overlay.style.opacity = '0';
            setTimeout(() => overlay.remove(), 200);
            resolve(value);
        }

        cancelBtn.onclick = () => close(false);
        primaryBtn.onclick = () => close(true);
        
        // Focus primary button for Enter key support
        setTimeout(() => primaryBtn.focus(), 50);
        setTimeout(() => overlay.style.opacity = '1', 10);
        
        // Handle Escape
        overlay.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') close(false);
        });

        document.body.appendChild(overlay);
    });
}
