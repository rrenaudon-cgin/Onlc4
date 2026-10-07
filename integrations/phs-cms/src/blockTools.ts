export type Box = { left: number; top: number; width: number; height: number };
const right = (r: Box) => r.left + r.width;
const bottom = (r: Box) => r.top + r.height;
export const boxesOverlap = (a: Box, b: Box, gap = 4) => a.left < right(b) + gap && right(a) + gap > b.left && a.top < bottom(b) + gap && bottom(a) + gap > b.top;
/** One bounded pass. Earlier palettes have priority; they never chase later ones. */
export function placePalette(size: { width: number; height: number }, target: Box, viewport: Box, obstacles: Box[]): Box | null {
  const gap = 4;
  if (size.width > viewport.width || size.height > viewport.height) return null;
  const clampX = (x: number) => Math.max(viewport.left, Math.min(x, right(viewport) - size.width));
  const candidates = [
    { left: clampX(target.left), top: target.top - size.height - gap },
    { left: clampX(target.left), top: bottom(target) + gap },
    { left: right(target) + gap, top: Math.max(viewport.top, Math.min(target.top, bottom(viewport) - size.height)) },
    { left: target.left - size.width - gap, top: Math.max(viewport.top, Math.min(target.top, bottom(viewport) - size.height)) },
    // Stack next to an earlier palette before trying distant viewport corners.
    ...obstacles.flatMap(obstacle => [
      { left: clampX(target.left), top: bottom(obstacle) + gap },
      { left: clampX(target.left), top: obstacle.top - size.height - gap },
    ]),
    { left: viewport.left, top: viewport.top },
    { left: viewport.left, top: bottom(viewport) - size.height },
    { left: right(viewport) - size.width, top: viewport.top },
    { left: right(viewport) - size.width, top: bottom(viewport) - size.height },
  ];
  return candidates.map(position => ({ ...position, ...size })).find(box => box.left >= viewport.left && box.top >= viewport.top && right(box) <= right(viewport) && bottom(box) <= bottom(viewport) && !obstacles.some(obstacle => boxesOverlap(box, obstacle))) || null;
}
export type BlockEditor = {
  hasFocus(): boolean;
  getBody(): HTMLElement; getContainer(): HTMLElement; getContent(): string;
  iframeElement?: HTMLIFrameElement;
  plugins: { onlcblocks?: { getActiveBlock(): { getOrNull(): HTMLElement | null } } };
  selection: { getNode(): HTMLElement };
  on(events: string, callback: () => void): void;
  off(events: string, callback: () => void): void;
};
/** Integrates with the existing overlay without replacing its action/undo logic. */
export function attachBlockTools(editor: BlockEditor, editHtml: (block: HTMLElement) => void): () => void {
  const body = editor.getBody();
  const innerDoc = body.ownerDocument;
  const outerDoc = editor.getContainer().ownerDocument;
  const view = outerDoc.defaultView!;
  const innerView = innerDoc.defaultView!;
  const container = editor.getContainer();
  const dock = outerDoc.createElement('div');
  dock.className = 'cms-context-dock';
  dock.setAttribute('aria-label', 'Outils du bloc sélectionné');
  const header = container.querySelector('.tox-editor-header');
  // Only reserve header space when no safe floating position exists.
  header?.append(dock);
  const headerParent=header?.parentElement;
  let reservedHeaderSpace='';
  const syncHeaderSpace=()=>{
    if(!header || !headerParent)return;
    if(view.getComputedStyle(header).position==='fixed') {
      // HugeRTE's sticky placeholder can retain the previous palette height.
      const needed=Math.max(0,header.getBoundingClientRect().bottom-headerParent.getBoundingClientRect().top);
      reservedHeaderSpace=`${Math.ceil(needed)}px`;
      if(headerParent.style.paddingTop!==reservedHeaderSpace)headerParent.style.paddingTop=reservedHeaderSpace;
    } else if(reservedHeaderSpace && headerParent.style.paddingTop===reservedHeaderSpace) {
      headerParent.style.removeProperty('padding-top');reservedHeaderSpace='';
    }
  };
  const structuralSlot = outerDoc.createElement('div');
  const nativeSlot = outerDoc.createElement('div');
  const languageSlot = outerDoc.createElement('div');
  dock.append(nativeSlot, structuralSlot, languageSlot);
  let languageSignature='';
  let frame = 0;
  let selectingWithPointer=false;
  let disposed = false;
  let blockTarget: HTMLElement | null = null;
  let dockSignature = '';
  let keepDock = false;
  const ownedNative = new Map<HTMLElement, { css: string; placement: string }>();
  const restoreNative = () => {
    for (const [element, saved] of ownedNative) {
      const original = outerDoc.createElement('div').style; original.cssText = saved.css;
      const placed = outerDoc.createElement('div').style; placed.cssText = saved.placement;
      for (const key of ['position', 'left', 'top', 'right', 'bottom', 'height', 'max-height', 'max-width', 'display']) {
        if (element.style.getPropertyValue(key) === placed.getPropertyValue(key) && element.style.getPropertyPriority(key) === placed.getPropertyPriority(key)) {
          if (original.getPropertyValue(key)) element.style.setProperty(key, original.getPropertyValue(key), original.getPropertyPriority(key)); else element.style.removeProperty(key);
        }
      }
    }
    for (const element of ownedNative.keys()) delete element.dataset.cmsTablePalette;
    ownedNative.clear();
  };
  const schedule = () => { if (!disposed && !frame) frame = view.requestAnimationFrame(layout); };
  // Disconnect during our own writes: style observers cannot create an avoidance loop.
  const observer = new MutationObserver(schedule);
  const observe = () => {
    observer.observe(body, { subtree: true, childList: true, attributes: true, attributeFilter: ['style', 'class'] });
    if(header)observer.observe(header,{attributes:true,attributeFilter:['style','class']});
    if(headerParent)observer.observe(headerParent,{attributes:true,attributeFilter:['style']});
    for (const sink of outerDoc.querySelectorAll('.tox-silver-sink')) observer.observe(sink, { subtree: true, childList: true, attributes: true, attributeFilter: ['style', 'class'] });
  };
  const nativeVisible = (element: HTMLElement) => {
    const style = view.getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden' && element.getBoundingClientRect().width > 0;
  };
  function layout() {
    frame = 0;
    if (disposed || !body.isConnected || selectingWithPointer) return;
    observer.disconnect();
    try {
      const toolbar = body.querySelector<HTMLElement>('[data-onlc-part="toolbar"]');
      const block = editor.plugins.onlcblocks?.getActiveBlock().getOrNull() || null;
      if (!toolbar || !block || toolbar.classList.contains('onlc-blocks-hidden')) {
        languageSlot.replaceChildren(); languageSignature='';
        dock.classList.remove('cms-context-dock--active'); structuralSlot.replaceChildren(); nativeSlot.style.cssText = ''; restoreNative(); blockTarget = null; dockSignature = ''; keepDock = false; return;
      }
      if (block !== blockTarget) { blockTarget = block; keepDock = false; dockSignature = ''; dock.classList.remove('cms-context-dock--active'); }
      const badge = body.querySelector<HTMLElement>('[data-onlc-part="blockkind"]');
      if (badge && badge.parentElement !== toolbar) toolbar.prepend(badge);
      const idBadge = body.querySelector<HTMLElement>('[data-onlc-part="blockid"]');
      if (idBadge && idBadge.parentElement !== toolbar) toolbar.prepend(idBadge);
      if (!toolbar.querySelector('[data-cms-block-html]')) {
        const button = innerDoc.createElement('button'); button.type = 'button'; button.className = 'onlc-blocks-btn';
        button.dataset.cmsBlockHtml = 'true'; button.title = 'Modifier le HTML de ce bloc'; button.setAttribute('aria-label', button.title); button.textContent = '</>';
        let htmlTarget: HTMLElement | null = null;
        button.addEventListener('mousedown', event => { htmlTarget = editor.plugins.onlcblocks?.getActiveBlock().getOrNull() || blockTarget; event.preventDefault(); event.stopPropagation(); });
        button.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); const selected = htmlTarget || editor.plugins.onlcblocks?.getActiveBlock().getOrNull() || blockTarget; if (selected && body.contains(selected)) editHtml(selected); });
        toolbar.append(button);
      }
      // Keep vendor delegation and undo intact. Its insert controls now belong
      // to the palette, never to the upper/lower edge of editable content.
      for (const part of ['add-before','add-after']) {
        const button=body.querySelector<HTMLElement>(`[data-onlc-part="${part}"]`);
        if (button && button.parentElement!==toolbar) toolbar.append(button);
      }
      const languageMenu=body.querySelector<HTMLElement>('[data-onlc-part="langmenu"]');
      if (languageMenu && !languageMenu.classList.contains('onlc-blocks-hidden')) {
        const signature=languageMenu.innerHTML;
        if(signature!==languageSignature) {
          languageSignature=signature; languageSlot.replaceChildren();
          const mirror=languageMenu.cloneNode(true) as HTMLElement;
          mirror.removeAttribute('style'); mirror.className='cms-block-language';
          const originals=[...languageMenu.querySelectorAll<HTMLButtonElement>('button')];
          [...mirror.querySelectorAll<HTMLButtonElement>('button')].forEach((button,index)=>{
            button.addEventListener('mousedown',event=>{event.preventDefault();originals[index]?.dispatchEvent(new innerView.MouseEvent('mousedown',{bubbles:true,cancelable:true}));});
            button.addEventListener('click',event=>{event.preventDefault();originals[index]?.dispatchEvent(new innerView.MouseEvent('click',{bubbles:true,cancelable:true}));schedule();});
          });
          languageSlot.append(mirror);
        }
        languageMenu.style.setProperty('visibility','hidden','important');
      } else { languageSlot.replaceChildren();languageSignature=''; }
      const node = editor.selection.getNode();
      const popups = [...outerDoc.querySelectorAll<HTMLElement>('.tox-silver-sink .tox-pop')];
      // The native positioner can hide a wide table palette before our coordinator
      // gets a chance to dock it on mobile. Reclaim only the active table palette.
      const tableActive = !!node.closest('table') && editor.hasFocus() && !outerDoc.querySelector('.tox-dialog');
      for (const element of popups) {
        if (tableActive && element.querySelector('[data-mce-name="tableprops"]') && view.getComputedStyle(element).display === 'none') {
          if (!ownedNative.has(element)) ownedNative.set(element, { css: element.getAttribute('style') || '', placement: '' });
          element.dataset.cmsTablePalette = 'true';
          element.style.setProperty('display', 'block', 'important');
          element.style.setProperty('max-width', `${container.clientWidth - 16}px`, 'important');
        } else if (!tableActive && element.dataset.cmsTablePalette) {
          // Preserve a native hide that happened after our placement.
          if (element.style.getPropertyValue('display') === 'block' && element.style.getPropertyPriority('display') === 'important') element.style.setProperty('display', 'none');
          delete element.dataset.cmsTablePalette;
        }
      }
      const native = popups.filter(nativeVisible).filter(el => !!el.querySelector('.tox-toolbar,.tox-context-form'));
      for (const element of native) {
        if (!ownedNative.has(element)) ownedNative.set(element, { css: element.getAttribute('style') || '', placement: '' });
        element.style.setProperty('bottom', 'auto', 'important'); element.style.setProperty('right', 'auto', 'important');
        element.style.setProperty('height', 'auto', 'important'); element.style.setProperty('max-height', 'none', 'important');
      }
      dock.classList.add('cms-context-dock--active');
      const signature = toolbar.innerHTML;
      if (signature !== dockSignature) {
        dockSignature = signature;
        structuralSlot.replaceChildren();
        const mirror = toolbar.cloneNode(true) as HTMLElement;
        mirror.removeAttribute('style'); mirror.className = 'cms-block-palette';
        // All original actions remain in Onlc4. Pin the same block on mousedown.
        const mirrorButtons = [...mirror.querySelectorAll<HTMLButtonElement>('button')];
        const originalButtons = [...toolbar.querySelectorAll<HTMLButtonElement>('button')];
        mirrorButtons.forEach((button, index) => {
          if (button.dataset.onlcAction === 'drag') { button.disabled = true; button.title = 'Pour déplacer ce bloc, utilisez Monter ou Descendre'; return; }
          button.addEventListener('mousedown', event => { event.preventDefault(); originalButtons[index]?.dispatchEvent(new innerView.MouseEvent('mousedown', { bubbles: true, cancelable: true })); });
          button.addEventListener('click', event => { event.preventDefault(); originalButtons[index]?.dispatchEvent(new innerView.MouseEvent('click', { bubbles: true, cancelable: true })); schedule(); });
        });
        structuralSlot.append(mirror);
      }
      toolbar.style.setProperty('visibility', 'hidden', 'important');
      const iframe = editor.iframeElement || container.querySelector('iframe');
      const toBox = (r: DOMRect): Box => ({ left:r.left, top:r.top, width:r.width, height:r.height });
      const iframeRect = iframe?.getBoundingClientRect();
      const toOuter = (r: DOMRect): Box => ({ left:(iframeRect?.left || 0)+r.left, top:(iframeRect?.top || 0)+r.top, width:r.width, height:r.height });
      const target = toOuter(block.getBoundingClientRect());
      const contentTop = Math.max(iframeRect?.top || 0, header?.getBoundingClientRect().bottom || 0, 0)+6;
      const contentLeft = Math.max(iframeRect?.left || 0, 0)+6;
      const viewport: Box = {
        left:contentLeft, top:contentTop,
        width:Math.max(0, Math.min(iframeRect?.right || 0, view.innerWidth)-6-contentLeft),
        height:Math.max(0, Math.min(iframeRect?.bottom || 0, view.innerHeight)-6-contentTop),
      };
      // Native contextual commands have priority. The bounded pass protects the
      // entire active block, the selected node and every earlier palette.
      const obstacles = [target, toOuter(node.getBoundingClientRect())];
      const mirrors = [structuralSlot, languageSlot].filter(slot => slot.childElementCount > 0);
      const palettes = [...native, ...mirrors];
      dock.classList.toggle('cms-context-dock--floating', !keepDock);
      for (const slot of [structuralSlot, languageSlot]) slot.style.cssText = '';
      nativeSlot.style.cssText = '';
      const placements: Box[] = [];
      if (!keepDock && iframeRect) {
        for (const element of palettes) {
          element.style.setProperty('max-width',`${viewport.width}px`,'important');
          const r = element.getBoundingClientRect();
          const placement = placePalette({width:r.width, height:r.height}, target, viewport, obstacles);
          if (!placement) { keepDock = true; break; }
          placements.push(placement); obstacles.push(placement);
        }
      } else keepDock = true;
      dock.classList.toggle('cms-context-dock--floating', !keepDock);
      if (keepDock) {
        // Keep this fallback for the current block: growing the header must not
        // cause repeated switches between floating and reserved positions.
        const nativeWidth = Math.max(0, ...native.map(element => element.getBoundingClientRect().width));
        nativeSlot.style.width = `${Math.min(nativeWidth, container.clientWidth-12)}px`;
        nativeSlot.style.height = `${native.reduce((height, element) => height+element.getBoundingClientRect().height, 0)}px`;
        let offset = 0;
        for (const element of native) {
          const slot = nativeSlot.getBoundingClientRect();
          element.style.setProperty('position', 'fixed', 'important');
          element.style.setProperty('left', `${slot.left}px`, 'important');
          element.style.setProperty('top', `${slot.top+offset}px`, 'important');
          element.style.setProperty('max-width', `${Math.max(0,container.clientWidth-12)}px`, 'important');
          offset += element.getBoundingClientRect().height;
        }
      } else {
        palettes.forEach((element,index) => {
          const placement = placements[index];
          element.style.setProperty('position','fixed','important');
          element.style.setProperty('left',`${placement.left}px`,'important');
          element.style.setProperty('top',`${placement.top}px`,'important');
          element.style.setProperty('max-width',`${viewport.width}px`,'important');
        });
      }
      for (const element of native) ownedNative.get(element)!.placement = element.getAttribute('style') || '';

    } finally { syncHeaderSpace(); if (!disposed) observe(); }
  }
  // Resizing the editable viewport between mousedown and mouseup can move the
  // clicked text under the pointer. Finish the selection before laying it out.
  const pointerStart=()=>{selectingWithPointer=true;};
  const pointerEnd=()=>{if(selectingWithPointer){selectingWithPointer=false;schedule();}};
  const touchEnd=(event:PointerEvent)=>{if(event.pointerType!=='mouse')pointerEnd();};
  innerDoc.addEventListener('pointerdown',pointerStart);
  innerDoc.addEventListener('mouseup',pointerEnd);
  innerDoc.addEventListener('pointerup',touchEnd);
  innerDoc.addEventListener('pointercancel',pointerEnd);
  outerDoc.addEventListener('mouseup',pointerEnd);
  const events = 'NodeChange SelectionChange ResizeEditor ScrollContent SetContent change undo redo focus blur';
  editor.on(events, schedule);
  view.addEventListener('scroll', schedule, true); view.addEventListener('resize', schedule);
  innerView.addEventListener('scroll', schedule, true);
  const resize = new ResizeObserver(schedule); resize.observe(container); if(header)resize.observe(header);
  observe(); schedule();
  return () => { innerDoc.removeEventListener('pointerdown',pointerStart);innerDoc.removeEventListener('mouseup',pointerEnd);innerDoc.removeEventListener('pointerup',touchEnd);innerDoc.removeEventListener('pointercancel',pointerEnd);outerDoc.removeEventListener('mouseup',pointerEnd); disposed = true; if (frame) view.cancelAnimationFrame(frame); observer.disconnect(); resize.disconnect(); editor.off(events, schedule); view.removeEventListener('scroll', schedule, true); view.removeEventListener('resize', schedule); innerView.removeEventListener('scroll', schedule, true); restoreNative(); dock.remove(); syncHeaderSpace(); };
}
