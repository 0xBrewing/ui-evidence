import { parseArgv } from './parse-args.mjs';
import { handleInit } from '../commands/init.mjs';
import { handleInstall } from '../commands/install.mjs';
import { handleDiscover } from '../commands/discover.mjs';
import { handleCapture } from '../commands/capture.mjs';
import { handleCompare } from '../commands/compare.mjs';
import { handleReport } from '../commands/report.mjs';
import { handleReview } from '../commands/review.mjs';
import { handleDoctor } from '../commands/doctor.mjs';
import { handleRun } from '../commands/run.mjs';
import { handleSchema } from '../commands/schema.mjs';

function printHelp() {
  console.log(`ui-evidence

Usage:
  ui-evidence <command> [options]

Commands:
  init      scaffold a starter config
  install   scaffold consumer-repo bootstrap files for Claude/Codex
  discover  inspect the repo and print a suggested config
  doctor    validate setup, runtime prerequisites, and config health
  capture   capture before/after screenshots
  compare   build pair comparison images and overview sheets
  report    generate Markdown evidence and manifest files
  review    generate a local HTML review surface
  run       orchestrate capture + compare + report
  schema    print schema path or schema JSON
  help      show this message

Examples:
  ui-evidence init --interactive --config ui-evidence.config.yaml
  ui-evidence install --agent both --config ui-evidence.config.yaml
  ui-evidence discover --format yaml
  ui-evidence doctor --config ui-evidence.config.yaml
  ui-evidence capture --phase before --stage entry-flows
  ui-evidence compare --stage entry-flows
  ui-evidence report --stage entry-flows --language ko
  ui-evidence review --stage entry-flows
  ui-evidence run --stage entry-flows`);
}

const commandHandlers = {
  init: handleInit,
  install: handleInstall,
  discover: handleDiscover,
  doctor: handleDoctor,
  capture: handleCapture,
  compare: handleCompare,
  report: handleReport,
  review: handleReview,
  run: handleRun,
  schema: handleSchema,
};

export async function main(argv) {
  const { command, options } = parseArgv(argv);
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  const handler = commandHandlers[command];
  if (!handler) {
    throw new Error(`Unknown command "${command}". Use "ui-evidence help".`);
  }

  try {
    await handler(options);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
