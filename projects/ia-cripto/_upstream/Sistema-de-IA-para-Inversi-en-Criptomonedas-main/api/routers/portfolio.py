"""
💼 Portfolio Router
=================
Endpoints para gestión de portafolio
"""

from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

router = APIRouter()


class Position(BaseModel):
    symbol: str
    amount: float
    entry_price: float
    current_price: float
    pnl: float
    pnl_percent: float
    side: str  # long, short


class Balance(BaseModel):
    total: float
    free: float
    used: float
    assets: List[dict]


@router.get("/balance", response_model=Balance)
async def get_balance():
    """Obtener balance total"""
    return Balance(
        total=10000.0,
        free=8000.0,
        used=2000.0,
        assets=[
            {"asset": "USDT", "free": 8000.0, "used": 0.0},
            {"asset": "BTC", "free": 0.01, "used": 0.0},
            {"asset": "ETH", "free": 0.1, "used": 0.0},
        ]
    )


@router.get("/positions", response_model=List[Position])
async def get_positions():
    """Obtener posiciones abiertas"""
    return [
        Position(
            symbol="BTC/USDT",
            amount=0.01,
            entry_price=48000.0,
            current_price=50000.0,
            pnl=20.0,
            pnl_percent=4.17,
            side="long"
        ),
        Position(
            symbol="ETH/USDT",
            amount=0.5,
            entry_price=2800.0,
            current_price=2900.0,
            pnl=50.0,
            pnl_percent=3.57,
            side="long"
        )
    ]


@router.get("/history")
async def get_portfolio_history(days: int = 30):
    """Obtener historial del portafolio"""
    return {
        "history": [
            {"date": "2025-01-01", "value": 10000.0},
            {"date": "2025-01-02", "value": 10150.0},
            {"date": "2025-01-03", "value": 10200.0},
        ],
        "days": days
    }


@router.post("/rebalance")
async def rebalance_portfolio(target_allocation: dict):
    """Rebalancear portafolio"""
    return {
        "success": True,
        "message": "Portfolio rebalanced",
        "timestamp": datetime.now().isoformat()
    }