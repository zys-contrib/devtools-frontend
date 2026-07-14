// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// This is not an ESM module on purpose to inject the devtools-bdd at the right
// time after mocha.

type MochaInterface = Record<string, (suite: Mocha.Suite) => void>;

const mochaGlobal = (window as unknown as Record<string, {
                       interfaces: MochaInterface & {
                         bdd: (suite: Mocha.Suite) => void,
                       },
                     }>)['Mocha'];

// @ts-expect-error no types
const checkoutRoot = window.__karma__.config.checkoutRoot as string;
// @ts-expect-error no types
const pathSeparator = window.__karma__.config.pathSeparator as string;

mochaGlobal.interfaces['devtools-bdd'] = function(suite: Mocha.Suite) {
  mochaGlobal.interfaces.bdd(suite);
  suite.on('pre-require', function(context: Mocha.MochaGlobals) {
    const originalDescribe = context.describe;
    const originalIt = context.it;

    function extractFileNameFromStack() {
      const stack = new Error().stack;
      const match = stack?.match(/\/base\/(.+?\.test\.(?:js|mjs))/);
      if (!match) {
        throw new Error('Could not find file name in stack trace');
      }
      const file = decodeURIComponent(match[1]);
      return checkoutRoot + pathSeparator + file.replace(/\//g, pathSeparator);
    }

    function wrapDescribe(originalFn: Mocha.SuiteFunction): Mocha.SuiteFunction;
    function wrapDescribe(originalFn: Mocha.ExclusiveSuiteFunction): Mocha.ExclusiveSuiteFunction;
    function wrapDescribe(originalFn: Mocha.PendingSuiteFunction): Mocha.PendingSuiteFunction;
    function wrapDescribe(originalFn: Mocha.SuiteFunction|Mocha.ExclusiveSuiteFunction|Mocha.PendingSuiteFunction):
        Mocha.SuiteFunction|Mocha.ExclusiveSuiteFunction|Mocha.PendingSuiteFunction {
      return function(this: Mocha.Suite, title: string, fn?: (this: Mocha.Suite) => void) {
        const s =
            (originalFn as (this: Mocha.Suite, title: string, fn?: (this: Mocha.Suite) => void) => Mocha.Suite | void)
                .call(this, title, fn);
        if (s && !s.file) {
          let file = s.parent?.file;
          if (!file) {
            file = extractFileNameFromStack();
          }
          s.file = file;
        }
        return s;
      } as unknown as Mocha.SuiteFunction |
          Mocha.ExclusiveSuiteFunction | Mocha.PendingSuiteFunction;
    }

    context.describe = Object.assign(wrapDescribe(originalDescribe), {
      only: wrapDescribe(originalDescribe.only),
      skip: wrapDescribe(originalDescribe.skip),
    });

    function wrapIt(originalFn: Mocha.TestFunction): Mocha.TestFunction;
    function wrapIt(originalFn: Mocha.ExclusiveTestFunction): Mocha.ExclusiveTestFunction;
    function wrapIt(originalFn: Mocha.PendingTestFunction): Mocha.PendingTestFunction;
    function wrapIt(originalFn: Mocha.TestFunction|Mocha.ExclusiveTestFunction|Mocha.PendingTestFunction):
        Mocha.TestFunction|Mocha.ExclusiveTestFunction|Mocha.PendingTestFunction {
      return function(this: Mocha.Context, titleOrFn: string|Mocha.Func|Mocha.AsyncFunc,
                      fn?: Mocha.Func|Mocha.AsyncFunc) {
        const t = (originalFn as (this: Mocha.Context, titleOrFn: string|Mocha.Func|Mocha.AsyncFunc,
                                  fn?: Mocha.Func|Mocha.AsyncFunc) => Mocha.Test | void)
                      .call(this, titleOrFn, fn);
        if (t && t.parent) {
          let file = t.parent.file;
          if (!file) {
            file = extractFileNameFromStack();
          }
          t.file = file;
        }
        return t;
      } as unknown as Mocha.TestFunction |
          Mocha.ExclusiveTestFunction | Mocha.PendingTestFunction;
    }

    context.it = Object.assign(wrapIt(originalIt), {
      only: wrapIt(originalIt.only),
      skip: wrapIt(originalIt.skip),
      retries: originalIt.retries,
    });
  });
};
mocha.ui('devtools-bdd');
