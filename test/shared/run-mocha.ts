// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import Mocha from 'mocha';
import {isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';

export async function run(options: Mocha.MochaOptions&{spec?: string[], suiteName?: string}) {
  const mocha = new Mocha(options);

  // Load files
  const files = options.spec;
  if (Array.isArray(files)) {
    for (const file of files) {
      mocha.addFile(file);
    }
  }

  // Load requires if necessary (Mocha programmatic API might not automatically load requires,
  // we may need to import them manually).

  // eslint-disable-next-line  @typescript-eslint/no-unsafe-function-type
  const globalSetups: Function[] = [];
  // eslint-disable-next-line  @typescript-eslint/no-unsafe-function-type
  const globalTeardowns: Function[] = [];
  if (options.require) {
    const requires = Array.isArray(options.require) ? options.require : [options.require];
    for (const req of requires) {
      const importTarget = isAbsolute(req) ? pathToFileURL(req).href : req;

      const mod = await import(importTarget);
      const exportsObj = mod.default || mod;
      if (exportsObj.mochaGlobalSetup) {
        globalSetups.push(exportsObj.mochaGlobalSetup);
      }
      if (exportsObj.mochaGlobalTeardown) {
        globalTeardowns.push(exportsObj.mochaGlobalTeardown);
      }
      if (exportsObj.mochaHooks) {
        mocha.rootHooks(exportsObj.mochaHooks);
      }
    }
  }

  if (globalSetups.length > 0) {
    // @ts-expect-error unknown types
    mocha.globalSetup(globalSetups);
  }
  if (globalTeardowns.length > 0) {
    // @ts-expect-error unknown types
    mocha.globalTeardown(globalTeardowns);
  }

  await mocha.loadFilesAsync();

  mocha.enableGlobalSetup(true);
  mocha.enableGlobalTeardown(true);

  const failures = await new Promise<number>(resolve => {
    mocha.run(resolve);
  });

  process.exitCode = failures > 0 ? 1 : 0;
}
