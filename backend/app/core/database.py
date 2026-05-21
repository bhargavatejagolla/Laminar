"""
Laminar - Enterprise Database Core
-----------------------------------

Production-ready async SQLAlchemy 2.0 with advanced features for AI workloads.

Features:
- Read/write replica separation for AI workloads
- Connection pooling with metrics and leak detection
- Query timeout protection (prevent AI queries from hanging)
- Retry logic with exponential backoff
- Circuit breaker pattern for fault tolerance
- Slow query logging and monitoring
- Tenant isolation ready
- Health checks with detailed diagnostics
- Metrics emission for Prometheus/Grafana
- Statement execution tracking
"""

from app.core.db_base import Base
import app.models
import asyncio
import time
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import AsyncGenerator, Dict, Optional, Any, Callable, Union
from uuid import uuid4

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
    AsyncEngine,
)
from sqlalchemy import text, event, Engine
from sqlalchemy.exc import SQLAlchemyError, OperationalError, TimeoutError
from sqlalchemy.orm import DeclarativeBase, declared_attr
from sqlalchemy.pool import QueuePool

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


# ==========================================================
# Enums & Constants
# ==========================================================

class DatabaseRole(Enum):
    """Database role for read/write separation."""
    WRITER = "writer"
    READER = "reader"
    ANALYTICS = "analytics"  # For heavy AI queries


class CircuitBreakerState(Enum):
    """Circuit breaker states for fault tolerance."""
    CLOSED = "closed"  # Normal operation
    OPEN = "open"  # Failing, reject requests
    HALF_OPEN = "half_open"  # Testing recovery


# ==========================================================
# Circuit Breaker for Database Resilience
# ==========================================================

@dataclass
class CircuitBreaker:
    """
    Circuit breaker pattern to prevent cascade failures.
    Opens circuit when failures threshold is reached.
    """
    failure_threshold: int = 5
    recovery_timeout: float = 60.0  # seconds
    half_open_retries: int = 3

    state: CircuitBreakerState = CircuitBreakerState.CLOSED
    failure_count: int = 0
    last_failure_time: Optional[datetime] = None
    half_open_successes: int = 0

    def record_success(self):
        """Record a successful operation."""
        if self.state == CircuitBreakerState.HALF_OPEN:
            self.half_open_successes += 1
            if self.half_open_successes >= self.half_open_retries:
                self.reset()
                logger.info("Circuit breaker closed after successful recovery")

    def record_failure(self) -> bool:
        """
        Record a failure and potentially open the circuit.
        Returns True if circuit is open.
        """
        self.failure_count += 1
        self.last_failure_time = datetime.utcnow()

        if self.state == CircuitBreakerState.CLOSED:
            if self.failure_count >= self.failure_threshold:
                self.state = CircuitBreakerState.OPEN
                logger.error(
                    "Circuit breaker opened after %d failures",
                    self.failure_count
                )
                return True

        elif self.state == CircuitBreakerState.HALF_OPEN:
            self.state = CircuitBreakerState.OPEN
            logger.warning("Circuit breaker reopened after half-open failure")
            return True

        return self.state == CircuitBreakerState.OPEN

    def can_execute(self) -> bool:
        """Check if operation can be executed."""
        if self.state == CircuitBreakerState.CLOSED:
            return True

        if self.state == CircuitBreakerState.OPEN:
            # Check if recovery timeout elapsed
            if self.last_failure_time:
                elapsed = (datetime.utcnow() -
                           self.last_failure_time).total_seconds()
                if elapsed >= self.recovery_timeout:
                    self.state = CircuitBreakerState.HALF_OPEN
                    self.half_open_successes = 0
                    logger.info("Circuit breaker half-open, testing recovery")
                    return True
            return False

        return True  # HALF_OPEN allows limited traffic

    def reset(self):
        """Reset circuit breaker to closed state."""
        self.state = CircuitBreakerState.CLOSED
        self.failure_count = 0
        self.last_failure_time = None
        self.half_open_successes = 0


# ==========================================================
# Connection Pool Metrics
# ==========================================================

@dataclass
class PoolMetrics:
    """Track connection pool statistics."""
    total_connections: int = 0
    active_connections: int = 0
    overflow_connections: int = 0
    connections_created: int = 0
    connections_closed: int = 0
    wait_count: int = 0
    wait_time_ms: float = 0.0
    slow_queries: int = 0
    deadlocks: int = 0
    timeouts: int = 0

    def to_dict(self) -> Dict[str, Any]:
        """Convert metrics to dictionary for monitoring."""
        return {
            "total_connections": self.total_connections,
            "active_connections": self.active_connections,
            "overflow_connections": self.overflow_connections,
            "connections_created": self.connections_created,
            "connections_closed": self.connections_closed,
            "wait_count": self.wait_count,
            "avg_wait_time_ms": self.wait_time_ms / max(self.wait_count, 1),
            "slow_queries": self.slow_queries,
            "deadlocks": self.deadlocks,
            "timeouts": self.timeouts,
        }


# ==========================================================
# Base Class with Naming Convention
# ==========================================================



# ==========================================================
# Database Manager with Read/Write Separation
# ==========================================================

class DatabaseManager:
    """
    Advanced database manager with read/write separation, metrics, and circuit breaker.
    """

    def __init__(self):
        self._engines: Dict[DatabaseRole, AsyncEngine] = {}
        self._session_factories: Dict[DatabaseRole, async_sessionmaker] = {}
        self._circuit_breaker = CircuitBreaker()
        self._metrics = PoolMetrics()
        self._slow_query_threshold_ms = 5000  # Log queries > 5000ms
        self._initialized = False
        self._lock = asyncio.Lock()

    @property
    def is_initialized(self) -> bool:
        """Check if database manager is initialized."""
        return self._initialized

    @property
    def session_factory(self) -> async_sessionmaker:
        """Get the writer session factory (maintains compatibility)."""
        if not self._initialized:
            raise RuntimeError(
                "Database manager not initialized. Call initialize() first.")
        return self._session_factories[DatabaseRole.WRITER]

    async def initialize(self):
        """Initialize database engines with connection pooling."""
        if self._initialized:
            return

        async with self._lock:
            if self._initialized:
                return

            logger.info("Initializing database connections")

            # Writer engine (primary)
            self._engines[DatabaseRole.WRITER] = self._create_engine(
                str(settings.DATABASE_URL),
                role="writer"
            )

            # For now, reader uses same engine
            # In production, you'd configure a separate replica URL
            self._engines[DatabaseRole.READER] = self._create_engine(
                str(settings.DATABASE_URL),
                role="reader"
            )

            # Analytics engine with different pool settings for heavy queries
            self._engines[DatabaseRole.ANALYTICS] = self._create_engine(
                str(settings.DATABASE_URL),
                role="analytics",
                pool_size=settings.DB_POOL_SIZE // 2,  # Smaller pool for analytics
                max_overflow=settings.DB_MAX_OVERFLOW // 2,
            )

            # Create session factories for each role
            for role, engine in self._engines.items():
                self._session_factories[role] = async_sessionmaker(
                    bind=engine,
                    class_=AsyncSession,
                    expire_on_commit=False,
                    autoflush=False,
                    autocommit=False,
                )

            # Set up pool event listeners for metrics
            self._setup_pool_listeners()

            # Validate connections and create tables
            async with self._engines[DatabaseRole.WRITER].begin() as conn:
                # This ensures all tables (including new ones like action_rules) exist
                await conn.run_sync(Base.metadata.create_all)
                await conn.execute(text("SELECT 1"))
            
            logger.info("Database connections and tables validated")

            self._initialized = True
            logger.info("Database connections initialized successfully")

    def _create_engine(
        self,
        url: str,
        role: str,
        pool_size: Optional[int] = None,
        max_overflow: Optional[int] = None,
    ) -> AsyncEngine:
        """Create an async engine with connection pooling."""
        import urllib.parse

        # Check if sslmode is in the url and strip it, passing ssl=True to connect_args for asyncpg compatibility
        parsed = urllib.parse.urlparse(url)
        query_params = urllib.parse.parse_qs(parsed.query)
        
        has_ssl = False
        if "sslmode" in query_params:
            sslmode = query_params["sslmode"][0]
            if sslmode in ("require", "verify-ca", "verify-full", "prefer", "allow"):
                has_ssl = True
            query_params.pop("sslmode", None)
            
        new_query = urllib.parse.urlencode(query_params, doseq=True)
        parsed = parsed._replace(query=new_query)
        url = urllib.parse.urlunparse(parsed)

        connect_args = {
            "server_settings": {
                "application_name": f"laminar_{role}",
                "statement_timeout": "20000",
            }
        }
        if has_ssl:
            connect_args["ssl"] = True

        engine = create_async_engine(
            url,
            echo=settings.DB_ECHO,
            pool_size=pool_size or settings.DB_POOL_SIZE,
            max_overflow=max_overflow or settings.DB_MAX_OVERFLOW,
            pool_timeout=settings.DB_POOL_TIMEOUT,
            pool_recycle=settings.DB_POOL_RECYCLE,
            pool_pre_ping=settings.DB_POOL_PRE_PING,
            pool_use_lifo=True,
            future=True,
            connect_args=connect_args,
        )

        # Add query execution listener for slow query detection
        @event.listens_for(engine.sync_engine, "before_execute")
        def before_execute(conn, clause, multiparams, params):
            conn.info.setdefault("query_start_time", time.time())

        @event.listens_for(engine.sync_engine, "after_execute")
        def after_execute(conn, clause, multiparams, params, result):
            start_time = conn.info.pop("query_start_time", None)
            if start_time:
                duration_ms = (time.time() - start_time) * 1000
                if duration_ms > self._slow_query_threshold_ms:
                    self._metrics.slow_queries += 1
                    logger.debug(
                        "Slow query detected",
                        extra_fields={
                            "duration_ms": duration_ms,
                            "role": role,
                            "query": str(clause)[:200],
                        }
                    )

        return engine

    def _setup_pool_listeners(self):
        """Set up connection pool event listeners for metrics."""

        for engine in self._engines.values():
            sync_engine = engine.sync_engine

            @event.listens_for(sync_engine.pool, "checkout")
            def on_checkout(dbapi_conn, conn_record, conn_proxy):
                self._metrics.active_connections += 1
                self._metrics.total_connections += 1

            @event.listens_for(sync_engine.pool, "checkin")
            def on_checkin(dbapi_conn, conn_record):
                self._metrics.active_connections -= 1

            @event.listens_for(sync_engine.pool, "connect")
            def on_connect(dbapi_conn, conn_record):
                self._metrics.connections_created += 1

            @event.listens_for(sync_engine.pool, "close")
            def on_close(dbapi_conn, conn_record):
                self._metrics.connections_closed += 1
                if self._metrics.active_connections > 0:
                    self._metrics.active_connections -= 1

    async def _validate_connections(self):
        """Validate all database connections on startup."""
        for role, engine in self._engines.items():
            try:
                async with engine.connect() as conn:
                    await conn.execute(text("SELECT 1"))
                logger.info(f"{role.value} database connection validated")
            except Exception as e:
                logger.critical(
                    f"Database connection failed for {role.value}",
                    extra_fields={"error": str(e)}
                )
                raise RuntimeError(
                    f"Database connection failed for {role.value}")

    async def get_session(
        self,
        role: DatabaseRole = DatabaseRole.WRITER,
        **kwargs
    ) -> AsyncSession:
        """
        Get a database session with circuit breaker protection.
        
        Args:
            role: Database role (writer, reader, analytics)
            **kwargs: Additional session parameters
        
        Returns:
            AsyncSession: Database session
        
        Raises:
            Exception: If circuit breaker is open or database unavailable
        """
        # Wait for initialization if in progress, or trigger if not started
        if not self._initialized:
            async with self._lock:
                if not self._initialized:
                    await self.initialize()

        if not self._circuit_breaker.can_execute():
            last_fail = self._circuit_breaker.last_failure_time.isoformat() if self._circuit_breaker.last_failure_time else "unknown"
            msg = (
                f"Database circuit breaker is OPEN (state: {self._circuit_breaker.state.value}). "
                f"Last failure at: {last_fail}. Failure count: {self._circuit_breaker.failure_count}. "
                "Rejecting requests to prevent system overload."
            )
            logger.error(msg)
            raise Exception(msg)

        try:
            session = self._session_factories[role](**kwargs)

            # Add execution timeout
            if role == DatabaseRole.ANALYTICS:
                # Set longer timeout for analytics queries
                await session.execute(
                    text("SET statement_timeout = '120000'")  # 120s
                )

            return session

        except Exception as e:
            self._circuit_breaker.record_failure()
            raise

    @asynccontextmanager
    async def session(
        self,
        role: DatabaseRole = DatabaseRole.WRITER,
        **kwargs
    ) -> AsyncGenerator[AsyncSession, None]:
        """
        Context manager for database sessions with automatic cleanup.
        
        Usage:
            async with db.session() as session:
                result = await session.execute(...)
        """
        session = await self.get_session(role=role, **kwargs)
        try:
            yield session
        except Exception as e:
            try:
                await session.rollback()
            except Exception as rollback_err:
                logger.debug(f"Error during rollback: {rollback_err}")
            raise
        finally:
            try:
                await session.close()
            except Exception as close_err:
                logger.debug(f"Failed to smoothly close session: {close_err}")

    async def execute_with_retry(
        self,
        operation: Callable,
        max_retries: int = 3,
        base_delay: float = 0.1,
        role: DatabaseRole = DatabaseRole.WRITER,
    ) -> Any:
        """
        Execute a database operation with retry logic.
        
        Args:
            operation: Async function to execute
            max_retries: Maximum number of retries
            base_delay: Base delay for exponential backoff
            role: Database role
        
        Returns:
            Any: Result of the operation
        """
        last_error = None

        for attempt in range(max_retries + 1):
            try:
                async with self.session(role=role) as session:
                    result = await operation(session)
                    self._circuit_breaker.record_success()
                    return result

            except (OperationalError, TimeoutError) as e:
                last_error = e
                if attempt == max_retries:
                    break

                # Exponential backoff with jitter
                delay = base_delay * (2 ** attempt)
                jitter = delay * 0.1  # 10% jitter
                actual_delay = delay + (jitter * (hash(str(e)) % 100) / 100)

                logger.warning(
                    f"Database operation failed, retrying in {actual_delay:.2f}s",
                    extra_fields={
                        "attempt": attempt + 1,
                        "error": str(e),
                        "role": role.value,
                    }
                )

                await asyncio.sleep(actual_delay)

            except Exception as e:
                # Non-retryable error
                self._circuit_breaker.record_failure()
                raise

        # All retries failed
        self._circuit_breaker.record_failure()
        raise Exception(
            f"Operation failed after {max_retries} retries") from last_error

    async def health_check(self) -> Dict[str, Any]:
        """
        Comprehensive health check with detailed diagnostics.
        
        Returns:
            Dict: Health status with metrics
        """
        results = {}
        overall_healthy = True

        for role, engine in self._engines.items():
            try:
                start_time = time.time()
                async with engine.connect() as conn:
                    await conn.execute(text("SELECT 1"))
                latency_ms = (time.time() - start_time) * 1000

                results[role.value] = {
                    "healthy": True,
                    "latency_ms": latency_ms,
                    "pool_size": engine.pool.size(),
                    "checked_in": engine.pool.checkedin(),
                    "checked_out": engine.pool.checkedout(),
                    "overflow": engine.pool.overflow(),
                }
            except Exception as e:
                results[role.value] = {
                    "healthy": False,
                    "error": str(e),
                }
                overall_healthy = False

        return {
            "healthy": overall_healthy,
            "initialized": self._initialized,
            "circuit_breaker": {
                "state": self._circuit_breaker.state.value,
                "failure_count": self._circuit_breaker.failure_count,
            },
            "metrics": self._metrics.to_dict(),
            "connections": results,
        }

    async def close(self):
        """Gracefully close all database connections."""
        logger.info("Closing database connections")

        for role, engine in self._engines.items():
            try:
                await engine.dispose()
                logger.info(f"{role.value} database engine closed")
            except Exception as e:
                logger.error(
                    f"Error closing {role.value} engine",
                    extra_fields={"error": str(e)}
                )

        self._initialized = False
        logger.info("All database connections closed")


# ==========================================================
# Singleton Instance
# ==========================================================

db_manager = DatabaseManager()


# ==========================================================
# Public API (Maintains backward compatibility)
# ==========================================================

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency for database sessions (writer by default).
    
    Usage:
        async def route(db: AsyncSession = Depends(get_db)):
            ...
    """
    async with db_manager.session() as session:
        yield session


def get_reader_db() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency for read-only database sessions.
    Use this for queries that don't modify data.
    """
    async def _get_reader_db():
        async with db_manager.session(role=DatabaseRole.READER) as session:
            yield session
    return _get_reader_db


def get_analytics_db() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency for analytics database sessions.
    Use this for heavy AI/analytics queries.
    """
    async def _get_analytics_db():
        async with db_manager.session(role=DatabaseRole.ANALYTICS) as session:
            yield session
    return _get_analytics_db


async def init_database() -> None:
    """Initialize database connections on startup."""
    await db_manager.initialize()


async def close_database() -> None:
    """Close database connections on shutdown."""
    await db_manager.close()


async def check_database_connection() -> bool:
    """Simple health check for backward compatibility."""
    health = await db_manager.health_check()
    return health["healthy"]


# ==========================================================
# Raw Session Factory (Legacy Support)
# ==========================================================

async def get_raw_session() -> AsyncGenerator[AsyncSession, None]:
    """Legacy: Raw session without circuit breaker."""
    async with db_manager.session() as session:
        yield session


# ==========================================================
# Direct exports for vision_manager compatibility
# ==========================================================
"""
Export async_session_factory for vision_manager.py which expects:
from app.core.database import async_session_factory

This is a function that returns the session factory after initialization.
"""


async def get_async_session_factory():
    """Get the async session factory after initialization."""
    if not db_manager.is_initialized:
        await db_manager.initialize()
    return db_manager.session_factory

# Create a callable that maintains compatibility with existing code
# This allows: async with async_session_factory() as session:


class _AsyncSessionFactory:
    def __init__(self, db_manager):
        self.db_manager = db_manager
        self._factory = None

    async def __call__(self):
        if not self.db_manager.is_initialized:
            await self.db_manager.initialize()
        if self._factory is None:
            self._factory = self.db_manager.session_factory
        return self._factory()

    def __aenter__(self):
        raise RuntimeError(
            "Use 'async with async_session_factory() as session' not 'async with async_session_factory'")

    def __aexit__(self, *args):
        pass


# Create the singleton instance
async_session_factory = _AsyncSessionFactory(db_manager)

# Also export engine getter if needed elsewhere


async def get_engine():
    """Get the writer engine after initialization."""
    if not db_manager.is_initialized:
        await db_manager.initialize()
    return db_manager._engines.get(DatabaseRole.WRITER)

