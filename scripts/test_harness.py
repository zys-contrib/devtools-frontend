#!/usr/bin/env python3

# Copyright 2026 The Chromium Authors
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

import subprocess
import re
import sys
import json
import unittest

# The goal of this test is to verify e2e behavior of our test harness w.r.t how
# it reports test results.


class DevToolsTestHarness(unittest.TestCase):

    def run_test_with_rdb(self, cmd_args):
        cmd = [
            "npm", "run", "rdb", "--", "vpython3", "third_party/node/node.py",
            "--output"
        ] + cmd_args
        process = subprocess.Popen(cmd,
                                   stderr=subprocess.PIPE,
                                   stdout=subprocess.PIPE,
                                   text=True)
        stdout, stderr = process.communicate()

        match = re.search(
            r'rdb-stream: created invocation - .*?/ui/inv/([^\s"\']+)', stderr)
        if not match:
            match = re.search(r'invocations/([^\s"\']+)', stderr)

        self.assertIsNotNone(
            match,
            f"Failed to find rdb invocation ID in the output.\nStdout: {stdout}\nStderr: {stderr}"
        )

        invocation_id = match.group(1)
        if invocation_id.startswith('invocations/'):
            invocation_id = invocation_id[len('invocations/'):]

        query_cmd = ["rdb", "query", invocation_id, "-json"]
        query_process = subprocess.run(query_cmd,
                                       capture_output=True,
                                       text=True)
        self.assertEqual(query_process.returncode, 0,
                         f"rdb query failed: {query_process.stderr}")

        results = []
        for line in query_process.stdout.strip().split('\n'):
            line = line.strip()
            if not line or not line.startswith('{'):
                continue
            try:
                data = json.loads(line)
                if 'testResult' in data:
                    results.append(data['testResult'])
            except json.JSONDecodeError:
                pass

        return results

    def _resolve_test_file(self, test_file):
        import os
        if test_file.endswith(".ts"):
            test_file = test_file[:-3] + ".js"
        if test_file.startswith("out/Default/"):
            pass
        elif test_file.startswith("gen/"):
            test_file = os.path.join("out/Default", test_file)
        else:
            test_file = os.path.join("out/Default/gen", test_file)
        return os.path.abspath(test_file)

    def run_unit_test(self, test_file):
        abs_test_file = self._resolve_test_file(test_file)
        return self.run_test_with_rdb([
            "node_modules/karma/bin/karma", "start",
            "out/Default/gen/test/unit/karma.conf.js", "--", abs_test_file
        ])

    def run_e2e_test(self, test_file):
        abs_test_file = self._resolve_test_file(test_file)
        return self.run_test_with_rdb(
            ["out/Default/gen/test/harness/run-mocha.js", abs_test_file])

    def test_unit_fixture(self):
        results = self.run_unit_test("test/harness/unit/unit.test.ts")
        self.assertEqual(
            len(results), 1,
            f"Expected exactly one test result, got {len(results)}")
        self.assertEqual(
            results[0].get('testId'),
            'Test Harness Unit Fixture/should run a basic unit test successfully'
        )
        self.assertEqual(results[0].get('status'), 'PASS')

    def test_e2e_fixture(self):
        results = self.run_e2e_test("test/harness/e2e/e2e.test.ts")
        self.assertEqual(
            len(results), 1,
            f"Expected exactly one test result, got {len(results)}")
        self.assertEqual(
            results[0].get('testId'),
            'e2e/e2e.test.ts: Test Harness E2E Fixture/should run a basic e2e test successfully'
        )
        self.assertEqual(results[0].get('status'), 'PASS')


if __name__ == '__main__':
    unittest.main()
