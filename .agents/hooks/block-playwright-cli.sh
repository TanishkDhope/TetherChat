#!/bin/bash
if ! command -v jq >/dev/null 2>&1; then
  echo '{"decision": "deny", "reason": "Blocked: jq is required by security hooks but is not installed in PATH."}'
  exit 0
fi

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.toolCall.args.CommandLine // empty' 2>/dev/null)
if [ $? -ne 0 ]; then
  echo '{"decision": "deny", "reason": "Blocked: failed to parse toolCall arguments with jq."}'
  exit 0
fi

if echo "$COMMAND" | grep -iqE '(^|[;&|[:space:]])(npx[[:space:]]+(--yes[[:space:]]+|-y[[:space:]]+)?|yarn[[:space:]]+|pnpm[[:space:]]+|bunx[[:space:]]+|python[0-9.]*[[:space:]]+-m[[:space:]]+)?playwright([[:space:]]|$)'; then
  echo '{"decision": "deny", "reason": "Blocked by AGENTS.md: Direct Playwright CLI commands are not allowed. Use the playwright-cli skill to run end-to-end tests instead."}'
  exit 0
fi

echo '{"decision": "allow"}'
exit 0
