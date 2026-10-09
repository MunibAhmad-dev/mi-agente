/**
 * QA Agent
 * ========
 * Agente especializado en testing y control de calidad
 */

import { BaseAgent, AgentResult } from './types.js';

/**
 * QA Agent
 * 
 * Especializado en:
 * - Escribir tests unitarios
 * - Escribir tests de integración
 * - Coverage analysis
 * - Bug reporting
 */
export class QAAgent implements BaseAgent {
  name = 'QA Agent';
  description = 'Especializado en testing, quality assurance y control de calidad';
  type = 'qa' as const;

  /**
   * Ejecutar análisis de QA
   */
  async execute(input: string, context?: Record<string, any>): Promise<AgentResult> {
    try {
      const task = this.parseTask(input);
      
      switch (task) {
        case 'write_tests':
          return await this.writeTests(context);
        case 'analyze_coverage':
          return await this.analyzeCoverage(context);
        case 'report_bug':
          return await this.reportBug(context);
        case 'review':
          return await this.reviewCode(context);
        default:
          return {
            success: false,
            output: '',
            error: `Tarea desconocida: ${task}`
          };
      }
    } catch (error) {
      return {
        success: false,
        output: '',
        error: error instanceof Error ? error.message : 'Error desconocido'
      };
    }
  }

  private parseTask(input: string): string {
    const lower = input.toLowerCase();
    if (lower.includes('test') || lower.includes('spec')) return 'write_tests';
    if (lower.includes('coverage') || lower.includes('cover')) return 'analyze_coverage';
    if (lower.includes('bug') || lower.includes('error')) return 'report_bug';
    if (lower.includes('review') || lower.includes('revisar')) return 'review';
    return 'unknown';
  }

  private async writeTests(context?: Record<string, any>): Promise<AgentResult> {
    const file = context?.file || 'specified file';
    const type = context?.testType || 'unit';
    
    const templates = {
      unit: this.getUnitTestTemplate(),
      integration: this.getIntegrationTestTemplate(),
      e2e: this.getE2ETestTemplate()
    };

    return {
      success: true,
      output: templates[type as keyof typeof templates] || templates.unit,
      metadata: {
        file,
        testType: type,
        suggestedLocation: `__tests__/${file}.test.ts`
      }
    };
  }

  private getUnitTestTemplate(): string {
    return `// Unit Test Template
import { describe, it, expect, vi } from 'vitest';
import { ${context?.functionName || 'YourFunction'} } from '../src/${context?.file || 'file'}';

describe('${context?.functionName || 'YourFunction'}', () => {
  it('should handle valid input', () => {
    const result = ${context?.functionName || 'YourFunction'}(validInput);
    expect(result).toBe(expectedOutput);
  });

  it('should handle invalid input', () => {
    expect(() => ${context?.functionName || 'YourFunction'}(invalidInput)).toThrow();
  });

  it('should handle edge cases', () => {
    // TODO: Add edge case tests
  });
});
`;
  }

  private getIntegrationTestTemplate(): string {
    return `// Integration Test Template
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDB, teardownTestDB } from './test-helpers';

describe('API Integration Tests', () => {
  beforeAll(async () => {
    await setupTestDB();
  });

  afterAll(async () => {
    await teardownTestDB();
  });

  it('should connect to database', async () => {
    // TODO: Add database connection test
  });

  it('should handle API requests', async () => {
    // TODO: Add API test
  });
});
`;
  }

  private getE2ETestTemplate(): string {
    return `// E2E Test Template
import { test, expect } from '@playwright/test';

test.describe('User Flow', () => {
  test('should complete happy path', async ({ page }) => {
    await page.goto('/');
    // TODO: Add E2E test steps
  });
});
`;
  }

  private async analyzeCoverage(context?: Record<string, any>): Promise<AgentResult> {
    return {
      success: true,
      output: `## Coverage Analysis Report

### Summary
- Lines: ${context?.linesCovered || '?'}/${context?.totalLines || '?'} (${context?.lineCoverage || '?'}%)
- Functions: ${context?.functionsCovered || '?'}/${context?.totalFunctions || '?'} (${context?.functionCoverage || '?'}%)
- Branches: ${context?.branchesCovered || '?'}/${context?.totalBranches || '?'} (${context?.branchCoverage || '?'}%)

### Files Needing Coverage
${context?.uncoveredFiles?.map((f: string) => `- ${f}`).join('\n') || '- None'}

### Recommendations
1. Add tests for uncovered functions
2. Increase edge case coverage
3. Consider snapshot testing for UI components
`,
      metadata: {
        analysisType: 'coverage',
        timestamp: new Date().toISOString()
      }
    };
  }

  private async reportBug(context?: Record<string, any>): Promise<AgentResult> {
    return {
      success: true,
      output: `## Bug Report

### Title
${context?.title || 'Bug title here'}

### Severity
- [ ] Critical
- [ ] High
- [ ] Medium
- [ ] Low

### Steps to Reproduce
1. 
2. 
3. 

### Expected Behavior


### Actual Behavior


### Environment
- OS: ${context?.os || 'Unknown'}
- Browser: ${context?.browser || 'Unknown'}
- Version: ${context?.version || '1.0.0'}

### Stack Trace
\`\`\`
${context?.stackTrace || 'No stack trace available'}
\`\`\`
`,
      metadata: {
        reportType: 'bug',
        timestamp: new Date().toISOString()
      }
    };
  }

  private async reviewCode(context?: Record<string, any>): Promise<AgentResult> {
    return {
      success: true,
      output: `## Code Review

### File
${context?.file || 'Not specified'}

### Findings

#### Issues
1. 
2. 
3. 

#### Suggestions
1. Consider using const instead of let
2. Add error handling
3. Write documentation

#### Security Concerns
- None identified

#### Performance
- No bottlenecks detected

### Approved
[ ] Yes
[ ] No - Needs changes
`,
      metadata: {
        reviewType: 'code',
        timestamp: new Date().toISOString()
      }
    };
  }
}
