const header = document.getElementById('site-header');
const menuButton = document.querySelector('.menu-button');
const navigation = document.getElementById('site-navigation');
const navigationLinks = navigation.querySelectorAll('a');
const form = document.getElementById('quote-form');
const statusElement = document.getElementById('form-status');
const submitButton = form.querySelector('button[type="submit"]');
const formEndpoint = form.action;
const maxFileSize = 4 * 1024 * 1024;

const updateHeader = () => {
  header.classList.toggle('scrolled', window.scrollY > 24);
};

const closeMenu = ({ returnFocus = false } = {}) => {
  document.body.classList.remove('menu-open');
  header.classList.remove('menu-active');
  menuButton.setAttribute('aria-expanded', 'false');
  menuButton.setAttribute('aria-label', 'Menu openen');
  if (returnFocus) menuButton.focus();
};

const openMenu = () => {
  document.body.classList.add('menu-open');
  header.classList.add('menu-active');
  menuButton.setAttribute('aria-expanded', 'true');
  menuButton.setAttribute('aria-label', 'Menu sluiten');
};

updateHeader();
window.addEventListener('scroll', updateHeader, { passive: true });

menuButton.addEventListener('click', () => {
  const isOpen = menuButton.getAttribute('aria-expanded') === 'true';
  if (isOpen) closeMenu();
  else openMenu();
});

navigationLinks.forEach((link) => {
  link.addEventListener('click', () => closeMenu());
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && document.body.classList.contains('menu-open')) {
    closeMenu({ returnFocus: true });
  }
});

const desktopMenu = window.matchMedia('(min-width: 881px)');
const handleDesktopMenu = (event) => {
  if (event.matches) closeMenu();
};

desktopMenu.addEventListener?.('change', handleDesktopMenu);

document.getElementById('year').textContent = new Date().getFullYear();

const setFormMetadata = () => {
  document.getElementById('form-started-at').value = Date.now();
  document.getElementById('form-page').value = window.location.href;
};

setFormMetadata();

const campaignFields = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_id',
  'utm_term',
  'utm_content',
  'gclid',
  'gbraid',
  'wbraid',
  'msclkid',
  'fbclid',
];

const searchParameters = new URLSearchParams(window.location.search);

const readSessionValue = (key) => {
  try {
    return window.sessionStorage.getItem(key) || '';
  } catch {
    return '';
  }
};

const saveSessionValue = (key, value) => {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Het formulier blijft werken wanneer opslag door de browser is geblokkeerd.
  }
};

const getExternalReferrerDomain = () => {
  if (!document.referrer) return '';

  try {
    const referrerDomain = new URL(document.referrer).hostname
      .replace(/^www\./, '')
      .toLowerCase();
    const currentDomain = window.location.hostname
      .replace(/^www\./, '')
      .toLowerCase();

    return referrerDomain && referrerDomain !== currentDomain ? referrerDomain : '';
  } catch {
    return '';
  }
};

const detectSource = (values, referrerDomain) => {
  const utmSource = values.utm_source.toLowerCase();
  const utmMedium = values.utm_medium.toLowerCase();
  const sourceAndReferrer = `${utmSource} ${referrerDomain}`;

  if (/chatgpt|openai/.test(sourceAndReferrer)) return 'ChatGPT';
  if (values.gclid || values.gbraid || values.wbraid) return 'Google Ads';
  if (values.msclkid) return 'Microsoft Ads';
  if (values.fbclid) return 'Meta Ads';

  if (utmSource) {
    if (/google/.test(utmSource)) {
      return /cpc|ppc|paid/.test(utmMedium) ? 'Google Ads' : 'Google';
    }
    if (/bing|microsoft/.test(utmSource)) {
      return /cpc|ppc|paid/.test(utmMedium) ? 'Microsoft Ads' : 'Bing';
    }
    if (/facebook|instagram|meta/.test(utmSource)) return 'Meta';
    if (/bouwmarktxl/.test(utmSource)) return 'BouwmarktXL';
    return `UTM: ${values.utm_source}`;
  }

  if (/google\./.test(referrerDomain)) return 'Google organisch';
  if (/bing\./.test(referrerDomain)) return 'Bing organisch';
  if (/bouwmarktxl/.test(referrerDomain)) return 'BouwmarktXL';
  if (referrerDomain) return referrerDomain;

  return 'Direct';
};

const setHiddenField = (fieldName, value) => {
  const field = form.elements[fieldName];
  if (field) field.value = value;
};

const populateCampaignFields = () => {
  const campaignValues = {};

  campaignFields.forEach((fieldName) => {
    const storageKey = `spatlappen_${fieldName}`;
    const queryValue = searchParameters.get(fieldName);
    if (queryValue) saveSessionValue(storageKey, queryValue);

    const value = queryValue || readSessionValue(storageKey);
    campaignValues[fieldName] = value;
    setHiddenField(fieldName, value);
  });

  const landingPageKey = 'spatlappen_landing_page';
  if (!readSessionValue(landingPageKey)) {
    saveSessionValue(landingPageKey, window.location.href);
  }

  const referrerKey = 'spatlappen_referrer_domain';
  const externalReferrerDomain = getExternalReferrerDomain();
  if (externalReferrerDomain && !readSessionValue(referrerKey)) {
    saveSessionValue(referrerKey, externalReferrerDomain);
  }

  const landingPage = readSessionValue(landingPageKey) || window.location.href;
  const referrerDomain = readSessionValue(referrerKey);
  setHiddenField('landing_page', landingPage);
  setHiddenField('referrer_domain', referrerDomain);
  setHiddenField('source_detected', detectSource(campaignValues, referrerDomain));
};

populateCampaignFields();

const showStatus = (type, message) => {
  statusElement.className = `form-status ${type}`;
  statusElement.textContent = message;
};

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  statusElement.className = 'form-status';
  statusElement.textContent = '';

  if (!form.reportValidity()) return;

  const file = form.elements.attachment.files[0];
  if (file && file.size > maxFileSize) {
    showStatus('error', 'Het bestand is groter dan 4 MB. Kies een kleiner bestand.');
    form.elements.attachment.focus();
    return;
  }

  const originalLabel = submitButton.textContent;
  submitButton.disabled = true;
  submitButton.textContent = 'Aanvraag verzenden…';

  try {
    const response = await fetch(formEndpoint, {
      method: 'POST',
      body: new FormData(form),
      headers: { Accept: 'application/json' },
    });

    let result = {};
    try {
      result = await response.json();
    } catch {
      // Een succesvolle lege response is ook geldig.
    }

    if (!response.ok) {
      throw new Error(result.error || 'De aanvraag kon niet worden verzonden.');
    }

    form.reset();
    setFormMetadata();
    populateCampaignFields();
    showStatus('success', 'Bedankt. Je aanvraag is verzonden. We nemen contact met je op.');
  } catch (error) {
    const fallbackMessage = 'Verzenden lukt nu niet. Mail naar info@spatlappenopmaat.nl of neem contact op via WhatsApp.';
    showStatus('error', error instanceof Error && error.message ? `${error.message} ${fallbackMessage}` : fallbackMessage);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = originalLabel;
  }
});
