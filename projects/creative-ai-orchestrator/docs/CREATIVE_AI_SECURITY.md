# Creative AI Orchestrator — Security

## Security Model

CAIO operates on the principle of **least privilege**:

### Autonomy Levels

| Level | Description |
|-------|-------------|
| **Manual** | Agent proposes only. User executes everything. |
| **Assisted** | Agent executes safe operations. Asks for privileged ones. |
| **Automatic** | Agent executes previously authorized operations. |
| **Autonomous** | Agent experiments within defined limits. |

### Permission Classes

| Class | Permissions |
|-------|-------------|
| **Read** | Inspect hardware, models, workflows, logs, outputs |
| **Safe Write** | Create projects, modify/save workflows, generate outputs |
| **Privileged** | Install runtime, install node/model, execute external scripts, modify system, delete files |

### Sandbox

All external projects pass through:
1. **Static analysis** — dangerous pattern detection
2. **Dependency analysis** — known vulnerability scanning
3. **License analysis** — copyleft/commercial compatibility
4. **Permission analysis** — filesystem/network access patterns
5. **Sandbox execution** — restricted when possible

### Dangerous Patterns Detected

- `subprocess.call/run/Popen` — Python process execution
- `os.system` — Shell command execution
- `exec/eval` — Dynamic code execution
- `pickle.load` — Deserialization (code execution risk)
- `torch.load` — PyTorch model loading (uses pickle)
- Recursive directory deletion
- Dynamic imports
- Network requests from scripts

### Network Policies

| Policy | Description |
|--------|-------------|
| **Offline** | No network access. Local only. |
| **Restricted** | Only known APIs. |
| **Normal** | Standard network access. |
| **Full** | Unrestricted network. |

### External Resources

Every discovered resource is evaluated for:
- Repository reputation
- Dependency safety
- Code risk
- Network behavior
- License clarity

## License Boundaries

- **Core platform:** MIT
- **ComfyUI:** GPL-3.0 — used as separate process via HTTP API
- **No GPL code** is included in the core codebase
- License engine tracks every dependency

## Privacy

- User files remain local by default
- No data sent to external services without explicit consent
- Telemetry disabled by default
