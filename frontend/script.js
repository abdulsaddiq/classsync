/* ═══════════════════════════════════════════════════
   CLASSSYNC — frontend/script.js
   Clean, secure, full-featured
═══════════════════════════════════════════════════ */

'use strict';

const API = 'https://classsync-7nxx.onrender.com/api';

let SUBJECTS = ['DS', 'DEVC', 'Maths', 'Physics', 'Chemistry', 'English', 'EVS'];
let posts       = [];
let user        = null;
let currentCat  = 'all';
let currentFilter = null;
let currentView = 'grid';
let searchTimer = null;

// ── SECURITY: sanitize HTML output to prevent XSS ──
function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// ── TOKEN MANAGEMENT ──
function getToken() {
  return localStorage.getItem('cs_token') || sessionStorage.getItem('cs_token');
}

function clearToken() {
  localStorage.removeItem('cs_token');
  sessionStorage.removeItem('cs_token');
}

// ── API FETCH ──
async function apiFetch(path, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000); // 15s timeout

  try {
    const res = await fetch(API + path, {
      headers,
      signal: controller.signal,
      ...options
    });

    clearTimeout(timeout);

    // Handle 401 — token expired
    if (res.status === 401) {
      clearToken();
      if (document.getElementById('feed')) location.href = 'login.html';
      throw new Error('Session expired. Please sign in again.');
    }

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;

  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') throw new Error('Request timed out. Check your connection.');
    throw err;
  }
}

// ══════════════════════════════
//  INIT
// ══════════════════════════════
async function init() {
  const token = getToken();

  // Dashboard
  if (document.getElementById('feed')) {
    if (!token) { location.href = 'login.html'; return; }
    showSkeletons();
    try {
      user = await apiFetch('/auth/me');
      setupApp();
    } catch (err) {
      clearToken();
      location.href = 'login.html';
    }
  }

  // Login page — redirect if already logged in
  if (document.getElementById('l-name')) {
    if (token) { location.href = 'index.html'; return; }
    // focus first field
    setTimeout(() => document.getElementById('l-name')?.focus(), 100);
  }
}

// ══════════════════════════════
//  APP SETUP
// ══════════════════════════════
function setupApp() {
  // User info in sidebar
  document.getElementById('userNameDisplay').textContent = esc(user.name);
  document.getElementById('userRollDisplay').textContent = esc(user.roll);

  const initials = user.name.trim().split(/\s+/)
    .map(w => w[0] || '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
  document.getElementById('userAvatar').textContent = initials || '?';

  loadSubjects();
  fetchAndRender();
  setupCharCounters();
  onCatChange(); // init category preview color

  // close modal on backdrop click
  document.getElementById('formModal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('formModal')) closeForm();
  });

  // keyboard shortcuts
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeForm();
      closeLightbox();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      document.getElementById('searchInput')?.focus();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
      e.preventDefault();
      openForm();
    }
  });
}

// ══════════════════════════════
//  LOGIN
// ══════════════════════════════
async function doLogin() {
  const nameEl = document.getElementById('l-name');
  const rollEl = document.getElementById('l-roll');
  const passEl = document.getElementById('l-pass');
  const btn    = document.getElementById('signinBtn');

  const name     = nameEl?.value.trim();
  const roll     = rollEl?.value.trim();
  const password = passEl?.value;

  hideLoginErr();

  // Validate
  if (!name)     { showLoginErr('Please enter your full name.'); nameEl?.focus(); return; }
  if (!roll)     { showLoginErr('Please enter your roll number.'); rollEl?.focus(); return; }
  if (roll.length < 4) { showLoginErr('Roll number seems too short.'); rollEl?.focus(); return; }
  if (!password) { showLoginErr('Please enter your password.'); passEl?.focus(); return; }
  if (password.length < 4) { showLoginErr('Password must be at least 4 characters.'); passEl?.focus(); return; }

  // loading state
  setLoginLoading(true, btn);

  try {
    let data;
    try {
      data = await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ roll, password })
      });
    } catch (e) {
      if (e.message && e.message.toLowerCase().includes('no account')) {
        data = await apiFetch('/auth/register', {
          method: 'POST',
          body: JSON.stringify({ name, roll, password })
        });
      } else {
        throw e;
      }
    }

    const remember = document.getElementById('remember')?.checked;
    if (remember) {
      localStorage.setItem('cs_token', data.token);
    } else {
      sessionStorage.setItem('cs_token', data.token);
    }

    location.href = 'index.html';

  } catch (err) {
    setLoginLoading(false, btn);
    showLoginErr(err.message);
  }
}

function showLoginErr(msg) {
  const el = document.getElementById('loginErr');
  const txt = document.getElementById('loginErrText');
  if (!el) return;
  if (txt) txt.textContent = msg;
  el.classList.add('visible');
  el.style.display = '';
}

function hideLoginErr() {
  const el = document.getElementById('loginErr');
  if (el) { el.classList.remove('visible'); el.style.display = 'none'; }
}

function setLoginLoading(loading, btn) {
  if (!btn) return;
  const text    = btn.querySelector('.btn-text');
  const arrow   = btn.querySelector('.btn-arrow');
  const spinner = btn.querySelector('.btn-spinner');
  btn.disabled = loading;
  if (text)    text.style.display    = loading ? 'none' : '';
  if (arrow)   arrow.style.display   = loading ? 'none' : '';
  if (spinner) spinner.style.display = loading ? '' : 'none';
}

function togglePwd() {
  const inp = document.getElementById('l-pass');
  if (!inp) return;
  const isPass = inp.type === 'password';
  inp.type = isPass ? 'text' : 'password';
  document.getElementById('eyeOpen').style.display  = isPass ? 'none' : '';
  document.getElementById('eyeClosed').style.display = isPass ? '' : 'none';
}

// Enter key on login
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && document.getElementById('l-name')) doLogin();
});

// ══════════════════════════════
//  LOGOUT
// ══════════════════════════════
function doLogout() {
  if (!confirm('Sign out of ClassSync?')) return;
  clearToken();
  location.href = 'login.html';
}

// ══════════════════════════════
//  SIDEBAR
// ══════════════════════════════
function toggleSidebar() {
  document.getElementById('sidebar')?.classList.toggle('mobile-open');
  document.getElementById('sidebarOverlay')?.classList.toggle('show');
}

function closeSidebar() {
  document.getElementById('sidebar')?.classList.remove('mobile-open');
  document.getElementById('sidebarOverlay')?.classList.remove('show');
}

// ══════════════════════════════
//  NAVIGATION
// ══════════════════════════════
const CAT_LABELS = {
  all: 'All Posts',
  assignment: 'Assignments',
  record: 'Records',
  classwork: 'Classwork',
  homework: 'Homework',
  important: 'Important'
};

function setCategory(cat, btn) {
  currentCat    = cat;
  currentFilter = null;
  activateNavBtn(btn);
  updateTopbarTitle(CAT_LABELS[cat] || cat);
  fetchAndRender();
  closeSidebar();
}

function setFilter(f, btn) {
  currentFilter = f;
  currentCat    = 'all';
  activateNavBtn(btn);
  updateTopbarTitle(f === 'pending' ? 'Pending' : 'Completed');
  fetchAndRender();
  closeSidebar();
}

function activateNavBtn(btn) {
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  btn?.classList.add('active');
}

function updateTopbarTitle(title) {
  const el = document.getElementById('topbarTitle');
  if (el) el.textContent = title;
}

// ══════════════════════════════
//  VIEW TOGGLE
// ══════════════════════════════
function setView(v) {
  currentView = v;
  const feed = document.getElementById('feed');
  if (feed) feed.classList.toggle('list-view', v === 'list');
  document.getElementById('gridViewBtn')?.classList.toggle('active', v === 'grid');
  document.getElementById('listViewBtn')?.classList.toggle('active', v === 'list');
}

// ══════════════════════════════
//  SEARCH
// ══════════════════════════════
function debounceSearch() {
  const val = document.getElementById('searchInput')?.value || '';
  const clearBtn = document.getElementById('searchClear');
  if (clearBtn) clearBtn.style.display = val ? '' : 'none';
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => fetchAndRender(), 300);
}

function clearSearch() {
  const inp = document.getElementById('searchInput');
  if (inp) inp.value = '';
  const clearBtn = document.getElementById('searchClear');
  if (clearBtn) clearBtn.style.display = 'none';
  fetchAndRender();
}

// ══════════════════════════════
//  FORM
// ══════════════════════════════
function loadSubjects() {
  const sel = document.getElementById('f-sub');
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = '';
  SUBJECTS.forEach(s => {
    const o = document.createElement('option');
    o.value = s; o.textContent = s;
    sel.appendChild(o);
  });
  const other = document.createElement('option');
  other.value = 'other'; other.textContent = '+ Other…';
  sel.appendChild(other);
  if (current && [...sel.options].some(o => o.value === current)) sel.value = current;
}

function onSubChange() {
  const val = document.getElementById('f-sub')?.value;
  const grp = document.getElementById('customSubGroup');
  if (grp) grp.style.display = val === 'other' ? '' : 'none';
}

const CAT_COLORS = {
  assignment: 'var(--violet)',
  record: 'var(--emerald)',
  classwork: 'var(--cyan)',
  homework: 'var(--amber)',
  important: 'var(--rose)'
};

function onCatChange() {
  const cat = document.getElementById('f-cat')?.value;
  const preview = document.getElementById('catPreview');
  if (preview && cat) preview.style.background = CAT_COLORS[cat] || 'transparent';
}

function onFileChange() {
  const f = document.getElementById('f-img')?.files[0];
  const label = document.getElementById('fileLabelText');
  const previewWrap = document.getElementById('imgPreviewWrap');
  const preview = document.getElementById('imgPreview');

  if (f) {
    // File size guard (5MB)
    if (f.size > 5 * 1024 * 1024) {
      toast('Image too large. Max 5MB.', 'error');
      document.getElementById('f-img').value = '';
      return;
    }
    if (label) label.textContent = f.name;
    const reader = new FileReader();
    reader.onload = e => {
      if (preview) preview.src = e.target.result;
      if (previewWrap) previewWrap.style.display = '';
    };
    reader.readAsDataURL(f);
  } else {
    if (label) label.textContent = 'Upload image';
    if (previewWrap) previewWrap.style.display = 'none';
  }
}

function removeImg() {
  document.getElementById('f-img').value = '';
  const previewWrap = document.getElementById('imgPreviewWrap');
  const label = document.getElementById('fileLabelText');
  if (previewWrap) previewWrap.style.display = 'none';
  if (label) label.textContent = 'Upload image';
}

function openForm() {
  const modal = document.getElementById('formModal');
  if (modal) {
    modal.classList.add('open');
    document.getElementById('f-due').min = new Date().toISOString().split('T')[0];
    setTimeout(() => document.getElementById('f-topic')?.focus(), 150);
  }
}

function closeForm() {
  const modal = document.getElementById('formModal');
  if (modal) modal.classList.remove('open');
  resetForm();
}

function resetForm() {
  ['f-topic', 'f-extra', 'f-due', 'f-custom'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  removeImg();
  const grp = document.getElementById('customSubGroup');
  if (grp) grp.style.display = 'none';
  loadSubjects();
  updateCharCount('f-topic', 'topicCount', 200);
  updateCharCount('f-extra', 'extraCount', 1000);
  onCatChange();
}

function setupCharCounters() {
  document.getElementById('f-topic')?.addEventListener('input', () => updateCharCount('f-topic', 'topicCount', 200));
  document.getElementById('f-extra')?.addEventListener('input', () => updateCharCount('f-extra', 'extraCount', 1000));
}

function updateCharCount(inputId, countId, max) {
  const inp = document.getElementById(inputId);
  const cnt = document.getElementById(countId);
  if (!inp || !cnt) return;
  const len = inp.value.length;
  cnt.textContent = `${len}/${max}`;
  cnt.style.color = len > max * 0.9 ? 'var(--rose)' : 'var(--text-muted)';
}

async function addPost() {
  let sub = document.getElementById('f-sub')?.value;
  if (sub === 'other') {
    sub = document.getElementById('f-custom')?.value.trim();
    if (!sub) { toast('Please enter a subject name.', 'error'); return; }
    if (sub.length > 40) { toast('Subject name too long.', 'error'); return; }
    if (!SUBJECTS.includes(sub)) SUBJECTS.push(sub);
  }

  const topic = document.getElementById('f-topic')?.value.trim();
  if (!topic) { toast('Topic / Title is required.', 'error'); document.getElementById('f-topic')?.focus(); return; }
  if (topic.length > 200) { toast('Topic too long (max 200 chars).', 'error'); return; }

  const extra = document.getElementById('f-extra')?.value.trim();
  const due   = document.getElementById('f-due')?.value;
  const cat   = document.getElementById('f-cat')?.value;

  // Image → base64
  let imageURL = '';
  const imgFile = document.getElementById('f-img')?.files[0];
  if (imgFile) {
    imageURL = await fileToBase64(imgFile);
  }

  const btn = document.getElementById('submitBtn');
  if (btn) btn.disabled = true;

  try {
    await apiFetch('/posts/', {
      method: 'POST',
      body: JSON.stringify({
        subject:   sub,
        topic,
        extra,
        due,
        category:  cat,
        image_url: imageURL
      })
    });

    closeForm();
    await fetchAndRender();
    toast('Post published! 🎉', 'success');

  } catch (err) {
    toast(err.message, 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

// ══════════════════════════════
//  FETCH & RENDER
// ══════════════════════════════
async function fetchAndRender() {
  const search = document.getElementById('searchInput')?.value?.trim() || '';
  const sort   = document.getElementById('sortSelect')?.value || 'newest';

  const params = new URLSearchParams();
  if (currentCat && currentCat !== 'all') params.set('category', currentCat);
  if (currentFilter) params.set('status', currentFilter);
  if (search) params.set('search', search);
  params.set('sort', sort);

  try {
    posts = await apiFetch(`/posts/?${params}`);
    renderFeed();
    fetchStats(); // async, non-blocking
  } catch (err) {
    toast(err.message, 'error');
    renderFeedError();
  }
}

function renderFeed() {
  const feed = document.getElementById('feed');
  if (!feed) return;

  if (!posts.length) {
    feed.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
          </svg>
        </div>
        <div class="empty-title">Nothing here yet</div>
        <div class="empty-desc">Try a different filter, or create your first post.</div>
      </div>`;
    return;
  }

  feed.innerHTML = posts.map((p, i) => buildCard(p, i)).join('');
}

function renderFeedError() {
  const feed = document.getElementById('feed');
  if (!feed) return;
  feed.innerHTML = `
    <div class="empty-state">
      <div class="empty-icon" style="color:var(--rose)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/>
        </svg>
      </div>
      <div class="empty-title" style="color:var(--rose)">Failed to load</div>
      <div class="empty-desc">Could not fetch posts. Check your connection.</div>
    </div>`;
}

function showSkeletons() {
  const feed = document.getElementById('feed');
  if (!feed) return;
  feed.innerHTML = Array(6).fill('<div class="skeleton-card"></div>').join('');
}

function buildCard(p, i) {
  const due     = getDueStatus(p.due);
  const catName = { assignment:'Assignment', record:'Record', classwork:'Classwork', homework:'Homework', important:'Important' }[p.category] || p.category;

  const doneIcon  = `<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>`;
  const undoIcon  = `<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M7.707 3.293a1 1 0 010 1.414L5.414 7H11a7 7 0 017 7v2a1 1 0 11-2 0v-2a5 5 0 00-5-5H5.414l2.293 2.293a1 1 0 11-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>`;
  const pinIcon   = `<svg viewBox="0 0 20 20" fill="currentColor"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>`;
  const trashIcon = `<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zm-1 6a1 1 0 112 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 112 0v6a1 1 0 11-2 0V8z" clip-rule="evenodd"/></svg>`;
  const clockIcon = `<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clip-rule="evenodd"/></svg>`;
  const calIcon   = `<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clip-rule="evenodd"/></svg>`;

  // Sanitize all user-supplied strings
  const safeSubject = esc(p.subject);
  const safeTopic   = esc(p.topic);
  const safeExtra   = p.extra ? esc(p.extra) : '';
  const safeAuthor  = esc(p.author_name || '');
  const safeId      = esc(p.id);

  // Image (only render if it's a URL or data URL)
  const imgHtml = (p.image_url && (p.image_url.startsWith('data:image') || p.image_url.startsWith('http')))
    ? `<img class="card-img" src="${esc(p.image_url)}" alt="attachment" loading="lazy" onclick="openLightbox('${esc(p.image_url)}')">`
    : '';

  return `
  <div class="post-card ${p.done ? 'is-done' : ''}" style="animation-delay:${Math.min(i * 0.04, 0.4)}s">
    <div class="card-accent accent-${p.category}"></div>
    <div class="card-body">
      <div class="card-top">
        <div class="card-badges">
          <span class="badge badge-${p.category}">${catName}</span>
          ${p.pinned ? `<span class="badge badge-pinned">📌 Pinned</span>` : ''}
          ${p.done   ? `<span class="badge badge-done">✓ Done</span>` : ''}
        </div>
        <span class="card-subject">${safeSubject}</span>
      </div>

      <div class="card-topic">${safeTopic}</div>

      ${safeExtra ? `<div class="card-extra">${safeExtra}</div>` : ''}

      ${imgHtml}

      <div class="card-meta">
        <span class="meta-item">
          ${clockIcon}
          ${esc(formatDate(p.created_at))} ${esc(formatTime(p.created_at))}
        </span>
        ${p.due ? `<span class="meta-item ${due?.cls || ''}">${calIcon} ${esc(due?.label || formatDate(p.due))}</span>` : ''}
        <span class="meta-author">${safeAuthor}</span>
      </div>

      <div class="card-actions">
        ${p.done
          ? `<button class="card-btn undo" onclick="toggleDone('${safeId}')">${undoIcon} Undo</button>`
          : `<button class="card-btn done" onclick="toggleDone('${safeId}')">${doneIcon} Done</button>`
        }
        <button class="card-btn pin ${p.pinned ? 'pinned' : ''}" onclick="togglePin('${safeId}')" title="${p.pinned ? 'Unpin' : 'Pin'}">
          ${pinIcon}
        </button>
        <button class="card-btn delete" onclick="deletePost('${safeId}')" title="Delete">
          ${trashIcon}
        </button>
      </div>
    </div>
  </div>`;
}

// ══════════════════════════════
//  ACTIONS
// ══════════════════════════════
async function toggleDone(id) {
  try {
    await apiFetch(`/posts/${id}/done`, { method: 'PATCH' });
    const p = posts.find(x => x.id === id);
    const wasDone = p?.done;
    await fetchAndRender();
    toast(wasDone ? 'Marked as pending ⏳' : 'Marked as done ✅', 'info');
  } catch (err) { toast(err.message, 'error'); }
}

async function togglePin(id) {
  try {
    await apiFetch(`/posts/${id}/pin`, { method: 'PATCH' });
    await fetchAndRender();
    const p = posts.find(x => x.id === id);
    toast(p?.pinned ? 'Unpinned' : 'Pinned 📌', 'info');
  } catch (err) { toast(err.message, 'error'); }
}

async function deletePost(id) {
  if (!confirm('Delete this post? This cannot be undone.')) return;
  try {
    await apiFetch(`/posts/${id}`, { method: 'DELETE' });
    await fetchAndRender();
    toast('Post deleted.', 'info');
  } catch (err) { toast(err.message, 'error'); }
}

// ══════════════════════════════
//  STATS
// ══════════════════════════════
async function fetchStats() {
  try {
    const s = await apiFetch('/posts/stats');

    animateNum('s-total',   s.total);
    animateNum('s-pending', s.pending);
    animateNum('s-done',    s.done);
    animateNum('s-overdue', s.overdue);

    setText('cnt-all',      s.total);
    ['assignment','record','classwork','homework','important'].forEach(c => {
      setText('cnt-' + c, s.by_category?.[c] || 0);
    });
    setText('cnt-pending', s.pending);
    setText('cnt-done',    s.done);

    // overdue warning
    if (s.overdue > 0) {
      const el = document.getElementById('s-overdue');
      el?.parentElement?.classList.add('has-overdue');
    }

  } catch { /* silent */ }
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val ?? 0;
}

function animateNum(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  const current = parseInt(el.textContent) || 0;
  if (current === target) return;
  const diff  = target - current;
  const steps = 20;
  const step  = diff / steps;
  let count = current;
  let i = 0;
  const t = setInterval(() => {
    count += step;
    i++;
    el.textContent = Math.round(i === steps ? target : count);
    if (i >= steps) clearInterval(t);
  }, 20);
}

// ══════════════════════════════
//  DATE UTILS
// ══════════════════════════════
function getDueStatus(due) {
  if (!due) return null;
  const today = new Date(); today.setHours(0,0,0,0);
  const d = new Date(due); d.setHours(0,0,0,0);
  const diff = Math.round((d - today) / 86400000);
  if (diff < 0)   return { label: 'Overdue',          cls: 'due-urgent' };
  if (diff === 0) return { label: 'Due today',         cls: 'due-urgent' };
  if (diff === 1) return { label: 'Tomorrow',          cls: 'due-soon'   };
  if (diff <= 3)  return { label: `In ${diff} days`,   cls: 'due-soon'   };
  return { label: `${diff}d left`, cls: 'due-ok' };
}

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
}

function formatTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' });
}

// ══════════════════════════════
//  LIGHTBOX
// ══════════════════════════════
function openLightbox(src) {
  const lb  = document.getElementById('lightbox');
  const img = document.getElementById('lightboxImg');
  if (!lb || !img) return;
  img.src = src;
  lb.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  const lb = document.getElementById('lightbox');
  if (lb) lb.classList.remove('open');
  document.body.style.overflow = '';
}

// ══════════════════════════════
//  TOASTS
// ══════════════════════════════
const TOAST_ICONS = {
  success: `<svg class="toast-icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"/></svg>`,
  error:   `<svg class="toast-icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"/></svg>`,
  info:    `<svg class="toast-icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"/></svg>`
};

function toast(msg, type = 'info', duration = 3500) {
  const wrap = document.getElementById('toastWrap');
  if (!wrap) return;

  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `${TOAST_ICONS[type] || ''}<span>${esc(String(msg))}</span>`;
  wrap.appendChild(el);

  const remove = () => {
    el.classList.add('leaving');
    el.addEventListener('animationend', () => el.remove(), { once: true });
    setTimeout(() => el.remove(), 400);
  };

  const timer = setTimeout(remove, duration);
  el.addEventListener('click', () => { clearTimeout(timer); remove(); });
}

// ══════════════════════════════
//  START
// ══════════════════════════════
init();
