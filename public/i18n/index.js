import { en } from './en.js';
import { am } from './am.js';
import { om } from './om.js';
import { so } from './so.js';
import { ti } from './ti.js';

const STORAGE_KEY = 'tikwheel.language';
const languagePacks = { en, am, om, so, ti };
let currentLanguage = localStorage.getItem(STORAGE_KEY) || 'en';
let translating = false;

if (!languagePacks[currentLanguage]) {
  currentLanguage = 'en';
}

export function initI18n({ onChange } = {}) {
  const selector = document.querySelector('#language-select');
  if (selector) {
    selector.value = currentLanguage;
    selector.addEventListener('change', () => {
      setLanguage(selector.value);
      if (typeof onChange === 'function') onChange(currentLanguage);
      applyI18n(document.body);
    });
  }

  document.documentElement.lang = currentLanguage;
  document.documentElement.dir = languagePacks[currentLanguage].dir || 'ltr';
  applyI18n(document.body);

  const observer = new MutationObserver((mutations) => {
    if (translating) return;
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => applyI18n(node));
      if (mutation.type === 'characterData') {
        applyTextNode(mutation.target);
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
}

export function setLanguage(languageCode) {
  currentLanguage = languagePacks[languageCode] ? languageCode : 'en';
  localStorage.setItem(STORAGE_KEY, currentLanguage);
  document.documentElement.lang = currentLanguage;
  document.documentElement.dir = languagePacks[currentLanguage].dir || 'ltr';
}

export function translate(value) {
  const key = String(value ?? '').trim();
  if (!key) return value;
  const pack = languagePacks[currentLanguage] || en;
  return pack.messages[key] || en.messages[key] || key;
}

export function translateError(message) {
  return translate(message || 'Request failed');
}

export function applyI18n(root = document.body) {
  if (!root) return;
  translating = true;
  try {
    if (root.nodeType === Node.TEXT_NODE) {
      applyTextNode(root);
      return;
    }

    const element = root.nodeType === Node.ELEMENT_NODE ? root : null;
    if (element) {
      applyElementAttributes(element);
    }

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
      acceptNode(node) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const tagName = node.tagName?.toLowerCase();
          if (tagName === 'script' || tagName === 'style' || node.closest?.('[data-no-i18n]')) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
        if (!node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        if (node.parentElement?.closest('[data-no-i18n]')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    let node = walker.currentNode;
    while (node) {
      if (node.nodeType === Node.TEXT_NODE) {
        applyTextNode(node);
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        applyElementAttributes(node);
      }
      node = walker.nextNode();
    }
  } finally {
    translating = false;
  }
}

function applyTextNode(node) {
  if (node.__i18nSource === undefined) {
    node.__i18nSource = node.nodeValue;
  }
  const original = node.__i18nSource;
  const translated = translateCompositeText(original);
  if (translated !== node.nodeValue) {
    node.nodeValue = translated;
  }
}

function applyElementAttributes(element) {
  for (const attributeName of ['placeholder', 'aria-label', 'title']) {
    if (element.hasAttribute?.(attributeName)) {
      const sourceName = `data-i18n-${attributeName}-source`;
      if (!element.hasAttribute(sourceName)) {
        element.setAttribute(sourceName, element.getAttribute(attributeName));
      }
      const original = element.getAttribute(sourceName);
      element.setAttribute(attributeName, translateCompositeText(original));
    }
  }
}

function translateCompositeText(value) {
  const text = String(value ?? '');
  const trimmed = text.trim();
  if (!trimmed) return text;

  const leading = text.match(/^\s*/)?.[0] || '';
  const trailing = text.match(/\s*$/)?.[0] || '';
  let translated = translate(trimmed);
  if (translated !== trimmed) return `${leading}${translated}${trailing}`;

  translated = translateDynamicText(trimmed);
  return `${leading}${translated}${trailing}`;
}

function translateDynamicText(text) {
  const replacements = [
    [/^Version (.+) effective (.+)\.$/, (_, version, date) => `${translate('Version')} ${version} ${translate('effective')} ${date}.`],
    [/^Winner: (.+)$/, (_, value) => `${translate('Winner')}: ${translatePlayerLabels(value)}`],
    [/^WINNER: (.+)$/, (_, value) => `${translate('WINNER')}: ${translatePlayerLabels(value)}`],
    [/^Players: (.+)$/, (_, value) => `${translate('Players')}: ${value}`],
    [/^Prize: (.+)$/, (_, value) => `${translate('Prize')}: ${value}`],
    [/^Status: (.+)$/, (_, value) => `${translate('Status')}: ${translate(value)}`],
    [/^Ref: (.+)$/, (_, value) => `${translate('Ref')}: ${value}`],
    [/^Reference: (.+)$/, (_, value) => `${translate('Reference')}: ${value}`],
    [/^Capacity: (.+)$/, (_, value) => `${translate('Capacity')}: ${value}`],
    [/^Live link: (.+)$/, (_, value) => `${translate('Live link')}: ${translate(value)}`],
    [/^Entries: (.+) \| Verified: (.+) \| Pending: (.+)$/, (_, entries, verified, pending) => `${translate('Entries')}: ${entries} | ${translate('Verified')}: ${verified} | ${translate('Pending')}: ${pending}`],
    [/^Winner positions: (.+)$/, (_, value) => `${translate('Winner positions')}: ${value}`],
    [/^Actor: (.+)$/, (_, value) => `${translate('Actor')}: ${translate(value)}`],
    [/^Before: (.+)$/, (_, value) => `${translate('Before')}: ${value}`],
    [/^After: (.+)$/, (_, value) => `${translate('After')}: ${value}`],
    [/^(.+) players \| Prize: (.+)$/, (_, players, prize) => `${players} ${translate('players')} | ${translate('Prize')}: ${prize}`],
    [/^(.+) verified players \| Entry: (.+) \| Prize: (.+)$/, (_, players, entry, prize) => `${players} ${translate('verified players')} | ${translate('Entry')}: ${entry} | ${translate('Prize')}: ${prize}`],
    [/^Welcome back, (.+)$/, (_, name) => `${translate('Welcome back,')} ${name}`],
    [/^(.+) - Player (.+)$/, (_, label, position) => `${label} - ${translate('Player')} ${position}`],
    [/^Position (.+)$/, (_, value) => `${translate('Position')} ${value}`],
  ];

  for (const [pattern, replacer] of replacements) {
    if (pattern.test(text)) return text.replace(pattern, replacer);
  }

  return translateDelimitedText(text);
}

function translateDelimitedText(text) {
  return text
    .split(/(\s+\|\s+|\s+-\s+)/)
    .map((part) => {
      if (/^\s+\|\s+$/.test(part) || /^\s+-\s+$/.test(part)) return part;
      return translate(part);
    })
    .join('');
}

function translatePlayerLabels(value) {
  return value.replace(/PLAYER/g, translate('PLAYER')).replace(/Player/g, translate('Player'));
}
