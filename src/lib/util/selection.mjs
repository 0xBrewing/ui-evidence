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

export function getStageMap(config) {
  return new Map(config.stages.map((stage) => [stage.id, stage]));
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

export function selectViewports(config, stage, requestedViewportIds = [], fallbackViewportIds = []) {
  const viewportIds = requestedViewportIds.length
    ? requestedViewportIds
    : fallbackViewportIds.length
      ? fallbackViewportIds
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

export function resolveScope(config, scopeId) {
  const scopes = config.scopes ?? [];
  const scope = scopes.find((candidate) => candidate.id === scopeId);
  if (!scope) {
    throw new Error(
      `Unknown scope "${scopeId}". Available scopes: ${scopes.map((candidate) => candidate.id).join(', ') || 'none'}`,
    );
  }
  return scope;
}

function mergeScopeTargets(targets) {
  const grouped = [];
  const groupMap = new Map();

  for (const target of targets) {
    const existing = groupMap.get(target.stageId);
    if (!existing) {
      const next = {
        stageId: target.stageId,
        screenIds: target.screenIds?.length ? [...target.screenIds] : null,
      };
      groupMap.set(target.stageId, next);
      grouped.push(next);
      continue;
    }

    if (!existing.screenIds || !target.screenIds?.length) {
      existing.screenIds = null;
      continue;
    }

    for (const screenId of target.screenIds) {
      if (!existing.screenIds.includes(screenId)) {
        existing.screenIds.push(screenId);
      }
    }
  }

  return grouped;
}

export function resolveCapturePlan(config, options = {}) {
  const {
    stageArg = 'all',
    screenIds = [],
    viewportIds = [],
    scopeId = null,
  } = options;

  if (scopeId && ((!stageArg ? false : stageArg !== 'all') || screenIds.length)) {
    throw new Error('Cannot combine --scope with --stage or --screens.');
  }

  if (scopeId) {
    const scope = resolveScope(config, scopeId);
    const stageMap = getStageMap(config);
    const mergedTargets = mergeScopeTargets(scope.targets);
    const selections = mergedTargets.map((target) => {
      const stage = stageMap.get(target.stageId);
      if (!stage) {
        throw new Error(
          `Unknown stage "${target.stageId}" in scope "${scope.id}". Available stages: ${config.stages
            .map((candidate) => candidate.id)
            .join(', ')}`,
        );
      }

      return {
        stage,
        screens: selectScreens(stage, target.screenIds ?? []),
        viewports: selectViewports(config, stage, viewportIds, scope.defaultViewports ?? []),
      };
    });

    return {
      mode: 'scope',
      scope,
      selections,
    };
  }

  const stages = selectStages(config, stageArg);
  return {
    mode: 'direct',
    scope: null,
    selections: stages.map((stage) => ({
      stage,
      screens: selectScreens(stage, screenIds),
      viewports: selectViewports(config, stage, viewportIds),
    })),
  };
}
