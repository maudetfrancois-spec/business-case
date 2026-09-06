// Carte Leaflet sur fond sombre + marqueurs drapeau.
//
// L'anneau du marqueur porte la valeur de l'indicateur cartographié via une
// rampe séquentielle d'une seule teinte (bleu, sombre -> clair) : la valeur
// basse recule vers le fond, la haute avance. Le drapeau lui-même n'est jamais
// recoloré — il porte l'identité, pas la magnitude.

import { SEQUENTIAL_RAMP } from './indicators.js';
import { formatValue, el } from './util.js';

const TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> '
  + '&copy; <a href="https://carto.com/attributions">CARTO</a>';

export class WorldMap {
  constructor(elementId, { onSelect }) {
    this.onSelect = onSelect;
    this.markers = new Map();   // iso3 -> { marker, node, img }
    this.selected = null;
    this.pinned = new Set();

    this.map = L.map(elementId, {
      worldCopyJump: true,
      minZoom: 2,
      maxZoom: 7,
      zoomControl: true,
      attributionControl: true,
      maxBounds: [[-85, -220], [85, 220]],
      maxBoundsViscosity: 0.6,
    }).setView([26, 12], 2);

    L.tileLayer(TILE_URL, {
      attribution: TILE_ATTR,
      subdomains: 'abcd',
      maxZoom: 7,
      detectRetina: true,
    }).addTo(this.map);

    this.map.on('zoomend', () => this.applyZoomSizing());
  }

  markerSize() {
    const zoom = this.map.getZoom();
    if (zoom <= 2) return 20;
    if (zoom === 3) return 26;
    if (zoom === 4) return 32;
    return 40;
  }

  applyZoomSizing() {
    const size = this.markerSize();
    for (const entry of this.markers.values()) entry.node.style.width = size + 'px';
  }

  addCountries(countries) {
    const size = this.markerSize();
    for (const country of countries) {
      if (!Number.isFinite(country.lat) || !Number.isFinite(country.lon) || !country.iso2) continue;

      const img = el('img', {
        src: `https://flagcdn.com/w40/${country.iso2}.png`,
        srcset: `https://flagcdn.com/w80/${country.iso2}.png 2x`,
        alt: '',
        width: 40, height: 30, loading: 'lazy', decoding: 'async',
      });
      img.addEventListener('error', () => { img.style.visibility = 'hidden'; }, { once: true });

      const button = el('button', {
        type: 'button',
        title: country.name,
        'aria-label': country.name,
        style: `width:${size}px`,
      }, [img]);

      const wrapper = el('div', { class: 'flag-marker' }, [button]);
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        this.onSelect(country.iso3);
      });

      const marker = L.marker([country.lat, country.lon], {
        icon: L.divIcon({ html: wrapper, className: 'flag-marker-wrap', iconSize: null }),
        keyboard: false,
        riseOnHover: true,
      }).addTo(this.map);

      this.markers.set(country.iso3, { marker, node: button, wrapper, country });
    }
  }

  /** Colore les anneaux et met à jour les infobulles pour une année donnée. */
  applySnapshot(values, indicator, year) {
    const numbers = [...values.values()].filter(Number.isFinite).sort((a, b) => a - b);
    if (!numbers.length) {
      for (const entry of this.markers.values()) entry.node.style.borderColor = '#2f3843';
      return null;
    }

    // Bornes au 5e/95e centile : une valeur extrême (Monaco, Luxembourg…) ne
    // doit pas écraser toute l'échelle.
    const quantile = (q) => numbers[Math.min(numbers.length - 1,
      Math.max(0, Math.round(q * (numbers.length - 1))))];
    const lo = quantile(0.05);
    const hi = quantile(0.95);
    const span = hi - lo || 1;

    for (const [iso3, entry] of this.markers) {
      const value = values.get(iso3);
      if (!Number.isFinite(value)) {
        entry.node.style.borderColor = '#2f3843';
        entry.node.style.opacity = '0.45';
        entry.marker.unbindTooltip();
        entry.marker.bindTooltip(
          `<b>${entry.country.name}</b><span class="tip-value">${indicator.short} · n. d. en ${year}</span>`,
          { className: 'country-tip', direction: 'top', offset: [0, -6] });
        continue;
      }
      const ratio = Math.min(1, Math.max(0, (value - lo) / span));
      const step = SEQUENTIAL_RAMP[Math.round(ratio * (SEQUENTIAL_RAMP.length - 1))];
      entry.node.style.borderColor = step;
      entry.node.style.opacity = '1';
      entry.marker.unbindTooltip();
      entry.marker.bindTooltip(
        `<b>${entry.country.name}</b><span class="tip-value">${indicator.short} · `
        + `${formatValue(value, indicator)} (${year})</span>`,
        { className: 'country-tip', direction: 'top', offset: [0, -6] });
    }
    return { lo, hi };
  }

  setSelected(iso3) {
    if (this.selected && this.markers.has(this.selected)) {
      this.markers.get(this.selected).wrapper.classList.remove('is-selected');
    }
    this.selected = iso3;
    const entry = iso3 && this.markers.get(iso3);
    if (entry) entry.wrapper.classList.add('is-selected');
  }

  /** À appeler quand le conteneur change de taille (ouverture du panneau). */
  resize() {
    this.map.invalidateSize({ pan: false });
  }

  flyTo(iso3) {
    const entry = this.markers.get(iso3);
    if (!entry) return;
    const target = entry.marker.getLatLng();
    this.map.flyTo(target, Math.max(this.map.getZoom(), 4), { duration: 0.8 });
  }
}
