import { csvOption, keyValueOption } from '../cli/parse-args.mjs';
import { loadConfig } from '../config/load-config.mjs';
import { generateReports } from '../lib/report/render-report.mjs';

export async function handleReport(options) {
  const config = await loadConfig(options.config);
  const language = options.language ?? config.report?.language ?? config.artifacts.reportLanguage ?? 'en';
  const written = await generateReports({
    config,
    stageArg: options.stage ?? 'all',
    screenIds: csvOption(options.screens),
    viewportIds: csvOption(options.viewports),
    profileId: options.profile ?? null,
    paramsFilter: keyValueOption(options.params),
    language,
  });
  console.log(`done: ${written.length} report(s)`);
}
