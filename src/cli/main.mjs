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
import { handleSnapshot } from '../commands/snapshot.mjs';

function printTopHelp() {
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
  snapshot  capture the current UI and build a snapshot review bundle
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
  ui-evidence run --stage entry-flows
  ui-evidence snapshot --scope button-rollout`);
}

const commandHelp = {
  init: `ui-evidence init

Usage:
  ui-evidence init [--config <path>] [--interactive] [--force]

Examples:
  ui-evidence init --interactive --config ui-evidence.config.yaml
  ui-evidence init --config ui-evidence.config.yaml --force`,
  install: `ui-evidence install

Usage:
  ui-evidence install [--agent claude|codex|both] [--config <path>] [--installation-doc <path>] [--force]

Examples:
  ui-evidence install --agent both --config ui-evidence.config.yaml
  ui-evidence install --agent claude --config ui-evidence.config.yaml`,
  discover: `ui-evidence discover

Usage:
  ui-evidence discover [--format json|yaml] [--config-only]

Examples:
  ui-evidence discover --format json
  ui-evidence discover --config-only --format yaml`,
  doctor: `ui-evidence doctor

Usage:
  ui-evidence doctor [--config <path>] [--before-ref <ref>] [--deep] [--scope <id>] [--stage <id[,id...]>] [--screens <id[,id...]>] [--json]

Examples:
  ui-evidence doctor --config ui-evidence.config.yaml
  ui-evidence doctor --config ui-evidence.config.yaml --deep --stage primary-flow`,
  capture: `ui-evidence capture

Usage:
  ui-evidence capture --phase before|after [--config <path>] [--stage <id[,id...]>|all] [--screens <id[,id...]>] [--viewports <id[,id...]>] [--base-url <url>]

Examples:
  ui-evidence capture --phase after --stage primary-flow
  ui-evidence capture --phase before --stage primary-flow --base-url http://127.0.0.1:3100`,
  compare: `ui-evidence compare

Usage:
  ui-evidence compare [--config <path>] [--stage <id[,id...]>|all] [--overview-viewport <id>]

Examples:
  ui-evidence compare --stage primary-flow
  ui-evidence compare --stage primary-flow --overview-viewport desktop-1440`,
  report: `ui-evidence report

Usage:
  ui-evidence report [--config <path>] [--stage <id[,id...]>|all] [--language <code>]

Examples:
  ui-evidence report --stage primary-flow --language en
  ui-evidence report --stage primary-flow --language ko`,
  review: `ui-evidence review

Usage:
  ui-evidence review [--config <path>] [--stage <id[,id...]>|all] [--language <code>]

Examples:
  ui-evidence review --stage primary-flow`,
  snapshot: `ui-evidence snapshot

Usage:
  ui-evidence snapshot [--config <path>] [--scope <id>] [--stage <id[,id...]>|all] [--screens <id[,id...]>] [--viewports <id[,id...]>] [--base-url <url>] [--label <slug>] [--language <code>]

Examples:
  ui-evidence snapshot --scope design-system-rollout
  ui-evidence snapshot --stage primary-flow --screens home,checkout --label current-ui`,
  run: `ui-evidence run

Usage:
  ui-evidence run [--config <path>] [--stage <id[,id...]>|all] [--screens <id[,id...]>] [--viewports <id[,id...]>] [--before-ref <ref>] [--before-base-url <url>] [--after-base-url <url>] [--skip-before] [--skip-after] [--skip-compare] [--skip-report] [--skip-review]

Examples:
  ui-evidence run --stage primary-flow
  ui-evidence run --stage primary-flow --before-ref main`,
  schema: `ui-evidence schema

Usage:
  ui-evidence schema [--print]

Examples:
  ui-evidence schema
  ui-evidence schema --print`,
};

function printCommandHelp(command) {
  const help = commandHelp[command];
  if (!help) {
    throw new Error(`Unknown command "${command}". Use "ui-evidence help".`);
  }
  console.log(help);
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
  snapshot: handleSnapshot,
  schema: handleSchema,
};

export async function main(argv) {
  const { command, options, positionals } = parseArgv(argv);

  try {
    if (!command || command === 'help' || command === '--help' || command === '-h') {
      if (command === 'help' && positionals[0]) {
        printCommandHelp(positionals[0]);
        return;
      }
      printTopHelp();
      return;
    }

    const handler = commandHandlers[command];
    if (!handler) {
      throw new Error(`Unknown command "${command}". Use "ui-evidence help".`);
    }

    if (options.help) {
      printCommandHelp(command);
      return;
    }

    await handler(options);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
