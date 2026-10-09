/**
 * Tests for Agent Utilities
 */

import {
  getToolIcon,
  getAgentRoleIcon,
  getStatusIcon,
  getStatusColor,
  getStatusBg,
  getStatusLabel,
  formatDuration,
  isActiveStatus,
  isTerminalStatus,
} from '~/utils/agentUtils';

describe('agentUtils', () => {
  describe('getToolIcon', () => {
    it('returns Terminal for bash commands', () => {
      expect(getToolIcon('bash_tool')).toBeDefined();
      expect(getToolIcon('bash')).toBeDefined();
    });

    it('returns FileText for file operations', () => {
      expect(getToolIcon('read_file')).toBeDefined();
      expect(getToolIcon('Read')).toBeDefined();
    });

    it('returns Search for search operations', () => {
      expect(getToolIcon('search')).toBeDefined();
      expect(getToolIcon('SearchCode')).toBeDefined();
    });

    it('returns Code for code operations', () => {
      expect(getToolIcon('code')).toBeDefined();
      expect(getToolIcon('edit_file')).toBeDefined();
    });

    it('returns Wrench as default', () => {
      expect(getToolIcon('unknown')).toBeDefined();
      expect(getToolIcon('')).toBeDefined();
    });
  });

  describe('getAgentRoleIcon', () => {
    it('returns Crown for orchestrator', () => {
      expect(getAgentRoleIcon('orchestrator')).toBeDefined();
    });

    it('returns User for specialist', () => {
      expect(getAgentRoleIcon('specialist')).toBeDefined();
    });

    it('returns Bot as default', () => {
      expect(getAgentRoleIcon('unknown')).toBeDefined();
    });
  });

  describe('getStatusColor', () => {
    it('returns correct colors for agent states', () => {
      expect(getStatusColor('idle')).toBe('text-gray-400');
      expect(getStatusColor('thinking')).toBe('text-yellow-500');
      expect(getStatusColor('executing')).toBe('text-blue-500');
      expect(getStatusColor('waiting')).toBe('text-purple-500');
      expect(getStatusColor('completed')).toBe('text-green-500');
      expect(getStatusColor('failed')).toBe('text-red-500');
      expect(getStatusColor('paused')).toBe('text-orange-500');
    });
  });

  describe('getStatusBg', () => {
    it('returns correct backgrounds for agent states', () => {
      expect(getStatusBg('idle')).toContain('gray');
      expect(getStatusBg('thinking')).toContain('yellow');
      expect(getStatusBg('completed')).toContain('green');
      expect(getStatusBg('failed')).toContain('red');
    });
  });

  describe('getStatusLabel', () => {
    it('returns correct labels in Spanish', () => {
      expect(getStatusLabel('idle')).toBe('Idle');
      expect(getStatusLabel('thinking')).toBe('Pensando');
      expect(getStatusLabel('executing')).toBe('Ejecutando');
      expect(getStatusLabel('completed')).toBe('Completado');
      expect(getStatusLabel('failed')).toBe('Falló');
    });
  });

  describe('formatDuration', () => {
    it('returns -- for undefined or 0', () => {
      expect(formatDuration(undefined)).toBe('--');
    });

    it('formats milliseconds', () => {
      expect(formatDuration(500)).toBe('500ms');
    });

    it('formats seconds', () => {
      expect(formatDuration(5000)).toBe('5.0s');
    });

    it('formats minutes', () => {
      expect(formatDuration(120000)).toBe('2m 0s');
    });

    it('formats hours', () => {
      expect(formatDuration(3600000)).toBe('1h 0m');
    });
  });

  describe('isActiveStatus', () => {
    it('returns true for active states', () => {
      expect(isActiveStatus('thinking')).toBe(true);
      expect(isActiveStatus('executing')).toBe(true);
      expect(isActiveStatus('running')).toBe(true);
      expect(isActiveStatus('waiting')).toBe(true);
    });

    it('returns false for non-active states', () => {
      expect(isActiveStatus('idle')).toBe(false);
      expect(isActiveStatus('completed')).toBe(false);
      expect(isActiveStatus('failed')).toBe(false);
    });
  });

  describe('isTerminalStatus', () => {
    it('returns true for terminal states', () => {
      expect(isTerminalStatus('completed')).toBe(true);
      expect(isTerminalStatus('failed')).toBe(true);
      expect(isTerminalStatus('cancelled')).toBe(true);
    });

    it('returns false for non-terminal states', () => {
      expect(isTerminalStatus('idle')).toBe(false);
      expect(isTerminalStatus('executing')).toBe(false);
      expect(isTerminalStatus('running')).toBe(false);
    });
  });
});
