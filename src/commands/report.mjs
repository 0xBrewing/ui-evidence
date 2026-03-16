import { loadConfig } from '../config/load-config.mjs';
import { generateReports } from '../lib/report/render-report.mjs';

export async function handleReport(options) {
  const config = await loadConfig(options.config);
  const language = options.language ?? config.report?.language ?? config.artifacts.reportLanguage ?? 'en';
  const written = await generateReports({
    config,
    stageArg: options.stage ?? 'all',
    language,
  });
  console.log(`done: ${written.length} report(s)`);
}
