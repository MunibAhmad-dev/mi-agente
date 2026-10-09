/**
 * Tests para PermissionService
 */

import { PermissionService } from '../Permissions/PermissionService';

describe('PermissionService', () => {
  let permissionService: PermissionService;

  beforeEach(() => {
    permissionService = PermissionService.getInstance();
  });

  describe('Permisos de Herramientas', () => {
    test('should get default tool permission', () => {
      const permission = permissionService.getToolPermission('read_file');

      expect(permission).not.toBeNull();
      expect(permission?.toolId).toBe('read_file');
      expect(permission?.category).toBe('file');
      expect(permission?.level).toBe('read');
      expect(permission?.requiresApproval).toBe(false);
    });

    test('should update tool permission', () => {
      const updated = permissionService.updateToolPermission('read_file', {
        requiresApproval: true,
        level: 'write',
      });

      expect(updated).toBe(true);

      const permission = permissionService.getToolPermission('read_file');
      expect(permission?.requiresApproval).toBe(true);
      expect(permission?.level).toBe('write');
    });

    test('should list tool permissions by category', () => {
      const filePermissions = permissionService.listToolPermissions('file');

      expect(filePermissions.length).toBeGreaterThan(0);
      expect(filePermissions.every((p) => p.category === 'file')).toBe(true);
    });

    test('should list all tool permissions', () => {
      const allPermissions = permissionService.listToolPermissions();

      expect(allPermissions.length).toBeGreaterThan(0);
    });

    test('should check if tool is allowed for agent', () => {
      // Registrar agente
      permissionService.registerAgent('agent-1', 'Test Agent');

      // Por defecto, sin herramientas específicas, debería ser denegado
      expect(permissionService.isToolAllowed('agent-1', 'read_file')).toBe(false);

      // Permitir herramienta
      permissionService.allowTool('agent-1', 'read_file');

      expect(permissionService.isToolAllowed('agent-1', 'read_file')).toBe(true);

      // Denegar herramienta
      permissionService.denyTool('agent-1', 'read_file');

      expect(permissionService.isToolAllowed('agent-1', 'read_file')).toBe(false);
    });

    test('should check if tool requires approval', () => {
      expect(permissionService.requiresApproval('write_file')).toBe(true);
      expect(permissionService.requiresApproval('read_file')).toBe(false);
    });
  });

  describe('Permisos de Agentes', () => {
    test('should register new agent', () => {
      const permission = permissionService.registerAgent('agent-new', 'New Agent');

      expect(permission).not.toBeNull();
      expect(permission.agentId).toBe('agent-new');
      expect(permission.agentName).toBe('New Agent');
      expect(permission.maxConcurrentTasks).toBe(5);
      expect(permission.canCreateSubagents).toBe(false);
    });

    test('should get agent permission', () => {
      permissionService.registerAgent('agent-1', 'Test Agent');

      const permission = permissionService.getAgentPermission('agent-1');

      expect(permission).not.toBeNull();
      expect(permission?.agentId).toBe('agent-1');
    });

    test('should update agent permission', () => {
      permissionService.registerAgent('agent-1', 'Test Agent');

      const updated = permissionService.updateAgentPermission('agent-1', {
        maxConcurrentTasks: 10,
        canCreateSubagents: true,
      });

      expect(updated).toBe(true);

      const permission = permissionService.getAgentPermission('agent-1');
      expect(permission?.maxConcurrentTasks).toBe(10);
      expect(permission?.canCreateSubagents).toBe(true);
    });

    test('should allow tool for agent', () => {
      permissionService.registerAgent('agent-1', 'Test Agent');

      const allowed = permissionService.allowTool('agent-1', 'run_command');

      expect(allowed).toBe(true);

      const permission = permissionService.getAgentPermission('agent-1');
      expect(permission?.allowedTools).toContain('run_command');
      expect(permission?.deniedTools).not.toContain('run_command');
    });

    test('should deny tool for agent', () => {
      permissionService.registerAgent('agent-1', 'Test Agent');

      const denied = permissionService.denyTool('agent-1', 'run_command');

      expect(denied).toBe(true);

      const permission = permissionService.getAgentPermission('agent-1');
      expect(permission?.deniedTools).toContain('run_command');
      expect(permission?.allowedTools).not.toContain('run_command');
    });
  });

  describe('Solicitudes de Aprobación', () => {
    test('should create permission request', () => {
      const request = permissionService.createPermissionRequest(
        'agent-1',
        'Test Agent',
        { toolId: 'run_command' },
        'execute',
        'Necesito ejecutar comandos',
        { command: 'ls' },
      );

      expect(request).not.toBeNull();
      expect(request.id).toBeDefined();
      expect(request.status).toBe('pending');
      expect(request.requestedLevel).toBe('execute');
      expect(request.reason).toBe('Necesito ejecutar comandos');
    });

    test('should approve request', () => {
      const request = permissionService.createPermissionRequest(
        'agent-1',
        'Test Agent',
        { toolId: 'run_command' },
        'execute',
      );

      const approved = permissionService.approveRequest(request.id, 'admin-1', 'Aprobado');

      expect(approved).toBe(true);

      const updated = permissionService.getPendingRequests();
      expect(updated.find((r) => r.id === request.id)).toBeUndefined();
    });

    test('should deny request', () => {
      const request = permissionService.createPermissionRequest(
        'agent-1',
        'Test Agent',
        { toolId: 'delete_file' },
        'write',
      );

      const denied = permissionService.denyRequest(request.id, 'admin-1', 'Demasiado peligroso');

      expect(denied).toBe(true);

      const updated = permissionService.getPendingRequests();
      expect(updated.find((r) => r.id === request.id)).toBeUndefined();
    });

    test('should get pending requests', () => {
      permissionService.createPermissionRequest(
        'agent-1',
        'Agent 1',
        { toolId: 'test' },
        'execute',
      );
      permissionService.createPermissionRequest(
        'agent-2',
        'Agent 2',
        { toolId: 'test' },
        'execute',
      );
      permissionService.createPermissionRequest(
        'agent-3',
        'Agent 3',
        { toolId: 'test' },
        'execute',
      );

      const pending = permissionService.getPendingRequests();

      expect(pending.length).toBe(3);
    });
  });

  describe('Acción de Permisos', () => {
    test('should register action with permissions', () => {
      permissionService.registerAction({
        actionId: 'deploy',
        actionName: 'Deploy Application',
        requiredPermissionLevel: 'admin',
        allowedAgents: ['deploy-agent'],
        deniedAgents: [],
      });

      expect(permissionService.canPerformAction('deploy-agent', 'deploy')).toBe(true);
      expect(permissionService.canPerformAction('other-agent', 'deploy')).toBe(false);
    });

    test('should deny action for denied agents', () => {
      permissionService.registerAction({
        actionId: 'secure-action',
        actionName: 'Secure Action',
        requiredPermissionLevel: 'admin',
        allowedAgents: [],
        deniedAgents: ['banned-agent'],
      });

      expect(permissionService.canPerformAction('banned-agent', 'secure-action')).toBe(false);
      expect(permissionService.canPerformAction('other-agent', 'secure-action')).toBe(true);
    });

    test('should allow action with conditions', () => {
      permissionService.registerAction({
        actionId: 'limited-action',
        actionName: 'Limited Action',
        requiredPermissionLevel: 'execute',
        allowedAgents: [],
        deniedAgents: [],
        conditions: [{ field: 'count', operator: 'lt', value: 10 }],
      });

      expect(permissionService.canPerformAction('any-agent', 'limited-action', { count: 5 })).toBe(
        true,
      );
      expect(permissionService.canPerformAction('any-agent', 'limited-action', { count: 15 })).toBe(
        false,
      );
    });
  });

  describe('Grants', () => {
    test('should create permission grant', () => {
      permissionService.registerAgent('agent-1', 'Test Agent');

      const toolPermission = permissionService.getToolPermission('run_command')!;

      const grant = permissionService.createGrant('agent-1', 'agent', toolPermission, 'admin', {
        expiresAt: new Date(Date.now() + 60000),
      });

      expect(grant).not.toBeNull();
      expect(grant.targetId).toBe('agent-1');
      expect(grant.grantedBy).toBe('admin');
      expect(grant.expiresAt).toBeDefined();
    });

    test('should check if grant is valid', () => {
      permissionService.registerAgent('agent-1', 'Test Agent');

      const toolPermission = permissionService.getToolPermission('run_command')!;

      const grant = permissionService.createGrant('agent-1', 'agent', toolPermission, 'admin', {
        expiresAt: new Date(Date.now() + 60000),
      });

      expect(permissionService.isGrantValid(grant.id)).toBe(true);
    });

    test('should detect expired grant', () => {
      permissionService.registerAgent('agent-1', 'Test Agent');

      const toolPermission = permissionService.getToolPermission('run_command')!;

      const grant = permissionService.createGrant(
        'agent-1',
        'agent',
        toolPermission,
        'admin',
        { expiresAt: new Date(Date.now() - 1000) }, // Expirado
      );

      expect(permissionService.isGrantValid(grant.id)).toBe(false);
    });

    test('should revoke grant', () => {
      permissionService.registerAgent('agent-1', 'Test Agent');

      const toolPermission = permissionService.getToolPermission('run_command')!;

      const grant = permissionService.createGrant('agent-1', 'agent', toolPermission, 'admin');

      const revoked = permissionService.revokeGrant(grant.id);

      expect(revoked).toBe(true);
      expect(permissionService.isGrantValid(grant.id)).toBe(false);
    });
  });

  describe('Condiciones', () => {
    test('should evaluate eq condition', () => {
      permissionService.registerAction({
        actionId: 'test-eq',
        actionName: 'Test EQ',
        requiredPermissionLevel: 'execute',
        allowedAgents: [],
        deniedAgents: [],
        conditions: [{ field: 'status', operator: 'eq', value: 'active' }],
      });

      expect(permissionService.canPerformAction('agent', 'test-eq', { status: 'active' })).toBe(
        true,
      );
      expect(permissionService.canPerformAction('agent', 'test-eq', { status: 'inactive' })).toBe(
        false,
      );
    });

    test('should evaluate gt condition', () => {
      permissionService.registerAction({
        actionId: 'test-gt',
        actionName: 'Test GT',
        requiredPermissionLevel: 'execute',
        allowedAgents: [],
        deniedAgents: [],
        conditions: [{ field: 'level', operator: 'gt', value: 5 }],
      });

      expect(permissionService.canPerformAction('agent', 'test-gt', { level: 10 })).toBe(true);
      expect(permissionService.canPerformAction('agent', 'test-gt', { level: 3 })).toBe(false);
    });

    test('should evaluate in condition', () => {
      permissionService.registerAction({
        actionId: 'test-in',
        actionName: 'Test IN',
        requiredPermissionLevel: 'execute',
        allowedAgents: [],
        deniedAgents: [],
        conditions: [{ field: 'role', operator: 'in', value: ['admin', 'manager'] }],
      });

      expect(permissionService.canPerformAction('agent', 'test-in', { role: 'admin' })).toBe(true);
      expect(permissionService.canPerformAction('agent', 'test-in', { role: 'user' })).toBe(false);
    });
  });

  describe('Eventos', () => {
    test('should emit request_created event', async () => {
      const promise = new Promise<void>((resolve) => {
        permissionService.on('permission:request_created', ({ request }) => {
          expect(request.requesterId).toBe('agent-1');
          resolve();
        });
      });

      permissionService.createPermissionRequest('agent-1', 'Agent', { toolId: 'test' }, 'execute');
      await promise;
    });

    test('should emit request_approved event', async () => {
      const request = permissionService.createPermissionRequest(
        'agent-1',
        'Agent',
        { toolId: 'test' },
        'execute',
      );

      const promise = new Promise<void>((resolve) => {
        permissionService.on('permission:request_approved', ({ request: req }) => {
          expect(req.id).toBe(request.id);
          expect(req.status).toBe('approved');
          resolve();
        });
      });

      permissionService.approveRequest(request.id, 'admin');
      await promise;
    });

    test('should emit agent:unregistered event', async () => {
      permissionService.registerAgent('agent-to-remove', 'Agent');

      const promise = new Promise<void>((resolve) => {
        permissionService.on('agent:unregistered', ({ agentId }) => {
          expect(agentId).toBe('agent-to-remove');
          resolve();
        });
      });

      permissionService.unregisterAgent('agent-to-remove');
      await promise;
    });
  });

  describe('Limpieza', () => {
    test('should cleanup expired requests', () => {
      // Crear solicitudes (se marcarán como expiradas después de una hora)
      permissionService.createPermissionRequest('agent-1', 'Agent', { toolId: 'test' }, 'execute');

      // La limpieza debería funcionar
      const cleaned = permissionService.cleanupExpiredRequests();

      expect(typeof cleaned).toBe('number');
    });
  });
});
