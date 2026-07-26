#!/bin/sh
# Applies repository merge settings and branch protection.
# Run ONCE, after the first CI run has completed (so the "verify" status check
# name is registered with GitHub). Needs gh authenticated with admin rights.
set -eu

REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
DEFAULT_BRANCH=$(gh repo view --json defaultBranchRef -q .defaultBranchRef.name)
OWNER=$(gh repo view --json owner -q .owner.login)

echo ""
echo "=== Repository setup: $REPO ==="
echo ""

# ── Merge strategy (works on every plan) ──────────────────────────────────────
gh repo edit "$REPO" \
  --delete-branch-on-merge \
  --enable-squash-merge \
  --enable-rebase-merge \
  --enable-merge-commit=false
echo "✓ Merge strategy: squash + rebase only, auto-delete head branches"

# ── Branch protection (solo-dev defaults; admin can bypass) ───────────────────
# PR required so CI runs before merge, but 0 approvals so self-merge works.
# "contexts" must match the job name in ci.yml exactly.
PROTECTION_PAYLOAD='{
  "required_status_checks": { "strict": true, "contexts": ["verify"] },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": false,
    "require_code_owner_reviews": false,
    "required_approving_review_count": 0
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_linear_history": false,
  "required_conversation_resolution": false,
  "lock_branch": false,
  "block_creations": false
}'

set +e
PROT_RESP=$(printf '%s' "$PROTECTION_PAYLOAD" | gh api \
  --method PUT "/repos/$REPO/branches/$DEFAULT_BRANCH/protection" --input - 2>&1)
PROT_RC=$?
set -e

if [ "$PROT_RC" -eq 0 ]; then
  echo "✓ Branch protection set on $DEFAULT_BRANCH"
elif echo "$PROT_RESP" | grep -q "Upgrade to GitHub Pro"; then
  cat <<EOF
⚠  Branch protection skipped: private repo on GitHub Free.
   The local pre-push hook is now the only guard against force-push and
   deletion of main — make sure ./scripts/install-hooks.sh is run on every clone.
EOF
else
  echo "✗ Branch protection failed:" >&2
  echo "$PROT_RESP" >&2
  exit 1
fi

# ── CODEOWNERS ────────────────────────────────────────────────────────────────
mkdir -p .github
printf '# All files — repo owner auto-requested for review.\n* @%s\n' "$OWNER" \
  > .github/CODEOWNERS
echo "✓ .github/CODEOWNERS written"

echo ""
echo "Active on $DEFAULT_BRANCH:"
if [ "$PROT_RC" -eq 0 ]; then
  echo "  - CI job 'verify' must pass before merge"
  echo "  - PR required, 0 approvals (self-merge OK)"
  echo "  - No force pushes, no branch deletion"
  echo "  - Admin can bypass for emergencies"
else
  echo "  - Server-side protection NOT applied; pre-push hook is the guard"
fi
echo ""
echo "Next: git add .github/CODEOWNERS && git commit -m 'chore: add CODEOWNERS'"
