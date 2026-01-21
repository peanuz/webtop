// Drag and Drop Utilities

export function makeDraggable(element, handle) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    
    handle.onmousedown = dragMouseDown;

    function dragMouseDown(e) {
        e.preventDefault();
        // Get mouse position at startup
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
        
        // Bring to front
        bringToFront(element);
    }

    function elementDrag(e) {
        e.preventDefault();
        // Calculate new cursor position
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        
        // Set element's new position
        element.style.top = (element.offsetTop - pos2) + "px";
        element.style.left = (element.offsetLeft - pos1) + "px";
    }

    function closeDragElement() {
        document.onmouseup = null;
        document.onmousemove = null;
    }
}

export function makeResizable(element, handle) {
    handle.addEventListener('mousedown', initResize, false);

    function initResize(e) {
        e.stopPropagation();
        window.addEventListener('mousemove', resize, false);
        window.addEventListener('mouseup', stopResize, false);
        bringToFront(element);
    }

    function resize(e) {
        element.style.width = (e.clientX - element.offsetLeft) + 'px';
        element.style.height = (e.clientY - element.offsetTop) + 'px';
    }

    function stopResize() {
        window.removeEventListener('mousemove', resize, false);
        window.removeEventListener('mouseup', stopResize, false);
    }
}

// Z-Index Management (Simple global state for now)
let zIndexCounter = 100;

export function bringToFront(element) {
    zIndexCounter++;
    element.style.zIndex = zIndexCounter;
    
    // Remove active class from all others
    document.querySelectorAll('.window').forEach(w => w.classList.remove('active'));
    element.classList.add('active');
}
