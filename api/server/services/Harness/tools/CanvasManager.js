/**
 * CanvasManager — Collaborative Real-time Editor (Canvas)
 * Equivalent to GPT Canvas / Claude Artifacts
 * 
 * Provides side-by-side editing where user and agent work together
 * on a live document with WebSocket sync.
 * 
 * License: MIT — Zero cost, no API required
 */

const EventEmitter = require('events');

class CanvasManager extends EventEmitter {
  constructor() {
    super();
    /** @type {Map<string, CanvasDocument>} */
    this.documents = new Map();
    this.initialized = false;
    this.stats = { created: 0, edits: 0, collaborators: 0 };
  }

  /**
   * Initialize the Canvas system
   */
  initialize() {
    this.initialized = true;
    return { status: 'ok', module: 'CanvasManager' };
  }

  /**
   * Create a new canvas document
   * @param {Object} opts
   * @param {string} opts.title - Document title
   * @param {string} opts.content - Initial content (markdown or HTML)
   * @param {string} opts.type - 'code' | 'document' | 'markdown' | 'html'
   * @param {string} opts.ownerId - Owner user ID
   * @returns {Object} Created document
   */
  createDocument({ title = 'Untitled', content = '', type = 'document', ownerId = 'system' } = {}) {
    const id = `canvas_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const doc = {
      id,
      title,
      type,
      content,
      ownerId,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      collaborators: new Set([ownerId]),
      history: [{ version: 1, content, timestamp: new Date().toISOString(), author: ownerId }],
      selections: new Map(),
      comments: [],
      metadata: {}
    };
    this.documents.set(id, doc);
    this.stats.created++;
    this.emit('document:created', { id, title, type });
    return this._sanitize(doc);
  }

  /**
   * Update document content (operational transform basic)
   * @param {string} docId
   * @param {Object} update
   * @returns {Object} Updated document
   */
  updateDocument(docId, update) {
    const doc = this.documents.get(docId);
    if (!doc) throw new Error(`Document ${docId} not found`);

    const { content, author = 'system', cursor, selection } = update;

    if (content !== undefined) {
      doc.content = content;
      doc.version++;
      doc.updatedAt = new Date().toISOString();
      doc.history.push({
        version: doc.version,
        content,
        timestamp: doc.updatedAt,
        author
      });
      // Keep only last 100 history entries
      if (doc.history.length > 100) {
        doc.history = doc.history.slice(-100);
      }
    }

    if (cursor) {
      doc.selections.set(author, { cursor, timestamp: new Date().toISOString() });
    }

    this.stats.edits++;
    this.emit('document:updated', { id: docId, version: doc.version, author });
    return this._sanitize(doc);
  }

  /**
   * Get document by ID
   */
  getDocument(docId) {
    const doc = this.documents.get(docId);
    if (!doc) return null;
    return this._sanitize(doc);
  }

  /**
   * List all documents
   */
  listDocuments({ ownerId, type, limit = 50 } = {}) {
    let docs = Array.from(this.documents.values());
    if (ownerId) docs = docs.filter(d => d.ownerId === ownerId || d.collaborators.has(ownerId));
    if (type) docs = docs.filter(d => d.type === type);
    docs.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    return docs.slice(0, limit).map(d => this._sanitize(d));
  }

  /**
   * Add collaborator
   */
  addCollaborator(docId, userId) {
    const doc = this.documents.get(docId);
    if (!doc) throw new Error(`Document ${docId} not found`);
    doc.collaborators.add(userId);
    this.stats.collaborators++;
    this.emit('collaborator:added', { docId, userId });
    return { success: true, collaborators: Array.from(doc.collaborators) };
  }

  /**
   * Add comment to document
   */
  addComment(docId, { author, text, position, resolved = false }) {
    const doc = this.documents.get(docId);
    if (!doc) throw new Error(`Document ${docId} not found`);
    const comment = {
      id: `comment_${Date.now()}`,
      author,
      text,
      position,
      resolved,
      createdAt: new Date().toISOString()
    };
    doc.comments.push(comment);
    this.emit('comment:added', { docId, comment });
    return comment;
  }

  /**
   * Get document history
   */
  getHistory(docId, { fromVersion, toVersion } = {}) {
    const doc = this.documents.get(docId);
    if (!doc) throw new Error(`Document ${docId} not found`);
    let history = [...doc.history];
    if (fromVersion) history = history.filter(h => h.version >= fromVersion);
    if (toVersion) history = history.filter(h => h.version <= toVersion);
    return history;
  }

  /**
   * Restore document to specific version
   */
  restoreVersion(docId, version) {
    const doc = this.documents.get(docId);
    if (!doc) throw new Error(`Document ${docId} not found`);
    const entry = doc.history.find(h => h.version === version);
    if (!entry) throw new Error(`Version ${version} not found`);
    return this.updateDocument(docId, { content: entry.content, author: 'system' });
  }

  /**
   * Delete document
   */
  deleteDocument(docId) {
    const doc = this.documents.get(docId);
    if (!doc) return false;
    this.documents.delete(docId);
    this.emit('document:deleted', { id: docId });
    return true;
  }

  /**
   * Export document as markdown
   */
  exportAsMarkdown(docId) {
    const doc = this.documents.get(docId);
    if (!doc) return null;
    return `# ${doc.title}\n\n${doc.content}`;
  }

  /**
   * Get stats
   */
  getStats() {
    return {
      ...this.stats,
      totalDocuments: this.documents.size,
      initialized: this.initialized
    };
  }

  _sanitize(doc) {
    return {
      id: doc.id,
      title: doc.title,
      type: doc.type,
      content: doc.content,
      version: doc.version,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      collaborators: Array.from(doc.collaborators),
      commentCount: doc.comments.length,
      historyCount: doc.history.length
    };
  }

  async saveToFile(filePath) {
    const fsp = require('fs').promises;
    const data = JSON.stringify(
      Object.fromEntries(
        Array.from(this.documents.entries()).map(([k, v]) => [
          k, { ...v, collaborators: Array.from(v.collaborators) }
        ])
      ),
      null, 2
    );
    await fsp.writeFile(filePath, data);
    return { saved: this.documents.size, path: filePath };
  }

  async loadFromFile(filePath) {
    const fsp = require('fs').promises;
    const data = JSON.parse(await fsp.readFile(filePath, 'utf8'));
    for (const [id, doc] of Object.entries(data)) {
      this.documents.set(id, { ...doc, collaborators: new Set(doc.collaborators || []) });
    }
    return { loaded: this.documents.size };
  }

  async exportDocument(docId, format = 'json') {
    const doc = this.documents.get(docId);
    if (!doc) return null;
    const sanitized = this._sanitize(doc);
    return { ...sanitized, format, exported: new Date().toISOString() };
  }
}

module.exports = CanvasManager;
