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
  'utm_term',
  'utm_content',
  'gclid',
  'gbraid',
  'wbraid',
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

const populateCampaignFields = () => {
  campaignFields.forEach((fieldName) => {
    const storageKey = `spatlappen_${fieldName}`;
    const queryValue = searchParameters.get(fieldName);
    if (queryValue) saveSessionValue(storageKey, queryValue);

    const field = form.elements[fieldName];
    if (field) field.value = queryValue || readSessionValue(storageKey);
  });
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
