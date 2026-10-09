/**
 * Specialized Agents
 * ==================
 * Agentes predefinidos para tareas específicas
 */

export type SpecializedAgentType = 
  | 'qa'
  | 'security'
  | 'docker'
  | 'code_review'
  | 'deep_research';

export interface AgentResult {
  success: boolean;
  output: string;
  error?: string;
  metadata?: Record<string, any>;
}

export interface BaseAgent {
  name: string;
  description: string;
  type: SpecializedAgentType;
  execute(input: string, context?: Record<string, any>): Promise<AgentResult>;
}

// Re-export all agents
export { QAAgent } from './qa_agent.js';
export { SecurityAgent } from './security_agent.js';
export { DockerAgent } from './docker_agent.js';
export { CodeReviewAgent } from './code_review_agent.js';
export { DeepResearchAgent } from './deep_research_agent.js';
