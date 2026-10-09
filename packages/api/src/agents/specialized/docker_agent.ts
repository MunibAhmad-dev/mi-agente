/**
 * Docker Agent
 * ============
 * Agente especializado en Docker y Kubernetes
 */

import { BaseAgent, AgentResult } from './types.js';

export class DockerAgent implements BaseAgent {
  name = 'Docker Agent';
  description = 'Especializado en Docker, Kubernetes y contenedores';
  type = 'docker' as const;

  async execute(input: string, context?: Record<string, any>): Promise<AgentResult> {
    try {
      const task = this.parseTask(input);
      
      const templates: Record<string, string> = {
        dockerfile: this.getDockerfileTemplate(context),
        compose: this.getComposeTemplate(context),
        k8s: this.getK8sTemplate(context),
        optimize: this.getOptimizationTips(),
      };

      const output = templates[task];
      
      if (!output) {
        return {
          success: false,
          output: '',
          error: `Tarea no soportada: ${task}`
        };
      }

      return {
        success: true,
        output,
        metadata: {
          task,
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

  private parseTask(input: string): string {
    const lower = input.toLowerCase();
    if (lower.includes('dockerfile')) return 'dockerfile';
    if (lower.includes('compose') || lower.includes('docker-compose')) return 'compose';
    if (lower.includes('k8s') || lower.includes('kubernetes')) return 'k8s';
    if (lower.includes('optim')) return 'optimize';
    return 'dockerfile';
  }

  private getDockerfileTemplate(context?: Record<string, any>): string {
    const baseImage = context?.baseImage || 'node:18-alpine';
    const port = context?.port || 3000;
    const buildCmd = context?.buildCmd || 'npm run build';
    const startCmd = context?.startCmd || 'npm start';

    return `# Dockerfile
FROM ${baseImage} AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source
COPY . .

# Build
RUN ${buildCmd}

# Production image
FROM ${baseImage} AS runner

WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 appuser

# Copy from builder
COPY --from=builder --chown=appuser:nodejs /app/dist ./dist
COPY --from=builder --chown=appuser:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:nodejs /app/package*.json ./

USER appuser

EXPOSE ${port}

CMD ["${startCmd}"]
`;
  }

  private getComposeTemplate(context?: Record<string, any>): string {
    return `# docker-compose.yml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "${context?.port || 3000}:${context?.port || 3000}"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=\${DATABASE_URL}
    depends_on:
      - db
      - redis
    restart: unless-stopped

  db:
    image: ${context?.dbImage || 'postgres:15-alpine'}
    environment:
      POSTGRES_DB: \${DB_NAME}
      POSTGRES_USER: \${DB_USER}
      POSTGRES_PASSWORD: \${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:
`;
  }

  private getK8sTemplate(context?: Record<string, any>): string {
    return `# Kubernetes Deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${context?.appName || 'my-app'}
  labels:
    app: ${context?.appName || 'my-app'}
spec:
  replicas: 3
  selector:
    matchLabels:
      app: ${context?.appName || 'my-app'}
  template:
    metadata:
      labels:
        app: ${context?.appName || 'my-app'}
    spec:
      containers:
        - name: app
          image: ${context?.image || 'my-app:latest'}
          ports:
            - containerPort: ${context?.port || 3000}
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: app-secrets
                  key: database-url
          resources:
            requests:
              memory: "256Mi"
              cpu: "250m"
            limits:
              memory: "512Mi"
              cpu: "500m"
---
apiVersion: v1
kind: Service
metadata:
  name: ${context?.appName || 'my-app'}-service
spec:
  selector:
    app: ${context?.appName || 'my-app'}
  ports:
    - port: 80
      targetPort: ${context?.port || 3000}
  type: LoadBalancer
`;
  }

  private getOptimizationTips(): string {
    return `## Docker Optimization Tips

### Build Speed
- Use multi-stage builds
- Order COPY statements by change frequency
- Use .dockerignore
- Use BuildKit (DOCKER_BUILDKIT=1)

### Image Size
- Use alpine base images
- Remove unnecessary dependencies
- Don't install dev tools
- Use specific version tags

### Security
- Don't run as root
- Use read-only root filesystem
- Scan images with Trivy
- Keep images updated

### Best Practices
1. Use specific base image tags
2. Minimize layers
3. Use HEALTHCHECK
4. Set proper resource limits
`;
  }
}
