#!/bin/sh
set -eu
cd "$(git rev-parse --show-toplevel)"
git config core.hooksPath .githooks
echo "Hooks installed: pre-commit (compat lint), commit-msg (Conventional Commits),"
echo "pre-push (owner-lock + protected-branch guard + full check)."
