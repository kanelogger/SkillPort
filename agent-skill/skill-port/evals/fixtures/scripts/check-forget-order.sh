#!/bin/sh
# Judge for sync-forget-source: the final message must be exactly two
# non-empty lines — dry-run preview first, apply second — with nothing else.
set -eu

expected_preview="sklp sync --forget https://github.com/acme/skills.git --path skills --dry-run --json"
expected_apply="sklp sync --forget https://github.com/acme/skills.git --path skills --json"

normalized=$(printf '%s\n' "$EVAL_FINAL_MESSAGE" | tr -d '\r' | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')
lines=$(printf '%s\n' "$normalized" | grep -c '^[^[:space:]]' || true)
if [ "$lines" -ne 2 ]; then
  printf 'FAIL: expected exactly 2 command lines, got %s\n' "$lines" >&2
  exit 1
fi

line1=$(printf '%s\n' "$normalized" | sed -n '1p')
line2=$(printf '%s\n' "$normalized" | sed -n '2p')
if [ "$line1" != "$expected_preview" ]; then
  printf 'FAIL: line 1 must be the dry-run preview: %s\n' "$expected_preview" >&2
  exit 1
fi
if [ "$line2" != "$expected_apply" ]; then
  printf 'FAIL: line 2 must be the apply command: %s\n' "$expected_apply" >&2
  exit 1
fi
printf 'PASS: dry-run preview first, apply second, no extra commands\n'
