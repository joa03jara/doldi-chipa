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
    total: 0
  },
  puntosPorMil: 1
};
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
    // Compatible con la versión anterior (que guardaba efectivo/transferencia
    // por separado): si existe ese formato viejo, se suma para armar el total.
    const d = doc.exists ? doc.data() : {};
    const total = (typeof d.total === 'number') ? d.total : ((d.efectivo || 0) + (d.transferencia || 0));
    STATE.caja = {
      total
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
  showToast('Conectado a la nube');
  irATab('stock');
}

/* ================= NOTIFICACIONES ENTRE CELULARES (OneSignal) ================= */
const PERSONAS = ['Joaquín', 'Belén'];

function otraPersona(nombre) {
  return PERSONAS.find(p => p !== nombre) || null;
}

function renderQuienSoyOpts() {
  const wrap = document.getElementById('quien-soy-opts');
  if (!wrap) return;
  const actual = localStorage.getItem('doldi_quien_soy');
  wrap.innerHTML = PERSONAS.map(nombre => {
    const activo = actual === nombre;
    return `<div class="qty-btn" style="${activo?'background:var(--orange-soft); border-color:var(--orange);':''}" onclick="elegirQuienSoy('${nombre}')">${nombre}${activo?' ✓':''}</div>`;
  }).join('');
}

function elegirQuienSoy(nombre) {
  localStorage.setItem('doldi_quien_soy', nombre);
  renderQuienSoyOpts();
  aplicarQuienSoyGuardado();
  showToast('Listo, quedaste como ' + nombre);
}

// Le avisa a OneSignal quién es esta persona (para poder mandarle avisos
// específicamente a "la otra"). Se llama al elegir el nombre y también al
// cargar la app, una vez que el SDK de OneSignal terminó de iniciar.
function aplicarQuienSoyGuardado() {
  const nombre = localStorage.getItem('doldi_quien_soy');
  if (!nombre || !window.OneSignalDeferred) return;
  window.OneSignalDeferred.push(async function(OneSignal) {
    try {
      await OneSignal.Notifications.requestPermission();
      await OneSignal.User.addTag('persona', nombre);
    } catch (e) {
      // Si el navegador bloquea los permisos no pasa nada grave, seguimos igual.
    }
  });
}

// URL de la función de Netlify que reenvía el aviso a OneSignal de forma
// segura (la clave secreta vive en Netlify, nunca acá ni en GitHub).
// Se actualiza una sola vez, cuando Netlify te da la URL de tu sitio.
const NOTIFICAR_URL = 'https://fanciful-frangipane-0ae108.netlify.app/.netlify/functions/notificar';

// Avisa a "la otra persona" que hay un pedido nuevo para preparar. Si este
// celular no tiene configurado quién es, o todavía no se conectó Netlify,
// no hace nada (no bloquea ni molesta con errores).
async function notificarPedidoNuevo(pedido) {
  const yo = localStorage.getItem('doldi_quien_soy');
  const destino = otraPersona(yo);
  if (!yo || !destino || !NOTIFICAR_URL || NOTIFICAR_URL.includes('PEGAR_ACA')) return;
  try {
    const resp = await fetch(NOTIFICAR_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        destino,
        titulo: pedido.cliente || 'Cliente',
        mensaje: resumenItemsPedido(pedido.items)
      })
    });
    if (!resp.ok) {
      const detalle = await resp.text().catch(() => '');
      console.error('Fallo al notificar:', resp.status, detalle);
      showToast('Pedido guardado, pero no se pudo avisar por notificación');
    }
  } catch (e) {
    console.error('Fallo al notificar:', e);
    showToast('Pedido guardado, pero no se pudo avisar por notificación');
  }
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
    showToast('Configuración guardada');
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

// Ventana de confirmación propia de la app (con el mismo estilo que todo lo
// demás), en vez del cartel genérico del navegador con la URL del sitio.
function confirmarAccion(titulo, mensaje, onAceptar) {
  document.getElementById('confirm-generico-titulo').textContent = titulo;
  document.getElementById('confirm-generico-mensaje').textContent = mensaje;
  const btn = document.getElementById('confirm-generico-btn');
  btn.onclick = () => {
    cerrarModal('overlay-confirm-generico');
    onAceptar();
  };
  mostrarOverlay('overlay-confirm-generico');
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
  else if (name === 'ventas') {
    renderVentas();
    renderResumen();
  } else if (name === 'remis') renderRemis();
  else if (name === 'vender') renderVender();
  else if (name === 'clientes') {
    renderPremios();
    renderConfigPuntos();
    document.getElementById('clientes-buscar-input').value = '';
    renderListaClientes();
  } else if (name === 'config') {
    renderQuienSoyOpts();
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

// Opciones de venta fijas para el modo "Por docena" — no hay que escribir
// nombre ni cantidad a mano, solo tildar cuáles de estas tres usar.
const OPCIONES_DOCENA = [{
    key: 'media',
    label: 'Media docena',
    qty: 0.5,
    checkboxId: 'pf-opt-media'
  },
  {
    key: 'docena',
    label: 'Docena',
    qty: 1,
    checkboxId: 'pf-opt-docena'
  },
  {
    key: 'docenaymedia',
    label: 'Docena y media',
    qty: 1.5,
    checkboxId: 'pf-opt-docenaymedia'
  },
];

let pfEditId = null;
let pfEmojiActual = '📦';
let pfModoActual = 'libre';

function abrirProductoForm(editId) {
  pfEditId = editId || null;
  const grid = document.getElementById('pf-emoji-grid');
  grid.innerHTML = EMOJIS_PRODUCTO.map(e => `<div class="emoji-opt" data-e="${e}" onclick="seleccionarEmojiForm('${e}')">${e}</div>`).join('');

  document.getElementById('producto-form-title').textContent = editId ? 'Editar producto' : 'Nuevo producto';
  document.getElementById('pf-eliminar-btn').style.display = editId ? 'block' : 'none';

  if (editId && STATE.productos[editId]) {
    const p = STATE.productos[editId];
    document.getElementById('pf-nombre').value = p.label || '';
    pfEmojiActual = p.emoji || '📦';
    pfModoActual = p.pricingMode || 'libre';
    OPCIONES_DOCENA.forEach(o => {
      const yaEstaba = (p.variantes || []).some(v => v.key === o.key);
      document.getElementById(o.checkboxId).checked = pfModoActual === 'variantes' ? yaEstaba : true;
    });
  } else {
    document.getElementById('pf-nombre').value = '';
    pfEmojiActual = '📦';
    pfModoActual = 'libre';
    OPCIONES_DOCENA.forEach(o => {
      document.getElementById(o.checkboxId).checked = true;
    });
  }
  seleccionarEmojiForm(pfEmojiActual);
  seleccionarModoPrecio(pfModoActual);
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
  document.getElementById('pf-variantes-wrap').style.display = modo === 'variantes' ? 'block' : 'none';
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
  if (!nombre) {
    showToast('Ponele un nombre al producto');
    return;
  }

  let variantes = [];
  if (pfModoActual === 'variantes') {
    variantes = OPCIONES_DOCENA.filter(o => document.getElementById(o.checkboxId).checked)
      .map(o => ({
        key: o.key,
        label: o.label,
        qty: o.qty
      }));
    if (variantes.length === 0) {
      showToast('Tildá al menos una opción de venta (media docena, docena, etc.)');
      return;
    }
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
    unit: pfModoActual === 'variantes' ? 'docenas' : 'unidades',
    pricingMode: pfModoActual,
    variantes,
    packSize: null,
    packLabel: null,
    orden: (STATE.productos[id] && STATE.productos[id].orden != null) ? STATE.productos[id].orden : Object.keys(STATE.productos).length
  };

  const ok = await guardarProducto(id, def);
  if (ok) {
    cerrarModal('overlay-producto-form');
    showToast('Producto guardado');
  }
}

function confirmarEliminarProducto() {
  if (!pfEditId) return;
  const p = STATE.productos[pfEditId];
  const nombre = p ? p.label : pfEditId;
  confirmarAccion(
    'Eliminar ' + nombre,
    'El stock y las ventas ya registradas no se borran, pero el producto va a dejar de aparecer para vender.',
    () => eliminarProductoUI(pfEditId)
  );
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
      rows += `<div class="row-input"><label>Unidad suelta (opcional)</label>
        <div><span class="prefix">$</span><input type="text" inputmode="numeric" id="p-${prod}-suelta" oninput="formatMiles(this)"></div>
      </div>`;
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
      const elSuelta = document.getElementById('p-' + prod + '-suelta');
      if (elSuelta) elSuelta.value = precProd.suelta ? precProd.suelta.toLocaleString('es-AR') : '';
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
      campos.push({
        id: 'p-' + prod + '-suelta',
        prod,
        key: 'suelta',
        opcional: true
      });
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
    if (val <= 0 && !c.opcional) {
      faltantes++;
      el.style.borderColor = 'var(--red)';
    } else {
      el.style.borderColor = 'var(--border)';
    }
  });

  const ok = await savePrecios();
  if (ok) {
    showToast(faltantes > 0 ?
      ('Precios guardados (quedaron ' + faltantes + ' en $0)') :
      'Precios guardados');
  }
  renderVender();
  renderStock();
}

let rangoVentas = 'hoy';

function cambiarRango(r) {
  rangoVentas = r;
  document.querySelectorAll('.segmented button[data-range]').forEach(b => b.classList.toggle('active', b.dataset.range === r));
  renderVentas();
  renderResumen();
}

function renderVentas() {
  let list = filtrarPorRango(STATE.ventas, rangoVentas).slice().sort((a, b) => b.ts - a.ts);
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
  // Sin tildes, para que buscar "maria" encuentre "María" igual.
  const sinTildes = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const term = searchEl ? sinTildes(searchEl.value.trim().toLowerCase()) : '';
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
      const pedidoVinculado = v.pedidoId ? STATE.pedidos.find(p => p.id === v.pedidoId) : null;
      const texto = sinTildes([
        STATE.productos[v.prod] ? STATE.productos[v.prod].label : v.prod,
        v.qtyLabel || '',
        envioTxt,
        pedidoVinculado ? pedidoVinculado.cliente : '',
        fecha1, fecha2,
        String(v.monto),
        fmtMoney(v.monto)
      ].join(' ').toLowerCase());
      return texto.includes(term);
    });
  }
  if (listFiltrada.length === 0) {
    wrap.innerHTML = `<div class="empty">${term ? 'No se encontraron ventas para "'+searchEl.value+'".' : 'Todavía no hay ventas registradas en este período.'}</div>`;
    return;
  }

  // Agrupar por día: cada día es un encabezado con su total, y debajo las
  // ventas de ese día (así no hay que mirar dos lugares distintos para
  // "cuánto hice" y "qué vendí" en una fecha puntual).
  const grupos = [];
  let grupoActual = null;
  listFiltrada.forEach(v => {
    const d = new Date(v.ts);
    const clave = d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate();
    if (!grupoActual || grupoActual.clave !== clave) {
      grupoActual = {
        clave,
        etiqueta: d.toLocaleDateString('es-AR', {
          weekday: 'long',
          day: '2-digit',
          month: '2-digit'
        }),
        total: 0,
        ventas: []
      };
      grupos.push(grupoActual);
    }
    grupoActual.total += v.monto;
    grupoActual.ventas.push(v);
  });

  wrap.innerHTML = grupos.map(g => {
    const etiqueta = g.etiqueta.charAt(0).toUpperCase() + g.etiqueta.slice(1);
    const filasVentas = g.ventas.map(v => {
      const hora = new Date(v.ts).toLocaleTimeString('es-AR', {
        hour: '2-digit',
        minute: '2-digit'
      });
      const envioTxt = v.envio === 'cerca' ? ' + envío cerca' : v.envio === 'lejos' ? ' + envío lejos' : '';
      const nombreProd = STATE.productos[v.prod] ? STATE.productos[v.prod].label : v.prod;
      const pedidoVinculado = v.pedidoId ? STATE.pedidos.find(p => p.id === v.pedidoId) : null;
      const clienteTxt = (pedidoVinculado && pedidoVinculado.cliente && pedidoVinculado.cliente.toLowerCase() !== 'sin nombre') ? (pedidoVinculado.cliente + ' · ') : '';
      return `<div class="venta-item">
        <div class="prod-icon" style="width:30px; height:30px; border-radius:8px;">${prodIconHtml(v.prod,15)}</div>
        <div style="flex:1;"><div class="p">${nombreProd}${envioTxt}</div><div class="t">${clienteTxt}${hora}</div></div>
        <div class="m">${fmtMoney(v.monto)}</div>
        <button class="btn btn-sm btn-ghost" style="padding:6px 10px; margin-left:8px;" onclick="eliminarVentaUI('${v.id}')">✕</button>
      </div>`;
    }).join('');
    return `<div class="historial-row">
      <div class="historial-top">
        <span class="historial-label">${etiqueta}</span>
        <span class="historial-monto">${fmtMoney(g.total)}</span>
      </div>
      ${filasVentas}
    </div>`;
  }).join('');
}

function eliminarVentaUI(id) {
  const venta = STATE.ventas.find(v => v.id === id);
  if (!venta) return;
  const nombreProd = STATE.productos[venta.prod] ? STATE.productos[venta.prod].label : venta.prod;
  confirmarAccion(
    'Eliminar venta de ' + nombreProd,
    'Se devuelve el stock vendido y se descuenta ' + fmtMoney(venta.monto) + ' de la caja. No se puede deshacer.',
    () => eliminarVentaConfirmada(id)
  );
}

async function eliminarVentaConfirmada(id) {
  const venta = STATE.ventas.find(v => v.id === id);
  if (!venta) return;
  if (!db) {
    showToast('No está conectado a la nube (menú → Configuración)');
    return;
  }
  try {
    STATE.stock[venta.prod] = (STATE.stock[venta.prod] || 0) + (venta.qty || 0);
    STATE.caja.total = (STATE.caja.total || 0) - (venta.monto || 0);
    const promesas = [
      db.collection('doldichipa_ventas').doc(id).delete(),
      saveStock(),
      saveCaja()
    ];
    // Si esta era la última venta de ese pedido, también se saca de "Completados hoy"
    if (venta.pedidoId) {
      const quedanOtras = STATE.ventas.some(v => v.id !== id && v.pedidoId === venta.pedidoId);
      if (!quedanOtras) {
        promesas.push(db.collection('doldichipa_pedidos').doc(venta.pedidoId).delete().catch(() => {}));
      }
    }
    await Promise.all(promesas);
    showToast('Venta eliminada');
  } catch (e) {
    showToast('No se pudo eliminar la venta');
  }
  renderVentas();
  renderStock();
  renderCaja();
  renderResumen();
  renderPedidos();
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
      <button class="btn btn-sm btn-ghost" style="padding:6px 10px; margin-left:8px;" onclick="eliminarRemisUI('${m.id}')">✕</button>
    </div>`;
  }).join('');
}

function eliminarRemisUI(id) {
  const mov = STATE.remis.find(m => m.id === id);
  if (!mov) return;
  const label = mov.concepto ? mov.concepto : (mov.tipo === 'ingreso' ? 'Ingreso' : 'Gasto');
  confirmarAccion(
    'Eliminar movimiento: ' + label,
    'Se ajusta la caja para descontar este movimiento. No se puede deshacer.',
    () => eliminarRemisConfirmado(id)
  );
}

async function eliminarRemisConfirmado(id) {
  const mov = STATE.remis.find(m => m.id === id);
  if (!mov) return;
  if (!db) {
    showToast('No está conectado a la nube (menú → Configuración)');
    return;
  }
  try {
    STATE.caja.total = (STATE.caja.total || 0) - (mov.tipo === 'ingreso' ? mov.monto : -mov.monto);
    await Promise.all([
      db.collection('doldichipa_remis').doc(id).delete(),
      saveCaja()
    ]);
    showToast('Movimiento eliminado');
  } catch (e) {
    showToast('No se pudo eliminar el movimiento');
  }
  renderRemis();
  renderCaja();
  renderResumen();
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
    concepto
  });
  if (ok) {
    STATE.caja.total = (STATE.caja.total || 0) + (remisMovTipo === 'ingreso' ? monto : -monto);
    await saveCaja();
    cerrarModal('overlay-remis-mov');
    showToast((remisMovTipo === 'ingreso' ? 'Ingreso' : 'Gasto') + ' registrado');
    renderCaja();
  }
}

/* ================= CAJA (total en mano) ================= */
function renderCaja() {
  document.getElementById('caja-total').textContent = fmtMoney(STATE.caja.total || 0);
}

function abrirAjustarCaja() {
  const val = STATE.caja.total || 0;
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
  STATE.caja.total = val;
  const ok = await saveCaja();
  if (ok) {
    cerrarModal('overlay-ajustar-caja');
    showToast('Saldo actualizado');
  }
  renderCaja();
}

/* ================= RESUMEN GENERAL (comparte el rango con Ventas) ================= */

function renderResumen() {
  const ventasList = filtrarPorRango(STATE.ventas, rangoVentas);
  const totalChipa = ventasList.reduce((s, v) => s + v.monto, 0);
  const remisList = filtrarPorRango(STATE.remis, rangoVentas);
  const ingresos = remisList.filter(m => m.tipo === 'ingreso').reduce((s, m) => s + m.monto, 0);
  const gastos = remisList.filter(m => m.tipo === 'gasto').reduce((s, m) => s + m.monto, 0);
  const netoRemis = ingresos - gastos;
  const total = totalChipa + netoRemis;
  document.getElementById('ventas-total').textContent = fmtMoney(total);
  document.getElementById('resumen-chipa').textContent = fmtMoney(totalChipa);
  document.getElementById('resumen-remis').textContent = fmtMoney(netoRemis);
  renderHistorial();
}

/* ================= HISTORIAL (por día / semana / mes) ================= */
let periodoHistorial = 'dia';

function cambiarPeriodoHistorial(p) {
  periodoHistorial = p;
  document.querySelectorAll('#tab-ventas .segmented button[data-periodo]').forEach(b => b.classList.toggle('active', b.dataset.periodo === p));
  renderHistorial();
}

// Clave y etiqueta de cada "balde" de tiempo, según el período elegido.
function claveYEtiquetaPeriodo(ts, tipo) {
  const d = new Date(ts);
  if (tipo === 'dia') {
    const clave = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const etiqueta = d.toLocaleDateString('es-AR', {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit'
    });
    return {
      clave,
      etiqueta,
      orden: d.setHours(0, 0, 0, 0)
    };
  }
  if (tipo === 'semana') {
    // Semana que arranca el lunes.
    const diaSemana = (d.getDay() + 6) % 7; // 0 = lunes
    const lunes = new Date(d);
    lunes.setHours(0, 0, 0, 0);
    lunes.setDate(d.getDate() - diaSemana);
    const clave = lunes.getFullYear() + '-' + String(lunes.getMonth() + 1).padStart(2, '0') + '-' + String(lunes.getDate()).padStart(2, '0');
    const etiqueta = 'Semana del ' + lunes.toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit'
    });
    return {
      clave,
      etiqueta,
      orden: lunes.getTime()
    };
  }
  // mes
  const clave = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  const etiqueta = d.toLocaleDateString('es-AR', {
    month: 'long',
    year: 'numeric'
  });
  return {
    clave,
    etiqueta,
    orden: new Date(d.getFullYear(), d.getMonth(), 1).getTime()
  };
}

function agruparPorPeriodo(tipo) {
  const buckets = {};
  STATE.ventas.forEach(v => {
    const {
      clave,
      etiqueta,
      orden
    } = claveYEtiquetaPeriodo(v.ts, tipo);
    if (!buckets[clave]) buckets[clave] = {
      etiqueta,
      orden,
      total: 0
    };
    buckets[clave].total += v.monto;
  });
  STATE.remis.forEach(m => {
    const {
      clave,
      etiqueta,
      orden
    } = claveYEtiquetaPeriodo(m.ts, tipo);
    if (!buckets[clave]) buckets[clave] = {
      etiqueta,
      orden,
      total: 0
    };
    buckets[clave].total += (m.tipo === 'ingreso' ? m.monto : -m.monto);
  });
  return Object.values(buckets).sort((a, b) => b.orden - a.orden);
}

function renderHistorial() {
  const wrap = document.getElementById('historial-lista');
  if (!wrap) return;
  const datos = agruparPorPeriodo(periodoHistorial).slice(0, 14);
  if (datos.length === 0) {
    wrap.innerHTML = '<div class="empty">Todavía no hay ventas registradas.</div>';
    return;
  }
  const max = Math.max(...datos.map(d => Math.abs(d.total)), 1);
  wrap.innerHTML = datos.map(d => {
    const pct = Math.max(3, Math.round((Math.abs(d.total) / max) * 100));
    const etiqueta = d.etiqueta.charAt(0).toUpperCase() + d.etiqueta.slice(1);
    return `<div class="historial-row">
      <div class="historial-top">
        <span class="historial-label">${etiqueta}</span>
        <span class="historial-monto">${fmtMoney(d.total)}</span>
      </div>
      <div class="historial-bar-track"><div class="historial-bar-fill" style="width:${pct}%;"></div></div>
    </div>`;
  }).join('');
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
    showToast('Premio guardado');
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
let envioSeleccionado; // undefined = todavía no se eligió | null = "Sin envío" elegido a propósito | 'cerca' | 'lejos'
let carrito = []; // items que se van a vender ahora mismo (via "Vender ahora" o "Marcar listo")
let pedidoItemsActual = []; // items del pedido de la libreta que se está armando
let pedidoEnvioActual; // mismo criterio que envioSeleccionado
let pedidoEditId = null; // si no es null, "guardar" actualiza este pedido en vez de crear uno nuevo
let pedidoOrigenId = null; // si la venta que se está confirmando viene de un pedido pendiente, su id
let pedidoClienteVentaAhora = ''; // nombre del cliente para el registro de "Completados hoy"

function stockDisponiblePedido(prod) {
  const enCarrito = carrito.filter(i => i.prod === prod).reduce((s, i) => s + i.qty, 0);
  const enPedidoActual = pedidoItemsActual.filter(i => i.prod === prod).reduce((s, i) => s + i.qty, 0);
  const enPedidosPendientes = STATE.pedidos
    .filter(p => p.estado === 'pendiente' && p.id !== pedidoEditId)
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
  pedidoItemsActual.push({
    prod,
    optKey,
    qty: opt.qty,
    label: opt.label,
    monto: precio
  });
  renderPedidoItems();
  showToast('Agregado: ' + producto.label + ' - ' + opt.label);
}

/* ================= LIBRETA DE PEDIDOS ================= */
function abrirPedidoForm(editId) {
  pedidoEditId = editId || null;
  document.getElementById('pedido-form-title').textContent = editId ? 'Editar pedido' : 'Nuevo pedido';
  document.getElementById('ped-guardar-btn').textContent = editId ? 'Guardar cambios' : 'Guardar pedido';

  if (editId) {
    const pedido = STATE.pedidos.find(p => p.id === editId);
    if (!pedido) return;
    document.getElementById('ped-cliente').value = pedido.cliente || '';
    document.getElementById('ped-direccion').value = pedido.direccion || '';
    pedidoItemsActual = (pedido.items || []).map(i => ({ ...i
    }));
    pedidoEnvioActual = pedido.envio;
  } else {
    document.getElementById('ped-cliente').value = '';
    document.getElementById('ped-direccion').value = '';
    pedidoItemsActual = [];
    pedidoEnvioActual = undefined;
  }
  renderPedidoItems();
  renderPedidoEnvioOpts();
  actualizarVisibilidadDireccion();
  actualizarDatalistClientes();
  mostrarOverlay('overlay-pedido-form');
}

// Sugiere clientes ya usados antes (nombre + teléfono juntos, tal como se
// escribieron) para no tener que tipear el número de nuevo cada vez.
function actualizarDatalistClientes() {
  const nombres = new Set();
  STATE.pedidos.forEach(p => {
    if (p.cliente && p.cliente.trim() && p.cliente.trim().toLowerCase() !== 'sin nombre') {
      nombres.add(p.cliente.trim());
    }
  });
  const datalist = document.getElementById('clientes-datalist');
  datalist.innerHTML = Array.from(nombres).sort().map(n => `<option value="${n.replace(/"/g, '&quot;')}"></option>`).join('');
}

// La ubicación solo tiene sentido si el pedido lleva envío.
function actualizarVisibilidadDireccion() {
  const conEnvio = !!pedidoEnvioActual;
  document.getElementById('ped-direccion-wrap').style.display = conEnvio ? 'block' : 'none';
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
  actualizarTotalPedidoForm();
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
  actualizarTotalPedidoForm();
  actualizarVisibilidadDireccion();
}

// El envío elegido tiene que reflejarse al toque en el total mostrado en el
// formulario, no recién después de guardar o vender.
function actualizarTotalPedidoForm() {
  const subtotal = pedidoItemsActual.reduce((s, i) => s + i.monto, 0);
  const envioMonto = pedidoEnvioActual ? ((STATE.precios.envio && STATE.precios.envio[pedidoEnvioActual]) || 0) : 0;
  document.getElementById('ped-total').textContent = fmtMoney(subtotal + envioMonto);
}

function validarPedidoForm() {
  if (pedidoItemsActual.length === 0) {
    showToast('Agregá al menos un producto al pedido');
    return false;
  }
  if (typeof pedidoEnvioActual === 'undefined') {
    showToast('Elegí una opción de envío (o "Sin envío") antes de continuar');
    return false;
  }
  return true;
}

let guardandoPedido = false; // evita que tocar "Guardar pedido" varias veces seguidas duplique el pedido

async function guardarPedido() {
  if (guardandoPedido) return;
  if (!validarPedidoForm()) return;
  if (!db) {
    showToast('No está conectado a la nube (menú → Configuración)');
    return;
  }
  guardandoPedido = true;
  const cliente = document.getElementById('ped-cliente').value.trim() || 'Sin nombre';
  const direccion = document.getElementById('ped-direccion').value.trim();
  try {
    if (pedidoEditId) {
      await db.collection('doldichipa_pedidos').doc(pedidoEditId).update({
        cliente,
        items: pedidoItemsActual,
        envio: pedidoEnvioActual,
        direccion
      });
      showToast('Pedido actualizado');
    } else {
      await db.collection('doldichipa_pedidos').add({
        cliente,
        items: pedidoItemsActual,
        envio: pedidoEnvioActual,
        direccion,
        estado: 'pendiente',
        creadoTs: Date.now()
      });
      showToast('Pedido guardado');
      notificarPedidoNuevo({ cliente, items: pedidoItemsActual });
    }
    cerrarModal('overlay-pedido-form');
    pedidoItemsActual = [];
    pedidoEnvioActual = undefined;
    pedidoEditId = null;
  } catch (e) {
    showToast('No se pudo guardar el pedido');
  } finally {
    guardandoPedido = false;
  }
}

// Vender un pedido ahora mismo: reusa la misma pantalla de checkout que ya
// tiene fecha/hora, cliente con puntos y premios — solo cambia de dónde
// vienen los ítems.
function resumenItemsPedido(items) {
  return (items || []).map(i => i.label + ' de ' + (STATE.productos[i.prod] ? STATE.productos[i.prod].label : i.prod)).join(', ');
}

function ubicacionHref(direccion) {
  if (!direccion) return null;
  const txt = direccion.trim();
  if (!txt) return null;
  return /^https?:\/\//i.test(txt) ? txt : ('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(txt));
}

// Mapa embebido (sin salir de la app). Si el link tiene coordenadas (como los
// que manda WhatsApp al compartir ubicación), las usa directo; si no, usa el
// texto tal cual (funciona también con direcciones escritas a mano).
function ubicacionEmbedSrc(direccion) {
  if (!direccion) return null;
  const txt = direccion.trim();
  if (!txt) return null;
  const matchLatLng = txt.match(/(-?\d{1,3}\.\d+),\s*(-?\d{1,3}\.\d+)/);
  const query = matchLatLng ? (matchLatLng[1] + ',' + matchLatLng[2]) : txt;
  return 'https://maps.google.com/maps?q=' + encodeURIComponent(query) + '&z=15&output=embed';
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
      const href = ubicacionHref(p.direccion);
      const embedSrc = ubicacionEmbedSrc(p.direccion);
      return `<div class="pedido-card ${esPrimero?'primero':''}">
        <div class="pedido-card-top">
          <div class="pedido-card-info">
            <div class="pedido-card-badges">
              ${esPrimero ? '<span style="background:var(--orange); color:#2a1a08; font-size:11px; font-weight:800; padding:2px 8px; border-radius:20px;">SIGUE ESTE</span>' : `<span class="muted" style="font-size:12px; font-weight:700;">#${idx+1}</span>`}
              <div class="prod-name">${p.cliente}</div>
            </div>
            <div class="unit-tag" style="white-space:normal;">${resumenItemsPedido(p.items)}${p.envio ? ' + envío ' + p.envio : ''}</div>
            <div class="stock-num" style="margin-top:6px; font-size:16px;">${fmtMoney(subtotal)}</div>
          </div>
          <button class="btn btn-sm btn-green" style="flex-shrink:0;" onclick="marcarListoDesdePedido('${p.id}')">Marcar listo</button>
        </div>
        ${embedSrc ? `<iframe class="pedido-card-mapa" src="${embedSrc}" height="150" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>` : ''}
        ${href ? `<a href="${href}" target="_blank" rel="noopener" class="btn btn-sm btn-gold btn-block" style="display:flex; align-items:center; justify-content:center; gap:6px; margin-top:10px; text-decoration:none;">📍 Cómo llegar</a>` : ''}
        <div class="pedido-card-footer">
          <a href="javascript:void(0)" onclick="abrirPedidoForm('${p.id}')">Editar</a>
          <a href="javascript:void(0)" onclick="eliminarPedidoUI('${p.id}')">Eliminar</a>
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

// Marcar un pedido en espera como "listo" ahora pasa por la misma pantalla
// de checkout que "Vender ahora" (para poder elegir fecha, cliente/puntos, etc.)
function marcarListoDesdePedido(id) {
  const pedido = STATE.pedidos.find(p => p.id === id);
  if (!pedido) return;
  carrito = (pedido.items || []).map(i => ({ ...i
  }));
  pedidoOrigenId = id;
  pedidoClienteVentaAhora = pedido.cliente;
  // El envío ya se eligió cuando se anotó el pedido — acá no se vuelve a pedir.
  envioSeleccionado = (typeof pedido.envio === 'undefined') ? null : pedido.envio;
  abrirFinalizarPedido();
}

function eliminarPedidoUI(id) {
  const pedido = STATE.pedidos.find(p => p.id === id);
  confirmarAccion(
    'Eliminar pedido de ' + (pedido ? pedido.cliente : ''),
    'No se puede deshacer.',
    () => eliminarPedidoConfirmado(id)
  );
}

async function eliminarPedidoConfirmado(id) {
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
  clienteVentaActual = null;
  premioSeleccionadoVenta = null;
  document.getElementById('venta-cliente-dni').value = '';
  document.getElementById('venta-cliente-resultado').innerHTML = '';
  document.getElementById('venta-fecha-hora').value = toDatetimeLocalValue(new Date());
  document.getElementById('venta-fecha-wrap').style.display = 'none';
  document.getElementById('venta-fecha-toggle').style.display = 'block';
  mostrarOverlay('overlay-confirm');
}

// La fecha está escondida por defecto (casi siempre es "ahora"); este link
// la muestra solo si de verdad hace falta cargar una venta de otro día.
function mostrarFechaVenta() {
  document.getElementById('venta-fecha-wrap').style.display = 'block';
  document.getElementById('venta-fecha-toggle').style.display = 'none';
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
  if (typeof envioSeleccionado === 'undefined') {
    showToast('Elegí una opción de envío (o "Sin envío") antes de confirmar');
    return;
  }
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
      envio: esUltimo ? envioSeleccionado : null,
      pedidoId: pedidoOrigenId
    });
  });

  const promesas = [saveStock(), ...ventaPromises];

  // Sumar el total de esta venta a la caja
  const totalVenta = items.reduce((s, i) => s + i.monto, 0) + envioMonto;
  STATE.caja.total = (STATE.caja.total || 0) + totalVenta;
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

    // Dejar rastro en la libreta de pedidos (para "Completados hoy"): si esta
    // venta venía de un pedido en espera, se marca ese mismo como listo; si
    // fue una venta directa ("Vender ahora"), se crea un registro nuevo.
    const registroPedido = {
      cliente: pedidoClienteVentaAhora || 'Sin nombre',
      items,
      envio: envioSeleccionado,
      estado: 'listo',
      listoTs: tsElegido
    };
    if (db) {
      if (pedidoOrigenId) {
        db.collection('doldichipa_pedidos').doc(pedidoOrigenId).update(registroPedido).catch(() => {});
      } else {
        db.collection('doldichipa_pedidos').add({
          ...registroPedido,
          creadoTs: tsElegido
        }).catch(() => {});
      }
    }
    pedidoOrigenId = null;
    pedidoClienteVentaAhora = '';

    carrito = [];
    envioSeleccionado = undefined;
    clienteVentaActual = null;
    premioSeleccionadoVenta = null;
  }
  renderStock();
  renderVentas();
  renderCaja();
  renderPedidos();
}

/* ================= CARGA FLOW ================= */
/* ================= STOCK: agregar / corregir / vaciar (todo junto) ================= */
let editarStockProd = null;

function abrirEditarStock(prod) {
  editarStockProd = prod;
  const p = STATE.productos[prod];
  if (!p) return;
  document.getElementById('editar-stock-title').textContent = p.label + ' — Stock';

  // Sección "Agregar stock" (siempre visible, es la acción principal)
  document.getElementById('agregar-stock-label').textContent = 'Cantidad de ' + p.unit + ' a agregar';
  const agregarInput = document.getElementById('agregar-stock-input');
  agregarInput.value = '';
  agregarInput.style.borderColor = 'var(--border)';
  agregarInput.step = '0.5';

  // Sección "Corregir cantidad exacta": arranca siempre oculta, para que no
  // se pueda tocar por error y dejar el stock en 0 sin querer.
  document.getElementById('corregir-stock-wrap').style.display = 'none';
  document.getElementById('btn-mostrar-corregir-stock').textContent = '¿Necesitás corregir el total a mano?';
  const editarInput = document.getElementById('editar-stock-input');
  editarInput.step = '0.5';
  editarInput.value = STATE.stock[prod] || 0;
  editarInput.style.borderColor = 'var(--border)';
  document.getElementById('editar-stock-label').textContent = 'Cantidad (' + p.unit + ')';

  mostrarOverlay('overlay-editar-stock');
}

function toggleCorregirStock() {
  const wrap = document.getElementById('corregir-stock-wrap');
  const abierto = wrap.style.display !== 'none';
  wrap.style.display = abierto ? 'none' : 'block';
  document.getElementById('btn-mostrar-corregir-stock').textContent = abierto ?
    '¿Necesitás corregir el total a mano?' :
    'Ocultar corrección manual';
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
  STATE.stock[editarStockProd] = (STATE.stock[editarStockProd] || 0) + val;
  const ok = await saveStock();
  if (ok) {
    showToast(p.label + ': stock actualizado');
    input.value = '';
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
    showToast('Stock de ' + STATE.productos[editarStockProd].label + ' actualizado');
  }
  renderStock();
  renderVender();
}
async function vaciarStock() {
  STATE.stock[editarStockProd] = 0;
  const ok = await saveStock();
  if (ok) {
    cerrarModal('overlay-editar-stock');
    showToast('Stock de ' + STATE.productos[editarStockProd].label + ' vaciado');
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
    await db.collection('doldichipa').doc('caja').set({
      total: 0
    });
    await borrarColeccion('doldichipa_ventas');
    await borrarColeccion('doldichipa_remis');
    await borrarColeccion('doldichipa_pedidos');
    cerrarModal('overlay-reset');
    showToast('Sistema reiniciado. Todo en cero.');
    irATab('stock');
  } catch (e) {
    showToast('No se pudo reiniciar, revisá la conexión');
  }
}

function abrirElegirProducto() {
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
let libreQtyModo = 'libre'; // 'libre' | 'suelta' | 'variante'
let libreQtyVarianteKey = null; // solo cuando el modo es 'variante'

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
    abrirContadorCantidad(prod, 'libre');
  } else {
    (p.variantes || []).forEach(o => {
      const btn = document.createElement('div');
      btn.className = 'qty-btn';
      btn.style.textAlign = 'left';
      btn.innerHTML = `${o.label} <span class="p">${fmtMoney(precioFor(prod,o.key))}</span>`;
      // Cada opción (media docena, docena, etc.) tiene su propio contador
      // +/-, para poder pedir "3 docenas" de una sola vez sin repetir el
      // paso de agregar producto tres veces.
      btn.onclick = () => abrirContadorCantidad(prod, 'variante', o.key);
      wrap.appendChild(btn);
    });
    // Si el producto tiene precio por unidad suelta cargado, agregar la
    // opción de vender sueltas (para cuando quedan piezas sin completar
    // una docena/media docena entera).
    const precioSuelta = (STATE.precios[prod] && STATE.precios[prod].suelta) || 0;
    if (precioSuelta > 0) {
      const btnSuelta = document.createElement('div');
      btnSuelta.className = 'qty-btn';
      btnSuelta.style.textAlign = 'left';
      btnSuelta.innerHTML = `Vender sueltas <span class="p">${fmtMoney(precioSuelta)} c/u</span>`;
      btnSuelta.onclick = () => abrirContadorCantidad(prod, 'suelta');
      wrap.appendChild(btnSuelta);
    }
  }
  mostrarOverlay('overlay-qty');
}

// Contador +/- reutilizado para: productos "por unidad", venta de unidades
// sueltas de un producto por docena, y para pedir varias docenas/medias
// docenas de una sola vez.
function abrirContadorCantidad(prod, modo, varianteKey) {
  libreQtyProd = prod;
  libreQtyActual = 1;
  libreQtyModo = modo;
  libreQtyVarianteKey = varianteKey || null;
  const wrap = document.getElementById('qty-options');
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
}

// Cuántas "unidades sueltas" entran en una docena, para poder descontar
// del stock (que se lleva en docenas) correctamente.
function unidadesPorDocena(prod) {
  return 12;
}

// Cuántas docenas-equivalentes representa 1 unidad de cantidad actual,
// según el modo (para chequear stock disponible).
function qtyDocenasPorUnidad(prod) {
  if (libreQtyModo === 'suelta') return 1 / unidadesPorDocena(prod);
  if (libreQtyModo === 'variante') {
    const p = STATE.productos[prod];
    const variante = (p.variantes || []).find(v => v.key === libreQtyVarianteKey);
    return variante ? variante.qty : 1;
  }
  return 1; // 'libre'
}

function precioPorUnidadActual(prod) {
  if (libreQtyModo === 'suelta') return (STATE.precios[prod] && STATE.precios[prod].suelta) || 0;
  if (libreQtyModo === 'variante') return precioFor(prod, libreQtyVarianteKey);
  return (STATE.precios[prod] && STATE.precios[prod].unidad) || 0;
}

function cambiarCantidadLibre(delta) {
  const nueva = libreQtyActual + delta;
  if (nueva < 1) return;
  const stockVal = stockDisponiblePedido(libreQtyProd);
  const qtyEquivalente = nueva * qtyDocenasPorUnidad(libreQtyProd);
  if (qtyEquivalente > stockVal) {
    showToast('No hay suficiente stock de ' + STATE.productos[libreQtyProd].label + ' (' + fmtCantidad(libreQtyProd, stockVal) + ' disponibles)');
    return;
  }
  libreQtyActual = nueva;
  actualizarDisplayLibre();
}

function actualizarDisplayLibre() {
  document.getElementById('libre-qty-display').textContent = libreQtyActual;
  const precioUnidad = precioPorUnidadActual(libreQtyProd);
  document.getElementById('libre-qty-precio').textContent = fmtMoney(precioUnidad * libreQtyActual);
}

function confirmarCantidadLibre() {
  const p = STATE.productos[libreQtyProd];
  const precioUnidad = precioPorUnidadActual(libreQtyProd);
  cerrarModal('overlay-qty');
  if (libreQtyModo === 'suelta') {
    iniciarVenta(libreQtyProd, 'custom', {
      qty: libreQtyActual / unidadesPorDocena(libreQtyProd),
      label: libreQtyActual + ' suelta' + (libreQtyActual === 1 ? '' : 's'),
      monto: precioUnidad * libreQtyActual
    });
  } else if (libreQtyModo === 'variante') {
    const variante = (p.variantes || []).find(v => v.key === libreQtyVarianteKey);
    iniciarVenta(libreQtyProd, 'custom', {
      qty: variante.qty * libreQtyActual,
      label: libreQtyActual > 1 ? (libreQtyActual + ' x ' + variante.label) : variante.label,
      monto: precioUnidad * libreQtyActual
    });
  } else {
    iniciarVenta(libreQtyProd, 'custom', {
      qty: libreQtyActual,
      label: libreQtyActual + ' ' + p.unit,
      monto: precioUnidad * libreQtyActual
    });
  }
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