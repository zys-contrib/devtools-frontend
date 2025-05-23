// Copyright 2023 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import type * as Protocol from '../../../generated/protocol.js';
import * as CPUProfile from '../../../models/cpu_profile/cpu_profile.js';
import {describeWithEnvironment} from '../../../testing/EnvironmentHelpers.js';
import {makeCompleteEvent, makeInstantEvent} from '../../../testing/TraceHelpers.js';
import {TraceLoader} from '../../../testing/TraceLoader.js';
import * as Trace from '../trace.js';

describeWithEnvironment('SamplesIntegrator', function() {
  const scriptId = 'Peperoni' as Protocol.Runtime.ScriptId;
  const url = '';
  const lineNumber = -1;
  const columnNumber = -1;
  const pid = Trace.Types.Events.ProcessID(0);
  const tid = Trace.Types.Events.ThreadID(0);

  // Profile contains the following samples:
  // |a||a||a||a|
  //       |b||b|
  const basicCDPProfile: Protocol.Profiler.Profile = {
    startTime: 0,
    endTime: 3000,
    nodes: [
      {
        id: 1,
        hitCount: 0,
        callFrame: {functionName: '(root)', scriptId, url, lineNumber, columnNumber},
        children: [2, 3],
      },
      {id: 2, callFrame: {functionName: 'a', scriptId, url, lineNumber, columnNumber}, children: [3]},
      {id: 3, callFrame: {functionName: 'b', scriptId, url, lineNumber, columnNumber}},
    ],
    samples: [2, 2, 3, 3],
    timeDeltas: new Array(4).fill(100),
  };

  const parsedBasicProfile = new CPUProfile.CPUProfileDataModel.CPUProfileDataModel(basicCDPProfile);
  const PROFILE_ID = Trace.Types.Events.ProfileID('fake-profile-id');

  describe('callsFromProfileSamples', () => {
    it('generates empty profile calls from a profile with samples', () => {
      const integrator =
          new Trace.Helpers.SamplesIntegrator.SamplesIntegrator(parsedBasicProfile, PROFILE_ID, pid, tid);
      const calls = integrator.callsFromProfileSamples();
      assert.strictEqual(calls.length, basicCDPProfile.samples?.length);
      let currentTimestamp = 0;
      assert.deepEqual(calls.map(c => c.callFrame.functionName), ['a', 'a', 'b', 'b']);
      for (let i = 0; i < calls.length; i++) {
        const call = calls[i];
        currentTimestamp += basicCDPProfile.timeDeltas?.[i] || 0;
        assert.strictEqual(call.dur, 0);
        assert.strictEqual(call.dur, 0);
        assert.strictEqual(call.ts, currentTimestamp);

        // Ensure each ProfileCall has been "linked" to the Profile and the
        // sample.
        assert.strictEqual(call.profileId, PROFILE_ID);
        assert.strictEqual(call.sampleIndex, i);
        assert.isDefined(call.nodeId);
      }
    });
    it('generates JSSamples from samples under debug mode', () => {
      const config = {
        ...Trace.Types.Configuration.defaults(),
      };
      config.debugMode = true;
      assert.isFalse(Trace.Types.Configuration.defaults().debugMode, 'Default config should not be mutable');

      const integrator =
          new Trace.Helpers.SamplesIntegrator.SamplesIntegrator(parsedBasicProfile, PROFILE_ID, pid, tid, config);
      integrator.callsFromProfileSamples();
      const jsSampleEvents = integrator.jsSampleEvents;

      assert.strictEqual(jsSampleEvents[0].ts, 100);
      assert.strictEqual(jsSampleEvents[1].ts, 200);
      assert.strictEqual(jsSampleEvents[2].ts, 300);
      assert.strictEqual(jsSampleEvents[3].ts, 400);

      assert.strictEqual(jsSampleEvents[0].dur, 0);
      assert.strictEqual(jsSampleEvents[1].dur, 0);
      assert.strictEqual(jsSampleEvents[2].dur, 0);
      assert.strictEqual(jsSampleEvents[3].dur, 0);

      assert.deepEqual(jsSampleEvents[0].args.data.stackTrace.map(f => f.functionName), ['a']);
      assert.deepEqual(jsSampleEvents[1].args.data.stackTrace.map(f => f.functionName), ['a']);
      assert.deepEqual(jsSampleEvents[2].args.data.stackTrace.map(f => f.functionName), ['a', 'b']);
      assert.deepEqual(jsSampleEvents[3].args.data.stackTrace.map(f => f.functionName), ['a', 'b']);
    });
  });

  describe('buildProfileCalls', () => {
    it('generates profile calls using trace events and JS samples from a trace file', async function() {
      const {parsedTrace} = await TraceLoader.traceEngine(this, 'recursive-blocking-js.json.gz');
      const samplesData = parsedTrace.Samples;
      assert.strictEqual(samplesData.profilesInProcess.size, 1);
      const [[pid, profileByThread]] = samplesData.profilesInProcess.entries();
      const [[tid, cpuProfileData]] = profileByThread.entries();
      const parsedProfile = cpuProfileData.parsedProfile;
      const samplesIntegrator =
          new Trace.Helpers.SamplesIntegrator.SamplesIntegrator(parsedProfile, PROFILE_ID, pid, tid);
      const traceEvents = parsedTrace.Renderer.allTraceEntries.filter(event => event.pid === pid && event.tid === tid);
      if (!traceEvents) {
        throw new Error('Trace events were unexpectedly not found.');
      }
      const constructedCalls = samplesIntegrator.buildProfileCalls(traceEvents);
      assert.lengthOf(constructedCalls, 5130);
    });

    it('creates JS profile calls with a top-level V8 invocation', () => {
      // After integrating with trace events, the flame chart
      // should look like:
      // |----Trace Event----|
      //           |----a----|
      //                 |-b-|
      const integrator =
          new Trace.Helpers.SamplesIntegrator.SamplesIntegrator(parsedBasicProfile, PROFILE_ID, pid, tid);
      const callEvent = makeCompleteEvent(Trace.Types.Events.Name.FUNCTION_CALL, 0, 500);
      const traceEvents = [callEvent];
      const constructedCalls = integrator.buildProfileCalls(traceEvents);
      assert.lengthOf(constructedCalls, 2);
      assert.strictEqual(constructedCalls[0].callFrame.functionName, 'a');
      assert.strictEqual(constructedCalls[0].ts, 100);
      assert.strictEqual(constructedCalls[0].dur, 400);
      assert.strictEqual(constructedCalls[1].callFrame.functionName, 'b');
      assert.strictEqual(constructedCalls[1].ts, 300);
      assert.strictEqual(constructedCalls[1].dur, 200);
    });

    it('creates JS frame events without a top-level V8 invocation', () => {
      const integrator =
          new Trace.Helpers.SamplesIntegrator.SamplesIntegrator(parsedBasicProfile, PROFILE_ID, pid, tid);
      const traceEvents: Trace.Types.Events.Complete[] = [];
      const constructedCalls = integrator.buildProfileCalls(traceEvents);
      assert.lengthOf(constructedCalls, 2);
      assert.strictEqual(constructedCalls[0].callFrame.functionName, 'a');
      assert.strictEqual(constructedCalls[0].ts, 100);
      assert.strictEqual(constructedCalls[0].dur, 300);
      assert.strictEqual(constructedCalls[1].callFrame.functionName, 'b');
      assert.strictEqual(constructedCalls[1].ts, 300);
      assert.strictEqual(constructedCalls[1].dur, 100);
    });

    it('creates JS frame events for mixed with/without top-level events', () => {
      // Profile contains the following samples:
      // |a|a|b|b|
      const cdpProfile: Protocol.Profiler.Profile = {
        startTime: 0,
        endTime: 3000,
        nodes: [
          {
            id: 1,
            hitCount: 0,
            callFrame: {functionName: '(root)', scriptId, url, lineNumber, columnNumber},
            children: [2, 3],
          },
          {id: 2, callFrame: {functionName: 'a', scriptId, url, lineNumber, columnNumber}},
          {id: 3, callFrame: {functionName: 'b', scriptId, url, lineNumber, columnNumber}},
        ],
        samples: [2, 2, 3, 3],
        timeDeltas: new Array(4).fill(100),
      };

      // After integrating with trace events, the flame chart
      // should look like:
      //  |----a----| |--Trace Event--|
      //              |-------b-------|
      const parsedProfile = new CPUProfile.CPUProfileDataModel.CPUProfileDataModel(cdpProfile);
      const integrator = new Trace.Helpers.SamplesIntegrator.SamplesIntegrator(parsedProfile, PROFILE_ID, pid, tid);
      const callEvent = makeCompleteEvent(Trace.Types.Events.Name.FUNCTION_CALL, 250, 250);
      const traceEvents = [callEvent];
      const constructedCalls = integrator.buildProfileCalls(traceEvents);
      assert.lengthOf(constructedCalls, 2);
      assert.strictEqual(constructedCalls[0].callFrame.functionName, 'a');
      assert.strictEqual(constructedCalls[0].ts, 100);
      assert.strictEqual(constructedCalls[0].dur, 150);
      assert.strictEqual(constructedCalls[1].callFrame.functionName, 'b');
      assert.strictEqual(constructedCalls[1].ts, 300);
      assert.strictEqual(constructedCalls[1].dur, 200);
    });

    // EvaluateScript and FunctionCall are two obvious "invocation events", but there are others (and sometimes none)
    // We must ensure we get reasonable JSFrames even when the invocation events are unexpected.
    it('creates JS frame events with v8.run trace event as parent', () => {
      // Profile contains the following samples:
      // |a|a|b|b|
      const cdpProfile: Protocol.Profiler.Profile = {
        startTime: 0,
        endTime: 3000,
        nodes: [
          {
            id: 1,
            hitCount: 0,
            callFrame: {functionName: '(root)', scriptId, url, lineNumber, columnNumber},
            children: [2, 3],
          },
          {id: 2, callFrame: {functionName: 'a', scriptId, url, lineNumber, columnNumber}},
          {id: 3, callFrame: {functionName: 'b', scriptId, url, lineNumber, columnNumber}},
        ],
        samples: [2, 2, 3, 3],
        timeDeltas: new Array(4).fill(100),
      };

      // After integrating with trace events, the flame chart
      // should look like:
      //   |----------------EvaluateScript-----------------|
      //       |-----------------v8.run--------------------|
      //        |--V8.ParseFuntion--||---a---||-----b------|

      const parsedProfile = new CPUProfile.CPUProfileDataModel.CPUProfileDataModel(cdpProfile);
      const integrator = new Trace.Helpers.SamplesIntegrator.SamplesIntegrator(parsedProfile, PROFILE_ID, pid, tid);
      const evaluateScript = makeCompleteEvent(Trace.Types.Events.Name.EVALUATE_SCRIPT, 0, 500);
      const v8Run = makeCompleteEvent('v8.run', 10, 490);
      const parseFunction = makeCompleteEvent('V8.ParseFunction', 12, 1);

      const traceEvents = [evaluateScript, v8Run, parseFunction];
      const constructedCalls = integrator.buildProfileCalls(traceEvents);
      assert.lengthOf(constructedCalls, 2);
      assert.strictEqual(constructedCalls[0].callFrame.functionName, 'a');
      assert.strictEqual(constructedCalls[0].ts, 100);
      assert.strictEqual(constructedCalls[0].dur, 200);
      assert.strictEqual(constructedCalls[1].callFrame.functionName, 'b');
      assert.strictEqual(constructedCalls[1].ts, 300);
      assert.strictEqual(constructedCalls[1].dur, 200);
    });
    it('uses the stack in a sample for a trace event when connected via a common trace id ', () => {
      const traceId = 123;
      const cdpProfile: CPUProfile.CPUProfileDataModel.ExtendedProfile = {
        startTime: 0,
        endTime: 3000,
        nodes: [
          {
            id: 1,
            hitCount: 0,
            callFrame: {functionName: '(root)', scriptId, url, lineNumber, columnNumber},
            children: [2],
          },
          {id: 2, callFrame: {functionName: 'foo', scriptId, url, lineNumber, columnNumber}, children: [3, 4]},
          {id: 3, callFrame: {functionName: 'bar', scriptId, url, lineNumber, columnNumber}},
          {id: 4, callFrame: {functionName: 'baz', scriptId, url, lineNumber, columnNumber}, children: [5]},
          {id: 5, callFrame: {functionName: 'sheep', scriptId, url, lineNumber, columnNumber}},
        ],
        samples: [3, 3, 3, 5],
        traceIds: {[traceId]: 5},
        timeDeltas: new Array(4).fill(100),
      };

      // Before integrating samples and trace events, the flamechart
      // looks roughly like:
      //   |----------------EvaluateScript-----------------|
      //       |-----------------v8.run--------------------|
      //                                    |---TimeStamp--|
      //          | foo |  | foo |  | foo |  | foo |
      //          | bar |  | bar |  | bar |  | baz |
      //                                     |sheep|

      // After integrating, it should look as follows. note that the the
      // stack in the last sample should be used to parent `TimeStamp`,
      // event if that sample's ts is later, since that event and that
      // sample are connected by a trace id.
      //   |----------------EvaluateScript-----------------|
      //       |-----------------v8.run--------------------|
      //          |------------------foo-------------------|
      //          |----------bar--------||--------baz------|
      //                                 |------sheep------|
      //                                 |-Timestamp-|

      const parsedProfile = new CPUProfile.CPUProfileDataModel.CPUProfileDataModel(cdpProfile);
      const integrator = new Trace.Helpers.SamplesIntegrator.SamplesIntegrator(parsedProfile, PROFILE_ID, pid, tid);
      const evaluateScript = makeCompleteEvent(Trace.Types.Events.Name.EVALUATE_SCRIPT, 0, 500);
      const v8Run = makeCompleteEvent('v8.run', 10, 490);
      const consoleTimeStamp =
          makeInstantEvent(Trace.Types.Events.Name.TIME_STAMP, 350) as Trace.Types.Events.ConsoleTimeStamp;
      consoleTimeStamp.args = {data: {message: 'A timestamp', sampleTraceId: traceId}};
      const traceEvents = [evaluateScript, v8Run, consoleTimeStamp];
      const constructedCalls = integrator.buildProfileCalls(traceEvents);
      assert.lengthOf(constructedCalls, 4);
      assert.strictEqual(constructedCalls[0].callFrame.functionName, 'foo');
      assert.strictEqual(constructedCalls[0].ts, 100);
      assert.strictEqual(constructedCalls[0].dur, 400);  // 100 - 500

      assert.strictEqual(constructedCalls[1].callFrame.functionName, 'bar');
      assert.strictEqual(constructedCalls[1].ts, 100);
      assert.strictEqual(constructedCalls[1].dur, 250);  // 100 - 350

      assert.strictEqual(constructedCalls[2].callFrame.functionName, 'baz');
      assert.strictEqual(constructedCalls[2].ts, 350);
      assert.strictEqual(constructedCalls[2].dur, 150);  // 350 - 500

      assert.strictEqual(constructedCalls[3].callFrame.functionName, 'sheep');
      assert.strictEqual(constructedCalls[3].ts, 350);
      assert.strictEqual(constructedCalls[3].dur, 150);  // 350 - 500
    });
    it('restarts the call frame stack when a new top level event is encountered', () => {
      // Profile contains the following samples:
      // |a||a||a||a|
      //       |b||b|
      const cdpProfile: Protocol.Profiler.Profile = {
        startTime: 0,
        endTime: 3000,
        nodes: [
          {
            id: 1,
            hitCount: 0,
            callFrame: {functionName: '(root)', scriptId, url, lineNumber, columnNumber},
            children: [2, 3],
          },
          {id: 2, callFrame: {functionName: 'a', scriptId, url, lineNumber, columnNumber}, children: [3]},
          {id: 3, callFrame: {functionName: 'b', scriptId, url, lineNumber, columnNumber}},
        ],
        samples: [2, 2, 3, 3],
        timeDeltas: new Array(4).fill(20),
      };

      // After integrating with trace events, the flame chart
      // should look like:
      //   |-------------------------RunTask------------------------|
      //   |----------------------EvaluateScript--------------------|
      //              |--------a-------||------RunMicroTasks------|
      //                                |-----------a------------|
      //                                |-----------b------------|
      const runTask = makeCompleteEvent(Trace.Types.Events.Name.RUN_TASK, 0, 100);
      const evaluateScript = makeCompleteEvent(Trace.Types.Events.Name.EVALUATE_SCRIPT, 0, 100);
      const runMicroTasks = makeCompleteEvent(Trace.Types.Events.Name.RUN_MICROTASKS, 50, 100);
      const traceEvents = [runTask, evaluateScript, runMicroTasks];
      const parsedProfile = new CPUProfile.CPUProfileDataModel.CPUProfileDataModel(cdpProfile);
      const integrator = new Trace.Helpers.SamplesIntegrator.SamplesIntegrator(parsedProfile, PROFILE_ID, pid, tid);
      const constructedCalls = integrator.buildProfileCalls(traceEvents);

      assert.lengthOf(constructedCalls, 3);
      const framesForFunctionA = constructedCalls.filter(c => c.callFrame.functionName === 'a');
      assert.lengthOf(framesForFunctionA, 2);
      const expectedATimestamp = 20;
      assert.strictEqual(framesForFunctionA[0].ts, 20);
      // First frame for function A should be finished when the
      // RunMicrotasks event started.
      assert.strictEqual(framesForFunctionA[0].dur, runMicroTasks.ts - expectedATimestamp);
      const expectedBTimestamp = 60;
      assert.strictEqual(framesForFunctionA[1].ts, expectedBTimestamp);
      assert.strictEqual(framesForFunctionA[1].dur, runMicroTasks.ts + (runMicroTasks.dur || 0) - expectedBTimestamp);
    });
    it('skips samples from (program), (idle), (root) and (garbage collector) nodes', async function() {
      const {parsedTrace} = await TraceLoader.traceEngine(this, 'recursive-blocking-js.json.gz');
      const samplesData = parsedTrace.Samples;
      assert.strictEqual(samplesData.profilesInProcess.size, 1);
      const [[pid, profileByThread]] = samplesData.profilesInProcess.entries();
      const [[tid, cpuProfileData]] = profileByThread.entries();
      const parsedProfile = cpuProfileData.parsedProfile;
      const samplesIntegrator =
          new Trace.Helpers.SamplesIntegrator.SamplesIntegrator(parsedProfile, PROFILE_ID, pid, tid);
      const traceEvents = parsedTrace.Renderer.allTraceEntries.filter(event => event.pid === pid && event.tid === tid);
      if (!traceEvents) {
        throw new Error('Trace events were unexpectedly not found.');
      }
      const rootNode = parsedProfile.root;
      const programNode = parsedProfile.programNode;
      const idleNode = parsedProfile.idleNode;
      const gcNode = parsedProfile.gcNode;
      if (programNode === undefined || idleNode === undefined || gcNode === undefined) {
        throw new Error('Could not find program, idle or gc node');
      }
      const constructedCalls = samplesIntegrator.buildProfileCalls(traceEvents);

      const filteredNodes = constructedCalls.filter(
          c => c.nodeId === rootNode.id || c.nodeId === idleNode.id || c.nodeId === programNode.id ||
              c.nodeId === gcNode.id);
      assert.lengthOf(filteredNodes, 0);
    });
  });
});
