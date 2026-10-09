/**
 * SecurityScanner — Unified security scanning service.
 *
 * License: MIT (Gitleaks, ast-grep) + Apache-2.0 (OSV-Scanner)
 */

module.exports = {
  SecretsScanner: require('./SecretsScanner'),
  SASTScanner: require('./SASTScanner'),
  DependencyScanner: require('./DependencyScanner'),
  ScanOrchestrator: require('./ScanOrchestrator'),
  scanContent: require('./ScanOrchestrator').scanContent,
  preExecutionCheck: require('./ScanOrchestrator').preExecutionCheck,
  scanDirectory: require('./ScanOrchestrator').scanDirectory,
  getScannerStatus: require('./ScanOrchestrator').getScannerStatus,
};
