/* ================= PRODUCTOS (dinámico) ================= */
// Los productos ya no están fijos en el código: se cargan desde la nube
// (colección doldichipa_productos) y se administran desde la pestaña "Productos".
// La primera vez que se conecta una base de datos nueva, se crean automáticamente
// los 3 productos originales (chipa, factura, sándwich) para no perder compatibilidad.
function productosSemilla() {
  return [{
      id: 'chipa',
      label: 'Chipá',
      emoji: '🧀',
      unit: 'docenas',
      pricingMode: 'variantes',
      variantes: [{
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
      ],
      packSize: 18,
      packLabel: 'bolsa',
      orden: 0
    },
    {
      id: 'factura',
      label: 'Factura',
      emoji: '🥐',
      unit: 'docenas',
      pricingMode: 'variantes',
      variantes: [{
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
      ],
      packSize: 18,
      packLabel: 'bolsa',
      orden: 1
    },
    {
      id: 'sandwich',
      label: 'Sándwich de chipá',
      emoji: '🥪',
      unit: 'unidades',
      pricingMode: 'libre',
      variantes: [],
      packSize: null,
      packLabel: null,
      orden: 2
    }
  ];
}

function prodIconHtml(id, size) {
  const p = STATE.productos[id];
  const emoji = (p && p.emoji) ? p.emoji : '📦';
  return `<span style="font-size:${size||18}px; line-height:1;">${emoji}</span>`;
}

let STATE = {
  productos: {},
  stock: {},
  precios: {},
  ventas: [],
  remis: [],
  premios: [],
  clientes: [],
  pedidos: [],
  caja: {
    efectivo: 0,
    transferencia: 0
  },
  puntosPorMil: 1
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

async function seedProductosSiHaceFalta() {
  try {
    const metaRef = db.collection('doldichipa').doc('productos_meta');
    const metaDoc = await metaRef.get();
    if (metaDoc.exists) return;
    const batch = db.batch();
    productosSemilla().forEach(def => {
      const {
        id,
        ...resto
      } = def;
      batch.set(db.collection('doldichipa_productos').doc(id), resto);
    });
    batch.set(metaRef, {
      seeded: true,
      seededAt: Date.now()
    });
    await batch.commit();
  } catch (e) {
    // Si falla, el usuario simplemente ve la lista de productos vacía y puede
    // cargarlos a mano desde la pestaña Productos.
  }
}

function attachListeners() {
  if (!db) return;
  seedProductosSiHaceFalta();
  db.collection('doldichipa_productos').onSnapshot(snap => {
    const nuevos = {};
    snap.docs.forEach(d => {
      nuevos[d.id] = {
        id: d.id,
        ...d.data()
      };
    });
    STATE.productos = nuevos;
    renderAll();
    if (document.getElementById('tab-productos').classList.contains('active')) renderProductosLista();
  }, () => {
    showToast('No se pudo leer la lista de productos');
  });
  db.collection('doldichipa').doc('stock').onSnapshot(doc => {
    STATE.stock = doc.exists ? doc.data() : {};
    renderVender();
    renderStock();
  }, () => {
    showToast('No se pudo leer el stock de la nube');
  });
  db.collection('doldichipa').doc('precios').onSnapshot(doc => {
    STATE.precios = doc.exists ? doc.data() : {};
    renderVender();
    renderPrecios();
    renderStock();
  }, () => {
    showToast('No se pudieron leer los precios de la nube');
  });
  db.collection('doldichipa_pedidos').onSnapshot(snap => {
    STATE.pedidos = snap.docs.map(d => ({
      id: d.id,
      ...d.data()
    }));
    if (document.getElementById('tab-pedidos').classList.contains('active')) renderPedidos();
  }, () => {
    showToast('No se pudieron leer los pedidos de la nube');
  });
  db.collection('doldichipa').doc('caja').onSnapshot(doc => {
    STATE.caja = doc.exists ? doc.data() : {
      efectivo: 0,
      transferencia: 0
    };
    renderCaja();
  }, () => {
    showToast('No se pudo leer la caja de la nube');
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
    renderClienteVenta();
  }, () => {
    showToast('No se pudo leer el catálogo de premios');
  });
  db.collection('doldichipa_clientes').onSnapshot(snap => {
    STATE.clientes = snap.docs.map(d => ({
      dni: d.id,
      ...d.data()
    }));
    renderListaClientes();
  }, () => {
    showToast('No se pudo leer la lista de clientes');
  });
  db.collection('doldichipa').doc('puntosConfig').onSnapshot(doc => {
    STATE.puntosPorMil = doc.exists && doc.data().porMil ? doc.data().porMil : 1;
    renderConfigPuntos();
  }, () => {
    showToast('No se pudo leer la configuración de puntos');
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
async function saveCaja() {
  if (!db) {
    showToast('No está conectado a la nube (menú → Configuración)');
    return false;
  }
  try {
    await db.collection('doldichipa').doc('caja').set(STATE.caja);
    return true;
  } catch (e) {
    showToast('No se pudo guardar la caja');
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

async function guardarConfigPuntos() {
  const input = document.getElementById('config-puntos-input');
  const val = Number(input.value);
  if (!val || val <= 0) {
    input.style.borderColor = 'var(--red)';
    showToast('Ingresá un número válido');
    return;
  }
  input.style.borderColor = 'var(--border)';
  if (!db) {
    showToast('No está conectado a la nube (menú → Configuración)');
    return;
  }
  try {
    await db.collection('doldichipa').doc('puntosConfig').set({
      porMil: val
    }, {
      merge: true
    });
    showToast('Configuración guardada ✓');
  } catch (e) {
    showToast('No se pudo guardar');
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

// Muestra una cantidad de forma compacta, sin unidad: 17.5 -> "17 ½", 0.5 -> "½", 17 -> "17"
function fmtNumCorto(qty) {
  qty = Number(qty) || 0;
  const entero = Math.floor(qty);
  const media = (qty - entero) >= 0.49;
  if (entero === 0 && media) return '½';
  return entero + (media ? ' ½' : '');
}

// Muestra una cantidad junto con la unidad del producto: 17.5 -> "17 ½ docenas"
function fmtCantidad(prod, qty) {
  const p = STATE.productos[prod];
  const unit = p ? p.unit : 'unidades';
  return fmtNumCorto(qty) + ' ' + unit;
}

// Precio de referencia "por unidad de stock" de un producto, usado para
// proyectar cuánto vale el stock disponible.
function precioRefPorUnidad(prod) {
  const p = STATE.productos[prod];
  const pr = STATE.precios[prod] || {};
  if (!p) return 0;
  if (p.pricingMode === 'libre') return pr.unidad || 0;
  const uno = (p.variantes || []).find(v => v.qty === 1);
  if (uno) return pr[uno.key] || 0;
  const v0 = (p.variantes || [])[0];
  if (v0 && v0.qty > 0) return (pr[v0.key] || 0) / v0.qty;
  return 0;
}

function formatMiles(el) {
  const digits = el.value.replace(/\D/g, '');
  el.value = digits ? Number(digits).toLocaleString('es-AR') : '';
}

function parseMiles(val) {
  return Number(String(val || '').replace(/\D/g, '')) || 0;
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

// Todas las ventanas emergentes (.overlay) comparten el mismo z-index en el CSS,
// así que si una se abre desde adentro de otra (ej: "Elegir producto" desde
// "Nuevo pedido"), sin esto quedaría tapada por la que ya estaba abierta según
// el orden en el HTML. Con este contador, la que se abrió última siempre queda
// arriba de todas.
let overlayZTop = 50;

function mostrarOverlay(id) {
  const el = document.getElementById(id);
  overlayZTop++;
  el.style.zIndex = overlayZTop;
  el.classList.add('show');
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
  else if (name === 'productos') renderProductosLista();
  else if (name === 'pedidos') renderPedidos();
  else if (name === 'caja') renderCaja();
  else if (name === 'ventas') renderVentas();
  else if (name === 'remis') renderRemis();
  else if (name === 'resumen') renderResumen();
  else if (name === 'vender') renderVender();
  else if (name === 'clientes') {
    renderPremios();
    renderConfigPuntos();
    document.getElementById('clientes-buscar-input').value = '';
    renderListaClientes();
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

/* ================= PRODUCTOS (crear / editar / borrar) ================= */
function renderProductosLista() {
  const wrap = document.getElementById('productos-lista');
  if (!wrap) return;
  const ids = productosOrdenados();
  if (ids.length === 0) {
    wrap.innerHTML = '<div class="empty">Todavía no cargaste ningún producto.</div>';
    return;
  }
  wrap.innerHTML = ids.map(id => {
    const p = STATE.productos[id];
    const detalle = p.pricingMode === 'libre' ?
      ('Precio libre por ' + p.unit) :
      ((p.variantes || []).length + ' opción' + ((p.variantes || []).length === 1 ? '' : 'es') + ' de venta');
    return `<div class="product-item">
      <div class="pi-emoji">${p.emoji || '📦'}</div>
      <div style="flex:1;">
        <div class="prod-name">${p.label}</div>
        <div class="unit-tag">${p.unit} · ${detalle}</div>
      </div>
      <div class="pi-actions">
        <button class="btn btn-sm btn-ghost" onclick="abrirProductoQR('${id}')">QR</button>
        <button class="btn btn-sm btn-ghost" onclick="abrirProductoForm('${id}')">Editar</button>
      </div>
    </div>`;
  }).join('');
}

function slugify(str) {
  const base = (str || '').toString().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return base || 'producto';
}

const EMOJIS_PRODUCTO = ['🧀', '🥐', '🥪', '🍔', '🍕', '🌭', '🥖', '🍞', '🥟', '🍗', '🍟', '🍩', '🍪', '🧁', '🍰', '🥤', '☕', '🍦', '🥗', '🍫', '📦'];

let pfEditId = null;
let pfEmojiActual = '📦';
let pfModoActual = 'libre';
let pfVariantesActual = [];

function abrirProductoForm(editId) {
  pfEditId = editId || null;
  const grid = document.getElementById('pf-emoji-grid');
  grid.innerHTML = EMOJIS_PRODUCTO.map(e => `<div class="emoji-opt" data-e="${e}" onclick="seleccionarEmojiForm('${e}')">${e}</div>`).join('');

  document.getElementById('producto-form-title').textContent = editId ? 'Editar producto' : 'Nuevo producto';
  document.getElementById('pf-eliminar-btn').style.display = editId ? 'block' : 'none';

  if (editId && STATE.productos[editId]) {
    const p = STATE.productos[editId];
    document.getElementById('pf-nombre').value = p.label || '';
    document.getElementById('pf-unidad').value = p.unit || '';
    pfEmojiActual = p.emoji || '📦';
    pfModoActual = p.pricingMode || 'libre';
    pfVariantesActual = (p.variantes || []).map(v => ({ ...v
    }));
    document.getElementById('pf-usa-paquete').checked = !!p.packSize;
    document.getElementById('pf-paquete-nombre').value = p.packLabel || '';
    document.getElementById('pf-paquete-cantidad').value = p.packSize || '';
  } else {
    document.getElementById('pf-nombre').value = '';
    document.getElementById('pf-unidad').value = 'unidades';
    pfEmojiActual = '📦';
    pfModoActual = 'libre';
    pfVariantesActual = [{
      key: 'v' + Date.now(),
      label: '1 unidad',
      qty: 1
    }];
    document.getElementById('pf-usa-paquete').checked = false;
    document.getElementById('pf-paquete-nombre').value = '';
    document.getElementById('pf-paquete-cantidad').value = '';
  }
  document.getElementById('pf-precio-unidad').value = '';

  seleccionarEmojiForm(pfEmojiActual);
  seleccionarModoPrecio(pfModoActual);
  renderVariantesForm();
  togglePaqueteForm();
  mostrarOverlay('overlay-producto-form');
}

function seleccionarEmojiForm(e) {
  pfEmojiActual = e;
  document.querySelectorAll('#pf-emoji-grid .emoji-opt').forEach(el => {
    el.classList.toggle('active', el.dataset.e === e);
  });
}

function seleccionarModoPrecio(modo) {
  pfModoActual = modo;
  document.getElementById('pf-modo-libre').classList.toggle('active', modo === 'libre');
  document.getElementById('pf-modo-variantes').classList.toggle('active', modo === 'variantes');
  document.getElementById('pf-precio-libre-wrap').style.display = modo === 'libre' ? 'block' : 'none';
  document.getElementById('pf-variantes-wrap').style.display = modo === 'variantes' ? 'block' : 'none';
}

function renderVariantesForm() {
  const wrap = document.getElementById('pf-variantes-list');
  wrap.innerHTML = pfVariantesActual.map((v, i) => `
    <div class="variante-row">
      <input class="vr-label" type="text" placeholder="Nombre (ej: Docena)" value="${v.label||''}" oninput="pfVariantesActual[${i}].label=this.value">
      <input class="vr-qty" type="number" step="0.5" min="0.01" placeholder="Cant." value="${v.qty||''}" oninput="pfVariantesActual[${i}].qty=Number(this.value)||0">
      <button class="vr-del" onclick="eliminarVarianteForm(${i})">✕</button>
    </div>
  `).join('');
}

function agregarVarianteForm() {
  pfVariantesActual.push({
    key: 'v' + Date.now() + Math.floor(Math.random() * 1000),
    label: '',
    qty: 1
  });
  renderVariantesForm();
}

function eliminarVarianteForm(i) {
  pfVariantesActual.splice(i, 1);
  renderVariantesForm();
}

function togglePaqueteForm() {
  const on = document.getElementById('pf-usa-paquete').checked;
  document.getElementById('pf-paquete-wrap').style.display = on ? 'block' : 'none';
}

async function guardarProducto(id, def) {
  if (!db) {
    showToast('No está conectado a la nube (menú → Configuración)');
    return false;
  }
  try {
    await db.collection('doldichipa_productos').doc(id).set(def, {
      merge: true
    });
    return true;
  } catch (e) {
    showToast('No se pudo guardar el producto');
    return false;
  }
}

async function guardarProductoForm() {
  const nombre = document.getElementById('pf-nombre').value.trim();
  const unidad = document.getElementById('pf-unidad').value.trim() || 'unidades';
  if (!nombre) {
    showToast('Ponele un nombre al producto');
    return;
  }
  if (pfModoActual === 'variantes') {
    pfVariantesActual = pfVariantesActual.filter(v => v.label && v.qty > 0);
    if (pfVariantesActual.length === 0) {
      showToast('Agregá al menos una opción de venta con nombre y cantidad');
      return;
    }
  }
  const usaPaquete = document.getElementById('pf-usa-paquete').checked;
  const packLabel = document.getElementById('pf-paquete-nombre').value.trim();
  const packSize = Number(document.getElementById('pf-paquete-cantidad').value) || 0;
  if (usaPaquete && (!packLabel || packSize <= 0)) {
    showToast('Completá el nombre y la cantidad del paquete');
    return;
  }

  let id = pfEditId;
  if (!id) {
    const base = slugify(nombre);
    id = base;
    let i = 2;
    while (STATE.productos[id]) {
      id = base + '_' + i;
      i++;
    }
  }

  const def = {
    label: nombre,
    emoji: pfEmojiActual,
    unit: unidad,
    pricingMode: pfModoActual,
    variantes: pfModoActual === 'variantes' ? pfVariantesActual.map(v => ({
      key: v.key,
      label: v.label,
      qty: Number(v.qty)
    })) : [],
    packSize: usaPaquete ? packSize : null,
    packLabel: usaPaquete ? packLabel : null,
    orden: (STATE.productos[id] && STATE.productos[id].orden != null) ? STATE.productos[id].orden : Object.keys(STATE.productos).length
  };

  const ok = await guardarProducto(id, def);
  if (ok) {
    cerrarModal('overlay-producto-form');
    showToast('Producto guardado ✓');
  }
}

function confirmarEliminarProducto() {
  if (!pfEditId) return;
  const p = STATE.productos[pfEditId];
  const nombre = p ? p.label : pfEditId;
  if (!confirm('¿Eliminar "' + nombre + '"? El stock y las ventas ya registradas no se borran, pero el producto va a dejar de aparecer para vender.')) return;
  eliminarProductoUI(pfEditId);
}

async function eliminarProductoUI(id) {
  if (!db) {
    showToast('No está conectado a la nube (menú → Configuración)');
    return;
  }
  try {
    await db.collection('doldichipa_productos').doc(id).delete();
    cerrarModal('overlay-producto-form');
    showToast('Producto eliminado');
  } catch (e) {
    showToast('No se pudo eliminar el producto');
  }
}

function abrirProductoQR(id) {
  const p = STATE.productos[id];
  if (!p) return;
  document.getElementById('producto-qr-title').textContent = p.label + ' — Códigos QR';
  const ventaTxt = 'DOLDI:VENTA:' + id;
  const cargaCant = p.packSize || 1;
  const cargaTxt = 'DOLDI:CARGA:' + id + ':' + cargaCant;
  document.getElementById('producto-qr-carga-label').textContent = p.packSize ?
    ('Código de carga (1 ' + (p.packLabel || 'paquete') + ' = ' + p.packSize + ' ' + p.unit + ')') :
    ('Código de carga (agrega 1 ' + p.unit.replace(/s$/, '') + ')');
  try {
    if (typeof QRCode !== 'undefined') {
      QRCode.toCanvas(document.getElementById('producto-qr-venta'), ventaTxt, {
        width: 200
      });
      QRCode.toCanvas(document.getElementById('producto-qr-carga'), cargaTxt, {
        width: 200
      });
    } else {
      showToast('No se pudo cargar el generador de QR (revisá tu conexión a internet)');
    }
  } catch (e) {
    showToast('No se pudo generar el QR');
  }
  mostrarOverlay('overlay-producto-qr');
}

function renderVender() {
  // La pestaña Vender ya no muestra resumen de stock (se sacó a pedido).
}

function precioFor(prod, optKey) {
  const pr = STATE.precios[prod];
  const p = STATE.productos[prod];
  if (!pr || !p) return 0;
  if (p.pricingMode === 'libre') return pr.unidad || 0;
  return pr[optKey] || 0;
}

function productosOrdenados() {
  return Object.keys(STATE.productos).sort((a, b) => (STATE.productos[a].orden || 0) - (STATE.productos[b].orden || 0));
}

function renderStock() {
  const wrap = document.getElementById('stock-card');
  const ids = productosOrdenados();
  let html = '<h2>Disponible ahora</h2><p class="muted" style="margin-top:-6px;">Tocá un producto para corregir la cantidad.</p>';
  if (ids.length === 0) html += '<div class="empty">Todavía no cargaste productos. Andá a la pestaña Productos.</div>';
  ids.forEach(prod => {
    const p = STATE.productos[prod];
    const val = STATE.stock[prod] || 0;
    const low = p.packSize ? val < 1 : val < 3;
    html += `<div class="prod-row" style="cursor:pointer;" onclick="abrirEditarStock('${prod}')">
      <div class="prod-icon">${prodIconHtml(prod)}</div>
      <div style="flex:1;"><div class="prod-name">${p.label}</div><div class="unit-tag">${p.unit}</div></div>
      <div class="stock-num ${low?'low':''}">${fmtNumCorto(val)}</div>
      <svg class="chev" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>
    </div>`;
  });
  wrap.innerHTML = html;

  const proy = document.getElementById('proyeccion');
  let total = 0;
  let rows = '';
  ids.forEach(prod => {
    const p = STATE.productos[prod];
    const val = STATE.stock[prod] || 0;
    const monto = val * precioRefPorUnidad(prod);
    total += monto;
    rows += `<div class="prod-row"><div class="prod-icon">${prodIconHtml(prod)}</div><div style="flex:1;" class="prod-name">${p.label}</div><div class="stock-num">${fmtMoney(monto)}</div></div>`;
  });
  proy.innerHTML = rows + `<div class="prod-row"><div class="prod-name" style="flex:1;">Total proyectado</div><div class="stock-num" style="color:var(--orange-dark)">${fmtMoney(total)}</div></div>`;

  const totalVendidoReal = STATE.ventas.reduce((s, v) => s + v.monto, 0);
  document.getElementById('total-vendido-real').textContent = fmtMoney(totalVendidoReal);
}

function renderPrecios() {
  const wrap = document.getElementById('precios-productos');
  if (!wrap) return;
  const pr = STATE.precios;
  const ids = productosOrdenados();
  wrap.innerHTML = ids.map(prod => {
    const p = STATE.productos[prod];
    const accId = 'acc-precio-' + prod;
    let rows;
    if (p.pricingMode === 'libre') {
      rows = `<div class="row-input"><label>Precio por ${p.unit}</label>
        <div><span class="prefix">$</span><input type="text" inputmode="numeric" id="p-${prod}-unidad" oninput="formatMiles(this)"></div>
      </div>`;
    } else {
      rows = (p.variantes || []).map(v => `<div class="row-input"><label>${v.label}</label>
        <div><span class="prefix">$</span><input type="text" inputmode="numeric" id="p-${prod}-${v.key}" oninput="formatMiles(this)"></div>
      </div>`).join('');
    }
    return `<div class="acc-item">
      <button class="acc-header" data-target="${accId}" data-group="precios" onclick="toggleAccordion('${accId}','precios')">
        <span class="h2-icon">${prodIconHtml(prod, 18)}</span>
        <span style="flex:1; text-align:left;">${p.label}</span>
        <svg class="acc-chev" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
      </button>
      <div class="acc-body" id="${accId}" data-group="precios">${rows}</div>
    </div>`;
  }).join('');

  ids.forEach(prod => {
    const p = STATE.productos[prod];
    const precProd = pr[prod] || {};
    if (p.pricingMode === 'libre') {
      const el = document.getElementById('p-' + prod + '-unidad');
      if (el) el.value = precProd.unidad ? precProd.unidad.toLocaleString('es-AR') : '';
    } else {
      (p.variantes || []).forEach(v => {
        const el = document.getElementById('p-' + prod + '-' + v.key);
        if (el) el.value = precProd[v.key] ? precProd[v.key].toLocaleString('es-AR') : '';
      });
    }
  });
  const envio = pr.envio || {};
  document.getElementById('p-envio-cerca').value = envio.cerca ? envio.cerca.toLocaleString('es-AR') : '';
  document.getElementById('p-envio-lejos').value = envio.lejos ? envio.lejos.toLocaleString('es-AR') : '';
  document.getElementById('p-envio-cerca').style.borderColor = 'var(--border)';
  document.getElementById('p-envio-lejos').style.borderColor = 'var(--border)';
}

async function guardarPrecios() {
  const campos = [];
  productosOrdenados().forEach(prod => {
    const p = STATE.productos[prod];
    if (p.pricingMode === 'libre') {
      campos.push({
        id: 'p-' + prod + '-unidad',
        prod,
        key: 'unidad'
      });
    } else {
      (p.variantes || []).forEach(v => campos.push({
        id: 'p-' + prod + '-' + v.key,
        prod,
        key: v.key
      }));
    }
  });
  campos.push({
    id: 'p-envio-cerca',
    prod: 'envio',
    key: 'cerca'
  });
  campos.push({
    id: 'p-envio-lejos',
    prod: 'envio',
    key: 'lejos'
  });

  let faltantes = 0;
  campos.forEach(c => {
    const el = document.getElementById(c.id);
    if (!el) return;
    const val = parseMiles(el.value);
    if (!STATE.precios[c.prod]) STATE.precios[c.prod] = {};
    STATE.precios[c.prod][c.key] = val;
    if (val <= 0) {
      faltantes++;
      el.style.borderColor = 'var(--red)';
    } else {
      el.style.borderColor = 'var(--border)';
    }
  });

  const ok = await savePrecios();
  if (ok) {
    showToast(faltantes > 0 ?
      ('Precios guardados ✓ (quedaron ' + faltantes + ' en $0)') :
      'Precios guardados ✓');
  }
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
  productosOrdenados().forEach(prod => {
    const p = STATE.productos[prod];
    const sumQty = list.filter(v => v.prod === prod).reduce((s, v) => s + (v.qty || 0), 0);
    const sumMonto = list.filter(v => v.prod === prod).reduce((s, v) => s + v.monto, 0);
    const qtyTexto = fmtCantidad(prod, sumQty);
    resumenHtml += `<div class="prod-row">
      <div class="prod-icon">${prodIconHtml(prod)}</div>
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
        STATE.productos[v.prod] ? STATE.productos[v.prod].label : v.prod,
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
    const nombreProd = STATE.productos[v.prod] ? STATE.productos[v.prod].label : v.prod;
    return `<div class="venta-item">
      <div class="prod-icon" style="width:30px; height:30px; border-radius:8px;">${prodIconHtml(v.prod,15)}</div>
      <div style="flex:1;"><div class="p">${nombreProd}${envioTxt}</div><div class="t">${hora}</div></div>
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
    const medioTxt = m.medio ? (' · ' + (m.medio === 'efectivo' ? 'Efectivo' : 'Transferencia')) : '';
    return `<div class="venta-item">
      <div><div class="p">${esIngreso?'🟢':'🔴'} ${label}</div><div class="t">${hora}${medioTxt}</div></div>
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
  medioPagoRemis = 'efectivo';
  renderMedioPagoOpts('remis-mov-medio-opts', medioPagoRemis, 'seleccionarMedioRemis');
  mostrarOverlay('overlay-remis-mov');
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
    concepto,
    medio: medioPagoRemis
  });
  if (ok) {
    STATE.caja[medioPagoRemis] = (STATE.caja[medioPagoRemis] || 0) + (remisMovTipo === 'ingreso' ? monto : -monto);
    await saveCaja();
    cerrarModal('overlay-remis-mov');
    showToast((remisMovTipo === 'ingreso' ? 'Ingreso' : 'Gasto') + ' registrado ✓');
    renderCaja();
  }
}

/* ================= CAJA (efectivo / transferencia) ================= */
function renderMedioPagoOpts(containerId, actual, onClickFnName) {
  const wrap = document.getElementById(containerId);
  if (!wrap) return;
  const opts = [{
    key: 'efectivo',
    label: '💵 Efectivo'
  }, {
    key: 'transferencia',
    label: '🏦 Transferencia'
  }];
  wrap.innerHTML = opts.map(o => `<div class="qty-btn" style="${actual===o.key?'background:var(--orange-soft); border-color:var(--orange);':''}" onclick="${onClickFnName}('${o.key}')">${o.label}</div>`).join('');
}

let medioPagoVenta = 'efectivo';
let medioPagoRemis = 'efectivo';
let medioPagoPedido = 'efectivo';

function seleccionarMedioVenta(key) {
  medioPagoVenta = key;
  renderMedioPagoOpts('confirm-medio-opts', medioPagoVenta, 'seleccionarMedioVenta');
}

function seleccionarMedioRemis(key) {
  medioPagoRemis = key;
  renderMedioPagoOpts('remis-mov-medio-opts', medioPagoRemis, 'seleccionarMedioRemis');
}

function seleccionarMedioPedido(key) {
  medioPagoPedido = key;
  renderMedioPagoOpts('ped-medio-opts', medioPagoPedido, 'seleccionarMedioPedido');
}

function renderCaja() {
  const efectivo = STATE.caja.efectivo || 0;
  const transferencia = STATE.caja.transferencia || 0;
  document.getElementById('caja-efectivo').textContent = fmtMoney(efectivo);
  document.getElementById('caja-transferencia').textContent = fmtMoney(transferencia);
  document.getElementById('caja-total').textContent = fmtMoney(efectivo + transferencia);
}

let ajustarCajaMedio = 'efectivo';

function abrirAjustarCaja(medio) {
  ajustarCajaMedio = medio;
  document.getElementById('ajustar-caja-title').textContent = 'Ajustar ' + (medio === 'efectivo' ? 'efectivo' : 'transferencia');
  const val = STATE.caja[medio] || 0;
  document.getElementById('ajustar-caja-input').value = val ? val.toLocaleString('es-AR') : '';
  document.getElementById('ajustar-caja-input').style.borderColor = 'var(--border)';
  mostrarOverlay('overlay-ajustar-caja');
}

async function confirmarAjustarCaja() {
  const input = document.getElementById('ajustar-caja-input');
  const val = parseMiles(input.value);
  if (val < 0 || input.value.trim() === '') {
    input.style.borderColor = 'var(--red)';
    showToast('Ingresá un monto válido');
    return;
  }
  input.style.borderColor = 'var(--border)';
  STATE.caja[ajustarCajaMedio] = val;
  const ok = await saveCaja();
  if (ok) {
    cerrarModal('overlay-ajustar-caja');
    showToast('Saldo actualizado ✓');
  }
  renderCaja();
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
  if (p.tipo === 'producto_gratis') return 'Si el pedido tiene ' + p.cantidadLabel + ' o más de ' + (STATE.productos[p.prod] ? STATE.productos[p.prod].label : p.prod) + ', esa parte sale gratis';
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
  mostrarOverlay('overlay-premio-form');
}

function seleccionarTipoPremio(tipo) {
  tipoPremioActual = tipo;
  ['envio_gratis', 'producto_gratis'].forEach(t => {
    document.getElementById('premio-tipo-' + t).style.background = (t === tipo) ? 'var(--orange-soft)' : '';
  });
  const extra = document.getElementById('premio-campos-extra');
  if (tipo === 'producto_gratis') {
    const ids = productosOrdenados();
    if (ids.length === 0) {
      extra.innerHTML = '<p class="muted" style="margin:8px 0;">Todavía no cargaste productos.</p>';
      return;
    }
    extra.innerHTML = `
      <p class="muted" style="font-weight:700; margin:8px 0; font-size:12px; text-transform:uppercase;">Producto a regalar</p>
      <div class="grid3" style="margin-bottom:10px;">
        ${ids.map(id => `<div class="qty-btn" id="premio-prod-${id}" onclick="seleccionarProdPremio('${id}')">${STATE.productos[id].label}</div>`).join('')}
      </div>
      <div id="premio-cantidad-opts"></div>
    `;
    seleccionarProdPremio(ids[0]);
  } else {
    extra.innerHTML = '';
  }
}

let premioProdActual = null;
let premioCantidadActual = null;

function seleccionarProdPremio(prod) {
  premioProdActual = prod;
  productosOrdenados().forEach(p => {
    const el = document.getElementById('premio-prod-' + p);
    if (el) el.style.background = (p === prod) ? 'var(--orange-soft)' : '';
  });
  const wrap = document.getElementById('premio-cantidad-opts');
  const producto = STATE.productos[prod];
  const opts = producto.pricingMode === 'libre' ? [{
    key: 'unidad',
    label: '1 ' + producto.unit,
    qty: 1
  }] : (producto.variantes || []).filter((o, i, arr) => i < arr.length - 1 || arr.length === 1);
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

const DNI_MIN_DIGITOS = 6;

async function eliminarCliente(dni) {
  if (!db) {
    showToast('No está conectado a la nube (menú → Configuración)');
    return false;
  }
  try {
    await db.collection('doldichipa_clientes').doc(dni).delete();
    return true;
  } catch (e) {
    showToast('No se pudo eliminar el cliente');
    return false;
  }
}

async function eliminarClienteUI(dni, nombre) {
  const texto = document.getElementById('confirm-eliminar-cliente-texto');
  texto.textContent = '¿Eliminar a ' + (nombre || 'este cliente') + ' (DNI ' + dni + ')?';
  const btn = document.getElementById('confirm-eliminar-cliente-btn');
  btn.onclick = async () => {
    cerrarModal('overlay-confirm-eliminar-cliente');
    const eliminado = await eliminarCliente(dni);
    if (eliminado) showToast('Cliente eliminado');
  };
  mostrarOverlay('overlay-confirm-eliminar-cliente');
}

function buscarClienteEnMemoria(dni) {
  return STATE.clientes.find(c => c.dni === dni) || null;
}

function renderListaClientes() {
  const wrap = document.getElementById('clientes-lista');
  if (!wrap) return;
  const termino = (document.getElementById('clientes-buscar-input') || {}).value || '';
  const t = termino.trim().toLowerCase();
  let lista = STATE.clientes.slice().sort((a, b) => (b.puntos || 0) - (a.puntos || 0));
  if (t) {
    lista = lista.filter(c => (c.nombre || '').toLowerCase().includes(t) || c.dni.includes(t));
  }
  if (lista.length === 0) {
    wrap.innerHTML = '<div class="empty">' + (t ? 'No se encontró ningún cliente.' : 'Todavía no hay clientes cargados. Se crean solos al vender.') + '</div>';
    return;
  }
  wrap.innerHTML = lista.map(c => {
    const puntos = puntosVigentes(c);
    return `<div class="prod-row">
      <div style="flex:1;">
        <div class="prod-name">${c.nombre || 'Sin nombre'}</div>
        <div class="unit-tag">DNI ${c.dni} · Última compra: ${fmtFecha(c.ultimaCompra)}</div>
      </div>
      <div class="stock-num" style="color:var(--orange-dark);">${puntos} pts</div>
      <button class="btn btn-sm btn-ghost" style="padding:6px 10px;" onclick="eliminarClienteUI('${c.dni}', '${(c.nombre || '').replace(/'/g, "\\'")}')" aria-label="Eliminar cliente">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
          <path d="M10 11v6" />
          <path d="M14 11v6" />
          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
        </svg>
      </button>
    </div>`;
  }).join('');
}

/* ================= CONFIGURACIÓN DE PUNTOS ================= */
function renderConfigPuntos() {
  const input = document.getElementById('config-puntos-input');
  if (input) input.value = STATE.puntosPorMil;
}

let clienteVentaActual = null; // {dni, nombre, puntos, esNuevo}
let premioSeleccionadoVenta = null;

function onInputClienteVenta() {
  const dni = document.getElementById('venta-cliente-dni').value.trim();
  if (dni.length < DNI_MIN_DIGITOS) {
    clienteVentaActual = null;
    premioSeleccionadoVenta = null;
    renderClienteVenta();
    return;
  }
  const encontrado = buscarClienteEnMemoria(dni);
  if (encontrado) {
    clienteVentaActual = {
      dni,
      nombre: encontrado.nombre || '',
      puntos: puntosVigentes(encontrado),
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
      <p class="muted" style="margin:4px 0; color:var(--orange-dark); font-weight:600;">Cliente nuevo, se va a crear al confirmar el pedido.</p>
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
      html += sinCoincidir.map(p => `<div class="qty-btn" style="text-align:left; opacity:0.45;">${p.nombre}<span class="p">No hay ${STATE.productos[p.prod]?STATE.productos[p.prod].label:''} suficiente en este pedido</span></div>`).join('');
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
let destinoAgregar = 'venta'; // 'venta' | 'pedido' — a dónde van los productos que se eligen
let pedidoItemsActual = []; // items del pedido de la libreta que se está armando
let pedidoEnvioActual = null;

function stockDisponiblePedido(prod) {
  const enCarrito = carrito.filter(i => i.prod === prod).reduce((s, i) => s + i.qty, 0);
  const enPedidoActual = pedidoItemsActual.filter(i => i.prod === prod).reduce((s, i) => s + i.qty, 0);
  const enPedidosPendientes = STATE.pedidos
    .filter(p => p.estado === 'pendiente')
    .reduce((s, p) => s + (p.items || []).filter(i => i.prod === prod).reduce((s2, i) => s2 + i.qty, 0), 0);
  return (STATE.stock[prod] || 0) - enCarrito - enPedidoActual - enPedidosPendientes;
}

function iniciarVenta(prod, optKey, customOpt) {
  const producto = STATE.productos[prod];
  if (!producto) {
    showToast('Ese producto ya no existe');
    return;
  }
  const opt = customOpt || (producto.variantes || []).find(o => o.key === optKey);
  if (!opt) {
    showToast('No se encontró esa opción de venta');
    return;
  }
  const disponible = stockDisponiblePedido(prod);
  if (disponible < opt.qty) {
    showToast('No hay suficiente stock de ' + producto.label + ' (' + fmtCantidad(prod, disponible) + ' disponibles)');
    return;
  }
  const precio = customOpt ? customOpt.monto : precioFor(prod, optKey);
  if (!precio || precio <= 0) {
    showToast('Falta cargar el precio de ' + producto.label + ' en Precios');
    return;
  }
  if (destinoAgregar === 'pedido') {
    pedidoItemsActual.push({
      prod,
      optKey,
      qty: opt.qty,
      label: opt.label,
      monto: precio
    });
    renderPedidoItems();
    showToast('Agregado: ' + producto.label + ' - ' + opt.label);
  } else {
    carrito.push({
      prod,
      optKey,
      qty: opt.qty,
      label: opt.label,
      monto: precio
    });
    renderCarrito();
    showToast('Agregado al pedido: ' + producto.label + ' - ' + opt.label);
  }
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
      <div class="prod-icon">${prodIconHtml(item.prod)}</div>
      <div style="flex:1;"><div class="prod-name">${STATE.productos[item.prod]?STATE.productos[item.prod].label:item.prod}</div><div class="unit-tag">${item.label}</div></div>
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

/* ================= LIBRETA DE PEDIDOS ================= */
function abrirPedidoForm() {
  destinoAgregar = 'pedido';
  pedidoItemsActual = [];
  pedidoEnvioActual = null;
  medioPagoPedido = 'efectivo';
  document.getElementById('ped-cliente').value = '';
  renderPedidoItems();
  renderPedidoEnvioOpts();
  renderMedioPagoOpts('ped-medio-opts', medioPagoPedido, 'seleccionarMedioPedido');
  mostrarOverlay('overlay-pedido-form');
}

function renderPedidoItems() {
  const wrap = document.getElementById('ped-items-lista');
  if (pedidoItemsActual.length === 0) {
    wrap.innerHTML = '<div class="empty">Todavía no agregaste productos.</div>';
  } else {
    wrap.innerHTML = pedidoItemsActual.map((item, idx) => `
      <div class="prod-row">
        <div class="prod-icon">${prodIconHtml(item.prod)}</div>
        <div style="flex:1;"><div class="prod-name">${STATE.productos[item.prod]?STATE.productos[item.prod].label:item.prod}</div><div class="unit-tag">${item.label}</div></div>
        <div class="stock-num">${fmtMoney(item.monto)}</div>
        <button class="btn btn-sm btn-ghost" style="padding:6px 10px;" onclick="quitarDePedidoActual(${idx})">✕</button>
      </div>
    `).join('');
  }
  const subtotal = pedidoItemsActual.reduce((s, i) => s + i.monto, 0);
  document.getElementById('ped-subtotal').textContent = fmtMoney(subtotal);
}

function quitarDePedidoActual(idx) {
  pedidoItemsActual.splice(idx, 1);
  renderPedidoItems();
}

function renderPedidoEnvioOpts() {
  const wrap = document.getElementById('ped-envio-opts');
  const opts = [{
      key: null,
      label: 'Sin envío',
      precio: 0
    },
    {
      key: 'cerca',
      label: 'Envío cerca',
      precio: (STATE.precios.envio && STATE.precios.envio.cerca) || 0
    },
    {
      key: 'lejos',
      label: 'Envío lejos',
      precio: (STATE.precios.envio && STATE.precios.envio.lejos) || 0
    },
  ];
  wrap.innerHTML = opts.map(o => {
    const active = pedidoEnvioActual === o.key;
    return `<div class="qty-btn" style="${active?'background:var(--orange-soft); border-color:var(--orange);':''}" onclick="seleccionarEnvioPedido(${o.key?`'${o.key}'`:'null'})">${o.label}${o.precio? `<span class="p">${fmtMoney(o.precio)}</span>`:''}</div>`;
  }).join('');
}

function seleccionarEnvioPedido(key) {
  pedidoEnvioActual = key;
  renderPedidoEnvioOpts();
}

async function guardarPedido() {
  const cliente = document.getElementById('ped-cliente').value.trim();
  if (!cliente) {
    showToast('Poné el nombre o el teléfono de quién pidió');
    return;
  }
  if (pedidoItemsActual.length === 0) {
    showToast('Agregá al menos un producto al pedido');
    return;
  }
  if (!db) {
    showToast('No está conectado a la nube (menú → Configuración)');
    return;
  }
  try {
    await db.collection('doldichipa_pedidos').add({
      cliente,
      items: pedidoItemsActual,
      envio: pedidoEnvioActual,
      medioPago: medioPagoPedido,
      estado: 'pendiente',
      creadoTs: Date.now()
    });
    cerrarModal('overlay-pedido-form');
    showToast('Pedido de ' + cliente + ' anotado ✓');
    pedidoItemsActual = [];
    pedidoEnvioActual = null;
  } catch (e) {
    showToast('No se pudo guardar el pedido');
  }
}

function resumenItemsPedido(items) {
  return (items || []).map(i => i.label + ' de ' + (STATE.productos[i.prod] ? STATE.productos[i.prod].label : i.prod)).join(', ');
}

function renderPedidos() {
  const pendientes = STATE.pedidos.filter(p => p.estado === 'pendiente').sort((a, b) => a.creadoTs - b.creadoTs);
  const wrap = document.getElementById('pedidos-lista');
  if (pendientes.length === 0) {
    wrap.innerHTML = '<div class="empty">No hay pedidos en espera.</div>';
  } else {
    wrap.innerHTML = pendientes.map((p, idx) => {
      const subtotal = (p.items || []).reduce((s, i) => s + i.monto, 0) + (p.envio ? ((STATE.precios.envio && STATE.precios.envio[p.envio]) || 0) : 0);
      const esPrimero = idx === 0;
      return `<div class="product-item" style="align-items:flex-start; ${esPrimero?'background:var(--orange-soft); border-radius:var(--radius-sm); padding:12px; margin-bottom:10px; border-bottom:none;':'padding-bottom:14px;'}">
        <div style="flex:1;">
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
            ${esPrimero ? '<span style="background:var(--orange); color:#2a1a08; font-size:11px; font-weight:800; padding:2px 8px; border-radius:20px;">SIGUE ESTE</span>' : `<span class="muted" style="font-size:12px; font-weight:700;">#${idx+1}</span>`}
            <div class="prod-name">${p.cliente}</div>
          </div>
          <div class="unit-tag" style="white-space:normal;">${resumenItemsPedido(p.items)}${p.envio ? ' + envío ' + p.envio : ''}</div>
          <div class="stock-num" style="margin-top:6px; font-size:16px;">${fmtMoney(subtotal)}</div>
        </div>
        <div class="pi-actions" style="flex-direction:column; align-items:stretch;">
          <button class="btn btn-sm btn-green" onclick="confirmarPedidoListo('${p.id}')">Marcar listo</button>
          <button class="btn btn-sm btn-ghost" onclick="eliminarPedidoUI('${p.id}')">Eliminar</button>
        </div>
      </div>`;
    }).join('');
  }

  const hoyInicio = new Date();
  hoyInicio.setHours(0, 0, 0, 0);
  const listosHoy = STATE.pedidos
    .filter(p => p.estado === 'listo' && p.listoTs >= hoyInicio.getTime())
    .sort((a, b) => b.listoTs - a.listoTs);
  const wrapListos = document.getElementById('pedidos-listos-lista');
  if (listosHoy.length === 0) {
    wrapListos.innerHTML = '<div class="empty">Todavía no marcaste ningún pedido como listo hoy.</div>';
  } else {
    wrapListos.innerHTML = listosHoy.map(p => `
      <div class="venta-item">
        <div style="flex:1;"><div class="p">${p.cliente}</div><div class="t">${resumenItemsPedido(p.items)}</div></div>
      </div>
    `).join('');
  }
}

async function confirmarPedidoListo(id) {
  const pedido = STATE.pedidos.find(p => p.id === id);
  if (!pedido) return;
  if (!db) {
    showToast('No está conectado a la nube (menú → Configuración)');
    return;
  }

  const items = pedido.items || [];
  items.forEach(item => {
    STATE.stock[item.prod] = Math.max(0, (STATE.stock[item.prod] || 0) - item.qty);
  });

  const envioMonto = pedido.envio ? ((STATE.precios.envio && STATE.precios.envio[pedido.envio]) || 0) : 0;
  const ventaPromises = items.map((item, i) => {
    const esUltimo = i === items.length - 1;
    return addVenta({
      ts: Date.now(),
      prod: item.prod,
      optKey: item.optKey,
      qty: item.qty,
      qtyLabel: item.label,
      monto: item.monto + (esUltimo ? envioMonto : 0),
      envio: esUltimo ? pedido.envio : null
    });
  });

  const medioPago = pedido.medioPago || 'efectivo';
  const totalPedido = items.reduce((s, i) => s + i.monto, 0) + envioMonto;
  STATE.caja[medioPago] = (STATE.caja[medioPago] || 0) + totalPedido;

  const resultados = await Promise.all([
    saveStock(),
    saveCaja(),
    ...ventaPromises,
    db.collection('doldichipa_pedidos').doc(id).update({
      estado: 'listo',
      listoTs: Date.now()
    }).then(() => true).catch(() => false)
  ]);

  if (resultados.every(Boolean)) {
    const siguiente = STATE.pedidos
      .filter(p => p.estado === 'pendiente' && p.id !== id)
      .sort((a, b) => a.creadoTs - b.creadoTs)[0];
    let msg = 'Pedido de ' + pedido.cliente + ' listo ✓';
    msg += siguiente ?
      (' — Sigue: ' + siguiente.cliente + ' (' + resumenItemsPedido(siguiente.items) + ')') :
      ' — No quedan más pedidos en espera';
    showToast(msg);
  } else {
    showToast('Hubo un problema al marcar el pedido como listo. Probá de nuevo.');
  }
  renderPedidos();
  renderStock();
  renderVender();
  renderVentas();
  renderCaja();
}

async function eliminarPedidoUI(id) {
  const pedido = STATE.pedidos.find(p => p.id === id);
  if (!confirm('¿Eliminar el pedido de "' + (pedido ? pedido.cliente : '') + '"? No se puede deshacer.')) return;
  if (!db) {
    showToast('No está conectado a la nube (menú → Configuración)');
    return;
  }
  try {
    await db.collection('doldichipa_pedidos').doc(id).delete();
    showToast('Pedido eliminado');
  } catch (e) {
    showToast('No se pudo eliminar el pedido');
  }
}

function toDatetimeLocalValue(d) {
  const pad = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

function abrirFinalizarPedido() {
  if (carrito.length === 0) return;
  const body = document.getElementById('confirm-body');
  const subtotal = carrito.reduce((s, i) => s + i.monto, 0);
  body.innerHTML = carrito.map(item => `
    <div class="prod-row">
      <div class="prod-icon">${prodIconHtml(item.prod)}</div>
      <div style="flex:1;"><div class="prod-name">${STATE.productos[item.prod]?STATE.productos[item.prod].label:item.prod}</div><div class="unit-tag">${item.label}</div></div>
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
  document.getElementById('venta-fecha-hora').value = toDatetimeLocalValue(new Date());
  medioPagoVenta = 'efectivo';
  renderMedioPagoOpts('confirm-medio-opts', medioPagoVenta, 'seleccionarMedioVenta');
  renderEnvioOpts();
  mostrarOverlay('overlay-confirm');
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
  let tsElegido = Date.now();
  const fechaInput = document.getElementById('venta-fecha-hora');
  if (fechaInput && fechaInput.value) {
    const parsed = new Date(fechaInput.value);
    if (!isNaN(parsed.getTime())) tsElegido = parsed.getTime();
  }
  const ventaPromises = items.map((item, i) => {
    const esUltimo = i === items.length - 1;
    return addVenta({
      ts: tsElegido,
      prod: item.prod,
      optKey: item.optKey,
      qty: item.qty,
      qtyLabel: item.label,
      monto: item.monto + (esUltimo ? envioMonto : 0),
      envio: esUltimo ? envioSeleccionado : null
    });
  });

  const promesas = [saveStock(), ...ventaPromises];

  // Sumar el total de esta venta a la caja (efectivo o transferencia)
  const totalVenta = items.reduce((s, i) => s + i.monto, 0) + envioMonto;
  STATE.caja[medioPagoVenta] = (STATE.caja[medioPagoVenta] || 0) + totalVenta;
  promesas.push(saveCaja());

  // Si hay un cliente cargado, sumar/descontar sus puntos también en paralelo
  if (clienteVentaActual) {
    const puntosGanados = Math.floor(subtotalOriginal / 1000) * (STATE.puntosPorMil || 1);
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
  renderCaja();
}

/* ================= CARGA FLOW ================= */
/* ================= STOCK: agregar / corregir / vaciar (todo junto) ================= */
let editarStockProd = null;

function abrirEditarStock(prod) {
  editarStockProd = prod;
  const p = STATE.productos[prod];
  if (!p) return;
  document.getElementById('editar-stock-title').textContent = p.label + ' — Stock';

  // Sección "Agregar stock"
  document.getElementById('agregar-stock-label').textContent = p.packSize ?
    ('Cantidad de ' + (p.packLabel || 'paquetes') + ' (' + p.packSize + ' ' + p.unit + ' c/u)') :
    ('Cantidad de ' + p.unit + ' a agregar');
  const agregarInput = document.getElementById('agregar-stock-input');
  agregarInput.value = '';
  agregarInput.style.borderColor = 'var(--border)';
  agregarInput.step = '1';
  document.getElementById('agregar-stock-preview').textContent = '';
  actualizarPreviewAgregarStock();

  // Sección "Corregir cantidad exacta"
  const editarInput = document.getElementById('editar-stock-input');
  editarInput.step = '0.5';
  editarInput.value = STATE.stock[prod] || 0;
  editarInput.style.borderColor = 'var(--border)';
  document.getElementById('editar-stock-label').textContent = 'Cantidad (' + p.unit + ')';

  mostrarOverlay('overlay-editar-stock');
}

function actualizarPreviewAgregarStock() {
  if (!editarStockProd) return;
  const p = STATE.productos[editarStockProd];
  const val = Number(document.getElementById('agregar-stock-input').value) || 0;
  if (p.packSize) {
    document.getElementById('agregar-stock-preview').textContent = val > 0 ? '= ' + (val * p.packSize) + ' ' + p.unit : '';
  } else {
    document.getElementById('agregar-stock-preview').textContent = '';
  }
}

async function confirmarAgregarStock() {
  const input = document.getElementById('agregar-stock-input');
  const val = Number(input.value);
  if (!val || val <= 0) {
    input.style.borderColor = 'var(--red)';
    showToast('Ingresá una cantidad válida');
    return;
  }
  input.style.borderColor = 'var(--border)';
  const p = STATE.productos[editarStockProd];
  const aAgregar = p.packSize ? val * p.packSize : val;
  STATE.stock[editarStockProd] = (STATE.stock[editarStockProd] || 0) + aAgregar;
  const ok = await saveStock();
  if (ok) {
    showToast('+ ' + aAgregar + ' ' + p.unit + ' de ' + p.label + ' agregadas ✓');
    input.value = '';
    document.getElementById('agregar-stock-preview').textContent = '';
    document.getElementById('editar-stock-input').value = STATE.stock[editarStockProd];
  }
  renderStock();
  renderVender();
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
    showToast('Stock de ' + STATE.productos[editarStockProd].label + ' actualizado ✓');
  }
  renderStock();
  renderVender();
}
async function vaciarStock() {
  STATE.stock[editarStockProd] = 0;
  const ok = await saveStock();
  if (ok) {
    cerrarModal('overlay-editar-stock');
    showToast('Stock de ' + STATE.productos[editarStockProd].label + ' vaciado ✓');
  }
  renderStock();
  renderVender();
}

/* ================= REINICIAR SISTEMA ================= */
function abrirReiniciarSistema() {
  closeDrawer();
  mostrarOverlay('overlay-reset');
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
    await db.collection('doldichipa').doc('stock').set({});
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
  scannerMode = modeArg || 'venta';
  document.getElementById('scanner-title').textContent = 'Escanear bolsita de venta';
  document.getElementById('scan-status').textContent = 'Buscando código...';
  mostrarOverlay('overlay-scanner');

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
    const prod = (parts[2] || '').toLowerCase();
    const p = STATE.productos[prod];
    if (!p) {
      document.getElementById('scan-status').textContent = 'Código no reconocido.';
      scannerLoopId = requestAnimationFrame(scanLoop);
      return;
    }
    reproducirBip();
    cerrarScanner();
    if (tipo === 'VENTA') {
      destinoAgregar = 'venta';
      abrirSelectorCantidad(prod);
    } else if (tipo === 'CARGA') {
      const cant = Number(parts[3]) || p.packSize || 1;
      STATE.stock[prod] = (STATE.stock[prod] || 0) + cant;
      saveStock();
      showToast('+ ' + cant + ' ' + p.unit + ' de ' + p.label + ' cargadas ✓');
      renderStock();
      renderVender();
    }
  } catch (errHandle) {
    showToast('Error al procesar el QR: ' + (errHandle.message || errHandle));
  }
}

function abrirElegirProducto(destino) {
  destinoAgregar = destino || 'venta';
  const wrap = document.getElementById('elegir-producto-lista');
  const ids = productosOrdenados();
  if (ids.length === 0) {
    wrap.innerHTML = '<div class="empty">Todavía no cargaste productos. Andá a Productos → + Nuevo producto.</div>';
  } else {
    wrap.innerHTML = ids.map(id => {
      const p = STATE.productos[id];
      return `<div class="prod-row" style="cursor:pointer;" onclick="cerrarModal('overlay-elegir-producto'); abrirSelectorCantidad('${id}')">
        <div class="prod-icon">${prodIconHtml(id)}</div>
        <div style="flex:1;" class="prod-name">${p.label}</div>
        <svg class="chev" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>
      </div>`;
    }).join('');
  }
  mostrarOverlay('overlay-elegir-producto');
}

let libreQtyProd = null;
let libreQtyActual = 1;

function abrirSelectorCantidad(prod) {
  const p = STATE.productos[prod];
  if (!p) {
    showToast('Ese producto ya no existe');
    return;
  }
  document.getElementById('qty-title').innerHTML = `<span style="display:inline-flex; align-items:center; gap:8px; vertical-align:middle;">${prodIconHtml(prod,20)} ${p.label} — elegí la cantidad</span>`;
  document.getElementById('qty-stock').textContent = 'Stock disponible: ' + fmtCantidad(prod, stockDisponiblePedido(prod));
  const wrap = document.getElementById('qty-options');
  wrap.innerHTML = '';

  if (p.pricingMode === 'libre') {
    // Cantidad libre con +/-
    libreQtyProd = prod;
    libreQtyActual = 1;
    wrap.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:center; gap:24px; padding:14px 0 6px;">
        <button class="btn btn-gold" style="width:52px; height:52px; border-radius:50%; font-size:26px; padding:0; line-height:1;" onclick="cambiarCantidadLibre(-1)">−</button>
        <div style="font-size:34px; font-weight:800; min-width:56px; text-align:center;" id="libre-qty-display">1</div>
        <button class="btn btn-gold" style="width:52px; height:52px; border-radius:50%; font-size:26px; padding:0; line-height:1;" onclick="cambiarCantidadLibre(1)">+</button>
      </div>
      <p class="muted" style="text-align:center; margin:4px 0 14px;" id="libre-qty-precio">$0</p>
      <button class="btn btn-green btn-block" onclick="confirmarCantidadLibre()">Continuar</button>
    `;
    actualizarDisplayLibre();
  } else {
    (p.variantes || []).forEach(o => {
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
  mostrarOverlay('overlay-qty');
}

function cambiarCantidadLibre(delta) {
  const nueva = libreQtyActual + delta;
  if (nueva < 1) return;
  const stockVal = stockDisponiblePedido(libreQtyProd);
  if (nueva > stockVal) {
    showToast('No hay suficiente stock de ' + STATE.productos[libreQtyProd].label + ' (' + fmtCantidad(libreQtyProd, stockVal) + ' disponibles)');
    return;
  }
  libreQtyActual = nueva;
  actualizarDisplayLibre();
}

function actualizarDisplayLibre() {
  document.getElementById('libre-qty-display').textContent = libreQtyActual;
  const precioUnidad = (STATE.precios[libreQtyProd] && STATE.precios[libreQtyProd].unidad) || 0;
  document.getElementById('libre-qty-precio').textContent = fmtMoney(precioUnidad * libreQtyActual);
}

function confirmarCantidadLibre() {
  const p = STATE.productos[libreQtyProd];
  const precioUnidad = (STATE.precios[libreQtyProd] && STATE.precios[libreQtyProd].unidad) || 0;
  cerrarModal('overlay-qty');
  iniciarVenta(libreQtyProd, 'custom', {
    qty: libreQtyActual,
    label: libreQtyActual + ' ' + p.unit,
    monto: precioUnidad * libreQtyActual
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