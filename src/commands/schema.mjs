import { readFile } from 'node:fs/promises';
import { SCHEMA_PATH } from '../config/load-config.mjs';

export async function handleSchema(options) {
  if (options.print) {
    process.stdout.write(await readFile(SCHEMA_PATH, 'utf8'));
    return;
  }

  console.log(SCHEMA_PATH);
}
