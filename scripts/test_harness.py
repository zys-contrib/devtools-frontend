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
        if getattr(self, 'debug_mode', False):
            sys.stdout.write(stdout)
            sys.stdout.write(stderr)

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

        return results, process.returncode

    def _resolve_test_file(self, test_file):
        import os
        import re
        match = re.match(r'^(.*\.([tj]s))(.*)$', test_file)
        if match:
            path_part = match.group(1)
            suffix = match.group(3)
        else:
            path_part = test_file
            suffix = ""

        if path_part.endswith(".ts"):
            path_part = path_part[:-3] + ".js"

        if path_part.startswith("out/Default/"):
            pass
        elif path_part.startswith("gen/"):
            path_part = os.path.join("out/Default", path_part)
        else:
            path_part = os.path.join("out/Default/gen", path_part)
        return os.path.abspath(path_part) + suffix

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

    def test_unit(self):
        results, exit_code = self.run_unit_test(
            "test/harness/unit/unit.test.ts")
        self.assertEqual(exit_code, 0)
        self.assertEqual(
            len(results), 1,
            f"Expected exactly one test result, got {len(results)}")
        self.assertEqual(
            results[0].get('testId'),
            'test/harness/unit/unit.test.ts:unit:should_run_a_basic_unit_test_successfully'
        )
        self.assertEqual(results[0].get('status'), 'PASS')

    def test_e2e(self):
        results, exit_code = self.run_e2e_test("test/harness/e2e/e2e.test.ts")
        self.assertEqual(exit_code, 0)
        self.assertEqual(
            len(results), 1,
            f"Expected exactly one test result, got {len(results)}")
        self.assertEqual(
            results[0].get('testId'),
            'test/harness/e2e/e2e.test.ts:test_harness_e2e_fixture:should_run_a_basic_e2e_test_successfully'
        )
        self.assertEqual(results[0].get('status'), 'PASS')

    def test_e2e_duplicate(self):
        results, exit_code = self.run_e2e_test(
            "test/harness/e2e/duplicate.test.ts")
        self.assertEqual(exit_code, 1)
        self.assertEqual(
            len(results), 0,
            f"Expected exactly 0 test result, got {len(results)}")

    def test_unit_duplicate(self):
        results, exit_code = self.run_unit_test(
            "test/harness/unit/duplicate.test.ts")
        self.assertEqual(exit_code, 1)

    def test_unit_hooks(self):
        results, exit_code = self.run_unit_test(
            "test/harness/unit/hooks.test.ts")
        self.assertEqual(exit_code, 1)
        self.assertEqual(
            len(results), 4,
            f"Expected exactly 4 test results, got {len(results)}")
        self.assertEqual(results[0].get('testId'),
                         'test/harness/unit/hooks.test.ts:block_1:run_1')
        self.assertEqual(results[0].get('status'), 'FAIL')
        self.assertEqual(results[1].get('testId'),
                         'test/harness/unit/hooks.test.ts:block_1:run_2')
        self.assertEqual(results[1].get('status'), 'FAIL')
        self.assertEqual(results[2].get('testId'),
                         'test/harness/unit/hooks.test.ts:block_2:run_3')
        self.assertEqual(results[2].get('status'), 'PASS')
        self.assertEqual(results[3].get('testId'),
                         'test/harness/unit/hooks.test.ts:block_2:run_4')
        self.assertEqual(results[3].get('status'), 'PASS')

    def test_unit_ids(self):
        results, exit_code = self.run_unit_test(
            "test/harness/unit/hooks.test.ts:block_2:run_3")
        self.assertEqual(exit_code, 0)
        self.assertEqual(
            len(results), 1,
            f"Expected exactly one test result, got {len(results)}")
        self.assertEqual(results[0].get('testId'),
                         'test/harness/unit/hooks.test.ts:block_2:run_3')
        self.assertEqual(results[0].get('status'), 'PASS')

    def test_e2e_ids(self):
        results, exit_code = self.run_e2e_test(
            "test/harness/e2e/multiple.test.ts:multiple:run2")
        self.assertEqual(exit_code, 0)
        self.assertEqual(
            len(results), 1,
            f"Expected exactly one test result, got {len(results)}")
        self.assertEqual(results[0].get('testId'),
                         'test/harness/e2e/multiple.test.ts:multiple:run2')
        self.assertEqual(results[0].get('status'), 'PASS')

    def test_e2e_errors(self):
        results, exit_code = self.run_e2e_test(
            "test/harness/e2e/errors.test.ts")
        self.assertEqual(exit_code, 1)
        self.assertEqual(
            len(results), 4,
            f"Expected exactly 4 test results, got {len(results)}")
        self.assertEqual(results[0].get('testId'),
                         'test/harness/e2e/errors.test.ts:block_1:run_1')
        self.assertEqual(results[0].get('status'), 'PASS')
        self.assertEqual(results[1].get('testId'),
                         'test/harness/e2e/errors.test.ts:block_1:run_2')
        self.assertEqual(results[1].get('status'), 'PASS')
        self.assertEqual(results[2].get('testId'),
                         'test/harness/e2e/errors.test.ts:block_2:run_3')
        self.assertEqual(results[2].get('status'), 'FAIL')
        self.assertEqual(results[3].get('testId'),
                         'test/harness/e2e/errors.test.ts:block_2:run_4')
        self.assertEqual(results[3].get('status'), 'PASS')

    def test_e2e_repeat(self):
        abs_test_file = self._resolve_test_file("test/harness/e2e/e2e.test.ts")
        results, exit_code = self.run_test_with_rdb([
            "out/Default/gen/test/harness/run-mocha.js", abs_test_file, "--",
            "--repeat=2"
        ])
        self.assertEqual(exit_code, 0)
        self.assertEqual(
            len(results), 2,
            f"Expected exactly 2 test results, got {len(results)}")

        # Initial test
        self.assertEqual(
            results[0].get('testId'),
            'test/harness/e2e/e2e.test.ts:test_harness_e2e_fixture:should_run_a_basic_e2e_test_successfully'
        )
        self.assertEqual(results[0].get('status'), 'PASS')
        # Repeated run
        self.assertEqual(
            results[1].get('testId'),
            'test/harness/e2e/e2e.test.ts:test_harness_e2e_fixture:should_run_a_basic_e2e_test_successfully'
        )
        self.assertEqual(results[1].get('status'), 'PASS')

if __name__ == '__main__':
    if '--debug' in sys.argv:
        DevToolsTestHarness.debug_mode = True
        sys.argv.remove('--debug')
    unittest.main()
