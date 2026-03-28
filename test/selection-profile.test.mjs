import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCapturePlan } from '../src/lib/util/selection.mjs';

function buildConfig() {
  return {
    capture: {
      viewports: [
        { id: 'mobile-390' },
        { id: 'desktop-1440' },
      ],
    },
    profiles: {
      'mobile-en': {
        viewportIds: ['mobile-390'],
        params: {
          locale: 'en',
        },
      },
    },
    stages: [
      {
        id: 'landing',
        title: 'Landing',
        description: 'Landing',
        defaultViewports: ['desktop-1440'],
        screens: [
          {
            id: 'hero-ko',
            label: 'Hero KO',
            path: '/ko',
            params: {
              locale: 'ko',
              variant: 'core',
            },
          },
          {
            id: 'hero-en',
            label: 'Hero EN',
            path: '/en',
            params: {
              locale: 'en',
              variant: 'core',
            },
          },
        ],
      },
    ],
  };
}

test('resolveCapturePlan narrows screens and viewports through profile params', () => {
  const plan = resolveCapturePlan(buildConfig(), {
    stageArg: 'landing',
    profileId: 'mobile-en',
  });

  assert.equal(plan.profile.id, 'mobile-en');
  assert.deepEqual(plan.selections[0].screens.map((screen) => screen.id), ['hero-en']);
  assert.deepEqual(plan.selections[0].viewports.map((viewport) => viewport.id), ['mobile-390']);
});

test('resolveCapturePlan applies explicit params as an AND filter', () => {
  const plan = resolveCapturePlan(buildConfig(), {
    stageArg: 'landing',
    paramsFilter: {
      locale: 'en',
      variant: 'core',
    },
  });

  assert.deepEqual(plan.selections[0].screens.map((screen) => screen.id), ['hero-en']);
});
