# AEOS — Implementation Plan (Phased, Non-MVP)

Phases order the work; **no phase is an MVP** (§156). Every phase ends with real
persistence, tests, audit, and integrated events. The full scope is
docs/MASTER_SPECIFICATION.md; the live tracker is IMPLEMENTATION_STATUS.md.

## Phase P0 — Foundation (reusable substrate)

- Repo scaffold: `aeos` package, pyproject, settings (env-split per §152),
  SQLite connection (WAL), yoyo migrations runner, migration 0001 (all core
  tables), event bus (§64), audit log (append-only, §114), decision records
  (§113), OpenTelemetry wiring (§112), secret/credential store (§73).
- Exit criteria: `pytest` green for foundation tests; audit trail written for
  every mutation; `aeos doctor` reports DB + migrations healthy.

## Phase P1 — Economic core (money is deterministic)

- Double-entry accounting: chart of accounts, immutable journal, periods,
  AP/AR, invoices, refunds, tax categories, FX (§16, §167, §167a).
- Treasury: buckets (RESERVE/OPERATING/EXPERIMENT/BUSINESS/INVESTMENT/RESEARCH/
  EMERGENCY), reserve floor, allocation invariants (§17, §52).
- Capital allocation engine with PuLP adapter (§18); risk engine with hard
  limits (§51); universal reconciliation engine (§67, §167j).
- Exit criteria: economic invariant test suite green (§145): no overdraft, no
  reserve breach, append-only history, dead-agent spend = 0.

## Phase P2 — Agents & evolution

- Genome model with immutable versions (§10); lifecycle state machine persisted
  as events (§11); agent economics (§12); spawn control + resource limits
  (§119–120).
- Cemetery (DeathRecord, §13), Hall of Fame with WHY explanations (§14),
  fitness engine (§15), Strategy DNA (§20), mutation engine (§21),
  recombination (§22), generation runner (§19, §134).
- Prediction ledger (§53) wired to fitness and model routing.
- Exit criteria: evolution loop §134 runs end-to-end on real experiments;
  lineage/genealogy immutable and queryable.

## Phase P3 — World intelligence

- World Brain pipeline (§24), world model + temporal memory (§25–26), entity
  resolution (§27), source trust (§28, §99), signal engine (§29), demand radar,
  competitor & customer intelligence (§32–33), manipulation detection (§76),
  opportunity engine + scoring + portfolio (§30–31, §103), world change
  detection (§100).
- Exit criteria: real feeds → dedup → entities → signals → ranked opportunities
  with provenance (§75), temporal replay working.

## Phase P4 — Real-world execution

- Product factory + deployment engine with sandbox pipeline (§34–35, §74);
  marketing engine + acquisition + SEO (§36–40, §131); analytics + attribution
  (§41–42); bandits + experiment engine (§43–44); information economics (§45).
- Business layer: billing/payments (§167b), support tickets (§167c), identity &
  tenancy (§167d), deployment/infra ops (§167e), business-unit P&L (§168).
- Exit criteria: digital product loop §130 and marketing loop §131 execute
  against real providers when credentials are configured; NO_REAL_DATA_AVAILABLE
  reported otherwise — never synthetic data (§139).

## Phase P5 — Investment subsystem

- Market data (real APIs, §47), trading execution via CCXT adapter (§48),
  safety progression paper → shadow → limited live (§49), portfolio engine
  (§50), investment loop (§132) with the full proposal→authorization→
  reconciliation chain (§46).
- Upstream crypto services from the user's archive are hardened and ported
  behind IExchange/IBroker interfaces.
- Exit criteria: PAPER_ONLY trading loop verified end-to-end; live requires
  explicit human authorization (§71–72).

## Phase P6 — Intelligence, learning & meta

- Model router + registries (§56–60, §105), RAG + memory architecture (§86–87),
  meta-learning (§61, §106–108), cost engine + optimization (§83–84), causal
  engine (§78), plugin SDK + component lifecycle (§169–170), platform adapter
  framework (§167g).
- Exit criteria: routing decisions justified by value-per-cost; calibration
  measured; hot-plug of a new provider without core changes.

## Phase P7 — Governance, security & hardening

- Policy engine + permissions + approval levels (§69–71), emergency stop (§72),
  security hardening + sandbox (§73–74, §111), security/recovery/resource test
  suites (§146–148), backups/restore (§115–116), scheduler (§118), system
  doctor + health + operations (§150).
- Exit criteria: all security tests prove attacks fail; recovery tests pass on
  kill -9 / reboot / provider timeout; restore verified.

## Phase P8 — Interfaces & production readiness

- API (§94), CLI (§95), dashboard (§88–93), deployment configs (§151–152),
  IMPLEMENTATION_STATUS.md to PRODUCTION_READY per capability,
  PRODUCTION_READINESS.md (§158), final acceptance test §160, acceptance table
  §161, final deliverable §165 with the honest WHAT IS IMPLEMENTED report.

## Cross-cutting rules applied in every phase

1. Inspect → map → reuse before replace (§154).
2. Every external action: idempotency key, gate, audit, reconciliation (§66,
   §126–127).
3. Events emitted for every domain mutation (§64–65).
4. Tests + docs + status-tracker update land with the code (§157, §159).
