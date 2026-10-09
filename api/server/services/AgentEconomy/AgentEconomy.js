'use strict';

/**
 * AgentEconomy — Face 18: Agent Token Economy.
 *
 * Maintains a per-user token ledger with credit/debit operations,
 * a full transaction log, and a capability cost table so consuming
 * plugins can check whether the caller has enough budget.
 */
class AgentEconomy {
  constructor(config = {}) {
    this.config = config;
    // userId → numeric balance (tokens)
    this._balances = new Map();
    // userId → Array<{ id, type, amount, reason, balance, ts }>
    this._txLog = new Map();
    this._txCounter = 0;

    // Default metered cost per capability (tokens per invocation)
    this.capabilityCosts = new Map([
      ['web_search', 1],
      ['code_execution', 5],
      ['image_generation', 10],
      ['fine_tuning', 50],
      ['vector_search', 2],
      ['file_read', 1],
      ['file_write', 2],
      ['api_call', 3],
      ...(config.capabilityCosts ? Object.entries(config.capabilityCosts) : []),
    ]);

    this.stats = { credits: 0, debits: 0, totalVolume: 0 };
  }

  /**
   * Return current balance for userId (creates account with 0 balance if unknown).
   */
  balance(userId) {
    if (!this._balances.has(userId)) this._balances.set(userId, 0);
    return this._balances.get(userId);
  }

  /**
   * Add tokens to a user's balance.
   * @returns {object} transaction record
   */
  credit(userId, amount, reason = 'credit') {
    if (!userId) throw new Error('userId is required');
    if (typeof amount !== 'number' || amount <= 0) throw new Error('amount must be a positive number');
    const before = this.balance(userId);
    const after = before + amount;
    this._balances.set(userId, after);
    this.stats.credits++;
    this.stats.totalVolume += amount;
    return this._record(userId, 'credit', amount, reason, after);
  }

  /**
   * Deduct tokens from a user's balance. Throws if balance insufficient.
   * @returns {object} transaction record
   */
  debit(userId, amount, reason = 'debit') {
    if (!userId) throw new Error('userId is required');
    if (typeof amount !== 'number' || amount <= 0) throw new Error('amount must be a positive number');
    const before = this.balance(userId);
    if (before < amount) throw new Error(`Insufficient balance: have ${before}, need ${amount}`);
    const after = before - amount;
    this._balances.set(userId, after);
    this.stats.debits++;
    this.stats.totalVolume += amount;
    return this._record(userId, 'debit', amount, reason, after);
  }

  /**
   * Charge a user the registered cost for `capabilityId`.
   * Returns null if the capability has no registered cost (free).
   */
  chargeCapability(userId, capabilityId) {
    const cost = this.capabilityCosts.get(capabilityId);
    if (!cost) return null;
    return this.debit(userId, cost, `capability:${capabilityId}`);
  }

  /**
   * Get recent transactions for a user, newest first.
   */
  getTransactions(userId, limit = 50) {
    const log = this._txLog.get(userId) || [];
    return log.slice(-Math.min(limit, log.length)).reverse();
  }

  getStats() {
    return { ...this.stats, accounts: this._balances.size };
  }

  _record(userId, type, amount, reason, balance) {
    const tx = {
      id: `tx_${++this._txCounter}`,
      userId,
      type,
      amount,
      reason,
      balance,
      ts: Date.now(),
    };
    if (!this._txLog.has(userId)) this._txLog.set(userId, []);
    this._txLog.get(userId).push(tx);
    return tx;
  }
}

let _instance = null;
function getEconomy(config) {
  if (!_instance) _instance = new AgentEconomy(config);
  return _instance;
}

module.exports = { AgentEconomy, getEconomy };
