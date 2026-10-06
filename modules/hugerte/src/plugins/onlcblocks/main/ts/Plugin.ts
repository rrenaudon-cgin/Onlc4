import { Optional } from '@ephox/katamari';

import PluginManager from 'hugerte/core/api/PluginManager';
import * as Assets from 'hugerte/plugins/onlcshared/Assets';
import * as BlockActions from 'hugerte/plugins/onlcshared/BlockActions';
import * as PublishedCss from 'hugerte/plugins/onlcshared/PublishedCss';
import * as SiteCss from 'hugerte/plugins/onlcshared/SiteCss';
import * as ActionIcons from 'hugerte/plugins/onlcshared/ui/ActionIcons';
import * as DialogStyles from 'hugerte/plugins/onlcshared/ui/DialogStyles';

import * as Commands from './api/Commands';
import * as Options from './api/Options';
import * as Blocks from './core/Blocks';
import * as Controller from './core/Controller';
import * as Grid from './core/Grid';
import * as Buttons from './ui/Buttons';
import * as Kinds from './ui/Kinds';
import * as PropertiesDialog from './ui/PropertiesDialog';

/**
 * Block based workspace: every element behaving as a block gets a toolbar to move, duplicate or
 * delete it, and blocks can be added at the beginning, between two blocks or at the end of the
 * page. Bootstrap rows and columns are handled as first class citizens.
 *
 * @class hugerte.onlcblocks.Plugin
 * @private
 */

export interface OnlcBlocksApi {
  readonly setAutoActivation: (enabled: boolean) => void;
  readonly showFor: (node: Node | null) => void;
  readonly hide: () => void;
  readonly isEnabled: () => boolean;
  readonly toggle: () => void;
  readonly getActiveBlock: () => Optional<HTMLElement>;
  readonly listBlocks: () => HTMLElement[];
  readonly insertRow: (widths: number[]) => void;
  /**
   * Le bloc manipulable qui entoure ce nœud, ou `null`.
   *
   * Les autres plugins s'en servent pour savoir si la barre des blocs prend déjà cet élément en
   * charge, et donc s'ils doivent ouvrir leur propre bulle de propriétés.
   */
  readonly blockAt: (node: Node) => HTMLElement | null;
}

export default (): void => {
  PluginManager.add('onlcblocks', (editor, pluginUrl): OnlcBlocksApi => {
    Options.register(editor);

    DialogStyles.setup(editor);

    // Dit aux autres plugins que la barre des blocs existe : leurs boutons de propriétés y
    // trouveront une place, et leur bulle contextuelle n'a plus lieu de s'ouvrir par-dessus.
    BlockActions.declareToolbar(editor);

    // Les types du html ordinaire. Chaque plugin déclare les siens, plus précis : un diaporama
    // est reconnu par `onlcswiper` avant d'être vu ici comme une section.
    Kinds.declare(editor);

    // Feuille de style du site : elle habille la zone d'écriture, et ses classes garnissent les
    // suggestions du formulaire des propriétés.
    SiteCss.setup(editor);

    /**
     * Identifiant et classes, en premier dans la rangée des propriétés.
     *
     * C'est le seul bouton que **tout** bloc ordinaire propose : il vient donc avant ceux des
     * plugins, qui ne concernent chacun qu'une famille de blocs.
     */
    BlockActions.declare(editor, {
      id: 'onlcblocks-properties',
      label: 'Identifiant et classes du bloc',
      icon: ActionIcons.sliders,
      order: 100,
      match: (target, block) => PropertiesDialog.isEditable(target, block)
        ? Optional.some(block)
        : Optional.none<HTMLElement>(),
      run: (target, block) => PropertiesDialog.open(target, block)
    });

    if (Options.shouldInjectStyles(editor)) {
      editor.contentCSS.push(Assets.urlOf(editor, pluginUrl, 'css/onlcblocks.css'));
    }

    // Grille du site (Bootstrap par exemple) : sans elle, les lignes et les colonnes
    // s'empilent dans l'éditeur alors qu'elles seront côte à côte sur la page publiée. L'aperçu
    // la reprend pour la même raison ; un gabarit qui la charge déjà ne la charge pas deux fois.
    //
    // `onlcblocks.css`, elle, ne sort jamais de l'éditeur : elle ne décrit que les outils.
    const gridCss = Options.getGridCss(editor);
    if (gridCss !== '') {
      editor.contentCSS.push(gridCss);
      PublishedCss.declareSheets(editor, [ gridCss ]);
    }

    /**
     * Les gouttières négatives des lignes de premier niveau.
     *
     * Une ligne de grille porte des marges négatives — `margin: 0 -12px` chez Bootstrap — qu'un
     * conteneur compense sur la page publiée. Dans la zone d'écriture il n'y a pas de conteneur :
     * la ligne déborde alors des deux côtés, et une barre de défilement horizontale apparaît sans
     * rien à faire défiler.
     *
     * Elles sont donc remises à zéro, mais **seulement pour les lignes posées directement dans le
     * corps du document** : une ligne à l'intérieur d'une colonne ou d'un conteneur est déjà
     * compensée par le retrait de celui-ci, et l'aplatir décalerait son contenu. Les colonnes
     * gardent leur propre retrait : la ligne reste inscrite dans la page comme elle le sera sur le
     * site, sans pouvoir en sortir quelle que soit la largeur de gouttière choisie.
     */
    editor.contentStyles.push(
      `body.onlc-blocks-enabled > .${Options.getRowClass(editor)} { margin-right: 0; margin-left: 0; }`
    );

    /**
     * Rien ne se sélectionne dans un contenu **non modifiable**.
     *
     * Un diaporama, une fiche de microdonnées, un jeton de script, la carte d'un code court, les
     * parties dessinées d'un bloc prédéfini : tous portent `contenteditable="false"`, et tous se
     * règlent par leur formulaire. Le curseur posé au milieu ferait croire qu'on peut les
     * corriger sur place, et le texte qu'on y copierait n'aurait pas de rapport avec ce qui sera
     * publié — un résumé de fiche, un aperçu de script.
     *
     * La règle est posée une fois pour toutes, plutôt que par chaque plugin : ce qui la déclenche
     * est l'attribut du cœur, pas une classe de l'un ou de l'autre. Les parties **modifiables**
     * d'un bloc prédéfini — le titre d'un bandeau, la légende d'une visionneuse — la lèvent
     * aussitôt : elles sont faites pour qu'on y écrive.
     */
    editor.contentStyles.push(
      'body [contenteditable="false"] { user-select: none; -webkit-user-select: none; }' +
      'body [contenteditable="false"] [contenteditable="true"] { user-select: text; -webkit-user-select: text; }'
    );

    /**
     * Le modèle de boîte que la grille suppose.
     *
     * Les distributions « grille seule » de Bootstrap — celles qu'on charge pour ne pas emporter
     * tout le reste — ne posent `box-sizing: border-box` que sur les **colonnes**. Le modèle
     * global, elles le tiennent pour acquis : il vient de la remise à zéro de la distribution
     * complète, que le site charge et que l'éditeur ne charge pas.
     *
     * Sans lui, un conteneur en `width: 100%` avec ses 12 pixels de retrait de chaque côté mesure
     * vingt-quatre pixels de trop. La page déborde alors sur la droite, une barre de défilement
     * horizontale apparaît sans rien à faire défiler, et le rendu ne ressemble plus à celui du
     * site — où le modèle est bien `border-box`.
     *
     * La règle est posée sur les conteneurs de grille seulement, pas sur tout le contenu : ce
     * serait changer le modèle de boîte d'une page dont on ne sait rien.
     */
    if (gridCss !== '') {
      editor.contentStyles.push(
        '.container,.container-fluid,.container-sm,.container-md,' +
        '.container-lg,.container-xl,.container-xxl { box-sizing: border-box; }'
      );
    }

    const controller = Controller.setup(editor);

    Commands.register(editor, controller);
    Buttons.register(editor, controller);

    return {
      setAutoActivation: (value) => controller.setAutoActivation(value),
      showFor: (node) => controller.showFor(node),
      hide: () => controller.hide(),
      isEnabled: () => controller.isEnabled(),
      toggle: () => controller.toggle(),
      getActiveBlock: () => controller.getActive(),
      listBlocks: () => Blocks.listAll(editor),
      insertRow: (widths: number[]) => Grid.insertRow(editor, widths, controller.getActive(), 'after'),
      blockAt: (node: Node) => Blocks.getBlockFor(editor, node).getOrNull()
    };
  });
};
