# AEOS — Real-World Autonomous Economic AI OS · Master Specification v3.0

Status: single source of truth for scope. Every capability in IMPLEMENTATION_STATUS.md references a section here. No MVP, no simulated production: real providers only in production paths; simulation is confined to tests and fixtures (§§1–3). The system is an autonomous economic organism, not a chatbot (§0, §4, §166).

## 1. Objective

An autonomous platform that observes real information, discovers and ranks real opportunities, spawns and evolves real software agents, executes real-world actions through authorized real integrations, measures real outcomes, accounts for them, evolves its agent population economically (kill / learn / mutate / recombine / reallocate), and repeats the cycle continuously (§0, §2, §4, §162).

The optimizer is EXPECTED ECONOMIC VALUE, adjusted by risk, cost, uncertainty, capital, learning opportunity, liquidity, dependency, survival, optionality and robustness (§5). DO NOTHING, WAIT and REJECT are first-class decisions (§5).

## 2. Non-negotiable principles

- **Reality principle (§138, §80, §81, §139):** only verified external outcomes update REAL_REVENUE / REAL_COST / REAL_CUSTOMERS / REAL_EXECUTION / REAL_PNL. Predictions, estimates, hypotheses and simulations are recorded as such. If no real data exists, the system reports `NO_REAL_DATA_AVAILABLE`; it never fabricates success.
- **No fake completion (§3, §140, §159):** a capability is COMPLETE only with real implementation + integration + persistence + validation + error handling + security + observability + retries + recovery + audit + testing + documentation.
- **LLM has no absolute authority (§6, §46):** the LLM proposes; deterministic systems (accounting, limits, risk, treasury, permissions, authorization, reconciliation, policies, audit, invariants) dispose. Every external action follows: LLM → PROPOSAL → VALIDATION → POLICY → RISK → TREASURY → AUTHORIZATION → EXECUTION → EXTERNAL RESULT → RECONCILIATION → LEDGER.
- **Low-resource first (§8):** SQLite (+FTS5), DuckDB, Polars, sqlite-vec, local object storage, FastAPI, Python, TypeScript, Docker, OpenTelemetry. No Kubernetes, Kafka, Spark, Ray, Elasticsearch or Redis cluster unless a local solution cannot solve the problem. LOCAL MODE is the product; DISTRIBUTED MODE is an extension.
- **Human control (§163):** an authorized human can always pause, stop, disable, revoke permissions, freeze the treasury, disable external execution, inspect decisions and history, and restore state. The system never resists legitimate shutdown (EMERGENCY STOP, §72).
- **Never destroy history (§13, §14, §65, §117, §145):** dead agents persist in the Cemetery; financial history, prediction resolutions, lineage and audit are append-only / immutable; schema changes use versioned migrations.
- **Legality and platform terms (§33, §39, §77, §125):** no spam, fake identities, fake reviews, impersonation, wash trading, pump-and-dump, or platform-TOS evasion. The system detects manipulation and protects itself from it (§76, §77).
- **Real financial execution only (§46–52, §128):** deployment progression is research → historical → paper → shadow → limited live → monitored scale. PAPER_ONLY is a permanently supported mode; paper results are never reported as real profit.

## 3. The autonomous loop (the product)

WORLD → OBSERVE → UNDERSTAND → DISCOVER → RANK → HYPOTHESIZE → CREATE AGENTS → EXPERIMENT → ACT IN THE REAL WORLD → MEASURE REAL OUTCOME → ACCOUNT → EVALUATE → SELECT → KILL → LEARN → MUTATE → RECOMBINE → REPLICATE → ALLOCATE CAPITAL → SCALE → REINVEST → OBSERVE AGAIN (§4, §162).

Supporting loops that must run end-to-end and be integrated with the real event architecture (§141): digital-product loop (§130), marketing loop (§131), investment loop (§132), economic loop (§133), evolution loop (§134), death loop (§135), strategy learning loop (§136), system learning loop (§137), and the Opportunity → Business loop (§168 below).

## 4. Module map (complete inventory)

Core domain: Agent Runtime, Agent Factory, Agent Genome, Agent Lifecycle, Agent Cemetery, Hall of Fame, Agent Lineage, Evolution / Mutation / Recombination / Strategy-DNA engines, Opportunity Engine, World Brain, World Model, Temporal World Model, Signal Engine, Entity Resolution, Source Trust, Demand Radar, Competitor and Customer Intelligence, Experiment Engine, Bandit Engine, Product Factory, Deployment Engine, Marketing Engine, Customer Acquisition, SEO Engine, Analytics, Attribution, Investment Engine, Portfolio Engine, Trading Execution, Risk Engine, Treasury, Capital Allocation, Economic Ledger, Prediction Ledger, Economic Memory + Graph, World Memory, RAG, Meta-Learning, Model/Tool/Skill/Capability Registries, Model Router, Governance, Policy Engine, Permission Engine, Security, Secret Management, Sandbox, Code Execution, Observability, Audit, Scheduler, Resource Manager, Workflow Engine, Recovery Engine, License Engine, Dependency Engine, Data Provenance, Dashboard, API, CLI, Backup/Restore, Migrations, Health, Operations.

Reinforcement layer (v3.0 additions, §168): Double-Entry Accounting, Billing & Payments, Customer Support, Identity & Tenancy, Deployment/Infra Ops, Real Web Research, Platform Adapter Framework, Plugin SDK, Component Lifecycle, Universal Reconciliation, Business Operations, Business-Unit P&L.

## 5. Domain architecture (§9, §153)

Layers: DOMAIN / APPLICATION / INFRASTRUCTURE / ADAPTERS / WORKERS / PERSISTENCE / API / UI. The domain never imports a vendor SDK; every external system sits behind the adapter interfaces of §96 (ILanguageModel, IEmbeddingProvider, IMemoryProvider, IVectorStore, IWebBrowser, ISearchProvider, ICrawler, IAnalytics, IMarketingProvider, IEmailProvider, INotificationProvider, IPaymentProvider, IExchange, IBroker, IHostingProvider, ISEOProvider, IEvolutionEngine, IBanditEngine, IPolicyEngine, IOptimizationEngine).

Repository layout:

```
/apps        control-plane, dashboard, worker, scheduler
/packages    core, domain, agents, genome, economics, evolution, world,
             opportunities, experiments, customers, marketing, products,
             analytics, investments, risk, treasury, memory, models, tools,
             skills, governance, security, observability
/adapters    llm, browser, search, crawler, analytics, marketing, email,
             payments, exchanges, brokers, seo, memory, evolution,
             optimization, workflow
/infrastructure  database, docker, migrations, deployment
/tests       unit, integration, contract, e2e, security, recovery, economic,
             resource, license
/docs
```

## 6. Agents (§10–§23, §101–§104, §119–§120)

**Genome** — full heritable spec: identity, mission, generation, parents, ancestors, children; audience, customer_segment, problem, pain_point, need; product, offer, pricing, pricing_model, distribution; value_proposition, positioning; channel, message, brand, UX, sales, marketing, acquisition, retention; models, tools, skills, workflow, memory_strategy, reasoning_strategy, experiment_strategy; budget, capital_limit, resource_limits, time_limit, risk_profile; success/failure/death criteria; exploration/exploitation rates; mutation and recombination policies. Every material change produces a new immutable version; historical genomes are never silently modified (§10).

**Lifecycle states** — CREATED, INITIALIZED, READY, INCUBATING, EXPERIMENTING, ACTIVE, PROMISING, PROFITABLE, SCALING, DECLINING, UNDER_REVIEW, RETIRED; terminal: FAILED, KILLED, BANKRUPT, EXPIRED, BLOCKED, REPLACED. State transitions are persisted events.

**Economics** — every agent carries cash, allocated/available capital, revenue, expenses, profit, loss, burn_rate, runway, ROI, CAC, LTV, retention, conversion, risk, fitness, information_gain, cost, survival_time (§12).

**Death** — a dead agent is never deleted. DeathRecord captures genome version, strategy DNA, capital in/spent, revenue, cost, profit, loss, experiments, customers, conversion, retention, prediction accuracy, failure_reason and failure_category (NO_DEMAND, BAD_PRICING, HIGH_CAC, LOW_RETENTION, COMPETITION, BAD_CHANNEL, BAD_PRODUCT, TECHNICAL, EXECUTION, MODEL, RESOURCE, TIMING, RISK, POLICY, REGULATORY, UNKNOWN), plus lessons and unknowns (§13, §135).

**Fitness** — economic_fitness, learning_fitness, risk_fitness, robustness_fitness, growth_fitness, capital_efficiency; economic_fitness = profit·growth·survival·learning·optionality·robustness − risk − cost − uncertainty − capital_consumption − concentration; all weights configurable (§15).

**Evolution** — real populations per generation: EVALUATE → RANK → SELECT → EXTRACT TRAITS → MUTATE → RECOMBINE → SPAWN → TEST IN THE REAL WORLD → EVALUATE (§19). Winners get capital, losers lose it, the dead stay in the Cemetery. Mutation operations cover audience, problem, product, offer, price, channel, message, distribution, UX, sales, marketing, retention, model, tool, workflow, memory and experiment policy, each logging parent, change, hypothesis, reason, result and fitness_delta (§21). Recombination combines traits across agents (A.acquisition + B.retention + C.price) with full genealogy (§22). OpenEvolve/GEPA/DSPy may act as adapters, but the Economic Core always owns selection, fitness, capital, death, survival, lineage and reproduction (§23). Spawn control computes expected information gain, compute cost, capital cost, population size and diversity gain before creating any agent (§119); agents carry resource limits (tokens/runtime/compute/network/budget/actions) (§120); diversity pressure prevents premature convergence (§102, §104).

## 7. World intelligence (§24–§32, §75–§76, §99–§100)

**World Brain** ingests news, RSS, web, forums, communities, search, reviews, social signals, companies, products, markets, macro, on-chain, technology, regulation, open-source activity and pricing changes through INGEST → NORMALIZE → DEDUP → EXTRACT → ENTITY RESOLUTION → SOURCE TRUST → CLUSTER → TEMPORALIZE → STORE → SIGNAL.

**World Model** represents entities, events, relations, claims, sources, timestamps, confidence; supports temporal queries, historical replay, contradiction detection, event chains and source comparison; distinguishes FACT / OBSERVATION / INFERENCE / HYPOTHESIS / PREDICTION. Temporal memory keeps event_time, ingestion_time, valid_from, valid_until and never overwrites history (§26).

**Entity resolution** combines exact, fuzzy, embedding, graph, context and temporal evidence, and never merges below confidence thresholds (§27). **Source trust** tracks reliability, historical accuracy, freshness, authority, bias estimate and cross-source confirmation, updated from observed results (§28, §99). **Signals:** trend, velocity, acceleration, novelty, volume, sentiment, source diversity, cross confirmation, importance, impact, signal_confidence (§29). **Manipulation detection** (§76): bots, coordinated activity, duplicate narratives, unnatural timing, abnormal amplification, suspicious clusters, volume anomalies; manipulation probability above threshold lowers confidence, raises risk, and blocks or routes to review for financially relevant actions.

**Opportunity Engine** (§30–§31) detects new markets, unserved demand, complaints, pricing anomalies, competitor weaknesses, technology shifts, new communities, new search demand, regulatory changes, distribution opportunities, product/service gaps. An Opportunity carries market, segment, problem, evidence, sources, demand, competition, margin, capital_required, time_to_market, risk, uncertainty, information_value, expected_value, confidence. Score = expected_profit·probability_success·information_value + strategic_optionality − capital_cost − risk − uncertainty − time − competition − operational_cost; opportunities below threshold are never executed. Opportunities are also evaluated as a portfolio (correlation, diversity), not one-by-one (§103).

**Customer & competitor intelligence** (§32–§33) work only on legitimately obtained data with data minimization, retention, privacy and access control; competitor monitoring is legal-only (public pages, reviews, announcements, hiring signals).

## 8. Economics (§16–§18, §50–§57, §145, §167–§168)

**Economic ledger** — internal, append-only for critical entries: capital, cash, revenue, expenses, fees, refunds, losses, profit, allocations, returns, liabilities, reserves. Every transaction: transaction_id, timestamp, source, destination, amount, currency, agent_id, experiment_id, reason, authorization, policy_result, external_reference (§16).

**Double-entry accounting (§167)** — real chart of accounts, journal entries (balanced, immutable), accounts payable/receivable, invoices, refunds, reconciliation, tax categories, financial periods, currency conversion. The economic ledger posts through the accounting layer; the two never disagree.

**Treasury (§17, §52)** — TOTAL_TREASURY with RESERVE, OPERATING, EXPERIMENT, BUSINESS, INVESTMENT, RESEARCH, EMERGENCY buckets; configurable reserve_floor, max_experiment_budget, max_business_allocation, max_investment_allocation. Invariants: never allocated > available, never reserve < reserve_floor. Treasury distinguishes available / allocated / reserved / committed / spent / returned / profit / loss; every allocation records authorization, policy, risk, reason, agent, experiment, timestamp.

**Capital allocation (§18)** — inputs: expected_return, historical_return, risk, uncertainty, capital_requirement, information_gain, liquidity, correlation, strategy_quality, agent_quality, resource_cost; outputs APPROVE / PARTIAL_APPROVE / DEFER / REJECT; optimization via PuLP / OR-Tools (adapters).

**Portfolio & risk (§50–§51)** — allocation, position sizing, correlation, concentration, CVaR, VaR, drawdown, stress analysis, transaction costs, slippage, liquidity (skfolio / PyPortfolioOpt as adapters). Hard risk limits: max_position, max_daily_loss, max_drawdown, max_exposure, max_concentration, max_strategy_exposure, max_counterparty, max_slippage, max_fee — hard-limit breach means BLOCK.

**Economic memory** (§54–§55) — what worked, what failed, when, why, for whom, at what cost, with what model/tool, under what conditions — stored as a graph Audience → Problem → Product → Offer → Price → Channel → Campaign → Conversion → Revenue → Cost → Profit with relations worked / failed / similar / preceded / followed / correlated / caused / uncertain.

**Prediction ledger (§53)** — predictions stored BEFORE outcomes (claim, probability, confidence, context, source, model, agent, strategy, timestamp), resolved afterwards with actual, error, calibration, Brier score, directional accuracy; feeds model routing, agent ranking, source trust and strategy ranking. Predictions are immutable after resolution.

**Economic invariants (§145)** — allocated_capital ≤ available_capital; spent ≤ budget; reserve ≥ reserve_floor; position ≤ max_position; dead_agent_spend == 0; policy_denied_action == 0 executions; unknown_result ≠ assumed_success; financial history immutable; prediction-after-resolution immutable; historical lineage immutable.

## 9. Business operations (§128–§131, §167–§168)

**Billing & payments (§167b)** — customer → checkout → payment provider → payment confirmation → invoice → ledger → refund → reconciliation; subscriptions, trials, one-time payments, failed payments, chargebacks, tax metadata. Payment webhooks are verified, idempotent, and reconciled against provider state.

**Support (§167c)** — customer → issue → ticket → classification → response → resolution → feedback → product improvement; SLA tracking and escalation.

**Identity & tenancy (§167d)** — authentication, sessions, MFA, API keys, service accounts, organizations, workspaces, roles, permissions, tenant isolation, user audit, credential rotation. A system handling real money requires this explicitly.

**Deployment/infra ops (§167e)** — domain, DNS, TLS, deployments, health checks, rollback, versioning, secrets, backups/restore, storage, logs, monitoring, alerts, uptime, resource scaling; deployment failure → rollback → health check → restore previous version.

**Universal reconciliation (§167j)** — internal state vs external state for payments, campaigns, emails, users, CRM, hosting, deployments, exchanges, balances, subscriptions; discrepancy → RECONCILIATION_REQUIRED, never hidden.

**Business-unit loop (§168)** — Opportunity → Business Hypothesis → Product → Business Unit → Revenue Stream → Independent P&L → Scale / Sell / Shutdown; the system runs a portfolio of real digital businesses, not just money-winning agents.

## 10. Experiments, information economics & learning (§43–§45, §78–§81, §106–§108)

Experiments carry hypothesis, baseline, treatment, control, population, budget, time, metrics, success/failure thresholds through DESIGN → VALIDATE → AUTHORIZE → EXECUTE → OBSERVE → ANALYZE → DECIDE with outcomes KEEP / MODIFY / SCALE / KILL / DEFER (§44). Contextual bandits (MABWiser as adapter) cover pricing, channel, message, audience, campaign, product, model, tool and strategy with separated exploration/exploitation, risk, cost, sample size and confidence (§43). Before spending money the system asks what information it needs and designs the cheapest experiment that can produce it; information_gain_per_cost is a first-class metric (§45). Causality is separated from correlation with DoWhy-style refutation when applicable (§78). Real customer events and real revenue feed back into opportunity discovery, product factory, marketing, fitness, genomes and mutation (§79–§80); the final truth of a strategy is the observed real-world outcome (§81).

Meta-learning (§61, §106–§108) continuously improves how the system searches, experiments, chooses models, allocates capital, mutates agents, evaluates opportunities, routes tools and stores memory; model calibration (confidence vs correctness) is measured, never assumed. System self-evaluation tracks profitability, capital efficiency, prediction accuracy, agent survival, experiment quality, resource efficiency, security, policy violations, provider reliability, recovery success and opportunity precision (§107).

## 11. Models, tools, capabilities (§56–§60, §105, §169–§170)

Model router classifies tasks simple/medium/complex/critical and routes small/local → extraction/classification/normalization/cheap analysis, medium → planning/reasoning/synthesis, large → complex high-value work, maximizing value per cost (§56, §105: quality_per_token, quality_per_dollar, success_per_dollar, value_per_latency). Model registry tracks provider, version, capabilities, context, cost, latency, license, hardware, historical performance and prediction accuracy (§57). Tool registry tracks name, version, description, permissions, risk, cost, latency, resource usage, network/data access and license (§58). Skill registry (research, web, coding, marketing, SEO, finance, analytics, product creation, customer intelligence, automation) with inputs, outputs, tools, models, cost, risk and evaluation (§59). Capability registry answers WHAT CAN I DO? / WHAT CANNOT I DO? / WHAT DO I NEED? (§60).

**Plugin SDK (§169)** — new models, providers, skills, tools, agent types, market adapters, marketing channels and data sources install without core modification: SDK + manifest + capability contract + version-compatibility system.

**Component lifecycle (§170)** — install, enable, disable, update, rollback, versioning, dependency resolution, compatibility checks, health, deprecation and uninstall for agents, skills and tools.

## 12. Execution, governance, security (§63–§77, §121–§127, §146)

Durable execution (§63) survives process crash, worker crash, reboot, network failure, provider timeout and API outage — Temporal as an adapter, plus a local durable engine in LOCAL MODE. Event bus (§64) publishes the full catalog of domain events (AgentCreated…DeploymentFailed); critical domains are event-sourced (§65). Every external action carries an idempotency key (§66); unknown results are resolved by querying the provider before any retry — never re-executed blindly (§68); reconciliation compares internal vs external state (§67, §167j).

Policy engine (§69) is deterministic (OPA as adapter) with policy families: capital, agent, tool, market, marketing, deployment, data, model, user, permissions. Permissions (§70): READ_WEB, READ_MARKET, READ_CUSTOMER_DATA, CREATE_CONTENT, SEND_MESSAGE, CREATE_CAMPAIGN, DEPLOY_PRODUCT, REQUEST_CAPITAL, ALLOCATE_CAPITAL, PROPOSE_TRADE, EXECUTE_TRADE, MODIFY_AGENT, SPAWN_AGENT, MODIFY_SYSTEM — separated. Human approval levels 0–4 from low-risk to human-only, configurable per risk/capital/tool/domain/action (§71). EMERGENCY STOP halts financial execution, external communications, agent spawning, capital allocation and deployments while preserving audit, financial history, state and evidence (§72).

Security (§73): least privilege, RBAC, ABAC, secret isolation, sandbox, network restrictions, rate limits, resource limits, audit, credential rotation, key redaction — no API keys, private keys, passwords or tokens ever in logs, memory, prompts, audit or traces. AI-generated code runs through BUILD → TEST → STATIC ANALYSIS → DEPENDENCY AUDIT → SECURITY → LICENSE → SANDBOX → RESOURCE VALIDATION → REVIEW → DEPLOY, never straight to production (§74, §35, §62). Every important data item carries source, timestamp, hash, retrieval method, confidence and processing history — WHERE DID THIS COME FROM? is always answerable (§75). External actions classify as READ / LOW_RISK_WRITE / MEDIUM_RISK_WRITE / HIGH_RISK_WRITE / FINANCIAL / SYSTEM_ADMIN, each level with different permissions (§127) and pass the full external-action gate (§126).

## 13. Cost, resources, resilience (§82–§85, §121–§124, §148–§149)

Resource accounting for CPU, RAM, GPU, VRAM, disk, network, tokens, latency, cost per agent/generation/experiment/product/campaign/day/month (§82–§83). Cost optimization: cache, semantic cache, prompt/context compression, deduplication, retrieval pruning, summarization, model routing, batching (§84). Error classification TRANSIENT / PERMANENT / EXTERNAL / INTERNAL / POLICY / SECURITY / UNKNOWN with per-type retry policy (§121); network resilience via timeouts, retries, backoff, circuit breaker, rate limiting, provider health and failover (§97–§98, §122); data quality validation (schema, freshness, duplicates, consistency, provenance, anomaly) (§123); privacy by data minimization, pseudonymization, anonymization, retention and deletion policies (§124); provider adapters document credentials, permissions, allowed use, rate limits and terms (§125). Resource tests enforce CPU/RAM/VRAM/network/token/cost/spawn/retry limits (§148); performance work covers async, batching, caching, incremental processing, indexes, compact events, streaming, scheduling (§149).

## 14. Interfaces & operations (§88–§95, §112–§118, §150–§152)

Dashboard views: Overview, World, Signals, Opportunities, Agents, Generations, Lineage, Cemetery, Hall of Fame, Strategies, Strategy DNA, Experiments, Customers, Products, Marketing, SEO, Analytics, Treasury, Capital, Risk, Investments, Predictions, Memory, Models, Tools, Skills, Policies, Security, Audit, System, Settings (§88–§93). API surface per §94 (/agents, /generations, /evolution, /opportunities, /signals, /world/*, /experiments, /predictions, /strategies, /treasury, /capital, /risk, /products, /customers, /campaigns, /analytics, /investments, /portfolio, /orders, /models, /tools, /skills, /memory, /policies, /audit, /system, /health, /metrics). CLI verbs per §95 (start, stop, status, doctor, agent, generation, experiment, opportunity, world, treasury, risk, policy, model, tool, skill, memory, audit, backup, restore, deployment). Observability via OpenTelemetry traces/spans tagged with agent, generation, model, tool, task, cost, latency, result (§112). Decision records capture decision_id, agent, context, facts, signals, options, selected, expected_value, risk, confidence, cost, policy, authorization, action, outcome — operational summaries only, no private chain-of-thought (§113). Audit log is append-only (§114). Backups cover database, ledger, audit, genomes, lineage, strategies, predictions, world events and configuration; restore is tested end-to-end with integrity checks (§115–§116); migrations are versioned and never silently destroy history (§117). Scheduler priority: 1 capital protection, 2 security, 3 urgent real-world opportunities, 4 high-value experiments, 5 routine operations, 6 long-term learning, weighing value/cost/risk/urgency/resource pressure (§118). Deployment targets: local, Docker, Linux, Windows+WSL; configuration split development / test / paper / shadow / limited_live / production with no hard-coded secrets (§151–§152). System doctor checks database, migrations, providers, models, tools, workers, scheduler, event system, policies, secrets, licenses, disk, CPU, RAM, GPU, VRAM, network (§150).

## 15. License policy (§109–§110)

Prefer MIT, Apache-2.0, BSD-2/3-Clause, ISC, MPL-2.0, CC0, public domain. Blocked from the core: GPL, AGPL, LGPL, SSPL, non-commercial, enterprise-only source-available. Incompatible components may exist only as clearly isolated external adapters where legally appropriate. License automation: SBOM, dependency graph, license scan (transitive), vulnerability scan (ORT / OSV-Scanner); CI/CD blocks on prohibited dependencies.

## 16. Testing & acceptance (§143–§149, §160–§161)

Tests may use fixtures, mocks, fake providers and simulation — only inside tests. Production paths use real providers. Every major adapter needs tests for: happy path, timeout, retry, rate limit, auth failure, provider error, partial response, unknown result, duplicate response, reconciliation failure. Security tests verify that malicious agents attempting budget escalation, permission escalation, secret access, policy bypass, audit modification, agent multiplication, forbidden tool access, unsafe deployment and financial bypass all fail. Recovery tests cover worker crash, process restart, DB restart, network failure, provider timeout, duplicate/partial execution and unknown results. Final acceptance is the 24-step end-to-end flow of §160 and the module completion table of §161; only PRODUCTION_READY counts as complete in IMPLEMENTATION_STATUS.md (§157), with PRODUCTION_READINESS.md documenting architecture, security, integrations, financial controls, observability, recovery, backup, license, performance, privacy and operations (§158). Final reports must state exactly what is implemented, integrated, tested, verified against real providers, and what still requires user credentials (§165). No unverified claims (§159).
