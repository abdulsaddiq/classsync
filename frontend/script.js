const API = 'https://classsync-7nxx.onrender.com/api';
console.log("API BASE:", API);

let SUBJECTS = ['DS', 'DEVC', 'Maths', 'Physics', 'Chemistry', 'English', 'EVS'];
let posts = [];
let user = null;
let currentCat = 'all';
let currentFilter = null;
let currentView = 'grid';

// ═══ HELPERS ═══
function getToken() {
    return localStorage.getItem('cs_token');
}

async function apiFetch(path, options = {}) {
    const token = getToken();
    const res = await fetch(API + path, {
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        ...options
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
}

// ═══ INIT ═══
async function init() {
    const token = getToken();

    // index.html
    if (document.getElementById('feed')) {
        if (!token) { location.href = 'login.html'; return; }
        try {
            user = await apiFetch('/auth/me');
            setupApp();
        } catch {
            localStorage.removeItem('cs_token');
            sessionStorage.removeItem('cs_token');
            location.href = 'login.html';
        }
    }

    // login.html — redirect if already logged in
    if (document.getElementById('l-name') && token) {
        location.href = 'index.html';
    }
}

// ═══ APP SETUP ═══
function setupApp() {
    document.getElementById('userNameDisplay').textContent = user.name;
    document.getElementById('userRollDisplay').textContent = user.roll;

    const initials = user.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    document.getElementById('userAvatar').textContent = initials;

    loadSubjects();
    fetchAndRender();

    document.getElementById('formPopup').addEventListener('click', e => {
        if (e.target === document.getElementById('formPopup')) closeForm();
    });
}

// ═══ LOGIN ═══
async function doLogin() {
    const name     = document.getElementById('l-name').value.trim();
    const roll     = document.getElementById('l-roll').value.trim();
    const password = document.getElementById('l-pass').value;

    if (!name || !roll || !password) { showLoginErr('Please fill in all fields.'); return; }
    if (password.length < 4)         { showLoginErr('Password must be at least 4 characters.'); return; }

    try {
        // Try login first, register if not found
        let data;
        try {
            data = await apiFetch('/auth/login', {
                method: 'POST',
                body: JSON.stringify({ roll, password })
            });
        } catch (e) {
            if (e.message.includes('No account')) {
                // Auto-register
                data = await apiFetch('/auth/register', {
                    method: 'POST',
                    body: JSON.stringify({ name, roll, password })
                });
            } else {
                throw e;
            }
        }

        localStorage.setItem('cs_token', data.token);

        location.href = 'index.html';

    } catch (err) {
        showLoginErr(err.message);
    }
}

function showLoginErr(msg) {
    const el = document.getElementById('loginErr');
    el.textContent = msg;
    el.style.display = 'block';
}

function togglePwd() {
    const inp = document.getElementById('l-pass');
    inp.type = inp.type === 'password' ? 'text' : 'password';
}

document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && document.getElementById('l-name')) doLogin();
});

// ═══ LOGOUT ═══
function doLogout() {
    if (!confirm('Sign out?')) return;
    localStorage.removeItem('cs_token');
    sessionStorage.removeItem('cs_token');
    location.href = 'login.html';
}

// ═══ SIDEBAR ═══
function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('mobile-open');
    document.getElementById('sidebarOverlay').classList.toggle('show');
}
function closeSidebar() {
    document.getElementById('sidebar').classList.remove('mobile-open');
    document.getElementById('sidebarOverlay').classList.remove('show');
}

// ═══ CATEGORY / FILTER ═══
function setCategory(cat, btn) {
    currentCat = cat;
    currentFilter = null;
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    fetchAndRender();
    closeSidebar();
}

function setFilter(f, btn) {
    currentFilter = f;
    currentCat = 'all';
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    fetchAndRender();
    closeSidebar();
}

// ═══ VIEW ═══
function setView(v) {
    currentView = v;
    const feed = document.getElementById('feed');
    feed.classList.toggle('list-view', v === 'list');
    document.getElementById('gridViewBtn').classList.toggle('active', v === 'grid');
    document.getElementById('listViewBtn').classList.toggle('active', v === 'list');
}

// ═══ FORM ═══
function loadSubjects() {
    const sel = document.getElementById('f-sub');
    if (!sel) return;
    sel.innerHTML = '';
    SUBJECTS.forEach(s => {
        const o = document.createElement('option');
        o.value = s; o.textContent = s;
        sel.appendChild(o);
    });
    const other = document.createElement('option');
    other.value = 'other'; other.textContent = '＋ Other…';
    sel.appendChild(other);
}

function onSubChange() {
    const sel = document.getElementById('f-sub');
    document.getElementById('customSubGroup').style.display =
        sel.value === 'other' ? 'block' : 'none';
}

function onFileChange() {
    const f = document.getElementById('f-img').files[0];
    document.getElementById('fileLabelText').textContent =
        f ? f.name : 'Click to attach an image';
}

function openForm() {
    document.getElementById('formPopup').classList.add('open');
    document.getElementById('f-due').min = new Date().toISOString().split('T')[0];
}

function closeForm() {
    document.getElementById('formPopup').classList.remove('open');
    document.getElementById('f-topic').value = '';
    document.getElementById('f-extra').value = '';
    document.getElementById('f-due').value = '';
    document.getElementById('f-custom').value = '';
    document.getElementById('customSubGroup').style.display = 'none';
    document.getElementById('f-img').value = '';
    document.getElementById('fileLabelText').textContent = 'Click to attach an image';
    loadSubjects();
}

async function addPost() {
    let sub = document.getElementById('f-sub').value;
    if (sub === 'other') {
        sub = document.getElementById('f-custom').value.trim();
        if (!sub) { toast('Enter a custom subject.', 'error'); return; }
        if (!SUBJECTS.includes(sub)) SUBJECTS.push(sub);
    }

    const topic = document.getElementById('f-topic').value.trim();
    if (!topic) { toast('Topic is required.', 'error'); return; }

    // Image → base64 URL (still stored as URL string for now)
    const imgFile = document.getElementById('f-img').files[0];
    const imageURL = imgFile ? URL.createObjectURL(imgFile) : '';

    try {
        await apiFetch('/posts/', {
            method: 'POST',
            body: JSON.stringify({
                subject:   sub,
                topic,
                extra:     document.getElementById('f-extra').value.trim(),
                due:       document.getElementById('f-due').value,
                category:  document.getElementById('f-cat').value,
                image_url: imageURL
            })
        });

        await fetchAndRender();
        closeForm();
        toast('Post added! 🎉', 'success');

    } catch (err) {
        toast(err.message, 'error');
    }
}

// ═══ FETCH & RENDER ═══
async function fetchAndRender() {
    const search = (document.getElementById('searchInput')?.value || '').toLowerCase();
    const sort   = document.getElementById('sortSelect')?.value || 'newest';

    const params = new URLSearchParams();
    if (currentCat && currentCat !== 'all') params.set('category', currentCat);
    if (currentFilter) params.set('status', currentFilter);
    if (search) params.set('search', search);
    params.set('sort', sort);

    try {
        posts = await apiFetch(`/posts/?${params}`);
        renderFeed();
        await fetchStats();
    } catch (err) {
        toast(err.message, 'error');
    }
}

function renderFeed() {
    const feed = document.getElementById('feed');
    if (!feed) return;

    if (posts.length === 0) {
        feed.innerHTML = `<div class="empty-state">
            <div class="empty-icon">📭</div>
            <p>No posts found. Try a different filter or add one!</p>
        </div>`;
        return;
    }

    const catLabels = {
        assignment: 'Assignment', record: 'Record',
        classwork: 'Classwork', homework: 'Homework', important: 'Important'
    };

    feed.innerHTML = posts.map((p, i) => {
        const due = getDueStatus(p.due);
        return `
        <div class="post-card ${p.done ? 'done' : ''}" style="animation-delay:${i * 0.04}s">
            <div class="cat-stripe stripe-${p.category}"></div>
            <div class="post-body">
                <div class="post-header">
                    <div>
                        <span class="cat-badge cat-${p.category}">${catLabels[p.category]}</span>
                        ${p.pinned ? '<span class="cat-badge pinned-badge">📌 Pinned</span>' : ''}
                    </div>
                    <div class="post-subject">${p.subject}</div>
                </div>
                <div class="post-topic">${p.topic}</div>
                ${p.extra    ? `<div class="post-extra">${p.extra}</div>` : ''}
                ${p.image_url ? `<img class="post-img" src="${p.image_url}" alt="attachment">` : ''}
                <div class="post-meta">
                    <span class="meta-chip">🕐 ${formatDate(p.created_at)} ${formatTime(p.created_at)}</span>
                    ${p.due ? `<span class="meta-chip ${due?.cls || ''}">${due?.label || formatDate(p.due)}</span>` : ''}
                    <span class="subj-tag">${p.author_name}</span>
                </div>
                <div class="post-actions">
                    ${p.done
                        ? `<button class="act-btn undo-btn" onclick="toggleDone('${p.id}')">↩ Undo</button>`
                        : `<button class="act-btn done-btn" onclick="toggleDone('${p.id}')">✓ Done</button>`
                    }
                    <button class="act-btn" onclick="togglePin('${p.id}')">📌</button>
                    <button class="act-btn del-btn" onclick="deletePost('${p.id}')">🗑</button>
                </div>
            </div>
        </div>`;
    }).join('');
}

// ═══ ACTIONS ═══
async function toggleDone(id) {
    try {
        await apiFetch(`/posts/${id}/done`, { method: 'PATCH' });
        await fetchAndRender();
        const p = posts.find(x => x.id === id);
        toast(p?.done ? 'Marked pending ⏳' : 'Marked done ✅', 'info');
    } catch (err) { toast(err.message, 'error'); }
}

async function togglePin(id) {
    try {
        await apiFetch(`/posts/${id}/pin`, { method: 'PATCH' });
        await fetchAndRender();
        toast('Pin toggled 📌', 'info');
    } catch (err) { toast(err.message, 'error'); }
}

async function deletePost(id) {
    if (!confirm('Delete this post?')) return;
    try {
        await apiFetch(`/posts/${id}`, { method: 'DELETE' });
        await fetchAndRender();
        toast('Post deleted.', 'info');
    } catch (err) { toast(err.message, 'error'); }
}

// ═══ STATS ═══
async function fetchStats() {
    try {
        const s = await apiFetch('/posts/stats');
        document.getElementById('s-total').textContent   = s.total;
        document.getElementById('s-pending').textContent = s.pending;
        document.getElementById('s-done').textContent    = s.done;
        document.getElementById('s-overdue').textContent = s.overdue;

        const cats = ['assignment','record','classwork','homework','important'];
        document.getElementById('cnt-all').textContent = s.total;
        cats.forEach(c => {
            const el = document.getElementById('cnt-' + c);
            if (el) el.textContent = s.by_category[c] || 0;
        });

        const pendingEl = document.getElementById('cnt-pending');
        const doneEl    = document.getElementById('cnt-done');
        if (pendingEl) pendingEl.textContent = s.pending;
        if (doneEl)    doneEl.textContent    = s.done;

    } catch { /* silent */ }
}

// ═══ DATE UTILS ═══
function getDueStatus(due) {
    if (!due) return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const d = new Date(due); d.setHours(0, 0, 0, 0);
    const diff = Math.round((d - today) / 86400000);
    if (diff < 0)   return { label: 'Overdue',        cls: 'due-urgent' };
    if (diff === 0) return { label: 'Due Today',       cls: 'due-urgent' };
    if (diff <= 2)  return { label: `Due in ${diff}d`, cls: 'due-soon'   };
    return { label: `${diff}d left`, cls: 'due-ok' };
}

function formatDate(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric'
    });
}

function formatTime(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleTimeString('en-IN', {
        hour: '2-digit', minute: '2-digit'
    });
}

// ═══ TOAST ═══
function toast(msg, type = 'info') {
    const icons = { success: '✅', error: '❌', info: 'ℹ️' };
    const wrap = document.getElementById('toastWrap');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<span class="toast-icon">${icons[type]}</span> ${msg}`;
    wrap.appendChild(el);
    setTimeout(() => {
        el.classList.add('leaving');
        setTimeout(() => el.remove(), 300);
    }, 3000);
}

// Also re-render on search/sort change
function renderFeed_debounced() { fetchAndRender(); }

// ═══ START ═══
init();