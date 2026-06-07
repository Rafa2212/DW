from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from dal.repositories import AssetRepository
from api.schemas import AssetIdPage, AssetDetail

router = APIRouter()


def _get_repo() -> AssetRepository:
    return AssetRepository()


@router.get(
    "/assets",
    response_model=AssetIdPage,
    summary="[Q1] List all asset IDs (paginated)",
)
def list_assets(
    offset: int = Query(default=0, ge=0, description="Starting position"),
    limit: int = Query(default=20, ge=1, le=200, description="Page size"),
) -> AssetIdPage:
    repo = _get_repo()
    ids = repo.get_all_ids(offset=offset, limit=limit)
    return AssetIdPage(items=ids, offset=offset, limit=limit, total_returned=len(ids))


@router.get(
    "/assets/{asset_id:path}",
    response_model=list[AssetDetail],
    summary="[Q2] Get all temporal versions of an asset",
)
def get_asset(asset_id: str) -> list[AssetDetail]:
    repo = _get_repo()
    versions = repo.get_by_id(asset_id)
    if not versions:
        raise HTTPException(status_code=404, detail=f"Asset '{asset_id}' not found")
    return [
        AssetDetail(
            id=v.id,
            system_date=v.system_date,
            name=v.name,
            description=v.description,
            attributes=v.attributes,
        )
        for v in versions
    ]
