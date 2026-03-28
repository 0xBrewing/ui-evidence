function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function renderParams(paramsFilter = {}) {
  const entries = Object.entries(paramsFilter);
  if (!entries.length) {
    return null;
  }
  return entries.map(([key, value]) => `${key}=${value}`).join(',');
}

export function formatFailureList(failures = []) {
  return unique(failures.map((item) => `${item.stageId}/${item.screenId} (${item.viewportId})`));
}

export function buildRerunCommand({
  command,
  configPath,
  stages = [],
  screens = [],
  viewports = [],
  profileId = null,
  paramsFilter = {},
  resume = false,
}) {
  const parts = ['ui-evidence', command];
  if (configPath) {
    parts.push('--config', configPath);
  }
  if (stages.length) {
    parts.push('--stage', stages.join(','));
  }
  if (screens.length && stages.length <= 1) {
    parts.push('--screens', screens.join(','));
  }
  if (viewports.length) {
    parts.push('--viewports', viewports.join(','));
  }
  if (profileId) {
    parts.push('--profile', profileId);
  }
  const paramsText = renderParams(paramsFilter);
  if (paramsText) {
    parts.push('--params', paramsText);
  }
  if (resume) {
    parts.push('--resume');
  }
  return parts.join(' ');
}

export function summarizeFailures({
  command,
  configPath,
  failures = [],
  profileId = null,
  paramsFilter = {},
  resume = true,
}) {
  const items = formatFailureList(failures);
  if (!items.length) {
    return null;
  }
  const stages = unique(failures.map((item) => item.stageId));
  const screens = unique(failures.map((item) => item.screenId));
  const viewports = unique(failures.map((item) => item.viewportId));
  return {
    failed: items,
    rerun: buildRerunCommand({
      command,
      configPath,
      stages,
      screens,
      viewports,
      profileId,
      paramsFilter,
      resume,
    }),
  };
}
