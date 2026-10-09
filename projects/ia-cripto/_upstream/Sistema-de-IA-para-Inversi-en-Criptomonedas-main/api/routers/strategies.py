"""
📈 Strategies Router
================
Endpoints para gestión de estrategias
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

router = APIRouter()


class Strategy(BaseModel):
    id: str
    name: str
    description: str
    status: str  # active, paused, training
    parameters: dict
    performance: Optional[dict] = None


class StrategyCreate(BaseModel):
    name: str
    description: str
    strategy_type: str  # trend, mean_reversion, breakout, ml
    parameters: dict


@router.get("/", response_model=List[Strategy])
async def list_strategies(status: Optional[str] = None):
    """Listar todas las estrategias"""
    strategies = [
        Strategy(
            id="strat_001",
            name="RSI Trend",
            description="Estrategia basada en RSI y tendencias",
            status="active",
            parameters={"rsi_period": 14, "rsi_oversold": 30},
            performance={"win_rate": 0.65, "profit_factor": 1.8}
        ),
        Strategy(
            id="strat_002",
            name="MACD Breakout",
            description="Estrategia de ruptura con MACD",
            status="paused",
            parameters={"macd_fast": 12, "macd_slow": 26},
            performance={"win_rate": 0.58, "profit_factor": 1.5}
        )
    ]
    
    if status:
        strategies = [s for s in strategies if s.status == status]
    
    return strategies


@router.get("/{strategy_id}", response_model=Strategy)
async def get_strategy(strategy_id: str):
    """Obtener detalles de una estrategia"""
    return Strategy(
        id=strategy_id,
        name="RSI Trend",
        description="Estrategia basada en RSI",
        status="active",
        parameters={"rsi_period": 14},
        performance={"win_rate": 0.65}
    )


@router.post("/")
async def create_strategy(strategy: StrategyCreate):
    """Crear nueva estrategia"""
    return {
        "id": f"strat_{datetime.now().timestamp()}",
        "name": strategy.name,
        "status": "paused",
        "message": "Strategy created"
    }


@router.put("/{strategy_id}/start")
async def start_strategy(strategy_id: str):
    """Iniciar estrategia"""
    return {"success": True, "status": "active"}


@router.put("/{strategy_id}/stop")
async def stop_strategy(strategy_id: str):
    """Detener estrategia"""
    return {"success": True, "status": "paused"}


@router.delete("/{strategy_id}")
async def delete_strategy(strategy_id: str):
    """Eliminar estrategia"""
    return {"success": True, "message": "Strategy deleted"}
