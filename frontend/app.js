/* =========================================================
   SprayLog — frontend
   Sections:
     1. Config + helpers 2. Backend API client (talks to Spring Boot) 3. DemoStore fallback 
     (localStorage — delete this section later) 4. Data layer (uses backend, falls back to 
     DemoStore) 5. UI components 6. Views (pages) 7. Router + start-u   ========================================================= */

/* ---------- 1. CONFIG + HELPERS ---------- */

// If the page is opened straight from disk (file://), call the backend on localhost.
// If it is served by Spring Boot (http://localhost:8080), use the same server.
const API_BASE = location.protocol === 'file:' ? 'http://localhost:8080' : '';

const UNAVAILABLE = 'Verified timing information unavailable.';

const CATEGORIES = [
  { value: 'INSECTICIDE', label: 'Insecticide' },
  { value: 'FUNGICIDE', label: 'Fungicide' },
  { value: 'HERBICIDE', label: 'Herbicide' },
  { value: 'FERTILIZER', label: 'Fertilizer' },
  { value: 'OTHER', label: 'Other' },
];
const UNITS = ['ml', 'L', 'g', 'kg', 'packets'];

const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
  fields: '<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v4h4"/><path d="M12 7v5l3 2"/>',
  book: '<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H20v15H5.5A1.5 1.5 0 0 0 4 19.5v-15Z"/><path d="M4 19.5A1.5 1.5 0 0 0 5.5 21H20"/><path d="M8 7h8M8 11h6"/>',
  leaf: '<path d="M5 21c0-9 6-15 15-16-1 9-7 15-15 16Z"/><path d="m5 21 7-7"/>',
  spray: '<path d="M9 8h6v13H9z"/><path d="M10 8V5h4v3"/><path d="M14 5h3l2-2"/><path d="M19 7h.01M21 9h.01M19 11h.01"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  arrowLeft: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  alert: '<path d="M12 3 2 20h20L12 3Z"/><path d="M12 10v4M12 17h.01"/>',
};
const icon = (name) => `<span class="ico"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg></span>`;

// Escape user-typed text before putting it into HTML (prevents broken layout / script injection)
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Dates are handled as "YYYY-MM-DD" strings, the same format Spring Boot uses for LocalDate
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function parseISO(iso) { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); }
function addDays(iso, days) {
  const d = parseISO(iso); d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function daysBetween(fromIso, toIso) { return Math.round((parseISO(toIso) - parseISO(fromIso)) / 86400000); }
function fmtDate(iso, opts = { day: 'numeric', month: 'short', year: 'numeric' }) {
  return iso ? parseISO(iso).toLocaleDateString('en-IN', opts) : '';
}
const categoryLabel = (v) => (CATEGORIES.find((c) => c.value === v) || { label: v }).label;
const fmtQty = (q, unit) => (q === null || q === undefined || q === '') ? '' : `${Number(q)} ${unit || ''}`.trim();

class ApiError extends Error {
  constructor(message, details = [], status = 400) { super(message); this.details = details; this.status = status; }
}

/* ---------- 2. BACKEND API CLIENT ---------- */

const Backend = {
  async request(method, path, body) {
    const res = await fetch(API_BASE + path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      let data = {};
      try { data = await res.json(); } catch (e) { /* no JSON body */ }
      throw new ApiError(data.message || `Request failed (${res.status})`, data.details || [], res.status);
    }
    return res.status === 204 ? null : res.json();
  },

  async isUp() {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2500);
      const res = await fetch(API_BASE + '/api/health', { signal: controller.signal });
      clearTimeout(timer);
      return res.ok;
    } catch (e) {
      return false;
    }
  },
};

/* ---------- 3. DEMO STORE FALLBACK (localStorage) ----------
   Used ONLY when the Spring Boot backend cannot be reached, so the UI can still be shown.
   It copies the backend's behaviour. To remove the fallback later: delete this section
   and the two lines marked "FALLBACK" in the Data layer.
   All products and waiting periods are FICTIONAL demo data. */

const DemoStore = (() => {
  const KEY = 'spraylog-demo-v1';
  const DEMO_SOURCE = 'DEMO DATA - placeholder for prototype, not a real source';
  const DEMO_VERSION = 'Demo v0 - To Be Validated';

  function seed() {
    const t = todayISO();
    return {
      nextId: 100,
      fields: [
        { id: 1, name: 'Field A', areaAcres: 2.0, locationNote: 'Near the well' },
        { id: 2, name: 'Field B', areaAcres: 1.5, locationNote: 'Behind the house' },
        { id: 3, name: 'Field C', areaAcres: 3.0, locationNote: null },
      ],
      crops: [
        { id: 1, cropName: 'Tomato', variety: 'Demo variety', sowingDate: addDays(t, -50), status: 'ACTIVE', fieldId: 1 },
        { id: 2, cropName: 'Chilli', variety: null, sowingDate: addDays(t, -40), status: 'ACTIVE', fieldId: 2 },
      ],
      sprays: [
        { id: 1, cropId: 1, productName: 'Demo Product A', category: 'FUNGICIDE', applicationDate: addDays(t, -3), quantity: 1, unit: 'L', notes: 'Demo record created at startup' },
      ],
      references: [
        { id: 1, productName: 'Demo Product A', cropName: 'Tomato', useContext: 'Demo use context', waitingPeriodDays: 7, source: DEMO_SOURCE, sourceVersion: DEMO_VERSION, demoData: true },
        { id: 2, productName: 'Demo Product B', cropName: 'Chilli', useContext: 'Demo use context', waitingPeriodDays: 10, source: DEMO_SOURCE, sourceVersion: DEMO_VERSION, demoData: true },
        { id: 3, productName: 'Demo Product C', cropName: 'Cotton', useContext: 'Demo use context', waitingPeriodDays: 21, source: DEMO_SOURCE, sourceVersion: DEMO_VERSION, demoData: true },
        { id: 4, productName: 'Demo Product D', cropName: 'Tomato', useContext: 'Demo use context', waitingPeriodDays: null, source: DEMO_SOURCE, sourceVersion: DEMO_VERSION, demoData: true },
      ],
    };
  }

  function load() {
    try { const raw = localStorage.getItem(KEY); if (raw) return JSON.parse(raw); } catch (e) { /* ignore */ }
    const db = seed(); save(db); return db;
  }
  function save(db) { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* ignore */ } }

  const notFound = (what, id) => new ApiError(`${what} not found: ${id}`, [], 404);

  function lookup(db, productName, cropName, appDate) {
    const ref = db.references.find((r) =>
      r.productName.toLowerCase() === productName.trim().toLowerCase() &&
      r.cropName.toLowerCase() === cropName.trim().toLowerCase());
    if (!ref) return { available: false, message: UNAVAILABLE };
    if (ref.waitingPeriodDays === null) {
      return { available: false, useContext: ref.useContext, source: ref.source, sourceVersion: ref.sourceVersion, demoData: ref.demoData, message: UNAVAILABLE };
    }
    const reminderDate = addDays(appDate, ref.waitingPeriodDays);
    return {
      available: true, waitingPeriodDays: ref.waitingPeriodDays, reminderDate,
      daysRemaining: daysBetween(todayISO(), reminderDate),
      useContext: ref.useContext, source: ref.source, sourceVersion: ref.sourceVersion, demoData: ref.demoData,
      message: ref.demoData ? 'DEMO DATA - not verified. Always follow the product label.' : 'From reference source. Always follow the product label.',
    };
  }

  const cropOut = (db, c) => ({ ...c, fieldName: (db.fields.find((f) => f.id === c.fieldId) || {}).name });
  const fieldOut = (db, f) => ({ ...f, crops: db.crops.filter((c) => c.fieldId === f.id).map((c) => cropOut(db, c)) });
  function sprayOut(db, s) {
    const crop = db.crops.find((c) => c.id === s.cropId);
    const field = db.fields.find((f) => f.id === crop.fieldId);
    return { ...s, cropName: crop.cropName, fieldId: field.id, fieldName: field.name, reference: lookup(db, s.productName, crop.cropName, s.applicationDate) };
  }
  const history = (db, cropId) => db.sprays
    .filter((s) => !cropId || s.cropId === cropId)
    .sort((a, b) => b.applicationDate.localeCompare(a.applicationDate) || b.id - a.id)
    .map((s) => sprayOut(db, s));

  function validateSpray(db, b) {
    const errs = [];
    if (!b.cropId) errs.push('Crop is required');
    if (!b.productName || !b.productName.trim()) errs.push('Product name is required');
    if (!b.category) errs.push('Category is required');
    if (!b.applicationDate) errs.push('Application date is required');
    else if (b.applicationDate > todayISO()) errs.push('Application date cannot be in the future');
    if (b.quantity !== null && b.quantity !== undefined && !(b.quantity > 0)) errs.push('Quantity must be greater than 0');
    if (errs.length) throw new ApiError('Please check the form', errs, 400);
    if (!db.crops.find((c) => c.id === b.cropId)) throw notFound('Crop', b.cropId);
  }

  async function request(method, path, body) {
    const db = load();
    const [pathname, query = ''] = path.split('?');
    const params = new URLSearchParams(query);
    const parts = pathname.replace(/^\/api\//, '').split('/');
    const id = parts[1] ? Number(parts[1]) : null;

    if (method === 'GET' && pathname === '/api/dashboard') {
      const all = history(db);
      return {
        activeCrops: db.crops.filter((c) => c.status === 'ACTIVE').length,
        totalFields: db.fields.length,
        totalSprays: all.length,
        recentSprays: all.slice(0, 5),
        upcomingReminders: all.filter((s) => s.reference.available && s.reference.daysRemaining >= 0)
          .sort((a, b) => a.reference.reminderDate.localeCompare(b.reference.reminderDate)),
      };
    }
    if (parts[0] === 'fields') {
      if (method === 'GET' && !id) return db.fields.map((f) => fieldOut(db, f));
      if (method === 'POST') {
        const errs = [];
        if (!body.name || !body.name.trim()) errs.push('Field name is required');
        if (!(body.areaAcres > 0)) errs.push('Area must be greater than 0');
        if (errs.length) throw new ApiError('Please check the form', errs);
        const f = { id: db.nextId++, name: body.name.trim(), areaAcres: body.areaAcres, locationNote: body.locationNote || null };
        db.fields.push(f); save(db); return fieldOut(db, f);
      }
      const field = db.fields.find((f) => f.id === id);
      if (!field) throw notFound('Field', id);
      if (parts[2] === 'crops') return fieldOut(db, field).crops;
      return fieldOut(db, field);
    }
    if (parts[0] === 'crops') {
      if (method === 'GET' && !id) return db.crops.map((c) => cropOut(db, c));
      if (method === 'POST') {
        const errs = [];
        if (!body.cropName || !body.cropName.trim()) errs.push('Crop name is required');
        if (!body.fieldId) errs.push('Field is required');
        if (body.sowingDate && body.sowingDate > todayISO()) errs.push('Sowing date cannot be in the future');
        if (errs.length) throw new ApiError('Please check the form', errs);
        if (!db.fields.find((f) => f.id === body.fieldId)) throw notFound('Field', body.fieldId);
        const c = { id: db.nextId++, cropName: body.cropName.trim(), variety: body.variety || null, sowingDate: body.sowingDate || null, status: 'ACTIVE', fieldId: body.fieldId };
        db.crops.push(c); save(db); return cropOut(db, c);
      }
      const crop = db.crops.find((c) => c.id === id);
      if (!crop) throw notFound('Crop', id);
      if (method === 'PATCH') { crop.status = body.status; save(db); }
      return cropOut(db, crop);
    }
    if (parts[0] === 'sprays') {
      if (method === 'GET' && !id) return history(db, params.get('cropId') ? Number(params.get('cropId')) : null);
      if (method === 'POST') {
        validateSpray(db, body);
        const s = { id: db.nextId++, cropId: body.cropId, productName: body.productName.trim(), category: body.category, applicationDate: body.applicationDate, quantity: body.quantity ?? null, unit: body.unit || null, notes: body.notes || null };
        db.sprays.push(s); save(db); return sprayOut(db, s);
      }
      const spray = db.sprays.find((s) => s.id === id);
      if (!spray) throw notFound('Spray record', id);
      return sprayOut(db, spray);
    }
    if (method === 'GET' && pathname === '/api/references') return db.references;
    throw new ApiError('Unknown request', [], 404);
  }

  return { request, reset: () => { localStorage.removeItem(KEY); } };
})();

/* ---------- 4. DATA LAYER ---------- */

const state = { mode: 'backend' }; // 'backend' or 'demo'

const api = {
  async request(method, path, body) {
    if (state.mode === 'demo') return DemoStore.request(method, path, body); // FALLBACK
    try {
      return await Backend.request(method, path, body);
    } catch (err) {
      if (err instanceof ApiError) throw err;      // real validation/404 error from the backend
      setMode('demo');                              // FALLBACK: network failure -> demo store
      return DemoStore.request(method, path, body);
    }
  },
  get: (path) => api.request('GET', path),
  post: (path, body) => api.request('POST', path, body),
  patch: (path, body) => api.request('PATCH', path, body),
};

function setMode(mode) {
  state.mode = mode;
  const banner = document.getElementById('mode-banner');
  if (mode === 'demo') {
	banner.innerHTML=`${icon('check')}<span>Prototype mode: your records are saved on this device.</span>`;
    banner.hidden = false;
  } else {
    banner.hidden = true;
  }
}

/* ---------- 5. UI COMPONENTS ---------- */

function referenceBox(ref) {
  if (!ref || !ref.available) {
    const sourceLine = ref && ref.source ? `<div class="ref-source">Reference record found, but it has no waiting period. Source: ${esc(ref.source)}</div>` : '<div class="ref-source">No reference record for this product and crop. SprayLog does not guess.</div>';
    return `<div class="ref ref-none">
      <div class="ref-title">${icon('info')}${esc(UNAVAILABLE)}</div>
      ${sourceLine}
    </div>`;
  }
  const passed = ref.daysRemaining < 0;
  const when = passed ? 'Interval ended' : ref.daysRemaining === 0 ? 'Ends today' : `${ref.daysRemaining} day${ref.daysRemaining === 1 ? '' : 's'} left`;
  return `<div class="ref ${passed ? 'ref-done' : 'ref-ok'}">
    <div class="ref-head">
      <div class="ref-title">${icon('clock')}Waiting period: ${ref.waitingPeriodDays} days</div>
      ${ref.demoData ? '<span class="badge badge-demo">DEMO DATA · not verified</span>' : '<span class="badge badge-green">Reference</span>'}
    </div>
    <div>Interval ends <span class="ref-date">${fmtDate(ref.reminderDate)}</span> · <b>${when}</b></div>
    <div class="ref-source">Source: ${esc(ref.source)}${ref.sourceVersion ? ` (${esc(ref.sourceVersion)})` : ''}. Always follow the product label.</div>
  </div>`;
}

function dateTile(iso) {
  return `<div class="date-tile"><div class="d">${parseISO(iso).getDate()}</div><div class="m">${fmtDate(iso, { month: 'short' })}</div></div>`;
}

function sprayCard(s) {
  const qty = fmtQty(s.quantity, s.unit);
  return `<article class="card spray">
    <div class="spray-top">
      ${dateTile(s.applicationDate)}
      <div class="spray-body">
        <div class="spray-product">${esc(s.productName)}</div>
        <div class="spray-sub">${esc(s.cropName)} · ${esc(s.fieldName)}</div>
      </div>
      <span class="badge badge-grey">${esc(categoryLabel(s.category))}</span>
    </div>
    <div class="spray-details">
      <span>Applied <b>${fmtDate(s.applicationDate)}</b></span>
      ${qty ? `<span>Quantity <b>${esc(qty)}</b></span>` : ''}
    </div>
    ${s.notes ? `<div class="spray-notes">${esc(s.notes)}</div>` : ''}
    ${referenceBox(s.reference)}
  </article>`;
}

function emptyState({ iconName, title, text, action }) {
  return `<div class="card empty">
    <div class="empty-icon">${icon(iconName)}</div>
    <h3>${esc(title)}</h3>
    <p>${esc(text)}</p>
    ${action || ''}
  </div>`;
}

function errorState(err) {
  return emptyState({ iconName: 'alert', title: 'Something went wrong', text: err.message || 'Please try again.', action: '<a class="btn btn-secondary" href="#/dashboard">Back to dashboard</a>' });
}

function loading() {
  return '<div class="skeleton" style="height:120px"></div><div class="skeleton" style="height:90px"></div><div class="skeleton" style="height:90px"></div>';
}

function toast(message, isError = false) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.toggle('error', isError);
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.hidden = true; }, 2800);
}

function formAlert(err) {
  const items = (err.details || []).map((d) => `<li>${esc(d)}</li>`).join('');
  return `<div class="form-alert">${esc(err.message)}${items ? `<ul>${items}</ul>` : ''}</div>`;
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

/* ---------- 6. VIEWS ---------- */

const view = () => document.getElementById('view');

async function renderDashboard() {
  const d = await api.get('/api/dashboard');
  const next = d.upcomingReminders[0];

  const reminderHtml = next
    ? `<div class="card reminder-card stack">
        <div class="reminder-top">
          <div>
            <div class="eyebrow" style="color:var(--amber-700)">Upcoming reminder</div>
            <div class="spray-product" style="margin-top:4px">${esc(next.productName)}</div>
            <div class="spray-sub">${esc(next.cropName)} · ${esc(next.fieldName)} · applied ${fmtDate(next.applicationDate, { day: 'numeric', month: 'short' })}</div>
          </div>
          <div class="countdown"><div class="n">${next.reference.daysRemaining}</div><div class="l">days left</div></div>
        </div>
        ${referenceBox(next.reference)}
      </div>`
    : `<div class="card empty" style="padding:22px">
        <div class="empty-icon">${icon('clock')}</div>
        <h3>No upcoming reminders</h3>
        <p>Reminders appear here when a logged spray has a reference waiting period.</p>
      </div>`;

  const recentHtml = d.recentSprays.length
    ? `<div class="card">${d.recentSprays.map((s) => `
        <a class="activity" href="#/history?cropId=${s.cropId}">
          ${dateTile(s.applicationDate)}
          <div class="spray-body">
            <div class="spray-product">${esc(s.productName)}</div>
            <div class="spray-sub">${esc(s.cropName)} · ${esc(s.fieldName)}</div>
          </div>
          <span class="badge badge-grey">${esc(categoryLabel(s.category))}</span>
        </a>`).join('')}</div>`
    : emptyState({ iconName: 'spray', title: 'No sprays logged yet', text: 'Record your first application and SprayLog will keep the history for you.', action: '<a class="btn btn-primary" href="#/log">Log your first spray</a>' });

  view().innerHTML = `
    <header class="page-head">
      <div>
        <div class="eyebrow">${fmtDate(todayISO(), { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        <h1>${greeting()} 👋</h1>
        <p>Here is what is happening on your farm.</p>
      </div>
    </header>

    <section class="hero">
      <div>
        <h2>Sprayed something today?</h2>
        <p>Record it in under a minute. SprayLog remembers it for you.</p>
      </div>
      <a class="btn" href="#/log">${icon('plus')}Log Spray</a>
    </section>

    <section class="stats">
      <a class="card card-link stat" href="#/fields"><div class="stat-value">${d.activeCrops}</div><div class="stat-label">Active crops</div></a>
      <a class="card card-link stat" href="#/fields"><div class="stat-value">${d.totalFields}</div><div class="stat-label">Fields</div></a>
      <a class="card card-link stat" href="#/history"><div class="stat-value">${d.totalSprays}</div><div class="stat-label">Sprays logged</div></a>
    </section>

    <section class="stack">
      <div class="section-head"><h2>Next reminder</h2></div>
      ${reminderHtml}
    </section>

    <section class="stack">
      <div class="section-head"><h2>Recent activity</h2>${d.recentSprays.length ? '<a href="#/history">View all</a>' : ''}</div>
      ${recentHtml}
    </section>`;
}

async function renderFields() {
  const fields = await api.get('/api/fields');

  const list = fields.length
    ? `<div class="grid-2">${fields.map((f) => {
        const crops = f.crops.length
          ? `<div class="chips">${f.crops.map((c) => `<span class="crop-chip ${c.status === 'HARVESTED' ? 'harvested' : ''}"><span class="dot"></span>${esc(c.cropName)}</span>`).join('')}</div>`
          : '<span class="muted">No crop added yet</span>';
        return `<a class="card card-link field-card" href="#/fields/${f.id}">
          <div class="field-top">
            <div>
              <div class="field-name">${esc(f.name)}</div>
              <div class="field-meta">${f.locationNote ? esc(f.locationNote) : 'No location note'}</div>
            </div>
            <span class="field-area">${Number(f.areaAcres)} ac</span>
          </div>
          ${crops}
        </a>`;
      }).join('')}</div>`
    : emptyState({ iconName: 'fields', title: 'Add your first field', text: 'Fields help you keep each crop\'s spray history separate. Use the form below.' });

  view().innerHTML = `
    <header class="page-head">
      <div><h1>My Fields</h1><p>Select a field to see its crops and spray history.</p></div>
    </header>
    ${list}
    <details class="card add-panel" ${fields.length ? '' : 'open'}>
      <summary>${icon('plus')}Add a field</summary>
      <form class="form" id="field-form" novalidate>
        <div id="field-form-alert"></div>
        <div class="form-group">
          <label for="f-name">Field name <span class="req">*</span></label>
          <input id="f-name" name="name" maxlength="100" placeholder="e.g. North field" required>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label for="f-area">Area (acres) <span class="req">*</span></label>
            <input id="f-area" name="areaAcres" type="number" step="0.01" min="0.01" inputmode="decimal" placeholder="2" required>
          </div>
          <div class="form-group">
            <label for="f-loc">Location note</label>
            <input id="f-loc" name="locationNote" maxlength="255" placeholder="Optional">
          </div>
        </div>
        <button class="btn btn-primary" type="submit">Save field</button>
      </form>
    </details>`;

  document.getElementById('field-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const body = {
      name: form.elements['name'].value.trim(),
      areaAcres: form.areaAcres.value ? Number(form.areaAcres.value) : null,
      locationNote: form.locationNote.value.trim() || null,
    };
    try {
      const created = await api.post('/api/fields', body);
      toast(`${created.name} added`);
      location.hash = `#/fields/${created.id}`;
    } catch (err) {
      document.getElementById('field-form-alert').innerHTML = formAlert(err);
    }
  });
}

async function renderFieldDetail(fieldId) {
  const [field, sprays] = await Promise.all([api.get(`/api/fields/${fieldId}`), api.get('/api/sprays')]);
  const countFor = (cropId) => sprays.filter((s) => s.cropId === cropId).length;
  const lastFor = (cropId) => sprays.find((s) => s.cropId === cropId);

  const crops = field.crops.length
    ? field.crops.map((c) => {
        const last = lastFor(c.id);
        const active = c.status === 'ACTIVE';
        return `<article class="card crop-row">
          <div class="crop-row-top">
            <div>
              <div class="crop-title">${esc(c.cropName)}${c.variety ? ` <span class="muted">· ${esc(c.variety)}</span>` : ''}</div>
              <div class="field-meta">${c.sowingDate ? `Sown ${fmtDate(c.sowingDate)}` : 'Sowing date not recorded'} · ${countFor(c.id)} spray${countFor(c.id) === 1 ? '' : 's'} logged</div>
            </div>
            <span class="badge ${active ? 'badge-green' : 'badge-grey'}">${active ? 'Active' : 'Harvested'}</span>
          </div>
          ${last ? `<div class="spray-details"><span>Last spray <b>${esc(last.productName)}</b> on <b>${fmtDate(last.applicationDate)}</b></span></div>` : ''}
          <div class="btn-row">
            ${active ? `<a class="btn btn-primary btn-sm" href="#/log?cropId=${c.id}">${icon('plus')}Log spray</a>` : ''}
            <a class="btn btn-secondary btn-sm" href="#/history?cropId=${c.id}">${icon('history')}History</a>
            <button class="btn btn-ghost btn-sm" data-status="${active ? 'HARVESTED' : 'ACTIVE'}" data-crop="${c.id}">${active ? 'Mark harvested' : 'Mark active'}</button>
          </div>
        </article>`;
      }).join('')
    : emptyState({ iconName: 'leaf', title: 'No crops in this field yet', text: 'Add the crop you are growing here, then you can log sprays for it.' });

  view().innerHTML = `
    <a class="back-link" href="#/fields">${icon('arrowLeft')}My Fields</a>
    <header class="page-head">
      <div>
        <h1>${esc(field.name)}</h1>
        <p>${Number(field.areaAcres)} acres${field.locationNote ? ` · ${esc(field.locationNote)}` : ''}</p>
      </div>
    </header>
    <section class="stack">
      <div class="section-head"><h2>Crops</h2></div>
      ${crops}
    </section>
    <details class="card add-panel" ${field.crops.length ? '' : 'open'}>
      <summary>${icon('plus')}Add a crop to ${esc(field.name)}</summary>
      <form class="form" id="crop-form" novalidate>
        <div id="crop-form-alert"></div>
        <div class="form-row">
          <div class="form-group">
            <label for="c-name">Crop <span class="req">*</span></label>
            <input id="c-name" name="cropName" maxlength="100" placeholder="e.g. Tomato" required>
          </div>
          <div class="form-group">
            <label for="c-var">Variety</label>
            <input id="c-var" name="variety" maxlength="100" placeholder="Optional">
          </div>
        </div>
        <div class="form-group">
          <label for="c-sow">Sowing date</label>
          <input id="c-sow" name="sowingDate" type="date" max="${todayISO()}">
        </div>
        <button class="btn btn-primary" type="submit">Save crop</button>
      </form>
    </details>`;

  view().querySelectorAll('[data-status]').forEach((btn) => btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      await api.patch(`/api/crops/${btn.dataset.crop}/status`, { status: btn.dataset.status });
      toast(btn.dataset.status === 'HARVESTED' ? 'Marked as harvested' : 'Marked as active');
      renderFieldDetail(fieldId);
    } catch (err) { toast(err.message, true); btn.disabled = false; }
  }));

  document.getElementById('crop-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    try {
      await api.post('/api/crops', {
        cropName: form.cropName.value.trim(),
        variety: form.variety.value.trim() || null,
        sowingDate: form.sowingDate.value || null,
        fieldId: Number(fieldId),
      });
      toast('Crop added');
      renderFieldDetail(fieldId);
    } catch (err) {
      document.getElementById('crop-form-alert').innerHTML = formAlert(err);
    }
  });
}

async function renderLog(params) {
  const [fields, references] = await Promise.all([api.get('/api/fields'), api.get('/api/references')]);
  const preCropId = params.get('cropId') ? Number(params.get('cropId')) : null;
  const activeCropsOf = (f) => f.crops.filter((c) => c.status === 'ACTIVE');
  const fieldsWithCrops = fields.filter((f) => activeCropsOf(f).length);

  if (!fieldsWithCrops.length) {
    view().innerHTML = `
      <header class="page-head"><div><h1>Log Spray</h1></div></header>
      ${emptyState({ iconName: 'leaf', title: 'Add a field and crop first', text: 'Every spray is recorded against a crop in one of your fields.', action: '<a class="btn btn-primary" href="#/fields">Go to My Fields</a>' })}`;
    return;
  }

  const preField = preCropId ? fieldsWithCrops.find((f) => f.crops.some((c) => c.id === preCropId)) : null;
  const startField = preField || fieldsWithCrops[0];
  const productNames = [...new Set(references.map((r) => r.productName))];

  view().innerHTML = `
    <header class="page-head">
      <div><h1>Log Spray</h1><p>Record an application you have already made.</p></div>
    </header>
    <form class="card form" id="spray-form" novalidate>
      <div id="spray-form-alert"></div>

      <div class="form-row">
        <div class="form-group">
          <label for="s-field">Field <span class="req">*</span></label>
          <select id="s-field" name="fieldId">
            ${fieldsWithCrops.map((f) => `<option value="${f.id}" ${f.id === startField.id ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label for="s-crop">Crop <span class="req">*</span></label>
          <select id="s-crop" name="cropId"></select>
        </div>
      </div>

      <div class="form-group">
        <label for="s-product">Product name <span class="req">*</span></label>
        <input id="s-product" name="productName" maxlength="150" list="product-list" autocomplete="off" placeholder="Name as written on the pack">
        <datalist id="product-list">${productNames.map((p) => `<option value="${esc(p)}">`).join('')}</datalist>
        <span class="hint">Type the product you used. Names with a reference record will show timing info.</span>
      </div>

      <fieldset class="form-group" style="border:0;padding:0;margin:0">
        <legend style="font-weight:600;font-size:15px;margin-bottom:6px">Category <span class="req">*</span></legend>
        <div class="segments">
          ${CATEGORIES.map((c, i) => `<input type="radio" name="category" id="cat-${c.value}" value="${c.value}" ${i === 0 ? 'checked' : ''}><label for="cat-${c.value}">${c.label}</label>`).join('')}
        </div>
      </fieldset>

      <div class="form-group">
        <label for="s-date">Application date <span class="req">*</span></label>
        <input id="s-date" name="applicationDate" type="date" value="${todayISO()}" max="${todayISO()}">
      </div>

      <div class="form-row">
        <div class="form-group">
          <label for="s-qty">Quantity used</label>
          <input id="s-qty" name="quantity" type="number" step="0.01" min="0.01" inputmode="decimal" placeholder="Optional">
        </div>
        <div class="form-group">
          <label for="s-unit">Unit</label>
          <select id="s-unit" name="unit">${UNITS.map((u) => `<option value="${u}">${u}</option>`).join('')}</select>
        </div>
      </div>

      <div class="form-group">
        <label for="s-notes">Notes</label>
        <textarea id="s-notes" name="notes" maxlength="500" placeholder="Optional: weather, who sprayed, area covered…"></textarea>
      </div>

      <div class="notice">${icon('info')}<span>SprayLog records what you applied. It does not recommend products or doses. Always follow the product label and expert advice.</span></div>

      <button class="btn btn-primary btn-block" type="submit" id="spray-submit">${icon('check')}Save Spray</button>
    </form>`;

  const fieldSelect = document.getElementById('s-field');
  const cropSelect = document.getElementById('s-crop');
  function fillCrops() {
    const field = fieldsWithCrops.find((f) => f.id === Number(fieldSelect.value));
    cropSelect.innerHTML = activeCropsOf(field).map((c) =>
      `<option value="${c.id}" ${c.id === preCropId ? 'selected' : ''}>${esc(c.cropName)}${c.variety ? ` (${esc(c.variety)})` : ''}</option>`).join('');
  }
  fieldSelect.addEventListener('change', fillCrops);
  fillCrops();

  document.getElementById('spray-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const alertBox = document.getElementById('spray-form-alert');
    alertBox.innerHTML = '';
    form.querySelectorAll('.invalid').forEach((el) => el.classList.remove('invalid'));

    const body = {
      cropId: Number(form.cropId.value),
      productName: form.productName.value.trim(),
      category: form.category.value,
      applicationDate: form.applicationDate.value,
      quantity: form.quantity.value ? Number(form.quantity.value) : null,
      unit: form.quantity.value ? form.unit.value : null,
      notes: form.notes.value.trim() || null,
    };

    // Quick checks in the browser (the backend checks again)
    const errors = [];
    if (!body.productName) { errors.push('Product name is required'); form.productName.classList.add('invalid'); }
    if (!body.applicationDate) { errors.push('Application date is required'); form.applicationDate.classList.add('invalid'); }
    else if (body.applicationDate > todayISO()) { errors.push('Application date cannot be in the future'); form.applicationDate.classList.add('invalid'); }
    if (body.quantity !== null && !(body.quantity > 0)) { errors.push('Quantity must be greater than 0'); form.quantity.classList.add('invalid'); }
    if (errors.length) {
      alertBox.innerHTML = formAlert(new ApiError('Please check the form', errors));
      alertBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    const btn = document.getElementById('spray-submit');
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
      const saved = await api.post('/api/sprays', body);
      location.hash = `#/saved/${saved.id}`;   // success screen has its own URL
    } catch (err) {
      alertBox.innerHTML = formAlert(err);
      alertBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
      btn.disabled = false; btn.innerHTML = `${icon('check')}Save Spray`;
    }
  });
}

async function renderSuccess(sprayId) {
  const saved = await api.get(`/api/sprays/${sprayId}`);
  view().innerHTML = `
    <section class="success">
      <div class="success-icon">${icon('check')}</div>
      <h1>Spray saved</h1>
      <p>${esc(saved.productName)} on ${esc(saved.cropName)} · ${esc(saved.fieldName)}</p>
    </section>
    ${sprayCard(saved)}
    <div class="btn-row">
      <a class="btn btn-primary" href="#/history?cropId=${saved.cropId}">${icon('history')}View history</a>
      <a class="btn btn-secondary" href="#/log?cropId=${saved.cropId}">${icon('plus')}Log another</a>
    </div>
    <a class="btn btn-ghost" href="#/dashboard">Back to dashboard</a>`;
}

async function renderHistory(params) {
  const cropId = params.get('cropId') ? Number(params.get('cropId')) : null;
  const [crops, sprays] = await Promise.all([
    api.get('/api/crops'),
    api.get(cropId ? `/api/sprays?cropId=${cropId}` : '/api/sprays'),
  ]);
  const selected = crops.find((c) => c.id === cropId);

  const filters = crops.length > 1
    ? `<div class="filter-bar">
        <a class="filter-chip ${cropId ? '' : 'active'}" href="#/history">All crops</a>
        ${crops.map((c) => `<a class="filter-chip ${c.id === cropId ? 'active' : ''}" href="#/history?cropId=${c.id}">${esc(c.cropName)} · ${esc(c.fieldName)}</a>`).join('')}
      </div>`
    : '';

  const list = sprays.length
    ? `<div class="stack">${sprays.map(sprayCard).join('')}</div>`
    : emptyState({
        iconName: 'history',
        title: selected ? `No sprays for ${selected.cropName} yet` : 'Your spray history is empty',
        text: 'Each spray you log appears here with its date, product and any timing information.',
        action: `<a class="btn btn-primary" href="#/log${cropId ? `?cropId=${cropId}` : ''}">${icon('plus')}Log Spray</a>`,
      });

  view().innerHTML = `
    <header class="page-head">
      <div>
        <h1>Spray History</h1>
        <p>${selected ? `${esc(selected.cropName)} in ${esc(selected.fieldName)}` : 'Every application you have recorded, newest first.'}</p>
      </div>
    </header>
    ${filters}
    ${list}`;
}

async function renderReferences() {
  const refs = await api.get('/api/references');
  const anyDemo = refs.some((r) => r.demoData);

  view().innerHTML = `
    <header class="page-head">
      <div><h1>Reference Data</h1><p>The records SprayLog uses for waiting-period reminders.</p></div>
    </header>
    ${anyDemo ? `<div class="notice" style="background:var(--amber-50);border-color:#f1d9a8;color:var(--amber-700)">${icon('alert')}<span><b>Prototype data.</b> Records marked DEMO DATA use fictional products and placeholder numbers. They are not real safety information and must be replaced with verified sources before real use.</span></div>` : ''}
    <div class="notice">${icon('info')}<span>If no record matches a product and crop, or a record has no waiting period, SprayLog shows "${esc(UNAVAILABLE)}" and does not guess.</span></div>
    ${refs.length ? `<div class="stack">${refs.map((r) => `
      <article class="card ref-item">
        <div class="ref-item-top">
          <div>
            <div class="spray-product">${esc(r.productName)}</div>
            <div class="spray-sub">${esc(r.cropName)}${r.useContext ? ` · ${esc(r.useContext)}` : ''}</div>
          </div>
          ${r.demoData ? '<span class="badge badge-demo">DEMO DATA</span>' : '<span class="badge badge-green">Verified</span>'}
        </div>
        <dl class="kv">
          <dt>Waiting period</dt><dd>${r.waitingPeriodDays === null || r.waitingPeriodDays === undefined ? 'Not available' : `${r.waitingPeriodDays} days`}</dd>
          <dt>Source</dt><dd>${esc(r.source)}</dd>
          <dt>Version</dt><dd>${esc(r.sourceVersion || '-')}</dd>
        </dl>
      </article>`).join('')}</div>`
    : emptyState({ iconName: 'book', title: 'No reference records', text: 'Timing reminders will show "unavailable" until verified records are added.' })}`;
}

/* ---------- 7. ROUTER + START-UP ---------- */

const routes = [
  { pattern: /^\/dashboard$/, nav: 'dashboard', render: () => renderDashboard() },
  { pattern: /^\/fields$/, nav: 'fields', render: () => renderFields() },
  { pattern: /^\/fields\/(\d+)$/, nav: 'fields', render: (m) => renderFieldDetail(m[1]) },
  { pattern: /^\/log$/, nav: 'log', render: (m, p) => renderLog(p) },
  { pattern: /^\/saved\/(\d+)$/, nav: 'log', render: (m) => renderSuccess(m[1]) },
  { pattern: /^\/history$/, nav: 'history', render: (m, p) => renderHistory(p) },
  { pattern: /^\/references$/, nav: 'references', render: () => renderReferences() },
];

async function router() {
  const hash = location.hash.replace(/^#/, '') || '/dashboard';
  const [path, query = ''] = hash.split('?');
  const params = new URLSearchParams(query);
  const route = routes.find((r) => r.pattern.test(path)) || routes[0];
  const match = path.match(route.pattern) || [];

  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === route.nav));
  view().innerHTML = loading();
  window.scrollTo(0, 0);
  try {
    await route.render(match, params);
  } catch (err) {
    view().innerHTML = errorState(err);
  }
}

function injectIcons() {
  document.querySelectorAll('[data-icon]').forEach((el) => {
    el.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[el.dataset.icon] || ''}</svg>`;
  });
}

async function start() {
  injectIcons();
  setMode((await Backend.isUp()) ? 'backend' : 'demo'); // FALLBACK decides the mode at start
  window.addEventListener('hashchange', router);
  router();
}

start();
