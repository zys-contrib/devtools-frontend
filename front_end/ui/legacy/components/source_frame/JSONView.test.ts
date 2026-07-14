// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {assert} from 'chai';

import {assertScreenshot, raf, renderElementIntoDOM} from '../../../../testing/DOMHelpers.js';
import {describeWithEnvironment} from '../../../../testing/EnvironmentHelpers.js';
import * as UI from '../../legacy.js';
import * as ObjectUI from '../object_ui/object_ui.js';

import * as SourceFrame from './source_frame.js';

describeWithEnvironment('JSONView', () => {
  it('instantiates a read-only ObjectPropertiesSection', async () => {
    const parsedJSON = new SourceFrame.JSONView.ParsedJSON({foo: 'bar'}, '', '');
    const jsonView = new SourceFrame.JSONView.JSONView(parsedJSON);
    jsonView.markAsRoot();
    renderElementIntoDOM(jsonView);

    const treeOutlineElement = jsonView.element.lastElementChild;
    assert.exists(treeOutlineElement);
    const section = ObjectUI.ObjectPropertiesSection.getObjectPropertiesSectionFrom(treeOutlineElement);
    assert.exists(section);

    const rootElement = section.objectTreeElement();
    await rootElement.onpopulate();
    const child = rootElement.childAt(0);
    assert.instanceOf(child, ObjectUI.ObjectPropertiesSection.ObjectPropertyTreeElement);
    assert.isFalse(child.editable);
    jsonView.detach();
  });

  it('handles search correctly', async () => {
    const parsedJSON = new SourceFrame.JSONView.ParsedJSON({foo: 'bar', baz: 'qux'}, '', '');
    const jsonView = new SourceFrame.JSONView.JSONView(parsedJSON, true);
    const searchableView = new UI.SearchableView.SearchableView(jsonView, null);
    jsonView.setSearchableView(searchableView);
    renderElementIntoDOM(jsonView);

    const treeOutlineElement = jsonView.element.lastElementChild;
    assert.exists(treeOutlineElement);
    const section = ObjectUI.ObjectPropertiesSection.getObjectPropertiesSectionFrom(treeOutlineElement);
    assert.exists(section);

    const rootElement = section.objectTreeElement();
    assert.exists(rootElement);
    await rootElement.onpopulate();

    await raf();

    const searchConfig = new UI.SearchableView.SearchConfig('ba', false, false, false);
    jsonView.performSearch(searchConfig, true);

    const shadowRoot = treeOutlineElement.shadowRoot;
    assert.exists(shadowRoot);

    let highlightedElements = shadowRoot.querySelectorAll('.highlighted-search-result');
    assert.lengthOf(highlightedElements, 2);

    // The first match should be current
    let currentMatch = shadowRoot.querySelectorAll('.current-search-result');
    assert.lengthOf(currentMatch, 1);
    assert.strictEqual(currentMatch[0].textContent, 'ba');

    // Jump to next match
    jsonView.jumpToNextSearchResult();
    highlightedElements = shadowRoot.querySelectorAll('.highlighted-search-result');
    assert.lengthOf(highlightedElements, 2);
    currentMatch = shadowRoot.querySelectorAll('.current-search-result');
    assert.lengthOf(currentMatch, 1);

    // Cancel search
    jsonView.onSearchCanceled();
    highlightedElements = shadowRoot.querySelectorAll('.highlighted-search-result');
    assert.lengthOf(highlightedElements, 0);
    currentMatch = shadowRoot.querySelectorAll('.current-search-result');
    assert.lengthOf(currentMatch, 0);
  });

  it('renders visual baseline of JSONView', async () => {
    const parsedJSON = new SourceFrame.JSONView.ParsedJSON({
      stringField: 'hello world',
      numberField: 42,
      booleanField: true,
      nestedObject: {
        arrayField: [1, 2, 3],
      },
    },
                                                           'prefix_pre_', '_suffix_post');
    const jsonView = new SourceFrame.JSONView.JSONView(parsedJSON, true);
    renderElementIntoDOM(jsonView);

    const treeOutlineElement = jsonView.element.lastElementChild;
    assert.exists(treeOutlineElement);
    const section = ObjectUI.ObjectPropertiesSection.getObjectPropertiesSectionFrom(treeOutlineElement);
    assert.exists(section);
    const rootElement = section.objectTreeElement();
    assert.exists(rootElement);
    await rootElement.onpopulate();
    rootElement.expand();
    await raf();

    await assertScreenshot('source_frame/json_view_baseline.png');
  });

  it('renders search highlights on JSONView', async () => {
    const parsedJSON = new SourceFrame.JSONView.ParsedJSON({
      baz: 'bar',
      foo: 'barbaz',
      bar: 'qux',
    },
                                                           '', '');
    const jsonView = new SourceFrame.JSONView.JSONView(parsedJSON, true);
    const searchableView = new UI.SearchableView.SearchableView(jsonView, null);
    jsonView.setSearchableView(searchableView);
    renderElementIntoDOM(jsonView);

    const treeOutlineElement = jsonView.element.lastElementChild;
    assert.exists(treeOutlineElement);
    const section = ObjectUI.ObjectPropertiesSection.getObjectPropertiesSectionFrom(treeOutlineElement);
    assert.exists(section);

    const rootElement = section.objectTreeElement();
    assert.exists(rootElement);
    await rootElement.onpopulate();
    rootElement.expand();

    await raf();

    const searchConfig = new UI.SearchableView.SearchConfig('ba', false, false, false);
    jsonView.performSearch(searchConfig, true);
    await raf();

    await assertScreenshot('source_frame/json_view_search_highlights.png');
  });
});
