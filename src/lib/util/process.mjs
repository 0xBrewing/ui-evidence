import { once } from 'node:events';
import { spawn, spawnSync } from 'node:child_process';

function pipeChildOutput(child, label) {
  if (!label) {
    return;
  }

  child.stdout?.on('data', (chunk) => process.stdout.write(`[${label}] ${chunk}`));
  child.stderr?.on('data', (chunk) => process.stderr.write(`[${label}] ${chunk}`));
}

export function runCommand(command, options = {}) {
  const {
    cwd,
    env,
    label,
    input = null,
  } = options;

  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      cwd,
      env: {
        ...process.env,
        ...env,
      },
      shell: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    pipeChildOutput(child, label);

    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve({ code, stdout, stderr });
        return;
      }
      reject(new Error(`Command failed (${code}): ${command}\n${stderr || stdout}`.trim()));
    });

    if (input) {
      child.stdin?.write(input);
    }
    child.stdin?.end();
  });
}

export function runCommandArgs(file, args = [], options = {}) {
  const {
    cwd,
    env,
    label,
    input = null,
  } = options;

  return new Promise((resolve, reject) => {
    const child = spawn(file, args, {
      cwd,
      env: {
        ...process.env,
        ...env,
      },
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    pipeChildOutput(child, label);

    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve({ code, stdout, stderr });
        return;
      }
      const description = [file, ...args].join(' ');
      reject(new Error(`Command failed (${code}): ${description}\n${stderr || stdout}`.trim()));
    });

    if (input) {
      child.stdin?.write(input);
    }
    child.stdin?.end();
  });
}

export function spawnCommand(command, options = {}) {
  const { cwd, env, label } = options;
  const child = spawn(command, {
    cwd,
    env: {
      ...process.env,
      ...env,
    },
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  pipeChildOutput(child, label);
  return child;
}

export async function stopChildProcess(child) {
  if (!child) {
    return;
  }

  child.kill('SIGTERM');
  const exitPromise = once(child, 'exit').catch(() => {});
  const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 5_000));
  await Promise.race([exitPromise, timeoutPromise]);
  if (!child.killed) {
    child.kill('SIGKILL');
  }
}

export function runCommandSync(file, args, options = {}) {
  return spawnSync(file, args, {
    cwd: options.cwd,
    env: {
      ...process.env,
      ...options.env,
    },
    encoding: 'utf8',
  });
}
