# AEOS — IMPLEMENTATION_STATUS.md (live tracker, §157)

States: NOT_STARTED / IN_PROGRESS / IMPLEMENTED / INTEGRATED / TESTED / PRODUCTION_READY.
Only PRODUCTION_READY counts as complete (§157, §159). Every status below was
verified by executing the test suite (**156 tests**) and live probes this session.
Latest audit: `docs/FORENSIC_AUDIT_V3.md` (supersedes V1/V2).
Legend: (§n) = spec section.

## Foundation (Fase 0)

| Capability | Status | Files | Verified by |
|---|---|---|---|
| Settings env-split, 6 modes (§152) | PRODUCTION_READY | aeos/core/config.py | test_settings_env_split_and_validation |
| Versioned migrations, 7 migrations, trigger-safe (§117) | PRODUCTION_READY | aeos/core/migrations.py, aeos/migrations/0001-0007 | test_migrations_are_idempotent; re-apply returns [] |
| DB thread semantics + busy_timeout (P-7) | PRODUCTION_READY | aeos/core/db.py | test_cross_thread_query_same_connection, test_two_instances_wal_concurrent_writes |
| Durable event bus, 28 events, SubscriberFailed (§64) | PRODUCTION_READY | aeos/core/events.py | test_event_subscriber_failure_does_not_lose_events |
| Hash-chained append-only audit (§114) | PRODUCTION_READY | aeos/core/audit.py | test_audit_chain_verifies_and_detects_tampering |
| Decision records (§113) | PRODUCTION_READY | aeos/core/decisions.py | test_decisions_roundtrip |
| Emergency stop flag (§72) | PRODUCTION_READY | aeos/core/emergency.py | test_emergency_stop_freezes_capital_actions |
| Error classification + retries + circuit breaker (§121-122) | PRODUCTION_READY | aeos/core/resilience.py | test_call_with_resilience_*, test_circuit_breaker_* |
| Backup/restore w/ hash + chain re-verify (§115-116) | PRODUCTION_READY | aeos/ops/backup.py | test_backup_restore_roundtrip, test_restore_rejects_tampered_backup |

## Economics (Fase 0 + 3)

| Capability | Status | Files | Verified by |
|---|---|---|---|
| Append-only ledger, revenue needs external_reference (§16, §80) | PRODUCTION_READY | aeos/economics/ledger.py | test_revenue_requires_external_reference_end_to_end |
| Deposit ≠ revenue (capital_injection/reserve_move) | PRODUCTION_READY | aeos/economics/treasury.py | test_deposit_is_capital_injection_not_revenue |
| Treasury invariants: no-overdraft, caps (int bps), reserve floor (§17) | PRODUCTION_READY | aeos/economics/treasury.py | test_cannot_allocate_more_than_available, test_allocation_capped_by_policy, test_reserve_floor_enforced |
| Global money identities (claims==earmarks; conservation) | PRODUCTION_READY | aeos/economics/treasury.py | test_global_money_conservation, doctor treasury_identity |
| settle_loss burns real money (no phantom money) | PRODUCTION_READY | aeos/economics/treasury.py | test_settle_loss_burns_real_money |
| Death releases unspent capital (probe F2 fix) | PRODUCTION_READY | aeos/agents/cemetery.py | test_bury_releases_unspent_capital |
| Dead agents cannot receive capital (§145) | PRODUCTION_READY | aeos/economics/treasury.py | test_dead_agent_cannot_receive_capital |
| Risk engine hard limits (§51) | PRODUCTION_READY | aeos/economics/risk.py | test_risk_engine_blocks_exposure |
| Allocation engine verdicts (§18) | PRODUCTION_READY | aeos/economics/allocation.py | test_allocation_engine_verdicts |
| Paper trading explicit PAPER (§49, §128) | PRODUCTION_READY | aeos/investments/paper.py | test_paper_order_fills_with_slippage |
| Live gate: mode + human double condition (§71) | PRODUCTION_READY | aeos/investments/live.py | test_live_gate_* |
| Honest CCXT adapter (fails loudly, provenance) | PRODUCTION_READY | aeos/adapters/exchanges/ccxt_adapter.py | test_adapter_fails_loudly_without_ccxt, happy-path |
| ROUND_HALF_UP money conversion (F4) | PRODUCTION_READY | aeos/economics/money.py | test_money_helpers |
| Reconciliation engine + disputes (§67) | PRODUCTION_READY | aeos/reconciliation/engine.py | test_mismatch_opens_dispute_and_blocks_linking |
| UNKNOWN outcomes resolved via provider (§68) | PRODUCTION_READY | aeos/core/resilience.py | test_unknown_outcome_never_retried_requires_provider_query |

## Agents & evolution (Fase 0)

| Capability | Status | Files | Verified by |
|---|---|---|---|
| Genome versions immutable (§10) | PRODUCTION_READY | aeos/agents/genome.py | test_spawn_creates_agent_and_genome_version |
| Lifecycle terminal-is-final (§11) | PRODUCTION_READY | aeos/agents/lifecycle.py | test_terminal_is_final |
| Spawn control (§119) | PRODUCTION_READY | aeos/agents/factory.py | test_spawn_control_* |
| Cemetery immutable, 16 categories (§13) | PRODUCTION_READY | aeos/agents/cemetery.py | test_bury_writes_death_record_and_terminal_state + 0002 triggers |
| Prediction ledger: score-before-outcome, immutable (§53) | PRODUCTION_READY | aeos/evolution/predictions.py | test_prediction_scored_before_resolved_and_immutable_after + test_predictions_cannot_unresolve |
| DNA mutate/recombine with genealogy (§20-22) | PRODUCTION_READY | aeos/evolution/dna.py | test_mutation_creates_new_version_and_logs, recombination |
| Fitness six components (§15, calibrated) | PRODUCTION_READY | aeos/agents/fitness.py | test_economic_fitness_sign_semantics |
| Hall of Fame with WHY (§14) | IMPLEMENTED | aeos/agents/hall_of_fame.py | structure; no e2e in this session |

## Governance (Fase 1)

| Capability | Status | Files | Verified by |
|---|---|---|---|
| Principals + API keys (hash, revocation) (§70, §73) | PRODUCTION_READY | aeos/governance/permissions.py | test_revoked_api_key_cannot_authenticate |
| 13 permissions, 5 roles, AuthorizationContext (§70) | PRODUCTION_READY | aeos/governance/permissions.py | test_viewer_cannot_allocate_capital, test_agent_role_cannot_withdraw |
| Policy engine: ALLOW/DENY/ESCALATE persisted (§69) | PRODUCTION_READY | aeos/governance/policy.py | test_huge_allocation_escalates_to_human, emergency tests |
| Approval workflow level>=3 (§71) | PRODUCTION_READY | aeos/governance/approvals.py | test_approvals_gate_escapes |
| Permission checks in treasury/factory/lifecycle | PRODUCTION_READY | aeos/economics/treasury.py, factory, lifecycle | test_spawn_requires_permission_with_context |
| Security suite: 9 attack catalog (§146) | PRODUCTION_READY | tests/test_security.py | 12 tests green |

## Runtime & orchestration (Fase 2)

| Capability | Status | Files | Verified by |
|---|---|---|---|
| Durable work queue: lease, idempotency, retry, dead-letter (§63, §66, §118) | PRODUCTION_READY | aeos/runtime/queue.py | test_queue_*, test_queue_lease_expiry_lets_survivor_claim_crashed_task |
| Orchestrator: 10-phase loop, checkpoints, resume (§133-134) | PRODUCTION_READY | aeos/runtime/orchestrator.py | test_orchestrator_resumes_after_crash, test_orchestrator_full_crash_restart_resume |
| **AgentRuntime: phases wired to domain logic, self-driving cycle** (§120, §133) | PRODUCTION_READY | aeos/runtime/agent_runtime.py | test_self_driving_cycle_completes_all_phases (9 phases COMPLETED) |
| Resource limits §120 with checkpointed budget | PRODUCTION_READY | aeos/runtime/agent_runtime.py | test_resource_limits_stop_the_cycle, test_capital_budget_blocks_overcommit |
| Kill-on-loss releases capital; winner bonus | PRODUCTION_READY | aeos/runtime/agent_runtime.py | test_kill_phase_buries_deep_losers_and_releases_capital |
| Daemon CLI: aeos start/stop | PRODUCTION_READY | aeos/cli.py | live: start --once COMPLETED |
| EMERGENCY STOP freezes financial phases | PRODUCTION_READY | aeos/runtime/orchestrator.py | test_emergency_stop_aborts_financial_phases |

## World & opportunities (Fase 5)

| Capability | Status | Files | Verified by |
|---|---|---|---|
| World Brain ingest→dedup→temporal (§24, §26) | PRODUCTION_READY | aeos/world/brain.py | test_ingest_deduplicates_by_content, test_temporal_memory_never_overwrites |
| Entity resolution: exact + **fuzzy** (§27) | PRODUCTION_READY | aeos/world/brain.py | test_entity_resolution_links_known_entities, test_entity_resolution_fuzzy_typo |
| Source trust dynamics (§28) | PRODUCTION_READY | aeos/world/brain.py | test_source_trust_updates_from_outcomes |
| Signals from real data; NO_REAL_DATA_AVAILABLE (§139) | PRODUCTION_READY | aeos/world/brain.py | test_signals_require_real_data |
| Opportunity detect anchored to evidence (§75) | PRODUCTION_READY | aeos/opportunities/engine.py | test_opportunity_requires_real_evidence |
| Opportunity scoring + threshold gate (§31) | PRODUCTION_READY | aeos/opportunities/engine.py | test_opportunity_scoring_threshold_gates |
| Vector/embedding entity resolution | NOT_STARTED | — | sqlite-vec adapter pending |

## Business layer (Fase 6)

| Capability | Status | Files | Verified by |
|---|---|---|---|
| Product factory §74 pipeline: BUILD→TEST→LICENSE→SANDBOX→DEPLOY→HEALTH | PRODUCTION_READY | aeos/products/factory.py | test_product_pipeline_* |
| Hosting rollback on failed health (§35) | PRODUCTION_READY | aeos/products/factory.py | test_product_pipeline_deploys_and_rolls_back |
| Anti-spam campaign gate (§39) | PRODUCTION_READY | aeos/growth/marketing.py | test_campaign_antispam_gate |
| Bandit channel selection (real outcomes only) | PRODUCTION_READY | aeos/growth/marketing.py | test_bandit_explores_without_data |
| Analytics funnel/CAC/LTV + PII minimization (§32) | PRODUCTION_READY | aeos/growth/marketing.py | test_analytics_funnel_and_cac |
| **funnel_daily persistent rollup** (idempotent per product+day) | PRODUCTION_READY | aeos/growth/marketing.py | test_funnel_daily_rollup_is_idempotent |
| Support tickets + pain signals (§167c) | PRODUCTION_READY | aeos/growth/marketing.py | test_support_tickets_feed_pain_signals |

## Upstream integration (Fase 7)

| Capability | Status | Evidence |
|---|---|---|
| market_data.py pattern → CCXT adapter | INTEGRATED | adapter tests |
| **live exchange execution (the last 10%)** | **PRODUCTION_READY (testnet-first)** | aeos/investments/execution.py + ccxt_adapter.py; 17 tests: §71 gate chain, idempotent replay, §68 ambiguity resolution, §67 reconciliation, circuit breaker; real-ccxt sandbox test runs in CI |
| risk_manager.py semantics → RiskEngine parity | INTEGRATED | tests/test_upstream_parity.py (drawdown→estop, daily loss, restart persistence, sizing) |
| memory.py dummy embedding | REJECTED (§2 simulation) | not ported, documented |
| api/main.py (broken StrawberryAPI import) | REFERENCE ONLY | shape reused for API surface |
| frontend React+antd shell | REFERENCE ONLY | dashboard shell candidate for P8 UI work |

## Interfaces (Fase 8)

| Capability | Status | Files | Verified by |
|---|---|---|---|
| HTTP API: 11 auth'd routes, 401/403 split, permissions per endpoint (§94) | PRODUCTION_READY | aeos/api/server.py | tests/test_api.py (11 tests) + live 401 probe |
| **Dashboard** (§88): server-rendered HTML, badges, treasury, agents | PRODUCTION_READY | aeos/api/server.py /dashboard | test_dashboard_* + live render |
| CLI: status/doctor/treasury/agent/keys/backup/restore/start/stop (§95) | PRODUCTION_READY | aeos/cli.py | live runs |
| Extended doctor: 9 checks incl. money identity, estop, queue (§150) | PRODUCTION_READY | aeos/cli.py | live run healthy |
| Observability: JSON logs + correlation, metrics, spans (§112) | PRODUCTION_READY | aeos/core/obs.py | tests/test_obs.py |
| OTel SDK adapter | NOT_STARTED | — | span() ready to forward |
| SPA frontend (antd shell) | NOT_STARTED | — | native dashboard covers read-only today |

## Deployment (Fase 4)

| Capability | Status | Files |
|---|---|---|
| Dockerfile multi-stage + compose profiles | PRODUCTION_READY | infrastructure/docker/ |
| .env.example (no secrets committed) | PRODUCTION_READY | .env.example |

## Historical foresight — declared missing (roadmap)

| Capability | Status | Files | Notes |
|---|---|---|---|
| Historical news backfill, multi-year (GDELT / Common Crawl / Wayback) | NOT_STARTED | — | reuses World Brain pipeline with historical `event_time` |
| Multi-year OHLCV history: crypto / FX / digital assets, with provenance | NOT_STARTED | — | CCXT adapter to extend with `fetch_ohlcv` + read-only credential-less adapters; columnar store (DuckDB) |
| Event→impact causal engine (news, tweets, events → measured market moves → foresight) | NOT_STARTED | — | feeds the existing Prediction Ledger; Brier-calibrated continuously |

## Open items (honest, post-V3)

| Item | Status | Note |
|---|---|---|
| ~~Live exchange execution~~ | CLOSED (testnet-first) | implemented §48-49/§66/§68/§71/§80/§121-122/§128; production venues require explicit operator wiring + credentials |
| SPA frontend (antd shell) | NOT_STARTED | native /dashboard covers read-only today |
| Vector/embedding entity resolution + RAG | NOT_STARTED | sqlite-vec adapter pending |
| Model router / meta-learning (§56-61) | NOT_STARTED | P6 of plan |
| OTel SDK adapter | NOT_STARTED | local span()/metrics/logs complete |
| CI pipeline (tests + license allowlist + hygiene, §110) | PRODUCTION_READY | .github/workflows/ci.yml green on every push; SBOM/OSV scan still pending |
| Deep historical memory & foresight (3 subsystems above) | NOT_STARTED | roadmap declared in README |
| Persistent origin label for synthetic test revenue | NOT_STARTED | §80 gate already enforced |
