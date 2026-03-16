import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import { parse as parseYaml } from 'yaml';

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

export async function loadConfig(configPath = 'ui-evidence.config.yaml') {
  const absoluteConfigPath = path.resolve(process.cwd(), configPath);
  const [rawConfig, rawSchema] = await Promise.all([
    readFile(absoluteConfigPath, 'utf8'),
    readFile(SCHEMA_PATH, 'utf8'),
  ]);
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
