import { discoverProject, formatDiscoveredProject, formatSuggestedConfig } from '../lib/discover/discover-project.mjs';

export async function handleDiscover(options) {
  const result = await discoverProject({
    cwd: options.cwd,
  });

  if (options.configOnly) {
    process.stdout.write(`${formatSuggestedConfig(result.suggestedConfig, options.format ?? 'yaml')}\n`);
    return;
  }

  process.stdout.write(`${formatDiscoveredProject(result, options.format ?? 'json')}\n`);
}
