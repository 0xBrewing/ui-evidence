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

export function resolveProfile(config, profileId) {
  if (!profileId) {
    return null;
  }

  const profile = config.profiles?.[profileId];
  if (!profile) {
    throw new Error(
      `Unknown profile "${profileId}". Available profiles: ${Object.keys(config.profiles ?? {}).join(', ') || 'none'}`,
    );
  }
  return {
    id: profileId,
    ...profile,
  };
}

export function resolveScreenParams(screen) {
  return {
    ...(screen.locale && !screen.params?.locale ? { locale: screen.locale } : {}),
    ...(screen.params ?? {}),
    ...((screen.params?.locale || screen.locale)
      ? {}
      : screen.path.startsWith('/en')
        ? { locale: 'en' }
        : screen.path.startsWith('/ko')
          ? { locale: 'ko' }
          : {}),
  };
}

function matchesParams(screen, paramsFilter = {}) {
  const expectedEntries = Object.entries(paramsFilter ?? {});
  if (!expectedEntries.length) {
    return true;
  }

  const resolved = resolveScreenParams(screen);
  return expectedEntries.every(([key, expectedValue]) => String(resolved[key] ?? '') === String(expectedValue));
}

export function selectScreens(stage, requestedScreenIds = [], paramsFilter = {}) {
  const requestedScreens = requestedScreenIds.length
    ? requestedScreenIds.map((screenId) => {
    const screen = stage.screens.find((candidate) => candidate.id === screenId);
    if (!screen) {
      throw new Error(
        `Unknown screen "${screenId}" for stage "${stage.id}". Available screens: ${stage.screens
          .map((candidate) => candidate.id)
          .join(', ')}`,
      );
    }
    return screen;
    })
    : stage.screens;

  return requestedScreens.filter((screen) => matchesParams(screen, paramsFilter));
}

export function selectViewports(config, stage, requestedViewportIds = [], fallbackViewportIds = [], profileViewportIds = []) {
  const viewportMap = new Map(config.capture.viewports.map((viewport) => [viewport.id, viewport]));
  for (const viewportId of requestedViewportIds) {
    if (!viewportMap.has(viewportId)) {
      throw new Error(
        `Unknown viewport "${viewportId}". Available viewports: ${config.capture.viewports
          .map((item) => item.id)
          .join(', ')}`,
      );
    }
  }

  const baseViewportIds = profileViewportIds.length
    ? profileViewportIds
    : fallbackViewportIds.length
      ? fallbackViewportIds
      : (stage.defaultViewports?.length ? stage.defaultViewports : config.capture.viewports.map((item) => item.id));
  const viewportIds = requestedViewportIds.length
    ? (profileViewportIds.length
      ? requestedViewportIds.filter((viewportId) => profileViewportIds.includes(viewportId))
      : requestedViewportIds)
    : baseViewportIds;

  if (requestedViewportIds.length && profileViewportIds.length && viewportIds.length === 0) {
    throw new Error(`Requested viewports do not match profile-constrained viewports for stage "${stage.id}".`);
  }

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
  const params = resolveScreenParams(screen);
  if (params.locale) {
    return String(params.locale);
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
    profileId = null,
    paramsFilter = {},
  } = options;
  const profile = resolveProfile(config, profileId);
  const combinedParams = {
    ...(profile?.params ?? {}),
    ...(paramsFilter ?? {}),
  };

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
        screens: selectScreens(stage, target.screenIds ?? [], combinedParams),
        viewports: selectViewports(
          config,
          stage,
          viewportIds,
          scope.defaultViewports ?? [],
          profile?.viewportIds ?? [],
        ),
      };
    }).filter((selection) => selection.screens.length > 0);

    if (!selections.length) {
      throw new Error('No screens matched the selected scope and params/profile filters.');
    }

    return {
      mode: 'scope',
      scope,
      profile,
      selections,
    };
  }

  const stages = selectStages(config, stageArg);
  const selections = stages.map((stage) => ({
    stage,
    screens: selectScreens(stage, screenIds, combinedParams),
    viewports: selectViewports(config, stage, viewportIds, [], profile?.viewportIds ?? []),
  })).filter((selection) => selection.screens.length > 0);

  if (!selections.length) {
    throw new Error('No screens matched the selected stage/screen and params/profile filters.');
  }

  return {
    mode: 'direct',
    scope: null,
    profile,
    selections,
  };
}
