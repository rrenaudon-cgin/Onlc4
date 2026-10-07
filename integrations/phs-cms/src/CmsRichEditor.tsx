import { loadStaticPages, staticPageChoices } from '../../services/cmsStaticPages';
import { useEffect, useId, useRef, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { xml } from '@codemirror/lang-xml';
import { attachBlockTools, type BlockEditor } from './blockTools';
import { createPortal } from 'react-dom';
import { apiClient } from '../../services/apiClient';
import { catalogueCategories } from '../../../../services/cms/CatalogueShortcode';
import { cmsProductReferences } from '../../../../services/cms/catalogue';
import { cmsEditorWidgets } from '../../services/cmsEditorWidgets';
import { cmsBodyClasses, cmsPageMainClasses, cmsEditorStyles } from '../../../../services/cms/presentation';
import type { CmsSiteKey } from '../../../../services/cms/sites';
import './ui.css';
import { loadEditorRuntime, prepareEditorAssets } from './loader';
import { assertEditorStyles, isolateEditorStyleUrls } from './editorStyles';

type Asset = { folderPath?: string; id: string; name: string; kind: string; mimeType: string; bytes: number; dtCreated: string; variants: Array<{ url: string; width?: number; height?: number }> };
type HugeEditor = BlockEditor & {
  contentCSS?: string[];
  notificationManager?: { open: (options: { text: string; type: 'error' }) => void };
  mode?: { set: (mode: 'readonly' | 'design') => void };
  focus: () => void; nodeChanged: () => void;
  serializer: { serialize: (node: HTMLElement, options?: Record<string, unknown>) => string };
  undoManager: { transact: (action: () => void) => void };
  selection: BlockEditor['selection'] & { select: (node: HTMLElement) => void; setContent: (html: string, options?: Record<string, unknown>) => void };
  setContent: (html: string) => void; getContent: () => string; getBody: () => HTMLElement; remove: () => void;
  on: (events: string, callback: () => void) => void; insertContent: (html: string) => void;
  ui: { registry: { addButton: (name: string, options: Record<string, unknown>) => void } };
  windowManager: { open: (options: Record<string, unknown>) => void };
};
type HugeRte = { PluginManager?: { get: (name: string) => unknown }; ThemeManager?: { get: (name: string) => unknown }; ModelManager?: { get: (name: string) => unknown }; IconManager?: { get: (name: string) => unknown }; init: (options: Record<string, unknown>) => Promise<HugeEditor[]>; get: (id: string) => HugeEditor | null };
declare global { interface Window { hugerte?: HugeRte } }

function loadOnlc4(): Promise<void> {
  // If another mount started the download, wait for its load event even if
  // HugeRTE assigned its global before the bundle finished evaluating.
  return loadEditorRuntime(!!window.hugerte);
}
const fileBase64 = (file: Blob): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(',', 2)[1] || '');
  reader.onerror = () => reject(new Error('Lecture du fichier impossible'));
  reader.readAsDataURL(file);
});
const isImageAsset = (asset: Asset) => asset.kind === 'image' || asset.mimeType === 'image/svg+xml';
const mediaFile = (asset: Asset) => ({
  name: asset.name, path: `${asset.folderPath === '/' || !asset.folderPath ? '' : asset.folderPath}/${asset.id}/${asset.name}`, url: asset.variants[0]?.url || '',
  thumbnailUrl: asset.variants.find(variant => variant.width === 320)?.url || asset.variants[0]?.url || '',
  mime: asset.mimeType, size: asset.bytes, width: asset.variants[0]?.width, height: asset.variants[0]?.height,
  modified: asset.dtCreated,
});
type PageTemplate = 'normal' | 'full-width';
type EditorContext = 'page' | 'header' | 'footer';
type Picker = { callback: (url: string, meta?: Record<string, string>) => void };
function editorBodyClass(siteKey: CmsSiteKey, slug: string, context: EditorContext, template?: PageTemplate): string {
  return `${cmsBodyClasses(siteKey, slug)} ${context === 'page' ? cmsPageMainClasses(template) : `cms-site-${context}`}`;
}

export default function RichEditor({ id, html, onChange, siteKey, partnerId, slug = '/', context = 'page', template = 'normal', disabled = false }: {
  id: string; html: string; onChange: (value: string) => void; siteKey: CmsSiteKey; partnerId?: number; slug?: string; context?: EditorContext; template?: PageTemplate; disabled?: boolean;
}) {
  const instanceId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const textareaId = `${id}-${instanceId}`;
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const htmlRef = useRef(html); htmlRef.current = html;
  const applyingContent = useRef(false);
  const changeRef = useRef(onChange); changeRef.current = onChange;
  const disabledRef = useRef(disabled); disabledRef.current = disabled;
  const [fallback, setFallback] = useState(false);
  const [retry, setRetry] = useState(0);
  const [picker, setPicker] = useState<Picker | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [pickerBusy, setPickerBusy] = useState(false);
  const [pickerError, setPickerError] = useState('');
  const [blockSource, setBlockSource] = useState<{ block: HTMLElement; code: string } | null>(null);
  const [blockError, setBlockError] = useState('');
  const editorRef = useRef<HugeEditor | null>(null);
  const templateRef = useRef(template); templateRef.current = template;
  const slugRef = useRef(slug);
  slugRef.current = slug;
  const loadAssets = async () => {
    if (!partnerId) throw new Error('Boutique de contenu indisponible.');
    const result = await apiClient.get(`/admin/content/assets?partnerId=${partnerId}`) as Asset[];
    setAssets(result.filter(asset => isImageAsset(asset)));
  };
  useEffect(() => {
    if (!picker) return;
    void loadAssets().catch(error => setPickerError(error instanceof Error ? error.message : 'Bibliothèque indisponible'));
  }, [picker, partnerId]);
  const upload = async (file: File, folderPath = '/') => {
    if (!partnerId) throw new Error('Boutique de contenu indisponible.');
    if (file.size > 20 * 1024 * 1024) throw new Error('Image de plus de 20 Mo.');
    const asset = await apiClient.post('/admin/content/assets', {
      partnerId, folderPath, name: file.name, base64: await fileBase64(file),
    }) as Asset;
    if (asset.kind !== 'image' || !asset.variants[0]?.url) throw new Error('Le fichier importé n’est pas une image utilisable.');
    return { ...asset, folderPath: folderPath.replace(/\/$/, '') || '/' };
  };
  useEffect(() => {
    let cancelled = false;
    let ownedEditor: HugeEditor | null = null;
    let ready = false;
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    let disposeTools: (() => void) | null = null;
    const removed = new WeakSet<HugeEditor>();
    const target = textareaRef.current;
    const removeOwned = (editor: HugeEditor) => {
      if (removed.has(editor)) return;
      removed.add(editor);
      if (editorRef.current === editor) editorRef.current = null;
      editor.remove();
    };
    const cleanup = () => {
      clearTimeout(watchdog);
      disposeTools?.(); disposeTools = null;
      if (ownedEditor) removeOwned(ownedEditor);
    };
    setFallback(false);
    void loadOnlc4().then(async () => {
      if (cancelled || !window.hugerte || !target?.isConnected) return;
      const plugins = `lists link image table fullscreen onlcmedia onlcwidgets onlcresponsiveimages onlcblocks cmsblockselection cmslanguagetool${context === 'page' ? ' cmsshortcodes' : ''}`.split(' ');
      const external = { cmsblockselection: '/vendor/cms/onlc4-addons/selection.js', cmslanguagetool: '/vendor/cms/onlc4-addons/languagetool.js', ...(context === 'page' ? { cmsshortcodes: '/vendor/cms/onlc-cms-shortcodes.js' } : {}) };
      await prepareEditorAssets(window.hugerte, plugins, external);
      if (cancelled || !target.isConnected) return;
      watchdog = setTimeout(() => { if (!cancelled && !ready) { cleanup(); setFallback(true); } }, 20_000);
      const editors = await window.hugerte.init({
        target, readonly: disabledRef.current, base_url: '/vendor/onlc4', suffix: '.min', height: Math.max(360, Math.min(640, window.innerHeight - 105)), min_height: 300,
        language: 'fr', language_url: '/vendor/onlc4/langs/fr.js',
        toolbar_sticky: true, toolbar_sticky_offset: 73, toolbar_location: 'top', toolbar_mode: 'sliding', browser_spellcheck: true,
        autoresize_bottom_margin: 20, resize: false,
        content_css: cmsEditorStyles(siteKey), body_class: editorBodyClass(siteKey, slugRef.current, context, templateRef.current),
        ...(context === 'page' ? {} : { body_id: context === 'header' ? 'PL_head' : 'PL_foot' }),
        menubar: 'edit insert format table tools', plugins: plugins.join(' '),
        external_plugins: external,
        cms_languagetool_check: (text: string) => apiClient.post('/admin/content/spelling', { partnerId, siteKey, text }),
        cms_shortcode_categories: catalogueCategories.map(([id, label]) => ({ id, label })),
        cms_shortcode_pages: async () => {
          if (!partnerId) return [];
          const rows = await apiClient.get(`/admin/content/pages?partnerId=${partnerId}&siteKey=${encodeURIComponent(siteKey)}`) as Array<{ slug: string; draft: { title: string; kind?: string }; publishedRevision: number | null; lanPublishedRevision: number | null }>;
          return rows.filter(row => row.slug !== slugRef.current && !['error','resource'].includes(row.draft.kind || 'static')).map(row => ({ slug: row.slug, title: row.draft.title, published: row.publishedRevision != null || row.lanPublishedRevision != null }));
        },
        cms_shortcode_products: cmsProductReferences(siteKey).map(product => ({ id: product.id, label: product.label })),
        contextmenu: context === 'page' ? 'link image table cmsshortcodes' : 'link image table',
        menu: { insert: { title: 'Insert', items: `link onlcimage onlcmedialibrary table onlcblocksinsert onlcblocksrow${context === 'page' ? ' onlcwidget cmsshortcodes' : ''}` }, format: { title: 'Format', items: 'bold italic underline strikethrough superscript subscript codeformat | styles blocks fontfamily fontsize align lineheight | forecolor backcolor | removeformat' }, tools: { title: 'Tools', items: 'cmslanguagetool onlcsource fullscreen' } },
        link_list: (callback: (links: Array<{ title: string; value: string }>) => void) => {
          // Load on each opening so newly saved pages are immediately available.
          if (!partnerId) { callback([]); return; }
          void loadStaticPages(partnerId,siteKey)
            .then(pages => {
              if (cancelled) { callback([]); return; }
              callback(staticPageChoices(pages,siteKey).map(page => ({title:page.label,value:page.slug})));
            }).catch(() => {
              callback([]);
              if (!cancelled) editorRef.current?.notificationManager?.open({ text: 'Impossible de charger les pages du site. Vous pouvez saisir le lien manuellement.', type: 'error' });
            });
        },
        toolbar: 'undo redo | bold italic | bullist numlist | link onlcimage | fullscreen',
        mobile: { menubar: true, toolbar_mode: 'sliding' },
        // The responsive-images serializer otherwise replaces explicit CSS heights with auto.
        // Site CSS already constrains images; retain dimensions chosen by the author.
        onlc_responsive_images: false,
        onlc_blocks_grid_css: '/vendor/bootstrap/bootstrap-grid.min.css', onlc_blocks_breakpoint: 'md',
        onlc_shortcodes_show_unknown: false,
        onlc_shortcodes_exclude: ['Catalogue', 'CatalogueProduits', 'UpsellProduit', 'ResumeProduit', 'CaracteristiquesProduit', 'FAQProduit', 'TarifsProduits', 'ContactLocal', 'Contact', 'MenuSite', 'Meta', 'SocialButtons', 'SocialButtonsSmall', 'SocialButtonsTiny', 'PaypalButton', 'LogoSite', 'TitreLogoSite'],
        onlc_widgets_exclude: ['video', 'iframe', 'map', 'gallery', 'pdf', 'calendarembed'],
        onlc_widgets_custom: cmsEditorWidgets,
        branding: false, promotion: false, convert_urls: false, automatic_uploads: true,
        onlc_media_handlers: {
          list: async (path: string) => {
            if (!partnerId) throw new Error('Boutique indisponible');
            const currentPath = path.replace(/\/$/, '') || '/';
            const [rows, folders] = await Promise.all([apiClient.get(`/admin/content/assets?partnerId=${partnerId}`), apiClient.get(`/admin/content/folders?partnerId=${partnerId}`)]) as [Asset[], Array<{ path: string }>];
            return { path: currentPath, parent: currentPath === '/' ? null : currentPath.slice(0, currentPath.lastIndexOf('/')) || '/', folders: folders.filter(folder => (folder.path.slice(0, folder.path.lastIndexOf('/')) || '/') === currentPath).map(folder => ({ path: folder.path, name: folder.path.split('/').at(-1) })), files: rows.filter(asset => (asset.folderPath || '/') === currentPath && isImageAsset(asset)).map(mediaFile) };
          },
          upload: async (path: string, file: File) => {
            return mediaFile(await upload(file, path));
          },
          createFolder: async (path: string, name: string) => apiClient.post('/admin/content/folders', { partnerId, path: `${path.replace(/\/$/, '')}/${name}` }),
          deleteFolder: async (path: string) => apiClient.delete(`/admin/content/folders?partnerId=${partnerId}&path=${encodeURIComponent(path)}`),
          deleteFile: async (path: string) => {
            const match = /\/([a-f0-9-]{36})\/[^/]+$/.exec(path);
            if (!match || !partnerId) throw new Error('Fichier non reconnu');
            await apiClient.delete(`/admin/content/assets/${match[1]}?partnerId=${partnerId}`);
          },
        },
        file_picker_types: 'image',
        file_picker_callback: (callback: Picker['callback']) => { setPicker({ callback }); setPickerError(''); },
        images_upload_handler: async (blobInfo: { blob: () => Blob; filename: () => string }, progress: (percent: number) => void) => {
          progress(10);
          const blob = blobInfo.blob();
          const asset = await upload(new File([blob], blobInfo.filename(), { type: blob.type }));
          progress(100);
          return asset.variants[0].url;
        },
        setup: (editor: HugeEditor) => {
          // Firefox can reuse empty linked sheets after destroying the previous
          // iframe. Give this document its own CSS request identity, including
          // the styles appended by plugins during PreInit.
          const cssInstance = crypto.randomUUID();
          editor.on('PostRender', () => {
            if (editor.contentCSS) editor.contentCSS = isolateEditorStyleUrls(editor.contentCSS, cssInstance, window.location.href);
          });
          editor.on('SkinLoadError PluginLoadError ThemeLoadError ModelLoadError IconsLoadError LanguageLoadError', () => { if (!cancelled) { cleanup(); setFallback(true); } });
          // Capture ownership before asynchronous plugin/skin loading finishes.
          ownedEditor = editor;
          editor.on('change input keyup undo redo', () => {
            if (!cancelled && ready && !applyingContent.current) changeRef.current(editor.getContent());
          });
          editor.on('init', () => {
            if (cancelled || !target.isConnected || removed.has(editor)) { removeOwned(editor); return; }
            try { if (editor.contentCSS) assertEditorStyles(editor.getBody().ownerDocument); }
            catch { cleanup(); setFallback(true); return; }
            ready = true; clearTimeout(watchdog);
            editorRef.current = editor;
            applyingContent.current = true;
            try {
              if (editor.getContent() !== htmlRef.current) editor.setContent(htmlRef.current);
            } finally { applyingContent.current = false; }
            disposeTools = attachBlockTools(editor, block => {
              if (cancelled || disabledRef.current) return;
              setBlockError(''); setBlockSource({ block, code: editor.serializer.serialize(block, { source_view: true }) });
            });
          });
        },
      });
      if (cancelled || !target.isConnected) editors.forEach(removeOwned);
      else {
        ownedEditor = editors.find(editor => !removed.has(editor)) || (ownedEditor && !removed.has(ownedEditor) ? ownedEditor : null);
        editorRef.current = ownedEditor;
        editorRef.current?.mode?.set(disabledRef.current ? 'readonly' : 'design');
      }
    }).catch(() => {
      if (!cancelled) { cleanup(); setFallback(true); }
    });
    return () => { cancelled = true; cleanup(); };
  }, [id, siteKey, context, partnerId, retry]);
  useEffect(() => { const editor = editorRef.current; if (editor && editor.getContent() !== html) { applyingContent.current = true; try { editor.setContent(html); } finally { applyingContent.current = false; } } }, [html]);
  useEffect(() => { editorRef.current?.mode?.set(disabled ? 'readonly' : 'design'); }, [disabled]);
  useEffect(() => {
    const body = editorRef.current?.getBody();
    if (body) {
      // Keep HugeRTE/Onlc4 activation classes: replacing className breaks
      // the block overlay's positioning when the page slug changes.
      for (const name of [...body.classList]) {
        if (name.startsWith('cms-') || name === 'page_content') body.classList.remove(name);
      }
      body.classList.add(...editorBodyClass(siteKey, slug, context, template).split(/\s+/));
    }
  }, [siteKey, slug, context, template]);
  return <div className="content-admin__rich-editor"><textarea ref={textareaRef} id={textareaId} data-editor-id={id} defaultValue={html} onChange={event => onChange(event.target.value)} disabled={disabled} style={{ width: '100%', minHeight: 360 }} aria-label="Contenu HTML" />
    {fallback && <p className="content-admin__hint">L’éditeur visuel n’a pas chargé. Votre contenu reste disponible dans le champ HTML. <button type="button" className="content-admin__button" onClick={() => setRetry(value => value + 1)}>Réessayer le chargement</button></p>}
    {blockSource && createPortal(<div className="content-admin__picker-backdrop"><section className="content-admin__picker cms-block-source" role="dialog" aria-modal="true" aria-label="Code HTML du bloc sélectionné"><header><h2>Code HTML du bloc sélectionné</h2><button className="content-admin__button" onClick={() => setBlockSource(null)}>Annuler</button></header><p>Modifiez uniquement ce bloc. Les changements seront intégrés au travail en cours et pourront être annulés dans l’éditeur.</p><CodeMirror autoFocus value={blockSource.code} onChange={code => setBlockSource(current => current ? { ...current, code } : null)} extensions={[xml()]} height="420px" basicSetup={{ lineNumbers: true, foldGutter: true }} />{blockError && <p role="alert">{blockError}</p>}<div className="content-admin__toolbar"><button className="content-admin__button content-admin__button--primary" onClick={() => {
      const editor = editorRef.current;
      if (!editor || !editor.getBody().contains(blockSource.block)) { setBlockError('Ce bloc a changé ou a été supprimé. Fermez la fenêtre et sélectionnez-le à nouveau.'); return; }
      const parsed = new DOMParser().parseFromString(blockSource.code, 'text/html');
      if (parsed.body.children.length !== 1 || [...parsed.body.childNodes].some(node => node.nodeType === 3 && node.textContent?.trim())) { setBlockError('Le code doit contenir un seul bloc HTML racine.'); return; }
      editor.focus(); editor.undoManager.transact(() => { editor.selection.select(blockSource.block); editor.selection.setContent(blockSource.code, { source_view: true }); }); editor.nodeChanged(); onChange(editor.getContent()); setBlockSource(null);
    }}>Appliquer au bloc</button></div></section></div>, document.body)}
    {picker && createPortal(<div className="content-admin__picker-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setPicker(null); }}>
      <section className="content-admin__picker" role="dialog" aria-modal="true" aria-label="Choisir une image">
        <header><h2>Images de la bibliothèque</h2><button type="button" className="content-admin__button" onClick={() => setPicker(null)}>Fermer</button></header>
        <p>Choisissez une image existante ou importez-en une. L’image importée sera convertie en WebP.</p>
        <label className="content-admin__button content-admin__button--primary">Importer une image<input hidden type="file" accept="image/png,image/jpeg,image/webp,image/avif,image/gif" disabled={pickerBusy} onChange={event => {
          const file = event.target.files?.[0]; event.target.value = '';
          if (!file) return;
          setPickerBusy(true); setPickerError('');
          void upload(file).then(asset => { picker.callback(asset.variants[0].url, { alt: asset.name }); setPicker(null); })
            .catch(error => setPickerError(error instanceof Error ? error.message : 'Import impossible'))
            .finally(() => setPickerBusy(false));
        }} /></label>
        {pickerError && <p role="alert" className="content-admin__message content-admin__message--error">{pickerError}</p>}
        <div className="content-admin__picker-grid">{assets.map(asset => <button type="button" key={asset.id} onClick={() => { picker.callback(asset.variants[0].url, { alt: asset.name }); setPicker(null); }}>
          <img src={asset.variants[0].url} alt="" loading="lazy" /><span>{asset.name}</span>
        </button>)}</div>
      </section>
    </div>, document.body)}
  </div>;
}
