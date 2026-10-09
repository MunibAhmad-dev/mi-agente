"""
📊 Data Pipeline DAG
=================
Pipeline para obtener y procesar datos de mercado

Ejecuta cada hora
"""

from airflow import DAG
from airflow.operators.python import PythonOperator
from airflow.operators.bash import BashOperator
from airflow.utils.dates import days_ago
from datetime import datetime, timedelta
import logging

# Default args
default_args = {
    'owner': 'crypto-ai',
    'depends_on_past': False,
    'email_on_failure': False,
    'email_on_retry': False,
    'retries': 2,
    'retry_delay': timedelta(minutes=5),
}

# Configuración
SYMBOLS = ['BTC/USDT', 'ETH/USDT', 'BNB/USDT']
TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d']

with DAG(
    'crypto_data_pipeline',
    default_args=default_args,
    description='Pipeline de datos para crypto trading',
    schedule_interval='@hourly',
    start_date=days_ago(1),
    catchup=False,
    tags=['crypto', 'data', 'pipeline'],
) as dag:
    
    # Tarea: Verificar conexión a exchange
    def check_exchange_connection(**context):
        """Verificar conexión al exchange"""
        import ccxt
        
        try:
            exchange = ccxt.binance()
            ticker = exchange.fetch_ticker('BTC/USDT')
            logging.info(f"✅ Conexión exitosa: BTC price: ${ticker['last']}")
            return {"status": "success", "price": ticker['last']}
        except Exception as e:
            logging.error(f"❌ Error de conexión: {e}")
            raise
    
    check_connection = PythonOperator(
        task_id='check_exchange_connection',
        python_callable=check_exchange_connection,
    )
    
    # Tarea: Obtener datos de mercado
    def fetch_market_data(**context):
        """Obtener datos OHLCV"""
        import ccxt
        import pandas as pd
        from datetime import datetime
        
        exchange = ccxt.binance()
        execution_date = context['execution_date']
        
        results = []
        
        for symbol in SYMBOLS:
            for timeframe in TIMEFRAMES[:3]:  # Solotimeframes cortos
                try:
                    ohlcv = exchange.fetch_ohlcv(
                        symbol,
                        timeframe=timeframe,
                        since=int((execution_date - timedelta(days=1)).timestamp() * 1000),
                        limit=1000
                    )
                    
                    df = pd.DataFrame(ohlcv, columns=[
                        'timestamp', 'open', 'high', 'low', 'close', 'volume'
                    ])
                    df['symbol'] = symbol
                    df['timeframe'] = timeframe
                    
                    results.append(df)
                    logging.info(f"✅ {symbol} {timeframe}: {len(df)} registros")
                    
                except Exception as e:
                    logging.error(f"❌ Error {symbol} {timeframe}: {e}")
        
        # Combinar todos los dataframes
        if results:
            combined = pd.concat(results, ignore_index=True)
            # Guardar a storage (simulado)
            logging.info(f"📊 Total registros: {len(combined)}")
            return {"status": "success", "records": len(combined)}
        
        return {"status": "no_data"}
    
    fetch_data = PythonOperator(
        task_id='fetch_market_data',
        python_callable=fetch_market_data,
    )
    
    # Tarea: Calcular indicadores técnicos
    def calculate_indicators(**context):
        """Calcular indicadores técnicos"""
        import pandas as pd
        import numpy as np
        
        # Simular datos
        logging.info("📈 Calculando indicadores técnicos...")
        
        # Ejemplo de cálculos
        # RSI, MACD, Bollinger Bands, etc.
        
        indicators = {
            'rsi_14': 'calculated',
            'macd': 'calculated',
            'bb_upper': 'calculated',
            'bb_middle': 'calculated',
            'bb_lower': 'calculated',
        }
        
        logging.info(f"✅ Indicadores calculados: {list(indicators.keys())}")
        return indicators
    
    calc_indicators = PythonOperator(
        task_id='calculate_indicators',
        python_callable=calculate_indicators,
    )
    
    # Tarea: Guardar a base de datos
    def store_to_database(**context):
        """Guardar features a base de datos"""
        import logging
        
        logging.info("💾 Guardando a TimescaleDB...")
        
        # Simular guardado
        # En producción: usar sqlalchemy + timescaledb
        
        return {"status": "success", "records_stored": 1000}
    
    store_data = PythonOperator(
        task_id='store_to_database',
        python_callable=store_to_database,
    )
    
    # Tarea: Actualizar features
    def update_features(**context):
        """Actualizar feature store"""
        import logging
        
        logging.info("🎯 Actualizando feature store...")
        
        return {"status": "success"}
    
    update_feats = PythonOperator(
        task_id='update_features',
        python_callable=update_features,
    )
    
    # Tarea: Notificar (opcional)
    def notify_completion(**context):
        """Notificar completado"""
        logging.info("✅ Pipeline completado")
    
    notify = PythonOperator(
        task_id='notify_completion',
        python_callable=notify_completion,
    )
    
    # Flujo
    check_connection >> fetch_data >> calc_indicators >> store_data >> update_feats >> notify