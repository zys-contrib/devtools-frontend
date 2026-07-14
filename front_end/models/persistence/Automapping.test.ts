// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {assert} from 'chai';
import sinon from 'sinon';

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
import * as TextUtils from '../text_utils/text_utils.js';
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

  // Replaces web test: http/tests/devtools/persistence/automapping-git-folders.js
  it('is able to map ambiguous resources based on the selected project folder', async () => {
    const resetCssContent = '* { margin: 0 }';
    const jqueryJsContent = 'window.superb = 1;';
    const logo1Content = 'AAAA';
    const logo2Content = 'BBBBBBBB';

    // 1. Create network UISourceCodes
    const {uiSourceCodes: networkSourceCodes} = createContentProviderUISourceCodes({
      items: [
        {
          url: urlString`http://example.com/reset.css`,
          mimeType: 'text/css',
          content: resetCssContent,
          metadata: new Workspace.UISourceCode.UISourceCodeMetadata(null, resetCssContent.length)
        },
        {
          url: urlString`http://example.com/jquery.js`,
          mimeType: 'text/javascript',
          content: jqueryJsContent,
          metadata: new Workspace.UISourceCode.UISourceCodeMetadata(null, jqueryJsContent.length)
        },
        {
          url: urlString`http://example.com/logo.png`,
          mimeType: 'image/png',
          content: logo2Content,
          metadata: new Workspace.UISourceCode.UISourceCodeMetadata(null, logo2Content.length)
        },
      ],
      projectType: Workspace.Workspace.projectTypes.Network,
      projectId: 'network-project',
      universe: backend.universe,
    });
    const networkResetCss = networkSourceCodes[0];
    const networkJqueryJs = networkSourceCodes[1];
    const networkLogo = networkSourceCodes[2];

    const bindings: Persistence.Persistence.PersistenceBinding[] = [];
    const persistence = backend.universe.persistence;
    const bindingsCreatedPromise = new Promise<void>(resolve => {
      persistence.addEventListener(Persistence.Persistence.Events.BindingCreated, event => {
        bindings.push(event.data);
        if (bindings.length === 3) {
          resolve();
        }
      });
    });

    class MyTestFileSystem extends Persistence.FileSystemWorkspaceBinding.FileSystem {
      contentMap = new Map<Workspace.UISourceCode.UISourceCode, string>();
      constructor(fileSystemPath: string) {
        const isolatedFileSystemManager = backend.universe.isolatedFileSystemManager;
        const fileSystemWorkspaceBinding = new Persistence.FileSystemWorkspaceBinding.FileSystemWorkspaceBinding(
            isolatedFileSystemManager, backend.universe.workspace);
        class MyTestPlatformFileSystem extends Persistence.PlatformFileSystem.PlatformFileSystem {
          constructor() {
            super(urlString`${fileSystemPath}`, Persistence.PlatformFileSystem.PlatformFileSystemType.WORKSPACE_PROJECT,
                  false);
          }
          override supportsAutomapping(): boolean {
            return true;
          }
        }
        super(fileSystemWorkspaceBinding, new MyTestPlatformFileSystem(), backend.universe.workspace);
      }
      override requestFileContent(uiSourceCode: Workspace.UISourceCode.UISourceCode):
          Promise<TextUtils.ContentData.ContentDataOrError> {
        return Promise.resolve(
            new TextUtils.ContentData.ContentData(this.contentMap.get(uiSourceCode) || '', false, 'text/plain'));
      }
      override requestMetadata(uiSourceCode: Workspace.UISourceCode.UISourceCode):
          Promise<Workspace.UISourceCode.UISourceCodeMetadata|null> {
        const length = (this.contentMap.get(uiSourceCode) || '').length;
        return Promise.resolve(new Workspace.UISourceCode.UISourceCodeMetadata(null, length));
      }
      addFileToMap(url: string, content: string, mimeType: string): Workspace.UISourceCode.UISourceCode {
        const uiSourceCode =
            this.createUISourceCode(urlString`${url}`, Common.ResourceType.ResourceType.fromMimeType(mimeType));
        this.contentMap.set(uiSourceCode, content);
        this.addUISourceCode(uiSourceCode);
        return uiSourceCode;
      }
    }

    // 2. Create filesystem UISourceCodes for proj1
    const fsProj1 = new MyTestFileSystem('file:///var/www/code/proj1');
    fsProj1.addFileToMap('file:///var/www/code/proj1/reset.css', resetCssContent, 'text/css');
    fsProj1.addFileToMap('file:///var/www/code/proj1/jquery.js', jqueryJsContent, 'text/javascript');
    fsProj1.addFileToMap('file:///var/www/code/proj1/logo.png', logo1Content, 'image/png');

    // 3. Create filesystem UISourceCodes for proj2
    const fsProj2 = new MyTestFileSystem('file:///var/www/code/proj2');
    const fsResetCss2 = fsProj2.addFileToMap('file:///var/www/code/proj2/reset.css', resetCssContent, 'text/css');
    const fsJqueryJs2 =
        fsProj2.addFileToMap('file:///var/www/code/proj2/jquery.js', jqueryJsContent, 'text/javascript');
    const fsLogo2 = fsProj2.addFileToMap('file:///var/www/code/proj2/logo.png', logo2Content, 'image/png');

    await bindingsCreatedPromise;

    assert.lengthOf(bindings, 3);

    const logoBinding = bindings.find(b => b.network === networkLogo);
    assert.exists(logoBinding);
    assert.strictEqual(logoBinding?.fileSystem, fsLogo2);

    const resetCssBinding = bindings.find(b => b.network === networkResetCss);
    assert.exists(resetCssBinding);
    assert.strictEqual(resetCssBinding?.fileSystem, fsResetCss2);

    const jqueryJsBinding = bindings.find(b => b.network === networkJqueryJs);
    assert.exists(jqueryJsBinding);
    assert.strictEqual(jqueryJsBinding?.fileSystem, fsJqueryJs2);
  });

  it('verify that automapping is sane', async () => {
    const clock = sinon.useFakeTimers({toFake: ['setTimeout']});
    try {
      const timestamp = new Date('December 1, 1989');
      const bazContent = 'alert(1);';

      // Network resources
      const networkResources = [
        {
          url: urlString`http://example.com`,
          mimeType: 'text/html',
          content: '<body>this is main resource</body>',
          metadata: new Workspace.UISourceCode.UISourceCodeMetadata(timestamp, null),
        },
        {
          url: urlString`http://example.com/path/foo.js`,
          mimeType: 'text/javascript',
          content: 'console.log(\'foo.js!\');',
          metadata: new Workspace.UISourceCode.UISourceCodeMetadata(null, null),
        },
        {
          url: urlString`http://example.com/bar.css?12341234`,
          mimeType: 'text/css',
          content: '* { box-sizing: border-box }',
          metadata: new Workspace.UISourceCode.UISourceCodeMetadata(timestamp, null),
        },
        {
          url: urlString`http://example.com/baz.js`,
          mimeType: 'text/javascript',
          content: bazContent,
          metadata: new Workspace.UISourceCode.UISourceCodeMetadata(new Date('December 3, 1989'), null),
        },
        {
          url: urlString`http://example.com/images/image.png`,
          mimeType: 'image/png',
          content: '012345',
          metadata: new Workspace.UISourceCode.UISourceCodeMetadata(timestamp, 6),
        },
        {
          url: urlString`http://example.com/elements/module.json`,
          mimeType: 'application/json',
          content: 'module descriptor 1',
          metadata: new Workspace.UISourceCode.UISourceCodeMetadata(null, null),
        },
        {
          url: urlString`http://example.com/sources/module.json`,
          mimeType: 'application/json',
          content: 'module descriptor 2',
          metadata: new Workspace.UISourceCode.UISourceCodeMetadata(null, null),
        },
      ];

      const {uiSourceCodes: networkUISourceCodes} = createContentProviderUISourceCodes({
        items: networkResources,
        projectType: Workspace.Workspace.projectTypes.Network,
        projectId: 'network-project',
        universe: backend.universe,
      });

      const [networkIndexHtml,
             networkFooJs,
             networkBarCss,
             networkBazJs,
             networkImagePng,
             networkElementsJson,
             networkSourcesJson,
      ] = networkUISourceCodes;

      const bindings: Persistence.Persistence.PersistenceBinding[] = [];
      const persistence = backend.universe.persistence;

      persistence.addEventListener(Persistence.Persistence.Events.BindingCreated, event => {
        bindings.push(event.data);
      });

      // Filesystem resources
      const fileSystemResources = [
        {
          url: urlString`file:///var/www/index.html`,
          mimeType: 'text/html',
          content: '<body>this is main resource</body>',
          metadata: new Workspace.UISourceCode.UISourceCodeMetadata(timestamp, null),
        },
        {
          url: urlString`file:///var/www/scripts/foo.js`,
          mimeType: 'text/javascript',
          content: 'console.log(\'foo.js!\');',
          metadata: new Workspace.UISourceCode.UISourceCodeMetadata(null, null),
        },
        {
          url: urlString`file:///var/www/styles/bar.css`,
          mimeType: 'text/css',
          content: '* { box-sizing: border-box }',
          metadata: new Workspace.UISourceCode.UISourceCodeMetadata(timestamp, null),
        },
        {
          url: urlString`file:///var/www/scripts/baz.js`,
          mimeType: 'text/javascript',
          content: bazContent,
          metadata: new Workspace.UISourceCode.UISourceCodeMetadata(new Date('December 4, 1989'), null),
        },
        {
          url: urlString`file:///var/www/images/image.png`,
          mimeType: 'image/png',
          content: '0123456789',
          metadata: new Workspace.UISourceCode.UISourceCodeMetadata(timestamp, 10),
        },
        {
          url: urlString`file:///var/www/modules/elements/module.json`,
          mimeType: 'application/json',
          content: 'module descriptor 1',
          metadata: new Workspace.UISourceCode.UISourceCodeMetadata(null, null),
        },
        {
          url: urlString`file:///var/www/modules/sources/module.json`,
          mimeType: 'application/json',
          content: 'module descriptor 2',
          metadata: new Workspace.UISourceCode.UISourceCodeMetadata(null, null),
        },
      ];

      const fileSystemUISourceCodes = fileSystemResources.map(resource => {
        return createFileSystemUISourceCode({
                 url: resource.url,
                 mimeType: resource.mimeType,
                 content: resource.content,
                 fileSystemPath: 'file:///var/www',
                 metadata: resource.metadata,
                 autoMapping: true,
                 universe: backend.universe,
               })
            .uiSourceCode;
      });

      const fileSystemIndexHtml = fileSystemUISourceCodes[0];
      const fileSystemFooJs = fileSystemUISourceCodes[1];
      const fileSystemBarCss = fileSystemUISourceCodes[2];
      const fileSystemElementsJson = fileSystemUISourceCodes[5];
      const fileSystemSourcesJson = fileSystemUISourceCodes[6];

      await clock.tickAsync(200);

      assert.lengthOf(bindings, 5);

      const indexHtmlBinding = persistence.binding(networkIndexHtml);
      assert.exists(indexHtmlBinding);
      assert.strictEqual(indexHtmlBinding?.fileSystem, fileSystemIndexHtml);

      const fooBinding = persistence.binding(networkFooJs);
      assert.exists(fooBinding);
      assert.strictEqual(fooBinding?.fileSystem, fileSystemFooJs);

      const barBinding = persistence.binding(networkBarCss);
      assert.exists(barBinding);
      assert.strictEqual(barBinding?.fileSystem, fileSystemBarCss);

      const elementsBinding = persistence.binding(networkElementsJson);
      assert.exists(elementsBinding);
      assert.strictEqual(elementsBinding?.fileSystem, fileSystemElementsJson);

      const sourcesBinding = persistence.binding(networkSourcesJson);
      assert.exists(sourcesBinding);
      assert.strictEqual(sourcesBinding?.fileSystem, fileSystemSourcesJson);

      assert.isNull(persistence.binding(networkBazJs));
      assert.isNull(persistence.binding(networkImagePng));
    } finally {
      clock.restore();
    }
  });
});
