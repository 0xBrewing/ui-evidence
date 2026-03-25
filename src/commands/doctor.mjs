import { csvOption } from '../cli/parse-args.mjs';
import { formatDoctorResult, runDoctor } from '../lib/doctor/run-doctor.mjs';

export async function handleDoctor(options) {
  const result = await runDoctor({
    config: options.config,
    beforeRef: options.beforeRef,
    deep: Boolean(options.deep),
    scopeId: options.scope ?? null,
    stageArg: options.stage ?? 'all',
    screenIds: csvOption(options.screens),
  });

  process.stdout.write(`${formatDoctorResult(result, options.json ? 'json' : 'text')}\n`);
  if (!result.ok) {
    process.exitCode = 1;
  }
}
