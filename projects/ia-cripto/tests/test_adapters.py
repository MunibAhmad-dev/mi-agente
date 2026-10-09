"""Adapter contract tests (spec §96, §144): real providers or honest failure.

The CCXT adapter must fail loudly when ccxt is missing (not fake data), and
initialize correctly when it is present. We monkeypatch a minimal ccxt module
to test the adapter logic without network access - this is test-only fakery,
which the spec explicitly permits (§143).
"""
from __future__ import annotations

import sys
import types

import pytest

from aeos.adapters.exchanges.ccxt_adapter import CCXTMarketAdapter, ExchangeUnavailable
from aeos.core.db import Database


def test_adapter_fails_loudly_without_ccxt(monkeypatch):
    monkeypatch.setitem(sys.modules, "ccxt", None)  # import returns None -> ImportError-ish
    db = Database(":memory:")
    with pytest.raises(ExchangeUnavailable):
        CCXTMarketAdapter(db, "binance")


def _install_fake_ccxt(ticker_price=50_000.0):
    """Install a minimal fake ccxt module for adapter logic tests (test-only)."""
    fake = types.ModuleType("ccxt")

    class FakeExchange:
        def __init__(self, opts):
            self.opts = opts

        def fetch_ticker(self, symbol):
            return {"last": ticker_price, "bid": ticker_price - 1, "ask": ticker_price + 1,
                    "baseVolume": 123.0, "percentage": 1.5, "high": ticker_price + 10,
                    "low": ticker_price - 10}

        def fetch_ohlcv(self, symbol, timeframe="1h", limit=100):
            return [[1700000000000, 1, 2, 0.5, ticker_price, 10.0]]

        def fetch_order_book(self, symbol, limit=20):
            return {"bids": [[ticker_price - 1, 1]], "asks": [[ticker_price + 1, 1]]}

    fake.binance = FakeExchange
    fake.bybit = FakeExchange
    return fake


def test_adapter_happy_path_records_provenance():
    sys.modules["ccxt"] = _install_fake_ccxt()
    try:
        db = Database(":memory:")
        migrate(db)
        adapter = CCXTMarketAdapter(db, "binance")
        t = adapter.ticker("BTC/USDT")
        assert t["last"] == 50_000.0 and t["source"] == "binance"
        row = db.one("SELECT * FROM market_data WHERE symbol='BTC/USDT'")
        assert row is not None and row["price"] == 50_000.0
        candles = adapter.ohlcv("BTC/USDT")
        assert candles and candles[0][4] == 50_000.0
        ob = adapter.order_book("BTC/USDT")
        assert ob["bids"] and ob["asks"]
    finally:
        sys.modules.pop("ccxt", None)


def test_adapter_unknown_exchange():
    sys.modules["ccxt"] = _install_fake_ccxt()
    try:
        db = Database(":memory:")
        with pytest.raises(ExchangeUnavailable):
            CCXTMarketAdapter(db, "not_an_exchange")
    finally:
        sys.modules.pop("ccxt", None)


def migrate(db):  # local import shim to keep table present
    from aeos.core.migrations import migrate as m
    m(db)
