from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from dal.repositories import DataSourceRepository
from api.schemas import DataSourceIdPage, DataSourceDetail

router = APIRouter()


def _get_repo() -> DataSourceRepository:
    return DataSourceRepository()


@router.get(
    "/data-sources",
    response_model=DataSourceIdPage,
    summary="[Q3] List all data-source IDs (paginated)",
)
def list_data_sources(
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=200),
) -> DataSourceIdPage:
    repo = _get_repo()
    ids = repo.get_all_ids(offset=offset, limit=limit)
    return DataSourceIdPage(items=ids, offset=offset, limit=limit, total_returned=len(ids))


@router.get(
    "/data-sources/{source_id:path}",
    response_model=list[DataSourceDetail],
    summary="[Q4] Get all temporal versions of a data source",
)
def get_data_source(source_id: str) -> list[DataSourceDetail]:
    repo = _get_repo()
    versions = repo.get_by_id(source_id)
    if not versions:
        raise HTTPException(status_code=404, detail=f"Data source '{source_id}' not found")
    return [
        DataSourceDetail(
            id=v.id,
            system_date=v.system_date,
            name=v.name,
            description=v.description,
            attributes=sorted(v.attributes),
        )
        for v in versions
    ]
