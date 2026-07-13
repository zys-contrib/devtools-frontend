---
name: devtools-migrate-chromium-test
description: Use when migrating Chromium layout tests to DevTools unit tests
---

## Workflow

1.  **Identify the Test to Move**:

- You should have already received the issue ID, the test title, and the exact local paths of the downloaded legacy test file (`.js`) and its expectation file (`-expected.txt`) in your initial prompt.
- Refer to these local copies as you write the new modern test.

2.  **Identify the Target Location**:

- Find the file being tested in `front_end/`.
- Place the new test file next to the file being tested, following the naming convention `[FileName].test.ts`.
- Example: If testing `ui/legacy/components/data_grid/DataGrid.ts`, the test should be `ui/legacy/components/data_grid/DataGrid.test.ts`.

3.  **Convert the Test Content**:

- Rewrite the test from the legacy `TestRunner` style to the modern Mocha/Chai style used in DevTools.
- Use `describeWithEnvironment` or `describe` as appropriate.
- Replace `TestRunner.addResult` and expectation comparisons with standard assertions (`assert.strictEqual`, `assert.isTrue`, etc.).
- If the test requires rendering, use `renderElementIntoDOM` to attach elements to a test container.
- If testing legacy components that require internal tokens or have private methods, try to use public APIs or events instead. If impossible, consider using structural typing workarounds or updating the component to be more testable.
- If tests require a repetitive setup extract it into a test helper function at the top of the file.

4.  **Update BUILD.gn**:

- Add the new test file to the `sources` list of the `devtools_ui_module("unittests")` or `devtools_foundation_module("foundation_unittests")` target in the corresponding `BUILD.gn` file.

5.  **Verify the Changes**:

- Use the `verification` skill to correctly build the project and run the new test.
- Ensure the test passes.

6. **Evaluate Test Completeness and Utility**:

- Critically review the newly created test to ensure it provides meaningful coverage. Cross-reference it with the original Chromium layout test to verify that all original behaviors, edge cases, and assertions have been fully migrated and are actively being tested.
- If the newly added test does not test any logic from the component but just the getters from the mocked data explain to the user that this test does not add value and it's better to close it without adding the test. Provide a command without executing it to close the issue as "Fixed".
- If the newly added test uses too extensive mocks of CDP objects and methods explain to the user that the test should be foundation e2e test instead of unit test and we won't migrate it. Provide a command without executing it to close the issue as "Won't Fix (Infeasible)".

7. Upload a CL with your changes using the `version-control` skill. Make sure the CL description has a `Fixed: <issue number>` trailer instead of `Bug: <issue number>`.

## Example Conversion

### Legacy Test (`datagrid-editable-longtext.js`)

```javascript
import {TestRunner} from 'test_runner';
import * as DataGrid from 'devtools/ui/legacy/components/data_grid/data_grid.js';

(async function () {
  TestRunner.addResult('This tests long text in datagrid.');
  // ... setup grid ...
  TestRunner.addResult('Original lengths');
  // ... dump results ...
  TestRunner.completeTest();
})();
```

### Converted Test (`DataGrid.test.ts`)

```typescript
import * as DataGrid from './data_grid.js';
import {renderElementIntoDOM} from '../../../../testing/DOMHelpers.js';
import {describeWithEnvironment} from '../../../../testing/EnvironmentHelpers.js';

describeWithEnvironment('DataGrid', () => {
  it('tests long text in datagrid', () => {
    // ... setup grid ...
    // Use assertions instead of printing results
    assert.strictEqual(keyElement.textContent.length, 1500);
  });
});
```

## Tips & Troubleshooting

- **TypeScript Type Mismatches**: Legacy tests often use plain strings for properties that now require specific branded types like `LocalizedString`. You can often bypass this in tests by casting the object array `as DataGrid.DataGrid.ColumnDescriptor[]` or similar, or by using `i18n.i18n.lockedString` if appropriate.
- **Accessing Private Methods**: Legacy tests frequently called private methods (e.g., `dataGrid.update()`). In TypeScript unit tests, you should avoid this. Look for public alternatives (e.g., `updateInstantly()`) or trigger the behavior by dispatching standard DOM events (e.g., `element.dispatchEvent(new Event('scroll'))` instead of calling `onScroll()`).
- **Recursive Expansion Limits**: Methods like `TreeElement.expandRecursively()` have a default depth limit (e.g., 3) to prevent infinite loops. If your test requires expanding deeper trees, remember to pass a higher max depth argument: `expandRecursively(10)`.
- **Mocking Objects**: When testing UI components that display objects (like `RemoteObject`), look for existing mock helpers in related test files (e.g., `createDeepRemoteObjectMock` in `ObjectPropertiesSection.test.ts`) instead of trying to create real SDK objects or complex mocks from scratch. Other helpers live inside `front_end/testing`.
- **Ignoring Environment Failures**: In some environments, `npm run test` may exit with code 1 due to memory leaks (e.g., `WebFrame LEAKED`) or infrastructure issues (e.g., `gpkg` or `Corp Airlock` logs), even if the tests themselves passed. Always check the end of the test log for `TOTAL: X SUCCESS` to confirm if the test logic was successful.
- **Rendering issue**: If you encounter an issue where checking values never gives correct information it may be due to async rendering. To resolve that you may trying using `raf()` from `front_end/testing/DOMHelpers.ts` to wait for the next rendering cycle.

## After finishing the migration

If you encountered any novel issues, workarounds, or helpful tips during the migration that are not already documented, please report them to the user so they can be added to the skill documentation.
