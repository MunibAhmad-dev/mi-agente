"""
📊 Market Data Fetcher Service
=========================
Obtiene datos de mercado desde múltiples exchanges usando CCXT

CCXT: https://github.com/ccxt/ccxt
"""

import ccxt
import pandas as pd
from datetime import datetime, timedelta
from typing import Dict, List, Optional
import logging

logger = logging.getLogger(__name__)


class MarketDataFetcher:
    """Fetcher de datos de mercado para exchanges"""
    
    # Exchanges soportados
    SUPPORTED_EXCHANGES = [
        'binance', 'bybit', 'okx', 'kucoin', 
        'gateio', 'huobi', 'mexc', 'bitget'
    ]
    
    def __init__(self, exchange_id: str = 'binance', config: Optional[Dict] = None):
        """
        Inicializar fetcher
        
        Args:
            exchange_id: ID del exchange (binance, bybit, etc)
            config: Configuración opcional {key, secret, etc}
        """
        self.exchange_id = exchange_id
        self.config = config or {}
        
        # Crear instancia del exchange
        exchange_class = getattr(ccxt, exchange_id)
        
        if config and config.get('key') and config.get('secret'):
            self.exchange = exchange_class({
                'apiKey': config['key'],
                'secret': config['secret'],
                'enableRateLimit': True,
            })
        else:
            # Modo público (sin API keys)
            self.exchange = exchange_class({
                'enableRateLimit': True,
            })
        
        logger.info(f"📊 MarketDataFetcher inicializado: {exchange_id}")
    
    def get_price(self, symbol: str) -> float:
        """
        Obtener precio actual
        
        Args:
            symbol: Par (BTC/USDT)
        
        Returns:
            Precio actual
        """
        try:
            ticker = self.exchange.fetch_ticker(symbol)
            return {
                'last': ticker['last'],
                'bid': ticker['bid'],
                'ask': ticker['ask'],
                'volume': ticker['baseVolume'],
                'change_24h': ticker['percentage'],
                'high': ticker['high'],
                'low': ticker['low'],
                'timestamp': ticker['timestamp']
            }
        except Exception as e:
            logger.error(f"Error obtaining price for {symbol}: {e}")
            return None
    
    def get_ohlcv(self, symbol: str, timeframe: str = '1h', 
                 since: Optional[int] = None, limit: int = 100) -> pd.DataFrame:
        """
        Obtener datos OHLCV (candles)
        
        Args:
            symbol: Par de trading
            timeframe: 1m, 5m, 15m, 1h, 4h, 1d
            since: Timestamp inicial (opcional)
            limit: Número de velas
        
        Returns:
            DataFrame con columns: [timestamp, open, high, low, close, volume]
        """
        try:
            # Calcular 'since' si no se provee
            if since is None:
                since = int((datetime.now() - timedelta(days=30)).timestamp() * 1000)
            
            ohlcv = self.exchange.fetch_ohlcv(
                symbol, 
                timeframe=timeframe,
                since=since,
                limit=limit
            )
            
            # Convertir a DataFrame
            df = pd.DataFrame(ohlcv, columns=[
                'timestamp', 'open', 'high', 'low', 'close', 'volume'
            ])
            
            # Agregar datetime
            df['datetime'] = pd.to_datetime(df['timestamp'], unit='ms')
            
            return df
            
        except Exception as e:
            logger.error(f"Error fetching OHLCV for {symbol}: {e}")
            return pd.DataFrame()
    
    def get_order_book(self, symbol: str, limit: int = 20) -> Dict:
        """
        Obtener order book
        
        Args:
            symbol: Par de trading
            limit: Profundidad
        
        Returns:
            Dict con bids y asks
        """
        try:
            order_book = self.exchange.fetch_order_book(symbol, limit=limit)
            return {
                'bids': order_book['bids'],
                'asks': order_book['asks'],
                'timestamp': order_book['timestamp']
            }
        except Exception as e:
            logger.error(f"Error fetching order book for {symbol}: {e}")
            return {'bids': [], 'asks': []}
    
    def get_top_coins(self, quote: str = 'USDT', limit: int = 20) -> List[Dict]:
        """
        Obtener top coins por volumen
        
        Args:
            quote: Moneda quote (USDT, BTC, ETH)
            limit: Número de resultados
        
        Returns:
            Lista de dicts con symbols y volumen
        """
        try:
            markets = self.exchange.fetch_markets()
            
            # Filtrar por quote
            relevant = [
                m for m in markets 
                if m['quote'] == quote and m['active']
            ]
            
            # Ordenar por volumen
            sorted_markets = sorted(
                relevant, 
                key=lambda x: x.get('info', {}).get('quoteVolume', 0),
                reverse=True
            )
            
            return [
                {
                    'symbol': m['symbol'],
                    'price': m.get('last'),
                    'volume_24h': m.get('info', {}).get('quoteVolume'),
                    'change_24h': m.get('info', {}).get('priceChangePercent'),
                }
                for m in sorted_markets[:limit]
            ]
            
        except Exception as e:
            logger.error(f"Error fetching top coins: {e}")
            return []
    
    def get_balance(self) -> Dict:
        """
        Obtener balance (requiere API keys)
        
        Returns:
            Dict con balances
        """
        try:
            if not self.config.get('key'):
                logger.warning("No API key configured")
                return {}
            
            balance = self.exchange.fetch_balance()
            return balance.get('total', {})
            
        except Exception as e:
            logger.error(f"Error fetching balance: {e}")
            return {}
    
    def get_funding_rate(self, symbol: str) -> Optional[float]:
        """
        Obtener funding rate (perpetuals)
        
        Args:
            symbol: Par (BTC/USDT:USDT)
        
        Returns:
            Funding rate o None
        """
        try:
            # Para perpetuals
            if ':' in symbol:
                future = self.exchange.fetch_funding_rate(symbol)
                return future.get('fundingRate')
            
            return None
            
        except Exception as e:
            logger.debug(f"No funding rate for {symbol}: {e}")
            return None


def get_multi_exchange_prices(exchange_ids: List[str], symbol: str) -> Dict:
    """
    Obtener precios de múltiples exchanges
    
    Útil para arbitraje
    
    Args:
        exchange_ids: Lista de exchanges
        symbol: Par común
    
    Returns:
        Dict {exchange: price}
    """
    prices = {}
    
    for ex_id in exchange_ids:
        try:
            fetcher = MarketDataFetcher(exchange_id=ex_id)
            price = fetcher.get_price(symbol)
            
            if price:
                prices[ex_id] = price['last']
                
        except Exception as e:
            logger.warning(f"Error {ex_id}: {e}")
    
    return prices


# Ejemplo de uso
if __name__ == "__main__":
    # Configurar logging
    logging.basicConfig(level=logging.INFO)
    
    # Inicializar fetcher
    fetcher = MarketDataFetcher('binance')
    
    # Obtener precio BTC
    btc_price = fetcher.get_price('BTC/USDT')
    print(f"📈 BTC/USDT: ${btc_price['last']:,.2f}")
    
    # Obtener candles
    df = fetcher.get_ohlcv('BTC/USDT', '1h', limit=24)
    print(f"\n📊 Últimas 24 horas:")
    print(df.tail())
    
    # Top coins
    top = fetcher.get_top_coins('USDT', 5)
    print(f"\n🔥 Top 5 USDT:")
    for coin in top:
        print(f"  {coin['symbol']}: ${coin['price']:,.4f}")