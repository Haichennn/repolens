"""
Mock data for Repolens MCP server.

In V1 we ship with hardcoded data to keep the demo reliable and deterministic.
In V2, swap these dicts for real NVD API + npm/PyPI registry calls.
"""

# CVE Database: package name + version → list of vulnerabilities
# Format mirrors NVD (National Vulnerability Database) entries
CVE_DATABASE: dict[str, list[dict]] = {
    "lodash": [
        {
            "cve_id": "CVE-2021-23337",
            "affected_versions": "<4.17.21",
            "severity": "HIGH",
            "cvss_score": 7.2,
            "description": "Command injection via template function",
            "fixed_in": "4.17.21",
            "published": "2021-02-15",
        },
        {
            "cve_id": "CVE-2020-8203",
            "affected_versions": "<4.17.19",
            "severity": "HIGH",
            "cvss_score": 7.4,
            "description": "Prototype pollution in zipObjectDeep",
            "fixed_in": "4.17.19",
            "published": "2020-07-15",
        },
    ],
    "axios": [
        {
            "cve_id": "CVE-2023-45857",
            "affected_versions": ">=0.8.1,<1.6.0",
            "severity": "MEDIUM",
            "cvss_score": 6.5,
            "description": "Cross-site request forgery via XSRF token leakage",
            "fixed_in": "1.6.0",
            "published": "2023-11-08",
        },
    ],
    "requests": [
        {
            "cve_id": "CVE-2023-32681",
            "affected_versions": "<2.31.0",
            "severity": "MEDIUM",
            "cvss_score": 6.1,
            "description": "Proxy-Authorization header leak on cross-origin redirect",
            "fixed_in": "2.31.0",
            "published": "2023-05-26",
        },
    ],
    "django": [
        {
            "cve_id": "CVE-2024-27351",
            "affected_versions": "<3.2.25",
            "severity": "MEDIUM",
            "cvss_score": 5.3,
            "description": "Regex denial of service in truncatechars_html filter",
            "fixed_in": "3.2.25",
            "published": "2024-03-04",
        },
    ],
    "flask": [
        {
            "cve_id": "CVE-2023-30861",
            "affected_versions": "<2.2.5",
            "severity": "HIGH",
            "cvss_score": 7.5,
            "description": "Session cookie can be leaked via caching proxies",
            "fixed_in": "2.2.5",
            "published": "2023-05-02",
        },
    ],
    "pillow": [
        {
            "cve_id": "CVE-2023-50447",
            "affected_versions": "<10.2.0",
            "severity": "HIGH",
            "cvss_score": 8.1,
            "description": "Arbitrary code execution via PIL.ImageMath.eval",
            "fixed_in": "10.2.0",
            "published": "2024-01-19",
        },
    ],
    "pyyaml": [
        {
            "cve_id": "CVE-2020-14343",
            "affected_versions": "<5.4",
            "severity": "CRITICAL",
            "cvss_score": 9.8,
            "description": "Arbitrary code execution via full_load when loading untrusted YAML",
            "fixed_in": "5.4",
            "published": "2021-02-09",
        },
    ],
    "tensorflow": [
        {
            "cve_id": "CVE-2023-25668",
            "affected_versions": "<2.11.1",
            "severity": "HIGH",
            "cvss_score": 8.1,
            "description": "Integer overflow in Audio operation",
            "fixed_in": "2.11.1",
            "published": "2023-03-25",
        },
    ],
    "next": [
        {
            "cve_id": "CVE-2024-34351",
            "affected_versions": ">=13.4.0,<14.1.1",
            "severity": "MEDIUM",
            "cvss_score": 6.5,
            "description": "Server-side request forgery via Server Actions",
            "fixed_in": "14.1.1",
            "published": "2024-05-09",
        },
    ],
    "express": [
        {
            "cve_id": "CVE-2024-29041",
            "affected_versions": "<4.19.2",
            "severity": "MEDIUM",
            "cvss_score": 6.1,
            "description": "Open redirect vulnerability in Express",
            "fixed_in": "4.19.2",
            "published": "2024-03-25",
        },
    ],
    # Packages with NO known vulnerabilities (for negative test cases)
    "fastapi": [],
    "react": [],
    "pydantic": [],
    "langchain": [],
}


# Package Registry: package name → metadata
# Format mirrors npm registry + PyPI metadata
PACKAGE_REGISTRY: dict[str, dict] = {
    "lodash": {
        "ecosystem": "npm",
        "latest_version": "4.17.21",
        "license": "MIT",
        "weekly_downloads": 52_000_000,
        "maintainer_count": 12,
        "last_publish": "2021-02-20",
        "deprecated": False,
    },
    "axios": {
        "ecosystem": "npm",
        "latest_version": "1.7.7",
        "license": "MIT",
        "weekly_downloads": 48_000_000,
        "maintainer_count": 8,
        "last_publish": "2024-09-12",
        "deprecated": False,
    },
    "requests": {
        "ecosystem": "PyPI",
        "latest_version": "2.32.3",
        "license": "Apache-2.0",
        "weekly_downloads": 280_000_000,
        "maintainer_count": 25,
        "last_publish": "2024-05-29",
        "deprecated": False,
    },
    "django": {
        "ecosystem": "PyPI",
        "latest_version": "5.0.6",
        "license": "BSD-3-Clause",
        "weekly_downloads": 12_000_000,
        "maintainer_count": 50,
        "last_publish": "2024-06-04",
        "deprecated": False,
    },
    "flask": {
        "ecosystem": "PyPI",
        "latest_version": "3.0.3",
        "license": "BSD-3-Clause",
        "weekly_downloads": 22_000_000,
        "maintainer_count": 18,
        "last_publish": "2024-04-04",
        "deprecated": False,
    },
    "pillow": {
        "ecosystem": "PyPI",
        "latest_version": "10.4.0",
        "license": "HPND",
        "weekly_downloads": 24_000_000,
        "maintainer_count": 15,
        "last_publish": "2024-07-01",
        "deprecated": False,
    },
    "pyyaml": {
        "ecosystem": "PyPI",
        "latest_version": "6.0.2",
        "license": "MIT",
        "weekly_downloads": 35_000_000,
        "maintainer_count": 6,
        "last_publish": "2024-08-06",
        "deprecated": False,
    },
    "tensorflow": {
        "ecosystem": "PyPI",
        "latest_version": "2.17.0",
        "license": "Apache-2.0",
        "weekly_downloads": 25_000_000,
        "maintainer_count": 40,
        "last_publish": "2024-07-12",
        "deprecated": False,
    },
    "next": {
        "ecosystem": "npm",
        "latest_version": "14.2.5",
        "license": "MIT",
        "weekly_downloads": 6_500_000,
        "maintainer_count": 30,
        "last_publish": "2024-07-31",
        "deprecated": False,
    },
    "express": {
        "ecosystem": "npm",
        "latest_version": "4.21.0",
        "license": "MIT",
        "weekly_downloads": 32_000_000,
        "maintainer_count": 20,
        "last_publish": "2024-09-11",
        "deprecated": False,
    },
    "fastapi": {
        "ecosystem": "PyPI",
        "latest_version": "0.115.0",
        "license": "MIT",
        "weekly_downloads": 8_500_000,
        "maintainer_count": 15,
        "last_publish": "2024-09-17",
        "deprecated": False,
    },
    "react": {
        "ecosystem": "npm",
        "latest_version": "19.0.0",
        "license": "MIT",
        "weekly_downloads": 28_000_000,
        "maintainer_count": 45,
        "last_publish": "2024-12-05",
        "deprecated": False,
    },
    "pydantic": {
        "ecosystem": "PyPI",
        "latest_version": "2.9.2",
        "license": "MIT",
        "weekly_downloads": 220_000_000,
        "maintainer_count": 10,
        "last_publish": "2024-09-19",
        "deprecated": False,
    },
    "langchain": {
        "ecosystem": "PyPI",
        "latest_version": "0.3.0",
        "license": "MIT",
        "weekly_downloads": 6_800_000,
        "maintainer_count": 35,
        "last_publish": "2024-09-15",
        "deprecated": False,
    },
    # Examples of deprecated / abandoned packages for negative testing
    "request": {  # the legacy "request" library, deprecated
        "ecosystem": "npm",
        "latest_version": "2.88.2",
        "license": "Apache-2.0",
        "weekly_downloads": 9_500_000,  # still high despite deprecation
        "maintainer_count": 2,
        "last_publish": "2020-02-11",
        "deprecated": True,
    },
}


def lookup_cves(package_name: str, version: str | None = None) -> list[dict]:
    """
    Look up CVEs for a package, optionally filtered by version.

    For V1 mock data we return ALL CVEs for the package regardless of version,
    plus the affected_versions string so the LLM can reason about applicability.
    A V2 implementation would parse semver ranges and filter precisely.
    """
    pkg = package_name.lower().strip()
    return CVE_DATABASE.get(pkg, [])


def lookup_package(package_name: str) -> dict | None:
    """Look up registry metadata for a package."""
    pkg = package_name.lower().strip()
    return PACKAGE_REGISTRY.get(pkg)
