## Global Defaults (Always On)
- **Planning = Codex plan + ST thoughts**: Keep the authoritative plan in Codex `update_plan`. Use Sequential‑Thinking MCP for structured thoughts per stage (not as the plan store).
- **Docs lookup = context7**: pull short, dated snippets from official sources/best-practice docs for each claim. If unavailable, log the fallback.
- **Search = Codanna first**: prefer Codanna MCP discovery tools (`semantic_search_docs`, `semantic_search_with_context`, `find_symbol`) for evidence sweeps; fall back to `ripgrep` when Codanna is unavailable or insufficient. Respect repo ignores and log the fallback method used.
- **Discovery/Context = Codanna MCP**: use Codanna for symbol-aware context (`find_symbol`, `get_calls`, `find_callers`, `analyze_impact`) during analysis. Advisors still propose diffs; Codex executes per CODEX.md.
- **Metadata accuracy**: Flag hallucinated Sequential Thinking metadata—`files_touched`, `tests_to_run`, `dependencies`, `risk_level`, `confidence_score`, etc. should stay empty/default unless there is real evidence.

## Standard Flow
1) **Evidence sweep (Codanna ➜ ripgrep)** → prefer Codanna tools (`semantic_search_docs`, `semantic_search_with_context`, `find_symbol`, `get_calls`, `find_callers`, `analyze_impact`) to enumerate where code/config/tests live. If Codanna is unavailable or insufficient for the task, use `ripgrep` and record the fallback used.
2) **Docs check (context7 ➜ MCP)** → start with Context7 (title + link + date). When Context7 lacks the needed source, call the Fetch MCP server via `mcp__fetch__fetch`, constrain `max_length` (default ≤ 20000 chars), and log URL, timestamp, format (HTML/JSON/Markdown/TXT), `start_index`, and chunk count in your response plus `docs/DECISIONS.md`. Only fetch publicly reachable URLs; escalate before touching authenticated or private targets.
3) **Plan (Codex + ST)** → Keep the plan in Codex via `update_plan`. Use Sequential‑Thinking MCP to capture Scoping→Review thoughts in short, structured entries. Produce 3–7 steps, success checks, and rollback notes. Do not use ST as a plan store.
   - Confirm the agent keeps logging Scoping → Research & Spike → Implementation → Testing → Review thoughts and leaves `next_thought_needed=true` until that Review entry is recorded; flag any run that flips it to `false` prematurely.

## Codanna + Sequential‑Thinking workflow
- **Roles**
  - **Codanna** provides discovery/context via semantic search, symbol lookups, and impact analysis.
  - **Sequential‑Thinking MCP** records structured thoughts; keep entries short (stage + metadata) and obey `guidance.recommendedNextThoughtNeeded`.
  - **Codex `update_plan`** is the authoritative plan; ST is not the planning store.
- **Tool priority (Codanna)**
  - **Tier 1**: `semantic_search_with_context`, `analyze_impact` (default limit=5, threshold≈0.5, omit `lang` unless noise is high; raise limit to 8–10 when ambiguity persists).
  - **Tier 2**: `find_symbol`, `get_calls`, `find_callers` to confirm call chains and disambiguate symbols.
  - **Tier 3**: `search_symbols`, `semantic_search_docs` for broader sweeps once Tier 1/2 context is captured.
- **Accuracy-first defaults**
  - **Discovery:** prefer `semantic_search_with_context`, summarize each key symbol, chain into `analyze_impact symbol_id:<ID>` before touching public/shared code, and broaden the query (lower threshold or raise limit) when context is weak.
  - **Plan:** keep `update_plan` aligned with Codanna findings; add verification/rollback actions for high-risk items.
  - **Thoughts:** include `stage`, `files_touched`, `dependencies`, `tests_to_run`, and `risk_level`; allow stage aliases (e.g., “Planning” → Implementation) and string inputs; keep `next_thought_needed=true` until tests pass and a Review thought is present, then honor `guidance.recommendedNextThoughtNeeded`.
  - **Verification:** cross-check Codanna’s impacted files against the diff, ensure tests cover each high-risk scope, and prefer broader discovery rather than missing context.
- **Workflow**
  1. **Discovery (Codanna)** – run Tier 1 queries using the defaults above, chain into `analyze_impact`, and use Tier 2 lookups to trace usages; capture symbol_ids/results and summarize their implications.
  2. **Plan (Codex)** – update steps via `update_plan`, referencing Codanna context and listing verification/rollback steps when risk warrants it.
  3. **Thoughts (ST)** – log `process_thought` payloads with the required metadata, keeping them concise yet complete, and stop once `guidance.recommendedNextThoughtNeeded` is false after Review.
  4. **Validate/Review** – execute tests, record outcomes, and conclude with a Review thought before closing.
- **ST guidance**
  - Stage aliases and stringified metadata are acceptable; keep entries focused on stage, files, tests, dependencies, and risk.
  - Respect `guidance.recommendedNextThoughtNeeded`; stop issuing follow-ups once it flips to false after Review.
- **Verification guidance**
  - Cross-check impacted files from Codanna’s results against the actual diff; document how tests/rollbacks cover each high-risk area.
  - When context is unclear, prefer broader discovery (lower threshold or higher limit) over assuming coverage.

  ## Plex API Reference (Project-Specific)
When working with Plex Media Server API endpoints in this project:

1. **Official Documentation**: Use Context7 with library ID `/websites/developer_plex_tv_pms` to fetch the latest official Plex API docs.
2. **Local Reference**: See `spec-pack/artifact-9-plex-api-examples.md` for curated JSON response examples specific to this application.
3. **Key Endpoints**:
   - Authentication: `https://plex.tv/api/v2/pins` (OAuth PIN flow)
   - Server Discovery: `https://plex.tv/api/v2/resources` (server list with connections)
   - Library Access: `/library/sections`, `/library/metadata/{key}`
   - Streaming: `/video/:/transcode/universal/start.m3u8` (HLS)
4. **Required Headers**:
   - `Accept: application/json` (responses default to XML otherwise)
   - `X-Plex-Token: {token}` for all authenticated requests
   - Client identification: `X-Plex-Client-Identifier`, `X-Plex-Product`, `X-Plex-Version`
5. **JWT Authentication (as of Sept 2025)**: Plex has implemented JWT with short-lived tokens (7-day expiry). Check official docs for current auth patterns.