import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveProjectPath } from '../../config/load-config.mjs';

export async function loadHook(config, specifier) {
  if (!specifier) {
    return null;
  }

  const [rawModulePath, exportName = 'default'] = specifier.split('#');
  const modulePath = resolveProjectPath(config, rawModulePath);
  const moduleUrl = pathToFileURL(path.resolve(modulePath)).href;
  const mod = await import(moduleUrl);
  const hook = mod[exportName];
  if (typeof hook !== 'function') {
    throw new Error(`Hook "${specifier}" did not resolve to a function.`);
  }
  return hook;
}
