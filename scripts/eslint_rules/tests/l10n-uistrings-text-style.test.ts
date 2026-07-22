// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import rule from '../lib/l10n-uistrings-text-style.ts';

import {RuleTester} from './utils/RuleTester.ts';

new RuleTester().run('l10n-uistrings-text-style', rule, {
  valid: [
    {
      code: 'const UIStrings = { foo: \'Don’t show\' } as const;',
    },
    {
      code: 'const UIStrings = { foo: \'Chrome’s language\' } as const;',
    },
    {
      code: 'const UIStrings = { foo: \'Click \\\'Add\\\'\' } as const;',
    },
    {
      code: 'const UIStrings = { foo: \'Enter a URL\' } as const;',
    },
    {
      code: 'const UIStrings = { foo: \'Screenshot {url} should specify a size\' } as const;',
    },
    {
      code: 'const UIStrings = { foo: \'e.g. `url:a.com`\' } as const;',
    },
    {
      code: 'const UIStrings = { foo: \'Locking part of phrase `foo` is allowed\' } as const;',
    },
    {
      code: 'const UIStrings = { foo: \'Multiple {PH1} placeholders {PH2}\' } as const;',
    },
    {
      code: 'const variableNotNamedUIStrings = { foo: \'don\\\'t\' } as const;',
    },
    {
      code: 'const variableNotNamedUIStrings = { foo: \'Enter a Url\' } as const;',
    },
  ],
  invalid: [
    {
      code: 'const UIStrings = { foo: \'`fully locked phrase`\' } as const;',
      errors: [
        {
          messageId: 'fullyLockedPhrase',
        },
      ],
    },
    {
      code: 'const UIStrings = { foo: \'{PH1}\' } as const;',
      errors: [
        {
          messageId: 'singlePlaceholderPhrase',
        },
      ],
    },
    {
      code: 'const UIStrings = { foo: \'don\\\'t\' } as const;',
      errors: [
        {
          messageId: 'useCurlyApostrophe',
          data: {
            PH1: 'don\'t',
          },
        },
      ],
    },
    {
      code: 'const UIStrings = { foo: \'debugger\\\'s\' } as const;',
      errors: [
        {
          messageId: 'useCurlyApostrophe',
          data: {
            PH1: 'debugger\'s',
          },
        },
      ],
    },
    {
      code: 'const UIStrings = { foo: \'Enter a Url\' } as const;',
      errors: [
        {
          messageId: 'useUppercaseUrl',
          data: {
            PH1: 'Url',
            PH2: 'Enter a Url',
          },
        },
      ],
    },
    {
      code: 'const UIStrings = { foo: \'invalid url given\' } as const;',
      errors: [
        {
          messageId: 'useUppercaseUrl',
          data: {
            PH1: 'url',
            PH2: 'invalid url given',
          },
        },
      ],
    },
    {
      code: 'const UIStrings = { foo: \'Click “Add”\' } as const;',
      errors: [
        {
          messageId: 'useStraightDoubleQuote',
          data: {
            PH1: 'Click “Add”',
          },
        },
      ],
    },
  ],
});
