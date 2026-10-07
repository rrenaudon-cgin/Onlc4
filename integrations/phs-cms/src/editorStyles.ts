/** Give linked styles their own browser-cache identity after an iframe is recreated.
 * This runs at PostRender, after plugins appended their styles in PreInit.
 */
export function isolateEditorStyleUrls(urls: string[], instance: string, location: string): string[] {
  const base = new URL(location);
  return urls.map(href => {
    const url = new URL(href, base);
    if (url.origin === base.origin && ['http:', 'https:'].includes(url.protocol)) url.searchParams.set('cmsEditorInstance', instance);
    return url.href;
  });
}
/** HugeRTE can finish init with empty linked sheets. Never present that as a ready editor. */
export function assertEditorStyles(doc: Document) {
  const required = ['/vendor/bootstrap/bootstrap.min.css', '/vendor/cms/onlc4-addons/editor.css', '/vendor/onlc4/plugins/onlcblocks/css/onlcblocks.css'];
  for (const path of required) {
    const sheet = Array.from(doc.styleSheets).find(sheet => sheet.href && new URL(sheet.href, doc.baseURI).pathname === path);
    if (!sheet || !sheet.cssRules.length) throw new Error(`Feuille de style de l’éditeur vide : ${path}`);
  }
}
