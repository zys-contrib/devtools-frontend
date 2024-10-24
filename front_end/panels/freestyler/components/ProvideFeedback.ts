// Copyright 2024 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as Host from '../../../core/host/host.js';
import * as i18n from '../../../core/i18n/i18n.js';
import type * as Platform from '../../../core/platform/platform.js';
import * as Buttons from '../../../ui/components/buttons/buttons.js';
import * as Input from '../../../ui/components/input/input.js';
import * as LitHtml from '../../../ui/lit-html/lit-html.js';
import * as VisualLogging from '../../../ui/visual_logging/visual_logging.js';

import provideFeedbackStyles from './provideFeedback.css.js';

const {html} = LitHtml;

/*
* Strings that don't need to be translated at this time.
*/
const UIStringsNotTranslate = {

  /**
   * @description The title of the button that allows submitting positive
   * feedback about the response for AI assistance.
   */
  thumbsUp: 'Good response',
  /**
   * @description The title of the button that allows submitting negative
   * feedback about the response for AI assistance.
   */
  thumbsDown: 'Bad response',
  /**
   * @description The placeholder text for the feedback input.
   */
  provideFeedbackPlaceholder: 'Provide additional feedback',
  /**
   * @description The disclaimer text that tells the user what will be shared
   * and what will be stored.
   */
  disclaimer: 'Submitted feedback will also include your conversation',
  /**
   * @description The button text for the action of submitting feedback.
   */
  submit: 'Submit',
  /**
   * @description The header of the feedback form asking.
   */
  whyThisRating: 'Why did you choose this rating? (optional)',
  /**
   * @description The button text for the action that hides the feedback form.
   */
  close: 'Close',
  /**
   * @description The title of the button that opens a page to report a legal
   * issue with the AI assistance message.
   */
  report: 'Report legal issue',
};

const lockedString = i18n.i18n.lockedString;

const REPORT_URL = 'https://support.google.com/legal/troubleshooter/1114905?hl=en#ts=1115658%2C13380504' as
    Platform.DevToolsPath.UrlString;
export interface ProvideFeedbackProps {
  onFeedbackSubmit: (rate: Host.AidaClient.Rating, feedback?: string) => void;
  canShowFeedbackForm: boolean;
}

export class ProvideFeedback extends HTMLElement {
  readonly #shadow = this.attachShadow({mode: 'open'});
  #props: ProvideFeedbackProps;
  #isShowingFeedbackForm = false;
  #currentRating?: Host.AidaClient.Rating;
  #isSubmitButtonDisabled = true;

  constructor(props: ProvideFeedbackProps) {
    super();
    this.#props = props;
  }

  set props(props: ProvideFeedbackProps) {
    this.#props = props;
    this.#render();
  }

  connectedCallback(): void {
    this.#shadow.adoptedStyleSheets = [provideFeedbackStyles, Input.textInputStyles];
    this.#render();
  }

  #handleRateClick(rating: Host.AidaClient.Rating): void {
    if (this.#currentRating === rating) {
      return;
    }

    this.#currentRating = rating;
    this.#isShowingFeedbackForm = this.#props.canShowFeedbackForm;
    this.#props.onFeedbackSubmit(this.#currentRating);
    this.#render();
  }

  #handleClose = (): void => {
    this.#isShowingFeedbackForm = false;
    this.#render();
  };

  #handleSubmit = (ev: SubmitEvent): void => {
    ev.preventDefault();
    const input = this.#shadow.querySelector('.feedback-input') as HTMLInputElement;
    if (!this.#currentRating || !input || !input.value) {
      return;
    }
    this.#props.onFeedbackSubmit(this.#currentRating, input.value);
    this.#isShowingFeedbackForm = false;
    this.#render();
  };

  #handleReportClick = (): void => {
    Host.InspectorFrontendHost.InspectorFrontendHostInstance.openInNewTab(REPORT_URL);
  };

  #renderButtons(): LitHtml.TemplateResult {
    // clang-format off
    return html`
      <devtools-button
        .data=${{
          variant: Buttons.Button.Variant.ICON,
          size: Buttons.Button.Size.SMALL,
          iconName: 'thumb-up',
          toggledIconName: 'thumb-up-filled',
          toggled: this.#currentRating === Host.AidaClient.Rating.POSITIVE,
          toggleType: Buttons.Button.ToggleType.PRIMARY,
          title: lockedString(UIStringsNotTranslate.thumbsUp),
          jslogContext: 'thumbs-up',
        } as Buttons.Button.ButtonData}
        @click=${() => this.#handleRateClick(Host.AidaClient.Rating.POSITIVE)}
      ></devtools-button>
      <devtools-button
        .data=${{
          variant: Buttons.Button.Variant.ICON,
          size: Buttons.Button.Size.SMALL,
          iconName: 'thumb-down',
          toggledIconName: 'thumb-down-filled',
          toggled: this.#currentRating === Host.AidaClient.Rating.NEGATIVE,
          toggleType: Buttons.Button.ToggleType.PRIMARY,
          title: lockedString(UIStringsNotTranslate.thumbsDown),
          jslogContext: 'thumbs-down',
        } as Buttons.Button.ButtonData}
        @click=${() => this.#handleRateClick(Host.AidaClient.Rating.NEGATIVE)}
      ></devtools-button>
      <div class="vertical-separator"></div>
      <devtools-button
        .data=${
          {
            variant: Buttons.Button.Variant.ICON,
            size: Buttons.Button.Size.SMALL,
            title: lockedString(UIStringsNotTranslate.report),
            iconName: 'report',
            jslogContext: 'report',
          } as Buttons.Button.ButtonData
        }
        @click=${this.#handleReportClick}
      ></devtools-button>
    `;
    // clang-format on
  }

  #handleInputChange = (event: KeyboardEvent): void => {
    const value = (event.target as HTMLInputElement).value;
    const disableSubmit = !value;
    if (disableSubmit !== this.#isSubmitButtonDisabled) {
      this.#isSubmitButtonDisabled = disableSubmit;
      this.#render();
    }
  };

  #renderFeedbackForm(): LitHtml.LitTemplate {
    // clang-format off
    return html`
      <form class="feedback-form" @submit=${this.#handleSubmit}>
        <div class="feedback-header">
          <h4 class="feedback-title">${lockedString(
              UIStringsNotTranslate.whyThisRating,
          )}</h4>
          <devtools-button
            aria-label=${lockedString(UIStringsNotTranslate.close)}
            @click=${this.#handleClose}
            .data=${
              {
                variant: Buttons.Button.Variant.ICON,
                iconName: 'cross',
                size: Buttons.Button.Size.SMALL,
                title: lockedString(UIStringsNotTranslate.close),
                jslogContext: 'close',
              } as Buttons.Button.ButtonData
            }
          ></devtools-button>
        </div>
        <input
          type="text"
          class="devtools-text-input feedback-input"
          @input=${this.#handleInputChange}
          placeholder=${lockedString(
           UIStringsNotTranslate.provideFeedbackPlaceholder,
          )}
          jslog=${VisualLogging.textField('feedback').track({ keydown: 'Enter' })}
        >
        <span class="feedback-disclaimer">${
          lockedString(UIStringsNotTranslate.disclaimer)
        }</span>
        <devtools-button
        aria-label=${lockedString(UIStringsNotTranslate.submit)}
        .data=${
          {
              type: 'submit',
              disabled: this.#isSubmitButtonDisabled,
              variant: Buttons.Button.Variant.OUTLINED,
              size: Buttons.Button.Size.SMALL,
              title: lockedString(UIStringsNotTranslate.submit),
              jslogContext: 'send',
            } as Buttons.Button.ButtonData
          }
        >${
          lockedString(UIStringsNotTranslate.submit)
        }</devtools-button>
      </div>
    </form>
    `;
    // clang-format on
  }

  #render(): void {
    // clang-format off
    LitHtml.render(
      html`
        <div class="feedback">
          <div class="rate-buttons">
            ${this.#renderButtons()}
          </div>
          ${this.#isShowingFeedbackForm
            ? this.#renderFeedbackForm()
            : LitHtml.nothing
          }
        </div>`,
      this.#shadow,
      {host: this},
    );
    // clang-format on
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'devtools-provide-feedback': ProvideFeedback;
  }
}

customElements.define('devtools-provide-feedback', ProvideFeedback);
