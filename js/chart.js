// Graphique en courbes SVG, sans dépendance.
//
// Choix de forme : les séries sont des variations dans le temps -> courbe.
// Une seule échelle Y par graphique (jamais de double axe) ; les indicateurs
// d'unités différentes vivent dans des graphiques séparés.
// Les trous de données restent des trous : la courbe est coupée, jamais
// interpolée par-dessus une année manquante.

import { el, clear, formatValue } from './util.js';

const M = { top: 14, right: 94, bottom: 26, left: 54 };
const HEIGHT = 196;
const NS = 'http://www.w3.org/2000/svg';

const INK = {
  primary: '#f2f6fa',
  secondary: '#a8b4c0',
  muted: '#7b8794',
  grid: '#232a32',
  axis: '#2f3843',
  surface: '#151a1f',
};

function svgEl(tag, attrs = {}) {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined) continue;
    node.setAttribute(key, String(value));
  }
  return node;
}

/** Graduations « rondes » (1 / 2 / 2,5 / 5 × 10^n) couvrant [min, max]. */
function niceTicks(min, max, count = 4) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { ticks: [0, 1], lo: 0, hi: 1 };
  if (min === max) {
    const pad = Math.abs(min) > 0 ? Math.abs(min) * 0.1 : 1;
    min -= pad;
    max += pad;
  }
  const rawStep = (max - min) / count;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const normalized = rawStep / magnitude;
  const step = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10) * magnitude;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.abs(v) < step / 1e6 ? 0 : v);
  return { ticks, lo, hi };
}

function axisLabel(value, indicator) {
  const abs = Math.abs(value);
  if (abs >= 10000) return formatValue(value, { format: 'compact' });
  if (abs >= 100 || Number.isInteger(value)) return formatValue(value, { format: 'int' });
  return formatValue(value, { format: indicator && indicator.format === 'two' ? 'two' : 'one' });
}

/** Découpe une série en segments continus : un `null` termine le segment. */
function segments(years, values) {
  const out = [];
  let current = null;
  for (let i = 0; i < years.length; i++) {
    if (values[i] === null || !Number.isFinite(values[i])) {
      current = null;
      continue;
    }
    if (!current) {
      current = [];
      out.push(current);
    }
    current.push([years[i], values[i]]);
  }
  return out;
}

export class LineChart {
  /**
   * @param {HTMLElement} container conteneur positionné en `relative`
   * @param {object} options { indicator, logScale }
   */
  constructor(container, options = {}) {
    this.container = container;
    this.container.classList.add('chart-figure');
    this.options = options;
    this.series = [];
    this.tooltip = el('div', { class: 'chart-tooltip', hidden: true });
    this.container.append(this.tooltip);
    this._onResize = () => this.render();
    if (window.ResizeObserver) {
      this._observer = new ResizeObserver(() => this.render());
      this._observer.observe(this.container);
    } else {
      window.addEventListener('resize', this._onResize);
    }
  }

  destroy() {
    if (this._observer) this._observer.disconnect();
    else window.removeEventListener('resize', this._onResize);
  }

  setData(series, options = {}) {
    this.series = series.filter((s) => s.years && s.years.length);
    Object.assign(this.options, options);
    this.render();
  }

  render() {
    const width = Math.max(260, this.container.clientWidth || 320);
    if (this._svg) this._svg.remove();
    this.tooltip.hidden = true;

    const points = this.series.flatMap((s) =>
      s.values.map((v, i) => ({ year: s.years[i], value: v })).filter((p) => Number.isFinite(p.value)));

    if (!points.length) {
      this._svg = el('p', { class: 'chart-empty', text: 'Aucune donnée publiée pour cette série.' });
      this.container.append(this._svg);
      return;
    }

    const indicator = this.options.indicator || {};
    const logScale = Boolean(this.options.logScale) && points.every((p) => p.value > 0);

    const xMin = Math.min(...points.map((p) => p.year));
    const xMax = Math.max(...points.map((p) => p.year));
    const vMin = Math.min(...points.map((p) => p.value));
    const vMax = Math.max(...points.map((p) => p.value));

    const plotW = width - M.left - M.right;
    const plotH = HEIGHT - M.top - M.bottom;

    const x = (year) => M.left + (xMax === xMin ? plotW / 2 : ((year - xMin) / (xMax - xMin)) * plotW);

    let y;
    let yTicks;
    if (logScale) {
      const lo = Math.log10(vMin);
      const hi = Math.log10(vMax) || lo + 1;
      const span = hi - lo || 1;
      y = (v) => M.top + plotH - ((Math.log10(v) - lo) / span) * plotH;
      yTicks = [];
      for (let e = Math.floor(lo); e <= Math.ceil(hi); e++) {
        const v = Math.pow(10, e);
        if (v >= vMin * 0.5 && v <= vMax * 2) yTicks.push(v);
      }
      if (yTicks.length < 2) yTicks = [vMin, vMax];
    } else {
      const { ticks, lo, hi } = niceTicks(Math.min(0, vMin) === 0 && vMin >= 0 ? 0 : vMin, vMax);
      const span = hi - lo || 1;
      y = (v) => M.top + plotH - ((v - lo) / span) * plotH;
      yTicks = ticks;
    }

    const svg = svgEl('svg', {
      viewBox: `0 0 ${width} ${HEIGHT}`,
      width: '100%',
      height: HEIGHT,
      role: 'img',
      'aria-label': `${indicator.label || 'Série'} — ${xMin} à ${xMax}`,
    });

    // --- grille : hairlines pleines, une marche au-dessus de la surface ----
    for (const tick of yTicks) {
      const yy = y(tick);
      if (!Number.isFinite(yy)) continue;
      svg.append(svgEl('line', {
        x1: M.left, x2: width - M.right, y1: yy, y2: yy,
        stroke: tick === 0 ? INK.axis : INK.grid, 'stroke-width': 1,
      }));
      const label = svgEl('text', {
        x: M.left - 8, y: yy + 3.5, 'text-anchor': 'end',
        fill: INK.muted, 'font-size': 10.5, style: 'font-variant-numeric:tabular-nums',
      });
      label.textContent = axisLabel(tick, indicator);
      svg.append(label);
    }

    // --- axe des années ----------------------------------------------------
    const yearSpan = xMax - xMin;
    const stepYears = yearSpan > 55 ? 20 : yearSpan > 28 ? 10 : yearSpan > 12 ? 5 : yearSpan > 5 ? 2 : 1;
    const firstTick = Math.ceil(xMin / stepYears) * stepYears;
    const candidates = [];
    for (let year = firstTick; year <= xMax; year += stepYears) candidates.push(year);

    // Les bornes sont toujours étiquetées ; une graduation régulière trop
    // proche d'une borne est supprimée plutôt que superposée.
    const MIN_GAP = 36;
    const xTicks = [xMin];
    for (const year of candidates) {
      if (year === xMin || year === xMax) continue;
      if (x(year) - x(xTicks[xTicks.length - 1]) < MIN_GAP) continue;
      if (x(xMax) - x(year) < MIN_GAP) continue;
      xTicks.push(year);
    }
    if (xMax !== xMin) xTicks.push(xMax);

    for (const year of xTicks) {
      const label = svgEl('text', {
        x: x(year), y: HEIGHT - 8, 'text-anchor': 'middle',
        fill: INK.muted, 'font-size': 10.5, style: 'font-variant-numeric:tabular-nums',
      });
      label.textContent = String(year);
      svg.append(label);
    }
    svg.append(svgEl('line', {
      x1: M.left, x2: width - M.right, y1: M.top + plotH, y2: M.top + plotH,
      stroke: INK.axis, 'stroke-width': 1,
    }));

    // --- séries ------------------------------------------------------------
    const single = this.series.length === 1;
    const endLabels = [];

    this.series.forEach((serie) => {
      const parts = segments(serie.years, serie.values);
      if (!parts.length) return;

      // Lavis d'aire à ~10 % : uniquement en série unique, sinon les
      // superpositions salissent la lecture.
      if (single) {
        for (const part of parts) {
          if (part.length < 2) continue;
          const d = part.map(([yr, v], i) => `${i ? 'L' : 'M'}${x(yr)} ${y(v)}`).join(' ')
            + ` L${x(part[part.length - 1][0])} ${M.top + plotH}`
            + ` L${x(part[0][0])} ${M.top + plotH} Z`;
          svg.append(svgEl('path', { d, fill: serie.color, 'fill-opacity': 0.10 }));
        }
      }

      for (const part of parts) {
        if (part.length === 1) {
          svg.append(svgEl('circle', {
            cx: x(part[0][0]), cy: y(part[0][1]), r: 2.5, fill: serie.color,
          }));
          continue;
        }
        const d = part.map(([yr, v], i) => `${i ? 'L' : 'M'}${x(yr)} ${y(v)}`).join(' ');
        svg.append(svgEl('path', {
          d, fill: 'none', stroke: serie.color, 'stroke-width': 2,
          'stroke-linejoin': 'round', 'stroke-linecap': 'round',
        }));
      }

      const last = parts[parts.length - 1][parts[parts.length - 1].length - 1];
      // Marqueur de fin : anneau 2px couleur surface pour rester lisible
      // quand deux courbes se croisent.
      svg.append(svgEl('circle', {
        cx: x(last[0]), cy: y(last[1]), r: 4,
        fill: serie.color, stroke: INK.surface, 'stroke-width': 2,
      }));
      endLabels.push({ serie, x: x(last[0]), y: y(last[1]), value: last[1], year: last[0] });
    });

    // Étiquettes de fin : on n'étiquette que le dernier point (jamais chaque
    // point). En cas de collision on écarte et on tire un fil conducteur.
    endLabels.sort((a, b) => a.y - b.y);
    let previous = -Infinity;
    for (const label of endLabels) {
      const placed = Math.max(label.y, previous + 13);
      previous = placed;
      if (Math.abs(placed - label.y) > 2) {
        svg.append(svgEl('path', {
          d: `M${label.x + 5} ${label.y} L${label.x + 11} ${placed}`,
          stroke: INK.axis, 'stroke-width': 1, fill: 'none',
        }));
      }
      const text = svgEl('text', {
        x: label.x + 9, y: placed + 3.5, fill: INK.secondary,
        'font-size': 11, 'font-weight': 600,
        style: 'font-variant-numeric:tabular-nums',
      });
      text.textContent = formatValue(label.value, indicator);
      svg.append(text);
    }

    // --- couche de survol : réticule + infobulle ---------------------------
    const crosshair = svgEl('line', {
      y1: M.top, y2: M.top + plotH, stroke: INK.axis, 'stroke-width': 1, opacity: 0,
    });
    svg.append(crosshair);
    const hoverDots = svgEl('g', { opacity: 0 });
    svg.append(hoverDots);

    const overlay = svgEl('rect', {
      x: M.left, y: M.top, width: plotW, height: plotH, fill: 'transparent',
    });
    svg.append(overlay);

    const hide = () => {
      crosshair.setAttribute('opacity', 0);
      hoverDots.setAttribute('opacity', 0);
      this.tooltip.hidden = true;
    };

    const move = (event) => {
      const rect = svg.getBoundingClientRect();
      const scale = width / rect.width;
      const px = (event.clientX - rect.left) * scale;
      const ratio = Math.min(1, Math.max(0, (px - M.left) / (plotW || 1)));
      const year = Math.round(xMin + ratio * (xMax - xMin));
      const cx = x(year);

      crosshair.setAttribute('x1', cx);
      crosshair.setAttribute('x2', cx);
      crosshair.setAttribute('opacity', 1);
      clear(hoverDots);

      const rows = [];
      let topY = M.top + plotH;
      for (const serie of this.series) {
        const index = serie.years.indexOf(year);
        const value = index === -1 ? null : serie.values[index];
        rows.push({ serie, value });
        if (Number.isFinite(value)) {
          const cy = y(value);
          topY = Math.min(topY, cy);
          hoverDots.append(svgEl('circle', {
            cx, cy, r: 4.5, fill: serie.color, stroke: INK.surface, 'stroke-width': 2,
          }));
        }
      }
      hoverDots.setAttribute('opacity', 1);

      clear(this.tooltip);
      this.tooltip.append(el('p', { class: 'tt-year', text: String(year) }));
      this.tooltip.append(el('ul', {}, rows.map(({ serie, value }) => el('li', {}, [
        el('span', { class: 'swatch', style: `background:${serie.color}` }),
        el('span', { text: serie.label }),
        el('span', {
          class: 'tt-val',
          text: Number.isFinite(value) ? formatValue(value, indicator) : 'n. d.',
        }),
      ]))));

      const left = Math.min(Math.max((cx / width) * this.container.clientWidth, 70),
        this.container.clientWidth - 70);
      this.tooltip.style.left = left + 'px';
      this.tooltip.style.top = Math.max(28, (topY / HEIGHT) * this.container.clientHeight - 10) + 'px';
      this.tooltip.hidden = false;
    };

    svg.addEventListener('pointermove', move);
    svg.addEventListener('pointerleave', hide);

    this._svg = svg;
    this.container.prepend(svg);
  }
}
