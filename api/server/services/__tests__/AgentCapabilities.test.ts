/**
 * Tests para AgentCapabilities
 */

import {
  AGENT_CAPABILITY_CONFIGS,
  getAgentModel,
  getAgentRouteDecision,
  adaptAgentToCapabilities,
  validateAgentCapabilities,
  AVAILABLE_CAPABILITIES,
  getCapabilityRouter,
} from '../AgentCapabilities';
import { Capability } from '../RuntimeRegistry';

describe('AgentCapabilities', () => {
  describe('AGENT_CAPABILITY_CONFIGS', () => {
    test('should have configurations for common roles', () => {
      expect(AGENT_CAPABILITY_CONFIGS).toHaveProperty('coder');
      expect(AGENT_CAPABILITY_CONFIGS).toHaveProperty('researcher');
      expect(AGENT_CAPABILITY_CONFIGS).toHaveProperty('analyst');
      expect(AGENT_CAPABILITY_CONFIGS).toHaveProperty('writer');
      expect(AGENT_CAPABILITY_CONFIGS).toHaveProperty('reviewer');
      expect(AGENT_CAPABILITY_CONFIGS).toHaveProperty('orchestrator');
      expect(AGENT_CAPABILITY_CONFIGS).toHaveProperty('general');
    });

    test('should have required capabilities for each role', () => {
      Object.entries(AGENT_CAPABILITY_CONFIGS).forEach(([role, config]) => {
        expect(config.role).toBe(role);
        expect(config.requiredCapabilities).toBeDefined();
        expect(Array.isArray(config.requiredCapabilities)).toBe(true);
        expect(config.requiredCapabilities.length).toBeGreaterThan(0);
      });
    });

    test('coder role should require coding capabilities', () => {
      const coderConfig = AGENT_CAPABILITY_CONFIGS.coder;

      expect(coderConfig.requiredCapabilities).toContain(Capability.LLM_CHAT);
      expect(coderConfig.requiredCapabilities).toContain(Capability.LLM_FUNCTION_CALLING);
      expect(coderConfig.preferredCapabilities).toContain(Capability.CODE_EXECUTION);
    });

    test('researcher role should require search capabilities', () => {
      const researcherConfig = AGENT_CAPABILITY_CONFIGS.researcher;

      expect(researcherConfig.requiredCapabilities).toContain(Capability.LLM_CHAT);
      expect(researcherConfig.requiredCapabilities).toContain(Capability.WEB_SEARCH);
    });

    test('reviewer role should require code execution', () => {
      const reviewerConfig = AGENT_CAPABILITY_CONFIGS.reviewer;

      expect(reviewerConfig.requiredCapabilities).toContain(Capability.LLM_CHAT);
      expect(reviewerConfig.requiredCapabilities).toContain(Capability.CODE_EXECUTION);
    });
  });

  describe('getAgentModel', () => {
    test('should return model for coder role', () => {
      const result = getAgentModel('coder');

      expect(result).not.toBeNull();
      expect(result).toHaveProperty('provider');
      expect(result).toHaveProperty('model');
      expect(typeof result!.provider).toBe('string');
      expect(typeof result!.model).toBe('string');
    });

    test('should return model for researcher role', () => {
      const result = getAgentModel('researcher');

      expect(result).not.toBeNull();
      expect(result!.provider).toBeDefined();
      expect(result!.model).toBeDefined();
    });

    test('should return model for general role', () => {
      const result = getAgentModel('general');

      expect(result).not.toBeNull();
    });

    test('should return null for unknown role', () => {
      const result = getAgentModel('unknown_role_xyz');

      expect(result).toBeNull();
    });

    test('should respect cost constraints', () => {
      const result = getAgentModel('coder', { maxCost: 0.001 });

      expect(result).not.toBeNull();
    });

    test('should respect latency constraints', () => {
      const result = getAgentModel('general', { maxLatency: 100 });

      expect(result).not.toBeNull();
    });
  });

  describe('getAgentRouteDecision', () => {
    test('should return route decision for valid role', () => {
      const decision = getAgentRouteDecision('coder');

      expect(decision).not.toBeNull();
      expect(decision).toHaveProperty('runtime');
      expect(decision).toHaveProperty('runtimeInstance');
      expect(decision).toHaveProperty('provider');
      expect(decision).toHaveProperty('model');
      expect(decision).toHaveProperty('executionProfile');
      expect(decision).toHaveProperty('reason');
      expect(decision).toHaveProperty('fallbackProviders');
      expect(decision).toHaveProperty('score');
    });

    test('should return null for unknown role', () => {
      const decision = getAgentRouteDecision('nonexistent_role');

      expect(decision).toBeNull();
    });
  });

  describe('adaptAgentToCapabilities', () => {
    test('should preserve existing model if specified', () => {
      const agent = { model: 'gpt-4', capabilities: [] };

      const adapted = adaptAgentToCapabilities(agent);

      expect(adapted.model).toBe('gpt-4');
    });

    test('should use capability-based model for new agent', () => {
      const agent = {
        capabilities: ['researcher'],
      };

      const adapted = adaptAgentToCapabilities(agent, 'researcher');

      expect(adapted.model).toBeDefined();
      expect(adapted.capabilities).toEqual(['researcher']);
    });

    test('should fallback to gpt-4o for general role', () => {
      const agent = { capabilities: ['unknown'] };

      const adapted = adaptAgentToCapabilities(agent, 'general');

      expect(adapted.model).toBe('gpt-4o');
    });

    test('should preserve capabilities array', () => {
      const agent = {
        model: 'gpt-4',
        capabilities: ['coder', 'reviewer'],
      };

      const adapted = adaptAgentToCapabilities(agent);

      expect(adapted.capabilities).toEqual(['coder', 'reviewer']);
    });
  });

  describe('validateAgentCapabilities', () => {
    test('should validate with all required capabilities', () => {
      const agentCapabilities = [
        Capability.LLM_CHAT,
        Capability.LLM_FUNCTION_CALLING,
        Capability.CODE_EXECUTION,
      ];

      const required = [Capability.LLM_CHAT, Capability.LLM_FUNCTION_CALLING];

      const result = validateAgentCapabilities(agentCapabilities, required);

      expect(result.valid).toBe(true);
      expect(result.missing).toHaveLength(0);
    });

    test('should detect missing capabilities', () => {
      const agentCapabilities = [Capability.LLM_CHAT];

      const required = [
        Capability.LLM_CHAT,
        Capability.LLM_FUNCTION_CALLING,
        Capability.CODE_EXECUTION,
      ];

      const result = validateAgentCapabilities(agentCapabilities, required);

      expect(result.valid).toBe(false);
      expect(result.missing).toContain(Capability.LLM_FUNCTION_CALLING);
      expect(result.missing).toContain(Capability.CODE_EXECUTION);
      expect(result.missing).toHaveLength(2);
    });

    test('should return valid for empty requirements', () => {
      const agentCapabilities = [Capability.LLM_CHAT];

      const result = validateAgentCapabilities(agentCapabilities, []);

      expect(result.valid).toBe(true);
      expect(result.missing).toHaveLength(0);
    });

    test('should return valid for empty agent capabilities', () => {
      const result = validateAgentCapabilities([], []);

      expect(result.valid).toBe(true);
    });
  });

  describe('AVAILABLE_CAPABILITIES', () => {
    test('should include common capabilities', () => {
      expect(AVAILABLE_CAPABILITIES).toContain(Capability.LLM_CHAT);
      expect(AVAILABLE_CAPABILITIES).toContain(Capability.LLM_REASONING);
      expect(AVAILABLE_CAPABILITIES).toContain(Capability.CODE_EXECUTION);
      expect(AVAILABLE_CAPABILITIES).toContain(Capability.WEB_SEARCH);
    });

    test('should not have duplicates', () => {
      const unique = new Set(AVAILABLE_CAPABILITIES);

      expect(AVAILABLE_CAPABILITIES.length).toBe(unique.size);
    });
  });

  describe('getCapabilityRouter', () => {
    test('should return singleton instance', () => {
      const router1 = getCapabilityRouter();
      const router2 = getCapabilityRouter();

      expect(router1).toBe(router2);
    });

    test('should have route method', () => {
      const router = getCapabilityRouter();

      expect(typeof router.route).toBe('function');
    });
  });

  describe('Capability routing flow', () => {
    test('coder should route to code-optimized provider', () => {
      const decision = getAgentRouteDecision('coder');

      expect(decision).not.toBeNull();
      // El reason debería mencionar CODE o FUNCTION_CALLING
      expect(['CODE', 'FUNCTION'].some((k) => decision!.reason.includes(k))).toBe(true);
    });

    test('researcher should route to search-optimized provider', () => {
      const decision = getAgentRouteDecision('researcher');

      expect(decision).not.toBeNull();
      // El reason debería mencionar SEARCH o RAG
      expect(['SEARCH', 'RAG'].some((k) => decision!.reason.includes(k))).toBe(true);
    });

    test('orchestrator should route to reasoning-optimized provider', () => {
      const decision = getAgentRouteDecision('orchestrator');

      expect(decision).not.toBeNull();
      expect(['REASON', 'CHAT'].some((k) => decision!.reason.includes(k))).toBe(true);
    });
  });
});
