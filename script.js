'use strict';

// WBS #1
const CURRENCY = '₱';
const LS_KEY = 'ims.db.v1';
const SESSION_KEY = 'ims.session.v1';


const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => CURRENCY + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const intOf = (v) => (/^\d+$/.test(String(v).trim()) ? parseInt(v, 10) : NaN);
const pad = (n, w = 2) => String(n).padStart(w, '0');
const nowISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const todayISO = () => nowISO().slice(0, 10);
const fmtDate = (iso) => new Date(iso.slice(0, 10) + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const fmtDT = (iso) => iso.slice(0, 10) + ' ' + (iso.slice(11, 16) || '');
const byId = (arr, id) => arr.find((x) => x.id === id);

function lsGet(key, store = localStorage) { try { return store.getItem(key); } catch (e) { return null; } }
function lsSet(key, val, store = localStorage) { try { store.setItem(key, val); } catch (e) { /* storage unavailable: keep in memory */ } }

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 2600);
}

function download(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const toCSV = (rows) => rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');



// WBS #2
// WBS #16
const USERS = [
  { username: 'admin', password: 'admin123', role: 'admin', name: 'Admin User' },
  { username: 'staff', password: 'staff123', role: 'staff', name: 'Warehouse Staff' },
  { username: 'viewer', password: 'viewer123', role: 'viewer', name: 'Guest Viewer' },
];
const ROLES = {
  admin: { label: 'Administrator', can: ['product', 'supplier', 'stock', 'po', 'wbs', 'delete', 'admin'] },
  staff: { label: 'Staff', can: ['product', 'supplier', 'stock', 'po', 'wbs'] },
  viewer: { label: 'Viewer (read-only)', can: [] },
};

let db;
let session = null;
db = loadDB();

function loadDB() {
  const raw = lsGet(LS_KEY);
  if (raw) { try { const d = JSON.parse(raw); if (d && d.products) return d; } catch (e) { /* fall through */ } }
  return seed();
}
const saveDB = () => lsSet(LS_KEY, JSON.stringify(db));
function nextId(kind, prefix, width = 3) { db.seq[kind] = (db.seq[kind] || 0) + 1; return prefix + pad(db.seq[kind], width); }

function seed() {
  db = { products: [], suppliers: [], transactions: [], orders: [], wbsDone: {}, seq: {}, meta: { lastBackup: null } };
  const sup = [
    ['Northwind Traders', 'Ana Reyes', 'ana@northwind.example', '0917 000 1111'],
    ['Pacific Office Supply', 'Marco Lim', 'marco@pacificoffice.example', '0918 222 3333'],
    ['TechSource Distribution', 'Jo Santos', 'jo@techsource.example', '0920 444 5555'],
  ].map(([name, contact, email, phone]) => ({ id: nextId('s', 'S'), name, contact, email, phone }));
  db.suppliers = sup;
  const prod = [
    ['ELEC-001', 'USB-C Charging Cable', 'Electronics', 2, 180, 40, 'S003'],
    ['ELEC-002', 'Wireless Mouse', 'Electronics', 5, 650, 15, 'S003'],
    ['ELEC-003', 'Mechanical Keyboard', 'Electronics', 3, 2400, 8, 'S003'],
    ['OFF-001', 'A4 Bond Paper (ream)', 'Office', 12, 260, 30, 'S002'],
    ['OFF-002', 'Ballpoint Pens (box of 50)', 'Office', 4, 320, 10, 'S002'],
    ['OFF-003', 'Stapler', 'Office', 20, 150, 5, 'S002'],
    ['GRO-001', 'Instant Coffee (500g)', 'Pantry', 25, 420, 12, 'S001'],
    ['GRO-002', 'Bottled Water (case)', 'Pantry', 0, 280, 10, 'S001'],
    ['GRO-003', 'Sugar (1kg)', 'Pantry', 14, 95, 15, 'S001'],
    ['CLN-001', 'Disinfectant Spray', 'Cleaning', 9, 175, 10, 'S001'],
  ];
  prod.forEach(([sku, name, category, , price, reorder, supplierId]) => {
    db.products.push({ id: nextId('p', 'P'), sku, name, category, supplierId, price, qty: 0, reorder });
  });
  const when = (d) => `2026-10-${pad(d)}T09:00`;
  prod.forEach(([, , , qty], i) => applyTx(db.products[i].id, 'in', qty + (qty ? 10 : 0) || 0, 'Opening balance', 'OPENING', when(1), 'System', true));
  [[0, 12], [1, 4], [3, 14], [6, 8], [9, 3]].forEach(([i, q], k) => applyTx(db.products[i].id, 'out', q, 'Sale', '', when(5 + k), 'System', true));
  const gro2 = db.products[7];
  gro2.qty = 0;
  db.transactions = db.transactions.filter((t) => t.productId !== gro2.id);
  return db;
}


function applyTx(productId, type, qty, note, ref, date, user, silent) {
  const p = byId(db.products, productId);
  if (!p) return 'Select a product.';
  if (!Number.isInteger(qty) || qty <= 0) return 'Quantity must be a whole number greater than zero.';
  if (type === 'out' && qty > p.qty) return `Not enough stock. ${p.name} has only ${p.qty} on hand.`;
  p.qty += type === 'in' ? qty : -qty;
  db.transactions.push({
    id: nextId('t', 'T', 4), date: date || nowISO(), productId, name: p.name, sku: p.sku,
    type, qty, balance: p.qty, note: note || '', ref: ref || '', user: user || session?.name || 'System',
  });
  if (!silent) saveDB();
  return null;
}

const stockState = (p) => (p.qty === 0 ? 'out' : p.qty <= p.reorder ? 'low' : 'ok');
const stockBadge = (p) => {
  const s = stockState(p);
  return `<span class="badge ${s}">${s === 'out' ? 'Out of stock' : s === 'low' ? 'Low stock' : 'In stock'}</span>`;
};
// WBS #6
const supplierName = (id) => byId(db.suppliers, id)?.name || '—';
// WBS #11
const lowStock = () => db.products.filter((p) => p.qty <= p.reorder);


const can = (action) => !!session && ROLES[session.role].can.includes(action);
const readOnlyNote = () => (can('stock') ? '' : '<p class="muted small">Your role is read-only.</p>');

const ui = {
  products: { q: '', cat: '', st: '', page: 0 },
};


// WBS #15
function dashboardView() {
  const units = db.products.reduce((s, p) => s + p.qty, 0);
  const value = db.products.reduce((s, p) => s + p.qty * p.price, 0);
  const low = lowStock();
  const cats = {};
  db.products.forEach((p) => { cats[p.category] = (cats[p.category] || 0) + p.qty; });
  const max = Math.max(1, ...Object.values(cats));
  return `
    <div class="stats">
      <div class="stat"><div class="label">Products</div><div class="value">${db.products.length}</div></div>
      <div class="stat"><div class="label">Units on hand</div><div class="value">${units.toLocaleString()}</div></div>
      <div class="stat"><div class="label">Inventory value</div><div class="value">${money(value)}</div></div>
      <div class="stat ${low.length ? 'alert' : ''}"><div class="label">Need reorder</div><div class="value">${low.length}</div></div>
    </div>
    <div class="grid two">
      <div class="card">
        <h3>Units by category</h3>
        <div class="bars">
          ${Object.entries(cats).map(([c, n]) => `
            <div class="bar-row"><span>${esc(c)}</span><div class="bar-track"><div class="bar-fill" style="width:${(n / max) * 100}%"></div></div><span class="num right">${n}</span></div>`).join('') || '<p class="muted">No products yet.</p>'}
        </div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Low stock alerts</h3></div>
        ${low.length ? `<ul class="list-plain">${low.slice(0, 6).map((p) => `<li><span>${esc(p.name)}</span><span>${p.qty} / ${p.reorder} ${stockBadge(p)}</span></li>`).join('')}</ul>` : '<p class="muted">All products are above their reorder level.</p>'}
      </div>
    </div>`;
}


// WBS #4
function filteredProducts() {
  const { q, cat, st } = ui.products;
  const needle = q.trim().toLowerCase();
  return db.products.filter((p) =>
    (!needle || p.name.toLowerCase().includes(needle) || p.sku.toLowerCase().includes(needle) || p.category.toLowerCase().includes(needle)) &&
    (!cat || p.category === cat) && (!st || stockState(p) === st));
}
const PAGE_SIZE = 7;
function productsTable() {
  const all = filteredProducts();
  if (!all.length) return '<p class="empty">No products match your search.</p>';
  const pages = Math.ceil(all.length / PAGE_SIZE);
  const page = ui.products.page = Math.min(ui.products.page, pages - 1);
  const rows = all.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  return `<div class="table-wrap"><table>
    <thead><tr><th>SKU</th><th>Product</th><th>Category</th><th>Supplier</th><th class="right">Price</th><th class="right">Qty</th><th class="right">Reorder at</th><th>Status</th><th></th></tr></thead>
    <tbody>${rows.map((p) => `<tr>
      <td>${esc(p.sku)}</td><td><strong>${esc(p.name)}</strong></td><td>${esc(p.category)}</td><td>${esc(supplierName(p.supplierId))}</td>
      <td class="right num">${money(p.price)}</td><td class="right num">${p.qty}</td><td class="right num">${p.reorder}</td><td>${stockBadge(p)}</td>
      <td class="actions">${can('product') ? `<button class="btn sm" data-act="edit-product" data-id="${p.id}">Edit</button>` : ''}${can('delete') ? `<button class="btn sm danger" data-act="del-product" data-id="${p.id}">Delete</button>` : ''}</td>
    </tr>`).join('')}</tbody></table></div>
    <div class="pager"><span>Showing ${page * PAGE_SIZE + 1}–${page * PAGE_SIZE + rows.length} of ${all.length} product${all.length > 1 ? 's' : ''}</span>
      <div class="btns"><button class="btn sm" data-act="prod-page" data-dir="-1" ${page === 0 ? 'disabled' : ''}>Previous</button><button class="btn sm" data-act="prod-page" data-dir="1" ${page >= pages - 1 ? 'disabled' : ''}>Next</button></div></div>`;
}
function productsView() {
  const cats = [...new Set(db.products.map((p) => p.category))].sort();
  const f = ui.products;
  return `
    <div class="card">
      <div class="toolbar">
        <input class="grow" type="search" placeholder="Search by name, SKU or category…" value="${esc(f.q)}" data-filter="products.q" aria-label="Search products">
        <select data-filter="products.cat" aria-label="Category"><option value="">All categories</option>${cats.map((c) => `<option ${f.cat === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
        <select data-filter="products.st" aria-label="Stock status">
          <option value="">Any status</option>
          <option value="ok" ${f.st === 'ok' ? 'selected' : ''}>In stock</option>
          <option value="low" ${f.st === 'low' ? 'selected' : ''}>Low stock</option>
          <option value="out" ${f.st === 'out' ? 'selected' : ''}>Out of stock</option>
        </select>
        ${can('product') ? '<button class="btn primary" data-act="add-product">Register product</button>' : ''}
      </div>
      <div id="tbl">${productsTable()}</div>
    </div>`;
}

// WBS #3
function openProductForm(id) {
  const p = id ? byId(db.products, id) : null;
  const supOpts = [{ v: '', t: '— None —' }, ...db.suppliers.map((s) => ({ v: s.id, t: s.name }))];
  const body = `
    ${field('SKU', 'sku', { value: p?.sku, required: true })}
    ${field('Product name', 'name', { value: p?.name, required: true })}
    ${field('Category', 'category', { value: p?.category, required: true, attrs: 'list="catlist"' })}
    <datalist id="catlist">${[...new Set(db.products.map((x) => x.category))].map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
    ${field('Supplier', 'supplierId', { value: p?.supplierId || '', options: supOpts })}
    ${field('Unit price', 'price', { type: 'number', value: p?.price ?? '', required: true, attrs: 'min="0" step="0.01"' })}
    ${field('Reorder level', 'reorder', { type: 'number', value: p?.reorder ?? 10, required: true, attrs: 'min="0" step="1"', hint: 'Alert when stock falls to this number' })}
    ${p ? '' : field('Opening stock', 'qty', { type: 'number', value: 0, required: true, attrs: 'min="0" step="1"' })}`;
  openModal(p ? 'Edit product' : 'Register product', body, (d) => {
    const sku = d.sku.trim().toUpperCase(), name = d.name.trim(), category = d.category.trim();
    const price = parseFloat(d.price), reorder = intOf(d.reorder);
    if (!sku || !name || !category) return 'SKU, name and category are required.';
    if (db.products.some((x) => x.sku === sku && x.id !== id)) return `SKU ${sku} is already used by another product.`;
    if (!(price >= 0)) return 'Price must be zero or more.';
    if (Number.isNaN(reorder)) return 'Reorder level must be a whole number, zero or more.';
    if (p) {
      Object.assign(p, { sku, name, category, supplierId: d.supplierId, price, reorder });
    } else {
      const qty = intOf(d.qty);
      if (Number.isNaN(qty)) return 'Opening stock must be a whole number, zero or more.';
      const np = { id: nextId('p', 'P'), sku, name, category, supplierId: d.supplierId, price, qty: 0, reorder };
      db.products.push(np);
      if (qty > 0) applyTx(np.id, 'in', qty, 'Opening balance', 'OPENING', null, null, true);
    }
    saveDB(); toast(p ? 'Product updated' : 'Product registered'); render();
    return null;
  });
}


// WBS #5
function suppliersView() {
  return `
    <div class="card">
      <div class="toolbar"><span class="muted">${db.suppliers.length} suppliers</span><span class="spacer"></span>
        ${can('supplier') ? '<button class="btn primary" data-act="add-supplier">Add supplier</button>' : ''}</div>
      ${db.suppliers.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Supplier</th><th>Contact</th><th>Email</th><th>Phone</th><th>Products supplied</th><th></th></tr></thead>
        <tbody>${db.suppliers.map((s) => {
          const items = db.products.filter((p) => p.supplierId === s.id);
          return `<tr><td><strong>${esc(s.name)}</strong></td><td>${esc(s.contact)}</td><td>${esc(s.email)}</td><td>${esc(s.phone)}</td>
            <td>${items.length ? esc(items.map((p) => p.name).join(', ')) : '<span class="muted">None linked</span>'}</td>
            <td class="actions">${can('supplier') ? `<button class="btn sm" data-act="edit-supplier" data-id="${s.id}">Edit</button>` : ''}${can('delete') ? `<button class="btn sm danger" data-act="del-supplier" data-id="${s.id}">Delete</button>` : ''}</td></tr>`;
        }).join('')}</tbody></table></div>` : '<p class="empty">No suppliers yet.</p>'}
    </div>`;
}
function openSupplierForm(id) {
  const s = id ? byId(db.suppliers, id) : null;
  openModal(s ? 'Edit supplier' : 'Add supplier', `
    <div class="full">${field('Supplier name', 'name', { value: s?.name, required: true })}</div>
    ${field('Contact person', 'contact', { value: s?.contact })}
    ${field('Phone', 'phone', { value: s?.phone })}
    <div class="full">${field('Email', 'email', { type: 'email', value: s?.email })}</div>`, (d) => {
    const name = d.name.trim();
    if (!name) return 'Supplier name is required.';
    if (db.suppliers.some((x) => x.name.toLowerCase() === name.toLowerCase() && x.id !== id)) return 'A supplier with that name already exists.';
    const data = { name, contact: d.contact.trim(), phone: d.phone.trim(), email: d.email.trim() };
    if (s) Object.assign(s, data); else db.suppliers.push({ id: nextId('s', 'S'), ...data });
    saveDB(); toast(s ? 'Supplier updated' : 'Supplier added'); render();
    return null;
  });
}


// WBS #17
const NAV = [
  { id: 'dashboard', label: 'Dashboard', title: 'Dashboard', render: dashboardView },
  { id: 'products', label: 'Products', title: 'Products', render: productsView, table: productsTable },
  { id: 'suppliers', label: 'Suppliers', title: 'Suppliers', render: suppliersView },
];
let route = NAV[0];

function render() {
  if (!session) return;
  const id = location.hash.slice(1) || 'dashboard';
  route = NAV.find((n) => n.id === id && (!n.perm || can(n.perm))) || NAV[0];
  $('#nav').innerHTML = NAV.filter((n) => !n.perm || can(n.perm))
    .map((n) => `<a href="#${n.id}" ${n.id === route.id ? 'aria-current="page"' : ''}>${esc(n.label)}</a>`).join('');
  $('#pageTitle').textContent = route.title;
  $('#view').innerHTML = route.render();
  $('#side').classList.remove('open');
}


function field(label, name, { type = 'text', value = '', required = false, attrs = '', options = null, hint = '' } = {}) {
  const id = 'f_' + name;
  const ctl = options
    ? `<select id="${id}" name="${name}" ${required ? 'required' : ''}>${options.map((o) => `<option value="${esc(o.v)}" ${String(o.v) === String(value) ? 'selected' : ''}>${esc(o.t)}</option>`).join('')}</select>`
    : `<input id="${id}" name="${name}" type="${type}" value="${esc(value)}" ${required ? 'required' : ''} ${attrs}>`;
  return `<label class="field"><span>${esc(label)}</span>${ctl}${hint ? `<small>${esc(hint)}</small>` : ''}</label>`;
}

let modalHandler = null;
function openModal(title, body, onSubmit) {
  $('#modalTitle').textContent = title;
  $('#modalBody').innerHTML = body;
  $('#modalForm .form-err').textContent = '';
  modalHandler = onSubmit;
  $('#modal').showModal();
}

// WBS #18
const formHandlers = {
  login(d) {
    const u = USERS.find((x) => x.username === d.username.trim().toLowerCase() && x.password === d.password);
    if (!u) return 'Wrong username or password.';
    session = { username: u.username, name: u.name, role: u.role };
    lsSet(SESSION_KEY, JSON.stringify(session), sessionStorage);
    showApp();
    return null;
  },
  modal(d) { const err = modalHandler ? modalHandler(d) : null; if (!err) $('#modal').close(); return err; },
};

document.addEventListener('submit', (e) => {
  const form = e.target.closest('form[data-form]');
  if (!form) return;
  e.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  const err = formHandlers[form.dataset.form](data, form);
  const box = $('.form-err', form);
  if (box) box.textContent = err || '';
});


const actions = {
  'fill-login'(el) { const f = el.closest('form'); f.username.value = el.dataset.u; f.password.value = el.dataset.p; },
  logout() { session = null; try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ } location.hash = ''; showLogin(); },
  'close-modal'() { $('#modal').close(); },
  'add-product'() { openProductForm(); },
  'prod-page'(el) { ui.products.page += Number(el.dataset.dir); $('#tbl').innerHTML = productsTable(); },
  'edit-product'(el) { openProductForm(el.dataset.id); },
  'del-product'(el) {
    const p = byId(db.products, el.dataset.id);
    if (p && confirm(`Delete "${p.name}"? Its transaction history is kept.`)) { db.products = db.products.filter((x) => x !== p); saveDB(); toast('Product deleted'); render(); }
  },
  'add-supplier'() { openSupplierForm(); },
  'edit-supplier'(el) { openSupplierForm(el.dataset.id); },
  'del-supplier'(el) {
    const s = byId(db.suppliers, el.dataset.id);
    if (!s) return;
    if (db.products.some((p) => p.supplierId === s.id)) return toast('Unlink this supplier from its products first');
    if (confirm(`Delete supplier "${s.name}"?`)) { db.suppliers = db.suppliers.filter((x) => x !== s); saveDB(); toast('Supplier deleted'); render(); }
  },
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (el && actions[el.dataset.act] && el.type !== 'checkbox') actions[el.dataset.act](el);
});

document.addEventListener('input', (e) => {
  const key = e.target.dataset?.filter;
  if (!key) return;
  const [group, prop] = key.split('.');
  ui[group][prop] = e.target.value;
  if (group === 'products') ui.products.page = 0;
  const tbl = $('#tbl');
  if (tbl && route.table) tbl.innerHTML = route.table();
});

$('#menuBtn').addEventListener('click', () => $('#side').classList.toggle('open'));
window.addEventListener('hashchange', render);


function showLogin() { $('#app').hidden = true; $('#login').hidden = false; $('#login input[name=username]').focus(); }
function showApp() {
  $('#login').hidden = true; $('#app').hidden = false;
  $('#who').textContent = `${session.name} · ${ROLES[session.role].label}`;
  render();
}
(function boot() {
  const saved = lsGet(SESSION_KEY, sessionStorage);
  if (saved) { try { session = JSON.parse(saved); } catch (e) { session = null; } }
  if (session && ROLES[session.role]) showApp(); else { session = null; showLogin(); }
})();
