"""
📊 Performance Router
=================
Endpoints para métricas de rendimiento
"""

from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timedelta

router = APIRouter()


class PerformanceMetrics(BaseModel):
    total_trades: int
    winning_trades: int
    losing_trades: int
    win_rate: float
    total_profit: float
    total_loss: float
    net_profit: float
    profit_factor: float
    max_drawdown: float
    sharpe_ratio: float
    avg_trade_duration: float
    avg_profit: float
    avg_loss: float


class DailyPerformance(BaseModel):
    date: str
    trades: int
    profit: float
    win_rate: float


@router.get("/metrics", response_model=PerformanceMetrics)
async def get_performance_metrics(days: int = 30):
    """Obtener métricas de rendimiento"""
    return PerformanceMetrics(
        total_trades=150,
        winning_trades=98,
        losing_trades=52,
        win_rate=0.653,
        total_profit=5000.0,
        total_loss=2100.0,
        net_profit=2900.0,
        profit_factor=2.38,
        max_drawdown=0.12,
        sharpe_ratio=1.85,
        avg_trade_duration=4.5,
        avg_profit=51.0,
        avg_loss=40.38
    )


@router.get("/daily", response_model=List[DailyPerformance])
async def get_daily_performance(days: int = 30):
    """Obtener rendimiento diario"""
    base_date = datetime.now()
    
    return [
        DailyPerformance(
            date=(base_date - timedelta(days=i)).strftime("%Y-%m-%d"),
            trades=5 + i % 3,
            profit=100.0 + i * 10,
            win_rate=0.6 + (i % 3) * 0.1
        )
        for i in range(days)
    ]


@router.get("/drawdown")
async def get_drawdown_history(days: int = 30):
    """Obtener historial de drawdown"""
    return {
        "drawdown": [
            {"date": "2025-01-01", "drawdown": 0.0},
            {"date": "2025-01-02", "drawdown": 0.02},
            {"date": "2025-01-03", "drawdown": 0.05},
        ],
        "max_drawdown": 0.12,
        "current_drawdown": 0.03
    }


@router.get("/trades")
async def get_trade_analysis(
    symbol: Optional[str] = None,
    strategy: Optional[str] = None,
    days: int = 30
):
    """Análisis de trades"""
    return {
        "by_symbol": [
            {"symbol": "BTC/USDT", "trades": 50, "win_rate": 0.68, "profit": 1500.0},
            {"symbol": "ETH/USDT", "trades": 40, "win_rate": 0.62, "profit": 800.0},
            {"symbol": "BNB/USDT", "trades": 30, "win_rate": 0.58, "profit": 600.0},
        ],
        "by_strategy": [
            {"strategy": "RSI Trend", "trades": 80, "win_rate": 0.65},
            {"strategy": "MACD Breakout", "trades": 70, "win_rate": 0.60},
        ]
    }