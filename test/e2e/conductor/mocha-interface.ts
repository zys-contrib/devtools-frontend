// Copyright 2024 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {
  createMochaInterface,
} from '../../conductor/mocha-interface.js';

import {type E2EState, StateProvider} from './state-provider.js';

const devtoolsTestInterface = createMochaInterface<E2EState, E2E.SuiteSettings>({
  description: 'DevTools test interface',
  stateProvider: StateProvider.instance,
});

module.exports = devtoolsTestInterface;
