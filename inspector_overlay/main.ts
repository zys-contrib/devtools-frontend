// Copyright 2020 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// @ts-expect-error Importing CSS is handled in Rollup.
import commonStyle from './common.css';
import {adoptStyleSheet} from './common.js';
import {gridStyle} from './highlight_grid_common.js';
// @ts-expect-error Importing CSS is handled in Rollup.
import highlightGridStyle from './tool_grid.css';
// @ts-expect-error Importing CSS is handled in Rollup.
import highlightStyle from './tool_highlight.css';
import {HighlightOverlay} from './tool_highlight.js';
// @ts-expect-error Importing CSS is handled in Rollup.
import pausedStyle from './tool_paused.css';
import {PausedOverlay, type PausedToolMessage} from './tool_paused.js';
import {PersistentOverlay, type PersistentToolMessage} from './tool_persistent.js';
// @ts-expect-error Importing CSS is handled in Rollup.
import screenshotStyle from './tool_screenshot.css';
import {ScreenshotOverlay, type ScreenshotToolMessage} from './tool_screenshot.js';
// @ts-expect-error Importing CSS is handled in Rollup.
import sourceOrderStyle from './tool_source_order.css';
import {SourceOrderOverlay} from './tool_source_order.js';
import {ViewportSizeOverlay} from './tool_viewport_size.js';
// @ts-expect-error Importing CSS is handled in Rollup.
import wcoStyle from './tool_window_controls.css';
import {WindowControlsOverlay} from './tool_window_controls.js';

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    InspectorOverlayHost: {send(data: PausedToolMessage|PersistentToolMessage|ScreenshotToolMessage|string): void};
  }
}

adoptStyleSheet(commonStyle);

const gridStyleSheet = new CSSStyleSheet();
gridStyleSheet.replaceSync(gridStyle);

const highlightOverlay = new HighlightOverlay(window, [highlightStyle, gridStyleSheet]);
const persistentOverlay = new PersistentOverlay(window, [highlightGridStyle, gridStyleSheet]);
const pausedOverlay = new PausedOverlay(window, pausedStyle);
const screenshotOverlay = new ScreenshotOverlay(window, screenshotStyle);
const sourceOrderOverlay = new SourceOrderOverlay(window, sourceOrderStyle);
const viewportSizeOverlay = new ViewportSizeOverlay(window);
const windowControlsOverlay = new WindowControlsOverlay(window, [wcoStyle]);

interface Overlays {
  highlight: HighlightOverlay;
  persistent: PersistentOverlay;
  paused: PausedOverlay;
  screenshot: ScreenshotOverlay;
  sourceOrder: SourceOrderOverlay;
  viewportSize: ViewportSizeOverlay;
  windowControlsOverlay: WindowControlsOverlay;
}

type PlatformName = string;

// Key in this object is the name the backend refers to a particular overlay by.
const overlays: Overlays = {
  highlight: highlightOverlay,
  persistent: persistentOverlay,
  paused: pausedOverlay,
  screenshot: screenshotOverlay,
  sourceOrder: sourceOrderOverlay,
  viewportSize: viewportSizeOverlay,
  windowControlsOverlay,
};

let currentOverlay: Overlays[keyof Overlays];
let platformName: PlatformName;

interface MessageLookup {
  setOverlay: keyof Overlays;
  setPlatform: PlatformName;
  drawingFinished: '';
}

const dispatch = <K extends keyof MessageLookup>(message: [a: K, b: MessageLookup[K]]) => {
  const functionName = message[0];
  if (functionName === 'setOverlay') {
    const overlayName = message[1] as keyof Overlays;
    if (currentOverlay) {
      currentOverlay.uninstall();
    }
    currentOverlay = overlays[overlayName];
    currentOverlay.setPlatform(platformName);
    // TODO: setPlatform invokes install() for compatibility with the backend.
    // The call to install() can be removed from setPlatform() after the backend is updated.
    if (!currentOverlay.installed) {
      currentOverlay.install();
    }
  } else if (functionName === 'setPlatform') {
    platformName = message[1];
  } else if (functionName === 'drawingFinished') {
    // TODO The logic needs to be added here once the backend starts sending this event.
  } else {
    currentOverlay.dispatch(message);
  }
};

// Window has an additional dispatch function added, so retype as unknown first
(window as unknown as {dispatch: typeof dispatch}).dispatch = dispatch;
