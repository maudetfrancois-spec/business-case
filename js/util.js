// Helpers partagés : formatage fr-FR, DOM, concurrence.

export const CURRENT_YEAR = new Date().getFullYear();

const nf = (opts) => new Intl.NumberFormat('fr-FR', opts);

const FORMATTERS = {
  int:      nf({ maximumFractionDigits: 0 }),
  one:      nf({ minimumFractionDigits: 1, maximumFractionDigits: 1 }),
  two:      nf({ minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  compact:  nf({ notation: 'compact', maximumFractionDigits: 1 }),
  usd0:     nf({ style: 'currency', currency: 'USD', maximumFractionDigits: 0 }),
  usdCompact: nf({ style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 2 }),
};

// `format` est le nom d'un formateur ; `suffix` s'y ajoute (ex. « % »).
export function formatValue(value, { format = 'one', suffix = '' } = {}) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const fmt = FORMATTERS[format] || FORMATTERS.one;
  return fmt.format(value) + suffix;
}

export function formatSigned(value, opts) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const body = formatValue(Math.abs(value), opts);
  if (value > 0) return '+' + body;
  if (value < 0) return '−' + body; // vrai signe moins, aligné sur les chiffres
  return body;
}

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined) continue;
    node.append(child.nodeType ? child : document.createTextNode(child));
  }
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

// Exécute `worker` sur chaque élément avec au plus `limit` requêtes simultanées :
// l'API de la Banque mondiale n'aime pas 20 appels lancés d'un bloc.
export async function pool(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

export function debounce(fn, wait) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

export function downloadCsv(filename, rows) {
  const escape = (cell) => {
    const text = cell === null || cell === undefined ? '' : String(cell);
    return /[";\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  };
  // Séparateur point-virgule + BOM : Excel en locale française ouvre le
  // fichier sans passer par l'assistant d'import.
  const csv = '﻿' + rows.map((row) => row.map(escape).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = el('a', { href: url, download: filename });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

let toastTimer;
export function toast(message, ms = 6000) {
  const node = document.getElementById('toast');
  if (!node) return;
  node.textContent = message;
  node.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { node.hidden = true; }, ms);
}
