#!/usr/bin/env bash
# Prove the environment rather than describe it.
#
# Written 2026-07-24 because two separate sessions each burned time re-deriving
# which tree was live, and one earlier audit reviewed a deleted one. Everything
# here is a measurement, not a claim.
#
#   ./verify.sh          checks only
#   ./verify.sh --test   also runs both suites (slower)

set -uo pipefail
cd "$(dirname "$0")"

FRONTEND="$(pwd)"
ENGINE="$(cd ../atelier/atelier-engine 2>/dev/null && pwd || echo "")"
API="${NEXT_PUBLIC_ATELIER_API:-http://127.0.0.1:8000}"
ok=0; bad=0
say()  { printf '  %-38s %s\n' "$1" "$2"; }
pass() { say "$1" "OK — $2";      ok=$((ok+1)); }
fail() { say "$1" "NEEDS WORK — $2"; bad=$((bad+1)); }

echo "── trees ─────────────────────────────────────────────"
say "frontend" "$FRONTEND"
[ -n "$ENGINE" ] && say "engine" "$ENGINE" || fail "engine" "../atelier/atelier-engine not found"

# The check that matters most: is :3000 actually serving THIS directory?
pid="$(lsof -tiTCP:3000 -sTCP:LISTEN 2>/dev/null | head -1)"
if [ -z "$pid" ]; then
  say "port 3000" "not running (start with: pnpm dev)"
else
  cwd="$(lsof -p "$pid" 2>/dev/null | awk '$4=="cwd"{print $NF}')"
  [ "$cwd" = "$FRONTEND" ] \
    && pass "port 3000" "serving this tree" \
    || fail "port 3000" "serving $cwd — NOT this tree; that tree is stale"
fi

echo
echo "── services ──────────────────────────────────────────"
curl -fsS -m 5 "$API/healthz" >/dev/null 2>&1 \
  && pass "engine :8000" "healthy" \
  || fail "engine :8000" "down — .venv/bin/uvicorn api.app.main:app --port 8000 --reload"

ready="$(curl -fsS -m 10 "$API/readyz" 2>/dev/null)"
head="$(printf '%s' "$ready" | sed -n 's/.*"migration_head":"\([^"]*\)".*/\1/p')"
appl="$(printf '%s' "$ready" | sed -n 's/.*"migration_applied":"\([^"]*\)".*/\1/p')"
if [ -n "$head" ] && [ "$head" = "$appl" ]; then pass "migrations" "at head ($head)"
elif [ -n "$ready" ];                        then fail "migrations" "applied=$appl head=$head — run: cd api && alembic upgrade head"
else                                              fail "migrations" "engine did not answer /readyz"
fi

echo
echo "── working trees ─────────────────────────────────────"
for d in "$FRONTEND" "$ENGINE"; do
  [ -z "$d" ] && continue
  n="$(cd "$d" && git status --porcelain 2>/dev/null | wc -l | tr -d ' ')"
  b="$(cd "$d" && git rev-parse --abbrev-ref HEAD 2>/dev/null)"
  [ "$n" = "0" ] \
    && pass "$(basename "$d")" "clean on $b" \
    || say  "$(basename "$d")" "$n uncommitted file(s) on $b — may be ANOTHER session; commit scoped"
done

if [ "${1:-}" = "--test" ]; then
  echo
  echo "── suites ────────────────────────────────────────────"
  npm test >/tmp/atelier-fe.log 2>&1 \
    && pass "frontend tests" "$(grep -c '^✔' /tmp/atelier-fe.log) passing" \
    || fail "frontend tests" "see /tmp/atelier-fe.log"
  npx next lint >/tmp/atelier-lint.log 2>&1
  e="$(grep -c 'Error:' /tmp/atelier-lint.log || true)"
  [ "$e" = "0" ] && pass "frontend lint" "0 errors" || fail "frontend lint" "$e error(s)"
  if [ -n "$ENGINE" ]; then
    # -p no:randomly: the suite is order-dependent and shares a database.
    (cd "$ENGINE" && .venv/bin/python -m pytest tests/ api/tests/ -q -p no:randomly) \
      >/tmp/atelier-be.log 2>&1 \
      && pass "engine tests" "$(tail -1 /tmp/atelier-be.log | cut -c1-40)" \
      || fail "engine tests" "see /tmp/atelier-be.log"
  fi
fi

echo
echo "──────────────────────────────────────────────────────"
echo "  $ok verified · $bad need attention"
echo "  Next: ../atelier/atelier-engine/ROADMAP.md (governing plan, status table at top)"
[ "$bad" -eq 0 ]
