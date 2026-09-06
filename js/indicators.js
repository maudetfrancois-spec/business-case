// Catalogue des indicateurs Banque mondiale (source 2 : World Development
// Indicators). `id` est le code officiel, réutilisé tel quel dans les URLs.
//
// Champs :
//   group     regroupement affiché dans le panneau
//   label     libellé long (titre de graphique)
//   short     libellé court (tuile)
//   unit      unité, affichée sous le titre du graphique
//   format    formateur de util.js
//   suffix    suffixe collé au nombre
//   higherIsBetter  sens de lecture d'une variation (null = neutre)
//   signed    true -> on affiche explicitement le signe (soldes)
//   logCapable  true -> propose l'échelle logarithmique
//   startsAt  première année réellement couverte (transparence sur les séries
//             courtes : le chômage OIT ne remonte pas avant 1991)

export const INDICATORS = [
  {
    id: 'NY.GDP.PCAP.CD', group: 'Économie', label: 'PIB par habitant',
    short: 'PIB / habitant', unit: 'USD courants', format: 'usd0',
    higherIsBetter: true, logCapable: true, startsAt: 1960, headline: true,
  },
  {
    id: 'NY.GDP.PCAP.PP.CD', group: 'Économie', label: 'PIB par habitant en PPA',
    short: 'PIB / hab. (PPA)', unit: '$ internationaux courants', format: 'usd0',
    higherIsBetter: true, logCapable: true, startsAt: 1990,
  },
  {
    id: 'NY.GDP.MKTP.CD', group: 'Économie', label: 'PIB total',
    short: 'PIB total', unit: 'USD courants', format: 'usdCompact',
    higherIsBetter: true, logCapable: true, startsAt: 1960,
  },
  {
    id: 'NY.GDP.MKTP.KD.ZG', group: 'Économie', label: 'Croissance du PIB',
    short: 'Croissance du PIB', unit: '% annuel, volume', format: 'one',
    suffix: ' %', higherIsBetter: true, signed: true, startsAt: 1961,
  },
  {
    id: 'FP.CPI.TOTL.ZG', group: 'Économie', label: 'Inflation des prix à la consommation',
    short: 'Inflation', unit: '% annuel', format: 'one', suffix: ' %',
    higherIsBetter: false, signed: true, startsAt: 1960,
  },
  {
    id: 'BN.CAB.XOKA.GD.ZS', group: 'Économie', label: 'Solde courant',
    short: 'Solde courant', unit: '% du PIB', format: 'one', suffix: ' %',
    higherIsBetter: null, signed: true, startsAt: 1974,
  },

  {
    id: 'GC.NLD.TOTL.GD.ZS', group: 'Finances publiques',
    label: 'Capacité (+) ou besoin (−) de financement des administrations',
    short: 'Solde public', unit: '% du PIB', format: 'one', suffix: ' %',
    higherIsBetter: null, signed: true, deficitLike: true, startsAt: 1972,
    headline: true,
  },
  {
    id: 'GC.DOD.TOTL.GD.ZS', group: 'Finances publiques',
    label: "Dette de l'administration centrale", short: 'Dette publique',
    unit: '% du PIB', format: 'one', suffix: ' %', higherIsBetter: false,
    startsAt: 1990,
  },
  {
    id: 'GC.REV.XGRT.GD.ZS', group: 'Finances publiques',
    label: 'Recettes publiques hors dons', short: 'Recettes publiques',
    unit: '% du PIB', format: 'one', suffix: ' %', higherIsBetter: null,
    startsAt: 1972,
  },
  {
    id: 'GC.XPN.TOTL.GD.ZS', group: 'Finances publiques',
    label: 'Dépenses publiques', short: 'Dépenses publiques',
    unit: '% du PIB', format: 'one', suffix: ' %', higherIsBetter: null,
    startsAt: 1972,
  },

  {
    id: 'SP.POP.TOTL', group: 'Démographie', label: 'Population totale',
    short: 'Population', unit: 'habitants', format: 'compact',
    higherIsBetter: null, logCapable: true, startsAt: 1960, headline: true,
  },
  {
    id: 'SP.POP.GROW', group: 'Démographie', label: 'Croissance démographique',
    short: 'Croissance démo.', unit: '% annuel', format: 'two', suffix: ' %',
    higherIsBetter: null, signed: true, startsAt: 1961,
  },
  {
    id: 'SP.DYN.LE00.IN', group: 'Démographie', label: 'Espérance de vie à la naissance',
    short: 'Espérance de vie', unit: 'années', format: 'one', suffix: ' ans',
    higherIsBetter: true, startsAt: 1960,
  },
  {
    id: 'SP.DYN.TFRT.IN', group: 'Démographie', label: 'Indice synthétique de fécondité',
    short: 'Fécondité', unit: 'enfants par femme', format: 'two',
    higherIsBetter: null, startsAt: 1960,
  },
  {
    id: 'SP.POP.65UP.TO.ZS', group: 'Démographie', label: 'Population de 65 ans et plus',
    short: '65 ans et plus', unit: '% de la population', format: 'one',
    suffix: ' %', higherIsBetter: null, startsAt: 1960,
  },
  {
    id: 'SP.URB.TOTL.IN.ZS', group: 'Démographie', label: 'Population urbaine',
    short: 'Population urbaine', unit: '% de la population', format: 'one',
    suffix: ' %', higherIsBetter: null, startsAt: 1960,
  },

  {
    id: 'SL.UEM.TOTL.ZS', group: 'Emploi', label: 'Taux de chômage',
    short: 'Chômage', unit: '% de la population active — estimation OIT',
    format: 'one', suffix: ' %', higherIsBetter: false, startsAt: 1991,
    headline: true,
  },
  {
    id: 'SL.UEM.1524.ZS', group: 'Emploi', label: 'Chômage des 15-24 ans',
    short: 'Chômage des jeunes', unit: '% de la population active 15-24 ans — estimation OIT',
    format: 'one', suffix: ' %', higherIsBetter: false, startsAt: 1991,
  },
  {
    id: 'SL.TLF.CACT.ZS', group: 'Emploi', label: "Taux d'activité (15 ans et plus)",
    short: "Taux d'activité", unit: '% de la population 15+ — estimation OIT',
    format: 'one', suffix: ' %', higherIsBetter: null, startsAt: 1990,
  },
];

export const INDICATOR_BY_ID = new Map(INDICATORS.map((i) => [i.id, i]));

export const GROUPS = ['Économie', 'Finances publiques', 'Démographie', 'Emploi'];

// Indicateur affiché sur la carte au chargement.
export const DEFAULT_MAP_METRIC = 'NY.GDP.PCAP.CD';

// Rampe séquentielle bleue, une seule teinte, ordonnée sombre -> clair pour
// une surface sombre (la valeur basse recule vers le fond).
export const SEQUENTIAL_RAMP = [
  '#184f95', '#1c5cab', '#256abf', '#2a78d6', '#3987e5', '#5598e7', '#86b6ef',
];

// Emplacements catégoriels, attribués par entité (jamais par rang).
export const SERIES_COLORS = ['#3987e5', '#d95926', '#199e70'];
export const MAX_COMPARE = SERIES_COLORS.length;
