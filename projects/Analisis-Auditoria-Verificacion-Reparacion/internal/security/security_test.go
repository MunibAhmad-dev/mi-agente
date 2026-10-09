package security

import (
	"testing"

	"verificationengine/internal/core"
)

func TestSummarizeCountsSecurityKinds(t *testing.T) {
	evs := []core.Evidence{
		{Kind: core.EvSecurity, Rule: "R0400", Severity: core.SevCritical},
		{Kind: core.EvSecurity, Rule: "R0500", Severity: core.SevMedium},
		{Kind: core.EvSecurity, OSV: "GHSA-xxxx", Severity: core.SevHigh},
		{Kind: core.EvTestRun, Severity: core.SevCritical}, // not security
	}
	s := Summarize(evs)
	if s.Secrets != 1 || s.DangerousPatterns != 1 || s.Vulnerabilities != 1 || s.Total != 3 {
		t.Fatalf("summary mismatch: %+v", s)
	}
	if s.MaxSeverity != core.SevCritical {
		t.Fatalf("max severity: %s", s.MaxSeverity)
	}
}

func TestNormalizeOSVScanner(t *testing.T) {
	raw := []byte(`{"results":[{"source":{"path":"go.mod"},"packages":[{"package":{"name":"badpkg"},"vulnerabilities":[{"id":"GHSA-1234","summary":"critical RCE","severity":[{"type":"CVSS_V3","score":"9.8"}]}]}]}]}`)
	evs, err := NormalizeScanner("osv-scanner", raw)
	if err != nil {
		t.Fatal(err)
	}
	if len(evs) != 1 {
		t.Fatalf("expected 1 finding, got %d", len(evs))
	}
	if evs[0].OSV != "GHSA-1234" || evs[0].Severity != core.SevCritical {
		t.Fatalf("finding mismatch: %+v", evs[0])
	}
}

func TestSortBySeverityDeterministic(t *testing.T) {
	evs := []core.Evidence{
		{ID: "B", Severity: core.SevMedium},
		{ID: "A", Severity: core.SevCritical},
		{ID: "C", Severity: core.SevMedium},
	}
	sorted := SortBySeverity(evs)
	if sorted[0].ID != "A" || sorted[1].ID != "B" || sorted[2].ID != "C" {
		t.Fatalf("sort broken: %+v", sorted)
	}
}
