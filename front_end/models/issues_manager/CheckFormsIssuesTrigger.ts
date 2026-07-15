
// Copyright 2023 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import type * as Common from '../../core/common/common.js';
import * as Root from '../../core/root/root.js';
import * as SDK from '../../core/sdk/sdk.js';

/**
 * Responsible for asking autofill for current form issues. This currently happens when devtools is first open.
 */
// TODO(crbug.com/1399414): Trigger check form issues when an element with an associated issue is editted in the issues panel.
export class CheckFormsIssuesTrigger {
  constructor(targetManager: SDK.TargetManager.TargetManager = SDK.TargetManager.TargetManager.instance()) {
    targetManager.addModelListener(SDK.ResourceTreeModel.ResourceTreeModel, SDK.ResourceTreeModel.Events.Load,
                                   this.#pageLoaded, this, {scoped: true});

    for (const model of targetManager.models(SDK.ResourceTreeModel.ResourceTreeModel)) {
      if (model.target().outermostTarget() !== model.target()) {
        continue;
      }

      this.#checkFormsIssues(model);
    }
  }

  static instance({forceNew}: {forceNew: boolean} = {forceNew: false}): CheckFormsIssuesTrigger {
    if (!Root.DevToolsContext.globalInstance().has(CheckFormsIssuesTrigger) || forceNew) {
      Root.DevToolsContext.globalInstance().set(CheckFormsIssuesTrigger, new CheckFormsIssuesTrigger());
    }
    return Root.DevToolsContext.globalInstance().get(CheckFormsIssuesTrigger);
  }

  // TODO(crbug.com/1399414): Handle response by dropping current issues in favor of new ones.
  #checkFormsIssues(resourceTreeModel: SDK.ResourceTreeModel.ResourceTreeModel): void {
    void resourceTreeModel.target().auditsAgent().invoke_checkFormsIssues();
  }

  #pageLoaded(event: Common.EventTarget
                  .EventTargetEvent<{resourceTreeModel: SDK.ResourceTreeModel.ResourceTreeModel, loadTime: number}>):
      void {
    const {resourceTreeModel} = event.data;
    this.#checkFormsIssues(resourceTreeModel);
  }
}
