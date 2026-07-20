// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {assert} from 'chai';

import * as Common from '../../core/common/common.js';

import * as SettingsUI from './settings.js';

describe('SettingUIRegistration', () => {
  beforeEach(() => SettingsUI.SettingUIRegistration.resetSettings());
  afterEach(() => SettingsUI.SettingUIRegistration.resetSettings());

  const settingDescriptor: Common.Settings.SettingDescriptor<boolean> = {
    name: 'mock-setting',
    type: Common.Settings.SettingType.BOOLEAN,
    defaultValue: false,
  };

  it('registers a setting UI descriptor', () => {
    SettingsUI.SettingUIRegistration.register(settingDescriptor, {
      category: Common.SettingRegistration.SettingCategory.GLOBAL,
    });

    const registered = SettingsUI.SettingUIRegistration.getRegisteredSettings();
    assert.lengthOf(registered, 1);
    assert.strictEqual(registered[0].descriptor.name, 'mock-setting');
    assert.strictEqual(registered[0].uiDescriptor.category, Common.SettingRegistration.SettingCategory.GLOBAL);
  });

  it('throws an error when trying to register a duplicate setting name', () => {
    SettingsUI.SettingUIRegistration.register(settingDescriptor, {});

    assert.throws(() => {
      SettingsUI.SettingUIRegistration.register(settingDescriptor, {});
    }, 'Duplicate setting name \'mock-setting\'');
  });

  it('resolves a registered setting UI descriptor', () => {
    const uiDescriptor: SettingsUI.SettingUIRegistration.SettingUIDescriptor = {
      category: Common.SettingRegistration.SettingCategory.GLOBAL,
    };
    SettingsUI.SettingUIRegistration.register(settingDescriptor, uiDescriptor);

    const resolved = SettingsUI.SettingUIRegistration.resolve(settingDescriptor);
    assert.strictEqual(resolved, uiDescriptor);
  });

  it('throws an error when resolving an unregistered setting descriptor', () => {
    assert.throws(() => {
      SettingsUI.SettingUIRegistration.resolve(settingDescriptor);
    }, 'No UI descriptor registered for setting \'mock-setting\'');
  });
});
