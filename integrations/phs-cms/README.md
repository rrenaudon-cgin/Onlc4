# Intégration CMS Photoservice / Photostation

Snapshot des add-ons Onlc4 au 7 octobre 2026. Sources génériques du moteur : branche `codex/integration-hooks`, base compilée `8761d3cae2a54ed5387f7800f27bbc2c3e28a6bc`.

Le moteur conserve ses correctifs de fenêtres et ses API publiques `setAutoActivation`, `showFor`, `hide`. Les fichiers ici sont des add-ons applicatifs séparés : intégration React, chargement, isolation CSS, contrôle de blocs, HTML highlighté et shortcodes CMS. Aucun remplacement automatique par l’amont.

## Changements récents

- Identifiant et destruction propres à chaque montage React ; protection contre les initialisations asynchrones obsolètes.
- Vérification du chargement des CSS dans l’iframe ; CSS de chaque site conservé lors de la sauvegarde.
- Activation des outils à la sélection du bloc, icône de type dans la palette, petits boutons d’insertion.
- Palettes flottantes hors du bloc sélectionné et hors des autres palettes ; recalcul au scroll, repli stable en haut si l’espace manque.
- Édition HTML du bloc dans CodeMirror ; styles cohérents avec les outils natifs ; langue française et plein écran.

## Réutilisation

Ces sources sont un snapshot de `e-Center/phs-next/migration/demo`. `src/CmsRichEditor.tsx` dépend des services et styles CMS de cette application (API médias, catalogue, sites, CodeMirror, React). Elles ne constituent pas une application autonome : copier/mettre à jour les add-ons dans les mêmes chemins et adapter les imports métier pour une autre application. Les plugins génériques restent compilés selon la procédure du README du fork.

La distribution applicative contient son moteur et les plugins minifiés avec SHA-256 dans `PROVENANCE.json`. Pour changer le moteur : choisir un commit, compiler, revoir les API, mettre à jour la provenance explicitement, importer avec `scripts/import-onlc4-fork.mjs`, puis exécuter les tests de cycle de vie, CSS, palettes et shortcodes. Ne pas charger une branche flottante ou un CDN non épinglé au démarrage.

Les fichiers `SNAPSHOT.json` relient chaque add-on à son SHA-256. Les données CMS et médias ne sont pas stockés dans ce fork.
