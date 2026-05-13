const { app, BrowserWindow, ipcMain, dialog, shell, Menu, nativeTheme } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')

// Keep reference to avoid GC
let mainWindow

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    vibrancy: 'sidebar',
    visualEffectState: 'active',
    backgroundColor: '#f0f0f0',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      sandbox: false
    },
    show: false
  })

  mainWindow.loadFile('renderer/index.html')

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  // Build app menu
  const template = [
    {
      label: 'MSG Viewer',
      submenu: [
        { label: 'Sobre MSG Viewer', role: 'about' },
        { type: 'separator' },
        { label: 'Fechar', accelerator: 'CmdOrCtrl+W', role: 'close' },
        { label: 'Sair', accelerator: 'CmdOrCtrl+Q', role: 'quit' }
      ]
    },
    {
      label: 'Arquivo',
      submenu: [
        {
          label: 'Abrir .MSG…',
          accelerator: 'CmdOrCtrl+O',
          click: () => openFileDialog()
        }
      ]
    },
    {
      label: 'Editar',
      submenu: [
        { label: 'Copiar', accelerator: 'CmdOrCtrl+C', role: 'copy' },
        { label: 'Selecionar Tudo', accelerator: 'CmdOrCtrl+A', role: 'selectAll' }
      ]
    },
    {
      label: 'Visualizar',
      submenu: [
        { label: 'Recarregar', accelerator: 'CmdOrCtrl+R', role: 'reload' },
        { type: 'separator' },
        { label: 'Zoom +', accelerator: 'CmdOrCtrl+Plus', role: 'zoomIn' },
        { label: 'Zoom -', accelerator: 'CmdOrCtrl+-', role: 'zoomOut' },
        { label: 'Tamanho Original', accelerator: 'CmdOrCtrl+0', role: 'resetZoom' },
        { type: 'separator' },
        { label: 'Tela Cheia', accelerator: 'Ctrl+Cmd+F', role: 'togglefullscreen' }
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// ── File open dialog ──
async function openFileDialog() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Abrir arquivo .MSG',
    filters: [{ name: 'Outlook Message', extensions: ['msg'] }],
    properties: ['openFile', 'multiSelections']
  })
  if (!result.canceled && result.filePaths.length > 0) {
    for (const filePath of result.filePaths) {
      mainWindow.webContents.send('open-file', filePath)
    }
  }
}

// ── IPC Handlers ──

// Parse .msg file
ipcMain.handle('parse-msg', async (event, filePath) => {
  try {
    const MsgReader = require('@kenjiuno/msgreader').default
    const iconv = require('iconv-lite')

    const fileBuffer = fs.readFileSync(filePath)
    const reader = new MsgReader(fileBuffer)
    const msg = reader.getFileData()

    // Decode helper
    function decodeStr(s) {
      if (!s) return ''
      if (typeof s === 'string') return s
      return iconv.decode(Buffer.from(s), 'utf-8')
    }

    // Build attachments list (metadata only, no data yet)
    const attachments = (msg.attachments || []).map((att, idx) => ({
      index: idx,
      filename: att.fileName || att.name || `anexo_${idx + 1}`,
      mimeType: att.mimeType || 'application/octet-stream',
      size: att.dataSize || 0,
      sizeStr: formatBytes(att.dataSize || 0)
    }))

    // Prefer HTML body, fallback to plain text
    const bodyHTML = msg.bodyHTML ? decodeStr(msg.bodyHTML) : null
    const bodyText = msg.body ? decodeStr(msg.body) : ''

    const stat = fs.statSync(filePath)

    return {
      ok: true,
      filePath,
      fileName: path.basename(filePath),
      subject: decodeStr(msg.subject) || '(Sem assunto)',
      from: decodeStr(msg.senderName) || decodeStr(msg.senderEmail) || '',
      fromEmail: decodeStr(msg.senderEmail) || '',
      to: (msg.recipients || []).map(r => decodeStr(r.name) || decodeStr(r.email)).join(', '),
      toEmails: (msg.recipients || []).map(r => decodeStr(r.email)).join(', '),
      cc: (msg.recipients || [])
        .filter(r => r.recipType === 2)
        .map(r => decodeStr(r.name) || decodeStr(r.email)).join(', '),
      date: msg.messageDeliveryTime || stat.mtime.toISOString(),
      bodyHTML,
      bodyText,
      attachments,
      fileSize: formatBytes(stat.size)
    }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

// Save attachment to Downloads
ipcMain.handle('save-attachment', async (event, filePath, attachmentIndex, suggestedName) => {
  try {
    const MsgReader = require('@kenjiuno/msgreader').default
    const fileBuffer = fs.readFileSync(filePath)
    const reader = new MsgReader(fileBuffer)
    const msg = reader.getFileData()
    const att = msg.attachments[attachmentIndex]

    if (!att || !att.data) {
      return { ok: false, error: 'Anexo não encontrado ou sem dados' }
    }

    const downloadsDir = app.getPath('downloads')
    const destPath = path.join(downloadsDir, suggestedName)

    // att.data is typically a Uint8Array or Buffer
    const buf = Buffer.isBuffer(att.data) ? att.data : Buffer.from(att.data)
    fs.writeFileSync(destPath, buf)

    return { ok: true, savedPath: destPath }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

// Save all attachments
ipcMain.handle('save-all-attachments', async (event, filePath) => {
  try {
    const MsgReader = require('@kenjiuno/msgreader').default
    const fileBuffer = fs.readFileSync(filePath)
    const reader = new MsgReader(fileBuffer)
    const msg = reader.getFileData()
    const downloads = app.getPath('downloads')
    let saved = 0

    for (const att of (msg.attachments || [])) {
      if (att.data) {
        const name = att.fileName || att.name || `anexo_${saved + 1}`
        const buf = Buffer.isBuffer(att.data) ? att.data : Buffer.from(att.data)
        fs.writeFileSync(path.join(downloads, name), buf)
        saved++
      }
    }
    return { ok: true, count: saved }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

// Open file in Finder
ipcMain.handle('show-in-finder', async (event, filePath) => {
  shell.showItemInFolder(filePath)
})

// Print current window
ipcMain.handle('print-email', async () => {
  mainWindow.webContents.print({ silent: false, printBackground: true })
})

// Open file dialog via IPC
ipcMain.handle('open-file-dialog', async () => {
  await openFileDialog()
})

// Recent files stored in userData
const recentPath = path.join(app.getPath('userData'), 'recent.json')

ipcMain.handle('get-recent', async () => {
  try {
    if (!fs.existsSync(recentPath)) return []
    const list = JSON.parse(fs.readFileSync(recentPath, 'utf-8'))
    // Filter out files that no longer exist
    return list.filter(f => fs.existsSync(f.path))
  } catch { return [] }
})

ipcMain.handle('add-recent', async (event, filePath, subject, from) => {
  try {
    let list = []
    if (fs.existsSync(recentPath)) {
      list = JSON.parse(fs.readFileSync(recentPath, 'utf-8'))
    }
    // Remove duplicates
    list = list.filter(f => f.path !== filePath)
    list.unshift({ path: filePath, subject, from, openedAt: new Date().toISOString() })
    list = list.slice(0, 20) // keep max 20
    fs.writeFileSync(recentPath, JSON.stringify(list, null, 2))
  } catch {}
})

// Helper
function formatBytes(bytes) {
  if (!bytes) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1_048_576).toFixed(1)} MB`
}

// ── App lifecycle ──
app.whenReady().then(() => {
  createWindow()

  // Handle file open from Finder / drag-to-dock
  app.on('open-file', (event, filePath) => {
    event.preventDefault()
    if (mainWindow) {
      mainWindow.webContents.send('open-file', filePath)
    }
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
