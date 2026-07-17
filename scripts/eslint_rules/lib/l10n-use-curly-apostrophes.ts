// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {isUIStringsVariableDeclarator} from './utils/l10n-helper.ts';
import {createRule} from './utils/ruleCreator.ts';

const STRAIGHT_APOSTROPHE_REGEX = /[a-zA-Z]'[a-zA-Z]/;

export default createRule({
  name: 'l10n-use-curly-apostrophes',
  meta: {
    type: 'problem',
    docs: {
      description:
          'Use curly apostrophes (’) instead of straight apostrophes (\') in UIStrings contractions and possessives.',
      category: 'Possible Errors',
    },
    schema: [],
    messages: {
      useCurlyApostrophe: 'Use curly apostrophe (’) instead of straight apostrophe (\') in "{PH1}".',
    },
  },
  defaultOptions: [],
  create: function(context) {
    return {
      VariableDeclarator(node) {
        if (!isUIStringsVariableDeclarator(context, node)) {
          return;
        }

        if (node.init?.type !== 'TSAsExpression') {
          return;
        }

        const expression = node.init.expression;
        if (expression?.type !== 'ObjectExpression') {
          return;
        }

        for (const property of expression.properties) {
          if (property.type !== 'Property' || property.value?.type !== 'Literal') {
            continue;
          }

          const propertyValue = property.value.value;
          if (typeof propertyValue !== 'string') {
            continue;
          }

          if (STRAIGHT_APOSTROPHE_REGEX.test(propertyValue)) {
            context.report({
              node: property.value,
              messageId: 'useCurlyApostrophe',
              data: {
                PH1: propertyValue,
              },
            });
          }
        }
      },
    };
  },
});
