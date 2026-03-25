import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import { parse as parseYaml } from 'yaml';
import {
  DEFAULT_CONFIG_PATH,
  LEGACY_CONFIG_PATH,
  detectLegacyLayout,
  formatLegacyLayoutWarning,
} from '../lib/layout/default-layout.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const SCHEMA_PATH = path.resolve(__dirname, '..', '..', 'schemas', 'ui-evidence.schema.json');

function parseConfig(raw, extension) {
  if (extension === '.json') {
    return JSON.parse(raw);
  }
  return parseYaml(raw);
}

export function resolveProjectPath(config, value = '.') {
  return path.isAbsolute(value) ? value : path.resolve(config.meta.projectRoot, value);
}

export async function loadConfig(configPath = DEFAULT_CONFIG_PATH) {
  const absoluteConfigPath = path.resolve(process.cwd(), configPath);
  let rawConfig;
  let rawSchema;
  try {
    [rawConfig, rawSchema] = await Promise.all([
      readFile(absoluteConfigPath, 'utf8'),
      readFile(SCHEMA_PATH, 'utf8'),
    ]);
  } catch (error) {
    if (error?.code === 'ENOENT' && configPath === DEFAULT_CONFIG_PATH) {
      const legacyPaths = await detectLegacyLayout(process.cwd());
      if (legacyPaths.includes(LEGACY_CONFIG_PATH)) {
        throw new Error(
          `No config found at "${absoluteConfigPath}". ${formatLegacyLayoutWarning(legacyPaths)} Use --config ${LEGACY_CONFIG_PATH} if you need the legacy layout temporarily.`,
        );
      }
      throw new Error(`No config found at "${absoluteConfigPath}". Run "ui-evidence init" to create the canonical ui-evidence layout.`);
    }
    throw error;
  }
  const extension = path.extname(absoluteConfigPath).toLowerCase();
  const parsedConfig = parseConfig(rawConfig, extension);
  const schema = JSON.parse(rawSchema);

  const ajv = new Ajv({
    allErrors: true,
    useDefaults: true,
    allowUnionTypes: true,
  });
  const validate = ajv.compile(schema);
  if (!validate(parsedConfig)) {
    const details = (validate.errors ?? [])
      .map((item) => `${item.instancePath || '/'} ${item.message ?? 'is invalid'}`)
      .join('; ');
    throw new Error(`Invalid config at "${absoluteConfigPath}": ${details}`);
  }

  const configDir = path.dirname(absoluteConfigPath);
  const projectRoot = path.resolve(configDir, parsedConfig.project.rootDir ?? '.');
  const artifactsRoot = path.resolve(projectRoot, parsedConfig.artifacts.rootDir);

  return {
    ...parsedConfig,
    meta: {
      configPath: absoluteConfigPath,
      configDir,
      projectRoot,
      artifactsRoot,
      schemaPath: SCHEMA_PATH,
    },
  };
}
