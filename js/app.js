// Assemblage : carte, sélecteurs, panneau, comparaison, bandeau de change.

import { fetchCountries, fetchWorldSnapshot, fetchFxRates } from './api.js';
import {
  INDICATORS, INDICATOR_BY_ID, GROUPS, DEFAULT_MAP_METRIC,
  SEQUENTIAL_RAMP, SERIES_COLORS, MAX_COMPARE,
} from './indicators.js';
import { WorldMap } from './map.js';
import { Panel } from './panel.js';
import { el, clear, formatValue, debounce, toast, CURRENT_YEAR } from './util.js';

const dom = {
  search: document.getElementById('search'),
  countryList: document.getElementById('country-list'),
  metric: document.getElementById('map-metric'),
  year: document.getElementById('year'),
  yearOut: document.getElementById('year-out'),
  legend: document.getElementById('map-legend'),
  legendTitle: document.getElementById('legend-title'),
  legendRamp: document.getElementById('legend-ramp'),
  legendMin: document.getElementById('legend-min'),
  legendMax: document.getElementById('legend-max'),
  legendNote: document.getElementById('legend-note'),
  tray: document.getElementById('compare-tray'),
  trayList: document.getElementById('compare-list'),
  panel: document.getElementById('panel'),
  panelBody: document.getElementById('panel-body'),
  panelClose: document.getElementById('panel-close'),
  freshness: document.getElementById('freshness'),
  fx: document.getElementById('fx'),
  fxDate: document.getElementById('fx-date'),
  fxList: document.getElementById('fx-list'),
};

// Les séries les plus récentes ne sont publiées qu'avec 1 à 3 ans de retard :
// on ouvre sur une année réellement renseignée plutôt que sur l'année en cours.
const DEFAULT_YEAR = CURRENT_YEAR - 2;

const state = {
  countries: [],
  byIso3: new Map(),
  selected: null,
  pinned: [],                 // iso3, ordre d'ajout
  metric: DEFAULT_MAP_METRIC,
  year: DEFAULT_YEAR,
};

// --- couleurs : attribuées à l'entité, libérées quand elle sort de la vue ---
const colorSlots = new Map();

function displayedIso3() {
  const list = [];
  if (state.selected) list.push(state.selected);
  for (const iso3 of state.pinned) {
    if (!list.includes(iso3) && list.length < MAX_COMPARE) list.push(iso3);
  }
  return list;
}

function syncColors() {
  const displayed = displayedIso3();
  for (const iso3 of [...colorSlots.keys()]) {
    if (!displayed.includes(iso3)) colorSlots.delete(iso3);
  }
  const used = new Set(colorSlots.values());
  for (const iso3 of displayed) {
    if (colorSlots.has(iso3)) continue;
    const free = SERIES_COLORS.find((color) => !used.has(color));
    if (!free) continue;
    colorSlots.set(iso3, free);
    used.add(free);
  }
}

const colorOf = (iso3) => colorSlots.get(iso3) || SERIES_COLORS[0];

// --- panneau ---------------------------------------------------------------

const panel = new Panel({
  root: dom.panel,
  body: dom.panelBody,
  closeButton: dom.panelClose,
  getYear: () => state.year,
  getCompare: () => displayedIso3()
    .filter((iso3) => iso3 !== state.selected)
    .map((iso3) => state.byIso3.get(iso3))
    .filter(Boolean),
  togglePin: (iso3) => togglePin(iso3),
  colorOf,
  onHide: () => {
    state.selected = null;
    setPanelOpen(false);
    worldMap.setSelected(null);
    syncColors();
    renderTray();
    history.replaceState(null, '', location.pathname + location.search);
  },
});

// --- carte -----------------------------------------------------------------

const worldMap = new WorldMap('map', { onSelect: (iso3) => selectCountry(iso3) });

let resizeTimer;
function setPanelOpen(open) {
  document.body.classList.toggle('panel-open', open);
  clearTimeout(resizeTimer);
  // Après la transition CSS, Leaflet doit recalculer sa taille utile.
  resizeTimer = setTimeout(() => worldMap.resize(), 260);
}

function selectCountry(iso3, { fly = false } = {}) {
  const country = state.byIso3.get(iso3);
  if (!country) return;
  state.selected = iso3;
  syncColors();
  setPanelOpen(true);
  worldMap.setSelected(iso3);
  if (fly) worldMap.flyTo(iso3);
  renderTray();
  panel.show(country);
  history.replaceState(null, '', '#' + iso3);
}

function togglePin(iso3) {
  const index = state.pinned.indexOf(iso3);
  if (index !== -1) {
    state.pinned.splice(index, 1);
  } else {
    const total = new Set([...(state.selected ? [state.selected] : []), ...state.pinned, iso3]);
    if (total.size > MAX_COMPARE) {
      toast(`La comparaison est limitée à ${MAX_COMPARE} pays : au-delà, les courbes ne sont plus distinguables, y compris pour un daltonien. Retirez-en un d'abord.`);
      return;
    }
    state.pinned.push(iso3);
  }
  syncColors();
  renderTray();
  panel.refresh();
}

function renderTray() {
  const displayed = displayedIso3();
  if (displayed.length < 2) {
    dom.tray.hidden = true;
    clear(dom.trayList);
    return;
  }
  dom.tray.hidden = false;
  clear(dom.trayList);
  for (const iso3 of displayed) {
    const country = state.byIso3.get(iso3);
    if (!country) continue;
    dom.trayList.append(el('li', { class: 'chip' }, [
      el('span', { class: 'swatch', style: `background:${colorOf(iso3)}` }),
      el('span', { text: country.name }),
      el('button', {
        type: 'button', 'aria-label': `Retirer ${country.name}`, text: '×',
        onclick: () => {
          if (iso3 === state.selected) panel.hide();
          else togglePin(iso3);
        },
      }),
    ]));
  }
}

// --- carte : indicateur + année -------------------------------------------

function buildMetricSelect() {
  clear(dom.metric);
  for (const group of GROUPS) {
    const optgroup = el('optgroup', { label: group });
    for (const indicator of INDICATORS.filter((i) => i.group === group)) {
      optgroup.append(el('option', {
        value: indicator.id,
        selected: indicator.id === state.metric,
        text: indicator.short,
      }));
    }
    dom.metric.append(optgroup);
  }
}

function renderLegend(indicator, bounds, effectiveYear) {
  if (!bounds) {
    dom.legend.hidden = true;
    return;
  }
  dom.legend.hidden = false;
  dom.legendTitle.textContent = `${indicator.short} — ${effectiveYear}`;
  clear(dom.legendRamp);
  for (const step of SEQUENTIAL_RAMP) {
    dom.legendRamp.append(el('span', { style: `background:${step}` }));
  }
  dom.legendMin.textContent = formatValue(bounds.lo, indicator);
  dom.legendMax.textContent = formatValue(bounds.hi, indicator);
  dom.legendNote.textContent = effectiveYear === state.year
    ? 'Échelle bornée aux 5e et 95e centiles. Gris = donnée non publiée.'
    : `Dernière année suffisamment couverte : ${effectiveYear}. Gris = donnée non publiée.`;
}

let snapshotToken = 0;

async function refreshSnapshot() {
  const token = ++snapshotToken;
  const indicator = INDICATOR_BY_ID.get(state.metric);
  let effectiveYear = state.year;
  let values = new Map();

  // Une année trop récente est souvent vide : on recule jusqu'à trois ans
  // pour trouver un millésime réellement publié, et on le dit dans la légende.
  for (let back = 0; back <= 3; back++) {
    const year = state.year - back;
    if (year < 1960) break;
    try {
      values = await fetchWorldSnapshot(state.metric, year);
    } catch (error) {
      if (token !== snapshotToken) return;
      toast("Carte : l'API de la Banque mondiale est injoignable (" + error.message + ').');
      return;
    }
    if (token !== snapshotToken) return;
    effectiveYear = year;
    if (values.size >= 20) break;
  }

  const bounds = worldMap.applySnapshot(values, indicator, effectiveYear);
  renderLegend(indicator, bounds, effectiveYear);
}

// --- bandeau de change -----------------------------------------------------

async function loadFx() {
  try {
    const data = await fetchFxRates();
    dom.fx.hidden = false;
    dom.fxDate.textContent = new Date(data.date + 'T00:00:00Z')
      .toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', timeZone: 'UTC' });
    dom.fxDate.dateTime = data.date;
    clear(dom.fxList);
    for (const [code, rate] of Object.entries(data.rates)) {
      dom.fxList.append(el('li', {}, [
        el('b', { text: code }),
        el('span', { text: formatValue(rate, { format: 'two' }) }),
      ]));
    }
    dom.freshness.textContent = `indicateurs annuels · change du ${data.date}`;
  } catch {
    dom.fx.hidden = true;
    dom.freshness.textContent = 'indicateurs annuels (décalage de publication de 1 à 3 ans)';
  }
}

// --- démarrage -------------------------------------------------------------

async function start() {
  buildMetricSelect();
  dom.year.max = String(CURRENT_YEAR);
  dom.year.value = String(state.year);
  dom.yearOut.textContent = String(state.year);

  loadFx();

  let countries;
  try {
    countries = await fetchCountries();
  } catch (error) {
    toast("Impossible de charger la liste des pays depuis l'API de la Banque mondiale : "
      + error.message + '. Vérifiez la connexion réseau, puis rechargez la page.', 20000);
    return;
  }

  state.countries = countries;
  state.byIso3 = new Map(countries.map((country) => [country.iso3, country]));

  clear(dom.countryList);
  for (const country of countries) {
    dom.countryList.append(el('option', { value: country.name, dataset: { iso3: country.iso3 } }));
  }

  worldMap.addCountries(countries);
  await refreshSnapshot();

  const hash = location.hash.replace('#', '').toUpperCase();
  if (state.byIso3.has(hash)) selectCountry(hash, { fly: true });
}

// --- écouteurs -------------------------------------------------------------

dom.metric.addEventListener('change', () => {
  state.metric = dom.metric.value;
  refreshSnapshot();
});

const onYearChange = debounce(() => {
  refreshSnapshot();
  panel.refresh();
}, 280);

dom.year.addEventListener('input', () => {
  state.year = Number(dom.year.value);
  dom.yearOut.textContent = String(state.year);
  onYearChange();
});

dom.search.addEventListener('change', () => {
  const name = dom.search.value.trim().toLowerCase();
  const match = state.countries.find((country) => country.name.toLowerCase() === name)
    || state.countries.find((country) => country.name.toLowerCase().startsWith(name));
  if (match) {
    selectCountry(match.iso3, { fly: true });
    dom.search.value = match.name;
  } else if (name) {
    toast(`Aucun pays ne correspond à « ${dom.search.value} ».`, 4000);
  }
});

start();
