import {escapeHtml as e} from './html.mjs';

export function workbookPageImage(proof, page) {
  const image = proof.pageImages?.find(item => item.page === page);
  if (!image) return '<p class="notice">Sivukuvaa ei ole tässä materiaaliversiossa. Avaa sivu PDF:nä.</p>';
  return '<section class="workbook-image-view" data-page-scale="100" aria-label="Työkirjan sivukuva">'+
    '<div class="workbook-image-tools" role="group" aria-label="Sivukuvan koko">'+
    '<button type="button" data-page-zoom="-1" aria-label="Pienennä sivua" title="Pienennä sivua" disabled>−</button>'+
    '<button type="button" data-page-fit title="Sovita sivu leveyteen">Sovita leveyteen</button>'+
    '<button type="button" data-page-zoom="1" aria-label="Suurenna sivua" title="Suurenna sivua">+</button>'+
    '<output data-page-scale-label aria-live="polite">100 %</output></div>'+
    '<p data-page-status role="status">Sivua ladataan…</p><button type="button" data-page-retry hidden>Yritä uudelleen</button>'+
    '<div class="workbook-image-viewport" tabindex="0" role="region" aria-label="Työkirjan sivu '+page+', vieritettävä suurennettaessa">'+
    '<img class="workbook-page-image" src="'+e(image.file)+'" width="'+image.width+'" height="'+image.height+'" decoding="async" alt="Työkirjan sivu '+page+'. Sivun teksti on avattavissa kuvan alla."></div>'+
    '<details class="workbook-page-text" data-page-text="'+e(image.textFile)+'" data-page-number="'+page+'"><summary>Sivun teksti</summary>'+
    '<p class="muted">Sama teksti ilman sivuasettelua. Kuvat ja kirjoituspaikat näkyvät sivukuvassa.</p>'+
    '<div data-page-text-content aria-live="polite"></div></details></section>';
}

export function createWorkbookPageViewer(root, {fetch: load = globalThis.fetch} = {}) {
  const scales = [100, 125, 150, 175, 200];
  let scale = 100, clear = () => {};
  return {
    clear() { clear(); clear = () => {}; },
    mount() {
      clear();
      const view = root.querySelector('.workbook-image-view');
      if (!view) { clear = () => {}; return; }
      const image = view.querySelector('.workbook-page-image'), status = view.querySelector('[data-page-status]');
      const retry = view.querySelector('[data-page-retry]'), viewport = view.querySelector('.workbook-image-viewport');
      const details = view.querySelector('[data-page-text]'), text = view.querySelector('[data-page-text-content]');
      const controller = new AbortController();
      let loadedText = false, loadingText = false, active = true;
      const updateScale = () => {
        view.dataset.pageScale = String(scale);
        view.querySelector('[data-page-scale-label]').textContent = scale + ' %';
        view.querySelector('[data-page-zoom="-1"]').disabled = scale === scales[0];
        view.querySelector('[data-page-zoom="1"]').disabled = scale === scales.at(-1);
      };
      const imageLoaded = () => { status.hidden = true; retry.hidden = true; image.hidden = false; };
      const imageFailed = () => {
        status.hidden = false; status.textContent = 'Sivukuvaa ei saatu ladattua. Yritä uudelleen tai avaa sivu PDF:nä.';
        image.hidden = true; retry.hidden = false;
      };
      const click = event => {
        const button = event.target.closest('button');
        if (!button || !view.contains(button)) return;
        if (button.hasAttribute('data-page-zoom')) {
          scale = scales[Math.min(Math.max(scales.indexOf(scale) + Number(button.dataset.pageZoom), 0), scales.length - 1)];
          updateScale();
        } else if (button.hasAttribute('data-page-fit')) {
          scale = 100; updateScale(); viewport.scrollTop = 0; viewport.scrollLeft = 0;
        } else if (button === retry) {
          status.hidden = false; status.textContent = 'Sivua ladataan…'; retry.hidden = true;
          image.src = image.getAttribute('src').split('?')[0] + '?retry=' + Date.now();
        }
      };
      const toggle = async () => {
        if (!details.open || loadedText || loadingText) return;
        loadingText = true; text.textContent = 'Tekstiä ladataan…';
        try {
          const response = await load(details.dataset.pageText, {signal: controller.signal});
          if (!response.ok) throw new Error('Page text unavailable');
          const data = await response.json();
          if (data.page !== Number(details.dataset.pageNumber) || typeof data.text !== 'string' || data.text.length > 100000)
            throw new Error('Page text mismatch');
          if (!active) return;
          text.textContent = data.text; loadedText = true;
        } catch (error) {
          if (active && error.name !== 'AbortError') text.textContent = 'Tekstiä ei saatu ladattua. Sulje tämä kohta ja avaa se uudelleen tai avaa PDF.';
        } finally { loadingText = false; }
      };
      view.addEventListener('click', click); details.addEventListener('toggle', toggle);
      image.addEventListener('load', imageLoaded); image.addEventListener('error', imageFailed);
      updateScale();
      if (image.complete) { if (image.naturalWidth) imageLoaded(); else imageFailed(); }
      clear = () => {
        active = false; controller.abort(); view.removeEventListener('click', click); details.removeEventListener('toggle', toggle);
        image.removeEventListener('load', imageLoaded); image.removeEventListener('error', imageFailed);
      };
    }
  };
}

/** "Sivun teksti" in the workbook reader panel: the page's text, loaded when first opened. */
export function installPageTextLoader(root, {fetch: load = globalThis.fetch} = {}) {
  root.addEventListener('toggle', async event => {
    const details = event.target;
    if (!details?.matches?.('.workbook-panel details[data-page-text]') || !details.open || details.dataset.loaded) return;
    const text = details.querySelector('[data-page-text-content]');
    details.dataset.loaded = 'loading'; text.textContent = 'Tekstiä ladataan…';
    try {
      const response = await load(details.dataset.pageText);
      if (!response.ok) throw new Error('Page text unavailable');
      const data = await response.json();
      if (data.page !== Number(details.dataset.pageNumber) || typeof data.text !== 'string' || data.text.length > 100000) throw new Error('Page text mismatch');
      if (!details.isConnected) return;
      text.textContent = data.text; details.dataset.loaded = 'true';
    } catch {
      delete details.dataset.loaded;
      if (details.isConnected) text.textContent = 'Tekstiä ei saatu ladattua. Sulje tämä kohta ja avaa se uudelleen.';
    }
  }, true);
}
