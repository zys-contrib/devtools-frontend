---
name: repro-flaky-test
description: Reproduce and investigate flakiness in a test.
---

# Fixing flaky Tests

This skill outlines the workflow for reproducing and fixing a flaky test in the DevTools codebase.

## Workflow

- You will be given as input, either a Chromium bug link (e.g. `crbug.com/1234567`), or a name of a test file and (optionally) the test name.
- For example: e2e/extensions/debugger-language-plugins.test.ts and "The Debugger Language Plugins/shows sensible error messages".
- If nothing is provided, as the user which test you should run.
- Find the test in the codebase and look at its implementation.
- Run the test three times to note how long the test runs (on average) per minute.

## Reproduction

- Run the test enough times for a full test run to take one minute. For example, if a test takes a second to run, set it to repeat 60 times. If a test takes 5 seconds to run, run it 12 times.
- Start with one minute and, if the failure does not repeat, try again and increase the time by a minute (up to a maximum of 5 minutes per run).
- Use `npm run test -- path/to/foo.test.ts:test_name --repeat <count>` to run the tests repeatedly. Both E2E and unit tests support this flag.
- Be sure to keep track of the cumulative count of how often you run the test and how often they fail, so that you can calculate a 'flaky percentage' before and after making a fix.

After every round, display the *cumulative* results in a table:

```
Test:                                                 Runs  Time   Failures
"Recorder/should be able to start a replay..."         30    60s   0 (0.00%)
"The Debugger Language Plugins/shows sensible..."      60    60s   1 (1.67%)
```

Once you have one or more failures, show the error message and ask the user if they want to:

1) Start investigating the test failures.
2) Continue running all the tests.
3) Run only the failed tests (to get a clearer indication of their failure rate).
4) Run only the tests that haven't failed (to attempt to get a reproduction).

## Investigation

- Create a branch flaky_tests and append a datestamp, such as _2026_07_04_14h16m.
- Ensure you use the instructions from the `devtools-version-control` skill to create and switch branches appropriately.
- Investigate each test failure and propose a fix.
- Don't commit the changes to the branch.

## Results

- Before finishing, run the full verification process (TypeScript checks, and linters) as required by the repository best practices.
- Request to run the test again for as long as you think it would take to be sure the problem is gone, but get permission from the user before starting very long runs (anything over 4 minutes).
- For things that have a 33% failure rate before fixing (for example), only a handful of runs are needed to verify, but tests with lower failure rate need more.
- NOTE: If the test fails again with the same error as before, you don't need to finish the test run but instead you should augment or replace your fix with a better one.
- At the end, list the tests, state briefly why each test was failing and how the fix addresses the issue along with the failure rate before and after.
