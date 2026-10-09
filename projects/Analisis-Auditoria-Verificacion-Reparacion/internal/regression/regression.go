// Package regression implements the Regression Engine: compares the current
// run against a golden baseline; any newly failing item is a regression.
package regression

import (
	"encoding/json"
	"fmt"
	"os"

	"verificationengine/internal/core"
)

// BaselineItem is one baseline entry.
type BaselineItem struct {
	ID     string `json:"id"`     // requirement/feature/test id
	Status string `json:"status"` // pass|fail
	Detail string `json:"detail,omitempty"`
}

// Baseline is the golden state.
type Baseline struct {
	Items []BaselineItem `json:"items"`
}

// Load reads goldens/regression-baseline.json (missing file = empty baseline).
func Load(root string) (Baseline, error) {
	data, err := os.ReadFile(root + "/goldens/regression-baseline.json")
	if err != nil {
		return Baseline{}, nil
	}
	var b Baseline
	if err := json.Unmarshal(data, &b); err != nil {
		return Baseline{}, fmt.Errorf("regression baseline: %w", err)
	}
	return b, nil
}

// Compare returns regressions (was pass, now fail) and repairs (was fail, now pass).
func Compare(runID string, base Baseline, current map[string]string) (regressions, repairs []core.Evidence) {
	prev := map[string]BaselineItem{}
	for _, it := range base.Items {
		prev[it.ID] = it
	}
	for id, status := range current {
		was, existed := prev[id]
		if existed && was.Status == "pass" && status == "fail" {
			ev := core.Evidence{
				Kind: core.EvRegression, Source: "regression-engine", Target: id,
				Message:  fmt.Sprintf("regression: %s was passing in baseline, now failing", id),
				Severity: core.SevCritical, Confidence: 1.0, RunID: runID,
				Payload: map[string]any{"before": was.Status, "after": status, "baseline_detail": was.Detail},
			}
			ev.SHA256 = ev.Hash()
			regressions = append(regressions, ev)
		}
		if existed && was.Status == "fail" && status == "pass" {
			ev := core.Evidence{
				Kind: core.EvRepair, Source: "regression-engine", Target: id,
				Message:  fmt.Sprintf("repair confirmed: %s was failing in baseline, now passing", id),
				Severity: core.SevInfo, Confidence: 1.0, RunID: runID,
			}
			ev.SHA256 = ev.Hash()
			repairs = append(repairs, ev)
		}
	}
	return regressions, repairs
}

// Save writes the new baseline (after a certified run).
func Save(root string, b Baseline) error {
	if err := os.MkdirAll(root+"/goldens", 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(b, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(root+"/goldens/regression-baseline.json", data, 0o644)
}
