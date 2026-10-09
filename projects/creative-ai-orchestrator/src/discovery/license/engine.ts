// ============================================================================
// License Engine
// ============================================================================
// Detects and validates licenses. Separates code/model/dataset/asset licenses.
// Never lets the LLM invent a license.
// ============================================================================

import type {
  LicenseInfo,
  DependencyLicense,
  CaioDatabase,
} from "../../core/types/index.js";

// SPDX patterns for detection
const LICENSE_PATTERNS: Array<{ pattern: RegExp; spdx: string }> = [
  { pattern: /\bMIT\b/i, spdx: "MIT" },
  { pattern: /\bApache[\s-]*2\.0\b/i, spdx: "Apache-2.0" },
  { pattern: /\bApache\s*License\s*2\.0/i, spdx: "Apache-2.0" },
  { pattern: /\bBSD[\s-]*3[\s-]*Clause\b/i, spdx: "BSD-3-Clause" },
  { pattern: /\bBSD[\s-]*2[\s-]*Clause\b/i, spdx: "BSD-2-Clause" },
  { pattern: /\bISC\b/i, spdx: "ISC" },
  { pattern: /\bMPL[\s-]*2\.0\b/i, spdx: "MPL-2.0" },
  { pattern: /\bLGPL[\s-]*2\.1\b/i, spdx: "LGPL-2.1" },
  { pattern: /\bLGPL[\s-]*3\.0\b/i, spdx: "LGPL-3.0" },
  { pattern: /\bGPL[\s-]*2\.0\b/i, spdx: "GPL-2.0" },
  { pattern: /\bGPL[\s-]*3\.0\b/i, spdx: "GPL-3.0" },
  { pattern: /\bAGPL[\s-]*3\.0\b/i, spdx: "AGPL-3.0" },
  { pattern: /\bAGPL[\s-]*3\b/i, spdx: "AGPL-3.0" },
  { pattern: /\bCC0[\s-]*1\.0\b/i, spdx: "CC0-1.0" },
  { pattern: /\bCC[\s-]*BY[\s-]*4\.0\b/i, spdx: "CC-BY-4.0" },
  { pattern: /\bCC[\s-]*BY[\s-]*SA[\s-]*4\.0\b/i, spdx: "CC-BY-SA-4.0" },
  { pattern: /\bCC[\s-]*BY[\s-]*NC[\s-]*4\.0\b/i, spdx: "CC-BY-NC-4.0" },
  { pattern: /\bCreativeML\sOpenRAIL/i, spdx: "OpenRAIL" },
  { pattern: /\bUnlicense\b/i, spdx: "Unlicense" },
];

const PERMISSIVE_SPDX = new Set([
  "MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "ISC", "Unlicense", "CC0-1.0",
]);
const COPYLEFT_SPDX = new Set([
  "GPL-2.0", "GPL-3.0", "AGPL-3.0", "LGPL-2.1", "LGPL-3.0",
]);

export class LicenseEngine {
  /**
   * Parse a license string into structured LicenseInfo.
   */
  parseLicense(raw: string): LicenseInfo {
    for (const { pattern, spdx } of LICENSE_PATTERNS) {
      if (pattern.test(raw)) {
        return this.spdxToInfo(spdx, raw);
      }
    }
    // Unknown license
    return {
      name: raw || "Unknown",
      commercialUse: false,
      modificationAllowed: false,
      redistributionAllowed: false,
      copyleft: false,
      additionalTerms: "License could not be parsed. Manual verification required.",
    };
  }

  /**
   * Convert SPDX ID to full LicenseInfo.
   */
  spdxToInfo(spdx: string, originalText?: string): LicenseInfo {
    const isPermissive = PERMISSIVE_SPDX.has(spdx);
    const isCopyleft = COPYLEFT_SPDX.has(spdx);
    const isCC = spdx.startsWith("CC-");
    const isNC = spdx.includes("NC");

    return {
      spdxId: spdx,
      name: originalText || spdx,
      url: `https://spdx.org/licenses/${spdx}`,
      commercialUse: isPermissive || (isCC && !isNC),
      modificationAllowed: isPermissive || spdx.includes("CC-BY") || spdx.startsWith("MPL"),
      redistributionAllowed: isPermissive || (isCC && !isNC) || spdx.startsWith("MPL"),
      copyleft: isCopyleft,
    };
  }

  /**
   * Check if two licenses are compatible (can be used together).
   */
  areCompatible(license1: LicenseInfo, license2: LicenseInfo): boolean {
    // Both permissive: always compatible
    if (!license1.copyleft && !license2.copyleft) return true;
    // One copyleft: may require the other to be compatible
    if (license1.copyleft && !license2.copyleft) return true;
    if (!license1.copyleft && license2.copyleft) return true;
    // Both copyleft: need careful check
    if (license1.spdxId === license2.spdxId) return true;
    return false;
  }

  /**
   * Check if a license is compatible with a target license (e.g., MIT project).
   */
  isCompatibleWithTarget(dependency: LicenseInfo, target: LicenseInfo): boolean {
    // If target is MIT, only permissive dependencies are safe
    if (target.spdxId === "MIT") {
      return !dependency.copyleft;
    }
    // If target is GPL, any license is compatible
    if (target.spdxId?.includes("GPL")) {
      return true;
    }
    // Default: not copyleft
    return !dependency.copyleft;
  }

  /**
   * Scan LICENSE file content for SPDX identifier.
   */
  detectLicenseFromContent(content: string): LicenseInfo {
    // Look for SPDX identifier line
    const spdxMatch = content.match(/SPDX-License-Identifier:\s*(.+)/i);
    if (spdxMatch && spdxMatch[1]) {
      return this.parseLicense(spdxMatch[1].trim());
    }

    // Try pattern matching
    return this.parseLicense(content.slice(0, 2000)); // Only scan first 2KB
  }

  /**
   * Get risk assessment for a license in our project context (MIT).
   */
  getRiskLevel(license: LicenseInfo): "none" | "low" | "medium" | "high" | "critical" {
    if (!license.copyleft) return "none";
    if (license.spdxId?.startsWith("LGPL")) return "medium";
    if (license.spdxId?.startsWith("GPL")) return "high";
    if (license.spdxId?.includes("AGPL")) return "critical";
    return "low";
  }

  /**
   * Store dependency license in database.
   */
  storeLicense(db: CaioDatabase, dep: DependencyLicense): void {
    db.run(
      `INSERT OR REPLACE INTO dependency_licenses
       (name, version, repository, license_name, license_url, license_spdx,
        commercial_use, modification_allowed, redistribution_allowed, copyleft, additional_terms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      dep.name,
      dep.version,
      dep.repository || null,
      dep.license.name,
      dep.license.url || null,
      dep.license.spdxId || null,
      dep.license.commercialUse ? 1 : 0,
      dep.license.modificationAllowed ? 1 : 0,
      dep.license.redistributionAllowed ? 1 : 0,
      dep.license.copyleft ? 1 : 0,
      dep.license.additionalTerms || null
    );
  }

  /**
   * Get all stored dependency licenses.
   */
  getAllLicenses(db: CaioDatabase): DependencyLicense[] {
    const rows = db.all<{
      name: string; version: string; repository: string | null;
      license_name: string; license_url: string | null; license_spdx: string | null;
      commercial_use: number; modification_allowed: number; redistribution_allowed: number;
      copyleft: number; additional_terms: string | null;
    }>("SELECT * FROM dependency_licenses");

    return rows.map((r) => ({
      name: r.name,
      version: r.version,
      repository: r.repository || undefined,
      license: {
        spdxId: r.license_spdx || undefined,
        name: r.license_name,
        url: r.license_url || undefined,
        commercialUse: !!r.commercial_use,
        modificationAllowed: !!r.modification_allowed,
        redistributionAllowed: !!r.redistribution_allowed,
        copyleft: !!r.copyleft,
        additionalTerms: r.additional_terms || undefined,
      },
    }));
  }
}
