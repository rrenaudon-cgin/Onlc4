/* CMS-specific activation policy, using only the fork's public block API. */
(function () {
  hugerte.PluginManager.add('cmsblockselection', function (editor) {
    var api;
    function select() {
      if (!api) return;
      if (!editor.hasFocus() || editor.mode.isReadOnly()) api.hide();
      else api.showFor(editor.selection.getNode());
    }
    editor.on('init', function () {
      api = editor.plugins.onlcblocks;
      if (!api || typeof api.setAutoActivation !== 'function') throw new Error('ONLC4_ADDON_API_MISSING: use the pinned maintenance fork');
      api.setAutoActivation(false);
      select();
    });
    editor.on('NodeChange focus SwitchMode', select);
    editor.on('blur', function () { if (api) api.hide(); });
    return { getMetadata: function () { return { name: 'CMS : sélection des blocs' }; } };
  });
}());
