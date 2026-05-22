from __future__ import annotations

from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field


class Severity(str, Enum):
    GOOD = "good"
    WARNING = "warning"
    CRITICAL = "critical"


class AuditResult(BaseModel):
    dimension: str = Field(
        description="Name of the audit dimension, e.g. 'documentation'"
    )
    score: int = Field(
        ge=0,
        le=100,
        description="Score from 0 to 100 where 100 is best",
    )
    severity: Severity = Field(description="Overall severity classification")
    summary: str = Field(description="One-sentence overall assessment")
    findings: list[str] = Field(
        description="Specific observations from the repo, both positive and negative"
    )
    recommendations: list[str] = Field(
        description="Actionable suggestions to improve this dimension"
    )


class DocumentationAudit(AuditResult):
    pass


class ArchitectureAudit(AuditResult):
    detected_languages: list[str] = Field(
        default_factory=list,
        description="Programming languages detected from file extensions and config files",
    )
    primary_framework: str | None = Field(
        default=None,
        description=(
            "Main framework or stack identifier, e.g. 'Next.js + FastAPI', "
            "'Django monolith', 'Spring Boot'. None if unclear."
        ),
    )
    has_tests_folder: bool = Field(
        default=False,
        description="Whether the repo contains a recognizable tests directory",
    )
    has_ci_config: bool = Field(
        default=False,
        description=(
            "Whether the repo has CI/CD configuration (e.g. .github/workflows, "
            ".gitlab-ci.yml, .circleci/)"
        ),
    )


class MaintenanceAudit(AuditResult):
    days_since_last_commit: int | None = Field(
        default=None,
        description="Number of days since the most recent commit",
    )
    commits_last_90_days: int = Field(
        default=0,
        description="Commit count over the past 90 days",
    )
    top_contributor_share: float | None = Field(
        default=None,
        description=(
            "Fraction (0-1) of commits by the top contributor across the "
            "project's history. High share suggests bus factor risk."
        ),
    )
    total_contributors: int = Field(
        default=0,
        description="Total number of unique contributors",
    )
    open_issues_count: int = Field(
        default=0,
        description="Number of currently open issues",
    )
    has_recent_releases: bool = Field(
        default=False,
        description="Whether at least one release exists in the past 12 months",
    )
    stars: int = Field(
        default=0,
        description="GitHub stars (popularity context, not part of score)",
    )
    forks: int = Field(
        default=0,
        description="GitHub forks (downstream usage signal, not part of score)",
    )
    watchers: int = Field(
        default=0,
        description="GitHub watchers",
    )


class TestingAudit(AuditResult):
    has_tests_folder: bool = Field(
        default=False,
        description="Whether a recognizable tests directory exists",
    )
    test_file_count: int = Field(
        default=0,
        description="Number of test files detected by filename pattern",
    )
    source_file_count: int = Field(
        default=0,
        description="Number of source files detected (excluding tests, configs, docs)",
    )
    test_to_source_ratio: float | None = Field(
        default=None,
        description="Ratio of test files to source files; None if no source detected",
    )
    detected_test_frameworks: list[str] = Field(
        default_factory=list,
        description=(
            "Test frameworks detected from config files or filenames "
            "(e.g. pytest, jest, vitest, mocha, junit)"
        ),
    )
    has_ci_config: bool = Field(
        default=False,
        description="Whether CI/CD configuration exists",
    )
    has_coverage_badge: bool = Field(
        default=False,
        description="Whether README contains a coverage badge",
    )


class SecurityAudit(AuditResult):
    dependencies_analyzed: int = Field(
        default=0,
        description="Total dependencies parsed from manifest files",
    )
    vulnerable_dependencies: int = Field(
        default=0,
        description="Dependencies with at least one known CVE",
    )
    critical_cve_count: int = Field(
        default=0,
        description="Number of CRITICAL severity CVEs found",
    )
    high_cve_count: int = Field(
        default=0,
        description="Number of HIGH severity CVEs found",
    )
    medium_cve_count: int = Field(
        default=0,
        description="Number of MEDIUM severity CVEs found",
    )
    deprecated_dependencies: list[str] = Field(
        default_factory=list,
        description=(
            "Names of dependencies flagged as deprecated by the package registry"
        ),
    )
    manifest_files_found: list[str] = Field(
        default_factory=list,
        description=(
            "Which manifest files were detected (e.g. 'requirements.txt', "
            "'package.json')"
        ),
    )


class RepoAuditReport(BaseModel):
    repo_url: str
    owner: str
    repo_name: str
    documentation: DocumentationAudit | None = None
    architecture: ArchitectureAudit | None = None
    security: SecurityAudit | None = None
    maintenance: MaintenanceAudit | None = None
    testing: TestingAudit | None = None
    overall_score: int | None = Field(default=None, ge=0, le=100)
    overall_severity: Severity | None = None


class DecisionMemo(BaseModel):
    """
    Short human-readable decision memo derived from an audit.
    Designed for ~200 words total, scannable in 30 seconds.
    """

    repo_url: str
    overall_score: int

    verdict: Literal["adopt", "adopt_with_caution", "pass"]
    verdict_rationale: str = Field(
        description="One sentence explaining the verdict. ~20 words."
    )

    strengths: list[str] = Field(
        description="3-4 bullets. Each ~15 words. Evidence-cited (mention dimension or metric).",
        min_length=2,
        max_length=4,
    )
    concerns: list[str] = Field(
        description="3-4 bullets. Each ~15 words. Cite which audit dimension flagged it.",
        min_length=2,
        max_length=4,
    )

    next_steps_if_adopting: list[str] = Field(
        description="2-3 concrete actions a team should take before/during adoption. Each ~10 words.",
        min_length=2,
        max_length=3,
    )
    red_flags_to_monitor: list[str] = Field(
        description="2-3 things to watch over time. Each ~10 words.",
        min_length=2,
        max_length=3,
    )


class DependencyAssessment(BaseModel):
    """Per-dependency due diligence assessment."""

    package_name: str
    ecosystem: Literal["pypi", "npm"] = Field(
        description="Package registry: pypi for Python, npm for JS/TS"
    )
    declared_version: str | None = Field(
        description="Version constraint from manifest, e.g. '==1.2.3' or '^1.2.3', or None if unpinned"
    )

    last_release_date: str | None = Field(description="ISO date of most recent release")
    days_since_last_release: int | None = None

    monthly_downloads: int | None = Field(
        description="Last 30 days download count from registry"
    )
    popularity_tier: Literal["very_high", "high", "medium", "low", "unknown"] = "unknown"

    license: str | None = Field(description="SPDX license identifier")
    license_compatible_commercial: bool | None = Field(
        description="True if license permits commercial use"
    )

    risk_level: Literal["low", "medium", "high", "critical"]
    risk_factors: list[str] = Field(
        description="Short bullets, 1-3 items, cite metrics",
        max_length=3,
    )
    alternative_packages: list[str] = Field(
        description="Suggested alternatives if risk_level >= high. Empty otherwise.",
        max_length=3,
    )
    alternative_reasoning: str | None = Field(
        description="One sentence reasoning if alternatives are suggested"
    )


class DueDiligenceReport(BaseModel):
    """Full supply-chain due diligence report."""

    repo_url: str
    total_dependencies: int
    python_dependencies: int = 0
    node_dependencies: int = 0
    dependencies: list[DependencyAssessment]

    overall_risk_level: Literal["low", "medium", "high", "critical"]
    overall_summary: str = Field(description="2-3 sentence executive summary")

    high_risk_count: int = 0
    medium_risk_count: int = 0
    abandoned_packages: list[str] = Field(
        default_factory=list,
        description="Names with no release >1 year",
    )
    commercial_blockers: list[str] = Field(
        default_factory=list,
        description="Names with copyleft/non-commercial licenses",
    )
