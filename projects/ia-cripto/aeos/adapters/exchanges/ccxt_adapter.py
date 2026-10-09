"""CCXT exchange adapter (spec §47-48, §96 IExchange).

Real market data via CCXT. The adapter records provenance (source, timestamp,
symbol, price, volume) for every fetch (§75). Import of ccxt is lazy so the
core runs without it; production trading paths require the real library
(never a fake).
"""
from __future__ import annotations

from datetime import datetime, timezone

from aeos.core.db import Database


class ExchangeUnavailable(Exception):
    pass


class CCXTMarketAdapter:
    """Public market data through CCXT. Trading methods live in
    aeos.investments (paper engine + live gate); this adapter only reads."""

    def __init__(self, db: Database, exchange_id: str = "binance", config: dict | None = None):
        try:
            import ccxt  # type: ignore
        except ImportError as exc:
            raise ExchangeUnavailable(
                "ccxt is not installed; install the 'trading' extra for real market data"
            ) from exc
        self.db = db
        klass = getattr(ccxt, exchange_id, None)
        if klass is None:
            raise ExchangeUnavailable(f"unknown exchange {exchange_id!r}")
        opts = {"enableRateLimit": True}
        if config and config.get("key"):
            opts.update({"apiKey": config["key"], "secret": config.get("secret", "")})
        self.exchange = klass(opts)
        self.exchange_id = exchange_id

    def _record(self, symbol: str, price: float, volume: float | None, meta: dict) -> None:
        self.db.execute(
            "INSERT INTO market_data (source, symbol, ts, price, volume, meta_json) VALUES (?, ?, ?, ?, ?, ?)",
            (
                self.exchange_id, symbol,
                datetime.now(timezone.utc).isoformat(timespec="seconds"),
                price, volume, str(meta),
            ),
        )

    def ticker(self, symbol: str) -> dict:
        t = self.exchange.fetch_ticker(symbol)
        price = t.get("last") or t.get("close")
        if price is None:
            raise ExchangeUnavailable(f"no price returned for {symbol}")
        self._record(symbol, float(price), t.get("baseVolume"),
                     {"bid": t.get("bid"), "ask": t.get("ask"), "high": t.get("high"),
                      "low": t.get("low")})
        return {
            "symbol": symbol, "last": float(price), "bid": t.get("bid"),
            "ask": t.get("ask"), "volume": t.get("baseVolume"),
            "change_24h": t.get("percentage"),
            "ts": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "source": self.exchange_id,
        }

    def ohlcv(self, symbol: str, timeframe: str = "1h", limit: int = 100) -> list[list]:
        rows = self.exchange.fetch_ohlcv(symbol, timeframe=timeframe, limit=limit)
        out = [[int(r[0]), float(r[1]), float(r[2]), float(r[3]), float(r[4]), float(r[5])] for r in rows]
        if out:
            self._record(symbol, out[-1][4], out[-1][5], {"ohlcv": timeframe, "count": len(out)})
        return out

    def order_book(self, symbol: str, limit: int = 20) -> dict:
        ob = self.exchange.fetch_order_book(symbol, limit=limit)
        return {"bids": ob.get("bids", []), "asks": ob.get("asks", []),
                "source": self.exchange_id, "symbol": symbol}
