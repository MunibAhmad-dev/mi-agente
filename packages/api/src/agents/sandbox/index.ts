/**
 * Sandbox - Sistema de Workspace Aislado
 * 
 * Proporciona entornos aislados para ejecutar tareas de agente
 * antes de afectar el entorno principal.
 * 
 * @example
 * ```typescript
 * import { SandboxManager, FileSystemSandbox } from './sandbox';
 * 
 * // Crear manager
 * const manager = new SandboxManager();
 * 
 * // Crear sandbox
 * const sandboxId = await manager.createSandbox({
 *   type: 'filesystem',
 *   userId: 'user-123',
 * });
 * 
 * // Escribir archivos
 * await manager.writeFile(sandboxId, '/app.js', 'console.log("hello")');
 * 
 * // Ejecutar comando
 * const result = await manager.executeCommand(sandboxId, 'npm test');
 * 
 * // Ver cambios
 * const changes = await manager.getChanges(sandboxId);
 * 
 * // Aplicar o descartar
 * await manager.applyChanges(sandboxId); // o discardChanges()
 * ```
 */

export * from './types';
export { SandboxInterface, SandboxFactory } from './SandboxInterface';
export { FileSystemSandbox } from './FileSystemSandbox';
export {
  SandboxManager,
  getSandboxManager,
  createSandboxManager,
  type SandboxManagerConfig,
  type SandboxHandle,
} from './SandboxManager';
