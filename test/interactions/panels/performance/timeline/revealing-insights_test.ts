// Copyright 2024 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import {assert} from 'chai';

import {$, $$, waitFor, waitForFunction} from '../../../../shared/helper.js';
import {assertElementScreenshotUnchanged} from '../../../../shared/screenshots.js';

import {loadTimelineDocExample} from './helpers.js';

describe('Performance panel insights', () => {
  itScreenshot('can reveal insights from a click in the sidebar', async () => {
    await loadTimelineDocExample('performance_panel/basic.html?trace=web-dev-with-commit');
    const flameChart = await waitFor('.timeline-flamechart');
    const sidebar = await waitFor('.timeline .sidebar-insights');

    // Ensure the sidebar has rendered + has width.
    await waitForFunction(async () => {
      const width = await sidebar.evaluate(elem => elem.clientWidth);
      return width > 230;
    });

    // Find the insight.
    const insight = await $('devtools-performance-lcp-discovery', sidebar);
    // Assert that it is collapsed.
    const header = await $('header', insight);
    const isCollapsed = await header.evaluate(elem => elem.getAttribute('aria-expanded') === 'false');
    assert.isTrue(isCollapsed);

    await header.click();
    // Ensure the insight expands
    await waitForFunction(async () => {
      return await header.evaluate(elem => elem.getAttribute('aria-expanded') === 'true');
    });

    // Clicking the insight should create an overlay. For the LCP request insight there are 7:
    // 1. Candy stripe.
    // 2. Red outline on the event.
    // 3. "LCP loaded 33ms after..." timespan.
    // 4. Navigation Timings Marker
    // 5. FCP Timings Marker & LCP Timings Marker
    // 7. DCL Timings Marker
    // 8. L Timings Marker
    const overlays = await $$('.overlay-item', flameChart);
    assert.lengthOf(overlays, 7);
    const jsLogContexts = await Promise.all(overlays.map(async overlay => {
      return await overlay.evaluate(elem => elem.getAttribute('jslog') ?? '');
    }));
    assert.deepEqual(jsLogContexts, [
      'Item; context: timeline.overlays.timings-marker',
      'Item; context: timeline.overlays.timings-marker',
      'Item; context: timeline.overlays.timings-marker',
      'Item; context: timeline.overlays.timings-marker',
      'Item; context: timeline.overlays.entry-outline-error',
      'Item; context: timeline.overlays.candy-striped-time-range',
      'Item; context: timeline.overlays.timespan-breakdown',
    ]);

    // Take a screenshot to ensure that the overlays are positioned and the UI was zoomed correctly.
    const pane = await waitFor('.timeline');
    // TODO: .timeline is not a solid indication that rendering finished.
    await new Promise(resolve => setTimeout(resolve, 500));
    await assertElementScreenshotUnchanged(pane, 'performance/insights-lcp-request-discovery.png');
  });
});
