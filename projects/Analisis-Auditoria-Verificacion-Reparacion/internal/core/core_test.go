package core

import (
	"os"
	"path/filepath"
	"testing"
)

func TestMaturityOrdering(t *testing.T) {
	if !(L0NotFound < L8ProductionVerified) {
		t.Fatal("maturity ordering broken")
	}
	m, err := ParseMaturity("L6 RUNTIME_VERIFIED")
	if err != nil || m != L6RuntimeVerified {
		t.Fatalf("parse maturity: %v %v", m, err)
	}
	m, err = ParseMaturity("L7")
	if err != nil || m != L7AdversariallyVerified {
		t.Fatalf("parse L7: %v %v", m, err)
	}
	if _, err := ParseMaturity("bogus"); err == nil {
		t.Fatal("expected error for bogus maturity")
	}
}

func TestEvidenceHashDeterministic(t *testing.T) {
	e1 := Evidence{Kind: EvStaticAnalysis, Source: "x", Target: "t", Message: "m", Severity: SevHigh, Confidence: 0.9}
	e2 := e1
	if e1.Hash() != e2.Hash() {
		t.Fatal("hash not deterministic")
	}
	e3 := e1
	e3.Message = "other"
	if e1.Hash() == e3.Hash() {
		t.Fatal("hash collision on different content")
	}
}

func TestEvidenceStoreRoundTrip(t *testing.T) {
	dir := t.TempDir()
	store, err := NewEvidenceStore(dir)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	if err := store.BeginRun("run-1", "/tmp/proj"); err != nil {
		t.Fatal(err)
	}
	ev := Evidence{
		Kind: EvTestRun, Source: "gotest-adapter", Target: "test:TestFoo",
		Message: "test failed: TestFoo", Severity: SevHigh, Confidence: 1, RunID: "run-1",
	}
	if err := store.Add(&ev); err != nil {
		t.Fatal(err)
	}
	if ev.ID == "" || ev.SHA256 == "" {
		t.Fatal("Add must assign ID and SHA256")
	}
	got, err := store.Query("run-1", "test:TestFoo", SevHigh)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got[0].Message != ev.Message {
		t.Fatalf("query mismatch: %+v", got)
	}
	// JSONL file exists and has one line.
	data, err := os.ReadFile(filepath.Join(dir, "evidence.jsonl"))
	if err != nil {
		t.Fatal(err)
	}
	if len(data) == 0 || data[len(data)-1] != '\n' {
		t.Fatal("jsonl must be newline-terminated")
	}
	// Severity filter excludes lower severities.
	all, err := store.Query("run-1", "", SevCritical)
	if err != nil {
		t.Fatal(err)
	}
	if len(all) != 0 {
		t.Fatalf("severity filter broken: %d", len(all))
	}
	if MaxSeverity(store.MaxSeverityRun("run-1"), SevInfo) != SevHigh {
		t.Fatal("max severity of run should be HIGH")
	}
}
