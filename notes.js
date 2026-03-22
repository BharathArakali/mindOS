/* ============================================================
   notes.js — Notes Module
   Separate title · Rich editor · Formatting toolbar
   Color tags (toggleable) · Download · Auto-save
   ============================================================ */

import { Storage, KEYS } from './storage.js';
import { uuid, debounce, formatDate } from './utils.js';

/* Color tag palette */
const TAG_COLORS = [
  { id:'none',   label:'None',   bg:'var(--border)',       fg:'var(--text-muted)' },
  { id:'red',    label:'Red',    bg:'#FF4D4D22',           fg:'#FF6B6B' },
  { id:'orange', label:'Orange', bg:'#FF8C0022',           fg:'#FFA94D' },
  { id:'yellow', label:'Yellow', bg:'#FFC03322',           fg:'#FFD43B' },
  { id:'green',  label:'Green',  bg:'#2ECC7122',           fg:'#51CF66' },
  { id:'blue',   label:'Blue',   bg:'#3B82F622',           fg:'#74C0FC' },
  { id:'purple', label:'Purple', bg:'#8B5CF622',           fg:'#B197FC' },
  { id:'pink',   label:'Pink',   bg:'#EC489922',           fg:'#F783AC' },
];

let _container   = null;
let _activeId    = null;
let _searchQuery = '';
let _activeColor = 'all'; // color filter state

/* ── Helpers ── */
function _getSettings() { return Storage.get(KEYS.SETTINGS, {}); }
function _colorTagsOn() { const v = _getSettings().colorTagsEnabled; return v === undefined ? true : !!v; }

/* ── Public API ── */
export function init(container) {
  _container = container;
  _render();

  // Handle actions from command palette
  const action = sessionStorage.getItem('mindos_action');
  if (action) {
    sessionStorage.removeItem('mindos_action');
    if (action === 'new_note')       setTimeout(_createNote, 100);
    if (action === 'weekly_review')  setTimeout(_createWeeklyReview, 100);
  }
}

function _createWeeklyReview() {
  const now  = new Date();
  const week = `Week of ${now.toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' })}`;
  const body = `<h2>Weekly Review — ${week}</h2>
<h3>What went well this week?</h3>
<p></p>
<h3>What was challenging?</h3>
<p></p>
<h3>Focus & productivity</h3>
<p></p>
<h3>Habits — what to start, stop, continue?</h3>
<ul><li>Start: </li><li>Stop: </li><li>Continue: </li></ul>
<h3>Goal for next week</h3>
<p></p>
<h3>Anything else?</h3>
<p></p>`;

  const note = {
    id: uuid(), title: `Weekly Review — ${week}`,
    body, tags: ['review', 'weekly'],
    color: 'blue', pinned: false,
    createdAt: now.toISOString(), updatedAt: now.toISOString(),
  };
  Storage.update(KEYS.NOTES, arr => [note, ...(Array.isArray(arr) ? arr : [])], []);
  _activeId = note.id;
  _render();
}

export function destroy() {
  _container = null;
  _activeId  = null;
}

/* ── Main render ── */
function _render() {
  if (!_container) return;
  const notes  = _getNotes();
  const active = _activeId ? notes.find(n => n.id === _activeId) : null;

  _container.innerHTML = `
    <div class="notes-wrap">
      ${_renderListPanel(notes)}
      <div class="notes-editor-panel" id="notes-editor-panel">
        ${active ? _renderEditor(active) : _renderEmpty()}
      </div>
    </div>`;

  _attachEvents();
}

/* ── List panel ── */
function _renderListPanel(notes) {
  const colorOn = _colorTagsOn();
  return `
    <div class="notes-list-panel">
      <div class="notes-list-header">
        <span class="notes-list-title">
          Notes <span class="notes-count">${notes.length}</span>
        </span>
        <button class="notes-new-btn btn-icon" id="notes-new" title="New note">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>
      </div>

      <div class="notes-search-wrap">
        <svg class="notes-search-icon" width="12" height="12" viewBox="0 0 24 24"
             fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
          <circle cx="11" cy="11" r="8"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input class="notes-search" id="notes-search" type="text"
               placeholder="Search…" value="${_escAttr(_searchQuery)}"/>
      </div>

      ${colorOn ? _renderColorFilter() : ''}

      <div class="notes-list" id="notes-list">
        ${_renderList(notes, colorOn)}
      </div>
    </div>`;
}

function _renderColorFilter() {
  return `
    <div class="notes-color-filter" id="color-filter">
      <button class="color-filter-chip active" data-color="all">All</button>
      ${TAG_COLORS.filter(c => c.id !== 'none').map(c => `
        <button class="color-filter-chip" data-color="${c.id}"
                style="--chip-color:${c.fg}">
          <span class="color-dot" style="background:${c.fg}"></span>
        </button>`).join('')}
    </div>`;
}

function _renderList(notes, colorOn) {
  const q      = _searchQuery.toLowerCase();
  const pinned = notes.filter(n => n.pinned);
  const rest   = notes.filter(n => !n.pinned);
  const sorted = [...pinned, ...rest].filter(n => {
    const matchesSearch = !q || (n.title||'').toLowerCase().includes(q)
       || (n.body||'').toLowerCase().includes(q)
       || (n.tags||[]).some(t => t.toLowerCase().includes(q));
    const matchesColor  = _activeColor === 'all'
       || (n.color || 'none') === _activeColor;
    return matchesSearch && matchesColor;
  });

  if (!sorted.length) return `<div class="notes-empty-list">
    <p>${q ? 'No matches.' : 'No notes yet — hit + to start.'}</p></div>`;

  return sorted.map(n => {
    const color = colorOn && n.color
      ? TAG_COLORS.find(c => c.id === n.color) : null;
    return `
      <div class="notes-list-item${n.id === _activeId ? ' notes-list-item--active' : ''}"
           data-id="${n.id}"
           ${color ? `style="border-left:3px solid ${color.fg}"` : ''}>
        <div class="notes-list-item__top">
          <span class="notes-list-item__title">${_esc(n.title || 'Untitled')}</span>
          ${n.pinned ? `<svg width="9" height="9" viewBox="0 0 24 24" fill="var(--accent)">
            <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/>
            </svg>` : ''}
          ${color && color.id !== 'none' ? `
            <span class="color-dot-sm" style="background:${color.fg}"></span>` : ''}
        </div>
        <div class="notes-list-item__preview">${_esc(_preview(n.body))}</div>
        ${(n.tags||[]).length ? `<div class="notes-list-item__tags">
          ${n.tags.slice(0,3).map(t=>`<span class="notes-tag">#${_esc(t)}</span>`).join('')}
        </div>` : ''}
        <div class="notes-list-item__date">${formatDate(n.updatedAt)}</div>
      </div>`;
  }).join('');
}

/* ── Editor ── */
function _renderEditor(note) {
  const colorOn = _colorTagsOn();
  const color   = colorOn && note.color
    ? TAG_COLORS.find(c => c.id === note.color) : null;

  return `
    <div class="notes-editor">

      <!-- Formatting toolbar -->
      <div class="notes-fmt-toolbar">

        <div class="fmt-group">
          <button class="fmt-btn" data-cmd="bold"      title="Bold (Ctrl+B)">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
              <path d="M6 4h8a4 4 0 0 1 0 8H6z"/>
              <path d="M6 12h9a4 4 0 0 1 0 8H6z"/>
            </svg>
          </button>
          <button class="fmt-btn" data-cmd="italic"    title="Italic (Ctrl+I)">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
              <line x1="19" y1="4" x2="10" y2="4"/>
              <line x1="14" y1="20" x2="5" y2="20"/>
              <line x1="15" y1="4" x2="9" y2="20"/>
            </svg>
          </button>
          <button class="fmt-btn" data-cmd="underline" title="Underline (Ctrl+U)">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
              <path d="M6 3v7a6 6 0 0 0 6 6 6 6 0 0 0 6-6V3"/>
              <line x1="4" y1="21" x2="20" y2="21"/>
            </svg>
          </button>
        </div>

        <div class="fmt-divider"></div>

        <div class="fmt-group">
          <button class="fmt-btn fmt-h" data-cmd="h1" title="Heading 1">H1</button>
          <button class="fmt-btn fmt-h" data-cmd="h2" title="Heading 2">H2</button>
          <button class="fmt-btn fmt-h" data-cmd="h3" title="Heading 3">H3</button>
        </div>

        <div class="fmt-divider"></div>

        <div class="fmt-group">
          <button class="fmt-btn" data-cmd="insertUnorderedList" title="Bullet list">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <line x1="9"  y1="6"  x2="20" y2="6"/>
              <line x1="9"  y1="12" x2="20" y2="12"/>
              <line x1="9"  y1="18" x2="20" y2="18"/>
              <circle cx="4" cy="6"  r="1.2" fill="currentColor" stroke="none"/>
              <circle cx="4" cy="12" r="1.2" fill="currentColor" stroke="none"/>
              <circle cx="4" cy="18" r="1.2" fill="currentColor" stroke="none"/>
            </svg>
          </button>
          <button class="fmt-btn" data-cmd="insertOrderedList" title="Numbered list">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <line x1="10" y1="6"  x2="21" y2="6"/>
              <line x1="10" y1="12" x2="21" y2="12"/>
              <line x1="10" y1="18" x2="21" y2="18"/>
              <path d="M4 6h1v4M4 10h2" stroke-width="1.8"/>
              <path d="M6 14H4c0-1 2-2 2-3s-1-1.5-2-1" stroke-width="1.8"/>
            </svg>
          </button>
        </div>

        <div class="fmt-divider"></div>

        <!-- Right side actions -->
        <div class="fmt-group fmt-group--right">
          <span class="notes-autosave-indicator" id="save-indicator"></span>

          <!-- Voice typing button -->
          <button class="fmt-btn" id="voice-btn" title="Voice typing">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="23"/>
              <line x1="8"  y1="23" x2="16" y2="23"/>
            </svg>
          </button>

          ${colorOn ? `
          <button class="fmt-btn color-tag-btn" id="color-picker-btn"
                  title="Color tag"
                  style="${color ? `color:${color.fg}` : ''}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <circle cx="13.5" cy="6.5" r="1.5" fill="currentColor" stroke="none"/>
              <circle cx="17.5" cy="10.5" r="1.5" fill="currentColor" stroke="none"/>
              <circle cx="8.5" cy="7.5" r="1.5" fill="currentColor" stroke="none"/>
              <circle cx="6.5" cy="12.5" r="1.5" fill="currentColor" stroke="none"/>
              <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746
                       1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125
                       a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554
                       C21.965 6.012 17.461 2 12 2z"/>
            </svg>
          </button>` : ''}

          <button class="fmt-btn${note.pinned ? ' fmt-active' : ''}"
                  id="pin-btn" title="${note.pinned ? 'Unpin' : 'Pin'}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M12 17v5M9 10.5L7.5 3h9L15 10.5"/>
              <path d="M5 10.5h14"/>
            </svg>
          </button>

          <button class="fmt-btn" id="download-btn" title="Download as .txt">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
          </button>

          <button class="fmt-btn notes-delete-btn" id="delete-btn" title="Delete">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14H6L5 6"/>
              <path d="M10 11v6M14 11v6M9 6V4h6v2"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- Color picker popup (hidden by default) -->
      <div class="notes-color-picker" id="color-picker-popup" style="display:none;">
        <span class="color-picker-label">Note color</span>
        <div class="color-picker-swatches">
          ${TAG_COLORS.map(c => `
            <button class="color-swatch${note.color===c.id?' active':''}"
                    data-color="${c.id}"
                    style="background:${c.bg};border-color:${c.fg}"
                    title="${c.label}">
              ${note.color===c.id ? `<svg width="10" height="10" viewBox="0 0 24 24"
                fill="none" stroke="${c.id==='none'?'var(--text-muted)':c.fg}"
                stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>` : ''}
            </button>`).join('')}
        </div>
      </div>

      <!-- Hashtag row (extracted from body) -->
      <div class="notes-tag-row" id="tag-row">
        ${(note.tags||[]).map(t=>`<span class="notes-tag">#${_esc(t)}</span>`).join('')}
      </div>

      <!-- SEPARATE TITLE INPUT -->
      <input
        class="notes-title-input"
        id="notes-title"
        type="text"
        placeholder="Note title…"
        value="${_escAttr(note.title || '')}"
        autocomplete="off"
        spellcheck="true"
      />

      <!-- Body (contenteditable rich text) -->
      <div
        class="notes-content"
        id="notes-content"
        contenteditable="true"
        spellcheck="true"
        data-placeholder="Write something… use #tag to add tags"
      >${note.body || ''}</div>

    </div>`;
}

function _renderEmpty() {
  return `
    <div class="notes-editor-empty">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" stroke-width="1.2" stroke-linecap="round"
           style="color:var(--text-faint)">
        <rect x="4" y="3" width="16" height="18" rx="2"/>
        <line x1="8" y1="8" x2="16" y2="8"/>
        <line x1="8" y1="12" x2="16" y2="12"/>
        <line x1="8" y1="16" x2="12" y2="16"/>
      </svg>
      <p>Select a note or create a new one</p>
      <button class="btn btn-primary" id="empty-new-btn" style="margin-top:4px;">
        New note
      </button>
    </div>`;
}

/* ── Events ── */
function _attachEvents() {
  _container.querySelector('#notes-new')?.addEventListener('click', _createNote);
  _container.querySelector('#empty-new-btn')?.addEventListener('click', _createNote);

  const search = _container.querySelector('#notes-search');
  search?.addEventListener('input', debounce(e => {
    _searchQuery = e.target.value;
    const list = _container.querySelector('#notes-list');
    if (list) list.innerHTML = _renderList(_getNotes(), _colorTagsOn());
    _reAttachListClicks();
  }, 150));

  _reAttachListClicks();
  _attachColorFilterEvents();
  _attachEditorEvents();
}

function _attachColorFilterEvents() {
  _container.querySelectorAll('.color-filter-chip').forEach(chip => {
    // Restore active state
    chip.classList.toggle('active', chip.dataset.color === _activeColor);

    chip.addEventListener('click', () => {
      _activeColor = chip.dataset.color;
      // Update active chip UI
      _container.querySelectorAll('.color-filter-chip').forEach(c =>
        c.classList.toggle('active', c.dataset.color === _activeColor)
      );
      // Re-render list with filter applied
      const list = _container.querySelector('#notes-list');
      if (list) list.innerHTML = _renderList(_getNotes(), _colorTagsOn());
      _reAttachListClicks();
    });
  });
}

function _reAttachListClicks() {
  _container.querySelectorAll('.notes-list-item').forEach(item => {
    item.addEventListener('click', () => { _activeId = item.dataset.id; _render(); });
  });
}

function _attachEditorEvents() {
  const content  = _container.querySelector('#notes-content');
  const titleEl  = _container.querySelector('#notes-title');
  if (!content) return;

  const debouncedSave = debounce(() => _saveActive(titleEl, content), 500);

  content.addEventListener('input',  () => { _showSaving(); debouncedSave(); });
  titleEl?.addEventListener('input', () => { _showSaving(); debouncedSave(); });

  /* Formatting toolbar */
  _container.querySelectorAll('.fmt-btn[data-cmd]').forEach(btn => {
    btn.addEventListener('mousedown', e => {
      e.preventDefault();
      const cmd = btn.dataset.cmd;
      if      (cmd === 'h1') document.execCommand('formatBlock', false, 'h1');
      else if (cmd === 'h2') document.execCommand('formatBlock', false, 'h2');
      else if (cmd === 'h3') document.execCommand('formatBlock', false, 'h3');
      else                   document.execCommand(cmd, false, null);
      content.focus();
    });
  });

  /* Pin */
  _container.querySelector('#pin-btn')?.addEventListener('click', () => {
    _updateNote(_activeId, n => ({ ...n, pinned: !n.pinned }));
    _render();
  });

  /* Download */
  _container.querySelector('#download-btn')?.addEventListener('click', () => {
    const note = _getNotes().find(n => n.id === _activeId);
    if (!note) return;
    const title    = note.title || 'Untitled';
    const tags     = (note.tags || []).map(t => `#${t}`).join(' ');
    // Convert HTML to Markdown
    const md = _htmlToMarkdown(content.innerHTML);
    const text = `# ${title}\n${tags ? `\n${tags}\n` : ''}\n${md}`;
    const blob = new Blob([text], { type: 'text/markdown' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'),
                   { href: url, download: `${title.replace(/[^a-z0-9]/gi,'_')}.md` });
    a.click();
    URL.revokeObjectURL(url);
  });

  /* Delete */
  _container.querySelector('#delete-btn')?.addEventListener('click', () => {
    _softDelete(_activeId);
  });

  /* Voice typing */
  _container.querySelector('#voice-btn')?.addEventListener('click', () => {
    _toggleVoice(content);
  });

  /* Color picker toggle */
  _container.querySelector('#color-picker-btn')?.addEventListener('click', e => {
    e.stopPropagation();
    const popup = _container.querySelector('#color-picker-popup');
    if (!popup) return;
    const isOpen = popup.style.display === 'flex';
    popup.style.display = isOpen ? 'none' : 'flex';
  });

  /* Color swatch click */
  _container.querySelectorAll('.color-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      const colorId = sw.dataset.color;
      _updateNote(_activeId, n => ({ ...n, color: colorId }));
      _render(); // full re-render to update list item border + swatch active state
    });
  });

  /* Close color picker on outside click */
  document.addEventListener('click', () => {
    const popup = _container?.querySelector('#color-picker-popup');
    if (popup) popup.style.display = 'none';
  }, { once: false });
}

/* ── Voice typing ── */
let _recognition = null;
let _voiceActive = false;

function _toggleVoice(contentEl) {
  const btn = _container?.querySelector('#voice-btn');
  if (!btn) return;

  // Check browser support
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    _showToast('Voice typing not supported in this browser. Try Chrome.', 'warning', 4000);
    return;
  }

  if (_voiceActive) {
    // Stop
    _recognition?.stop();
    return;
  }

  // Start
  _recognition = new SpeechRecognition();
  _recognition.continuous    = true;
  _recognition.interimResults = true;
  _recognition.lang          = 'en-US';

  let _finalTranscript = '';

  _recognition.onstart = () => {
    _voiceActive = true;
    btn.style.color      = 'var(--error)';
    btn.style.background = 'var(--error-dim)';
    btn.title            = 'Stop voice typing';
    _showToast('Listening… speak now', 'success', 2500);
  };

  _recognition.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) _finalTranscript += t + ' ';
      else interim = t;
    }
    // Insert final text at cursor position in contenteditable
    if (_finalTranscript) {
      const sel = window.getSelection();
      if (sel && sel.rangeCount && contentEl.contains(sel.anchorNode)) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        range.insertNode(document.createTextNode(_finalTranscript));
        range.collapse(false);
      } else {
        // Fallback: append to end
        contentEl.innerHTML += _finalTranscript;
      }
      _finalTranscript = '';
      // Trigger save
      contentEl.dispatchEvent(new Event('input'));
    }
  };

  _recognition.onerror = (e) => {
    console.error('Speech recognition error:', e.error);
    _showToast(`Voice error: ${e.error}`, 'warning', 3000);
    _stopVoice(btn);
  };

  _recognition.onend = () => { _stopVoice(btn); };

  _recognition.start();
}

function _stopVoice(btn) {
  _voiceActive    = false;
  _recognition    = null;
  if (btn) {
    btn.style.color      = '';
    btn.style.background = '';
    btn.title            = 'Voice typing';
  }
}

/* ── Note operations ── */
function _createNote() {
  const now  = new Date().toISOString();
  const note = { id:uuid(), title:'', body:'', tags:[],
                 color:'none', pinned:false, createdAt:now, updatedAt:now };
  Storage.update(KEYS.NOTES, arr => [note, ...(Array.isArray(arr)?arr:[])], []);
  _activeId = note.id;
  _render();
  setTimeout(() => _container?.querySelector('#notes-title')?.focus(), 50);
}

function _saveActive(titleEl, contentEl) {
  if (!_activeId) return;
  const title = titleEl?.value?.trim() || 'Untitled';
  const html  = contentEl.innerHTML;
  const text  = contentEl.innerText || contentEl.textContent || '';
  const tags  = _extractTags(text);

  _updateNote(_activeId, n => ({ ...n, title, body: html, tags, updatedAt: new Date().toISOString() }));

  // Refresh list only
  const list = _container?.querySelector('#notes-list');
  if (list) list.innerHTML = _renderList(_getNotes(), _colorTagsOn());
  _reAttachListClicks();

  // Update tag row
  const tagRow = _container?.querySelector('#tag-row');
  if (tagRow) tagRow.innerHTML = tags.map(t=>`<span class="notes-tag">#${_esc(t)}</span>`).join('');

  _showSaved();
}

function _softDelete(id) {
  const note = _getNotes().find(n => n.id === id);
  if (!note) return;
  Storage.update(KEYS.NOTES, arr => arr.filter(n => n.id !== id), []);
  _activeId = null;
  _render();
  _showUndoToast(`"${note.title || 'Untitled'}" deleted`, () => {
    Storage.update(KEYS.NOTES, arr => [note, ...(Array.isArray(arr)?arr:[])], []);
    _activeId = note.id;
    _render();
  });
}

function _updateNote(id, fn) {
  Storage.update(KEYS.NOTES,
    arr => (Array.isArray(arr)?arr:[]).map(n => n.id===id ? fn(n) : n), []);
}

/* ── Helpers ── */
function _getNotes()        { return Storage.get(KEYS.NOTES, []); }
function _extractTags(text) {
  return [...new Set((text.match(/#([a-zA-Z0-9_]+)/g)||[]).map(t=>t.slice(1).toLowerCase()))];
}
function _preview(body) {
  return (body||'')
    .replace(/<[^>]+>/g,' ')        // strip tags (space to avoid word merging)
    .replace(/&nbsp;/g,' ')         // decode non-breaking spaces
    .replace(/&amp;/g,'&')
    .replace(/&lt;/g,'<')
    .replace(/&gt;/g,'>')
    .replace(/&quot;/g,'"')
    .replace(/#[a-zA-Z0-9_]+/g,'')  // strip hashtags
    .replace(/\s+/g,' ')            // collapse whitespace
    .trim().slice(0,80)||'—';
}
function _showSaving() {
  const el = _container?.querySelector('#save-indicator');
  if (el) el.textContent = 'Saving…';
}
function _showSaved() {
  const el = _container?.querySelector('#save-indicator');
  if (el) { el.textContent = 'Saved'; setTimeout(()=>{ if(el) el.textContent=''; },1500); }
}
function _showUndoToast(msg, onUndo) {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = `<span>${_esc(msg)}</span><button class="toast__action">Undo</button>`;
  root.appendChild(t);
  let done = false;
  t.querySelector('.toast__action').addEventListener('click', () => {
    done = true; onUndo();
    t.classList.add('exiting');
    t.addEventListener('animationend', ()=>t.remove(), {once:true});
  });
  setTimeout(() => {
    if (!done) { t.classList.add('exiting'); t.addEventListener('animationend',()=>t.remove(),{once:true}); }
  }, 5000);
}

function _htmlToMarkdown(html) {
  if (!html) return '';
  return html
    .replace(/<h1[^>]*>(.*?)<\/h1>/gi,   '# $1\n')
    .replace(/<h2[^>]*>(.*?)<\/h2>/gi,   '## $1\n')
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi,   '### $1\n')
    .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
    .replace(/<b[^>]*>(.*?)<\/b>/gi,     '**$1**')
    .replace(/<em[^>]*>(.*?)<\/em>/gi,   '*$1*')
    .replace(/<i[^>]*>(.*?)<\/i>/gi,     '*$1*')
    .replace(/<u[^>]*>(.*?)<\/u>/gi,     '_$1_')
    .replace(/<li[^>]*>(.*?)<\/li>/gi,   '- $1\n')
    .replace(/<ul[^>]*>|<\/ul>/gi,       '')
    .replace(/<ol[^>]*>|<\/ol>/gi,       '')
    .replace(/<br\s*\/?>/gi,            '\n')
    .replace(/<p[^>]*>(.*?)<\/p>/gi,     '$1\n\n')
    .replace(/<div[^>]*>(.*?)<\/div>/gi, '$1\n')
    .replace(/<[^>]+>/g,                  '')
    .replace(/&amp;/g,  '&')
    .replace(/&lt;/g,   '<')
    .replace(/&gt;/g,   '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function _esc(s)     { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function _escAttr(s) { return String(s||'').replace(/"/g,'&quot;'); }