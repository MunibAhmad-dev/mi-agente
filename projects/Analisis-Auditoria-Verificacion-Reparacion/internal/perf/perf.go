// Package perf implements performance verification: budgets + baseline deltas.
package perf

import (
	"encoding/json"
	"fmt"
	"os"

	"verificationengine/internal/core"
)

// Budget is one performance budget line.
type Budget struct {
	Name   string  `json:"name"`
	Metric string  `json:"metric"` // e.g. "p95_latency_ms", "body_bytes", "alloc_bytes"
	Max    float64 `json:"max"`
	Min    float64 `json:"min,omitempty"`
}

// Budgets is the perf budget file.
type Budgets struct {
	Lines []Budget `json:"budgets"`
}

// LoadBudgets reads verification.perf.budgets JSON from root.
func LoadBudgets(root string) (*Budgets, error) {
	data, err := os.ReadFile(root + "/verification.perf.budgets")
	if err != nil {
		return &Budgets{}, nil // no budgets: nothing to check
	}
	var b Budgets
	if err := json.Unmarshal(data, &b); err != nil {
		return nil, fmt.Errorf("perf budgets: %w", err)
	}
	return &b, nil
}

// Check validates measured metrics against budgets.
func Check(runID string, b *Budgets, measured map[string]float64) []core.Evidence {
	var out []core.Evidence
	for _, line := range b.Lines {
		v, ok := measured[line.Metric]
		ev := core.Evidence{
			Kind: core.EvPerformance, Source: "perf-engine",
			Target: "perf:" + line.Name, Confidence: 0.9, RunID: runID,
		}
		if !ok {
			ev.Message = fmt.Sprintf("budget %q (%s): no measured value", line.Name, line.Metric)
			ev.Severity = core.SevMedium
		} else if v > line.Max {
			ev.Message = fmt.Sprintf("budget %q (%s): measured %.2f exceeds max %.2f (regression)", line.Name, line.Metric, v, line.Max)
			ev.Severity = core.SevHigh
		} else if line.Min > 0 && v < line.Min {
			ev.Message = fmt.Sprintf("budget %q (%s): measured %.2f below min %.2f (suspiciously fast — fake success?)", line.Name, line.Metric, v, line.Min)
			ev.Severity = core.SevMedium
		} else {
			ev.Message = fmt.Sprintf("budget %q (%s): measured %.2f within [%.2f, %.2f]", line.Name, line.Metric, v, line.Min, line.Max)
			ev.Severity = core.SevInfo
		}
		ev.SHA256 = ev.Hash()
		out = append(out, ev)
	}
	return out
}

// Baseline maps metric names to previous-run values.
type Baseline map[string]float64

// LoadBaseline reads goldens/baseline.json.
func LoadBaseline(root string) (Baseline, error) {
	data, err := os.ReadFile(root + "/goldens/baseline.json")
	if err != nil {
		return Baseline{}, nil
	}
	var b Baseline
	err = json.Unmarshal(data, &b)
	return b, err
}

// Delta produces evidence for metric deltas vs baseline (regression detection).
func Delta(runID string, base Baseline, measured map[string]float64, tolerancePct float64) []core.Evidence {
	var out []core.Evidence
	for metric, old := range base {
		now, ok := measured[metric]
		if !ok {
			continue
		}
		if old <= 0 {
			continue
		}
		change := (now - old) / old * 100
		if change > tolerancePct {
			out = append(out, core.Evidence{
				Kind: core.EvRegression, Source: "perf-engine", Target: "perf:" + metric,
				Message:  fmt.Sprintf("%s regressed %.1f%% vs baseline (%.2f -> %.2f)", metric, change, old, now),
				Severity: core.SevHigh, Confidence: 0.9, RunID: runID,
			})
		}
	}
	return out
}
