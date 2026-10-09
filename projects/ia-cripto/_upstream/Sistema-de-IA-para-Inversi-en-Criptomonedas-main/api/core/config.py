"""
🔧 Core Configuration
=====================
Configuración central de la aplicación
"""

from pydantic_settings import BaseSettings
from typing import Optional
import os


class Settings(BaseSettings):
    """Configuración de la aplicación"""
    
    # Database
    database_url: str = "postgresql://cryptoai:cryptoai2025@postgres:5432/cryptoai"
    
    # Redis
    redis_url: str = "redis://redis:6379"
    
    # RabbitMQ
    rabbitmq_url: str = "amqp://guest:guest@rabbitmq:5672"
    
    # Qdrant
    qdrant_host: str = "qdrant"
    qdrant_port: int = 6333
    
    # MLflow
    mlflow_tracking_uri: str = "http://mlflow:5000"
    
    # Security
    secret_key: str = "change-me-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    
    # API
    api_prefix: str = "/api/v1"
    project_name: str = "Crypto AI Trading System"
    version: str = "1.0.0"
    
    # CORS
    cors_origins: list = ["*"]
    
    class Config:
        env_file = ".env"


settings = Settings()

# Database engine
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

engine = create_engine(settings.database_url)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    """Dependency para obtener DB session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
