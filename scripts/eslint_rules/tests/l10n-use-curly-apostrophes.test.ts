// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import rule from '../lib/l10n-use-curly-apostrophes.ts';

import {RuleTester} from './utils/RuleTester.ts';

new RuleTester().run('l10n-use-curly-apostrophes', rule, {
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
      code: 'const variableNotNamedUIStrings = { foo: \'don\\\'t\' } as const;',
    },
  ],
  invalid: [
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
  ],
});
