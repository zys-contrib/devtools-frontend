// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import rule from '../lib/no-instance-of-migrated-singletons.ts';

import {RuleTester} from './utils/RuleTester.ts';

new RuleTester().run('no-instance-of-migrated-singletons', rule, {
  valid: [
    {
      code: 'class Foo {} Foo.instance();',
      filename: 'front_end/core/common/SomeFile.ts',
    },
    {
      code: 'TargetManager.foo();',
      filename: 'front_end/core/sdk/SomeFile.ts',
    },
  ],
  invalid: [
    {
      code: 'TargetManager.instance();',
      filename: 'front_end/core/sdk/SomeFile.ts',
      errors: [{messageId: 'noInstanceCall', data: {className: 'TargetManager'}}],
    },
    {
      code: 'SDK.TargetManager.instance();',
      filename: 'front_end/core/sdk/SomeFile.ts',
      errors: [{messageId: 'noInstanceCall', data: {className: 'TargetManager'}}],
    },
    {
      code: 'SDK.TargetManager.TargetManager.instance();',
      filename: 'front_end/core/sdk/SomeFile.ts',
      errors: [{messageId: 'noInstanceCall', data: {className: 'TargetManager'}}],
    },
    {
      code: 'Common.Console.Console.instance();',
      filename: 'front_end/core/common/SomeFile.ts',
      errors: [{messageId: 'noInstanceCall', data: {className: 'Console'}}],
    },
    {
      code: 'Settings.instance();',
      filename: 'front_end/core/common/SomeFile.ts',
      errors: [{messageId: 'noInstanceCall', data: {className: 'Settings'}}],
    },
  ],
});
