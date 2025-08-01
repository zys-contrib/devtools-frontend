// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as Common from '../../core/common/common.js';
import * as i18n from '../../core/i18n/i18n.js';
import * as Platform from '../../core/platform/platform.js';
import * as SDK from '../../core/sdk/sdk.js';

import type {UISourceCode} from './UISourceCode.js';
import {projectTypes} from './WorkspaceImpl.js';

const UIStrings = {
  /**
   *@description Text to stop preventing the debugger from stepping into library code
   */
  removeFromIgnoreList: 'Remove from ignore list',
  /**
   *@description Text for scripts that should not be stepped into when debugging
   */
  addScriptToIgnoreList: 'Add script to ignore list',
  /**
   *@description Text for directories whose scripts should not be stepped into when debugging
   */
  addDirectoryToIgnoreList: 'Add directory to ignore list',
  /**
   *@description A context menu item in the Call Stack Sidebar Pane of the Sources panel
   */
  addAllContentScriptsToIgnoreList: 'Add all extension scripts to ignore list',
  /**
   *@description A context menu item in the Call Stack Sidebar Pane of the Sources panel
   */
  addAllThirdPartyScriptsToIgnoreList: 'Add all third-party scripts to ignore list',
  /**
   *@description A context menu item in the Call Stack Sidebar Pane of the Sources panel
   */
  addAllAnonymousScriptsToIgnoreList: 'Add all anonymous scripts to ignore list',
} as const;

const str_ = i18n.i18n.registerUIStrings('models/workspace/IgnoreListManager.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);

let ignoreListManagerInstance: IgnoreListManager|undefined;

export interface IgnoreListGeneralRules {
  isContentScript?: boolean;
  isKnownThirdParty?: boolean;
  isCurrentlyIgnoreListed?: boolean;
}

export class IgnoreListManager extends Common.ObjectWrapper.ObjectWrapper<EventTypes> implements
    SDK.TargetManager.SDKModelObserver<SDK.DebuggerModel.DebuggerModel> {
  readonly #listeners: Set<() => void>;
  readonly #isIgnoreListedURLCache: Map<string, boolean>;
  readonly #contentScriptExecutionContexts: Set<string>;

  private constructor() {
    super();

    SDK.TargetManager.TargetManager.instance().addModelListener(
        SDK.DebuggerModel.DebuggerModel, SDK.DebuggerModel.Events.GlobalObjectCleared,
        this.clearCacheIfNeeded.bind(this), this);
    SDK.TargetManager.TargetManager.instance().addModelListener(
        SDK.RuntimeModel.RuntimeModel, SDK.RuntimeModel.Events.ExecutionContextCreated, this.onExecutionContextCreated,
        this, {scoped: true});
    SDK.TargetManager.TargetManager.instance().addModelListener(
        SDK.RuntimeModel.RuntimeModel, SDK.RuntimeModel.Events.ExecutionContextDestroyed,
        this.onExecutionContextDestroyed, this, {scoped: true});
    Common.Settings.Settings.instance()
        .moduleSetting('skip-stack-frames-pattern')
        .addChangeListener(this.patternChanged.bind(this));
    Common.Settings.Settings.instance()
        .moduleSetting('skip-content-scripts')
        .addChangeListener(this.patternChanged.bind(this));
    Common.Settings.Settings.instance()
        .moduleSetting('automatically-ignore-list-known-third-party-scripts')
        .addChangeListener(this.patternChanged.bind(this));
    Common.Settings.Settings.instance()
        .moduleSetting('enable-ignore-listing')
        .addChangeListener(this.patternChanged.bind(this));
    Common.Settings.Settings.instance()
        .moduleSetting('skip-anonymous-scripts')
        .addChangeListener(this.patternChanged.bind(this));

    this.#listeners = new Set();
    this.#isIgnoreListedURLCache = new Map();
    this.#contentScriptExecutionContexts = new Set();

    SDK.TargetManager.TargetManager.instance().observeModels(SDK.DebuggerModel.DebuggerModel, this);
  }

  static instance(opts: {
    forceNew: boolean|null,
  } = {forceNew: null}): IgnoreListManager {
    const {forceNew} = opts;
    if (!ignoreListManagerInstance || forceNew) {
      ignoreListManagerInstance = new IgnoreListManager();
    }

    return ignoreListManagerInstance;
  }

  static removeInstance(): void {
    ignoreListManagerInstance = undefined;
  }

  addChangeListener(listener: () => void): void {
    this.#listeners.add(listener);
  }

  removeChangeListener(listener: () => void): void {
    this.#listeners.delete(listener);
  }

  modelAdded(debuggerModel: SDK.DebuggerModel.DebuggerModel): void {
    void this.setIgnoreListPatterns(debuggerModel);
    const sourceMapManager = debuggerModel.sourceMapManager();
    sourceMapManager.addEventListener(SDK.SourceMapManager.Events.SourceMapAttached, this.sourceMapAttached, this);
    sourceMapManager.addEventListener(SDK.SourceMapManager.Events.SourceMapDetached, this.sourceMapDetached, this);
  }

  modelRemoved(debuggerModel: SDK.DebuggerModel.DebuggerModel): void {
    this.clearCacheIfNeeded();
    const sourceMapManager = debuggerModel.sourceMapManager();
    sourceMapManager.removeEventListener(SDK.SourceMapManager.Events.SourceMapAttached, this.sourceMapAttached, this);
    sourceMapManager.removeEventListener(SDK.SourceMapManager.Events.SourceMapDetached, this.sourceMapDetached, this);
  }

  private isContentScript(executionContext: SDK.RuntimeModel.ExecutionContext): boolean {
    return !executionContext.isDefault;
  }

  private onExecutionContextCreated(event: Common.EventTarget.EventTargetEvent<SDK.RuntimeModel.ExecutionContext>):
      void {
    if (this.isContentScript(event.data)) {
      this.#contentScriptExecutionContexts.add(event.data.uniqueId);
      if (this.skipContentScripts) {
        for (const debuggerModel of SDK.TargetManager.TargetManager.instance().models(
                 SDK.DebuggerModel.DebuggerModel)) {
          void this.updateIgnoredExecutionContexts(debuggerModel);
        }
      }
    }
  }

  private onExecutionContextDestroyed(event: Common.EventTarget.EventTargetEvent<SDK.RuntimeModel.ExecutionContext>):
      void {
    if (this.isContentScript(event.data)) {
      this.#contentScriptExecutionContexts.delete(event.data.uniqueId);
      if (this.skipContentScripts) {
        for (const debuggerModel of SDK.TargetManager.TargetManager.instance().models(
                 SDK.DebuggerModel.DebuggerModel)) {
          void this.updateIgnoredExecutionContexts(debuggerModel);
        }
      }
    }
  }

  private clearCacheIfNeeded(): void {
    if (this.#isIgnoreListedURLCache.size > 1024) {
      this.#isIgnoreListedURLCache.clear();
    }
  }

  private getSkipStackFramesPatternSetting(): Common.Settings.RegExpSetting {
    return Common.Settings.Settings.instance().moduleSetting('skip-stack-frames-pattern') as
        Common.Settings.RegExpSetting;
  }

  private setIgnoreListPatterns(debuggerModel: SDK.DebuggerModel.DebuggerModel): Promise<boolean> {
    const regexPatterns = this.enableIgnoreListing ? this.getSkipStackFramesPatternSetting().getAsArray() : [];
    const patterns = ([] as string[]);
    for (const item of regexPatterns) {
      if (!item.disabled && item.pattern) {
        patterns.push(item.pattern);
      }
    }
    return debuggerModel.setBlackboxPatterns(patterns, this.skipAnonymousScripts);
  }

  private updateIgnoredExecutionContexts(debuggerModel: SDK.DebuggerModel.DebuggerModel): Promise<boolean> {
    return debuggerModel.setBlackboxExecutionContexts(
        this.skipContentScripts ? Array.from(this.#contentScriptExecutionContexts) : []);
  }

  private getGeneralRulesForUISourceCode(uiSourceCode: UISourceCode): IgnoreListGeneralRules {
    const projectType = uiSourceCode.project().type();
    const isContentScript = projectType === projectTypes.ContentScripts;
    const isKnownThirdParty = uiSourceCode.isKnownThirdParty();
    return {isContentScript, isKnownThirdParty};
  }

  isUserOrSourceMapIgnoreListedUISourceCode(uiSourceCode: UISourceCode): boolean {
    if (uiSourceCode.isUnconditionallyIgnoreListed()) {
      return true;
    }
    const url = this.uiSourceCodeURL(uiSourceCode);
    return this.isUserIgnoreListedURL(url, this.getGeneralRulesForUISourceCode(uiSourceCode));
  }

  isUserIgnoreListedURL(url: Platform.DevToolsPath.UrlString|null, options?: IgnoreListGeneralRules): boolean {
    if (!this.enableIgnoreListing) {
      return false;
    }
    if (options?.isContentScript && this.skipContentScripts) {
      return true;
    }
    if (options?.isKnownThirdParty && this.automaticallyIgnoreListKnownThirdPartyScripts) {
      return true;
    }
    if (!url) {
      return this.skipAnonymousScripts;
    }
    if (this.#isIgnoreListedURLCache.has(url)) {
      return Boolean(this.#isIgnoreListedURLCache.get(url));
    }

    const isIgnoreListed = this.getFirstMatchedRegex(url) !== null;
    this.#isIgnoreListedURLCache.set(url, isIgnoreListed);
    return isIgnoreListed;
  }

  getFirstMatchedRegex(url: Platform.DevToolsPath.UrlString): RegExp|null {
    if (!url) {
      return null;
    }
    const regexPatterns = this.getSkipStackFramesPatternSetting().getAsArray();
    const regexValue = this.urlToRegExpString(url);
    if (!regexValue) {
      return null;
    }

    for (let i = 0; i < regexPatterns.length; ++i) {
      const item = regexPatterns[i];
      if (item.disabled || item.disabledForUrl === url) {
        continue;
      }
      const regex = new RegExp(item.pattern);
      if (regex.test(url)) {
        return regex;
      }
    }
    return null;
  }

  private sourceMapAttached(
      event: Common.EventTarget.EventTargetEvent<{client: SDK.Script.Script, sourceMap: SDK.SourceMap.SourceMap}>):
      void {
    const script = event.data.client;
    const sourceMap = event.data.sourceMap;
    void this.updateScriptRanges(script, sourceMap);
  }

  private sourceMapDetached(
      event: Common.EventTarget.EventTargetEvent<{client: SDK.Script.Script, sourceMap: SDK.SourceMap.SourceMap}>):
      void {
    const script = event.data.client;
    void this.updateScriptRanges(script, undefined);
  }

  private async updateScriptRanges(script: SDK.Script.Script, sourceMap: SDK.SourceMap.SourceMap|undefined):
      Promise<void> {
    let hasIgnoreListedMappings = false;
    if (!IgnoreListManager.instance().isUserIgnoreListedURL(
            script.sourceURL, {isContentScript: script.isContentScript()})) {
      hasIgnoreListedMappings =
          sourceMap?.sourceURLs().some(
              url => this.isUserIgnoreListedURL(url, {isKnownThirdParty: sourceMap.hasIgnoreListHint(url)})) ??
          false;
    }
    if (!hasIgnoreListedMappings) {
      if (scriptToRange.get(script) && await script.setBlackboxedRanges([])) {
        scriptToRange.delete(script);
      }
      this.dispatchEventToListeners(Events.IGNORED_SCRIPT_RANGES_UPDATED, script);
      return;
    }

    if (!sourceMap) {
      return;
    }

    const newRanges =
        sourceMap
            .findRanges(
                srcURL => this.isUserIgnoreListedURL(srcURL, {isKnownThirdParty: sourceMap.hasIgnoreListHint(srcURL)}),
                {isStartMatching: true})
            .flatMap(range => [range.start, range.end]);

    const oldRanges = scriptToRange.get(script) || [];
    if (!isEqual(oldRanges, newRanges) && await script.setBlackboxedRanges(newRanges)) {
      scriptToRange.set(script, newRanges);
    }
    this.dispatchEventToListeners(Events.IGNORED_SCRIPT_RANGES_UPDATED, script);

    function isEqual(rangesA: SourceRange[], rangesB: SourceRange[]): boolean {
      if (rangesA.length !== rangesB.length) {
        return false;
      }
      for (let i = 0; i < rangesA.length; ++i) {
        if (rangesA[i].lineNumber !== rangesB[i].lineNumber || rangesA[i].columnNumber !== rangesB[i].columnNumber) {
          return false;
        }
      }
      return true;
    }
  }

  private uiSourceCodeURL(uiSourceCode: UISourceCode): Platform.DevToolsPath.UrlString|null {
    return uiSourceCode.project().type() === projectTypes.Debugger ? null : uiSourceCode.url();
  }

  canIgnoreListUISourceCode(uiSourceCode: UISourceCode): boolean {
    const url = this.uiSourceCodeURL(uiSourceCode);
    return url ? Boolean(this.urlToRegExpString(url)) : false;
  }

  ignoreListUISourceCode(uiSourceCode: UISourceCode): void {
    const url = this.uiSourceCodeURL(uiSourceCode);
    if (url) {
      this.ignoreListURL(url);
    }
  }

  unIgnoreListUISourceCode(uiSourceCode: UISourceCode): void {
    this.unIgnoreListURL(this.uiSourceCodeURL(uiSourceCode), this.getGeneralRulesForUISourceCode(uiSourceCode));
  }

  get enableIgnoreListing(): boolean {
    return Common.Settings.Settings.instance().moduleSetting('enable-ignore-listing').get();
  }

  set enableIgnoreListing(value: boolean) {
    Common.Settings.Settings.instance().moduleSetting('enable-ignore-listing').set(value);
  }

  get skipContentScripts(): boolean {
    return this.enableIgnoreListing && Common.Settings.Settings.instance().moduleSetting('skip-content-scripts').get();
  }

  get skipAnonymousScripts(): boolean {
    return this.enableIgnoreListing &&
        Common.Settings.Settings.instance().moduleSetting('skip-anonymous-scripts').get();
  }

  get automaticallyIgnoreListKnownThirdPartyScripts(): boolean {
    return this.enableIgnoreListing &&
        Common.Settings.Settings.instance().moduleSetting('automatically-ignore-list-known-third-party-scripts').get();
  }

  ignoreListContentScripts(): void {
    if (!this.enableIgnoreListing) {
      this.enableIgnoreListing = true;
    }
    Common.Settings.Settings.instance().moduleSetting('skip-content-scripts').set(true);
  }

  unIgnoreListContentScripts(): void {
    Common.Settings.Settings.instance().moduleSetting('skip-content-scripts').set(false);
  }

  ignoreListAnonymousScripts(): void {
    if (!this.enableIgnoreListing) {
      this.enableIgnoreListing = true;
    }
    Common.Settings.Settings.instance().moduleSetting('skip-anonymous-scripts').set(true);
  }

  unIgnoreListAnonymousScripts(): void {
    Common.Settings.Settings.instance().moduleSetting('skip-anonymous-scripts').set(false);
  }

  ignoreListThirdParty(): void {
    if (!this.enableIgnoreListing) {
      this.enableIgnoreListing = true;
    }
    Common.Settings.Settings.instance().moduleSetting('automatically-ignore-list-known-third-party-scripts').set(true);
  }

  unIgnoreListThirdParty(): void {
    Common.Settings.Settings.instance().moduleSetting('automatically-ignore-list-known-third-party-scripts').set(false);
  }

  ignoreListURL(url: Platform.DevToolsPath.UrlString): void {
    const regexValue = this.urlToRegExpString(url);
    if (!regexValue) {
      return;
    }
    this.addRegexToIgnoreList(regexValue, url);
  }

  addRegexToIgnoreList(regexValue: string, disabledForUrl?: Platform.DevToolsPath.UrlString): void {
    const regexPatterns = this.getSkipStackFramesPatternSetting().getAsArray();

    let found = false;
    for (let i = 0; i < regexPatterns.length; ++i) {
      const item = regexPatterns[i];
      if (item.pattern === regexValue || (disabledForUrl && item.disabledForUrl === disabledForUrl)) {
        item.disabled = false;
        item.disabledForUrl = undefined;
        found = true;
      }
    }
    if (!found) {
      regexPatterns.push({pattern: regexValue, disabled: false});
    }
    if (!this.enableIgnoreListing) {
      this.enableIgnoreListing = true;
    }
    this.getSkipStackFramesPatternSetting().setAsArray(regexPatterns);
  }

  unIgnoreListURL(url: Platform.DevToolsPath.UrlString|null, options?: IgnoreListGeneralRules): void {
    if (options?.isContentScript) {
      this.unIgnoreListContentScripts();
    }

    if (options?.isKnownThirdParty) {
      this.unIgnoreListThirdParty();
    }

    if (!url) {
      this.unIgnoreListAnonymousScripts();
      return;
    }

    let regexPatterns = this.getSkipStackFramesPatternSetting().getAsArray();
    const regexValue = IgnoreListManager.instance().urlToRegExpString(url);
    if (!regexValue) {
      return;
    }

    regexPatterns = regexPatterns.filter(function(item) {
      return item.pattern !== regexValue;
    });
    for (let i = 0; i < regexPatterns.length; ++i) {
      const item = regexPatterns[i];
      if (item.disabled) {
        continue;
      }
      try {
        const regex = new RegExp(item.pattern);
        if (regex.test(url)) {
          item.disabled = true;
          item.disabledForUrl = url;
        }
      } catch {
      }
    }
    this.getSkipStackFramesPatternSetting().setAsArray(regexPatterns);
  }

  private removeIgnoreListPattern(regexValue: string): void {
    let regexPatterns = this.getSkipStackFramesPatternSetting().getAsArray();
    regexPatterns = regexPatterns.filter(function(item) {
      return item.pattern !== regexValue;
    });
    this.getSkipStackFramesPatternSetting().setAsArray(regexPatterns);
  }

  private ignoreListHasPattern(regexValue: string, enabledOnly: boolean): boolean {
    const regexPatterns = this.getSkipStackFramesPatternSetting().getAsArray();
    return regexPatterns.some(item => !(enabledOnly && item.disabled) && item.pattern === regexValue);
  }

  private async patternChanged(): Promise<void> {
    this.#isIgnoreListedURLCache.clear();

    const promises: Array<Promise<unknown>> = [];
    for (const debuggerModel of SDK.TargetManager.TargetManager.instance().models(SDK.DebuggerModel.DebuggerModel)) {
      promises.push(this.setIgnoreListPatterns(debuggerModel));
      const sourceMapManager = debuggerModel.sourceMapManager();
      for (const script of debuggerModel.scripts()) {
        promises.push(this.updateScriptRanges(script, sourceMapManager.sourceMapForClient(script)));
      }
      promises.push(this.updateIgnoredExecutionContexts(debuggerModel));
    }
    await Promise.all(promises);
    const listeners = Array.from(this.#listeners);
    for (const listener of listeners) {
      listener();
    }
    this.patternChangeFinishedForTests();
  }

  private patternChangeFinishedForTests(): void {
    // This method is sniffed in tests.
  }

  private urlToRegExpString(url: Platform.DevToolsPath.UrlString): string {
    const parsedURL = new Common.ParsedURL.ParsedURL(url);
    if (parsedURL.isAboutBlank() || parsedURL.isDataURL()) {
      return '';
    }
    if (!parsedURL.isValid) {
      return '^' + Platform.StringUtilities.escapeForRegExp(url) + '$';
    }
    let name: string = parsedURL.lastPathComponent;
    if (name) {
      name = '/' + name;
    } else if (parsedURL.folderPathComponents) {
      name = parsedURL.folderPathComponents + '/';
    }
    if (!name) {
      name = parsedURL.host;
    }
    if (!name) {
      return '';
    }
    const scheme = parsedURL.scheme;
    let prefix = '';
    if (scheme && scheme !== 'http' && scheme !== 'https') {
      prefix = '^' + scheme + '://';
      if (scheme === 'chrome-extension') {
        prefix += parsedURL.host + '\\b';
      }
      prefix += '.*';
    }
    return prefix + Platform.StringUtilities.escapeForRegExp(name) + (url.endsWith(name) ? '$' : '\\b');
  }

  getIgnoreListURLContextMenuItems(uiSourceCode: UISourceCode):
      Array<{text: string, callback: () => void, jslogContext: string}> {
    if (uiSourceCode.project().type() === projectTypes.FileSystem) {
      return [];
    }

    const menuItems: Array<{text: string, callback: () => void, jslogContext: string}> = [];
    const canIgnoreList = this.canIgnoreListUISourceCode(uiSourceCode);
    const isIgnoreListed = this.isUserOrSourceMapIgnoreListedUISourceCode(uiSourceCode);
    const isAnonymous = !this.uiSourceCodeURL(uiSourceCode);
    const {isContentScript, isKnownThirdParty} = this.getGeneralRulesForUISourceCode(uiSourceCode);

    if (isIgnoreListed) {
      if (canIgnoreList || isContentScript || isKnownThirdParty || isAnonymous) {
        menuItems.push({
          text: i18nString(UIStrings.removeFromIgnoreList),
          callback: this.unIgnoreListUISourceCode.bind(this, uiSourceCode),
          jslogContext: 'remove-script-from-ignorelist',
        });
      }
    } else {
      if (canIgnoreList) {
        menuItems.push({
          text: i18nString(UIStrings.addScriptToIgnoreList),
          callback: this.ignoreListUISourceCode.bind(this, uiSourceCode),
          jslogContext: 'add-script-to-ignorelist',
        });
      } else if (isAnonymous) {
        menuItems.push({
          text: i18nString(UIStrings.addAllAnonymousScriptsToIgnoreList),
          callback: this.ignoreListAnonymousScripts.bind(this),
          jslogContext: 'add-anonymous-scripts-to-ignorelist',
        });
      }
      menuItems.push(...this.getIgnoreListGeneralContextMenuItems({isContentScript, isKnownThirdParty}));
    }

    return menuItems;
  }

  private getIgnoreListGeneralContextMenuItems(options?: IgnoreListGeneralRules):
      Array<{text: string, callback: () => void, jslogContext: string}> {
    const menuItems: Array<{text: string, callback: () => void, jslogContext: string}> = [];
    if (options?.isContentScript) {
      menuItems.push({
        text: i18nString(UIStrings.addAllContentScriptsToIgnoreList),
        callback: this.ignoreListContentScripts.bind(this),
        jslogContext: 'add-content-scripts-to-ignorelist',
      });
    }
    if (options?.isKnownThirdParty) {
      menuItems.push({
        text: i18nString(UIStrings.addAllThirdPartyScriptsToIgnoreList),
        callback: this.ignoreListThirdParty.bind(this),
        jslogContext: 'add-3p-scripts-to-ignorelist',
      });
    }
    return menuItems;
  }

  getIgnoreListFolderContextMenuItems(url: Platform.DevToolsPath.UrlString, options?: IgnoreListGeneralRules):
      Array<{text: string, callback: () => void, jslogContext: string}> {
    const menuItems: Array<{text: string, callback: () => void, jslogContext: string}> = [];

    const regexValue = '^' + Platform.StringUtilities.escapeForRegExp(url) + '/';
    if (this.ignoreListHasPattern(regexValue, true)) {
      menuItems.push({
        text: i18nString(UIStrings.removeFromIgnoreList),
        callback: this.removeIgnoreListPattern.bind(this, regexValue),
        jslogContext: 'remove-from-ignore-list',
      });
    } else if (this.isUserIgnoreListedURL(url, options)) {
      // This specific url isn't on the ignore list, but there are rules that match it.
      menuItems.push({
        text: i18nString(UIStrings.removeFromIgnoreList),
        callback: this.unIgnoreListURL.bind(this, url, options),
        jslogContext: 'remove-from-ignore-list',
      });
    } else if (!options?.isCurrentlyIgnoreListed) {
      // Provide options to add to ignore list, unless folder currently displays
      // as entirely ignored.
      menuItems.push({
        text: i18nString(UIStrings.addDirectoryToIgnoreList),
        callback: this.addRegexToIgnoreList.bind(this, regexValue),
        jslogContext: 'add-directory-to-ignore-list',
      });
      menuItems.push(...this.getIgnoreListGeneralContextMenuItems(options));
    }

    return menuItems;
  }
}

export interface SourceRange {
  lineNumber: number;
  columnNumber: number;
}

const scriptToRange = new WeakMap<SDK.Script.Script, SourceRange[]>();

export const enum Events {
  IGNORED_SCRIPT_RANGES_UPDATED = 'IGNORED_SCRIPT_RANGES_UPDATED',
}

export interface EventTypes {
  [Events.IGNORED_SCRIPT_RANGES_UPDATED]: SDK.Script.Script;
}
