# OpenAI laboratory document assistant

1. Put your OpenAI API key in the project root `neo_latest/.env`:

   ```dotenv
   OPENAI_API_KEY=your-own-key
   OPENAI_MODEL=gpt-4.1-mini
   ```

2. From `neo_latest`, run `docker compose up -d --build backend frontend` after initial installation. After changing only the key, `docker compose up -d --force-recreate backend frontend` applies it without rebuilding.
3. Open the mother portal, **My tests → Choose file**, and select the actual PDF or photograph. A file attached to a Codex chat is not automatically uploaded to this application. The separate **Create demo example** button deliberately generates fictional data.
4. In the review screen, open **ChatGPT assistant**, optionally enter a question, and explicitly consent to sending this document to OpenAI's paid API. Click **Extract with ChatGPT**. Confirmed documents use **Explain with ChatGPT**, which never rewrites verified values.
5. Check every proposed value, unit, date and laboratory interval against the original, then confirm. Only confirmed values appear in Trends. AI explanation text is not a diagnosis or a treatment plan.

The key remains on the backend as a `SecretStr`; no key-entry endpoint, localStorage copy or frontend build variable is used. `.env` is git-ignored. Never paste the key into chat or commit it. The original document is sent only on the explicit action, using the Responses API with `store: false` and a strict JSON schema. This does not make a zero-retention guarantee: consult the provider's data controls for your deployment. No actual OpenAI request can be verified until a valid key is configured.

The prompt treats document content and the user's question as untrusted data, prohibits invented values and reference ranges, and excludes patient identity from structured output. The server validates supported codes, units and plausible values, keeps the original file, and does not overwrite confirmed observations. Provider failures leave existing observations intact. Server audit records contain operation type and counts, not the key or extracted medical values.

Routes: `GET /api/maternal/labs/ai/status`; `POST /api/maternal/labs/documents/{id}/ai` with `{consent:true, language:"ru", mode:"extract"|"explain", question:"..."}`. Mother role only; document ownership checked before any API request.

Official references:
- https://developers.openai.com/api/docs/guides/file-inputs
- https://developers.openai.com/api/docs/guides/structured-outputs
- https://developers.openai.com/api/docs/models/gpt-4.1-mini
