/**
 * Marketplace Service
 * ==================
 *
 * Servicio para gestionar el marketplace de plugins y skills.
 * Persistencia en MongoDB.
 *
 * Autor: Mi LibreChat
 * Version: 1.0.0
 */

const mongoose = require('mongoose');
const { logger } = require('@librechat/data-schemas');

// ============================================================================
// SCHEMAS
// ============================================================================

/**
 * Schema para plugins en el marketplace
 */
const marketplaceItemSchema = new mongoose.Schema(
  {
    // Identificación
    pluginId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },

    // Clasificación
    source: {
      type: String,
      enum: ['github', 'huggingface', 'mcp', 'npm', 'pypi', 'local'],
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['skill', 'plugin', 'tool', 'dataset', 'model', 'agent'],
      required: true,
      index: true,
    },
    category: {
      type: String,
      enum: [
        'coding',
        'research',
        'creative',
        'productivity',
        'security',
        'ai_ml',
        'communication',
        'database',
      ],
      index: true,
    },
    tags: [
      {
        type: String,
        trim: true,
      },
    ],

    // Metadatos
    author: {
      type: String,
      trim: true,
    },
    url: {
      type: String,
      required: true,
    },
    sourceUrl: {
      type: String, // URL original en el source
    },
    homepage: {
      type: String,
    },
    documentation: {
      type: String,
    },

    // Stats
    stars: {
      type: Number,
      default: 0,
    },
    downloads: {
      type: Number,
      default: 0,
    },
    likes: {
      type: Number,
      default: 0,
    },
    rating: {
      type: Number,
      min: 0,
      max: 5,
      default: 0,
    },
    reviewCount: {
      type: Number,
      default: 0,
    },

    // Instalación
    installationCommand: {
      type: String,
    },
    requirements: [
      {
        name: String,
        version: String,
        optional: { type: Boolean, default: false },
      },
    ],
    compatibleAgents: [
      {
        type: String,
      },
    ],
    version: {
      type: String,
    },
    lastUpdated: {
      type: Date,
      default: Date.now,
    },

    // Estados
    status: {
      type: String,
      enum: ['draft', 'pending', 'approved', 'rejected', 'archived'],
      default: 'pending',
      index: true,
    },
    isFeatured: {
      type: Boolean,
      default: false,
      index: true,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },

    // Monetización (opcional)
    pricing: {
      type: String,
      enum: ['free', 'freemium', 'paid', 'subscription'],
      default: 'free',
    },
    price: {
      type: Number,
      default: 0,
    },
    currency: {
      type: String,
      default: 'USD',
    },

    // Configuración
    config: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // Metadata
    submittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// ============================================================================
// INDEXES
// ============================================================================

marketplaceItemSchema.index({ name: 'text', description: 'text', tags: 'text' });
marketplaceItemSchema.index({ source: 1, type: 1, status: 1 });
marketplaceItemSchema.index({ stars: -1, downloads: -1 });
marketplaceItemSchema.index({ 'pricing.price': 1 });

// ============================================================================
// MODEL
// ============================================================================

const MarketplaceItem = mongoose.model('MarketplaceItem', marketplaceItemSchema);

// ============================================================================
// SERVICE CLASS
// ============================================================================

class MarketplaceService {
  /**
   * Crea un nuevo item en el marketplace
   */
  async createItem(itemData) {
    try {
      const item = new MarketplaceItem(itemData);
      await item.save();
      logger.info(`[Marketplace] Created item: ${item.pluginId}`);
      return item;
    } catch (error) {
      if (error.code === 11000) {
        throw new Error(`Item ${itemData.pluginId} already exists`);
      }
      logger.error('[Marketplace] Failed to create item:', error);
      throw error;
    }
  }

  /**
   * Obtiene un item por ID
   */
  async getItem(pluginId) {
    return MarketplaceItem.findOne({ pluginId });
  }

  /**
   * Lista items con filtros
   */
  async listItems({
    source,
    type,
    category,
    tags,
    search,
    status = 'approved',
    page = 1,
    limit = 20,
    sort = '-stars',
  }) {
    const query = {};

    if (status) query.status = status;
    if (source) query.source = source;
    if (type) query.type = type;
    if (category) query.category = category;
    if (tags && tags.length > 0) query.tags = { $all: tags };

    if (search) {
      query.$text = { $search: search };
    }

    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      MarketplaceItem.find(query).sort(sort).skip(skip).limit(limit).lean(),
      MarketplaceItem.countDocuments(query),
    ]);

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Obtiene items destacados
   */
  async getFeatured(limit = 10) {
    return MarketplaceItem.find({
      status: 'approved',
      isFeatured: true,
    })
      .sort('-stars')
      .limit(limit)
      .lean();
  }

  /**
   * Obtiene items populares
   */
  async getPopular(limit = 20, timeRange = '30d') {
    // Para timeRange, se necesitaría tracking de descargas
    return MarketplaceItem.find({
      status: 'approved',
    })
      .sort('-downloads -stars')
      .limit(limit)
      .lean();
  }

  /**
   * Actualiza un item
   */
  async updateItem(pluginId, updates) {
    const item = await MarketplaceItem.findOneAndUpdate(
      { pluginId },
      { $set: updates },
      { new: true },
    );

    if (!item) {
      throw new Error(`Item ${pluginId} not found`);
    }

    logger.info(`[Marketplace] Updated item: ${pluginId}`);
    return item;
  }

  /**
   * Registra una instalación
   */
  async recordInstall(pluginId, userId) {
    const item = await MarketplaceItem.findOneAndUpdate(
      { pluginId },
      {
        $inc: { downloads: 1 },
        $set: { lastUpdated: new Date() },
      },
      { new: true },
    );

    if (!item) {
      throw new Error(`Item ${pluginId} not found`);
    }

    logger.info(`[Marketplace] Install recorded: ${pluginId}`);
    return item;
  }

  /**
   * Aprueba un item
   */
  async approveItem(pluginId, approvedBy) {
    return this.updateItem(pluginId, {
      status: 'approved',
      approvedBy,
      approvedAt: new Date(),
    });
  }

  /**
   * Rechaza un item
   */
  async rejectItem(pluginId, reason) {
    return this.updateItem(pluginId, {
      status: 'rejected',
      rejectionReason: reason,
    });
  }

  /**
   * Destaca un item
   */
  async featureItem(pluginId, featured = true) {
    return this.updateItem(pluginId, {
      isFeatured: featured,
    });
  }

  /**
   * Elimina un item
   */
  async deleteItem(pluginId) {
    const result = await MarketplaceItem.deleteOne({ pluginId });

    if (result.deletedCount === 0) {
      throw new Error(`Item ${pluginId} not found`);
    }

    logger.info(`[Marketplace] Deleted item: ${pluginId}`);
    return result;
  }

  /**
   * Obtiene estadísticas del marketplace
   */
  async getStats() {
    const [total, bySource, byType, topRated] = await Promise.all([
      MarketplaceItem.countDocuments({ status: 'approved' }),
      MarketplaceItem.aggregate([
        { $match: { status: 'approved' } },
        { $group: { _id: '$source', count: { $sum: 1 } } },
      ]),
      MarketplaceItem.aggregate([
        { $match: { status: 'approved' } },
        { $group: { _id: '$type', count: { $sum: 1 } } },
      ]),
      MarketplaceItem.find({ status: 'approved' })
        .sort('-rating')
        .limit(5)
        .select('name rating reviewCount')
        .lean(),
    ]);

    return {
      total,
      bySource: bySource.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
      byType: byType.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
      topRated,
    };
  }

  /**
   * Sincroniza items desde fuentes externas
   */
  async syncFromSource(source, items) {
    const bulkOps = items.map((item) => ({
      updateOne: {
        filter: { pluginId: item.pluginId },
        update: { $set: { ...item, lastUpdated: new Date() } },
        upsert: true,
      },
    }));

    const result = await MarketplaceItem.bulkWrite(bulkOps);

    logger.info(
      `[Marketplace] Synced from ${source}: ${result.upsertedCount} new, ${result.modifiedCount} modified`,
    );

    return result;
  }

  /**
   * Busca items similares
   */
  async findSimilar(pluginId, limit = 5) {
    const item = await this.getItem(pluginId);
    if (!item) return [];

    return MarketplaceItem.find({
      status: 'approved',
      pluginId: { $ne: pluginId },
      $or: [{ tags: { $in: item.tags } }, { category: item.category }, { type: item.type }],
    })
      .sort('-stars')
      .limit(limit)
      .lean();
  }

  /**
   * Agrega una review
   */
  async addReview(pluginId, review) {
    const item = await MarketplaceItem.findOne({ pluginId });
    if (!item) {
      throw new Error(`Item ${pluginId} not found`);
    }

    // Calcular nuevo rating
    const newReviewCount = item.reviewCount + 1;
    const newRating = (item.rating * item.reviewCount + review.rating) / newReviewCount;

    await MarketplaceItem.updateOne(
      { pluginId },
      {
        $push: { reviews: review },
        $set: {
          rating: newRating,
          reviewCount: newReviewCount,
        },
      },
    );

    logger.info(`[Marketplace] Review added to ${pluginId}`);

    return this.getItem(pluginId);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = new MarketplaceService();
