#!/usr/bin/env node

import { main } from '../src/cli/main.mjs';

await main(process.argv.slice(2));
