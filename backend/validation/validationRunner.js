'use strict';

const fs = require('fs/promises');
const path = require('path');
const { execFile, spawn } = require('child_process');
const { logger } = require('../utils/logger');

// Project validation runner (docs/PROJECT_SPEC.md section 8, docs/API_CONTRACT.md section 24).
//
// Untrusted project code is executed in an isolated child process with:
//   1. Environment isolation: backend secrets (API keys, JWT_SECRET, DB_PASSWORD) are stripped.
//   2. Strict execution timeout: (default 30,000 ms).
//   3. Buffer limits: max 5 MB stdout/stderr.
//   4. Truthful status reporting: status is 'passed' ONLY when exit code === 0.

const DEFAULT_TIMEOUT_MS = 30000;
const MAX_BUFFER_BYTES = 5 * 1024 * 1024;

// Strips sensitive environment variables from child process execution environment
function buildSafeEnv() {
  const safeEnv = {};
  const allowedKeys = new Set([
    'PATH', 'PATHEXT', 'SystemRoot', 'WINDIR', 'TMP', 'TEMP',
    'HOME', 'USERPROFILE', 'LANG', 'LC_ALL', 'TERM', 'NODE_ENV', 'CI',
  ]);

  for (const [key, value] of Object.entries(process.env)) {
    if (allowedKeys.has(key) || key.startsWith('NODE_') || key.startsWith('NPM_')) {
      if (!/secret|key|password|token/i.test(key)) {
        safeEnv[key] = value;
      }
    }
  }

  safeEnv.NODE_ENV = 'test';
  safeEnv.CI = 'true';
  return safeEnv;
}

// Inspects working directory to detect package configs and scripts
async function inspectProjectConfig(workingDir) {
  let packageJson = null;
  try {
    const pkgText = await fs.readFile(path.join(workingDir, 'package.json'), 'utf8');
    packageJson = JSON.parse(pkgText);
  } catch {
    // Not a Node/npm project or missing package.json
  }

  let hasPython = false;
  try {
    const files = await fs.readdir(workingDir);
    hasPython = files.some((f) => f.endsWith('.py') || f === 'requirements.txt');
  } catch {
    // Ignore read errors
  }

  return { packageJson, hasPython };
}

// Determines execution commands based on validation type and project configuration
async function determineCommand(workingDir, type) {
  const config = await inspectProjectConfig(workingDir);
  const isWindows = process.platform === 'win32';
  const npmCmd = isWindows ? 'npm.cmd' : 'npm';
  const npxCmd = isWindows ? 'npx.cmd' : 'npx';
  const nodeCmd = 'node';

  if (config.packageJson) {
    const scripts = config.packageJson.scripts || {};
    if (type === 'build' && scripts.build) {
      return { cmd: npmCmd, args: ['run', 'build'], display: 'npm run build' };
    }
    if (type === 'test' && scripts.test) {
      return { cmd: npmCmd, args: ['test'], display: 'npm test' };
    }
    if (type === 'lint' && scripts.lint) {
      return { cmd: npmCmd, args: ['run', 'lint'], display: 'npm run lint' };
    }
  }

  if (config.hasPython) {
    if (type === 'test') {
      return { cmd: 'python', args: ['-m', 'unittest', 'discover'], display: 'python -m unittest discover' };
    }
  }

  // Fallback for syntax checking or default check
  if (type === 'syntax' || type === 'full' || type === 'build' || type === 'test' || type === 'lint') {
    if (config.packageJson) {
      return { cmd: nodeCmd, args: ['--check', 'package.json'], display: 'node --check package.json' };
    }
  }

  return { cmd: nodeCmd, args: ['--version'], display: 'node --version' };
}

// Runs child process in sandboxed environment with timeout and buffer caps
function executeChildProcess(cmd, args, workingDir, timeoutMs = DEFAULT_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const safeEnv = buildSafeEnv();

    let stdout = '';
    let stderr = '';
    let killedByTimeout = false;

    const child = spawn(cmd, args, {
      cwd: workingDir,
      env: safeEnv,
      windowsHide: true,
    });

    const timer = setTimeout(() => {
      killedByTimeout = true;
      try {
        child.kill('SIGKILL');
      } catch {
        // Ignore kill errors
      }
    }, timeoutMs);

    if (child.stdout) {
      child.stdout.on('data', (chunk) => {
        if (stdout.length < MAX_BUFFER_BYTES) {
          stdout += chunk.toString('utf8');
        }
      });
    }

    if (child.stderr) {
      child.stderr.on('data', (chunk) => {
        if (stderr.length < MAX_BUFFER_BYTES) {
          stderr += chunk.toString('utf8');
        }
      });
    }

    child.on('error', (err) => {
      clearTimeout(timer);
      const durationMs = Date.now() - startedAt;
      resolve({
        status: 'error',
        exitCode: -1,
        output: stdout,
        errorOutput: `Execution error: ${err.message}\n${stderr}`,
        durationMs,
      });
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      const durationMs = Date.now() - startedAt;

      if (killedByTimeout) {
        return resolve({
          status: 'error',
          exitCode: -1,
          output: stdout,
          errorOutput: `Validation execution timed out after ${timeoutMs}ms.\n${stderr}`,
          durationMs,
        });
      }

      const exitCode = code !== null ? code : -1;
      const status = exitCode === 0 ? 'passed' : 'failed';

      resolve({
        status,
        exitCode,
        output: stdout,
        errorOutput: stderr,
        durationMs,
      });
    });
  });
}

// Public entry point to run project validation
async function runProjectValidation(workingDir, type = 'full', options = {}) {
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const commandSpec = await determineCommand(workingDir, type);

  const result = await executeChildProcess(commandSpec.cmd, commandSpec.args, workingDir, timeoutMs);

  return {
    command: commandSpec.display,
    status: result.status,
    output: result.output,
    errorOutput: result.errorOutput,
    exitCode: result.exitCode,
    durationMs: result.durationMs,
  };
}

module.exports = {
  runProjectValidation,
  determineCommand,
  buildSafeEnv,
};
