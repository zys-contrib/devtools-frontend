// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {assert} from 'chai';

import * as SDK from '../core/sdk/sdk.js';

describe('Universe API Test', () => {
  describe('ConsoleModel', () => {
    it('receives console messages emitted from inspected page in universe ConsoleModel',
       async ({inspectedPage, universe}) => {
         assert.isNotNull(universe);

         const primaryTarget = universe.targetManager.primaryPageTarget();
         assert.isNotNull(primaryTarget, 'Primary page target should exist in target manager');

         await inspectedPage.goToHtml('<h1>DevTools API Test Page</h1>');

         const consoleModel = primaryTarget?.model(SDK.ConsoleModel.ConsoleModel);
         const messagePromise = consoleModel?.once(SDK.ConsoleModel.Events.MessageAdded);

         // eslint-disable-next-line no-console
         await inspectedPage.evaluate(() => console.log('Hello from Universe API Test!'));

         const consoleMessage = await messagePromise;
         assert.isDefined(consoleMessage);
         assert.strictEqual(
             consoleMessage?.messageText,
             'Hello from Universe API Test!',
             'Console message should be received by universe ConsoleModel',
         );
       });
  });
});
