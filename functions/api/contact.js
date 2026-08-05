const MAX_FILE_SIZE = 4 * 1024 * 1024;
const ALLOWED_FILE_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/svg+xml'
]);

const json = (data, status = 200, extraHeaders = {}) => new Response(JSON.stringify(data), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders
  }
});

const escapeHtml = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const clean = (value, maxLength = 2000) => String(value || '').trim().slice(0, maxLength);

const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';

  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }

  return btoa(binary);
}

export async function onRequestOptions({ request, env }) {
  const origin = request.headers.get('Origin') || '*';
  const allowedOrigin = env.ALLOWED_ORIGIN || origin;

  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': allowedOrigin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Accept',
      'Access-Control-Max-Age': '86400'
    }
  });
}

export async function onRequestPost({ request, env }) {
  const origin = request.headers.get('Origin');
  const allowedOrigin = env.ALLOWED_ORIGIN || origin || 'https://spatlappenopmaat.nl';
  const corsHeaders = { 'Access-Control-Allow-Origin': allowedOrigin };

  if (!env.RESEND_API_KEY) {
    return json({ error: 'De mailservice is nog niet ingesteld.' }, 500, corsHeaders);
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ error: 'Ongeldige formuliergegevens.' }, 400, corsHeaders);
  }

  // Honeypot: bots vullen dit verborgen veld vaak in.
  if (clean(form.get('website'), 100)) {
    return json({ ok: true }, 200, corsHeaders);
  }

  const name = clean(form.get('name'), 120);
  const company = clean(form.get('company'), 160);
  const email = clean(form.get('email'), 180).toLowerCase();
  const phone = clean(form.get('phone'), 80);
  const vehicle = clean(form.get('vehicle'), 120);
  const material = clean(form.get('material'), 120);
  const dimensions = clean(form.get('dimensions'), 120);
  const quantity = clean(form.get('quantity'), 40);
  const printing = clean(form.get('printing'), 300);
  const message = clean(form.get('message'), 4000);
  const attachment = form.get('attachment');

  if (!name || !email || !message) {
    return json({ error: 'Vul naam, e-mailadres en toelichting in.' }, 400, corsHeaders);
  }

  if (!isEmail(email)) {
    return json({ error: 'Vul een geldig e-mailadres in.' }, 400, corsHeaders);
  }

  const attachments = [];
  if (attachment instanceof File && attachment.size > 0) {
    if (attachment.size > MAX_FILE_SIZE) {
      return json({ error: 'Het bestand is groter dan 4 MB.' }, 413, corsHeaders);
    }

    if (!ALLOWED_FILE_TYPES.has(attachment.type)) {
      return json({ error: 'Dit bestandstype wordt niet ondersteund.' }, 415, corsHeaders);
    }

    attachments.push({
      filename: attachment.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 140),
      content: arrayBufferToBase64(await attachment.arrayBuffer()),
      content_type: attachment.type
    });
  }

  const rows = [
    ['Naam', name],
    ['Bedrijf', company || 'Niet opgegeven'],
    ['E-mail', email],
    ['Telefoon', phone || 'Niet opgegeven'],
    ['Toepassing', vehicle || 'Niet opgegeven'],
    ['Materiaal', material || 'Niet opgegeven'],
    ['Maat', dimensions || 'Niet opgegeven'],
    ['Aantal', quantity || 'Niet opgegeven'],
    ['Bedrukking', printing || 'Niet opgegeven']
  ];

  const detailsHtml = rows.map(([label, value]) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e8e8e8;font-weight:700;vertical-align:top;">${escapeHtml(label)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e8e8e8;vertical-align:top;">${escapeHtml(value)}</td>
    </tr>`).join('');

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#111315;line-height:1.5;max-width:720px;margin:0 auto;">
      <div style="background:#111315;color:#fff;padding:24px 28px;border-radius:14px 14px 0 0;">
        <div style="width:54px;height:4px;background:#ff5a1f;border-radius:99px;margin-bottom:16px;"></div>
        <h1 style="margin:0;font-size:26px;">Nieuwe offerteaanvraag</h1>
        <p style="margin:8px 0 0;color:#bfc2c4;">Via spatlappenopmaat.nl</p>
      </div>
      <div style="border:1px solid #e2e2e2;border-top:0;padding:26px 28px;border-radius:0 0 14px 14px;background:#fff;">
        <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">${detailsHtml}</table>
        <h2 style="font-size:18px;margin:0 0 8px;">Toelichting</h2>
        <div style="background:#f5f3ef;padding:16px;border-radius:10px;white-space:pre-wrap;">${escapeHtml(message)}</div>
        ${attachments.length ? '<p style="margin-top:20px;color:#555;">De meegestuurde bijlage is aan deze e-mail toegevoegd.</p>' : ''}
      </div>
    </div>`;

  const payload = {
    from: env.FROM_EMAIL || 'Spatlappen op Maat <noreply@spatlappenopmaat.nl>',
    to: [env.TO_EMAIL || 'Info@spatlappenopmaat.nl'],
    reply_to: email,
    subject: `Offerteaanvraag spatlappen${company ? ` – ${company}` : ` – ${name}`}`,
    html,
    text: [
      'Nieuwe offerteaanvraag via spatlappenopmaat.nl',
      '',
      ...rows.map(([label, value]) => `${label}: ${value}`),
      '',
      'Toelichting:',
      message
    ].join('\n'),
    ...(attachments.length ? { attachments } : {})
  };

  const resendResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!resendResponse.ok) {
    const errorText = await resendResponse.text();
    console.error('Resend error:', resendResponse.status, errorText);
    return json({ error: 'De aanvraag kon niet worden verzonden.' }, 502, corsHeaders);
  }

  return json({ ok: true }, 200, corsHeaders);
}
