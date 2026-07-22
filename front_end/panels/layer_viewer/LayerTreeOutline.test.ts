// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import type * as SDK from '../../core/sdk/sdk.js';
import {assertScreenshot, renderElementIntoDOM} from '../../testing/DOMHelpers.js';
import {describeWithEnvironment} from '../../testing/EnvironmentHelpers.js';
import * as RenderCoordinator from '../../ui/components/render_coordinator/render_coordinator.js';

import * as LayerViewer from './layer_viewer.js';

describeWithEnvironment('LayerTreeOutline', () => {
  it('renders a layer tree', async () => {
    const rootLayer = {
      id: () => '1',
      width: () => 800,
      height: () => 600,
      nodeForSelfOrAncestor: () => null,
    } as unknown as SDK.LayerTreeBase.Layer;

    const childLayer = {
      id: () => '2',
      width: () => 400,
      height: () => 300,
      nodeForSelfOrAncestor: () => null,
    } as unknown as SDK.LayerTreeBase.Layer;

    const treeData = [{
      layer: rootLayer,
      isExpanded: true,
      children: [{
        layer: childLayer,
        isExpanded: false,
        children: [],
      }],
    }];

    const viewInput = {
      treeData,
      hoveredLayer: null,
      selectedLayer: rootLayer,
      layerCount: 2,
      totalLayerMemory: 1024 * 1024 + 512 * 1024,
      onSelect: () => {},
      onHover: () => {},
      onContextMenu: () => {},
    };

    const target = document.createElement('div');
    renderElementIntoDOM(target, {includeCommonStyles: true});
    LayerViewer.LayerTreeOutline.DEFAULT_VIEW(viewInput, {}, target);

    await RenderCoordinator.done();
    const tree = target.querySelector('devtools-tree');
    if (tree) {
      const outline = tree.getInternalTreeOutlineForTest();
      await outline.firstChild()?.expandRecursively();
    }

    await assertScreenshot('layer_viewer/layer_tree_outline.png');
  });
});
