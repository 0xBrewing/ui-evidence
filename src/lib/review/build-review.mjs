import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { buildStageManifest, ensureStageStructure, getStagePaths } from '../util/stage-notes.mjs';
import { resolveCapturePlan } from '../util/selection.mjs';
import { fileExists, toPosixPath } from '../util/fs.mjs';

function relativeFromReview(stagePaths, projectRoot, targetPath) {
  const absoluteTarget = path.join(projectRoot, targetPath);
  return toPosixPath(path.relative(stagePaths.reviewDir, absoluteTarget));
}

function pickDiagnostic(item) {
  const afterFailure = item.execution?.after?.status === 'failed' ? item.execution.after.failure : null;
  if (afterFailure) {
    return { phase: 'after', ...afterFailure };
  }

  const beforeFailure = item.execution?.before?.status === 'failed' ? item.execution.before.failure : null;
  if (beforeFailure) {
    return { phase: 'before', ...beforeFailure };
  }

  return null;
}

function buildIssueItems(captures) {
  return captures.flatMap((item) => {
    const diagnostic = pickDiagnostic(item);
    if (diagnostic) {
      return [{
        kind: 'failure',
        label: item.label,
        viewportId: item.viewportId,
        message: `${diagnostic.phase} · ${diagnostic.step ?? 'capture'} · ${diagnostic.message ?? 'Unknown failure'}`,
      }];
    }

    if (item.status === 'missing-before' || item.status === 'missing-after' || item.status === 'missing-both' || item.status === 'missing-current') {
      return [{
        kind: 'missing',
        label: item.label,
        viewportId: item.viewportId,
        message: item.status.replaceAll('-', ' '),
      }];
    }

    return [];
  });
}

function buildReviewData(config, manifest, stagePaths, availableLinks = {}) {
  const captures = manifest.captures.map((item) => {
    const beforeLink = item.before ? relativeFromReview(stagePaths, config.meta.projectRoot, item.before) : null;
    const afterLink = item.after ? relativeFromReview(stagePaths, config.meta.projectRoot, item.after) : null;
    const pairLink = item.pair ? relativeFromReview(stagePaths, config.meta.projectRoot, item.pair) : null;
    const currentLink = item.current ? relativeFromReview(stagePaths, config.meta.projectRoot, item.current) : null;

    return {
      ...item,
      diagnostic: pickDiagnostic(item),
      beforeLink,
      afterLink,
      pairLink,
      currentLink,
      previewLink: pairLink ?? currentLink,
    };
  });

  return {
    generatedAt: manifest.generatedAt,
    stage: manifest.stage,
    counts: manifest.counts,
    bundle: manifest.bundle ?? { selfContained: false, origin: 'local-stage' },
    snapshot: manifest.snapshot,
    links: {
      notes: availableLinks.notes === false ? null : relativeFromReview(stagePaths, config.meta.projectRoot, manifest.artifacts.notes),
      report: availableLinks.report === false ? null : relativeFromReview(stagePaths, config.meta.projectRoot, manifest.artifacts.report),
      manifest: availableLinks.manifest === false ? null : toPosixPath(path.relative(stagePaths.reviewDir, stagePaths.manifestPath)),
    },
    captures,
    issues: buildIssueItems(captures),
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

      .header,
      .meta-row,
      .link-row,
      .toolbar,
      .filter-group,
      .asset-links {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        align-items: center;
      }

      .header {
        display: grid;
        gap: 16px;
      }

      .kicker,
      .meta-pill,
      .summary-pill,
      .status-pill,
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

      .summary-pill strong,
      .status-pill strong {
        color: var(--ink);
      }

      .summary-pill[data-tone="danger"],
      .status-pill[data-status="missing-both"] {
        color: var(--danger);
        background: rgba(139, 47, 47, 0.08);
      }

      .summary-pill[data-tone="ok"],
      .status-pill[data-status="complete"] {
        color: var(--ok);
      }

      .status-pill[data-status="current-only"] {
        color: var(--accent);
      }

      .status-pill[data-status="missing-before"],
      .status-pill[data-status="missing-after"],
      .status-pill[data-status="missing-current"] {
        color: var(--warn);
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

      .issue-card[data-kind="missing"] {
        border-color: rgba(159, 90, 38, 0.16);
        background: rgba(159, 90, 38, 0.07);
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
      .capture-subtitle,
      .diagnostic {
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

      const statusLabels = {
        complete: 'Complete',
        'current-only': 'Current Only',
        'missing-before': 'Missing Before',
        'missing-after': 'Missing After',
        'missing-both': 'Missing Both',
        'missing-current': 'Missing Current'
      };

      function escapeHtml(value) {
        return String(value)
          .replaceAll('&', '&amp;')
          .replaceAll('<', '&lt;')
          .replaceAll('>', '&gt;')
          .replaceAll('"', '&quot;')
          .replaceAll("'", '&#39;');
      }

      function anchorId(item) {
        return ['capture', item.screenId, item.viewportId]
          .join('-')
          .replace(/[^a-zA-Z0-9_-]+/g, '-');
      }

      function quickCard(item) {
        return '<a class="quick-card" href="#' + anchorId(item) + '">'
          + '<img loading="lazy" src="' + item.previewLink + '" alt="' + escapeHtml(item.label) + ' review image" />'
          + '<div><strong>' + escapeHtml(item.label) + '</strong><div class="quick-caption">'
          + escapeHtml(item.viewportId) + ' · ' + escapeHtml(item.locale) + ' · ' + escapeHtml(statusLabels[item.status] ?? item.status)
          + '</div></div>'
          + '</a>';
      }

      function captureCard(item) {
        const preview = item.previewLink
          ? '<img loading="lazy" src="' + item.previewLink + '" alt="' + escapeHtml(item.label) + ' review image" />'
          : '<div class="placeholder">No reviewable image is available for this card yet.</div>';
        const diagnostic = item.diagnostic
          ? '<div class="diagnostic"><strong>' + escapeHtml(item.diagnostic.phase) + '</strong> · '
            + escapeHtml(item.diagnostic.step ?? 'capture') + ' · '
            + escapeHtml(item.diagnostic.message ?? 'Unknown failure') + '</div>'
          : '';
        const assetLinks = [
          item.beforeLink ? '<a href="' + item.beforeLink + '">before</a>' : '',
          item.afterLink ? '<a href="' + item.afterLink + '">after</a>' : '',
          item.pairLink ? '<a href="' + item.pairLink + '">pair</a>' : '',
          item.currentLink ? '<a href="' + item.currentLink + '">current</a>' : '',
        ].filter(Boolean).join('');

        return '<article class="capture-card" id="' + anchorId(item) + '">'
          + '<div class="capture-title">' + escapeHtml(item.label) + '</div>'
          + '<div class="capture-subtitle">' + escapeHtml(item.viewportId) + ' · ' + escapeHtml(item.locale) + '</div>'
          + '<div class="status-pill" data-status="' + item.status + '"><strong>' + escapeHtml(statusLabels[item.status] ?? item.status) + '</strong></div>'
          + preview
          + diagnostic
          + (assetLinks ? '<div class="asset-links">' + assetLinks + '</div>' : '')
          + '</article>';
      }

      function render(state = {}) {
        const viewport = state.viewport ?? 'all';
        const status = state.status ?? 'all';
        const captures = reviewData.captures.filter((item) => {
          if (viewport !== 'all' && item.viewportId !== viewport) return false;
          if (status !== 'all' && item.status !== status) return false;
          return true;
        });
        const quickLook = captures.filter((item) => item.previewLink);
        const viewportOptions = ['all', ...new Set(reviewData.captures.map((item) => item.viewportId))];
        const statusOptions = ['all', ...new Set(reviewData.captures.map((item) => item.status))];
        const missingCount = reviewData.counts.expectedCaptures - reviewData.counts.reviewableCaptures;
        const bundleLabel = reviewData.bundle.origin === 'materialized-snapshot'
          ? 'Materialized snapshot bundle'
          : 'Local stage bundle';

        app.innerHTML = ''
          + '<section class="panel header">'
          + '  <div class="meta-row"><span class="kicker">Review Bundle</span><span class="meta-pill">' + escapeHtml(bundleLabel) + '</span>'
          + (reviewData.snapshot?.runId ? '<span class="meta-pill">snapshot ' + escapeHtml(reviewData.snapshot.runId) + '</span>' : '')
          + '</div>'
          + '  <div><h1>' + escapeHtml(reviewData.stage.title) + '</h1><p>' + escapeHtml(reviewData.stage.description) + '</p></div>'
          + '  <div class="meta-row">'
          + '    <span class="summary-pill" data-tone="ok"><strong>' + reviewData.counts.reviewableCaptures + '/' + reviewData.counts.expectedCaptures + '</strong> reviewable</span>'
          + '    <span class="summary-pill" data-tone="' + (reviewData.counts.failedCaptures ? 'danger' : 'ok') + '"><strong>' + reviewData.counts.failedCaptures + '</strong> failed</span>'
          + '    <span class="summary-pill" data-tone="' + (missingCount ? 'danger' : 'ok') + '"><strong>' + missingCount + '</strong> missing</span>'
          + '    <span class="summary-pill"><strong>' + new Date(reviewData.generatedAt).toLocaleString() + '</strong> generated</span>'
          + '  </div>'
          + '  <div class="link-row">'
          + (reviewData.links.notes ? '<a href="' + reviewData.links.notes + '">notes</a>' : '')
          + (reviewData.links.report ? '<a href="' + reviewData.links.report + '">report</a>' : '')
          + (reviewData.links.manifest ? '<a href="' + reviewData.links.manifest + '">manifest</a>' : '')
          + '</div>'
          + '</section>';

        if (reviewData.issues.length) {
          app.innerHTML += '<section class="panel"><h2>Review First</h2><p>Start with failed or missing captures before scanning the rest.</p><div class="issue-list">'
            + reviewData.issues.map((item) => '<article class="issue-card" data-kind="' + item.kind + '"><strong>' + escapeHtml(item.label)
            + '</strong><div class="quick-caption">' + escapeHtml(item.viewportId) + '</div><p>' + escapeHtml(item.message) + '</p></article>').join('')
            + '</div></section>';
        }

        app.innerHTML += '<section class="panel">'
          + '<div class="toolbar"><div><h2>Quick Scan</h2><p>Share this stage folder as-is. The review stays portable without a local server.</p></div>'
          + ((viewportOptions.length > 2 || statusOptions.length > 2)
            ? '<div class="filter-group">'
              + (viewportOptions.length > 2 ? '<label class="filter-pill">viewport <select id="viewport-filter">' + viewportOptions.map((option) => '<option value="' + option + '"' + (option === viewport ? ' selected' : '') + '>' + option + '</option>').join('') + '</select></label>' : '')
              + (statusOptions.length > 2 ? '<label class="filter-pill">status <select id="status-filter">' + statusOptions.map((option) => '<option value="' + option + '"' + (option === status ? ' selected' : '') + '>' + escapeHtml(statusLabels[option] ?? option) + '</option>').join('') + '</select></label>' : '')
              + '</div>'
            : '')
          + '</div>'
          + '<div class="quick-grid">'
          + (quickLook.length ? quickLook.map((item) => quickCard(item)).join('') : '<div class="placeholder">No reviewable captures match the current filters.</div>')
          + '</div></section>';

        app.innerHTML += '<section class="panel"><div class="toolbar"><div><h2>Detail Cards</h2><p>Open the original image only when the quick scan raises a question.</p></div><div class="quick-caption">' + captures.length + ' visible</div></div>'
          + '<div class="cards">'
          + (captures.length ? captures.map((item) => captureCard(item)).join('') : '<div class="placeholder">No captures match the current filters.</div>')
          + '</div></section>';

        const viewportFilter = document.getElementById('viewport-filter');
        if (viewportFilter) {
          viewportFilter.addEventListener('change', (event) => {
            render({ ...state, viewport: event.target.value });
          });
        }

        const statusFilter = document.getElementById('status-filter');
        if (statusFilter) {
          statusFilter.addEventListener('change', (event) => {
            render({ ...state, status: event.target.value });
          });
        }
      }

      render();
    </script>
  </body>
</html>`;
}

function hasRenderableArtifacts(manifest) {
  return manifest.counts.before > 0
    || manifest.counts.after > 0
    || manifest.counts.pairs > 0
    || (manifest.counts.currentCaptures ?? 0) > 0
    || manifest.counts.failedCaptures > 0;
}

export async function buildReviewPages({ config, stageArg, screenIds = [], viewportIds = [], profileId = null, paramsFilter = {}, language }) {
  const plan = resolveCapturePlan(config, {
    stageArg,
    screenIds,
    viewportIds,
    profileId,
    paramsFilter,
  });
  const written = [];

  for (const selection of plan.selections) {
    const { stage, screens, viewports } = selection;
    await ensureStageStructure(config, stage, language);
    const manifest = await buildStageManifest(config, stage, language, { screens, viewports });
    if (!hasRenderableArtifacts(manifest)) {
      throw new Error(
        `No reviewable artifacts found for stage "${stage.id}". Run "ui-evidence run --stage ${stage.id}" or "ui-evidence snapshot --stage ${stage.id}" first.`,
      );
    }
    const stagePaths = getStagePaths(config, stage, language);
    const reviewData = buildReviewData(config, manifest, stagePaths, {
      notes: await fileExists(stagePaths.notesPath),
      report: await fileExists(stagePaths.reportPath),
      manifest: await fileExists(stagePaths.manifestPath),
    });
    await writeFile(stagePaths.reviewPath, renderReviewHtml(reviewData), 'utf8');
    written.push(stagePaths.reviewPath);
    console.log(`review ${stage.id}: ${stagePaths.reviewPath}`);
  }

  return written;
}
