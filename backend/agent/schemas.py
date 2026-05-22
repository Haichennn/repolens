from __future__ import annotations

from enum import Enum

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


class RepoAuditReport(BaseModel):
    repo_url: str
    owner: str
    repo_name: str
    documentation: DocumentationAudit | None = None
    architecture: ArchitectureAudit | None = None
    security: AuditResult | None = None
    maintenance: AuditResult | None = None
    testing: AuditResult | None = None
    overall_score: int | None = Field(default=None, ge=0, le=100)
    overall_severity: Severity | None = None
