"""
Laminar - Generic Async Repository
-----------------------------------

Enterprise-grade repository abstraction for SQLAlchemy 2.0 (async).

Features:
- Generic Type[T] support
- Soft delete aware
- Pagination support
- Sorting
- Filtering
- Bulk operations
- Optimistic concurrency with version check
- Multi-tenant ready
- Field selection for performance
- Validation hooks
- Production-safe error handling
"""

from typing import (
    Type,
    TypeVar,
    Generic,
    Optional,
    Sequence,
    Any,
    Dict,
    List,
    Union,
)
from uuid import UUID
from datetime import datetime

from sqlalchemy import select, update, delete, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import InstrumentedAttribute
from sqlalchemy.exc import IntegrityError

from app.models.base import BaseModel


ModelType = TypeVar("ModelType", bound=BaseModel)


class Repository(Generic[ModelType]):
    """
    Generic async repository.

    Example:
        venue_repo = Repository[Venue](Venue)
        camera_repo = Repository[Camera](Camera)
    """

    def __init__(self, model: Type[ModelType]):
        self.model = model

    # ==========================================================
    # Create
    # ==========================================================

    async def create(
        self,
        session: AsyncSession,
        obj_in: ModelType,
        *,
        validate: bool = True,
        commit: bool = False,
    ) -> ModelType:
        """
        Persist new object with optional validation.
        """
        # Run model validation if requested
        if validate and hasattr(obj_in, "validate"):
            errors = obj_in.validate()
            if errors:
                raise ValueError(f"Validation failed: {', '.join(errors)}")

        session.add(obj_in)

        if commit:
            try:
                await session.commit()
                await session.refresh(obj_in)
            except IntegrityError as e:
                await session.rollback()
                raise ValueError(f"Database integrity error: {str(e)}")

        return obj_in

    async def bulk_create(
        self,
        session: AsyncSession,
        objects: Sequence[ModelType],
        *,
        validate: bool = True,
        commit: bool = False,
    ) -> Sequence[ModelType]:
        """
        Bulk insert with optional validation.
        """
        # Validate all objects if requested
        if validate:
            for obj in objects:
                if hasattr(obj, "validate"):
                    errors = obj.validate()
                    if errors:
                        raise ValueError(
                            f"Validation failed for object: {', '.join(errors)}"
                        )

        session.add_all(objects)

        if commit:
            try:
                await session.commit()
            except IntegrityError as e:
                await session.rollback()
                raise ValueError(f"Database integrity error: {str(e)}")

        return objects

    # ==========================================================
    # Read - Single
    # ==========================================================

    async def get_by_id(
        self,
        session: AsyncSession,
        id: UUID,
        *,
        include_deleted: bool = False,
    ) -> Optional[ModelType]:
        """
        Fetch by primary key.
        """
        stmt = select(self.model).where(self.model.id == id)

        if not include_deleted and hasattr(self.model, "is_deleted"):
            stmt = stmt.where(self.model.is_deleted.isnot(True))

        result = await session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_one(
        self,
        session: AsyncSession,
        *,
        filters: Dict[str, Any],
        include_deleted: bool = False,
    ) -> Optional[ModelType]:
        """
        Fetch one record matching filters.
        """
        stmt = select(self.model)

        if not include_deleted and hasattr(self.model, "is_deleted"):
            stmt = stmt.where(self.model.is_deleted.isnot(True))

        for field_name, value in filters.items():
            column = getattr(self.model, field_name, None)
            if column is not None:
                stmt = stmt.where(column == value)

        result = await session.execute(stmt)
        return result.scalar_one_or_none()

    # ==========================================================
    # Read - Multiple
    # ==========================================================

    async def list(
        self,
        session: AsyncSession,
        *,
        tenant_id: Optional[UUID] = None,
        filters: Optional[Dict[str, Any]] = None,
        sort_by: Optional[Union[str, InstrumentedAttribute]] = None,
        descending: bool = False,
        skip: int = 0,
        limit: int = 100,
        fields: Optional[List[str]] = None,
        include_deleted: bool = False,
    ) -> List[ModelType]:
        """
        List records with filtering, sorting, pagination, and field selection.
        """
        # Handle field selection
        if fields:
            columns = [getattr(self.model, f) for f in fields]
            stmt = select(*columns)
        else:
            stmt = select(self.model)

        # Soft delete filter
        if not include_deleted and hasattr(self.model, "is_deleted"):
            stmt = stmt.where(self.model.is_deleted.isnot(True))

        # Tenant filter
        if tenant_id and hasattr(self.model, "tenant_id"):
            stmt = stmt.where(self.model.tenant_id == tenant_id)

        # Apply dynamic filters
        if filters:
            for field_name, value in filters.items():
                column = getattr(self.model, field_name, None)
                if column is not None:
                    stmt = stmt.where(column == value)

        # Sorting
        if sort_by is not None:
            # Handle string column names
            if isinstance(sort_by, str):
                sort_by = getattr(self.model, sort_by, None)

            if sort_by is not None:
                stmt = stmt.order_by(
                    sort_by.desc() if descending else sort_by.asc()
                )

        # Pagination
        stmt = stmt.offset(skip).limit(limit)

        result = await session.execute(stmt)

        if fields:
            # Return as list of tuples if field selection used
            return result.all()
        else:
            # Return model instances
            return result.scalars().all()

    async def count(
        self,
        session: AsyncSession,
        *,
        tenant_id: Optional[UUID] = None,
        filters: Optional[Dict[str, Any]] = None,
        include_deleted: bool = False,
    ) -> int:
        """
        Count records with optional filters.
        """
        stmt = select(func.count()).select_from(self.model)

        if not include_deleted and hasattr(self.model, "is_deleted"):
            stmt = stmt.where(self.model.is_deleted.is_(False))

        if tenant_id and hasattr(self.model, "tenant_id"):
            stmt = stmt.where(self.model.tenant_id == tenant_id)

        if filters:
            for field_name, value in filters.items():
                column = getattr(self.model, field_name, None)
                if column is not None:
                    stmt = stmt.where(column == value)

        result = await session.execute(stmt)
        return result.scalar_one()

    # ==========================================================
    # Update
    # ==========================================================

    async def update(
        self,
        session: AsyncSession,
        db_obj: ModelType,
        update_data: Dict[str, Any],
        *,
        expected_version: Optional[int] = None,
        validate: bool = True,
        commit: bool = False,
    ) -> ModelType:
        """
        Update existing record with optimistic concurrency control.
        """
        # Version check for optimistic locking
        if expected_version is not None and hasattr(db_obj, "version"):
            if db_obj.version != expected_version:
                raise ValueError(
                    "Object was modified by another user. "
                    f"Expected version {expected_version}, got {db_obj.version}."
                )
            update_data["version"] = db_obj.version + 1

        # Apply updates
        for field, value in update_data.items():
            if hasattr(db_obj, field):
                setattr(db_obj, field, value)

        # Validate if requested
        if validate and hasattr(db_obj, "validate"):
            errors = db_obj.validate()
            if errors:
                raise ValueError(f"Validation failed: {', '.join(errors)}")

        session.add(db_obj)

        if commit:
            try:
                await session.commit()
                await session.refresh(db_obj)
            except IntegrityError as e:
                await session.rollback()
                raise ValueError(f"Database integrity error: {str(e)}")

        return db_obj

    async def bulk_update(
        self,
        session: AsyncSession,
        ids: List[UUID],
        update_data: Dict[str, Any],
        *,
        commit: bool = False,
    ) -> int:
        """
        Bulk update multiple records by IDs.
        Returns number of records updated.
        """
        stmt = (
            update(self.model)
            .where(self.model.id.in_(ids))
            .values(**update_data)
            .returning(self.model.id)
        )

        result = await session.execute(stmt)

        if commit:
            await session.commit()

        return len(result.all())

    # ==========================================================
    # Delete
    # ==========================================================

    async def soft_delete(
        self,
        session: AsyncSession,
        db_obj: ModelType,
        *,
        commit: bool = False,
    ) -> ModelType:
        """
        Soft delete (preferred).
        """
        if not hasattr(db_obj, "is_deleted"):
            raise AttributeError("Model does not support soft delete.")

        db_obj.is_deleted = True
        db_obj.deleted_at = datetime.utcnow()

        # Track who deleted (if available)
        if hasattr(db_obj, "deleted_by") and hasattr(db_obj, "updated_by"):
            db_obj.deleted_by = db_obj.updated_by

        session.add(db_obj)

        if commit:
            await session.commit()

        return db_obj

    async def bulk_soft_delete(
        self,
        session: AsyncSession,
        ids: List[UUID],
        *,
        deleted_by: Optional[UUID] = None,
        commit: bool = False,
    ) -> int:
        """
        Soft delete multiple records by IDs.
        Returns number of records updated.
        """
        if not hasattr(self.model, "is_deleted"):
            raise AttributeError("Model does not support soft delete.")

        values = {
            "is_deleted": True,
            "deleted_at": datetime.utcnow(),
        }

        if deleted_by and hasattr(self.model, "deleted_by"):
            values["deleted_by"] = deleted_by

        stmt = (
            update(self.model)
            .where(self.model.id.in_(ids))
            .where(self.model.is_deleted.is_(False))
            .values(**values)
            .returning(self.model.id)
        )

        result = await session.execute(stmt)

        if commit:
            await session.commit()

        return len(result.all())

    async def hard_delete(
        self,
        session: AsyncSession,
        db_obj: ModelType,
        *,
        commit: bool = False,
    ) -> None:
        """
        Permanent deletion (use carefully).
        """
        await session.delete(db_obj)

        if commit:
            await session.commit()

    async def bulk_hard_delete(
        self,
        session: AsyncSession,
        ids: List[UUID],
        *,
        commit: bool = False,
    ) -> int:
        """
        Permanently delete multiple records by IDs.
        Returns number of records deleted.
        """
        stmt = (
            delete(self.model)
            .where(self.model.id.in_(ids))
            .returning(self.model.id)
        )

        result = await session.execute(stmt)

        if commit:
            await session.commit()

        return len(result.all())

    # ==========================================================
    # Exists / Helpers
    # ==========================================================

    async def exists(
        self,
        session: AsyncSession,
        *,
        filters: Dict[str, Any],
        include_deleted: bool = False,
    ) -> bool:
        """
        Check existence of record.
        """
        stmt = select(func.count()).select_from(self.model)

        if not include_deleted and hasattr(self.model, "is_deleted"):
            stmt = stmt.where(self.model.is_deleted.is_(False))

        for field_name, value in filters.items():
            column = getattr(self.model, field_name, None)
            if column is not None:
                stmt = stmt.where(column == value)

        result = await session.execute(stmt)
        return result.scalar_one() > 0

    async def get_or_create(
        self,
        session: AsyncSession,
        defaults: Optional[Dict[str, Any]] = None,
        **kwargs,
    ) -> tuple[ModelType, bool]:
        """
        Get existing record or create new one.
        Returns (instance, created_flag).
        """
        # Try to get existing
        instance = await self.get_one(session, filters=kwargs)

        if instance:
            return instance, False

        # Create new
        data = {**kwargs, **(defaults or {})}
        instance = self.model(**data)
        instance = await self.create(session, instance, commit=True)
        return instance, True

    # ==========================================================
    # Advanced Query Hook
    # ==========================================================

    async def execute(
        self,
        session: AsyncSession,
        stmt,
    ):
        """
        Execute custom statement (escape hatch).
        """
        result = await session.execute(stmt)
        return result
