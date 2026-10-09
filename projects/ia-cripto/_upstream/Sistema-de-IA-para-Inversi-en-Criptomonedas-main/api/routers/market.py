"""
📊 Market Data Router
====================
Endpoints para datos de mercado
"""

from fastapi import APIRouter, Query, HTTPException
from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel
import sys
sys.path.append('..')

router = APIRouter()


# Response models
class TickerResponse(BaseModel):
    symbol: str
    last: float
    bid: float
    ask: float
    high: float
    low: float
    volume: float
    change_24h: float
    timestamp: datetime


class OHLCVResponse(BaseModel):
    timestamp: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float


class OrderBookResponse(BaseModel):
    bids: List[List[float]]
    asks: List[List[float]]
    timestamp: datetime


# Import market data service
try:
    from services.market_data import MarketDataFetcher
    _market_fetcher = MarketDataFetcher('binance')
except Exception as e:
    _market_fetcher = None
    print(f"Warning: Market data service not initialized: {e}")


@router.get("/ticker/{symbol}", response_model=TickerResponse)
async def get_ticker(symbol: str):
    """Obtener precio actual de un símbolo"""
    if not _market_fetcher:
        raise HTTPException(status_code=503, detail="Market service not available")
    
    ticker = _market_fetcher.get_price(symbol)
    if not ticker:
        raise HTTPException(status_code=404, detail=f"Symbol {symbol} not found")
    
    return TickerResponse(
        symbol=symbol,
        last=ticker['last'],
        bid=ticker.get('bid', 0),
        ask=ticker.get('ask', 0),
        high=ticker.get('high', 0),
        low=ticker.get('low', 0),
        volume=ticker.get('volume', 0),
        change_24h=ticker.get('change_24h', 0),
        timestamp=datetime.fromtimestamp(ticker['timestamp']/1000)
    )


@router.get("/ohlcv/{symbol}", response_model=List[OHLCVResponse])
async def get_ohlcv(
    symbol: str,
    timeframe: str = Query("1h", regex="^(1m|5m|15m|1h|4h|1d)$"),
    limit: int = Query(100, le=1000)
):
    """Obtener datos OHLCV (velas)"""
    if not _market_fetcher:
        raise HTTPException(status_code=503, detail="Market service not available")
    
    df = _market_fetcher.get_ohlcv(symbol, timeframe, limit=limit)
    if df.empty:
        raise HTTPException(status_code=404, detail=f"No data for {symbol}")
    
    return [
        OHLCVResponse(
            timestamp=row['datetime'],
            open=row['open'],
            high=row['high'],
            low=row['low'],
            close=row['close'],
            volume=row['volume']
        )
        for _, row in df.iterrows()
    ]


@router.get("/orderbook/{symbol}", response_model=OrderBookResponse)
async def get_orderbook(symbol: str, limit: int = Query(20, le=100)):
    """Obtener order book"""
    if not _market_fetcher:
        raise HTTPException(status_code=503, detail="Market service not available")
    
    orderbook = _market_fetcher.get_order_book(symbol, limit)
    
    return OrderBookResponse(
        bids=orderbook['bids'],
        asks=orderbook['asks'],
        timestamp=datetime.fromtimestamp(orderbook['timestamp']/1000) if orderbook.get('timestamp') else datetime.now()
    )


@router.get("/top/{quote}")
async def get_top_coins(quote: str = "USDT", limit: int = Query(20, le=100)):
    """Obtener top monedas por volumen"""
    if not _market_fetcher:
        raise HTTPException(status_code=503, detail="Market service not available")
    
    top = _market_fetcher.get_top_coins(quote, limit)
    return {"quote": quote, "coins": top}


@router.get("/exchanges")
async def list_exchanges():
    """Listar exchanges soportados"""
    return {
        "exchanges": MarketDataFetcher.SUPPORTED_EXCHANGES if _market_fetcher else [],
        "default": "binance"
    }
