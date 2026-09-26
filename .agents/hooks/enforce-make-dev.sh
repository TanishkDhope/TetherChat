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

if echo "$COMMAND" | grep -iqE '(^|[;&|[:space:]])((npm|yarn|pnpm|bun)[[:space:]]+(run[[:space:]]+)?(dev|start)|nodemon)([[:space:]]|$)'; then
  echo '{"decision": "deny", "reason": "Blocked by AGENTS.md: Use '\''make dev'\'' to start the application instead of running dev/start scripts directly."}'
  exit 0
fi

echo '{"decision": "allow"}'
exit 0
