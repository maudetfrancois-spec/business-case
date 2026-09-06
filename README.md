# Observatoire de l'économie mondiale

Carte mondiale interactive sur fond sombre. Un drapeau par pays ; un clic ouvre
la fiche économique du pays (PIB par habitant, solde public, démographie,
chômage…) avec l'historique complet des séries et la possibilité de comparer
jusqu'à trois pays.

Site statique : aucun build, aucune clé d'API, aucun serveur applicatif.

## Ce que l'outil fait — et ce qu'il ne fait pas

Deux points à connaître avant de s'en servir, parce qu'ils contredisent
l'attente naturelle du « temps réel » :

1. **Les indicateurs macroéconomiques ne sont pas des données temps réel.**
   Le PIB, le déficit public ou le chômage sont publiés par les instituts
   nationaux avec un décalage de plusieurs mois à plusieurs années, puis
   consolidés par la Banque mondiale en séries **annuelles**. Aucune API
   publique gratuite ne fournit un PIB « en direct » : ce chiffre n'existe pas.
   La seule donnée réellement quotidienne de l'application est le bandeau de
   taux de change (référence BCE, publiée chaque jour ouvré vers 16 h CET).
2. **L'historique commence en 1960, pas en 1950.** La base World Development
   Indicators de la Banque mondiale ne remonte pas au-delà pour la quasi-
   totalité des séries. Certaines commencent bien plus tard : 1991 pour le
   chômage (estimations OIT), 1990 pour la dette publique et le PIB en PPA,
   1972 pour les finances publiques. L'application affiche systématiquement
   l'année réelle de chaque valeur et laisse les trous visibles — les courbes
   sont coupées aux années manquantes, jamais interpolées.

Pour des séries antérieures à 1960, il faut sortir des API publiques
gratuites : projet Maddison (PIB par habitant reconstitué depuis 1820,
fichiers Excel), base Jordà-Schularick-Taylor, ou les archives nationales
(Insee, BEA…). Aucune n'expose d'API interrogeable en direct.

## Sources

| Source | Usage | Clé | Licence |
|---|---|---|---|
| [Banque mondiale, API Indicators v2](https://datahelpdesk.worldbank.org/knowledgebase/articles/889392) | 19 indicateurs annuels, 217 pays | aucune | CC BY 4.0 |
| [Frankfurter](https://frankfurter.dev) (taux de référence BCE) | bandeau de change quotidien | aucune | domaine public |
| [flagcdn.com](https://flagcdn.com) | drapeaux | aucune | domaine public |
| [CARTO « dark matter »](https://carto.com/basemaps/) + OpenStreetMap | fond de carte sombre | aucune | ODbL / CC BY |
| [Leaflet 1.9.4](https://leafletjs.com) | moteur cartographique, versionné dans `vendor/` | — | BSD-2-Clause |

Le solde public utilisé (`GC.NLD.TOTL.GD.ZS`) est la capacité (+) ou le besoin
(−) de financement de l'**administration centrale**, pas des administrations
publiques au sens de Maastricht : il ne coïncide pas avec le déficit publié par
Eurostat ou l'Insee. C'est le prix d'une série homogène sur 200 pays.

## Lancer en local

Un serveur HTTP est indispensable : les modules ES et les appels CORS ne
fonctionnent pas depuis `file://`.

```bash
python3 -m http.server 8000
# puis http://localhost:8000
```

## Déploiement

`.github/workflows/pages.yml` publie le dépôt tel quel sur GitHub Pages à
chaque poussée sur `main`. Il faut activer une fois **Settings → Pages →
Source : GitHub Actions**. N'importe quel hébergeur de fichiers statiques
convient également (Netlify, Cloudflare Pages, S3).

## Utilisation

- **Cliquer un drapeau** ouvre la fiche pays.
- **Cliquer une tuile** déplie l'historique de l'indicateur ; `Log` bascule en
  échelle logarithmique, `Tableau` affiche les valeurs, `CSV` les exporte.
- **« Comparer ce pays »** épingle un pays ; jusqu'à trois séries se
  superposent sur chaque graphique. La limite n'est pas cosmétique : au-delà,
  les couleurs cessent d'être distinguables en vision daltonienne.
- **Le curseur d'année** change l'année lue sur les tuiles et sur la carte.
  L'anneau de chaque drapeau porte la valeur de l'indicateur choisi (rampe
  bleue, échelle bornée aux 5ᵉ et 95ᵉ centiles) ; gris = donnée non publiée.
- **`#FRA` dans l'URL** ouvre directement la fiche du pays (code ISO-3).

## Architecture

```
index.html          structure
css/styles.css      thème sombre, jetons de couleur
js/api.js           client Banque mondiale + Frankfurter, cache 12 h, repli JSONP
js/indicators.js    catalogue des 19 indicateurs, palettes
js/map.js           carte Leaflet, marqueurs drapeau
js/chart.js         graphique en courbes SVG (survol, échelle log, trous)
js/panel.js         fiche pays, tuiles, tableaux, exports
js/app.js           état applicatif et câblage
vendor/leaflet/     Leaflet 1.9.4
```

Les réponses de l'API sont mises en cache 12 h dans `localStorage` : la
deuxième visite d'un pays est instantanée et l'API n'est pas resollicitée.
Si `fetch` échoue (proxy d'entreprise bloquant le CORS), le client bascule
automatiquement sur JSONP, que l'API de la Banque mondiale supporte.
