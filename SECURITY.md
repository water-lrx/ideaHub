# Security and Privacy

IdeaHub is designed as a local-first personal information workspace.

## What is not committed

The repository intentionally ignores:

- `.env` and other local environment files
- `data/*.json`, including private records and staged notes
- Electron build outputs in `dist/` and `release-folders/`
- dependency folders such as `node_modules/`

## API keys

Do not commit real model API keys, Memos tokens, Cloudflare Tunnel tokens, or
other secrets. Use `.env.example` as a template and keep the real `.env` file
local.

## Model calls

Content stays local until the user explicitly tests a model configuration or
submits the buffer for classification. At that point, the selected
OpenAI-compatible model provider receives the submitted text.

## Reporting issues

If you find a privacy or security problem, open a GitHub issue without sharing
private data, logs, tokens, or personal records.
