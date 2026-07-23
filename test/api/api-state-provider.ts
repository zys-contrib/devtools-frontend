// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import type * as Mocha from 'mocha';

import type {TestStateProvider} from '../conductor/mocha-interface-helpers.js';
import {StateProvider} from '../e2e/conductor/state-provider.js';
import {setupInspectedPage} from '../e2e/shared/target-helper.js';

import {createTargetUniverse} from './TargetUniverse.js';

export class ApiStateProvider implements TestStateProvider<API.State, unknown> {
  static instance = new ApiStateProvider();

  async prepareSuite(suite: Mocha.Suite): Promise<void> {
    await StateProvider.instance.resolveBrowser(suite);
  }

  async resolveBrowser(suite?: Mocha.Suite): Promise<void> {
    if (suite) {
      await StateProvider.instance.resolveBrowser(suite);
    }
  }

  async createState(suite: Mocha.Suite): Promise<API.State> {
    await this.prepareSuite(suite);
    const browserWrapper = suite.browser;
    if (!browserWrapper || !browserWrapper.connected) {
      throw new Error('Browser disconnected unexpectedly');
    }
    const browser = browserWrapper.browser;

    const browsingContext = await browser.createBrowserContext();
    const inspectedPage = await setupInspectedPage(browsingContext, StateProvider.serverPort);
    await inspectedPage.goTo(`${inspectedPage.domain()}/test/e2e/resources/empty.html`);
    const session = await inspectedPage.page.createCDPSession();

    const targetUniverse = await createTargetUniverse(session);

    const state: API.State = {
      inspectedPage,
      universe: targetUniverse.universe,
    };
    return state;
  }

  async cleanupState(state: API.State): Promise<void> {
    try {
      await state.inspectedPage.page.browserContext().close();
    } catch (e) {
      console.error('Unexpected error during cleanup', e);
    }
  }

  async closeBrowser() {
    await StateProvider.instance.closeBrowsers();
  }
}
