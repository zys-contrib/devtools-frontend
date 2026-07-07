---
name: devtools-ux-writing-refactor
description: >-
  Refactor user-facing UIStrings and localization comments in a DevTools module folder according to UX writing guidelines (child task of b/40799900). Use when simplifying wording, checking sentence case, or improving L10n comments in UIStrings for a specific folder or issue. Don't use for general code changes or non-UIStrings files.
---

# DevTools UX writing refactoring workflow

Use this skill when addressing a single UX writing refactoring task (one module folder or child issue under tracking bug [b/40799900](https://crbug.com/40799900)).

## 0. Environment setup (avoid PATH errors)

In DevTools Linux workspaces, `depot_tools` and `node`/`npm` may not be in `PATH` in non-interactive agent shells. Before you run Git, `gclient`, `npm`, or `git cl` commands, ensure that your environment is set up:
```bash
export PATH=$HOME/depot_tools:$PATH
source ~/.nvm/nvm.sh  # Or export PATH=$(pwd)/third_party/node/linux/node-linux-x64/bin:$PATH
```

## 1. Pre-flight issue check and target scope

Before you write code or modify files, check the status of the associated Buganizer issue:
```bash
$ISSUES render <issue_number>  # Or use buganizer MCP tools: render_issue / render_issue_with_external
```
* **Why?** Multiple developers and agents work on child tasks under `b/40799900`.
* **Action required:** If the issue is marked as `FIXED`, `VERIFIED`, or `CLOSED`, is assigned to another active developer, or has an attached Change List (CL), **stop immediately and verify whether you need to address it**. Ask the user for confirmation before you override existing work.
* **Identify target files:** If `render_issue` returns an external redaction notice, use `render_issue_with_external` to view the full bug description. The bug description typically lists the exact **Target Files** to refactor for this child task. Focus exclusively on those target files.

## 2. Create a branch

Create a branch dedicated to this issue from the latest `origin/main` (after you run `gclient sync`) using the DevTools version control tool:
```bash
git fetch origin
git checkout origin/main
gclient sync
git new-branch fix-<issue_number>
```
* **Why?** In Chrome DevTools, do **not** use standard Git commands such as `git checkout -b` or `git switch -c`. Always use `git new-branch` so that `depot_tools` and Gerrit configure tracking information correctly.
* **Naming:** Always include the issue number in the branch name (for example, `fix-531625399`).

## 3. Refactor UIStrings and localization comments

Locate all TypeScript files in the target folder that define `const UIStrings = { ... }` and apply the **7-point UX writing checklist** (cross-check with official DevTools documentation at https://developer.chrome.com/docs/devtools).

> [!IMPORTANT]
> **Ignore non-localized or experimental strings:** Do not modify strings in `const UIStringsNotTranslate = { ... }`, `lockedString`, or `i18n.i18n.lockedString`. These strings are for early-stage or experimental features that you must not localize or alter during UX refactoring.

### The 7-point checklist
1. **Brevity and short synonyms:** Replace formal or lengthy words:
   * `preserve` -> `keep` | `additional` -> `more` | `prevent` -> `stop` | `receive` -> `get`
   * `submit` -> `send` | `modification` -> `change` | `create` -> `add` | `suitable` -> `fit`
   * *Check sibling references:* If you change a setting name or label (for example, changing `'Preserve log'` to `'Keep log'`), search sibling files in the folder for explanatory text or status strings that reference the old name in quotes (for example, `'console.clear() was prevented due to "Preserve log"'`), and update them to match.
2. **Cut unnecessary words:** Eliminate politeness (`please`, `sorry`), filler (`very`, `strongly`, `there is` or `there are`), and marketing fluff (`seamless`, `awesome`, `fast`, `quick`).
3. **Contractions:** Use contractions (`don't`, `can't`, `isn't`, `won't`) instead of formal spellings (`do not`, `cannot`, `is not`, `will not`).
4. **Sentence case and capitalization:** Use sentence case for headings, labels, and UI element names. Capitalize only the first word, proper nouns, product names (`Chrome DevTools`), and web APIs (`Background Fetch API`).
   * Do not capitalize feature names (for example, `conditional breakpoint` or `command menu`).
   * Capitalize panel names and UX elements that are named after panels (for example, `Show Application`, `Toggle Console`, `Console sidebar`, or `Styles`).
   * For panel names that consist of two words, capitalize only the first word (for example, `Developer resources panel`).
   * When you use the panel name in combination with another word, capitalize the panel name but not the other word, unless it is a proper noun (for example, `Console view` or `DevTools Console`).
   * In some cases, ambiguity exists whether a word refers to a UX element in DevTools (such as a panel name) or a concept (such as developer terminology). For example, this occurs with `console`, `issue`, or `network`. Decide based on the surrounding context and code (for example, `Console view`, `Console sidebar`, and `Console prompt` versus `console message`, `console warning`, `console log`, `copy console`, `clear console`, and `console history`; `Show Network` versus `network log` and `network filter`).
5. **Punctuation and actionability:** Remove trailing periods from single-sentence labels or titles. Ensure that error messages instruct the user how to recover (for example, `Shorten filename to 64 characters or less` instead of `Invalid filename`). Ensure that ARIA labels and multi-sentence tooltips have consistent terminal punctuation.
6. **Terminology (glossary):** Strictly follow standard DevTools UI terminology and letter casing (`panel`, `tab`, `drawer`, `sidebar`, `datagrid` or `table`, `action bar`, `status bar`, and `live expressions section`). Never use `pane` or call tabs `panes` in UI strings or localization (L10n) comments.
7. **Localization (L10n) comments:** Ensure that every string in `UIStrings` has a preceding `@description` comment that explains where and when it appears. Use precise terminology and correct letter casing (see rule 6). Ensure that the description is easy to understand and provides enough information for translators. Every `@description` comment must end with a period (`.`). You must explicitly document all standard placeholders (`{PH1}`, `{url}`, `{index}`) with runtime data examples (for example, `@example {https://example.com} url`).
   * *ICU plural variables:* The i18n tool automatically parses variables in ICU plural format (such as `n` in `{n, plural, =0 {No issues} ...}`) as numeric counts, so they do **not** require an `@example` tag in the `@description` comment.
   * *Terminal punctuation:* Every `@description` comment must end with a period (`.`), even if it is a single phrase or sentence.

## 4. Chrome writing style guide

Also consult the style guides at `google3/experimental/users/rachelandrew/tools/chrome_writing/knowledge/style/` for applicable guidelines.

## 5. Mandatory verification and testing

Do not finish an edit without running the linter and test suite. In DevTools, i18n placeholder changes or string edits can easily break tests or linter rules.
0. **Ask the user to review the diff and confirm**
1. **Update sibling unit tests**
   Unit test files (`*.test.ts`) alongside the implementation often assert exact UIString values (such as error messages or warnings). When you refactor a string, check sibling `*.test.ts` files for assertions that match the old string value, and update them to prevent test failures.
2. **Run the linter and auto-fix errors**
   ```bash
   npm run lint -- <folder_path>
   ```
3. **Run unit tests**
   Run unit tests for the target folder first for fast feedback. Then, run the full test suite to verify that no cross-module regressions or snapshot failures occurred:
   ```bash
   npm run test -- <folder_path>
   npm run test
   ```
4. **Run presubmit checks**
   Ensure that you commit or stage all changes before you run presubmit checks:
   ```bash
   git cl presubmit -u
   ```

## 6. Summarize changes and upload the CL

When all tests and presubmit checks pass, commit your changes and upload the CL to Gerrit. Do not use `[uxw]` as a prefix.

1. **Stage and commit changes**
   ```bash
   git add <modified_files>
   git commit -m "Ensure consistent UI Strings in <folder_path>"
   ```
   *(If you update an existing commit on this branch, use `git commit --amend`).*

2. **Upload the CL to Gerrit**
   Upload the CL using `git cl upload`. Provide a dynamic summary of changes (depending on the actual content of the change) and the bug trailer:
   ```bash
   git cl upload -d --commit-description="Ensure consistent UI Strings in <folder_path>

   Summary of changes:
   - <dynamically list specific words replaced, contractions adopted, or sentence case fixes>

   Fixed: <issue_number>"
   ```
   * **Formatting rules:**
     * Keep line length below 72 characters.
     * Include `Fixed: <issue_number>` on a separate line at the bottom of the description so that automation closes the issue.
