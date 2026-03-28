import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { directoryExists, fileExists, toPosixPath } from '../util/fs.mjs';
import { runCommandSync } from '../util/process.mjs';
import {
  DEFAULT_ARTIFACTS_ROOT,
  buildDefaultBaselineWorktreeDir,
  DEFAULT_CONFIG_PATH,
  buildCanonicalSuggestedConfig,
  detectExistingConfigPath,
  detectLegacyLayout,
  detectLegacyRuntimeLayout,
  formatLegacyLayoutWarning,
  formatLegacyRuntimeLayoutWarning,
} from '../layout/default-layout.mjs';

const CODE_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.html'];
const CONFIG_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.mts', '.cts'];
const ROUTE_FILE_PATTERNS = new Set(['page', 'index']);
const SERVER_SCRIPT_KINDS = ['dev', 'start', 'preview', 'storybook'];
const WALK_SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage', 'tmp', 'artifacts', 'screenshots', 'ui-evidence']);
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

function uniqueBy(values, getKey) {
  const seen = new Set();
  return values.filter((value) => {
    const key = getKey(value);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function tokenize(value) {
  return String(value)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((part) => part.length >= 2);
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

function inferPort(text, preset) {
  if (!text) {
    if (preset === 'storybook') {
      return 6006;
    }
    if (preset === 'vite-react') {
      return 5173;
    }
    return 3000;
  }

  const portMatch = text.match(/(?:--port|-p|PORT=)\s*=?\s*(\d{3,5})/i);
  if (portMatch) {
    return Number(portMatch[1]);
  }
  if (text.includes('storybook')) {
    return 6006;
  }
  if (text.includes('vite')) {
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

function isInside(parentDir, childDir) {
  const relative = path.relative(parentDir, childDir);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function normalizeWorkspacePattern(pattern) {
  return String(pattern).replace(/\\/g, '/').replace(/\/+$/, '');
}

function globSegmentToRegex(segment) {
  const escaped = segment
    .replace(/[|\\{}()[\]^$+?.]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/!/g, '\\!');
  return new RegExp(`^${escaped}$`);
}

async function walkCandidateFiles(rootDir, options = {}) {
  const {
    extensions = null,
    includeHidden = false,
    maxResults = 500,
    excludeRoots = [],
  } = options;

  const matches = [];

  async function visit(currentDir) {
    if (matches.length >= maxResults) {
      return;
    }

    const entries = await readdir(currentDir, { withFileTypes: true }).catch(() => []);
    entries.sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      if (matches.length >= maxResults) {
        return;
      }

      if (!includeHidden && entry.name.startsWith('.') && entry.name !== '.auth') {
        continue;
      }

      const entryPath = path.join(currentDir, entry.name);
      if (excludeRoots.some((excludedRoot) => entryPath === excludedRoot || isInside(entryPath, excludedRoot))) {
        continue;
      }

      if (entry.isDirectory()) {
        if (WALK_SKIP_DIRS.has(entry.name)) {
          continue;
        }
        await visit(entryPath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      if (extensions?.length && !extensions.includes(path.extname(entry.name).toLowerCase())) {
        continue;
      }

      matches.push(entryPath);
    }
  }

  await visit(rootDir);
  return matches;
}

async function readWorkspacePatterns(cwd, rootPackageJson) {
  const patterns = [];
  const workspaces = rootPackageJson.workspaces;
  if (Array.isArray(workspaces)) {
    patterns.push(...workspaces);
  } else if (workspaces?.packages && Array.isArray(workspaces.packages)) {
    patterns.push(...workspaces.packages);
  }

  const pnpmWorkspacePath = path.join(cwd, 'pnpm-workspace.yaml');
  if (await fileExists(pnpmWorkspacePath)) {
    const raw = await readFile(pnpmWorkspacePath, 'utf8').catch(() => '');
    const parsed = parseYaml(raw) ?? {};
    if (Array.isArray(parsed.packages)) {
      patterns.push(...parsed.packages);
    }
  }

  return unique(patterns.map(normalizeWorkspacePattern).filter((pattern) => pattern && !pattern.startsWith('!')));
}

async function expandWorkspacePattern(cwd, pattern) {
  const segments = normalizeWorkspacePattern(pattern).split('/').filter(Boolean);

  async function walkSegments(currentDir, index) {
    if (index >= segments.length) {
      return [currentDir];
    }

    const segment = segments[index];
    if (segment === '**') {
      const results = await walkSegments(currentDir, index + 1);
      const entries = await readdir(currentDir, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith('.') || WALK_SKIP_DIRS.has(entry.name)) {
          continue;
        }
        results.push(...await walkSegments(path.join(currentDir, entry.name), index));
      }
      return results;
    }

    if (!segment.includes('*')) {
      const nextDir = path.join(currentDir, segment);
      if (!(await directoryExists(nextDir))) {
        return [];
      }
      return walkSegments(nextDir, index + 1);
    }

    const matcher = globSegmentToRegex(segment);
    const entries = await readdir(currentDir, { withFileTypes: true }).catch(() => []);
    const results = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.') || WALK_SKIP_DIRS.has(entry.name)) {
        continue;
      }
      if (!matcher.test(entry.name)) {
        continue;
      }
      results.push(...await walkSegments(path.join(currentDir, entry.name), index + 1));
    }
    return results;
  }

  return unique(await walkSegments(cwd, 0));
}

async function findWorkspacePackageDirs(cwd, rootPackageJson) {
  const patterns = await readWorkspacePatterns(cwd, rootPackageJson);
  const matches = [];
  for (const pattern of patterns) {
    const directories = await expandWorkspacePattern(cwd, pattern);
    for (const directory of directories) {
      if (await fileExists(path.join(directory, 'package.json'))) {
        matches.push(path.resolve(directory));
      }
    }
  }
  return unique(matches);
}

async function findRouteEntries(rootDir, excludeRoots = []) {
  const routeFiles = await walkCandidateFiles(rootDir, {
    extensions: ['.js', '.jsx', '.ts', '.tsx'],
    maxResults: 160,
    excludeRoots,
  });

  return uniqueBy(
    routeFiles
      .map((filePath) => {
        const route = toRouteFromFile(rootDir, filePath);
        if (!route) {
          return null;
        }

        const relativeFile = toPosixPath(path.relative(rootDir, filePath));
        return {
          path: route,
          sourceFile: relativeFile,
          directory: toPosixPath(path.dirname(relativeFile)),
          depth: route === '/' ? 0 : route.split('/').filter(Boolean).length,
          tokens: unique([...tokenize(route), ...tokenize(relativeFile)]),
        };
      })
      .filter(Boolean)
      .sort((left, right) => {
        if (left.path === '/' && right.path !== '/') {
          return -1;
        }
        if (right.path === '/' && left.path !== '/') {
          return 1;
        }
        if (left.depth !== right.depth) {
          return left.depth - right.depth;
        }
        return left.sourceFile.localeCompare(right.sourceFile);
      }),
    (entry) => `${entry.path}:${entry.sourceFile}`,
  ).slice(0, 20);
}

async function findTestIdEntries(rootDir, excludeRoots = []) {
  const codeFiles = await walkCandidateFiles(rootDir, {
    extensions: CODE_EXTENSIONS,
    maxResults: 220,
    excludeRoots,
  });

  const entries = [];
  const regexes = [
    /data-testid\s*=\s*["'`]([^"'`]+)["'`]/g,
    /getByTestId\(\s*["'`]([^"'`]+)["'`]\s*\)/g,
  ];

  for (const filePath of codeFiles) {
    const source = await readFile(filePath, 'utf8').catch(() => '');
    const relativeFile = toPosixPath(path.relative(rootDir, filePath));
    for (const regex of regexes) {
      regex.lastIndex = 0;
      let match = regex.exec(source);
      while (match) {
        entries.push({
          id: match[1],
          sourceFile: relativeFile,
          directory: toPosixPath(path.dirname(relativeFile)),
          tokens: unique([...tokenize(match[1]), ...tokenize(relativeFile)]),
        });
        if (entries.length >= 80) {
          return uniqueBy(entries, (entry) => `${entry.id}:${entry.sourceFile}`);
        }
        match = regex.exec(source);
      }
    }
  }

  return uniqueBy(entries, (entry) => `${entry.id}:${entry.sourceFile}`);
}

async function findAuthStates(cwd) {
  const files = await walkCandidateFiles(cwd, {
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

async function findPlaywrightConfigFiles(rootDir, excludeRoots = []) {
  const files = await walkCandidateFiles(rootDir, {
    extensions: CONFIG_EXTENSIONS,
    maxResults: 40,
    excludeRoots,
  });

  return files.filter((filePath) => path.basename(filePath).startsWith('playwright.config.'));
}

async function findConfigHints(rootDir, excludeRoots = []) {
  const directEntries = await readdir(rootDir, { withFileTypes: true }).catch(() => []);
  const names = new Set(directEntries.map((entry) => entry.name));
  const playwrightFiles = await findPlaywrightConfigFiles(rootDir, excludeRoots);

  return {
    next: ['next.config.js', 'next.config.mjs', 'next.config.cjs', 'next.config.ts'].some((name) => names.has(name)),
    vite: ['vite.config.js', 'vite.config.mjs', 'vite.config.cjs', 'vite.config.ts'].some((name) => names.has(name)),
    storybook: await directoryExists(path.join(rootDir, '.storybook')),
    playwrightFiles: playwrightFiles.map((filePath) => toPosixPath(path.relative(rootDir, filePath))),
  };
}

function scorePackageCandidate(candidate) {
  let score = 0;
  if (candidate.frameworks.next) {
    score += 24;
  }
  if (candidate.frameworks.vite) {
    score += 20;
  }
  if (candidate.frameworks.storybook) {
    score += 20;
  }
  if (candidate.frameworks.react) {
    score += 8;
  }
  if (candidate.frameworks.playwright) {
    score += 14;
  }
  if (candidate.routeEntries.length) {
    score += Math.min(24, candidate.routeEntries.length * 6);
  }
  if (candidate.configHints.next || candidate.configHints.vite || candidate.configHints.storybook) {
    score += 10;
  }
  if (candidate.configHints.playwrightFiles.length) {
    score += 8;
  }
  if (SERVER_SCRIPT_KINDS.some((scriptName) => candidate.scripts[scriptName])) {
    score += 8;
  }
  if (candidate.relativePath === '.') {
    score -= 2;
  }
  return score;
}

async function loadPackageCandidate(cwd, packageRoot, workspacePackageDirs) {
  const { packageJson } = await findPackageJson(packageRoot);
  const excludeRoots = workspacePackageDirs.filter(
    (workspaceDir) => workspaceDir !== packageRoot && isInside(packageRoot, workspaceDir),
  );
  const frameworks = inferFrameworks(packageJson);
  const [routeEntries, testIdEntries, configHints] = await Promise.all([
    findRouteEntries(packageRoot, excludeRoots),
    findTestIdEntries(packageRoot, excludeRoots),
    findConfigHints(packageRoot, excludeRoots),
  ]);

  const candidate = {
    rootDir: packageRoot,
    relativePath: toPosixPath(path.relative(cwd, packageRoot)) || '.',
    packageJson,
    scripts: packageJson.scripts ?? {},
    frameworks,
    routeEntries,
    testIdEntries,
    configHints,
  };

  return {
    ...candidate,
    score: scorePackageCandidate(candidate),
  };
}

function describePackageCandidate(candidate) {
  const reasons = [];
  if (candidate.routeEntries.length) {
    reasons.push(`${candidate.routeEntries.length} route file(s)`);
  }
  if (candidate.frameworks.next) {
    reasons.push('Next.js deps');
  }
  if (candidate.frameworks.playwright) {
    reasons.push('Playwright deps');
  }
  if (candidate.configHints.playwrightFiles.length) {
    reasons.push('Playwright config');
  }
  return reasons.join(', ') || 'fallback candidate';
}

function selectPackageCandidate(candidates) {
  return [...candidates].sort((left, right) => {
    if (left.score !== right.score) {
      return right.score - left.score;
    }
    if (left.routeEntries.length !== right.routeEntries.length) {
      return right.routeEntries.length - left.routeEntries.length;
    }
    if (left.frameworks.playwright !== right.frameworks.playwright) {
      return left.frameworks.playwright ? -1 : 1;
    }
    if (left.relativePath === '.' && right.relativePath !== '.') {
      return 1;
    }
    if (right.relativePath === '.' && left.relativePath !== '.') {
      return -1;
    }
    return left.relativePath.localeCompare(right.relativePath);
  })[0];
}

function pickPackageAliases(packageCandidate) {
  const aliases = new Set();
  const rootName = path.basename(packageCandidate.rootDir);
  aliases.add(rootName);

  if (packageCandidate.packageJson.name) {
    const packageName = String(packageCandidate.packageJson.name);
    aliases.add(packageName.replace(/^@[^/]+\//, ''));
    aliases.add(packageName.split('/').at(-1));
  }

  return Array.from(aliases)
    .map((value) => value?.trim())
    .filter(Boolean)
    .map((value) => value.toLowerCase());
}

function parsePlaywrightHints(source) {
  const baseUrl = source.match(/baseURL\s*:\s*["'`]([^"'`]+)["'`]/)?.[1] ?? null;
  const webServerSection = source.match(/webServer\s*:\s*(\[[\s\S]{0,1600}?\]|\{[\s\S]{0,1600}?\})/m)?.[1] ?? '';

  return {
    baseUrl,
    webServerCommand: webServerSection.match(/command\s*:\s*["'`]([^"'`]+)["'`]/)?.[1] ?? null,
    webServerUrl: webServerSection.match(/url\s*:\s*["'`]([^"'`]+)["'`]/)?.[1] ?? null,
  };
}

async function collectPlaywrightHints(cwd, rootCandidate, selectedPackage) {
  const hintFiles = [];
  const candidateDirs = unique([rootCandidate.rootDir, selectedPackage.rootDir]);

  for (const candidateDir of candidateDirs) {
    for (const relativePath of selectedPackage.rootDir === candidateDir
      ? selectedPackage.configHints.playwrightFiles
      : rootCandidate.configHints.playwrightFiles) {
      hintFiles.push(path.join(candidateDir, relativePath));
    }
  }

  const parsedHints = [];
  for (const filePath of unique(hintFiles)) {
    const source = await readFile(filePath, 'utf8').catch(() => '');
    if (!source) {
      continue;
    }
    const hint = parsePlaywrightHints(source);
    if (!hint.baseUrl && !hint.webServerCommand && !hint.webServerUrl) {
      continue;
    }

    const directory = path.dirname(filePath);
    const score =
      directory === selectedPackage.rootDir
        ? 120
        : isInside(selectedPackage.rootDir, directory)
          ? 100
          : directory === cwd
            ? 90
            : 60;

    parsedHints.push({
      ...hint,
      filePath: toPosixPath(path.relative(cwd, filePath)),
      score,
    });
  }

  parsedHints.sort((left, right) => right.score - left.score || left.filePath.localeCompare(right.filePath));

  return {
    baseUrl: parsedHints.find((hint) => hint.baseUrl)?.baseUrl ?? null,
    webServerCommand: parsedHints.find((hint) => hint.webServerCommand)?.webServerCommand ?? null,
    webServerUrl: parsedHints.find((hint) => hint.webServerUrl)?.webServerUrl ?? null,
    sourceFile: parsedHints[0]?.filePath ?? null,
  };
}

function pickRootServerScript(rootCandidate, selectedPackage) {
  const aliases = pickPackageAliases(selectedPackage);
  const scripts = rootCandidate.scripts;

  for (const alias of aliases) {
    for (const kind of SERVER_SCRIPT_KINDS) {
      const directMatches = [`${kind}:${alias}`, `${alias}:${kind}`, `${kind}-${alias}`, `${alias}-${kind}`];
      const match = directMatches.find((scriptName) => scripts[scriptName]);
      if (match) {
        return match;
      }
    }
  }

  for (const [scriptName] of Object.entries(scripts)) {
    const lower = scriptName.toLowerCase();
    if (!aliases.some((alias) => lower.includes(alias))) {
      continue;
    }
    if (!SERVER_SCRIPT_KINDS.some((kind) => lower.includes(kind))) {
      continue;
    }
    return scriptName;
  }

  return null;
}

function pickLocalServerScript(selectedPackage, preset) {
  if (preset === 'storybook' && selectedPackage.scripts.storybook) {
    return 'storybook';
  }
  return SERVER_SCRIPT_KINDS.find((scriptName) => selectedPackage.scripts[scriptName]);
}

function resolveServerCommand({ cwd, packageManager, rootCandidate, selectedPackage, preset, playwrightHints }) {
  if (playwrightHints.webServerCommand) {
    const playwrightCwd = playwrightHints.sourceFile?.startsWith(`${selectedPackage.relativePath}/`) ||
      playwrightHints.sourceFile === `playwright.config.ts` ||
      playwrightHints.sourceFile === `playwright.config.js` ||
      playwrightHints.sourceFile === `playwright.config.mjs` ||
      playwrightHints.sourceFile === `playwright.config.cjs`
      ? null
      : null;

    return {
      command: playwrightHints.webServerCommand,
      cwd: playwrightCwd,
      source: 'playwright',
      rawScript: playwrightHints.webServerCommand,
    };
  }

  const rootScript = pickRootServerScript(rootCandidate, selectedPackage);
  if (rootScript) {
    return {
      command: buildScriptCommand(packageManager, rootScript),
      cwd: null,
      source: 'root-script',
      rawScript: rootCandidate.scripts[rootScript],
    };
  }

  const localScript = pickLocalServerScript(selectedPackage, preset);
  if (localScript) {
    return {
      command: buildScriptCommand(packageManager, localScript),
      cwd: selectedPackage.relativePath === '.' ? null : selectedPackage.relativePath,
      source: 'package-script',
      rawScript: selectedPackage.scripts[localScript],
    };
  }

  return null;
}

function buildCandidateSummary(candidate) {
  return {
    path: candidate.relativePath,
    name: candidate.packageJson.name ?? path.basename(candidate.rootDir),
    frameworks: candidate.frameworks,
    scripts: Object.keys(candidate.scripts),
    score: candidate.score,
  };
}

function scoreRoutePriority(routeEntry) {
  if (!routeEntry) {
    return 0;
  }
  if (routeEntry.path === '/') {
    return 90;
  }
  return Math.max(35, 80 - routeEntry.depth * 10);
}

function scoreRouteTestPair(routeEntry, testIdEntry) {
  let score = 0;
  if (routeEntry.sourceFile === testIdEntry.sourceFile) {
    score += 100;
  }
  if (routeEntry.directory === testIdEntry.directory) {
    score += 60;
  } else if (
    routeEntry.directory.startsWith(`${testIdEntry.directory}/`) ||
    testIdEntry.directory.startsWith(`${routeEntry.directory}/`)
  ) {
    score += 20;
  }

  const sharedTokens = routeEntry.tokens.filter((token) => testIdEntry.tokens.includes(token)).length;
  score += sharedTokens * 18;

  if (routeEntry.path === '/' && (testIdEntry.tokens.includes('home') || testIdEntry.tokens.includes('landing'))) {
    score += 18;
  }

  return score;
}

function pairConfidence(score) {
  if (score >= 80) {
    return 'high';
  }
  if (score >= 45) {
    return 'medium';
  }
  return 'low';
}

function buildScreenSuggestion(routeEntries, testIdEntries, preset) {
  const routes = routeEntries.slice(0, 8);
  const candidates = routes.map((routeEntry) => {
    let bestTestId = null;
    let bestPairScore = -1;
    for (const testIdEntry of testIdEntries) {
      const pairScore = scoreRouteTestPair(routeEntry, testIdEntry);
      if (pairScore > bestPairScore) {
        bestPairScore = pairScore;
        bestTestId = testIdEntry;
      }
    }

    const totalScore = scoreRoutePriority(routeEntry) + Math.max(bestPairScore, 0);
    const confidence = bestTestId ? pairConfidence(bestPairScore) : 'low';
    return {
      path: routeEntry.path,
      routeFile: routeEntry.sourceFile,
      testId: bestTestId?.id ?? null,
      testIdFile: bestTestId?.sourceFile ?? null,
      confidence,
      score: totalScore,
    };
  }).sort((left, right) => right.score - left.score || left.path.localeCompare(right.path));

  const selectedCandidate = candidates[0] ?? null;
  const route = selectedCandidate?.path ?? '/';
  const routeLabel = route === '/' ? 'home' : route.split('/').filter(Boolean).join('-');
  const screen = {
    id: sanitizeId(routeLabel, 'primary-screen'),
    fileId: sanitizeId(routeLabel, 'primary-screen'),
    label: titleCase(routeLabel || 'Primary Screen'),
    path: route,
  };

  let waitTargetResolved = false;
  if (selectedCandidate?.confidence === 'high' && selectedCandidate.testId) {
    screen.waitFor = { testId: selectedCandidate.testId };
    waitTargetResolved = true;
  } else if (preset === 'storybook') {
    screen.waitFor = { selector: '#storybook-root' };
    waitTargetResolved = true;
  }

  return {
    screen,
    screenCandidates: candidates.slice(0, 5),
    routeResolved: Boolean(selectedCandidate?.path && routeEntries.length),
    waitTargetResolved,
    selectedCandidate,
  };
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

function buildSuggestedConfig({
  cwd,
  packageManager,
  preset,
  selectedPackage,
  baseUrl,
  baselineRef,
  serverCommand,
  screenSuggestion,
}) {
  const stageId = preset === 'storybook' ? 'storybook-review' : 'primary-flow';
  const stageTitle = preset === 'storybook' ? 'Storybook Review' : 'Primary Flow';

  const config = {
    version: 1,
    project: {
      name: selectedPackage.packageJson.name ?? path.basename(selectedPackage.rootDir),
      rootDir: '..',
    },
    artifacts: {
      rootDir: DEFAULT_ARTIFACTS_ROOT,
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
        screens: [screenSuggestion.screen],
      },
    ],
  };

  if (serverCommand?.command) {
    config.servers.after.command = serverCommand.command;
    if (serverCommand.cwd) {
      config.servers.after.cwd = serverCommand.cwd;
    }
  }

  if (baselineRef) {
    config.baseline = {
      git: {
        ref: baselineRef,
        worktreeDir: buildDefaultBaselineWorktreeDir(sanitizeId(baselineRef, 'baseline')),
        ...(serverCommand?.command
          ? {
              installCommand: inferInstallCommand(cwd, packageManager),
              server: {
                command: serverCommand.command,
                baseUrl,
                readyUrl: baseUrl,
                timeoutMs: 90_000,
                ...(serverCommand.cwd ? { cwd: serverCommand.cwd } : {}),
              },
            }
          : {}),
      },
    };
  }

  return buildCanonicalSuggestedConfig(config);
}

function buildUnresolved({ serverCommand, screenSuggestion, baselineRef }) {
  const unresolved = [];

  if (!serverCommand?.command) {
    unresolved.push({
      key: 'after-server-command',
      message: 'No obvious app server command was found. Confirm how the app should be started for after captures.',
      defaultValue: null,
    });
  }

  if (!screenSuggestion.routeResolved) {
    unresolved.push({
      key: 'screen-path',
      message: 'No obvious route file was found for the selected app. Confirm which path should be captured first.',
      defaultValue: '/',
    });
  }

  if (!screenSuggestion.waitTargetResolved) {
    unresolved.push({
      key: 'wait-target',
      message: 'A route was detected, but no high-confidence wait target was found. Add a stable test id or selector before capturing.',
      defaultValue: null,
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
  const rootCandidate = await loadPackageCandidate(cwd, cwd, []);
  const workspacePackageDirs = await findWorkspacePackageDirs(cwd, rootCandidate.packageJson);
  const allCandidateDirs = unique([cwd, ...workspacePackageDirs]);
  const candidates = await Promise.all(allCandidateDirs.map((candidateDir) => loadPackageCandidate(cwd, candidateDir, allCandidateDirs)));
  const selectedPackage = selectPackageCandidate(candidates);
  const packageManager = parsePackageManager(rootCandidate.packageJson.packageManager, cwd);
  const preset = inferPreset(selectedPackage.frameworks);
  const playwrightHints = await collectPlaywrightHints(cwd, candidates.find((candidate) => candidate.relativePath === '.') ?? rootCandidate, selectedPackage);
  const serverCommand = resolveServerCommand({
    cwd,
    packageManager,
    rootCandidate: candidates.find((candidate) => candidate.relativePath === '.') ?? rootCandidate,
    selectedPackage,
    preset,
    playwrightHints,
  });
  const baseUrl = playwrightHints.baseUrl
    ?? playwrightHints.webServerUrl
    ?? inferBaseUrl(inferPort(serverCommand?.rawScript ?? serverCommand?.command, preset));

  const [authStates, screenshotDirs] = await Promise.all([
    findAuthStates(cwd),
    findScreenshotDirs(cwd),
  ]);

  const routeCandidates = selectedPackage.routeEntries.map((entry) => entry.path);
  const testIds = selectedPackage.testIdEntries.map((entry) => entry.id);
  const screenSuggestion = buildScreenSuggestion(selectedPackage.routeEntries, selectedPackage.testIdEntries, preset);
  const baselineRef = detectGitBaselineRef(cwd);
  const legacyPaths = await detectLegacyLayout(cwd);
  const legacyRuntimePaths = await detectLegacyRuntimeLayout(cwd);
  const suggestedConfig = buildSuggestedConfig({
    cwd,
    packageManager,
    preset,
    selectedPackage,
    baseUrl,
    baselineRef,
    serverCommand,
    screenSuggestion,
  });
  const warnings = [
    ...(legacyPaths.length ? [formatLegacyLayoutWarning(legacyPaths)] : []),
    ...(legacyRuntimePaths.length ? [formatLegacyRuntimeLayoutWarning(legacyRuntimePaths)] : []),
  ];

  return {
    version: 1,
    cwd,
    preset,
    packageManager,
    frameworks: selectedPackage.frameworks,
    existingConfig: await detectExistingConfigPath(cwd),
    defaultConfigPath: DEFAULT_CONFIG_PATH,
    warnings,
    detected: {
      scripts: rootCandidate.scripts,
      routeCandidates,
      testIds,
      authStates,
      screenshotDirs,
      baselineRef,
      selectedPackage: {
        path: selectedPackage.relativePath,
        name: selectedPackage.packageJson.name ?? path.basename(selectedPackage.rootDir),
        reason: describePackageCandidate(selectedPackage),
      },
      workspacePackages: candidates.map(buildCandidateSummary),
      playwrightHints: {
        sourceFile: playwrightHints.sourceFile,
        baseUrl: playwrightHints.baseUrl ?? playwrightHints.webServerUrl,
        webServerCommand: playwrightHints.webServerCommand,
      },
      screenCandidates: screenSuggestion.screenCandidates,
      legacyLayout: legacyPaths,
      legacyRuntimeLayout: legacyRuntimePaths,
    },
    unresolved: buildUnresolved({
      serverCommand,
      screenSuggestion,
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
