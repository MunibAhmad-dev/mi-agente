"""Token Optimization Engine - public API."""
from .core.ir import ContextItem, ContentType, Role, RiskLevel, Provenance
from .core.classifier import ContextClassifier, TaskPolicy, TASK_POLICIES
from .core.risk import RiskEngine
from .core.dedup import DeduplicationEngine
from .core.information_value import InformationValueEngine
from .orchestrator import ContextOrchestrator, OptimizationReport
from .storage.store import ShadowContextStore
from .recovery.recoverer import TargetedRecoverer, RecoveryResult
from .fidelity.evaluator import FidelityEvaluator, FidelityReport
from .packing.packer import ContextPacker
from .packing.levels import LevelManager
from .compression.router import AdaptiveCompressionRouter
from .compression.cascade import CompressionCascade
from .cost import CostModel, TaskRunMetrics, cost_per_successful_task
from .tokenization.providers import TokenCounter, ModelProfileRegistry
from .engine import Engine

__version__ = "0.1.0"

__all__ = [
    "ContextItem", "ContentType", "Role", "RiskLevel", "Provenance",
    "ContextClassifier", "TaskPolicy", "TASK_POLICIES",
    "RiskEngine", "DeduplicationEngine", "InformationValueEngine",
    "ContextOrchestrator", "OptimizationReport",
    "ShadowContextStore", "TargetedRecoverer", "RecoveryResult",
    "FidelityEvaluator", "FidelityReport", "ContextPacker", "LevelManager",
    "AdaptiveCompressionRouter", "CompressionCascade", "CostModel",
    "TaskRunMetrics", "cost_per_successful_task",
    "TokenCounter", "ModelProfileRegistry", "Engine", "__version__",
]
