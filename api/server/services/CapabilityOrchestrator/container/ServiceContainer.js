/**
 * ServiceContainer - Contenedor de servicios con Dependency Injection
 *
 * Implementación simple y efectiva de DI con soporte para:
 * - Singleton: Una instancia por aplicación
 * - Transient: Nueva instancia por resolución
 * - Scoped: Una instancia por scope
 */

const { ServiceLifecycle } = require('../constants/Types');

class ServiceContainer {
  constructor(options = {}) {
    // Registro de servicios
    this._services = new Map();

    // Instancias singletons
    this._instances = new Map();

    // Scopes activos
    this._scopes = new Map();

    // Opciones
    this._options = {
      enableAutoResolve: options.strictMode ? false : (options.enableAutoResolve ?? true),
      strictMode: options.strictMode ?? false,
    };

    // Logger
    this._logger = options.logger || {
      info: (...args) => console.log('[Container]', ...args),
      warn: (...args) => console.warn('[Container]', ...args),
      error: (...args) => console.error('[Container]', ...args),
    };
  }

  /**
   * Registrar un servicio
   *
   * @param {string} name - Nombre del servicio
   * @param {Function|Object} factory - Factory function o instancia directa
   * @param {Object} options - Opciones del servicio
   * @returns {ServiceContainer} this para chaining
   */
  register(name, factory, options = {}) {
    if (this._services.has(name)) {
      if (this._options.strictMode) {
        throw new Error(`Service already registered: ${name}`);
      }
      this._logger.warn(`Service ${name} already registered, overwriting`);
    }

    const service = {
      name,
      factory: typeof factory === 'function' ? factory : () => factory,
      lifecycle: options.lifecycle || ServiceLifecycle.SINGLETON,
      dependencies: options.dependencies || [],
      metadata: options.metadata || {},
    };

    this._services.set(name, service);
    this._logger.info(`Registered service: ${name} (${service.lifecycle})`);

    return this;
  }

  /**
   * Registrar un singleton (instancia única por aplicación)
   */
  registerSingleton(name, factory, dependencies = []) {
    return this.register(name, factory, {
      lifecycle: ServiceLifecycle.SINGLETON,
      dependencies,
    });
  }

  /**
   * Registrar un transient (nueva instancia por request)
   */
  registerTransient(name, factory, dependencies = []) {
    return this.register(name, factory, {
      lifecycle: ServiceLifecycle.TRANSIENT,
      dependencies,
    });
  }

  /**
   * Registrar un scoped (instancia por scope)
   */
  registerScoped(name, factory, dependencies = []) {
    return this.register(name, factory, {
      lifecycle: ServiceLifecycle.SCOPED,
      dependencies,
    });
  }

  /**
   * Alias para registrar singleton
   */
  singleton(name, factory, dependencies) {
    return this.registerSingleton(name, factory, dependencies);
  }

  /**
   * Alias para registrar transient
   */
  transient(name, factory, dependencies) {
    return this.registerTransient(name, factory, dependencies);
  }

  /**
   * Alias para registrar scoped
   */
  scoped(name, factory, dependencies) {
    return this.registerScoped(name, factory, dependencies);
  }

  /**
   * Resolver un servicio
   *
   * @param {string} name - Nombre del servicio
   * @param {string|null} scopeId - ID del scope (para servicios scoped)
   * @returns {*} Instancia del servicio
   */
  resolve(name, scopeId = null) {
    const service = this._services.get(name);

    if (!service) {
      if (this._options.enableAutoResolve) {
        // Auto-resolve: crear transient automáticamente
        this._logger.warn(`Service ${name} not registered, creating transient`);
        return this.registerTransient(name, class {}).resolve(name);
      }
      throw new Error(`Service not registered: ${name}`);
    }

    switch (service.lifecycle) {
      case ServiceLifecycle.SINGLETON:
        return this._resolveSingleton(service);
      case ServiceLifecycle.TRANSIENT:
        return this._resolveTransient(service);
      case ServiceLifecycle.SCOPED:
        return this._resolveScoped(service, scopeId);
      default:
        throw new Error(`Unknown lifecycle: ${service.lifecycle}`);
    }
  }

  /**
   * Resolver singleton
   */
  _resolveSingleton(service) {
    if (!this._instances.has(service.name)) {
      this._instances.set(service.name, this._createInstance(service));
    }
    return this._instances.get(service.name);
  }

  /**
   * Resolver transient
   */
  _resolveTransient(service) {
    return this._createInstance(service);
  }

  /**
   * Resolver scoped
   */
  _resolveScoped(service, scopeId) {
    if (!scopeId) {
      throw new Error(`Scope ID required for scoped service: ${service.name}`);
    }

    if (!this._scopes.has(scopeId)) {
      this._scopes.set(scopeId, new Map());
    }

    const scopeInstances = this._scopes.get(scopeId);

    if (!scopeInstances.has(service.name)) {
      scopeInstances.set(service.name, this._createInstance(service));
    }

    return scopeInstances.get(service.name);
  }

  /**
   * Crear instancia resolviendo dependencias
   */
  _createInstance(service) {
    // Resolver dependencias
    const deps = service.dependencies.map((dep) => {
      if (typeof dep === 'string') {
        return this.resolve(dep);
      }

      // Dependencia con nombre específico
      return this.resolve(dep.name);
    });

    // Crear instancia
    try {
      const instance = service.factory(...deps);
      return instance;
    } catch (error) {
      throw new Error(`Failed to create instance of ${service.name}: ${error.message}`);
    }
  }

  /**
   * Crear un nuevo scope
   *
   * @returns {Object} Scope con id y métodos
   */
  createScope() {
    const scopeId = `scope_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this._scopes.set(scopeId, new Map());

    return {
      id: scopeId,
      container: this,

      /**
       * Resolver en este scope
       */
      resolve: (name) => this.resolve(name, scopeId),

      /**
       * Verificar si un servicio está en este scope
       */
      has: (name) => {
        const scopeInstances = this._scopes.get(scopeId);
        return scopeInstances ? scopeInstances.has(name) : false;
      },

      /**
       * Dispose del scope
       */
      dispose: () => this.disposeScope(scopeId),
    };
  }

  /**
   * Disponer un scope
   */
  disposeScope(scopeId) {
    const scopeInstances = this._scopes.get(scopeId);

    if (scopeInstances) {
      // Llamar dispose en cada instancia que lo soporte
      for (const [name, instance] of scopeInstances) {
        if (typeof instance.dispose === 'function') {
          try {
            instance.dispose();
            this._logger.info(`Disposed scoped service: ${name}`);
          } catch (error) {
            this._logger.error(`Error disposing ${name}:`, error);
          }
        }
      }

      this._scopes.delete(scopeId);
      this._logger.info(`Disposed scope: ${scopeId}`);
    }
  }

  /**
   * Clear todos los singletons
   */
  clear() {
    // Dispose de singletons
    for (const [name, instance] of this._instances) {
      if (typeof instance.dispose === 'function') {
        try {
          instance.dispose();
        } catch (error) {
          this._logger.error(`Error disposing ${name}:`, error);
        }
      }
    }

    this._instances.clear();

    // Dispose de todos los scopes
    for (const scopeId of this._scopes.keys()) {
      this.disposeScope(scopeId);
    }

    this._logger.info('Container cleared');
  }

  /**
   * Verificar si un servicio está registrado
   */
  has(name) {
    return this._services.has(name);
  }

  /**
   * Listar servicios registrados
   */
  listServices() {
    return [...this._services.keys()];
  }

  /**
   * Listar servicios por lifecycle
   */
  listByLifecycle(lifecycle) {
    return [...this._services.entries()]
      .filter(([, s]) => s.lifecycle === lifecycle)
      .map(([name]) => name);
  }

  /**
   * Obtener información de un servicio
   */
  getInfo(name) {
    const service = this._services.get(name);
    if (!service) return null;

    return {
      name: service.name,
      lifecycle: service.lifecycle,
      dependencies: service.dependencies,
      hasInstance: this._instances.has(name),
      metadata: service.metadata,
    };
  }

  /**
   * Remover un servicio
   */
  remove(name) {
    const service = this._services.get(name);
    if (!service) return false;

    // Dispose de instancia singleton si existe
    if (this._instances.has(name)) {
      const instance = this._instances.get(name);
      if (typeof instance.dispose === 'function') {
        instance.dispose();
      }
      this._instances.delete(name);
    }

    // Remove de scopes
    for (const [scopeId, scopeInstances] of this._scopes) {
      if (scopeInstances.has(name)) {
        scopeInstances.delete(name);
      }
    }

    this._services.delete(name);
    this._logger.info(`Removed service: ${name}`);

    return true;
  }

  /**
   * Crear child container (hereda servicios del padre)
   */
  createChild() {
    const child = new ServiceContainer({
      ...this._options,
      logger: this._logger,
    });

    // Copiar servicios al child
    for (const [name, service] of this._services) {
      child._services.set(name, service);
    }

    return child;
  }
}

// Singleton global
const globalContainer = new ServiceContainer({
  logger: {
    info: (...args) => console.log('[Container]', ...args),
    warn: (...args) => console.warn('[Container]', ...args),
    error: (...args) => console.error('[Container]', ...args),
  },
});

module.exports = { ServiceContainer, globalContainer };
