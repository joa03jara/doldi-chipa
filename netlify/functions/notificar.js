// Esta función corre en el servidor de Netlify, no en el celular. Por eso
// puede llamar a OneSignal sin que el navegador la bloquee (CORS), y puede
// usar la REST API Key de forma segura sin que quede visible en GitHub.
//
// La clave se configura en Netlify: Site settings → Environment variables
// → ONESIGNAL_REST_API_KEY (nunca se escribe acá en el código).

// La app vive en GitHub Pages y esta función en Netlify: son dos direcciones
// distintas, así que el navegador exige que la respuesta traiga estos
// permisos (CORS) para dejar pasar la llamada. Sin esto, "no hace nada".
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

exports.handler = async function (event) {
  // El navegador manda primero una consulta "OPTIONS" para preguntar si
  // tiene permiso antes de mandar la de verdad. Hay que contestarle que sí.
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS_HEADERS, body: 'Method not allowed' };
  }

  let datos;
  try {
    datos = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, headers: CORS_HEADERS, body: 'JSON inválido' };
  }

  const { destino, titulo, mensaje } = datos;
  if (!destino || !mensaje) {
    return { statusCode: 400, headers: CORS_HEADERS, body: 'Faltan datos (destino o mensaje)' };
  }

  const REST_API_KEY = process.env.ONESIGNAL_REST_API_KEY;
  const APP_ID = process.env.ONESIGNAL_APP_ID || '388fca65-069d-41e4-a5bf-126e256dc778';

  if (!REST_API_KEY) {
    return { statusCode: 500, headers: CORS_HEADERS, body: 'Falta configurar ONESIGNAL_REST_API_KEY en Netlify' };
  }

  try {
    const resp = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Authorization': 'Basic ' + REST_API_KEY
      },
      body: JSON.stringify({
        app_id: APP_ID,
        // Le llega solo a los celulares marcados con esa "persona" (ver
        // aplicarQuienSoyGuardado en script.js), nunca a los dos a la vez.
        filters: [{ field: 'tag', key: 'persona', relation: '=', value: destino }],
        headings: { en: titulo || 'Nuevo pedido — Doldi Chipa' },
        contents: { en: mensaje },
        // Ícono de la app en el "avatar" chiquito de la notificación
        // (en vez de la letra genérica que pone Android por defecto).
        chrome_web_icon: 'https://joa03jara.github.io/doldi-chipa/icon-192.png'
      })
    });
    const data = await resp.json();
    return {
      statusCode: resp.ok ? 200 : 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    };
  } catch (e) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: e.message }) };
  }
};
