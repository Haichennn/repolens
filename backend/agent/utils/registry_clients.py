from __future__ import annotations

import asyncio
from datetime import datetime
from typing import Any, Literal

import httpx


PYPI_API_URL = "https://pypi.org/pypi/{package}/json"
PYPI_STATS_URL = "https://pypistats.org/api/packages/{package}/recent"
NPM_API_URL = "https://registry.npmjs.org/{package}"
NPM_STATS_URL = "https://api.npmjs.org/downloads/point/last-month/{package}"


# ─────────── PyPI ───────────


def _extract_license_from_pypi(info: dict) -> str | None:
    # Try free-text license field first
    license_text = info.get("license")
    if license_text and license_text.strip():
        return license_text.strip()

    # Fall back to classifiers (PEP 639 / Trove)
    classifiers = info.get("classifiers", [])
    for c in classifiers:
        if c.startswith("License :: OSI Approved ::"):
            # "License :: OSI Approved :: MIT License" → "MIT License"
            return c.replace("License :: OSI Approved :: ", "").strip()
        if c.startswith("License ::"):
            return c.replace("License :: ", "").strip()

    return None


async def fetch_pypi(package_name: str, client: httpx.AsyncClient) -> dict[str, Any]:
    """Fetch package metadata + downloads from PyPI in parallel. Returns normalized dict."""

    async def _metadata():
        try:
            r = await client.get(PYPI_API_URL.format(package=package_name), timeout=10.0)
            return r.json() if r.status_code == 200 else None
        except Exception:
            return None

    async def _downloads():
        try:
            r = await client.get(PYPI_STATS_URL.format(package=package_name), timeout=10.0)
            if r.status_code == 200:
                return r.json().get("data", {}).get("last_month")
        except Exception:
            pass
        return None

    metadata, downloads = await asyncio.gather(_metadata(), _downloads())

    if not metadata:
        return {"monthly_downloads": downloads}

    info = metadata.get("info", {})
    releases = metadata.get("releases", {})

    last_release_date = None
    days_since = None
    for version, files in releases.items():
        if files:
            upload_time = files[0].get("upload_time_iso_8601")
            if upload_time:
                try:
                    dt = datetime.fromisoformat(upload_time.rstrip("Z"))
                    if last_release_date is None or dt > last_release_date:
                        last_release_date = dt
                except Exception:
                    pass

    if last_release_date:
        days_since = (datetime.utcnow() - last_release_date).days

    return {
        "license": _extract_license_from_pypi(info),
        "last_release_date": last_release_date.date().isoformat() if last_release_date else None,
        "days_since_last_release": days_since,
        "summary": info.get("summary"),
        "monthly_downloads": downloads,
    }


# ─────────── npm ───────────


async def fetch_npm(package_name: str, client: httpx.AsyncClient) -> dict[str, Any]:
    """Fetch package metadata + downloads from npm registry in parallel."""

    async def _metadata():
        try:
            r = await client.get(NPM_API_URL.format(package=package_name), timeout=10.0)
            return r.json() if r.status_code == 200 else None
        except Exception:
            return None

    async def _downloads():
        try:
            r = await client.get(NPM_STATS_URL.format(package=package_name), timeout=10.0)
            if r.status_code == 200:
                return r.json().get("downloads")
        except Exception:
            pass
        return None

    metadata, downloads = await asyncio.gather(_metadata(), _downloads())

    if not metadata:
        return {"monthly_downloads": downloads}

    # Last release date is in "time.modified" or latest version's release time
    time_data = metadata.get("time", {})
    last_release_date = None
    days_since = None
    if time_data:
        # Try modified or latest tagged release
        latest_tag = metadata.get("dist-tags", {}).get("latest")
        latest_release_iso = time_data.get(latest_tag) or time_data.get("modified")
        if latest_release_iso:
            try:
                dt = datetime.fromisoformat(latest_release_iso.replace("Z", "+00:00"))
                last_release_date = dt
                days_since = (datetime.utcnow().replace(tzinfo=dt.tzinfo) - dt).days
            except Exception:
                pass

    license_info = metadata.get("license")
    if isinstance(license_info, dict):
        license_info = license_info.get("type")

    return {
        "license": license_info,
        "last_release_date": last_release_date.date().isoformat() if last_release_date else None,
        "days_since_last_release": days_since,
        "summary": metadata.get("description"),
        "monthly_downloads": downloads,
    }


# ─────────── Helpers ───────────


def classify_popularity(
    monthly_downloads: int | None, ecosystem: Literal["pypi", "npm"]
) -> str:
    """Tier classification — different thresholds for pypi vs npm (npm is much higher volume)."""
    if monthly_downloads is None:
        return "unknown"

    if ecosystem == "npm":
        if monthly_downloads >= 50_000_000:
            return "very_high"
        if monthly_downloads >= 5_000_000:
            return "high"
        if monthly_downloads >= 500_000:
            return "medium"
        return "low"
    else:  # pypi
        if monthly_downloads >= 10_000_000:
            return "very_high"
        if monthly_downloads >= 1_000_000:
            return "high"
        if monthly_downloads >= 100_000:
            return "medium"
        return "low"


def is_commercial_compatible(license_str: str | None) -> bool | None:
    """Heuristic for commercial compatibility."""
    if not license_str:
        return None

    license_lower = license_str.lower()

    permissive = ["mit", "apache", "bsd", "isc", "python software foundation", "psf", "unlicense", "0bsd"]
    if any(p in license_lower for p in permissive):
        return True

    copyleft = ["gpl", "agpl", "lgpl", "mpl-2.0 strong"]
    if any(c in license_lower for c in copyleft):
        return False

    return None
