"""
API-Key Manager - Key Manager Service
=====================================

Service for managing API keys lifecycle.

Autor: Mi LibreChat
Versión: 1.1.0 (Security Update)
Licencia: MIT

SEGURIDAD:
- Fernet AES-128 encryption para API keys
- Clave desde variable de entorno ENCRYPTION_KEY
- Fallback a texto plano SOLO en desarrollo si no hay clave
"""

import json
import logging
import os
import base64
import hashlib
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
from dataclasses import dataclass

logger = logging.getLogger(__name__)


# ============================================================================
# SECURITY: Encryption Configuration
# ============================================================================

def _get_encryption_key() -> bytes:
    """
    Obtiene la clave de encriptación desde variable de entorno.
    
    Returns:
        bytes: Clave de encriptación (32 bytes para Fernet)
    
    Raises:
        ValueError: Si ENCRYPTION_KEY no está configurada en producción
    """
    env_key = os.environ.get('ENCRYPTION_KEY')
    
    if not env_key:
        if os.environ.get('NODE_ENV') == 'production':
            raise ValueError(
                "ENCRYPTION_KEY environment variable is required in production. "
                "Generate with: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
            )
        # Development fallback - generar clave pseudoaleatoria
        logger.warning("⚠️ ENCRYPTION_KEY not set. Using insecure fallback for development.")
        # Clave pseudoaleatoria pero determinística para desarrollo
        return hashlib.sha256(b"development-fallback-key").digest()
    
    # La clave puede venir como Fernet key (base64) o como password
    try:
        # Si es una clave Fernet válida (base64), usarla directamente
        return env_key.encode()
    except Exception:
        # Si no, derivarla a 32 bytes
        return hashlib.sha256(env_key.encode()).digest()


class FernetEncryptor:
    """
    Wrapper para encriptación Fernet con manejo de claves.
    
    Usa AES-128-CBC con HMAC para autenticación.
    """
    
    def __init__(self):
        self._fernet = None
        self._initialized = False
    
    def _initialize(self):
        """Inicializa Fernet con la clave."""
        if self._initialized:
            return
        
        try:
            from cryptography.fernet import Fernet
            key = _get_encryption_key()
            self._fernet = Fernet(key)
            self._initialized = True
            logger.info("✅ Fernet encryption initialized")
        except ImportError:
            logger.error("❌ cryptography package not installed. Run: pip install cryptography")
            raise ImportError("cryptography package is required for encryption")
    
    def encrypt(self, plaintext: str) -> str:
        """
        Encripta un texto plano.
        
        Args:
            plaintext: Texto a encriptar
            
        Returns:
            str: Texto encriptado (base64)
        """
        self._initialize()
        
        if not plaintext:
            return plaintext
        
        encrypted = self._fernet.encrypt(plaintext.encode('utf-8'))
        return encrypted.decode('utf-8')
    
    def decrypt(self, ciphertext: str) -> str:
        """
        Desencripta un texto.
        
        Args:
            ciphertext: Texto encriptado (base64)
            
        Returns:
            str: Texto plano
        """
        self._initialize()
        
        if not ciphertext:
            return ciphertext
        
        try:
            decrypted = self._fernet.decrypt(ciphertext.encode('utf-8'))
            return decrypted.decode('utf-8')
        except Exception as e:
            logger.error(f"Decryption failed: {e}")
            raise ValueError("Failed to decrypt API key. Check ENCRYPTION_KEY.")


# Instancia global del encriptador
_encryptor = FernetEncryptor()


@dataclass
class KeyStats:
    """Statistics for an API key."""
    total_requests: int
    successful_requests: int
    failed_requests: int
    avg_latency_ms: float
    total_tokens: int
    estimated_cost: float
    last_used_at: Optional[datetime]
    health_score: float


@dataclass
class ProviderStats:
    """Statistics for a provider."""
    name: str
    active_keys: int
    exhausted_keys: int
    total_requests: int
    avg_latency_ms: float
    error_rate: float


class KeyManagerService:
    """
    Service for managing API keys lifecycle.
    
    Responsibilities:
    - CRUD operations for keys
    - Key status management (active, exhausted, cooldown, invalid)
    - Key rotation
    - Statistics and health monitoring
    - Encryption/decryption of keys at rest
    """

    def __init__(self, db):
        self.db = db
        from api.server.services.APIKeyManager.models import ApiKey, KeyStatus, Provider, UsageLog

    def create_key(
        self,
        provider_id: int,
        key: str,
        label: Optional[str] = None,
        remaining_quota: Optional[float] = None,
        daily_limit: Optional[float] = None,
        is_primary: bool = False,
    ) -> Dict[str, Any]:
        """
        Create a new API key.
        
        Args:
            provider_id: ID of the provider
            key: The API key (will be encrypted)
            label: Optional label for the key
            remaining_quota: Optional quota limit
            daily_limit: Optional daily limit
            is_primary: Whether this is the primary key
            
        Returns:
            The created key as dictionary
        """
        from api.server.services.APIKeyManager.models import ApiKey, KeyStatus
        
        # Encrypt the key before storing
        encrypted_key = self._encrypt_key(key)
        
        api_key = ApiKey(
            provider_id=provider_id,
            key=encrypted_key,
            label=label,
            remaining_quota=remaining_quota,
            daily_limit=daily_limit,
            status=KeyStatus.ACTIVE,
            is_primary=is_primary,
        )
        
        self.db.add(api_key)
        self.db.commit()
        self.db.refresh(api_key)
        
        logger.info(f"Created new API key {api_key.id} for provider {provider_id}")
        
        return api_key.to_dict()

    def get_key(self, key_id: int) -> Optional[Dict[str, Any]]:
        """Get a key by ID."""
        from api.server.services.APIKeyManager.models import ApiKey
        
        key = self.db.query(ApiKey).filter(ApiKey.id == key_id).first()
        return key.to_dict() if key else None

    def get_key_decrypted(self, key_id: int) -> Optional[str]:
        """Get a key decrypted by ID."""
        from api.server.services.APIKeyManager.models import ApiKey
        
        key = self.db.query(ApiKey).filter(ApiKey.id == key_id).first()
        if key:
            return self._decrypt_key(key.key)
        return None

    def list_keys(
        self,
        provider_id: Optional[int] = None,
        status: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> List[Dict[str, Any]]:
        """List keys with optional filters."""
        from api.server.services.APIKeyManager.models import ApiKey, KeyStatus
        
        query = self.db.query(ApiKey)
        
        if provider_id:
            query = query.filter(ApiKey.provider_id == provider_id)
        
        if status:
            query = query.filter(ApiKey.status == KeyStatus(status))
        
        keys = query.order_by(ApiKey.id.desc()).offset(offset).limit(limit).all()
        return [key.to_dict() for key in keys]

    def update_key(
        self,
        key_id: int,
        **updates
    ) -> Optional[Dict[str, Any]]:
        """Update a key."""
        from api.server.services.APIKeyManager.models import ApiKey
        
        key = self.db.query(ApiKey).filter(ApiKey.id == key_id).first()
        if not key:
            return None
        
        allowed_fields = ['label', 'remaining_quota', 'daily_limit', 'is_primary']
        for field in allowed_fields:
            if field in updates:
                setattr(key, field, updates[field])
        
        self.db.commit()
        self.db.refresh(key)
        
        return key.to_dict()

    def delete_key(self, key_id: int) -> bool:
        """Delete a key."""
        from api.server.services.APIKeyManager.models import ApiKey
        
        key = self.db.query(ApiKey).filter(ApiKey.id == key_id).first()
        if not key:
            return False
        
        self.db.delete(key)
        self.db.commit()
        
        logger.info(f"Deleted API key {key_id}")
        return True

    def mark_exhausted(
        self,
        key_id: int,
        cooldown_seconds: int = 3600
    ) -> bool:
        """Mark a key as exhausted with cooldown."""
        from api.server.services.APIKeyManager.models import ApiKey
        
        key = self.db.query(ApiKey).filter(ApiKey.id == key_id).first()
        if not key:
            return False
        
        key.mark_exhausted(cooldown_seconds)
        self.db.commit()
        
        logger.info(f"Key {key_id} marked as exhausted (cooldown: {cooldown_seconds}s)")
        return True

    def mark_invalid(
        self,
        key_id: int,
        error: str
    ) -> bool:
        """Mark a key as invalid."""
        from api.server.services.APIKeyManager.models import ApiKey
        
        key = self.db.query(ApiKey).filter(ApiKey.id == key_id).first()
        if not key:
            return False
        
        key.mark_invalid(error)
        self.db.commit()
        
        logger.warning(f"Key {key_id} marked as invalid: {error}")
        return True

    def restore_cooldown_keys(self) -> int:
        """Restore keys whose cooldown has expired."""
        from api.server.services.APIKeyManager.models import ApiKey, KeyStatus
        
        now = datetime.utcnow()
        
        keys = (
            self.db.query(ApiKey)
            .filter(
                ApiKey.status == KeyStatus.EXHAUSTED,
                ApiKey.cooldown_until != None,
                ApiKey.cooldown_until <= now,
            )
            .all()
        )
        
        count = 0
        for key in keys:
            key.status = KeyStatus.ACTIVE
            key.cooldown_until = None
            count += 1
        
        self.db.commit()
        
        if count > 0:
            logger.info(f"Restored {count} keys from cooldown")
        
        return count

    def get_best_key(self, provider_id: int) -> Optional[Dict[str, Any]]:
        """Get the best available key for a provider."""
        from api.server.services.APIKeyManager.models import ApiKey, KeyStatus
        
        key = (
            self.db.query(ApiKey)
            .filter(
                ApiKey.provider_id == provider_id,
                ApiKey.status == KeyStatus.ACTIVE,
            )
            .order_by(ApiKey.success_count.desc())
            .first()
        )
        
        return key.to_dict() if key else None

    def count_active_keys(self, provider_id: int) -> int:
        """Count active keys for a provider."""
        from api.server.services.APIKeyManager.models import ApiKey, KeyStatus
        
        return (
            self.db.query(ApiKey)
            .filter(
                ApiKey.provider_id == provider_id,
                ApiKey.status == KeyStatus.ACTIVE,
            )
            .count()
        )

    def get_key_stats(self, key_id: int) -> Optional[KeyStats]:
        """Get statistics for a key."""
        from api.server.services.APIKeyManager.models import UsageLog
        
        # Get usage logs for the last 24 hours
        since = datetime.utcnow() - timedelta(hours=24)
        
        logs = (
            self.db.query(UsageLog)
            .filter(
                UsageLog.api_key_id == key_id,
                UsageLog.created_at >= since,
            )
            .all()
        )
        
        if not logs:
            return None
        
        successful = sum(1 for log in logs if log.is_success)
        failed = len(logs) - successful
        total_tokens = sum(log.total_tokens for log in logs)
        total_cost = sum(log.estimated_cost for log in logs)
        avg_latency = sum(log.latency_ms for log in logs) / len(logs)
        
        return KeyStats(
            total_requests=len(logs),
            successful_requests=successful,
            failed_requests=failed,
            avg_latency_ms=avg_latency,
            total_tokens=total_tokens,
            estimated_cost=total_cost,
            last_used_at=max(log.created_at for log in logs) if logs else None,
            health_score=successful / len(logs) if logs else 0,
        )

    def get_provider_stats(self, provider_id: int) -> ProviderStats:
        """Get statistics for a provider."""
        from api.server.services.APIKeyManager.models import ApiKey, KeyStatus, Provider, UsageLog
        from sqlalchemy import func
        
        provider = self.db.query(Provider).filter(Provider.id == provider_id).first()
        if not provider:
            return None
        
        # Count keys by status
        keys = self.db.query(ApiKey).filter(ApiKey.provider_id == provider_id).all()
        active_keys = sum(1 for k in keys if k.status == KeyStatus.ACTIVE)
        exhausted_keys = sum(1 for k in keys if k.status == KeyStatus.EXHAUSTED)
        
        # Get usage stats for last 24 hours
        since = datetime.utcnow() - timedelta(hours=24)
        
        result = (
            self.db.query(
                func.count(UsageLog.id),
                func.avg(UsageLog.latency_ms),
                func.sum(UsageLog.status_code),
            )
            .filter(
                UsageLog.provider_id == provider_id,
                UsageLog.created_at >= since,
            )
            .first()
        )
        
        total_requests = result[0] or 0
        avg_latency = result[1] or 0
        
        # Calculate error rate
        error_count = (
            self.db.query(UsageLog)
            .filter(
                UsageLog.provider_id == provider_id,
                UsageLog.created_at >= since,
                UsageLog.status_code >= 400,
            )
            .count()
        )
        
        error_rate = error_count / total_requests if total_requests > 0 else 0
        
        return ProviderStats(
            name=provider.name,
            active_keys=active_keys,
            exhausted_keys=exhausted_keys,
            total_requests=total_requests,
            avg_latency_ms=avg_latency,
            error_rate=error_rate,
        )

    def get_system_stats(self) -> Dict[str, Any]:
        """Get overall system statistics."""
        from api.server.services.APIKeyManager.models import Provider, ApiKey, KeyStatus, UsageLog
        
        # Count providers
        total_providers = self.db.query(Provider).count()
        active_providers = self.db.query(Provider).filter(Provider.status == "active").count()
        
        # Count keys
        total_keys = self.db.query(ApiKey).count()
        active_keys = self.db.query(ApiKey).filter(ApiKey.status == KeyStatus.ACTIVE).count()
        exhausted_keys = self.db.query(ApiKey).filter(ApiKey.status == KeyStatus.EXHAUSTED).count()
        
        # Usage in last 24 hours
        since = datetime.utcnow() - timedelta(hours=24)
        recent_logs = (
            self.db.query(UsageLog)
            .filter(UsageLog.created_at >= since)
            .all()
        )
        
        total_requests = len(recent_logs)
        successful_requests = sum(1 for log in recent_logs if log.is_success)
        total_tokens = sum(log.total_tokens for log in recent_logs)
        total_cost = sum(log.estimated_cost for log in recent_logs)
        
        return {
            "providers": {
                "total": total_providers,
                "active": active_providers,
            },
            "keys": {
                "total": total_keys,
                "active": active_keys,
                "exhausted": exhausted_keys,
            },
            "usage_24h": {
                "total_requests": total_requests,
                "successful_requests": successful_requests,
                "failed_requests": total_requests - successful_requests,
                "success_rate": successful_requests / total_requests if total_requests > 0 else 0,
                "total_tokens": total_tokens,
                "estimated_cost": total_cost,
            },
        }

    def _encrypt_key(self, key: str) -> str:
        """
        Encrypt an API key using Fernet AES-128.
        
        Security: AES-128-CBC with HMAC authentication.
        Key is retrieved from ENCRYPTION_KEY environment variable.
        
        Args:
            key: Plain text API key
            
        Returns:
            str: Encrypted key (base64 encoded)
        """
        global _encryptor
        return _encryptor.encrypt(key)

    def _decrypt_key(self, encrypted_key: str) -> str:
        """
        Decrypt an API key using Fernet AES-128.
        
        Security: AES-128-CBC with HMAC authentication.
        
        Args:
            encrypted_key: Encrypted API key (base64 encoded)
            
        Returns:
            str: Decrypted plain text key
        """
        global _encryptor
        return _encryptor.decrypt(encrypted_key)
