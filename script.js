'use strict';
const CURRENCY = '₱';
const LS_KEY = 'ims.db.v1';
const SESSION_KEY = 'ims.session.v1';

/* ---------------- WBS (from Canayan_WBS.docx) ---------------- */
// [no, task, hours, due date, precedence]
const WBS = [
    [1, 'Set Up the Inventory Management System', 4, '2026-09-15', []],
    [2, 'Design and Create the Product Database', 3, '2026-09-15', [1]],
    [3, 'Develop Product Registration', 4, '2026-09-18', [2]],
    [4, 'Develop Product Search and Inventory Listing', 3, '2026-09-22', [3]],
    [5, 'Develop Supplier Management', 4, '2026-09-25', [2]],
    [6, 'Connect Products and Suppliers', 3, '2026-09-25', [3, 5]],
    [7, 'Develop Stock-In / Receiving Module', 4, '2026-09-29', [6]],
    [8, 'Develop Stock-In Validation', 3, '2026-10-02', [7]],
    [9, 'Develop Stock-Out Module', 4, '2026-10-06', [8]],
    [10, 'Develop Inventory Transaction History', 3, '2026-10-06', [9]],
    [11, 'Develop Reorder Level Monitoring', 3, '2026-10-09', [10]],
    [12, 'Develop Reorder Recommendation', 3, '2026-10-13', [11]],
    [13, 'Develop Purchase/Restocking Workflow', 4, '2026-10-16', [12]],
    [14, 'Develop Inventory Reports', 5, '2026-10-16', [13]],
    [15, 'Develop the Inventory Dashboard', 5, '2026-10-20', [14]],
    [16, 'Implement User Authentication and Roles', 4, '2026-10-23', [15]],
    [17, 'Integrate All Modules', 5, '2026-10-27', [16]],
    [18, 'Data Validation and Error Handling', 3, '2026-10-27', [17]],
    [19, 'Unit Testing', 4, '2026-10-30', [18]],
    [20, 'Integration Testing', 4, '2026-11-03', [19]],
    [21, 'System Testing', 4, '2026-11-06', [20]],
    [22, 'User Acceptance Testing', 3, '2026-11-06', [21]],
    [23, 'Bug Tracking and System Refinement', 4, '2026-11-10', [22]],
    [24, 'Database Backup and Recovery', 3, '2026-11-13', [23]],
    [25, 'Deployment Preparation', 3, '2026-11-17', [24]],
    [26, 'Deploy the Inventory Management System', 3, '2026-11-17', [25]],
    [27, 'Develop the User Manual', 3, '2026-11-20', [26]],
    [28, 'Final System Demonstration', 2, '2026-11-24', [27]],
].map(([no, task, hours, due, pre]) => ({ no, task, hours, due, pre }));


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
const supplierName = (id) => byId(db.suppliers, id)?.name || '—';
const lowStock = () => db.products.filter((p) => p.qty <= p.reorder);
const recommendedQty = (p) => Math.max(p.reorder * 2 - p.qty, 1);
const openPO = (productId) => db.orders.find((o) => o.productId === productId && (o.status === 'Pending' || o.status === 'Ordered'));


const can = (action) => !!session && ROLES[session.role].can.includes(action);
const readOnlyNote = () => (can('stock') ? '' : '<p class="muted small">Your role is read-only.</p>');


const ui = {
    products: { q: '', cat: '', st: '', page: 0 },
    history: { q: '', type: '', from: '' },
    orders: { st: '' },
};


function dashboardView() {
    const units = db.products.reduce((s, p) => s + p.qty, 0);
    const value = db.products.reduce((s, p) => s + p.qty * p.price, 0);
    const low = lowStock();
    const pending = db.orders.filter((o) => o.status === 'Pending' || o.status === 'Ordered').length;
    const cats = {};
    db.products.forEach((p) => { cats[p.category] = (cats[p.category] || 0) + p.qty; });
    const max = Math.max(1, ...Object.values(cats));
    const recent = [...db.transactions].reverse().slice(0, 6);
    return `
    <div class="stats">
      <div class="stat"><div class="label">Products</div><div class="value">${db.products.length}</div></div>
      <div class="stat"><div class="label">Units on hand</div><div class="value">${units.toLocaleString()}</div></div>
      <div class="stat"><div class="label">Inventory value</div><div class="value">${money(value)}</div></div>
      <div class="stat ${low.length ? 'alert' : ''}"><div class="label">Need reorder</div><div class="value">${low.length}</div></div>
      <div class="stat"><div class="label">Open purchase orders</div><div class="value">${pending}</div></div>
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
        <div class="card-head"><h3>Low stock alerts</h3><a href="#reorder">View reorder list</a></div>
        ${low.length ? `<ul class="list-plain">${low.slice(0, 6).map((p) => `<li><span>${esc(p.name)}</span><span>${p.qty} / ${p.reorder} ${stockBadge(p)}</span></li>`).join('')}</ul>` : '<p class="muted">All products are above their reorder level.</p>'}
      </div>
    </div>
    <div class="card">
      <div class="card-head"><h3>Recent transactions</h3><a href="#history">Full history</a></div>
      ${txTable(recent)}
    </div>`;
}

function txTable(rows) {
    if (!rows.length) return '<p class="empty">No transactions found.</p>';
    return `<div class="table-wrap"><table>
    <thead><tr><th>Date</th><th>Product</th><th>Type</th><th class="right">Qty</th><th class="right">Balance</th><th>Reference / note</th><th>By</th></tr></thead>
    <tbody>${rows.map((t) => `<tr>
      <td class="num">${esc(fmtDT(t.date))}</td>
      <td>${esc(t.name)} <span class="muted small">${esc(t.sku)}</span></td>
      <td><span class="badge ${t.type === 'in' ? 'ok' : 'info'}">${t.type === 'in' ? 'Stock in' : 'Stock out'}</span></td>
      <td class="right num">${t.type === 'in' ? '+' : '−'}${t.qty}</td>
      <td class="right num">${t.balance}</td>
      <td>${esc([t.ref, t.note].filter(Boolean).join(' · '))}</td>
      <td>${esc(t.user)}</td></tr>`).join('')}</tbody></table></div>`;
}

/* Products (WBS 2–4) */
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

/* Suppliers (WBS 5–6) */
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

/* Stock in / out (WBS 7–9) */
function stockView() {
    if (!can('stock')) return `<div class="card"><p class="muted">Your role is read-only, so stock movements are disabled. Ask an administrator for staff access.</p></div>`;
    const opts = [{ v: '', t: 'Select a product…' }, ...db.products.map((p) => ({ v: p.id, t: `${p.name} (${p.qty} on hand)` }))];
    return `
    <div class="grid two">
      <form class="card" data-form="stockin">
        <h3>Stock in / receiving</h3>
        ${field('Product', 'productId', { options: opts, required: true })}
        ${field('Quantity received', 'qty', { type: 'number', required: true, attrs: 'min="1" step="1"' })}
        ${field('Delivery / reference no.', 'ref', { hint: 'e.g. delivery receipt or invoice number', required: true })}
        ${field('Notes', 'note')}
        <p class="form-err" role="alert"></p>
        <button class="btn primary" type="submit">Record stock in</button>
      </form>
      <form class="card" data-form="stockout">
        <h3>Stock out / issuing</h3>
        ${field('Product', 'productId', { options: opts, required: true })}
        ${field('Quantity issued', 'qty', { type: 'number', required: true, attrs: 'min="1" step="1"' })}
        ${field('Reason', 'reason', { options: ['Sale', 'Internal use', 'Damaged / expired', 'Transfer', 'Other'].map((v) => ({ v, t: v })) })}
        ${field('Notes', 'note')}
        <p class="form-err" role="alert"></p>
        <button class="btn primary" type="submit">Record stock out</button>
      </form>
    </div>
    <div class="card"><h3>Latest movements</h3>${txTable([...db.transactions].reverse().slice(0, 8))}</div>`;
}

/* History (WBS 10) */
function filteredTx() {
    const { q, type, from } = ui.history;
    const needle = q.trim().toLowerCase();
    return [...db.transactions].reverse().filter((t) =>
        (!type || t.type === type) && (!from || t.date.slice(0, 10) >= from) &&
        (!needle || [t.name, t.sku, t.ref, t.note, t.user].join(' ').toLowerCase().includes(needle)));
}
function historyView() {
    const f = ui.history;
    return `
    <div class="card">
      <div class="toolbar">
        <input class="grow" type="search" placeholder="Search product, SKU, reference, user…" value="${esc(f.q)}" data-filter="history.q" aria-label="Search history">
        <select data-filter="history.type" aria-label="Type"><option value="">All types</option><option value="in" ${f.type === 'in' ? 'selected' : ''}>Stock in</option><option value="out" ${f.type === 'out' ? 'selected' : ''}>Stock out</option></select>
        <label class="small muted">From <input type="date" value="${esc(f.from)}" data-filter="history.from"></label>
        <button class="btn" data-act="export-history">Export CSV</button>
      </div>
      <div id="tbl">${txTable(filteredTx())}</div>
    </div>`;
}

/* Reorder monitoring and recommendation (WBS 11–12) */
function reorderView() {
    const low = lowStock().sort((a, b) => a.qty / (a.reorder || 1) - b.qty / (b.reorder || 1));
    return `
    <div class="card">
      <div class="card-head"><h3>Products at or below reorder level</h3>
        ${can('po') && low.some((p) => !openPO(p.id) && p.supplierId) ? '<button class="btn primary" data-act="po-all">Create orders for all</button>' : ''}</div>
      <p class="muted small">Recommended quantity restocks each item up to twice its reorder level.</p>
      ${low.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Product</th><th>Supplier</th><th class="right">On hand</th><th class="right">Reorder at</th><th class="right">Recommended order</th><th>Status</th><th></th></tr></thead>
        <tbody>${low.map((p) => {
        const o = openPO(p.id);
        return `<tr><td><strong>${esc(p.name)}</strong></td><td>${esc(supplierName(p.supplierId))}</td><td class="right num">${p.qty}</td><td class="right num">${p.reorder}</td>
            <td class="right num"><strong>${recommendedQty(p)}</strong></td><td>${stockBadge(p)}</td>
            <td class="actions">${o ? `<span class="badge info">${esc(o.id)} ${esc(o.status)}</span>` : can('po') ? `<button class="btn sm primary" data-act="po-create" data-id="${p.id}">Create order</button>` : ''}</td></tr>`;
    }).join('')}</tbody></table></div>` : '<p class="empty">Nothing to reorder. Every product is above its reorder level.</p>'}
    </div>`;
}

/* Purchase / restocking workflow (WBS 13) */
function createPO(productId) {
    const p = byId(db.products, productId);
    if (!p) return 'Product not found.';
    if (!p.supplierId) return `${p.name} has no supplier. Assign one first.`;
    if (openPO(productId)) return `${p.name} already has an open order.`;
    db.orders.push({ id: nextId('o', 'PO-', 4), date: nowISO(), productId, name: p.name, supplierId: p.supplierId, qty: recommendedQty(p), status: 'Pending' });
    saveDB();
    return null;
}
const ORDER_STATUS_CLASS = { Pending: 'low', Ordered: 'info', Received: 'ok', Cancelled: 'neutral' };
function ordersTable() {
    const rows = [...db.orders].reverse().filter((o) => !ui.orders.st || o.status === ui.orders.st);
    if (!rows.length) return '<p class="empty">No purchase orders yet. Create them from the Reorder page.</p>';
    return `<div class="table-wrap"><table>
    <thead><tr><th>Order</th><th>Date</th><th>Product</th><th>Supplier</th><th class="right">Qty</th><th>Status</th><th></th></tr></thead>
    <tbody>${rows.map((o) => `<tr>
      <td><strong>${esc(o.id)}</strong></td><td>${esc(fmtDT(o.date))}</td><td>${esc(o.name)}</td><td>${esc(supplierName(o.supplierId))}</td>
      <td class="right num">${o.qty}</td><td><span class="badge ${ORDER_STATUS_CLASS[o.status]}">${o.status}</span></td>
      <td class="actions">${can('po') ? [
            o.status === 'Pending' ? `<button class="btn sm" data-act="po-order" data-id="${o.id}">Mark ordered</button>` : '',
            o.status === 'Ordered' ? `<button class="btn sm primary" data-act="po-receive" data-id="${o.id}">Receive stock</button>` : '',
            o.status === 'Pending' || o.status === 'Ordered' ? `<button class="btn sm danger" data-act="po-cancel" data-id="${o.id}">Cancel</button>` : '',
        ].join('') : ''}</td></tr>`).join('')}</tbody></table></div>`;
}
function ordersView() {
    return `<div class="card">
    <div class="toolbar"><select data-filter="orders.st" aria-label="Order status"><option value="">All statuses</option>${['Pending', 'Ordered', 'Received', 'Cancelled'].map((s) => `<option ${ui.orders.st === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
      <span class="muted small">Workflow: Pending → Ordered → Received (receiving adds the stock automatically)</span></div>
    <div id="tbl">${ordersTable()}</div></div>`;
}

/* Reports (WBS 14) */
function valuationRows() {
    const cats = {};
    db.products.forEach((p) => {
        const c = (cats[p.category] ||= { products: 0, units: 0, value: 0 });
        c.products++; c.units += p.qty; c.value += p.qty * p.price;
    });
    return Object.entries(cats).sort((a, b) => b[1].value - a[1].value);
}
function movementRows() {
    return db.products.map((p) => {
        const tx = db.transactions.filter((t) => t.productId === p.id);
        const inn = tx.filter((t) => t.type === 'in').reduce((s, t) => s + t.qty, 0);
        const out = tx.filter((t) => t.type === 'out').reduce((s, t) => s + t.qty, 0);
        return { p, inn, out };
    });
}
function reportsView() {
    const val = valuationRows();
    const tot = val.reduce((s, [, c]) => ({ products: s.products + c.products, units: s.units + c.units, value: s.value + c.value }), { products: 0, units: 0, value: 0 });
    const low = lowStock();
    return `
    <div class="toolbar no-print"><button class="btn" data-act="export-valuation">Export valuation CSV</button><button class="btn" data-act="export-movement">Export movement CSV</button><button class="btn" data-act="print">Print report</button></div>
    <div class="card"><h3>Inventory valuation by category</h3>
      <div class="table-wrap"><table><thead><tr><th>Category</th><th class="right">Products</th><th class="right">Units</th><th class="right">Value</th></tr></thead>
      <tbody>${val.map(([c, v]) => `<tr><td>${esc(c)}</td><td class="right num">${v.products}</td><td class="right num">${v.units}</td><td class="right num">${money(v.value)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td>Total</td><td class="right num">${tot.products}</td><td class="right num">${tot.units}</td><td class="right num">${money(tot.value)}</td></tr></tfoot></table></div></div>
    <div class="card"><h3>Low and out-of-stock items</h3>
      ${low.length ? `<div class="table-wrap"><table><thead><tr><th>Product</th><th class="right">On hand</th><th class="right">Reorder at</th><th>Status</th></tr></thead><tbody>${low.map((p) => `<tr><td>${esc(p.name)}</td><td class="right num">${p.qty}</td><td class="right num">${p.reorder}</td><td>${stockBadge(p)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">None.</p>'}</div>
    <div class="card"><h3>Stock movement summary</h3>
      <div class="table-wrap"><table><thead><tr><th>Product</th><th class="right">Total in</th><th class="right">Total out</th><th class="right">Net</th><th class="right">Current</th></tr></thead>
      <tbody>${movementRows().map(({ p, inn, out }) => `<tr><td>${esc(p.name)}</td><td class="right num">${inn}</td><td class="right num">${out}</td><td class="right num">${inn - out}</td><td class="right num">${p.qty}</td></tr>`).join('')}</tbody></table></div></div>`;
}


function wbsStatus(t) {
    if (db.wbsDone[t.no]) return { label: 'Done', cls: 'ok' };
    const blockers = t.pre.filter((n) => !db.wbsDone[n]);
    if (t.due < todayISO()) return { label: 'Past due', cls: 'out' };
    if (blockers.length) return { label: 'Waiting on #' + blockers.join(', #'), cls: 'neutral' };
    return { label: 'Ready', cls: 'info' };
}
function projectView() {
    const done = WBS.filter((t) => db.wbsDone[t.no]);
    const hoursDone = done.reduce((s, t) => s + t.hours, 0);
    const hoursAll = WBS.reduce((s, t) => s + t.hours, 0);
    const pct = Math.round((hoursDone / hoursAll) * 100);
    return `
    <div class="card">
      <h3>Project progress</h3>
      <div class="progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><div style="width:${pct}%"></div></div>
      <div class="progress-meta"><span>${done.length} of ${WBS.length} tasks done</span><span>${hoursDone} of ${hoursAll} hours · ${pct}%</span></div>
    </div>
    <div class="card">
      <div class="card-head"><h3>Work breakdown structure</h3><span class="muted small">${can('wbs') ? 'Tick a task when it is finished' : 'Read-only for your role'}</span></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Done</th><th>No.</th><th>Task / activity</th><th class="right">Hours</th><th>Due</th><th>Precedence</th><th>Status</th></tr></thead>
        <tbody>${WBS.map((t) => {
        const s = wbsStatus(t); return `<tr>
          <td><input type="checkbox" data-act="wbs-toggle" data-no="${t.no}" ${db.wbsDone[t.no] ? 'checked' : ''} ${can('wbs') ? '' : 'disabled'} aria-label="Task ${t.no} done"></td>
          <td class="num">${t.no}</td><td>${esc(t.task)}</td><td class="right num">${t.hours}</td><td class="num">${fmtDate(t.due)}</td>
          <td>${t.pre.length ? t.pre.join(', ') : 'None'}</td><td><span class="badge ${s.cls}">${esc(s.label)}</span></td></tr>`;
    }).join('')}</tbody>
        <tfoot><tr><td></td><td></td><td>Total estimated duration</td><td class="right num">${hoursAll}</td><td colspan="3"></td></tr></tfoot>
      </table></div>
    </div>`;
}

/* Admin: users, backup and recovery (WBS 16, 24) */
function adminView() {
    return `
    <div class="card"><h3>Backup and recovery</h3>
      <p class="muted">Last backup: ${db.meta.lastBackup ? esc(fmtDT(db.meta.lastBackup)) : 'never'}</p>
      <div class="toolbar">
        <button class="btn primary" data-act="backup">Download backup (JSON)</button>
        <label class="btn" for="restoreFile">Restore from file…</label>
        <input id="restoreFile" type="file" accept="application/json,.json" hidden>
        <button class="btn danger" data-act="reset">Reset to sample data</button>
      </div>
      <p class="muted small">Data lives in this browser only. Download a backup before clearing browser data.</p>
    </div>
    <div class="card"><h3>User accounts and roles</h3>
      <div class="table-wrap"><table><thead><tr><th>Username</th><th>Name</th><th>Role</th><th>Can do</th></tr></thead>
      <tbody>${USERS.map((u) => `<tr><td>${esc(u.username)}</td><td>${esc(u.name)}</td><td><span class="badge info">${esc(ROLES[u.role].label)}</span></td>
        <td class="small">${u.role === 'admin' ? 'Everything, including delete, backup and restore' : u.role === 'staff' ? 'Manage products, suppliers, stock and orders' : 'View only'}</td></tr>`).join('')}</tbody></table></div>
    </div>`;
}


const NAV = [
    { id: 'dashboard', label: 'Dashboard', title: 'Dashboard', render: dashboardView },
    { id: 'products', label: 'Products', title: 'Products', render: productsView, table: productsTable },
    { id: 'suppliers', label: 'Suppliers', title: 'Suppliers', render: suppliersView },
    { id: 'stock', label: 'Stock in / out', title: 'Stock in / out', render: stockView },
    { id: 'history', label: 'Transaction history', title: 'Transaction history', render: historyView, table: () => txTable(filteredTx()) },
    { id: 'reorder', label: 'Reorder', title: 'Reorder recommendations', render: reorderView },
    { id: 'orders', label: 'Purchase orders', title: 'Purchase orders', render: ordersView, table: ordersTable },
    { id: 'reports', label: 'Reports', title: 'Inventory reports', render: reportsView },
    { id: 'project', label: 'Project (WBS)', title: 'Project work breakdown', render: projectView },
    { id: 'admin', label: 'Backup & users', title: 'Backup, recovery and users', render: adminView, perm: 'admin' },
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
    stockin(d, form) {
        const qty = intOf(d.qty);
        if (!d.productId) return 'Select a product.';
        if (Number.isNaN(qty) || qty <= 0) return 'Quantity must be a whole number greater than zero.';
        if (!d.ref.trim()) return 'Enter a delivery or reference number.';
        if (qty > 100000) return 'That quantity looks too large. Check the number.';
        const err = applyTx(d.productId, 'in', qty, d.note.trim(), d.ref.trim());
        if (!err) { toast('Stock received'); render(); }
        return err;
    },
    stockout(d) {
        const qty = intOf(d.qty);
        if (!d.productId) return 'Select a product.';
        if (Number.isNaN(qty) || qty <= 0) return 'Quantity must be a whole number greater than zero.';
        const err = applyTx(d.productId, 'out', qty, [d.reason, d.note.trim()].filter(Boolean).join(' – '), '');
        if (!err) { toast('Stock issued'); render(); }
        return err;
    },
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
    'po-create'(el) { const err = createPO(el.dataset.id); toast(err || 'Purchase order created'); render(); },
    'po-all'() {
        let n = 0;
        lowStock().forEach((p) => { if (p.supplierId && !openPO(p.id) && !createPO(p.id)) n++; });
        toast(n ? `${n} purchase order${n > 1 ? 's' : ''} created` : 'No new orders needed'); render();
    },
    'po-order'(el) { const o = byId(db.orders, el.dataset.id); if (o) { o.status = 'Ordered'; saveDB(); toast(o.id + ' marked as ordered'); render(); } },
    'po-cancel'(el) { const o = byId(db.orders, el.dataset.id); if (o && confirm(`Cancel ${o.id}?`)) { o.status = 'Cancelled'; saveDB(); toast(o.id + ' cancelled'); render(); } },
    'po-receive'(el) {
        const o = byId(db.orders, el.dataset.id);
        if (!o) return;
        const err = applyTx(o.productId, 'in', o.qty, 'Received from ' + supplierName(o.supplierId), o.id);
        if (err) return toast(err);
        o.status = 'Received'; saveDB(); toast(`${o.id} received, stock updated`); render();
    },
    'wbs-toggle'(el) {
        if (!can('wbs')) return;
        const no = Number(el.dataset.no);
        if (el.checked) db.wbsDone[no] = true; else delete db.wbsDone[no];
        saveDB(); render();
    },
    'export-history'() {
        download('transactions.csv', toCSV([['Date', 'SKU', 'Product', 'Type', 'Qty', 'Balance', 'Reference', 'Note', 'User'],
        ...filteredTx().map((t) => [t.date, t.sku, t.name, t.type, t.qty, t.balance, t.ref, t.note, t.user])]), 'text/csv');
    },
    'export-valuation'() {
        download('inventory-valuation.csv', toCSV([['SKU', 'Product', 'Category', 'Qty', 'Unit price', 'Value'],
        ...db.products.map((p) => [p.sku, p.name, p.category, p.qty, p.price, (p.qty * p.price).toFixed(2)])]), 'text/csv');
    },
    'export-movement'() {
        download('stock-movement.csv', toCSV([['SKU', 'Product', 'Total in', 'Total out', 'Current'],
        ...movementRows().map(({ p, inn, out }) => [p.sku, p.name, inn, out, p.qty])]), 'text/csv');
    },
    print() { window.print(); },
    backup() {
        db.meta.lastBackup = nowISO(); saveDB();
        download(`ims-backup-${todayISO()}.json`, JSON.stringify(db, null, 2), 'application/json');
        toast('Backup downloaded'); render();
    },
    reset() { if (confirm('Replace all data with the sample data? This cannot be undone.')) { db = seed(); saveDB(); toast('Sample data restored'); render(); } },
};

document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (el && actions[el.dataset.act] && el.type !== 'checkbox') actions[el.dataset.act](el);
});
document.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset.act === 'wbs-toggle') actions['wbs-toggle'](el);
    if (el.id === 'restoreFile' && el.files[0]) restoreBackup(el.files[0]);
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

function restoreBackup(file) {
    const r = new FileReader();
    r.onload = () => {
        try {
            const d = JSON.parse(r.result);
            if (!Array.isArray(d.products) || !Array.isArray(d.suppliers) || !Array.isArray(d.transactions)) throw new Error('bad');
            if (!confirm('Replace current data with this backup?')) return;
            db = { orders: [], wbsDone: {}, seq: {}, meta: { lastBackup: null }, ...d };
            saveDB(); toast('Backup restored'); render();
        } catch (err) { toast('That file is not a valid backup'); }
    };
    r.readAsText(file);
}

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
