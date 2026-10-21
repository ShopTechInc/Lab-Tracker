(() => {
'use strict';

/* Weld Shop Tracker. No server: everything lives in this browser (IndexedDB) until exported.
   Students are booth numbers + random codes. Names live only in the school Sheet's Key tab. */

const PREVIEW = /*@PREVIEW@*/false;
const VERSION = '1.2.2';

// ---------- small helpers ----------
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => {
  try { if (crypto.randomUUID) return crypto.randomUUID(); } catch (e) { /* fall through */ }
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
};
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hm = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const parseYmd = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
const today = () => ymd(new Date());
const mondayOf = s => { const d = parseYmd(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return ymd(d); };
const fmtDate = s => parseYmd(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const fmtDay = s => parseYmd(s).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const fmtTime = t => { if (!t) return ''; const [h, m] = t.split(':').map(Number); return `${((h + 11) % 12) + 1}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`; };
const fmtStamp = d => d.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const fmtLong = s => parseYmd(s).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
const ordinal = n => n + ((n % 100 >= 11 && n % 100 <= 13) ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] || 'th'));
const fmtPts = p => (p > 0 ? `+${p}` : p < 0 ? `−${Math.abs(p)}` : '0');
const pct = v => (v == null ? '—' : `${Math.round(v * 100)}%`);
const fix1 = v => (v == null ? '—' : v.toFixed(1));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const slug = s => String(s || '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'x';
const vibrate = () => { try { navigator.vibrate && navigator.vibrate(12); } catch (e) { /* ignore */ } };

const CODE_CHARS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const CODE_LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ', CODE_DIGITS = '23456789';
// Letter then digit (K7Q4): spreadsheets never read these as numbers (7E23) or dates.
function makeCode(r) { return CODE_LETTERS[r(CODE_LETTERS.length)] + CODE_DIGITS[r(CODE_DIGITS.length)] + CODE_CHARS[r(CODE_CHARS.length)] + CODE_CHARS[r(CODE_CHARS.length)]; }
function randInt(n) {
  try { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; } catch (e) { return Math.floor(Math.random() * n); }
}

// ---------- storage ----------
const store = {
  idb: null,
  mem: { kv: new Map(), events: new Map(), photos: new Map() },
  async init() {
    if (!('indexedDB' in window)) return;
    try {
      this.idb = await new Promise((resolve, reject) => {
        const req = indexedDB.open('weld-shop-tracker', 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv', { keyPath: 'k' });
          if (!db.objectStoreNames.contains('events')) db.createObjectStore('events', { keyPath: 'id' });
          if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos', { keyPath: 'id' });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        req.onblocked = () => reject(new Error('blocked'));
      });
    } catch (e) { this.idb = null; }
  },
  get ok() { return !!this.idb; },
  tx(name, mode, fn) {
    return new Promise((resolve, reject) => {
      const t = this.idb.transaction(name, mode);
      const r = fn(t.objectStore(name));
      t.oncomplete = () => resolve(r && 'result' in r ? r.result : undefined);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  },
  key(name, v) { return name === 'kv' ? v.k : v.id; },
  async get(name, k) { if (!this.idb) return this.mem[name].get(k); return this.tx(name, 'readonly', s => s.get(k)); },
  async put(name, v) { if (!this.idb) { this.mem[name].set(this.key(name, v), v); return; } return this.tx(name, 'readwrite', s => s.put(v)); },
  async putMany(name, arr) {
    if (!this.idb) { arr.forEach(v => this.mem[name].set(this.key(name, v), v)); return; }
    return this.tx(name, 'readwrite', s => { arr.forEach(v => s.put(v)); return null; });
  },
  async del(name, k) { if (!this.idb) { this.mem[name].delete(k); return; } return this.tx(name, 'readwrite', s => s.delete(k)); },
  async all(name) { if (!this.idb) return [...this.mem[name].values()]; return this.tx(name, 'readonly', s => s.getAll()); },
  async clear(name) { if (!this.idb) { this.mem[name].clear(); return; } return this.tx(name, 'readwrite', s => s.clear()); },
};

// ---------- state ----------
let S = null;          // config (classes, seats, codes, projects, settings)
let EV = [];           // the event log, append-only (void instead of delete, except immediate undo)
const UI = {
  multi: false, selected: new Set(), sweep: null, openSecs: new Set(['classes']), cp: null,
  rsort: { key: 'emp', dir: 1 }, rfilter: '', updateReady: false, photoURLs: new Map(), saving: false,
};

function defaultConfig() {
  const mk = (label, type, pts, id) => ({ id: id || uid(), label, type, pts, active: true });
  return {
    v: 1, classes: [], seats: [],
    behaviors: [
      mk('Late', 'neg', -1, 'late'), mk('Absent', 'neg', -2, 'absent'), mk('Off task', 'neg', -1, 'offtask'),
      mk('Sleeping', 'neg', -2, 'sleeping'), mk('Horseplay', 'neg', -2, 'horseplay'), mk('No PPE', 'neg', -3, 'noppe'),
      mk('Assisting others', 'pos', 1, 'assist'), mk('Cleaned communal areas', 'pos', 1, 'communal'),
      mk('Verbal warning', 'action', 0, 'warning'), mk('Parent contact', 'action', 0, 'parent'),
      mk('Detention', 'action', 0, 'detention'), mk('Office referral', 'action', 0, 'referral'),
    ],
    tasks: ['Shop cleanup duty', 'Restock rod and wire', 'Cut practice coupons', 'Retake safety quiz', 'Empty scrap bins']
      .map(label => ({ id: uid(), label, active: true })),
    reasons: ['Tools not put away', 'Floor not swept', 'Leads or hoses not coiled', 'Scrap or slag left', 'Gas valve left open', 'Curtain not closed']
      .map(label => ({ id: uid(), label, active: true })),
    boothCount: 12, storageBooths: [],
    projects: [], base: 10, boothPts: -1, boothMajorPts: -3, patternN: 3, patternDays: 30, stampPhotos: true,
    lastExport: null, lastExportN: 0, sample: false,
    ui: { cls: null, tab: 'class', project: null, range: 'week', rcls: 'all', from: null, to: null, hideInstall: false },
  };
}

async function save() {
  try { await store.put('kv', { k: 'config', v: JSON.parse(JSON.stringify(S)) }); }
  catch (e) { toast('Could not save settings on this phone. Check free storage.'); }
}

const classById = id => S.classes.find(c => c.id === id);
const seatById = id => S.seats.find(s => s.id === id);
const behById = id => S.behaviors.find(b => b.id === id);
const taskById = id => S.tasks.find(t => t.id === id);
const projById = id => S.projects.find(p => p.id === id);
const SIDES = ['A', 'B', 'C'];
const MAX_PER_BOOTH = 3;
const bySeat = (a, b) => a.booth - b.booth || (a.side || '').localeCompare(b.side || '');
const seatsOf = clsId => S.seats.filter(s => s.cls === clsId && s.active).sort(bySeat);
const boothMates = s => S.seats.filter(x => x.active && x.cls === s.cls && x.booth === s.booth && x.id !== s.id);
// Students sharing a booth show as 3A, 3B, 3C. A student alone in a booth is just 3.
const sideOf = s => (s && s.active && s.side && boothMates(s).length ? s.side : '');
const bl = s => `${s.booth}${sideOf(s)}`;
const isStorage = b => S.storageBooths.includes(Number(b));
const occupants = (clsId, b) => seatsOf(clsId).filter(s => s.booth === Number(b));
function placeSeat(s) {
  const mates = boothMates(s);
  if (!mates.length) return;
  const used = new Set(mates.map(m => m.side).filter(Boolean));
  for (const m of mates) if (!m.side) { m.side = SIDES.find(l => !used.has(l)); used.add(m.side); }
  if (!s.side || used.has(s.side)) s.side = SIDES.find(l => !used.has(l)) || '';
}
// First empty welding booth; once every booth has someone, the first booth with room to share.
function freeBooth(clsId) {
  const occ = new Map();
  seatsOf(clsId).forEach(s => occ.set(s.booth, (occ.get(s.booth) || 0) + 1));
  const weld = [];
  for (let b = 1; b <= S.boothCount; b++) if (!isStorage(b)) weld.push(b);
  for (let k = 0; k < MAX_PER_BOOTH; k++) { const b = weld.find(x => (occ.get(x) || 0) === k); if (b) return b; }
  return null;
}
// The room in booth order: booths with students in this class, plus the storage booths.
function boothCells(clsId) {
  const by = new Map();
  for (const s of seatsOf(clsId)) { if (!by.has(s.booth)) by.set(s.booth, []); by.get(s.booth).push(s); }
  const nums = new Set([...by.keys(), ...S.storageBooths]);
  return [...nums].sort((a, b) => a - b).map(b => (by.has(b) ? { booth: b, seats: by.get(b) } : { booth: b, storage: true }));
}
const slotHTML = b => `<div class="slot" role="img" aria-label="Booth ${b}: storage"><span class="bn-label">BOOTH</span><span class="bn">${b}</span><span class="state">Storage</span></div>`;
function loadConfig(raw) {
  const c = Object.assign(defaultConfig(), raw);
  c.ui = Object.assign(defaultConfig().ui, raw.ui || {});
  if (raw.boothCount == null) { const mx = (c.seats || []).reduce((m, x) => Math.max(m, x.booth || 0), 0); c.boothCount = mx || 12; }
  if (!Array.isArray(c.storageBooths)) c.storageBooths = [];
  return c;
}
const activeEv = () => EV.filter(e => !e.voided);
function curClass() {
  if (!S || !S.classes.length) return null;
  return classById(S.ui.cls) || S.classes[0];
}
function newCode() {
  const used = new Set(S.seats.map(s => s.code));
  for (;;) { const c = makeCode(randInt); if (!used.has(c)) return c; }
}
function classByTime() {
  const now = hm(new Date());
  return S.classes.find(c => c.start && c.end && now >= c.start && now <= c.end);
}

// ---------- event log ----------
function makeEvent(e) {
  const d = new Date();
  return Object.assign({
    id: uid(), ts: d.getTime(), date: ymd(d), time: hm(d), cls: '', clsName: '', booth: null, code: '', kind: '',
    item: '', ref: '', status: '', pts: 0, project: '', projectId: '', count: 0, note: '', photo: '', sweep: '', task: '', mates: '', matesResp: '', voided: false,
  }, e);
}
async function logEvent(e) {
  const ev = makeEvent(e);
  if (ev.cls && !ev.clsName) ev.clsName = classById(ev.cls)?.name || '';
  EV.push(ev);
  try { await store.put('events', ev); } catch (err) { toast('Could not save that entry. Check free storage.'); }
  if (ev.kind !== 'day' && ev.cls) await ensureDay(ev.cls, ev.date);
  return ev;
}
const hasDay = (cls, date) => EV.some(e => e.kind === 'day' && e.cls === cls && e.date === date && !e.voided);
async function ensureDay(cls, date) { if (!hasDay(cls, date)) await logEvent({ kind: 'day', cls, date, status: 'Held' }); }
async function removeEvents(ids) {
  for (const id of ids) {
    const i = EV.findIndex(e => e.id === id);
    if (i < 0) continue;
    const [ev] = EV.splice(i, 1);
    try { await store.del('events', id); if (ev.photo) await store.del('photos', ev.photo); } catch (e) { /* ignore */ }
  }
}
async function setVoid(ids, v) {
  for (const id of ids) {
    const ev = EV.find(e => e.id === id);
    if (!ev) continue;
    ev.voided = v; ev.voidedAt = v ? Date.now() : null;
    try { await store.put('events', ev); } catch (e) { /* ignore */ }
  }
}

// ---------- toast & dialogs ----------
let toastTimer = null;
function toast(msg, undo, ms) {
  const t = $('#toast');
  t.innerHTML = `<span class="msg">${esc(msg)}</span>${undo ? '<button type="button" id="toast-undo">Undo</button>' : ''}`;
  t.hidden = false;
  clearTimeout(toastTimer);
  if (undo) $('#toast-undo').onclick = async () => { t.hidden = true; clearTimeout(toastTimer); await undo(); render(); };
  toastTimer = setTimeout(() => { t.hidden = true; }, ms || (undo ? 2500 : 3200));
}
function ask({ title, body = '', ok = 'OK', danger = false }) {
  return new Promise(resolve => {
    const root = document.createElement('div');
    root.innerHTML = `<div class="scrim" style="z-index:60"></div>
      <div class="sheet" role="alertdialog" aria-modal="true" aria-labelledby="ask-t" style="z-index:61">
        <div class="grab"></div>
        <h2 id="ask-t" style="font-size:19px;font-weight:800">${esc(title)}</h2>
        ${body ? `<p style="margin:0;color:var(--ink-2)">${esc(body)}</p>` : ''}
        <div class="row"><button type="button" class="btn" data-x="no" style="flex:1">Cancel</button>
        <button type="button" class="btn ${danger ? 'danger' : 'primary'}" data-x="yes" style="flex:1">${esc(ok)}</button></div>
      </div>`;
    document.body.appendChild(root);
    const done = v => { root.remove(); resolve(v); };
    root.addEventListener('click', e => {
      const x = e.target.closest('[data-x]');
      if (x) done(x.dataset.x === 'yes'); else if (e.target.classList.contains('scrim')) done(false);
    });
    root.querySelector('[data-x="yes"]').focus();
  });
}
function openSheet(html, label) {
  const root = $('#sheet-root');
  const keepScroll = root.querySelector('.sheet')?.scrollTop || 0;
  const wasOpen = !!root.firstChild;
  root.innerHTML = `<div class="scrim" data-act="close-sheet"></div>
    <div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(label || 'Details')}"><div class="grab"></div>${html}</div>`;
  const sh = root.querySelector('.sheet');
  if (wasOpen) sh.scrollTop = keepScroll;
  else (sh.querySelector('.codebtn, .btn.primary, button') || sh).focus({ preventScroll: true });
}
function closeSheet() { $('#sheet-root').innerHTML = ''; UI.cp = null; UI.sheetMode = null; }
const sheetOpen = () => !!$('#sheet-root').firstChild;
const closeBtn = '<button type="button" class="icon-btn" data-act="close-sheet" aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>';

// ---------- labels ----------
function itemLabel(e) {
  if (e.kind === 'behavior' || e.kind === 'action') return behById(e.ref)?.label || e.item;
  if (e.kind === 'task') return taskById(e.ref)?.label || e.item;
  if (e.kind === 'checkpoint') {
    const p = projById(e.projectId);
    return p?.checkpoints.find(c => c.id === e.ref)?.name || e.item;
  }
  return e.item;
}
function projLabel(e) { return projById(e.projectId)?.name || e.project; }
function clsLabel(e) { return classById(e.cls)?.name || e.clsName || ''; }
function evTitle(e) {
  switch (e.kind) {
    case 'behavior': case 'action': return itemLabel(e);
    case 'task': return `${itemLabel(e)} · ${e.status === 'Done' ? 'done' : 'assigned'}`;
    case 'checkpoint': return `${itemLabel(e)} · ${e.status}`;
    case 'booth': return `${e.status === 'Major' ? 'Major booth mess' : 'Booth left dirty'} · ${e.item}`;
    case 'sweep': return `Booth check (${e.count} booths)`;
    case 'day': return 'Class day';
    default: return e.item || e.kind;
  }
}
// An entry can carry several photos; their ids are stored ';'-separated in e.photo.
const photoIds = e => (e && e.photo ? String(e.photo).split(';').filter(Boolean) : []);
function photoNames(e) {
  const ids = photoIds(e);
  if (!ids.length) return [];
  const base = e.kind === 'booth'
    ? `${e.date}_${slug(clsLabel(e))}_${e.code}_booth-${e.booth}_${e.status === 'Major' ? 'major' : 'dirty'}`
    : `${e.date}_${slug(clsLabel(e))}_${e.code}_${slug(projLabel(e))}_${slug(itemLabel(e))}`;
  return ids.map((id, i) => `${base}_${ids.length > 1 ? `${i + 1}-` : ''}${id.slice(0, 4)}.jpg`);
}

function shareInfo(e) {
  if (!e || e.kind !== 'booth' || !e.mates) return null;
  const total = e.mates.split(';').length + 1, marked = (e.matesResp ? e.matesResp.split(';').length : 0) + 1;
  return { total, marked };
}
function shareText(e) {
  const x = shareInfo(e);
  if (!x) return '';
  if (x.marked === 1) return `Shared booth (${x.total} students); only this student was marked responsible`;
  if (x.marked === x.total) return `Shared booth (${x.total} students); every student in it was marked responsible`;
  return `Shared booth (${x.total} students); ${x.marked} of them were marked responsible`;
}
function shareShort(e) {
  const x = shareInfo(e);
  if (!x) return '';
  return x.marked === 1 ? 'shared booth, only this student marked' : x.marked === x.total ? 'shared booth, all marked' : `shared booth, ${x.marked} of ${x.total} marked`;
}

// ---------- photos ----------
async function photoURL(id) {
  if (!id) return null;
  if (UI.photoURLs.has(id)) return UI.photoURLs.get(id);
  try {
    const rec = await store.get('photos', id);
    if (!rec) return null;
    const url = URL.createObjectURL(new Blob([rec.buf], { type: rec.type || 'image/jpeg' }));
    UI.photoURLs.set(id, url);
    return url;
  } catch (e) { return null; }
}
async function hydrateThumbs(root) {
  for (const img of root.querySelectorAll('img[data-photo]')) {
    const url = await photoURL(img.dataset.photo);
    if (url) img.src = url; else { img.alt = 'Photo exported'; img.classList.add('gone'); }
  }
}
function loadImg(src) {
  return new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = src; });
}
function stampCaption(ctx, w, h, lines) {
  const fs = Math.max(14, Math.round(Math.min(w, h) * 0.034));
  const lh = Math.round(fs * 1.32), pad = Math.round(fs * 0.65);
  const bh = lh * lines.length + pad * 2 - Math.round(fs * 0.25);
  ctx.fillStyle = 'rgba(0,0,0,0.66)';
  ctx.fillRect(0, h - bh, w, bh);
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'top';
  lines.forEach((t, i) => {
    let size = fs;
    const font = () => `${i === 0 ? 700 : 500} ${size}px system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif`;
    ctx.font = font();
    while (ctx.measureText(t).width > w - pad * 2 && size > 9) { size--; ctx.font = font(); }
    ctx.fillText(t, pad, h - bh + pad + i * lh);
  });
}
async function shrinkPhoto(file, caption) {
  // Re-encoding through a canvas drops EXIF data, including GPS location.
  // The optional caption is burned into the image so it explains itself outside the app.
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImg(url);
    const w = img.naturalWidth, h = img.naturalHeight, s = Math.min(1, 1600 / Math.max(w, h));
    const cv = document.createElement('canvas');
    cv.width = Math.round(w * s); cv.height = Math.round(h * s);
    const ctx = cv.getContext('2d');
    ctx.drawImage(img, 0, 0, cv.width, cv.height);
    if (caption && caption.length) stampCaption(ctx, cv.width, cv.height, caption);
    const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.82));
    return blob || file;
  } finally { URL.revokeObjectURL(url); }
}

// ---------- derived data ----------
function todayEvents(clsId) { const t = today(); return EV.filter(e => !e.voided && e.cls === clsId && e.date === t); }
function openTasks(code) {
  const done = new Set(EV.filter(e => !e.voided && e.kind === 'task' && e.status === 'Done').map(e => e.task));
  return EV.filter(e => !e.voided && e.kind === 'task' && e.status === 'Assigned' && e.code === code && !done.has(e.task));
}
function cpLatest() {
  const m = new Map();
  for (const e of EV) {
    if (e.voided || e.kind !== 'checkpoint') continue;
    const k = `${e.code}|${e.projectId}|${e.ref}`;
    const cur = m.get(k);
    if (!cur || e.ts > cur.ts) m.set(k, e);
  }
  return m;
}
const STATUS = { Approved: 'approved', 'Needs work': 'shown', Redo: 'redo' };
function todaySweep(clsId) { const t = today(); return EV.find(e => !e.voided && e.kind === 'sweep' && e.cls === clsId && e.date === t); }

function rangeDates() {
  const t = today();
  switch (S.ui.range) {
    case 'today': return [t, t];
    case 'month': { const d = parseYmd(t); return [ymd(new Date(d.getFullYear(), d.getMonth(), 1)), ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0))]; }
    case 'custom': {
      const a = S.ui.from || mondayOf(t), b = S.ui.to || t;
      return a <= b ? [a, b] : [b, a];
    }
    default: { const m = mondayOf(t); return [m, addDays(m, 6)]; }
  }
}
function evIn(from, to, clsIds) { const set = new Set(clsIds); return EV.filter(e => !e.voided && e.date >= from && e.date <= to && set.has(e.cls)); }
function classStats(cls, from, to, evs) {
  const ev = evs ? evs.filter(e => e.cls === cls.id) : evIn(from, to, [cls.id]);
  const days = [...new Set(ev.filter(e => e.kind === 'day').map(e => e.date))];
  const seats = seatsOf(cls.id);
  let sd = 0;
  for (const s of seats) sd += days.filter(d => d >= (s.since || '0000')).length;
  const beh = ev.filter(e => e.kind === 'behavior');
  const neg = beh.filter(e => e.pts < 0).length, pos = beh.filter(e => e.pts > 0).length;
  const absent = beh.filter(e => e.ref === 'absent').length;
  const checks = ev.filter(e => e.kind === 'sweep').reduce((a, e) => a + (e.count || 0), 0);
  const fails = ev.filter(e => e.kind === 'booth').length;
  const approved = ev.filter(e => e.kind === 'checkpoint' && e.status === 'Approved').length;
  return {
    cls, days: days.length, students: seats.length, sd, neg, pos, absent, checks, fails, approved,
    negRate: sd ? (neg / sd) * 5 : null, posRate: sd ? (pos / sd) * 5 : null, absRate: sd ? absent / sd : null,
    pass: checks ? 1 - fails / checks : null,
  };
}
function studentRows(cls, from, to) {
  const ev = evIn(from, to, [cls.id]);
  const days = [...new Set(ev.filter(e => e.kind === 'day').map(e => e.date))];
  const codesWithEv = new Set(ev.map(e => e.code).filter(Boolean));
  const seats = S.seats.filter(s => s.cls === cls.id && (s.active || codesWithEv.has(s.code)));
  return seats.map(s => {
    const mine = ev.filter(e => e.code === s.code);
    const d = days.filter(x => x >= (s.since || '0000')).length;
    const beh = mine.filter(e => e.kind === 'behavior');
    const neg = beh.filter(e => e.pts < 0), pos = beh.filter(e => e.pts > 0);
    const flags = mine.filter(e => e.kind === 'booth').length;
    const major = mine.filter(e => e.kind === 'booth' && e.status === 'Major').length;
    const net = mine.reduce((a, e) => a + (['behavior', 'action', 'booth'].includes(e.kind) ? (e.pts || 0) : 0), 0);
    const emp = d ? clamp((d * S.base + net) / (d * S.base), 0, 1) : null;
    const counts = {};
    neg.forEach(e => { const l = itemLabel(e); counts[l] = (counts[l] || 0) + 1; });
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return { seat: s, days: d, neg: neg.length, pos: pos.length, flags, major, net, emp, top: top ? `${top[0]} ×${top[1]}` : '' };
  });
}

// ---------- rendering: shell ----------
function render() {
  const main = $('#main');
  const nav = $('#nav');
  const hdrSel = $('#cls-select');
  if (!S) {
    nav.hidden = true; hdrSel.hidden = true; $('#setup-btn').hidden = true;
    $('#hdr-date').textContent = 'Weld Shop Tracker';
    main.innerHTML = viewWelcome();
    return;
  }
  nav.hidden = false; hdrSel.hidden = false; $('#setup-btn').hidden = false;
  const c = curClass();
  hdrSel.innerHTML = S.classes.length
    ? S.classes.map(k => `<option value="${esc(k.id)}"${c && k.id === c.id ? ' selected' : ''}>${esc(k.name)}</option>`).join('')
    : '<option>No classes yet</option>';
  $('#hdr-date').textContent = `${fmtDay(today())}${S.sample ? ' · sample data' : ''}`;
  const tab = S.ui.tab;
  $('#setup-btn').setAttribute('aria-pressed', String(tab === 'setup'));
  nav.querySelectorAll('button').forEach(b => {
    if (b.dataset.tab === tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  let html = topBanners(tab);
  if (tab === 'class') html += viewClass();
  else if (tab === 'check') html += viewCheck();
  else if (tab === 'booths') html += viewBooths();
  else if (tab === 'reports') html += viewReports();
  else if (tab === 'setup') html += viewSetup();
  main.innerHTML = html;
  if (tab === 'setup') fillStorageInfo();
  renderApplyBar();
}
function topBanners(tab) {
  let h = '';
  if (UI.updateReady) h += `<div class="banner info"><span>A new version of the app is ready.</span><button type="button" class="btn sm" data-act="apply-update">Reload</button></div>`;
  if (PREVIEW && tab === 'class') h += `<div class="banner info"><span>Preview with made-up students. Exports and offline use work in the installed copy.</span></div>`;
  if (!store.ok && !PREVIEW) h += `<div class="banner"><span>This browser is blocking storage, so nothing will be kept after you close the app.</span></div>`;
  if (!PREVIEW && !S.ui.hideInstall && tab === 'class' && !isStandalone()) {
    h += `<div class="banner info"><span>Add this app to your home screen so it opens with no signal and the phone keeps its data. iPhone: Share, then Add to Home Screen. Android: menu, then Install app.</span><button type="button" class="btn sm" data-act="hide-install">Got it</button></div>`;
  }
  if ((tab === 'class' && !PREVIEW) || tab === 'reports') {
    const due = exportDue();
    if (due) h += `<div class="banner"><span>${due.days == null ? 'Not exported yet' : `Last export ${due.days} days ago`} · ${due.n} new entries live only on this phone.</span><button type="button" class="btn sm" data-act="export-events">Export now</button></div>`;
  }
  return h;
}
function isStandalone() {
  try { return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch (e) { return false; }
}
function exportDue() {
  const n = EV.length - (S.lastExportN || 0);
  if (n <= 0) return null;
  if (S.lastExport) {
    const days = Math.floor((Date.now() - S.lastExport) / 864e5);
    return days >= 7 ? { n, days } : null;
  }
  const oldest = EV.reduce((m, e) => Math.min(m, e.ts), Infinity);
  return Date.now() - oldest > 3 * 864e5 ? { n, days: null } : null;
}
function emptyState(title, body, btn, act) {
  return `<div class="empty"><h2>${esc(title)}</h2><p>${esc(body)}</p>${btn ? `<button type="button" class="btn primary" data-act="${act}">${esc(btn)}</button>` : ''}</div>`;
}

// ---------- welcome ----------
function viewWelcome() {
  return `<section class="welcome">
    <div class="tagstamp"><span class="bn">07</span><span class="mono muted">K7Q4</span></div>
    <h1>Track the shop from your pocket.</h1>
    <p class="lede">Tap a booth, tap what happened. Lates, PPE, booth cleanup and project checkpoints all land in one log you export to your school Sheet. Students show up only as booth numbers and random codes.</p>
    <div class="card">
      <h2>Try it first</h2>
      <p class="muted small">Loads three made-up classes with a month of entries. Erase it from Setup when you're ready.</p>
      <button type="button" class="btn" data-act="start-sample">Load sample data</button>
    </div>
    <form class="card" id="w-form" data-act-submit="start-own">
      <h2>Set up your first class</h2>
      <label class="lbl" for="w-cls">Class name<input class="field" id="w-cls" value="Period 1" maxlength="40" required></label>
      <div class="edit-grid">
        <label class="lbl" for="w-booths">Students<input class="field num" id="w-booths" type="number" min="1" max="60" value="12" required></label>
        <label class="lbl" for="w-shop">Booths in the shop<input class="field num" id="w-shop" type="number" min="1" max="60" value="12" required></label>
        <label class="lbl" for="w-storage" style="grid-column: 1 / -1">Storage booths, if any<input class="field" id="w-storage" placeholder="For example 7, 8" inputmode="numeric" autocomplete="off"></label>
        <label class="lbl" for="w-start">Starts<input class="field" id="w-start" type="time" value="07:45"></label>
        <label class="lbl" for="w-end">Ends<input class="field" id="w-end" type="time" value="09:15"></label>
      </div>
      <p class="muted small">Students fill the empty welding booths first; any extra students share a booth. Start and end times let the app open to whichever class is in session. You can change all of this later in Setup.</p>
      <button type="submit" class="btn primary">Create class</button>
    </form>
    <div class="card">
      <h2>Moving from another phone?</h2>
      <p class="muted small">Restore the backup file you saved from Setup on the old phone.</p>
      <button type="button" class="btn" data-act="restore">Restore from a backup file</button>
    </div>
  </section>`;
}

// ---------- Class tab ----------
function viewClass() {
  const c = curClass();
  if (!c) return emptyState('No classes yet', 'Add a class and its booths in Setup.', 'Open Setup', 'go-setup');
  const seats = seatsOf(c.id);
  if (!seats.length) return emptyState('No booths in this class', 'Add students to booths in Setup. Each one gets a random code.', 'Open Setup', 'go-setup');
  const t = today();
  const tev = todayEvents(c.id);
  const held = hasDay(c.id, t);
  const tiles = boothCells(c.id).map(cell => {
    if (cell.storage) return slotHTML(cell.booth);
    if (cell.seats.length === 1) return tileHTML(cell.seats[0], tev);
    return `<div class="pair${cell.seats.length > 2 ? ' n3' : ''}" role="group" aria-label="Booth ${cell.booth}, shared by ${cell.seats.length} students"><div class="pair-head">Booth ${cell.booth} · shared</div><div class="pair-tiles">${cell.seats.map(s => tileHTML(s, tev)).join('')}</div></div>`;
  }).join('');
  return `<div class="strip">
      ${held ? `<button type="button" class="pill ok" data-act="unmark-day"><span class="dot"></span>Class day logged</button>`
             : `<button type="button" class="pill warn" data-act="mark-day"><span class="dot"></span>Log today as a class day</button>`}
      <span style="flex:1"></span>
      <button type="button" class="chip-btn" data-act="toggle-multi" aria-pressed="${UI.multi}">${UI.multi ? 'Done selecting' : 'Select several'}</button>
    </div>
    <div class="tiles">${tiles}</div>
    <p class="muted small">${UI.multi ? 'Tap booths to select them, then choose what to log.' : 'Tap a booth to log. Days with no entries still count when you log the class day.'}</p>`;
}
function tileHTML(s, tev) {
  const mine = tev.filter(e => e.code === s.code);
  const beh = mine.filter(e => e.kind === 'behavior' || e.kind === 'action');
  const net = mine.reduce((a, e) => a + (['behavior', 'action', 'booth'].includes(e.kind) ? e.pts || 0 : 0), 0);
  const groups = new Map();
  for (const e of beh) {
    const l = itemLabel(e);
    const g = groups.get(l) || { n: 0, cls: e.kind === 'action' ? 'act' : e.pts < 0 ? 'neg' : 'pos' };
    g.n++; groups.set(l, g);
  }
  const chips = [...groups.entries()];
  const shown = chips.slice(0, 3).map(([l, g]) => `<span class="tchip ${g.cls}">${esc(l)}${g.n > 1 ? ` ×${g.n}` : ''}</span>`).join('');
  const more = chips.length > 3 ? `<span class="tchip act">+${chips.length - 3}</span>` : '';
  const tasks = openTasks(s.code).length;
  const absent = beh.some(e => e.ref === 'absent');
  const sel = UI.multi && UI.selected.has(s.id);
  const badge = UI.multi ? '<span class="check" aria-hidden="true"></span>'
    : net ? `<span class="net ${net < 0 ? 'neg' : 'pos'}">${fmtPts(net)}</span>` : '';
  const side = sideOf(s);
  const desc = `Booth ${bl(s)}, code ${s.code}${chips.length ? ', today: ' + chips.map(([l, g]) => l + (g.n > 1 ? ' times ' + g.n : '')).join(', ') : ''}`;
  return `<button type="button" class="tile${sel ? ' selected' : ''}${absent ? ' absent' : ''}" data-act="tile" data-seat="${esc(s.id)}" aria-label="${esc(desc)}"${UI.multi ? ` aria-pressed="${sel}"` : ''}>
    <span class="bn-label">BOOTH</span><span class="bn">${s.booth}${side ? `<span class="side">${side}</span>` : ''}</span><span class="code">${esc(s.code)}</span>
    ${badge}
    <span class="chips">${shown}${more}${tasks ? `<span class="tchip task">${tasks} task${tasks > 1 ? 's' : ''}</span>` : ''}</span>
  </button>`;
}
function renderApplyBar() {
  document.querySelector('.applybar')?.remove();
  if (!S || S.ui.tab !== 'class' || !UI.multi) return;
  const n = UI.selected.size;
  const bar = document.createElement('div');
  bar.className = 'applybar';
  bar.innerHTML = `<button type="button" class="btn ghost" data-act="multi-clear"${n ? '' : ' disabled'}>Clear</button>
    <button type="button" class="btn primary" data-act="multi-apply"${n ? '' : ' disabled'}>Log for ${n} student${n === 1 ? '' : 's'}</button>`;
  document.body.appendChild(bar);
}

function codeSheet(seatIds) {
  const seats = seatIds.map(seatById).filter(Boolean);
  if (!seats.length) return;
  const single = seats.length === 1 ? seats[0] : null;
  const act = S.behaviors.filter(b => b.active);
  const btn = b => `<button type="button" class="codebtn ${b.type}" data-act="code" data-code="${esc(b.id)}"><span>${esc(b.label)}</span><span class="pts">${fmtPts(b.pts)}</span></button>`;
  const negs = act.filter(b => b.type === 'neg'), poss = act.filter(b => b.type === 'pos'), acts = act.filter(b => b.type === 'action');
  const tasks = S.tasks.filter(t => t.active);
  let head;
  if (single) {
    const tev = todayEvents(single.cls).filter(e => e.code === single.code);
    const net = tev.reduce((a, e) => a + (['behavior', 'action', 'booth'].includes(e.kind) ? e.pts || 0 : 0), 0);
    head = `<div class="sheet-head"><div><h2>Booth ${bl(single)}</h2><div class="sub"><span class="mono">${esc(single.code)}</span> · today ${fmtPts(net)}</div></div>${closeBtn}</div>`;
  } else {
    head = `<div class="sheet-head"><div><h2>${seats.length} students</h2><div class="sub">Booths ${[...seats].sort(bySeat).map(bl).join(', ')}</div></div>${closeBtn}</div>`;
  }
  let html = head;
  if (negs.length) html += `<div class="sec-label">Needs work</div><div class="codes">${negs.map(btn).join('')}</div>`;
  if (poss.length) html += `<div class="sec-label">Positive</div><div class="codes">${poss.map(btn).join('')}</div>`;
  html += `<details id="note-box"><summary>Add a note to the next entry</summary>
      <textarea class="field" id="sheet-note" maxlength="200" placeholder="What happened, in a few factual words"></textarea>
      <p class="muted small" style="margin:4px 0 0">Keep it factual. Parents can request these records.</p></details>`;
  if (acts.length) html += `<div class="sec-label">Action taken</div><div class="inline-form"><select class="field" id="act-sel" aria-label="Action taken">${acts.map(a => `<option value="${esc(a.id)}">${esc(a.label)}</option>`).join('')}</select><button type="button" class="btn" data-act="log-action">Log</button></div>`;
  if (tasks.length) html += `<div class="sec-label">Assign a task</div><div class="inline-form"><select class="field" id="task-sel" aria-label="Task">${tasks.map(t => `<option value="${esc(t.id)}">${esc(t.label)}</option>`).join('')}</select><button type="button" class="btn" data-act="assign-task">Assign</button></div>`;
  if (single) {
    const ot = openTasks(single.code);
    if (ot.length) {
      html += `<div class="sec-label">Open tasks</div><div class="list">${ot.map(e => `<div class="li"><div class="main"><div class="t">${esc(itemLabel(e))}</div><div class="s">Assigned ${fmtDate(e.date)}</div></div><button type="button" class="btn sm" data-act="task-done" data-ev="${esc(e.id)}">Mark done</button></div>`).join('')}</div>`;
    }
    const tev = todayEvents(single.cls).filter(e => e.code === single.code && e.kind !== 'day').sort((a, b) => b.ts - a.ts);
    html += `<div class="row between"><div class="sec-label">Today</div><button type="button" class="btn sm ghost" data-act="history" data-seat="${esc(single.id)}">Full history</button></div>`;
    html += tev.length ? `<div class="list">${tev.map(e => evRow(e, false)).join('')}</div>` : '<p class="muted small" style="margin:0">Nothing logged today.</p>';
  }
  UI.sheetSeats = seats.map(s => s.id);
  UI.sheetMode = { type: 'code' };
  openSheet(html, single ? `Booth ${bl(single)}` : `${seats.length} students`);
  hydrateThumbs($('#sheet-root'));
}
function evRow(e, withDate = true) {
  const p = ['behavior', 'action', 'booth'].includes(e.kind) && e.pts ? `<span class="p ${e.pts < 0 ? 'neg' : 'pos'}">${fmtPts(e.pts)}</span>` : '';
  const ids = photoIds(e);
  const sub = [withDate ? fmtDate(e.date) : '', fmtTime(e.time), withDate ? clsLabel(e) : '', e.kind === 'checkpoint' ? projLabel(e) : '', shareShort(e), ids.length > 1 ? `${ids.length} photos` : '', e.note].filter(Boolean).map(esc).join(' · ');
  const thumb = ids.length ? `<img class="thumb" data-photo="${esc(ids[0])}" alt="${e.kind === 'booth' ? 'Booth photo' : 'Weld photo'}" data-act="view-photo" data-ev="${esc(e.id)}">` : '';
  const btn = e.voided ? `<button type="button" class="btn sm ghost" data-act="unvoid" data-ev="${esc(e.id)}">Restore</button>`
    : `<button type="button" class="btn sm ghost" data-act="void" data-ev="${esc(e.id)}">Remove</button>`;
  return `<div class="li${e.voided ? ' voided' : ''}">${thumb}<div class="main"><div class="t">${esc(evTitle(e))}</div><div class="s">${sub}${e.voided ? ' · removed' : ''}</div></div>${p}${e.kind === 'day' || e.kind === 'sweep' ? '' : btn}</div>`;
}
async function historySheet(seatId) {
  const s = seatById(seatId);
  if (!s) return;
  const all = EV.filter(e => e.code === s.code && e.kind !== 'day').sort((a, b) => b.ts - a.ts);
  const week = mondayOf(today());
  const net = (from) => all.filter(e => !e.voided && e.date >= from && ['behavior', 'action', 'booth'].includes(e.kind)).reduce((a, e) => a + (e.pts || 0), 0);
  const monthStart = today().slice(0, 8) + '01';
  const cls = classById(s.cls);
  const b30 = boothPattern(s.code, true);
  const html = `<div class="sheet-head"><div><h2>Booth ${bl(s)} · <span class="mono">${esc(s.code)}</span></h2>
      <div class="sub">${esc(cls?.name || '')}${s.active ? '' : ' · former student'} · since ${fmtDate(s.since)}</div></div>${closeBtn}</div>
    <div class="kpis"><div class="kpi"><div class="v">${fmtPts(net(week))}</div><div class="k">This week</div></div>
      <div class="kpi"><div class="v">${fmtPts(net(monthStart))}</div><div class="k">This month</div></div>
      <div class="kpi"><div class="v">${b30.n}</div><div class="k">Dirty booth, last ${S.patternDays} days${b30.major ? ` (${b30.major} major)` : ''}</div></div></div>
    <button type="button" class="btn" data-act="record-menu" data-seat="${esc(s.id)}">Export record (PDF)</button>
    <div class="sec-label">${all.length} entries</div>
    ${all.length ? `<div class="list">${all.slice(0, 300).map(e => evRow(e)).join('')}</div>` : '<p class="muted">No entries yet.</p>'}
    ${all.length > 300 ? '<p class="muted small">Showing the latest 300. Export for the full record.</p>' : ''}`;
  UI.sheetMode = { type: 'history', seatId };
  openSheet(html, `History for booth ${bl(s)}`);
  await hydrateThumbs($('#sheet-root'));
}

async function logCode(behId) {
  const b = behById(behId);
  const seats = (UI.sheetSeats || []).map(seatById).filter(Boolean);
  if (!b || !seats.length) return;
  const note = ($('#sheet-note')?.value || '').trim();
  const ids = [];
  for (const s of seats) {
    const ev = await logEvent({ kind: b.type === 'action' ? 'action' : 'behavior', cls: s.cls, booth: s.booth, code: s.code, item: b.label, ref: b.id, pts: b.pts, note });
    ids.push(ev.id);
  }
  vibrate();
  closeSheet();
  if (UI.multi) { UI.selected.clear(); UI.multi = false; }
  render();
  const who = seats.length === 1 ? `Booth ${bl(seats[0])}` : `${seats.length} students`;
  toast(`${who} · ${b.label}`, () => removeEvents(ids));
}
async function assignTask() {
  const t = taskById($('#task-sel')?.value);
  const seats = (UI.sheetSeats || []).map(seatById).filter(Boolean);
  if (!t || !seats.length) return;
  const note = ($('#sheet-note')?.value || '').trim();
  const ids = [];
  for (const s of seats) {
    const ev = await logEvent({ kind: 'task', cls: s.cls, booth: s.booth, code: s.code, item: t.label, ref: t.id, status: 'Assigned', task: uid(), note });
    ids.push(ev.id);
  }
  vibrate(); closeSheet();
  if (UI.multi) { UI.selected.clear(); UI.multi = false; }
  render();
  toast(`${t.label} assigned to ${seats.length === 1 ? 'booth ' + bl(seats[0]) : seats.length + ' students'}`, () => removeEvents(ids));
}
async function taskDone(evId) {
  const a = EV.find(e => e.id === evId);
  if (!a) return;
  const s = S.seats.find(x => x.code === a.code);
  const ev = await logEvent({ kind: 'task', cls: a.cls, booth: s ? s.booth : a.booth, code: a.code, item: a.item, ref: a.ref, status: 'Done', task: a.task });
  vibrate();
  if (UI.sheetSeats) codeSheet(UI.sheetSeats);
  render();
  toast(`${itemLabel(a)} done`, async () => { await removeEvents([ev.id]); if (sheetOpen() && UI.sheetSeats) codeSheet(UI.sheetSeats); });
}

// ---------- Checkpoints tab ----------
function classProjects(clsId) { return S.projects.filter(p => p.active && p.classes.includes(clsId)); }
function curProject(c) {
  const list = classProjects(c.id);
  return list.find(p => p.id === S.ui.project) || list[0] || null;
}
function viewCheck() {
  const c = curClass();
  if (!c) return emptyState('No classes yet', 'Add a class in Setup first.', 'Open Setup', 'go-setup');
  const list = classProjects(c.id);
  if (!list.length) return emptyState('No projects for this class', 'Add a project and its checkpoints in Setup, then pick this class for it.', 'Open Setup', 'go-setup');
  const p = curProject(c);
  const cps = p.checkpoints.filter(k => k.active);
  const seats = seatsOf(c.id);
  const latest = cpLatest();
  const withPhoto = new Set(EV.filter(x => !x.voided && x.kind === 'checkpoint' && x.photo).map(x => `${x.code}|${x.projectId}|${x.ref}`));
  const head = `<tr><th class="seat">Booth</th>${cps.map(k => `<th class="cp">${esc(k.name)}</th>`).join('')}</tr>`;
  const rows = seats.map(s => `<tr><td class="seat"><b class="num">${bl(s)}</b> <span class="mono muted small">${esc(s.code)}</span></td>${cps.map(k => {
    const e = latest.get(`${s.code}|${p.id}|${k.id}`);
    const st = e ? STATUS[e.status] : '';
    const lab = !e ? '' : e.status === 'Approved' ? '✓' : e.status === 'Redo' ? 'Redo' : 'Work';
    const cam = withPhoto.has(`${s.code}|${p.id}|${k.id}`) ? ' ●' : '';
    return `<td class="cpc"><button type="button" class="cp-cell ${st}" data-act="cp-cell" data-seat="${esc(s.id)}" data-cp="${esc(k.id)}" aria-label="Booth ${bl(s)}, ${esc(k.name)}: ${esc(e ? e.status : 'not shown yet')}">${lab}${cam}</button></td>`;
  }).join('')}</tr>`).join('');
  const prog = cps.map(k => {
    const n = seats.filter(s => latest.get(`${s.code}|${p.id}|${k.id}`)?.status === 'Approved').length;
    return `<div class="bar-row"><span class="lab">${esc(k.name)}</span><span class="bar-track"><span class="prog" style="flex:1"><i style="width:${seats.length ? (n / seats.length) * 100 : 0}%"></i></span><span class="bar-val">${n}/${seats.length}</span></span></div>`;
  }).join('');
  return `<label class="lbl" for="proj-sel">Project<select class="field" id="proj-sel" data-act="proj-pick">${list.map(x => `<option value="${esc(x.id)}"${x.id === p.id ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
    <div class="legend"><span><i class="sw approved"></i>Approved</span><span><i class="sw shown"></i>Needs work</span><span><i class="sw redo"></i>Redo</span><span><i class="sw none"></i>Not shown</span><span>● has photo</span></div>
    ${cps.length ? `<div class="scroll-x"><table class="cp-table"><thead>${head}</thead><tbody>${rows}</tbody></table></div>` : '<p class="muted">This project has no checkpoints yet. Add them in Setup.</p>'}
    ${cps.length ? `<section class="card"><h2>Approved so far</h2><div class="bars">${prog}</div></section>` : ''}`;
}
async function cpSheet() {
  const st = UI.cp;
  if (!st) return;
  const s = seatById(st.seatId), p = projById(st.projectId), k = p?.checkpoints.find(x => x.id === st.cpId);
  if (!s || !p || !k) { closeSheet(); return; }
  const hist = EV.filter(e => e.kind === 'checkpoint' && e.code === s.code && e.projectId === p.id && e.ref === k.id).sort((a, b) => b.ts - a.ts);
  const pend = st.photo ? `<div class="pending-photo"><img class="thumb" src="${st.photoURL}" alt="New weld photo"><div class="main"><div class="t">Photo ready</div><div class="s">It saves with the status you tap next.</div></div><button type="button" class="btn sm ghost" data-act="cp-clear-photo">Discard</button></div>` : '';
  const html = `<div class="sheet-head"><div><h2>Booth ${bl(s)} · ${esc(k.name)}</h2><div class="sub"><span class="mono">${esc(s.code)}</span> · ${esc(p.name)}</div></div>${closeBtn}</div>
    <div class="status-btns">
      <button type="button" class="codebtn pos" data-act="cp-status" data-status="Approved"><span>Approved</span></button>
      <button type="button" class="codebtn warnc" data-act="cp-status" data-status="Needs work"><span>Needs work</span></button>
      <button type="button" class="codebtn neg" data-act="cp-status" data-status="Redo"><span>Redo</span></button>
    </div>
    ${pend}
    <button type="button" class="btn block" data-act="cp-photo">${st.photo ? 'Retake photo' : 'Take a photo of the weld'}</button>
    <details id="note-box"${st.note ? ' open' : ''}><summary>Add a note</summary><textarea class="field" id="sheet-note" maxlength="200" placeholder="Undercut at the toe, restart porosity, etc.">${esc(st.note || '')}</textarea></details>
    <p class="muted small" style="margin:0">Frame the weld only. Keep faces and names on jackets out of the shot.</p>
    <div class="sec-label">History</div>
    ${hist.length ? `<div class="list">${hist.map(e => evRow(e)).join('')}</div>` : '<p class="muted small" style="margin:0">Not shown yet.</p>'}`;
  UI.sheetMode = { type: 'cp' };
  openSheet(html, `Checkpoint for booth ${bl(s)}`);
  await hydrateThumbs($('#sheet-root'));
}
async function cpSave(status) {
  const st = UI.cp;
  const s = seatById(st.seatId), p = projById(st.projectId), k = p?.checkpoints.find(x => x.id === st.cpId);
  if (!s || !p || !k) return;
  let photoId = '';
  if (st.photo) {
    photoId = uid();
    try {
      await store.put('photos', { id: photoId, type: 'image/jpeg', buf: await st.photo.arrayBuffer(), ts: Date.now(), exported: false });
      UI.photoURLs.set(photoId, st.photoURL);
    } catch (e) { photoId = ''; toast('Photo could not be saved. The phone may be out of space.'); }
  }
  const note = ($('#sheet-note')?.value || '').trim();
  const ev = await logEvent({ kind: 'checkpoint', cls: s.cls, booth: s.booth, code: s.code, item: k.name, ref: k.id, status, project: p.name, projectId: p.id, note, photo: photoId });
  vibrate();
  closeSheet();
  render();
  toast(`Booth ${bl(s)} · ${k.name} · ${status}`, () => removeEvents([ev.id]));
}

// ---------- Booths tab (cleanup check) ----------
function sweepState(c) {
  if (!UI.sweep || UI.sweep.cls !== c.id || UI.sweep.date !== today()) {
    const prior = todaySweep(c.id);
    UI.sweep = { cls: c.id, date: today(), flags: {}, editing: !prior };
    if (prior) loadSweepFlags(c, prior);
  }
  return UI.sweep;
}
function loadSweepFlags(c, prior) {
  UI.sweep.flags = {};
  const booths = EV.filter(e => !e.voided && e.kind === 'booth' && e.sweep === prior.sweep);
  for (const b of booths) {
    const key = String(b.booth);
    const f = UI.sweep.flags[key] || (UI.sweep.flags[key] = {
      reasons: String(b.item).split('; ').map(l => S.reasons.find(r => r.label === l)?.id).filter(Boolean),
      major: b.status === 'Major', note: b.note || '', photos: photoIds(b).map(id => ({ id })), who: [],
    });
    const seat = seatsOf(c.id).find(s => s.code === b.code);
    if (seat && !f.who.includes(seat.id)) f.who.push(seat.id);
  }
}
// A flag belongs to a physical booth; `who` lists the students in it who get the points.
const newFlag = occ => ({ reasons: [], major: false, note: '', photos: [], who: occ.map(s => s.id) });
// Dirty-booth entries for one student in the pattern window (default: last 30 days).
function boothPattern(code, includeToday) {
  const t = today(), from = addDays(t, -(S.patternDays - 1));
  const ev = EV.filter(e => !e.voided && e.kind === 'booth' && e.code === code && e.date >= from && (includeToday ? e.date <= t : e.date < t));
  return { n: ev.length, major: ev.filter(e => e.status === 'Major').length };
}
function viewBooths() {
  const c = curClass();
  if (!c) return emptyState('No classes yet', 'Add a class in Setup first.', 'Open Setup', 'go-setup');
  const seats = seatsOf(c.id);
  if (!seats.length) return emptyState('No booths in this class', 'Add students to booths in Setup.', 'Open Setup', 'go-setup');
  const st = sweepState(c);
  const prior = todaySweep(c.id);
  const cells = boothCells(c.id);
  const nBooths = cells.filter(x => !x.storage).length;
  const nFlag = Object.keys(st.flags).length;
  const nMajor = Object.values(st.flags).filter(f => f.major).length;
  const tiles = cells.map(cell => {
    if (cell.storage) return slotHTML(cell.booth);
    const b = cell.booth, f = st.flags[b], shared = cell.seats.length > 1;
    const reasons = f ? f.reasons.map(id => S.reasons.find(r => r.id === id)?.label).filter(Boolean) : [];
    const np = f ? f.photos.length : 0;
    const state = f ? (f.major ? 'Major mess' : 'Left dirty') : 'Clean';
    const marked = f && shared ? cell.seats.filter(s => f.who.includes(s.id)) : [];
    const shareChip = !shared ? '' : f && marked.length < cell.seats.length
      ? `<span class="tchip task">Marked ${marked.map(bl).join(', ')}</span>` : `<span class="tchip task">Shared · ${cell.seats.length}</span>`;
    return `<button type="button" class="tile ${f ? 'flag' : 'ok-state'}${f && f.major ? ' major' : ''}" data-act="bt" data-booth="${b}" ${st.editing ? '' : 'disabled'} aria-label="Booth ${b}${shared ? `, shared by ${cell.seats.length}` : ''}: ${state.toLowerCase()}${np ? `, ${np} photo${np > 1 ? 's' : ''}` : ''}">
      <span class="bn-label">BOOTH</span><span class="bn">${b}</span><span class="state">${state}</span>
      <span class="chips">${shareChip}${reasons.slice(0, 2).map(r => `<span class="tchip neg">${esc(r)}</span>`).join('')}${reasons.length > 2 ? `<span class="tchip neg">+${reasons.length - 2}</span>` : ''}${np ? `<span class="tchip act">${np} photo${np > 1 ? 's' : ''}</span>` : ''}</span></button>`;
  }).join('');
  const patt = st.editing ? [] : Object.values(st.flags).flatMap(f => f.who.map(seatById).filter(Boolean)).map(s => ({ s, n: boothPattern(s.code, true).n })).filter(x => x.n >= S.patternN);
  const pattHTML = patt.length
    ? `<div class="banner"><span>Pattern: ${patt.map(x => `booth ${bl(x.s)} (${esc(x.s.code)}) has ${x.n} dirty booths in ${S.patternDays} days`).join('; ')}.</span>
        <div class="row">${patt.map(x => `<button type="button" class="btn sm" data-act="history" data-seat="${esc(x.s.id)}">Booth ${bl(x.s)} history</button>`).join('')}</div></div>`
    : '';
  const head = st.editing
    ? `<div class="banner info"><span>Every booth starts clean. Tap only the booths that were left dirty.</span></div>`
    : `<div class="strip"><span class="pill ${nFlag ? 'neg' : 'ok'}"><span class="dot"></span>Checked at ${fmtTime(prior.time)} · ${nFlag} of ${nBooths} booths left dirty${nMajor ? ` (${nMajor} major)` : ''}</span><span style="flex:1"></span><button type="button" class="chip-btn" data-act="sweep-edit">Edit check</button></div>`;
  const foot = st.editing
    ? `<div class="row">${prior ? '<button type="button" class="btn" data-act="sweep-cancel">Cancel</button>' : ''}<button type="button" class="btn primary" style="flex:1" data-act="sweep-save">Save booth check · ${nFlag} dirty</button></div>
       <p class="muted small" style="margin:0">A dirty booth counts ${fmtPts(S.boothPts)} toward the employability of each student marked responsible, a major mess ${fmtPts(S.boothMajorPts)}. Hatched booths are storage.</p>`
    : '';
  return head + pattHTML + `<div class="tiles">${tiles}</div>` + foot;
}
const MAX_BOOTH_PHOTOS = 4;
function boothSheet(b) {
  const st = UI.sweep;
  if (!st) return;
  const occ = occupants(st.cls, b);
  if (!occ.length) return;
  const f = st.flags[b] || (st.flags[b] = newFlag(occ));
  const shared = occ.length > 1;
  const sel = new Set(f.reasons);
  const pats = new Map(occ.map(s => [s.id, boothPattern(s.code, false)]));
  const pat = pats.get(occ[0].id);
  const patTxt = pat.n
    ? `${pat.n} dirty booth${pat.n === 1 ? '' : 's'} before today in the last ${S.patternDays} days${pat.major ? `, ${pat.major} major` : ''}`
    : `No dirty booths before today in the last ${S.patternDays} days`;
  const warn = occ.filter(s => f.who.includes(s.id) && pats.get(s.id).n + 1 >= S.patternN);
  const thumbs = f.photos.map((ph, i) => `<span class="ph"><img class="thumb" ${ph.id && !ph.url ? `data-photo="${esc(ph.id)}"` : `src="${ph.url}"`} alt="Booth photo ${i + 1}" data-act="bt-photo-view" data-i="${i}"><button type="button" class="ph-del" data-act="bt-photo-del" data-i="${i}" aria-label="Delete photo ${i + 1}">\u00d7</button></span>`).join('');
  const whoHTML = !shared ? '' : `<div class="sec-label">Who's responsible</div>
    <div class="row">${occ.map(s => `<button type="button" class="chip-btn who" data-act="bt-who" data-seat="${esc(s.id)}" aria-pressed="${f.who.includes(s.id)}">${bl(s)} · <span class="mono">${esc(s.code)}</span></button>`).join('')}</div>
    <p class="muted small" style="margin:0">Each student marked gets the points. Dirty booths before today in the last ${S.patternDays} days: ${occ.map(s => `${bl(s)} ${pats.get(s.id).n}`).join(', ')}.</p>`;
  const html = `<div class="sheet-head"><div><h2>Booth ${b} left dirty</h2><div class="sub">${shared ? `Shared by ${occ.length} students` : `<span class="mono">${esc(occ[0].code)}</span> · ${esc(patTxt)}`}</div></div>${closeBtn}</div>
    ${warn.length ? `<div class="banner"><span>${warn.map(s => `Saving this makes the ${ordinal(pats.get(s.id).n + 1)} dirty booth for ${esc(s.code)}`).join('. ')} in ${S.patternDays} days. A photo and a short note will document the pattern.</span></div>` : ''}
    ${whoHTML}
    <div class="seg" role="group" aria-label="How bad">
      <button type="button" data-act="bt-sev" data-major="0" aria-pressed="${!f.major}">Left dirty ${fmtPts(S.boothPts)}</button>
      <button type="button" data-act="bt-sev" data-major="1" aria-pressed="${f.major}">Major mess ${fmtPts(S.boothMajorPts)}</button>
    </div>
    <div class="sec-label">What was wrong</div>
    <div class="row">${S.reasons.filter(r => r.active).map(r => `<button type="button" class="chip-btn" data-act="reason" data-reason="${esc(r.id)}" aria-pressed="${sel.has(r.id)}">${esc(r.label)}</button>`).join('')}</div>
    <div class="sec-label">Photos${f.photos.length ? ` (${f.photos.length} of ${MAX_BOOTH_PHOTOS})` : ''}</div>
    ${f.photos.length ? `<div class="ph-row">${thumbs}</div>` : ''}
    ${f.photos.length < MAX_BOOTH_PHOTOS ? `<button type="button" class="btn block" data-act="bt-photo">${f.photos.length ? 'Add another photo' : 'Take a photo of the booth'}</button>` : ''}
    <p class="muted small" style="margin:0">Shoot the booth with no students in frame.${S.stampPhotos ? ` ${shared ? 'Booth, class' : 'Booth, code, class'} and time are stamped on each photo.` : ''}</p>
    <label class="lbl" for="bt-note">Note<textarea class="field" id="bt-note" maxlength="300" placeholder="What you saw, in plain facts">${esc(f.note)}</textarea></label>
    <div class="row"><button type="button" class="btn" style="flex:1" data-act="bt-ok" data-booth="${b}">Booth was clean</button><button type="button" class="btn primary" style="flex:1" data-act="close-sheet">Done</button></div>`;
  UI.sheetMode = { type: 'booth', booth: String(b) };
  openSheet(html, `Booth ${b}`);
  hydrateThumbs($('#sheet-root'));
}
async function boothPhoto(file) {
  const b = UI.sheetMode?.booth, f = UI.sweep?.flags[b], occ = UI.sweep ? occupants(UI.sweep.cls, b) : [];
  if (!f || !occ.length || f.photos.length >= MAX_BOOTH_PHOTOS) return;
  try {
    const clsName = classById(UI.sweep.cls)?.name || '';
    // A shared booth's photo carries no codes, so it can sit in either student's record.
    const line1 = occ.length > 1 ? `Booth ${b} (shared) · ${clsName}` : `Booth ${b} · ${occ[0].code} · ${clsName}`;
    const cap = S.stampPhotos ? [line1, `Booth cleanup check · ${fmtStamp(new Date())}`] : null;
    const blob = await shrinkPhoto(file, cap);
    f.photos.push({ blob, url: URL.createObjectURL(blob) });
    render();
    boothSheet(b);
  } catch (e) { toast('That photo couldn\'t be read. Try again.'); }
}
async function saveSweep() {
  const c = curClass();
  const seats = seatsOf(c.id);
  const st = UI.sweep;
  const prior = todaySweep(c.id);
  if (prior) {
    const old = EV.filter(e => !e.voided && (e.id === prior.id || (e.kind === 'booth' && e.sweep === prior.sweep)));
    await setVoid(old.map(e => e.id), true);
  }
  const sid = uid();
  await logEvent({ kind: 'sweep', cls: c.id, count: seats.length, sweep: sid, status: 'Done' });
  const cells = boothCells(c.id).filter(x => !x.storage);
  let n = 0, nMajor = 0, lost = 0;
  for (const cell of cells) {
    const f = st.flags[cell.booth];
    if (!f) continue;
    const resp = cell.seats.filter(s => f.who.includes(s.id));
    if (!resp.length) continue;
    n++; if (f.major) nMajor++;
    const labels = f.reasons.map(id => S.reasons.find(r => r.id === id)?.label).filter(Boolean);
    const ids = [];
    for (const ph of f.photos) {
      if (ph.id) { ids.push(ph.id); continue; }
      const id = uid();
      try {
        await store.put('photos', { id, type: 'image/jpeg', buf: await ph.blob.arrayBuffer(), ts: Date.now(), exported: false });
        UI.photoURLs.set(id, ph.url);
        ph.id = id; delete ph.blob;
        ids.push(id);
      } catch (e) { lost++; }
    }
    for (const s of resp) {
      const mates = cell.seats.filter(x => x.id !== s.id);
      await logEvent({ kind: 'booth', cls: c.id, booth: s.booth, code: s.code, item: labels.length ? labels.join('; ') : 'Not specified',
        status: f.major ? 'Major' : 'Dirty', pts: f.major ? S.boothMajorPts : S.boothPts, note: (f.note || '').trim(), photo: ids.join(';'), sweep: sid,
        mates: mates.map(x => x.code).join(';'), matesResp: mates.filter(x => f.who.includes(x.id)).map(x => x.code).join(';') });
    }
  }
  st.editing = false;
  vibrate();
  render();
  let msg = `Booth check saved · ${n} of ${cells.length} booths left dirty${nMajor ? ` (${nMajor} major)` : ''}`;
  if (lost) msg += `. ${lost} photo${lost > 1 ? 's' : ''} couldn't be saved; the phone may be out of space`;
  toast(msg, null, lost ? 9000 : 0);
}

// ---------- Reports tab ----------
function niceCeil(v) {
  if (!(v > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 1.5 ? 1.5 : n <= 2 ? 2 : n <= 3 ? 3 : n <= 5 ? 5 : 10) * p;
}
function viewReports() {
  if (!S.classes.length) return emptyState('No classes yet', 'Add a class in Setup first.', 'Open Setup', 'go-setup');
  const [from, to] = rangeDates();
  const rc = S.ui.rcls === 'all' ? null : classById(S.ui.rcls);
  const classes = rc ? [rc] : S.classes;
  const ev = evIn(from, to, classes.map(c => c.id));
  const stats = classes.map(c => classStats(c, from, to, ev));
  const tot = stats.reduce((a, s) => ({ days: a.days + s.days, sd: a.sd + s.sd, neg: a.neg + s.neg, pos: a.pos + s.pos, checks: a.checks + s.checks, fails: a.fails + s.fails }), { days: 0, sd: 0, neg: 0, pos: 0, checks: 0, fails: 0 });
  const ranges = [['today', 'Today'], ['week', 'Week'], ['month', 'Month'], ['custom', 'Custom']];
  let h = `<div class="seg" role="group" aria-label="Date range">${ranges.map(([k, l]) => `<button type="button" data-act="range" data-range="${k}" aria-pressed="${S.ui.range === k}">${l}</button>`).join('')}</div>`;
  if (S.ui.range === 'custom') h += `<div class="edit-grid"><label class="lbl" for="r-from">From<input class="field" type="date" id="r-from" data-act="r-from" value="${from}"></label><label class="lbl" for="r-to">To<input class="field" type="date" id="r-to" data-act="r-to" value="${to}"></label></div>`;
  h += `<div class="row between"><label class="lbl" for="r-cls" style="flex:1">Classes<select class="field" id="r-cls" data-act="r-cls"><option value="all"${rc ? '' : ' selected'}>All classes</option>${S.classes.map(c => `<option value="${esc(c.id)}"${rc && rc.id === c.id ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label></div>`;
  h += `<p class="muted small" style="margin:0">${fmtDay(from)}${from === to ? '' : ` to ${fmtDay(to)}`} · ${tot.days} class day${tot.days === 1 ? '' : 's'} logged</p>`;
  h += `<div class="kpis">
    <div class="kpi"><div class="v">${fix1(tot.sd ? (tot.neg / tot.sd) * 5 : null)}</div><div class="k">Needs work per student per week</div></div>
    <div class="kpi"><div class="v">${fix1(tot.sd ? (tot.pos / tot.sd) * 5 : null)}</div><div class="k">Positive per student per week</div></div>
    <div class="kpi"><div class="v">${pct(tot.checks ? 1 - tot.fails / tot.checks : null)}</div><div class="k">Booths left clean</div></div>
  </div>`;
  if (!rc) {
    h += `<section class="card"><h2>Classes compared</h2><p class="muted small">Rates per student per week, so bigger classes don't look worse just for being bigger.</p>
      <div class="scroll-x"><table><thead><tr><th>Class</th><th class="r">Students</th><th class="r">Days</th><th class="r">Needs work</th><th class="r">Positive</th><th class="r">Absent</th><th class="r">Booths clean</th></tr></thead><tbody>
      ${stats.map(s => `<tr class="clickable" data-act="pick-rcls" data-cls="${esc(s.cls.id)}"><td>${esc(s.cls.name)}</td><td class="r num">${s.students}</td><td class="r num">${s.days}</td><td class="r num">${fix1(s.negRate)}</td><td class="r num">${fix1(s.posRate)}</td><td class="r num">${pct(s.absRate)}</td><td class="r num">${pct(s.pass)}</td></tr>`).join('')}
      </tbody></table></div><p class="muted small" style="margin:0">Absent is the share of student-days marked absent. Tap a class for its students.</p></section>`;
  }
  h += trendHTML(classes, to);
  h += breakdownHTML(ev);
  if (rc) {
    h += studentTableHTML(rc, from, to);
    h += cpProgressHTML(rc);
  }
  h += `<section class="card"><h2>Take it to your Sheet</h2><p class="muted small">Export the log and paste it into the Events tab of your school Sheet for grades and the full archive.</p>
    <div class="row"><button type="button" class="btn primary" data-act="export-events">Export log</button><button type="button" class="btn" data-act="export-roster">Export roster</button></div></section>`;
  return h;
}
function trendHTML(classes, to) {
  const end = mondayOf(to < today() ? to : today());
  const weeks = Array.from({ length: 8 }, (_, i) => addDays(end, -7 * (7 - i)));
  const data = classes.map(c => ({ c, vals: weeks.map(w => classStats(c, w, addDays(w, 6)).negRate) }));
  const all = data.flatMap(d => d.vals.filter(v => v != null));
  if (!all.length) return '';
  const max = niceCeil(Math.max(...all, 0.1));
  const W = 300, H = 128, L = 30, R = 8, T = 14, B = 22, pw = W - L - R, ph = H - T - B, band = pw / weeks.length, bw = Math.min(24, band - 6);
  const y = v => T + ph - (v / max) * ph;
  const mk = d => {
    const lastI = d.vals.map((v, i) => (v == null ? -1 : i)).filter(i => i >= 0).pop();
    const bars = d.vals.map((v, i) => {
      const x = L + i * band + (band - bw) / 2;
      const hit = `<rect x="${(L + i * band).toFixed(1)}" y="${T}" width="${band.toFixed(1)}" height="${ph + B}" fill="transparent" data-act="bar" data-i="${i}" data-v="${v == null ? '' : v.toFixed(2)}" data-w="${weeks[i]}" style="cursor:pointer"></rect>`;
      if (v == null || v <= 0) return hit;
      const top = y(v), base = T + ph, r = Math.min(4, (base - top), bw / 2);
      const path = `M${x.toFixed(1)},${base}V${(top + r).toFixed(1)}Q${x.toFixed(1)},${top.toFixed(1)} ${(x + r).toFixed(1)},${top.toFixed(1)}H${(x + bw - r).toFixed(1)}Q${(x + bw).toFixed(1)},${top.toFixed(1)} ${(x + bw).toFixed(1)},${(top + r).toFixed(1)}V${base}Z`;
      const lab = i === lastI ? `<text class="chart-val" x="${(x + bw / 2).toFixed(1)}" y="${(top - 4).toFixed(1)}" text-anchor="middle">${v.toFixed(1)}</text>` : '';
      return `<path class="chart-bar" data-bar="${i}" d="${path}"></path>${lab}${hit}`;
    }).join('');
    const grid = [max / 2, max].map(g => `<line class="chart-grid" x1="${L}" x2="${W - R}" y1="${y(g).toFixed(1)}" y2="${y(g).toFixed(1)}"></line><text class="chart-axis" x="${L - 5}" y="${(y(g) + 3).toFixed(1)}" text-anchor="end">${+g.toFixed(2)}</text>`).join('');
    const xl = `<text class="chart-axis" x="${L}" y="${H - 6}">${fmtDate(weeks[0])}</text><text class="chart-axis" x="${W - R}" y="${H - 6}" text-anchor="end">Week of ${fmtDate(weeks[weeks.length - 1])}</text>`;
    return `<div class="mult"><h3>${esc(d.c.name)}</h3><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(d.c.name)}: needs-work entries per student per week, last 8 weeks">
      ${grid}<line class="chart-base" x1="${L}" x2="${W - R}" y1="${T + ph}" y2="${T + ph}"></line><text class="chart-axis" x="${L - 5}" y="${T + ph + 3}" text-anchor="end">0</text>${bars}${xl}</svg>
      <div class="readout">Tap a week for its value.</div></div>`;
  };
  return `<section class="card"><h2>Needs-work trend</h2><p class="muted small">Needs-work entries per student per week, last 8 weeks, same scale for every class.</p><div class="multiples">${data.map(mk).join('')}</div></section>`;
}
function breakdownHTML(ev) {
  const counts = new Map();
  for (const e of ev) {
    if (e.kind !== 'behavior' && e.kind !== 'action') continue;
    const b = behById(e.ref);
    const k = e.ref || e.item;
    const cur = counts.get(k) || { label: itemLabel(e), type: b ? b.type : (e.kind === 'action' ? 'action' : e.pts < 0 ? 'neg' : 'pos'), n: 0 };
    cur.n++; counts.set(k, cur);
  }
  const booth = ev.filter(e => e.kind === 'booth');
  const bMajor = booth.filter(e => e.status === 'Major').length;
  if (booth.length - bMajor) counts.set('__booth', { label: 'Booth left dirty', type: 'neg', n: booth.length - bMajor });
  if (bMajor) counts.set('__boothmajor', { label: 'Booth: major mess', type: 'neg', n: bMajor });
  const rows = [...counts.values()];
  if (!rows.length) return `<section class="card"><h2>What got logged</h2><p class="muted small">Nothing logged in this range yet.</p></section>`;
  const max = Math.max(...rows.map(r => r.n));
  const grp = (type, title) => {
    const list = rows.filter(r => r.type === type).sort((a, b) => b.n - a.n);
    if (!list.length) return '';
    return `<div class="sec-label">${title}</div><div class="bars">${list.map(r => `<div class="bar-row"><span class="lab" title="${esc(r.label)}">${esc(r.label)}</span><span class="bar-track"><span class="bar" style="width:${Math.max(1, (r.n / max) * 80)}%"></span><span class="bar-val">${r.n}</span></span></div>`).join('')}</div>`;
  };
  return `<section class="card"><h2>What got logged</h2>${grp('neg', 'Needs work')}${grp('pos', 'Positive')}${grp('action', 'Actions taken')}</section>`;
}
function studentTableHTML(c, from, to) {
  let rows = studentRows(c, from, to);
  const f = UI.rfilter.trim().toUpperCase();
  if (f) rows = rows.filter(r => r.seat.code.includes(f) || String(r.seat.booth) === f);
  const k = UI.rsort.key, d = UI.rsort.dir;
  const val = r => (k === 'booth' ? r.seat.booth : k === 'emp' ? (r.emp == null ? 2 : r.emp) : r[k]);
  rows.sort((a, b) => (val(a) - val(b)) * d || bySeat(a.seat, b.seat));
  const th = (key, label, cls = 'r') => `<th class="${cls}"><button type="button" class="th-btn" data-act="rsort" data-key="${key}">${label}${UI.rsort.key === key ? (d > 0 ? ' ↑' : ' ↓') : ''}</button></th>`;
  const empCls = v => (v == null ? '' : v < 0.8 ? 'low' : v < 0.9 ? 'mid' : '');
  return `<section class="card"><h2>Students</h2>
    <p class="muted small">Employability starts at ${S.base} points per class day; entries add or subtract. Tap a row for the full history.</p>
    <input class="field" id="r-filter" data-act="r-filter" placeholder="Find a code or booth number" value="${esc(UI.rfilter)}" autocomplete="off" autocapitalize="characters">
    <div class="scroll-x"><table><thead><tr>${th('booth', 'Booth', '')}<th>Code</th>${th('emp', 'Employ.')}${th('net', 'Net')}${th('neg', 'Needs work')}${th('pos', 'Positive')}${th('flags', 'Dirty booth')}${th('days', 'Days')}<th>Most often</th></tr></thead><tbody>
    ${rows.map(r => `<tr class="clickable" data-act="history" data-seat="${esc(r.seat.id)}"><td class="num"><b>${bl(r.seat)}</b></td><td class="mono">${esc(r.seat.code)}${r.seat.active ? '' : ' <span class="muted small">(left)</span>'}</td><td class="r"><span class="emp ${empCls(r.emp)}">${pct(r.emp)}</span></td><td class="r num">${fmtPts(r.net)}</td><td class="r num">${r.neg}</td><td class="r num">${r.pos}</td><td class="r num">${r.flags}${r.major ? ` <span class="muted small">(${r.major} major)</span>` : ''}</td><td class="r num">${r.days}</td><td class="muted small">${esc(r.top)}</td></tr>`).join('')}
    </tbody></table></div></section>`;
}
function cpProgressHTML(c) {
  const list = classProjects(c.id);
  if (!list.length) return '';
  const seats = seatsOf(c.id);
  const latest = cpLatest();
  return `<section class="card"><h2>Project checkpoints</h2>${list.map(p => `<div class="sec-label">${esc(p.name)}</div><div class="bars">${p.checkpoints.filter(k => k.active).map(k => {
    const n = seats.filter(s => latest.get(`${s.code}|${p.id}|${k.id}`)?.status === 'Approved').length;
    return `<div class="bar-row"><span class="lab">${esc(k.name)}</span><span class="bar-track"><span class="prog" style="flex:1"><i style="width:${seats.length ? (n / seats.length) * 100 : 0}%"></i></span><span class="bar-val">${n}/${seats.length}</span></span></div>`;
  }).join('')}</div>`).join('')}</section>`;
}

// ---------- Setup ----------
function sec(id, title, body) {
  return `<details class="sec" data-sec="${id}"${UI.openSecs.has(id) ? ' open' : ''}><summary>${title}</summary><div class="sec-body">${body}</div></details>`;
}
function viewSetup() {
  const classes = S.classes.map(c => {
    const seats = seatsOf(c.id);
    const former = S.seats.filter(s => s.cls === c.id && !s.active);
    return `<div class="subcard">
      <label class="lbl" for="cn-${esc(c.id)}">Class name<input class="field" id="cn-${esc(c.id)}" data-act="cls-name" data-id="${esc(c.id)}" value="${esc(c.name)}" maxlength="40"></label>
      <div class="edit-grid"><label class="lbl" for="cs-${esc(c.id)}">Starts<input class="field" type="time" id="cs-${esc(c.id)}" data-act="cls-start" data-id="${esc(c.id)}" value="${esc(c.start || '')}"></label>
      <label class="lbl" for="ce-${esc(c.id)}">Ends<input class="field" type="time" id="ce-${esc(c.id)}" data-act="cls-end" data-id="${esc(c.id)}" value="${esc(c.end || '')}"></label></div>
      <div class="sec-label">${seats.length} student${seats.length === 1 ? '' : 's'}</div>
      <div>${seats.map(s => `<div class="seat-row">
        <input class="field num" type="number" min="1" max="${S.boothCount}" id="sb-${esc(s.id)}" data-act="seat-booth" data-id="${esc(s.id)}" value="${s.booth}" aria-label="Booth number for code ${esc(s.code)}">
        <div class="seat-id"><b class="mono">${esc(s.code)}</b>${sideOf(s) ? ` <span class="tchip task">${bl(s)} shared</span>` : ''} <span class="muted small">since ${fmtDate(s.since)}</span></div>
        <button type="button" class="btn sm" data-act="seat-menu" data-id="${esc(s.id)}">Change</button>
      </div>`).join('')}</div>
      <div class="row"><button type="button" class="btn sm" data-act="seat-add" data-cls="${esc(c.id)}">Add a student</button>
      <button type="button" class="btn sm ghost" data-act="cls-del" data-id="${esc(c.id)}">Remove class</button></div>
      ${former.length ? `<details><summary class="small">Former students (${former.length})</summary><p class="muted small" style="margin:0">Their codes stay in the log and the Sheet.</p><p class="mono small" style="margin:4px 0 0">${former.map(s => `${esc(s.code)} (booth ${s.booth})`).join(', ')}</p></details>` : ''}
    </div>`;
  }).join('');
  const addCls = `<form class="subcard" id="add-cls-form" data-act-submit="cls-add"><div class="sec-label">Add a class</div>
    <div class="edit-grid"><label class="lbl" for="nc-name">Name<input class="field" id="nc-name" placeholder="Period 5" maxlength="40" required></label>
    <label class="lbl" for="nc-n">Students<input class="field num" id="nc-n" type="number" min="0" max="60" value="12"></label></div>
    <p class="muted small" style="margin:0">Students fill the empty welding booths first, then share.</p>
    <button type="submit" class="btn">Add class</button></form>`;
  const classesBody = `<p class="muted small" style="margin:0">Each student gets a random code. Write each code next to the student's name in the Key tab of your school Sheet. When a new student takes a booth, tap New student so they get their own code. To put two or three students in one booth, give them the same booth number; they show as 3A, 3B and 3C.</p>${classes}${addCls}
    <button type="button" class="btn" data-act="export-roster">Export roster for the Key tab</button>`;

  const typeSel = (b) => `<select class="field" data-act="code-type" data-id="${esc(b.id)}" aria-label="Type for ${esc(b.label)}"><option value="neg"${b.type === 'neg' ? ' selected' : ''}>Needs work</option><option value="pos"${b.type === 'pos' ? ' selected' : ''}>Positive</option><option value="action"${b.type === 'action' ? ' selected' : ''}>Action</option></select>`;
  const codesBody = `<p class="muted small" style="margin:0">Points apply to entries made after a change. Turn a code off instead of deleting it so old entries keep their meaning.</p>
    <div>${S.behaviors.map((b, i) => `<div class="code-row">
      <input class="field" data-act="code-label" data-id="${esc(b.id)}" value="${esc(b.label)}" maxlength="32" aria-label="Code name">
      ${typeSel(b)}
      <input class="field num" type="number" min="-20" max="20" step="1" data-act="code-pts" data-id="${esc(b.id)}" value="${b.pts}" aria-label="Points for ${esc(b.label)}">
      <div class="tools"><label class="toggle"><input type="checkbox" data-act="code-active" data-id="${esc(b.id)}"${b.active ? ' checked' : ''}>Show button</label>
      <span style="flex:1"></span><button type="button" class="btn sm ghost" data-act="code-move" data-id="${esc(b.id)}" data-d="-1"${i === 0 ? ' disabled' : ''} aria-label="Move up">↑</button><button type="button" class="btn sm ghost" data-act="code-move" data-id="${esc(b.id)}" data-d="1"${i === S.behaviors.length - 1 ? ' disabled' : ''} aria-label="Move down">↓</button></div>
    </div>`).join('')}</div>
    <form class="inline-form" data-act-submit="code-add"><input class="field" id="new-code" placeholder="New code, e.g. Phone out" maxlength="32" required><button type="submit" class="btn">Add</button></form>`;

  const simpleList = (arr, kind, ph) => `<div>${arr.map(t => `<div class="edit-row" style="padding:6px 0"><input class="field" data-act="${kind}-label" data-id="${esc(t.id)}" value="${esc(t.label)}" maxlength="40" aria-label="Name"><label class="toggle"><input type="checkbox" data-act="${kind}-active" data-id="${esc(t.id)}"${t.active ? ' checked' : ''}>On</label></div>`).join('')}</div>
    <form class="inline-form" data-act-submit="${kind}-add"><input class="field" id="new-${kind}" placeholder="${ph}" maxlength="40" required><button type="submit" class="btn">Add</button></form>`;
  const tasksBody = `<p class="muted small" style="margin:0">These show in the Assign a task list on every booth.</p>${simpleList(S.tasks, 'task', 'New task')}`;
  const boothBody = `<div class="edit-grid"><label class="lbl" for="booth-pts">Points, left dirty<input class="field num" type="number" min="-10" max="0" id="booth-pts" data-act="booth-pts" value="${S.boothPts}"></label>
    <label class="lbl" for="booth-major-pts">Points, major mess<input class="field num" type="number" min="-20" max="0" id="booth-major-pts" data-act="booth-major-pts" value="${S.boothMajorPts}"></label>
    <label class="lbl" for="pattern-n">Pattern at this many<input class="field num" type="number" min="2" max="20" id="pattern-n" data-act="pattern-n" value="${S.patternN}"></label>
    <label class="lbl" for="pattern-days">dirty booths within (days)<input class="field num" type="number" min="7" max="180" id="pattern-days" data-act="pattern-days" value="${S.patternDays}"></label></div>
    <p class="muted small" style="margin:0">When a student reaches the pattern, the booth check warns you before you save and names the booth after.</p>
    <div class="sec-label">What can be wrong</div>${simpleList(S.reasons, 'reason', 'New item, e.g. Grinder left plugged in')}`;

  const projects = S.projects.map(p => `<div class="subcard">
    <label class="lbl">Project name<input class="field" data-act="proj-name" data-id="${esc(p.id)}" value="${esc(p.name)}" maxlength="60"></label>
    <div class="row">${S.classes.map(c => `<label class="toggle"><input type="checkbox" data-act="proj-cls" data-id="${esc(p.id)}" data-cls="${esc(c.id)}"${p.classes.includes(c.id) ? ' checked' : ''}>${esc(c.name)}</label>`).join('')}</div>
    <div class="sec-label">Checkpoints, in order</div>
    <div>${p.checkpoints.map((k, i) => `<div class="edit-row" style="padding:6px 0;grid-template-columns:1fr auto auto auto"><input class="field" data-act="cp-name" data-p="${esc(p.id)}" data-id="${esc(k.id)}" value="${esc(k.name)}" maxlength="40" aria-label="Checkpoint name">
      <label class="toggle"><input type="checkbox" data-act="cp-active" data-p="${esc(p.id)}" data-id="${esc(k.id)}"${k.active ? ' checked' : ''}>On</label>
      <button type="button" class="btn sm ghost" data-act="cp-move" data-p="${esc(p.id)}" data-id="${esc(k.id)}" data-d="-1"${i === 0 ? ' disabled' : ''} aria-label="Move up">↑</button>
      <button type="button" class="btn sm ghost" data-act="cp-move" data-p="${esc(p.id)}" data-id="${esc(k.id)}" data-d="1"${i === p.checkpoints.length - 1 ? ' disabled' : ''} aria-label="Move down">↓</button></div>`).join('')}</div>
    <form class="inline-form" data-act-submit="cp-add" data-p="${esc(p.id)}"><input class="field" id="new-cp-${esc(p.id)}" placeholder="New checkpoint, e.g. Root pass" maxlength="40" required><button type="submit" class="btn">Add</button></form>
    <label class="toggle"><input type="checkbox" data-act="proj-active" data-id="${esc(p.id)}"${p.active ? ' checked' : ''}>Show this project on the Checkpoints tab</label>
  </div>`).join('');
  const projBody = `${projects}<form class="inline-form" data-act-submit="proj-add"><input class="field" id="new-proj" placeholder="New project, e.g. Lap joint (GMAW)" maxlength="60" required><button type="submit" class="btn">Add</button></form>`;

  const nStore = S.storageBooths.length;
  const shopBody = `<label class="lbl" for="shop-count">Booths in the shop<input class="field num" type="number" min="1" max="60" id="shop-count" data-act="shop-count" value="${S.boothCount}"></label>
    <div class="sec-label">Storage booths</div>
    <p class="muted small" style="margin:0">Tap a booth to switch it between welding and storage. Storage booths show hatched on the Class and Booths tabs and can't hold students.</p>
    <div class="booth-picker">${Array.from({ length: S.boothCount }, (_, i) => i + 1).map(b => `<button type="button" class="chip-btn" data-act="storage-toggle" data-booth="${b}" aria-pressed="${isStorage(b)}" aria-label="Booth ${b}${isStorage(b) ? ', storage' : ''}">${b}</button>`).join('')}</div>
    <p class="small" style="margin:0"><b>${S.boothCount - nStore} welding booth${S.boothCount - nStore === 1 ? '' : 's'}</b>${nStore ? `, ${nStore} storage (${S.storageBooths.join(', ')})` : ''}.</p>
    ${S.classes.map(c => { const cells = boothCells(c.id).filter(x => !x.storage); const sh = cells.filter(x => x.seats.length > 1).length; const n = seatsOf(c.id).length; return `<p class="muted small" style="margin:0">${esc(c.name)}: ${n} student${n === 1 ? '' : 's'} in ${cells.length} booth${cells.length === 1 ? '' : 's'}${sh ? `, ${sh} shared` : ''}.</p>`; }).join('')}`;
  const photoBody = `<label class="toggle"><input type="checkbox" id="stamp-photos" data-act="stamp-photos"${S.stampPhotos ? ' checked' : ''}>Stamp booth, code, class, date and time on new photos</label>
    <p class="muted small" style="margin:0">The stamp keeps a photo self-explanatory when someone sees it outside the app, for example attached to a referral. Location data from the camera is always removed. The camera opens directly, so every photo is taken at the moment it's logged.</p>`;
  const gradeBody = `<label class="lbl" for="base-pts">Points each student starts with per class day<input class="field num" type="number" min="1" max="100" id="base-pts" data-act="base-pts" value="${S.base}"></label>
    <p class="muted small" style="margin:0">Employability = (class days × ${S.base} + net points) ÷ (class days × ${S.base}), capped at 100%. Example: 5 class days with one Late (${fmtPts(behById('late')?.pts ?? -1)}) is ${pct(clamp((5 * S.base + (behById('late')?.pts ?? -1)) / (5 * S.base), 0, 1))}. Use the same number in your Sheet.</p>`;

  const lastExp = S.lastExport ? new Date(S.lastExport).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'never';
  const newN = Math.max(0, EV.length - (S.lastExportN || 0));
  const dataBody = `<p class="small" style="margin:0">Last export: <b>${esc(lastExp)}</b> · ${newN} entr${newN === 1 ? 'y' : 'ies'} since.</p>
    ${PREVIEW ? '<p class="muted small" style="margin:0">This preview can\'t save files. Exports work in the installed copy.</p>' : ''}
    <div class="stack">
      <button type="button" class="btn primary" data-act="export-events">Export log (CSV for the Events tab)</button>
      <button type="button" class="btn" data-act="export-roster">Export roster (CSV for the Roster tab)</button>
      <button type="button" class="btn" data-act="export-photos">Export weld photos (ZIP)</button>
      <button type="button" class="btn" data-act="backup">Back up everything to a file</button>
      <button type="button" class="btn" data-act="restore">Restore from a backup file</button>
    </div>
    <p class="muted small" style="margin:0" id="storage-info">Checking storage…</p>
    <button type="button" class="btn sm" data-act="clear-photos">Free space: delete photos already exported</button>
    <button type="button" class="btn sm danger" data-act="erase">Erase everything on this phone</button>`;

  const privBody = `<div class="privacy stack">
    <p>This app has no server and no account. Everything you enter stays in this phone's browser storage until you export it.</p>
    <p>Students appear only as booth numbers and random codes. The list that matches codes to names lives in the Key tab of your school Google Sheet, never in the app.</p>
    <p>The installed copy blocks itself from contacting any website, so it can't send data anywhere even by mistake. Exports leave only when you send the file somewhere, such as your school Drive.</p>
    <p>Weld photos are shrunk and re-saved on the phone, which strips the location data cameras attach.</p>
    <p class="muted small">Version ${esc(VERSION)}${store.ok ? '' : ' · storage unavailable'}</p></div>`;

  return `<div class="setup stack">
    <h1 style="font-size:24px;font-weight:850">Setup</h1>
    ${sec('shop', 'Shop layout', shopBody)}
    ${sec('classes', 'Classes and booths', classesBody)}
    ${sec('codes', 'Behavior codes', codesBody)}
    ${sec('tasks', 'Tasks', tasksBody)}
    ${sec('booth', 'Booth cleanup check', boothBody)}
    ${sec('photos', 'Photos', photoBody)}
    ${sec('projects', 'Projects and checkpoints', projBody)}
    ${sec('grading', 'Employability grade', gradeBody)}
    ${sec('data', 'Export and backup', dataBody)}
    ${sec('privacy', 'How your data is kept', privBody)}
  </div>`;
}
async function fillStorageInfo() {
  const el = $('#storage-info');
  if (!el) return;
  let txt = '';
  try {
    const photos = await store.all('photos');
    const bytes = photos.reduce((a, p) => a + (p.buf ? p.buf.byteLength : 0), 0);
    const exported = photos.filter(p => p.exported).length;
    txt = `${photos.length} photo${photos.length === 1 ? '' : 's'} on the phone (${(bytes / 1048576).toFixed(1)} MB), ${exported} already exported. ${EV.length} log entries.`;
    if (navigator.storage && navigator.storage.persisted) {
      const p = await navigator.storage.persisted();
      txt += p ? ' Storage is marked as kept.' : ' The browser may clear storage if the phone runs low, so export weekly.';
    }
  } catch (e) { txt = `${EV.length} log entries.`; }
  el.textContent = txt;
}

// ---------- export ----------
// Free text that starts like a formula gets a leading apostrophe so the Sheet imports it as text.
const txt = v => { const s = String(v ?? ''); return /^[=+\-@\t\r]/.test(s) ? "'" + s : s; };
function csvCell(v) {
  if (v == null) return '';
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const EVENT_COLS = ['Date', 'Time', 'Class', 'Kind', 'Booth', 'Code', 'Item', 'Status', 'Points', 'Project', 'Count', 'Note', 'Photo', 'Voided', 'EventID', 'Shared booth'];
function shareCSV(e) {
  if (!e.mates || e.kind !== 'booth') return '';
  const r = e.matesResp ? e.matesResp.split(';') : [];
  return `With ${e.mates.split(';').join(', ')}; ${r.length ? `also marked: ${r.join(', ')}` : 'only this student marked'}`;
}
function eventsCSV() {
  const rows = [EVENT_COLS.join(',')];
  for (const e of [...EV].sort((a, b) => a.ts - b.ts)) {
    rows.push([
      e.date, e.time, txt(clsLabel(e)), e.kind, e.booth ?? '', e.code, txt(itemLabel(e)), e.status,
      e.pts || 0, e.kind === 'checkpoint' ? txt(projLabel(e)) : '', e.kind === 'sweep' ? e.count : '', txt(e.note), photoNames(e).join('; '), e.voided ? 'Yes' : '', e.id, shareCSV(e),
    ].map(csvCell).join(','));
  }
  return rows.join('\r\n') + '\r\n';
}
function rosterCSV() {
  const rows = ['Class,Booth,Code,Since,Active,Side'];
  const order = new Map(S.classes.map((c, i) => [c.id, i]));
  [...S.seats].sort((a, b) => (order.get(a.cls) - order.get(b.cls)) || (b.active - a.active) || bySeat(a, b)).forEach(s => {
    rows.push([txt(classById(s.cls)?.name || ''), s.booth, s.code, s.since, s.active ? 'Yes' : 'No', sideOf(s)].map(csvCell).join(','));
  });
  return rows.join('\r\n') + '\r\n';
}
async function deliver(blob, filename) {
  if (PREVIEW) { toast('The preview can\'t save files. Install the app to export.'); return false; }
  const file = new File([blob], filename, { type: blob.type });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: filename });
      return true;
    }
  } catch (e) {
    if (e && e.name === 'AbortError') { toast('Export cancelled.'); return false; }
  }
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return true;
  } catch (e) { toast('This browser blocked the download.'); return false; }
}
async function exportEvents() {
  const ok = await deliver(new Blob([eventsCSV()], { type: 'text/csv' }), `shop-log_${today()}.csv`);
  if (ok) { S.lastExport = Date.now(); S.lastExportN = EV.length; await save(); render(); toast(`Exported ${EV.length} entries.`); }
}
async function exportRoster() {
  await deliver(new Blob([rosterCSV()], { type: 'text/csv' }), `shop-roster_${today()}.csv`);
}
// Minimal ZIP writer (stored, no compression: JPEGs don't shrink anyway).
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(u8) { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function makeZip(files) {
  const enc = new TextEncoder();
  const parts = [], central = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name), data = f.data, crc = crc32(data);
    const d = f.date || new Date();
    const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true); lh.setUint32(14, crc, true);
    lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
    parts.push(lh.buffer, name, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
    ch.setUint16(12, dosTime, true); ch.setUint16(14, dosDate, true); ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true);
    ch.setUint16(28, name.length, true); ch.setUint16(30, 0, true); ch.setUint16(32, 0, true); ch.setUint16(34, 0, true); ch.setUint16(36, 0, true);
    ch.setUint32(38, 0, true); ch.setUint32(42, offset, true);
    central.push(ch.buffer, name);
    offset += 30 + name.length + data.length;
  }
  const cdSize = central.reduce((a, p) => a + p.byteLength, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end.buffer], { type: 'application/zip' });
}
async function exportPhotos(onlyNew) {
  const photos = new Map((await store.all('photos')).map(p => [p.id, p]));
  const files = [], recs = new Map();
  for (const e of EV) {
    if (e.voided) continue;
    const ids = photoIds(e), names = photoNames(e);
    ids.forEach((id, i) => {
      const p = photos.get(id);
      if (!p || recs.has(id) || (onlyNew && p.exported)) return;
      recs.set(id, p);
      files.push({ name: names[i], data: new Uint8Array(p.buf), date: new Date(e.ts) });
    });
  }
  if (!files.length) { toast(onlyNew ? 'No new photos to export.' : 'No photos on this phone.'); return; }
  readySheet(makeZip(files), `shop-photos_${today()}.zip`, `${files.length} photo${files.length === 1 ? '' : 's'}`, async () => {
    await store.putMany('photos', [...recs.values()].map(p => Object.assign(p, { exported: true })));
    toast(`Exported ${files.length} photo${files.length === 1 ? '' : 's'}.`);
  });
}
// Building a ZIP or backup takes a moment; the phone only opens its share sheet straight from a tap,
// so the file is prepared first and saved from a second tap.
function readySheet(blob, filename, what, onDone) {
  UI.pending = { blob, filename, onDone };
  const mb = blob.size / 1048576;
  openSheet(`<div class="sheet-head"><div><h2>File ready</h2><div class="sub">${esc(filename)} · ${esc(what)} · ${mb < 0.1 ? '&lt;0.1' : mb.toFixed(1)} MB</div></div>${closeBtn}</div>
    <p class="muted small" style="margin:0">On the next screen, pick Google Drive and your school account.</p>
    <button type="button" class="btn primary block" data-act="deliver-pending">Save file</button>`, 'File ready');
}
async function deliverPending() {
  const p = UI.pending;
  if (!p) return;
  const ok = await deliver(p.blob, p.filename);
  if (ok) { UI.pending = null; closeSheet(); if (p.onDone) await p.onDone(); render(); }
}
function photoExportSheet() {
  const html = `<div class="sheet-head"><div><h2>Export weld photos</h2><div class="sub">Saved as one ZIP. File names match the Photo column in the log.</div></div>${closeBtn}</div>
    <button type="button" class="btn primary block" data-act="export-photos-new">Photos not exported yet</button>
    <button type="button" class="btn block" data-act="export-photos-all">All photos on this phone</button>`;
  openSheet(html, 'Export photos');
}
function toB64(buf) {
  const u8 = new Uint8Array(buf); let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromB64(b64) { const s = atob(b64); const u8 = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i); return u8.buffer; }
function backupSheet() {
  const html = `<div class="sheet-head"><div><h2>Back up everything</h2><div class="sub">Use this to move to a new phone. The file contains codes, not names.</div></div>${closeBtn}</div>
    <button type="button" class="btn primary block" data-act="backup-photos">Back up with photos</button>
    <button type="button" class="btn block" data-act="backup-nophotos">Back up without photos (smaller)</button>`;
  openSheet(html, 'Back up');
}
async function backup(withPhotos) {
  const photos = withPhotos ? (await store.all('photos')).map(p => ({ id: p.id, type: p.type, ts: p.ts, exported: p.exported, b64: toB64(p.buf) })) : [];
  const data = { app: 'weld-shop-tracker', version: VERSION, savedAt: new Date().toISOString(), config: S, events: EV, photos };
  readySheet(new Blob([JSON.stringify(data)], { type: 'application/json' }), `shop-backup_${today()}.json`, `${EV.length} entries${withPhotos ? `, ${photos.length} photos` : ''}`, async () => { toast('Backup saved.'); });
}
async function restoreFile(file) {
  let data;
  try { data = JSON.parse(await file.text()); } catch (e) { toast('That file isn\'t a backup from this app.'); return; }
  if (!data || data.app !== 'weld-shop-tracker' || !data.config || !Array.isArray(data.events)) { toast('That file isn\'t a backup from this app.'); return; }
  const ok = await ask({ title: 'Replace everything on this phone?', body: `The backup from ${data.savedAt ? new Date(data.savedAt).toLocaleDateString() : 'an earlier date'} has ${data.events.length} entries. What's on this phone now will be replaced.`, ok: 'Replace', danger: true });
  if (!ok) return;
  await store.clear('events'); await store.clear('photos');
  S = loadConfig(data.config);
  S.ui.tab = 'class';
  EV = data.events;
  await store.putMany('events', EV);
  if (Array.isArray(data.photos) && data.photos.length) {
    await store.putMany('photos', data.photos.map(p => ({ id: p.id, type: p.type, ts: p.ts, exported: !!p.exported, buf: fromB64(p.b64) })));
  }
  await save();
  UI.photoURLs.clear(); UI.sweep = null;
  render();
  toast(`Restored ${EV.length} entries.`);
}

// ---------- PDF record (no library: built-in Helvetica text plus the JPEG photos as-is) ----------
const PDF_W = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const PDF_WB = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];
const PDF_WIN = { 0x2013: 0x96, 0x2014: 0x97, 0x2018: 0x91, 0x2019: 0x92, 0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2026: 0x85, 0x20AC: 0x80, 0x2212: 0x2D, 0x202F: 0x20, 0x2009: 0x20, 0x00A0: 0x20 };
const PDF_XW = { 0x96: 556, 0x97: 1000, 0x91: 222, 0x92: 222, 0x93: 333, 0x94: 333, 0x95: 350, 0x85: 1000, 0xB7: 278, 0xD7: 584, 0x80: 556 };
function pdfBytes(str) {
  const out = [];
  for (const ch of String(str)) {
    const c = ch.codePointAt(0);
    out.push(c >= 32 && c <= 126 ? c : PDF_WIN[c] != null ? PDF_WIN[c] : (c >= 0xA1 && c <= 0xFF) ? c : 63);
  }
  return out;
}
function pdfWidth(str, size, bold) {
  const t = bold ? PDF_WB : PDF_W;
  let w = 0;
  for (const b of pdfBytes(str)) w += b >= 32 && b <= 126 ? t[b - 32] : (PDF_XW[b] || 556);
  return (w * size) / 1000;
}
const pdfStr = str => pdfBytes(str).map(b => (b === 40 || b === 41 || b === 92 ? '\\' + String.fromCharCode(b) : b > 126 ? '\\' + b.toString(8).padStart(3, '0') : String.fromCharCode(b))).join('');
function jpegInfo(u8) {
  if (!u8 || u8.length < 4 || u8[0] !== 0xFF || u8[1] !== 0xD8) return null;
  let i = 2;
  while (i + 9 < u8.length) {
    if (u8[i] !== 0xFF) { i++; continue; }
    const m = u8[i + 1];
    if (m === 0xFF) { i++; continue; }
    if (m === 0xD8 || m === 0x01 || (m >= 0xD0 && m <= 0xD7)) { i += 2; continue; }
    const len = (u8[i + 2] << 8) | u8[i + 3];
    if ((m >= 0xC0 && m <= 0xC3) || (m >= 0xC5 && m <= 0xC7) || (m >= 0xC9 && m <= 0xCB) || (m >= 0xCD && m <= 0xCF)) {
      return { h: (u8[i + 5] << 8) | u8[i + 6], w: (u8[i + 7] << 8) | u8[i + 8], comps: u8[i + 9] };
    }
    i += 2 + len;
  }
  return null;
}
function pdfWriter() {
  const W = 612, H = 792, M = 54, CW = W - 2 * M, BOTTOM = M + 16;
  const pages = [], images = new Map();
  let page, y;
  const newPage = () => { page = { ops: [], imgs: new Set() }; pages.push(page); y = H - M; };
  newPage();
  const text = (str, x, base, size, bold, gray) => page.ops.push(`BT ${gray == null ? 0 : gray} g /${bold ? 'F2' : 'F1'} ${size} Tf ${x.toFixed(2)} ${base.toFixed(2)} Td (${pdfStr(str)}) Tj ET`);
  const api = {
    space(h) { y -= h; },
    ensure(h) { if (y - h < BOTTOM) newPage(); },
    wrap(str, size, bold, width) {
      const lines = [];
      let cur = '';
      for (const w of String(str).split(/\s+/).filter(Boolean)) {
        const t = cur ? `${cur} ${w}` : w;
        if (pdfWidth(t, size, bold) <= width) { cur = t; continue; }
        if (cur) lines.push(cur);
        if (pdfWidth(w, size, bold) <= width) { cur = w; continue; }
        let part = '';
        for (const ch of w) { if (part && pdfWidth(part + ch, size, bold) > width) { lines.push(part); part = ch; } else part += ch; }
        cur = part;
      }
      if (cur) lines.push(cur);
      return lines.length ? lines : [''];
    },
    para(str, { size = 10, bold = false, gray = null, indent = 0, after = 0, lead = 1.35 } = {}) {
      const lh = size * lead;
      for (const line of api.wrap(str, size, bold, CW - indent)) {
        api.ensure(lh);
        y -= lh;
        text(line, M + indent, y + (lh - size) / 2 + size * 0.2, size, bold, gray);
      }
      y -= after;
    },
    rule(gap = 8) {
      api.ensure(gap * 2 + 2);
      y -= gap;
      page.ops.push(`0.8 G 0.6 w ${M} ${y.toFixed(2)} m ${W - M} ${y.toFixed(2)} l S`);
      y -= gap;
    },
    images(list) {
      const gap = 12, slot = (CW - gap) / 2, maxH = 250;
      for (let i = 0; i < list.length; i += 2) {
        const row = list.slice(i, i + 2).map(im => {
          let w = slot, h = im.info.h * (slot / im.info.w);
          if (h > maxH) { w *= maxH / h; h = maxH; }
          return { im, w, h };
        });
        const rh = Math.max(...row.map(r => r.h));
        api.ensure(rh + 6);
        y -= rh;
        row.forEach((r, j) => {
          if (!images.has(r.im.key)) images.set(r.im.key, Object.assign({ name: `Im${images.size + 1}`, data: r.im.data }, r.im.info));
          const nm = images.get(r.im.key).name;
          page.imgs.add(nm);
          page.ops.push(`q ${r.w.toFixed(2)} 0 0 ${r.h.toFixed(2)} ${(M + j * (slot + gap)).toFixed(2)} ${(y + rh - r.h).toFixed(2)} cm /${nm} Do Q`);
        });
        y -= 6;
      }
    },
    footer(fn) { pages.forEach((p, i) => { page = p; text(fn(i + 1, pages.length), M, 30, 8, false, 0.4); }); },
    build() {
      const enc = new TextEncoder();
      const chunks = [], offsets = [];
      let len = 0;
      const push = d => { const u = typeof d === 'string' ? enc.encode(d) : d; chunks.push(u); len += u.length; };
      const imgList = [...images.values()];
      const imgNum = new Map(imgList.map((im, i) => [im.name, 5 + i]));
      let n = 5 + imgList.length;
      const pageNums = pages.map(() => { const r = [n, n + 1]; n += 2; return r; });
      const total = n - 1;
      const obj = (num, body) => { offsets[num] = len; push(`${num} 0 obj\n`); if (typeof body === 'function') body(); else push(body); push('\nendobj\n'); };
      push(new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52, 10, 37, 226, 227, 207, 211, 10]));
      obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
      obj(2, `<< /Type /Pages /Kids [${pageNums.map(([p]) => `${p} 0 R`).join(' ')}] /Count ${pages.length} >>`);
      obj(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
      obj(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
      imgList.forEach(im => obj(imgNum.get(im.name), () => {
        const cs = im.comps === 1 ? '/DeviceGray' : im.comps === 4 ? '/DeviceCMYK /Decode [1 0 1 0 1 0 1 0]' : '/DeviceRGB';
        push(`<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace ${cs} /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.data.length} >>\nstream\n`);
        push(im.data);
        push('\nendstream');
      }));
      pages.forEach((pg, i) => {
        const [p, c] = pageNums[i];
        const xo = [...pg.imgs].map(nm => `/${nm} ${imgNum.get(nm)} 0 R`).join(' ');
        obj(p, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >>${xo ? ` /XObject << ${xo} >>` : ''} >> /Contents ${c} 0 R >>`);
        const content = pg.ops.join('\n');
        obj(c, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
      });
      const xref = len;
      let x = `xref\n0 ${total + 1}\n0000000000 65535 f \n`;
      for (let k = 1; k <= total; k++) x += `${String(offsets[k]).padStart(10, '0')} 00000 n \n`;
      push(x);
      push(`trailer\n<< /Size ${total + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
      return new Blob(chunks, { type: 'application/pdf' });
    },
  };
  return api;
}
function recordLines(e) {
  const out = [];
  const pts = e.pts ? ` (${fmtPts(e.pts)} point${Math.abs(e.pts) === 1 ? '' : 's'})` : '';
  switch (e.kind) {
    case 'booth':
      out.push(`${e.status === 'Major' ? 'Booth left in a major mess' : 'Booth left dirty'}${pts}`);
      if (e.item && e.item !== 'Not specified') out.push(`What was wrong: ${e.item}`);
      if (e.mates) out.push(`${shareText(e)}.`);
      break;
    case 'behavior': out.push(`${itemLabel(e)}${pts}`); break;
    case 'action': out.push(`Action taken: ${itemLabel(e)}`); break;
    case 'task': out.push(`Task ${e.status === 'Done' ? 'completed' : 'assigned'}: ${itemLabel(e)}`); break;
    case 'checkpoint': out.push(`Checkpoint ${itemLabel(e)} on ${projLabel(e)}: ${e.status}`); break;
    default: out.push(evTitle(e));
  }
  if (e.note) out.push(`Note: ${e.note}`);
  return out;
}
function recordSummary(seat, evs, mode) {
  const lines = [];
  const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;
  const booth = evs.filter(e => e.kind === 'booth');
  if (booth.length) {
    const major = booth.filter(e => e.status === 'Major').length;
    const b30 = boothPattern(seat.code, true);
    lines.push(`${plural(booth.length, 'dirty-booth entry', 'dirty-booth entries')}, ${major} of them a major mess. ${b30.n} in the last ${S.patternDays} days.`);
    const rc = {};
    booth.forEach(e => String(e.item).split('; ').forEach(r => { if (r && r !== 'Not specified') rc[r] = (rc[r] || 0) + 1; }));
    const top = Object.entries(rc).sort((a, b) => b[1] - a[1]).slice(0, 4);
    if (top.length) lines.push(`Most often: ${top.map(([r, n]) => `${r} (${n})`).join(', ')}.`);
    const wp = booth.filter(e => photoIds(e).length).length;
    lines.push(`Photos attached to ${wp} of ${plural(booth.length, 'booth entry', 'booth entries')}.`);
  }
  if (mode === 'all') {
    const group = (keep, label) => {
      const c = {};
      evs.filter(keep).forEach(e => { const l = itemLabel(e); c[l] = (c[l] || 0) + 1; });
      const list = Object.entries(c).sort((a, b) => b[1] - a[1]);
      if (list.length) lines.push(`${label}: ${list.map(([l, n]) => `${l} ${n}`).join(', ')}.`);
    };
    group(e => e.kind === 'behavior' && e.pts < 0, 'Needs work');
    group(e => e.kind === 'behavior' && e.pts > 0, 'Positive');
    group(e => e.kind === 'action', 'Actions taken');
    const cps = evs.filter(e => e.kind === 'checkpoint');
    if (cps.length) lines.push(`Checkpoints: ${cps.filter(e => e.status === 'Approved').length} approved, ${cps.filter(e => e.status === 'Needs work').length} needs work, ${cps.filter(e => e.status === 'Redo').length} redo.`);
    const tasks = evs.filter(e => e.kind === 'task');
    if (tasks.length) lines.push(`Tasks: ${tasks.filter(e => e.status === 'Assigned').length} assigned, ${tasks.filter(e => e.status === 'Done').length} completed.`);
    const net = evs.reduce((a, e) => a + (['behavior', 'action', 'booth'].includes(e.kind) ? e.pts || 0 : 0), 0);
    lines.push(`Net employability points across these entries: ${fmtPts(net)}.`);
  }
  return lines;
}
function buildRecordPdf({ seat, evs, mode, photoRecs }) {
  const pdf = pdfWriter();
  const title = mode === 'booth' ? 'Booth cleanup record' : 'Shop record';
  const clsName = classById(seat.cls)?.name || clsLabel(evs[0]);
  pdf.para(title, { size: 20, bold: true, lead: 1.2, after: 2 });
  pdf.para('Weld Shop Tracker', { size: 9, gray: 0.4, after: 10 });
  pdf.para(`Student code ${seat.code} · Booth ${bl(seat)} · ${clsName}${seat.active ? '' : ' · former student'}`, { size: 11, bold: true, after: 8 });
  pdf.para('Student name: ____________________________________________', { size: 11, after: 8 });
  pdf.para(`Covers ${fmtLong(evs[0].date)} to ${fmtLong(evs[evs.length - 1].date)}. Prepared ${fmtStamp(new Date())}.`, { size: 9.5, gray: 0.35 });
  pdf.rule(10);
  pdf.para('Summary', { size: 13, bold: true, after: 4 });
  for (const line of recordSummary(seat, evs, mode)) pdf.para(`•  ${line}`, { size: 10, after: 2 });
  pdf.rule(10);
  pdf.para(`Entries, oldest first (${evs.length})`, { size: 13, bold: true, after: 2 });
  evs.forEach((e, idx) => {
    pdf.ensure(54);
    pdf.space(4);
    const other = clsLabel(e) !== clsName ? ` · ${clsLabel(e)}` : '';
    pdf.para(`${fmtLong(e.date)} · ${fmtTime(e.time)}${other}`, { size: 10.5, bold: true, after: 1 });
    for (const line of recordLines(e)) pdf.para(line, { size: 10 });
    const ids = photoIds(e), names = photoNames(e);
    const imgs = [], missing = [];
    ids.forEach((id, i) => {
      const rec = photoRecs.get(id);
      const data = rec && rec.buf ? new Uint8Array(rec.buf) : null;
      const info = data && jpegInfo(data);
      if (info && info.w && info.h) imgs.push({ key: id, info, data }); else missing.push(names[i]);
    });
    if (imgs.length) { pdf.space(5); pdf.images(imgs); }
    if (names.length) pdf.para(`Photo file${names.length > 1 ? 's' : ''}: ${names.join('; ')}`, { size: 7.5, gray: 0.45 });
    if (missing.length) pdf.para(`Not on the phone any more (exported, then cleared): ${missing.join('; ')}`, { size: 7.5, gray: 0.45 });
    if (idx < evs.length - 1) pdf.rule(6);
  });
  pdf.rule(12);
  pdf.para(`Times are when each entry was logged in the app on the teacher's phone.${S.stampPhotos ? ' Photos are stamped on the phone with the booth, code, class and the time they were taken.' : ''} Entries removed in the app are not included. Match the code to the student on the Key tab of the school Sheet.`, { size: 8.5, gray: 0.4 });
  pdf.footer((i, n) => `Weld Shop Tracker · ${title} · code ${seat.code} · page ${i} of ${n}`);
  return pdf.build();
}
async function recordPdf(seatId, mode) {
  const s = seatById(seatId);
  if (!s) return;
  const evs = EV.filter(e => !e.voided && e.code === s.code && (mode === 'booth' ? e.kind === 'booth' : !['day', 'sweep'].includes(e.kind))).sort((a, b) => a.ts - b.ts);
  if (!evs.length) { toast('Nothing to put in this record yet.'); return; }
  const photoRecs = new Map();
  for (const e of evs) {
    for (const id of photoIds(e)) {
      if (photoRecs.has(id)) continue;
      try { photoRecs.set(id, await store.get('photos', id)); } catch (err) { photoRecs.set(id, null); }
    }
  }
  let blob;
  try { blob = buildRecordPdf({ seat: s, evs, mode, photoRecs }); } catch (err) { console.error(err); toast('The record couldn\'t be built. Try again.'); return; }
  readySheet(blob, `record_${s.code}_${mode === 'booth' ? 'booth-cleanup' : 'all'}_${today()}.pdf`, `${evs.length} entr${evs.length === 1 ? 'y' : 'ies'}`, async () => { toast('Record saved.'); });
}

// ---------- sample data ----------
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function buildSample() {
  const rnd = mulberry32(20261017);
  const pick = arr => arr[Math.floor(rnd() * arr.length)];
  const cfg = defaultConfig();
  cfg.sample = true;
  const t = today();
  const days = [];
  for (let d = addDays(t, -1); days.length < 20; d = addDays(d, -1)) { const wd = parseYmd(d).getDay(); if (wd !== 0 && wd !== 6) days.unshift(d); }
  days.push(t);
  const start = days[0];
  const defs = [
    { name: 'Welding I (P1–2)', start: '07:40', end: '09:15', bad: 0.8, booths: [1, 2, 3, 4, 5, 6, 9, 10, 11, 12, 13, 13, 14, 14] },
    { name: 'Welding II (P3–4)', start: '09:20', end: '10:55', bad: 1.35, booths: [1, 2, 3, 4, 5, 6, 9, 10, 11, 12, 13, 14] },
    { name: 'Welding III (P6–7)', start: '12:10', end: '13:45', bad: 0.6, booths: [1, 2, 3, 4, 5, 6, 9, 10, 11, 12] },
  ];
  const used = new Set();
  const code = () => { for (;;) { const c = makeCode(n => Math.floor(rnd() * n)); if (!used.has(c)) { used.add(c); return c; } } };
  defs.forEach(d => {
    const id = uid();
    cfg.classes.push({ id, name: d.name, start: d.start, end: d.end });
    const seen = {};
    d.booths.forEach(b => {
      seen[b] = (seen[b] || 0) + 1;
      const side = d.booths.filter(x => x === b).length > 1 ? SIDES[seen[b] - 1] : '';
      cfg.seats.push({ id: uid(), cls: id, booth: b, side, code: code(), since: start, active: true, risk: 0.4 + rnd() * 1.6 * (rnd() < 0.2 ? 2.2 : 1), skill: 0.55 + rnd() * 0.4 });
    });
  });
  cfg.boothCount = 14;
  cfg.storageBooths = [7, 8];
  const [c1, c2, c3] = cfg.classes;
  // a student who moved booths partway through, to show history survives
  const leaver = cfg.seats.find(s => s.cls === c2.id && s.booth === 11);
  leaver.active = false;
  cfg.seats.push({ id: uid(), cls: c2.id, booth: 11, code: code(), since: days[9], active: true, risk: 0.8, skill: 0.75 });
  const cp = names => names.map(name => ({ id: uid(), name, active: true }));
  cfg.projects.push({ id: uid(), name: 'Fillet weld T-joint (GMAW)', classes: [c1.id, c2.id], active: true, checkpoints: cp(['Layout and fit-up', 'Tack welds', 'Root pass', 'Cover pass', 'Final inspection']) });
  cfg.projects.push({ id: uid(), name: 'Open-root V-groove plate (SMAW)', classes: [c3.id], active: true, checkpoints: cp(['Bevel and land', 'Fit-up gap check', 'Root pass', 'Hot pass', 'Fill passes', 'Cap and visual', 'Bend test']) });
  cfg.ui.cls = c1.id;
  const B = id => cfg.behaviors.find(b => b.id === id);
  const evs = [];
  const at = (date, cls, minuteOffset) => {
    const [h, m] = cls.start.split(':').map(Number);
    const d = parseYmd(date); d.setHours(h, m + minuteOffset, Math.floor(rnd() * 60), 0);
    return { ts: d.getTime(), date, time: hm(d) };
  };
  const push = (o) => evs.push(makeEvent(o));
  const probs = [['late', 0.05, 1], ['absent', 0.045, 0], ['offtask', 0.05, 30], ['sleeping', 0.015, 40], ['horseplay', 0.02, 50], ['noppe', 0.025, 20], ['assist', 0.07, 60], ['communal', 0.045, 85]];
  const progress = new Map();
  days.forEach((date, di) => {
    const isToday = date === t;
    for (const cls of cfg.classes) {
      const def = defs[cfg.classes.indexOf(cls)];
      push(Object.assign({ kind: 'day', cls: cls.id, clsName: cls.name, status: 'Held' }, at(date, cls, 0)));
      const seats = cfg.seats.filter(s => s.cls === cls.id && s.since <= date && (s.active || di < 9));
      const proj = cfg.projects.find(p => p.classes.includes(cls.id));
      for (const s of seats) {
        let absentToday = false;
        let negToday = 0;
        for (const [id, p, off] of probs) {
          const neg = B(id).type === 'neg';
          const pr = neg ? p * def.bad * s.risk : p * (1.3 - s.risk * 0.3);
          if (isToday && cls !== cfg.classes[0]) continue;
          if (absentToday) break;
          if (rnd() < pr) {
            if (id === 'absent') absentToday = true;
            if (neg) negToday++;
            const b = B(id);
            push(Object.assign({ kind: 'behavior', cls: cls.id, clsName: cls.name, booth: s.booth, code: s.code, item: b.label, ref: b.id, pts: b.pts,
              note: id === 'noppe' && rnd() < 0.5 ? pick(['No safety glasses under hood', 'Cuffs rolled up', 'Gloves off while grinding']) : '' }, at(date, cls, off + Math.floor(rnd() * 10))));
          }
        }
        if (negToday >= 2) { const b = B(rnd() < 0.8 ? 'warning' : 'parent'); push(Object.assign({ kind: 'action', cls: cls.id, clsName: cls.name, booth: s.booth, code: s.code, item: b.label, ref: b.id, pts: 0 }, at(date, cls, 70))); }
        if (absentToday || !proj || isToday) continue;
        const key = s.code;
        const pg = progress.get(key) || { i: 0, tries: 0 };
        if (pg.i < proj.checkpoints.length && rnd() < 0.42) {
          const k = proj.checkpoints[pg.i];
          const pass = rnd() < s.skill + pg.tries * 0.15;
          const status = pass ? 'Approved' : rnd() < 0.25 ? 'Redo' : 'Needs work';
          push(Object.assign({ kind: 'checkpoint', cls: cls.id, clsName: cls.name, booth: s.booth, code: s.code, item: k.name, ref: k.id, status, project: proj.name, projectId: proj.id,
            note: pass ? '' : pick(['Undercut at toe', 'Porosity at restart', 'Uneven leg size', 'Lack of fusion on root', 'Too much spatter']) }, at(date, cls, 35 + Math.floor(rnd() * 40))));
          if (pass) { pg.i++; pg.tries = 0; } else pg.tries++;
          progress.set(key, pg);
        }
      }
      if (rnd() < 0.9 && !isToday) {
        const sid = uid();
        const tm = at(date, cls, 88);
        push(Object.assign({ kind: 'sweep', cls: cls.id, clsName: cls.name, count: seats.length, sweep: sid, status: 'Done' }, tm));
        const byBooth = new Map();
        seats.forEach(s => { if (!byBooth.has(s.booth)) byBooth.set(s.booth, []); byBooth.get(s.booth).push(s); });
        for (const occ of byBooth.values()) {
          const risk = Math.max(...occ.map(s => s.risk));
          if (rnd() < 0.07 * def.bad * (0.6 + risk * 0.4)) {
            const rs = [pick(cfg.reasons)]; if (rnd() < 0.35) rs.push(pick(cfg.reasons));
            const major = rnd() < 0.12 * risk;
            if (major) rs.push(pick(cfg.reasons));
            const note = major ? pick(['Slag and rod stubs across the bench and floor', 'Leads tangled on the floor, stinger left on the table', 'Grinder left plugged in on the bench', 'Hoses on the floor, cart not returned']) : '';
            const resp = occ.length > 1 && rnd() < 0.4 ? [occ.reduce((a, s) => (s.risk > a.risk ? s : a))] : occ;
            for (const s of resp) {
              const mates = occ.filter(x => x !== s);
              push(Object.assign({ kind: 'booth', cls: cls.id, clsName: cls.name, booth: s.booth, code: s.code, item: [...new Set(rs.map(r => r.label))].join('; '),
                status: major ? 'Major' : 'Dirty', pts: major ? cfg.boothMajorPts : cfg.boothPts, sweep: sid, note,
                mates: mates.map(x => x.code).join(';'), matesResp: mates.filter(x => resp.includes(x)).map(x => x.code).join(';') }, tm));
            }
          }
        }
      }
    }
  });
  // a few tasks
  for (let i = 0; i < 6; i++) {
    const s = pick(cfg.seats.filter(x => x.active));
    const cls = cfg.classes.find(c => c.id === s.cls);
    const tk = pick(cfg.tasks);
    const di = days.length - 2 - Math.floor(rnd() * 6);
    const inst = uid();
    push(Object.assign({ kind: 'task', cls: cls.id, clsName: cls.name, booth: s.booth, code: s.code, item: tk.label, ref: tk.id, status: 'Assigned', task: inst }, at(days[di], cls, 75)));
    if (i > 1) push(Object.assign({ kind: 'task', cls: cls.id, clsName: cls.name, booth: s.booth, code: s.code, item: tk.label, ref: tk.id, status: 'Done', task: inst }, at(days[di + 1], cls, 80)));
  }
  cfg.seats.forEach(s => { delete s.risk; delete s.skill; });
  return { cfg, evs };
}

// ---------- actions ----------
async function setTab(tab) {
  S.ui.tab = tab;
  if (tab !== 'class') { UI.multi = false; UI.selected.clear(); }
  closeSheet();
  await save();
  render();
  window.scrollTo(0, 0);
}
async function onClick(el, e) {
  const act = el.dataset.act;
  const id = el.dataset.id;
  switch (act) {
    case 'close-sheet': closeSheet(); if (S && S.ui.tab === 'booths') render(); return;
    case 'go-setup': return setTab('setup');
    case 'hide-install': S.ui.hideInstall = true; await save(); return render();
    case 'apply-update': {
      const reg = await navigator.serviceWorker?.getRegistration();
      UI.reloadOnChange = true;
      if (reg && reg.waiting) reg.waiting.postMessage('skipWaiting'); else location.reload();
      return;
    }
    case 'start-sample': {
      const { cfg, evs } = buildSample();
      S = cfg; EV = evs;
      await store.putMany('events', EV); await save();
      requestPersist();
      return render();
    }
    // class tab
    case 'tile': {
      const sid = el.dataset.seat;
      if (UI.multi) { if (UI.selected.has(sid)) UI.selected.delete(sid); else UI.selected.add(sid); render(); return; }
      return codeSheet([sid]);
    }
    case 'toggle-multi': UI.multi = !UI.multi; UI.selected.clear(); return render();
    case 'multi-clear': UI.selected.clear(); return render();
    case 'multi-apply': if (UI.selected.size) codeSheet([...UI.selected]); return;
    case 'mark-day': { const c = curClass(); await ensureDay(c.id, today()); vibrate(); render(); toast('Class day logged'); return; }
    case 'unmark-day': {
      const c = curClass();
      const d = EV.filter(x => x.kind === 'day' && x.cls === c.id && x.date === today() && !x.voided);
      const ok = await ask({ title: 'Remove today\'s class day?', body: 'Do this only if class didn\'t meet. Entries already logged today stay in the log.', ok: 'Remove' });
      if (!ok) return;
      await setVoid(d.map(x => x.id), true); return render();
    }
    case 'code': return logCode(el.dataset.code);
    case 'log-action': return logCode($('#act-sel')?.value);
    case 'assign-task': return assignTask();
    case 'task-done': return taskDone(el.dataset.ev);
    case 'history': return historySheet(el.dataset.seat);
    case 'void': {
      const evId = el.dataset.ev;
      await setVoid([evId], true);
      await refreshSheet();
      render();
      toast('Entry removed', async () => { await setVoid([evId], false); await refreshSheet(); });
      return;
    }
    case 'unvoid': await setVoid([el.dataset.ev], false); await refreshSheet(); return render();
    case 'view-photo': {
      const ev = EV.find(x => x.id === el.dataset.ev);
      const ids = photoIds(ev);
      if (!ids.length) return;
      const urls = await Promise.all(ids.map(photoURL));
      if (!urls.some(Boolean)) { toast('These photos were exported and cleared from this phone.'); return; }
      const back = UI.sheetMode;
      const lbl = ev.kind === 'booth' ? 'Booth photo' : 'Weld photo';
      openSheet(`<div class="sheet-head"><div><h2>${lbl}${ids.length > 1 ? 's' : ''}</h2><div class="sub">${esc(evTitle(ev))} · ${fmtDate(ev.date)} ${fmtTime(ev.time)}</div></div>${closeBtn}</div>
        ${urls.map((u, i) => (u ? `<img class="photo-full" src="${u}" alt="${lbl} ${i + 1}">` : `<p class="muted small" style="margin:0">Photo ${i + 1} was exported and cleared from this phone.</p>`)).join('')}
        <button type="button" class="btn" data-act="photo-back">Back</button>`, lbl);
      $('#sheet-root .sheet').scrollTop = 0;
      UI.photoBack = back;
      return;
    }
    case 'photo-back': {
      const b = UI.photoBack;
      if (b && b.type === 'cp' && UI.cp) return cpSheet();
      if (b && b.type === 'history') return historySheet(b.seatId);
      if (b && b.type === 'code' && UI.sheetSeats) return codeSheet(UI.sheetSeats);
      return closeSheet();
    }
    // checkpoints
    case 'cp-cell': {
      const c = curClass(); const p = curProject(c);
      UI.cp = { seatId: el.dataset.seat, projectId: p.id, cpId: el.dataset.cp, photo: null, photoURL: null, note: '' };
      return cpSheet();
    }
    case 'cp-photo': if (UI.cp) UI.cp.note = $('#sheet-note')?.value || ''; UI.camTarget = 'cp'; $('#cam').value = ''; $('#cam').click(); return;
    case 'cp-clear-photo': if (UI.cp) { UI.cp.note = $('#sheet-note')?.value || ''; UI.cp.photo = null; UI.cp.photoURL = null; } return cpSheet();
    case 'cp-status': return cpSave(el.dataset.status);
    // booths
    case 'bt': {
      const b = el.dataset.booth;
      const st = UI.sweep;
      if (!st || !st.editing) return;
      if (!st.flags[b]) st.flags[b] = newFlag(occupants(st.cls, b));
      render();
      return boothSheet(b);
    }
    case 'bt-who': {
      const b = UI.sheetMode?.booth, f = UI.sweep?.flags[b];
      if (!f) return;
      const sid = el.dataset.seat, i = f.who.indexOf(sid);
      if (i >= 0) {
        if (f.who.length === 1) { toast('Mark at least one student. If no one is responsible, tap Booth was clean.'); return; }
        f.who.splice(i, 1);
      } else f.who.push(sid);
      render();
      return boothSheet(b);
    }
    case 'reason': {
      const st = UI.sweep, b = UI.sheetMode?.booth;
      if (!st || !b) return;
      const f = st.flags[b] || (st.flags[b] = newFlag(occupants(st.cls, b)));
      const r = el.dataset.reason;
      const i = f.reasons.indexOf(r);
      if (i >= 0) f.reasons.splice(i, 1); else f.reasons.push(r);
      el.setAttribute('aria-pressed', String(i < 0));
      render();
      return;
    }
    case 'bt-sev': {
      const b = UI.sheetMode?.booth, f = UI.sweep?.flags[b];
      if (!f) return;
      f.major = el.dataset.major === '1';
      render();
      return boothSheet(b);
    }
    case 'bt-photo': UI.camTarget = 'booth'; $('#cam').value = ''; $('#cam').click(); return;
    case 'bt-photo-view': {
      const b = UI.sheetMode?.booth, ph = UI.sweep?.flags[b]?.photos[Number(el.dataset.i)];
      if (!ph) return;
      const url = ph.url || await photoURL(ph.id);
      if (!url) return;
      openSheet(`<div class="sheet-head"><h2>Booth photo</h2>${closeBtn}</div><img class="photo-full" src="${url}" alt="Booth photo"><button type="button" class="btn" data-act="bt-back" data-booth="${esc(b)}">Back</button>`, 'Booth photo');
      $('#sheet-root .sheet').scrollTop = 0;
      return;
    }
    case 'bt-back': return boothSheet(el.dataset.booth);
    case 'bt-photo-del': {
      const b = UI.sheetMode?.booth, f = UI.sweep?.flags[b], i = Number(el.dataset.i);
      if (!f || !f.photos[i]) return;
      if (!(await ask({ title: 'Delete this photo?', ok: 'Delete', danger: true }))) return;
      const [ph] = f.photos.splice(i, 1);
      if (ph.blob && ph.url) URL.revokeObjectURL(ph.url);
      render();
      return boothSheet(b);
    }
    case 'bt-ok': {
      const st = UI.sweep, b = el.dataset.booth, f = st?.flags[b];
      if (f && (f.photos.length || (f.note || '').trim())) {
        const ok = await ask({ title: 'Mark this booth clean?', body: 'The photos and note you added for this booth will be dropped.', ok: 'Mark clean', danger: true });
        if (!ok) return;
      }
      if (f) f.photos.forEach(ph => { if (ph.blob && ph.url) URL.revokeObjectURL(ph.url); });
      if (st) delete st.flags[b];
      closeSheet(); return render();
    }
    case 'record-menu': {
      const s = seatById(el.dataset.seat);
      if (!s) return;
      const nb = EV.filter(e => !e.voided && e.kind === 'booth' && e.code === s.code).length;
      const na = EV.filter(e => !e.voided && e.code === s.code && !['day', 'sweep'].includes(e.kind)).length;
      const ent = n => `${n} entr${n === 1 ? 'y' : 'ies'}`;
      openSheet(`<div class="sheet-head"><div><h2>Export record</h2><div class="sub">Booth ${bl(s)} · <span class="mono">${esc(s.code)}</span> · PDF for a conference or referral</div></div>${closeBtn}</div>
        <button type="button" class="btn primary block" data-act="record-pdf" data-mode="booth" data-seat="${esc(s.id)}"${nb ? '' : ' disabled'}>Booth cleanup record · ${ent(nb)}</button>
        <button type="button" class="btn block" data-act="record-pdf" data-mode="all" data-seat="${esc(s.id)}"${na ? '' : ' disabled'}>Full record · ${ent(na)}</button>
        <p class="muted small" style="margin:0">Includes dates, times, notes and photos still on this phone. The PDF shows the code, with a blank line to write the name from the Key tab.</p>
        <button type="button" class="btn" data-act="history" data-seat="${esc(s.id)}">Back</button>`, 'Export record');
      $('#sheet-root .sheet').scrollTop = 0;
      return;
    }
    case 'record-pdf': return recordPdf(el.dataset.seat, el.dataset.mode);
    case 'sweep-save': return saveSweep();
    case 'sweep-edit': { const c = curClass(); UI.sweep.editing = true; const prior = todaySweep(c.id); if (prior) loadSweepFlags(c, prior); return render(); }
    case 'sweep-cancel': UI.sweep = null; return render();
    // reports
    case 'range': S.ui.range = el.dataset.range; await save(); return render();
    case 'pick-rcls': S.ui.rcls = el.dataset.cls; await save(); render(); window.scrollTo(0, 0); return;
    case 'rsort': { const k = el.dataset.key; UI.rsort = { key: k, dir: UI.rsort.key === k ? -UI.rsort.dir : (k === 'emp' || k === 'booth' ? 1 : -1) }; return render(); }
    case 'bar': {
      const mult = el.closest('.mult');
      mult.querySelectorAll('.chart-bar').forEach(b => b.classList.toggle('sel', b.dataset.bar === el.dataset.i));
      const v = el.dataset.v;
      mult.querySelector('.readout').textContent = `Week of ${fmtDate(el.dataset.w)}: ${v === '' ? 'no class days logged' : `${(+v).toFixed(1)} per student per week`}`;
      return;
    }
    // export
    case 'export-events': return exportEvents();
    case 'export-roster': return exportRoster();
    case 'export-photos': return photoExportSheet();
    case 'export-photos-new': return exportPhotos(true);
    case 'export-photos-all': return exportPhotos(false);
    case 'backup': return backupSheet();
    case 'backup-photos': return backup(true);
    case 'backup-nophotos': return backup(false);
    case 'deliver-pending': return deliverPending();
    case 'restore': $('#restore-file').value = ''; $('#restore-file').click(); return;
    case 'clear-photos': {
      const photos = (await store.all('photos')).filter(p => p.exported);
      if (!photos.length) { toast('No exported photos to delete.'); return; }
      const ok = await ask({ title: `Delete ${photos.length} exported photo${photos.length === 1 ? '' : 's'}?`, body: 'They stay in the ZIP files you exported. The log keeps their file names.', ok: 'Delete', danger: true });
      if (!ok) return;
      for (const p of photos) { await store.del('photos', p.id); const u = UI.photoURLs.get(p.id); if (u) URL.revokeObjectURL(u); UI.photoURLs.delete(p.id); }
      toast('Exported photos deleted.'); return render();
    }
    case 'erase': {
      const unexp = Math.max(0, EV.length - (S.lastExportN || 0));
      const ok = await ask({ title: 'Erase everything on this phone?', body: `${unexp ? `${unexp} entries have not been exported. ` : ''}Classes, codes, the log and photos will be deleted. This can't be undone.`, ok: 'Erase everything', danger: true });
      if (!ok) return;
      await store.clear('events'); await store.clear('photos'); await store.del('kv', 'config');
      S = null; EV = []; UI.photoURLs.clear(); UI.sweep = null; closeSheet();
      return render();
    }
    // setup clicks
    case 'seat-add': {
      const cls = el.dataset.cls;
      const b = freeBooth(cls);
      if (!b) { toast(`Every welding booth already has ${MAX_PER_BOOTH} students. Add booths under Shop layout.`); return; }
      const s = { id: uid(), cls, booth: b, side: '', code: newCode(), since: today(), active: true };
      S.seats.push(s); placeSeat(s); UI.sweep = null;
      await save(); render();
      toast(`${s.code} added to booth ${bl(s)}${sideOf(s) ? ' (shared)' : ''}. Change the number to move them.`, null, 6000);
      return;
    }
    case 'storage-toggle': {
      const b = Number(el.dataset.booth);
      if (isStorage(b)) S.storageBooths = S.storageBooths.filter(x => x !== b);
      else {
        const occ = S.seats.filter(s => s.active && s.booth === b);
        if (occ.length) {
          const where = [...new Set(occ.map(s => classById(s.cls)?.name).filter(Boolean))].join(', ');
          toast(`Booth ${b} has students in ${where}. Move them to another booth first.`, null, 6000);
          return;
        }
        S.storageBooths = [...S.storageBooths, b].sort((x, y) => x - y);
      }
      UI.sweep = null;
      await save(); return render();
    }
    case 'seat-menu': {
      const s = seatById(id);
      openSheet(`<div class="sheet-head"><div><h2>Booth ${bl(s)}</h2><div class="sub"><span class="mono">${esc(s.code)}</span> · since ${fmtDate(s.since)}</div></div>${closeBtn}</div>
        <button type="button" class="btn primary block" data-act="seat-replace" data-id="${esc(s.id)}">New student in this spot</button>
        <p class="muted small" style="margin:0">Gives the spot a fresh code. ${esc(s.code)} keeps its history under Former students.</p>
        <button type="button" class="btn block" data-act="seat-remove" data-id="${esc(s.id)}">Remove this student</button>
        <p class="muted small" style="margin:0">To move a student to another booth, or to share a booth, change the booth number in the list instead.</p>`, `Booth ${bl(s)}`);
      return;
    }
    case 'seat-replace': {
      const s = seatById(id);
      const ok = await ask({ title: `New student in booth ${bl(s)}?`, body: `${s.code} moves to Former students and keeps its history. The new student gets a fresh code.`, ok: 'Give new code' });
      if (!ok) return;
      const lbl = bl(s);
      s.active = false;
      const n = { id: uid(), cls: s.cls, booth: s.booth, side: s.side || '', code: newCode(), since: today(), active: true };
      S.seats.push(n);
      UI.sweep = null;
      closeSheet();
      await save(); render(); toast(`Booth ${lbl} is now ${n.code}. Add it to the Key tab.`); return;
    }
    case 'seat-remove': {
      const s = seatById(id);
      const ok = await ask({ title: `Remove ${s.code} from booth ${bl(s)}?`, body: `${s.code} moves to Former students. Its entries stay in the log.`, ok: 'Remove' });
      if (!ok) return;
      s.active = false; UI.sweep = null; closeSheet(); await save(); return render();
    }
    case 'cls-del': {
      const c = classById(id);
      const n = EV.filter(e => e.cls === id).length;
      const ok = await ask({ title: `Remove ${c.name}?`, body: n ? `Its ${n} log entries stay and still export under this class name.` : 'It has no log entries.', ok: 'Remove class', danger: true });
      if (!ok) return;
      S.classes = S.classes.filter(x => x.id !== id);
      S.seats.forEach(s => { if (s.cls === id) s.active = false; });
      S.projects.forEach(p => { p.classes = p.classes.filter(x => x !== id); });
      if (S.ui.cls === id) S.ui.cls = S.classes[0]?.id || null;
      await save(); return render();
    }
    case 'code-move': {
      const i = S.behaviors.findIndex(b => b.id === id), j = i + Number(el.dataset.d);
      if (j < 0 || j >= S.behaviors.length) return;
      [S.behaviors[i], S.behaviors[j]] = [S.behaviors[j], S.behaviors[i]];
      await save(); return render();
    }
    case 'cp-move': {
      const p = projById(el.dataset.p);
      const i = p.checkpoints.findIndex(k => k.id === id), j = i + Number(el.dataset.d);
      if (j < 0 || j >= p.checkpoints.length) return;
      [p.checkpoints[i], p.checkpoints[j]] = [p.checkpoints[j], p.checkpoints[i]];
      await save(); return render();
    }
    default: return;
  }
}
async function refreshSheet() {
  if (!sheetOpen()) return;
  const m = UI.sheetMode || {};
  if (m.type === 'cp' && UI.cp) return cpSheet();
  if (m.type === 'history') return historySheet(m.seatId);
  if (m.type === 'code' && UI.sheetSeats) return codeSheet(UI.sheetSeats);
}
async function onChange(el) {
  // Redraw after the change event finishes: replacing a field while it's losing focus throws in Chrome.
  const later = () => setTimeout(render, 0);
  const act = el.dataset.act;
  const id = el.dataset.id;
  const v = el.type === 'checkbox' ? el.checked : el.value;
  const num = (x, a, b, d) => { const n = Math.round(Number(x)); return Number.isFinite(n) ? clamp(n, a, b) : d; };
  switch (act) {
    case 'proj-pick': S.ui.project = v; break;
    case 'r-from': S.ui.from = v || null; break;
    case 'r-to': S.ui.to = v || null; break;
    case 'r-cls': S.ui.rcls = v; break;
    case 'cls-name': { const c = classById(id); if (v.trim()) c.name = v.trim(); break; }
    case 'cls-start': classById(id).start = v; break;
    case 'cls-end': classById(id).end = v; break;
    case 'seat-booth': {
      const s = seatById(id);
      const n = num(v, 1, 99, s.booth);
      if (n === s.booth) { later(); return; }
      if (n > S.boothCount) { toast(`The shop has ${S.boothCount} booths. Raise the count under Shop layout first.`); later(); return; }
      if (isStorage(n)) { toast(`Booth ${n} is a storage booth. Switch it back under Shop layout to put a student there.`); later(); return; }
      const occ = seatsOf(s.cls).filter(x => x.id !== s.id && x.booth === n);
      if (occ.length >= MAX_PER_BOOTH) { toast(`Booth ${n} already has ${MAX_PER_BOOTH} students.`); later(); return; }
      s.booth = n; placeSeat(s); UI.sweep = null;
      if (occ.length) { await save(); render(); toast(`Booth ${n} is now shared: ${[...occ, s].sort(bySeat).map(x => `${bl(x)} ${x.code}`).join(', ')}.`, null, 6000); return; }
      break;
    }
    case 'shop-count': {
      const n = num(v, 1, 60, S.boothCount);
      const over = S.seats.filter(x => x.active && x.booth > n);
      if (over.length) { toast(`Booth ${Math.max(...over.map(x => x.booth))} has students. Move them before lowering the count.`); later(); return; }
      S.boothCount = n; S.storageBooths = S.storageBooths.filter(b => b <= n); UI.sweep = null;
      break;
    }
    case 'code-label': { const b = behById(id); if (v.trim()) b.label = v.trim(); break; }
    case 'code-type': { const b = behById(id); b.type = v; if (v === 'neg' && b.pts > 0) b.pts = -b.pts; if (v === 'pos' && b.pts < 0) b.pts = -b.pts; break; }
    case 'code-pts': { const b = behById(id); let n = num(v, -20, 20, b.pts); if (b.type === 'neg' && n > 0) n = -n; if (b.type === 'pos' && n < 0) n = -n; b.pts = n; break; }
    case 'code-active': behById(id).active = v; break;
    case 'task-label': { const t = taskById(id); if (v.trim()) t.label = v.trim(); break; }
    case 'task-active': taskById(id).active = v; break;
    case 'reason-label': { const r = S.reasons.find(x => x.id === id); if (v.trim()) r.label = v.trim(); break; }
    case 'reason-active': S.reasons.find(x => x.id === id).active = v; break;
    case 'booth-pts': S.boothPts = num(v, -10, 0, S.boothPts); break;
    case 'booth-major-pts': S.boothMajorPts = num(v, -20, 0, S.boothMajorPts); break;
    case 'pattern-n': S.patternN = num(v, 2, 20, S.patternN); break;
    case 'pattern-days': S.patternDays = num(v, 7, 180, S.patternDays); break;
    case 'stamp-photos': S.stampPhotos = v; break;
    case 'base-pts': S.base = num(v, 1, 100, S.base); break;
    case 'proj-name': { const p = projById(id); if (v.trim()) p.name = v.trim(); break; }
    case 'proj-active': projById(id).active = v; break;
    case 'proj-cls': { const p = projById(id); const c = el.dataset.cls; p.classes = v ? [...new Set([...p.classes, c])] : p.classes.filter(x => x !== c); break; }
    case 'cp-name': { const k = projById(el.dataset.p).checkpoints.find(x => x.id === id); if (v.trim()) k.name = v.trim(); break; }
    case 'cp-active': projById(el.dataset.p).checkpoints.find(x => x.id === id).active = v; break;
    default: return;
  }
  await save();
  render();
}
async function onSubmit(form) {
  const act = form.dataset.actSubmit;
  const val = sel => ($(sel, form)?.value || '').trim();
  switch (act) {
    case 'start-own': {
      const cfg = defaultConfig();
      const name = val('#w-cls') || 'Period 1';
      const n = clamp(Math.round(Number(val('#w-booths')) || 12), 1, 60);
      const shop = clamp(Math.round(Number(val('#w-shop')) || 12), 1, 60);
      const storage = [...new Set(val('#w-storage').split(/[^0-9]+/).map(Number).filter(b => b >= 1 && b <= shop))].sort((a, b) => a - b);
      const cls = { id: uid(), name, start: val('#w-start'), end: val('#w-end') };
      cfg.classes.push(cls);
      cfg.ui.cls = cls.id;
      cfg.boothCount = shop;
      cfg.storageBooths = storage.length < shop ? storage : [];
      S = cfg;
      let added = 0;
      for (let i = 0; i < n; i++) { const b = freeBooth(cls.id); if (!b) break; const st = { id: uid(), cls: cls.id, booth: b, side: '', code: newCode(), since: today(), active: true }; S.seats.push(st); placeSeat(st); added++; }
      await save(); requestPersist();
      render();
      const cells = boothCells(cls.id).filter(x => !x.storage), sh = cells.filter(x => x.seats.length > 1).length;
      toast(`${name}: ${added} students in ${cells.length} booths${sh ? `, ${sh} shared` : ''}. Export the roster from Setup for your Key tab.`, null, 7000);
      return;
    }
    case 'cls-add': {
      const name = val('#nc-name'); if (!name) return;
      const n = clamp(Math.round(Number(val('#nc-n')) || 0), 0, 60);
      const cls = { id: uid(), name, start: '', end: '' };
      S.classes.push(cls);
      for (let i = 0; i < n; i++) { const b = freeBooth(cls.id); if (!b) break; const st = { id: uid(), cls: cls.id, booth: b, side: '', code: newCode(), since: today(), active: true }; S.seats.push(st); placeSeat(st); }
      break;
    }
    case 'code-add': { const label = val('#new-code'); if (!label) return; S.behaviors.push({ id: uid(), label, type: 'neg', pts: -1, active: true }); break; }
    case 'task-add': { const label = val('#new-task'); if (!label) return; S.tasks.push({ id: uid(), label, active: true }); break; }
    case 'reason-add': { const label = val('#new-reason'); if (!label) return; S.reasons.push({ id: uid(), label, active: true }); break; }
    case 'proj-add': { const name = val('#new-proj'); if (!name) return; const c = curClass(); S.projects.push({ id: uid(), name, classes: c ? [c.id] : [], active: true, checkpoints: [] }); break; }
    case 'cp-add': { const p = projById(form.dataset.p); const name = val(`#new-cp-${CSS.escape(p.id)}`); if (!name) return; p.checkpoints.push({ id: uid(), name, active: true }); break; }
    default: return;
  }
  await save();
  render();
}
function requestPersist() { try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) { /* ignore */ } }

// ---------- wiring ----------
function wire() {
  document.addEventListener('click', e => {
    const tabBtn = e.target.closest('#nav button[data-tab]');
    if (tabBtn) { setTab(tabBtn.dataset.tab); return; }
    if (e.target.closest('#setup-btn')) { setTab(S.ui.tab === 'setup' ? 'class' : 'setup'); return; }
    const el = e.target.closest('[data-act]');
    if (!el || el.tagName === 'SELECT' || (el.tagName === 'INPUT' && el.type !== 'button')) return;
    onClick(el, e).catch(err => { console.error(err); toast('Something went wrong. Try again.'); });
  });
  document.addEventListener('change', e => {
    const el = e.target;
    if (el.id === 'cls-select') { S.ui.cls = el.value; UI.selected.clear(); UI.multi = false; UI.sweep = null; save(); render(); return; }
    if (el.id === 'cam') { onPhoto(el.files && el.files[0]); return; }
    if (el.id === 'restore-file') { if (el.files && el.files[0]) restoreFile(el.files[0]); return; }
    if (el.dataset && el.dataset.act && el.dataset.act !== 'r-filter') onChange(el).catch(err => { console.error(err); toast('Could not save that change.'); });
  });
  document.addEventListener('input', e => {
    if (e.target.id === 'bt-note') { const f = UI.sweep?.flags[UI.sheetMode?.booth]; if (f) f.note = e.target.value; return; }
    if (e.target.id === 'r-filter') {
      UI.rfilter = e.target.value;
      const pos = e.target.selectionStart;
      render();
      const f = $('#r-filter'); if (f) { f.focus(); try { f.setSelectionRange(pos, pos); } catch (err) { /* ignore */ } }
    }
  });
  document.addEventListener('submit', e => {
    const f = e.target;
    if (!f.dataset.actSubmit) return;
    e.preventDefault();
    onSubmit(f).catch(err => { console.error(err); toast('Could not save that.'); });
  });
  document.addEventListener('toggle', e => {
    const d = e.target;
    if (d.matches && d.matches('details.sec')) { if (d.open) UI.openSecs.add(d.dataset.sec); else UI.openSecs.delete(d.dataset.sec); }
  }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && sheetOpen()) { closeSheet(); if (S && S.ui.tab === 'booths') render(); } });
}
async function onPhoto(file) {
  if (!file) return;
  if (UI.camTarget === 'booth' && UI.sheetMode?.type === 'booth') return boothPhoto(file);
  if (!UI.cp) return;
  try {
    const s = seatById(UI.cp.seatId), p = projById(UI.cp.projectId), k = p?.checkpoints.find(x => x.id === UI.cp.cpId);
    const cap = S.stampPhotos && s ? [`Booth ${bl(s)} · ${s.code} · ${classById(s.cls)?.name || ''}`, `${p ? p.name : ''} · ${k ? k.name : ''} · ${fmtStamp(new Date())}`] : null;
    const blob = await shrinkPhoto(file, cap);
    if (UI.cp.photoURL) URL.revokeObjectURL(UI.cp.photoURL);
    UI.cp.photo = blob;
    UI.cp.photoURL = URL.createObjectURL(blob);
    await cpSheet();
  } catch (e) { toast('That photo couldn\'t be read. Try again.'); }
}
function registerSW() {
  if (PREVIEW || !('serviceWorker' in navigator) || location.protocol === 'file:') return;
  navigator.serviceWorker.register('sw.js').then(reg => {
    const watch = w => w && w.addEventListener('statechange', () => {
      if (w.state === 'installed' && navigator.serviceWorker.controller) { UI.updateReady = true; if (!sheetOpen()) render(); }
    });
    if (reg.waiting && navigator.serviceWorker.controller) { UI.updateReady = true; render(); }
    reg.addEventListener('updatefound', () => watch(reg.installing));
    reg.update().catch(() => {});
  }).catch(() => {});
  // Reload only when the teacher tapped Reload on the update banner, never on first install.
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (UI.reloadOnChange) { UI.reloadOnChange = false; location.reload(); } });
}

async function boot() {
  wire();
  await store.init();
  try {
    const rec = await store.get('kv', 'config');
    if (rec && rec.v) {
      S = loadConfig(rec.v);
      EV = (await store.all('events')) || [];
    }
  } catch (e) { S = null; }
  if (!S && PREVIEW) {
    const { cfg, evs } = buildSample();
    S = cfg; EV = evs;
    try { await store.putMany('events', EV); await save(); } catch (e) { /* preview without storage */ }
  }
  if (S) {
    const live = classByTime();
    if (live) S.ui.cls = live.id;
    if (S.ui.tab === 'setup') S.ui.tab = 'class';
  }
  render();
  registerSW();
  window.WST = { get S() { return S; }, get EV() { return EV; }, eventsCSV, rosterCSV, studentRows, classStats, rangeDates, classById, version: VERSION };
}
boot();
})();
