import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { buildStageManifest, ensureStageStructure, getStagePaths } from '../util/stage-notes.mjs';
import { selectStages } from '../util/selection.mjs';
import { toPosixPath } from '../util/fs.mjs';

function relativeFromReview(stagePaths, projectRoot, targetPath) {
  const absoluteTarget = path.join(projectRoot, targetPath);
  return toPosixPath(path.relative(stagePaths.reviewDir, absoluteTarget));
}

function buildReviewData(config, stage, manifest, stagePaths) {
  const notesLink = relativeFromReview(stagePaths, config.meta.projectRoot, manifest.artifacts.notes);
  const reportLink = relativeFromReview(stagePaths, config.meta.projectRoot, manifest.artifacts.report);
  const manifestLink = toPosixPath(path.relative(stagePaths.reviewDir, stagePaths.manifestPath));
  const overviews = manifest.artifacts.overviews.map((item) => ({
    path: relativeFromReview(stagePaths, config.meta.projectRoot, item),
    label: path.basename(item),
  }));

  const captures = manifest.captures.map((item) => ({
    ...item,
    beforeLink: item.before ? relativeFromReview(stagePaths, config.meta.projectRoot, item.before) : null,
    afterLink: item.after ? relativeFromReview(stagePaths, config.meta.projectRoot, item.after) : null,
    pairLink: item.pair ? relativeFromReview(stagePaths, config.meta.projectRoot, item.pair) : null,
  }));

  return {
    generatedAt: manifest.generatedAt,
    stage: manifest.stage,
    counts: manifest.counts,
    links: {
      notes: notesLink,
      report: reportLink,
      manifest: manifestLink,
    },
    overviews,
    captures,
  };
}

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

function renderReviewHtml(reviewData) {
  const serialized = serializeForInlineScript(reviewData);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtmlValue(reviewData.stage.title)} Review</title>
    <style>
      :root {
        --bg: #f3ede4;
        --panel: rgba(255, 249, 240, 0.78);
        --panel-strong: #fffaf2;
        --ink: #241b15;
        --muted: #69584a;
        --line: rgba(65, 42, 22, 0.12);
        --accent: #b7632d;
        --accent-soft: rgba(183, 99, 45, 0.16);
        --ok: #2c7a54;
        --warn: #b7791f;
        --danger: #9b2c2c;
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
      .section,
      .toolbar {
        backdrop-filter: blur(18px);
        background: var(--panel);
        border: 1px solid var(--line);
        box-shadow: var(--shadow);
      }

      .hero {
        position: relative;
        overflow: hidden;
        border-radius: 28px;
        padding: 32px;
      }

      .hero::after {
        content: "";
        position: absolute;
        width: 320px;
        height: 320px;
        right: -120px;
        top: -120px;
        border-radius: 999px;
        background: radial-gradient(circle, rgba(183, 99, 45, 0.22), transparent 70%);
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
        font-size: clamp(2.5rem, 4vw, 4.5rem);
        line-height: 0.95;
        max-width: 10ch;
      }

      .hero p {
        max-width: 65ch;
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

      .stats {
        display: grid;
        gap: 14px;
      }

      .stat-card {
        padding: 18px;
        border-radius: 22px;
        background: var(--panel-strong);
        border: 1px solid var(--line);
      }

      .stat-value {
        display: block;
        font-size: 2.1rem;
        font-weight: 700;
      }

      .stat-label {
        color: var(--muted);
        font-size: 0.92rem;
      }

      .link-row,
      .overview-grid,
      .cards {
        display: grid;
        gap: 16px;
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
        border-radius: 24px;
        padding: 24px;
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

      .overview-card,
      .capture-card {
        padding: 16px;
        border-radius: 22px;
        background: rgba(255,255,255,0.7);
        border: 1px solid var(--line);
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
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: start;
      }

      .capture-meta {
        display: grid;
        gap: 4px;
      }

      .capture-title {
        font-size: 1.15rem;
        font-weight: 700;
      }

      .capture-subtitle {
        color: var(--muted);
        font-size: 0.95rem;
      }

      .badge {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        min-height: 36px;
        padding: 0 14px;
        border-radius: 999px;
        font-size: 0.82rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .badge[data-status="complete"] { background: rgba(44,122,84,0.13); color: var(--ok); }
      .badge[data-status="missing-before"],
      .badge[data-status="missing-after"] { background: rgba(183,121,31,0.14); color: var(--warn); }
      .badge[data-status="missing-both"] { background: rgba(155,44,44,0.13); color: var(--danger); }

      .preview-shell {
        position: relative;
        border-radius: 18px;
        padding: 14px;
        background:
          linear-gradient(135deg, rgba(36, 27, 21, 0.08), transparent 45%),
          linear-gradient(180deg, rgba(255,255,255,0.9), rgba(247,240,232,0.92));
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

      @media (max-width: 900px) {
        main {
          width: min(100vw - 20px, 100%);
          margin-top: 14px;
        }

        .hero,
        .toolbar,
        .section {
          border-radius: 20px;
          padding: 18px;
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

      const statusLabels = {
        complete: 'Complete',
        'missing-before': 'Missing Before',
        'missing-after': 'Missing After',
        'missing-both': 'Missing Both'
      };

      function escapeHtml(value) {
        return String(value)
          .replaceAll('&', '&amp;')
          .replaceAll('<', '&lt;')
          .replaceAll('>', '&gt;')
          .replaceAll('"', '&quot;')
          .replaceAll("'", '&#39;');
      }

      function captureCard(item) {
        const preview = item.pairLink
          ? '<img loading="lazy" src="' + item.pairLink + '" alt="' + escapeHtml(item.label) + ' comparison" />'
          : '<div class="placeholder">Pair comparison is not available yet.<br />Capture both phases and run compare.</div>';

        const assetLinks = [
          item.beforeLink ? '<a href="' + item.beforeLink + '">Before</a>' : '',
          item.afterLink ? '<a href="' + item.afterLink + '">After</a>' : '',
          item.pairLink ? '<a href="' + item.pairLink + '">Pair</a>' : '',
        ].filter(Boolean).join('');

        return \`
          <article class="capture-card" data-status="\${item.status}" data-viewport="\${item.viewportId}">
            <div class="capture-header">
              <div class="capture-meta">
                <div class="capture-title">\${escapeHtml(item.label)}</div>
                <div class="capture-subtitle">\${escapeHtml(item.viewportId)} · \${escapeHtml(item.locale)}</div>
              </div>
              <span class="badge" data-status="\${item.status}">\${statusLabels[item.status] ?? item.status}</span>
            </div>
            <div class="preview-shell">\${preview}</div>
            <div class="asset-links">\${assetLinks}</div>
          </article>
        \`;
      }

      function render(state = {}) {
        const viewport = state.viewport ?? 'all';
        const status = state.status ?? 'all';
        const captures = reviewData.captures.filter((item) => {
          if (viewport !== 'all' && item.viewportId !== viewport) return false;
          if (status !== 'all' && item.status !== status) return false;
          return true;
        });

        const viewportOptions = ['all', ...new Set(reviewData.captures.map((item) => item.viewportId))];
        const statusOptions = ['all', ...new Set(reviewData.captures.map((item) => item.status))];

        app.innerHTML = \`
          <section class="hero">
            <div class="hero-grid">
              <div>
                <div class="eyebrow">UI Evidence Review · \${escapeHtml(reviewData.stage.id)}</div>
                <h1>\${escapeHtml(reviewData.stage.title)}</h1>
                <p>\${escapeHtml(reviewData.stage.description)}</p>
                <div class="link-row">
                  <a class="pill-link" href="\${reviewData.links.notes}"><span>Open notes</span><strong>Markdown</strong></a>
                  <a class="pill-link" href="\${reviewData.links.report}"><span>Open report</span><strong>Summary</strong></a>
                  <a class="pill-link" href="\${reviewData.links.manifest}"><span>Open manifest</span><strong>JSON</strong></a>
                </div>
              </div>
              <div class="stats">
                <div class="stat-card">
                  <span class="stat-value">\${reviewData.counts.completeCaptures}/\${reviewData.counts.expectedCaptures}</span>
                  <span class="stat-label">Completed capture pairs</span>
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
              Viewport
              <select id="viewport-filter">
                \${viewportOptions.map((option) => '<option value="' + option + '"' + (option === viewport ? ' selected' : '') + '>' + option + '</option>').join('')}
              </select>
            </label>
            <label>
              Status
              <select id="status-filter">
                \${statusOptions.map((option) => '<option value="' + option + '"' + (option === status ? ' selected' : '') + '>' + (statusLabels[option] ?? option) + '</option>').join('')}
              </select>
            </label>
          </section>

          <section class="section">
            <div style="display:flex;justify-content:space-between;align-items:end;gap:12px;margin-bottom:18px;">
              <div>
                <div class="eyebrow">Overview</div>
                <h2 style="margin-top:10px;font-size:2rem;">Stage sheets</h2>
              </div>
            </div>
            <div class="overview-grid">
              \${reviewData.overviews.length
                ? reviewData.overviews.map((item) => '<article class="overview-card"><img loading="lazy" src="' + item.path + '" alt="' + escapeHtml(item.label) + '" /></article>').join('')
                : '<div class="overview-card"><div class="placeholder">Overview sheets appear here after running compare.</div></div>'}
            </div>
          </section>

          <section class="section">
            <div style="display:flex;justify-content:space-between;align-items:end;gap:12px;margin-bottom:18px;">
              <div>
                <div class="eyebrow">Pairs</div>
                <h2 style="margin-top:10px;font-size:2rem;">Review cards</h2>
              </div>
              <div class="stat-label">\${captures.length} card(s) visible</div>
            </div>
            <div class="cards">
              \${captures.map((item) => captureCard(item)).join('') || '<div class="overview-card"><div class="placeholder">No captures match the current filters.</div></div>'}
            </div>
          </section>
        \`;

        document.getElementById('viewport-filter').addEventListener('change', (event) => {
          render({ ...state, viewport: event.target.value });
        });
        document.getElementById('status-filter').addEventListener('change', (event) => {
          render({ ...state, status: event.target.value });
        });
      }

      render();
    </script>
  </body>
</html>`;
}

export async function buildReviewPages({ config, stageArg, language }) {
  const stages = selectStages(config, stageArg);
  const written = [];

  for (const stage of stages) {
    await ensureStageStructure(config, stage, language);
    const manifest = await buildStageManifest(config, stage, language);
    const stagePaths = getStagePaths(config, stage, language);
    const reviewData = buildReviewData(config, stage, manifest, stagePaths);
    await writeFile(stagePaths.reviewPath, renderReviewHtml(reviewData), 'utf8');
    written.push(stagePaths.reviewPath);
    console.log(`review ${stage.id}: ${stagePaths.reviewPath}`);
  }

  return written;
}
