// Copyright 2023 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {assert} from 'chai';
import sinon from 'sinon';

import * as Host from '../../core/host/host.js';
import * as SDK from '../../core/sdk/sdk.js';
import type * as Protocol from '../../generated/protocol.js';
import {renderElementIntoDOM} from '../../testing/DOMHelpers.js';
import {createTarget, describeWithEnvironment, stubNoopSettings} from '../../testing/EnvironmentHelpers.js';
import * as TreeOutline from '../../ui/components/tree_outline/tree_outline.js';
import * as UI from '../../ui/legacy/legacy.js';

import * as Elements from './elements.js';

const MAIN_FRAME_ID = 'MAIN_FRAME_ID' as Protocol.Page.FrameId;

describeWithEnvironment('AccessibilityTreeView', () => {
  let target: SDK.Target.Target;
  let treeComponent: TreeOutline.TreeOutline.TreeOutline<Elements.AccessibilityTreeUtils.AXTreeNodeData>;

  beforeEach(() => {
    stubNoopSettings();
    target = createTarget();
    treeComponent = new TreeOutline.TreeOutline.TreeOutline<Elements.AccessibilityTreeUtils.AXTreeNodeData>();
  });

  const updatesUiOnEvent = (inScope: boolean) => async () => {
    SDK.TargetManager.TargetManager.instance().setScopeTarget(inScope ? target : null);
    const view = new Elements.AccessibilityTreeView.AccessibilityTreeView(treeComponent);
    renderElementIntoDOM(view);

    const model = target.model(SDK.AccessibilityModel.AccessibilityModel);
    const treeComponentDataSet = sinon.spy(treeComponent, 'data', ['set']);
    sinon.stub(SDK.FrameManager.FrameManager.instance(), 'getOutermostFrame').returns({
      id: MAIN_FRAME_ID,
    } as SDK.ResourceTreeModel.ResourceTreeFrame);

    model!.dispatchEventToListeners(SDK.AccessibilityModel.Events.TREE_UPDATED, {
      root: {
        numChildren: () => 0,
        role: () => null,
        getFrameId: () => MAIN_FRAME_ID,
        id: () => 'id',
        isLeafNode: SDK.AccessibilityModel.AccessibilityNode.prototype.isLeafNode,
        getNodeId: SDK.AccessibilityModel.AccessibilityNode.prototype.getNodeId,
        getChildren: SDK.AccessibilityModel.AccessibilityNode.prototype.getChildren,
        axNodeToText: SDK.AccessibilityModel.AccessibilityNode.prototype.axNodeToText,
      } as unknown as SDK.AccessibilityModel.AccessibilityNode,
    });
    await new Promise<void>(resolve => queueMicrotask(resolve));
    assert.strictEqual(treeComponentDataSet.set.called, inScope);
    view.detach();
  };

  it('updates UI on in scope update event', updatesUiOnEvent(true));
  it('does not update UI on out of scope update event', updatesUiOnEvent(false));

  describe('copying nodes', function() {
    it('copies selected node on context menu copy action', async () => {
      const view = new Elements.AccessibilityTreeView.AccessibilityTreeView(treeComponent);
      renderElementIntoDOM(view);

      const axNode = {
        id: () => '1',
        getFrameId: () => 'frame1',
        role: () => ({value: 'heading'}),
        name: () => ({value: 'Title'}),
        properties: () => [],
        ignored: () => false,
        isDOMNode: () => false,
        accessibilityModel: () => ({
          requestAXChildren: async () => [],
        }),
        getChildren: SDK.AccessibilityModel.AccessibilityNode.prototype.getChildren,
        axNodeToText: SDK.AccessibilityModel.AccessibilityNode.prototype.axNodeToText,
      } as unknown as SDK.AccessibilityModel.AccessibilityNode;

      treeComponent.dispatchEvent(new TreeOutline.TreeOutline.ItemSelectedEvent({
        treeNodeData: axNode,
        id: '1',
      }));

      const event = new MouseEvent('contextmenu', {bubbles: true});
      const customEvent = new TreeOutline.TreeOutline.ItemContextMenuEvent(
          {treeNodeData: axNode, id: '1'} as unknown as
              TreeOutline.TreeOutlineUtils.TreeNode<Elements.AccessibilityTreeUtils.AXTreeNodeData>,
          event);
      const showStub = sinon.stub(UI.ContextMenu.ContextMenu.prototype, 'show').resolves();

      treeComponent.dispatchEvent(customEvent);

      sinon.assert.called(showStub);
      view.detach();
    });

    it('copies selected node on copy event', async () => {
      const view = new Elements.AccessibilityTreeView.AccessibilityTreeView(treeComponent);
      renderElementIntoDOM(view);

      const axNode = {
        id: () => '1',
        getFrameId: () => 'frame1',
        role: () => ({value: 'heading'}),
        name: () => ({value: 'Title'}),
        properties: () => [],
        ignored: () => false,
        isDOMNode: () => false,
        accessibilityModel: () => ({
          requestAXChildren: async () => [],
        }),
        getChildren: SDK.AccessibilityModel.AccessibilityNode.prototype.getChildren,
        axNodeToText: SDK.AccessibilityModel.AccessibilityNode.prototype.axNodeToText,
      } as unknown as SDK.AccessibilityModel.AccessibilityNode;

      treeComponent.dispatchEvent(new TreeOutline.TreeOutline.ItemSelectedEvent({
        treeNodeData: axNode,
        id: '1',
      }));

      const copyStub = sinon.stub(Host.InspectorFrontendHost.InspectorFrontendHostInstance, 'copyText');

      const event = new Event('copy', {bubbles: true});
      view.contentElement.dispatchEvent(event);

      await new Promise<void>(resolve => setTimeout(resolve, 50));
      sinon.assert.calledWith(copyStub, 'heading "Title"\n');

      copyStub.restore();
      view.detach();
    });
  });
});
