// Copyright 2014 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as UI from '../../ui/legacy/legacy.js';

export class SimpleApp implements UI.App.App {
  presentUI(document: Document): void {
    const rootView = new UI.RootView.RootView();
    UI.InspectorView.InspectorView.instance().show(rootView.element);
    rootView.attachToDocument(document);
    rootView.focus();
  }
}

export class SimpleAppProvider implements UI.AppProvider.AppProvider {
  createApp(): UI.App.App {
    return new SimpleApp();
  }
}
