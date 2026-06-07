from __future__ import annotations

import subprocess
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()

_SPARK_IMAGE = "apache/spark:3.5.0"
_SPARK_BIN   = "/opt/spark/bin/spark-submit"
_JAR         = "/spark-job/target/scala-2.12/financial-dw-spark-assembly-1.0.0.jar"
_SPARK_DIR   = str(Path(__file__).resolve().parents[3] / "spark")


def _docker_submit(spark_class: str, extra_args: list[str]) -> dict:
    cmd = [
        "docker", "run", "--rm",
        "-e", "CASSANDRA_HOSTS=host.docker.internal",
        "-v", f"{_SPARK_DIR}:/spark-job",
        _SPARK_IMAGE,
        _SPARK_BIN,
        "--class", spark_class,
        "--master", "local[*]",
        _JAR,
        *extra_args,
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        stdout = result.stdout[-3000:] if result.stdout else ""
        stderr = result.stderr[-2000:] if result.stderr else ""
        if result.returncode != 0:
            return {"status": "error", "returncode": result.returncode,
                    "stdout": stdout, "stderr": stderr}
        return {"status": "success", "returncode": 0, "stdout": stdout}
    except subprocess.TimeoutExpired:
        return {"status": "error", "detail": "Spark job timed out after 5 minutes"}
    except FileNotFoundError:
        return {"status": "error", "detail": "Docker not found. Make sure Docker Desktop is running."}


class SparkJobRequest(BaseModel):
    keyspace: str = "financial_dw"
    asset_id: str | None = None
    data_source_id: str | None = None


@router.post("/spark/compute-total", summary="Run Spark ComputeTotal aggregation job")
def run_compute_total(request: SparkJobRequest) -> dict:
    args = [request.keyspace]
    if request.data_source_id:
        args.append(request.data_source_id)
    result = _docker_submit("ro.uvt.info.dw.ComputeTotal", args)
    return result


@router.post("/spark/regression", summary="Run Spark LinearRegression ML job")
def run_regression(request: SparkJobRequest) -> dict:
    if not request.asset_id or not request.data_source_id:
        raise HTTPException(status_code=400, detail="asset_id and data_source_id are required")
    args = [request.keyspace, request.asset_id, request.data_source_id]
    result = _docker_submit("ro.uvt.info.dw.Regression", args)
    return result
