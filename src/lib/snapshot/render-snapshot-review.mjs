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
        --bg: #f3ede4;
        --panel: rgba(255, 249, 240, 0.78);
        --panel-strong: #fffaf2;
        --ink: #241b15;
        --muted: #69584a;
        --line: rgba(65, 42, 22, 0.12);
        --accent: #b7632d;
        --shadow: 0 24px 60px rgba(51, 31, 14, 0.12);
        --display-font: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", serif;
        --body-font: "Avenir Next", "Trebuchet MS", "Segoe UI", sans-serif;
      }

      * { box-sizing: border-box; }

      body {
        margin: 0;
        color: var(--ink);
        font-family: var(--body-font);
        background:
          radial-gradient(circle at top left, rgba(183, 99, 45, 0.18), transparent 34%),
          radial-gradient(circle at 85% 10%, rgba(71, 103, 122, 0.15), transparent 28%),
          linear-gradient(180deg, #f8f4ee 0%, var(--bg) 100%);
      }

      body::before {
        content: "";
        position: fixed;
        inset: 0;
        pointer-events: none;
        background-image:
          linear-gradient(rgba(36, 27, 21, 0.03) 1px, transparent 1px),
          linear-gradient(90deg, rgba(36, 27, 21, 0.03) 1px, transparent 1px);
        background-size: 36px 36px;
        mask-image: linear-gradient(180deg, rgba(0,0,0,.18), transparent 65%);
      }

      main {
        width: min(1440px, calc(100vw - 32px));
        margin: 32px auto 72px;
      }

      .hero,
      .toolbar,
      .section {
        backdrop-filter: blur(18px);
        background: var(--panel);
        border: 1px solid var(--line);
        box-shadow: var(--shadow);
        border-radius: 24px;
      }

      .hero,
      .toolbar,
      .section {
        padding: 24px;
      }

      .hero {
        overflow: hidden;
      }

      .eyebrow {
        display: inline-flex;
        gap: 10px;
        align-items: center;
        padding: 8px 12px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.6);
        font-size: 12px;
        letter-spacing: 0.18em;
        text-transform: uppercase;
      }

      h1, h2 {
        margin: 0;
        font-family: var(--display-font);
        font-weight: 700;
      }

      h1 {
        margin-top: 18px;
        font-size: clamp(2.4rem, 4vw, 4.3rem);
        line-height: 0.95;
        max-width: 12ch;
      }

      .hero p {
        max-width: 70ch;
        color: var(--muted);
        font-size: 1rem;
        line-height: 1.7;
      }

      .hero-grid {
        display: grid;
        grid-template-columns: minmax(0, 2.1fr) minmax(280px, 1fr);
        gap: 24px;
        align-items: end;
      }

      .stats,
      .link-row,
      .overview-grid,
      .cards {
        display: grid;
        gap: 16px;
      }

      .stats {
        gap: 14px;
      }

      .stat-card,
      .overview-card,
      .capture-card {
        padding: 16px;
        border-radius: 22px;
        background: rgba(255,255,255,0.72);
        border: 1px solid var(--line);
      }

      .stat-value {
        display: block;
        font-size: 2rem;
        font-weight: 700;
      }

      .stat-label,
      .capture-subtitle {
        color: var(--muted);
      }

      .link-row {
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        margin-top: 18px;
      }

      .pill-link {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 14px 16px;
        border-radius: 18px;
        text-decoration: none;
        color: var(--ink);
        background: rgba(255,255,255,0.72);
        border: 1px solid var(--line);
      }

      .toolbar,
      .section {
        margin-top: 22px;
      }

      .toolbar {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 16px;
        align-items: end;
      }

      label {
        display: grid;
        gap: 8px;
        color: var(--muted);
        font-size: 0.85rem;
        text-transform: uppercase;
        letter-spacing: 0.12em;
      }

      select {
        appearance: none;
        border: 1px solid var(--line);
        border-radius: 16px;
        padding: 14px 16px;
        font: inherit;
        color: var(--ink);
        background: rgba(255,255,255,0.75);
      }

      .overview-grid {
        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      }

      .overview-card img,
      .capture-card img {
        width: 100%;
        display: block;
        border-radius: 14px;
        border: 1px solid rgba(48, 33, 20, 0.08);
        background: #f7f2eb;
      }

      .cards {
        grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      }

      .capture-card {
        display: grid;
        gap: 14px;
      }

      .capture-header {
        display: grid;
        gap: 4px;
      }

      .capture-title {
        font-size: 1.15rem;
        font-weight: 700;
      }

      .preview-shell {
        position: relative;
        border-radius: 18px;
        padding: 14px;
        background:
          linear-gradient(135deg, rgba(36, 27, 21, 0.08), transparent 45%),
          linear-gradient(180deg, rgba(255,255,255,0.9), rgba(247,240,232,0.92));
      }

      .asset-links {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }

      .asset-links a {
        text-decoration: none;
        color: var(--accent);
        font-weight: 700;
      }

      .placeholder {
        min-height: 220px;
        display: grid;
        place-items: center;
        text-align: center;
        padding: 24px;
        border-radius: 14px;
        border: 1px dashed rgba(36, 27, 21, 0.18);
        color: var(--muted);
      }

      @media (max-width: 900px) {
        main {
          width: min(100vw - 20px, 100%);
          margin-top: 14px;
        }

        .hero,
        .toolbar,
        .section {
          padding: 18px;
          border-radius: 20px;
        }

        .hero-grid {
          grid-template-columns: 1fr;
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

      function captureCard(item) {
        return \`
          <article class="capture-card" data-stage="\${item.stageId}" data-viewport="\${item.viewportId}">
            <div class="capture-header">
              <div class="capture-title">\${escapeHtml(item.label)}</div>
              <div class="capture-subtitle">\${escapeHtml(item.stageTitle)} · \${escapeHtml(item.viewportId)} · \${escapeHtml(item.locale)}</div>
            </div>
            <div class="preview-shell">
              <img loading="lazy" src="\${item.currentLink}" alt="\${escapeHtml(item.label)} current capture" />
            </div>
            <div class="asset-links"><a href="\${item.currentLink}">Current</a></div>
          </article>
        \`;
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

        app.innerHTML = \`
          <section class="hero">
            <div class="hero-grid">
              <div>
                <div class="eyebrow">UI Evidence Snapshot · \${escapeHtml(reviewData.run.id)}</div>
                <h1>\${escapeHtml(reviewData.run.title)}</h1>
                <p>\${escapeHtml(reviewData.run.description)}</p>
                <div class="link-row">
                  <a class="pill-link" href="\${reviewData.links.notes}"><span>Open notes</span><strong>Markdown</strong></a>
                  <a class="pill-link" href="\${reviewData.links.report}"><span>Open report</span><strong>Summary</strong></a>
                  <a class="pill-link" href="\${reviewData.links.manifest}"><span>Open manifest</span><strong>JSON</strong></a>
                </div>
              </div>
              <div class="stats">
                <div class="stat-card">
                  <span class="stat-value">\${reviewData.counts.captures}</span>
                  <span class="stat-label">Current captures</span>
                </div>
                <div class="stat-card">
                  <span class="stat-value">\${reviewData.counts.overviews}</span>
                  <span class="stat-label">Overview sheets</span>
                </div>
                <div class="stat-card">
                  <span class="stat-value">\${new Date(reviewData.generatedAt).toLocaleString()}</span>
                  <span class="stat-label">Last generated</span>
                </div>
              </div>
            </div>
          </section>

          <section class="toolbar">
            <label>
              Stage
              <select id="stage-filter">
                \${stageOptions.map((option) => '<option value="' + option + '"' + (option === stageId ? ' selected' : '') + '>' + option + '</option>').join('')}
              </select>
            </label>
            <label>
              Viewport
              <select id="viewport-filter">
                \${viewportOptions.map((option) => '<option value="' + option + '"' + (option === viewport ? ' selected' : '') + '>' + option + '</option>').join('')}
              </select>
            </label>
          </section>

          <section class="section">
            <div style="display:flex;justify-content:space-between;align-items:end;gap:12px;margin-bottom:18px;">
              <div>
                <div class="eyebrow">Overview</div>
                <h2 style="margin-top:10px;font-size:2rem;">Snapshot sheets</h2>
              </div>
            </div>
            <div class="overview-grid">
              \${reviewData.overviews.length
                ? reviewData.overviews.map((item) => '<article class="overview-card"><img loading="lazy" src="' + item.path + '" alt="' + escapeHtml(item.label) + '" /></article>').join('')
                : '<div class="overview-card"><div class="placeholder">Overview sheets appear here after a snapshot run.</div></div>'}
            </div>
          </section>

          <section class="section">
            <div style="display:flex;justify-content:space-between;align-items:end;gap:12px;margin-bottom:18px;">
              <div>
                <div class="eyebrow">Current UI</div>
                <h2 style="margin-top:10px;font-size:2rem;">Review cards</h2>
              </div>
              <div class="stat-label">\${captures.length} card(s) visible</div>
            </div>
            <div class="cards">
              \${captures.map((item) => captureCard(item)).join('') || '<div class="overview-card"><div class="placeholder">No captures match the current filters.</div></div>'}
            </div>
          </section>
        \`;

        document.getElementById('stage-filter').addEventListener('change', (event) => {
          render({ ...state, stageId: event.target.value });
        });
        document.getElementById('viewport-filter').addEventListener('change', (event) => {
          render({ ...state, viewport: event.target.value });
        });
      }

      render();
    </script>
  </body>
</html>`;
}
