const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  // Parse a .msg file, returns structured data
  parseMsg: (filePath) => ipcRenderer.invoke('parse-msg', filePath),

  // Save a single attachment to Downloads
  saveAttachment: (filePath, index, name) =>
    ipcRenderer.invoke('save-attachment', filePath, index, name),

  // Save all attachments to Downloads
  saveAllAttachments: (filePath) =>
    ipcRenderer.invoke('save-all-attachments', filePath),

  // Reveal file in Finder
  showInFinder: (filePath) => ipcRenderer.invoke('show-in-finder', filePath),

  // Trigger system print dialog
  printEmail: () => ipcRenderer.invoke('print-email'),

  // Open native file picker
  openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),

  // Recent files
  getRecent: () => ipcRenderer.invoke('get-recent'),
  addRecent: (filePath, subject, from) =>
    ipcRenderer.invoke('add-recent', filePath, subject, from),

  // Listen for files opened from Finder/drag-to-dock
  onOpenFile: (callback) => {
    ipcRenderer.on('open-file', (event, filePath) => callback(filePath))
  }
})
