// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {assert} from 'chai';

import * as Platform from '../../core/platform/platform.js';
import {describeWithEnvironment} from '../../testing/EnvironmentHelpers.js';
import {createFileSystemUISourceCode} from '../../testing/UISourceCodeHelpers.js';
import * as TextUtils from '../text_utils/text_utils.js';
import * as Workspace from '../workspace/workspace.js';

const {urlString} = Platform.DevToolsPath;

describeWithEnvironment('FileSystemWorkspaceBinding', () => {
  it('does not conflict when file system paths share a prefix', async () => {
    const fsPath1 = 'file:///var/www';
    const fsPath2 = 'file:///var/www_suffix';

    const {project: project1, uiSourceCode: fooSourceCode} = createFileSystemUISourceCode({
      url: urlString`file:///var/www/foo.js`,
      content: 'foo',
      fileSystemPath: fsPath1,
      mimeType: 'text/javascript',
    });

    const {project: project2, uiSourceCode: barSourceCode} = createFileSystemUISourceCode({
      url: urlString`file:///var/www_suffix/bar.js`,
      content: 'bar',
      fileSystemPath: fsPath2,
      mimeType: 'text/javascript',
    });

    const workspace = Workspace.Workspace.WorkspaceImpl.instance();

    // Ensure the UISourceCodes are added to the workspace
    assert.strictEqual(workspace.uiSourceCodeForURL(urlString`file:///var/www/foo.js`), fooSourceCode);
    assert.strictEqual(workspace.uiSourceCodeForURL(urlString`file:///var/www_suffix/bar.js`), barSourceCode);

    assert.strictEqual(fooSourceCode.project(), project1, 'foo.js should be in the first filesystem project');
    assert.strictEqual(barSourceCode.project(), project2, 'bar.js should be in the second filesystem project');

    // Make sure path isolation works and it does not incorrectly truncate paths.
    assert.strictEqual(project1.fileSystemPath(), fsPath1);
    assert.strictEqual(project2.fileSystemPath(), fsPath2);

    // Update content and ensure it reflects correctly
    barSourceCode.setWorkingCopy('Why!?');
    const fooContent = await fooSourceCode.requestContentData();
    assert.isNotOk(TextUtils.ContentData.ContentData.isError(fooContent));
    assert.strictEqual((fooContent as TextUtils.ContentData.ContentData).text, 'foo');
    assert.strictEqual(fooSourceCode.workingCopy(), 'foo');
    assert.strictEqual(barSourceCode.workingCopy(), 'Why!?');
  });
});
