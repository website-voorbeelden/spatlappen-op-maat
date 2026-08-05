# Spatlappenopmaat.nl

Statische one-page website voor Cloudflare Pages, inclusief een contactformulier via een Cloudflare Pages Function en Resend.

## Bestanden uploaden

Upload de complete inhoud van deze map naar de GitHub-repository die aan Cloudflare Pages is gekoppeld.

## Cloudflare Pages instellingen

- Build command: leeg laten
- Build output directory: `/`
- Root directory: `/`

De map `functions/api/contact.js` wordt automatisch beschikbaar als:

`https://spatlappenopmaat.nl/api/contact`

## Resend instellen

Ga in Cloudflare naar:

**Workers & Pages → jouw Pages-project → Settings → Variables and Secrets**

Voeg toe:

- `RESEND_API_KEY` — als secret
- `FROM_EMAIL` — bijvoorbeeld `Spatlappen op Maat <noreply@spatlappenopmaat.nl>`
- `TO_EMAIL` — `Info@spatlappenopmaat.nl`
- `ALLOWED_ORIGIN` — `https://spatlappenopmaat.nl`

Het afzenderdomein `spatlappenopmaat.nl` moet in Resend zijn geverifieerd.

## Inbegrepen

- SEO-titel, beschrijving, canonical en Open Graph
- Organization-, Service- en FAQ-schema
- sitemap.xml en robots.txt
- Mobiele navigatie en vaste bel/WhatsApp-balk
- Offerteformulier met optionele bijlage tot 4 MB
- Resend-mail via Cloudflare Pages Functions
- Security- en cacheheaders voor Cloudflare Pages
