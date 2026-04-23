# Self-Hosting Argus

## Prerequisites

- Docker and Docker Compose v2
- A GitHub account with a personal access token
- Either Ollama or an Anthropic API key

## Quick Start

```bash
git clone https://github.com/sashwat2212/argus-review.git
cd argus-review
cp .env.example .env
# Edit .env — set GITHUB_TOKEN and either ANTHROPIC_API_KEY or leave ARGUS_LLM_BACKEND=ollama
docker compose up -d
```

The API will be available at `http://localhost:8000`.

## Using Anthropic Claude

Set `ARGUS_LLM_BACKEND=anthropic` and `ANTHROPIC_API_KEY=sk-ant-...` in your `.env`.

## GitHub Webhook Setup

1. Go to your repository → **Settings** → **Webhooks** → **Add webhook**
2. Set **Payload URL** to `https://<your-domain>/webhooks/github`
3. Set **Content type** to `application/json`
4. Set **Secret** to the same value as `GITHUB_WEBHOOK_SECRET` in your `.env`
5. Select **Just the pull request event**
