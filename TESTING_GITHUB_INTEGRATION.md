# GitHub Integration Testing Manual

## Overview

This manual covers end-to-end testing of the Argus Review GitHub integration, which:
1. Receives webhook events when a PR is opened, synchronize, or reopened
2. Fetches the diff from GitHub
3. Runs the multi-agent review pipeline
4. Posts commit status checks (pending → success/failure/error)
5. Posts PR reviews with inline code comments

---

## Prerequisites

### Required Setup
- Docker & Docker Compose running (PostgreSQL, Redis, Ollama or Anthropic)
- GitHub Personal Access Token with `repo` scope (stored in `.env` as `GITHUB_TOKEN`)
- `ngrok` for tunneling localhost webhooks to GitHub
- Python 3.11+ with uv package manager
- Real GitHub repo where you have push access

### Services State
Before testing, verify all services are running:
```bash
# Terminal 1: Start Docker services
docker compose up -d

# Terminal 2: Run API server
uv run uvicorn argus_api.main:app --reload --host 0.0.0.0 --port 8000

# Terminal 3: Run Celery worker
uv run celery -A argus_api.tasks.celery_app worker --loglevel=info

# Terminal 4: (Optional) Run Ollama or use Anthropic
# For Ollama: ollama serve
# For Anthropic: ensure ARGUS_LLM_BACKEND=anthropic and ANTHROPIC_API_KEY is set

# Terminal 5: (Optional) ngrok for webhooks
ngrok http 8000
```

---

## Test Scenarios

### Scenario 1: Manual Webhook Trigger (No Real PR)

**Goal**: Verify webhook signature validation, deduplication, and task queuing work.

**Setup**:
```bash
# Get values from .env
WEBHOOK_SECRET=$(grep GITHUB_WEBHOOK_SECRET /Users/kdn_aisashwat/Documents/argus-review/.env | cut -d= -f2)
GITHUB_TOKEN=$(grep GITHUB_TOKEN /Users/kdn_aisashwat/Documents/argus-review/.env | cut -d= -f2 | tr -d '[:space:]')
REPO="sashwat2212/argus-review"
```

**Test 1a: Valid signature, opened action**
```bash
# Generate HMAC-SHA256 signature
PAYLOAD='{"action":"opened","pull_request":{"number":999,"title":"Test PR","url":"https://api.github.com/repos/sashwat2212/argus-review/pulls/999","base":{"sha":"abc123"},"head":{"sha":"def456"},"body":"Test body"},"repository":{"id":123456,"full_name":"sashwat2212/argus-review","owner":{"login":"sashwat2212"},"default_branch":"main"}}'

SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" -hex | cut -d' ' -f2)
SIGNATURE="sha256=$SIGNATURE"

# Post to webhook
curl -X POST http://localhost:8000/webhooks/github \
  -H "X-Hub-Signature-256: $SIGNATURE" \
  -H "X-GitHub-Event: pull_request" \
  -H "X-GitHub-Delivery: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD"
```

**Expected**:
- HTTP 202 response with `{"status": "queued", "review_id": "...", "task_id": "..."}`
- API logs show webhook accepted
- Celery worker logs show `run_review_task` started
- Database: Review record created with status "pending"

**Test 1b: Duplicate delivery ID (Redis deduplication)**
```bash
DELIVERY_ID=$(uuidgen)

# Same payload, same delivery ID
for i in 1 2 3; do
  curl -X POST http://localhost:8000/webhooks/github \
    -H "X-Hub-Signature-256: $SIGNATURE" \
    -H "X-GitHub-Event: pull_request" \
    -H "X-GitHub-Delivery: $DELIVERY_ID" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD"
  sleep 0.5
done
```

**Expected**:
- First call: `{"status": "queued", ...}`
- Calls 2 & 3: `{"status": "duplicate", "delivery": "..."}`
- Only one Celery task enqueued (check worker logs)

**Test 1c: Invalid signature**
```bash
INVALID_SIG="sha256=0000000000000000000000000000000000000000000000000000000000000000"

curl -X POST http://localhost:8000/webhooks/github \
  -H "X-Hub-Signature-256: $INVALID_SIG" \
  -H "X-GitHub-Event: pull_request" \
  -H "X-GitHub-Delivery: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD"
```

**Expected**: HTTP 401 with `{"detail": "Invalid webhook signature"}`

**Test 1d: Ignored event type (not pull_request)**
```bash
curl -X POST http://localhost:8000/webhooks/github \
  -H "X-Hub-Signature-256: $SIGNATURE" \
  -H "X-GitHub-Event: push" \
  -H "X-GitHub-Delivery: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD"
```

**Expected**: HTTP 202 with `{"status": "ignored", "event": "push"}`

**Test 1e: Ignored PR action (not opened/synchronize/reopened)**
```bash
IGNORED_ACTION_PAYLOAD='{"action":"closed","pull_request":{"number":999,"title":"Test","url":"https://api.github.com/repos/sashwat2212/argus-review/pulls/999","base":{"sha":"abc123"},"head":{"sha":"def456"},"body":""},"repository":{"id":123456,"full_name":"sashwat2212/argus-review","owner":{"login":"sashwat2212"},"default_branch":"main"}}'

curl -X POST http://localhost:8000/webhooks/github \
  -H "X-Hub-Signature-256: $SIGNATURE" \
  -H "X-GitHub-Event: pull_request" \
  -H "X-GitHub-Delivery: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d "$IGNORED_ACTION_PAYLOAD"
```

**Expected**: HTTP 202 with `{"status": "ignored", "action": "closed"}`

---

### Scenario 2: Real PR Integration (With ngrok)

**Goal**: Trigger an actual review via GitHub webhook on a real PR.

**Setup**:
```bash
# Terminal: Start ngrok
ngrok http 8000
# Note the forwarding URL, e.g., https://abcd-12-34-56-78.ngrok-free.dev

# In your GitHub repo (sashwat2212/argus-review):
# 1. Go to Settings → Webhooks → Add webhook
# 2. Payload URL: https://abcd-12-34-56-78.ngrok-free.dev/webhooks/github
# 3. Content type: application/json
# 4. Secret: (copy from GITHUB_WEBHOOK_SECRET in .env)
# 5. Events: "Let me select individual events" → Pull requests
# 6. Active: ✓
# 7. Save
```

**Test 2a: Open a PR with intentional security issues**

```bash
# Create a branch with test code
git checkout -b test/security-issues
cat > test_security.py <<'EOF'
import os
import requests

# Issue 1: Hardcoded secret
AWS_KEY = "AKIA1234567890ABCDEF"

# Issue 2: Disabled SSL verification
resp = requests.get("https://api.example.com", verify=False)

# Issue 3: SQL injection via f-string
user_id = input("ID: ")
query = f"SELECT * FROM users WHERE id = {user_id}"
EOF

git add test_security.py
git commit -m "feat: add security test"
git push origin test/security-issues
```

Then open a PR on GitHub via the web UI.

**Expected**:
- GitHub shows pending commit status (yellow circle) labeled "Argus review in progress…"
- After ~10–30 seconds (depending on LLM):
  - Review comment appears on the PR with score and findings table
  - Inline comments on specific lines with severity emoji + title
  - Commit status updates to ✅ (green) if score ≥ 70, or ❌ (red) if < 70
- Database: Review record with status "completed", score, and Finding records

---

### Scenario 3: Commit Status Lifecycle

**Goal**: Verify pending → success/failure/error state transitions are visible on GitHub.

**Setup**:
```bash
# Use the open PR from Scenario 2, or create a new one
PR_NUMBER=1
REPO="sashwat2212/argus-review"
GITHUB_TOKEN=$(grep GITHUB_TOKEN /Users/kdn_aisashwat/Documents/argus-review/.env | cut -d= -f2 | tr -d '[:space:]')

# Get the head SHA from the PR
SHA=$(curl -s \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/$REPO/pulls/$PR_NUMBER" | python3 -c "import sys,json; print(json.load(sys.stdin)['head']['sha'])")

echo "Testing with SHA: $SHA"
```

**Test 3a: Check pending status during review**
```bash
# Right after triggering a review, check status
curl -s \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/$REPO/commits/$SHA/status" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print('Overall state:', d.get('state'))
print('Statuses:')
for s in d.get('statuses', []):
    print(f'  {s.get(\"context\")}: {s.get(\"state\")} — {s.get(\"description\")}')
"
```

**Expected** (progression):
1. **Pending**: `context: "argus-review", state: "pending", description: "Argus review in progress…"`
2. **Success/Failure** (after ~10–30s):
   - If score ≥ 70: `state: "success", description: "Score 85/100 — 3 finding(s)"`
   - If score < 70: `state: "failure", description: "Score 45/100 — 8 finding(s)"`

**Test 3b: Check error status (simulate task failure)**
```bash
# Manually trigger a failure by sending invalid diff URL in a webhook
INVALID_PAYLOAD='{"action":"opened","pull_request":{"number":998,"title":"Bad URL Test","url":"https://invalid.url/diff","base":{"sha":"abc123"},"head":{"sha":"invalid999"},"body":""},"repository":{"id":123456,"full_name":"sashwat2212/argus-review","owner":{"login":"sashwat2212"},"default_branch":"main"}}'

# (Generate signature and post as in Scenario 1)
# Then check status:
curl -s \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/$REPO/commits/invalid999/status" | python3 -c "
import sys, json
d = json.load(sys.stdin)
for s in d.get('statuses', []):
    if s.get('context') == 'argus-review':
        print(f'State: {s.get(\"state\")} — {s.get(\"description\")}')
"
```

**Expected**: `state: "error", description: "Argus review failed: ..."`

---

### Scenario 4: PR Review Comments with Inline Annotations

**Goal**: Verify that inline comments appear on the correct file + line.

**Setup**: Use a real PR from Scenario 2 with multiple files changed.

**Check**:
```bash
# List all review comments on the PR
REPO="sashwat2212/argus-review"
PR_NUMBER=1
GITHUB_TOKEN=$(grep GITHUB_TOKEN /Users/kdn_aisashwat/Documents/argus-review/.env | cut -d= -f2 | tr -d '[:space:]')

curl -s \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/$REPO/pulls/$PR_NUMBER/comments" | python3 -c "
import sys, json
comments = json.load(sys.stdin)
print(f'Total comments: {len(comments)}')
for c in comments[:5]:  # Show first 5
    print(f'  File: {c.get(\"path\")}:{c.get(\"line\")} | Author: {c.get(\"user\", {}).get(\"login\")} | Body preview: {c.get(\"body\", \"\")[:60]}')
"
```

**Expected**:
- Comments from bot (or your account) on specific files/lines
- Severity emoji in comment body (🔴 critical, 🟠 high, 🟡 medium, 🔵 low, ℹ️ info)
- Finding details: title, description, why it matters, suggested fix

**Test 4b: Verify comment fallback (plain comment)**
If inline comments fail (e.g., line out of range), verify a plain issue comment was posted:
```bash
curl -s \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/$REPO/issues/$PR_NUMBER/comments" | python3 -c "
import sys, json
comments = json.load(sys.stdin)
for c in comments:
    if 'Argus Review' in c.get('body', ''):
        print('Found fallback comment:')
        print(c.get('body', '')[:300])
        break
"
```

---

### Scenario 5: Database State Verification

**Goal**: Verify that Review and Finding records are correctly stored.

**Setup**:
```bash
# Connect to PostgreSQL (via docker)
docker compose exec -T db psql -U argus -d argus -c "SELECT * FROM reviews ORDER BY created_at DESC LIMIT 1 \gx"
```

**Expected output**:
```
-[ RECORD 1 ]--+------------------------------
id             | d6b3c9b0-1234-5678-90ab-cd
repo_id        | <uuid>
trigger_type   | webhook
pr_number      | 1
pr_title       | Test PR title
base_sha       | abc123...
head_sha       | def456...
status         | completed
score          | 75
total_findings | 4
started_at     | 2026-04-21 10:15:30.123456+00
completed_at   | 2026-04-21 10:15:45.678901+00
```

**Check findings**:
```bash
docker compose exec -T db psql -U argus -d argus -c "SELECT file_path, line_start, line_end, severity, category, confidence, title FROM findings WHERE review_id = '<review-id>' LIMIT 5 \gx"
```

**Expected output**:
```
-[ RECORD 1 ]--+-----------------------------------------------
file_path      | test_security.py
line_start     | 5
line_end       | 5
severity       | high
category       | secrets
confidence     | 0.95
title          | Hardcoded AWS credentials detected

-[ RECORD 2 ]--+-----------------------------------------------
file_path      | test_security.py
line_start     | 8
line_end       | 8
severity       | high
category       | security
confidence     | 0.85
title          | SSL verification disabled
```

---

### Scenario 6: Error Handling & Retry Logic

**Goal**: Verify task retry on transient failures.

**Test 6a: Temporary GitHub API outage**
```bash
# Stop Docker briefly to simulate network failure
docker compose pause

# Trigger a webhook (API will queue it, worker will fail)
# Then resume services
docker compose unpause

# After ~60 seconds, Celery should auto-retry (check worker logs)
```

**Expected**:
- First attempt: fails with network error
- Worker logs show `Retrying task ... (attempt 1/3)`
- After 60s backoff: retries and succeeds
- Review eventually completes (status "completed")

**Test 6b: Invalid diff URL**
```bash
# Trigger webhook with URL that returns 404
PAYLOAD='{"action":"opened","pull_request":{"number":997,"title":"404 Test","url":"https://api.github.com/repos/fake/repo/pulls/999","base":{"sha":"abc123"},"head":{"sha":"def456"},"body":""},"repository":{"id":123456,"full_name":"sashwat2212/argus-review","owner":{"login":"sashwat2212"},"default_branch":"main"}}'

# (Generate signature and post)
```

**Expected**:
- Celery task fails with HTTP 404
- After 3 retries (3 × 60s = 3 minutes), task is dead-lettered
- Database: Review status = "failed"
- Commit status: "error"

---

### Scenario 7: LLM Backend Switching

**Goal**: Verify review works with both Ollama and Anthropic.

**Test 7a: Switch to Ollama**
```bash
# Edit .env
ARGUS_LLM_BACKEND=ollama
ARGUS_OLLAMA_BASE_URL=http://localhost:11434
ARGUS_OLLAMA_MODEL=codellama:13b

# Restart API + worker
# Trigger a webhook → verify findings use CodeLlama model
```

**Test 7b: Switch to Anthropic**
```bash
# Edit .env
ARGUS_LLM_BACKEND=anthropic
ANTHROPIC_API_KEY=sk-ant-...
ARGUS_ANTHROPIC_MODEL=claude-haiku-4-5

# Restart API + worker
# Trigger a webhook → verify findings use Claude model
```

**Expected**:
- Both produce findings (may differ slightly in severity/confidence)
- Commit status and PR comments post successfully
- Celery logs show correct LLM backend in use

---

### Scenario 8: Concurrent Reviews

**Goal**: Verify multiple PRs can be reviewed concurrently without race conditions.

**Test 8a: Trigger 3 reviews in rapid succession**
```bash
for i in 1 2 3; do
  PAYLOAD="{\"action\":\"opened\",\"pull_request\":{\"number\":$(($i+1000)),\"title\":\"Concurrent PR $i\",\"url\":\"https://localhost:8001/test.diff\",\"base\":{\"sha\":\"abc123\"},\"head\":{\"sha\":\"def45$i\"},\"body\":\"\"},\"repository\":{\"id\":123456,\"full_name\":\"sashwat2212/argus-review\",\"owner\":{\"login\":\"sashwat2212\"},\"default_branch\":\"main\"}}"
  
  # Generate signature and post
  # (See Scenario 1 for signature generation)
  curl -X POST http://localhost:8000/webhooks/github -H ... -d "$PAYLOAD"
  sleep 0.5
done
```

**Expected**:
- 3 reviews queued (check `/api/v1/reviews` endpoint)
- Worker processes all 3 concurrently (or sequentially if only 1 worker process)
- All 3 complete successfully with no database conflicts
- Database: 3 Review + 3×N Finding records

---

### Scenario 9: API Endpoints

**Goal**: Verify the review API endpoints work.

**Test 9a: List reviews**
```bash
curl -s http://localhost:8000/api/v1/reviews | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f'Total reviews: {d.get(\"total\")}')
for r in d.get('reviews', [])[:3]:
    print(f'  {r[\"id\"][:8]}... — {r[\"status\"]} — score: {r.get(\"score\")}')
"
```

**Expected**: List of reviews with pagination info

**Test 9b: Get a specific review with findings**
```bash
REVIEW_ID="<from previous test>"
curl -s "http://localhost:8000/api/v1/reviews/$REVIEW_ID" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f'Status: {d.get(\"status\")} | Score: {d.get(\"score\")}')
print(f'Findings: {len(d.get(\"findings\", []))}')
for f in d.get('findings', [])[:2]:
    print(f'  - {f[\"title\"]} ({f[\"severity\"]})')
"
```

**Expected**: Review with all findings populated

**Test 9c: Mark a finding as resolved**
```bash
REVIEW_ID="<from previous test>"
FINDING_ID="<from review>"

curl -s -X PATCH \
  -H "Content-Type: application/json" \
  "http://localhost:8000/api/v1/reviews/$REVIEW_ID/findings/$FINDING_ID" \
  -d '{"resolved": true}'
```

**Expected**: HTTP 200, finding marked as resolved in response

---

## Troubleshooting

### Issue: Review doesn't complete (stuck in "running")

**Symptoms**:
- Commit status never updates from "pending"
- Celery worker shows no logs

**Diagnosis**:
```bash
# Check if Celery worker is running
ps aux | grep celery

# Check if Redis is accessible
redis-cli ping

# Check database connection
docker compose exec db psql -U argus -d argus -c "SELECT 1"
```

**Fix**:
- Restart Celery worker: `uv run celery -A argus_api.tasks.celery_app worker --loglevel=info`
- Restart Redis: `docker compose restart redis`

---

### Issue: GitHub API returns 401 (Unauthorized)

**Symptoms**:
- Review completes but PR comment never posts
- Celery logs show `401 {"message": "Bad credentials"}`

**Diagnosis**:
```bash
# Verify token scopes
GITHUB_TOKEN=$(grep GITHUB_TOKEN .env | cut -d= -f2 | tr -d '[:space:]')
curl -s -H "Authorization: Bearer $GITHUB_TOKEN" https://api.github.com/user | python3 -c "
import sys, json
d = json.load(sys.stdin)
print('User:', d.get('login'))
print('Scopes:', d.get('bio'))  # Actually from X-OAuth-Scopes header
"
```

**Fix**:
- Regenerate token with `repo` scope
- Update `.env` with new token
- Restart API + worker

---

### Issue: PR comments fail but status posts succeed

**Symptoms**:
- Commit status updates correctly
- PR comment never appears
- Celery logs show HTTP 422 or 403 on `/pulls/{pr}/reviews`

**Diagnosis**:
- Line numbers in findings may be out of range
- Commit not yet visible on GitHub (race condition with push)

**Fix**:
- Fallback mechanism auto-posts plain comment (no inline annotations)
- Check issue comments instead of review comments

---

### Issue: Score calculation seems wrong

**Symptoms**:
- Review shows 3 high-severity findings but score is 95/100

**Explanation**:
- Score = 100 - sum(severity_deductions)
- High = 10 points deduction
- 3 × 10 = 30 deduction
- 100 - 30 = 70 (not 95)

**Check**: Ensure only findings passing confidence threshold are counted.

---

## Cleanup

**After testing**, remove test files and reset PR:
```bash
# Delete test branch
git branch -D test/security-issues
git push origin -d test/security-issues

# Close test PR on GitHub (web UI)

# Clean up test data from database (optional)
docker compose exec -T db psql -U argus -d argus -c "
DELETE FROM findings WHERE review_id IN (
  SELECT id FROM reviews WHERE pr_number IN (997, 998, 999)
);
DELETE FROM reviews WHERE pr_number IN (997, 998, 999);
"
```

---

## Checklist

- [ ] All 9 scenarios pass
- [ ] Commit status lifecycle works (pending → success/failure/error)
- [ ] PR review comments appear with correct severity emoji
- [ ] Database records match review output
- [ ] Retry logic works on transient failures
- [ ] Both Ollama and Anthropic backends work
- [ ] Concurrent reviews don't cause race conditions
- [ ] API endpoints return correct data
- [ ] Error states are handled gracefully

---

## Next Steps

1. **Production Deployment**: Use `docker compose -f docker-compose.prod.yml` with real secrets
2. **Real GitHub Org**: Set up webhook on all repos in an org, monitor ngrok traffic
3. **Dashboard Integration**: Connect React dashboard to `/api/v1/reviews` endpoint for analytics
4. **Monitoring**: Add Prometheus metrics to track review latency, LLM API usage
