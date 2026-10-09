// Package runtime implements bounded runtime probes (spec §1 runtime verification):
// TCP connectivity and HTTP endpoint liveness, offline-capable, stdlib-only,
// with hard bounds on concurrency and timeout.
package runtime

import (
	"fmt"
	"net"
	"net/http"
	"sync"
	"time"

	"verificationengine/internal/core"
)

// maxConcurrentProbes bounds resource use (low memory / CPU efficient).
const maxConcurrentProbes = 8

// ProbeTarget is one probe.
type ProbeTarget struct {
	Name    string
	Kind    string // "tcp" | "http"
	Address string // host:port for tcp; full URL for http
	Timeout time.Duration
}

// ProbeResult is the outcome of one probe.
type ProbeResult struct {
	Target   ProbeTarget
	OK       bool
	Detail   string
	Duration time.Duration
}

// Probe executes a set of probes with bounded parallelism.
func Probe(runID string, targets []ProbeTarget) []ProbeResult {
	sem := make(chan struct{}, maxConcurrentProbes)
	var mu sync.Mutex
	var results []ProbeResult
	var wg sync.WaitGroup
	for _, t := range targets {
		wg.Add(1)
		go func(t ProbeTarget) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			r := probeOne(t)
			r.Target = t
			mu.Lock()
			results = append(results, r)
			mu.Unlock()
		}(t)
	}
	wg.Wait()
	return results
}

func probeOne(t ProbeTarget) ProbeResult {
	start := time.Now()
	timeout := t.Timeout
	if timeout <= 0 {
		timeout = 3 * time.Second
	}
	switch t.Kind {
	case "tcp":
		conn, err := net.DialTimeout("tcp", t.Address, timeout)
		d := time.Since(start)
		if err != nil {
			return ProbeResult{OK: false, Detail: err.Error(), Duration: d}
		}
		conn.Close()
		return ProbeResult{OK: true, Detail: "connected", Duration: d}
	case "http":
		client := http.Client{Timeout: timeout}
		resp, err := client.Get(t.Address)
		d := time.Since(start)
		if err != nil {
			return ProbeResult{OK: false, Detail: err.Error(), Duration: d}
		}
		defer resp.Body.Close()
		// HTTP 200 alone is NOT verification (spec): record status; caller decides.
		return ProbeResult{OK: resp.StatusCode >= 200 && resp.StatusCode < 400, Detail: fmt.Sprintf("status %d", resp.StatusCode), Duration: d}
	}
	return ProbeResult{OK: false, Detail: "unknown probe kind: " + t.Kind, Duration: time.Since(start)}
}

// ToEvidence converts probe results to evidence.
func ToEvidence(runID string, results []ProbeResult) []core.Evidence {
	out := make([]core.Evidence, 0, len(results))
	for _, r := range results {
		sev := core.SevInfo
		msg := fmt.Sprintf("probe %s %s: OK (%s, %s)", r.Target.Kind, r.Target.Address, r.Detail, r.Duration)
		if !r.OK {
			sev = core.SevHigh
			msg = fmt.Sprintf("probe %s %s: FAIL (%s, %s)", r.Target.Kind, r.Target.Address, r.Detail, r.Duration)
		}
		ev := core.Evidence{
			Kind: core.EvRuntimeProbe, Source: "runtime-probes", ToolVersion: "builtin",
			Target:  fmt.Sprintf("probe:%s:%s", r.Target.Kind, r.Target.Name),
			Message: msg, Severity: sev, Confidence: 0.95, RunID: runID,
			Payload: map[string]any{"ok": r.OK, "detail": r.Detail, "duration_ms": r.Duration.Milliseconds()},
		}
		ev.SHA256 = ev.Hash()
		out = append(out, ev)
	}
	return out
}
