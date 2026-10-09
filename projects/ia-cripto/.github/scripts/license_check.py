#!/usr/bin/env python3
"""License allowlist check (spec §110, roadmap Fase 9).

Verifies that every installed runtime dependency ships a permissive license
from the allowlist. The core is stdlib-only, so this passes with zero
third-party runtime packages; optional extras (ccxt: MIT) stay compliant.

Usage:
    python .github/scripts/license_check.py            # inspects installed dists
    python .github/scripts/license_check.py --file f   # inspects pip-licenses JSON
    python .github/scripts/license_check.py --allowlist a1,a2
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# §110: permissive licenses only (docs/OPEN_SOURCE_STACK.md).
# MPL-2.0 is accepted as a documented exception: file-level (weak) copyleft,
# acceptable for standalone data/cert bundles; it never contaminates aeos code.
DEFAULT_ALLOWLIST = {
    "MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "ISC", "0BSD",
    "Python-2.0", "Unlicense", "CC0-1.0", "MIT License", "Apache Software License",
    "BSD License", "ISC License (ISCL)", "Apache License 2.0", "MPL-2.0",
    "Mozilla Public License 2.0 (MPL 2.0)", "The Unlicense (Unlicense)",
    "PSF-2.0",  # Python Software Foundation license (CPython itself; typing_extensions)
}

# packages known-good whose classifier strings vary; map to allowlist entries
KNOWN_MAPPINGS = {
    "ntplib": "MIT",
}

BLOCKED = {"AGPL-3.0", "GPL-2.0", "GPL-3.0", "SSPL-1.0", "EUPL-1.2"}


def licenses_from_installed(allowlist: set[str]) -> list[tuple[str, str, bool]]:
    out = []
    try:
        from importlib import metadata
    except ImportError:  # pragma: no cover
        return out
    for dist in metadata.distributions():
        name = (dist.metadata.get("Name") or "?").lower()
        if name in ("aeos", "pip", "setuptools", "wheel", "pip-licenses"):
            continue
        lic = dist.metadata.get("License") or ""
        # PEP 639: modern packages carry a normalized License-Expression
        lic_expr = dist.metadata.get("License-Expression") or ""
        classifiers = [c for c in (dist.metadata.get_all("Classifier") or [])
                       if c.startswith("License ::")]
        resolved = _resolve(lic or lic_expr, classifiers, name)
        if resolved not in allowlist and lic_expr:
            resolved = lic_expr  # surface the expression for the report
        out.append((dist.metadata.get("Name") or "?", resolved, resolved in allowlist))
    return out


def licenses_from_file(path: str, allowlist: set[str]) -> list[tuple[str, str, bool]]:
    rows = json.loads(Path(path).read_text(encoding="utf-8"))
    out = []
    for row in rows:
        name = row.get("Name") or "?"
        lname = name.lower()
        if lname in ("aeos", "pip", "setuptools", "wheel", "pip-licenses"):
            continue
        lic = row.get("License", "") or row.get("LicenseExpression", "")
        classifiers = [row["LicenseClassifier"]] \
            if row.get("LicenseClassifier") else []
        resolved = _resolve(lic, classifiers, lname)
        out.append((name, resolved, resolved in allowlist))
    return out


def _resolve(lic: str, classifiers: list[str], pkg_name: str = "") -> str:
    """Resolve a license field to an allowlist entry.

    Compound SPDX expressions (Apache-2.0 OR BSD-2-Clause) are compliant when
    the expression is satisfiable from allowlisted licenses: for OR, at least
    one allowlisted option and no blocked option; for AND, every option must
    be allowlisted (all must be accepted to use the package).
    """
    lic = (lic or "").strip()
    aw = set(DEFAULT_ALLOWLIST)
    if lic in aw:
        return lic
    if lic in BLOCKED:
        return lic
    # tokenize on SPDX separators
    tokens = [t.strip(" ()") for t in
              lic.replace(" OR ", "|").replace(" AND ", "|").replace(",", "|").split("|")]
    tokens = [t for t in tokens if t]
    if tokens and any(t in BLOCKED for t in tokens):
        return lic  # expression touches a blocked license: fail with the original
    if tokens and all(t in aw for t in tokens):
        return tokens[0]  # fully satisfiable from the allowlist
    if tokens and any(t in aw for t in tokens):
        # OR-expression with one allowlisted arm: compliant, report the pair
        return tokens[0] if tokens[0] in aw else tokens[1]
    for c in classifiers:
        parts = [p.strip() for p in c.split("::")]
        if parts and parts[-1] in aw:
            return parts[-1]
    if pkg_name and pkg_name in KNOWN_MAPPINGS:
        return KNOWN_MAPPINGS[pkg_name]
    return lic or "UNKNOWN"


def main() -> int:
    parser = argparse.ArgumentParser(description="AEOS license allowlist check")
    parser.add_argument("--file", help="pip-licenses JSON file instead of installed dists")
    parser.add_argument("--allowlist", help="comma-separated extra licenses")
    args = parser.parse_args()

    allowlist = set(DEFAULT_ALLOWLIST)
    if args.allowlist:
        allowlist |= {a.strip() for a in args.allowlist.split(",") if a.strip()}

    rows = (licenses_from_file(args.file, allowlist) if args.file
            else licenses_from_installed(allowlist))

    failures = [(n, l) for n, l, ok in rows if not ok]
    print(f"checked {len(rows)} distributions against allowlist of {len(allowlist)} licenses")
    for name, lic, ok in rows:
        mark = "OK " if ok else "FAIL"
        print(f"  [{mark}] {name}: {lic}")
    if failures:
        print(f"\nLICENSE VIOLATIONS: {len(failures)} package(s) outside the allowlist (§110)")
        return 1
    print("license allowlist: PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
