import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { stringify as stringifyYaml } from 'yaml';
import { fileExists, walkFiles, toPosixPath } from '../util/fs.mjs';
import { runCommandSync } from '../util/process.mjs';

const CODE_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.html'];
const ROUTE_FILE_PATTERNS = new Set(['page', 'index']);
const DEFAULT_VIEWPORTS = [
  {
    id: 'mobile-390',
    device: 'iPhone 13',
    viewport: {
      width: 390,
      height: 844,
    },
    locale: 'en-US',
    timezoneId: 'UTC',
  },
  {
    id: 'desktop-1440',
    viewport: {
      width: 1440,
      height: 1024,
    },
    locale: 'en-US',
    timezoneId: 'UTC',
  },
];

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function parsePackageManager(packageManagerField, cwd) {
  if (packageManagerField?.startsWith('pnpm')) {
    return 'pnpm';
  }
  if (packageManagerField?.startsWith('yarn')) {
    return 'yarn';
  }
  if (packageManagerField?.startsWith('bun')) {
    return 'bun';
  }
  if (packageManagerField?.startsWith('npm')) {
    return 'npm';
  }
  if (existsSync(path.join(cwd, 'pnpm-lock.yaml'))) {
    return 'pnpm';
  }
  if (existsSync(path.join(cwd, 'yarn.lock'))) {
    return 'yarn';
  }
  if (existsSync(path.join(cwd, 'bun.lockb')) || existsSync(path.join(cwd, 'bun.lock'))) {
    return 'bun';
  }
  return 'npm';
}

function sanitizeId(value, fallback) {
  return String(value || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || fallback;
}

function titleCase(value) {
  return String(value)
    .split(/[-_/ ]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function inferFrameworks(packageJson) {
  const allDeps = {
    ...(packageJson.dependencies ?? {}),
    ...(packageJson.devDependencies ?? {}),
  };

  return {
    next: Boolean(allDeps.next),
    react: Boolean(allDeps.react),
    vite: Boolean(allDeps.vite),
    storybook: Object.keys(allDeps).some((key) => key.startsWith('@storybook/')),
    playwright: Boolean(allDeps.playwright || allDeps['@playwright/test']),
  };
}

function inferPreset(frameworks) {
  if (frameworks.storybook) {
    return 'storybook';
  }
  if (frameworks.next && frameworks.playwright) {
    return 'next-playwright';
  }
  if (frameworks.vite && frameworks.react) {
    return 'vite-react';
  }
  return 'generic-web';
}

function inferPort(script, preset) {
  if (!script) {
    if (preset === 'storybook') {
      return 6006;
    }
    if (preset === 'vite-react') {
      return 5173;
    }
    return 3000;
  }

  const portMatch = script.match(/(?:--port|-p|PORT=)\s*=?\s*(\d{3,5})/i);
  if (portMatch) {
    return Number(portMatch[1]);
  }
  if (script.includes('storybook')) {
    return 6006;
  }
  if (script.includes('vite')) {
    return 5173;
  }
  return 3000;
}

function buildScriptCommand(packageManager, scriptName) {
  if (!scriptName) {
    return null;
  }
  if (packageManager === 'yarn') {
    return `yarn ${scriptName}`;
  }
  if (packageManager === 'pnpm') {
    return `pnpm ${scriptName}`;
  }
  if (packageManager === 'bun') {
    return `bun run ${scriptName}`;
  }
  return `npm run ${scriptName}`;
}

function pickServerScript(packageJson, preset) {
  const scripts = packageJson.scripts ?? {};
  if (preset === 'storybook' && scripts.storybook) {
    return 'storybook';
  }
  return ['dev', 'start', 'preview', 'storybook'].find((scriptName) => scripts[scriptName]);
}

function inferBaseUrl(port) {
  return `http://127.0.0.1:${port}`;
}

function inferInstallCommand(cwd, packageManager) {
  if (packageManager === 'pnpm') {
    return 'pnpm install --frozen-lockfile';
  }
  if (packageManager === 'yarn') {
    return 'yarn install --frozen-lockfile';
  }
  if (packageManager === 'bun') {
    return 'bun install --frozen-lockfile';
  }
  return existsSync(path.join(cwd, 'package-lock.json')) ? 'npm ci' : 'npm install';
}

function toRouteFromFile(rootDir, filePath) {
  const relativePath = toPosixPath(path.relative(rootDir, filePath));
  const parts = relativePath.split('/');
  const fileName = parts.at(-1) ?? '';
  const parsed = path.parse(fileName);
  if (!ROUTE_FILE_PATTERNS.has(parsed.name)) {
    return null;
  }
  if (relativePath.startsWith('pages/api/')) {
    return null;
  }

  const routeParts = parts.slice(0, -1);
  if (routeParts[0] === 'src') {
    routeParts.shift();
  }
  if (routeParts[0] === 'app' || routeParts[0] === 'pages') {
    routeParts.shift();
  }

  const filtered = routeParts
    .filter((part) => !part.startsWith('('))
    .map((part) => part.replace(/\[[^\]]+\]/g, 'example'))
    .filter((part) => part !== 'api');

  const route = `/${filtered.join('/')}`.replace(/\/+/g, '/');
  return route === '/' ? '/' : route.replace(/\/index$/, '').replace(/\/$/, '') || '/';
}

async function findPackageJson(cwd) {
  const packagePath = path.join(cwd, 'package.json');
  if (!(await fileExists(packagePath))) {
    return { packagePath, packageJson: {} };
  }
  return {
    packagePath,
    packageJson: JSON.parse(await readFile(packagePath, 'utf8')),
  };
}

async function findRouteCandidates(cwd) {
  const routeFiles = await walkFiles(cwd, {
    extensions: ['.js', '.jsx', '.ts', '.tsx'],
    maxResults: 120,
  });
  return unique(routeFiles.map((filePath) => toRouteFromFile(cwd, filePath))).slice(0, 12);
}

async function findTestIds(cwd) {
  const codeFiles = await walkFiles(cwd, {
    extensions: CODE_EXTENSIONS,
    maxResults: 160,
  });
  const testIds = [];
  const regexes = [
    /data-testid\s*=\s*["'`]([^"'`]+)["'`]/g,
    /getByTestId\(\s*["'`]([^"'`]+)["'`]\s*\)/g,
  ];

  for (const filePath of codeFiles) {
    const source = await readFile(filePath, 'utf8').catch(() => '');
    for (const regex of regexes) {
      let match = regex.exec(source);
      while (match) {
        testIds.push(match[1]);
        if (testIds.length >= 40) {
          return unique(testIds);
        }
        match = regex.exec(source);
      }
    }
  }

  return unique(testIds);
}

async function findAuthStates(cwd) {
  const files = await walkFiles(cwd, {
    extensions: ['.json'],
    includeHidden: true,
    maxResults: 60,
  });

  return files
    .filter((filePath) => filePath.includes(`${path.sep}.auth${path.sep}`) || filePath.includes('storage-state'))
    .map((filePath) => toPosixPath(path.relative(cwd, filePath)));
}

async function findScreenshotDirs(cwd) {
  const candidates = ['screenshots', 'artifacts', 'visual', 'snapshots'];
  const directories = [];
  for (const candidate of candidates) {
    const fullPath = path.join(cwd, candidate);
    if (await fileExists(fullPath)) {
      directories.push(candidate);
    }
  }
  return directories;
}

function detectGitBaselineRef(cwd) {
  for (const ref of ['main', 'master']) {
    const result = runCommandSync('git', ['rev-parse', '--verify', ref], { cwd });
    if (result.status === 0) {
      return ref;
    }
  }
  return null;
}

function buildScreenSuggestion(routeCandidates, testIds, preset) {
  const route = routeCandidates[0] ?? '/';
  const routeLabel = route === '/' ? 'home' : route.split('/').filter(Boolean).join('-');
  const waitFor =
    testIds[0]
      ? { testId: testIds[0] }
      : preset === 'storybook'
        ? { selector: '#storybook-root' }
        : { selector: 'body' };

  return {
    id: sanitizeId(routeLabel, 'primary-screen'),
    fileId: sanitizeId(routeLabel, 'primary-screen'),
    label: titleCase(routeLabel || 'Primary Screen'),
    path: route,
    waitFor,
  };
}

function buildSuggestedConfig({ cwd, packageJson, packageManager, preset, serverScript, baseUrl, baselineRef, routeCandidates, testIds }) {
  const screen = buildScreenSuggestion(routeCandidates, testIds, preset);
  const stageId = preset === 'storybook' ? 'storybook-review' : 'primary-flow';
  const stageTitle = preset === 'storybook' ? 'Storybook Review' : 'Primary Flow';

  const config = {
    version: 1,
    project: {
      name: packageJson.name ?? path.basename(cwd),
      rootDir: '.',
    },
    artifacts: {
      rootDir: 'screenshots/ui-evidence',
      notesLanguage: 'en',
      reportLanguage: 'en',
      overviewViewport: 'mobile-390',
    },
    capture: {
      baseUrl,
      browser: {
        headless: true,
        freezeAnimations: true,
        waitForFonts: true,
        waitForNetworkIdleMs: 2000,
      },
      viewports: DEFAULT_VIEWPORTS,
    },
    servers: {
      after: {
        baseUrl,
      },
    },
    report: {
      language: 'en',
      checklist: ['layout', 'spacing', 'alignment', 'copy regression'],
    },
    stages: [
      {
        id: stageId,
        title: stageTitle,
        description: 'Stable UI surface for before/after review.',
        defaultViewports: ['mobile-390', 'desktop-1440'],
        screens: [screen],
      },
    ],
  };

  if (serverScript) {
    config.servers.after.command = buildScriptCommand(packageManager, serverScript);
  }

  if (baselineRef) {
    config.baseline = {
      git: {
        ref: baselineRef,
        worktreeDir: `tmp/ui-evidence/${sanitizeId(baselineRef, 'baseline')}`,
        ...(serverScript
          ? {
              installCommand: inferInstallCommand(cwd, packageManager),
              server: {
                command: buildScriptCommand(packageManager, serverScript),
                baseUrl,
                readyUrl: baseUrl,
                timeoutMs: 90_000,
              },
            }
          : {}),
      },
    };
  }

  return config;
}

function buildUnresolved({ routeCandidates, testIds, serverScript, baselineRef }) {
  const unresolved = [];

  if (!serverScript) {
    unresolved.push({
      key: 'after-server-command',
      message: 'No obvious dev/start command was found. Confirm how the app should be started for after captures.',
      defaultValue: null,
    });
  }

  if (!routeCandidates.length) {
    unresolved.push({
      key: 'screen-path',
      message: 'No obvious route file was found. Confirm which path should be captured first.',
      defaultValue: '/',
    });
  }

  if (!testIds.length) {
    unresolved.push({
      key: 'wait-target',
      message: 'No stable test id was detected. Replace the default body selector with a stable wait target before capturing.',
      defaultValue: 'body',
    });
  }

  if (!baselineRef) {
    unresolved.push({
      key: 'baseline-ref',
      message: 'No main/master branch was detected. Set baseline.git.ref manually if you want branch-based before captures.',
      defaultValue: null,
    });
  }

  return unresolved;
}

function outputAsFormat(result, format) {
  if (format === 'yaml') {
    return stringifyYaml(result);
  }
  return JSON.stringify(result, null, 2);
}

export async function discoverProject(options = {}) {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const { packageJson } = await findPackageJson(cwd);
  const frameworks = inferFrameworks(packageJson);
  const preset = inferPreset(frameworks);
  const packageManager = parsePackageManager(packageJson.packageManager, cwd);
  const serverScript = pickServerScript(packageJson, preset);
  const port = inferPort(packageJson.scripts?.[serverScript], preset);
  const baseUrl = inferBaseUrl(port);

  const [routeCandidates, testIds, authStates, screenshotDirs] = await Promise.all([
    findRouteCandidates(cwd),
    findTestIds(cwd),
    findAuthStates(cwd),
    findScreenshotDirs(cwd),
  ]);

  const baselineRef = detectGitBaselineRef(cwd);
  const suggestedConfig = buildSuggestedConfig({
    cwd,
    packageJson,
    packageManager,
    preset,
    serverScript,
    baseUrl,
    baselineRef,
    routeCandidates,
    testIds,
  });

  return {
    version: 1,
    cwd,
    preset,
    packageManager,
    frameworks,
    existingConfig: (await fileExists(path.join(cwd, 'ui-evidence.config.yaml'))) ? 'ui-evidence.config.yaml' : null,
    detected: {
      scripts: packageJson.scripts ?? {},
      routeCandidates,
      testIds,
      authStates,
      screenshotDirs,
      baselineRef,
    },
    unresolved: buildUnresolved({
      routeCandidates,
      testIds,
      serverScript,
      baselineRef,
    }),
    suggestedConfig,
  };
}

export function formatDiscoveredProject(result, format = 'json') {
  return outputAsFormat(result, format);
}

export function formatSuggestedConfig(config, format = 'yaml') {
  return format === 'json' ? JSON.stringify(config, null, 2) : stringifyYaml(config);
}
