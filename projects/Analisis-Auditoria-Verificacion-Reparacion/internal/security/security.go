// Package security aggregates security evidence: secrets, dangerous patterns
// (from static rules), dependency vulnerabilities (external scanners), and
// severity aggregation for the quality gate.
package security

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"verificationengine/internal/core"
)

// ScannerFinding is a normalized external scanner finding.
type ScannerFinding struct {
	Tool     string `json:"tool"`
	ID       string `json:"id"` // CVE / OSV / GHSA id
	Package  string `json:"package"`
	Severity string `json:"severity"`
	Title    string `json:"title"`
}

// NormalizeScanner parses common JSON scanner outputs (osv-scanner style).
func NormalizeScanner(tool string, raw []byte) ([]core.Evidence, error) {
	var out []core.Evidence
	switch tool {
	case "osv-scanner":
		var doc struct {
			Results []struct {
				Source struct {
					Path string `json:"path"`
				} `json:"source"`
				Packages []struct {
					Package struct {
						Name string `json:"name"`
					} `json:"package"`
					Vulnerabilities []struct {
						ID       string `json:"id"`
						Summary  string `json:"summary"`
						Severity []struct {
							Type  string `json:"type"`
							Score string `json:"score"`
						} `json:"severity"`
					} `json:"vulnerabilities"`
				} `json:"packages"`
			} `json:"results"`
		}
		if err := json.Unmarshal(raw, &doc); err != nil {
			return nil, fmt.Errorf("osv-scanner json: %w", err)
		}
		for _, r := range doc.Results {
			for _, p := range r.Packages {
				for _, v := range p.Vulnerabilities {
					sev := core.SevHigh
					for _, s := range v.Severity {
						if strings.HasPrefix(strings.ToUpper(s.Score), "9") || strings.HasPrefix(strings.ToUpper(s.Score), "10") || strings.Contains(strings.ToLower(v.Summary), "critical") {
							sev = core.SevCritical
						}
					}
					out = append(out, core.Evidence{
						Kind: core.EvSecurity, Source: "osv-scanner", ToolVersion: "external",
						Target: "dependency:" + p.Package.Name, Message: fmt.Sprintf("%s: %s", v.ID, v.Summary),
						Severity: sev, Confidence: 0.95, OSV: v.ID,
					})
				}
			}
		}
	default:
		return nil, fmt.Errorf("unknown scanner tool %q", tool)
	}
	return out, nil
}

// Summary aggregates a run's security posture.
type Summary struct {
	MaxSeverity       core.Severity `json:"max_severity"`
	Secrets           int           `json:"secrets"`
	Vulnerabilities   int           `json:"vulnerabilities"`
	DangerousPatterns int           `json:"dangerous_patterns"`
	Total             int           `json:"total"`
}

// Summarize computes the security summary from a set of evidence.
func Summarize(evs []core.Evidence) Summary {
	s := Summary{MaxSeverity: core.SevInfo}
	for _, ev := range evs {
		if ev.Kind != core.EvSecurity {
			continue
		}
		s.Total++
		s.MaxSeverity = core.MaxSeverity(s.MaxSeverity, ev.Severity)
		if ev.Rule == "R0400" {
			s.Secrets++
		}
		if ev.OSV != "" {
			s.Vulnerabilities++
		}
		if ev.Rule == "R0500" {
			s.DangerousPatterns++
		}
	}
	return s
}

// SortBySeverity returns findings ordered worst-first deterministically.
func SortBySeverity(evs []core.Evidence) []core.Evidence {
	out := append([]core.Evidence(nil), evs...)
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].Severity.Rank() != out[j].Severity.Rank() {
			return out[i].Severity.Rank() > out[j].Severity.Rank()
		}
		return out[i].ID < out[j].ID
	})
	return out
}
