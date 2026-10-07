/* CMS shortcodes for Onlc4/HugeRTE. Stored documents contain plain shortcodes only. */
(function () {
  'use strict';
  hugerte.PluginManager.add('cmsshortcodes', function (editor) {
    editor.options.register('cms_shortcode_products', { processor: 'object[]', default: [] });
    editor.options.register('cms_shortcode_pages', { processor: 'function', default: function () { return Promise.resolve([]); } });
    editor.options.register('cms_shortcode_categories', { processor: 'object[]', default: [] });
    var products = editor.options.get('cms_shortcode_products');
    var pages = [], categories = editor.options.get('cms_shortcode_categories') || [];
    var productKinds = { upsell: 'UpsellProduit', summary: 'ResumeProduit', details: 'CaracteristiquesProduit', faq: 'FAQProduit' };
    var labels = { upsell: 'Suggestions et upsell', summary: 'Caractéristiques résumées (4 icônes)', details: 'Caractéristiques détaillées', faq: 'FAQ produit, livraison et assistance', collection: 'Catalogue filtrable (produits et pages)', catalog: 'Sélection simple (ancien bloc)', tariffs: 'Tableau des tarifs', contact: 'Formulaire de contact' };
    var marker = 'data-mce-cms-shortcode';
    var labelMarker = 'data-mce-cms-shortcode-label';
    var escape = function (value) { return String(value).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    function parse(text) {
      var value = text.trim(), match;
      match = /^\[Catalogue\s+([^\]]+)\]$/.exec(value);
      if (match) {
        var attrs = {}, invalid = false;
        var rest = match[1].replace(/(ids|pages|categories)="([^"<>]*)"/g, function (_, key, text) { if (key in attrs) invalid = true; attrs[key] = text; return ''; });
        if (rest.trim() || invalid) return null;
        return { kind: 'collection', ids: attrs.ids ? attrs.ids.split(',').map(Number) : [], pages: attrs.pages ? attrs.pages.split(',') : [], categories: attrs.categories ? attrs.categories.split(',') : [] };
      }
      match = /^\[(UpsellProduit|ResumeProduit|CaracteristiquesProduit|FAQProduit)\s+id="([1-9]\d{0,8})"\]$/.exec(value);
      if (match) return { kind: Object.keys(productKinds).find(function (key) { return productKinds[key] === match[1]; }), productId: match[2] };
      if (value === '[TarifsProduits]') return { kind: 'tariffs' };
      match = /^\[CatalogueProduits\s+ids="([1-9]\d{0,8}(?:,[1-9]\d{0,8}){0,11})"\]$/.exec(value)
        || /^\[\[catalogue:([1-9]\d{0,8}(?:,[1-9]\d{0,8}){0,11})\]\]$/.exec(value);
      if (match) return { kind: 'catalog', ids: match[1].split(',').map(Number) };
      match = /^\[Contact(?:Local)?\s+email="([^"<>\s]{3,254})"\]$/.exec(value);
      return match ? { kind: 'contact', email: match[1] } : null;
    }
    function paragraph(node) {
      var body = editor.getBody();
      while (node && node !== body) { if (node.nodeName === 'P') return node; node = node.parentNode; }
      return null;
    }
    function decorate() {
      editor.dom.select('p').forEach(function (node) {
        var shortcode = parse(node.textContent || '');
        if (shortcode) {
          node.setAttribute(marker, shortcode.kind);
          node.setAttribute(labelMarker, labels[shortcode.kind]);
          node.setAttribute('contenteditable', 'false');
        } else if (node.hasAttribute(marker)) {
          node.removeAttribute(marker); node.removeAttribute(labelMarker); node.removeAttribute('contenteditable');
        }
      });
    }
    function selected() {
      var node = paragraph(editor.selection.getNode());
      return node && parse(node.textContent || '') ? node : null;
    }
    function editable() { return !editor.mode.isReadOnly(); }
    function openReady(target) {
      if (!editable()) return;
      var node = target || selected();
      var current = node ? parse(node.textContent || '') : null;
      var bookmark = editor.selection.getBookmark(2, true);
      var kind = current ? current.kind : 'collection';
      var values = { kind: kind, email: current && current.email || '', productId: current && current.productId || String(products[0] && products[0].id || '') };
      products.forEach(function (product) { values['product_' + product.id] = !!(current && current.ids && current.ids.indexOf(product.id) >= 0); });
      pages.forEach(function (page) { values['page_' + page.slug] = !!(current && current.pages && current.pages.indexOf(page.slug) >= 0); });
      categories.forEach(function (category) { values['category_' + category.id] = !!(current && current.categories && current.categories.indexOf(category.id) >= 0); });
      var missingPages = current && current.pages ? current.pages.filter(function (slug) { return !pages.some(function (page) { return page.slug === slug; }); }) : [];
      missingPages.forEach(function (slug) { values['page_' + slug] = true; });
      // Keep unknown references visible when editing historical content; never discard them silently.
      var missingIds = current && current.ids ? current.ids.filter(function (id) { return !products.some(function (product) { return product.id === id; }); }) : [];
      missingIds.forEach(function (id) { values['product_' + id] = true; });
      var dialog;
      function specification() {
        var fields = [{ type: 'selectbox', name: 'kind', label: 'Contenu dynamique', items: Object.keys(labels).map(function (key) { return { text: labels[key], value: key }; }) }];
        if (productKinds[kind]) {
          var choices = products.map(function (product) { return { text: product.label, value: String(product.id) }; });
          if (current && current.productId && !products.some(function (product) { return String(product.id) === current.productId; })) choices.push({ text: 'Référence ' + current.productId + ' (indisponible)', value: current.productId });
          fields.push({ type: 'selectbox', name: 'productId', label: 'Produit de référence', items: [{ text: 'Choisir un produit…', value: '' }].concat(choices) });
          fields.push({ type: 'htmlpanel', html: '<p>Le bloc utilise les informations du catalogue du site actif. Sur une fiche multi-formats, il suit le format sélectionné. Les suggestions affichent des destinations publiées sur le canal consulté.</p>' });
        } else if (kind === 'collection') {
          fields.push({ type: 'htmlpanel', html: '<p>Combinez les sources dans les trois onglets. Les catégories ajoutent automatiquement leurs formats. Les pages utilisent leur image à la Une ; seules les versions publiées sur le canal consulté sont affichées.</p>' });
          var productFields = products.map(function (p) { return { type: 'checkbox', name: 'product_' + p.id, label: p.label }; });
          missingIds.forEach(function (id) { productFields.push({ type: 'checkbox', name: 'product_' + id, label: 'Référence ' + id + ' (indisponible)' }); });
          var pageFields = pages.map(function (p) { return { type: 'checkbox', name: 'page_' + p.slug, label: p.title + ' — ' + p.slug + (p.published ? '' : ' (non publiée)') }; });
          missingPages.forEach(function (slug) { pageFields.push({ type: 'checkbox', name: 'page_' + slug, label: slug + ' (indisponible)' }); });
          fields.push({ type: 'tabpanel', tabs: [
            { name: 'categories', title: 'Catégories', items: categories.map(function (c) { return { type: 'checkbox', name: 'category_' + c.id, label: c.label }; }) },
            { name: 'products', title: 'Produits', items: productFields.length ? productFields : [{ type: 'htmlpanel', html: '<p>Aucun produit.</p>' }] },
            { name: 'pages', title: 'Pages CMS', items: pageFields.length ? pageFields : [{ type: 'htmlpanel', html: '<p>Aucune page dans ce site.</p>' }] }
          ] });
        } else if (kind === 'catalog') {
          fields.push({ type: 'htmlpanel', html: '<p>Choisissez jusqu’à 12 produits du site actif. Le catalogue affiche leurs images, liens et tarifs disponibles au moment de la visite.</p>' });
          products.forEach(function (product) { fields.push({ type: 'checkbox', name: 'product_' + product.id, label: product.label }); });
          if (!products.length) fields.push({ type: 'htmlpanel', html: '<p>Aucun produit disponible pour ce site.</p>' });
          if (missingIds.length) {
            fields.push({ type: 'htmlpanel', html: '<p>Ces références historiques ne sont plus disponibles dans le catalogue du site. Décochez-les pour les retirer.</p>' });
            missingIds.forEach(function (id) { fields.push({ type: 'checkbox', name: 'product_' + id, label: 'Référence ' + id + ' (absente du catalogue)' }); });
          }
        } else if (kind === 'contact') {
          fields.push({ type: 'input', name: 'email', label: 'Adresse e-mail du service destinataire', inputMode: 'email' });
          fields.push({ type: 'htmlpanel', html: '<p>Les messages sont enregistrés dans Contenu du site → Messages des formulaires. Le formulaire reste désactivé dans les aperçus.</p>' });
        } else {
          fields.push({ type: 'htmlpanel', html: '<p>Affiche les formats du site actif regroupés par catégorie, avec leurs prix TTC et leurs paliers de quantité disponibles. Les prix proviennent du catalogue commercial actuel. Les options, pages supplémentaires et frais de livraison sont calculés dans le panier.</p>' });
        }
        return {
          title: node ? 'Modifier le shortcode CMS' : 'Insérer un shortcode CMS', size: 'medium',
          body: kind === 'collection' ? { type: 'tabpanel', tabs: [{ name: 'sources', title: 'Sources', items: fields.slice(0, -1) }].concat(fields[fields.length - 1].tabs) } : { type: 'panel', items: fields }, initialData: values,
          buttons: [{ type: 'cancel', text: 'Annuler' }, { type: 'submit', text: node ? 'Appliquer' : 'Insérer', primary: true }],
          onChange: function (api, details) {
            if (details.name !== 'kind') return;
            values = Object.assign(values, api.getData()); kind = values.kind;
            api.redial(specification()); api.setData(values);
          },
          onSubmit: function (api) {
            values = Object.assign(values, api.getData());
            var shortcode;
            if (productKinds[kind]) {
              if (!/^[1-9]\d{0,8}$/.test(String(values.productId || ''))) { editor.windowManager.alert('Choisissez un produit de référence.'); return; }
              shortcode = '[' + productKinds[kind] + ' id="' + values.productId + '"]';
            } else if (kind === 'collection') {
              var selectedIds = products.concat(missingIds.map(function (id) { return { id: id }; })).filter(function (p) { return values['product_' + p.id]; }).map(function (p) { return p.id; });
              var selectedPages = pages.map(function (p) { return p.slug; }).concat(missingPages).filter(function (slug) { return values['page_' + slug]; });
              var selectedCategories = categories.filter(function (c) { return values['category_' + c.id]; }).map(function (c) { return c.id; });
              if (!(selectedIds.length || selectedPages.length || selectedCategories.length) || selectedIds.length > 100 || selectedPages.length > 100) { editor.windowManager.alert('Choisissez au moins une source (100 produits et 100 pages maximum).'); return; }
              shortcode = '[Catalogue' + (selectedIds.length ? ' ids="' + selectedIds.join(',') + '"' : '') + (selectedPages.length ? ' pages="' + selectedPages.join(',') + '"' : '') + (selectedCategories.length ? ' categories="' + selectedCategories.join(',') + '"' : '') + ']';
            } else if (kind === 'catalog') {
              var ids = products.filter(function (product) { return values['product_' + product.id]; }).map(function (product) { return product.id; });
              ids = Array.from(new Set(ids.concat(missingIds.filter(function (id) { return values['product_' + id]; }))));
              if (!ids.length || ids.length > 12) { editor.windowManager.alert('Choisissez entre 1 et 12 produits.'); return; }
              shortcode = '[CatalogueProduits ids="' + ids.join(',') + '"]';
            } else if (kind === 'contact') {
              var email = String(values.email || '').trim().toLowerCase();
              if (email.length > 254 || !/^[^@\s"<>]+@[^@\s"<>]+\.[^@\s"<>]+$/.test(email)) { editor.windowManager.alert('Saisissez une adresse e-mail valide.'); return; }
              shortcode = '[ContactLocal email="' + email + '"]';
            } else shortcode = '[TarifsProduits]';
            editor.undoManager.transact(function () {
              if (node && editor.getBody().contains(node)) {
                node.textContent = shortcode;
                editor.selection.select(node);
              } else {
                editor.selection.moveToBookmark(bookmark);
                editor.insertContent('<p>' + escape(shortcode) + '</p><p></p>');
              }
              decorate();
            });
            editor.nodeChanged(); editor.dispatch('change'); api.close(); editor.focus();
          }
        };
      }
      dialog = editor.windowManager.open(specification());
      return dialog;
    }
    function open(target) {
      if (!editable()) return;
      var loader = editor.options.get('cms_shortcode_pages');
      if (typeof loader !== 'function') return openReady(target);
      Promise.resolve(loader()).then(function (items) { pages = items; openReady(target); }).catch(function () { editor.windowManager.alert('Impossible de charger les pages CMS. Réessayez.'); });
    }
    function setup(api) {
      var update = function () { api.setEnabled(editable()); };
      update(); editor.on('SwitchMode', update);
      return function () { editor.off('SwitchMode', update); };
    }
    editor.ui.registry.addButton('cmsshortcodes', { icon: 'sourcecode', text: 'Shortcodes CMS', tooltip: 'Insérer ou modifier un shortcode CMS', onAction: function () { open(); }, onSetup: setup });
    editor.ui.registry.addMenuItem('cmsshortcodes', { icon: 'sourcecode', text: 'Shortcodes CMS…', onAction: function () { open(); }, onSetup: setup });
    editor.ui.registry.addContextMenu('cmsshortcodes', { update: function (node) { var p = paragraph(node); return editable() && p && parse(p.textContent || '') ? 'cmsshortcodes' : ''; } });
    editor.on('dblclick', function (event) { var node = paragraph(event.target); if (node && parse(node.textContent || '')) { event.preventDefault(); open(node); } });
    editor.on('PreInit', function () {
      editor.serializer.addNodeFilter('p', function (nodes) {
        nodes.forEach(function (node) {
          if (!node.attr(marker)) return;
          node.attr(marker, null); node.attr(labelMarker, null); node.attr('contenteditable', null);
        });
      });
    });
    editor.on('init', function () {
      editor.dom.addStyle('p[' + marker + ']{border:1px dashed #6b839f;border-radius:6px;background:#f0f5fa;padding:12px;cursor:pointer;overflow-wrap:anywhere}p[' + marker + ']::before{content:attr(' + labelMarker + ');display:block;font:600 13px/1.6 system-ui;color:#334f70;margin-bottom:5px}');
      decorate();
    });
    editor.on('SetContent Undo Redo', decorate);
    editor.addCommand('CmsShortcodes', function () { open(); });
    return { parse: parse, decorate: decorate };
  });
})();
