export function formatBytes(bytes: number, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}
export function getFileName(filePath: string): string {
    if (!filePath) return '';
    // 统一路径分隔符
    const normalizedPath = filePath.replace(/\\/g, '/');
    // 拿到最后一部分
    const lastSegment = normalizedPath.split('/').pop() ?? '';
    return lastSegment;
}
