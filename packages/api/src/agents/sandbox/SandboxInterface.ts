/**
 * SandboxInterface - Interfaz base abstracta para implementaciones de sandbox
 * 
 * Define el contrato que todas las implementaciones de sandbox deben seguir,
 * permitiendo intercambiarlas sin modificar el código que las usa.
 */

import type {
  SandboxConfig,
  SandboxCapabilities,
  SandboxFile,
  SandboxCommand,
  SandboxCommandResult,
  SandboxExecutionResult,
  SandboxDiff,
  SandboxSnapshot,
  SandboxContext,
  SandboxStats,
  ApplySandboxChangesOptions,
  SandboxChangePreview,
} from './types';

/**
 * Interfaz base para todas las implementaciones de sandbox
 * 
 * Implementaciones concretas:
 * - FileSystemSandbox: Usa un directorio local aislado
 * - ContainerSandbox: Usa Docker/Kubernetes
 * - VMSandbox: Usa máquinas virtuales
 * - MockSandbox: Para testing
 */
export abstract class SandboxInterface {
  protected config: SandboxConfig;
  protected context?: SandboxContext;

  constructor(config: SandboxConfig) {
    this.config = config;
  }

  /**
   * Obtener ID único del sandbox
   */
  get id(): string {
    return this.config.id;
  }

  /**
   * Obtener tipo de sandbox
   */
  get type(): string {
    return this.config.type;
  }

  /**
   * Obtener workspace path
   */
  get workspacePath(): string | undefined {
    return this.config.workspacePath;
  }

  /**
   * Inicializar el sandbox
   */
  abstract initialize(): Promise<void>;

  /**
   * Verificar si el sandbox está listo para usar
   */
  abstract isReady(): boolean;

  /**
   * Obtener las capacidades del sandbox
   */
  abstract getCapabilities(): SandboxCapabilities;

  /**
   * Obtener contexto de ejecución
   */
  abstract getContext(): SandboxContext;

  /**
   * Leer archivo(s) del sandbox
   */
  abstract readFile(path: string): Promise<string>;
  abstract readFiles(paths: string[]): Promise<Record<string, string>>;

  /**
   * Escribir archivo(s) en el sandbox
   */
  abstract writeFile(path: string, content: string, encoding?: string): Promise<void>;
  abstract writeFiles(files: SandboxFile[]): Promise<void>;

  /**
   * Eliminar archivo(s) del sandbox
   */
  abstract deleteFile(path: string): Promise<void>;
  abstract deleteFiles(paths: string[]): Promise<void>;

  /**
   * Listar archivos en un directorio
   */
  abstract listFiles(path: string, recursive?: boolean): Promise<string[]>;

  /**
   * Verificar si existe un archivo
   */
  abstract fileExists(path: string): Promise<boolean>;

  /**
   * Ejecutar comando en el sandbox
   */
  abstract executeCommand(command: SandboxCommand): Promise<SandboxCommandResult>;

  /**
   * Ejecutar múltiples comandos
   */
  abstract executeCommands(commands: SandboxCommand[]): Promise<SandboxCommandResult[]>;

  /**
   * Obtener los cambios (diff) del sandbox vs el estado original
   */
  abstract getChanges(): Promise<SandboxDiff[]>;

  /**
   * Vista previa de cambios
   */
  abstract previewChanges(): Promise<SandboxChangePreview>;

  /**
   * Aplicar cambios del sandbox al entorno principal
   */
  abstract applyChanges(options?: ApplySandboxChangesOptions): Promise<void>;

  /**
   * Descartar cambios y limpiar sandbox
   */
  abstract discardChanges(): Promise<void>;

  /**
   * Crear snapshot del estado actual
   */
  abstract createSnapshot(metadata?: Record<string, unknown>): Promise<SandboxSnapshot>;

  /**
   * Restaurar desde snapshot
   */
  abstract restoreSnapshot(snapshotId: string): Promise<void>;

  /**
   * Obtener estadísticas del sandbox
   */
  abstract getStats(): SandboxStats;

  /**
   * Limpiar recursos del sandbox
   */
  abstract dispose(): Promise<void>;

  /**
   * Hook para eventos
   */
  protected emit(event: string, payload: Record<string, unknown>): void {
    // Implementado por subclases o por el manager
  }
}

/**
 * Factory para crear instancias de sandbox según configuración
 */
export class SandboxFactory {
  private static implementations = new Map<string, new (config: SandboxConfig) => SandboxInterface>();

  /**
   * Registrar una implementación de sandbox
   */
  static register(type: string, implementation: new (config: SandboxConfig) => SandboxInterface): void {
    this.implementations.set(type, implementation);
  }

  /**
   * Verificar si un tipo está registrado
   */
  static isRegistered(type: string): boolean {
    return this.implementations.has(type);
  }

  /**
   * Crear instancia de sandbox según tipo
   */
  static create(config: SandboxConfig): SandboxInterface {
    const Implementation = this.implementations.get(config.type);
    
    if (!Implementation) {
      throw new Error(
        `Sandbox implementation not found for type: ${config.type}. ` +
        `Available types: ${[...this.implementations.keys()].join(', ')}`
      );
    }

    return new Implementation(config);
  }

  /**
   * Listar tipos de sandbox disponibles
   */
  static availableTypes(): string[] {
    return [...this.implementations.keys()];
  }
}

/**
 * Decorador para implementar SandboxInterface con funcionalidad común
 */
export function applySandboxMixins<T extends new (...args: any[]) => SandboxInterface>(
  baseClass: T
): T {
  return baseClass;
}
