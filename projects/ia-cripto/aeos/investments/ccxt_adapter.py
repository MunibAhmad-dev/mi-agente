"""CCXT exchange adapter (spec §48-49): the ONLY module that knows ccxt.

The exchange instance is injected (must be a real ccxt exchange object);
this module never constructs credentials or network defaults silently.
Every ccxt exception is wrapped into our taxonomy (§121): network =>
TRANSIENT/EXTERNAL (retryable), request/auth/insufficient-funds =>
PERMANENT/SECURITY (never retry), and the ambiguous trio (RequestTimeout /
ExchangeNotAvailable after submission / DDoSProtection) => UNKNOWN — the
order MAY exist on the venue, so the caller must fetch_order to resolve
state instead of resubmitting (§68).
"""
from __future__ import annotations

from typing import Any, Protocol

from aeos.core.resilience import ErrorClass


class ExchangeAdapterError(Exception):
    """Wrap every exchange failure with our error class attached."""

    def __init__(self, message: str, error_class: ErrorClass):
        super().__init__(message)
        self.error_class = error_class


class ExchangeLike(Protocol):
    """Structural contract: any real ccxt exchange satisfies this."""

    id: str

    def create_order(self, *args: Any, **kwargs: Any) -> dict: ...
    def fetch_order(self, order_id: str, symbol: str | None = None) -> dict: ...
    def fetch_open_orders(self, symbol: str) -> list[dict]: ...
    def fetch_closed_orders(self, symbol: str, limit: int = 20) -> list[dict]: ...
    def fetch_balance(self) -> dict: ...
    def fetch_ticker(self, symbol: str) -> dict: ...
    def amount_to_precision(self, symbol: str, amount: float) -> str: ...
    def price_to_precision(self, symbol: str, price: float) -> str: ...


# ccxt exception module names, imported lazily so the stdlib core never
# requires ccxt at import time (§8, §152: optional extra `trading`).
_CCXT_AMBIGUOUS = ("RequestTimeout", "ExchangeNotAvailable", "DDoSProtection")
_CCXT_PERMANENT = (
    "InvalidOrder", "OrderRejected", "BadSymbol", "BadResponse",
    "InsufficientFunds", "AccountSuspended", "ExchangeError",
)
_CCXT_SECURITY = ("AuthenticationError", "PermissionDenied")
_CCXT_EXTERNAL = ("NetworkError", "ExchangeUnavailable", "RateLimitExceeded")


def _ccxt():
    try:
        import ccxt  # type: ignore[import-not-found]
    except ImportError as exc:  # pragma: no cover - exercised via skip in tests
        raise ExchangeAdapterError(
            "ccxt is not installed; install the 'trading' extra (pip install -e \".[trading]\")",
            ErrorClass.PERMANENT,
        ) from exc
    return ccxt


class CcxtExchangeAdapter:
    """Real-venue adapter over an injected ccxt exchange instance."""

    def __init__(self, exchange: ExchangeLike, venue_label: str | None = None):
        if not hasattr(exchange, "create_order") or not hasattr(exchange, "id"):
            raise ExchangeAdapterError(
                "exchange must be a real ccxt exchange instance", ErrorClass.PERMANENT)
        self.x = exchange
        self.venue = venue_label or str(getattr(exchange, "id", "unknown"))

    # ---- classification (§121) ------------------------------------------
    @staticmethod
    def _map(exc: BaseException) -> ErrorClass:
        name = type(exc).__name__
        # ccxt exceptions subclass NetworkError; check ambiguity first
        if name in _CCXT_AMBIGUOUS:
            return ErrorClass.UNKNOWN
        if name in _CCXT_SECURITY:
            return ErrorClass.SECURITY
        if name in _CCXT_PERMANENT:
            return ErrorClass.PERMANENT
        if name in _CCXT_EXTERNAL:
            return ErrorClass.EXTERNAL
        return ErrorClass.INTERNAL

    def _wrap(self, exc: BaseException) -> ExchangeAdapterError:
        klass = self._map(exc)
        if klass is ErrorClass.INTERNAL:  # not a ccxt error at all
            return ExchangeAdapterError(f"{type(exc).__name__}: {exc}", klass)
        return ExchangeAdapterError(f"{type(exc).__name__}: {exc}", klass)

    # ---- operations -------------------------------------------------------
    def submit_market_order(self, *, symbol: str, side: str, qty: float,
                            client_order_id: str | None = None,
                            dry_run: bool = False) -> dict:
        """Submit a real market order. Returns the raw venue response.

        On UNKNOWN-class failures the order may exist on the venue; callers
        must resolve via fetch_order before any resubmission (§68).
        """
        params: dict[str, Any] = {}
        if client_order_id:
            # real clientOrderId support varies; ccxt maps it for major venues
            params["clientOrderId"] = client_order_id
        try:
            qty_str = self.x.amount_to_precision(symbol, qty)
        except Exception as exc:  # noqa: BLE001 - precision errors are permanent
            raise self._wrap(exc) from exc
        if dry_run:
            # validate the call shape without hitting the venue
            return {"dry_run": True, "symbol": symbol, "side": side,
                    "qty": float(qty_str), "venue": self.venue,
                    "params": params}
        try:
            order = self.x.create_order(symbol, "market", side, qty_str, None, params)
        except Exception as exc:  # noqa: BLE001 - mapped below
            raise self._wrap(exc) from exc
        if not isinstance(order, dict) or not order.get("id"):
            raise ExchangeAdapterError(
                f"venue returned no order id: {order!r}", ErrorClass.UNKNOWN)
        return dict(order)

    def fetch_open_orders(self, symbol: str) -> list[dict]:
        try:
            return [dict(o) for o in (self.x.fetch_open_orders(symbol) or [])]
        except Exception as exc:  # noqa: BLE001
            raise self._wrap(exc) from exc

    def fetch_closed_orders(self, symbol: str, limit: int = 20) -> list[dict]:
        try:
            return [dict(o) for o in (self.x.fetch_closed_orders(symbol, None, limit) or [])]
        except Exception as exc:  # noqa: BLE001
            raise self._wrap(exc) from exc

    def find_by_client_order_id(self, client_order_id: str, symbol: str) -> dict | None:
        """Resolution ladder (§68): locate an order by OUR client id on the
        venue — open orders first, then recent closed ones. Client-side match
        keeps this venue-neutral. Returns None if the venue never saw it."""
        for order in self.fetch_open_orders(symbol):
            if str(order.get("clientOrderId") or "") == client_order_id:
                return order
        for order in self.fetch_closed_orders(symbol):
            if str(order.get("clientOrderId") or "") == client_order_id:
                return order
        return None

    def fetch_order(self, exchange_order_id: str, symbol: str) -> dict:
        try:
            order = self.x.fetch_order(exchange_order_id, symbol)
        except Exception as exc:  # noqa: BLE001
            raise self._wrap(exc) from exc
        return dict(order)

    def balance(self) -> dict:
        try:
            bal = self.x.fetch_balance()
        except Exception as exc:  # noqa: BLE001
            raise self._wrap(exc) from exc
        return dict(bal)

    def ticker(self, symbol: str) -> dict:
        try:
            tick = self.x.fetch_ticker(symbol)
        except Exception as exc:  # noqa: BLE001
            raise self._wrap(exc) from exc
        return dict(tick)

    def validate_order_shape(self, *, symbol: str, side: str, qty: float) -> None:
        """Static validation before any network call (§124)."""
        parts = symbol.split("/")
        if len(parts) != 2 or not all(p.strip().isalnum() for p in parts):
            raise ExchangeAdapterError(f"invalid symbol {symbol!r}", ErrorClass.PERMANENT)
        if side not in ("buy", "sell"):
            raise ExchangeAdapterError(f"invalid side {side!r}", ErrorClass.PERMANENT)
        if qty <= 0:
            raise ExchangeAdapterError("qty must be positive", ErrorClass.PERMANENT)


def make_testnet_exchange(exchange_id: str, api_key: str, secret: str,
                          password: str | None = None) -> ExchangeLike:
    """Build a real ccxt exchange in SANDBOX mode (testnet-first rollout).

    Credentials come from the operator (env/secrets), never hard-coded (§152).
    set_sandbox_mode(True) is mandatory here: production venues are only
    reachable by constructing the exchange directly, never through this helper.
    """
    ccxt = _ccxt()
    if not hasattr(ccxt, exchange_id):
        raise ExchangeAdapterError(f"unknown exchange id {exchange_id!r}", ErrorClass.PERMANENT)
    klass = getattr(ccxt, exchange_id)
    config: dict[str, Any] = {"apiKey": api_key, "secret": secret, "enableRateLimit": True}
    if password:
        config["password"] = password
    ex = klass(config)
    ex.set_sandbox_mode(True)  # testnet by construction (§128)
    return ex
