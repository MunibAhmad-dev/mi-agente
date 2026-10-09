package regression

import (
	"testing"

	"verificationengine/internal/core"
)

func TestCompareDetectsRegressionAndRepair(t *testing.T) {
	base := Baseline{Items: []BaselineItem{
		{ID: "test:TestA", Status: "pass"},
		{ID: "test:TestB", Status: "fail"},
	}}
	current := map[string]string{"test:TestA": "fail", "test:TestB": "pass"}
	regs, reps := Compare("run-reg", base, current)
	if len(regs) != 1 || regs[0].Target != "test:TestA" || regs[0].Severity != core.SevCritical {
		t.Fatalf("regressions mismatch: %+v", regs)
	}
	if len(reps) != 1 || reps[0].Target != "test:TestB" {
		t.Fatalf("repairs mismatch: %+v", reps)
	}
}

func TestNewItemsAreNotRegressions(t *testing.T) {
	base := Baseline{}
	current := map[string]string{"test:New": "fail"}
	regs, _ := Compare("run-reg", base, current)
	if len(regs) != 0 {
		t.Fatalf("new failing items are not regressions (baseline empty): %+v", regs)
	}
}
