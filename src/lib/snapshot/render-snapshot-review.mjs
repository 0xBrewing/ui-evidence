function serializeForInlineScript(value) {
  return JSON.stringify(value)
    .replaceAll('&', '\\u0026')
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');
}

function escapeHtmlValue(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function renderSnapshotReviewHtml(reviewData) {
  const serialized = serializeForInlineScript(reviewData);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtmlValue(reviewData.run.title)} Snapshot</title>
    <style>
      :root {
        --bg: #f6f3ee;
        --panel: #fffdfa;
        --panel-soft: #fbf7f1;
        --ink: #1f1a16;
        --muted: #6b5c4f;
        --line: rgba(54, 37, 22, 0.12);
        --accent: #9f5a26;
        --ok: #266145;
        --warn: #9f5a26;
        --danger: #8b2f2f;
      }

      * { box-sizing: border-box; }

      body {
        margin: 0;
        background: linear-gradient(180deg, #fbf8f3 0%, var(--bg) 100%);
        color: var(--ink);
        font: 15px/1.6 "Avenir Next", "Segoe UI", sans-serif;
      }

      main {
        width: min(1360px, calc(100vw - 28px));
        margin: 18px auto 48px;
      }

      .panel {
        background: rgba(255, 253, 250, 0.94);
        border: 1px solid var(--line);
        border-radius: 22px;
        padding: 20px;
        box-shadow: 0 14px 40px rgba(35, 24, 16, 0.06);
      }

      .panel + .panel {
        margin-top: 16px;
      }

      .header {
        display: grid;
        gap: 16px;
      }

      .header-top,
      .meta-row,
      .link-row,
      .toolbar {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        align-items: center;
      }

      .kicker,
      .meta-pill,
      .summary-pill,
      .filter-pill {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        min-height: 34px;
        padding: 0 12px;
        border-radius: 999px;
        background: var(--panel-soft);
        border: 1px solid var(--line);
        color: var(--muted);
        font-size: 0.9rem;
      }

      .summary-pill strong {
        color: var(--ink);
      }

      .summary-pill[data-tone="danger"] {
        color: var(--danger);
        background: rgba(139, 47, 47, 0.08);
      }

      .summary-pill[data-tone="ok"] {
        color: var(--ok);
      }

      h1, h2 {
        margin: 0;
        font-family: "Iowan Old Style", "Palatino Linotype", serif;
        font-weight: 700;
      }

      h1 {
        font-size: clamp(2rem, 3vw, 3rem);
        line-height: 1.02;
      }

      h2 {
        font-size: 1.4rem;
      }

      p {
        margin: 0;
        color: var(--muted);
      }

      .link-row a,
      .asset-links a {
        color: var(--accent);
        text-decoration: none;
        font-weight: 700;
      }

      .issue-list,
      .quick-grid,
      .cards {
        display: grid;
        gap: 14px;
      }

      .issue-list {
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      }

      .issue-card {
        padding: 14px;
        border-radius: 18px;
        border: 1px solid rgba(139, 47, 47, 0.14);
        background: rgba(139, 47, 47, 0.06);
      }

      .quick-grid {
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      }

      .quick-card,
      .capture-card {
        display: grid;
        gap: 12px;
        padding: 14px;
        border-radius: 18px;
        border: 1px solid var(--line);
        background: var(--panel-soft);
      }

      .quick-card {
        text-decoration: none;
        color: inherit;
      }

      .quick-card img,
      .capture-card img {
        width: 100%;
        display: block;
        border-radius: 14px;
        border: 1px solid rgba(54, 37, 22, 0.08);
        background: #f2ebe3;
      }

      .quick-caption,
      .capture-subtitle {
        color: var(--muted);
        font-size: 0.92rem;
      }

      .cards {
        grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      }

      .capture-title {
        font-size: 1.05rem;
        font-weight: 700;
      }

      .toolbar {
        justify-content: space-between;
      }

      .filter-group {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        align-items: center;
      }

      select {
        appearance: none;
        border: 1px solid var(--line);
        border-radius: 999px;
        padding: 8px 14px;
        font: inherit;
        background: #fff;
        color: var(--ink);
      }

      .placeholder {
        padding: 28px 20px;
        text-align: center;
        color: var(--muted);
        border: 1px dashed var(--line);
        border-radius: 18px;
      }

      @media (max-width: 720px) {
        main {
          width: min(100vw - 18px, 100%);
          margin-top: 10px;
        }

        .panel {
          padding: 16px;
          border-radius: 18px;
        }
      }
    </style>
  </head>
  <body>
    <main id="app"></main>
    <script>
      const reviewData = ${serialized};
      const app = document.getElementById('app');

      function escapeHtml(value) {
        return String(value)
          .replaceAll('&', '&amp;')
          .replaceAll('<', '&lt;')
          .replaceAll('>', '&gt;')
          .replaceAll('"', '&quot;')
          .replaceAll("'", '&#39;');
      }

      function anchorId(item) {
        return ['capture', item.stageId, item.screenId, item.viewportId]
          .join('-')
          .replace(/[^a-zA-Z0-9_-]+/g, '-');
      }

      function quickCard(item) {
        return '<a class="quick-card" href="#' + anchorId(item) + '">'
          + '<img loading="lazy" src="' + item.currentLink + '" alt="' + escapeHtml(item.label) + ' current capture" />'
          + '<div><strong>' + escapeHtml(item.label) + '</strong><div class="quick-caption">'
          + escapeHtml(item.stageTitle) + ' · ' + escapeHtml(item.viewportId) + '</div></div>'
          + '</a>';
      }

      function captureCard(item) {
        return '<article class="capture-card" id="' + anchorId(item) + '">'
          + '<div class="capture-title">' + escapeHtml(item.label) + '</div>'
          + '<div class="capture-subtitle">' + escapeHtml(item.stageTitle) + ' · ' + escapeHtml(item.viewportId) + ' · ' + escapeHtml(item.locale) + '</div>'
          + '<img loading="lazy" src="' + item.currentLink + '" alt="' + escapeHtml(item.label) + ' current capture" />'
          + '<div class="asset-links"><a href="' + item.currentLink + '">Open image</a></div>'
          + '</article>';
      }

      function render(state = {}) {
        const stageId = state.stageId ?? 'all';
        const viewport = state.viewport ?? 'all';
        const captures = reviewData.captures.filter((item) => {
          if (stageId !== 'all' && item.stageId !== stageId) return false;
          if (viewport !== 'all' && item.viewportId !== viewport) return false;
          return true;
        });

        const stageOptions = ['all', ...new Set(reviewData.captures.map((item) => item.stageId))];
        const viewportOptions = ['all', ...new Set(reviewData.captures.map((item) => item.viewportId))];

        app.innerHTML = ''
          + '<section class="panel header">'
          + '  <div class="header-top"><span class="kicker">Snapshot Bundle</span><span class="meta-pill">' + escapeHtml(reviewData.run.id) + '</span></div>'
          + '  <div><h1>' + escapeHtml(reviewData.run.title) + '</h1><p>' + escapeHtml(reviewData.run.description) + '</p></div>'
          + '  <div class="meta-row">'
          + '    <span class="summary-pill" data-tone="ok"><strong>' + reviewData.counts.captures + '/' + reviewData.counts.expectedCaptures + '</strong> reviewable</span>'
          + '    <span class="summary-pill" data-tone="' + (reviewData.counts.failedCaptures ? 'danger' : 'ok') + '"><strong>' + reviewData.counts.failedCaptures + '</strong> failed</span>'
          + '    <span class="summary-pill"><strong>' + new Date(reviewData.generatedAt).toLocaleString() + '</strong> generated</span>'
          + '  </div>'
          + '  <div class="link-row">'
          + '    <a href="' + reviewData.links.notes + '">notes</a>'
          + '    <a href="' + reviewData.links.report + '">report</a>'
          + '    <a href="' + reviewData.links.manifest + '">manifest</a>'
          + '  </div>'
          + '</section>';

        if (reviewData.failures.length) {
          app.innerHTML += '<section class="panel"><h2>Review First</h2><p>Capture failures should be checked before trusting the rest of the bundle.</p><div class="issue-list">'
            + reviewData.failures.map((item) => '<article class="issue-card"><strong>' + escapeHtml(item.stageTitle) + ' / ' + escapeHtml(item.label)
            + '</strong><div class="quick-caption">' + escapeHtml(item.viewportId) + ' · ' + escapeHtml(item.step) + '</div><p>'
            + escapeHtml(item.message) + '</p></article>').join('')
            + '</div></section>';
        }

        app.innerHTML += '<section class="panel">'
          + '<div class="toolbar"><div><h2>Quick Scan</h2><p>Use the bundle directly. No local server is required.</p></div>'
          + ((stageOptions.length > 2 || viewportOptions.length > 2)
            ? '<div class="filter-group">'
              + (stageOptions.length > 2 ? '<label class="filter-pill">stage <select id="stage-filter">' + stageOptions.map((option) => '<option value="' + option + '"' + (option === stageId ? ' selected' : '') + '>' + option + '</option>').join('') + '</select></label>' : '')
              + (viewportOptions.length > 2 ? '<label class="filter-pill">viewport <select id="viewport-filter">' + viewportOptions.map((option) => '<option value="' + option + '"' + (option === viewport ? ' selected' : '') + '>' + option + '</option>').join('') + '</select></label>' : '')
              + '</div>'
            : '')
          + '</div>'
          + '<div class="quick-grid">'
          + (captures.length ? captures.map((item) => quickCard(item)).join('') : '<div class="placeholder">No captures match the current filters.</div>')
          + '</div></section>';

        app.innerHTML += '<section class="panel"><div class="toolbar"><div><h2>Detail Cards</h2><p>Open the original image only when the quick scan raises a question.</p></div><div class="quick-caption">' + captures.length + ' visible</div></div>'
          + '<div class="cards">'
          + (captures.length ? captures.map((item) => captureCard(item)).join('') : '<div class="placeholder">No captures match the current filters.</div>')
          + '</div></section>';

        const stageFilter = document.getElementById('stage-filter');
        if (stageFilter) {
          stageFilter.addEventListener('change', (event) => {
            render({ ...state, stageId: event.target.value });
          });
        }

        const viewportFilter = document.getElementById('viewport-filter');
        if (viewportFilter) {
          viewportFilter.addEventListener('change', (event) => {
            render({ ...state, viewport: event.target.value });
          });
        }
      }

      render();
    </script>
  </body>
</html>`;
}
