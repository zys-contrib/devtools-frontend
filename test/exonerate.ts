// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/* eslint-disable no-console */

import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

function getInvocationId(): string|null {
  if (!process.env.LUCI_CONTEXT) {
    return null;
  }
  try {
    const luciConfig = fs.readFileSync(process.env.LUCI_CONTEXT, 'utf8');
    const resultdb = JSON.parse(luciConfig)['resultdb'];
    if (resultdb && resultdb.current_invocation && resultdb.current_invocation.name) {
      const name: string = resultdb.current_invocation.name;
      if (name.startsWith('invocations/')) {
        return name.slice('invocations/'.length);
      }
      return name;
    }
  } catch (err) {
    console.error('Failed to read LUCI_CONTEXT', err);
  }
  return null;
}

function runCommand(exe: string, args: string[]): number|null {
  const result = childProcess.spawnSync(exe, args, {
    stdio: 'inherit',
    encoding: 'utf-8',
  });
  return result.status;
}

function queryFailedTests(invocationId: string): Map<string, number> {
  const result = childProcess.spawnSync('rdb', ['query', invocationId, '-json', '-u'], {
    encoding: 'utf-8',
  });
  if (result.status !== 0) {
    console.error('rdb query failed:', result.stderr || result.stdout);
    process.exit(1);
  }

  const failedTests = new Map<string, number>();
  for (const line of result.stdout.split('\n').filter(Boolean)) {
    try {
      const parsed = JSON.parse(line);
      const testId = parsed.testResult?.testId;
      if (testId) {
        failedTests.set(testId, (failedTests.get(testId) ?? 0) + 1);
      }
    } catch (err) {
      console.error('Failed to parse rdb query output line:', err, line);
      process.exit(1);
    }
  }
  return failedTests;
}

function getTestFilename(testId: string): string|null {
  const colonIndex = testId.indexOf(':');
  if (colonIndex <= 0) {
    return null;
  }

  const file = testId.substring(0, colonIndex);
  if (file.startsWith('e2e/') || file.startsWith('perf/') || file.startsWith('shared/')) {
    return 'test/' + file;
  }
  if (file.startsWith('unit/')) {
    return file.substring('unit/'.length);
  }
  return file;
}

function buildGrepRegex(failedTests: string[]): string {
  const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return failedTests
      .map(testId => {
        const parts = testId.split('/');
        // The testId includes the suitePrefix (e.g. 'e2e', 'perf', 'unit') which is NOT part
        // of the Mocha fullTitle. We must strip it to fully match the test name.
        if (['e2e', 'perf', 'unit'].includes(parts[0])) {
          parts.shift();
        }
        // Mocha's fullTitle joins the title path elements with a space, but we use .*
        // to handle any slashes that were flattened into testId.
        // We anchor with ^ and $ to ensure it fully matches the test name.
        return '^' + parts.map(escapeRegExp).join('.*') + '$';
      })
      .join('|');
}

function buildRetryArgs(originalArgs: string[], failedTests: string[], grepRegex: string): string[] {
  const retryFiles = new Set<string>();
  for (const testId of failedTests) {
    const file = getTestFilename(testId);
    if (file) {
      retryFiles.add(file);
    }
  }

  const isPathArg = (a: string) => a.startsWith('test/') || a.startsWith('front_end/');

  // Strip out original positional path arguments to avoid re-parsing the entire suite
  const filteredArgs = originalArgs.filter(a => !isPathArg(a));

  // If we couldn't extract any specific files, fall back to the original path arguments
  const positionalFiles = retryFiles.size > 0 ? Array.from(retryFiles) : originalArgs.filter(isPathArg);

  return [...filteredArgs, ...positionalFiles, '--grep', grepRegex];
}

/**
 * TODO: retry logic will be simplified after the switch to test IDs.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const exe = process.argv[0];  // node
  const runJsPath = path.join(__dirname, 'run.js');
  const exeArgs = [runJsPath, ...args];

  console.log(`Running initial tests: ${exe} ${exeArgs.join(' ')}`);
  const status = runCommand(exe, exeArgs);

  if (status === 0) {
    console.log('Tests passed.');
    process.exit(0);
  }

  const invocationId = getInvocationId();
  if (!invocationId) {
    console.error('Tests failed and no LUCI_CONTEXT / invocation ID found. Cannot exonerate.');
    process.exit(status ?? 1);
  }

  console.log(`Tests failed. Querying rdb for failed tests in invocation ${invocationId}...`);
  let failCounts = queryFailedTests(invocationId);
  let testsToRetry = Array.from(failCounts.keys());

  if (testsToRetry.length === 0) {
    console.log('No failed tests found in rdb query. Cannot exonerate.');
    process.exit(status ?? 1);
  }

  const MAX_RETRIES = 3;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    console.log(`\n--- Exoneration attempt ${attempt}/${MAX_RETRIES} ---`);
    console.log(`Found ${testsToRetry.length} failed test(s) to retry:`);
    for (const test of testsToRetry) {
      console.log(` - ${test}`);
    }

    const grepRegex = buildGrepRegex(testsToRetry);
    const retryArgs = [runJsPath, ...buildRetryArgs(args, testsToRetry, grepRegex)];

    console.log(`\nRetrying with grep: ${grepRegex}`);
    const retryStatus = runCommand(exe, retryArgs);

    if (retryStatus === 0) {
      console.log(`Retry attempt ${attempt} passed! All tests exonerated.`);
      process.exit(0);
    }

    let newFailCounts = queryFailedTests(invocationId);

    // ResultDB SinkServer buffers results and flushes them asynchronously.
    // Since we know retryStatus !== 0, at least one test must have failed again.
    // If we don't see any new failures yet, wait a bit and query again.
    let pollRetries = 0;
    while (pollRetries < 10) {
      const hasNewFailures =
          Array.from(newFailCounts.entries()).some(([testId, count]) => count > (failCounts.get(testId) ?? 0));
      if (hasNewFailures) {
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
      newFailCounts = queryFailedTests(invocationId);
      pollRetries++;
    }

    testsToRetry = testsToRetry.filter(testId => (newFailCounts.get(testId) ?? 0) > (failCounts.get(testId) ?? 0));
    failCounts = newFailCounts;

    if (testsToRetry.length === 0) {
      console.log('No failed tests remain. All tests exonerated!');
      process.exit(0);
    }

    console.log(`Retry attempt ${attempt} failed.`);
    if (attempt === MAX_RETRIES) {
      console.error(`Max retries (${MAX_RETRIES}) reached. Exiting with failure.`);
      process.exit(retryStatus ?? 1);
    }
  }
}

void main();
