# External integrations

Maintenance branch: `codex/integration-hooks`. Upstream base: `692d203e35`.

Changes are deliberately separate:

- `ed2b8bd32b`: generic dialog layout/accessibility fix. Native cached panel heights must not clip the larger ONLC fields. No site-specific selectors or data.
- `32499752cb`: generic public block activation hooks. The default hover behavior is preserved.

An external plugin can call `editor.plugins.onlcblocks.setAutoActivation(false)`, then use `showFor(node)` and `hide()` to implement its activation policy. The normal ONLC actions, selection, undo and cleanup remain in the vendor plugin. Re-enable automatic hover with `setAutoActivation(true)`.

Application media APIs, catalogue shortcodes, site themes, publication, React lifecycle management and contextual palette coordination must stay in the consuming application's add-ons. They do not belong in this fork.

Build: install workspace dependencies, build `modules/oxide-icons-default`, run `tsc -b`, then `grunt --gruntfile modules/hugerte/Gruntfile.js dev rollup`. Production distribution assembly is described in `modules/hugerte/tools/cdn/build.js`.
