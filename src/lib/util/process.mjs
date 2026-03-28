import { once } from 'node:events';
import { spawn, spawnSync } from 'node:child_process';

function createLogBuffer(limit = 200) {
  const lines = [];
  return {
    push(chunk) {
      const nextLines = String(chunk)
        .split(/\r?\n/)
        .filter(Boolean);
      lines.push(...nextLines);
      if (lines.length > limit) {
        lines.splice(0, lines.length - limit);
      }
    },
    tail(count = 40) {
      return lines.slice(-count).join('\n');
    },
  };
}

function pipeChildOutput(child, label, options = {}) {
  const streamOutput = options.streamOutput !== false;
  const buffer = createLogBuffer(options.logLimit ?? 200);
  child.__uiEvidenceLogBuffer = buffer;

  const handleChunk = (stream, chunk) => {
    buffer.push(chunk);
    if (!label || !streamOutput) {
      return;
    }
    stream.write(`[${label}] ${chunk}`);
  };

  child.stdout?.on('data', (chunk) => handleChunk(process.stdout, chunk));
  child.stderr?.on('data', (chunk) => handleChunk(process.stderr, chunk));
}

export function runCommand(command, options = {}) {
  const {
    cwd,
    env,
    label,
    input = null,
    streamOutput,
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

    pipeChildOutput(child, label, { streamOutput });

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
    streamOutput,
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

    pipeChildOutput(child, label, { streamOutput });

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
  const { cwd, env, label, streamOutput } = options;
  const detached = process.platform !== 'win32';
  const child = spawn(command, {
    cwd,
    env: {
      ...process.env,
      ...env,
    },
    shell: true,
    detached,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.__uiEvidenceDetached = detached;
  pipeChildOutput(child, label, { streamOutput });
  return child;
}

export async function stopChildProcess(child) {
  if (!child) {
    return;
  }

  if (child.exitCode !== null || child.signalCode) {
    return;
  }

  try {
    if (child.__uiEvidenceDetached && child.pid) {
      process.kill(-child.pid, 'SIGTERM');
    } else {
      child.kill('SIGTERM');
    }
  } catch {
    // Process already exited.
  }
  const exitPromise = once(child, 'exit').catch(() => {});
  const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 5_000));
  await Promise.race([exitPromise, timeoutPromise]);

  if (child.exitCode === null && !child.signalCode) {
    try {
      if (child.__uiEvidenceDetached && child.pid) {
        process.kill(-child.pid, 'SIGKILL');
      } else {
        child.kill('SIGKILL');
      }
    } catch {
      // Process already exited.
    }
  }
}

export function getChildProcessLogTail(child, count = 40) {
  return child?.__uiEvidenceLogBuffer?.tail(count) ?? '';
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
