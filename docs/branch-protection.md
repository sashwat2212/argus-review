# Branch Protection & Required Status Checks

## Overview

This document describes the recommended GitHub branch protection settings for the `main` branch to ensure all code merges into production pass CI.

## Recommended Settings for `main`

Go to: **GitHub repo → Settings → Branches → Add rule → `main`**

### Required Status Checks

Enable **"Require status checks to pass before merging"** and add the following checks:

| Check Name | Description |
|---|---|
| `Lint & Format` | Ruff lint and format checks across all packages |
| `Backend Tests` | Pytest suite against a real PostgreSQL instance |
| `Build Dashboard` | TypeScript compilation and Vite production build |
| `Build & Push API Image` | Docker image successfully builds |

### Other Recommended Settings

| Setting | Value |
|---|---|
| Require a pull request before merging | ✅ Enabled |
| Required approvals | 1 |
| Dismiss stale reviews when new commits are pushed | ✅ Enabled |
| Require branches to be up to date before merging | ✅ Enabled |
| Restrict who can push to matching branches | ✅ (admins / bot only) |
| Allow force pushes | ❌ Disabled |
| Allow deletions | ❌ Disabled |

## GitHub Secrets Required

The CD pipeline (`cd.yml`) requires the following secrets to be set in:
**GitHub repo → Settings → Secrets and variables → Actions**

### CI Secrets (auto-provided)
- `GITHUB_TOKEN` — automatically provided by GitHub Actions

### CD / Production Secrets
| Secret | Description |
|---|---|
| `DEPLOY_HOST` | IP or hostname of the production server |
| `DEPLOY_USER` | SSH username (e.g., `ubuntu`) |
| `DEPLOY_SSH_KEY` | Private SSH key (contents of `~/.ssh/id_rsa`) |
| `DEPLOY_PORT` | SSH port (defaults to 22 if not set) |
| `DATABASE_URL` | Production PostgreSQL connection string |
| `REDIS_URL` | Production Redis connection string |
| `SECRET_KEY` | Strong random string for JWT signing |
| `GITHUB_CLIENT_ID` | GitHub OAuth App Client ID |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth App Client Secret |
| `GITHUB_TOKEN_PROD` | Fine-grained GitHub PAT for posting PR comments |
| `GITHUB_WEBHOOK_SECRET` | Webhook signing secret |
| `ANTHROPIC_API_KEY` | Anthropic API key for production LLM |

## GitHub Environment: `production`

The `cd.yml` workflow uses a GitHub **Environment** named `production` for an additional deployment gate.

To configure this:
1. Go to **Settings → Environments → New environment**
2. Name it `production`
3. Enable **"Required reviewers"** and add yourself or your team
4. This ensures every production deploy requires a manual approval

## Generating an SSH Key for Deployment

```bash
# On your local machine
ssh-keygen -t ed25519 -C "argus-deploy" -f ~/.ssh/argus_deploy

# Copy public key to the server
ssh-copy-id -i ~/.ssh/argus_deploy.pub user@your-server

# Add private key contents to GitHub Secret DEPLOY_SSH_KEY
cat ~/.ssh/argus_deploy
```
