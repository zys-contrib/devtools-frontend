// Copyright 2020 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import type * as puppeteer from 'puppeteer-core';

export interface BrowserAndPages {
  target: puppeteer.Page;
  frontend: puppeteer.Page;
  browser: puppeteer.Browser;
}

// TODO(liviurau): remove this function after updating the function signatures
export const getBrowserAndPages = (): BrowserAndPages => {
  throw new Error('Support for global devtools and inspected page was removed.');
};
