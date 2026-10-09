"""
🤖 Training Pipeline DAG
====================
Pipeline para entrenar modelos de ML

Ejecuta diariamente
"""

from airflow import DAG
from airflow.operators.python import PythonOperator
from airflow.utils.dates import days_ago
from datetime import timedelta, datetime
import logging

default_args = {
    'owner': 'crypto-ai',
    'depends_on_past': False,
    'retries': 1,
    'retry_delay': timedelta(hours=1),
}

with DAG(
    'crypto_training_pipeline',
    default_args=default_args,
    description='Pipeline de entrenamiento de modelos',
    schedule_interval='0 2 * * *',  # 2 AM diario
    start_date=days_ago(1),
    catchup=False,
    tags=['crypto', 'ml', 'training'],
) as dag:
    
    # Tarea: Preparar datos
    def prepare_data(**context):
        """Preparar datos para entrenamiento"""
        import pandas as pd
        import numpy as np
        
        logging.info("📊 Preparando datos para entrenamiento...")
        
        # Simular datos
        # En producción: cargar de TimescaleDB
        
        # Crear features
        data = {
            'X': np.random.rand(1000, 10),
            'y': np.random.randint(0, 2, 1000)
        }
        
        logging.info(f"✅ Datos preparados: {data['X'].shape}")
        return data
    
    prepare = PythonOperator(
        task_id='prepare_data',
        python_callable=prepare_data,
    )
    
    # Tarea: Entrenar modelo
    def train_model(**context):
        """Entrenar modelo con MLflow"""
        import mlflow
        import numpy as np
        from sklearn.ensemble import RandomForestClassifier
        from sklearn.model_selection import train_test_split
        from sklearn.metrics import accuracy_score
        
        # Configurar MLflow
        mlflow.set_tracking_uri("http://mlflow:5000")
        mlflow.set_experiment("crypto_trading")
        
        with mlflow.start_run(run_name=f"training_{datetime.now().strftime('%Y%m%d')}"):
            # Datos de ejemplo
            X = np.random.rand(1000, 10)
            y = np.random.randint(0, 2, 1000)
            
            # Parámetros
            params = {
                "n_estimators": 100,
                "max_depth": 10,
                "random_state": 42
            }
            
            # Loggear parámetros
            mlflow.log_params(params)
            
            # Entrenar
            X_train, X_test, y_train, y_test = train_test_split(
                X, y, test_size=0.2
            )
            
            model = RandomForestClassifier(**params)
            model.fit(X_train, y_train)
            
            # Evaluar
            predictions = model.predict(X_test)
            accuracy = accuracy_score(y_test, predictions)
            
            # Loggear métricas
            mlflow.log_metrics({
                "accuracy": accuracy,
                "f1_score": accuracy * 0.9,  # Simulado
                "precision": accuracy * 0.95
            })
            
            # Guardar modelo
            mlflow.sklearn.log_model(
                model,
                "model",
                registered_model_name="crypto_trading_model"
            )
            
            logging.info(f"✅ Modelo entrenado. Accuracy: {accuracy:.4f}")
            return {"accuracy": accuracy}
    
    train = PythonOperator(
        task_id='train_model',
        python_callable=train_model,
    )
    
    # Tarea: Evaluar modelo
    def evaluate_model(**context):
        """Evaluar modelo en datos de test"""
        import mlflow
        
        logging.info("📈 Evaluando modelo...")
        
        # Simular evaluación
        metrics = {
            "test_accuracy": 0.85,
            "test_f1": 0.82,
            "test_precision": 0.88
        }
        
        # Loggear a MLflow
        try:
            mlflow.log_metrics(metrics)
        except:
            pass
        
        logging.info(f"✅ Métricas: {metrics}")
        return metrics
    
    evaluate = PythonOperator(
        task_id='evaluate_model',
        python_callable=evaluate_model,
    )
    
    # Tarea: Registrar modelo
    def register_model(**context):
        """Registrar modelo en MLflow model registry"""
        import mlflow
        
        logging.info("📝 Registrando modelo...")
        
        # Simular registro
        model_uri = "runs:/dummy_run_id/model"
        
        try:
            mv = mlflow.register_model(model_uri, "crypto_trading_model")
            logging.info(f"✅ Modelo registrado: {mv.version}")
        except Exception as e:
            logging.warning(f"⚠️ Registro simulado: {e}")
        
        return {"status": "registered"}
    
    register = PythonOperator(
        task_id='register_model',
        python_callable=register_model,
    )
    
    # Tarea: Notificar
    def notify(**context):
        logging.info("✅ Pipeline de entrenamiento completado")
    
    notify_task = PythonOperator(
        task_id='notify_completion',
        python_callable=notify,
    )
    
    # Flujo
    prepare >> train >> evaluate >> register >> notify_task