import { scaffoldConsumerRepo } from '../lib/install/scaffold-consumer.mjs';

export async function handleInstall(options) {
  const result = await scaffoldConsumerRepo({
    cwd: options.cwd,
    agent: options.agent,
    config: options.config,
    installationDoc: options.installationDoc,
    force: Boolean(options.force),
    sync: Boolean(options.sync),
  });

  console.log(`consumer bootstrap ready (${result.discovery.packageManager}, ${result.discovery.preset})`);
  for (const action of result.actions) {
    console.log(`${action.status}: ${action.path}`);
  }
  console.log(`next: ${result.tokens.UI_EVIDENCE_EXEC} doctor --config ${result.tokens.CONFIG_PATH}`);
}
