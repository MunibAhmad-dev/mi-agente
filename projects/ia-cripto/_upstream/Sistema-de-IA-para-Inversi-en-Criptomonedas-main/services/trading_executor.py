"""
🤖 Trading Executor Service
==========================
Ejecuta trades usando CCXT directamente
"""

import ccxt
from typing import Dict, Optional
import logging
from datetime import datetime

logger = logging.getLogger(__name__)


class TradingExecutor:
    """Ejecutor de trades"""
    
    def __init__(self, exchange_id: str, config: Dict):
        """
        Inicializar ejecutor
        
        Args:
            exchange_id: ID del exchange
            config: {key, secret}
        """
        self.exchange_id = exchange_id
        self.config = config
        
        exchange_class = getattr(ccxt, exchange_id)
        
        if config.get('key') and config.get('secret'):
            self.exchange = exchange_class({
                'apiKey': config['key'],
                'secret': config['secret'],
                'enableRateLimit': True,
            })
        else:
            raise ValueError("Se requieren API keys")
        
        logger.info(f"🤖 TradingExecutor inicializado: {exchange_id}")
    
    def market_buy(self, symbol: str, amount: float) -> Dict:
        """
        Compra a mercado
        
        Args:
            symbol: Par (BTC/USDT)
            amount: Cantidad a comprar
        
        Returns:
            Dict con resultado
        """
        try:
            order = self.exchange.create_order(
                symbol=symbol,
                type='market',
                side='buy',
                amount=amount
            )
            
            logger.info(f"✅ Buy order: {order['id']}")
            return {
                'success': True,
                'order_id': order['id'],
                'filled': order.get('filled'),
                'price': order.get('average'),
                'timestamp': order['timestamp']
            }
            
        except Exception as e:
            logger.error(f"Error en buy: {e}")
            return {'success': False, 'error': str(e)}
    
    def market_sell(self, symbol: str, amount: float) -> Dict:
        """
        Venta a mercado
        
        Args:
            symbol: Par
            amount: Cantidad a vender
        
        Returns:
            Dict con resultado
        """
        try:
            order = self.exchange.create_order(
                symbol=symbol,
                type='market',
                side='sell',
                amount=amount
            )
            
            logger.info(f"✅ Sell order: {order['id']}")
            return {
                'success': True,
                'order_id': order['id'],
                'filled': order.get('filled'),
                'price': order.get('average'),
                'timestamp': order['timestamp']
            }
            
        except Exception as e:
            logger.error(f"Error en sell: {e}")
            return {'success': False, 'error': str(e)}
    
    def limit_buy(self, symbol: str, amount: float, 
               price: float) -> Dict:
        """
        Compra límite
        
        Args:
            symbol: Par
            amount: Cantidad
            price: Precio límite
        
        Returns:
            Dict con resultado
        """
        try:
            order = self.exchange.create_order(
                symbol=symbol,
                type='limit',
                side='buy',
                amount=amount,
                price=price
            )
            
            return {
                'success': True,
                'order_id': order['id'],
                'price': price,
                'amount': amount
            }
            
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def get_order_status(self, order_id: str, symbol: str) -> Dict:
        """
        Obtener estado de orden
        
        Args:
            order_id: ID de orden
            symbol: Par
        
        Returns:
            Dict con estado
        """
        try:
            order = self.exchange.fetch_order(order_id, symbol)
            return {
                'status': order['status'],
                'filled': order['filled'],
                'remaining': order['remaining'],
                'average': order.get('average'),
            }
        except Exception as e:
            return {'error': str(e)}
    
    def cancel_order(self, order_id: str, symbol: str) -> Dict:
        """
        Cancelar orden
        
        Args:
            order_id: ID
            symbol: Par
        
        Returns:
            Dict con resultado
        """
        try:
            self.exchange.cancel_order(order_id, symbol)
            return {'success': True}
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def get_balance(self) -> Dict:
        """
        Obtener balance completo
        
        Returns:
            Dict con balances
        """
        try:
            balance = self.exchange.fetch_balance()
            return {
                'free': balance['free'],
                'used': balance['used'],
                'total': balance['total']
            }
        except Exception as e:
            return {'error': str(e)}
    
    def get_open_orders(self, symbol: Optional[str] = None) -> list:
        """
        Obtener órdenes abiertas
        
        Args:
            symbol: Filtrar por símbolo (opcional)
        
        Returns:
            Lista de órdenes
        """
        try:
            orders = self.exchange.fetch_open_orders(symbol)
            return [
                {
                    'id': o['id'],
                    'symbol': o['symbol'],
                    'side': o['side'],
                    'type': o['type'],
                    'amount': o['amount'],
                    'price': o.get('price'),
                    'remaining': o['remaining']
                }
                for o in orders
            ]
        except Exception as e:
            logger.error(f"Error fetching orders: {e}")
            return []


def execute_trade(action: str, symbol: str, amount: float, 
            exchange_config: Dict) -> Dict:
    """
    Función de conveniencia para ejecutar trades
    
    Args:
        action: 'buy' o 'sell'
        symbol: Par
        amount: Cantidad
        exchange_config: Config {exchange, key, secret}
    
    Returns:
        Dict con resultado
    """
    executor = TradingExecutor(
        exchange_config['exchange'],
        exchange_config
    )
    
    if action.lower() == 'buy':
        return executor.market_buy(symbol, amount)
    elif action.lower() == 'sell':
        return executor.market_sell(symbol, amount)
    else:
        return {'success': False, 'error': 'Invalid action'}


if __name__ == "__main__":
    # Ejemplo (requiere API keys reales)
    logging.basicConfig(level=logging.INFO)
    
    # NO EJECUTAR sin API keys reales
    print("🤖 TradingExecutor listo para usar")
    print("   Configurar API keys para operar realmente")