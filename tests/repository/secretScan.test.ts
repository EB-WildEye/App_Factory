/**
 * The recurrence guard for ADR 0039: a gate that fails if a production value comes back.
 *
 * This runs inside `bun test`, which makes it one of the four gates rather than a hook
 * somebody has to install. A pre-commit hook lives in `.git/hooks`, is not committed,
 * and is therefore absent on every fresh clone and in CI — exactly the machines where
 * an accidental commit is least likely to be noticed by a human.
 *
 * **Pattern-based, not a blocklist.** No rule here names a value that was removed.
 * Each rule describes the *shape* of a class of secret, so a different knowledge base
 * id, a second AWS account or another hospital's phone number is caught the first time
 * it appears. A blocklist of the twelve strings purged on 2026-09-09 would have caught
 * exactly those twelve and nothing else.
 *
 * Allowlists exist, and they are deliberately tiny and evidence-based: every entry was
 * found by running the scan over the repository as it stood, not imagined in advance.
 * An allowlist entry is a claim that a token is an English word rather than an
 * identifier, and it is reviewable as such.
 */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { describe, expect, test } from 'bun:test';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

/**
 * Ten uppercase alphanumerics is the shape of a Bedrock knowledge base or data source
 * id. It is also the shape of a few English words, which is why this rule needs an
 * allowlist and the others do not.
 */
const TEN_CHAR_WORDS: readonly string[] = ['SUPERSEDED', 'GITIGNORED'];

interface SecretRule {
  /** Kebab-case name, reported when the rule fires. */
  readonly name: string;
  /** What shape it recognises, and why that shape is a secret. */
  readonly why: string;
  readonly pattern: RegExp;
  /** Matches that are known not to be secrets. */
  readonly allow?: readonly string[];
}

const RULES: readonly SecretRule[] = [
  {
    name: 'aws-account-id',
    why: 'Twelve consecutive digits. An AWS account id, and the one value that turns a resource name into a target.',
    pattern: /\b\d{12}\b/g,
  },
  {
    name: 'bedrock-resource-id',
    why: 'Ten uppercase alphanumerics: a Bedrock knowledge base or data source id.',
    pattern: /\b[A-Z0-9]{10}\b/g,
    allow: TEN_CHAR_WORDS,
  },
  {
    name: 'account-bearing-arn',
    why: 'An ARN whose account field is filled in. Unresolved CloudFormation pseudo-parameters are fine; a real account is not.',
    pattern: /arn:aws[a-z-]*:[a-z0-9-]*:[a-z0-9-]*:\d{9,}:/g,
  },
  {
    name: 'inference-profile-id',
    why: 'A region-prefixed Bedrock model or inference profile id. It states which model a production system runs.',
    pattern: /\b(?:eu|us|apac)\.(?:anthropic|amazon|meta|mistral|cohere|ai21)\.[a-z0-9.:-]+/g,
  },
  {
    name: 'deployed-resource-name',
    why: 'A hyphenated name ending in a deployment stage: the shape of a real table, bucket, function or layer.',
    pattern: /\b[a-z][a-z0-9]*-[a-z0-9-]+-(?:dev|prod|staging)\b/g,
  },
  {
    name: 'phone-number-or-tel-link',
    why: 'A dialable number or a tel: link. In this repository they only ever arrive embedded in clinical prompt text.',
    pattern: /\]\(tel:|\bwa\.me\/\d|\b0\d{1,2}-\d{7}\b|\+972\d{8,9}\b/g,
  },
];

/**
 * A long, Hebrew-dominant run of text.
 *
 * Hebrew itself is expected here — it is the product's language, and `lib/uiStrings.ts`
 * and the spec's mockups are full of it. Prompt text is distinguishable by *length*: a
 * UI label is a few words, and a system prompt is thousands of characters. The
 * threshold sits above the longest legitimate run in the repository and far below the
 * shortest prompt part.
 */
const HEBREW_RUN_THRESHOLD = 200;
const HEBREW_DENSITY = 0.5;
const HEBREW_CHARACTER = /[֐-׿]/;

function longestHebrewRun(content: string): number {
  let longest = 0;
  let start = 0;
  let hebrew = 0;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index] ?? '';
    if (HEBREW_CHARACTER.test(character)) {
      hebrew += 1;
      continue;
    }
    // A run ends at any character that is neither Hebrew nor connective punctuation.
    if (!/[\s.,:;!?'"()[\]{}\-–—*`|/\\+]/.test(character)) {
      const length = index - start;
      if (hebrew / Math.max(length, 1) >= HEBREW_DENSITY) {
        longest = Math.max(longest, length);
      }
      start = index + 1;
      hebrew = 0;
    }
  }

  const tailLength = content.length - start;
  if (hebrew / Math.max(tailLength, 1) >= HEBREW_DENSITY) {
    longest = Math.max(longest, tailLength);
  }

  return longest;
}

function trackedFiles(): readonly string[] {
  const result = spawnSync('git', ['-C', REPO_ROOT, 'ls-files'], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`git ls-files failed: ${result.stderr}`);
  }
  return result.stdout.split('\n').filter((line) => line.length > 0);
}

interface Finding {
  readonly file: string;
  readonly rule: string;
  readonly match: string;
}

function scan(): readonly Finding[] {
  const findings: Finding[] = [];

  for (const relative of trackedFiles()) {
    const content = readFileSync(join(REPO_ROOT, relative), 'utf8');

    for (const rule of RULES) {
      for (const match of content.match(rule.pattern) ?? []) {
        if (rule.allow?.includes(match) === true) {
          continue;
        }
        findings.push({ file: relative, rule: rule.name, match });
      }
    }

    const run = longestHebrewRun(content);
    if (run >= HEBREW_RUN_THRESHOLD) {
      findings.push({
        file: relative,
        rule: 'long-hebrew-run',
        match: `${run} characters`,
      });
    }
  }

  return findings;
}

/** One line per finding, so a failure names the file and what fired rather than a count. */
function describeFindings(findings: readonly Finding[]): readonly string[] {
  return findings.map((finding) => `${finding.file}: ${finding.rule} → ${finding.match}`);
}

describe('no production value is committed (ADR 0039)', () => {
  const findings = scan();

  test('the scan finds nothing in any tracked file', () => {
    expect(describeFindings(findings)).toEqual([]);
  });

  test('the scan actually inspects the repository', () => {
    // A guard that silently scanned zero files would pass forever. Two independent
    // sanity checks: the file list is substantial, and it contains this test.
    const files = trackedFiles();
    expect(files.length).toBeGreaterThan(50);
    expect(files).toContain('tests/repository/secretScan.test.ts');
  });
});

describe('the guard recognises the shapes it claims to', () => {
  // Synthetic strings, none of them real, proving each rule fires. A guard nobody has
  // seen fail is a guard nobody knows is wired up.
  //
  // Every sample is assembled from fragments rather than written out, because this file
  // is itself a tracked file that the scan above reads. A literal sample would make the
  // guard fail on itself, and the fix for that — excluding this file from the scan —
  // would leave the one file nobody checks holding the one exemption.
  const fakeAccount = ['1234', '5678', '9012'].join('');
  const fakeResourceId = `ABCDE${'12345'}`;
  const cases: readonly { readonly rule: string; readonly sample: string }[] = [
    { rule: 'aws-account-id', sample: `account ${fakeAccount} owns it` },
    { rule: 'bedrock-resource-id', sample: `kb ${fakeResourceId} responds` },
    {
      rule: 'account-bearing-arn',
      sample: `arn:aws:bedrock:eu-west-1:${fakeAccount}:knowledge-base/x`,
    },
    { rule: 'inference-profile-id', sample: `model ${'eu'}.anthropic.claude-x-1-v1:0` },
    { rule: 'deployed-resource-name', sample: `table someapp-sessions-${'prod'} exists` },
    { rule: 'phone-number-or-tel-link', sample: `call [here](tel${':+15550100'})` },
  ];

  for (const { rule, sample } of cases) {
    test(`${rule} fires on a sample that has its shape`, () => {
      const matching = RULES.filter((candidate) => {
        const fresh = new RegExp(candidate.pattern.source, candidate.pattern.flags);
        return (sample.match(fresh) ?? []).some(
          (match) => candidate.allow?.includes(match) !== true,
        );
      });
      expect(matching.map((candidate) => candidate.name)).toContain(rule);
    });
  }

  test('an allowlisted English word does not fire the resource-id rule', () => {
    const findings = 'This ADR is SUPERSEDED by another.'.match(/\b[A-Z0-9]{10}\b/g) ?? [];
    expect(findings).toEqual(['SUPERSEDED']);
    expect(TEN_CHAR_WORDS).toContain('SUPERSEDED');
  });

  test('short Hebrew UI copy does not fire the prompt-text rule', () => {
    expect(longestHebrewRun('מפעל האפליקציות')).toBeLessThan(HEBREW_RUN_THRESHOLD);
  });

  test('a long Hebrew block does fire it', () => {
    expect(longestHebrewRun('ש'.repeat(HEBREW_RUN_THRESHOLD + 1))).toBeGreaterThanOrEqual(
      HEBREW_RUN_THRESHOLD,
    );
  });
});
