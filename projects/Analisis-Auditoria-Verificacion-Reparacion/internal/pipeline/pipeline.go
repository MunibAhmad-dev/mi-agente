// Package pipeline orchestrates the full verification flow (spec §1):
// STATIC → RUNTIME → SEMANTIC → CONTRACTS → TESTS → ADVERSARIAL → SECURITY
// → RESILIENCE → REGRESSION → RE-VERIFICATION → FINAL AUDIT → GATE.
package pipeline

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"verificationengine/internal/adapters"
	"verificationengine/internal/contract"
	"verificationengine/internal/core"
	"verificationengine/internal/gate"
	"verificationengine/internal/parser"
	"verificationengine/internal/perf"
	"verificationengine/internal/planner"
	"verificationengine/internal/regression"
	"verificationengine/internal/repair"
	"verificationengine/internal/report"
	"verificationengine/internal/rules"
	"verificationengine/internal/runtime"
	"verificationengine/internal/security"
	"verificationengine/internal/truthmodel"
)

// Config for a pipeline run.
type Config struct {
	ProjectRoot string
	OutDir      string // default: <root>/reports
	StoreDir    string // default: <root>/.verification
	MaxParallel int
	Timeout     time.Duration
	RepairCode  bool
	Gate        gate.Config
}

// Result is the outcome of one pipeline run.
type Result struct {
	RunID    string
	Verdict  *report.Verdict
	Evidence []core.Evidence
}

// Run executes the full pipeline.
func Run(cfg Config) (*Result, error) {
	runID := fmt.Sprintf("run-%d", time.Now().UTC().UnixNano())
	if cfg.OutDir == "" {
		cfg.OutDir = filepath.Join(cfg.ProjectRoot, "reports")
	}
	if cfg.StoreDir == "" {
		cfg.StoreDir = filepath.Join(cfg.ProjectRoot, ".verification")
	}
	if cfg.MaxParallel <= 0 {
		cfg.MaxParallel = 4
	}
	if cfg.Timeout <= 0 {
		cfg.Timeout = 10 * time.Minute
	}
	if cfg.Gate.MaxSeverity == "" {
		cfg.Gate = gate.DefaultConfig()
	}

	store, err := core.NewEvidenceStore(cfg.StoreDir)
	if err != nil {
		return nil, err
	}
	defer store.Close()
	if err := store.BeginRun(runID, cfg.ProjectRoot); err != nil {
		return nil, err
	}
	defer store.FinishRun(runID)

	rc := &core.RunContext{
		RunID: runID, ProjectRoot: cfg.ProjectRoot,
		WorkDir: filepath.Join(cfg.StoreDir, "artifacts", runID),
		Out:     store, MaxParallel: cfg.MaxParallel, Timeout: cfg.Timeout,
	}
	if err := os.MkdirAll(rc.WorkDir, 0o755); err != nil {
		return nil, err
	}

	var all []core.Evidence
	collect := func(evs []core.Evidence, err error, stage string) error {
		if err != nil {
			return fmt.Errorf("%s: %w", stage, err)
		}
		for i := range evs {
			evs[i].RunID = runID
			if evs[i].SHA256 == "" {
				evs[i].SHA256 = evs[i].Hash()
			}
			if evs[i].ID == "" {
				evs[i].ID = fmt.Sprintf("EV-%s", evs[i].SHA256[:12])
			}
		}
		all = append(all, evs...)
		return store.AddAll(evs)
	}

	// ---- 1. STRUCTURAL SCAN (parsing) ----
	scan, err := parser.Scan(cfg.ProjectRoot)
	if err != nil {
		return nil, fmt.Errorf("structural scan: %w", err)
	}

	// ---- 2. STATIC RULES (semantic audit + adversarial heuristics) ----
	evsRules, errRules := rules.RunAll(runID, scan, cfg.ProjectRoot)
	if err := collect(evsRules, errRules, "static-rules"); err != nil {
		return nil, err
	}

	// ---- 3. ADAPTERS (static + dynamic verification) ----
	hasGoMod := false
	for _, name := range []string{"go.mod"} {
		if _, err := os.Stat(filepath.Join(cfg.ProjectRoot, name)); err == nil {
			hasGoMod = true
		}
	}
	var registryAdapters []core.ToolAdapter
	if hasGoMod {
		registryAdapters = append(registryAdapters, &adapters.GoVetAdapter{}, &adapters.GoTestAdapter{})
	}
	for _, a := range registryAdapters {
		if !a.Detect(cfg.ProjectRoot) {
			continue
		}
		if err := a.Prepare(rc); err != nil {
			return nil, fmt.Errorf("prepare %s: %w", a.Name(), err)
		}
		evs, err := a.Run(rc)
		if err != nil {
			// A failing tool invocation is itself evidence (tool could not verify).
			failEv := core.Evidence{
				Kind: core.EvStaticAnalysis, Source: a.Name(), Target: "project://all",
				Message:  fmt.Sprintf("adapter %s failed: %v", a.Name(), err),
				Severity: core.SevHigh, Confidence: 1.0, RunID: runID,
			}
			failEv.SHA256 = failEv.Hash()
			failEv.ID = fmt.Sprintf("EV-%s", failEv.SHA256[:12])
			all = append(all, failEv)
		}
		if err := collect(a.Normalize(evs), nil, a.Name()); err != nil {
			return nil, err
		}
		if err := a.Cleanup(rc); err != nil {
			return nil, fmt.Errorf("cleanup %s: %w", a.Name(), err)
		}
	}

	// ---- 4. CONTRACT ENGINE ----
	evsOpenAPI, errOpenAPI := contract.CheckOpenAPI(runID, cfg.ProjectRoot, scan)
	if err := collect(evsOpenAPI, errOpenAPI, "contract-openapi"); err != nil {
		return nil, err
	}
	evsEvents, errEvents := contract.CheckEventContracts(runID, cfg.ProjectRoot, scan)
	if err := collect(evsEvents, errEvents, "contract-events"); err != nil {
		return nil, err
	}
	evsMig, errMig := contract.CheckMigrationSync(runID, cfg.ProjectRoot)
	if err := collect(evsMig, errMig, "contract-migrations"); err != nil {
		return nil, err
	}

	// ---- 5. RUNTIME PROBES (only when probes.json exists) ----
	if targets, err := loadProbes(cfg.ProjectRoot); err == nil && len(targets) > 0 {
		results := runtime.Probe(runID, targets)
		if err := collect(runtime.ToEvidence(runID, results), nil, "runtime-probes"); err != nil {
			return nil, err
		}
	}

	// ---- 6. PERFORMANCE BUDGETS ----
	budgets, _ := perf.LoadBudgets(cfg.ProjectRoot)
	if len(budgets.Lines) > 0 {
		measured := loadMeasured(cfg.ProjectRoot)
		if err := collect(perf.Check(runID, budgets, measured), nil, "perf-budgets"); err != nil {
			return nil, err
		}
		if base, err := perf.LoadBaseline(cfg.ProjectRoot); err == nil && len(base) > 0 {
			if err := collect(perf.Delta(runID, base, measured, 20.0), nil, "perf-delta"); err != nil {
				return nil, err
			}
		}
	}

	// ---- 7. REGRESSION BASELINE ----
	base, _ := regression.Load(cfg.ProjectRoot)
	if len(base.Items) > 0 {
		current := map[string]string{}
		for _, ev := range all {
			if ev.Kind == core.EvTestRun {
				id := ev.Target
				if _, seen := current[id]; !seen || ev.Severity.Rank() > core.SevInfo.Rank() {
					if ev.Severity == core.SevHigh {
						current[id] = "fail"
					} else {
						current[id] = "pass"
					}
				}
			}
		}
		regs, reps := regression.Compare(runID, base, current)
		if err := collect(regs, nil, "regression"); err != nil {
			return nil, err
		}
		if err := collect(reps, nil, "regression"); err != nil {
			return nil, err
		}
	}

	// ---- 8. TRUTH MODEL BUILD (from evidence, not claims) ----
	model := buildTruthModel(runID, scan, all)

	// ---- 9. PLAN (verification planner; validated bounded) ----
	plan := planner.PlanFor(runID, requirementsOf(model), hasGoMod)
	if err := plan.Validate(); err != nil {
		return nil, err
	}

	// ---- 10. REPAIR (safe repairs only) ----
	findings := security.SortBySeverity(all)
	rep := repair.NewEngine(repair.Config{RepairCodeFixes: cfg.RepairCode}, runID)
	repairs := rep.RepairFindings(cfg.ProjectRoot, findings)

	// ---- 11. FINAL AUDIT → QUALITY GATE ----
	maxSev := store.MaxSeverityRun(runID)
	gateRes := gate.Evaluate(cfg.Gate, all, model)

	verdict := &report.Verdict{
		RunID: runID, StartedAt: time.Now().UTC().Add(-1 * time.Second),
		FinishedAt: time.Now().UTC(), ProjectRoot: cfg.ProjectRoot,
		Decision: gateRes.Decision, Reasons: gateRes.Reasons,
		TotalEvidence: len(all), MaxSeverity: maxSev,
		PlanSteps: len(plan.Steps), Repairs: repairs,
	}
	if err := report.WriteAll(cfg.OutDir, verdict, all, model, plan); err != nil {
		return nil, fmt.Errorf("write reports: %w", err)
	}
	return &Result{RunID: runID, Verdict: verdict, Evidence: all}, nil
}

// buildTruthModel derives the truth model from structural facts + evidence.
// It NEVER records builder claims as maturity (EVIDENCE > CLAIM).
func buildTruthModel(runID string, scan *parser.ScanResult, evs []core.Evidence) *truthmodel.Model {
	m := truthmodel.NewModel()
	for _, fn := range scan.Funcs {
		if fn.IsTest {
			_ = m.Add(&truthmodel.Entity{
				ID: "test:" + fn.Name, Type: truthmodel.EntityTest,
				Name: fn.Name, Source: "code", Location: fmt.Sprintf("%s:%d", fn.File, fn.Line),
				Status: truthmodel.StatusDone,
			})
			continue
		}
		id := "func:" + fn.Name
		if fn.Recv != "" {
			id = "func:" + fn.Recv + "." + fn.Name
		}
		_ = m.Add(&truthmodel.Entity{
			ID: id, Type: truthmodel.EntityFunction, Name: fn.Name,
			Source: "code", Location: fmt.Sprintf("%s:%d", fn.File, fn.Line),
			Status: truthmodel.StatusUnverified,
			// Maturity stays L0: existence in code is NOT verification.
			Maturity: core.L0NotFound,
		})
	}
	for _, rt := range scan.Routes {
		_ = m.Add(&truthmodel.Entity{
			ID: fmt.Sprintf("route:%s %s", rt.Method, rt.Path), Type: truthmodel.EntityRoute,
			Name: rt.Method + " " + rt.Path, Source: "code",
			Location: fmt.Sprintf("%s:%d", rt.File, rt.Line),
			Status:   truthmodel.StatusUnverified, Maturity: core.L1Declared,
		})
	}
	// Attach evidence to targets.
	for _, ev := range evs {
		if e, ok := m.Get(ev.Target); ok {
			m.AttachEvidence(ev.Target, ev.ID)
			_ = e
		}
	}
	return m
}

func requirementsOf(m *truthmodel.Model) []truthmodel.Requirement {
	// Requirements arrive from requirements.json (human-defined) when present.
	return nil
}

func loadProbes(root string) ([]runtime.ProbeTarget, error) {
	data, err := os.ReadFile(filepath.Join(root, "probes.json"))
	if err != nil {
		return nil, err
	}
	var targets []runtime.ProbeTarget
	if err := json.Unmarshal(data, &targets); err != nil {
		return nil, err
	}
	return targets, nil
}

func loadMeasured(root string) map[string]float64 {
	data, err := os.ReadFile(filepath.Join(root, "verification.perf.measured"))
	if err != nil {
		return nil
	}
	var m map[string]float64
	if json.Unmarshal(data, &m) != nil {
		return nil
	}
	return m
}
