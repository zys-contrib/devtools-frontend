// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'node:fs';
import * as path from 'node:path';

import {GEN_DIR, SOURCE_ROOT, TEST_ID_REGEX} from './paths.js';
import {platform} from './platform.js';
import {TestConfig} from './test_config.js';

export type ExpectationResult = 'Failure'|'Pass'|'Skip';

export interface Expectation {
  /** The original line. If this is a comment or empty, other fields are undefined. */
  line: string;
  isCommentOrEmpty?: boolean;
  bugs?: string[];
  platforms?: string[];
  testName?: string;
  results?: ExpectationResult[];
}

// bug: required, must start with crbug.com/ followed by numbers
const bugPattern = '(crbug\\.com\\/\\d+)\\s+';
// platforms: optional, space-separated platform names in brackets e.g. [ mac linux win32 ]
const platformsPattern = '(?:\\[([^\\]]*)\\]\\s+)?';
// testName: required, a string
const testNamePattern = '([^\\s\\[]+)\\s+';
// results: required, space-separated results in brackets e.g. [ Failure ]
const resultsPattern = '\\[([^\\]]+)\\]';
const EXPECTATION_REGEX = new RegExp(`^${bugPattern}${platformsPattern}${testNamePattern}${resultsPattern}$`);

export function parseExpectations(content: string): Expectation[] {
  const lines = content.split('\n');
  return lines.map(line => parseExpectationLine(line));
}

function parseExpectationLine(line: string): Expectation {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) {
    return {line, isCommentOrEmpty: true};
  }

  const match = trimmed.match(EXPECTATION_REGEX);
  if (match) {
    const bugStr = match[1] ? match[1].trim() : '';
    const bugs = bugStr ? [bugStr] : [];
    if (bugs.length === 0) {
      throw new Error(`Expectation must have at least one bug: ${line}`);
    }

    const platformsStr = match[2] ? match[2].trim() : '';
    const platforms = platformsStr ? platformsStr.split(/\s+/) : [];
    const validPlatforms = new Set(['mac', 'linux', 'win32']);
    for (const p of platforms) {
      if (!validPlatforms.has(p)) {
        throw new Error(`Invalid platform '${p}' in expectation: ${line}`);
      }
    }

    const resultsStr = match[4] ? match[4].trim() : '';
    const results = (resultsStr ? resultsStr.split(/\s+/) : []) as ExpectationResult[];
    const validResults = new Set(['Failure', 'Pass', 'Skip']);
    for (const r of results) {
      if (!validResults.has(r)) {
        throw new Error(`Invalid result '${r}' in expectation: ${line}`);
      }
    }

    return {
      line,
      isCommentOrEmpty: false,
      bugs,
      platforms,
      testName: match[3],
      results,
    };
  }

  throw new Error(`Could not parse expectation line: ${line}`);
}

export function serializeExpectations(expectations: Expectation[]): string {
  return expectations.map(serializeExpectationLine).join('\n');
}

function serializeExpectationLine(expectation: Expectation): string {
  if (expectation.isCommentOrEmpty) {
    return expectation.line;
  }

  const parts: string[] = [];
  if (expectation.bugs && expectation.bugs.length > 0) {
    parts.push(expectation.bugs.join(' '));
  }
  if (expectation.platforms && expectation.platforms.length > 0) {
    parts.push(`[ ${expectation.platforms.join(' ')} ]`);
  }
  if (expectation.testName) {
    parts.push(expectation.testName);
  }
  if (expectation.results && expectation.results.length > 0) {
    parts.push(`[ ${expectation.results.join(' ')} ]`);
  }

  return parts.join(' ');
}

const parsedExpectations = new Map<string, Expectation[]>();

export function getExpectedResults(testId: string): ExpectationResult[]|undefined {
  const expectationsPath = TestConfig.expectationsFile ? path.resolve(TestConfig.expectationsFile) :
                                                         path.join(SOURCE_ROOT, 'test', 'TestExpectations');

  if (!parsedExpectations.has(expectationsPath)) {
    if (fs.existsSync(expectationsPath)) {
      const content = fs.readFileSync(expectationsPath, 'utf8');
      parsedExpectations.set(expectationsPath, parseExpectations(content).filter(e => !e.isCommentOrEmpty));
    } else {
      parsedExpectations.set(expectationsPath, []);
    }
  }

  const expectations = parsedExpectations.get(expectationsPath)!;

  const match = expectations.find(e => {
    if (!e.testName) {
      return false;
    }
    if (e.platforms && e.platforms.length > 0) {
      if (!e.platforms.includes(platform)) {
        return false;
      }
    }
    if (TEST_ID_REGEX.test(e.testName)) {
      return testId === e.testName;
    }
    return testId === e.testName || testId.startsWith(e.testName + ':');
  });

  return match?.results;
}

export function isExpectedResult(
    {exactTestId, success, skipped}: {exactTestId: string, success: boolean, skipped: boolean}): boolean {
  const expectedResults = getExpectedResults(exactTestId);
  if (!expectedResults) {
    return success || skipped;
  }
  if (skipped) {
    return expectedResults.includes('Skip');
  }
  if (success) {
    return expectedResults.includes('Pass');
  }
  return expectedResults.includes('Failure');
}

export function getSkippedTests(): string[] {
  const expectationsPath = TestConfig.expectationsFile ? path.resolve(TestConfig.expectationsFile) :
                                                         path.join(SOURCE_ROOT, 'test', 'TestExpectations');

  if (!parsedExpectations.has(expectationsPath)) {
    if (fs.existsSync(expectationsPath)) {
      const content = fs.readFileSync(expectationsPath, 'utf8');
      parsedExpectations.set(expectationsPath, parseExpectations(content).filter(e => !e.isCommentOrEmpty));
    } else {
      parsedExpectations.set(expectationsPath, []);
    }
  }

  const expectations = parsedExpectations.get(expectationsPath)!;

  return expectations
      .filter(e => {
        if (!e.testName) {
          return false;
        }
        if (e.results && !e.results.includes('Skip')) {
          return false;
        }
        if (e.platforms && e.platforms.length > 0 && !e.platforms.includes(platform)) {
          return false;
        }
        return true;
      })
      .map(e => e.testName as string)
      .map(skipped => {
        const parts = skipped.split(':');
        const file = parts[0];
        const caseName = parts.slice(1).join(':');
        const jsFile = file.replace(/\.ts$/, '.js');
        const absoluteJsFile = path.isAbsolute(jsFile) ? jsFile : path.join(GEN_DIR, jsFile);
        return parts.length > 1 ? `${absoluteJsFile}:${caseName}` : absoluteJsFile;
      });
}
