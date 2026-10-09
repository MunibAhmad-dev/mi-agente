# Harness Security Model

## Security Layers

### 1. ToolSecurity (per-tool execution)

Every tool call passes through ToolSecurity before execution:

- **Path validation**: Restricts file access to allowed directories
- **Command blocking**: Blocks dangerous commands (rm -rf /, sudo, format, etc.)
- **Sensitive file protection**: Blocks .env, SSH keys, certificates
- **Permission checking**: Tools must have proper permissions
- **Audit logging**: All tool invocations are logged

Blocked patterns:
- `rm -rf /` — Recursive delete from root (critical)
- `sudo` — Privilege escalation (high)
- `.env` files — Environment secrets (blocked)
- SSH keys (`id_rsa`, `id_ed25519`) — Blocked
- Path traversal (`../`) — Blocked

### 2. SecurityHardening (input-level)

- **Prompt injection detection**: 10 patterns including:
  - `ignore previous instructions`
  - `you are now a...` (role hijack)
  - `[INST]` tokens (token injection)
  - `jailbreak` / `DAN mode`
  - `reveal your system prompt`
- **Input sanitization**: Removes null bytes, control characters
- **Secret redaction**: Prevents API keys from leaking in logs/responses
- **API key management**: Rotation, format validation, expiry tracking
- **Rate limiting**: Per-key rate limits with configurable thresholds

### 3. ProviderOrchestrator (network-level)

- **Circuit breaker**: 5 consecutive failures → circuit open → auto-retry after 30s
- **Provider fallback**: Automatic failover to alternative providers
- **Auth validation**: API key format validation per provider

### 4. AuditReport (verification-level)

4-section forensic audit:
1. **Component Completeness**: All 27 expected files exist
2. **Integration Verification**: All components properly exported/imported
3. **Code Quality**: No TODOs, stubs, placeholders in production code
4. **Security Scan**: No hardcoded secrets, no eval/exec on user input

## API Key Security

### Storage
- Keys stored in memory only (never written to disk by default)
- Keys never logged or included in error messages
- Keys never sent in API responses

### Rotation
```javascript
harness.security.rotateApiKey('openai', 'sk-new-key');
```

### Validation
```javascript
// Keys are validated against provider-specific patterns
// OpenAI: sk-[A-Za-z0-9_-]{20,}
// xAI: xai-[A-Za-z0-9_-]{20,}
// GitHub: ghp_[A-Za-z0-9]{36}
```

## Injection Detection Patterns

| Pattern | Name | Severity |
|---------|------|----------|
| `ignore (all) previous instructions` | ignore_instructions | critical |
| `you are now (a/an)...` | role_hijack | high |
| `system:` | system_injection | high |
| `[INST]`, `<\|im_start\|>` | token_injection | critical |
| `pretend (you are/to be)` | pretend_injection | medium |
| `disregard (all) previous safety` | disregard_injection | critical |
| `jailbreak`, `DAN mode` | jailbreak | critical |
| `reveal (your/the) system prompt` | prompt_extraction | high |

## Dangerous Command Patterns

| Pattern | Reason | Severity |
|---------|--------|----------|
| `rm -rf /` | Recursive delete from root | critical |
| `format` | Disk format | critical |
| `sudo` | Privilege escalation | high |
| `chmod 777` | Overly permissive | medium |
| `curl \| bash` | Pipe remote to shell | critical |
| `shutdown` / `reboot` | System shutdown | critical |

## Security Checklist

- [x] No hardcoded secrets in source code
- [x] API keys validated on input
- [x] Path traversal prevention
- [x] Command injection prevention
- [x] Prompt injection detection
- [x] Secret redaction in logs
- [x] Rate limiting enabled
- [x] Audit trail for all operations
- [x] Tool permission enforcement
- [x] Circuit breaker for providers
- [x] File size limits
- [x] Input length limits
- [x] Timeout enforcement
- [x] Error message sanitization
