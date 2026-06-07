from __future__ import annotations

from cassandra.cluster import Cluster, Session
from cassandra.policies import DCAwareRoundRobinPolicy

from config import get_settings

_session: Session | None = None


def get_session() -> Session:
    global _session
    if _session is None or _session.is_shutdown:
        _session = _connect()
    return _session


def _connect() -> Session:
    cfg = get_settings()
    cluster = Cluster(
        contact_points=cfg.cassandra_hosts,
        port=cfg.cassandra_port,
        load_balancing_policy=DCAwareRoundRobinPolicy(local_dc="datacenter1"),
        protocol_version=5,
    )
    session = cluster.connect(cfg.cassandra_keyspace)
    return session


def close_session() -> None:
    global _session
    if _session and not _session.is_shutdown:
        _session.cluster.shutdown()
    _session = None
