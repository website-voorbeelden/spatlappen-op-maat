const MAX_FILE_SIZE = 4 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([
  'pdf', 'png', 'jpg', 'jpeg', 'webp', 'heic', 'svg'
]);

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  }
});

const clean = (value, maxLength = 4000) => String(value || '')
  .replace(/\0/g, '')
  .trim()
  .slice(0, maxLength);

const escapeHtml = (value) => clean(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const toBase64 = async (file) => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  const chunkSize = 0x8000;

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }

  return btoa(binary);
};

const sendWithResend = async (apiKey, payload) => {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const details = await response.text();
    console.error('Resend error:', response.status, details);
    throw new Error('E-mailverzending mislukt');
  }

  return response.json();
};

export async function onRequestPost({ request, env }) {
  if (!env.RESEND_API_KEY || !env.FROM_EMAIL || !env.TO_EMAIL) {
    console.error('Missing Resend environment variables');
    return json({
      ok: false,
      error: 'Het formulier is nog niet volledig ingesteld. Mail je aanvraag naar info@spatlappenopmaat.nl.'
    }, 503);
  }

  const requestUrl = new URL(request.url);
  const origin = request.headers.get('Origin');
  const allowedOrigins = new Set([
    requestUrl.origin,
    ...clean(env.ALLOWED_ORIGIN, 500).split(',').map((value) => value.trim()).filter(Boolean)
  ]);

  if (origin && !allowedOrigins.has(origin)) {
    return json({ ok: false, error: 'Deze aanvraag is niet toegestaan.' }, 403);
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ ok: false, error: 'De formuliergegevens konden niet worden gelezen.' }, 400);
  }

  // Bots vullen dit verborgen veld vaak automatisch in. Voor echte bezoekers blijft het leeg.
  if (clean(form.get('website'), 200)) {
    return json({ ok: true });
  }

  const startedAt = Number(form.get('form_started_at'));
  if (Number.isFinite(startedAt) && startedAt > 0 && Date.now() - startedAt < 2500) {
    return json({ ok: false, error: 'Het formulier is te snel verzonden. Probeer het opnieuw.' }, 429);
  }

  const data = {
    name: clean(form.get('name'), 100),
    email: clean(form.get('email'), 160).toLowerCase(),
    phone: clean(form.get('phone'), 50),
    message: clean(form.get('message'), 4000),
    page: clean(form.get('page'), 500),
    landingPage: clean(form.get('landing_page'), 500),
    referrerDomain: clean(form.get('referrer_domain'), 250),
    sourceDetected: clean(form.get('source_detected'), 150),
    utmSource: clean(form.get('utm_source'), 150),
    utmMedium: clean(form.get('utm_medium'), 150),
    utmCampaign: clean(form.get('utm_campaign'), 200),
    utmId: clean(form.get('utm_id'), 200),
    utmTerm: clean(form.get('utm_term'), 200),
    utmContent: clean(form.get('utm_content'), 200),
    gclid: clean(form.get('gclid'), 300),
    gbraid: clean(form.get('gbraid'), 300),
    wbraid: clean(form.get('wbraid'), 300),
    msclkid: clean(form.get('msclkid'), 300),
    fbclid: clean(form.get('fbclid'), 300)
  };

  if (!data.name || !data.email || !data.message) {
    return json({ ok: false, error: 'Vul je naam, e-mailadres en toelichting in.' }, 400);
  }

  if (!isEmail(data.email)) {
    return json({ ok: false, error: 'Vul een geldig e-mailadres in.' }, 400);
  }

  const attachment = form.get('attachment');
  const hasAttachment = attachment instanceof File && attachment.size > 0;
  const attachments = [];

  if (hasAttachment) {
    if (attachment.size > MAX_FILE_SIZE) {
      return json({ ok: false, error: 'Het bestand mag maximaal 4 MB zijn.' }, 413);
    }

    const extension = attachment.name.split('.').pop()?.toLowerCase() || '';
    if (!ALLOWED_EXTENSIONS.has(extension)) {
      return json({ ok: false, error: `Bestandstype .${extension || '?'} wordt niet geaccepteerd.` }, 400);
    }

    attachments.push({
      filename: clean(attachment.name, 180),
      content: await toBase64(attachment)
    });
  }

  const campaignRows = [
    ['Vastgestelde bron', data.sourceDetected],
    ['Landingspagina', data.landingPage],
    ['Verwijzend domein', data.referrerDomain],
    ['UTM-bron', data.utmSource],
    ['UTM-medium', data.utmMedium],
    ['UTM-campagne', data.utmCampaign],
    ['UTM-ID', data.utmId],
    ['UTM-term', data.utmTerm],
    ['UTM-content', data.utmContent],
    ['GCLID', data.gclid],
    ['GBRAID', data.gbraid],
    ['WBRAID', data.wbraid],
    ['MSCLKID', data.msclkid],
    ['FBCLID', data.fbclid]
  ].filter(([, value]) => value);

  const campaignHtml = campaignRows.length ? `
    <h2 style="font-size:17px;color:#17191b;margin:26px 0 8px">Herkomstgegevens</h2>
    <table style="width:100%;border-collapse:collapse">${campaignRows.map(([label, value]) => `
      <tr>
        <th style="padding:7px 12px;text-align:left;border-bottom:1px solid #e3e0d9;color:#17191b">${escapeHtml(label)}</th>
        <td style="padding:7px 12px;border-bottom:1px solid #e3e0d9;color:#555b60;word-break:break-all">${escapeHtml(value)}</td>
      </tr>`).join('')}
    </table>` : '';

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:720px;margin:auto;color:#17191b">
      <div style="background:#17191b;padding:22px 24px;color:#fff">
        <strong style="font-size:20px">Nieuwe aanvraag via Spatlappenopmaat.nl</strong>
      </div>
      <div style="padding:24px;border:1px solid #e3e0d9;border-top:0">
        <table style="width:100%;border-collapse:collapse">
          <tr><th style="padding:9px 12px;text-align:left;border-bottom:1px solid #e3e0d9">Naam</th><td style="padding:9px 12px;border-bottom:1px solid #e3e0d9">${escapeHtml(data.name)}</td></tr>
          <tr><th style="padding:9px 12px;text-align:left;border-bottom:1px solid #e3e0d9">E-mail</th><td style="padding:9px 12px;border-bottom:1px solid #e3e0d9">${escapeHtml(data.email)}</td></tr>
          <tr><th style="padding:9px 12px;text-align:left;border-bottom:1px solid #e3e0d9">Telefoon</th><td style="padding:9px 12px;border-bottom:1px solid #e3e0d9">${escapeHtml(data.phone || 'Niet opgegeven')}</td></tr>
          <tr><th style="padding:9px 12px;text-align:left;border-bottom:1px solid #e3e0d9">Pagina</th><td style="padding:9px 12px;border-bottom:1px solid #e3e0d9">${escapeHtml(data.page || 'Onbekend')}</td></tr>
        </table>
        <h2 style="font-size:17px;color:#17191b;margin:26px 0 8px">Toelichting</h2>
        <div style="padding:16px;background:#f7f6f2;border-left:4px solid #f1612f;white-space:pre-wrap;color:#363b3f">${escapeHtml(data.message)}</div>
        ${campaignHtml}
        <p style="margin-top:24px;color:#666d72;font-size:13px">Bijlage: ${hasAttachment ? escapeHtml(attachment.name) : 'geen'}</p>
      </div>
    </div>`;

  const text = [
    'Nieuwe aanvraag via Spatlappenopmaat.nl',
    `Naam: ${data.name}`,
    `E-mail: ${data.email}`,
    `Telefoon: ${data.phone || 'Niet opgegeven'}`,
    `Pagina: ${data.page || 'Onbekend'}`,
    '',
    'Toelichting:',
    data.message,
    '',
    `Bijlage: ${hasAttachment ? attachment.name : 'geen'}`,
    ...campaignRows.map(([label, value]) => `${label}: ${value}`)
  ].join('\n');

  try {
    await sendWithResend(env.RESEND_API_KEY, {
      from: env.FROM_EMAIL,
      to: [env.TO_EMAIL],
      reply_to: data.email,
      subject: `Nieuwe aanvraag spatlappen – ${data.name}`,
      html,
      text,
      attachments
    });

    return json({ ok: true });
  } catch (error) {
    console.error('Contact form failed:', error);
    return json({
      ok: false,
      error: 'De aanvraag kon niet worden verstuurd. Probeer het later opnieuw of stuur een e-mail.'
    }, 502);
  }
}

export function onRequestGet() {
  return new Response('Method Not Allowed', {
    status: 405,
    headers: { Allow: 'POST' }
  });
}
