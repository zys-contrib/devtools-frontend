// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as path from 'node:path';

import {SOURCE_ROOT} from '../conductor/paths.js';
import {loadTests, TestConfig} from '../conductor/test_config.js';
import {run} from '../shared/run-mocha.js';
TestConfig.isPerfTest = true;

const spec = loadTests(__dirname);
spec.unshift(path.join(__dirname, 'setup', 'test_setup.js'));

void run({
  spec,
  require: [
    path.join(path.dirname(__dirname), 'perf', 'setup', 'test_setup.js'),
    path.join(path.dirname(__dirname), 'e2e', 'conductor', 'mocha_hooks.js'),
    path.join(SOURCE_ROOT, 'node_modules', 'source-map-support', 'register.js'),
  ],
  timeout: TestConfig.debug ? 0 : 30_000,
  retries: TestConfig.retries,
  reporter: path.join(path.dirname(__dirname), 'shared', 'mocha-resultsdb-reporter.js'),
  suiteName: 'perf',
  ui: path.join(path.dirname(__dirname), 'e2e', 'conductor', 'mocha-interface.js') as 'bdd',
  slow: 1000,
  ...TestConfig.mochaGrep,
});
