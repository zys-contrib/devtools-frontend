// Copyright 2024 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import type * as Trace from '../../../../models/trace/trace.js';

export interface ActiveInsight {
  name: string;
  insightSetKey: string;
  createOverlayFn: (() => Trace.Types.Overlays.Overlay[]);
}
