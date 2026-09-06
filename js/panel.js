// Panneau de détail pays : chiffre héros, tuiles par thème, graphiques
// historiques dépliables, vue tableau et export CSV.

import { INDICATORS, GROUPS, INDICATOR_BY_ID } from './indicators.js';
import { fetchSeries } from './api.js';
import { LineChart } from './chart.js';
import { el, clear, formatValue, formatSigned, downloadCsv, pool, toast } from './util.js';

const HERO_ID = 'NY.GDP.PCAP.CD';

/**
 * Valeur retenue pour une année : la valeur exacte si elle existe, sinon la
 * dernière valeur connue *antérieure*. Une année située avant le début de la
 * série ne renvoie rien — afficher la valeur de 2024 sous l'étiquette « 1985 »
 * serait un contresens.
 */
export function valueAt(series, year) {
  if (!series || !series.years.length) return { value: null, year: null };
  if (year < series.years[0]) return { value: null, year: null };
  let index = series.years.indexOf(year);
  if (index === -1) index = series.years.length - 1; // année postérieure à la série
  for (let i = index; i >= 0; i--) {
    if (Number.isFinite(series.values[i])) {
      return { value: series.values[i], year: series.years[i] };
    }
  }
  return { value: null, year: null };
}

/** Valeur non nulle précédant strictement `year`. */
function previousValue(series, year) {
  if (!series) return { value: null, year: null };
  for (let i = series.years.length - 1; i >= 0; i--) {
    if (series.years[i] < year && Number.isFinite(series.values[i])) {
      return { value: series.values[i], year: series.years[i] };
    }
  }
  return { value: null, year: null };
}

const isPercentUnit = (indicator) => (indicator.suffix || '').includes('%');

export class Panel {
  /**
   * @param {object} deps
   *   root, body, closeButton : éléments du DOM
   *   getYear()               : année sélectionnée
   *   getCompare()            : [{iso3, name, iso2, color}] pays épinglés
   *   togglePin(iso3)         : épingle / désépingle
   *   colorOf(iso3)           : couleur stable de l'entité
   */
  constructor(deps) {
    this.deps = deps;
    this.store = new Map();       // iso3 -> Map(indicatorId -> série)
    this.openCharts = new Set();  // indicateurs dépliés, conservés d'un pays à l'autre
    this.charts = new Map();      // indicatorId -> LineChart
    this.country = null;
    this.token = 0;

    deps.closeButton.addEventListener('click', () => this.hide());
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !deps.root.hidden) this.hide();
    });
  }

  hide() {
    this.deps.root.hidden = true;
    this.destroyCharts();
    this.country = null;
    this.deps.onHide && this.deps.onHide();
  }

  destroyCharts() {
    for (const chart of this.charts.values()) chart.destroy();
    this.charts.clear();
  }

  /** Charge (avec cache) toutes les séries d'un pays. */
  async loadCountry(iso3) {
    if (this.store.has(iso3)) return this.store.get(iso3);
    const entries = await pool(INDICATORS, 6, async (indicator) => {
      try {
        return [indicator.id, await fetchSeries(iso3, indicator.id)];
      } catch {
        return [indicator.id, { years: [], values: [], failed: true }];
      }
    });
    const map = new Map(entries);
    this.store.set(iso3, map);
    return map;
  }

  seriesFor(iso3, indicatorId) {
    const map = this.store.get(iso3);
    return map ? map.get(indicatorId) : null;
  }

  async show(country) {
    this.country = country;
    const token = ++this.token;
    const { root, body } = this.deps;
    root.hidden = false;
    root.scrollTop = 0;
    root.focus({ preventScroll: true });
    this.destroyCharts();
    clear(body);
    body.append(this.renderHead(country), this.renderSkeleton());

    let map;
    try {
      map = await this.loadCountry(country.iso3);
    } catch (error) {
      if (token !== this.token) return;
      clear(body);
      body.append(this.renderHead(country), el('p', { class: 'note', text:
        "Impossible de joindre l'API de la Banque mondiale : " + error.message }));
      return;
    }
    if (token !== this.token) return;

    const failed = [...map.values()].filter((s) => s.failed).length;
    clear(body);
    body.append(this.renderHead(country));
    body.append(this.renderHero(country));
    body.append(this.renderActions(country));
    for (const group of GROUPS) body.append(...this.renderGroup(group, country));
    this.chartsHost = el('section', { class: 'charts-host' });
    body.append(this.chartsHost);
    body.append(this.renderNote(failed));

    for (const indicatorId of this.openCharts) this.mountChart(indicatorId);
  }

  /** Redessine avec les mêmes données (changement d'année ou de comparaison). */
  refresh() {
    if (this.country) this.show(this.country);
  }

  renderHead(country) {
    return el('div', { class: 'panel-head' }, [
      el('img', {
        src: `https://flagcdn.com/w80/${country.iso2}.png`, alt: '',
        width: 44, height: 33,
      }),
      el('div', {}, [
        el('h2', { text: country.name }),
        el('p', {
          class: 'panel-meta',
          text: [country.region, country.incomeLevel, country.capital]
            .filter(Boolean).join(' · '),
        }),
      ]),
    ]);
  }

  renderSkeleton() {
    return el('div', { class: 'tiles', style: 'margin-top:24px' },
      Array.from({ length: 6 }, () => el('div', { class: 'tile' }, [
        el('div', { class: 'skeleton', style: 'width:70%' }),
        el('div', { class: 'skeleton', style: 'width:45%;height:20px;margin-top:10px' }),
      ])));
  }

  renderHero(country) {
    const indicator = INDICATOR_BY_ID.get(HERO_ID);
    const series = this.seriesFor(country.iso3, HERO_ID);
    const year = this.deps.getYear();
    const current = valueAt(series, year);
    const previous = previousValue(series, current.year ?? year);

    const sub = [el('span', {
      text: current.year ? `Année ${current.year}` : 'Aucune donnée publiée',
    })];

    if (Number.isFinite(current.value) && Number.isFinite(previous.value) && previous.value !== 0) {
      const pct = ((current.value - previous.value) / Math.abs(previous.value)) * 100;
      const direction = pct > 0.05 ? 'up' : pct < -0.05 ? 'down' : 'flat';
      sub.push(el('span', {
        class: 'delta ' + direction,
        text: `${direction === 'up' ? '▲' : direction === 'down' ? '▼' : '■'} ${formatSigned(pct, { format: 'one', suffix: ' %' })}`,
      }));
      sub.push(el('span', { text: `vs ${previous.year}` }));
    }

    return el('div', { class: 'hero' }, [
      el('p', { class: 'hero-label', text: indicator.label + ' — ' + indicator.unit }),
      el('p', { class: 'hero-value', text: formatValue(current.value, indicator) }),
      el('p', { class: 'hero-sub' }, sub),
    ]);
  }

  renderActions(country) {
    const compare = this.deps.getCompare();
    const pinned = compare.some((c) => c.iso3 === country.iso3);
    return el('div', { class: 'panel-actions' }, [
      el('button', {
        class: 'btn', type: 'button', 'aria-pressed': String(pinned),
        text: pinned ? '✓ Dans la comparaison' : '+ Comparer ce pays',
        onclick: () => this.deps.togglePin(country.iso3),
      }),
      el('button', {
        class: 'btn', type: 'button', text: 'Historique complet',
        onclick: () => {
          for (const indicator of INDICATORS) {
            if (indicator.headline) this.toggleChart(indicator.id, true);
          }
          this.chartsHost.scrollIntoView({ behavior: 'smooth', block: 'start' });
        },
      }),
      el('button', {
        class: 'btn', type: 'button', text: 'CSV — toutes les séries',
        onclick: () => this.exportAll(country),
      }),
    ]);
  }

  renderGroup(group, country) {
    const indicators = INDICATORS.filter((i) => i.group === group);
    const year = this.deps.getYear();

    const tiles = indicators.map((indicator) => {
      const series = this.seriesFor(country.iso3, indicator.id);
      const current = valueAt(series, year);
      const open = this.openCharts.has(indicator.id);

      const children = [
        el('p', { class: 'tile-label', text: indicator.short }),
      ];

      if (Number.isFinite(current.value)) {
        children.push(el('p', {
          class: 'tile-value',
          text: indicator.signed
            ? formatSigned(current.value, indicator)
            : formatValue(current.value, indicator),
        }));
        children.push(el('p', {
          class: 'tile-year',
          text: current.year === year ? String(year) : `${current.year} (dernière connue)`,
        }));
        // Statut : icône + libellé, jamais la couleur seule.
        if (indicator.deficitLike) {
          const surplus = current.value >= 0;
          children.push(el('p', {
            class: 'tile-flag ' + (surplus ? 'good' : 'critical'),
            text: (surplus ? '▲ Excédent' : '▼ Déficit'),
          }));
        }
      } else {
        children.push(el('p', { class: 'tile-value na', text: 'Non disponible' }));
        const first = series && series.years.length ? series.years[0] : null;
        children.push(el('p', {
          class: 'tile-year',
          text: first === null ? 'Série non publiée pour ce pays'
            : year < first ? `Série publiée à partir de ${first}`
            : `Aucune valeur jusqu'à ${year}`,
        }));
      }

      return el('button', {
        class: 'tile', type: 'button', 'aria-expanded': String(open),
        title: `${indicator.label} — afficher l'historique`,
        onclick: () => this.toggleChart(indicator.id),
      }, children);
    });

    return [
      el('h3', { class: 'group-title', text: group }),
      el('div', { class: 'tiles' }, tiles),
    ];
  }

  renderNote(failedCount) {
    const lines = [
      'Données annuelles de la Banque mondiale (World Development Indicators). '
      + "Ce ne sont pas des données temps réel : chaque série est publiée avec un décalage "
      + 'de 1 à 3 ans selon le pays et l’indicateur.',
      'La profondeur historique commence en 1960 pour la plupart des séries (1991 pour le '
      + 'chômage, 1990 pour la dette et le PIB en PPA). Rien n’est publié avant 1960.',
      'Le solde public correspond à la capacité (+) ou au besoin (−) de financement de '
      + "l'administration centrale, et non des administrations publiques au sens de Maastricht : "
      + 'il diffère du chiffre de déficit publié par Eurostat ou l’Insee.',
      'Chômage et taux d’activité sont des estimations modélisées de l’OIT, comparables entre '
      + 'pays mais différentes des séries nationales.',
    ];
    if (failedCount) {
      lines.unshift(`${failedCount} série(s) n’ont pas pu être chargées (erreur réseau ou API).`);
    }
    return el('div', { class: 'note' }, lines.map((text) => el('p', { text })));
  }

  toggleChart(indicatorId, forceOpen = false) {
    const open = this.openCharts.has(indicatorId);
    if (open && !forceOpen) {
      this.openCharts.delete(indicatorId);
      const chart = this.charts.get(indicatorId);
      if (chart) { chart.destroy(); this.charts.delete(indicatorId); }
      const card = this.chartsHost.querySelector(`[data-chart="${indicatorId}"]`);
      if (card) card.remove();
    } else if (!open) {
      this.openCharts.add(indicatorId);
      this.mountChart(indicatorId);
    }
    // Les tuiles sont rendues dans l'ordre du catalogue, groupe par groupe :
    // la position dans INDICATORS donne donc la tuile correspondante.
    const tiles = this.deps.body.querySelectorAll('.tile');
    const position = INDICATORS.findIndex((i) => i.id === indicatorId);
    const tile = tiles[position];
    if (tile) tile.setAttribute('aria-expanded', String(this.openCharts.has(indicatorId)));
  }

  /** Séries à tracer : pays affiché + pays épinglés, couleur par entité. */
  buildSeries(indicatorId) {
    const wanted = [];
    if (this.country) wanted.push(this.country);
    for (const country of this.deps.getCompare()) {
      if (!wanted.some((c) => c.iso3 === country.iso3)) wanted.push(country);
    }
    return wanted.map((country) => ({
      key: country.iso3,
      label: country.name,
      color: this.deps.colorOf(country.iso3),
      ...(this.seriesFor(country.iso3, indicatorId) || { years: [], values: [] }),
    }));
  }

  async mountChart(indicatorId) {
    if (!this.chartsHost) return;
    if (this.chartsHost.querySelector(`[data-chart="${indicatorId}"]`)) return;
    const indicator = INDICATOR_BY_ID.get(indicatorId);
    if (!indicator) return;

    // Les pays comparés doivent être chargés pour apparaître dans le graphique.
    for (const country of this.deps.getCompare()) {
      if (!this.store.has(country.iso3)) await this.loadCountry(country.iso3).catch(() => {});
    }

    const state = { log: false, table: false };
    const figure = el('div', {});
    const legendHost = el('ul', { class: 'chart-legend' });
    const tableHost = el('div', {});

    const logButton = indicator.logCapable ? el('button', {
      class: 'btn', type: 'button', 'aria-pressed': 'false', text: 'Log',
      title: 'Échelle logarithmique',
    }) : null;

    const tableButton = el('button', {
      class: 'btn', type: 'button', 'aria-pressed': 'false', text: 'Tableau',
    });

    const card = el('article', {
      class: 'chart-card', dataset: { chart: indicatorId },
    }, [
      el('div', { class: 'chart-head' }, [
        el('div', {}, [
          el('h4', { class: 'chart-title', text: indicator.label }),
          el('p', { class: 'chart-sub', text: indicator.unit }),
        ]),
        el('div', { class: 'chart-tools' }, [
          logButton,
          tableButton,
          el('button', {
            class: 'btn', type: 'button', text: 'CSV',
            onclick: () => this.exportChart(indicator),
          }),
          el('button', {
            class: 'btn', type: 'button', text: '×', 'aria-label': 'Fermer ce graphique',
            onclick: () => this.toggleChart(indicatorId),
          }),
        ]),
      ]),
      legendHost,
      figure,
      tableHost,
    ]);

    this.chartsHost.append(card);

    const chart = new LineChart(figure, { indicator });
    this.charts.set(indicatorId, chart);

    const draw = () => {
      const series = this.buildSeries(indicatorId);
      chart.setData(series, { logScale: state.log });

      // Légende : présente dès deux séries ; inutile à une seule (le titre suffit).
      clear(legendHost);
      if (series.length > 1) {
        for (const serie of series) {
          legendHost.append(el('li', {}, [
            el('span', { class: 'legend-key', style: `background:${serie.color}` }),
            el('span', { text: serie.label }),
          ]));
        }
      }

      clear(tableHost);
      if (state.table) tableHost.append(this.renderTable(indicator, series));
    };

    if (logButton) {
      logButton.addEventListener('click', () => {
        state.log = !state.log;
        logButton.setAttribute('aria-pressed', String(state.log));
        draw();
      });
    }
    tableButton.addEventListener('click', () => {
      state.table = !state.table;
      tableButton.setAttribute('aria-pressed', String(state.table));
      draw();
    });

    draw();
  }

  renderTable(indicator, series) {
    const years = [...new Set(series.flatMap((s) => s.years))].sort((a, b) => b - a);
    const head = el('tr', {}, [el('th', { text: 'Année' }),
      ...series.map((s) => el('th', { text: s.label }))]);
    const rows = years.map((year) => el('tr', {}, [
      el('td', { text: String(year) }),
      ...series.map((s) => {
        const index = s.years.indexOf(year);
        const value = index === -1 ? null : s.values[index];
        return el('td', {
          text: Number.isFinite(value) ? formatValue(value, indicator) : 'n. d.',
        });
      }),
    ]));
    return el('div', { class: 'table-scroll' }, [
      el('table', { class: 'data-table' }, [
        el('thead', {}, [head]),
        el('tbody', {}, rows),
      ]),
    ]);
  }

  exportChart(indicator) {
    const series = this.buildSeries(indicator.id);
    const years = [...new Set(series.flatMap((s) => s.years))].sort((a, b) => a - b);
    const rows = [['Indicateur', indicator.label], ['Code Banque mondiale', indicator.id],
      ['Unité', indicator.unit], [],
      ['Année', ...series.map((s) => s.label)]];
    for (const year of years) {
      rows.push([year, ...series.map((s) => {
        const index = s.years.indexOf(year);
        const value = index === -1 ? null : s.values[index];
        return Number.isFinite(value) ? String(value).replace('.', ',') : '';
      })]);
    }
    downloadCsv(`${indicator.id}.csv`, rows);
  }

  exportAll(country) {
    const map = this.store.get(country.iso3);
    if (!map) return;
    const years = [];
    for (let year = 1960; year <= new Date().getFullYear(); year++) years.push(year);
    const header = ['Année', ...INDICATORS.map((i) => `${i.short} (${i.id})`)];
    const rows = [header];
    for (const year of years) {
      const line = [year];
      let hasValue = false;
      for (const indicator of INDICATORS) {
        const series = map.get(indicator.id);
        const index = series ? series.years.indexOf(year) : -1;
        const value = index === -1 ? null : series.values[index];
        if (Number.isFinite(value)) hasValue = true;
        line.push(Number.isFinite(value) ? String(value).replace('.', ',') : '');
      }
      if (hasValue) rows.push(line);
    }
    downloadCsv(`${country.iso3}-indicateurs.csv`, rows);
    toast(`Export CSV : ${rows.length - 1} années pour ${country.name}.`, 4000);
  }
}
