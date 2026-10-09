package adapters

import (
	"strings"
	"testing"

	"verificationengine/internal/core"
)

func TestGoVetParse(t *testing.T) {
	a := &GoVetAdapter{}
	raw := []byte("# package\n./main.go:10:2: fmt.Printf format %d has arg of type string\n")
	evs, err := a.Parse(raw)
	if err != nil {
		t.Fatal(err)
	}
	if len(evs) != 1 {
		t.Fatalf("expected 1 vet finding, got %d: %+v", len(evs), evs)
	}
	if evs[0].Severity != core.SevMedium || evs[0].Kind != core.EvStaticAnalysis {
		t.Fatalf("wrong classification: %+v", evs[0])
	}
}

func TestGoTestParsePassFailSkip(t *testing.T) {
	a := &GoTestAdapter{}
	raw := []byte(strings.Join([]string{
		`{"Action":"run","Package":"x","Test":"TestA"}`,
		`{"Action":"pass","Package":"x","Test":"TestA","Elapsed":0.01}`,
		`{"Action":"run","Package":"x","Test":"TestB"}`,
		`{"Action":"fail","Package":"x","Test":"TestB","Elapsed":0.02}`,
		`{"Action":"skip","Package":"x","Test":"TestC"}`,
	}, "\n"))
	evs, err := a.Parse(raw)
	if err != nil {
		t.Fatal(err)
	}
	if len(evs) != 3 {
		t.Fatalf("expected 3 test events, got %d: %+v", len(evs), evs)
	}
	var sawFail bool
	for _, ev := range evs {
		if strings.Contains(ev.Message, "TestB") {
			sawFail = ev.Severity == core.SevHigh && ev.Kind == core.EvTestRun
		}
	}
	if !sawFail {
		t.Fatalf("failing test must be HIGH severity EvTestRun: %+v", evs)
	}
}

func TestGoTestNormalizeDedups(t *testing.T) {
	a := &GoTestAdapter{}
	evs := a.Normalize([]core.Evidence{
		{Target: "test:T1", Severity: core.SevInfo},
		{Target: "test:T1", Severity: core.SevHigh},
	})
	if len(evs) != 1 || evs[0].Severity != core.SevHigh {
		t.Fatalf("normalize must keep worst severity: %+v", evs)
	}
}
