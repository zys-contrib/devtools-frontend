// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {assert} from 'chai';
import type sinon from 'sinon';

import type * as Protocol from '../../generated/protocol.js';
import * as ComputedStyle from '../../models/computed_style/computed_style.js';
import {renderElementIntoDOM} from '../../testing/DOMHelpers.js';
import {describeWithEnvironment} from '../../testing/EnvironmentHelpers.js';
import {createStubbedDomNodeWithModels} from '../../testing/StyleHelpers.js';

import * as Elements from './elements.js';

describeWithEnvironment('MetricsSidebarPane', () => {
  function createWidget(
      computedStyle: Map<string, string>,
      boxModel: Protocol.DOM.BoxModel|null,
      ): Elements.MetricsSidebarPane.MetricsSidebarPane {
    const {node, cssModel} = createStubbedDomNodeWithModels({nodeId: 1});
    (node.nodeType as sinon.SinonStub).returns(Node.ELEMENT_NODE);
    (node.boxModel as sinon.SinonStub).resolves(boxModel);
    (cssModel.isEnabled as sinon.SinonStub).returns(true);
    (cssModel.getComputedStyle as sinon.SinonStub).resolves(computedStyle);
    (cssModel.getInlineStyles as sinon.SinonStub).resolves(null);

    const computedStyleModel = new ComputedStyle.ComputedStyleModel.ComputedStyleModel(node);
    const widget = new Elements.MetricsSidebarPane.MetricsSidebarPane(computedStyleModel);
    renderElementIntoDOM(widget);
    return widget;
  }

  it('renders content width and height from boxModel.content when available', async () => {
    const computedStyle = new Map([
      ['display', 'block'],
      ['position', 'static'],
      ['width', '300px'],
      ['height', '100px'],
      ['box-sizing', 'content-box'],
    ]);

    const boxModel: Protocol.DOM.BoxModel = {
      content: [10, 10, 275, 10, 275, 90, 10, 90],
      padding: [0, 0, 300, 0, 300, 100, 0, 100],
      border: [0, 0, 300, 0, 300, 100, 0, 100],
      margin: [0, 0, 300, 0, 300, 100, 0, 100],
      width: 300,
      height: 100,
    };

    const widget = createWidget(computedStyle, boxModel);
    widget.wasShown();
    await widget.performUpdate();

    const spans = widget.contentElement.querySelectorAll('.content span');
    assert.exists(spans);
    assert.strictEqual(spans[0].textContent, '265');
    assert.strictEqual(spans[2].textContent, '80');
    widget.detach();
  });

  it('falls back to computed style width and height when boxModel is not available', async () => {
    const computedStyle = new Map([
      ['display', 'block'],
      ['position', 'static'],
      ['width', '300px'],
      ['height', '100px'],
      ['box-sizing', 'content-box'],
    ]);

    const widget = createWidget(computedStyle, null);
    widget.wasShown();
    await widget.performUpdate();

    const spans = widget.contentElement.querySelectorAll('.content span');
    assert.exists(spans);
    assert.strictEqual(spans[0].textContent, '300');
    assert.strictEqual(spans[2].textContent, '100');
    widget.detach();
  });
});
