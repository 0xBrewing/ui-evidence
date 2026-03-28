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
import { DEFAULT_CONFIG_PATH } from '../lib/layout/default-layout.mjs';

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
  ui-evidence init --interactive --config ${DEFAULT_CONFIG_PATH}
  ui-evidence install --agent both --config ${DEFAULT_CONFIG_PATH}
  ui-evidence discover --format yaml
  ui-evidence doctor --config ${DEFAULT_CONFIG_PATH} --ready
  ui-evidence capture --phase before --stage entry-flows --profile mobile-en
  ui-evidence compare --stage entry-flows
  ui-evidence report --stage entry-flows --params locale=ko --language ko
  ui-evidence review --stage entry-flows --profile mobile-en
  ui-evidence run --stage entry-flows --resume
  ui-evidence snapshot --scope button-rollout --profile mobile-en`);
}

const commandHelp = {
  init: `ui-evidence init

Usage:
  ui-evidence init [--config <path>] [--interactive] [--force]

Examples:
  ui-evidence init --interactive --config ${DEFAULT_CONFIG_PATH}
  ui-evidence init --config ${DEFAULT_CONFIG_PATH} --force`,
  install: `ui-evidence install

Usage:
  ui-evidence install [--agent claude|codex|both] [--config <path>] [--installation-doc <path>] [--sync] [--force]

Examples:
  ui-evidence install --agent both --config ${DEFAULT_CONFIG_PATH}
  ui-evidence install --agent claude --config ${DEFAULT_CONFIG_PATH}
  ui-evidence install --sync`,
  discover: `ui-evidence discover

Usage:
  ui-evidence discover [--format json|yaml] [--config-only]

Examples:
  ui-evidence discover --format json
  ui-evidence discover --config-only --format yaml`,
  doctor: `ui-evidence doctor

Usage:
  ui-evidence doctor [--config <path>] [--before-ref <ref>] [--ready|--deep] [--scope <id>] [--stage <id[,id...]>] [--screens <id[,id...]>] [--profile <id>] [--params <k=v,...>] [--json]

Examples:
  ui-evidence doctor --config ${DEFAULT_CONFIG_PATH}
  ui-evidence doctor --config ${DEFAULT_CONFIG_PATH} --ready --stage primary-flow`,
  capture: `ui-evidence capture

Usage:
  ui-evidence capture --phase before|after [--config <path>] [--stage <id[,id...]>|all] [--screens <id[,id...]>] [--viewports <id[,id...]>] [--profile <id>] [--params <k=v,...>] [--base-url <url>] [--resume] [--quiet] [--summary]

Examples:
  ui-evidence capture --phase after --stage primary-flow
  ui-evidence capture --phase before --stage primary-flow --base-url http://127.0.0.1:3100
  ui-evidence capture --phase after --profile mobile-en --params variant=core`,
  compare: `ui-evidence compare

Usage:
  ui-evidence compare [--config <path>] [--stage <id[,id...]>|all] [--overview-viewport <id>]

Examples:
  ui-evidence compare --stage primary-flow
  ui-evidence compare --stage primary-flow --overview-viewport desktop-1440`,
  report: `ui-evidence report

Usage:
  ui-evidence report [--config <path>] [--stage <id[,id...]>|all] [--screens <id[,id...]>] [--viewports <id[,id...]>] [--profile <id>] [--params <k=v,...>] [--language <code>]

Examples:
  ui-evidence report --stage primary-flow --language en
  ui-evidence report --stage primary-flow --language ko`,
  review: `ui-evidence review

Usage:
  ui-evidence review [--config <path>] [--stage <id[,id...]>|all] [--screens <id[,id...]>] [--viewports <id[,id...]>] [--profile <id>] [--params <k=v,...>] [--language <code>]

Examples:
  ui-evidence review --stage primary-flow`,
  snapshot: `ui-evidence snapshot

Usage:
  ui-evidence snapshot [--config <path>] [--scope <id>] [--stage <id[,id...]>|all] [--screens <id[,id...]>] [--viewports <id[,id...]>] [--profile <id>] [--params <k=v,...>] [--base-url <url>] [--label <slug>] [--language <code>] [--skip-ready] [--quiet] [--summary] [--show-server-log-on-fail]

Examples:
  ui-evidence snapshot --scope design-system-rollout
  ui-evidence snapshot --stage primary-flow --screens home,checkout --label current-ui`,
  run: `ui-evidence run

Usage:
  ui-evidence run [--config <path>] [--stage <id[,id...]>|all] [--screens <id[,id...]>] [--viewports <id[,id...]>] [--profile <id>] [--params <k=v,...>] [--before-ref <ref>] [--before-base-url <url>] [--after-base-url <url>] [--before-attach <url>] [--after-attach <url>] [--resume] [--skip-ready] [--skip-before] [--skip-after] [--skip-compare] [--skip-report] [--skip-review] [--quiet] [--summary] [--show-server-log-on-fail]

Examples:
  ui-evidence run --stage primary-flow
  ui-evidence run --stage primary-flow --before-ref main
  ui-evidence run --stage primary-flow --after-attach http://127.0.0.1:3100 --resume`,
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
