// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as path from 'node:path';

import {GEN_DIR, SOURCE_ROOT} from '../conductor/paths.js';
import {loadTests, TestConfig} from '../conductor/test_config.js';
import {run} from '../shared/run-mocha.js';

void run({
  allowUncaught: false,
  require: [
    path.join(SOURCE_ROOT, 'node_modules', 'source-map-support', 'register.js'),
    path.join(GEN_DIR, 'test', 'api', 'mocha_hooks.js'),
  ],
  spec: loadTests(path.join(GEN_DIR, 'front_end'), 'api_tests.txt'),
  timeout: TestConfig.debug ? 0 : 10_000,
  reporter: path.join(path.dirname(__dirname), 'shared', 'mocha-resultsdb-reporter.js'),
  retries: TestConfig.retries,
  suiteName: 'api',
  ui: path.join(GEN_DIR, 'test', 'api', 'mocha-interface.js') as 'bdd',
  slow: 1000,
  ...TestConfig.mochaGrep,
});
