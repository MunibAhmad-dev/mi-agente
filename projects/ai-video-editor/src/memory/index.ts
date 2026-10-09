/**
 * AI Creative OS - Creative Memory
 * Stores: styles, projects, assets, preferences, corrections, approved/rejected outputs,
 * provider choices, workflow versions.
 */

import type {
  UserPreference, StyleProfile, FailureRecord, UniqueId, Timestamp,
} from "../types/index.js";
import { Logger, EventBus, generateId, timestamp, StorageEngine } from "../core/index.js";

export class CreativeMemory {
  private logger = new Logger("CreativeMemory");
  private eventBus: EventBus;
  private storage: StorageEngine;
  private preferences = new Map<string, UserPreference>();
  private styles = new Map<UniqueId, StyleProfile>();
  private failures: FailureRecord[] = [];
  private corrections: CorrectionRecord[] = [];
  private approvedOutputs: OutputRecord[] = [];
  private rejectedOutputs: OutputRecord[] = [];

  constructor(eventBus: EventBus, storage: StorageEngine) {
    this.eventBus = eventBus;
    this.storage = storage;
    this.load();
  }

  // ─── Preferences ────────────────────────────────────────────────────

  setPreference(key: string, value: unknown, category: string, learnedFrom: "explicit" | "implicit" = "explicit"): void {
    const existing = this.preferences.get(key);
    const pref: UserPreference = {
      key,
      value,
      category,
      confidence: existing ? Math.min(existing.confidence + 0.1, 1.0) : 0.5,
      learnedFrom,
      count: (existing?.count ?? 0) + 1,
      lastUpdated: timestamp(),
    };
    this.preferences.set(key, pref);
    this.save();
  }

  getPreference(key: string): unknown | undefined {
    return this.preferences.get(key)?.value;
  }

  getPreferencesByCategory(category: string): UserPreference[] {
    return [...this.preferences.values()].filter((p) => p.category === category);
  }

  // ─── Feedback Learning ──────────────────────────────────────────────

  recordApproval(outputId: UniqueId, outputType: string): void {
    this.approvedOutputs.push({ id: outputId, type: outputType, timestamp: timestamp() });
    this.save();
  }

  recordRejection(outputId: UniqueId, outputType: string, reason?: string): void {
    this.rejectedOutputs.push({ id: outputId, type: outputType, timestamp: timestamp(), reason });
    this.save();
  }

  recordCorrection(correction: CorrectionRecord): void {
    this.corrections.push({ ...correction, id: generateId(), timestamp: timestamp() });
    this.save();
  }

  getRejectionPatterns(): { pattern: string; count: number }[] {
    const reasons = this.rejectedOutputs
      .filter((r) => r.reason)
      .reduce((acc, r) => {
        acc[r.reason!] = (acc[r.reason!] ?? 0) + 1;
        return acc;
      }, {} as Record<string, number>);

    return Object.entries(reasons)
      .map(([pattern, count]) => ({ pattern, count }))
      .sort((a, b) => b.count - a.count);
  }

  // ─── Failure Memory ─────────────────────────────────────────────────

  recordFailure(record: Omit<FailureRecord, "id" | "timestamp">): void {
    this.failures.push({
      ...record,
      id: generateId(),
      timestamp: timestamp(),
    });
    this.save();
  }

  shouldAvoidProvider(providerId: UniqueId, capability: string): boolean {
    const recentFailures = this.failures.filter(
      (f) => f.provider === providerId && f.capability === capability && f.timestamp > Date.now() - 86400000,
    );
    return recentFailures.length >= 3;
  }

  // ─── Persistence ────────────────────────────────────────────────────

  private save(): void {
    this.storage.write("memory/preferences.json", [...this.preferences.entries()]);
    this.storage.write("memory/failures.json", this.failures);
    this.storage.write("memory/corrections.json", this.corrections);
    this.storage.write("memory/approved.json", this.approvedOutputs);
    this.storage.write("memory/rejected.json", this.rejectedOutputs);
  }

  private load(): void {
    try {
      const prefs = this.storage.read<[string, UserPreference][]>("memory/preferences.json");
      if (prefs) this.preferences = new Map(prefs);
      const failures = this.storage.read<FailureRecord[]>("memory/failures.json");
      if (failures) this.failures = failures;
      const corrections = this.storage.read<CorrectionRecord[]>("memory/corrections.json");
      if (corrections) this.corrections = corrections;
      const approved = this.storage.read<OutputRecord[]>("memory/approved.json");
      if (approved) this.approvedOutputs = approved;
      const rejected = this.storage.read<OutputRecord[]>("memory/rejected.json");
      if (rejected) this.rejectedOutputs = rejected;
    } catch {}
  }

  getStats(): { preferences: number; failures: number; corrections: number; approved: number; rejected: number } {
    return {
      preferences: this.preferences.size,
      failures: this.failures.length,
      corrections: this.corrections.length,
      approved: this.approvedOutputs.length,
      rejected: this.rejectedOutputs.length,
    };
  }
}

interface CorrectionRecord {
  id: UniqueId;
  timestamp: Timestamp;
  outputId: UniqueId;
  correctionType: string;
  details: string;
  provider?: UniqueId;
}

interface OutputRecord {
  id: UniqueId;
  type: string;
  timestamp: Timestamp;
  reason?: string;
}
