// Copyright 2018 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/* eslint-disable rulesdir/no-imperative-dom-api */

import '../../ui/components/cards/cards.js';

import * as Common from '../../core/common/common.js';
import * as i18n from '../../core/i18n/i18n.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as Buttons from '../../ui/components/buttons/buttons.js';
import * as UI from '../../ui/legacy/legacy.js';
import * as VisualLogging from '../../ui/visual_logging/visual_logging.js';

import locationsSettingsTabStyles from './locationsSettingsTab.css.js';

const UIStrings = {
  /**
   *@description Title in the Locations Settings Tab, where custom geographic locations that the user
   *has entered are stored.
   */
  locations: 'Locations',
  /**
   *@description Label for the name of a geographic location that the user has entered.
   */
  locationName: 'Location name',
  /**
   *@description Abbreviation of latitude in Locations Settings Tab of the Device Toolbar
   */
  lat: 'Lat',
  /**
   *@description Abbreviation of longitude in Locations Settings Tab of the Device Toolbar
   */
  long: 'Long',
  /**
   *@description Text in Sensors View of the Device Toolbar
   */
  timezoneId: 'Timezone ID',
  /**
   *@description Label for text input for the locale of a particular location.
   */
  locale: 'Locale',
  /**
   *@description Label for text input for the latitude of a GPS position.
   */
  latitude: 'Latitude',
  /**
   *@description Label for text input for the longitude of a GPS position.
   */
  longitude: 'Longitude',
  /**
   *@description Label for text input for the accuracy of a GPS position.
   */
  accuracy: 'Accuracy',
  /**
   *@description Error message in the Locations settings pane that declares the location name input must not be empty
   */
  locationNameCannotBeEmpty: 'Location name cannot be empty',
  /**
   *@description Error message in the Locations settings pane that declares the maximum length of the location name
   *@example {50} PH1
   */
  locationNameMustBeLessThanS: 'Location name must be less than {PH1} characters',
  /**
   *@description Error message in the Locations settings pane that declares that the value for the latitude input must be a number
   */
  latitudeMustBeANumber: 'Latitude must be a number',
  /**
   *@description Error message in the Locations settings pane that declares the minimum value for the latitude input
   *@example {-90} PH1
   */
  latitudeMustBeGreaterThanOrEqual: 'Latitude must be greater than or equal to {PH1}',
  /**
   *@description Error message in the Locations settings pane that declares the maximum value for the latitude input
   *@example {90} PH1
   */
  latitudeMustBeLessThanOrEqualToS: 'Latitude must be less than or equal to {PH1}',
  /**
   *@description Error message in the Locations settings pane that declares that the value for the longitude input must be a number
   */
  longitudeMustBeANumber: 'Longitude must be a number',
  /**
   *@description Error message in the Locations settings pane that declares the minimum value for the longitude input
   *@example {-180} PH1
   */
  longitudeMustBeGreaterThanOr: 'Longitude must be greater than or equal to {PH1}',
  /**
   *@description Error message in the Locations settings pane that declares the maximum value for the longitude input
   *@example {180} PH1
   */
  longitudeMustBeLessThanOrEqualTo: 'Longitude must be less than or equal to {PH1}',
  /**
   *@description Error message in the Locations settings pane that declares timezone ID input invalid
   */
  timezoneIdMustContainAlphabetic: 'Timezone ID must contain alphabetic characters',
  /**
   *@description Error message in the Locations settings pane that declares locale input invalid
   */
  localeMustContainAlphabetic: 'Locale must contain alphabetic characters',
  /**
   *@description Error message in the Locations settings pane that declares that the value for the accuracy input must be a number
   */
  accuracyMustBeANumber: 'Accuracy must be a number',
  /**
   *@description Error message in the Locations settings pane that declares the minimum value for the accuracy input
   *@example {0} PH1
   */
  accuracyMustBeGreaterThanOrEqual: 'Accuracy must be greater than or equal to {PH1}',
  /**
   *@description Text of add locations button in Locations Settings Tab of the Device Toolbar
   */
  addLocation: 'Add location',
} as const;
const str_ = i18n.i18n.registerUIStrings('panels/sensors/LocationsSettingsTab.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);

export class LocationsSettingsTab extends UI.Widget.VBox implements UI.ListWidget.Delegate<LocationDescription> {
  private readonly list: UI.ListWidget.ListWidget<LocationDescription>;
  private readonly customSetting: Common.Settings.Setting<LocationDescription[]>;
  private editor?: UI.ListWidget.Editor<LocationDescription>;

  constructor() {
    super({useShadowDom: true});
    this.registerRequiredCSS(locationsSettingsTabStyles);

    this.element.setAttribute('jslog', `${VisualLogging.pane('emulation-locations')}`);

    const settingsContent =
        this.contentElement.createChild('div', 'settings-card-container-wrapper').createChild('div');
    settingsContent.classList.add('settings-card-container');

    const locationsCard = settingsContent.createChild('devtools-card');
    locationsCard.heading = i18nString(UIStrings.locations);

    const listContainer = locationsCard.createChild('div');

    this.list = new UI.ListWidget.ListWidget(this, undefined, true);
    this.list.element.classList.add('locations-list');
    this.list.registerRequiredCSS(locationsSettingsTabStyles);
    this.list.show(listContainer);
    this.customSetting =
        Common.Settings.Settings.instance().moduleSetting<LocationDescription[]>('emulation.locations');
    const list =
        this.customSetting.get().map(location => replaceLocationTitles(location, this.customSetting.defaultValue));

    function replaceLocationTitles(
        location: LocationDescription, defaultValues: LocationDescription[]): LocationDescription {
      // This check is done for locations that might had been cached wrongly due to crbug.com/1171670.
      // Each of the default values would have been stored without a title if the user had added a new location
      // while the bug was present in the application. This means that getting the setting's default value with the `get`
      // method would return the default locations without a title. To cope with this, the setting values are
      // preemptively checked and corrected so that any default value mistakenly stored without a title is replaced
      // with the corresponding declared value in the pre-registered setting.
      if (!location.title) {
        const replacement = defaultValues.find(
            defaultLocation => defaultLocation.lat === location.lat && defaultLocation.long === location.long &&
                defaultLocation.timezoneId === location.timezoneId && defaultLocation.locale === location.locale);
        if (!replacement) {
          console.error('Could not determine a location setting title');
        } else {
          return replacement;
        }
      }
      return location;
    }

    const addButton = new Buttons.Button.Button();
    addButton.classList.add('add-locations-button');
    addButton.data = {
      variant: Buttons.Button.Variant.OUTLINED,
      iconName: 'plus',
      jslogContext: 'emulation.add-location',
    };
    addButton.textContent = i18nString(UIStrings.addLocation);
    addButton.addEventListener('click', () => this.addButtonClicked());
    locationsCard.append(addButton);

    this.customSetting.set(list);
    this.customSetting.addChangeListener(this.locationsUpdated, this);
  }

  override wasShown(): void {
    super.wasShown();
    this.locationsUpdated();
  }

  private locationsUpdated(): void {
    this.list.clear();

    const conditions = this.customSetting.get();
    for (const condition of conditions) {
      this.list.appendItem(condition, true);
    }

    this.list.appendSeparator();
  }

  private addButtonClicked(): void {
    this.list.addNewItem(this.customSetting.get().length, {
      title: '',
      lat: 0,
      long: 0,
      timezoneId: '',
      locale: '',
      accuracy: SDK.EmulationModel.Location.DEFAULT_ACCURACY
    });
  }

  renderItem(location: LocationDescription, _editable: boolean): Element {
    const element = document.createElement('div');
    element.role = 'row';
    element.classList.add('locations-list-item');
    const title = element.createChild('div', 'locations-list-text locations-list-title');
    title.role = 'cell';
    const titleText = title.createChild('div', 'locations-list-title-text');
    titleText.textContent = location.title;
    UI.Tooltip.Tooltip.install(titleText, location.title);
    element.createChild('div', 'locations-list-separator');
    const lat = element.createChild('div', 'locations-list-text');
    lat.textContent = String(location.lat);
    lat.role = 'cell';
    element.createChild('div', 'locations-list-separator');
    const long = element.createChild('div', 'locations-list-text');
    long.textContent = String(location.long);
    long.role = 'cell';
    element.createChild('div', 'locations-list-separator');
    const timezoneId = element.createChild('div', 'locations-list-text');
    timezoneId.textContent = location.timezoneId;
    timezoneId.role = 'cell';
    element.createChild('div', 'locations-list-separator');
    const locale = element.createChild('div', 'locations-list-text');
    locale.textContent = location.locale;
    locale.role = 'cell';
    element.createChild('div', 'locations-list-separator');
    element.createChild('div', 'locations-list-text').textContent =
        String(location.accuracy || SDK.EmulationModel.Location.DEFAULT_ACCURACY);
    return element;
  }

  removeItemRequested(_item: LocationDescription, index: number): void {
    const list = this.customSetting.get();
    list.splice(index, 1);
    this.customSetting.set(list);
  }

  commitEdit(location: LocationDescription, editor: UI.ListWidget.Editor<LocationDescription>, isNew: boolean): void {
    location.title = editor.control('title').value.trim();
    const lat = editor.control('lat').value.trim();
    location.lat = lat ? parseFloat(lat) : 0;
    const long = editor.control('long').value.trim();
    location.long = long ? parseFloat(long) : 0;
    const timezoneId = editor.control('timezone-id').value.trim();
    location.timezoneId = timezoneId;
    const locale = editor.control('locale').value.trim();
    location.locale = locale;
    const accuracy = editor.control('accuracy').value.trim();
    location.accuracy = accuracy ? parseFloat(accuracy) : SDK.EmulationModel.Location.DEFAULT_ACCURACY;

    const list = this.customSetting.get();
    if (isNew) {
      list.push(location);
    }
    this.customSetting.set(list);
  }

  beginEdit(location: LocationDescription): UI.ListWidget.Editor<LocationDescription> {
    const editor = this.createEditor();
    editor.control('title').value = location.title;
    editor.control('lat').value = String(location.lat);
    editor.control('long').value = String(location.long);
    editor.control('timezone-id').value = location.timezoneId;
    editor.control('locale').value = location.locale;
    editor.control('accuracy').value = String(location.accuracy || SDK.EmulationModel.Location.DEFAULT_ACCURACY);
    return editor;
  }

  private createEditor(): UI.ListWidget.Editor<LocationDescription> {
    if (this.editor) {
      return this.editor;
    }

    const editor = new UI.ListWidget.Editor<LocationDescription>();
    this.editor = editor;
    const content = editor.contentElement();

    const titles = content.createChild('div', 'locations-edit-row');
    titles.createChild('div', 'locations-list-text locations-list-title').textContent =
        i18nString(UIStrings.locationName);
    titles.createChild('div', 'locations-list-separator locations-list-separator-invisible');
    titles.createChild('div', 'locations-list-text').textContent = i18nString(UIStrings.lat);
    titles.createChild('div', 'locations-list-separator locations-list-separator-invisible');
    titles.createChild('div', 'locations-list-text').textContent = i18nString(UIStrings.long);
    titles.createChild('div', 'locations-list-separator locations-list-separator-invisible');
    titles.createChild('div', 'locations-list-text').textContent = i18nString(UIStrings.timezoneId);
    titles.createChild('div', 'locations-list-separator locations-list-separator-invisible');
    titles.createChild('div', 'locations-list-text').textContent = i18nString(UIStrings.locale);
    titles.createChild('div', 'locations-list-separator locations-list-separator-invisible');
    titles.createChild('div', 'locations-list-text').textContent = i18nString(UIStrings.accuracy);

    const fields = content.createChild('div', 'locations-edit-row');
    fields.createChild('div', 'locations-list-text locations-list-title locations-input-container')
        .appendChild(editor.createInput('title', 'text', i18nString(UIStrings.locationName), titleValidator));
    fields.createChild('div', 'locations-list-separator locations-list-separator-invisible');

    let cell = fields.createChild('div', 'locations-list-text locations-input-container');
    cell.appendChild(editor.createInput('lat', 'text', i18nString(UIStrings.latitude), latValidator));
    fields.createChild('div', 'locations-list-separator locations-list-separator-invisible');

    cell = fields.createChild('div', 'locations-list-text locations-list-text-longitude locations-input-container');
    cell.appendChild(editor.createInput('long', 'text', i18nString(UIStrings.longitude), longValidator));
    fields.createChild('div', 'locations-list-separator locations-list-separator-invisible');

    cell = fields.createChild('div', 'locations-list-text locations-input-container');
    cell.appendChild(editor.createInput('timezone-id', 'text', i18nString(UIStrings.timezoneId), timezoneIdValidator));
    fields.createChild('div', 'locations-list-separator locations-list-separator-invisible');

    cell = fields.createChild('div', 'locations-list-text locations-input-container');
    cell.appendChild(editor.createInput('locale', 'text', i18nString(UIStrings.locale), localeValidator));
    fields.createChild('div', 'locations-list-separator locations-list-separator-invisible');

    cell = fields.createChild('div', 'locations-list-text locations-input-container');
    cell.appendChild(editor.createInput('accuracy', 'text', i18nString(UIStrings.accuracy), accuracyValidator));

    return editor;

    function titleValidator(
        _item: LocationDescription, _index: number, input: UI.ListWidget.EditorControl): UI.ListWidget.ValidatorResult {
      const maxLength = 50;
      const value = input.value.trim();

      let errorMessage;
      if (!value.length) {
        errorMessage = i18nString(UIStrings.locationNameCannotBeEmpty);
      } else if (value.length > maxLength) {
        errorMessage = i18nString(UIStrings.locationNameMustBeLessThanS, {PH1: maxLength});
      }

      if (errorMessage) {
        return {valid: false, errorMessage};
      }
      return {valid: true, errorMessage: undefined};
    }

    function latValidator(
        _item: LocationDescription, _index: number, input: UI.ListWidget.EditorControl): UI.ListWidget.ValidatorResult {
      const minLat = -90;
      const maxLat = 90;
      const value = input.value.trim();
      const parsedValue = Number(value);

      if (!value) {
        return {valid: true, errorMessage: undefined};
      }

      let errorMessage;
      if (Number.isNaN(parsedValue)) {
        errorMessage = i18nString(UIStrings.latitudeMustBeANumber);
      } else if (parseFloat(value) < minLat) {
        errorMessage = i18nString(UIStrings.latitudeMustBeGreaterThanOrEqual, {PH1: minLat});
      } else if (parseFloat(value) > maxLat) {
        errorMessage = i18nString(UIStrings.latitudeMustBeLessThanOrEqualToS, {PH1: maxLat});
      }

      if (errorMessage) {
        return {valid: false, errorMessage};
      }
      return {valid: true, errorMessage: undefined};
    }

    function longValidator(
        _item: LocationDescription, _index: number, input: UI.ListWidget.EditorControl): UI.ListWidget.ValidatorResult {
      const minLong = -180;
      const maxLong = 180;
      const value = input.value.trim();
      const parsedValue = Number(value);

      if (!value) {
        return {valid: true, errorMessage: undefined};
      }

      let errorMessage;
      if (Number.isNaN(parsedValue)) {
        errorMessage = i18nString(UIStrings.longitudeMustBeANumber);
      } else if (parseFloat(value) < minLong) {
        errorMessage = i18nString(UIStrings.longitudeMustBeGreaterThanOr, {PH1: minLong});
      } else if (parseFloat(value) > maxLong) {
        errorMessage = i18nString(UIStrings.longitudeMustBeLessThanOrEqualTo, {PH1: maxLong});
      }

      if (errorMessage) {
        return {valid: false, errorMessage};
      }
      return {valid: true, errorMessage: undefined};
    }

    function timezoneIdValidator(
        _item: LocationDescription, _index: number, input: UI.ListWidget.EditorControl): UI.ListWidget.ValidatorResult {
      const value = input.value.trim();
      // Chromium uses ICU's timezone implementation, which is very
      // liberal in what it accepts. ICU does not simply use an allowlist
      // but instead tries to make sense of the input, even for
      // weird-looking timezone IDs. There's not much point in validating
      // the input other than checking if it contains at least one
      // alphabetic character. The empty string resets the override,
      // and is accepted as well.
      if (value === '' || /[a-zA-Z]/.test(value)) {
        return {valid: true, errorMessage: undefined};
      }
      const errorMessage = i18nString(UIStrings.timezoneIdMustContainAlphabetic);
      return {valid: false, errorMessage};
    }

    function localeValidator(
        _item: LocationDescription, _index: number, input: UI.ListWidget.EditorControl): UI.ListWidget.ValidatorResult {
      const value = input.value.trim();
      // Similarly to timezone IDs, there's not much point in validating
      // input locales other than checking if it contains at least two
      // alphabetic characters.
      // https://unicode.org/reports/tr35/#Unicode_language_identifier
      // The empty string resets the override, and is accepted as
      // well.
      if (value === '' || /[a-zA-Z]{2}/.test(value)) {
        return {valid: true, errorMessage: undefined};
      }
      const errorMessage = i18nString(UIStrings.localeMustContainAlphabetic);
      return {valid: false, errorMessage};
    }

    function accuracyValidator(
        _item: LocationDescription, _index: number, input: UI.ListWidget.EditorControl): UI.ListWidget.ValidatorResult {
      const minAccuracy = 0;
      const value = input.value.trim();
      const parsedValue = Number(value);

      if (!value) {
        return {valid: true, errorMessage: undefined};
      }

      let errorMessage;
      if (Number.isNaN(parsedValue)) {
        errorMessage = i18nString(UIStrings.accuracyMustBeANumber);
      } else if (parseFloat(value) < minAccuracy) {
        errorMessage = i18nString(UIStrings.accuracyMustBeGreaterThanOrEqual, {PH1: minAccuracy});
      }

      if (errorMessage) {
        return {valid: false, errorMessage};
      }
      return {valid: true, errorMessage: undefined};
    }
  }
}
export interface LocationDescription {
  title: string;
  lat: number;
  long: number;
  timezoneId: string;
  locale: string;
  accuracy?: number;
}
