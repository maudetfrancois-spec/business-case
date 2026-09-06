// Accès aux API publiques. Aucune clé, aucun compte.
//
//   Banque mondiale — https://api.worldbank.org/v2  (indicateurs annuels)
//   Frankfurter     — https://api.frankfurter.dev   (taux de change BCE, quotidiens)
//
// Deux garde-fous :
//   1. un cache mémoire + localStorage (TTL 12 h) — les séries annuelles ne
//      bougent pas dans la journée, inutile de les redemander ;
//   2. un repli JSONP si `fetch` échoue (CORS bloqué par un proxy d'entreprise,
//      extension de navigateur…). L'API accepte `format=jsonP&prefix=`.

import { CURRENT_YEAR } from './util.js';

const WB_BASE = 'https://api.worldbank.org/v2';
const FX_BASE = 'https://api.frankfurter.dev/v1';

const CACHE_PREFIX = 'oem:v1:';
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

const memory = new Map();
const inflight = new Map();

function cacheGet(key) {
  if (memory.has(key)) return memory.get(key);
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (Date.now() - entry.t > CACHE_TTL_MS) {
      localStorage.removeItem(CACHE_PREFIX + key);
      return null;
    }
    memory.set(key, entry.v);
    return entry.v;
  } catch {
    return null;
  }
}

function cacheSet(key, value) {
  memory.set(key, value);
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ t: Date.now(), v: value }));
  } catch {
    // Quota atteint : on purge notre propre espace de noms et on abandonne le
    // cache persistant pour cette session. Le cache mémoire suffit.
    try {
      for (const k of Object.keys(localStorage)) {
        if (k.startsWith(CACHE_PREFIX)) localStorage.removeItem(k);
      }
    } catch { /* stockage indisponible (mode privé strict) */ }
  }
}

export function clearCache() {
  memory.clear();
  try {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith(CACHE_PREFIX)) localStorage.removeItem(k);
    }
  } catch { /* ignore */ }
}

let jsonpSeq = 0;

function jsonpRequest(url, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const name = '__oemCb' + (++jsonpSeq);
    const script = document.createElement('script');
    const timer = setTimeout(() => finish(new Error('Délai dépassé (JSONP)')), timeoutMs);

    function finish(error, data) {
      clearTimeout(timer);
      delete window[name];
      script.remove();
      error ? reject(error) : resolve(data);
    }

    window[name] = (data) => finish(null, data);
    script.src = url + '&format=jsonP&prefix=' + name;
    script.onerror = () => finish(new Error('Échec du chargement JSONP'));
    document.head.append(script);
  });
}

async function wbRequest(path, params = {}) {
  const query = new URLSearchParams({ ...params, per_page: params.per_page ?? 500 });
  const base = `${WB_BASE}${path}?${query}`;
  const key = base;

  const cached = cacheGet(key);
  if (cached) return cached;
  if (inflight.has(key)) return inflight.get(key);

  const request = (async () => {
    let payload;
    try {
      const response = await fetch(base + '&format=json', { mode: 'cors' });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      payload = await response.json();
    } catch (fetchError) {
      // Repli JSONP — utile quand `fetch` est bloqué en amont du navigateur.
      payload = await jsonpRequest(base).catch(() => {
        throw fetchError;
      });
    }
    if (!Array.isArray(payload)) throw new Error('Réponse inattendue de la Banque mondiale');
    if (payload[0] && payload[0].message) {
      const msg = payload[0].message[0];
      throw new Error(msg ? `${msg.id} — ${msg.value}` : 'Erreur API Banque mondiale');
    }
    const rows = payload[1] || [];
    cacheSet(key, rows);
    return rows;
  })().finally(() => inflight.delete(key));

  inflight.set(key, request);
  return request;
}

/** Liste des pays (agrégats régionaux exclus), avec coordonnées et métadonnées. */
export async function fetchCountries() {
  const rows = await wbRequest('/country', { per_page: 400 });
  return rows
    .filter((row) => row.region && row.region.id !== 'NA')
    .map((row) => ({
      iso3: row.id,
      iso2: (row.iso2Code || '').toLowerCase(),
      name: row.name,
      region: row.region.value,
      incomeLevel: row.incomeLevel ? row.incomeLevel.value : null,
      capital: row.capitalCity || null,
      lat: row.latitude ? Number(row.latitude) : null,
      lon: row.longitude ? Number(row.longitude) : null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

/**
 * Série historique complète d'un indicateur pour un pays.
 * On demande à partir de 1950 : la Banque mondiale renvoie ce qui existe,
 * c'est-à-dire 1960 au plus tôt pour la quasi-totalité des séries.
 * @returns {{years:number[], values:(number|null)[]}} années croissantes,
 *          trous conservés en `null` (jamais interpolés).
 */
export async function fetchSeries(iso3, indicatorId, fromYear = 1950) {
  const rows = await wbRequest(`/country/${iso3}/indicator/${indicatorId}`, {
    date: `${fromYear}:${CURRENT_YEAR}`,
    per_page: 300,
  });
  const byYear = new Map();
  for (const row of rows) {
    const year = Number(row.date);
    if (Number.isFinite(year)) byYear.set(year, row.value === null ? null : Number(row.value));
  }
  if (byYear.size === 0) return { years: [], values: [] };
  const min = Math.min(...byYear.keys());
  const max = Math.max(...byYear.keys());
  const years = [];
  const values = [];
  for (let year = min; year <= max; year++) {
    years.push(year);
    const value = byYear.has(year) ? byYear.get(year) : null;
    values.push(Number.isFinite(value) ? value : null);
  }
  return { years, values };
}

/** Valeurs d'un indicateur pour tous les pays sur une seule année. */
export async function fetchWorldSnapshot(indicatorId, year) {
  const rows = await wbRequest(`/country/all/indicator/${indicatorId}`, {
    date: String(year),
    per_page: 400,
  });
  const map = new Map();
  for (const row of rows) {
    const iso3 = row.countryiso3code || (row.country && row.country.id);
    if (iso3 && row.value !== null) map.set(iso3, Number(row.value));
  }
  return map;
}

/** Taux de change de référence BCE (publiés chaque jour ouvré, ~16 h CET). */
export async function fetchFxRates(base = 'EUR', symbols = ['USD', 'GBP', 'JPY', 'CNY', 'CHF']) {
  const url = `${FX_BASE}/latest?base=${base}&symbols=${symbols.join(',')}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error('HTTP ' + response.status);
  return response.json(); // { amount, base, date, rates }
}
