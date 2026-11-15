// Switching years in place (#17, TDD section 5 "Links" and "Back and Forward").
// The build copies this file to /site.js. Each page holds every other year's tiles in a
// <template>; picking a year in the menu swaps them into the grid, without loading a
// new page, and adds a step to the browser's history so Back and Forward move between
// years. With JavaScript off, the year links simply load each year's own page.
(() => {
  const nav = document.querySelector('nav[aria-label="Years"]');
  const grid = document.querySelector('.grid');
  const count = document.querySelector('.count');
  const links = nav ? [...nav.querySelectorAll('a')] : [];
  if (!grid || !count || links.length === 0) return;

  const site = document.querySelector('h1').textContent;
  const yearOf = (a) => Number(a.textContent);
  const newest = yearOf(links[0]);
  let shown = yearOf(nav.querySelector('[aria-current="page"]'));

  // Each year's tiles and count. The shown year's are in the grid, and are kept when
  // another year is picked; the others wait in templates until first picked.
  const years = new Map([[shown, { count: count.textContent }]]);
  for (const t of document.querySelectorAll('template[data-year]')) {
    years.set(Number(t.dataset.year), { template: t, count: t.dataset.count });
  }

  const pathOf = (year) => `/${year}/`;
  // The year an address shows: the home page, /, shows the newest.
  function yearAt(path) {
    if (path === '/') return newest;
    const year = Number(path.match(/^\/(\d{4})\/$/)?.[1]);
    return years.has(year) ? year : null;
  }
  // The browser tab: "Sketch Gallery" on the home page, "2025 · Sketch Gallery" on a year.
  const titleAt = (path) => (path === '/' ? site : `${yearAt(path)} · ${site}`);

  // If the visitor is further down than the year menu, brings the menu to the top of
  // the screen, with the start of the grid below it. Never moves the page down.
  function toGridTop() {
    const top = nav.getBoundingClientRect().top + window.scrollY;
    if (window.scrollY > top) window.scrollTo(0, top);
  }

  // A held year's tiles, ready for the grid. Their thumbnails wait in data-src (see
  // build/pages.mjs), so the page fetches none of them until the year is picked; here they
  // become src again, in the same place, so the tiles match the year's own page exactly.
  function tilesFrom(template) {
    const t = document.createElement('template');
    t.innerHTML = template.innerHTML.replaceAll('<img data-src="', '<img src="');
    return [...document.importNode(t.content, true).childNodes];
  }

  function show(year) {
    if (year === shown) return;
    years.get(shown).tiles = [...grid.childNodes];
    const next = years.get(year);
    next.tiles ??= tilesFrom(next.template);
    grid.replaceChildren(...next.tiles);
    count.textContent = next.count;
    for (const a of links) {
      if (yearOf(a) === year) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    }
    shown = year;
    toGridTop();
  }

  // An address for a year with no drawings, like /2019/, gets the home page (TDD
  // section 5). Change the address to the year shown, so a shared link never names the
  // wrong year. Replaced, not added, so Back doesn't return to it.
  if (location.pathname !== '/' && location.pathname !== pathOf(shown)) {
    history.replaceState(null, '', pathOf(shown));
    document.title = titleAt(pathOf(shown));
  }

  nav.addEventListener('click', (e) => {
    const a = e.target.closest('a');
    // A click with Ctrl, Command, Shift or Alt, or another button, opens the link the browser's way, as in a new tab.
    if (!a || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    const year = yearOf(a);
    if (!years.has(year)) return;
    e.preventDefault();
    if (year === shown) {
      toGridTop();
      return;
    }
    show(year);
    history.scrollRestoration = 'manual';
    history.pushState(null, '', pathOf(year));
    document.title = titleAt(pathOf(year));
  });

  addEventListener('popstate', () => {
    const year = yearAt(location.pathname);
    if (year === null) return;
    show(year);
    document.title = titleAt(location.pathname);
  });

  // Where the page lands. Each step in the browser's history has its own setting: 'auto',
  // the browser puts the visitor back where they were, or 'manual', this code decides.
  // On a page load (a reload, or Back from another page) the browser's way is kept. A
  // step added here starts as a copy of the one before, so the click sets 'manual' before
  // adding it, and Back and Forward between the years this code added land at the top of
  // the grid. Leaving the page sets 'auto' again; coming back to it from the browser's
  // memory of recent pages ('persisted') sets 'manual' once more. When the browser
  // instead loads the page afresh on Back, that year's step keeps 'auto', the browser's
  // way, so Forward to it later can return to the old place rather than the top of the grid.
  addEventListener('pagehide', () => {
    history.scrollRestoration = 'auto';
  });
  addEventListener('pageshow', (e) => {
    if (e.persisted) history.scrollRestoration = 'manual';
  });
})();

// The pop-up (#18, TDD sections 3 and 5). A click on a drawing, or Enter on one, opens it
// in PhotoSwipe at full size, with a zoom from its thumbnail. PhotoSwipe's code and look
// are fetched from /popup/ the first time a drawing is opened. Opening a drawing adds a
// step to the browser's history, and closing it any way goes back that step, so Back
// closes the pop-up and Forward opens the same drawing again. The step keeps the year's
// address; links to single drawings come with #20. With JavaScript off, a drawing's link
// loads its full-size file.
(() => {
  const grid = document.querySelector('.grid');
  if (!grid) return;

  // PhotoSwipe, fetched once. If fetching fails, the next click tries again.
  let photoswipe;
  function load() {
    photoswipe ??= Promise.all([
      import('/popup/photoswipe.esm.min.js'),
      new Promise((resolve, reject) => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = '/popup/popup.css';
        link.onload = resolve;
        link.onerror = () => {
          link.remove();
          reject(new Error('The pop-up\'s look did not load'));
        };
        document.head.append(link);
      }),
    ]).then(
      ([module]) => module.default,
      (err) => {
        photoswipe = undefined;
        throw err;
      },
    );
    return photoswipe;
  }

  const tiles = () => [...grid.querySelectorAll('a')];

  // Where a tile's drawing is on the screen. The thumbnail is fitted inside its box, which
  // can leave white space at its sides, so the zoom starts and ends on the drawing itself.
  // A tile entirely above or below the screen gives nothing, so the pop-up fades out
  // instead of zooming the drawing off the screen; the page stays where it was. A tile
  // partly on the screen keeps the zoom.
  function drawnBounds({ element, width, height }) {
    const r = element.querySelector('img').getBoundingClientRect();
    if (r.bottom <= 0 || r.top >= innerHeight) return undefined;
    const scale = Math.min(r.width / width, r.height / height);
    return { x: r.left + (r.width - width * scale) / 2, y: r.top + (r.height - height * scale) / 2, w: width * scale };
  }

  let pswp = null;
  let opening = false;

  // Opens the pop-up at the grid's drawing number `index`. `pointer`, where a click was,
  // tells PhotoSwipe it wasn't opened with the keyboard. `addStep` adds the history step.
  async function open(index, { pointer = null, addStep = false } = {}) {
    if (pswp || opening) return;
    opening = true;
    try {
      const PhotoSwipe = await load();
      const links = tiles();
      // A drawing opened from the keyboard gets the focus back when the pop-up closes.
      const focusBack = document.activeElement === links[index];
      const p = new PhotoSwipe({
        dataSource: links.map((a) => {
          const img = a.querySelector('img');
          return { element: a, src: a.getAttribute('href'), width: Number(a.dataset.width), height: Number(a.dataset.height), alt: img.alt, msrc: img.currentSrc || img.src };
        }),
        index,
        initialPointerPos: pointer,
        // A near-black background that hides the page (PRD section 6).
        bgOpacity: 1,
        // Room above and below the drawing for the counter and the close button; on wider
        // screens, room at the sides for the arrows.
        paddingFn: (screen) => (screen.x < 560 ? { top: 48, bottom: 48, left: 0, right: 0 } : { top: 64, bottom: 64, left: 72, right: 72 }),
        // Double-tap zooms to the drawing's full size: one pixel of it to one pixel of the page (R7).
        secondaryZoomLevel: 1,
        // Each motion within 350 ms (R8). PhotoSwipe's 333 ms is within it, but on opening
        // and closing it starts fading the buttons a frame or two before it moves the
        // drawing, so from first change to last that took about 366 ms.
        showAnimationDuration: 300,
        hideAnimationDuration: 300,
        zoomAnimationDuration: 300,
        // The mockups have no zoom button: a click, a double-tap or a pinch zooms.
        zoom: false,
        // Focus goes back to the drawing shown when the pop-up closes, below.
        returnFocus: false,
      });
      p.addFilter('thumbBounds', (bounds, item) => drawnBounds(item));
      // On a phone, a tap on the dark area closes the pop-up, as a click does (R5); a tap
      // on the drawing shows or hides the buttons, as PhotoSwipe does.
      p.on('tapAction', (e) => {
        const target = e.originalEvent.target.classList;
        if (target.contains('pswp__item') || target.contains('pswp__zoom-wrap')) {
          e.preventDefault();
          p.close();
        }
      });
      // Closed by X, Esc, a click on the dark area or a swipe down: go back the step that
      // opening added. Closed by Back: that step is already gone.
      p.on('close', () => {
        if (history.state?.drawing) history.back();
      });
      p.on('destroy', () => {
        pswp = null;
        const shown = links[p.currIndex];
        if (focusBack && shown?.isConnected) shown.focus({ preventScroll: true });
      });
      pswp = p;
      p.init();
      // Screen readers call the pop-up "Drawing, dialog".
      p.element.setAttribute('aria-label', 'Drawing');
      // Tab and Shift-Tab go round the pop-up's buttons. PhotoSwipe only brings the focus
      // back once it has left the page, so Tab would visit the browser's own controls; and
      // in Safari, the first Tab after a click stopped on the pop-up itself.
      const onTab = (e) => {
        if (e.key !== 'Tab') return;
        const buttons = [...p.element.querySelectorAll('button')].filter((b) => !b.disabled && b.getClientRects().length > 0);
        if (buttons.length === 0) return;
        const at = buttons.indexOf(document.activeElement);
        let to = null;
        if (at === -1) to = e.shiftKey ? buttons.length - 1 : 0;
        else if (e.shiftKey && at === 0) to = buttons.length - 1;
        else if (!e.shiftKey && at === buttons.length - 1) to = 0;
        if (to === null) return;
        e.preventDefault();
        buttons[to].focus();
      };
      // On window, so it runs after PhotoSwipe's own key handling on the document.
      addEventListener('keydown', onTab);
      p.on('destroy', () => removeEventListener('keydown', onTab));
      if (addStep) history.pushState({ drawing: links[index].dataset.date }, '');
    } finally {
      opening = false;
    }
  }

  function openDate(date) {
    const index = tiles().findIndex((a) => a.dataset.date === date);
    if (index >= 0) open(index).catch(() => {});
  }

  // Whether the next click on a drawing comes from Enter. Firefox gives such a click no sign of it.
  let byKeyboard = false;
  grid.addEventListener('keydown', (e) => {
    byKeyboard = e.key === 'Enter';
  });
  grid.addEventListener('pointerdown', () => {
    byKeyboard = false;
  });

  grid.addEventListener('click', (e) => {
    const a = e.target.closest('a');
    // A click with Ctrl, Command, Shift or Alt, or another button, opens the link the browser's way, as in a new tab.
    if (!a || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    // Opened with the keyboard, PhotoSwipe moves the focus into the pop-up at once.
    const pointer = byKeyboard || !e.detail ? null : { x: e.clientX, y: e.clientY };
    byKeyboard = false;
    // If PhotoSwipe can't be fetched, the drawing's full-size file opens instead.
    open(tiles().indexOf(a), { pointer, addStep: true }).catch(() => location.assign(a.href));
  });

  // Back to a step with no drawing open closes the pop-up; Forward to a drawing's step
  // opens it again. The year code above has already shown that step's year.
  addEventListener('popstate', () => {
    const date = history.state?.drawing;
    if (date) {
      if (!pswp) openDate(date);
    } else if (pswp) pswp.close();
  });

  // A reload on a drawing's step opens that drawing again.
  if (history.state?.drawing) openDate(history.state.drawing);
})();
