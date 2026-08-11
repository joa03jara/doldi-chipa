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
  remis: [],
  premios: []
};
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
  db.collection('doldichipa_premios').orderBy('costoPuntos', 'asc').onSnapshot(snap => {
    STATE.premios = snap.docs.map(d => ({
      id: d.id,
      ...d.data()
    }));
    renderPremios();
  }, () => {
    showToast('No se pudo leer el catálogo de premios');
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

/* ================= CLIENTES Y PUNTOS ================= */
const DIAS_VENCIMIENTO_PUNTOS = 60;

function puntosVigentes(cliente) {
  if (!cliente) return 0;
  if (!cliente.ultimaCompra) return cliente.puntos || 0;
  const dias = (Date.now() - cliente.ultimaCompra) / (1000 * 60 * 60 * 24);
  return dias > DIAS_VENCIMIENTO_PUNTOS ? 0 : (cliente.puntos || 0);
}

async function buscarCliente(dni) {
  if (!db) {
    showToast('No está conectado a la nube (menú → Configuración)');
    return null;
  }
  try {
    const doc = await db.collection('doldichipa_clientes').doc(dni).get();
    if (!doc.exists) return null;
    return {
      dni,
      ...doc.data()
    };
  } catch (e) {
    showToast('No se pudo buscar el cliente');
    return null;
  }
}

async function guardarCliente(dni, data) {
  if (!db) {
    showToast('No está conectado a la nube (menú → Configuración)');
    return false;
  }
  try {
    await db.collection('doldichipa_clientes').doc(dni).set(data, {
      merge: true
    });
    return true;
  } catch (e) {
    showToast('No se pudo guardar el cliente');
    return false;
  }
}

async function addPremio(premio) {
  if (!db) {
    showToast('No está conectado a la nube (menú → Configuración)');
    return false;
  }
  try {
    await db.collection('doldichipa_premios').add(premio);
    return true;
  } catch (e) {
    showToast('No se pudo guardar el premio');
    return false;
  }
}

async function eliminarPremio(id) {
  if (!db) {
    showToast('No está conectado a la nube (menú → Configuración)');
    return false;
  }
  try {
    await db.collection('doldichipa_premios').doc(id).delete();
    return true;
  } catch (e) {
    showToast('No se pudo eliminar el premio');
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

// Muestra docenas de forma compacta: 17.5 -> "17 ½", 0.5 -> "½", 17 -> "17"
function fmtDocenasCorto(qty) {
  qty = Number(qty) || 0;
  const entero = Math.floor(qty);
  const media = (qty - entero) >= 0.49;
  if (entero === 0 && media) return '½';
  return entero + (media ? ' ½' : '');
}

// Muestra docenas en palabras: 17.5 -> "17 docenas y media", 0.5 -> "media docena"
function fmtDocenasLargo(qty) {
  qty = Number(qty) || 0;
  const entero = Math.floor(qty);
  const media = (qty - entero) >= 0.49;
  if (entero === 0 && media) return 'media docena';
  const base = entero + (entero === 1 ? ' docena' : ' docenas');
  return media ? base + ' y media' : base;
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
  else if (name === 'clientes') {
    renderPremios();
    document.getElementById('cliente-buscar-dni').value = '';
    document.getElementById('cliente-buscar-resultado').innerHTML = '';
  }
}

/* ================= RENDER ================= */
function renderAll() {
  renderVender();
  renderStock();
  renderPrecios();
  renderVentas();
  renderRemis();
  renderResumen();
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
    const valMostrar = p.unit === 'docenas' ? fmtDocenasCorto(val) : val;
    html += `<div class="prod-row" style="cursor:pointer;" onclick="abrirEditarStock('${prod}')">
      <div class="prod-icon">${icon(prod)}</div>
      <div style="flex:1;"><div class="prod-name">${p.label}</div><div class="unit-tag">${p.unit}</div></div>
      <div class="stock-num ${low?'low':''}">${valMostrar}</div>
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
  ['p-chipa-media', 'p-chipa-docena', 'p-chipa-docenaymedia', 'p-factura-media', 'p-factura-docena', 'p-factura-docenaymedia', 'p-sandwich-unidad', 'p-envio-cerca', 'p-envio-lejos'].forEach(id => {
    document.getElementById(id).style.borderColor = 'var(--border)';
  });
}

async function guardarPrecios() {
  const campos = [{
      id: 'p-chipa-media',
      label: 'Chipá - Media docena'
    },
    {
      id: 'p-chipa-docena',
      label: 'Chipá - Una docena'
    },
    {
      id: 'p-chipa-docenaymedia',
      label: 'Chipá - Docena y media'
    },
    {
      id: 'p-factura-media',
      label: 'Factura - Media docena'
    },
    {
      id: 'p-factura-docena',
      label: 'Factura - Una docena'
    },
    {
      id: 'p-factura-docenaymedia',
      label: 'Factura - Docena y media'
    },
    {
      id: 'p-sandwich-unidad',
      label: 'Sándwich - Precio unidad'
    },
    {
      id: 'p-envio-cerca',
      label: 'Envío cerca'
    },
    {
      id: 'p-envio-lejos',
      label: 'Envío lejos'
    },
  ];

  // Validar que TODOS los campos tengan un valor mayor a 0 antes de guardar nada
  const faltantes = campos.filter(c => parseMiles(document.getElementById(c.id).value) <= 0);
  if (faltantes.length > 0) {
    showToast('Faltan ' + faltantes.length + ' precio' + (faltantes.length === 1 ? '' : 's') + '. Completá los campos marcados en rojo.');
    // Resaltar en rojo los campos vacíos para que se vean de un vistazo
    campos.forEach(c => {
      const el = document.getElementById(c.id);
      const vacio = parseMiles(el.value) <= 0;
      el.style.borderColor = vacio ? 'var(--red)' : 'var(--border)';
    });
    return;
  }

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
    const qtyTexto = p.unit === 'docenas' ? fmtDocenasLargo(sumQty) : (sumQty + ' unidad' + (sumQty === 1 ? '' : 'es'));
    resumenHtml += `<div class="prod-row">
      <div class="prod-icon">${icon(prod)}</div>
      <div style="flex:1;">
        <div class="prod-name">${p.label}</div>
        ${sumQty>0 ? `<span class="qty-pill">${qtyTexto}</span>` : ''}
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
  document.getElementById('remis-mov-monto').style.borderColor = 'var(--border)';
  document.getElementById('remis-mov-concepto').value = '';
  document.getElementById('remis-mov-concepto').style.borderColor = 'var(--border)';
  document.getElementById('overlay-remis-mov').classList.add('show');
}
async function confirmarRemisMov() {
  const montoInput = document.getElementById('remis-mov-monto');
  const conceptoInput = document.getElementById('remis-mov-concepto');
  const monto = parseMiles(montoInput.value);
  const concepto = conceptoInput.value.trim();

  let faltantes = [];
  if (!monto || monto <= 0) faltantes.push('Monto');
  if (!concepto) faltantes.push('Concepto');

  montoInput.style.borderColor = (!monto || monto <= 0) ? 'var(--red)' : 'var(--border)';
  conceptoInput.style.borderColor = !concepto ? 'var(--red)' : 'var(--border)';

  if (faltantes.length > 0) {
    showToast('Completá: ' + faltantes.join(', '));
    return;
  }

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

/* ================= PREMIOS (catálogo) ================= */
function labelTipoPremio(tipo) {
  return {
    envio_gratis: 'Envío gratis',
    descuento_pct: 'Descuento %',
    descuento_monto: 'Descuento $ fijo',
    producto_gratis: 'Producto gratis'
  } [tipo] || tipo;
}

function detallePremio(p) {
  if (p.tipo === 'envio_gratis') return 'El pedido no paga envío';
  if (p.tipo === 'descuento_pct') return p.valor + '% de descuento en el pedido';
  if (p.tipo === 'descuento_monto') return fmtMoney(p.valor) + ' de descuento en el pedido';
  if (p.tipo === 'producto_gratis') return 'Si el pedido tiene ' + p.cantidadLabel + ' o más de ' + (PRODUCTS[p.prod] ? PRODUCTS[p.prod].label : p.prod) + ', esa parte sale gratis';
  return '';
}

function renderPremios() {
  const wrap = document.getElementById('premios-lista');
  if (!wrap) return;
  if (STATE.premios.length === 0) {
    wrap.innerHTML = '<div class="empty">Todavía no cargaste ningún premio.</div>';
    return;
  }
  wrap.innerHTML = STATE.premios.map(p => `
    <div class="prod-row">
      <div style="flex:1;">
        <div class="prod-name">${p.nombre}</div>
        <div class="unit-tag">${detallePremio(p)}</div>
      </div>
      <div class="stock-num" style="color:var(--orange-dark);">${p.costoPuntos} pts</div>
      <button class="btn btn-sm btn-ghost" style="padding:6px 10px;" onclick="eliminarPremioUI('${p.id}')">✕</button>
    </div>
  `).join('');
}

let tipoPremioActual = 'envio_gratis';

function abrirPremioForm() {
  document.getElementById('premio-nombre').value = '';
  document.getElementById('premio-costo-puntos').value = '';
  tipoPremioActual = 'envio_gratis';
  seleccionarTipoPremio('envio_gratis');
  document.getElementById('overlay-premio-form').classList.add('show');
}

function seleccionarTipoPremio(tipo) {
  tipoPremioActual = tipo;
  ['envio_gratis', 'descuento_pct', 'descuento_monto', 'producto_gratis'].forEach(t => {
    document.getElementById('premio-tipo-' + t).style.background = (t === tipo) ? 'var(--orange-soft)' : '';
  });
  const extra = document.getElementById('premio-campos-extra');
  if (tipo === 'descuento_pct') {
    extra.innerHTML = `<div class="row-input"><label>Porcentaje de descuento</label><div><input type="number" id="premio-valor" min="1" max="100" style="width:90px; padding:8px; border:1px solid var(--border); border-radius:8px; font-size:14px;"><span class="prefix" style="margin-left:4px;">%</span></div></div>`;
  } else if (tipo === 'descuento_monto') {
    extra.innerHTML = `<div class="row-input"><label>Monto de descuento</label><div><span class="prefix">$</span><input type="text" inputmode="numeric" id="premio-valor" oninput="formatMiles(this)" style="width:120px; padding:8px; border:1px solid var(--border); border-radius:8px; font-size:14px;"></div></div>`;
  } else if (tipo === 'producto_gratis') {
    extra.innerHTML = `
      <p class="muted" style="font-weight:700; margin:8px 0; font-size:12px; text-transform:uppercase;">Producto a regalar</p>
      <div class="grid3" style="margin-bottom:10px;">
        <div class="qty-btn" id="premio-prod-chipa" onclick="seleccionarProdPremio('chipa')">Chipá</div>
        <div class="qty-btn" id="premio-prod-factura" onclick="seleccionarProdPremio('factura')">Factura</div>
        <div class="qty-btn" id="premio-prod-sandwich" onclick="seleccionarProdPremio('sandwich')">Sándwich</div>
      </div>
      <div id="premio-cantidad-opts"></div>
    `;
    seleccionarProdPremio('chipa');
  } else {
    extra.innerHTML = '';
  }
}

let premioProdActual = 'chipa';
let premioCantidadActual = null;

function seleccionarProdPremio(prod) {
  premioProdActual = prod;
  ['chipa', 'factura', 'sandwich'].forEach(p => {
    document.getElementById('premio-prod-' + p).style.background = (p === prod) ? 'var(--orange-soft)' : '';
  });
  const wrap = document.getElementById('premio-cantidad-opts');
  const opts = prod === 'sandwich' ? [{
    key: 'unidad',
    label: '1 unidad',
    qty: 1
  }] : PRODUCTS[prod].opts;
  premioCantidadActual = opts[0];
  wrap.innerHTML = '<div class="grid3">' + opts.map((o, i) => `<div class="qty-btn premio-cant-opt" data-idx="${i}" style="${i===0?'background:var(--orange-soft);':''}" onclick="seleccionarCantidadPremio(${i})">${o.label}</div>`).join('') + '</div>';
  wrap._opts = opts;
}

function seleccionarCantidadPremio(idx) {
  const wrap = document.getElementById('premio-cantidad-opts');
  premioCantidadActual = wrap._opts[idx];
  wrap.querySelectorAll('.premio-cant-opt').forEach(el => {
    el.style.background = (Number(el.dataset.idx) === idx) ? 'var(--orange-soft)' : '';
  });
}

async function guardarPremioForm() {
  const nombre = document.getElementById('premio-nombre').value.trim();
  const costoPuntos = Number(document.getElementById('premio-costo-puntos').value);
  if (!nombre || !costoPuntos || costoPuntos <= 0) {
    showToast('Completá el nombre y el costo en puntos');
    return;
  }
  const premio = {
    nombre,
    tipo: tipoPremioActual,
    costoPuntos
  };
  if (tipoPremioActual === 'descuento_pct' || tipoPremioActual === 'descuento_monto') {
    const valor = parseMiles(document.getElementById('premio-valor').value) || Number(document.getElementById('premio-valor').value);
    if (!valor || valor <= 0) {
      showToast('Completá el valor del descuento');
      return;
    }
    premio.valor = valor;
  }
  if (tipoPremioActual === 'producto_gratis') {
    premio.prod = premioProdActual;
    premio.cantidadKey = premioCantidadActual.key;
    premio.cantidadLabel = premioCantidadActual.label;
    premio.cantidadQty = premioCantidadActual.qty;
  }
  const ok = await addPremio(premio);
  if (ok) {
    cerrarModal('overlay-premio-form');
    showToast('Premio guardado ✓');
  }
}

async function eliminarPremioUI(id) {
  const ok = await eliminarPremio(id);
  if (ok) showToast('Premio eliminado');
}

/* ================= CLIENTES ================= */
function fmtFecha(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

async function buscarClienteUI() {
  const dni = document.getElementById('cliente-buscar-dni').value.trim();
  if (!dni) {
    showToast('Ingresá un DNI');
    return;
  }
  const wrap = document.getElementById('cliente-buscar-resultado');
  wrap.innerHTML = '<div class="loading">Buscando...</div>';
  const cliente = await buscarCliente(dni);
  if (!cliente) {
    wrap.innerHTML = '<div class="empty">No hay ningún cliente con ese DNI todavía. Se crea solo la primera vez que compra (poniendo su DNI al finalizar un pedido).</div>';
    return;
  }
  const puntos = puntosVigentes(cliente);
  const vencidos = puntos === 0 && (cliente.puntos || 0) > 0;
  wrap.innerHTML = `
    <div class="prod-row">
      <div style="flex:1;">
        <div class="prod-name">${cliente.nombre || 'Sin nombre'}</div>
        <div class="unit-tag">DNI ${cliente.dni} · Última compra: ${fmtFecha(cliente.ultimaCompra)}</div>
      </div>
      <div class="stock-num" style="color:var(--orange-dark);">${puntos} pts</div>
    </div>
    ${vencidos ? '<p class="muted" style="color:var(--red); margin-top:6px;">Los puntos vencieron por inactividad.</p>' : ''}
  `;
}

let clienteVentaActual = null; // {dni, nombre, puntos, esNuevo}
let premioSeleccionadoVenta = null;

async function buscarClienteVenta() {
  const dni = document.getElementById('venta-cliente-dni').value.trim();
  if (!dni) {
    showToast('Ingresá un DNI');
    return;
  }
  const wrap = document.getElementById('venta-cliente-resultado');
  wrap.innerHTML = '<div class="loading">Buscando...</div>';
  const cliente = await buscarCliente(dni);
  if (cliente) {
    clienteVentaActual = {
      dni,
      nombre: cliente.nombre || '',
      puntos: puntosVigentes(cliente),
      esNuevo: false
    };
  } else {
    clienteVentaActual = {
      dni,
      nombre: '',
      puntos: 0,
      esNuevo: true
    };
  }
  premioSeleccionadoVenta = null;
  renderClienteVenta();
}

function pedidoAlcanzaParaPremio(premio) {
  if (premio.tipo !== 'producto_gratis') return true;
  return carrito.some(i => i.prod === premio.prod && i.qty >= premio.cantidadQty);
}

function renderClienteVenta() {
  const wrap = document.getElementById('venta-cliente-resultado');
  if (!clienteVentaActual) {
    wrap.innerHTML = '';
    return;
  }
  const c = clienteVentaActual;
  let html = '';
  if (c.esNuevo) {
    html += `
      <p class="muted" style="margin:4px 0;">Cliente nuevo, se va a crear al confirmar.</p>
      <input type="text" id="venta-cliente-nombre" placeholder="Nombre (opcional)" style="width:100%; box-sizing:border-box; padding:8px; border:1px solid var(--border); border-radius:8px; font-size:14px; background:var(--bg); color:var(--text); margin-bottom:8px;">
    `;
  } else {
    html += `<div class="prod-row"><div class="prod-name" style="flex:1;">${c.nombre || 'Sin nombre'}</div><div class="stock-num" style="color:var(--orange-dark);">${c.puntos} pts</div></div>`;
  }

  const alcanzaPuntos = p => c.puntos >= p.costoPuntos;
  const disponibles = STATE.premios.filter(p => alcanzaPuntos(p) && pedidoAlcanzaParaPremio(p));
  const sinPuntos = STATE.premios.filter(p => !alcanzaPuntos(p));
  const sinCoincidir = STATE.premios.filter(p => alcanzaPuntos(p) && !pedidoAlcanzaParaPremio(p));

  if (STATE.premios.length > 0) {
    html += '<p class="muted" style="font-weight:700; margin:10px 0 6px; font-size:12px; text-transform:uppercase;">Premios disponibles</p>';
    if (disponibles.length === 0) {
      html += '<p class="muted">Ningún premio aplica a este pedido todavía.</p>';
    } else {
      html += disponibles.map(p => {
        const activo = premioSeleccionadoVenta && premioSeleccionadoVenta.id === p.id;
        return `<div class="qty-btn" style="text-align:left; ${activo?'background:var(--orange-soft); border-color:var(--orange);':''}" onclick="seleccionarPremioVenta('${p.id}')">${p.nombre}<span class="p">${p.costoPuntos} pts</span></div>`;
      }).join('');
    }
    if (sinCoincidir.length > 0) {
      html += sinCoincidir.map(p => `<div class="qty-btn" style="text-align:left; opacity:0.45;">${p.nombre}<span class="p">No hay ${PRODUCTS[p.prod]?PRODUCTS[p.prod].label:''} suficiente en este pedido</span></div>`).join('');
    }
    if (sinPuntos.length > 0) {
      html += sinPuntos.map(p => `<div class="qty-btn" style="text-align:left; opacity:0.45;">${p.nombre}<span class="p">Faltan ${p.costoPuntos - c.puntos} pts</span></div>`).join('');
    }
  }
  wrap.innerHTML = html;
}

function seleccionarPremioVenta(id) {
  if (premioSeleccionadoVenta && premioSeleccionadoVenta.id === id) {
    premioSeleccionadoVenta = null;
  } else {
    premioSeleccionadoVenta = STATE.premios.find(p => p.id === id) || null;
  }
  renderClienteVenta();
}

/* ================= VENTA FLOW ================= */
let envioSeleccionado = null; // null | 'cerca' | 'lejos'
let carrito = []; // items del pedido actual: {prod, optKey, qty, label, monto}

function stockDisponiblePedido(prod) {
  const enCarrito = carrito.filter(i => i.prod === prod).reduce((s, i) => s + i.qty, 0);
  return (STATE.stock[prod] || 0) - enCarrito;
}

function iniciarVenta(prod, optKey, customOpt) {
  const opt = customOpt || PRODUCTS[prod].opts.find(o => o.key === optKey);
  const disponible = stockDisponiblePedido(prod);
  if (disponible < opt.qty) {
    const dispTexto = PRODUCTS[prod].unit === 'docenas' ? fmtDocenasLargo(disponible) : disponible + ' unidades';
    showToast('No hay suficiente stock de ' + PRODUCTS[prod].label + ' (' + dispTexto + ' disponibles)');
    return;
  }
  const precio = customOpt ? customOpt.monto : precioFor(prod, optKey);
  if (!precio || precio <= 0) {
    showToast('Falta cargar el precio de ' + PRODUCTS[prod].label + ' en Precios');
    return;
  }
  carrito.push({
    prod,
    optKey,
    qty: opt.qty,
    label: opt.label,
    monto: precio
  });
  renderCarrito();
  showToast('Agregado al pedido: ' + PRODUCTS[prod].label + ' - ' + opt.label);
}

function renderCarrito() {
  const card = document.getElementById('carrito-card');
  const lista = document.getElementById('carrito-lista');
  if (carrito.length === 0) {
    card.style.display = 'none';
    return;
  }
  card.style.display = 'block';
  lista.innerHTML = carrito.map((item, idx) => `
    <div class="prod-row">
      <div class="prod-icon">${icon(item.prod)}</div>
      <div style="flex:1;"><div class="prod-name">${PRODUCTS[item.prod].label}</div><div class="unit-tag">${item.label}</div></div>
      <div class="stock-num">${fmtMoney(item.monto)}</div>
      <button class="btn btn-sm btn-ghost" style="padding:6px 10px;" onclick="quitarDelCarrito(${idx})">✕</button>
    </div>
  `).join('');
  const subtotal = carrito.reduce((s, i) => s + i.monto, 0);
  document.getElementById('carrito-subtotal').textContent = fmtMoney(subtotal);
}

function quitarDelCarrito(idx) {
  carrito.splice(idx, 1);
  renderCarrito();
}

function vaciarCarrito() {
  carrito = [];
  renderCarrito();
  showToast('Pedido vaciado');
}

function abrirFinalizarPedido() {
  if (carrito.length === 0) return;
  const body = document.getElementById('confirm-body');
  const subtotal = carrito.reduce((s, i) => s + i.monto, 0);
  body.innerHTML = carrito.map(item => `
    <div class="prod-row">
      <div class="prod-icon">${icon(item.prod)}</div>
      <div style="flex:1;"><div class="prod-name">${PRODUCTS[item.prod].label}</div><div class="unit-tag">${item.label}</div></div>
      <div class="stock-num">${fmtMoney(item.monto)}</div>
    </div>
  `).join('') + `
    <div class="prod-row" style="border-top:1.5px solid var(--border); padding-top:10px;">
      <div class="prod-name" style="flex:1;">Subtotal</div>
      <div class="stock-num">${fmtMoney(subtotal)}</div>
    </div>
  `;
  envioSeleccionado = null;
  clienteVentaActual = null;
  premioSeleccionadoVenta = null;
  document.getElementById('venta-cliente-dni').value = '';
  document.getElementById('venta-cliente-resultado').innerHTML = '';
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

function aplicarDescuentoAItems(items, descuentoTotal) {
  let restante = descuentoTotal;
  for (let i = items.length - 1; i >= 0 && restante > 0; i--) {
    const aplicar = Math.min(items[i].monto, restante);
    items[i].monto -= aplicar;
    restante -= aplicar;
  }
  return items;
}

async function confirmarVenta() {
  if (carrito.length === 0) return;
  if (!db) {
    showToast('No está conectado a la nube (menú → Configuración)');
    return;
  }

  // Chequeo de seguridad: que el premio elegido siga siendo válido para este cliente
  if (premioSeleccionadoVenta && clienteVentaActual && clienteVentaActual.puntos < premioSeleccionadoVenta.costoPuntos) {
    showToast('Ese cliente ya no tiene puntos suficientes para ese premio');
    return;
  }

  const subtotalOriginal = carrito.reduce((s, i) => s + i.monto, 0);
  let envioMonto = envioSeleccionado ? (STATE.precios.envio[envioSeleccionado] || 0) : 0;

  // Armar la lista final de ítems a guardar (agrega el producto gratis si corresponde)
  let items = carrito.map(i => ({
    ...i
  }));

  if (premioSeleccionadoVenta) {
    if (premioSeleccionadoVenta.tipo === 'envio_gratis') {
      envioMonto = 0;
    } else if (premioSeleccionadoVenta.tipo === 'descuento_pct') {
      const descuento = Math.round(subtotalOriginal * premioSeleccionadoVenta.valor / 100);
      aplicarDescuentoAItems(items, descuento);
    } else if (premioSeleccionadoVenta.tipo === 'descuento_monto') {
      aplicarDescuentoAItems(items, Math.min(premioSeleccionadoVenta.valor, subtotalOriginal));
    } else if (premioSeleccionadoVenta.tipo === 'producto_gratis') {
      // Busca un ítem YA escaneado en este pedido que coincida en producto y
      // tenga cantidad suficiente, y le descuenta el valor de esa parte.
      // No agrega ninguna bolsita nueva: la que ya está en el pedido pasa a
      // costar menos (o nada), coincidiendo con lo que de verdad se entrega.
      const objetivo = items.find(it => it.prod === premioSeleccionadoVenta.prod && it.qty >= premioSeleccionadoVenta.cantidadQty);
      if (!objetivo) {
        showToast('Ese premio no aplica a este pedido (no coincide con lo escaneado)');
        return;
      }
      const valorGratis = precioFor(premioSeleccionadoVenta.prod, premioSeleccionadoVenta.cantidadKey);
      objetivo.monto = Math.max(0, objetivo.monto - valorGratis);
      objetivo.label += ' (parte canjeada: ' + premioSeleccionadoVenta.cantidadLabel + ' gratis)';
    }
  }

  // Descontar el stock de cada producto del pedido (sumando cantidades repetidas)
  items.forEach(item => {
    STATE.stock[item.prod] = Math.max(0, (STATE.stock[item.prod] || 0) - item.qty);
  });

  // El envío se suma una sola vez, en el último ítem, para no cobrarlo varias veces.
  const ventaPromises = items.map((item, i) => {
    const esUltimo = i === items.length - 1;
    return addVenta({
      ts: Date.now(),
      prod: item.prod,
      optKey: item.optKey,
      qty: item.qty,
      qtyLabel: item.label,
      monto: item.monto + (esUltimo ? envioMonto : 0),
      envio: esUltimo ? envioSeleccionado : null
    });
  });

  const promesas = [saveStock(), ...ventaPromises];

  // Si hay un cliente cargado, sumar/descontar sus puntos también en paralelo
  if (clienteVentaActual) {
    const puntosGanados = Math.floor(subtotalOriginal / 1000);
    const nuevosPuntos = Math.max(0, clienteVentaActual.puntos - (premioSeleccionadoVenta ? premioSeleccionadoVenta.costoPuntos : 0) + puntosGanados);
    const datosCliente = {
      puntos: nuevosPuntos,
      ultimaCompra: Date.now()
    };
    if (clienteVentaActual.esNuevo) {
      datosCliente.creado = Date.now();
      const nombreInput = document.getElementById('venta-cliente-nombre');
      datosCliente.nombre = nombreInput ? nombreInput.value.trim() : '';
    } else if (clienteVentaActual.nombre) {
      datosCliente.nombre = clienteVentaActual.nombre;
    }
    promesas.push(guardarCliente(clienteVentaActual.dni, datosCliente));
  }

  // Guardar todo al mismo tiempo (en paralelo) en vez de uno por uno, para que sea rápido.
  const resultados = await Promise.all(promesas);
  const okStock = resultados[0];
  const okResto = resultados.slice(1).every(Boolean);

  if (okStock && okResto) {
    const total = items.reduce((s, i) => s + i.monto, 0) + envioMonto;
    cerrarModal('overlay-confirm');
    showToast('Pedido registrado · ' + fmtMoney(total) + (premioSeleccionadoVenta ? ' · Premio aplicado: ' + premioSeleccionadoVenta.nombre : ''));
    carrito = [];
    envioSeleccionado = null;
    clienteVentaActual = null;
    premioSeleccionadoVenta = null;
    renderCarrito();
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
  document.getElementById('carga-manual-input').style.borderColor = 'var(--border)';
  document.getElementById('carga-manual-input').step = p.unit === 'docenas' ? '0.5' : '1';
  document.getElementById('overlay-carga-manual').classList.add('show');
}
async function confirmarCargaManual() {
  const input = document.getElementById('carga-manual-input');
  const val = Number(input.value);
  if (!val || val <= 0) {
    input.style.borderColor = 'var(--red)';
    showToast('Ingresá una cantidad válida');
    return;
  }
  input.style.borderColor = 'var(--border)';
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
  document.getElementById('bolsa-manual-input').style.borderColor = 'var(--border)';
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
  document.getElementById('bolsa-manual-chipa').style.borderColor = 'var(--border)';
  document.getElementById('bolsa-manual-factura').style.borderColor = 'var(--border)';
}

function actualizarPreviewBolsa() {
  const bolsas = Number(document.getElementById('bolsa-manual-input').value) || 0;
  document.getElementById('bolsa-manual-preview').textContent = '= ' + (bolsas * 18) + ' docenas';
}
async function confirmarCargaBolsaManual() {
  const input = document.getElementById('bolsa-manual-input');
  const bolsas = Number(input.value);
  let faltantes = [];
  if (!bolsaManualProd) faltantes.push('Producto (Chipá o Factura)');
  if (!bolsas || bolsas <= 0) faltantes.push('Cantidad de bolsas');

  document.getElementById('bolsa-manual-chipa').style.borderColor = !bolsaManualProd ? 'var(--red)' : 'var(--border)';
  document.getElementById('bolsa-manual-factura').style.borderColor = !bolsaManualProd ? 'var(--red)' : 'var(--border)';
  input.style.borderColor = (!bolsas || bolsas <= 0) ? 'var(--red)' : 'var(--border)';

  if (faltantes.length > 0) {
    showToast('Completá: ' + faltantes.join(', '));
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
  document.getElementById('editar-stock-input').style.borderColor = 'var(--border)';
  document.getElementById('overlay-editar-stock').classList.add('show');
}
async function confirmarEditarStock() {
  const input = document.getElementById('editar-stock-input');
  const raw = input.value.trim();
  const val = Number(raw);
  if (raw === '' || isNaN(val) || val < 0) {
    input.style.borderColor = 'var(--red)';
    showToast('Ingresá una cantidad válida');
    return;
  }
  input.style.borderColor = 'var(--border)';
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
let audioCtx = null;

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

  // El sonido de "bip" solo se puede desbloquear durante un toque real del
  // usuario (esto, que es un onclick de botón, cuenta). Si lo creamos recién
  // cuando se detecta el QR (que no es un toque directo), el navegador lo
  // bloquea y no suena. Por eso se prepara acá y se reusa después.
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!audioCtx) audioCtx = new AudioCtx();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch (e) {}

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
        },
        width: {
          ideal: 1280
        },
        height: {
          ideal: 720
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
  try {
    const video = document.getElementById('scanner-video');
    const canvas = document.getElementById('scanner-canvas');
    if (typeof jsQR !== 'function') {
      document.getElementById('scan-status').textContent = 'Error: no se pudo cargar el lector de QR (sin conexión a internet?). Revisá tu wifi/datos y volvé a entrar.';
      return;
    }
    if (video.readyState === video.HAVE_ENOUGH_DATA && video.videoWidth > 0) {
      const MAX_DIM = 720;
      const scale = Math.min(1, MAX_DIM / Math.max(video.videoWidth, video.videoHeight));
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      const ctx = canvas.getContext('2d', {
        willReadFrequently: true
      });
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(img.data, img.width, img.height, {
        inversionAttempts: 'attemptBoth'
      });
      if (code && code.data) {
        handleScanResult(code.data);
        return;
      }
    }
    scannerLoopId = requestAnimationFrame(scanLoop);
  } catch (errScan) {
    document.getElementById('scan-status').textContent = 'Error al escanear: ' + (errScan.message || errScan);
  }
}

/* ================= SONIDO DE ESCANEO ================= */
function reproducirBip() {
  try {
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 1000;
    gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.15);
  } catch (e) {
    // Si el navegador no permite sonido acá, no pasa nada grave, seguimos igual.
  }
}

function handleScanResult(text) {
  try {
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
    reproducirBip();
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
  } catch (errHandle) {
    showToast('Error al procesar el QR: ' + (errHandle.message || errHandle));
  }
}

let sandwichQtyActual = 1;

function abrirSelectorCantidad(prod) {
  const p = PRODUCTS[prod];
  document.getElementById('qty-title').innerHTML = `<span style="display:inline-flex; align-items:center; gap:8px; vertical-align:middle;">${icon(prod,20)} ${p.label} — elegí la cantidad</span>`;
  const dispTexto = p.unit === 'docenas' ? fmtDocenasLargo(stockDisponiblePedido(prod)) : stockDisponiblePedido(prod) + ' unidades';
  document.getElementById('qty-stock').textContent = 'Stock disponible: ' + dispTexto;
  const wrap = document.getElementById('qty-options');
  wrap.innerHTML = '';

  if (prod === 'sandwich') {
    // El sándwich no viene en bolsas de tamaño fijo: cantidad libre con +/-
    sandwichQtyActual = 1;
    wrap.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:center; gap:24px; padding:14px 0 6px;">
        <button class="btn btn-gold" style="width:52px; height:52px; border-radius:50%; font-size:26px; padding:0; line-height:1;" onclick="cambiarCantidadSandwich(-1)">−</button>
        <div style="font-size:34px; font-weight:800; min-width:56px; text-align:center;" id="sandwich-qty-display">1</div>
        <button class="btn btn-gold" style="width:52px; height:52px; border-radius:50%; font-size:26px; padding:0; line-height:1;" onclick="cambiarCantidadSandwich(1)">+</button>
      </div>
      <p class="muted" style="text-align:center; margin:4px 0 14px;" id="sandwich-qty-precio">$0</p>
      <button class="btn btn-green btn-block" onclick="confirmarCantidadSandwich()">Continuar</button>
    `;
    actualizarDisplaySandwich();
  } else {
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
  }
  document.getElementById('overlay-qty').classList.add('show');
}

function cambiarCantidadSandwich(delta) {
  const nueva = sandwichQtyActual + delta;
  if (nueva < 1) return;
  const stockVal = stockDisponiblePedido('sandwich');
  if (nueva > stockVal) {
    showToast('No hay suficiente stock de Sándwich de chipá (' + stockVal + ' disponibles)');
    return;
  }
  sandwichQtyActual = nueva;
  actualizarDisplaySandwich();
}

function actualizarDisplaySandwich() {
  document.getElementById('sandwich-qty-display').textContent = sandwichQtyActual;
  const precioUnidad = STATE.precios.sandwich.unidad || 0;
  document.getElementById('sandwich-qty-precio').textContent = fmtMoney(precioUnidad * sandwichQtyActual);
}

function confirmarCantidadSandwich() {
  const precioUnidad = STATE.precios.sandwich.unidad || 0;
  cerrarModal('overlay-qty');
  iniciarVenta('sandwich', 'custom', {
    qty: sandwichQtyActual,
    label: sandwichQtyActual + ' unidad' + (sandwichQtyActual === 1 ? '' : 'es'),
    monto: precioUnidad * sandwichQtyActual
  });
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