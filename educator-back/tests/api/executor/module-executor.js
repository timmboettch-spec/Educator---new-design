#!/usr/bin/env node
/* eslint-disable */
/**
 * ============================================================================
 * API MODULE SEQUENTIAL EXECUTOR
 * ============================================================================
 * 
 * Executes API test modules in strict order:
 * 1. loginUser (Auth)
 * 2. school (School)
 * 3. educator (Educator)
 * 4. dashboard (Dashboard)
 * 5. createUser (User)
 * 6. class (Class)
 * 7. student (Student)
 * 8. simulation (Simulation)
 * 9. cleanup (Cleanup - DELETE operations)
 * 
 * Features:
 * - Sequential execution (no parallelization)
 * - Accumulates results across modules
 * - Automatic cleanup execution after all modules
 * - Centralized execution data management
 * - Generates report after each module completes
 * - Handles interruption (Ctrl+C) to generate partial report
 * - Preserves all existing test functionality
 * 
 * ============================================================================
 */

const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

// ============================================================================
// CONFIGURATION
// ============================================================================

const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const TEST_RESULTS_FILE = path.join(PROJECT_ROOT, 'tests/api/reports/.test-results.json');
const EXECUTION_STATE_FILE = path.join(PROJECT_ROOT, 'tests/api/reports/.execution-state.json');
const EXECUTION_DATA_FILE = path.join(PROJECT_ROOT, 'tests/api/test-data/execution-data.json');
const EXECUTION_DATA_DIR = path.dirname(EXECUTION_DATA_FILE);


const HEALTH_CHECK_TIMEOUT_MS = 300000;
const INFRA_HTTP_STATUS_CODES = new Set([502, 503, 504]);
const INFRA_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'ETIMEDOUT',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
]);

/**
 * Ordered list of API modules to execute
 * Order is CRITICAL and must match requirements exactly
 */
const API_MODULES = [
  {
    id: 1,
    name: 'loginUser',
    displayName: 'Auth',
    path: 'tests/api/modules/auth/loginUser.spec.ts',
  },
  {
    id: 2,
    name: 'school',
    displayName: 'School',
    path: 'tests/api/modules/school/school.spec.ts',
  },
  {
    id: 3,
    name: 'educator',
    displayName: 'Educator',
    path: 'tests/api/modules/educator/educator.spec.ts',
  },
  {
    id: 4,
    name: 'dashboard',
    displayName: 'Dashboard',
    path: 'tests/api/modules/dashboard/dashboardoverview.spec.ts',
  },
  {
    id: 5,
    name: 'createUser',
    displayName: 'Create User',
    path: 'tests/api/modules/users/createUser.spec.ts',
  },
  {
    id: 6,
    name: 'class',
    displayName: 'Class',
    path: 'tests/api/modules/class/class.spec.ts',
  },
  {
    id: 7,
    name: 'student',
    displayName: 'Student',
    path: 'tests/api/modules/student/student.spec.ts',
  },
  {
    id: 8,
    name: 'simulation',
    displayName: 'Simulation',
    path: 'tests/api/modules/simulation/simulation.spec.ts',
  },
  {
    id: 9,
    name: 'cleanup',
    displayName: 'Cleanup',
    path: 'tests/api/modules/delete/delete.spec.ts',
    isCleanup: true,
  },
];

// ============================================================================
// FAIL-FAST HEALTH CHECK
// ============================================================================

/**
 * Resolve base URL from environment with safe defaults.
 */
function getApiBaseUrl() {
  const env = (process.env.NODE_ENV || 'desssv').toLowerCase();

  if (process.env.API_BASE_URL) {
    return process.env.API_BASE_URL;
  }

  if (process.env.BASE_URL) {
    return process.env.BASE_URL;
  }

  if (env === 'production') {
    return 'https://educatorbe.realityworksai.com/api';
  }

  if (env === 'qa') {
    return 'https://qa.educatorbe.realityworksai.com/api';
  }

  return 'https://dev.educatorbe.realityworksai.com/api';
}

/**
 * Build backend health endpoint from configured API base URL.
 * Example: https://host/api -> https://host/healthz
 */
function getHealthCheckUrl(baseUrl) {
  try {
    const parsed = new URL(baseUrl);
    return `${parsed.origin}/healthz`;
  } catch {
    return `${String(baseUrl || '').replace(/\/+$/, '')}/healthz`;
  }
}

/**
 * Extract low-level network/system code from nested fetch errors.
 */
function getErrorCode(error) {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  const err = error;
  return err.code || err.errno || err?.cause?.code || err?.cause?.errno;
}

/**
 * Detect infra/connectivity failures that must stop execution immediately.
 */
function isInfrastructureFailure(error, statusCode) {
  if (typeof statusCode === 'number' && INFRA_HTTP_STATUS_CODES.has(statusCode)) {
    return true;
  }

  if (!error) {
    return false;
  }

  if (error.name === 'AbortError') {
    return true;
  }

  const code = getErrorCode(error);
  return typeof code === 'string' && INFRA_ERROR_CODES.has(code);
}

/**
 * Reusable health check utility used before every module execution.
 */
async function runHealthCheck(moduleDisplayName) {
  const baseUrl = getApiBaseUrl();
  const healthUrl = getHealthCheckUrl(baseUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);

  try {
    const response = await fetch(healthUrl, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'Accept': 'application/json, text/plain, */*',
      },
    });

    const statusCode = response.status;
    if (isInfrastructureFailure(null, statusCode)) {
      return {
        ok: false,
        reason: `Health check returned ${statusCode} (${response.statusText || 'Upstream unavailable'})`,
        baseUrl,
        healthUrl,
      };
    }

    // Any non-infra HTTP response means backend is reachable.
    return {
      ok: true,
      baseUrl,
      healthUrl,
      moduleDisplayName,
      statusCode,
    };
  } catch (error) {
    if (!isInfrastructureFailure(error, undefined)) {
      // Unknown runtime error is treated as non-infra here to avoid false fail-fast.
      return {
        ok: true,
        baseUrl,
        healthUrl,
        moduleDisplayName,
      };
    }

    const code = getErrorCode(error);
    const errorLabel = error.name === 'AbortError'
      ? `timeout after ${HEALTH_CHECK_TIMEOUT_MS}ms`
      : (code || error.message || 'unknown network error');

    return {
      ok: false,
      reason: `Health check failed with ${errorLabel}`,
      baseUrl,
      healthUrl,
    };
  } finally {
    clearTimeout(timeout);
  }
}

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

/**
 * Initialize execution state tracking
 */
function initializeExecutionState() {
  const state = {
    startTime: new Date().toISOString(),
    completedModules: [],
    interruptedAt: null,
    isInterrupted: false,
  };
  fs.writeFileSync(EXECUTION_STATE_FILE, JSON.stringify(state, null, 2));
  return state;
}

/**
 * Load execution state
 */
function loadExecutionState() {
  if (fs.existsSync(EXECUTION_STATE_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(EXECUTION_STATE_FILE, 'utf-8'));
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Update execution state with completed module
 */
function markModuleComplete(moduleName) {
  const state = loadExecutionState() || initializeExecutionState();
  if (!state.completedModules.includes(moduleName)) {
    state.completedModules.push(moduleName);
  }
  fs.writeFileSync(EXECUTION_STATE_FILE, JSON.stringify(state, null, 2));
}

/**
 * Mark execution as interrupted
 */
function markExecutionInterrupted() {
  const state = loadExecutionState() || initializeExecutionState();
  state.isInterrupted = true;
  state.interruptedAt = new Date().toISOString();
  fs.writeFileSync(EXECUTION_STATE_FILE, JSON.stringify(state, null, 2));
}

/**
 * Mark execution as complete with end time and duration
 */
function markExecutionComplete() {
  const state = loadExecutionState() || initializeExecutionState();
  const endTime = new Date().toISOString();
  const startTime = new Date(state.startTime);
  const endDate = new Date(endTime);
  const durationMs = endDate.getTime() - startTime.getTime();
  
  state.endTime = endTime;
  state.durationMs = durationMs;
  state.isInterrupted = false;
  fs.writeFileSync(EXECUTION_STATE_FILE, JSON.stringify(state, null, 2));
}

// ============================================================================
// EXECUTION DATA MANAGEMENT
// ============================================================================

/**
 * Initialize execution data file
 * Called at the start of test execution
 */
function initializeExecutionData() {
  try {
    // Ensure directory exists
    if (!fs.existsSync(EXECUTION_DATA_DIR)) {
      fs.mkdirSync(EXECUTION_DATA_DIR, { recursive: true });
    }

    const executionData = {
      executionId: new Date().toISOString(),
      startTime: new Date().toISOString(),
      status: 'in-progress',
      auth: {},
      entities: {
        school: { created: [], deleted: [], deletedCount: 0, failedCount: 0 },
        educator: { created: [], deleted: [], deletedCount: 0, failedCount: 0 },
        class: { created: [], deleted: [], deletedCount: 0, failedCount: 0 },
        student: { created: [], deleted: [], deletedCount: 0, failedCount: 0 },
        simulation: { created: [], deleted: [], deletedCount: 0, failedCount: 0 },
      },
      cleanup: { status: 'pending', results: [] },
    };

    fs.writeFileSync(EXECUTION_DATA_FILE, JSON.stringify(executionData, null, 2));
  } catch (error) {
    console.error('Failed to initialize execution data:', error.message);
  }
}

function finalizeExecutionData() {
  try {
    if (!fs.existsSync(EXECUTION_DATA_FILE)) {
      return;
    }

    const data = JSON.parse(fs.readFileSync(EXECUTION_DATA_FILE, 'utf-8'));
    data.endTime = new Date().toISOString();
    data.status = 'completed';

    if (data.cleanup.results.length > 0) {
      data.cleanup.status = 'completed';
      data.cleanup.endTime = new Date().toISOString();
    }

    fs.writeFileSync(EXECUTION_DATA_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Failed to finalize execution data:', error.message);
  }
}

function mergeTestResults(tempResultsFile) {
  if (!fs.existsSync(tempResultsFile)) {
    return;
  }

  try {
    const newResults = JSON.parse(fs.readFileSync(tempResultsFile, 'utf-8'));
    let allResults = { testResults: [] };

    if (fs.existsSync(TEST_RESULTS_FILE)) {
      allResults = JSON.parse(fs.readFileSync(TEST_RESULTS_FILE, 'utf-8'));
    }

    if (newResults.testResults && Array.isArray(newResults.testResults)) {
      allResults.testResults = [
        ...(allResults.testResults || []),
        ...newResults.testResults,
      ];
    }

    // Preserve summary info from latest run
    if (newResults.success !== undefined) {
      allResults.success = newResults.success;
    }
    if (newResults.numTotalTestSuites !== undefined) {
      allResults.numTotalTestSuites = newResults.numTotalTestSuites;
    }
    if (newResults.numTotalTests !== undefined) {
      allResults.numTotalTests = newResults.numTotalTests;
    }

    fs.writeFileSync(TEST_RESULTS_FILE, JSON.stringify(allResults, null, 2));
  } catch (error) {
    console.error('Failed to merge results:', error.message);
  }
}
let currentChildProcess = null;

function executeModule(module) {
  return new Promise((resolve) => {
    const tempResultsFile = path.join(PROJECT_ROOT, `tests/api/reports/.test-results-${module.id}.json`);

    const jestArgs = [
      'jest',
      '--config',
      'tests/api/jest.config.ts',
      '--runInBand',
      '--forceExit',
      module.path,
      '--json',
      `--outputFile=${tempResultsFile}`,
    ];

    const env = Object.assign({}, process.env, {
      API_ENV: process.env.NODE_ENV || 'development',
    });

    const child = spawn('npx', jestArgs, {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
      shell: true,
      env,
    });

    // Store reference to current child process
    currentChildProcess = child;

    // Set timeout to force kill if process hangs
    const timeout = setTimeout(() => {
      if (child.exitCode === null) {
        child.kill('SIGKILL');
      }
    }, 180000); // 180 second timeout

    child.on('close', (exitCode) => {
      clearTimeout(timeout);
      currentChildProcess = null;
      mergeTestResults(tempResultsFile);
      if (fs.existsSync(tempResultsFile)) {
        fs.unlinkSync(tempResultsFile);
      }

      markModuleComplete(module.name);

      const modulesPassed = exitCode === 0 || exitCode === null;

      resolve({
        module,
        passed: modulesPassed,
        exitCode: exitCode ?? 1,
      });
    });

    child.on('error', () => {
      clearTimeout(timeout);
      currentChildProcess = null;
      resolve({
        module,
        passed: false,
        exitCode: 1,
      });
    });
  });
}

function generateReport(isInterrupted = false) {
  const reportScript = path.join(__dirname, 'generate-report.js');
  const result = spawnSync('node', [reportScript], {
    cwd: PROJECT_ROOT,
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      IS_INTERRUPTED: isInterrupted ? 'true' : 'false',
      EXECUTION_STATE_FILE: EXECUTION_STATE_FILE,
    },
  });

  return result.status === 0;
}


async function main() {

  // Initialize fresh state
  initializeExecutionState();

  // Initialize execution data
  initializeExecutionData();

  // Clear previous test results
  if (fs.existsSync(TEST_RESULTS_FILE)) {
    fs.unlinkSync(TEST_RESULTS_FILE);
  }

  const executionResults = [];
  let executionAborted = false;

  
  process.on('SIGINT', () => {
    markExecutionInterrupted();
    executionAborted = true;

    if (currentChildProcess) {
      currentChildProcess.kill('SIGTERM');
    }
    process.exit(130);
  });

  process.on('SIGTERM', () => {
    markExecutionInterrupted();
    executionAborted = true;

    if (currentChildProcess) {
      currentChildProcess.kill('SIGTERM');
    }
    generateReport(true);
    process.exit(143);
  });

  
  for (const module of API_MODULES) {
    if (executionAborted) break;

    const health = await runHealthCheck(module.displayName);
    if (!health.ok) {
      console.error('\n' + '='.repeat(70));
      console.error('FAIL-FAST TRIGGERED: BACKEND INFRASTRUCTURE UNAVAILABLE');
      console.error('='.repeat(70));
      console.error(`Module: ${module.displayName}`);
      console.error(`Base URL: ${health.baseUrl}`);
      console.error(`Health URL: ${health.healthUrl}`);
      console.error(`Reason: ${health.reason}`);
      console.error('Action: Execution terminated immediately to prevent long timeout waits.');
      console.error('='.repeat(70) + '\n');

      markExecutionInterrupted();
      executionAborted = true;
      process.exit(1);
    }

    const result = await executeModule(module);
    executionResults.push(result);
  }

  const functionalModules = executionResults.filter((r) => !r.module.isCleanup);

  finalizeExecutionData();
  markExecutionComplete();
  generateReport(false);
  const anyFailures = functionalModules.some((r) => r.exitCode !== 0);
  process.exit(anyFailures ? 1 : 0);
}
main().catch(() => {
  process.exit(1);
});
