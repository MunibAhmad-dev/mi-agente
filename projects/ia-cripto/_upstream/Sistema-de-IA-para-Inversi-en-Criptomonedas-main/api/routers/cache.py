"""
🚀 Redis Cache
============
Cacheo de datos de mercado con Redis
"""

import redis.asyncio as redis
from typing import Optional, Any
import json
import asyncio
from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)


class RedisCache:
    """Cache distribuido con Redis"""
    
    def __init__(
        self,
        host: str = "localhost",
        port: int = 6379,
        db: int = 0,
        password: Optional[str] = None,
        decode_responses: bool = True
    ):
        self.host = host
        self.port = port
        self.db = db
        self.password = password
        self.decode_responses = decode_responses
        self._client: Optional[redis.Redis] = None
    
    async def connect(self):
        """Conectar a Redis"""
        try:
            self._client = redis.Redis(
                host=self.host,
                port=self.port,
                db=self.db,
                password=self.password,
                decode_responses=self.decode_responses,
                socket_connect_timeout=5,
                socket_timeout=5
            )
            await self._client.ping()
            logger.info(f"Connected to Redis at {self.host}:{self.port}")
        except Exception as e:
            logger.error(f"Failed to connect to Redis: {e}")
            self._client = None
    
    async def disconnect(self):
        """Desconectar"""
        if self._client:
            await self._client.close()
            self._client = None
    
    @property
    def client(self) -> Optional[redis.Redis]:
        """Get Redis client"""
        return self._client
    
    async def get(self, key: str) -> Optional[Any]:
        """Obtener valor"""
        if not self._client:
            return None
        
        try:
            value = await self._client.get(key)
            if value:
                return json.loads(value)
            return None
        except Exception as e:
            logger.error(f"Redis get error: {e}")
            return None
    
    async def set(
        self,
        key: str,
        value: Any,
        expire: Optional[int] = None
    ) -> bool:
        """Setear valor con TTL opcional"""
        if not self._client:
            return False
        
        try:
            serialized = json.dumps(value)
            if expire:
                await self._client.setex(key, expire, serialized)
            else:
                await self._client.set(key, serialized)
            return True
        except Exception as e:
            logger.error(f"Redis set error: {e}")
            return False
    
    async def delete(self, key: str) -> bool:
        """Eliminar clave"""
        if not self._client:
            return False
        
        try:
            await self._client.delete(key)
            return True
        except Exception as e:
            logger.error(f"Redis delete error: {e}")
            return False
    
    async def exists(self, key: str) -> bool:
        """Verificar si clave existe"""
        if not self._client:
            return False
        
        try:
            return await self._client.exists(key) > 0
        except Exception:
            return False
    
    async def keys(self, pattern: str = "*"):
        """Buscar claves por patrón"""
        if not self._client:
            return []
        
        try:
            return await self._client.keys(pattern)
        except Exception:
            return []
    
    # Convenience methods para market data
    async def get_ticker(self, symbol: str) -> Optional[dict]:
        """Obtener ticker cacheado"""
        return await self.get(f"ticker:{symbol}")
    
    async def set_ticker(
        self,
        symbol: str,
        data: dict,
        ttl: int = 5  # 5 segundos
    ) -> bool:
        """Cachear ticker"""
        return await self.set(f"ticker:{symbol}", data, ttl)
    
    async def get_ohlcv(
        self,
        symbol: str,
        timeframe: str = "1h"
    ) -> Optional[list]:
        """Obtener OHLCV cacheado"""
        return await self.get(f"ohlcv:{symbol}:{timeframe}")
    
    async def set_ohlcv(
        self,
        symbol: str,
        timeframe: str,
        data: list,
        ttl: int = 60  # 1 minuto
    ) -> bool:
        """Cachear OHLCV"""
        return await self.set(f"ohlcv:{symbol}:{timeframe}", data, ttl)
    
    async def get_orderbook(self, symbol: str) -> Optional[dict]:
        """Obtener orderbook cacheado"""
        return await self.get(f"orderbook:{symbol}")
    
    async def set_orderbook(
        self,
        symbol: str,
        data: dict,
        ttl: int = 2  # 2 segundos
    ) -> bool:
        """Cachear orderbook"""
        return await self.set(f"orderbook:{symbol}", data, ttl)
    
    async def invalidate_symbol(self, symbol: str):
        """Invalidar cache de símbolo"""
        patterns = [
            f"ticker:{symbol}",
            f"ohlcv:{symbol}:*",
            f"orderbook:{symbol}",
        ]
        for pattern in patterns:
            keys = await self.keys(pattern)
            for key in keys:
                await self.delete(key)
    
    # Cache de usuario
    async def get_user_session(self, user_id: str) -> Optional[dict]:
        """Obtener sesión de usuario"""
        return await self.get(f"session:{user_id}")
    
    async def set_user_session(
        self,
        user_id: str,
        data: dict,
        ttl: int = 3600  # 1 hora
    ) -> bool:
        """Guardar sesión"""
        return await self.set(f"session:{user_id}", data, ttl)
    
    # Rate limiting
    async def check_rate_limit(
        self,
        key: str,
        limit: int = 100,
        window: int = 60
    ) -> tuple[bool, int]:
        """
        Verificar rate limit
        Returns: (allowed, remaining)
        """
        if not self._client:
            return True, limit
        
        try:
            current = await self._client.get(f"ratelimit:{key}")
            count = int(current or 0)
            
            if count >= limit:
                return False, 0
            
            # Incrementar
            pipe = self._client.pipeline()
            pipe.incr(f"ratelimit:{key}")
            pipe.expire(f"ratelimit:{key}", window)
            await pipe.execute()
            
            return True, limit - count - 1
        except Exception:
            return True, limit


# Singleton instance
redis_cache = RedisCache()


# Decorator para cachear funciones async
def cached(key_func, expire: int = 60):
    """Decorator para cachear funciones async"""
    def decorator(func):
        async def wrapper(*args, **kwargs):
            # Generar key
            key = f"cache:{func.__name__}:{key_func(*args, **kwargs)}"
            
            # Check cache
            cached = await redis_cache.get(key)
            if cached is not None:
                return cached
            
            # Ejecutar função
            result = await func(*args, **kwargs)
            
            # Guardar cache
            await redis_cache.set(key, result, expire)
            
            return result
        return wrapper
    return decorator


async def init_redis_cache():
    """Inicializar cache global"""
    await redis_cache.connect()


async def close_redis_cache():
    """Cerrar cache global"""
    await redis_cache.disconnect()