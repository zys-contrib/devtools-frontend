// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import type * as Mocha from 'mocha';

import {duplicateTests, pruneSuite} from '../../front_end/testing/MochaHelpers.js';
import {computeBuildTestId} from '../../front_end/testing/TestIdGeneration.js';

import {installDevtoolsBdd} from './mocha-interface.js';

interface KarmaResult {
  id: string;
  description: string;
  suite: string[];
  success: boolean;
  skipped: boolean;
  pending: boolean;
  time: number;
  log: string[];
  assertionErrors: AssertionError[];
  mocha: Record<string, unknown>;
}

interface AssertionError {
  name: string;
  message: string;
  showDiff: boolean;
  actual?: string;
  expected?: string;
}

const errorsSymbol = Symbol('errors');
const assertionErrorsSymbol = Symbol('assertionErrors');
const endedSymbol = Symbol('ended');

interface TestExt extends Mocha.Runnable {
  [errorsSymbol]?: string[];
  [assertionErrorsSymbol]?: AssertionError[];
  [endedSymbol]?: boolean;
  type?: string;
}

const karma = window.__karma__;
const mocha = window.mocha;

const karmaMochaConfig = karma.config.mocha || {};
const mochaConfig: Record<string, unknown> = {
  ui: 'bdd',
  ...karmaMochaConfig,
};
// Remove opts mocha does not support.
delete mochaConfig.expose;
delete mochaConfig.require;

mochaConfig.reporter = function() {};
mocha.setup(mochaConfig);
installDevtoolsBdd();

const formatError = (error: Error): string => {
  let {stack} = error;
  const message = error.message;
  if (stack) {
    if (message && !stack.includes(message)) {
      stack = message + '\n' + stack;
    }
    return stack;
  }
  return message;
};

const processAssertionError =
    (error: Error&{showDiff?: boolean, actual?: unknown, expected?: unknown}): AssertionError|undefined => {
      if ('showDiff' in error) {
        const assertionError: AssertionError = {
          name: error.name,
          message: error.message,
          showDiff: Boolean(error.showDiff),
        };
        if (error.showDiff && mocha.utils) {
          assertionError.actual = mocha.utils.stringify(error.actual);
          assertionError.expected = mocha.utils.stringify(error.expected);
        }
        return assertionError;
      }
      return undefined;
    };

const reportTestResult = (test: TestExt) => {
  const result: KarmaResult = {
    id: '',
    description: test.title,
    suite: [],
    success: test.state === 'passed',
    skipped: test.pending === true,
    pending: test.pending === true,
    time: test.duration || 0,
    log: test[errorsSymbol] || [],
    assertionErrors: test[assertionErrorsSymbol] || [],
    mocha: {},
  };

  let parent = test.parent;
  while (parent && !parent.root) {
    result.suite.unshift(parent.title);
    parent = parent.parent;
  }

  if (karma.config.mocha?.expose) {
    for (const prop of karma.config.mocha.expose) {
      if (prop in test) {
        result.mocha[prop] = test[prop as keyof typeof test];
      }
    }
  }

  karma.result(result);
};

karma.start = () => {
  const reportedTests = new Set<TestExt>();
  const failedSuites = new Set<Mocha.Suite>();
  const testIds = new Set(karma.config.testIds);
  const seenTestIds = new Set<string>();

  function shouldIncludeTest(test: Mocha.Test) {
    if (!test.file) {
      throw new Error(`Test ${test.titlePath()} does not have a file.`);
    }
    const testId = computeBuildTestId(test.file, test.titlePath());
    if (seenTestIds.has(testId)) {
      throw new Error(`Duplicate test ${testId}`);
    }
    seenTestIds.add(testId);
    if (testIds.size === 0) {
      return true;
    }
    return testIds.has(testId);
  }

  pruneSuite(mocha.suite, shouldIncludeTest);

  duplicateTests(mocha.suite, karma.config.repetitions);

  const runner = mocha.run(() => {
    // Find all tests that were never reported (e.g. because Mocha aborted on a hook failure)
    const reportUnrunTests = (suite: Mocha.Suite, hasFailedHook: boolean) => {
      const suiteFailed = hasFailedHook || failedSuites.has(suite);
      suite.tests.forEach((t: Mocha.Test) => {
        const testExt = t as TestExt;
        if (suiteFailed && !reportedTests.has(testExt)) {
          testExt[errorsSymbol] ??= [];
          testExt[errorsSymbol].push(`Test skipped due to hook failure`);
          reportedTests.add(testExt);
          reportTestResult(testExt);
        }
      });
      suite.suites.forEach(s => reportUnrunTests(s, suiteFailed));
    };
    if (runner.suite) {
      reportUnrunTests(runner.suite, false);
    }
    karma.complete({coverage: window.__coverage__});
  });

  runner.on('start', () => {
    karma.info({total: runner.total});
  });

  runner.on('test', (test: TestExt) => {
    test[errorsSymbol] = [];
    test[assertionErrorsSymbol] = [];
  });

  runner.on('fail', (test: TestExt, error: Error) => {
    let targetTest = test;
    if (test.type === 'hook') {
      if (test.parent) {
        failedSuites.add(test.parent);
      }
      targetTest = (test.ctx?.currentTest ?? test) as TestExt;
      targetTest.state = 'failed';
      targetTest.type ??= 'test';
    }

    const simpleError = test.type === 'hook' ? `(failed in ${test.title})\n${formatError(error)}` : formatError(error);
    const assertionError = processAssertionError(error);

    targetTest[errorsSymbol] ??= [];
    targetTest[errorsSymbol].push(simpleError);
    if (assertionError) {
      targetTest[assertionErrorsSymbol] ??= [];
      targetTest[assertionErrorsSymbol].push(assertionError);
    }

    if (test.type === 'hook' || targetTest[endedSymbol]) {
      reportedTests.add(targetTest);
      reportTestResult(targetTest);
    }
  });

  runner.on('test end', (test: TestExt) => {
    test[endedSymbol] = true;
    if (!reportedTests.has(test)) {
      reportedTests.add(test);
      reportTestResult(test);
    }
  });
};
