"""
⚠️ Risk Manager Service
=====================
Gestión de riesgo para el sistema de trading

Controla pérdidas, drawdown y exposición
"""

from datetime import datetime, timedelta
from typing import Dict, Optional, List
import json
import logging

logger = logging.getLogger(__name__)


class RiskManager:
    """Gestor de riesgo para trading autónomo"""
    
    def __init__(self, config: Optional[Dict] = None):
        """
        Inicializar gestor de riesgo
        
        Args:
            config: Configuración de riesgo
        """
        self.config = config or self._default_config()
        self.state = self._load_state()
        
        logger.info("⚠️ RiskManager inicializado")
    
    def _default_config(self) -> Dict:
        """Configuración por defecto"""
        return {
            'max_drawdown_percent': 20,
            'max_position_percent': 10,
            'max_daily_loss_percent': 5,
            'stop_loss_percent': 5,
            'take_profit_percent': 10,
            'reserve_percent': 70,
            'max_concurrent_positions': 3,
            'min_trade_interval_minutes': 15,
            'emergency_stop_enabled': True,
        }
    
    def _load_state(self) -> Dict:
        """Cargar estado"""
        return {
            'peak_balance': 0,
            'current_drawdown': 0,
            'trades_today': 0,
            'last_trade_time': None,
            'emergency_stop': False,
            'daily_loss': 0,
            'positions': []
        }
    
    def can_trade(self, balance: float, symbol: str) -> Dict:
        """
        Verificar si se puede operar
        
        Args:
            balance: Balance actual
            symbol: Símbolo a operar
        
        Returns:
            Dict {allowed: bool, reason: str}
        """
        # Emergency stop
        if self.state['emergency_stop']:
            return {
                'allowed': False,
                'reason': 'EMERGENCY_STOP_ACTIVATED'
            }
        
        # Verificar drawdown
        if self.state['peak_balance'] > 0:
            drawdown = (
                (self.state['peak_balance'] - balance) / 
                self.state['peak_balance']
            ) * 100
            
            if drawdown >= self.config['max_drawdown_percent']:
                self.state['emergency_stop'] = True
                logger.critical(
                    f"🛑 EMERGENCY STOP: Max drawdown {drawdown:.1f}%"
                )
                return {
                    'allowed': False,
                    'reason': f'MAX_DRAWDOWN_EXCEEDED: {drawdown:.1f}%'
                }
        
        # Actualizar peak balance
        if balance > self.state['peak_balance']:
            self.state['peak_balance'] = balance
        
        # Verificar límite diario
        today = datetime.now().date()
        
        if self.state.get('last_reset_date') != today:
            self.state['daily_loss'] = 0
            self.state['trades_today'] = 0
            self.state['last_reset_date'] = today
        
        if self.state['daily_loss'] >= self.config['max_daily_loss_percent']:
            return {
                'allowed': False,
                'reason': f'DAILY_LOSS_LIMIT: {self.state["daily_loss"]:.1f}%'
            }
        
        # Verificar posiciones concurrentes
        if len(self.state['positions']) >= self.config['max_concurrent_positions']:
            return {
                'allowed': False,
                'reason': 'MAX_POSITIONS_REACHED'
            }
        
        # Verificar intervalo
        if self.state['last_trade_time']:
            last = datetime.fromisoformat(self.state['last_trade_time'])
            elapsed = (datetime.now() - last).total_seconds() / 60
            
            if elapsed < self.config['min_trade_interval_minutes']:
                return {
                    'allowed': False,
                    'reason': f'MIN_INTERVAL: {elapsed:.0f}min ago'
                }
        
        return {'allowed': True, 'reason': 'OK'}
    
    def calculate_position_size(self, balance: float, price: float) -> float:
        """
        Calcular tamaño de posición
        
        Args:
            balance: Balance disponible
            price: Precio del activo
        
        Returns:
            Cantidad a comprar
        """
        # Usar máximo configurable
        max_use = balance * (self.config['max_position_percent'] / 100)
        
        # Reservar para emergencias
        reserve = balance * (self.config['reserve_percent'] / 100)
        usable = balance - reserve
        
        # No exceder posición máxima
        position_value = min(max_use, usable)
        
        # Calcular cantidad
        quantity = position_value / price
        
        logger.info(f"📊 Position size: {quantity:.4f} (${position_value:.2f})")
        return quantity
    
    def should_take_profit(self, entry_price: float, 
                       current_price: float) -> bool:
        """
        Verificar si tomar profit
        
        Args:
            entry_price: Precio de entrada
            current_price: Precio actual
        
        Returns:
            True si debe tomar profit
        """
        profit_percent = (
            (current_price - entry_price) / entry_price
        ) * 100
        
        if profit_percent >= self.config['take_profit_percent']:
            logger.info(f"✅ Take profit triggered: {profit_percent:.1f}%")
            return True
        
        return False
    
    def should_stop_loss(self, entry_price: float, 
                     current_price: float) -> bool:
        """
        Verificar si detener pérdida
        
        Args:
            entry_price: Precio de entrada
            current_price: Precio actual
        
        Returns:
            True si debe stop loss
        """
        loss_percent = (
            (entry_price - current_price) / entry_price
        ) * 100
        
        if loss_percent >= self.config['stop_loss_percent']:
            logger.warning(f"🛑 Stop loss triggered: {loss_percent:.1f}%")
            return True
        
        return False
    
    def register_trade(self, trade: Dict):
        """
        Registrar trade ejecutado
        
        Args:
            trade: Dict con trade
        """
        self.state['positions'].append({
            **trade,
            'entry_time': datetime.now().isoformat()
        })
        self.state['trades_today'] += 1
        self.state['last_trade_time'] = datetime.now().isoformat()
        
        logger.info(f"✅ Trade registrado: {trade.get('symbol')}")
    
    def close_position(self, symbol: str, pnl_percent: float):
        """
        Cerrar posición y actualizar estado
        
        Args:
            symbol: Símbolo
            pnl_percent: % de gain/loss
        """
        # Remover posición
        self.state['positions'] = [
            p for p in self.state['positions']
            if p.get('symbol') != symbol
        ]
        
        # Actualizar pérdida diaria
        if pnl_percent < 0:
            self.state['daily_loss'] += abs(pnl_percent)
        
        logger.info(f"📊 Position closed: {symbol} | PnL: {pnl_percent:.2f}%")
    
    def get_status(self) -> Dict:
        """
        Obtener estado actual
        
        Returns:
            Dict con estado
        """
        return {
            'emergency_stop': self.state['emergency_stop'],
            'peak_balance': self.state['peak_balance'],
            'positions_open': len(self.state['positions']),
            'trades_today': self.state['trades_today'],
            'daily_loss': self.state['daily_loss'],
            'config': self.config
        }
    
    def reset_emergency(self):
        """Reiniciar emergency stop"""
        self.state['emergency_stop'] = False
        logger.info("✅ Emergency stop reseteado")


# Ejemplo de uso
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    
    # Inicializar
    rm = RiskManager()
    
    # simular balance
    balance = 10000
    
    # Verificar si puede operar
    result = rm.can_trade(balance, 'BTC/USDT')
    print(f"¿Puedo operar? {result}")
    
    # Calcular tamaño de posición
    size = rm.calculate_position_size(balance, 50000)
    print(f"Tamaño de posición: {size}")
    
    # Obtener estado
    status = rm.get_status()
    print(f"Estado: {json.dumps(status, indent=2)}")