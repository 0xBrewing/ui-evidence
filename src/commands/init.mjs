import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { stdin as input, stdout as output } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { ensureDir, fileExists } from '../lib/util/fs.mjs';
import { discoverProject, formatSuggestedConfig } from '../lib/discover/discover-project.mjs';
import { DEFAULT_CONFIG_PATH, assertNoLegacyLayoutConflict, isDefaultConfigOption } from '../lib/layout/default-layout.mjs';

async function promptWithDefault(rl, label, defaultValue) {
  const suffix = defaultValue ? ` [${defaultValue}]` : '';
  const answer = (await rl.question(`${label}${suffix}: `)).trim();
  return answer || defaultValue;
}

async function buildInteractiveConfig(discovery) {
  const config = structuredClone(discovery.suggestedConfig);
  const rl = createInterface({ input, output });

  try {
    config.project.name = await promptWithDefault(rl, 'Project name', config.project.name);
    config.capture.baseUrl = await promptWithDefault(rl, 'After capture base URL', config.capture.baseUrl);
    config.servers.after.baseUrl = config.capture.baseUrl;

    const detectedCommand = config.servers.after.command ?? '';
    const serverCommand = await promptWithDefault(rl, 'After server command (leave empty if you start it manually)', detectedCommand);
    if (serverCommand) {
      config.servers.after.command = serverCommand;
    } else {
      delete config.servers.after.command;
    }

    const screen = config.stages[0].screens[0];
    screen.path = await promptWithDefault(rl, 'First screen path', screen.path);

    const waitDefault = screen.waitFor?.testId
      ? `testId:${screen.waitFor.testId}`
      : `selector:${screen.waitFor?.selector ?? 'body'}`;
    const waitAnswer = await promptWithDefault(rl, 'Wait target (`testId:value` or `selector:value`)', waitDefault);
    if (waitAnswer?.startsWith('testId:')) {
      screen.waitFor = { testId: waitAnswer.slice('testId:'.length).trim() };
    } else if (waitAnswer?.startsWith('selector:')) {
      screen.waitFor = { selector: waitAnswer.slice('selector:'.length).trim() };
    }

    const language = await promptWithDefault(rl, 'Notes/report language', config.report.language);
    config.report.language = language;
    config.artifacts.notesLanguage = language;
    config.artifacts.reportLanguage = language;

    const defaultBaseline = config.baseline?.git?.ref ?? '';
    const baselineRef = await promptWithDefault(rl, 'Git baseline ref (leave empty to skip branch baseline)', defaultBaseline);
    if (baselineRef) {
      config.baseline ??= {};
      config.baseline.git ??= {};
      config.baseline.git.ref = baselineRef;
      config.baseline.git.server ??= {};
      if (config.servers.after.command) {
        config.baseline.git.server.command = config.servers.after.command;
      }
      config.baseline.git.server.baseUrl = config.capture.baseUrl;
      config.baseline.git.server.readyUrl = config.capture.baseUrl;
      config.baseline.git.server.timeoutMs ??= 90_000;
    } else {
      delete config.baseline;
    }
  } finally {
    rl.close();
  }

  return config;
}

export async function handleInit(options) {
  const cwd = process.cwd();
  if (isDefaultConfigOption(cwd, options.config)) {
    await assertNoLegacyLayoutConflict(cwd);
  }

  const configPath = path.resolve(cwd, options.config ?? DEFAULT_CONFIG_PATH);
  if ((await fileExists(configPath)) && !options.force) {
    throw new Error(`Config already exists at "${configPath}". Use --force to overwrite.`);
  }

  const discovery = await discoverProject({ cwd });
  const config = options.interactive && input.isTTY && output.isTTY
    ? await buildInteractiveConfig(discovery)
    : discovery.suggestedConfig;

  await ensureDir(path.dirname(configPath));
  await writeFile(configPath, formatSuggestedConfig(config, 'yaml'), 'utf8');

  console.log(`created ${configPath}`);
  console.log(`preset: ${discovery.preset}`);
  console.log(`next: ui-evidence doctor --config ${path.relative(cwd, configPath)}`);
}
