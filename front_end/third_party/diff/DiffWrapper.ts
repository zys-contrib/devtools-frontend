// Copyright 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as Common from '../../core/common/common.js';

declare global {
  /* eslint-disable @typescript-eslint/naming-convention */
  class diff_match_patch {
    diff_main(text1: string, text2: string): Array<{0: number, 1: string}>;
    diff_cleanupSemantic(diff: Array<{0: number, 1: string}>): void;
  }
  /* eslint-enable @typescript-eslint/naming-convention */
}

export const DiffWrapper = {
  charDiff: function(text1: string, text2: string, cleanup?: boolean): {0: number, 1: string}[] {
    const differ = new diff_match_patch();
    const diff = differ.diff_main(text1, text2);
    if (cleanup) {
      differ.diff_cleanupSemantic(diff);
    }
    return diff;
  },

  lineDiff: function(lines1: string[], lines2: string[]): DiffArray {
    const idMap = new Common.CharacterIdMap.CharacterIdMap<string>();
    const text1 = lines1.map(line => idMap.toChar(line)).join('');
    const text2 = lines2.map(line => idMap.toChar(line)).join('');

    // If both text are the same don't emit a diff
    if(text1 === text2){
      return [];
    }

    const diff = DiffWrapper.charDiff(text1, text2);
    const lineDiff = [];
    for (let i = 0; i < diff.length; i++) {
      const lines = [];
      for (let j = 0; j < diff[i][1].length; j++) {
        lines.push(idMap.fromChar(diff[i][1][j]) || '');
      }

      lineDiff.push({ 0: diff[i][0], 1: lines });
    }
    return lineDiff;
  },

  convertToEditDiff: function(diff: DiffArray): number[][] {
    const normalized = [];
    let added = 0;
    let removed = 0;
    for (let i = 0; i < diff.length; ++i) {
      const token = diff[i];
      if (token[0] === Operation.Equal) {
        flush();
        normalized.push([Operation.Equal, token[1].length]);
      }
      else if (token[0] === Operation.Delete) {
        removed += token[1].length;
      }
      else {
        added += token[1].length;
      }
    }
    flush();
    return normalized;

    function flush(): void {
      if (added && removed) {
        const min = Math.min(added, removed);
        normalized.push([Operation.Edit, min]);
        added -= min;
        removed -= min;
      }
      if (added || removed) {
        const balance = added - removed;
        const type = balance < 0 ? Operation.Delete : Operation.Insert;
        normalized.push([type, Math.abs(balance)]);
        added = 0;
        removed = 0;
      }
    }
  },

  /**
   * Scores character-sequence diffs, giving higher scores for longer sequences.
   */
  characterScore: function(item: string, against: string): number {
    let score = 0;
    const diff = DiffWrapper.charDiff(item, against);
    for (let i = 0; i < diff.length; ++i) {
      if (diff[i][0] === Operation.Equal) {
        score += diff[i][1].length * diff[i][1].length;
      }
    }
    return score;
  },
};

export enum Operation {
  /* eslint-disable @typescript-eslint/naming-convention -- Used by web_tests. */
  Equal = 0,
  Insert = 1,
  Delete = -1,
  Edit = 2,
  /* eslint-enable @typescript-eslint/naming-convention */
}

export type DiffArray = {0: Operation, 1: string[]}[];
