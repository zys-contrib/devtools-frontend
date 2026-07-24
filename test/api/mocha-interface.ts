// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {createMochaInterface} from '../conductor/mocha-interface.js';

import {ApiStateProvider} from './api-state-provider.js';

export const devtoolsApiTestInterface = createMochaInterface<API.State, API.SuiteSettings>({
  description: 'DevTools API test interface',
  stateProvider: ApiStateProvider.instance,
});
