/* Local spelling. Decorations live in the CSS Highlight registry, never in document HTML. */
(function () {
  'use strict';
  hugerte.PluginManager.add('cmslanguagetool', function (editor) {
    editor.options.register('cms_languagetool_check', { processor: 'function', default: function () { return Promise.reject(new Error('Correcteur non configuré')); } });
    var entries = new Map(), queued = new Set(), disposed = false, enabled = true, running = false, timer, status, observer;
    var check = editor.options.get('cms_languagetool_check'), body, doc, view, notice = '', generation = 0;
    var key = 'cms-spelling-' + editor.id;
    var escape = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    function textMap(block) {
      var nodes = [], text = '', walker = doc.createTreeWalker(block, 4);
      while (walker.nextNode()) {
        var node = walker.currentNode;
        if (node.parentElement.closest('[contenteditable="false"],[data-onlc-part],script,style')) continue;
        nodes.push({ node: node, start: text.length, end: text.length + node.data.length }); text += node.data;
      }
      return { text: text, nodes: nodes };
    }
    function rangeFor(block, offset, length) {
      var map = textMap(block), start = map.nodes.find(function (n) { return n.end > offset; }), end = map.nodes.find(function (n) { return n.end >= offset + length; });
      if (!start || !end || length <= 0) return null;
      var range = doc.createRange(); range.setStart(start.node, offset - start.start); range.setEnd(end.node, offset + length - end.start); return range;
    }
    function issues() {
      var result = [];
      entries.forEach(function (entry, block) {
        if (block.isConnected && textMap(block).text === entry.text) entry.matches.forEach(function (match) { result.push({ block: block, text: entry.text, match: match }); });
      });
      return result;
    }
    function paint() {
      if (disposed || !body) return;
      var list = enabled ? issues() : [];
      if (view.CSS && view.CSS.highlights && view.Highlight) {
        var ranges = list.map(function (issue) { return rangeFor(issue.block, issue.match.offset, issue.match.length); }).filter(Boolean);
        var highlight = new view.Highlight(); ranges.forEach(function (range) { highlight.add(range); }); view.CSS.highlights.set(key, highlight);
      }
      if (status) status.textContent = !enabled ? 'Correction orthographique désactivée.' : notice || (running || queued.size ? 'Contrôle orthographique local en cours…' : list.length + ' suggestion' + (list.length === 1 ? '' : 's') + ' · Outils → Orthographe et grammaire');
    }
    function blocks() {
      return Array.from(body.querySelectorAll('p,h1,h2,h3,h4,h5,h6,li,td,th,blockquote,figcaption')).filter(function (block) {
        return !block.querySelector('p,h1,h2,h3,h4,h5,h6,li,td,th,blockquote,figcaption') && !block.closest('[contenteditable="false"],[data-onlc-part]') && !/^\s*\[(?:Catalogue|TarifsProduits|Contact|\[catalogue:)/.test(block.textContent);
      });
    }
    function scan(force) {
      if (disposed || !enabled || !body) return;
      var current = new Set(blocks());
      entries.forEach(function (_, block) { if (!current.has(block)) { entries.delete(block); queued.delete(block); } });
      current.forEach(function (block) {
        var text = textMap(block).text, previous = entries.get(block);
        if (force || !previous || previous.text !== text) {
          entries.set(block, { text: text, matches: [], version: ++generation });
          if (text.trim()) queued.add(block); else queued.delete(block);
        }
      });
      paint(); void drain();
    }
    function schedule() { clearTimeout(timer); timer = setTimeout(function () { scan(false); }, 700); }
    async function drain() {
      if (running || disposed || !enabled) return;
      running = true; paint();
      try {
        while (queued.size && !disposed && enabled) {
          var block = queued.values().next().value; queued.delete(block);
          var entry = entries.get(block); if (!entry || !block.isConnected) continue;
          var matches = [], from = 0;
          while (from < entry.text.length) {
            var end = Math.min(from + 5000, entry.text.length);
            if (end < entry.text.length) { var space = entry.text.lastIndexOf(' ', end); if (space > from + 4000) end = space; }
            var result = await check(entry.text.slice(from, end));
            if (disposed || !enabled || entries.get(block) !== entry || textMap(block).text !== entry.text) break;
            (result.matches || []).forEach(function (match) { matches.push(Object.assign({}, match, { offset: match.offset + from })); });
            from = end;
          }
          if (!disposed && enabled && entries.get(block) === entry && textMap(block).text === entry.text && from === entry.text.length) { entry.matches = matches; notice = ''; paint(); }
        }
      } catch (_) {
        // A service outage pauses the queue, instead of hammering it once per paragraph.
        queued.clear(); notice = 'LanguageTool local est indisponible. Ouvrez Outils → Orthographe et grammaire pour réessayer.';
      } finally { running = false; paint(); }
    }
    function show() {
      var list = issues(), selected = 0, dialog;
      function specification() {
        var issue = list[selected], match = issue && issue.match;
        return { title: 'Orthographe et grammaire · français', size: 'medium', body: { type: 'panel', items: list.length ? [
          { type: 'selectbox', name: 'issue', label: 'Suggestion', items: list.map(function (item, i) { return { value: String(i), text: item.text.slice(item.match.offset, item.match.offset + item.match.length) + ' — ' + item.match.message }; }) },
          { type: 'htmlpanel', html: '<p>' + escape(match.message) + '</p><p>' + escape(issue.text.slice(Math.max(0, match.offset - 60), match.offset)) + '<strong>' + escape(issue.text.slice(match.offset, match.offset + match.length)) + '</strong>' + escape(issue.text.slice(match.offset + match.length, match.offset + match.length + 60)) + '</p>' },
          { type: 'selectbox', name: 'replacement', label: 'Correction proposée', items: match.replacements.length ? match.replacements.map(function (item) { return { value: item.value, text: item.value }; }) : [{ value: '', text: 'Aucune correction automatique' }] }
        ] : [{ type: 'htmlpanel', html: '<p>' + escape(notice || (running ? 'Le contrôle initial est en cours. Fermez puis rouvrez cette fenêtre.' : 'Aucune suggestion.')) + '</p>' }] },
          initialData: { issue: String(selected), replacement: match && match.replacements[0] ? match.replacements[0].value : '' },
          buttons: [{ type: 'custom', name: 'refresh', text: 'Relancer le contrôle' }, { type: 'custom', name: 'toggle', text: enabled ? 'Désactiver' : 'Activer' }].concat(issue ? [{ type: 'custom', name: 'locate', text: 'Voir dans le texte' }, { type: 'custom', name: 'apply', text: 'Appliquer', primary: true, disabled: editor.mode.isReadOnly() || !match.replacements.length }] : []).concat([{ type: 'cancel', text: 'Fermer' }]),
          onChange: function (api, details) { if (details.name === 'issue') { selected = Number(api.getData().issue); api.redial(specification()); } },
          onAction: function (api, details) {
            if (details.name === 'refresh') { notice = ''; scan(true); api.close(); return; }
            if (details.name === 'toggle') { enabled = !enabled; if (enabled) scan(false); paint(); api.close(); return; }
            if (!issue || textMap(issue.block).text !== issue.text) { api.close(); schedule(); return; }
            var range = rangeFor(issue.block, match.offset, match.length); if (!range) return;
            if (details.name === 'locate') { api.close(); editor.focus(); editor.selection.setRng(range); issue.block.scrollIntoView({ block: 'center' }); return; }
            if (details.name === 'apply' && !editor.mode.isReadOnly()) {
              var replacement = api.getData().replacement;
              if (!match.replacements.some(function (item) { return item.value === replacement; })) return;
              editor.undoManager.transact(function () { range.deleteContents(); range.insertNode(doc.createTextNode(replacement)); });
              editor.dispatch('change'); schedule(); api.close();
            }
          }
        };
      }
      dialog = editor.windowManager.open(specification()); return dialog;
    }
    editor.ui.registry.addMenuItem('cmslanguagetool', { icon: 'spell-check', text: 'Orthographe et grammaire…', onAction: show });
    editor.on('init', function () {
      body = editor.getBody(); doc = body.ownerDocument; view = doc.defaultView;
      if (view.CSS && view.CSS.highlights && view.Highlight) editor.dom.addStyle('::highlight(' + key + '){background-color:#ffb4a666;color:inherit}');
      status = editor.getContainer().ownerDocument.createElement('p'); status.className = 'cms-spelling-status'; status.setAttribute('role', 'status');
      editor.getContainer().insertAdjacentElement('afterend', status);
      observer = new view.MutationObserver(schedule); observer.observe(body, { childList: true, subtree: true, characterData: true });
      scan(false);
    });
    editor.on('input SetContent Undo Redo', schedule);
    editor.on('remove', function () { disposed = true; clearTimeout(timer); queued.clear(); observer && observer.disconnect(); status && status.remove(); if (view && view.CSS && view.CSS.highlights) view.CSS.highlights.delete(key); });
    return { scan: scan, issues: issues, textMap: textMap };
  });
})();
