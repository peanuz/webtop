// Global File System Helpers

// Protected folders that cannot be trashed
export const PROTECTED_FOLDERS = ['Desktop', 'Documents', 'Downloads', 'Pictures', 'Projects', 'Trash'];

export function isProtectedPath(path) {
    return PROTECTED_FOLDERS.includes(path);
}

// Global File System Refresh Registry
export const fsObservers = new Set();

export function registerObserver(callback) {
    fsObservers.add(callback);
}

export function refreshFileSystem(path) {
    fsObservers.forEach(callback => callback(path));
}

export async function moveToTrash(item) {
    if (isProtectedPath(item.path)) {
        console.warn('Cannot trash protected folder:', item.path);
        return;
    }
    const parentDir = item.path.split('/').slice(0, -1).join('/') || 'Desktop';
    try {
        await window.api.trashItem(item.path);
        refreshFileSystem(parentDir);
        refreshFileSystem('Trash');
    } catch (err) {
        console.error('Move to trash failed:', err);
    }
}

export async function moveToFolder(item, folderPath) {
    const parentDir = item.path.split('/').slice(0, -1).join('/') || 'Desktop';
    try {
        await window.api.moveItem(item.path, `${folderPath}/${item.name}`);
        refreshFileSystem(parentDir);
        refreshFileSystem(folderPath);
    } catch (err) {
        console.error('Move to folder failed:', err);
    }
}

export async function moveToPath(item, targetPath) {
    const parentDir = item.path.split('/').slice(0, -1).join('/') || 'Desktop';
    if (parentDir === targetPath) return; 
    try {
        await window.api.moveItem(item.path, `${targetPath}/${item.name}`);
        refreshFileSystem(parentDir);
        refreshFileSystem(targetPath);
    } catch (err) {
        console.error('Move to path failed:', err);
    }
}

export async function moveToDesktop(item) {
    const parentDir = item.path.split('/').slice(0, -1).join('/') || 'Desktop';
    if (parentDir === 'Desktop') return;
    try {
        await window.api.moveItem(item.path, `Desktop/${item.name}`);
        refreshFileSystem(parentDir);
        refreshFileSystem('Desktop');
    } catch (err) {
        console.error('Move to desktop failed:', err);
    }
}

export async function getItems(path) {
    try {
        const result = await window.api.listDir(path);
        return result.items.map(item => ({
            name: item.name,
            type: item.isDirectory ? 'folder' : 'file',
            path: item.path,
            size: item.size,
            mimeType: item.mimeType
        }));
    } catch (err) {
        console.error('Failed to list directory:', err);
        return [];
    }
}
