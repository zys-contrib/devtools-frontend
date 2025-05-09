// Copyright 2020 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {assert, AssertionError} from 'chai';
import type * as puppeteer from 'puppeteer-core';

import {AsyncScope} from '../conductor/async-scope.js';
import type {DevToolsFrontendReloadOptions} from '../conductor/frontend_tab.js';
import {getDevToolsFrontendHostname, reloadDevTools} from '../conductor/hooks.js';
import {platform} from '../conductor/mocha-interface-helpers.js';
import {getBrowserAndPages} from '../conductor/puppeteer-state.js';
import {getTestServerPort} from '../conductor/server_port.js';
import type {DevToolsPage} from '../e2e_non_hosted/shared/frontend-helper.js';

import {getBrowserAndPagesWrappers} from './non_hosted_wrappers.js';

export {platform} from '../conductor/mocha-interface-helpers.js';

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    __pendingEvents: Map<string, Event[]>;

    // eslint-disable-next-line @typescript-eslint/naming-convention
    __eventHandlers: WeakMap<Element, Map<string, Promise<void>>>;

    // eslint-disable-next-line @typescript-eslint/naming-convention
    __getRenderCoordinatorPendingFrames(): number;
  }
}

// TODO: Remove once Chromium updates its version of Node.js to 12+.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const globalThis: any = global;

export interface ClickOptions {
  root?: puppeteer.ElementHandle;
  clickOptions?: puppeteer.ClickOptions;
  maxPixelsFromLeft?: number;
}

const CONTROL_OR_META = platform === 'mac' ? 'Meta' : 'Control';
export const withControlOrMetaKey = async (action: () => Promise<void>, root = getBrowserAndPages().frontend) => {
  await waitForFunction(async () => {
    await root.keyboard.down(CONTROL_OR_META);
    try {
      await action();
      return true;
    } finally {
      await root.keyboard.up(CONTROL_OR_META);
    }
  });
};

export const click = async (selector: string, options?: ClickOptions) => {
  const {devToolsPage} = getBrowserAndPagesWrappers();
  return await devToolsPage.click(selector, options);
};

export const hover = async (selector: string, options?: {root?: puppeteer.ElementHandle}) => {
  const {devToolsPage} = getBrowserAndPagesWrappers();
  return await devToolsPage.hover(selector, options);
};

/**
 * Schedules a task in the frontend page that ensures that previously
 * handled tasks have been handled.
 */
export async function drainFrontendTaskQueue(): Promise<void> {
  const {devToolsPage} = getBrowserAndPagesWrappers();
  await devToolsPage.drainFrontendTaskQueue();
}

/**
 * @deprecated This method is not able to recover from unstable DOM. Use click(selector) instead.
 */
export async function clickElement(
    element: puppeteer.ElementHandle, options?: ClickOptions, devToolsPage?: DevToolsPage): Promise<void> {
  devToolsPage = devToolsPage || getBrowserAndPagesWrappers().devToolsPage;
  await devToolsPage.clickElement(element, options);
}

/**
 * @deprecated This method is not able to recover from unstable DOM. Use hover(selector) instead.
 */
export async function hoverElement(element: puppeteer.ElementHandle): Promise<void> {
  // Retries here just in case the element gets connected to DOM / becomes visible.
  await waitForFunction(async () => {
    try {
      await element.hover();
      await drainFrontendTaskQueue();
      return true;
    } catch {
      return false;
    }
  });
}

export const doubleClick =
    async (selector: string, options?: {root?: puppeteer.ElementHandle, clickOptions?: puppeteer.ClickOptions}) => {
  const passedClickOptions = (options?.clickOptions) || {};
  const clickOptionsWithDoubleClick: puppeteer.ClickOptions = {
    ...passedClickOptions,
    clickCount: 2,
  };
  return await click(selector, {
    ...options,
    clickOptions: clickOptionsWithDoubleClick,
  });
};

export const typeText = async (text: string) => {
  const {devToolsPage} = getBrowserAndPagesWrappers();
  await devToolsPage.typeText(text);
};

export const pressKey =
    async (key: puppeteer.KeyInput, modifiers?: {control?: boolean, alt?: boolean, shift?: boolean}) => {
  const {devToolsPage} = getBrowserAndPagesWrappers();
  await devToolsPage.pressKey(key, modifiers);
};

export const pasteText = async (text: string) => {
  const {frontend} = getBrowserAndPages();
  await frontend.keyboard.sendCharacter(text);
  await drainFrontendTaskQueue();
};

export const $ = async<ElementType extends Element|null = null, Selector extends string = string>(
    selector: Selector, root?: puppeteer.ElementHandle, handler = 'pierce') => {
  const {devToolsPage} = getBrowserAndPagesWrappers();
  return await devToolsPage.$<ElementType, Selector>(selector, root, handler);
};

// Get multiple element handles. Uses `pierce` handler per default for piercing Shadow DOM.
export const $$ = async<ElementType extends Element|null = null, Selector extends string = string>(
    selector: Selector, root?: puppeteer.JSHandle, handler = 'pierce') => {
  const {devToolsPage} = getBrowserAndPagesWrappers();
  return await devToolsPage.$$<ElementType, Selector>(selector, root, handler);
};

/**
 * Search for an element based on its textContent.
 *
 * @param textContent The text content to search for.
 * @param root The root of the search.
 */
export const $textContent = async (textContent: string, root?: puppeteer.ElementHandle) => {
  return await $(textContent, root, 'pierceShadowText');
};

/**
 * Search for all elements based on their textContent
 *
 * @param textContent The text content to search for.
 * @param root The root of the search.
 */
export const $$textContent = async (textContent: string, root?: puppeteer.ElementHandle) => {
  return await $$(textContent, root, 'pierceShadowText');
};

export const timeout = (duration: number) => {
  const {devToolsPage} = getBrowserAndPagesWrappers();
  return devToolsPage.timeout(duration);
};

export const getTextContent =
    async<ElementType extends Element = Element>(selector: string, root?: puppeteer.ElementHandle) => {
  const text = await (await $<ElementType, typeof selector>(selector, root))?.evaluate(node => node.textContent);
  return text ?? undefined;
};

export const getAllTextContents =
    async(selector: string, root?: puppeteer.JSHandle, handler = 'pierce'): Promise<Array<string|null>> => {
  const allElements = await $$(selector, root, handler);
  return await Promise.all(allElements.map(e => e.evaluate(e => e.textContent)));
};

/**
 * Match multiple elements based on a selector and return their textContents, but only for those
 * elements that are visible.
 *
 * @param selector jquery selector to match
 * @returns array containing text contents from visible elements
 */
export const getVisibleTextContents = async (selector: string) => {
  const allElements = await $$(selector);
  const texts = await Promise.all(
      allElements.map(el => el.evaluate(node => node.checkVisibility() ? node.textContent?.trim() : undefined)));
  return texts.filter(content => typeof (content) === 'string');
};

export const waitFor = async<ElementType extends Element|null = null, Selector extends string = string>(
    selector: Selector, root?: puppeteer.ElementHandle, asyncScope = new AsyncScope(), handler?: string) => {
  const {devToolsPage} = getBrowserAndPagesWrappers();
  return await devToolsPage.waitFor<ElementType, Selector>(selector, root, asyncScope, handler);
};

export const waitForVisible = async<ElementType extends Element|null = null, Selector extends string = string>(
    selector: Selector, root?: puppeteer.ElementHandle, asyncScope = new AsyncScope(), handler?: string) => {
  return await asyncScope.exec(() => waitForFunction(async () => {
                                 const element = await $<ElementType, typeof selector>(selector, root, handler);
                                 const visible = await element.evaluate(node => node.checkVisibility());
                                 return visible ? element : undefined;
                               }, asyncScope), `Waiting for element matching selector '${selector}' to be visible`);
};

export const waitForMany = async<ElementType extends Element|null = null, Selector extends string = string>(
    selector: Selector, count: number, root?: puppeteer.ElementHandle, asyncScope = new AsyncScope(),
    handler?: string) => {
  return await asyncScope.exec(() => waitForFunction(async () => {
                                 const elements = await $$<ElementType, typeof selector>(selector, root, handler);
                                 return elements.length >= count ? elements : undefined;
                               }, asyncScope), `Waiting for ${count} elements to match selector '${selector}'`);
};

export const waitForNone =
    async (selector: string, root?: puppeteer.ElementHandle, asyncScope = new AsyncScope(), handler?: string) => {
  const {devToolsPage} = getBrowserAndPagesWrappers();
  return await devToolsPage.waitForNone(selector, root, asyncScope, handler);
};

export const waitForAria = <ElementType extends Element = Element>(
    selector: string, root?: puppeteer.ElementHandle, asyncScope = new AsyncScope()) => {
  const {devToolsPage} = getBrowserAndPagesWrappers();
  return devToolsPage.waitForAria<ElementType>(selector, root, asyncScope);
};

export const waitForAriaNone = (selector: string, root?: puppeteer.ElementHandle, asyncScope = new AsyncScope()) => {
  return waitForNone(selector, root, asyncScope, 'aria');
};

export const waitForElementWithTextContent =
    (textContent: string, root?: puppeteer.ElementHandle, asyncScope = new AsyncScope(),
     devToolsPage = getBrowserAndPagesWrappers().devToolsPage) => {
      return devToolsPage.waitForElementWithTextContent(textContent, root, asyncScope);
    };

export const waitForElementsWithTextContent =
    (textContent: string, root?: puppeteer.ElementHandle, asyncScope = new AsyncScope()) => {
      return asyncScope.exec(() => waitForFunction(async () => {
                               const elems = await $$textContent(textContent, root);
                               if (elems?.length) {
                                 return elems;
                               }

                               return undefined;
                             }, asyncScope), `Waiting for elements with textContent '${textContent}'`);
    };

export const waitForNoElementsWithTextContent =
    (textContent: string, root?: puppeteer.ElementHandle, asyncScope = new AsyncScope()) => {
      return asyncScope.exec(() => waitForFunction(async () => {
                               const elems = await $$textContent(textContent, root);
                               if (elems && elems.length === 0) {
                                 return true;
                               }

                               return false;
                             }, asyncScope), `Waiting for no elements with textContent '${textContent}'`);
    };

export const waitForFunction =
    async<T>(fn: () => Promise<T|undefined>, asyncScope = new AsyncScope(), description?: string) => {
  const {devToolsPage} = getBrowserAndPagesWrappers();
  return await devToolsPage.waitForFunction(fn, asyncScope, description);
};

export const waitForFunctionWithTries = async<T>(
    fn: () => Promise<T|undefined>, options: {tries: number} = {
      tries: Number.MAX_SAFE_INTEGER,
    },
    asyncScope = new AsyncScope()) => {
  return await asyncScope.exec(async () => {
    let tries = 0;
    while (tries++ < options.tries) {
      const result = await fn();
      if (result) {
        return result;
      }
      await timeout(100);
    }
    return undefined;
  });
};

export const waitForWithTries = async (
    selector: string, root?: puppeteer.ElementHandle, options: {tries: number} = {
      tries: Number.MAX_SAFE_INTEGER,
    },
    asyncScope = new AsyncScope(), handler?: string) => {
  return await asyncScope.exec(() => waitForFunctionWithTries(async () => {
                                 const element = await $(selector, root, handler);
                                 return (element || undefined);
                               }, options, asyncScope));
};

export const debuggerStatement = (frontend: puppeteer.Page) => {
  return frontend.evaluate(() => {
    // eslint-disable-next-line no-debugger
    debugger;
  });
};

export const logToStdOut = (msg: string) => {
  if (!process.send) {
    return;
  }

  process.send({
    pid: process.pid,
    details: msg,
  });
};

export const logFailure = () => {
  if (!process.send) {
    return;
  }

  process.send({
    pid: process.pid,
    details: 'failure',
  });
};

async function setExperimentEnabled(experiment: string, enabled: boolean, options?: DevToolsFrontendReloadOptions) {
  const {frontend} = getBrowserAndPages();
  await frontend.evaluate(`(async () => {
    const Root = await import('./core/root/root.js');
    Root.Runtime.experiments.setEnabled('${experiment}', ${enabled});
  })()`);
  await reloadDevTools(options);
}

export const enableExperiment = (experiment: string, options?: DevToolsFrontendReloadOptions) =>
    setExperimentEnabled(experiment, true, options);

export const disableExperiment = (experiment: string, options?: DevToolsFrontendReloadOptions) =>
    setExperimentEnabled(experiment, false, options);

export const setDevToolsSettings = async (settings: Record<string, string>) => {
  const {frontend} = getBrowserAndPages();
  await frontend.evaluate(settings => {
    for (const name in settings) {
      globalThis.InspectorFrontendHost.setPreference(name, JSON.stringify(settings[name]));
    }
  }, settings);
  await reloadDevTools();
};

export function goToHtml(html: string): Promise<void> {
  return goTo(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}

export const goTo = async (url: string, options: puppeteer.WaitForOptions = {}) => {
  const {target} = getBrowserAndPages();
  await target.goto(url, options);
};

export const overridePermissions = async (permissions: puppeteer.Permission[]) => {
  const {browser} = getBrowserAndPages();
  await browser.defaultBrowserContext().overridePermissions(`https://localhost:${getTestServerPort()}`, permissions);
};

export const clearPermissionsOverride = async () => {
  const {browser} = getBrowserAndPages();
  await browser.defaultBrowserContext().clearPermissionOverrides();
};

export const goToResource = async (path: string, options: puppeteer.WaitForOptions = {}) => {
  await goTo(`${getResourcesPath()}/${path}`, options);
};

export const goToResourceWithCustomHost = async (host: string, path: string) => {
  assert.isTrue(host.endsWith('.test'), 'Only custom hosts with a .test domain are allowed.');
  await goTo(`${getResourcesPath(host)}/${path}`);
};

export const getResourcesPath = (host = 'localhost') => {
  return `https://${host}:${getTestServerPort()}/test/e2e/resources`;
};

export const step = async<T = unknown>(description: string, step: () => Promise<T>| T): Promise<Awaited<T>> => {
  try {
    return await step();
  } catch (error) {
    if (error instanceof AssertionError) {
      throw new AssertionError(
          `Unexpected Result in Step "${description}"
      ${error.message}`,
          error);
    } else {
      error.message += ` in Step "${description}"`;
      throw error;
    }
  }
};

export const waitForAnimationFrame = async () => {
  const {frontend} = getBrowserAndPages();

  await frontend.waitForFunction(() => {
    return new Promise(resolve => {
      requestAnimationFrame(resolve);
    });
  });
};

export const activeElement = async () => {
  const {frontend} = getBrowserAndPages();

  await waitForAnimationFrame();

  return await frontend.evaluateHandle(() => {
    let activeElement = document.activeElement;

    while (activeElement?.shadowRoot) {
      activeElement = activeElement.shadowRoot.activeElement;
    }

    if (!activeElement) {
      throw new Error('No active element found');
    }

    return activeElement;
  });
};

export const activeElementTextContent = async () => {
  const element = await activeElement();
  return await element.evaluate(node => node.textContent);
};

export const activeElementAccessibleName = async () => {
  const element = await activeElement();
  return await element.evaluate(node => node.getAttribute('aria-label') || node.getAttribute('title'));
};

export const tabForward = async (page?: puppeteer.Page) => {
  let targetPage: puppeteer.Page;
  if (page) {
    targetPage = page;
  } else {
    const {frontend} = getBrowserAndPages();
    targetPage = frontend;
  }

  await targetPage.keyboard.press('Tab');
};

export const tabBackward = async (page?: puppeteer.Page) => {
  let targetPage: puppeteer.Page;
  if (page) {
    targetPage = page;
  } else {
    const {frontend} = getBrowserAndPages();
    targetPage = frontend;
  }

  await targetPage.keyboard.down('Shift');
  await targetPage.keyboard.press('Tab');
  await targetPage.keyboard.up('Shift');
};

type Awaitable<T> = T|PromiseLike<T>;

export const selectTextFromNodeToNode = async (
    from: Awaitable<puppeteer.ElementHandle>, to: Awaitable<puppeteer.ElementHandle>, direction: 'up'|'down') => {
  const {target} = getBrowserAndPages();

  // The clipboard api does not allow you to copy, unless the tab is focused.
  await target.bringToFront();

  return await target.evaluate(async (from, to, direction) => {
    const selection = (from.getRootNode() as Document).getSelection();
    const range = document.createRange();
    if (direction === 'down') {
      range.setStartBefore(from);
      range.setEndAfter(to);
    } else {
      range.setStartBefore(to);
      range.setEndAfter(from);
    }

    if (selection) {
      selection.removeAllRanges();
      selection.addRange(range);
    }

    document.execCommand('copy');

    return await navigator.clipboard.readText();
  }, await from, await to, direction);
};

export const clickMoreTabsButton = async (root?: puppeteer.ElementHandle<Element>) => {
  await click('aria/More tabs', {root});
};

export const closePanelTab = async (panelTabSelector: string) => {
  // Get close button from tab element
  const selector = `${panelTabSelector} > .tabbed-pane-close-button`;
  await click(selector);
  await waitForNone(selector);
};

export const closeAllCloseableTabs = async () => {
  // get all closeable tools by looking for the available x buttons on tabs
  const selector = '.tabbed-pane-close-button';
  const allCloseButtons = await $$(selector);

  // Get all panel ids
  const panelTabIds = await Promise.all(allCloseButtons.map(button => {
    return button.evaluate(button => button.parentElement ? button.parentElement.id : '');
  }));

  // Close each tab
  for (const tabId of panelTabIds) {
    const selector = `#${tabId}`;
    await closePanelTab(selector);
  }
};

// Noisy! Do not leave this in your test but it may be helpful
// when debugging.
export const enableCDPLogging = async () => {
  const {frontend} = getBrowserAndPages();
  await frontend.evaluate(() => {
    globalThis.ProtocolClient.test.dumpProtocol = console.log;  // eslint-disable-line no-console
  });
};

export const enableCDPTracking = async () => {
  const {frontend} = getBrowserAndPages();
  await frontend.evaluate(() => {
    globalThis.__messageMapForTest = new Map();
    globalThis.ProtocolClient.test.onMessageSent = (message: {method: string, id: number}) => {
      globalThis.__messageMapForTest.set(message.id, message.method);
    };
    globalThis.ProtocolClient.test.onMessageReceived = (message: {id?: number}) => {
      if (message.id) {
        globalThis.__messageMapForTest.delete(message.id);
      }
    };
  });
};

export const logOutstandingCDP = async () => {
  const {frontend} = getBrowserAndPages();
  await frontend.evaluate(() => {
    for (const entry of globalThis.__messageMapForTest) {
      console.error(entry);
    }
  });
};

export const selectOption = async (select: puppeteer.ElementHandle<HTMLSelectElement>, value: string) => {
  await select.evaluate(async (node: HTMLSelectElement, _value: string) => {
    node.value = _value;
    const event = document.createEvent('HTMLEvents');
    event.initEvent('change', false, true);
    node.dispatchEvent(event);
  }, value);
};

export const scrollElementIntoView = async (
    selector: string, root?: puppeteer.ElementHandle,
    devToolsPage: DevToolsPage = getBrowserAndPagesWrappers().devToolsPage) => {
  await devToolsPage.scrollElementIntoView(selector, root);
};

export const installEventListener = function(frontend: puppeteer.Page, eventType: string) {
  return frontend.evaluate(eventType => {
    window.__pendingEvents = window.__pendingEvents || new Map();
    window.addEventListener(eventType, (e: Event) => {
      let events = window.__pendingEvents.get(eventType);
      if (!events) {
        events = [];
        window.__pendingEvents.set(eventType, events);
      }
      events.push(e);
    });
  }, eventType);
};

export const getPendingEvents = function(frontend: puppeteer.Page, eventType: string): Promise<Event[]|undefined> {
  return frontend.evaluate(eventType => {
    if (!('__pendingEvents' in window)) {
      return undefined;
    }
    const pendingEvents = window.__pendingEvents.get(eventType);
    window.__pendingEvents.set(eventType, []);
    return pendingEvents;
  }, eventType);
};

export function prepareWaitForEvent(element: puppeteer.ElementHandle, eventType: string): Promise<void> {
  return element.evaluate((element: Element, eventType: string) => {
    window.__eventHandlers = window.__eventHandlers || new WeakMap();

    const eventHandlers = (() => {
      const eventHandlers = window.__eventHandlers.get(element);
      if (eventHandlers) {
        return eventHandlers;
      }
      const newMap = new Map<string, Promise<void>>();
      window.__eventHandlers.set(element, newMap);
      return newMap;
    })();

    if (eventHandlers.has(eventType)) {
      throw new Error(`Event listener for ${eventType}' has already been installed.`);
    }
    eventHandlers.set(eventType, new Promise<void>(resolve => {
                        const handler = () => {
                          element.removeEventListener(eventType, handler);
                          resolve();
                        };
                        element.addEventListener(eventType, handler);
                      }));
  }, eventType);
}

export function waitForEvent(element: puppeteer.ElementHandle, eventType: string): Promise<void> {
  return element.evaluate((element: Element, eventType: string) => {
    if (!('__eventHandlers' in window)) {
      throw new Error(`Event listener for '${eventType}' has not been installed.`);
    }
    const handler = window.__eventHandlers.get(element)?.get(eventType);
    if (!handler) {
      throw new Error(`Event listener for '${eventType}' has not been installed.`);
    }
    return handler;
  }, eventType);
}

export const hasClass = async (element: puppeteer.ElementHandle<Element>, classname: string) => {
  return await element.evaluate((el, classname) => el.classList.contains(classname), classname);
};

export const waitForClass = async (element: puppeteer.ElementHandle<Element>, classname: string) => {
  await waitForFunction(async () => {
    return await hasClass(element, classname);
  });
};

/**
 * This is useful to keep TypeScript happy in a test - if you have a value
 * that's potentially `null` you can use this function to assert that it isn't,
 * and satisfy TypeScript that the value is present.
 */
export function assertNotNullOrUndefined<T>(val: T): asserts val is NonNullable<T> {
  if (val === null || val === undefined) {
    throw new Error(`Expected given value to not be null/undefined but it was: ${val}`);
  }
}

export {getBrowserAndPages, getDevToolsFrontendHostname, getTestServerPort, reloadDevTools};

export function matchString(actual: string, expected: string|RegExp): true|string {
  if (typeof expected === 'string') {
    if (actual !== expected) {
      return `Expected item "${actual}" to equal "${expected}"`;
    }
  } else if (!expected.test(actual)) {
    return `Expected item "${actual}" to match "${expected}"`;
  }
  return true;
}

export function matchArray<A, E>(
    actual: A[], expected: E[], comparator: (actual: A, expected: E) => true | string): true|string {
  if (actual.length !== expected.length) {
    return `Expected [${actual.map(x => `"${x}"`).join(', ')}] to have length ${expected.length}`;
  }

  for (let i = 0; i < expected.length; ++i) {
    const result = comparator(actual[i], expected[i]);
    if (result !== true) {
      return `Mismatch in row ${i}: ${result}`;
    }
  }
  return true;
}

export function assertOk<Args extends unknown[]>(check: (...args: Args) => true | string) {
  return (...args: Args) => {
    const result = check(...args);
    if (result !== true) {
      throw new AssertionError(result);
    }
  };
}

export function matchTable<A, E>(
    actual: A[][], expected: E[][], comparator: (actual: A, expected: E) => true | string) {
  return matchArray(actual, expected, (actual, expected) => matchArray<A, E>(actual, expected, comparator));
}

export const matchStringArray = (actual: string[], expected: Array<string|RegExp>) =>
    matchArray(actual, expected, matchString);

export const assertMatchArray = assertOk(matchStringArray);

export const matchStringTable = (actual: string[][], expected: Array<Array<string|RegExp>>) =>
    matchTable(actual, expected, matchString);

export async function renderCoordinatorQueueEmpty(): Promise<void> {
  const {frontend} = getBrowserAndPages();
  await frontend.evaluate(() => {
    return new Promise<void>(resolve => {
      const pendingFrames = globalThis.__getRenderCoordinatorPendingFrames();
      if (pendingFrames < 1) {
        resolve();
        return;
      }
      globalThis.addEventListener('renderqueueempty', resolve, {once: true});
    });
  });
}

export async function setCheckBox(selector: string, wantChecked: boolean): Promise<void> {
  const checkbox = await waitFor(selector);
  const checked = await checkbox.evaluate(box => (box as HTMLInputElement).checked);
  if (checked !== wantChecked) {
    await click(`${selector} + label`);
  }
  assert.strictEqual(await checkbox.evaluate(box => (box as HTMLInputElement).checked), wantChecked);
}

export const summonSearchBox = async () => {
  await pressKey('f', {control: true});
};

export const replacePuppeteerUrl = (value: string) => {
  return value.replace(/pptr:.*:([0-9]+)$/, (_, match) => {
    return `(index):${match}`;
  });
};

export async function raf(page: puppeteer.Page): Promise<void> {
  await page.evaluate(() => {
    return new Promise(resolve => window.requestAnimationFrame(resolve));
  });
}

export async function readClipboard() {
  const {frontend, browser} = getBrowserAndPages();
  await browser.defaultBrowserContext().overridePermissions(frontend.url(), ['clipboard-read']);
  const clipboard = await frontend.evaluate(async () => await navigator.clipboard.readText());
  await browser.defaultBrowserContext().clearPermissionOverrides();
  return clipboard;
}
