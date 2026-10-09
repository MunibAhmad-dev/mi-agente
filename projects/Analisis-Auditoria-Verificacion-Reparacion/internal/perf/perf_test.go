package perf

import (
	"testing"

	"verificationengine/internal/core"
)

func TestBudgetViolation(t *testing.T) {
	b := &Budgets{Lines: []Budget{{Name: "latency", Metric: "p95_latency_ms", Max: 100}}}
	evs := Check("run-perf", b, map[string]float64{"p95_latency_ms": 250})
	if len(evs) != 1 || evs[0].Severity != core.SevHigh {
		t.Fatalf("expected HIGH regression evidence: %+v", evs)
	}
	if want := "perf:latency"; evs[0].Target != want {
		t.Fatalf("target %q != %q", evs[0].Target, want)
	}
}

func TestBudgetOK(t *testing.T) {
	b := &Budgets{Lines: []Budget{{Name: "latency", Metric: "p95_latency_ms", Max: 100}}}
	evs := Check("run-perf", b, map[string]float64{"p95_latency_ms": 42})
	if len(evs) != 1 || evs[0].Severity != core.SevInfo {
		t.Fatalf("expected INFO within budget: %+v", evs)
	}
}

func TestMissingMeasurement(t *testing.T) {
	b := &Budgets{Lines: []Budget{{Name: "alloc", Metric: "alloc_bytes", Max: 100}}}
	evs := Check("run-perf", b, map[string]float64{})
	if len(evs) != 1 || evs[0].Severity != core.SevMedium {
		t.Fatalf("expected MEDIUM missing measurement: %+v", evs)
	}
}

func TestDeltaRegressions(t *testing.T) {
	base := Baseline{"p95_latency_ms": 100, "ok_metric": 50}
	measured := map[string]float64{"p95_latency_ms": 300, "ok_metric": 52}
	evs := Delta("run-perf", base, measured, 20)
	if len(evs) != 1 {
		t.Fatalf("expected 1 regression, got %+v", evs)
	}
	if evs[0].Severity != core.SevHigh || evs[0].Kind != core.EvRegression {
		t.Fatalf("wrong evidence: %+v", evs[0])
	}
}
