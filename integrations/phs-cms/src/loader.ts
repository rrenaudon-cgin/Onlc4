type Registry = { get?: (name: string) => unknown; has?: (name: string) => boolean };
type Runtime = { PluginManager?: Registry; ThemeManager?: Registry; ModelManager?: Registry; IconManager?: Registry };
const pending = new Map<string, Promise<void>>();
/** Complete shared asset loading before creating an editor. A cancelled instance cannot own the asset queue. */
export function loadEditorScript(src: string): Promise<void> {
  const previous = pending.get(src);
  if (previous) return previous;
  const promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    const timeout = setTimeout(() => failed(), 20_000);
    const failed = () => { clearTimeout(timeout); script.remove(); pending.delete(src); reject(new Error(`Échec de chargement de ${src}`)); };
    script.src = src; script.async = true;
    script.onload = () => { clearTimeout(timeout); resolve(); };
    script.onerror = failed;
    document.head.appendChild(script);
  });
  pending.set(src, promise);
  return promise;
}
export async function prepareEditorAssets(runtime: Runtime, plugins: string[], external: Record<string, string>) {
  const present = (registry: Registry | undefined, name: string) => !!(registry?.get?.(name) || registry?.has?.(name));
  // Tests/embedders with only init() keep ownership of their own loader.
  if (!runtime.PluginManager) return;
  const assets: Array<[Registry | undefined, string, string]> = [
    [runtime.ThemeManager, 'silver', '/vendor/onlc4/themes/silver/theme.min.js'],
    [runtime.ModelManager, 'dom', '/vendor/onlc4/models/dom/model.min.js'],
    [runtime.IconManager, 'default', '/vendor/onlc4/icons/default/icons.min.js'],
    ...plugins.map(name => [runtime.PluginManager, name, external[name] || `/vendor/onlc4/plugins/${name}/plugin.min.js`] as [Registry | undefined, string, string]),
  ];
  await Promise.all(assets.filter(([registry, name]) => !present(registry, name)).map(async ([registry, name, src]) => {
    await loadEditorScript(src);
    if (registry && !present(registry, name)) { pending.delete(src); throw new Error(`Extension non initialisée : ${name}`); }
  }));
  await loadEditorScript('/vendor/onlc4/langs/fr.js');
}

export function loadEditorRuntime(alreadyLoaded: boolean) { return pending.get('/vendor/onlc4/onlc4.min.js') || (alreadyLoaded ? Promise.resolve() : loadEditorScript('/vendor/onlc4/onlc4.min.js')); }
