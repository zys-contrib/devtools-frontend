// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import type * as puppeteer from 'puppeteer-core';

import {PuppeteerDevToolsConnection} from '../../front_end/core/protocol_client/PuppeteerDevToolsConnection.js';
import type * as SDK from '../../front_end/core/sdk/sdk.js';
import type * as Foundation from '../../front_end/foundation/foundation.js';

export interface TargetUniverse {
  /** The DevTools target corresponding to the puppeteer Page */
  target: SDK.Target.Target;
  universe: Foundation.Universe.Universe;
  /** The secondary session created for this page */
  session: puppeteer.CDPSession;
}

let registeredExtensions = false;

export async function createTargetUniverse(
    session: puppeteer.CDPSession,
    ): Promise<TargetUniverse> {
  // DevTools modules contain top-level await in their ES module graphs.
  // Because Node executes test scripts as CommonJS, top-level static imports
  // of these modules fail at startup with ERR_REQUIRE_ASYNC_MODULE.
  // We use dynamic `import()` at runtime to load the ESM graph asynchronously.
  const [Common, Host, SDKModule, RootModule, Foundation] = await Promise.all([
    import('../../front_end/core/common/common.js'),
    import('../../front_end/core/host/host.js'),
    import('../../front_end/core/sdk/sdk.js'),
    import('../../front_end/core/root/root.js'),
    import('../../front_end/foundation/foundation.js'),
    import('../../front_end/core/sdk/sdk-meta.js'),
    import('../../front_end/models/workspace/workspace-meta.js'),
    import('../../front_end/models/persistence/persistence-meta.js'),
    import('../../front_end/models/logs/logs-meta.js'),
    import('../../front_end/models/badges/badges-meta.js'),
  ]);

  if (!registeredExtensions) {
    registeredExtensions = true;
    // Register experiments expected by models
    RootModule.Runtime.experiments.register(
        RootModule.ExperimentNames.ExperimentName.INSTRUMENTATION_BREAKPOINTS,
        'Instrumentation breakpoints',
    );
  }

  const settingStorage = new Common.Settings.SettingsStorage({});
  const universe = new Foundation.Universe.Universe({
    settingsCreationOptions: {
      syncedStorage: settingStorage,
      globalStorage: settingStorage,
      localStorage: settingStorage,
      settingRegistrations: Common.SettingRegistration.getRegisteredSettings(),
    },
    hostConfig: {},
    inspectorFrontendHost: Host.InspectorFrontendHost.InspectorFrontendHostInstance,
    supportsEmulation: false,
  });

  const connection = new PuppeteerDevToolsConnection(session as unknown as
                                                     ConstructorParameters<typeof PuppeteerDevToolsConnection>[0]);
  const targetManager = universe.context.get(SDKModule.TargetManager.TargetManager);

  const target = targetManager.createTarget(
      'main',
      '',
      SDKModule.Target.Type.FRAME,
      /* parentTarget */ null,
      session.id(),
      undefined,
      connection,
  );
  return {target, universe, session};
}
