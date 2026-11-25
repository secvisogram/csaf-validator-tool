#!/bin/sh
# Rejects a CSAF_VALIDATOR_IMAGE that is not an immutable digest reference.
# Run it before `docker compose up -d`. The value is read like Compose reads it:
# the environment wins, otherwise the last assignment in ./.env is used.
set -eu

name=CSAF_VALIDATOR_IMAGE

fail() {
  {
    printf '%s\n' "$1"
    printf '%s\n' "$name must be an immutable digest reference, for example ghcr.io/secvisogram/csaf-validator-service@sha256:<64 hex characters>."
    printf '%s\n' "Copy .env.example to .env. A tag such as :latest is not accepted."
  } >&2
  exit 1
}

value=${CSAF_VALIDATOR_IMAGE:-}

if [ -z "$value" ] && [ -f .env ]; then
  line=$(grep "^$name=" .env | tail -n 1 || true)
  value=${line#"$name="}
  case $value in
    \"*\") value=${value#\"}; value=${value%\"} ;;
    \'*\') value=${value#\'}; value=${value%\'} ;;
    *)
      value=$(printf '%s' "$value" | sed -e 's/[[:space:]][[:space:]]*#.*$//' -e 's/[[:space:]]*$//')
      ;;
  esac
fi

[ -n "$value" ] || fail "$name is not set."

newline='
'
case $value in
  *"$newline"*) fail "$name must be a single line." ;;
esac

if ! printf '%s\n' "$value" | grep -Eq '^([^[:space:]@/]+/)*[^[:space:]@:/]+@sha256:[0-9a-f]{64}$'; then
  fail "$name is not an immutable digest reference: $value"
fi

printf '%s\n' "$name is a digest reference."
