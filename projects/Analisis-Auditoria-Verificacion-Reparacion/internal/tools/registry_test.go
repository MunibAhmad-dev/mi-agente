package tools

import "testing"

func TestRegistryLicensesComply(t *testing.T) {
	for _, tool := range Registry() {
		if !AllowedLicenses[tool.SPDX] {
			t.Errorf("tool %s has non-allowlisted SPDX %s — spec §3 violation", tool.Name, tool.SPDX)
		}
		if tool.LicenseRisk != "none" && tool.LicenseRisk != "low" {
			t.Errorf("tool %s license risk %q too high for default integration", tool.Name, tool.LicenseRisk)
		}
	}
}

func TestProhibitedDetected(t *testing.T) {
	if msg := ValidateLicense("GPL-3.0-only"); msg == "" {
		t.Fatal("GPL must be flagged")
	}
	if msg := ValidateLicense("MIT"); msg != "" {
		t.Fatalf("MIT must pass, got %q", msg)
	}
}

func TestRegistryCompleteMetadata(t *testing.T) {
	for _, tool := range Registry() {
		if tool.Name == "" || tool.Repo == "" || tool.SPDX == "" || len(tool.Capabilities) == 0 {
			t.Errorf("tool %s missing metadata: %+v", tool.Name, tool)
		}
	}
}
