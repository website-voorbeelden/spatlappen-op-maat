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

const headerValue = (value, maxLength = 500) => clean(value, maxLength)
  .replace(/[\r\n]+/g, ' ')
  .normalize('NFKD')
  .replace(/[^\x20-\x7E]/g, '');

const bytesToBase64 = (bytes) => {
  let binary = '';
  const chunkSize = 0x8000;

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }

  return btoa(binary);
};

const toBase64 = async (file) => bytesToBase64(
  new Uint8Array(await file.arrayBuffer())
);

const textToBase64 = (value) => bytesToBase64(
  new TextEncoder().encode(value)
);

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
  const fromEmail = 'Spatlappen op Maat <noreply@spatlappenopmaat.nl>';
  const toEmail = 'spatlappenopmaat@gmail.com';

  if (!env.RESEND_API_KEY) {
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
    firstSource: clean(form.get('first_source'), 150),
    lastSource: clean(form.get('last_source'), 150),
    firstReferrer: clean(form.get('first_referrer'), 250),
    lastReferrer: clean(form.get('last_referrer'), 250),
    firstSeen: clean(form.get('first_seen'), 100),
    sessionCount: clean(form.get('session_count'), 20),
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

  const leadHeaders = Object.fromEntries([
    ['X-Lead-First-Source', data.firstSource],
    ['X-Lead-Last-Source', data.lastSource || data.sourceDetected],
    ['X-Lead-First-Referrer', data.firstReferrer],
    ['X-Lead-Last-Referrer', data.lastReferrer || data.referrerDomain],
    ['X-Lead-First-Seen', data.firstSeen],
    ['X-Lead-Session-Count', data.sessionCount],
    ['X-Lead-UTM-Source', data.utmSource],
    ['X-Lead-UTM-Medium', data.utmMedium],
    ['X-Lead-UTM-Campaign', data.utmCampaign],
    ['X-Lead-UTM-ID', data.utmId],
    ['X-Lead-UTM-Term', data.utmTerm],
    ['X-Lead-UTM-Content', data.utmContent],
    ['X-Lead-GCLID', data.gclid],
    ['X-Lead-GBRAID', data.gbraid],
    ['X-Lead-WBRAID', data.wbraid],
    ['X-Lead-MSCLKID', data.msclkid],
    ['X-Lead-FBCLID', data.fbclid]
  ]
    .filter(([, value]) => value)
    .map(([key, value]) => [key, headerValue(value)]));

  const attributionRows = [
    ['Eerste bron', data.firstSource || data.sourceDetected || 'Onbekend'],
    ['Laatste bron', data.lastSource || data.sourceDetected || 'Onbekend'],
    ['Eerste verwijzer', data.firstReferrer || 'Niet beschikbaar'],
    ['Laatste verwijzer', data.lastReferrer || data.referrerDomain || 'Niet beschikbaar'],
    ['Eerste bezoek', data.firstSeen || new Date().toISOString()],
    ['Aantal sessies', data.sessionCount || '1'],
    ['UTM source', data.utmSource],
    ['UTM medium', data.utmMedium],
    ['UTM campaign', data.utmCampaign],
    ['UTM id', data.utmId],
    ['UTM term', data.utmTerm],
    ['UTM content', data.utmContent],
    ['Google click id (GCLID)', data.gclid],
    ['Google GBRAID', data.gbraid],
    ['Google WBRAID', data.wbraid],
    ['Microsoft click id', data.msclkid],
    ['Meta click id', data.fbclid]
  ].filter(([, value]) => value);

  const attributionText = [
    'Aanvraaggegevens',
    '=================',
    '',
    ...attributionRows.map(([label, value]) => `${label}: ${value}`),
    '',
    'Dit bestand is automatisch toegevoegd door het offerteformulier.'
  ].join('\n');

  attachments.push({
    filename: 'aanvraaggegevens.txt',
    content: textToBase64(attributionText)
  });

  const html = `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="font-family:Arial,Tahoma,sans-serif;font-size:14px;color:#222;background:#fff">
      <tr>
        <td>
          <table width="680" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:680px;border:1px solid #b8b8b8">
            <tr>
              <td style="padding:10px 12px;background:#e7e7e7;border-bottom:1px solid #b8b8b8;font-weight:bold">
                Nieuwe aanvraag via Spatlappenopmaat.nl
              </td>
            </tr>
            <tr>
              <td style="padding:12px">
                <table width="100%" cellpadding="5" cellspacing="0" border="0" style="border-collapse:collapse">
                  <tr><td width="110" style="font-weight:bold;border-bottom:1px solid #ddd">Naam</td><td style="border-bottom:1px solid #ddd">${escapeHtml(data.name)}</td></tr>
                  <tr><td style="font-weight:bold;border-bottom:1px solid #ddd">E-mail</td><td style="border-bottom:1px solid #ddd">${escapeHtml(data.email)}</td></tr>
                  <tr><td style="font-weight:bold;border-bottom:1px solid #ddd">Telefoon</td><td style="border-bottom:1px solid #ddd">${escapeHtml(data.phone || 'Niet opgegeven')}</td></tr>
                  <tr><td style="font-weight:bold;border-bottom:1px solid #ddd">Bijlage</td><td style="border-bottom:1px solid #ddd">${hasAttachment ? escapeHtml(attachment.name) : 'Geen'}</td></tr>
                </table>

                <p style="margin:18px 0 6px;font-weight:bold">Bericht</p>
                <table width="100%" cellpadding="10" cellspacing="0" border="0" style="border-collapse:collapse">
                  <tr>
                    <td style="border:1px solid #cfcfcf;background:#f5f5f5;white-space:pre-wrap;line-height:1.45">${escapeHtml(data.message)}</td>
                  </tr>
                </table>

                <p style="margin:14px 0 0;font-size:11px;color:#777">
                  Verzonden via het offerteformulier op Spatlappenopmaat.nl
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;

  const text = [
    'Nieuwe aanvraag via Spatlappenopmaat.nl',
    '',
    `Naam: ${data.name}`,
    `E-mail: ${data.email}`,
    `Telefoon: ${data.phone || 'Niet opgegeven'}`,
    `Bijlage: ${hasAttachment ? attachment.name : 'Geen'}`,
    '',
    'Bericht:',
    data.message
  ].join('\\n');

  try {
    await sendWithResend(env.RESEND_API_KEY, {
      from: fromEmail,
      to: [toEmail],
      reply_to: data.email,
      subject: `Nieuwe aanvraag spatlappen – ${data.name}`,
      html,
      text,
      headers: leadHeaders,
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
