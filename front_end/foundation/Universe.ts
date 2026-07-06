// Copyright 2025 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as Common from '../core/common/common.js';
import type * as Host from '../core/host/host.js';
import * as Root from '../core/root/root.js';
import * as SDK from '../core/sdk/sdk.js';
import * as AutofillManager from '../models/autofill_manager/autofill_manager.js';
import * as Bindings from '../models/bindings/bindings.js';
import * as Breakpoints from '../models/breakpoints/breakpoints.js';
import * as CrUXManager from '../models/crux-manager/crux-manager.js';
import * as Emulation from '../models/emulation/emulation.js';
import * as JavaScriptMetadata from '../models/javascript_metadata/javascript_metadata.js';
import * as Logs from '../models/logs/logs.js';
import * as Persistence from '../models/persistence/persistence.js';
import * as ProjectSettings from '../models/project_settings/project_settings.js';
import * as Workspace from '../models/workspace/workspace.js';

export interface CreationOptions {
  settingsCreationOptions: Omit<Common.Settings.SettingsCreationOptions, 'console'>;
  overrideAutoStartModels?: Set<SDK.SDKModel.SDKModelConstructor>;
  hostConfig: Root.Runtime.HostConfig;
  inspectorFrontendHost: Host.InspectorFrontendHostAPI.InspectorFrontendHostAPI;
}

export class Universe {
  // TODO(crbug.com/493763857): Once a singleton is no longer a singleton (i.e. it has no 'instance')
  //                            static method, we can move it out of the `DevToolsContext` and store it
  //                            directly on the `Universe`.
  readonly context: Root.DevToolsContext.DevToolsContext;
  readonly autofillManager: AutofillManager.AutofillManager.AutofillManager;

  constructor(options: CreationOptions) {
    const context = new Root.DevToolsContext.WritableDevToolsContext();
    this.context = context;

    const console = new Common.Console.Console();
    context.set(Common.Console.Console, console);

    // TODO(crbug.com/458180550): Store instance only on this.context instead.
    //                            For now the global is required as not everything in foundation cleanly
    //                            reads from the scoped `Settings` instance.
    const settings = Common.Settings.Settings.instance({
      forceNew: true,
      console,
      ...options.settingsCreationOptions,
    });
    context.set(Common.Settings.Settings, settings);

    const isolatedFileSystemManager =
        new Persistence.IsolatedFileSystemManager.IsolatedFileSystemManager(settings, console);
    context.set(Persistence.IsolatedFileSystemManager.IsolatedFileSystemManager, isolatedFileSystemManager);

    const targetManager = new SDK.TargetManager.TargetManager(context, options.overrideAutoStartModels);
    context.set(SDK.TargetManager.TargetManager, targetManager);

    const frameManager = new SDK.FrameManager.FrameManager(targetManager);
    context.set(SDK.FrameManager.FrameManager, frameManager);

    const multitargetNetworkManager = new SDK.NetworkManager.MultitargetNetworkManager(targetManager);
    context.set(SDK.NetworkManager.MultitargetNetworkManager, multitargetNetworkManager);

    const deviceModeModel =
        new Emulation.DeviceModeModel.DeviceModeModel(targetManager, settings, multitargetNetworkManager);
    context.set(Emulation.DeviceModeModel.DeviceModeModel, deviceModeModel);

    const pageResourceLoader =
        new SDK.PageResourceLoader.PageResourceLoader(targetManager, settings, multitargetNetworkManager, null);
    context.set(SDK.PageResourceLoader.PageResourceLoader, pageResourceLoader);

    const projectSettingsModel = new ProjectSettings.ProjectSettingsModel.ProjectSettingsModel(
        options.hostConfig,
        pageResourceLoader,
        targetManager,
    );
    context.set(ProjectSettings.ProjectSettingsModel.ProjectSettingsModel, projectSettingsModel);

    const automaticFileSystemManager = new Persistence.AutomaticFileSystemManager.AutomaticFileSystemManager(
        options.inspectorFrontendHost, projectSettingsModel);
    context.set(Persistence.AutomaticFileSystemManager.AutomaticFileSystemManager, automaticFileSystemManager);

    const cpuThrottlingManager = new SDK.CPUThrottlingManager.CPUThrottlingManager(settings, targetManager);
    context.set(SDK.CPUThrottlingManager.CPUThrottlingManager, cpuThrottlingManager);

    const domDebuggerManager = new SDK.DOMDebuggerModel.DOMDebuggerManager(targetManager);
    context.set(SDK.DOMDebuggerModel.DOMDebuggerManager, domDebuggerManager);

    const cruxManager = new CrUXManager.CrUXManager(targetManager, settings);
    context.set(CrUXManager.CrUXManager, cruxManager);

    const isolateManager = new SDK.IsolateManager.IsolateManager(targetManager);
    context.set(SDK.IsolateManager.IsolateManager, isolateManager);
    const eventBreakpointsManager = new SDK.EventBreakpointsModel.EventBreakpointsManager(targetManager);
    context.set(SDK.EventBreakpointsModel.EventBreakpointsManager, eventBreakpointsManager);

    const domModelUndoStack = new SDK.DOMModel.DOMModelUndoStack();
    context.set(SDK.DOMModel.DOMModelUndoStack, domModelUndoStack);

    const workspace = new Workspace.Workspace.WorkspaceImpl();
    context.set(Workspace.Workspace.WorkspaceImpl, workspace);

    const automaticFileSystemWorkspaceBinding =
        new Persistence.AutomaticFileSystemWorkspaceBinding.AutomaticFileSystemWorkspaceBinding(
            automaticFileSystemManager,
            isolatedFileSystemManager,
            workspace,
        );
    context.set(
        Persistence.AutomaticFileSystemWorkspaceBinding.AutomaticFileSystemWorkspaceBinding,
        automaticFileSystemWorkspaceBinding,
    );

    const ignoreListManager = new Workspace.IgnoreListManager.IgnoreListManager(settings, targetManager);
    context.set(Workspace.IgnoreListManager.IgnoreListManager, ignoreListManager);

    const resourceMapping = new Bindings.ResourceMapping.ResourceMapping(targetManager, workspace);
    const cssWorkspaceBinding = new Bindings.CSSWorkspaceBinding.CSSWorkspaceBinding(resourceMapping, targetManager);
    context.set(Bindings.CSSWorkspaceBinding.CSSWorkspaceBinding, cssWorkspaceBinding);

    const debuggerWorkspaceBinding = new Bindings.DebuggerWorkspaceBinding.DebuggerWorkspaceBinding(
        resourceMapping, targetManager, ignoreListManager, workspace);
    context.set(Bindings.DebuggerWorkspaceBinding.DebuggerWorkspaceBinding, debuggerWorkspaceBinding);

    const breakpointManager = new Breakpoints.BreakpointManager.BreakpointManager(targetManager, workspace,
                                                                                  debuggerWorkspaceBinding, settings);
    context.set(Breakpoints.BreakpointManager.BreakpointManager, breakpointManager);

    const persistence = new Persistence.Persistence.PersistenceImpl(workspace, breakpointManager);
    context.set(Persistence.Persistence.PersistenceImpl, persistence);

    const networkPersistenceManager = new Persistence.NetworkPersistenceManager.NetworkPersistenceManager(
        workspace,
        persistence,
        breakpointManager,
        targetManager,
        settings,
        isolatedFileSystemManager,
        multitargetNetworkManager,
    );
    context.set(Persistence.NetworkPersistenceManager.NetworkPersistenceManager, networkPersistenceManager);

    const networkLog = new Logs.NetworkLog.NetworkLog(targetManager, settings);
    context.set(Logs.NetworkLog.NetworkLog, networkLog);

    const logManager = new Logs.LogManager.LogManager(targetManager, networkLog);
    context.set(Logs.LogManager.LogManager, logManager);

    const javaScriptMetadata = new JavaScriptMetadata.JavaScriptMetadata.JavaScriptMetadataImpl();
    context.set(JavaScriptMetadata.JavaScriptMetadata.JavaScriptMetadataImpl, javaScriptMetadata);

    this.autofillManager = new AutofillManager.AutofillManager.AutofillManager(targetManager, frameManager);
  }

  get automaticFileSystemManager(): Persistence.AutomaticFileSystemManager.AutomaticFileSystemManager {
    return this.context.get(Persistence.AutomaticFileSystemManager.AutomaticFileSystemManager);
  }

  get automaticFileSystemWorkspaceBinding():
      Persistence.AutomaticFileSystemWorkspaceBinding.AutomaticFileSystemWorkspaceBinding {
    return this.context.get(Persistence.AutomaticFileSystemWorkspaceBinding.AutomaticFileSystemWorkspaceBinding);
  }

  get breakpointManager(): Breakpoints.BreakpointManager.BreakpointManager {
    return this.context.get(Breakpoints.BreakpointManager.BreakpointManager);
  }

  get cpuThrottlingManager(): SDK.CPUThrottlingManager.CPUThrottlingManager {
    return this.context.get(SDK.CPUThrottlingManager.CPUThrottlingManager);
  }
  get cruxManager(): CrUXManager.CrUXManager {
    return this.context.get(CrUXManager.CrUXManager);
  }

  get deviceModeModel(): Emulation.DeviceModeModel.DeviceModeModel {
    return this.context.get(Emulation.DeviceModeModel.DeviceModeModel);
  }

  get domDebuggerManager(): SDK.DOMDebuggerModel.DOMDebuggerManager {
    return this.context.get(SDK.DOMDebuggerModel.DOMDebuggerManager);
  }

  get domModelUndoStack(): SDK.DOMModel.DOMModelUndoStack {
    return this.context.get(SDK.DOMModel.DOMModelUndoStack);
  }

  get eventBreakpointsManager(): SDK.EventBreakpointsModel.EventBreakpointsManager {
    return this.context.get(SDK.EventBreakpointsModel.EventBreakpointsManager);
  }

  get isolatedFileSystemManager(): Persistence.IsolatedFileSystemManager.IsolatedFileSystemManager {
    return this.context.get(Persistence.IsolatedFileSystemManager.IsolatedFileSystemManager);
  }

  get isolateManager(): SDK.IsolateManager.IsolateManager {
    return this.context.get(SDK.IsolateManager.IsolateManager);
  }

  get networkPersistenceManager(): Persistence.NetworkPersistenceManager.NetworkPersistenceManager {
    return this.context.get(Persistence.NetworkPersistenceManager.NetworkPersistenceManager);
  }

  get pageResourceLoader(): SDK.PageResourceLoader.PageResourceLoader {
    return this.context.get(SDK.PageResourceLoader.PageResourceLoader);
  }

  get persistence(): Persistence.Persistence.PersistenceImpl {
    return this.context.get(Persistence.Persistence.PersistenceImpl);
  }

  get projectSettingsModel(): ProjectSettings.ProjectSettingsModel.ProjectSettingsModel {
    return this.context.get(ProjectSettings.ProjectSettingsModel.ProjectSettingsModel);
  }

  get settings(): Common.Settings.Settings {
    return this.context.get(Common.Settings.Settings);
  }

  get targetManager(): SDK.TargetManager.TargetManager {
    return this.context.get(SDK.TargetManager.TargetManager);
  }
}
