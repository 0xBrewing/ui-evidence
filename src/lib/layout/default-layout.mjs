import path from 'node:path';
import { directoryExists, fileExists, toPosixPath } from '../util/fs.mjs';

export const DEFAULT_UI_EVIDENCE_DIR = 'ui-evidence';
export const DEFAULT_CONFIG_PATH = path.join(DEFAULT_UI_EVIDENCE_DIR, 'config.yaml');
export const DEFAULT_INSTALLATION_DOC_PATH = path.join(DEFAULT_UI_EVIDENCE_DIR, 'installation.md');
export const DEFAULT_HOOKS_DIR = path.join(DEFAULT_UI_EVIDENCE_DIR, 'hooks');
export const DEFAULT_ARTIFACTS_ROOT = path.join(DEFAULT_UI_EVIDENCE_DIR, 'screenshots');

export const LEGACY_CONFIG_PATH = 'ui-evidence.config.yaml';
export const LEGACY_INSTALLATION_DOC_PATH = path.join('docs', 'ui-evidence-installation.md');
export const LEGACY_ARTIFACTS_ROOT = path.join('screenshots', 'ui-evidence');

export function resolveLayoutPath(cwd, relativePath) {
  return path.resolve(cwd, relativePath);
}

export function isDefaultConfigOption(cwd, configOption) {
  return !configOption || resolveLayoutPath(cwd, configOption) === resolveLayoutPath(cwd, DEFAULT_CONFIG_PATH);
}

export function isDefaultInstallOption(cwd, installationDocOption) {
  return !installationDocOption
    || resolveLayoutPath(cwd, installationDocOption) === resolveLayoutPath(cwd, DEFAULT_INSTALLATION_DOC_PATH);
}

export async function detectLegacyLayout(cwd) {
  const legacyPaths = [];

  if (await fileExists(resolveLayoutPath(cwd, LEGACY_CONFIG_PATH))) {
    legacyPaths.push(LEGACY_CONFIG_PATH);
  }
  if (await fileExists(resolveLayoutPath(cwd, LEGACY_INSTALLATION_DOC_PATH))) {
    legacyPaths.push(LEGACY_INSTALLATION_DOC_PATH);
  }
  if (await directoryExists(resolveLayoutPath(cwd, LEGACY_ARTIFACTS_ROOT))) {
    legacyPaths.push(LEGACY_ARTIFACTS_ROOT);
  }

  return legacyPaths;
}

export async function detectExistingConfigPath(cwd) {
  if (await fileExists(resolveLayoutPath(cwd, DEFAULT_CONFIG_PATH))) {
    return DEFAULT_CONFIG_PATH;
  }
  if (await fileExists(resolveLayoutPath(cwd, LEGACY_CONFIG_PATH))) {
    return LEGACY_CONFIG_PATH;
  }
  return null;
}

export function formatLegacyLayoutWarning(legacyPaths) {
  const joined = legacyPaths.map((item) => `\`${item}\``).join(', ');
  return `Legacy ui-evidence paths detected: ${joined}. Canonical layout is \`${DEFAULT_UI_EVIDENCE_DIR}/\`. Move those files under \`${DEFAULT_UI_EVIDENCE_DIR}/\` or keep using explicit paths.`;
}

export async function assertNoLegacyLayoutConflict(cwd) {
  const legacyPaths = await detectLegacyLayout(cwd);
  if (!legacyPaths.length) {
    return [];
  }

  throw new Error(formatLegacyLayoutWarning(legacyPaths));
}

export function buildCanonicalSuggestedConfig(baseConfig) {
  return {
    ...baseConfig,
    project: {
      ...baseConfig.project,
      rootDir: '..',
    },
    artifacts: {
      ...baseConfig.artifacts,
      rootDir: DEFAULT_ARTIFACTS_ROOT,
    },
  };
}

export function toRelativeLayoutPath(cwd, absolutePath) {
  return toPosixPath(path.relative(cwd, absolutePath));
}
