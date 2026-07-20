// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as path from 'node:path';

import {SOURCE_ROOT} from '../conductor/paths.js';
import {loadTests, TestConfig} from '../conductor/test_config.js';
import {run} from '../shared/run-mocha.js';

void run({
  // This should make mocha crash on uncaught errors.
  // See https://github.com/mochajs/mocha/blob/master/docs/index.md#--allow-uncaught.
  allowUncaught: true,
  require: [
    path.join(path.dirname(__dirname), 'e2e', 'conductor', 'mocha_hooks.js'),
    path.join(SOURCE_ROOT, 'node_modules', 'source-map-support', 'register.js'),
  ],
  spec: loadTests(__dirname),
  timeout: TestConfig.debug ? 0 : 10_000,
  retries: TestConfig.retries,
  reporter: path.join(path.dirname(__dirname), 'shared', 'mocha-resultsdb-reporter.js'),
  suiteName: 'e2e',
  ui: path.join(path.dirname(__dirname), 'e2e', 'conductor', 'mocha-interface.js') as 'bdd',
  slow: 1000,
  ...TestConfig.mochaGrep,
});
