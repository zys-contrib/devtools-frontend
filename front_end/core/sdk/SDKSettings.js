// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../common/common.js';
export const jsSourceMapsEnabledSettingDescriptor = {
    name: 'js-source-maps-enabled',
    type: "boolean" /* Common.Settings.SettingType.BOOLEAN */,
    defaultValue: true,
    storageType: "Synced" /* Common.Settings.SettingStorageType.SYNCED */,
};
export const cssSourceMapsEnabledSettingDescriptor = {
    name: 'css-source-maps-enabled',
    type: "boolean" /* Common.Settings.SettingType.BOOLEAN */,
    defaultValue: true,
    storageType: "Synced" /* Common.Settings.SettingStorageType.SYNCED */,
};
export const preserveConsoleLogSettingDescriptor = {
    name: 'preserve-console-log',
    type: "boolean" /* Common.Settings.SettingType.BOOLEAN */,
    defaultValue: false,
    storageType: "Synced" /* Common.Settings.SettingStorageType.SYNCED */,
};
export const pauseOnExceptionEnabledSettingDescriptor = {
    name: 'pause-on-exception-enabled',
    type: "boolean" /* Common.Settings.SettingType.BOOLEAN */,
    defaultValue: false,
};
export const pauseOnCaughtExceptionSettingDescriptor = {
    name: 'pause-on-caught-exception',
    type: "boolean" /* Common.Settings.SettingType.BOOLEAN */,
    defaultValue: false,
};
export const pauseOnUncaughtExceptionSettingDescriptor = {
    name: 'pause-on-uncaught-exception',
    type: "boolean" /* Common.Settings.SettingType.BOOLEAN */,
    defaultValue: false,
};
export const javaScriptDisabledSettingDescriptor = {
    name: 'java-script-disabled',
    type: "boolean" /* Common.Settings.SettingType.BOOLEAN */,
    defaultValue: false,
    storageType: "Session" /* Common.Settings.SettingStorageType.SESSION */,
};
export const disableAsyncStackTracesSettingDescriptor = {
    name: 'disable-async-stack-traces',
    type: "boolean" /* Common.Settings.SettingType.BOOLEAN */,
    defaultValue: false,
};
export const breakpointsActiveSettingDescriptor = {
    name: 'breakpoints-active',
    type: "boolean" /* Common.Settings.SettingType.BOOLEAN */,
    defaultValue: true,
    storageType: "Session" /* Common.Settings.SettingStorageType.SESSION */,
};
export const showMetricsRulersSettingDescriptor = {
    name: 'show-metrics-rulers',
    type: "boolean" /* Common.Settings.SettingType.BOOLEAN */,
    defaultValue: false,
    storageType: "Synced" /* Common.Settings.SettingStorageType.SYNCED */,
};
export const apcaSettingDescriptor = {
    name: 'apca',
    type: "boolean" /* Common.Settings.SettingType.BOOLEAN */,
    defaultValue: false,
    storageType: "Synced" /* Common.Settings.SettingStorageType.SYNCED */,
};
export const showGridAreasSettingDescriptor = {
    name: 'show-grid-areas',
    type: "boolean" /* Common.Settings.SettingType.BOOLEAN */,
    defaultValue: false,
    storageType: "Synced" /* Common.Settings.SettingStorageType.SYNCED */,
};
export const showGridTrackSizesSettingDescriptor = {
    name: 'show-grid-track-sizes',
    type: "boolean" /* Common.Settings.SettingType.BOOLEAN */,
    defaultValue: false,
    storageType: "Synced" /* Common.Settings.SettingStorageType.SYNCED */,
};
//# sourceMappingURL=SDKSettings.js.map