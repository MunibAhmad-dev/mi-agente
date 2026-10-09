# Agentes IA - Configuración n8n

## Flujo de Trabajo de Agentes

```
┌─────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   ANALYST   │───▶│  RISK MANAGER   │───▶│   STRATEGIST   │
│  (Analiza)  │    │    (Valida)     │    │   (Decide)     │
└─────────────┘    └──────────────────┘    └─────────────────┘
       │                                           │
       ▼                                           ▼
┌─────────────┐                           ┌─────────────────┐
│   MEMORY    │                           │    EXECUTOR    │
│  (Qdrant)  │                           │   (CCXT/API)   │
└─────────────┘                           └─────────────────┘
```

## Agentes en CrewAI

### 1. Analyst Agent
```python
from crewai import Agent

analyst = Agent(
    role='Analista de Mercado',
    goal='Analizar condiciones del mercado y detectar oportunidades',
    backstory='''
    Eres un analista cuantitativo especializado en crypto.
    Tienes 10 años de experiencia en análisis técnico y fundamental.
    ''',
    tools=[fetch_market_data, get_technical_indicators]
)
```

### 2. Risk Manager Agent
```python
risk_manager = Agent(
    role='Gestor de Riesgo',
    goal='Validar que las operaciones cumplan con las reglas de riesgo',
    backstory='''
    Eres un gestor de riesgo profesional.
    Trabajas en un fondo cuantitativo y proteges el capital.
    ''',
    tools=[check_risk_limits, validate_position]
)
```

### 3. Strategist Agent
```python
strategist = Agent(
    role='Estratega',
    goal='Decidir la mejor acción basado en análisis y riesgo',
    backstory='''
    Eres el jefe de trading de un fondo.
    Tomas decisiones basadas en datos y riesgo.
    ''',
    tools=[decide_action, calculate_position_size]
)
```

### 4. Executor Agent
```python
executor = Agent(
    role='Ejecutor',
    goal='Ejecutar la operación en el exchange',
    backstory='''
    Eres un trader ejecutivo.
    Ejecutas las órdenes con precisión.
    ''',
    tools=[execute_trade, check_order_status]
)
```

## Workflow n8n

### Nodos Principales

1. **Schedule Trigger** - Cada 60 min
2. **HTTP Request (CCXT)** - Obtener datos mercado
3. **Code (Analyst)** - Análisis técnico
4. **IF (Risk Check)** - Validar riesgo
5. **Code (Strategy)** - Decidir acción
6. **HTTP Request (Execute)** - Ejecutar trade
7. **Qdrant (Memory)** - Guardar decisión
8. **Grafana (Alert)** - Notificar

## Variables de Entorno

```env
# Agentes
OPENAI_API_KEY=sk-...

# Exchanges
BINANCE_API_KEY=
BINANCE_SECRET=

# Qdrant
QDRANT_HOST=localhost
QDRANT_PORT=6333
```

## Métricas de Agentes

| Métrica | Descripción |
|---------|-------------|
| decisions_made | Decisiones tomadas |
| trades_executed | Trades ejecutados |
| win_rate | Tasa de acierto |
| avg_profit | Profit promedio |
| risk_violations | Violaciones de riesgo |

## Decisión de Trade

```json
{
  "decision": "buy",
  "symbol": "BTC/USDT",
  "confidence": 0.85,
  "reason": "RSI oversold + trend bullish",
  "position_size": 0.01,
  "stop_loss": 49000,
  "take_profit": 55000
}
```