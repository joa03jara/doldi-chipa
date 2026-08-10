/* ================= ICONOS ================= */
const ICONS = {
  chipa: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="13" r="7.2"/><circle cx="9" cy="11" r="0.5" fill="currentColor" stroke="none"/><circle cx="14.5" cy="10.5" r="0.5" fill="currentColor" stroke="none"/><circle cx="12" cy="15.5" r="0.5" fill="currentColor" stroke="none"/><circle cx="15.5" cy="14" r="0.5" fill="currentColor" stroke="none"/><circle cx="8.5" cy="15" r="0.5" fill="currentColor" stroke="none"/></svg>',
  factura: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 15.5c1-6.5 5.5-10.5 10-10.5 4 0 6.5 2 6.5 4.7 0 2-1.8 3.3-4 3.3-1 3-4 5-7.5 5-2.3 0-5-.8-5-2.5z"/><path d="M9 8.5l1 3.2M13 7l1.2 3.3M16.5 8.5l1 2.6"/></svg>',
  sandwich: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 11.5L12 4.5l8.5 7"/><path d="M4 11.5v3.2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3.2"/><path d="M3.5 11.5h17"/><path d="M7 16.7l1-2M12 16.7v-2M17 16.7l-1-2"/></svg>',
  remis: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5 11.5l1.3-4A2 2 0 0 1 8.2 6.2h7.6a2 2 0 0 1 1.9 1.3l1.3 4"/><rect x="2.7" y="11.5" width="18.6" height="5.2" rx="1.6"/><circle cx="7.3" cy="18.7" r="1.6"/><circle cx="16.7" cy="18.7" r="1.6"/></svg>',
};

function icon(name, size) {
  let svg = ICONS[name] || '';
  if (size) svg = svg.replace('width="18" height="18"', `width="${size}" height="${size}"`);
  return svg;
}

const PRODUCTS = {
  chipa: {
    label: 'Chipá',
    unit: 'docenas',
    opts: [{
        key: 'media',
        label: 'Media docena',
        qty: 0.5
      },
      {
        key: 'docena',
        label: 'Una docena',
        qty: 1
      },
      {
        key: 'docenaymedia',
        label: 'Docena y media',
        qty: 1.5
      },
    ]
  },
  factura: {
    label: 'Factura',
    unit: 'docenas',
    opts: [{
        key: 'media',
        label: 'Media docena',
        qty: 0.5
      },
      {
        key: 'docena',
        label: 'Una docena',
        qty: 1
      },
      {
        key: 'docenaymedia',
        label: 'Docena y media',
        qty: 1.5
      },
    ]
  },
  sandwich: {
    label: 'Sándwich de chipá',
    unit: 'unidades',
    opts: [{
        key: 'unidad',
        label: '1 unidad',
        qty: 1
      },
      {
        key: 'u5',
        label: '5 unidades',
        qty: 5
      },
      {
        key: 'u10',
        label: '10 unidades',
        qty: 10
      },
    ]
  }
};
const DEFAULT_STOCK = {
  chipa: 0,
  factura: 0,
  sandwich: 0
};
const DEFAULT_PRECIOS = {
  chipa: {
    media: 0,
    docena: 0,
    docenaymedia: 0
  },
  factura: {
    media: 0,
    docena: 0,
    docenaymedia: 0
  },
  sandwich: {
    unidad: 0
  },
  envio: {
    cerca: 0,
    lejos: 0
  }
};

let STATE = {
  stock: {
    ...DEFAULT_STOCK
  },
  precios: JSON.parse(JSON.stringify(DEFAULT_PRECIOS)),
  ventas: [],
  remis: []
};
let pendingSale = null; // {prod, optKey, qty}
let scannerStream = null;
let scannerLoopId = null;
let scannerMode = 'venta'; // venta | carga
let db = null;
let firebaseConnected = false;

/* ================= FIREBASE / NUBE ================= */
function getSavedFirebaseConfig() {
  try {
    return JSON.parse(localStorage.getItem('doldi_fb_config') || 'null');
  } catch (e) {
    return null;
  }
}

function updateConnStatus(ok) {
  const dot = document.getElementById('drawer-conn-dot');
  if (dot) dot.style.background = ok ? 'var(--green)' : 'var(--red)';
  const title = document.getElementById('config-status-title');
  const desc = document.getElementById('config-status-desc');
  if (title) title.textContent = ok ? '🟢 Conectado a la nube' : '🔴 No conectado a la nube';
  if (desc) desc.textContent = ok ?
    'Los datos se comparten en vivo con todos los celulares conectados.' :
    'Sin conectar, los datos NO se comparten entre celulares y se pierden al cerrar.';
}

function attachListeners() {
  if (!db) return;
  db.collection('doldichipa').doc('stock').onSnapshot(doc => {
    STATE.stock = doc.exists ? {
      ...DEFAULT_STOCK,
      ...doc.data()
    } : {
      ...DEFAULT_STOCK
    };
    renderVender();
    renderStock();
  }, () => {
    showToast('No se pudo leer el stock de la nube');
  });
  db.collection('doldichipa').doc('precios').onSnapshot(doc => {
    STATE.precios = doc.exists ? doc.data() : JSON.parse(JSON.stringify(DEFAULT_PRECIOS));
    renderVender();
    renderPrecios();
    renderStock();
  }, () => {
    showToast('No se pudieron leer los precios de la nube');
  });
  db.collection('doldichipa_ventas').orderBy('ts', 'desc').limit(1000).onSnapshot(snap => {
    STATE.ventas = snap.docs.map(d => ({
      id: d.id,
      ...d.data()
    }));
    renderVentas();
    renderStock();
    renderResumen();
  }, () => {
    showToast('No se pudo leer el historial de ventas');
  });
  db.collection('doldichipa_remis').orderBy('ts', 'desc').limit(1000).onSnapshot(snap => {
    STATE.remis = snap.docs.map(d => ({
      id: d.id,
      ...d.data()
    }));
    renderRemis();
    renderResumen();
  }, () => {
    showToast('No se pudo leer los movimientos de Remis');
  });
}

function initFirebase(cfg) {
  try {
    if (!firebase.apps || !firebase.apps.length) {
      firebase.initializeApp(cfg);
    }
    db = firebase.firestore();
    firebaseConnected = true;
    updateConnStatus(true);
    attachListeners();
  } catch (e) {
    firebaseConnected = false;
    db = null;
    updateConnStatus(false);
    showToast('No se pudo conectar. Revisá el texto pegado.');
  }
}

function conectarFirebase() {
  const raw = document.getElementById('config-input').value.trim();
  if (!raw) {
    showToast('Pegá primero la configuración de Firebase');
    return;
  }
  let cfg;
  try {
    cfg = new Function('return (' + raw + ')')();
  } catch (e) {
    showToast('No pude leer ese texto, revisá que copiaste todo el bloque');
    return;
  }
  if (!cfg || !cfg.apiKey || !cfg.projectId) {
    showToast('Falta apiKey o projectId en lo que pegaste');
    return;
  }
  localStorage.setItem('doldi_fb_config', JSON.stringify(cfg));
  initFirebase(cfg);
  showToast('Conectado a la nube ✓');
  irATab('stock');
}

/* ================= STORAGE (lee/escribe en la nube) ================= */
async function saveStock() {
  if (!db) {
    showToast('No está conectado a la nube (menú → Configuración)');
    return false;
  }
  try {
    await db.collection('doldichipa').doc('stock').set(STATE.stock);
    return true;
  } catch (e) {
    showToast('No se pudo guardar el stock, revisá tu conexión');
    return false;
  }
}
async function savePrecios() {
  if (!db) {
    showToast('No está conectado a la nube (menú → Configuración)');
    return false;
  }
  try {
    await db.collection('doldichipa').doc('precios').set(STATE.precios);
    return true;
  } catch (e) {
    showToast('No se pudieron guardar los precios');
    return false;
  }
}
async function addVenta(venta) {
  if (!db) {
    showToast('No está conectado a la nube (menú → Configuración)');
    return false;
  }
  try {
    await db.collection('doldichipa_ventas').add(venta);
    return true;
  } catch (e) {
    showToast('No se pudo guardar la venta');
    return false;
  }
}
async function addRemisMov(mov) {
  if (!db) {
    showToast('No está conectado a la nube (menú → Configuración)');
    return false;
  }
  try {
    await db.collection('doldichipa_remis').add(mov);
    return true;
  } catch (e) {
    showToast('No se pudo guardar el movimiento');
    return false;
  }
}

/* ================= UTIL ================= */
function fmtMoney(n) {
  n = Number(n) || 0;
  return '$' + n.toLocaleString('es-AR', {
    maximumFractionDigits: 0
  });
}

function formatMiles(el) {
  const digits = el.value.replace(/\D/g, '');
  el.value = digits ? Number(digits).toLocaleString('es-AR') : '';
}

function parseMiles(val) {
  return Number(String(val || '').replace(/\D/g, '')) || 0;
}

function fmtQty(prod, qty) {
  const unit = PRODUCTS[prod].unit;
  if (unit === 'docenas') {
    if (qty === 0.5) return 'media docena';
    if (qty === 1) return '1 docena';
    if (qty === 1.5) return 'docena y media';
    return qty + ' docenas';
  }
  return qty + ' unidad' + (qty === 1 ? '' : 'es');
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), 2600);
}

function cerrarModal(id) {
  document.getElementById(id).classList.remove('show');
}

function toggleAccordion(bodyId, group) {
  const body = document.getElementById(bodyId);
  const header = document.querySelector('.acc-header[data-target="' + bodyId + '"][data-group="' + group + '"]');
  const wasOpen = body.classList.contains('show');
  if (wasOpen) {
    body.classList.remove('show');
    header.classList.remove('open');
  } else {
    body.classList.add('show');
    header.classList.add('open');
  }
}

/* ================= DRAWER ================= */
function toggleDrawer() {
  document.getElementById('drawer').classList.add('show');
  document.getElementById('drawerOverlay').classList.add('show');
}

function closeDrawer() {
  document.getElementById('drawer').classList.remove('show');
  document.getElementById('drawerOverlay').classList.remove('show');
}

/* ================= TABS ================= */
function irATab(name) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  document.querySelectorAll('.drawer-item').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  closeDrawer();

  // Al entrar a la pestaña, refrescar con los datos realmente guardados
  // (descarta cualquier texto escrito pero no guardado).
  if (name === 'precios') renderPrecios();
  else if (name === 'stock') renderStock();
  else if (name === 'ventas') renderVentas();
  else if (name === 'remis') renderRemis();
  else if (name === 'resumen') renderResumen();
  else if (name === 'vender') renderVender();
}

/* ================= RENDER ================= */
function renderAll() {
  renderVender();
  renderStock();
  renderPrecios();
  renderVentas();
  renderRemis();
  renderResumen();
  renderQRs();
}

function renderVender() {
  // La pestaña Vender ya no muestra resumen de stock (se sacó a pedido).
}

function precioFor(prod, optKey) {
  const pr = STATE.precios[prod];
  if (!pr) return 0;
  if (optKey === 'media') return pr.media || 0;
  if (optKey === 'docena') return pr.docena || 0;
  if (optKey === 'docenaymedia') return pr.docenaymedia || 0;
  if (optKey === 'unidad') return pr.unidad || 0;
  if (optKey === 'u5') return (pr.unidad || 0) * 5;
  if (optKey === 'u10') return (pr.unidad || 0) * 10;
  return 0;
}

function renderStock() {
  const wrap = document.getElementById('stock-card');
  let html = '<h2>Disponible ahora</h2><p class="muted" style="margin-top:-6px;">Tocá un producto para corregir la cantidad.</p>';
  Object.keys(PRODUCTS).forEach(prod => {
    const p = PRODUCTS[prod];
    const val = STATE.stock[prod] || 0;
    const low = (p.unit === 'docenas' && val < 1) || (p.unit === 'unidades' && val < 3);
    html += `<div class="prod-row" style="cursor:pointer;" onclick="abrirEditarStock('${prod}')">
      <div class="prod-icon">${icon(prod)}</div>
      <div style="flex:1;"><div class="prod-name">${p.label}</div><div class="unit-tag">${p.unit}</div></div>
      <div class="stock-num ${low?'low':''}">${val}</div>
      <svg class="chev" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>
    </div>`;
  });
  wrap.innerHTML = html;

  const proy = document.getElementById('proyeccion');
  let total = 0;
  let rows = '';
  Object.keys(PRODUCTS).forEach(prod => {
    const p = PRODUCTS[prod];
    const val = STATE.stock[prod] || 0;
    let precioDocena;
    if (p.unit === 'docenas') {
      precioDocena = STATE.precios[prod].docena || 0;
    } else {
      precioDocena = STATE.precios[prod].unidad || 0;
    }
    const monto = val * precioDocena;
    total += monto;
    rows += `<div class="prod-row"><div class="prod-icon">${icon(prod)}</div><div style="flex:1;" class="prod-name">${p.label}</div><div class="stock-num">${fmtMoney(monto)}</div></div>`;
  });
  proy.innerHTML = rows + `<div class="prod-row"><div class="prod-name" style="flex:1;">Total proyectado</div><div class="stock-num" style="color:var(--orange-dark)">${fmtMoney(total)}</div></div>`;

  const totalVendidoReal = STATE.ventas.reduce((s, v) => s + v.monto, 0);
  document.getElementById('total-vendido-real').textContent = fmtMoney(totalVendidoReal);
}

function renderPrecios() {
  const pr = STATE.precios;
  document.getElementById('p-chipa-media').value = pr.chipa.media ? pr.chipa.media.toLocaleString('es-AR') : '';
  document.getElementById('p-chipa-docena').value = pr.chipa.docena ? pr.chipa.docena.toLocaleString('es-AR') : '';
  document.getElementById('p-chipa-docenaymedia').value = pr.chipa.docenaymedia ? pr.chipa.docenaymedia.toLocaleString('es-AR') : '';
  document.getElementById('p-factura-media').value = pr.factura.media ? pr.factura.media.toLocaleString('es-AR') : '';
  document.getElementById('p-factura-docena').value = pr.factura.docena ? pr.factura.docena.toLocaleString('es-AR') : '';
  document.getElementById('p-factura-docenaymedia').value = pr.factura.docenaymedia ? pr.factura.docenaymedia.toLocaleString('es-AR') : '';
  document.getElementById('p-sandwich-unidad').value = pr.sandwich.unidad ? pr.sandwich.unidad.toLocaleString('es-AR') : '';
  document.getElementById('p-envio-cerca').value = pr.envio.cerca ? pr.envio.cerca.toLocaleString('es-AR') : '';
  document.getElementById('p-envio-lejos').value = pr.envio.lejos ? pr.envio.lejos.toLocaleString('es-AR') : '';
}

async function guardarPrecios() {
  STATE.precios.chipa.media = parseMiles(document.getElementById('p-chipa-media').value);
  STATE.precios.chipa.docena = parseMiles(document.getElementById('p-chipa-docena').value);
  STATE.precios.chipa.docenaymedia = parseMiles(document.getElementById('p-chipa-docenaymedia').value);
  STATE.precios.factura.media = parseMiles(document.getElementById('p-factura-media').value);
  STATE.precios.factura.docena = parseMiles(document.getElementById('p-factura-docena').value);
  STATE.precios.factura.docenaymedia = parseMiles(document.getElementById('p-factura-docenaymedia').value);
  STATE.precios.sandwich.unidad = parseMiles(document.getElementById('p-sandwich-unidad').value);
  STATE.precios.envio.cerca = parseMiles(document.getElementById('p-envio-cerca').value);
  STATE.precios.envio.lejos = parseMiles(document.getElementById('p-envio-lejos').value);
  const ok = await savePrecios();
  if (ok) showToast('Precios guardados ✓');
  renderVender();
  renderStock();
}

let rangoVentas = 'hoy';

function cambiarRango(r) {
  rangoVentas = r;
  document.querySelectorAll('.segmented button').forEach(b => b.classList.toggle('active', b.dataset.range === r));
  renderVentas();
}

function renderVentas() {
  const now = Date.now();
  let list = STATE.ventas.slice().sort((a, b) => b.ts - a.ts);
  if (rangoVentas === 'hoy') {
    const startToday = new Date();
    startToday.setHours(0, 0, 0, 0);
    list = list.filter(v => v.ts >= startToday.getTime());
  } else if (rangoVentas === 'semana') {
    list = list.filter(v => v.ts >= now - 7 * 24 * 60 * 60 * 1000);
  }
  const total = list.reduce((s, v) => s + v.monto, 0);
  document.getElementById('ventas-total').textContent = fmtMoney(total);
  document.getElementById('ventas-count').textContent = list.length + (list.length === 1 ? ' venta' : ' ventas');

  // Resumen agregado por producto (suma de docenas/unidades, sin separar por media/docena/docena y media)
  const resumen = document.getElementById('ventas-resumen');
  let resumenHtml = '<h2>Total vendido por producto</h2>';
  Object.keys(PRODUCTS).forEach(prod => {
    const p = PRODUCTS[prod];
    const sumQty = list.filter(v => v.prod === prod).reduce((s, v) => s + (v.qty || 0), 0);
    const sumMonto = list.filter(v => v.prod === prod).reduce((s, v) => s + v.monto, 0);
    resumenHtml += `<div class="prod-row">
      <div class="prod-icon">${icon(prod)}</div>
      <div style="flex:1;">
        <div class="prod-name">${p.label}</div>
        ${sumQty>0 ? `<span class="qty-pill">${sumQty} ${p.unit}</span>` : ''}
      </div>
      <div class="stock-num">${fmtMoney(sumMonto)}</div>
    </div>`;
  });
  resumen.innerHTML = resumenHtml;

  const wrap = document.getElementById('ventas-list');
  const searchEl = document.getElementById('ventas-search');
  const term = searchEl ? searchEl.value.trim().toLowerCase() : '';
  let listFiltrada = list;
  if (term) {
    listFiltrada = list.filter(v => {
      const d = new Date(v.ts);
      const fecha1 = d.toLocaleDateString('es-AR', {
        day: '2-digit',
        month: '2-digit'
      });
      const fecha2 = d.toLocaleDateString('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
      const envioTxt = v.envio === 'cerca' ? 'envío cerca' : v.envio === 'lejos' ? 'envío lejos' : '';
      const texto = [
        PRODUCTS[v.prod].label,
        v.qtyLabel || '',
        envioTxt,
        fecha1, fecha2,
        String(v.monto),
        fmtMoney(v.monto)
      ].join(' ').toLowerCase();
      return texto.includes(term);
    });
  }
  if (listFiltrada.length === 0) {
    wrap.innerHTML = `<div class="empty">${term ? 'No se encontraron ventas para "'+searchEl.value+'".' : 'Todavía no hay ventas registradas en este período.'}</div>`;
    return;
  }
  wrap.innerHTML = listFiltrada.map(v => {
    const d = new Date(v.ts);
    const hora = d.toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit'
    }) + ' ' + d.toLocaleTimeString('es-AR', {
      hour: '2-digit',
      minute: '2-digit'
    });
    const envioTxt = v.envio === 'cerca' ? ' + envío cerca' : v.envio === 'lejos' ? ' + envío lejos' : '';
    return `<div class="venta-item">
      <div class="prod-icon" style="width:30px; height:30px; border-radius:8px;">${icon(v.prod,15)}</div>
      <div style="flex:1;"><div class="p">${PRODUCTS[v.prod].label}${envioTxt}</div><div class="t">${hora}</div></div>
      <div class="m">${fmtMoney(v.monto)}</div>
    </div>`;
  }).join('');
}

/* ================= FILTRO POR RANGO (compartido) ================= */
function filtrarPorRango(list, rango) {
  const now = Date.now();
  if (rango === 'hoy') {
    const startToday = new Date();
    startToday.setHours(0, 0, 0, 0);
    return list.filter(v => v.ts >= startToday.getTime());
  } else if (rango === 'semana') {
    return list.filter(v => v.ts >= now - 7 * 24 * 60 * 60 * 1000);
  }
  return list;
}

/* ================= REMIS ================= */
let rangoRemis = 'hoy';

function cambiarRangoRemis(r) {
  rangoRemis = r;
  document.querySelectorAll('#tab-remis .segmented button').forEach(b => b.classList.toggle('active', b.dataset.range === r));
  renderRemis();
}

function renderRemis() {
  const list = filtrarPorRango(STATE.remis.slice().sort((a, b) => b.ts - a.ts), rangoRemis);
  const ingresos = list.filter(m => m.tipo === 'ingreso').reduce((s, m) => s + m.monto, 0);
  const gastos = list.filter(m => m.tipo === 'gasto').reduce((s, m) => s + m.monto, 0);
  const neto = ingresos - gastos;
  document.getElementById('remis-neto').textContent = fmtMoney(neto);
  document.getElementById('remis-ingresos').textContent = fmtMoney(ingresos);
  document.getElementById('remis-gastos').textContent = fmtMoney(gastos);

  const wrap = document.getElementById('remis-list');
  if (list.length === 0) {
    wrap.innerHTML = '<div class="empty">Todavía no hay movimientos en este período.</div>';
    return;
  }
  wrap.innerHTML = list.map(m => {
    const d = new Date(m.ts);
    const hora = d.toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit'
    }) + ' ' + d.toLocaleTimeString('es-AR', {
      hour: '2-digit',
      minute: '2-digit'
    });
    const esIngreso = m.tipo === 'ingreso';
    const signo = esIngreso ? '+' : '−';
    const color = esIngreso ? 'var(--green)' : 'var(--red)';
    const label = m.concepto ? m.concepto : (esIngreso ? 'Ingreso' : 'Gasto');
    return `<div class="venta-item">
      <div><div class="p">${esIngreso?'🟢':'🔴'} ${label}</div><div class="t">${hora}</div></div>
      <div class="m" style="color:${color};">${signo} ${fmtMoney(m.monto)}</div>
    </div>`;
  }).join('');
}

let remisMovTipo = 'ingreso';

function abrirRemisMov(tipo) {
  remisMovTipo = tipo;
  document.getElementById('remis-mov-title').textContent = tipo === 'ingreso' ? 'Registrar ingreso' : 'Registrar gasto';
  document.getElementById('remis-mov-btn').className = 'btn btn-block ' + (tipo === 'ingreso' ? 'btn-green' : 'btn-rust');
  document.getElementById('remis-mov-monto').value = '';
  document.getElementById('remis-mov-concepto').value = '';
  document.getElementById('overlay-remis-mov').classList.add('show');
}
async function confirmarRemisMov() {
  const monto = parseMiles(document.getElementById('remis-mov-monto').value);
  if (!monto || monto <= 0) {
    showToast('Ingresá un monto válido');
    return;
  }
  const concepto = document.getElementById('remis-mov-concepto').value.trim();
  const ok = await addRemisMov({
    ts: Date.now(),
    tipo: remisMovTipo,
    monto,
    concepto
  });
  if (ok) {
    cerrarModal('overlay-remis-mov');
    showToast((remisMovTipo === 'ingreso' ? 'Ingreso' : 'Gasto') + ' registrado ✓');
  }
}

/* ================= RESUMEN GENERAL ================= */
let rangoResumen = 'hoy';

function cambiarRangoResumen(r) {
  rangoResumen = r;
  document.querySelectorAll('#tab-resumen .segmented button').forEach(b => b.classList.toggle('active', b.dataset.range === r));
  renderResumen();
}

function renderResumen() {
  const ventasList = filtrarPorRango(STATE.ventas, rangoResumen);
  const totalChipa = ventasList.reduce((s, v) => s + v.monto, 0);
  const remisList = filtrarPorRango(STATE.remis, rangoResumen);
  const ingresos = remisList.filter(m => m.tipo === 'ingreso').reduce((s, m) => s + m.monto, 0);
  const gastos = remisList.filter(m => m.tipo === 'gasto').reduce((s, m) => s + m.monto, 0);
  const netoRemis = ingresos - gastos;
  const total = totalChipa + netoRemis;
  document.getElementById('resumen-total').textContent = fmtMoney(total);
  document.getElementById('resumen-chipa').textContent = fmtMoney(totalChipa);
  document.getElementById('resumen-remis').textContent = fmtMoney(netoRemis);
}

function renderQRs() {
  const specs = [
    ['qr-venta-chipa', 'DOLDI:VENTA:CHIPA'],
    ['qr-venta-factura', 'DOLDI:VENTA:FACTURA'],
    ['qr-venta-sandwich', 'DOLDI:VENTA:SANDWICH'],
  ];
  specs.forEach(([id, data]) => {
    const el = document.getElementById(id);
    if (!el || el.dataset.rendered) return;
    el.innerHTML = '';
    new QRCode(el, {
      text: data,
      width: 150,
      height: 150,
      colorDark: '#2a2118',
      colorLight: '#ffffff'
    });
    el.dataset.rendered = '1';
  });
}

function getQRDataUrl(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return null;
  const canvas = el.querySelector('canvas');
  if (canvas) return canvas.toDataURL('image/png');
  const img = el.querySelector('img');
  if (img && img.src) return img.src;
  return null;
}

function descargarQR(containerId, filename) {
  const dataUrl = getQRDataUrl(containerId);
  if (!dataUrl) {
    showToast('No se pudo generar ese QR para descargar');
    return;
  }
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename + '.png';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/* ================= VENTA FLOW ================= */
let envioSeleccionado = null; // null | 'cerca' | 'lejos'

function iniciarVenta(prod, optKey) {
  const opt = PRODUCTS[prod].opts.find(o => o.key === optKey);
  const stockVal = STATE.stock[prod] || 0;
  if (stockVal < opt.qty) {
    showToast('No hay suficiente stock de ' + PRODUCTS[prod].label);
    return;
  }
  pendingSale = {
    prod,
    optKey,
    qty: opt.qty,
    label: opt.label,
    monto: precioFor(prod, optKey)
  };
  const body = document.getElementById('confirm-body');
  body.innerHTML = `
    <div class="prod-row"><div class="prod-icon">${icon(prod)}</div><div class="prod-name" style="flex:1;">${PRODUCTS[prod].label}</div><div class="unit-tag">${opt.label}</div></div>
    <div class="prod-row"><div class="prod-name">Precio</div><div class="stock-num">${fmtMoney(pendingSale.monto)}</div></div>
    <div class="prod-row"><div class="prod-name">Stock luego</div><div class="unit-tag">${(stockVal-opt.qty)} ${PRODUCTS[prod].unit}</div></div>
  `;
  envioSeleccionado = null;
  renderEnvioOpts();
  document.getElementById('overlay-confirm').classList.add('show');
}

function renderEnvioOpts() {
  const wrap = document.getElementById('confirm-envio-opts');
  const opts = [{
      key: null,
      label: 'Sin envío',
      precio: 0
    },
    {
      key: 'cerca',
      label: 'Envío cerca',
      precio: STATE.precios.envio.cerca || 0
    },
    {
      key: 'lejos',
      label: 'Envío lejos',
      precio: STATE.precios.envio.lejos || 0
    },
  ];
  wrap.innerHTML = opts.map(o => {
    const active = envioSeleccionado === o.key;
    return `<div class="qty-btn" style="${active?'background:var(--orange-soft); border-color:var(--orange);':''}" onclick="seleccionarEnvio(${o.key?`'${o.key}'`:'null'})">${o.label}${o.precio? `<span class="p">${fmtMoney(o.precio)}</span>`:''}</div>`;
  }).join('');
}

function seleccionarEnvio(key) {
  envioSeleccionado = key;
  renderEnvioOpts();
}

async function confirmarVenta() {
  if (!pendingSale) return;
  if (!db) {
    showToast('No está conectado a la nube (menú → Configuración)');
    return;
  }
  const envioMonto = envioSeleccionado ? (STATE.precios.envio[envioSeleccionado] || 0) : 0;
  STATE.stock[pendingSale.prod] = Math.max(0, (STATE.stock[pendingSale.prod] || 0) - pendingSale.qty);
  const okStock = await saveStock();
  const okVenta = await addVenta({
    ts: Date.now(),
    prod: pendingSale.prod,
    optKey: pendingSale.optKey,
    qty: pendingSale.qty,
    qtyLabel: pendingSale.label,
    monto: pendingSale.monto + envioMonto,
    envio: envioSeleccionado
  });
  if (okStock && okVenta) {
    cerrarModal('overlay-confirm');
    showToast('Venta registrada · ' + fmtMoney(pendingSale.monto + envioMonto));
    pendingSale = null;
    envioSeleccionado = null;
  }
  renderVender();
  renderStock();
  renderVentas();
}

/* ================= CARGA FLOW ================= */
async function cargarBolsa(prod) {
  STATE.stock[prod] = (STATE.stock[prod] || 0) + 18;
  const ok = await saveStock();
  if (ok) showToast('+ 18 docenas de ' + PRODUCTS[prod].label + ' cargadas ✓');
  renderStock();
  renderVender();
}

let cargaManualProd = null;

function cargaManual(prod) {
  cargaManualProd = prod;
  const p = PRODUCTS[prod];
  document.getElementById('carga-manual-title').textContent = 'Cargar ' + p.label;
  document.getElementById('carga-manual-label').textContent = 'Cantidad (' + p.unit + ')';
  document.getElementById('carga-manual-input').value = '';
  document.getElementById('carga-manual-input').step = p.unit === 'docenas' ? '0.5' : '1';
  document.getElementById('overlay-carga-manual').classList.add('show');
}
async function confirmarCargaManual() {
  const val = Number(document.getElementById('carga-manual-input').value);
  if (!val || val <= 0) {
    showToast('Ingresá una cantidad válida');
    return;
  }
  STATE.stock[cargaManualProd] = (STATE.stock[cargaManualProd] || 0) + val;
  const ok = await saveStock();
  if (ok) {
    cerrarModal('overlay-carga-manual');
    showToast('Stock actualizado ✓');
  }
  renderStock();
  renderVender();
}

/* ================= CARGA BOLSA MANUAL (sin sticker QR) ================= */
let bolsaManualProd = null;

function abrirCargaBolsaManual() {
  bolsaManualProd = null;
  document.getElementById('bolsa-manual-input').value = 1;
  actualizarSeleccionBolsa();
  actualizarPreviewBolsa();
  document.getElementById('overlay-carga-bolsa-manual').classList.add('show');
}

function seleccionarProductoBolsa(prod) {
  bolsaManualProd = prod;
  actualizarSeleccionBolsa();
}

function actualizarSeleccionBolsa() {
  document.getElementById('bolsa-manual-chipa').style.background = bolsaManualProd === 'chipa' ? 'var(--orange-soft)' : '';
  document.getElementById('bolsa-manual-factura').style.background = bolsaManualProd === 'factura' ? 'var(--orange-soft)' : '';
}

function actualizarPreviewBolsa() {
  const bolsas = Number(document.getElementById('bolsa-manual-input').value) || 0;
  document.getElementById('bolsa-manual-preview').textContent = '= ' + (bolsas * 18) + ' docenas';
}
async function confirmarCargaBolsaManual() {
  if (!bolsaManualProd) {
    showToast('Elegí primero el producto: chipá o factura');
    return;
  }
  const bolsas = Number(document.getElementById('bolsa-manual-input').value);
  if (!bolsas || bolsas <= 0) {
    showToast('Ingresá una cantidad válida');
    return;
  }
  const docenas = bolsas * 18;
  STATE.stock[bolsaManualProd] = (STATE.stock[bolsaManualProd] || 0) + docenas;
  const ok = await saveStock();
  if (ok) {
    cerrarModal('overlay-carga-bolsa-manual');
    showToast('+ ' + docenas + ' docenas de ' + PRODUCTS[bolsaManualProd].label + ' cargadas ✓');
  }
  renderStock();
  renderVender();
}

/* ================= EDITAR / BORRAR STOCK ================= */
let editarStockProd = null;

function abrirEditarStock(prod) {
  editarStockProd = prod;
  const p = PRODUCTS[prod];
  document.getElementById('editar-stock-title').textContent = 'Editar stock: ' + p.label;
  document.getElementById('editar-stock-label').textContent = 'Cantidad (' + p.unit + ')';
  document.getElementById('editar-stock-input').step = p.unit === 'docenas' ? '0.5' : '1';
  document.getElementById('editar-stock-input').value = STATE.stock[prod] || 0;
  document.getElementById('overlay-editar-stock').classList.add('show');
}
async function confirmarEditarStock() {
  const val = Number(document.getElementById('editar-stock-input').value);
  if (val === null || val === undefined || isNaN(val) || val < 0) {
    showToast('Ingresá una cantidad válida');
    return;
  }
  STATE.stock[editarStockProd] = val;
  const ok = await saveStock();
  if (ok) {
    cerrarModal('overlay-editar-stock');
    showToast('Stock de ' + PRODUCTS[editarStockProd].label + ' actualizado ✓');
  }
  renderStock();
  renderVender();
}
async function vaciarStock() {
  STATE.stock[editarStockProd] = 0;
  const ok = await saveStock();
  if (ok) {
    cerrarModal('overlay-editar-stock');
    showToast('Stock de ' + PRODUCTS[editarStockProd].label + ' vaciado ✓');
  }
  renderStock();
  renderVender();
}

/* ================= REINICIAR SISTEMA ================= */
function abrirReiniciarSistema() {
  closeDrawer();
  document.getElementById('overlay-reset').classList.add('show');
}
async function borrarColeccion(nombre) {
  let snap = await db.collection(nombre).get();
  let docs = snap.docs;
  while (docs.length) {
    const chunk = docs.splice(0, 400);
    const batch = db.batch();
    chunk.forEach(d => batch.delete(d.ref));
    await batch.commit();
  }
}
async function confirmarReinicio() {
  if (!db) {
    showToast('Primero conectá la nube (menú → Configuración)');
    return;
  }
  try {
    await db.collection('doldichipa').doc('stock').set({
      ...DEFAULT_STOCK
    });
    await borrarColeccion('doldichipa_ventas');
    await borrarColeccion('doldichipa_remis');
    cerrarModal('overlay-reset');
    showToast('Sistema reiniciado ✓ Todo en cero');
    irATab('stock');
  } catch (e) {
    showToast('No se pudo reiniciar, revisá la conexión');
  }
}

/* ================= SCANNER ================= */
function abrirScanner(modeArg) {
  let scanMode = modeArg;
  if (scanMode !== 'venta' && scanMode !== 'carga') {
    const activeTab = document.querySelector('.drawer-item.active').dataset.tab;
    scanMode = activeTab === 'cargar' ? 'carga' : 'venta';
  }
  scannerMode = scanMode;
  document.getElementById('scanner-title').textContent = scannerMode === 'carga' ? 'Escanear bolsa de stock' : 'Escanear bolsita de venta';
  document.getElementById('scan-status').textContent = 'Buscando código...';
  document.getElementById('overlay-scanner').classList.add('show');
  startCamera();
}

function cerrarScanner() {
  document.getElementById('overlay-scanner').classList.remove('show');
  stopCamera();
}
async function startCamera() {
  stopCamera();
  const video = document.getElementById('scanner-video');

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    document.getElementById('scan-status').textContent = 'Este navegador no permite acceso a la cámara acá. Probá con Chrome actualizado.';
    return;
  }

  try {
    scannerStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: {
          ideal: 'environment'
        }
      }
    });
  } catch (e1) {
    // Reintentar sin pedir específicamente la cámara trasera
    try {
      scannerStream = await navigator.mediaDevices.getUserMedia({
        video: true
      });
    } catch (e2) {
      let motivo = e2.name || 'desconocido';
      let msg = 'No se pudo acceder a la cámara (' + motivo + ').';
      if (motivo === 'NotAllowedError') msg = 'El navegador bloqueó la cámara. Revisá los permisos y volvé a intentar.';
      else if (motivo === 'NotReadableError') msg = 'La cámara está siendo usada por otra app. Cerrá otras apps que la usen (video llamadas, otra pestaña) y volvé a intentar.';
      else if (motivo === 'NotFoundError') msg = 'No se encontró ninguna cámara en este dispositivo.';
      document.getElementById('scan-status').textContent = msg + ' Podés usar la selección manual en la pantalla.';
      return;
    }
  }

  video.srcObject = scannerStream;
  try {
    await video.play();
  } catch (e3) {
    // Algunos navegadores rechazan play() aunque el video ya esté mostrando imagen
    // (por ejemplo, con muted+playsinline suele arrancar solo). No cortamos acá:
    // seguimos e intentamos escanear igual.
  }
  scanLoop();
}

function stopCamera() {
  if (scannerLoopId) cancelAnimationFrame(scannerLoopId);
  scannerLoopId = null;
  if (scannerStream) {
    scannerStream.getTracks().forEach(t => t.stop());
    scannerStream = null;
  }
}

function scanLoop() {
  const video = document.getElementById('scanner-video');
  const canvas = document.getElementById('scanner-canvas');
  if (video.readyState === video.HAVE_ENOUGH_DATA) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(img.data, img.width, img.height);
    if (code && code.data) {
      handleScanResult(code.data);
      return;
    }
  }
  scannerLoopId = requestAnimationFrame(scanLoop);
}

function handleScanResult(text) {
  const parts = text.trim().split(':');
  if (parts[0] !== 'DOLDI') {
    document.getElementById('scan-status').textContent = 'Código no reconocido, seguí intentando...';
    scannerLoopId = requestAnimationFrame(scanLoop);
    return;
  }
  const tipo = parts[1]; // VENTA | CARGA
  const prodRaw = (parts[2] || '').toLowerCase();
  const prodMap = {
    chipa: 'chipa',
    factura: 'factura',
    sandwich: 'sandwich'
  };
  const prod = prodMap[prodRaw];
  if (!prod) {
    document.getElementById('scan-status').textContent = 'Código no reconocido.';
    scannerLoopId = requestAnimationFrame(scanLoop);
    return;
  }
  cerrarScanner();
  if (tipo === 'VENTA') {
    abrirSelectorCantidad(prod);
  } else if (tipo === 'CARGA') {
    const cant = Number(parts[3]) || 18;
    STATE.stock[prod] = (STATE.stock[prod] || 0) + cant;
    saveStock();
    showToast('+ ' + cant + ' docenas de ' + PRODUCTS[prod].label + ' cargadas ✓');
    renderStock();
    renderVender();
  }
}

function abrirSelectorCantidad(prod) {
  const p = PRODUCTS[prod];
  document.getElementById('qty-title').innerHTML = `<span style="display:inline-flex; align-items:center; gap:8px; vertical-align:middle;">${icon(prod,20)} ${p.label} — elegí la cantidad</span>`;
  document.getElementById('qty-stock').textContent = 'Stock disponible: ' + (STATE.stock[prod] || 0) + ' ' + p.unit;
  const wrap = document.getElementById('qty-options');
  wrap.innerHTML = '';
  p.opts.forEach(o => {
    const btn = document.createElement('div');
    btn.className = 'qty-btn';
    btn.style.textAlign = 'left';
    btn.innerHTML = `${o.label} <span class="p">${fmtMoney(precioFor(prod,o.key))}</span>`;
    btn.onclick = () => {
      cerrarModal('overlay-qty');
      iniciarVenta(prod, o.key);
    };
    wrap.appendChild(btn);
  });
  document.getElementById('overlay-qty').classList.add('show');
}

/* ================= TEMA (claro/oscuro) ================= */
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  try {
    localStorage.setItem('doldi_theme', t);
  } catch (e) {}
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

/* ================= INIT ================= */
function iniciarApp() {
  let savedTheme = 'light';
  try {
    savedTheme = localStorage.getItem('doldi_theme') || 'light';
  } catch (e) {}
  applyTheme(savedTheme);
  renderAll();
  const cfg = getSavedFirebaseConfig();
  if (cfg) {
    document.getElementById('config-input').value = JSON.stringify(cfg, null, 2).replace(/^\{|\}$/g, '').trim();
    initFirebase(cfg);
  } else {
    updateConnStatus(false);
  }
}
iniciarApp();