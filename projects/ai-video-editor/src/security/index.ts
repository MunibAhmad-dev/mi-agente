/**
 * AI Creative OS - Security Sandbox
 * Isolates scripts, plugins, workflows, installers, external processes.
 * Controls: file access, network access, process execution, shell execution.
 */

import type { UniqueId } from "../types/index.js";
import { Logger, EventBus, generateId } from "../core/index.js";

export interface SecurityPolicy {
  fileAccess: { read: boolean; write: boolean; delete: boolean; allowedPaths: string[]; deniedPaths: string[] };
  networkAccess: { enabled: boolean; allowedHosts: string[]; deniedHosts: string[] };
  processExecution: { allowed: boolean; allowedCommands: string[]; deniedCommands: string[] };
  shellExecution: { allowed: boolean; allowedPatterns: string[] };
}

export interface SecurityViolation {
  id: UniqueId;
  timestamp: number;
  type: "file_access" | "network_access" | "process_execution" | "shell_execution";
  details: string;
  source: string;
  blocked: boolean;
}

const DEFAULT_POLICY: SecurityPolicy = {
  fileAccess: {
    read: true,
    write: true,
    delete: false,
    allowedPaths: [],
    deniedPaths: ["/etc", "/sys", "/proc"],
  },
  networkAccess: { enabled: true, allowedHosts: [], deniedHosts: [] },
  processExecution: { allowed: true, allowedCommands: [], deniedCommands: ["rm -rf /", "format", "del /s"] },
  shellExecution: { allowed: true, allowedPatterns: [] },
};

export class SecuritySandbox {
  private logger = new Logger("Security");
  private eventBus: EventBus;
  private policy: SecurityPolicy;
  private violations: SecurityViolation[] = [];

  constructor(eventBus: EventBus, policy?: Partial<SecurityPolicy>) {
    this.eventBus = eventBus;
    this.policy = { ...DEFAULT_POLICY, ...policy };
  }

  /**
   * Check if a file operation is allowed.
   */
  checkFileAccess(path: string, operation: "read" | "write" | "delete"): { allowed: boolean; reason?: string } {
    if (operation === "read" && !this.policy.fileAccess.read) return { allowed: false, reason: "Read access disabled" };
    if (operation === "write" && !this.policy.fileAccess.write) return { allowed: false, reason: "Write access disabled" };
    if (operation === "delete" && !this.policy.fileAccess.delete) return { allowed: false, reason: "Delete access disabled" };

    for (const denied of this.policy.fileAccess.deniedPaths) {
      if (path.startsWith(denied)) {
        this.recordViolation("file_access", `Blocked ${operation} to ${path}`, path);
        return { allowed: false, reason: `Path ${path} is in denied list` };
      }
    }

    return { allowed: true };
  }

  /**
   * Check if a network operation is allowed.
   */
  checkNetworkAccess(host: string): { allowed: boolean; reason?: string } {
    if (!this.policy.networkAccess.enabled) return { allowed: false, reason: "Network access disabled" };
    if (this.policy.networkAccess.deniedHosts.includes(host)) {
      this.recordViolation("network_access", `Blocked connection to ${host}`, host);
      return { allowed: false, reason: `Host ${host} is denied` };
    }
    return { allowed: true };
  }

  /**
   * Check if a command execution is allowed.
   */
  checkCommandExecution(command: string): { allowed: boolean; reason?: string } {
    if (!this.policy.processExecution.allowed) return { allowed: false, reason: "Process execution disabled" };
    for (const denied of this.policy.processExecution.deniedCommands) {
      if (command.includes(denied)) {
        this.recordViolation("process_execution", `Blocked command: ${command}`, command);
        return { allowed: false, reason: `Command matches denied pattern: ${denied}` };
      }
    }
    return { allowed: true };
  }

  /**
   * Get security overview.
   */
  getOverview(): { policySet: boolean; violations: number; recentViolations: SecurityViolation[] } {
    return {
      policySet: true,
      violations: this.violations.length,
      recentViolations: this.violations.slice(-10),
    };
  }

  updatePolicy(patch: Partial<SecurityPolicy>): void {
    this.policy = {
      fileAccess: { ...this.policy.fileAccess, ...patch.fileAccess },
      networkAccess: { ...this.policy.networkAccess, ...patch.networkAccess },
      processExecution: { ...this.policy.processExecution, ...patch.processExecution },
      shellExecution: { ...this.policy.shellExecution, ...patch.shellExecution },
    };
  }

  private recordViolation(type: SecurityViolation["type"], details: string, source: string): void {
    const violation: SecurityViolation = {
      id: generateId(),
      timestamp: Date.now(),
      type,
      details,
      source,
      blocked: true,
    };
    this.violations.push(violation);
    this.logger.warn(`Security violation: ${type} - ${details}`);
    this.eventBus.emit("SECURITY_VIOLATION", "Security", { violation: JSON.parse(JSON.stringify(violation)) });
  }
}
