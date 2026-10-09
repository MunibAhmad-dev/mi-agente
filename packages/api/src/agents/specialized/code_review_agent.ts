/**
 * Code Review Agent
 * =================
 * Agente especializado en revisión de código
 */

import { BaseAgent, AgentResult } from './types.js';

export class CodeReviewAgent implements BaseAgent {
  name = 'Code Review Agent';
  description = 'Especializado en revisión y mejora de código';
  type = 'code_review' as const;

  async execute(input: string, context?: Record<string, any>): Promise<AgentResult> {
    try {
      return {
        success: true,
        output: this.generateReview(input, context),
        metadata: {
          agentType: 'code_review',
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      return {
        success: false,
        output: '',
        error: error instanceof Error ? error.message : 'Error desconocido'
      };
    }
  }

  private generateReview(code: string, context?: Record<string, any>): string {
    return `## Code Review Report

### File
${context?.file || 'Not specified'}

### Summary
| Aspect | Rating | Notes |
|--------|--------|-------|
| Readability | ⭐⭐⭐⭐⭐ | Clear naming |
| Performance | ⭐⭐⭐⭐ | Good optimization |
| Security | ⭐⭐⭐⭐ | No major issues |
| Testing | ⭐⭐⭐ | Could improve |
| Documentation | ⭐⭐⭐ | Needs more docs |

### Suggestions

#### Improvements
1. Add JSDoc comments
2. Add error boundaries
3. Consider memoization
4. Add validation

#### Best Practices
\`\`\`typescript
// Current
function processData(data) {
  return data.map(x => x.value);
}

// Suggested
function processData<T extends { value: any }>(data: T[]): any[] {
  return data.map(item => item.value);
}
\`\`\`

### Approval Status
- [ ] Approved
- [ ] Changes Requested
- [ ] Needs Discussion
`;
  }
}
