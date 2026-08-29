// Esta función corre en el servidor de Netlify, no en el celular. Por eso
// puede llamar a OneSignal sin que el navegador la bloquee (CORS), y puede
// usar la REST API Key de forma segura sin que quede visible en GitHub.
//
// La clave se configura en Netlify: Site settings → Environment variables
// → ONESIGNAL_REST_API_KEY (nunca se escribe acá en el código).

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  let datos;
  try {
    datos = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, body: 'JSON inválido' };
  }

  const { destino, titulo, mensaje } = datos;
  if (!destino || !mensaje) {
    return { statusCode: 400, body: 'Faltan datos (destino o mensaje)' };
  }

  const REST_API_KEY = process.env.ONESIGNAL_REST_API_KEY;
  const APP_ID = process.env.ONESIGNAL_APP_ID || '388fca65-069d-41e4-a5bf-126e256dc778';

  if (!REST_API_KEY) {
    return { statusCode: 500, body: 'Falta configurar ONESIGNAL_REST_API_KEY en Netlify' };
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
        contents: { en: mensaje }
      })
    });
    const data = await resp.json();
    return {
      statusCode: resp.ok ? 200 : 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
