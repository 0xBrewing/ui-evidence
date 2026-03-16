import { loadConfig } from '../config/load-config.mjs';
import { buildComparisons } from '../lib/compare/build-comparisons.mjs';

export async function handleCompare(options) {
  const config = await loadConfig(options.config);
  const language = options.language ?? config.report?.language ?? config.artifacts.reportLanguage ?? 'en';
  const result = await buildComparisons({
    config,
    stageArg: options.stage ?? 'all',
    overviewViewport: options.overviewViewport,
    language,
  });
  console.log(
    `done: ${result.pairCount} pair comparison(s), ${result.overviewCount} overview(s)`,
  );
}
