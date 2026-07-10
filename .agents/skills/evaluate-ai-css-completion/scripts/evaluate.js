// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/* eslint-disable no-console */

const puppeteer = require('puppeteer-core');

async function runEvaluation() {
  console.log('Connecting to Chrome...');
  const browser = await puppeteer.connect({browserURL: 'http://127.0.0.1:9222', defaultViewport: null});

  try {
    console.log('Opening test page (example.com)...');
    const testPage = await browser.newPage();
    await testPage.goto('https://example.com');

    console.log('Waiting for DevTools target...');
    const devtoolsTarget = await browser.waitForTarget(t => {
      return t.url().startsWith('devtools://') || t.url().includes('inspector.html');
    }, {timeout: 10000});

    console.log('Connecting to DevTools page...');
    const devtoolsPage = await devtoolsTarget.page();
    if (!devtoolsPage) {
      throw new Error('Could not get DevTools page object. Make sure DevTools is undocked or opened in a tab.');
    }
    console.log('DevTools URL:', devtoolsPage.url());

    console.log('Reloading DevTools to ensure patch is loaded...');
    await devtoolsPage.reload();

    console.log('Waiting for DevTools to initialize and hook to be available...');
    try {
      await devtoolsPage.waitForFunction(() => typeof self.testCss?.getCases === 'function', {timeout: 15000});
    } catch {
      throw new Error('testCss.getCases hook not found. Did you apply the patch and build? Is this the local build?');
    }

    console.log('Fetching test cases from DevTools...');
    const testCases = await devtoolsPage.evaluate(() => self.testCss.getCases());
    console.log(`Found ${testCases.length} test cases.`);

    let testCount = 0;
    for (const tc of testCases) {
      console.log(`\nRunning: ${tc.name}`);
      // Delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));

      try {
        const result = await devtoolsPage.evaluate(async (url, prefix, suffix, additionalFiles) => {
          return await self.testCss.evaluate(url, prefix, suffix, additionalFiles);
        }, tc.url, tc.prefix, tc.suffix, tc.additionalFiles);

        console.log('  Result:', result);
      } catch (e) {
        console.error('  Failed to run test case:', e.message);
      }

      testCount++;
      if (testCount % 20 === 0 && testCount < testCases.length) {
        console.log('\n[INFO] Pausing for 10 seconds to avoid rate limiting...');
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    }

    // Cleanup tabs
    await devtoolsPage.close();
    await testPage.close();
  } finally {
    console.log('Disconnecting from Chrome...');
    await browser.disconnect();
  }
}

runEvaluation().catch(console.error);
