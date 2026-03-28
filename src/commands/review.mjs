import { csvOption, keyValueOption } from '../cli/parse-args.mjs';
import { loadConfig } from '../config/load-config.mjs';
import { generateReports } from '../lib/report/render-report.mjs';
import { buildReviewPages } from '../lib/review/build-review.mjs';

export async function handleReview(options) {
  const config = await loadConfig(options.config);
  const language = options.language ?? config.report?.language ?? config.artifacts.reportLanguage ?? 'en';
  const reviewOptions = {
    config,
    stageArg: options.stage ?? 'all',
    screenIds: csvOption(options.screens),
    viewportIds: csvOption(options.viewports),
    profileId: options.profile ?? null,
    paramsFilter: keyValueOption(options.params),
    language,
  };
  await generateReports(reviewOptions);
  const written = await buildReviewPages(reviewOptions);
  console.log(`done: ${written.length} review page(s)`);
}
