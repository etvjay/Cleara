#!/usr/bin/env bash
set -u
required=(git node pnpm forge cast anvil docker jq curl psql)
failed=0
for tool in "${required[@]}"; do
  if command -v "$tool" >/dev/null 2>&1; then
    printf 'PASS  %-10s ' "$tool"
    "$tool" --version 2>/dev/null | head -n1 || true
  else
    printf 'FAIL  %s missing\n' "$tool"
    failed=1
  fi
done
exit "$failed"
