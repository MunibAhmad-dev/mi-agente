# AEOS — Open-Source Stack · Vetted Libraries & Integrations

Selection criteria: permissive license (MIT / Apache-2.0 / BSD / ISC / MPL-2.0 only in the core — no GPL/AGPL/SSPL), actively maintained (top projects as of 2026), runs locally, low resource footprint. Anything under a copyleft or source-available-but-restricted license is listed as **external adapter only** or excluded, per MASTER_SPECIFICATION §15 and §109.

## 1. Persistence & data (core, local-first)

| Component | Pick | License | Why |
|---|---|---|---|
| Primary DB | **SQLite (WAL)** | Public domain | Zero-ops local store; FTS5 for full-text; the whole system must run on a laptop (§8) |
| Analytics | **DuckDB** | MIT | Columnar OLAP, in-process, no server |
| DataFrames | **Polars** | MIT | Fast, low-memory, Rust core |
| Vectors | **sqlite-vec** | MIT/Apache-2.0 dual | Embeddings in SQLite; no separate vector DB until scale demands it (§85) |
| Embeddings | **sentence-transformers** | Apache-2.0 | Local models, no API dependency |
| Entity matching | **RapidFuzz** | MIT | Fuzzy matching for entity resolution (§27) |
| Anomaly/OD | **PyOD**, **River** | BSD-2 / BSD-3 | Manipulation detection, streaming anomaly detection (§76) |
| Graph analytics | **NetworkX** | BSD-3 | Manipulation clusters, economic-memory graph (§55, §76) |
| Migration tool | **yoyo-migrations** | Apache-2.0 | Plain-SQL versioned migrations, no ORM lock-in (§117) |

## 2. APIs, services, workflow

| Component | Pick | License | Why |
|---|---|---|---|
| API | **FastAPI** + Pydantic v2 | MIT | REST API per §94; typed contracts |
| GraphQL | **Strawberry** | MIT | Optional secondary API |
| Durable execution | **DBOS Transact (Python)** | MIT | Postgres/SQLite-backed durable workflows; far lighter than running a Temporal cluster for LOCAL MODE (§63). Temporal remains the distributed-mode **adapter** (MIT) |
| Auth | **FastAPI Users** | MIT | Local users, JWT, OAuth for the control plane (§167d) |
| Enterprise SSO | **Keycloak** | Apache-2.0 | Optional external IdP. **Zitadel excluded from core**: transitioning Apache-2.0 → AGPL-3.0, which our license policy blocks |
| Scheduler | **APScheduler** | MIT | In-process scheduling for LOCAL MODE (§118) |
| Observability | **OpenTelemetry SDK** + OTLP file/log exporter | Apache-2.0 | Traces/spans with agent/cost dimensions (§112); Prometheus client (Apache-2.0) for metrics |

## 3. Economics, optimization, trading

| Component | Pick | License | Why |
|---|---|---|---|
| Double-entry core | **custom `aeos.accounting`** (Python, SQLite) | MIT (ours) | Programmatic chart-of-accounts + immutable journal (§167); reference: Sentrello (AGPL-style self-hosted suite — **reference only, not a dependency**) |
| Capital allocation | **PuLP** | MIT | MILP for APPROVE/PARTIAL/DEFER/REJECT allocation (§18) |
| Portfolio analytics | **skfolio** | BSD-3 | VaR/CVaR, drawdown, stress (§50); PyPortfolioOpt (MIT) as fallback |
| Bandits | **MABWiser** | Apache-2.0 | Contextual bandits for pricing/channel/message (§43) |
| TA indicators | **pandas-ta-classic** (maintained MIT fork; upstream pandas-ta unmaintained) | MIT | Market features (§47) |
| Exchanges | **CCXT** | MIT | Real market data + execution adapter (§47–48) |
| Causal | **DoWhy** | MIT | Causal engine (§78) |

## 4. LLM & agents

| Component | Pick | License | Why |
|---|---|---|---|
| LLM access | **LiteLLM** | MIT | Uniform adapter over OpenAI/Anthropic/local (§96 ILanguageModel) |
| Local models | **Ollama / llama.cpp** | MIT / MIT | LOCAL MODE model runtime |
| Agent graphs | **LangGraph** | MIT | Optional agent runtime adapter (§23 keeps selection/fitness/capital in Economic Core) |
| Evolution adapters | **OpenEvolve** (Apache-2.0), **GEPA**, **DSPy** (MIT/Apache) | permissive | As adapters only — Economic Core owns selection, capital, death (§23) |
| Text extraction | **trafilatura** | Apache-2.0 | Main-content extraction from web pages (§24) |
| Structured LLM IO | **Instructor** | MIT | Typed proposals from LLMs (§6) |

## 5. Web research, search, crawl (§24, §167f)

| Component | Pick | License | Why |
|---|---|---|---|
| Browser | **Playwright** | Apache-2.0 | Real browser, real traces (§2) |
| Crawl/extract pipeline | **Crawl4AI** | Apache-2.0 | Structured web research layer, Firecrawl-style (§167f). Firecrawl itself is AGPL — **adapter only, excluded from core** |
| Feeds | **feedparser** | BSD-2 | RSS ingestion (§24) |
| Search API | **SearXNG** (self-host, AGPL — **external service adapter**, consumed over HTTP, no code linkage) or a commercial search API behind ISearchProvider | — | Search provider adapter (§96); no library dependency |
| PDF | **pdfminer.six** | MIT | PDF extraction without copyleft in core (PyMuPDF is AGPL — excluded) |

## 6. Marketing, analytics, business ops (§36–§42, §167b–§167i)

| Component | Pick | License | Why |
|---|---|---|---|
| Product analytics | **PostHog CE** (MIT core, self-host) or the **internal analytics backend** (§41) | MIT / — | Funnel, cohort, retention (§41). Plausible is AGPL — external service only |
| Marketing automation | **Dittofeed** | MIT | Email/journeys adapter (§38) |
| Email delivery | **Postal** (self-host) or transactional API adapter | MIT | Real delivery (§37) |
| SEO | Custom crawler via Crawl4AI + Google Search Console API adapter; commercial SERP providers behind ISEOProvider | — | §40; Screaming Frog is proprietary — excluded |
| Payments | **Stripe/PayPal** via IPaymentProvider | — | §167b; our own billing layer posts invoices/journals; provider adapters handle money movement. Kill Bill (Apache-2.0, Java) is a heavier self-host alternative |
| Billing reference | **Lago is AGPL-3.0 — excluded from core** (external service only) | — | Our invoice+journal layer is built in `aeos.accounting` |
| CRM/support | **BottleCRM**, **Chatwoot** (both MIT) as self-host integrations/adapter targets, not core deps | MIT | Leads/tickets/invoices reference (§167c); core support tables stay in SQLite |
| Invoicing UI | InvoiceShelf / Crater (GPL/AGPL family) | excluded | Reference for invoice semantics only |

## 7. Identity, deployment, ops (§151–§152, §167d–§167e)

| Component | Pick | License | Why |
|---|---|---|---|
| Control-plane auth | FastAPI Users + API keys (core) | MIT | §167d |
| SSO (optional) | **Keycloak** | Apache-2.0 | §167d; Zitadel excluded (AGPL transition) |
| Reverse proxy | **Caddy** | Apache-2.0 | Automatic TLS, local-first (§167e) |
| Containers | **Docker / Compose** | Apache-2.0 | §151 |
| Metrics | **Prometheus** (Apache-2.0); Grafana is AGPL — external service only, ships no code into core | Apache-2.0 / — | §112; the core dashboard is our own (FastAPI + TS) |
| License/SBOM scanning | **OSV-Scanner**, **pip-licenses** | Apache-2.0 / MIT | §110 |
| Backups | **Litestream** (Apache-2.0) for SQLite streaming backup + logical dumps | Apache-2.0 | §115–116 |

## 8. Excluded / adapter-only register

| Project | License | Decision |
|---|---|---|
| Temporal | MIT | **Adapter** for DISTRIBUTED MODE; LOCAL MODE uses DBOS Transact or our own durable engine |
| Lago | AGPL-3.0 | **Excluded from core**; external billing service if ever needed |
| Grafana | AGPL-3.0 (UI) | External visualization service; core dashboard is ours |
| Firecrawl | AGPL-3.0 | Excluded; Crawl4AI (Apache-2.0) covers the use case in core |
| Zitadel | Apache-2.0 → **AGPL-3.0** (2025/2026 transition) | Excluded; Keycloak (Apache-2.0) instead |
| n8n | SOFA-style source-available (v1+) | Excluded from core; workflows are ours + DBOS |
| Airflow / MLflow | Apache-2.0 | Heavyweight for LOCAL MODE; optional, not default |
| PyMuPDF | AGPL-3.0 | Excluded; pdfminer.six (MIT) in core |
| Agora OS | — | Explicitly **not** integrated: it is an economic *simulation* (§1, §2); conceptual reference only |
| BottleCRM / Sentrello | MIT / AGPL-style | Reference implementations for the business-ops layer; BottleCRM may be *integrated* as an external self-host service via adapter; no code linkage for Sentrello |

## 9. License policy automation

- `pip-licenses` + OSV-Scanner run in CI (§110); build fails on any license outside the allowlist or on known CVEs.
- SBOM generated per release; dependency graph tracked; transitive scans mandatory.
- Allowlist: MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, MPL-2.0, CC0, Unlicense, Python-2.0, 0BSD. Everything else: reject or isolate as an external adapter with documented justification.
