#!/usr/bin/env python3
"""Regenerate the Gali-derived artefacts in this repo.

Three outputs, all derived from the read-only Gali backend rather than retyped:

  lib/gali/gali-production-source.local.json   GITIGNORED. Every production value:
                                               resource ids, inference profile ids,
                                               table names, and the clinical prompt
                                               text, plus a digest and a length for
                                               each prompt.
  lib/gali/constants.ts                        the whole file. STRUCTURE ONLY - the
                                               part order, the separator, the caps,
                                               the key schema, the metadata schema.
                                               No production value appears in it.
  docs/gali-ground-truth.md                    only the regions between GENERATED
                                               markers - lengths and provenance, with
                                               a redaction notice where the verbatim
                                               prompt blocks used to be.

Why the split: this repository is PUBLIC (ADR 0039). Gali's prompt text is a validated
clinical artefact belonging to the hospital, and its resource ids are names AWS will
answer to. Neither belongs in a public git history. What the factory actually needs
committed is the shape, and the shape carries no secret.

Why a generator at all: the strings are ~21,000 characters of Hebrew clinical text.
Hand copying them is how a byte-level drift gets introduced. Answers Q3.

The Gali repos are READ-ONLY. This script opens files there for reading and writes
nothing, not even bytecode - see the sys.dont_write_bytecode line below, which keeps
__pycache__ out of a repo we are not allowed to touch.

Usage:
    uv run scripts/generate_gali_constants.py            # write all three outputs
    uv run scripts/generate_gali_constants.py --check    # verify, write nothing
    uv run scripts/generate_gali_constants.py --gali-backend <path>

--check exits 1 on drift and prints which output disagrees, so it can be wired into CI
next to the four gates. It is also what `tests/gali/productionSource.test.ts` runs,
when this machine has the Gali checkout, to prove the local file is what the generator
produces and not something edited by hand.
"""
from __future__ import annotations

import argparse
import datetime
import hashlib
import io
import json
import os
import re
import sys
from typing import Callable

sys.dont_write_bytecode = True

DEFAULT_GALI_BACKEND = r"C:\Users\eb300\Desktop\Gali-AWS-backend"

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONSTANTS_PATH = os.path.join(REPO_ROOT, "lib", "gali", "constants.ts")
LOCAL_SOURCE_PATH = os.path.join(
    REPO_ROOT, "lib", "gali", "gali-production-source.local.json"
)
GROUND_TRUTH_PATH = os.path.join(REPO_ROOT, "docs", "gali-ground-truth.md")

# Provenance of the two source repos, recorded in the generated header.
BACKEND_COMMIT = "ab6a325 (2026-08-02)"
FRONTEND_COMMIT = "e950553 (2026-08-02)"

PART_ORDER = ("identity", "language", "voice", "rules", "formatAndFlags")

# Source lines for each part, for the document's per-part table.
PART_SOURCE_LINES = {
    "identity": "21-30",
    "language": "35-50",
    "voice": "55-98",
    "rules": "103-214",
    "formatAndFlags": "219-288",
}

# What the document says where a verbatim block used to be. One sentence, so a reader
# who arrives at the anchor learns where the value went rather than that it is missing.
REDACTION_NOTICE = (
    "> **Redacted (ADR 0039).** The text is a production clinical artefact and this\n"
    "> repository is public. It lives in `lib/gali/gali-production-source.local.json`,\n"
    "> which is gitignored and regenerated from the read-only Gali checkout by\n"
    "> `scripts/generate_gali_constants.py`. Length and provenance stay below; the\n"
    "> bytes do not."
)


class GaliSource:
    """The values production actually uses, after import-time substitution."""

    def __init__(self, backend_path: str) -> None:
        shared_root = os.path.join(backend_path, "shared")
        if not os.path.isdir(shared_root):
            raise SystemExit(f"No shared/ directory under {backend_path!r}")
        sys.path.insert(0, shared_root)
        from shared import prompt, redflag_classifier  # noqa: PLC0415

        self.parts: dict[str, str] = {
            "identity": prompt._IDENTITY,
            "language": prompt._LANGUAGE,
            "voice": prompt._VOICE,
            "rules": prompt._RULES,
            "formatAndFlags": prompt._FORMAT_AND_FLAGS,
        }
        self.rag_template: str = prompt.RAG_PROMPT_TEMPLATE
        self.system_prompt: str = prompt.SYSTEM_PROMPT
        self.classifier_prompt: str = redflag_classifier._SYSTEM_PROMPT

        # Resource identifiers. Read from the backend so that a changed id in Gali
        # shows up here rather than in a stale hand-written literal.
        self.resources: dict[str, str] = read_resources(backend_path)


RESOURCE_PATTERNS: dict[str, tuple[str, str]] = {
    # name: (relative path under the backend, regex with one capture group)
    "knowledgeBaseId": ("scripts/ingest_kb.py", r'KB_ID\s*=\s*["\']([A-Z0-9]{8,12})["\']'),
    "customDataSourceId": (
        "scripts/ingest_kb.py",
        r'DATA_SOURCE_ID\s*=\s*["\']([A-Z0-9]{8,12})["\']',
    ),
}


def read_resources(backend_path: str) -> dict[str, str]:
    """Resource identifiers, read out of the backend's own source.

    Only the two ids that appear as plain assignments are scraped. The rest live in
    `samconfig.toml` inside one long space-separated parameter string, and a regex over
    that is less reliable than reading it as a whole, so they are pulled from there by
    name below.
    """
    values: dict[str, str] = {}

    for name, (relative, pattern) in RESOURCE_PATTERNS.items():
        text = read_text(os.path.join(backend_path, relative))
        match = re.search(pattern, text)
        if match is None:
            raise SystemExit(f"Could not read {name} from {relative}")
        values[name] = match.group(1)

    samconfig = read_text(os.path.join(backend_path, "samconfig.toml"))
    for name, key in (
        ("syncDataSourceId", "DataSourceId"),
        ("primaryModelId", "ModelArn"),
        ("fallbackModelId", "FallbackModelArn"),
    ):
        match = re.search(rf"\b{key}=([^\s\"']+)", samconfig)
        if match is None:
            raise SystemExit(f"Could not read {name} ({key}) from samconfig.toml")
        values[name] = match.group(1)

    template = read_text(os.path.join(backend_path, "template.yaml"))
    match = re.search(r"TableName:\s*!Sub\s*(?:\"|')?([A-Za-z0-9$among{}._-]+)", template)
    if match is None:
        raise SystemExit("Could not read the chat table name from template.yaml")
    values["chatTableNamePattern"] = match.group(1)

    # The code-side default, i.e. the second argument to os.environ.get.
    config = read_text(os.path.join(backend_path, "shared", "shared", "config.py"))
    match = re.search(
        r'TABLE_NAME[^=]*=\s*os\.environ\.get\(\s*["\'][^"\']+["\']\s*,\s*["\']([a-z0-9-]+)["\']',
        config,
    )
    if match is None:
        raise SystemExit("Could not read the chat table default from config.py")
    values["chatTableNameDefault"] = match.group(1)

    return values


def ts_string(value: str) -> str:
    """A TypeScript double-quoted literal, byte-exact, Hebrew left as Hebrew."""
    return json.dumps(value, ensure_ascii=False)


def sha256(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def digested_values(src: GaliSource) -> dict[str, str]:
    """Every value the manifest digests, keyed as `lib/gali/productionSource.ts` keys them."""
    values = {
        "ragPromptTemplate": src.rag_template,
        "classifierSystemPrompt": src.classifier_prompt,
        "systemPrompt": src.system_prompt,
    }
    for name in PART_ORDER:
        values[f"systemPromptParts.{name}"] = src.parts[name]
    return values


def render_local_source(src: GaliSource, generated_at: str) -> str:
    """The gitignored JSON. Never committed, never printed, never logged."""
    values = digested_values(src)
    document = {
        "manifest": {
            "generatedAt": generated_at,
            "backendCommit": BACKEND_COMMIT,
            "frontendCommit": FRONTEND_COMMIT,
            "digests": {name: sha256(value) for name, value in values.items()},
            "lengths": {name: len(value) for name, value in values.items()},
        },
        "resources": {
            "knowledgeBaseId": src.resources["knowledgeBaseId"],
            "customDataSourceId": src.resources["customDataSourceId"],
            "syncDataSourceId": src.resources["syncDataSourceId"],
            "primaryModelId": src.resources["primaryModelId"],
            "fallbackModelId": src.resources["fallbackModelId"],
            "chatTableNamePattern": src.resources["chatTableNamePattern"],
            "chatTableNameDefault": src.resources["chatTableNameDefault"],
        },
        "prompts": {
            "ragPromptTemplate": src.rag_template,
            "classifierSystemPrompt": src.classifier_prompt,
            "systemPromptParts": {name: src.parts[name] for name in PART_ORDER},
        },
    }
    return json.dumps(document, ensure_ascii=False, indent=2) + "\n"


def render_constants(src: GaliSource) -> str:
    """The whole of lib/gali/constants.ts. Structure only - no production value."""
    header = f'''/**
 * Gali's STRUCTURE, read out of the read-only Gali repos.
 *
 * What is here: the shapes, orders, separators, caps and schemas the factory has to
 * reproduce. Every one of them is a value to be COPIED, never chosen, and none of them
 * is a secret - a part order is not a resource id and a key schema is not a prompt.
 *
 * What is NOT here, deliberately (ADR 0039): the clinical prompt text, the Bedrock
 * knowledge base and data source ids, the inference profile ids, and the production
 * table names. This repository is public. Those values live in
 * `lib/gali/gali-production-source.local.json`, which is gitignored, and are reached
 * through `lib/gali/productionSource.ts` by the two things that legitimately need
 * them: the tests, on a machine that has the file, and this generator.
 *
 * Sources, both read-only:
 *   backend   Gali-AWS-backend  @ {BACKEND_COMMIT}
 *   frontend  Gali-frontend     @ {FRONTEND_COMMIT}
 *
 * `docs/gali-ground-truth.md` records the provenance of each value - file and line -
 * and lists explicitly what the Gali repos do NOT state. Nothing in this module is
 * inferred: a value the repos are silent about is absent here rather than guessed.
 *
 * GENERATED by scripts/generate_gali_constants.py. Do not hand-edit: run the script,
 * which reads the values back out of Gali.
 */

'''

    body: list[str] = []
    add = body.append

    add("/** AWS region. `shared/shared/config.py:14`, `scripts/ingest_kb.py:34`. */\n")
    add("export const GALI_REGION: string = 'eu-west-1';\n\n")

    add('''/**
 * Data source type on the ingest path (`scripts/ingest_kb.py:222`). The *type* is a
 * shape the factory has to support; the two data source *ids* are production values
 * and are not here - see `lib/gali/productionSource.ts`.
 */
''')
    add("export const GALI_DATA_SOURCE_TYPE: string = 'CUSTOM';\n\n")

    add('''/**
 * Retrieval and inference settings. All three are environment-variable defaults in
 * `shared/shared/config.py:27,34,35`; neither `template.yaml` nor `samconfig.toml`
 * overrides them, so these are the values production runs with.
 */
''')
    add("export const GALI_RETRIEVAL_TOP_K: number = 5;\n")
    add("export const GALI_GENERATION_MAX_TOKENS: number = 4096;\n")
    add("export const GALI_GENERATION_TEMPERATURE: number = 0.3;\n\n")

    add(
        "/** Query transformation, chosen over Bedrock's default rewriter. "
        "`functions/chat/app.py:123`. */\n"
    )
    add("export const GALI_QUERY_TRANSFORMATION_TYPE: string = 'QUERY_DECOMPOSITION';\n\n")

    add('''/**
 * Bedrock RetrieveAndGenerate hard-caps `textPromptTemplate` at 4096 characters and
 * requires the placeholder. Gali asserts both at import time
 * (`shared/shared/prompt.py:406-416`) - which is where ADR 0016 got the number.
 *
 * Contested: the service model declares 4000. See `QUESTIONS.md` Q43. The factory's
 * own authoring budget is lower again and is NOT this constant - this is the service
 * limit as Gali asserts it.
 */
''')
    add("export const BEDROCK_RAG_PROMPT_TEMPLATE_LIMIT: number = 4096;\n")
    add("export const BEDROCK_SEARCH_RESULTS_PLACEHOLDER: string = '$search_results$';\n\n")

    add('''/**
 * The five documentation parts (`shared/shared/prompt.py:21-288`) and the join that
 * builds `SYSTEM_PROMPT` at `shared/shared/prompt.py:293`. The separator is the empty
 * string: every part carries its own trailing newlines.
 *
 * The part TEXT is a production value and is not in this file. What is here is the
 * order and the separator, which is what `composeSystemPrompt` needs.
 */
''')
    add("export type GaliSystemPromptPartName =\n")
    add("  | 'identity'\n  | 'language'\n  | 'voice'\n  | 'rules'\n  | 'formatAndFlags';\n\n")
    add("export const GALI_SYSTEM_PROMPT_PART_ORDER: readonly GaliSystemPromptPartName[] = [\n")
    for name in PART_ORDER:
        add(f"  '{name}',\n")
    add("] as const;\n\n")
    add("export const GALI_SYSTEM_PROMPT_SEPARATOR: string = '';\n\n")

    add('''/**
 * The triage classifier: one Bedrock `Converse` call per turn, made BEFORE retrieval
 * (`shared/shared/redflag_classifier.py:213-247`, called at `functions/chat/app.py:416`).
 * Its prompt is locked at commit a635c2e (2026-07-05) - the last commit to touch that
 * file, and the commit the validation changelog names as the locked prompt. The prompt
 * itself is a production value and is not in this file.
 *
 * Any API error, empty response, or unparseable label resolves to `ER`, so a missed
 * classification can never suppress an escalation.
 */
''')
    add(
        "export const GALI_TRIAGE_TIERS: readonly string[] = "
        "['ER', 'CLARIFY_ER', 'SOFT', 'EXPLAIN'] as const;\n"
    )
    add("export const GALI_TRIAGE_FAIL_SAFE_TIER: string = 'ER';\n")
    add("export const GALI_CLASSIFIER_MAX_TOKENS: number = 8;\n")
    add("export const GALI_CLASSIFIER_TEMPERATURE: number = 0;\n")
    add("export const GALI_CLASSIFIER_API: string = 'bedrock-runtime.Converse';\n")
    add("export const GALI_CLASSIFIER_PROMPT_LOCKED_AT: string = 'a635c2e';\n\n")

    add('''/**
 * The chat-history table (`template.yaml:82-105`). The table NAME is a production
 * value and is not here; its shape is, because the shape is what the factory has to
 * be able to create.
 */
''')
    add("export const GALI_CHAT_TABLE_STAGES: readonly string[] = ['dev', 'prod'] as const;\n\n")
    add('''export type GaliKeyType = 'HASH' | 'RANGE';
export type GaliAttributeType = 'S' | 'N';

export interface GaliKeySchemaEntry {
  readonly attributeName: string;
  readonly keyType: GaliKeyType;
  readonly attributeType: GaliAttributeType;
}

/** Composite key. A single-attribute key would not reproduce Gali. */
export const GALI_CHAT_TABLE_KEY_SCHEMA: readonly GaliKeySchemaEntry[] = [
  { attributeName: 'session_id', keyType: 'HASH', attributeType: 'S' },
  { attributeName: 'timestamp', keyType: 'RANGE', attributeType: 'N' },
] as const;

/** TTL attribute name: `ttl`, not `expires_at`. `template.yaml:104`. */
export const GALI_CHAT_TABLE_TTL_ATTRIBUTE: string = 'ttl';

/**
 * Expiry is the NEXT MIDNIGHT in Israel time, not a rolling 24 hours
 * (`shared/shared/history.py:87-91`, `shared/shared/time_utils.py:10`). A turn saved at
 * 23:50 expires ten minutes later, not the next evening.
 */
export const GALI_CHAT_TABLE_TTL_TIMEZONE: string = 'Asia/Jerusalem';
export const GALI_CHAT_TABLE_TTL_RULE: string =
  'next midnight in GALI_CHAT_TABLE_TTL_TIMEZONE';

''')

    add('''/**
 * The 9-key KB document metadata schema (`scripts/ingest_kb.py:41-44`), validated in
 * full before any network call (`scripts/ingest_kb.py:155-198`). This is the real
 * answer to the spec's "data entered in a defined structure, not free text".
 */
''')
    add(r'''export type GaliKbMetadataKey =
  | 'doc_type'
  | 'procedure_type'
  | 'gestational_age_max_weeks'
  | 'topic_tags'
  | 'contains_red_flags'
  | 'contains_emotional_support'
  | 'language'
  | 'source'
  | 'version';

/** Declaration order, as in `SCHEMA_KEYS`. */
export const GALI_KB_METADATA_KEYS: readonly GaliKbMetadataKey[] = [
  'doc_type',
  'procedure_type',
  'gestational_age_max_weeks',
  'topic_tags',
  'contains_red_flags',
  'contains_emotional_support',
  'language',
  'source',
  'version',
] as const;

/** The only optional key; omitted from the payload when absent. */
export const GALI_KB_METADATA_OPTIONAL_KEYS: readonly GaliKbMetadataKey[] = [
  'gestational_age_max_weeks',
] as const;

export type GaliInlineAttributeType = 'STRING' | 'NUMBER' | 'BOOLEAN' | 'STRING_LIST';

/** Bedrock `inlineAttributes` type per key (`scripts/ingest_kb.py:201-214`). */
export const GALI_KB_METADATA_ATTRIBUTE_TYPES: Readonly<
  Record<GaliKbMetadataKey, GaliInlineAttributeType>
> = {
  doc_type: 'STRING',
  procedure_type: 'STRING',
  gestational_age_max_weeks: 'NUMBER',
  topic_tags: 'STRING_LIST',
  contains_red_flags: 'BOOLEAN',
  contains_emotional_support: 'BOOLEAN',
  language: 'STRING',
  source: 'STRING',
  version: 'STRING',
};

/** Fixed values the validator enforces (`scripts/ingest_kb.py:37-39,177-186`). */
export const GALI_KB_METADATA_LANGUAGE: string = 'he';
export const GALI_KB_METADATA_SOURCE: string = 'Wolfson Medical Center';
export const GALI_KB_METADATA_VERSION_DEFAULT: string = '2026-06';
export const GALI_KB_METADATA_VERSION_PATTERN: RegExp = /^\d{4}-\d{2}$/;

/** `topic_tags`: 1-10 trimmed, non-empty, quote-free strings. */
export const GALI_KB_TOPIC_TAGS_MIN: number = 1;
export const GALI_KB_TOPIC_TAGS_MAX: number = 10;
''')

    return header + "".join(body)


def render_length_table(src: GaliSource) -> str:
    """Lengths, not text. What the document is allowed to say about the prompts."""
    values = digested_values(src)
    rows = ["| value | characters |", "| ----- | ---------- |"]
    for name, value in values.items():
        rows.append(f"| `{name}` | {len(value)} |")
    rows.append("")
    rows.append(
        "Digests are in the local source file's `manifest.digests`, not here. A digest "
        "committed next to a redacted value is still a pin against a production string, "
        "and the integrity check it enabled is now done inside the local file - see "
        "`findManifestMismatches` in `lib/gali/productionSource.ts`."
    )
    return "\n".join(rows)


def render_rag_block(src: GaliSource) -> str:
    return REDACTION_NOTICE


def render_classifier_block(src: GaliSource) -> str:
    return REDACTION_NOTICE


def render_part_table(src: GaliSource) -> str:
    """Per-part lengths and trailing-newline counts."""
    py_names = {
        "identity": "_IDENTITY",
        "language": "_LANGUAGE",
        "voice": "_VOICE",
        "rules": "_RULES",
        "formatAndFlags": "_FORMAT_AND_FLAGS",
    }
    rows = [
        "| part | Python name | source lines | chars | trailing newlines |",
        "| ---- | ----------- | ------------ | ----- | ----------------- |",
    ]
    for name in PART_ORDER:
        value = src.parts[name]
        trailing = len(value) - len(value.rstrip("\n"))
        rows.append(
            f"| `{name}` | `{py_names[name]}` | "
            f"`shared/shared/prompt.py:{PART_SOURCE_LINES[name]}` | "
            f"{len(value)} | {trailing} |"
        )
    return "\n".join(rows)


REGIONS: dict[str, Callable[[GaliSource], str]] = {
    "rag-prompt-template": render_rag_block,
    "classifier-system-prompt": render_classifier_block,
    "prompt-part-table": render_part_table,
    "digest-table": render_length_table,
}


def replace_region(document: str, region: str, content: str) -> str:
    """Swap the body between the markers for `region`. Markers must exist."""
    begin = f"<!-- BEGIN GENERATED: {region} -->"
    end = f"<!-- END GENERATED: {region} -->"
    pattern = re.compile(
        re.escape(begin) + r"\n.*?\n" + re.escape(end),
        re.DOTALL,
    )
    replacement = f"{begin}\n{content}\n{end}"
    updated, count = pattern.subn(lambda _match: replacement, document)
    if count != 1:
        raise SystemExit(
            f"Expected exactly one '{region}' GENERATED region in "
            f"{GROUND_TRUTH_PATH}, found {count}. Add the markers first."
        )
    return updated


def read_text(path: str) -> str:
    with io.open(path, encoding="utf-8", newline="") as handle:
        return handle.read().replace("\r\n", "\n")


def write_text(path: str, content: str) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with io.open(path, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(content)


def existing_generated_at(path: str) -> str:
    """The timestamp already in the local file, so --check does not report drift on it.

    Regenerating always produces a new `generatedAt`, and a check that failed for that
    reason would fail every time and teach everyone to ignore it.
    """
    if not os.path.exists(path):
        return ""
    try:
        with io.open(path, encoding="utf-8") as handle:
            document = json.load(handle)
    except (OSError, ValueError):
        return ""
    manifest = document.get("manifest")
    if isinstance(manifest, dict):
        value = manifest.get("generatedAt")
        if isinstance(value, str):
            return value
    return ""


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--gali-backend",
        default=DEFAULT_GALI_BACKEND,
        help="Path to the read-only Gali-AWS-backend checkout",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Verify the outputs match Gali; write nothing; exit 1 on drift",
    )
    args = parser.parse_args()

    src = GaliSource(args.gali_backend)

    generated_at = (
        existing_generated_at(LOCAL_SOURCE_PATH)
        if args.check
        else datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
    )

    constants = render_constants(src)
    local_source = render_local_source(src, generated_at)
    document = read_text(GROUND_TRUTH_PATH)
    for region, render in REGIONS.items():
        document = replace_region(document, region, render(src))

    outputs = (
        (LOCAL_SOURCE_PATH, local_source),
        (CONSTANTS_PATH, constants),
        (GROUND_TRUTH_PATH, document),
    )

    if args.check:
        drifted = [path for path, expected in outputs if read_text(path) != expected]
        for path in drifted:
            print(f"DRIFT: {os.path.relpath(path, REPO_ROOT)}", file=sys.stderr)
        if drifted:
            print(
                "Run scripts/generate_gali_constants.py to regenerate.",
                file=sys.stderr,
            )
            return 1
        print("All three outputs match the Gali source.", file=sys.stderr)
        return 0

    for path, content in outputs:
        write_text(path, content)
        print(f"wrote {os.path.relpath(path, REPO_ROOT)}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
