# Feast Feature Store Configuration
# ============================
# Feature store para ML del sistema de trading

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Dict, Optional, List

import pandas as pd
from feast import Entity, Feature, FeatureView, FileSource, StreamingFeatureView
from feast.field import Field
from feast.types import Float32, Float64, Int64, String, UnixTimestamp


# Entities
@dataclass
class Symbol:
    """Entidad: Símbolo de trading"""
    symbol: str


# Sources (File Sources para demo)
price_source = FileSource(
    name="price_source",
    path="s3://crypto-ai-data/prices/",
    timestamp_field="timestamp",
    created_timestamp_column="created_at",
)

# Feature Views
def get_price_features() -> FeatureView:
    """Features de precio"""
    return FeatureView(
        name="price_features",
        entities=[Symbol],
        ttl=timedelta(hours=1),
        online=True,
        batch_source=price_source,
        fields=[
            Field(name="open", dtype=Float32),
            Field(name="high", dtype=Float32),
            Field(name="low", dtype=Float32),
            Field(name="close", dtype=Float32),
            Field(name="volume", dtype=Float64),
        ],
    )


def get_technical_indicators() -> FeatureView:
    """Indicadores técnicos"""
    return FeatureView(
        name="technical_indicators",
        entities=[Symbol],
        ttl=timedelta(hours=1),
        online=True,
        batch_source=price_source,
        fields=[
            Field(name="rsi", dtype=Float32),
            Field(name="macd", dtype=Float32),
            Field(name="macd_signal", dtype=Float32),
            Field(name="sma_20", dtype=Float32),
            Field(name="sma_50", dtype=Float32),
            Field(name="sma_200", dtype=Float32),
            Field(name="bb_upper", dtype=Float32),
            Field(name="bb_lower", dtype=Float32),
            Field(name="atr", dtype=Float32),
        ],
    )


def get_sentiment_features() -> FeatureView:
    """Features de sentimiento"""
    return FeatureView(
        name="sentiment_features",
        entities=[Symbol],
        ttl=timedelta(hours=1),
        online=True,
        batch_source=price_source,
        fields=[
            Field(name="sentiment_score", dtype=Float32),
            Field(name="news_count", dtype=Int64),
            Field(name="social_volume", dtype=Int64),
            Field(name="fear_greed_index", dtype=Int64),
        ],
    )


def get_market_features():
    """Todas las features de mercado"""
    return FeatureView(
        name="market_features",
        entities=[Symbol],
        ttl=timedelta(hours=1),
        online=True,
        batch_source=price_source,
        fields=[
            Field(name="price_change_1h", dtype=Float32),
            Field(name="price_change_24h", dtype=Float32),
            Field(name="volume_ratio", dtype=Float32),
            Field(name="market_cap", dtype=Float64),
            Field(name="circulating_supply", dtype=Float64),
        ],
    )


# Streaming Feature View (para datos en tiempo real)
def get_realtime_ticker() -> StreamingFeatureView:
    """Features de ticker en tiempo real"""
    return StreamingFeatureView(
        name="realtime_ticker",
        entities=[Symbol],
        ttl=timedelta(minutes=5),
        online=True,
        stream=price_source,
        fields=[
            Field(name="last_price", dtype=Float32),
            Field(name="bid", dtype=Float32),
            Field(name="ask", dtype=Float32),
            Field(name="spread", dtype=Float32),
        ],
    )


def get_feature_repo():
    """Retornar feature repo"""
    from feast import FeatureRepo
    
    repo = FeatureRepo(
        name="crypto_ai_features",
        project="crypto-ai",
    )
    
    repo.register_source(price_source)
    repo.register_entity(Symbol)
    repo.register_feature_view(get_price_features())
    repo.register_feature_view(get_technical_indicators())
    repo.register_feature_view(get_sentiment_features())
    repo.register_feature_view(get_market_features())
    repo.register_feature_view(get_realtime_ticker())
    
    return repo