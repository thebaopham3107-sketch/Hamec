#!/bin/sh
# Goi lark-cli voi profile rieng cua NGHE (dat LARK_CLI_PROFILE trong .env).
# Dung khi may da co lark-cli dang nhap app khac lam mac dinh.
# Bat: dat LARK_CLI_BIN=<duong-dan>/scripts/lark-cli-profile.sh trong .env
BIN="${LARK_CLI_REAL:-$(command -v lark-cli || echo "$HOME/.local/bin/lark-cli")}"
if [ -n "$LARK_CLI_PROFILE" ]; then exec "$BIN" --profile "$LARK_CLI_PROFILE" "$@"; fi
exec "$BIN" "$@"
