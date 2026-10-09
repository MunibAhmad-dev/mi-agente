package runtime

import (
	"net"
	"testing"

	"verificationengine/internal/core"
)

func TestTCPProbeLiveAndDead(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Skip("no loopback listener available")
	}
	defer ln.Close()
	addr := ln.Addr().String()

	results := Probe("run-probe", []ProbeTarget{
		{Name: "live", Kind: "tcp", Address: addr},
		{Name: "dead", Kind: "tcp", Address: "127.0.0.1:1"}, // reserved port, nothing listens
	})
	if len(results) != 2 {
		t.Fatalf("expected 2 results, got %d", len(results))
	}
	byName := map[string]ProbeResult{}
	for _, r := range results {
		byName[r.Target.Name] = r
	}
	if !byName["live"].OK {
		t.Fatalf("live listener must pass: %+v", byName["live"])
	}
	if byName["dead"].OK {
		t.Fatal("closed port must fail")
	}

	evs := ToEvidence("run-probe", results)
	var sawFail bool
	for _, ev := range evs {
		if ev.Kind != core.EvRuntimeProbe {
			t.Fatalf("wrong kind: %+v", ev)
		}
		if ev.Severity == core.SevHigh {
			sawFail = true
		}
	}
	if !sawFail {
		t.Fatal("failed probe must produce HIGH severity evidence")
	}
}
