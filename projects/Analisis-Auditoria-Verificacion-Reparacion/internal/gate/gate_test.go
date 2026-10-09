package gate

import (
	"testing"

	"verificationengine/internal/core"
	"verificationengine/internal/truthmodel"
)

func TestGatePassesCleanProject(t *testing.T) {
	m := truthmodel.NewModel()
	_ = m.Add(&truthmodel.Entity{ID: "REQ-1", Type: truthmodel.EntityRequirement})
	_ = m.Add(&truthmodel.Entity{ID: "comp:api", Type: truthmodel.EntityComponent})
	_ = m.Link("comp:api", "REQ-1")
	_ = m.Add(&truthmodel.Entity{ID: "func:Do", Type: truthmodel.EntityFunction, Requirements: []string{"REQ-1"}})
	_ = m.Add(&truthmodel.Entity{ID: "test:TestDo", Type: truthmodel.EntityTest, Requirements: []string{"REQ-1"}})
	req, _ := m.Get("REQ-1")
	req.RuntimeObservations = []string{"EV-1"}
	req.Evidence = []string{"EV-1"}

	res := Evaluate(DefaultConfig(), []core.Evidence{
		{ID: "EV-1", Severity: core.SevInfo, Message: "probe ok"},
	}, m)
	if res.Decision != Pass {
		t.Fatalf("expected PASS, got %s: %v", res.Decision, res.Reasons)
	}
}

func TestGateBlocksOnSeverity(t *testing.T) {
	m := truthmodel.NewModel()
	evs := []core.Evidence{{ID: "EV-2", Severity: core.SevCritical, Message: "placeholder"}}
	res := Evaluate(DefaultConfig(), evs, m)
	if res.Decision != Fail {
		t.Fatalf("expected FAIL, got %s", res.Decision)
	}
	if len(res.Blocking) == 0 {
		t.Fatal("expected blocking evidence")
	}
}

func TestGateInconclusiveWithoutEvidence(t *testing.T) {
	m := truthmodel.NewModel()
	res := Evaluate(DefaultConfig(), nil, m)
	if res.Decision != Inconclusive {
		t.Fatalf("expected INCONCLUSIVE, got %s", res.Decision)
	}
}

func TestGateBlocksBrokenTrace(t *testing.T) {
	m := truthmodel.NewModel()
	_ = m.Add(&truthmodel.Entity{ID: "REQ-X", Type: truthmodel.EntityRequirement})
	// no component/code/tests → MISSING trace → FAIL
	res := Evaluate(DefaultConfig(), []core.Evidence{{ID: "EV-3", Severity: core.SevInfo}}, m)
	if res.Decision != Fail {
		t.Fatalf("expected FAIL for broken trace, got %s (%v)", res.Decision, res.Reasons)
	}
}
