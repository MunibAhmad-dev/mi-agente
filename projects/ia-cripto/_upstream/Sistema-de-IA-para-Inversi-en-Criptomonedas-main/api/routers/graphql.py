"""
🚀 GraphQL Router
================
API GraphQL con Strawberry
"""

from typing import List, Optional
import strawberry
from strawberry import relay
from datetime import datetime


# Types para GraphQL
@strawberry.type
class Ticker:
    symbol: str
    price: float
    volume: float
    change_24h: float
    high_24h: float
    low_24h: float
    timestamp: datetime


@strawberry.type
class Trade:
    id: str
    symbol: str
    side: str
    amount: float
    price: float
    pnl: float
    status: str
    created_at: datetime


@strawberry.type
class Strategy:
    id: str
    name: str
    type: str
    symbol: str
    status: str
    win_rate: float
    created_at: datetime


@strawberry.type
class Portfolio:
    total_balance: float
    available_balance: float
    positions: List[Position]


@strawberry.type
class Position:
    symbol: str
    amount: float
    entry_price: float
    current_price: float
    pnl: float
    pnl_percent: float


@strawberry.type
class Performance:
    total_trades: int
    win_rate: float
    profit_factor: float
    max_drawdown: float
    sharpe_ratio: float
    daily_pnl: float


@strawberry.type
class MarketStats:
    symbols: List[str]
    tickers: List[Ticker]
    total_volume: float


# Queries
@strawberry.type
class Query:
    @strawberry.field
    async def ticker(self, symbol: str) -> Optional[Ticker]:
        # Implementar con CCXT
        return Ticker(
            symbol=symbol,
            price=50000.0,
            volume=1000000.0,
            change_24h=2.5,
            high_24h=51000.0,
            low_24h=49000.0,
            timestamp=datetime.now()
        )
    
    @strawberry.field
    async def tickers(self, limit: int = 10) -> List[Ticker]:
        # Mock data
        symbols = ["BTC/USDT", "ETH/USDT", "BNB/USDT", "SOL/USDT"]
        return [
            Ticker(
                symbol=s,
                price=50000.0,
                volume=1000000.0,
                change_24h=2.5,
                high_24h=51000.0,
                low_24h=49000.0,
                timestamp=datetime.now()
            )
            for s in symbols[:limit]
        ]
    
    @strawberry.field
    async def trade(self, id: str) -> Optional[Trade]:
        return Trade(
            id=id,
            symbol="BTC/USDT",
            side="buy",
            amount=0.01,
            price=50000.0,
            pnl=50.0,
            status="closed",
            created_at=datetime.now()
        )
    
    @strawberry.field
    async def trades(self, limit: int = 20) -> List[Trade]:
        return [
            Trade(
                id=f"trade_{i}",
                symbol="BTC/USDT",
                side="buy",
                amount=0.01,
                price=50000.0,
                pnl=50.0,
                status="closed",
                created_at=datetime.now()
            )
            for i in range(min(limit, 10))
        ]
    
    @strawberry.field
    async def strategy(self, id: str) -> Optional[Strategy]:
        return Strategy(
            id=id,
            name="MA Crossover",
            type="crossover",
            symbol="BTC/USDT",
            status="active",
            win_rate=0.68,
            created_at=datetime.now()
        )
    
    @strawberry.field
    async def strategies(self) -> List[Strategy]:
        return [
            Strategy(
                id="strat_1",
                name="MA Crossover",
                type="crossover",
                symbol="BTC/USDT",
                status="active",
                win_rate=0.68,
                created_at=datetime.now()
            )
        ]
    
    @strawberry.field
    async def portfolio(self) -> Portfolio:
        return Portfolio(
            total_balance=11293.0,
            available_balance=8000.0,
            positions=[
                Position(
                    symbol="BTC/USDT",
                    amount=0.05,
                    entry_price=49000.0,
                    current_price=50000.0,
                    pnl=50.0,
                    pnl_percent=2.04
                )
            ]
        )
    
    @strawberry.field
    async def performance(self) -> Performance:
        return Performance(
            total_trades=150,
            win_rate=0.65,
            profit_factor=1.8,
            max_drawdown=0.12,
            sharpe_ratio=1.5,
            daily_pnl=234.5
        )
    
    @strawberry.field
    async def market_stats(self, quote: str = "USDT") -> MarketStats:
        return MarketStats(
            symbols=["BTC/USDT", "ETH/USDT", "BNB/USDT"],
            tickers=[],
            total_volume=5000000.0
        )


# Mutations
@strawberry.type
class Mutation:
    @strawberry.mutation
    async def execute_trade(
        self,
        symbol: str,
        side: str,
        amount: float,
        price: Optional[float] = None
    ) -> Trade:
        return Trade(
            id="new_trade",
            symbol=symbol,
            side=side,
            amount=amount,
            price=price or 50000.0,
            pnl=0.0,
            status="pending",
            created_at=datetime.now()
        )
    
    @strawberry.mutation
    async def cancel_trade(self, id: str) -> bool:
        return True
    
    @strawberry.mutation
    async def start_strategy(self, id: str) -> Strategy:
        return Strategy(
            id=id,
            name="MA Crossover",
            type="crossover",
            symbol="BTC/USDT",
            status="active",
            win_rate=0.68,
            created_at=datetime.now()
        )
    
    @strawberry.mutation
    async def stop_strategy(self, id: str) -> Strategy:
        return Strategy(
            id=id,
            name="MA Crossover",
            type="crossover",
            symbol="BTC/USDT",
            status="inactive",
            win_rate=0.68,
            created_at=datetime.now()
        )


# Schema
schema = strawberry.Schema(query=Query, mutation=Mutation)