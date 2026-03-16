import { formatDoctorResult, runDoctor } from '../lib/doctor/run-doctor.mjs';

export async function handleDoctor(options) {
  const result = await runDoctor({
    config: options.config,
    beforeRef: options.beforeRef,
  });

  process.stdout.write(`${formatDoctorResult(result, options.json ? 'json' : 'text')}\n`);
  if (!result.ok) {
    process.exitCode = 1;
  }
}
