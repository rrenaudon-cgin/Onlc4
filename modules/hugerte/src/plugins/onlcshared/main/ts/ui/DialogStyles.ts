import { dialogLayout } from './DialogLayout';
import { Type } from '@ephox/katamari';

import Editor from 'hugerte/core/api/Editor';

/**
 * Confort tactile des dialogues ONLC.
 *
 * Les commandes du thème sont dessinées pour la souris : un bouton d'action fait environ trente
 * pixels de haut, une vignette de collection vingt-quatre. Au doigt, on vise à côté. Ces règles
 * portent chaque cible cliquable à **50 × 50 pixels au minimum**, taille en dessous de laquelle
 * l'erreur de pointage devient fréquente sur un téléphone.
 *
 * Elles sont limitées aux dialogues (`.tox-dialog`) : la barre d'outils de l'éditeur garde sa
 * densité, qui reste utile sur un grand écran.
 *
 * Le préfixe `.tox` est nécessaire pour passer devant le reset très large du thème
 * (`.tox :not(svg):not(rect)`), qui gagnerait sinon par spécificité.
 */

const styleId = 'onlc-dialog-touch-styles';

const minimum = 50;

/** Couleurs reprises du thème, pour que les ajouts ne détonnent pas. */
const accent = '#006ce7';
const ink = '#22303c';
const muted = '#5a6570';
const line = 'rgba(34, 47, 62, .12)';

/**
 * Onglets.
 *
 * Le thème les dessine comme des mots posés les uns sous les autres : pas de retrait, une
 * largeur qui suit celle du texte, et pour seul repère un trait de deux pixels **sous** l'onglet
 * actif — un soulignement, alors que la liste est verticale. On lit une colonne de liens
 * dépareillés, pas une barre d'onglets.
 *
 * Ils deviennent donc des pastilles de pleine largeur : retrait régulier, coins arrondis,
 * survol visible, et un onglet actif rempli à la couleur d'accent. Sous 768 pixels le thème
 * bascule la liste à l'horizontale ; les pastilles suivent, en bande défilante.
 */
const tabs =
  `.tox .tox-dialog__body-nav { gap: 2px; padding: 12px; align-self: stretch; overflow-y: auto; border-right: 1px solid ${line}; }` +
  '.tox .tox-dialog__body-nav { background: #f7f9fb; }' +
  '@media only screen and (min-width: 768px) { .tox .tox-dialog__body-nav { min-width: 176px; max-width: 176px; } }' +
  '.tox .tox-dialog__body-nav-item {' +
  ' display: flex; align-items: center; box-sizing: border-box; width: 100%; max-width: none;' +
  ` min-height: 44px; margin: 0; padding: 6px 14px; border: 0; border-radius: 8px; color: ${ink};` +
  ' font-size: 14px; font-weight: 500; line-height: 1.3; text-align: left; white-space: normal; }' +
  '.tox .tox-dialog__body-nav-item:hover { background: rgba(0, 108, 231, .09); }' +
  `.tox .tox-dialog__body-nav-item:focus { background: rgba(0, 108, 231, .14); box-shadow: inset 0 0 0 2px ${accent}; outline: 0; }` +
  '.tox .tox-dialog__body-nav-item--active,' +
  '.tox .tox-dialog__body-nav-item--active:hover,' +
  `.tox .tox-dialog__body-nav-item--active:focus { background: ${accent}; color: #fff; font-weight: 600; }` +
  // Sous 768 pixels le thème passe la liste en rangée : la pastille ne prend plus toute la
  // largeur, et la bande défile latéralement plutôt que de comprimer les intitulés.
  '@media only screen and (max-width: 767px) {' +
  ' .tox .tox-dialog__body-nav { border-right: 0; border-bottom: 1px solid ' + line + '; padding: 8px; overflow-x: auto; }' +
  ' .tox .tox-dialog__body-nav-item { width: auto; flex-shrink: 0; white-space: nowrap; } }';

/**
 * Bouton de fermeture.
 *
 * Le thème le dessine en `display: block` avec quatre pixels de retrait latéral : l'icône se
 * calait dans une boîte de trente pixels. Portée à cinquante pour l'usage au doigt, cette boîte
 * laisse la croix en haut à gauche. Le contenu est donc explicitement centré.
 */
const closeButton =
  '.tox .tox-dialog__header .tox-button--icon,' +
  '.tox .tox-dialog .tox-button--naked.tox-button--icon {' +
  ' display: flex; align-items: center; justify-content: center; padding: 0; }' +
  '.tox .tox-dialog__header .tox-button--icon .tox-icon,' +
  '.tox .tox-dialog .tox-button--naked.tox-button--icon .tox-icon {' +
  ' display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; }';

const styles =
  // L'en-tête et le pied ne doivent jamais rétrécir : le dialogue a une hauteur fixe, et des
  // boutons plus hauts feraient sinon déborder — puis rogner — la rangée de validation.
  '.tox .tox-dialog__header, .tox .tox-dialog__footer { flex-shrink: 0; }' +
  // Un conteneur flexible refuse par défaut de descendre sous la hauteur de son contenu
  // (`min-height: auto`). Sur un formulaire haut — une carte, un éditeur de code — la chaîne
  // contenu → corps → formulaire pousse alors le pied de dialogue hors du cadre. Chaque maillon
  // reçoit donc `min-height: 0`, et c'est le corps, qui défile déjà, qui absorbe le dépassement.
  '.tox .tox-dialog__content-js, .tox .tox-dialog .tox-form { min-height: 0; }' +
  `.tox .tox-dialog .tox-button { min-height: ${minimum}px; padding-top: 0; padding-bottom: 0; }` +
  `.tox .tox-dialog .tox-button--icon, .tox .tox-dialog .tox-button[data-mce-name] { min-width: ${minimum}px; }` +
  `.tox .tox-dialog__footer .tox-button { min-width: ${minimum}px; min-height: ${minimum}px; padding: 0 20px; }` +
  `.tox .tox-dialog .tox-browse-url { min-width: ${minimum}px; min-height: ${minimum}px; }` +
  `.tox .tox-dialog .tox-collection__item { min-height: ${minimum}px; }` +
  // Les champs ne sont pas des boutons, mais viser un champ de trente pixels au doigt est tout
  // aussi pénible : ils suivent la même règle, en un peu plus bas.
  '.tox .tox-dialog .tox-textfield, .tox .tox-dialog .tox-listbox, .tox .tox-dialog .tox-listboxfield > .tox-listbox--select { min-height: 44px; }' +
  '.tox .tox-dialog .tox-checkbox__icons { min-width: 44px; min-height: 44px; }' +
  // Les composants qui dessinent eux-mêmes leur interface occupent toute la largeur offerte.
  '.tox .tox-dialog .tox-custom-editor { width: 100%; }' +
  // Explication d'un champ, affichée juste sous lui.
  `.tox .tox-dialog .onlc-field-help, .tox .tox-dialog .onlc-shortcode-help { margin: -4px 0 4px; font-size: 12px; line-height: 1.4; color: ${muted}; }` +
  `.tox .tox-dialog .onlc-shortcode-intro { margin: 0 0 8px; font-size: 13px; line-height: 1.45; color: ${ink}; }` +
  // Une écriture citée dans une explication — une balise, un code court — se distingue de la
  // phrase qui l'entoure : sans cela, on ne sait plus ce qu'il faut taper à la lettre près.
  '.tox .tox-dialog .tox-dialog__body-content code {' +
  ' padding: 1px 5px; font-family: SFMono-Regular, Menlo, Consolas, monospace; font-size: .92em;' +
  ` background: rgba(34, 47, 62, .06); border-radius: 4px; color: ${ink}; }` +
  tabs +
  closeButton + dialogLayout;

/**
 * Injecte la feuille dans le document de l'interface, une seule fois par page. Appelée par
 * chaque plugin ONLC à son initialisation.
 */
const ensure = (editor: Editor): void => {
  const container = editor.getContainer();
  const doc = Type.isNonNullable(container) ? container.ownerDocument : document;

  if (doc.getElementById(styleId) === null) {
    const style = doc.createElement('style');
    style.id = styleId;
    style.textContent = styles;
    doc.head.appendChild(style);
  }
};

/** Branche l'injection sur l'initialisation de l'éditeur, quand le conteneur existe. */
const setup = (editor: Editor): void => {
  editor.on('init', () => ensure(editor));
};

export {
  minimum,
  styles,
  ensure,
  setup
};
