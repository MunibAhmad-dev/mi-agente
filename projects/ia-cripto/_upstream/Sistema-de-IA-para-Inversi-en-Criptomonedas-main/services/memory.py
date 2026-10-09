"""
💾 Memory Service con Qdrant
=============================
Sistema de memoria vectorial para el agente IA

Qdrant: https://github.com/qdrant/qdrant
"""

import qdrant_client
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct
from qdrant_client.models import Filter, FieldCondition, MatchValue
from typing import Dict, List, Optional
import numpy as np
from datetime import datetime
import json
import logging
import hashlib

logger = logging.getLogger(__name__)


class MemoryService:
    """Servicio de memoria vectorial"""
    
    def __init__(self, host: str = 'localhost', port: int = 6333,
                 collection: str = 'trading_decisions'):
        """
        Inicializar servicio de memoria
        
        Args:
            host: Host de Qdrant
            port: Puerto de Qdrant
            collection: Nombre de colección
        """
        self.host = host
        self.port = port
        self.collection = collection
        
        # Conectar a Qdrant
        self.client = QdrantClient(host=host, port=port)
        
        # Crear colección si no existe
        self._ensure_collection()
        
        logger.info(f"💾 MemoryService inicializado: {host}:{port}/{collection}")
    
    def _ensure_collection(self):
        """Crear colección si no existe"""
        collections = self.client.get_collections().collections
        
        if not any(c.name == self.collection for c in collections):
            self.client.create_collection(
                collection_name=self.collection,
                vectors_config=VectorParams(
                    size=384,  # Tamaño de embedding estándar
                    distance=Distance.COSINE
                )
            )
            logger.info(f"✅ Colección creada: {self.collection}")
    
    def add_decision(self, decision: Dict, embedding: List[float]) -> str:
        """
        Guardar decisión de trading
        
        Args:
            decision: Dict con {symbol, action, price, reason, result}
            embedding: Vector de embedding
        
        Returns:
            ID del punto guardado
        """
        # Generar ID único
        decision_id = hashlib.md5(
            f"{datetime.now().isoformat()}{decision['symbol']}".encode()
        ).hexdigest()[:16]
        
        point = PointStruct(
            id=decision_id,
            vector=embedding,
            payload={
                **decision,
                'timestamp': datetime.now().isoformat(),
                'decision_id': decision_id
            }
        )
        
        self.client.upsert(
            collection_name=self.collection,
            points=[point]
        )
        
        logger.info(f"✅ Decisión guardada: {decision_id}")
        return decision_id
    
    def search_similar(self, query_embedding: List[float], 
                     limit: int = 5, 
                     filter_conditions: Optional[Dict] = None) -> List[Dict]:
        """
        Buscar decisiones similares
        
        Args:
            query_embedding: Embedding de búsqueda
            limit: Número de resultados
            filter_conditions: Filtros opcionales
        
        Returns:
            Lista de decisiones similares
        """
        # Construir filtro si existe
        filter_model = None
        if filter_conditions:
            must = []
            for key, value in filter_conditions.items():
                must.append(
                    FieldCondition(
                        key=key,
                        match=MatchValue(value=value)
                    )
                )
            filter_model = Filter(must=must)
        
        # Buscar
        results = self.client.search(
            collection_name=self.collection,
            query_vector=query_embedding,
            limit=limit,
            query_filter=filter_model,
            with_payload=True
        )
        
        return [
            {
                'id': r.id,
                'score': r.score,
                **r.payload
            }
            for r in results
        ]
    
    def get_decisions_by_result(self, symbol: str, 
                           positive_only: bool = True,
                           limit: int = 20) -> List[Dict]:
        """
        Obtener decisiones por resultado
        
        Args:
            symbol: Símbolo a buscar
            positive_only: Solo exitosas
            limit: Número de resultados
        
        Returns:
            Lista de decisiones
        """
        filter_conditions = {
            'symbol': symbol
        }
        
        if positive_only:
            filter_conditions['result'] = 'win'
        
        results = self.client.search(
            collection_name=self.collection,
            query_vector=[0.0] * 384,  # Dummy
            limit=limit,
            query_filter=Filter(
                must=[
                    FieldCondition(
                        key=key,
                        match=MatchValue(value=value)
                    )
                    for key, value in filter_conditions.items()
                ]
            ),
            with_payload=True
        )
        
        return [r.payload for r in results]
    
    def get_statistics(self) -> Dict:
        """
        Obtener estadísticas de memoria
        
        Returns:
            Dict con estadísticas
        """
        info = self.client.get_collection(self.collection)
        
        return {
            'vectors_count': info.vectors_count,
            'points_count': info.points_count,
            'indexed_vectors': info.indexed_vectors_count,
            'collection_name': self.collection
        }
    
    def delete_old(self, days: int = 90) -> int:
        """
        Eliminar decisiones antiguas
        
        Args:
            days: Días a mantener
        
        Returns:
            Número de registros eliminados
        """
        # Calcular timestamp de corte
        from datetime import timedelta
        cutoff = datetime.now() - timedelta(days=days)
        
        # Este método requeriría más implementación
        # Por ahora retornamos 0
        logger.info(f"🗑️  Recordar eliminar decisiones > {days} días")
        return 0
    
    def get_all_decisions(self, limit: int = 100) -> List[Dict]:
        """
        Obtener todas las decisiones
        
        Args:
            limit: Límite de resultados
        
        Returns:
            Lista de decisiones
        """
        results = self.client.scroll(
            collection_name=self.collection,
            limit=limit,
            with_payload=True
        )
        
        return [r.payload for r in results[0]]


class SimpleEmbedding:
    """Generador simple de embeddings"""
    
    def __init__(self):
        self.vector_size = 384
    
    def generate(self, text: str) -> List[float]:
        """
        Generar embedding simple (dummy)
        
        Nota: En producción usar modelo real (sentence-transformers, etc)
        
        Args:
            text: Texto a embeber
        
        Returns:
            Vector de embedding
        """
        # Generar vector pseudo-aleatorio basado en texto
        # EN PRODUCCIÓN: Reemplazar con modelo real
        np.random.seed(len(text))
        return np.random.randn(self.vector_size).tolist()


# Ejemplo de uso
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    
    # Inicializar servicio
    memory = MemoryService('localhost', 6333, 'trading_decisions')
    
    # Obtener estadísticas
    stats = memory.get_statistics()
    print(f"📊 Estadísticas: {stats}")
    
    # Guardar decisión ejemplo
    embedder = SimpleEmbedding()
    decision = {
        'symbol': 'BTC/USDT',
        'action': 'buy',
        'price': 50000,
        'reason': 'RSI oversold',
        'result': 'win'
    }
    
    embedding = embedder.generate(f"{decision['symbol']} {decision['reason']}")
    memory.add_decision(decision, embedding)
    
    # Buscar similares
    similar = memory.search_similar(embedding[:], limit=3)
    print(f"\n🔍 Similares encontrados: {len(similar)}")