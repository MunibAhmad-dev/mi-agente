"""
📈 Sample Trading Strategy
=========================
Estrategia ejemplo para Freqtrade

Copia esta estrategia y personalízala
"""

from freqtrade.strategy import IStrategy
from pandas import DataFrame
import pandas as pd
import talib.abstract as ta


class SampleStrategy(IStrategy):
    """
    Estrategia ejemplo: RSI + MACD
    
    Compra cuando:
    - RSI < 30 (sobrevendido)
    - MACD cruza arriba de signal
    
    Vende cuando:
    - RSI > 70 (sobrecomprado)
    - MACD cruza debajo de signal
    - Stop loss o take profit alcanzado
    """
    
    # Parametros configurables
    timeframe = '1h'
    
    # Stop loss (%)
    stoploss = -0.05
    
    # Take profit (%)
    timeframe = '1h'
    minimal_roi = {
        "0": 0.10,  # 10% profit
    }
    
    # Parametros de indicadores
    params = {
        'rsi_period': 14,
        'rsi_oversold': 30,
        'rsi_overbought': 70,
        'macd_fast': 12,
        'macd_slow': 26,
        'macd_signal': 9,
    }
    
    def populate_indicators(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        """Agregar indicadores"""
        
        # RSI
        dataframe['rsi'] = ta.rsi(
            dataframe, 
            timeperiod=self.params['rsi_period']
        )
        
        # MACD
        macd = ta.MACD(
            dataframe,
            fastperiod=self.params['macd_fast'],
            slowperiod=self.params['macd_slow'],
            signalperiod=self.params['macd_signal']
        )
        
        dataframe['macd'] = macd['macd']
        dataframe['macd_signal'] = macd['macdsignal']
        dataframe['macd_hist'] = macd['macdhist']
        
        # SMA
        dataframe['sma_20'] = ta.sma(dataframe, timeperiod=20)
        dataframe['sma_50'] = ta.sma(dataframe, timeperiod=50)
        
        # Bollinger Bands
        bollinger = ta.BBANDS(
            dataframe, 
            timeperiod=20, 
            nbdevup=2, 
            nbdevdn=2, 
            matype=0
        )
        dataframe['bb_upper'] = bollinger['upperband']
        dataframe['bb_middle'] = bollinger['middleband']
        dataframe['bb_lower'] = bollinger['lowerband']
        
        return dataframe
    
    def populate_entry_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        """Señales de compra"""
        
        # RSI sobrevendido
        rsi_buy = dataframe['rsi'] < self.params['rsi_oversold']
        
        # MACD cruza arriba
        macd_cross_up = (
            (dataframe['macd'] > dataframe['macd_signal']) & 
            (dataframe['macd'].shift(1) <= dataframe['macd_signal'].shift(1))
        )
        
        # Precio debajo de Bollinger inferior
        bb_buy = dataframe['close'] < dataframe['bb_lower']
        
        # Combinar condiciones
        dataframe.loc[
            (rsi_buy | (macd_cross_up & bb_buy)),
            'enter_long'
        ] = 1
        
        return dataframe
    
    def populate_exit_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        """Señales de venta"""
        
        # RSI sobrecomprado
        rsi_sell = dataframe['rsi'] > self.params['rsi_overbought']
        
        # MACD cruza abajo
        macd_cross_down = (
            (dataframe['macd'] < dataframe['macd_signal']) & 
            (dataframe['macd'].shift(1) >= dataframe['macd_signal'].shift(1))
        )
        
        # Precio encima de Bollinger superior
        bb_sell = dataframe['close'] > dataframe['bb_upper']
        
        # Combinar condiciones
        dataframe.loc[
            (rsi_sell | (macd_cross_down & bb_sell)),
            'exit_long'
        ] = 1
        
        return dataframe


# Para usar esta estrategia:
# freqtrade trade --strategy SampleStrategy --config config.json
