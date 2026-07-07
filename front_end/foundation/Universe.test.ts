// Copyright 2025 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {assert} from 'chai';

import * as Common from '../core/common/common.js';
import * as Host from '../core/host/host.js';
import type * as Root from '../core/root/root.js';

import * as Foundation from './foundation.js';

describe('Universe', () => {
  const {SettingType} = Common.Settings;
  function createSettingsCreationOptions() {
    return {
      syncedStorage: new Common.Settings.SettingsStorage({}),
      globalStorage: new Common.Settings.SettingsStorage({}),
      localStorage: new Common.Settings.SettingsStorage({}),
      settingRegistrations: [
        {
          settingName: 'automatically-ignore-list-known-third-party-scripts',
          settingType: SettingType.BOOLEAN,
          defaultValue: true,
        },
        {settingName: 'enable-ignore-listing', settingType: SettingType.BOOLEAN, defaultValue: true},
        {settingName: 'network-log.preserve-log', settingType: SettingType.BOOLEAN, defaultValue: false},
        {settingName: 'network-log.record-log', settingType: SettingType.BOOLEAN, defaultValue: true},
        {settingName: 'persistence-network-overrides-enabled', settingType: SettingType.BOOLEAN, defaultValue: false},
        {settingName: 'request-blocking-enabled', settingType: SettingType.BOOLEAN, defaultValue: false},
        {settingName: 'skip-anonymous-scripts', settingType: SettingType.BOOLEAN, defaultValue: false},
        {settingName: 'skip-content-scripts', settingType: SettingType.BOOLEAN, defaultValue: true},
        {settingName: 'skip-stack-frames-pattern', settingType: SettingType.REGEX, defaultValue: ''},
      ],
    };
  }

  it('can be instantiated', () => {
    new Foundation.Universe.Universe({
      settingsCreationOptions: createSettingsCreationOptions(),
      hostConfig: {} as Root.Runtime.HostConfig,
      inspectorFrontendHost: Host.InspectorFrontendHost.InspectorFrontendHostInstance,
      supportsEmulation: false,
    });
  });

  it('returns DeviceModeModel when emulation is supported', () => {
    const settingsOptions = createSettingsCreationOptions();
    settingsOptions.settingRegistrations.push({
      settingName: 'emulation.show-device-outline',
      settingType: SettingType.BOOLEAN,
      defaultValue: false,
    });

    const universe = new Foundation.Universe.Universe({
      settingsCreationOptions: settingsOptions,
      hostConfig: {} as Root.Runtime.HostConfig,
      inspectorFrontendHost: Host.InspectorFrontendHost.InspectorFrontendHostInstance,
      supportsEmulation: true,
    });
    assert.isNotNull(universe.deviceModeModel);
  });

  it('returns null for DeviceModeModel when emulation is not supported', () => {
    const universe = new Foundation.Universe.Universe({
      settingsCreationOptions: createSettingsCreationOptions(),
      hostConfig: {} as Root.Runtime.HostConfig,
      inspectorFrontendHost: Host.InspectorFrontendHost.InspectorFrontendHostInstance,
      supportsEmulation: false,
    });
    assert.isNull(universe.deviceModeModel);
  });
});
