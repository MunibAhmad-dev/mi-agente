// Package tools registers every external tool the engine may invoke, with
// license metadata and adapter recipes (spec §3 + §14).
package tools

import "verificationengine/internal/core"

// RegistryEntry describes one external tool.
type RegistryEntry struct {
	Name         string   `json:"name"`
	Repo         string   `json:"repository"`
	Version      string   `json:"version"`
	License      string   `json:"license"`
	SPDX         string   `json:"spdx"`
	LicenseRisk  string   `json:"transitive-license-risk"` // none|low|medium|high
	RuntimeCost  string   `json:"runtime-cost"`            // low|medium|high
	SecurityRisk string   `json:"security-risk"`           // low|medium|high
	Capabilities []string `json:"capabilities"`
}

// Allowed SPDX licenses (spec §3). Anything else requires explicit review.
var AllowedLicenses = map[string]bool{
	"MIT": true, "Apache-2.0": true, "BSD-2-Clause": true,
	"BSD-3-Clause": true, "ISC": true,
}

// ProhibitedLicenses require explicit approval before integration.
var ProhibitedLicenses = map[string]bool{
	"GPL-2.0-only": true, "GPL-3.0-only": true, "LGPL-2.1-only": true,
	"LGPL-3.0-only": true, "AGPL-3.0-only": true, "MPL-2.0": true,
	"SSPL-1.0": true, "BSL-1.0": true, "Elastic-2.0": true, "Commons-Clause": true,
}

// Registry is the tool registry (spec §3 metadata per tool).
func Registry() []RegistryEntry {
	return []RegistryEntry{
		// --- Core stack ---
		{Name: "go", Repo: "https://go.dev", Version: ">=1.24", License: "BSD-3-Clause", SPDX: "BSD-3-Clause", LicenseRisk: "none", RuntimeCost: "low", SecurityRisk: "low", Capabilities: []string{"compile", "test", "vet"}},
		{Name: "sqlite", Repo: "https://github.com/modernc/sqlite", Version: "v1.46.x", License: "MIT", SPDX: "MIT", LicenseRisk: "none", RuntimeCost: "low", SecurityRisk: "low", Capabilities: []string{"evidence-store"}},
		{Name: "tree-sitter", Repo: "https://github.com/tree-sitter/tree-sitter", Version: "latest", License: "MIT", SPDX: "MIT", LicenseRisk: "none", RuntimeCost: "medium", SecurityRisk: "low", Capabilities: []string{"parsing", "ast"}},
		{Name: "ast-grep", Repo: "https://github.com/ast-grep/ast-grep", Version: "latest", License: "MIT", SPDX: "MIT", LicenseRisk: "none", RuntimeCost: "low", SecurityRisk: "low", Capabilities: []string{"structural-search", "codemods"}},
		{Name: "joern", Repo: "https://github.com/joernio/joern", Version: "latest", License: "Apache-2.0", SPDX: "Apache-2.0", LicenseRisk: "none", RuntimeCost: "high", SecurityRisk: "low", Capabilities: []string{"cpg", "taint", "dataflow"}},

		// --- Python static/dynamic ---
		{Name: "ruff", Repo: "https://github.com/astral-sh/ruff", Version: "latest", License: "MIT", SPDX: "MIT", LicenseRisk: "none", RuntimeCost: "low", SecurityRisk: "low", Capabilities: []string{"lint-python"}},
		{Name: "ty", Repo: "https://github.com/astral-sh/ty", Version: "latest", License: "MIT", SPDX: "MIT", LicenseRisk: "none", RuntimeCost: "medium", SecurityRisk: "low", Capabilities: []string{"typecheck-python"}},
		{Name: "pytest", Repo: "https://github.com/pytest-dev/pytest", Version: "latest", License: "MIT", SPDX: "MIT", LicenseRisk: "none", RuntimeCost: "medium", SecurityRisk: "low", Capabilities: []string{"test-python"}},
		{Name: "coverage.py", Repo: "https://github.com/coveragepy/coveragepy", Version: "latest", License: "Apache-2.0", SPDX: "Apache-2.0", LicenseRisk: "none", RuntimeCost: "medium", SecurityRisk: "low", Capabilities: []string{"coverage"}},

		// --- Go static/dynamic ---
		{Name: "gosec", Repo: "https://github.com/securego/gosec", Version: "latest", License: "Apache-2.0", SPDX: "Apache-2.0", LicenseRisk: "none", RuntimeCost: "medium", SecurityRisk: "low", Capabilities: []string{"security-go"}},
		{Name: "cargo-deny", Repo: "https://github.com/EmbarkStudios/cargo-deny", Version: "latest", License: "Apache-2.0", SPDX: "Apache-2.0", LicenseRisk: "none", RuntimeCost: "low", SecurityRisk: "low", Capabilities: []string{"license-check-rust", "advisories-rust"}},
		{Name: "infer", Repo: "https://github.com/facebook/infer", Version: "latest", License: "MIT", SPDX: "MIT", LicenseRisk: "none", RuntimeCost: "high", SecurityRisk: "low", Capabilities: []string{"static-analysis-bidir"}},

		// --- Contracts ---
		{Name: "openapi-diff", Repo: "https://github.com/OpenAPITools/openapi-diff", Version: "latest", License: "Apache-2.0", SPDX: "Apache-2.0", LicenseRisk: "none", RuntimeCost: "low", SecurityRisk: "low", Capabilities: []string{"api-diff"}},
		{Name: "pact-js", Repo: "https://github.com/pact-foundation/pact-js", Version: "latest", License: "MIT", SPDX: "MIT", LicenseRisk: "none", RuntimeCost: "medium", SecurityRisk: "low", Capabilities: []string{"contract-testing"}},
		{Name: "pact-python", Repo: "https://github.com/pact-foundation/pact-python", Version: "latest", License: "MIT", SPDX: "MIT", LicenseRisk: "none", RuntimeCost: "medium", SecurityRisk: "low", Capabilities: []string{"contract-testing"}},
		{Name: "asyncapi-spec", Repo: "https://github.com/asyncapi/spec", Version: "latest", License: "Apache-2.0", SPDX: "Apache-2.0", LicenseRisk: "none", RuntimeCost: "low", SecurityRisk: "low", Capabilities: []string{"async-contracts"}},
		{Name: "asyncapi-generator", Repo: "https://github.com/asyncapi/generator", Version: "latest", License: "Apache-2.0", SPDX: "Apache-2.0", LicenseRisk: "none", RuntimeCost: "medium", SecurityRisk: "low", Capabilities: []string{"async-codegen"}},

		// --- Database ---
		{Name: "goose", Repo: "https://github.com/pressly/goose", Version: "latest", License: "MIT", SPDX: "MIT", LicenseRisk: "none", RuntimeCost: "low", SecurityRisk: "low", Capabilities: []string{"migrations"}},
		{Name: "dbmate", Repo: "https://github.com/amacneil/dbmate", Version: "latest", License: "MIT", SPDX: "MIT", LicenseRisk: "none", RuntimeCost: "low", SecurityRisk: "low", Capabilities: []string{"migrations"}},

		// --- Property / E2E / visual ---
		{Name: "fast-check", Repo: "https://github.com/dubzzz/fast-check", Version: "latest", License: "MIT", SPDX: "MIT", LicenseRisk: "none", RuntimeCost: "medium", SecurityRisk: "low", Capabilities: []string{"property-testing"}},
		{Name: "playwright", Repo: "https://github.com/microsoft/playwright", Version: "latest", License: "Apache-2.0", SPDX: "Apache-2.0", LicenseRisk: "none", RuntimeCost: "high", SecurityRisk: "low", Capabilities: []string{"e2e"}},
		{Name: "reg-suit", Repo: "https://github.com/reg-viz/reg-suit", Version: "latest", License: "MIT", SPDX: "MIT", LicenseRisk: "none", RuntimeCost: "medium", SecurityRisk: "low", Capabilities: []string{"visual-regression"}},
		{Name: "lighthouse", Repo: "https://github.com/GoogleChrome/lighthouse", Version: "latest", License: "Apache-2.0", SPDX: "Apache-2.0", LicenseRisk: "none", RuntimeCost: "high", SecurityRisk: "low", Capabilities: []string{"web-audit"}},

		// --- Fuzz / mutation / formal ---
		{Name: "restler-fuzzer", Repo: "https://github.com/microsoft/restler-fuzzer", Version: "latest", License: "MIT", SPDX: "MIT", LicenseRisk: "none", RuntimeCost: "high", SecurityRisk: "low", Capabilities: []string{"api-fuzz"}},
		{Name: "stryker-js", Repo: "https://github.com/stryker-mutator/stryker-js", Version: "latest", License: "Apache-2.0", SPDX: "Apache-2.0", LicenseRisk: "none", RuntimeCost: "high", SecurityRisk: "low", Capabilities: []string{"mutation-testing"}},
		{Name: "porcupine", Repo: "https://github.com/anishathalye/porcupine", Version: "latest", License: "MIT", SPDX: "MIT", LicenseRisk: "none", RuntimeCost: "medium", SecurityRisk: "low", Capabilities: []string{"linearizability-check"}},
		{Name: "z3", Repo: "https://github.com/google/z3", Version: "latest", License: "MIT", SPDX: "MIT", LicenseRisk: "none", RuntimeCost: "high", SecurityRisk: "low", Capabilities: []string{"smt"}},
		{Name: "cbmc", Repo: "https://github.com/diffblue/cbmc", Version: "latest", License: "Apache-2.0", SPDX: "Apache-2.0", LicenseRisk: "none", RuntimeCost: "high", SecurityRisk: "low", Capabilities: []string{"bounded-model-checking"}},
		{Name: "lean4", Repo: "https://github.com/leanprover/lean4", Version: "latest", License: "Apache-2.0", SPDX: "Apache-2.0", LicenseRisk: "none", RuntimeCost: "high", SecurityRisk: "low", Capabilities: []string{"theorem-proving"}},

		// --- Security / supply chain ---
		{Name: "osv-scanner", Repo: "https://github.com/google/osv-scanner", Version: "latest", License: "Apache-2.0", SPDX: "Apache-2.0", LicenseRisk: "none", RuntimeCost: "medium", SecurityRisk: "low", Capabilities: []string{"dep-vulns"}},
		{Name: "grype", Repo: "https://github.com/anchore/grype", Version: "latest", License: "Apache-2.0", SPDX: "Apache-2.0", LicenseRisk: "none", RuntimeCost: "medium", SecurityRisk: "low", Capabilities: []string{"vuln-scan"}},
		{Name: "syft", Repo: "https://github.com/anchore/syft", Version: "latest", License: "Apache-2.0", SPDX: "Apache-2.0", LicenseRisk: "none", RuntimeCost: "medium", SecurityRisk: "low", Capabilities: []string{"sbom"}},
		{Name: "detect-secrets", Repo: "https://github.com/Yelp/detect-secrets", Version: "latest", License: "Apache-2.0", SPDX: "Apache-2.0", LicenseRisk: "none", RuntimeCost: "low", SecurityRisk: "low", Capabilities: []string{"secrets"}},
		{Name: "kics", Repo: "https://github.com/Checkmarx/KICS", Version: "latest", License: "Apache-2.0", SPDX: "Apache-2.0", LicenseRisk: "none", RuntimeCost: "medium", SecurityRisk: "low", Capabilities: []string{"iac-scan"}},
		{Name: "zaproxy", Repo: "https://github.com/zaproxy/zaproxy", Version: "latest", License: "Apache-2.0", SPDX: "Apache-2.0", LicenseRisk: "none", RuntimeCost: "high", SecurityRisk: "low", Capabilities: []string{"dast"}},
		{Name: "cosign", Repo: "https://github.com/sigstore/cosign", Version: "latest", License: "Apache-2.0", SPDX: "Apache-2.0", LicenseRisk: "none", RuntimeCost: "low", SecurityRisk: "low", Capabilities: []string{"artifact-signing"}},
		{Name: "in-toto", Repo: "https://github.com/in-toto/in-toto", Version: "latest", License: "Apache-2.0", SPDX: "Apache-2.0", LicenseRisk: "none", RuntimeCost: "low", SecurityRisk: "low", Capabilities: []string{"supply-chain-attest"}},
		{Name: "opa", Repo: "https://github.com/open-policy-agent/opa", Version: "latest", License: "Apache-2.0", SPDX: "Apache-2.0", LicenseRisk: "none", RuntimeCost: "medium", SecurityRisk: "low", Capabilities: []string{"policy"}},

		// --- Containers / perf / chaos ---
		{Name: "podman", Repo: "https://github.com/containers/podman", Version: "latest", License: "Apache-2.0", SPDX: "Apache-2.0", LicenseRisk: "none", RuntimeCost: "medium", SecurityRisk: "low", Capabilities: []string{"containers"}},
		{Name: "wasmtime", Repo: "https://github.com/bytecodealliance/wasmtime", Version: "latest", License: "Apache-2.0", SPDX: "Apache-2.0", LicenseRisk: "none", RuntimeCost: "medium", SecurityRisk: "low", Capabilities: []string{"wasm-runtime"}},
		{Name: "hyperfine", Repo: "https://github.com/sharkdp/hyperfine", Version: "latest", License: "MIT", SPDX: "MIT", LicenseRisk: "none", RuntimeCost: "low", SecurityRisk: "low", Capabilities: []string{"benchmark"}},
		{Name: "litmus", Repo: "https://github.com/litmuschaos/litmus", Version: "latest", License: "Apache-2.0", SPDX: "Apache-2.0", LicenseRisk: "none", RuntimeCost: "high", SecurityRisk: "low", Capabilities: []string{"chaos"}},

		// --- AI/LLM/agent evaluation ---
		{Name: "promptfoo", Repo: "https://github.com/promptfoo/promptfoo", Version: "latest", License: "MIT", SPDX: "MIT", LicenseRisk: "none", RuntimeCost: "medium", SecurityRisk: "low", Capabilities: []string{"llm-eval"}},
		{Name: "inspect-ai", Repo: "https://github.com/UKGovernmentBEIS/inspect_ai", Version: "latest", License: "MIT", SPDX: "MIT", LicenseRisk: "none", RuntimeCost: "medium", SecurityRisk: "low", Capabilities: []string{"llm-eval"}},
	}
}

// ValidateLicense returns an error string if the license is prohibited.
func ValidateLicense(spdx string) string {
	if AllowedLicenses[spdx] {
		return ""
	}
	if ProhibitedLicenses[spdx] {
		return "prohibited license " + spdx + " requires explicit project approval (spec §3)"
	}
	return "unknown license " + spdx + " requires review"
}

// LicenseOf returns the LicenseInfo for the embedded toolchain.
func LicenseOf(name string) core.LicenseInfo {
	for _, t := range Registry() {
		if t.Name == name {
			return core.LicenseInfo{Name: t.Name, SPDX: t.SPDX, TransitiveLicenseRisk: t.LicenseRisk}
		}
	}
	return core.LicenseInfo{Name: name, SPDX: "UNKNOWN", TransitiveLicenseRisk: "high"}
}
