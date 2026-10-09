"""PolicyLearner (spec §33, §34) — SHADOW MODE.

Learns which compression methods pay off per (task, content_type) from real
runs, but NEVER changes runtime behavior by itself. Recommendations are only
advisory; promotion through experimental → candidate → canary → production
requires an explicit, audited call with minimum evidence thresholds.
"""
from __future__ import annotations

import math
import threading
import time
from dataclasses import dataclass, field
from enum import Enum


class PromotionState(str, Enum):
    EXPERIMENTAL = "experimental"
    CANDIDATE = "candidate"
    CANARY = "canary"
    PRODUCTION = "production"
    DEPRECATED = "deprecated"


@dataclass
class PolicyObservation:
    task: str
    content_type: str
    method: str
    compression_ratio: float      # final/original (lower = more compression)
    recovery_count: int
    fidelity_failures: int
    latency_ms: float
    success: bool                 # sufficiency proxy or real task success
    quality: float = 1.0          # 0..1
    ts: float = field(default_factory=time.time)


@dataclass
class MethodStats:
    n: int = 0
    reward_sum: float = 0.0
    success_sum: int = 0

    @property
    def avg_reward(self) -> float:
        return self.reward_sum / self.n if self.n else 0.0

    @property
    def success_rate(self) -> float:
        return self.success_sum / self.n if self.n else 0.0


def reward(obs: PolicyObservation) -> float:
    """+ task success + quality + token efficiency − recoveries − failures − latency.

    Bounded roughly to [-1.5, 1.5]; token_efficiency = 1 - ratio.
    """
    if obs.compression_ratio < 0 or obs.compression_ratio > 1:
        return -1.0
    token_eff = 1.0 - obs.compression_ratio
    r = 0.5 * (1.0 if obs.success else 0.0) + 0.25 * obs.quality + 0.5 * token_eff
    r -= 0.1 * min(obs.recovery_count, 5)
    r -= 0.3 * min(obs.fidelity_failures, 3)
    r -= min(obs.latency_ms / 1000.0, 0.5)
    return round(max(-1.5, min(1.5, r)), 4)


class PolicyLearner:
    MIN_SAMPLES_PROMOTION = 20
    MIN_AVG_REWARD_PROMOTION = 0.3

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._stats: dict[tuple[str, str, str], MethodStats] = {}
        self._states: dict[tuple[str, str, str], PromotionState] = {}

    @staticmethod
    def _key(task: str, content_type: str, method: str) -> tuple[str, str, str]:
        return (task, content_type, method)

    def record(self, obs: PolicyObservation) -> float:
        key = self._key(obs.task, obs.content_type, obs.method)
        r = reward(obs)
        with self._lock:
            st = self._stats.setdefault(key, MethodStats())
            st.n += 1
            st.reward_sum += r
            st.success_sum += 1 if obs.success else 0
            self._states.setdefault(key, PromotionState.EXPERIMENTAL)
        return r

    def stats(self) -> dict:
        with self._lock:
            return {
                f"{t}/{c}/{m}": {
                    "n": s.n, "avg_reward": round(s.avg_reward, 4),
                    "success_rate": round(s.success_rate, 4),
                    "state": self._states.get((t, c, m), PromotionState.EXPERIMENTAL).value,
                }
                for (t, c, m), s in sorted(self._stats.items())
            }

    def recommend(self, task: str, content_type: str) -> dict | None:
        """Advisory only: best method by avg reward with enough samples.

        The caller decides whether to follow it; the router never reads this
        automatically (spec §34: shadow → benchmark → canary → promote).
        """
        with self._lock:
            candidates = [
                ((t, c, m), s) for (t, c, m), s in self._stats.items()
                if t == task and c == content_type
            ]
        if not candidates:
            return None
        # UCB-style tiebreak so exploration is possible without randomness
        def score(item):
            _, s = item
            explore = math.sqrt(2.0 * math.log(sum(x[1].n for x in candidates) + 1) / s.n) if s.n else 0.0
            return s.avg_reward + explore
        (t, c, m), s = max(candidates, key=score)
        return {
            "method": m, "n": s.n, "avg_reward": round(s.avg_reward, 4),
            "success_rate": round(s.success_rate, 4),
            "state": self._states.get((t, c, m), PromotionState.EXPERIMENTAL).value,
            "advisory": True,
        }

    def promote(self, task: str, content_type: str, method: str,
                to: PromotionState, force: bool = False) -> bool:
        """Explicit promotion gate. Fails without evidence unless forced (audited)."""
        key = self._key(task, content_type, method)
        with self._lock:
            st = self._stats.get(key)
            if not force and (st is None or st.n < self.MIN_SAMPLES_PROMOTION
                              or st.avg_reward < self.MIN_AVG_REWARD_PROMOTION):
                return False
            self._states[key] = to
            return True

    def state_of(self, task: str, content_type: str, method: str) -> PromotionState:
        with self._lock:
            return self._states.get(self._key(task, content_type, method),
                                    PromotionState.EXPERIMENTAL)
