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

  // The page code, not the browser, decides where the page is after Back and Forward,
  // so a switch always lands at the top of the grid.
  history.scrollRestoration = 'manual';

  // If the visitor is further down than the year menu, brings the menu to the top of
  // the screen, with the start of the grid below it. Never moves the page down.
  function toGridTop() {
    const top = nav.getBoundingClientRect().top + window.scrollY;
    if (window.scrollY > top) window.scrollTo(0, top);
  }

  function show(year) {
    if (year === shown) return;
    years.get(shown).tiles = [...grid.childNodes];
    const next = years.get(year);
    next.tiles ??= [...document.importNode(next.template.content, true).childNodes];
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
    history.pushState(null, '', pathOf(year));
    document.title = titleAt(pathOf(year));
  });

  addEventListener('popstate', () => {
    const year = yearAt(location.pathname);
    if (year === null) return;
    show(year);
    document.title = titleAt(location.pathname);
  });
})();
