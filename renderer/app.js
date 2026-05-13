/* ═══════════════════════════════════════════════
   MSG Viewer — Renderer Process
   All UI logic, state, and IPC communication
═══════════════════════════════════════════════ */

'use strict'

// ── State ──────────────────────────────────────
const state = {
  emails: [],          // All parsed emails
  filtered: [],        // After search/category filter
  selected: null,      // Currently viewed email
  category: 'all',
  searchQuery: '',
  favorites: new Set(JSON.parse(localStorage.getItem('favorites') || '[]'))
}

// ── Avatar colors cycling ──────────────────────
const AV_COLORS = ['av-blue','av-green','av-orange','av-purple','av-red','av-teal','av-pink','av-indigo']
function avatarColor(str) {
  let h = 0
  for (const c of (str || 'X')) h = (h * 31 + c.charCodeAt(0)) & 0xFFFFFFFF
  return AV_COLORS[Math.abs(h) % AV_COLORS.length]
}
function initials(name) {
  return name.trim().split(/\s+/).slice(0,2).map(w => w[0] || '').join('').toUpperCase() || '?'
}

// ── File icons ─────────────────────────────────
function attIconSVG(ext, mime) {
  const e = (ext || '').toLowerCase()
  const m = (mime || '').toLowerCase()
  if (e === 'pdf' || m.includes('pdf')) return { svg: pdfIcon(), bg: '#FFF0EE' }
  if (['png','jpg','jpeg','gif','webp','heic','bmp','tiff'].includes(e) || m.includes('image')) return { svg: imgIcon(), bg: '#EEF6FF' }
  if (['doc','docx'].includes(e) || m.includes('word')) return { svg: docIcon('#2B5EE8'), bg: '#EEF0FF' }
  if (['xls','xlsx'].includes(e) || m.includes('excel') || m.includes('spreadsheet')) return { svg: docIcon('#1D7B4F'), bg: '#EDFAF3' }
  if (['zip','rar','7z','gz','tar'].includes(e)) return { svg: archIcon(), bg: '#FFF8EE' }
  if (['mp4','mov','avi','mkv','webm'].includes(e) || m.includes('video')) return { svg: videoIcon(), bg: '#F5EEFF' }
  if (['mp3','m4a','wav','aac','flac'].includes(e) || m.includes('audio')) return { svg: audioIcon(), bg: '#FFF0F5' }
  return { svg: fileIcon(), bg: '#F5F5F5' }
}

function pdfIcon() { return `<svg width="17" height="17" fill="none" stroke="#E8443A" stroke-width="1.8" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/></svg>` }
function imgIcon() { return `<svg width="17" height="17" fill="none" stroke="#007AFF" stroke-width="1.8" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>` }
function docIcon(c) { return `<svg width="17" height="17" fill="none" stroke="${c}" stroke-width="1.8" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/><line x1="9" y1="9" x2="12" y2="9"/></svg>` }
function archIcon() { return `<svg width="17" height="17" fill="none" stroke="#FF9500" stroke-width="1.8" viewBox="0 0 24 24"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>` }
function videoIcon() { return `<svg width="17" height="17" fill="none" stroke="#AF52DE" stroke-width="1.8" viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" rx="2"/><polygon points="10 8 16 12 10 16 10 8"/></svg>` }
function audioIcon() { return `<svg width="17" height="17" fill="none" stroke="#FF2D55" stroke-width="1.8" viewBox="0 0 24 24"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>` }
function fileIcon() { return `<svg width="17" height="17" fill="none" stroke="#888" stroke-width="1.8" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>` }

// ── Format date ────────────────────────────────
function fmtDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d)) return ''
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today - 86400000)
  const dDay = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  if (dDay.getTime() === today.getTime()) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (dDay.getTime() === yesterday.getTime()) return 'Ontem'
  return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })
}
function fmtDateFull(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d)) return ''
  return d.toLocaleString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// ── Escape HTML ────────────────────────────────
function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

// ── Load & parse a .msg file ───────────────────
async function loadMsgFile(filePath) {
  setSbText(`Carregando ${filePath.split('/').pop()}…`)

  // Show loading in email list
  const listEl = document.getElementById('email-items')
  listEl.innerHTML = `<div class="loading"><div class="spinner"></div><span>Lendo arquivo…</span></div>`

  const result = await window.api.parseMsg(filePath)

  if (!result.ok) {
    listEl.innerHTML = `<div class="error-state"><div class="err-icon">⚠️</div><div class="err-title">Erro ao abrir arquivo</div><div class="err-msg">${esc(result.error)}</div></div>`
    setSbText('Erro ao carregar arquivo')
    toast(`Erro: ${result.error}`)
    return
  }

  // Add to list (avoid duplicates by path)
  const existing = state.emails.findIndex(e => e.filePath === result.filePath)
  if (existing >= 0) {
    state.emails[existing] = result
  } else {
    state.emails.unshift(result)
  }

  // Save to recents
  await window.api.addRecent(result.filePath, result.subject, result.from)

  applyFilter()
  updateBadges()
  setSbText(`${state.filtered.length} mensagem${state.filtered.length !== 1 ? 's' : ''}`)

  // Auto-select the just-opened email
  selectEmail(result)
}

// ── Filtering ──────────────────────────────────
function applyFilter() {
  const q = state.searchQuery.toLowerCase()
  let list = [...state.emails]

  if (state.category === 'attachments') {
    list = list.filter(e => e.attachments && e.attachments.length > 0)
  } else if (state.category === 'favorites') {
    list = list.filter(e => state.favorites.has(e.filePath))
  }

  if (q) {
    list = list.filter(e =>
      (e.subject || '').toLowerCase().includes(q) ||
      (e.from || '').toLowerCase().includes(q) ||
      (e.to || '').toLowerCase().includes(q) ||
      (e.bodyText || '').toLowerCase().includes(q)
    )
  }

  state.filtered = list
  renderEmailList()
}

function updateBadges() {
  document.getElementById('badge-all').textContent = state.emails.length
  document.getElementById('badge-att').textContent = state.emails.filter(e => e.attachments?.length > 0).length
}

// ── Render email list ──────────────────────────
function renderEmailList() {
  const container = document.getElementById('email-items')
  const header = document.getElementById('list-header')
  const { filtered, selected } = state

  header.textContent = `${filtered.length} mensagem${filtered.length !== 1 ? 's' : ''}`

  if (filtered.length === 0) {
    container.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:160px;gap:8px;color:var(--text-3);font-size:12px;">
      <svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
      <span>Nenhum resultado</span>
    </div>`
    return
  }

  container.innerHTML = filtered.map(email => {
    const isSel = selected && selected.filePath === email.filePath
    const isFav = state.favorites.has(email.filePath)
    const hasAtt = email.attachments && email.attachments.length > 0
    const preview = (email.bodyText || '').replace(/\s+/g, ' ').trim().slice(0, 100)
    const avColor = avatarColor(email.from)

    return `<div class="email-item${isSel ? ' selected' : ''}" onclick="selectEmail(${JSON.stringify(email).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026')})">
      <div class="ei-row">
        <span class="ei-from">${esc(email.from || '(Remetente desconhecido)')}</span>
        <span class="ei-time">${fmtDate(email.date)}</span>
      </div>
      <div class="ei-subject">${esc(email.subject)}</div>
      <div class="ei-preview">${esc(preview)}</div>
      ${(hasAtt || isFav) ? `<div class="ei-badges">
        ${hasAtt ? `<span class="ei-badge">
          <svg width="9" height="9" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
          ${email.attachments.length} ${email.attachments.length === 1 ? 'anexo' : 'anexos'}
        </span>` : ''}
        ${isFav ? `<span class="ei-badge" style="color:#FF9500;">★ Favorito</span>` : ''}
      </div>` : ''}
    </div>`
  }).join('')
}

// ── Select and display an email ────────────────
function selectEmail(email) {
  state.selected = email
  renderEmailList() // re-render to update selection highlight

  const stage = document.getElementById('main-stage')
  document.getElementById('drop-zone').style.display = 'none'
  const viewEl = document.getElementById('email-view')
  viewEl.style.display = 'flex'
  viewEl.style.flexDirection = 'column'

  const avColor = avatarColor(email.from)
  const isFav = state.favorites.has(email.filePath)

  // Build header
  let headerHTML = `
    <div class="ev-header">
      <div class="ev-subject">${esc(email.subject)}</div>
      <div class="ev-meta">
        <div class="avatar ${avColor}">${esc(initials(email.from))}</div>
        <div class="ev-meta-info">
          <div class="ev-from">${esc(email.from)} <span class="ev-from-email">&lt;${esc(email.fromEmail)}&gt;</span></div>
          <div class="ev-to">Para: ${esc(email.to)}</div>
          ${email.cc ? `<div class="ev-to">CC: ${esc(email.cc)}</div>` : ''}
        </div>
        <div class="ev-time-col">
          <div class="ev-time">${fmtDateFull(email.date)}</div>
          <span class="ev-finder-btn" onclick="doShowInFinder()">Mostrar no Finder</span>
          <span class="ev-finder-btn" onclick="toggleFavorite('${email.filePath.replace(/'/g,"\\'")}')">
            ${isFav ? '★ Remover Favorito' : '☆ Adicionar Favorito'}
          </span>
        </div>
      </div>
    </div>`

  // Build attachments section
  let attHTML = ''
  if (email.attachments && email.attachments.length > 0) {
    const rows = email.attachments.map((att, idx) => {
      const { svg, bg } = attIconSVG(att.filename.split('.').pop(), att.mimeType)
      return `<div class="att-row">
        <div class="att-file-icon" style="background:${bg}">${svg}</div>
        <div>
          <div class="att-name">${esc(att.filename)}</div>
          <div class="att-size">${att.sizeStr} · ${att.mimeType || 'arquivo'}</div>
        </div>
        <div class="att-spacer"></div>
        <button class="att-dl-btn" onclick="downloadAtt('${email.filePath.replace(/'/g,"\\'")}', ${idx}, '${att.filename.replace(/'/g,"\\'")}')">
          <svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Baixar
        </button>
      </div>`
    }).join('')

    attHTML = `<div class="ev-attachments">
      <div class="ev-att-label">
        <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
        Anexos (${email.attachments.length})
      </div>
      <div class="att-list">${rows}</div>
    </div>`
  }

  // Build body
  let bodyHTML = ''
  if (email.bodyHTML) {
    // Render HTML body in a sandboxed iframe
    const safeHTML = email.bodyHTML
    bodyHTML = `<div class="ev-body-wrap" style="flex:1;overflow:hidden;">
      <iframe class="ev-body-iframe" id="email-iframe" sandbox="allow-same-origin" style="width:100%;height:100%;border:none;background:white;"></iframe>
    </div>`
  } else {
    bodyHTML = `<div class="ev-body-wrap"><div class="ev-body-text">${esc(email.bodyText)}</div></div>`
  }

  viewEl.innerHTML = headerHTML + attHTML + bodyHTML

  // Inject HTML into iframe after render
  if (email.bodyHTML) {
    const iframe = document.getElementById('email-iframe')
    if (iframe) {
      iframe.onload = () => {}
      const doc = iframe.contentDocument || iframe.contentWindow.document
      doc.open()
      doc.write(`<!DOCTYPE html><html><head>
        <meta charset="UTF-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 14px; line-height: 1.6; color: #1a1a1a; padding: 20px 24px 40px; margin: 0; }
          img { max-width: 100%; height: auto; }
          a { color: #007AFF; }
          table { max-width: 100%; }
          * { box-sizing: border-box; }
        </style>
      </head><body>${email.bodyHTML}</body></html>`)
      doc.close()
    }
  }
}

// ── Toolbar actions ────────────────────────────
function triggerOpen() {
  window.api.openFileDialog()
}

function onFileInput(event) {
  // Fallback for drag-from-OS (not used in Electron, but kept for safety)
  const file = event.target.files[0]
  if (file) loadMsgFile(file.path)
}

async function doDownloadAll() {
  if (!state.selected) { toast('Selecione uma mensagem primeiro'); return }
  if (!state.selected.attachments || state.selected.attachments.length === 0) {
    toast('Esta mensagem não tem anexos'); return
  }
  setSbText('Baixando todos os anexos…')
  const result = await window.api.saveAllAttachments(state.selected.filePath)
  if (result.ok) {
    toast(`${result.count} anexo${result.count !== 1 ? 's' : ''} salvo${result.count !== 1 ? 's' : ''} em Downloads`)
    setSbText('Download concluído')
  } else {
    toast(`Erro: ${result.error}`)
    setSbText('Erro no download')
  }
}

async function downloadAtt(filePath, index, name) {
  setSbText(`Baixando ${name}…`)
  const result = await window.api.saveAttachment(filePath, index, name)
  if (result.ok) {
    toast(`"${name}" salvo em Downloads`)
    setSbText('Download concluído')
  } else {
    toast(`Erro: ${result.error}`)
    setSbText('Erro no download')
  }
}

function doShowInFinder() {
  if (!state.selected) { toast('Selecione uma mensagem primeiro'); return }
  window.api.showInFinder(state.selected.filePath)
}

function doPrint() {
  if (!state.selected) { toast('Selecione uma mensagem primeiro'); return }
  window.api.printEmail()
}

// ── Favorites ──────────────────────────────────
function toggleFavorite(filePath) {
  if (state.favorites.has(filePath)) {
    state.favorites.delete(filePath)
    toast('Removido dos Favoritos')
  } else {
    state.favorites.add(filePath)
    toast('Adicionado aos Favoritos')
  }
  localStorage.setItem('favorites', JSON.stringify([...state.favorites]))
  applyFilter()
  if (state.selected) selectEmail(state.selected) // refresh view
}

// ── Category ───────────────────────────────────
function setCategory(cat, el) {
  document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'))
  el.classList.add('active')
  state.category = cat
  applyFilter()
  setSbText(`${state.filtered.length} mensagem${state.filtered.length !== 1 ? 's' : ''}`)
}

// ── Search ─────────────────────────────────────
function onSearch(q) {
  state.searchQuery = q
  applyFilter()
}

// ── Recent modal ───────────────────────────────
async function openRecent() {
  const list = await window.api.getRecent()
  const body = document.getElementById('modal-body')

  if (list.length === 0) {
    body.innerHTML = `<div class="modal-empty">Nenhum arquivo recente.<br>Abra um .MSG para começar.</div>`
  } else {
    body.innerHTML = list.map(f => {
      const name = f.path.split('/').pop()
      const date = new Date(f.openedAt).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
      return `<div class="recent-item" onclick="openRecentFile('${f.path.replace(/'/g,"\\'")}')">
        <div class="ri-icon">
          <svg width="16" height="16" fill="none" stroke="#007AFF" stroke-width="1.8" viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="2,7 12,13 22,7"/></svg>
        </div>
        <div class="ri-spacer">
          <div class="ri-name">${esc(name)}</div>
          <div class="ri-sub">${esc(f.subject || '')} · ${date}</div>
        </div>
        <div class="ri-open">Abrir</div>
      </div>`
    }).join('')
  }

  document.getElementById('overlay').classList.add('open')
}

function openRecentFile(filePath) {
  closeRecent()
  loadMsgFile(filePath)
}

function closeRecent() {
  document.getElementById('overlay').classList.remove('open')
}

function onOverlayClick(e) {
  if (e.target === document.getElementById('overlay')) closeRecent()
}

// ── Status bar ─────────────────────────────────
function setSbText(text) {
  document.getElementById('sb-text').textContent = text
}

// ── Toast ──────────────────────────────────────
let toastTimer = null
function toast(msg) {
  const el = document.getElementById('toast')
  el.textContent = msg
  el.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => el.classList.remove('show'), 2800)
}

// ── Drag & Drop on drop-zone ───────────────────
const dropCard = document.getElementById('drop-card')
const dropZoneEl = document.getElementById('drop-zone')

dropZoneEl.addEventListener('dragover', e => {
  e.preventDefault()
  dropCard.classList.add('drag-over')
})
dropZoneEl.addEventListener('dragleave', e => {
  if (!dropZoneEl.contains(e.relatedTarget)) dropCard.classList.remove('drag-over')
})
dropZoneEl.addEventListener('drop', e => {
  e.preventDefault()
  dropCard.classList.remove('drag-over')
  const file = e.dataTransfer.files[0]
  if (!file) return
  if (!file.name.toLowerCase().endsWith('.msg')) {
    toast('Formato não suportado. Use um arquivo .MSG do Outlook.')
    return
  }
  if (file.size > 45 * 1024 * 1024) {
    toast('Arquivo muito grande. Limite máximo: 45MB')
    return
  }
  loadMsgFile(file.path)
})

// Global drag-over (so you can drop anywhere in the window)
document.addEventListener('dragover', e => e.preventDefault())
document.addEventListener('drop', e => {
  e.preventDefault()
  const file = e.dataTransfer.files[0]
  if (file && file.name.toLowerCase().endsWith('.msg')) {
    if (file.size > 45 * 1024 * 1024) { toast('Arquivo muito grande. Limite: 45MB'); return }
    loadMsgFile(file.path)
  }
})

// ── Listen for files opened from main process ──
window.api.onOpenFile(filePath => {
  loadMsgFile(filePath)
})

// ── Keyboard shortcuts ─────────────────────────
document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'o') { e.preventDefault(); triggerOpen() }
  if ((e.metaKey || e.ctrlKey) && e.key === 'f') { e.preventDefault(); document.getElementById('tb-search').focus() }
  if (e.key === 'Escape') { closeRecent(); document.getElementById('tb-search').blur() }
  if (e.key === 'ArrowDown' && state.filtered.length > 0) {
    const idx = state.filtered.findIndex(em => state.selected && em.filePath === state.selected.filePath)
    const next = state.filtered[idx + 1]
    if (next) selectEmail(next)
  }
  if (e.key === 'ArrowUp' && state.filtered.length > 0) {
    const idx = state.filtered.findIndex(em => state.selected && em.filePath === state.selected.filePath)
    const prev = state.filtered[idx - 1]
    if (prev) selectEmail(prev)
  }
})

// ── Init ───────────────────────────────────────
setSbText('Pronto · Abra um arquivo .MSG para começar')
