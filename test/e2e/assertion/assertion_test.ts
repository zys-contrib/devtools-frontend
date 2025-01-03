// Copyright 2020 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {assert} from 'chai';

import {expectedErrors} from '../../conductor/events.js';
import {getBrowserAndPages, goToResource, step} from '../../shared/helper.js';

describe('Assertions', function() {
  it('console.assert', async () => {
    const {frontend} = getBrowserAndPages();
    await step('Check the evaluation results from console', async () => {
      await frontend.evaluate(() => {
        console.assert(false, 'expected failure 1');
      });
    });
    await goToResource('cross_tool/default.html');
    assert.isOk(expectedErrors.some(error => error.includes('expected failure 1')));
  });

  it('console.error', async () => {
    const {frontend} = getBrowserAndPages();
    await step('Check the evaluation results from console', async () => {
      await frontend.evaluate(() => {
        function foo() {
          console.error('expected failure 2');
        }
        foo();
      });
    });
    await goToResource('cross_tool/default.html');
    assert.isOk(expectedErrors.some(error => error.includes('expected failure 2')));
  });
});
