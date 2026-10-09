/**
 * AI Creative OS - Database Engine
 * JSON-file based transactional storage for metadata.
 * Separated from heavy file assets.
 */

import type { UniqueId, Timestamp } from "../types/index.js";
import { Logger, StorageEngine, generateId, timestamp } from "../core/index.js";

export interface DBTable<T> {
  name: string;
  records: Map<UniqueId, T & { id: UniqueId; createdAt: Timestamp; updatedAt: Timestamp }>;
}

export class DatabaseEngine {
  private logger = new Logger("Database");
  private storage: StorageEngine;
  private tables = new Map<string, DBTable<any>>();

  constructor(storage: StorageEngine) {
    this.storage = storage;
  }

  getTable<T>(name: string): DBTable<T> {
    if (!this.tables.has(name)) {
      this.tables.set(name, { name, records: new Map() });
      this.loadTable(name);
    }
    return this.tables.get(name)!;
  }

  insert<T extends { id: string }>(tableName: string, record: T): T & { createdAt: Timestamp; updatedAt: Timestamp } {
    const table = this.getTable<T>(tableName);
    const full = { ...record, createdAt: timestamp(), updatedAt: timestamp() } as T & { createdAt: Timestamp; updatedAt: Timestamp };
    table.records.set(full.id, full);
    this.saveTable(tableName);
    return full;
  }

  findById<T>(tableName: string, id: UniqueId): (T & { id: UniqueId; createdAt: Timestamp; updatedAt: Timestamp }) | undefined {
    return this.getTable<T>(tableName).records.get(id);
  }

  findAll<T>(tableName: string, filter?: (record: T & { id: UniqueId }) => boolean): (T & { id: UniqueId })[] {
    const table = this.getTable<T>(tableName);
    const all = [...table.records.values()];
    return filter ? all.filter(filter) : all;
  }

  update<T>(tableName: string, id: UniqueId, changes: Partial<T>): boolean {
    const table = this.getTable<T>(tableName);
    const existing = table.records.get(id);
    if (!existing) return false;
    Object.assign(existing, changes, { updatedAt: timestamp() });
    this.saveTable(tableName);
    return true;
  }

  delete(tableName: string, id: UniqueId): boolean {
    const table = this.getTable(tableName);
    const deleted = table.records.delete(id);
    if (deleted) this.saveTable(tableName);
    return deleted;
  }

  count(tableName: string): number {
    return this.getTable(tableName).records.size;
  }

  private loadTable(name: string): void {
    try {
      const data = this.storage.read<any[]>(`db/${name}.json`);
      if (data) {
        for (const record of data) {
          this.tables.get(name)!.records.set(record.id, record);
        }
      }
    } catch {}
  }

  private saveTable(name: string): void {
    const table = this.tables.get(name);
    if (table) {
      this.storage.write(`db/${name}.json`, [...table.records.values()]);
    }
  }

  getStats(): Record<string, number> {
    const stats: Record<string, number> = {};
    for (const [name, table] of this.tables) {
      stats[name] = table.records.size;
    }
    return stats;
  }
}
