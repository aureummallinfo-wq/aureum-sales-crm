window.AureumChatAttachmentUtils = Object.freeze({
  classify: name => { const ext = String(name || '').split('.').pop().toLowerCase(); if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return 'image'; if (ext === 'pdf') return 'pdf'; if (['xls', 'xlsx', 'csv'].includes(ext)) return 'spreadsheet'; if (['doc', 'docx', 'txt'].includes(ext)) return 'document'; return 'other'; },
  formatSize: bytes => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
});
