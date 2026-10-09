// Package rules implements static structural rules executed over the parser
// output: placeholders, dead code, unconnected routes, secrets, dangerous
// patterns, weak tests, concurrency hazards and AI-agent risks.
// Every rule returns core.Evidence.
package rules

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"verificationengine/internal/core"
	"verificationengine/internal/parser"
)

// runCtx carries per-run identity into rules.
type runCtx struct{ runID string }

// Rule is one structural rule declaration (id + metadata + check fn).
type Rule struct {
	ID         string
	Name       string
	Severity   core.Severity
	Confidence float64
	CWE        string
	Check      func(ctx *runCtx, scan *parser.ScanResult, root string) ([]core.Evidence, error)
}

// Rule IDs.
const (
	RulePlaceholder    = "R0100"
	RuleDeadCode       = "R0200"
	RuleUnconnected    = "R0300"
	RuleSecrets        = "R0400"
	RuleDangerous      = "R0500"
	RuleWeakTests      = "R0600"
	RuleConcurrency    = "R0700"
	RuleAgentLoop      = "R0800"
	RuleAgentPerms     = "R0810"
	RulePromptInject   = "R0820"
	RuleFlakyTest      = "R0900"
	RuleConfigMismatch = "R0910"
)

// AllRules returns every structural rule in deterministic order.
func AllRules() []Rule {
	return []Rule{
		{ID: RulePlaceholder, Name: "placeholder", Severity: core.SevCritical, Confidence: 0.95, CWE: "CWE-1188",
			Check: (*runCtx).r0100},
		{ID: RuleDeadCode, Name: "dead-code", Severity: core.SevLow, Confidence: 0.7,
			Check: (*runCtx).r0200},
		{ID: RuleUnconnected, Name: "unconnected-route", Severity: core.SevHigh, Confidence: 0.85,
			Check: (*runCtx).r0300},
		{ID: RuleSecrets, Name: "secrets", Severity: core.SevCritical, Confidence: 0.9, CWE: "CWE-798",
			Check: (*runCtx).r0400},
		{ID: RuleDangerous, Name: "dangerous-patterns", Severity: core.SevMedium, Confidence: 0.8,
			Check: (*runCtx).r0500},
		{ID: RuleWeakTests, Name: "weak-tests", Severity: core.SevMedium, Confidence: 0.85,
			Check: (*runCtx).r0600},
		{ID: RuleConcurrency, Name: "concurrency-hazards", Severity: core.SevMedium, Confidence: 0.75, CWE: "CWE-366",
			Check: (*runCtx).r0700},
		{ID: RuleAgentLoop, Name: "agent-unbounded-loop", Severity: core.SevHigh, Confidence: 0.8, CWE: "CWE-674",
			Check: (*runCtx).r0800},
		{ID: RuleAgentPerms, Name: "agent-permission-violation", Severity: core.SevCritical, Confidence: 0.85, CWE: "CWE-250",
			Check: (*runCtx).r0810},
		{ID: RulePromptInject, Name: "prompt-injection-sink", Severity: core.SevHigh, Confidence: 0.8, CWE: "CWE-74",
			Check: (*runCtx).r0820},
		{ID: RuleFlakyTest, Name: "flaky-test-pattern", Severity: core.SevMedium, Confidence: 0.8,
			Check: (*runCtx).r0900},
		{ID: RuleConfigMismatch, Name: "configuration-mismatch", Severity: core.SevMedium, Confidence: 0.75,
			Check: (*runCtx).r0910},
	}
}

// RunAll executes all rules over a scan and returns evidence sorted deterministically.
func RunAll(runID string, scan *parser.ScanResult, root string) ([]core.Evidence, error) {
	ctx := &runCtx{runID: runID}
	var out []core.Evidence
	for _, r := range AllRules() {
		evs, err := r.Check(ctx, scan, root)
		if err != nil {
			return nil, fmt.Errorf("rule %s: %w", r.ID, err)
		}
		out = append(out, evs...)
	}
	sortEvs(out)
	return out, nil
}

func (ctx *runCtx) newEv(rule, target, location, msg string, sev core.Severity, kind core.EvidenceKind, cwe string) core.Evidence {
	ev := core.Evidence{
		Kind:       kind,
		Source:     "static-rules",
		Rule:       rule,
		Target:     target,
		Location:   location,
		Message:    msg,
		Severity:   sev,
		Confidence: 0.9,
		CWE:        cwe,
		RunID:      ctx.runID,
	}
	ev.SHA256 = ev.Hash()
	return ev
}

// ---------------------------------------------------------------------------
// R0100 — placeholder / fake implementation detection (spec §95)
// ---------------------------------------------------------------------------

var placeholderPatterns = []struct {
	re  *regexp.Regexp
	sev core.Severity
}{
	{regexp.MustCompile(`panic\(\s*"(not implemented|unimplemented|TODO|FIXME)[^"]*"`), core.SevCritical},
	{regexp.MustCompile(`(?i)throw\s+new\s+Error\(\s*["'](not implemented|unimplemented|TODO|FIXME)`), core.SevCritical},
	{regexp.MustCompile(`(?i)^\s*(//|#)?\s*(TODO|FIXME)\b`), core.SevMedium},
	{regexp.MustCompile(`(?i)\bnot implemented\b|\bunimplemented\b`), core.SevMedium},
	{regexp.MustCompile(`(?i)pass\s*$`), core.SevLow}, // python stub bodies
}

func (ctx *runCtx) r0100(scan *parser.ScanResult, root string) ([]core.Evidence, error) {
	var out []core.Evidence
	for path := range scan.Files {
		if strings.HasSuffix(path, "_test.go") {
			continue // fixtures live in tests; placeholder rules target product code
		}
		data, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		lines := strings.Split(string(data), "\n")
		for i, line := range lines {
			for _, pp := range placeholderPatterns {
				if pp.re.MatchString(line) {
					out = append(out, ctx.newEv(RulePlaceholder, path, fmt.Sprintf("%s:%d", path, i+1),
						fmt.Sprintf("placeholder pattern: %s", strings.TrimSpace(line)), pp.sev, core.EvStaticAnalysis, "CWE-1188"))
					break
				}
			}
		}
	}
	return out, nil
}

// ---------------------------------------------------------------------------
// R0200 — dead code: unexported funcs with zero inbound references
// ---------------------------------------------------------------------------

func (ctx *runCtx) r0200(scan *parser.ScanResult, root string) ([]core.Evidence, error) {
	var out []core.Evidence
	for _, fn := range scan.Funcs {
		if fn.IsTest || fn.Exported || strings.HasSuffix(fn.File, "_test.go") {
			continue
		}
		ref := fn.Name
		if fn.Recv != "" {
			ref = fn.Recv + "." + fn.Name
		}
		// 1 reference = its own declaration only.
		if scan.InboundRefs(ref) <= 1 {
			out = append(out, ctx.newEv(RuleDeadCode, ref, fmt.Sprintf("%s:%d", fn.File, fn.Line),
				"dead code candidate: no inbound references", core.SevLow, core.EvStaticAnalysis, ""))
		}
	}
	return out, nil
}

// ---------------------------------------------------------------------------
// R0300 — unconnected routes: registered route, no handler func found
// ---------------------------------------------------------------------------

func (ctx *runCtx) r0300(scan *parser.ScanResult, root string) ([]core.Evidence, error) {
	var out []core.Evidence
	for _, rt := range scan.Routes {
		if strings.HasSuffix(rt.File, "_test.go") {
			continue // route fixtures inside tests are not product wiring
		}
		// Heuristic: a handler named after the route path's last segment.
		seg := rt.Path
		if idx := strings.LastIndex(seg, "/"); idx >= 0 {
			seg = seg[idx+1:]
		}
		seg = strings.Split(seg, ":")[0]
		seg = strings.Split(seg, "{")[0]
		seg = strings.Trim(seg, "/")
		candidate := strings.Title(strings.ReplaceAll(strings.ReplaceAll(seg, "-", "_"), ".", "_")) + "Handler"
		found := false
		for _, fn := range scan.Funcs {
			if fn.Name == candidate || fn.Name == seg {
				found = true
				break
			}
			if fn.Recv != "" && fn.Name == candidate {
				found = true
				break
			}
		}
		if !found {
			out = append(out, ctx.newEv(RuleUnconnected, fmt.Sprintf("%s %s", rt.Method, rt.Path),
				fmt.Sprintf("%s:%d", rt.File, rt.Line),
				fmt.Sprintf("route %q %q registered without matching handler %q", rt.Method, rt.Path, candidate),
				core.SevHigh, core.EvStaticAnalysis, ""))
		}
	}
	return out, nil
}

// ---------------------------------------------------------------------------
// R0400 — secrets in code
// ---------------------------------------------------------------------------

var secretPatterns = []struct {
	re  *regexp.Regexp
	cwe string
}{
	{regexp.MustCompile(`ghp_[A-Za-z0-9]{20,}`), "CWE-798"},
	{regexp.MustCompile(`AKIA[0-9A-Z]{16}`), "CWE-798"},
	{regexp.MustCompile(`-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----`), "CWE-321"},
	{regexp.MustCompile(`(?i)(api[_-]?key|secret|password|token)\s*[:=]\s*["'][^"']{12,}["']`), "CWE-798"},
	{regexp.MustCompile(`(?i)postgres(ql)?://[^"'\s]*:[^"'\s@]+@`), "CWE-798"},
	{regexp.MustCompile(`(?i)mysql://[^"'\s]*:[^"'\s@]+@`), "CWE-798"},
}

func (ctx *runCtx) r0400(scan *parser.ScanResult, root string) ([]core.Evidence, error) {
	var out []core.Evidence
	for path := range scan.Files {
		if strings.HasSuffix(path, "_test.go") {
			continue // test fixtures intentionally contain fake secrets
		}
		data, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		lines := strings.Split(string(data), "\n")
		for i, line := range lines {
			for _, sp := range secretPatterns {
				if sp.re.MatchString(line) {
					out = append(out, ctx.newEv(RuleSecrets, path, fmt.Sprintf("%s:%d", path, i+1),
						fmt.Sprintf("possible secret: %s", sp.cwe), core.SevCritical, core.EvSecurity, sp.cwe))
					break
				}
			}
		}
	}
	return out, nil
}

// ---------------------------------------------------------------------------
// R0500 — dangerous patterns
// ---------------------------------------------------------------------------

var dangerousPatterns = []struct {
	re  *regexp.Regexp
	cwe string
}{
	{regexp.MustCompile(`(?i)\beval\s*\(`), "CWE-95"},
	{regexp.MustCompile(`(?i)\bexec\s*\(`), "CWE-78"},
	{regexp.MustCompile(`child_process`), "CWE-78"},
	{regexp.MustCompile(`(?i)shell\s*=\s*True`), "CWE-78"},
	{regexp.MustCompile(`(?i)verify\s*=\s*False`), "CWE-295"},
	{regexp.MustCompile(`InsecureSkipVerify\s*:\s*true`), "CWE-295"},
	{regexp.MustCompile(`(?i)\bmd5\s*\(|\bmd5\.`), "CWE-327"},
	{regexp.MustCompile(`(?i)\bsha1\s*\(|\bsha1\.`), "CWE-327"},
	{regexp.MustCompile(`math/rand`), "CWE-338"},
}

func (ctx *runCtx) r0500(scan *parser.ScanResult, root string) ([]core.Evidence, error) {
	var out []core.Evidence
	for path := range scan.Files {
		data, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		lines := strings.Split(string(data), "\n")
		for i, line := range lines {
			for _, dp := range dangerousPatterns {
				if dp.re.MatchString(line) {
					out = append(out, ctx.newEv(RuleDangerous, path, fmt.Sprintf("%s:%d", path, i+1),
						fmt.Sprintf("dangerous pattern (%s): %s", dp.cwe, strings.TrimSpace(line)),
						core.SevMedium, core.EvSecurity, dp.cwe))
					break
				}
			}
		}
	}
	return out, nil
}

// ---------------------------------------------------------------------------
// R0600 — weak tests: test funcs with no assertions
// ---------------------------------------------------------------------------

func (ctx *runCtx) r0600(scan *parser.ScanResult, root string) ([]core.Evidence, error) {
	var out []core.Evidence
	for _, f := range scan.TestFiles {
		data, err := os.ReadFile(f)
		if err != nil {
			continue
		}
		lines := strings.Split(string(data), "\n")
		inTest := false
		var testLine int
		var testName string
		var asserts int
		flush := func() {
			if inTest && asserts == 0 {
				out = append(out, ctx.newEv(RuleWeakTests, testName, fmt.Sprintf("%s:%d", f, testLine),
					"test has no assertions (weak test)", core.SevMedium, core.EvSemanticAudit, ""))
			}
			inTest = false
			asserts = 0
		}
		for i, line := range lines {
			if !inTest && testFuncRe.MatchString(line) {
				inTest = true
				testName = testFuncRe.FindStringSubmatch(line)[1]
				testLine = i + 1
				asserts = 0
				continue
			}
			if inTest {
				if strings.HasPrefix(line, "}") {
					flush()
					continue
				}
				if assertRe.MatchString(line) {
					asserts++
				}
			}
		}
		flush()
	}
	return out, nil
}

var testFuncRe = regexp.MustCompile(`^func\s+(Test\w+)\s*\(`)
var assertRe = regexp.MustCompile(`t\.Fatal|t\.Error|require\.|assert\.|\bwant\b|\bgot\b|\.Equal\(|\.NoError\(|\.Nil\(|\.True\(|\.False\(`)

// ---------------------------------------------------------------------------
// R0700 — concurrency hazards
// ---------------------------------------------------------------------------

var concurrencyPatterns = []struct {
	re  *regexp.Regexp
	cwe string
}{
	{regexp.MustCompile(`\bgo\s+func\s*\(`), "CWE-366"},
	{regexp.MustCompile(`\bgo\s+\w+\.\w+\(`), "CWE-366"},
}

func (ctx *runCtx) r0700(scan *parser.ScanResult, root string) ([]core.Evidence, error) {
	var out []core.Evidence
	for path := range scan.Files {
		data, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		lines := strings.Split(string(data), "\n")
		for i, line := range lines {
			for _, cp := range concurrencyPatterns {
				if cp.re.MatchString(line) {
					out = append(out, ctx.newEv(RuleConcurrency, path, fmt.Sprintf("%s:%d", path, i+1),
						"concurrency hazard: goroutine launch needs bounded concurrency + synchronization review",
						core.SevMedium, core.EvStaticAnalysis, cp.cwe))
					break
				}
			}
		}
	}
	return out, nil
}

// ---------------------------------------------------------------------------
// R0800 — unbounded agent loops (riesgo específico de agentes IA)
// ---------------------------------------------------------------------------

var agentLoopPatterns = []*regexp.Regexp{
	regexp.MustCompile(`for\s*\{`), // bare infinite loop; needs explicit bound check nearby
}

func (ctx *runCtx) r0800(scan *parser.ScanResult, root string) ([]core.Evidence, error) {
	var out []core.Evidence
	for path := range scan.Files {
		if strings.HasSuffix(path, "_test.go") {
			continue // agent-loop rule targets product code, not test fixtures
		}
		data, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		lines := strings.Split(string(data), "\n")
		for i, line := range lines {
			if agentLoopPatterns[0].MatchString(line) {
				// Look ahead 8 lines for a bound/limit/cancel guard. A bare
				// decode-and-break loop is bounded; only unguarded loops fire.
				bounded := false
				for j := i + 1; j < len(lines) && j <= i+8; j++ {
					l := strings.ToLower(lines[j])
					if strings.Contains(l, "maxiteration") || strings.Contains(l, "max_iteration") ||
						strings.Contains(l, "budget") || strings.Contains(l, "deadline") ||
						strings.Contains(l, "ctx.done") || strings.Contains(l, "select {") ||
						strings.Contains(l, "break") {
						bounded = true
						break
					}
				}
				if !bounded {
					out = append(out, ctx.newEv(RuleAgentLoop, path, fmt.Sprintf("%s:%d", path, i+1),
						"unbounded loop without visible iteration bound, budget or cancelation — agent loop risk",
						core.SevHigh, core.EvStaticAnalysis, "CWE-674"))
				}
			}
		}
	}
	return out, nil
}

// ---------------------------------------------------------------------------
// R0810 — tool permission violations (agent may exceed declared permissions)
// ---------------------------------------------------------------------------

// PermDecl declares an agent permission in a manifest file (agent.yaml).
type PermDecl struct {
	Tools []string `json:"tools"`
	Paths []string `json:"paths"`
}

var fsWritePatterns = []*regexp.Regexp{
	regexp.MustCompile(`(?i)os\.WriteFile|os\.Create|os\.Remove|os\.RemoveAll`),
	regexp.MustCompile(`(?i)filepath\.WalkDir`),
}

func (ctx *runCtx) r0810(scan *parser.ScanResult, root string) ([]core.Evidence, error) {
	var out []core.Evidence
	// If an agent.yaml manifest exists, check code against declared paths.
	manifestPaths := map[string]bool{}
	if data, err := os.ReadFile(filepath.Join(root, "agent.yaml")); err == nil {
		for _, m := range pathRe.FindAllStringSubmatch(string(data), -1) {
			manifestPaths[m[1]] = true
		}
	}
	for path := range scan.Files {
		data, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		lines := strings.Split(string(data), "\n")
		for i, line := range lines {
			for _, re := range fsWritePatterns {
				if re.MatchString(line) && len(manifestPaths) > 0 {
					covered := false
					for p := range manifestPaths {
						if strings.HasPrefix(path, p) {
							covered = true
							break
						}
					}
					if !covered {
						out = append(out, ctx.newEv(RuleAgentPerms, path, fmt.Sprintf("%s:%d", path, i+1),
							"filesystem write outside declared agent permissions", core.SevCritical,
							core.EvSecurity, "CWE-250"))
						break
					}
				}
			}
		}
	}
	return out, nil
}

var pathRe = regexp.MustCompile(`(?m)^\s*-\s*"?([\w./\\-]+)"?\s*$`)

// ---------------------------------------------------------------------------
// R0820 — prompt injection sinks (untrusted content flows into prompts)
// ---------------------------------------------------------------------------

var promptInjectPatterns = []struct {
	re  *regexp.Regexp
	cwe string
}{
	{regexp.MustCompile(`(?i)prompt\s*:=\s*"[^"]*"\s*\+`), "CWE-74"},
	{regexp.MustCompile(`(?i)prompt\s*(\+|\+=|=)\s*[^;\n]*(input|request|user|body|query|\breq\b)`), "CWE-74"},
	{regexp.MustCompile(`(?i)fmt\.Sprintf\(\s*"[^"]*%s[^"]*"\s*,\s*(req|input|user|body)`), "CWE-74"},
}

func (ctx *runCtx) r0820(scan *parser.ScanResult, root string) ([]core.Evidence, error) {
	var out []core.Evidence
	for path := range scan.Files {
		data, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		lines := strings.Split(string(data), "\n")
		for i, line := range lines {
			for _, pp := range promptInjectPatterns {
				if pp.re.MatchString(line) {
					out = append(out, ctx.newEv(RulePromptInject, path, fmt.Sprintf("%s:%d", path, i+1),
						"possible prompt injection sink: untrusted input concatenated into prompt",
						core.SevHigh, core.EvSecurity, pp.cwe))
					break
				}
			}
		}
	}
	return out, nil
}

// ---------------------------------------------------------------------------
// R0900 — flaky test patterns: randomness / sleeps inside tests
// ---------------------------------------------------------------------------

var flakyPatterns = []*regexp.Regexp{
	regexp.MustCompile(`time\.Sleep\(`),
	regexp.MustCompile(`math/rand`),
}

func (ctx *runCtx) r0900(scan *parser.ScanResult, root string) ([]core.Evidence, error) {
	var out []core.Evidence
	for _, f := range scan.TestFiles {
		data, err := os.ReadFile(f)
		if err != nil {
			continue
		}
		lines := strings.Split(string(data), "\n")
		for i, line := range lines {
			for _, re := range flakyPatterns {
				if re.MatchString(line) {
					out = append(out, ctx.newEv(RuleFlakyTest, f, fmt.Sprintf("%s:%d", f, i+1),
						"flaky test pattern: nondeterminism (sleep/rand) inside test",
						core.SevMedium, core.EvSemanticAudit, ""))
					break
				}
			}
		}
	}
	return out, nil
}

// ---------------------------------------------------------------------------
// R0910 — configuration mismatch: env vars read in code but undeclared
// ---------------------------------------------------------------------------

var envReadRe = regexp.MustCompile(`os\.Getenv\("([A-Z0-9_]+)"\)|LookupEnv\("([A-Z0-9_]+)"\)`)

func (ctx *runCtx) r0910(scan *parser.ScanResult, root string) ([]core.Evidence, error) {
	var out []core.Evidence
	envExample := filepath.Join(root, ".env.example")
	data, err := os.ReadFile(envExample)
	if err != nil {
		return nil, nil // no declared env contract: nothing to mismatch against
	}
	declared := map[string]bool{}
	for _, m := range envKeyRe.FindAllStringSubmatch(string(data), -1) {
		declared[m[1]] = true
	}
	for path := range scan.Files {
		src, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		lines := strings.Split(string(src), "\n")
		for i, line := range lines {
			for _, m := range envReadRe.FindAllStringSubmatch(line, -1) {
				key := m[1]
				if key == "" {
					key = m[2]
				}
				if key != "" && !declared[key] {
					out = append(out, ctx.newEv(RuleConfigMismatch, path, fmt.Sprintf("%s:%d", path, i+1),
						fmt.Sprintf("env var %q read by code but absent from .env.example (configuration mismatch)", key),
						core.SevMedium, core.EvStaticAnalysis, ""))
				}
			}
		}
	}
	return out, nil
}

var envKeyRe = regexp.MustCompile(`(?m)^([A-Z0-9_]+)=`)

// sortEvs orders evidence deterministically.
func sortEvs(evs []core.Evidence) {
	sort.Slice(evs, func(i, j int) bool {
		if evs[i].Rule != evs[j].Rule {
			return evs[i].Rule < evs[j].Rule
		}
		return evs[i].Location < evs[j].Location
	})
}
