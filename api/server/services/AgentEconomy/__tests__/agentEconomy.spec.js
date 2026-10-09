'use strict';

const { AgentEconomy } = require('../AgentEconomy');

describe('AgentEconomy — Face 18: Token Ledger', () => {
  let economy;

  beforeEach(() => {
    economy = new AgentEconomy();
  });

  test('balance() returns 0 for a new user', () => {
    expect(economy.balance('user-a')).toBe(0);
  });

  test('credit() increases balance and returns a transaction', () => {
    const tx = economy.credit('user-a', 100, 'initial top-up');
    expect(economy.balance('user-a')).toBe(100);
    expect(tx.type).toBe('credit');
    expect(tx.amount).toBe(100);
    expect(tx.balance).toBe(100);
    expect(tx.id).toMatch(/^tx_/);
  });

  test('debit() decreases balance and returns a transaction', () => {
    economy.credit('user-b', 50);
    const tx = economy.debit('user-b', 20, 'spend');
    expect(economy.balance('user-b')).toBe(30);
    expect(tx.type).toBe('debit');
    expect(tx.amount).toBe(20);
  });

  test('debit() throws when balance is insufficient', () => {
    economy.credit('user-c', 10);
    expect(() => economy.debit('user-c', 50, 'over-spend')).toThrow('Insufficient balance');
  });

  test('chargeCapability() debits registered cost', () => {
    economy.credit('user-d', 100);
    const tx = economy.chargeCapability('user-d', 'web_search');
    expect(tx.amount).toBe(1);
    expect(economy.balance('user-d')).toBe(99);
  });

  test('chargeCapability() returns null for unknown capability (free)', () => {
    economy.credit('user-e', 10);
    const tx = economy.chargeCapability('user-e', 'nonexistent_cap');
    expect(tx).toBeNull();
    expect(economy.balance('user-e')).toBe(10);
  });

  test('getTransactions() returns newest first up to limit', () => {
    economy.credit('user-f', 1000);
    for (let i = 0; i < 5; i++) economy.debit('user-f', 1, `spend-${i}`);
    const txs = economy.getTransactions('user-f', 3);
    expect(txs).toHaveLength(3);
    expect(txs[0].ts).toBeGreaterThanOrEqual(txs[1].ts);
  });

  test('getStats() tracks credit and debit counts', () => {
    economy.credit('u', 100);
    economy.credit('u', 50);
    economy.debit('u', 30);
    const stats = economy.getStats();
    expect(stats.credits).toBe(2);
    expect(stats.debits).toBe(1);
    expect(stats.totalVolume).toBe(180);
    expect(stats.accounts).toBe(1);
  });

  test('credit() throws for non-positive amount', () => {
    expect(() => economy.credit('u', -5)).toThrow('positive number');
    expect(() => economy.credit('u', 0)).toThrow('positive number');
  });

  test('credit() throws for missing userId', () => {
    expect(() => economy.credit('', 10)).toThrow('userId is required');
  });
});
