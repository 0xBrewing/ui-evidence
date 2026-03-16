export function selectStages(config, stageArg) {
  if (!stageArg || stageArg === 'all') {
    return config.stages;
  }

  const requested = String(stageArg)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const stageMap = new Map(config.stages.map((stage) => [stage.id, stage]));
  return requested.map((stageId) => {
    const stage = stageMap.get(stageId);
    if (!stage) {
      throw new Error(
        `Unknown stage "${stageId}". Available stages: ${config.stages.map((item) => item.id).join(', ')}`,
      );
    }
    return stage;
  });
}

export function selectScreens(stage, requestedScreenIds = []) {
  if (!requestedScreenIds.length) {
    return stage.screens;
  }

  return requestedScreenIds.map((screenId) => {
    const screen = stage.screens.find((candidate) => candidate.id === screenId);
    if (!screen) {
      throw new Error(
        `Unknown screen "${screenId}" for stage "${stage.id}". Available screens: ${stage.screens
          .map((candidate) => candidate.id)
          .join(', ')}`,
      );
    }
    return screen;
  });
}

export function selectViewports(config, stage, requestedViewportIds = []) {
  const viewportIds = requestedViewportIds.length
    ? requestedViewportIds
    : (stage.defaultViewports?.length ? stage.defaultViewports : config.capture.viewports.map((item) => item.id));
  const viewportMap = new Map(config.capture.viewports.map((viewport) => [viewport.id, viewport]));

  return viewportIds.map((viewportId) => {
    const viewport = viewportMap.get(viewportId);
    if (!viewport) {
      throw new Error(
        `Unknown viewport "${viewportId}". Available viewports: ${config.capture.viewports
          .map((item) => item.id)
          .join(', ')}`,
      );
    }
    return viewport;
  });
}

export function resolveBaseUrl(config, phase, override) {
  const baseUrl = override ?? config.servers?.[phase]?.baseUrl ?? config.capture.baseUrl;
  if (!baseUrl) {
    throw new Error(`No base URL configured for phase "${phase}".`);
  }
  return baseUrl;
}

export function inferLocale(screen) {
  if (screen.locale) {
    return screen.locale;
  }
  if (screen.path.startsWith('/en')) {
    return 'en';
  }
  if (screen.path.startsWith('/ko')) {
    return 'ko';
  }
  return 'default';
}

export function resolveOverviewViewport(config, explicitViewport) {
  return explicitViewport ?? config.artifacts.overviewViewport ?? config.capture.viewports[0]?.id;
}
