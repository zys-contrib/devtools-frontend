// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {assert} from 'chai';

import * as Common from '../../core/common/common.js';
import * as Platform from '../../core/platform/platform.js';
import {setupLocaleHooks} from '../../testing/LocaleHelpers.js';
import {MockDebuggerBackend} from '../../testing/MockScopeChain.js';
import {setupRuntimeHooks} from '../../testing/RuntimeHelpers.js';
import {
  createContentProviderUISourceCode,
  createContentProviderUISourceCodes,
  createFileSystemUISourceCode,
} from '../../testing/UISourceCodeHelpers.js';
import * as Workspace from '../workspace/workspace.js';

import * as Persistence from './persistence.js';

const {urlString} = Platform.DevToolsPath;

describe('Automapping', () => {
  setupLocaleHooks();
  setupRuntimeHooks();

  let backend: MockDebuggerBackend;

  beforeEach(() => {
    backend = new MockDebuggerBackend();
    // Eagerly instantiate persistence so it registers listeners on the workspace before we add files.
    void backend.universe.persistence;
  });

  // Replaces web test: http/tests/devtools/persistence/automapping-sourcemap-nameclash.js
  it('correctly maps sourcemap sources even when compiled URL matches one of the source URLs', async () => {
    const url = urlString`http://example.com/out.js`;
    const compiledContent = 'console.log("compiled");';
    const sourceContent = 'console.log("source");';

    // 1. Create network UISourceCode for compiled script (Script)
    const {uiSourceCode: networkScript} = createContentProviderUISourceCode({
      url,
      mimeType: 'text/javascript',
      content: compiledContent,
      projectType: Workspace.Workspace.projectTypes.Network,
      projectId: 'network-script-project',
      metadata: new Workspace.UISourceCode.UISourceCodeMetadata(null, compiledContent.length),
      universe: backend.universe,
    });

    // 2. Create network UISourceCode for clashing source (SourceMapScript)
    const {uiSourceCodes: [networkSource]} = createContentProviderUISourceCodes({
      items: [{
        url,
        mimeType: 'text/javascript',
        content: sourceContent,
        resourceType: Common.ResourceType.resourceTypes.SourceMapScript,
        metadata: new Workspace.UISourceCode.UISourceCodeMetadata(null, sourceContent.length),
      }],
      projectType: Workspace.Workspace.projectTypes.Network,
      projectId: 'sourcemap-project',
      universe: backend.universe,
    });

    const bindings: Persistence.Persistence.PersistenceBinding[] = [];
    const persistence = backend.universe.persistence;

    const bindingCreatedPromise = new Promise<void>(resolve => {
      persistence.addEventListener(Persistence.Persistence.Events.BindingCreated, event => {
        bindings.push(event.data);
        if (bindings.length === 2) {
          resolve();
        }
      });
    });

    // 3. Create filesystem UISourceCodes
    // Path `/var/www/out.js` (compiled)
    const {uiSourceCode: fileSystemScript} = createFileSystemUISourceCode({
      url: urlString`file:///var/www/out.js`,
      content: compiledContent,
      fileSystemPath: 'file:///var/www',
      mimeType: 'text/javascript',
      metadata: new Workspace.UISourceCode.UISourceCodeMetadata(null, compiledContent.length),
      autoMapping: true,
      universe: backend.universe,
    });

    // Path `/var/www/src/out.js` (source)
    const {uiSourceCode: fileSystemSource} = createFileSystemUISourceCode({
      url: urlString`file:///var/www/src/out.js`,
      content: sourceContent,
      fileSystemPath: 'file:///var/www',
      mimeType: 'text/javascript',
      metadata: new Workspace.UISourceCode.UISourceCodeMetadata(null, sourceContent.length),
      autoMapping: true,
      universe: backend.universe,
    });

    await bindingCreatedPromise;

    assert.lengthOf(bindings, 2);

    const scriptBinding = bindings.find(b => b.network === networkScript);
    assert.exists(scriptBinding);
    assert.strictEqual(scriptBinding?.fileSystem, fileSystemScript);

    const sourceBinding = bindings.find(b => b.network === networkSource);
    assert.exists(sourceBinding);
    assert.strictEqual(sourceBinding?.fileSystem, fileSystemSource);
  });
});
