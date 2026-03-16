import { loadConfig } from '../config/load-config.mjs';
import { buildReviewPages } from '../lib/review/build-review.mjs';

export async function handleReview(options) {
  const config = await loadConfig(options.config);
  const language = options.language ?? config.report?.language ?? config.artifacts.reportLanguage ?? 'en';
  const written = await buildReviewPages({
    config,
    stageArg: options.stage ?? 'all',
    language,
  });
  console.log(`done: ${written.length} review page(s)`);
}
