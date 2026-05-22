from __future__ import annotations

import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from github import Github
from github.GithubException import GithubException
from github.Repository import Repository

BACKEND_DIR = Path(__file__).resolve().parents[2]
load_dotenv(BACKEND_DIR / ".env")

GITHUB_URL_RE = re.compile(
    r"^https?://github\.com/(?P<owner>[^/\s]+)/(?P<repo>[^/\s#?]+?)(?:\.git)?/?$"
)

MAX_TREE_ENTRIES = 200
MAX_CONFIG_FILE_CHARS = 2000
MAX_WORKFLOW_FILES = 2

CONFIG_FILES = [
    "package.json",
    "pyproject.toml",
    "requirements.txt",
    "setup.py",
    "setup.cfg",
    "Pipfile",
    "Cargo.toml",
    "go.mod",
    "pom.xml",
    "build.gradle",
    "build.gradle.kts",
    "Gemfile",
    "composer.json",
    "Dockerfile",
    "docker-compose.yml",
    "docker-compose.yaml",
    ".gitlab-ci.yml",
    ".circleci/config.yml",
    "Makefile",
    "tsconfig.json",
    "next.config.js",
    "next.config.mjs",
    "vite.config.ts",
    "vite.config.js",
]


def parse_repo_url(url: str) -> tuple[str, str]:
    match = GITHUB_URL_RE.match(url.strip())
    if not match:
        raise ValueError(
            f"Invalid GitHub URL: {url!r}. Expected https://github.com/{{owner}}/{{repo}}"
        )
    return match.group("owner"), match.group("repo")


def _build_tree_dict(entries: list[tuple[str, bool]]) -> dict[str, Any]:
    root: dict[str, Any] = {}
    for path, is_dir in entries:
        parts = path.split("/")
        cursor = root
        for i, part in enumerate(parts):
            is_last = i == len(parts) - 1
            if is_last:
                if is_dir:
                    cursor.setdefault(part + "/", {})
                else:
                    cursor[part] = None
            else:
                cursor = cursor.setdefault(part + "/", {})
                if not isinstance(cursor, dict):
                    break
    return root


def _render_tree(node: dict[str, Any], depth: int) -> list[str]:
    out: list[str] = []
    sorted_items = sorted(
        node.items(),
        key=lambda kv: (0 if kv[0].endswith("/") else 1, kv[0].lower()),
    )
    for key, value in sorted_items:
        out.append("  " * depth + key)
        if isinstance(value, dict):
            out.extend(_render_tree(value, depth + 1))
    return out


def get_file_tree(repo: Repository, branch: str | None = None) -> str:
    branch = branch or repo.default_branch
    git_tree = repo.get_git_tree(branch, recursive=True)

    entries: list[tuple[str, bool]] = [
        (entry.path, entry.type == "tree") for entry in git_tree.tree
    ]

    tree_dict = _build_tree_dict(entries)
    lines = _render_tree(tree_dict, 0)

    if len(lines) > MAX_TREE_ENTRIES:
        truncated = len(lines) - MAX_TREE_ENTRIES
        shown = lines[:MAX_TREE_ENTRIES]
        return "\n".join(shown) + f"\n... (truncated, repo has {truncated} additional entries)"

    return "\n".join(lines)


def _try_get_file_content(repo: Repository, path: str) -> str | None:
    try:
        contents = repo.get_contents(path)
    except GithubException:
        return None
    if isinstance(contents, list):
        return None
    try:
        text = contents.decoded_content.decode("utf-8", errors="replace")
    except Exception:
        return None
    if len(text) > MAX_CONFIG_FILE_CHARS:
        text = text[:MAX_CONFIG_FILE_CHARS]
    return text


def get_config_files(repo: Repository) -> dict[str, str]:
    found: dict[str, str] = {}

    for path in CONFIG_FILES:
        content = _try_get_file_content(repo, path)
        if content is not None:
            found[path] = content

    try:
        workflow_dir = repo.get_contents(".github/workflows")
    except GithubException:
        workflow_dir = None

    if isinstance(workflow_dir, list):
        workflow_files = [item for item in workflow_dir if item.type == "file"][
            :MAX_WORKFLOW_FILES
        ]
        for wf in workflow_files:
            content = _try_get_file_content(repo, wf.path)
            if content is not None:
                found[wf.path] = content

    return found


def fetch_repo_structure(url: str) -> dict[str, Any]:
    try:
        owner, repo_name = parse_repo_url(url)
    except ValueError as exc:
        return {"error": str(exc)}

    try:
        token = os.getenv("GITHUB_TOKEN")
        gh = Github(token) if token else Github()
        repo = gh.get_repo(f"{owner}/{repo_name}")
        default_branch = repo.default_branch
        file_tree = get_file_tree(repo, default_branch)
        config_files = get_config_files(repo)
        languages = list(repo.get_languages().keys())
    except GithubException as exc:
        message = exc.data.get("message", str(exc)) if hasattr(exc, "data") and isinstance(exc.data, dict) else str(exc)
        return {"error": f"GitHub API error: {message}"}

    return {
        "owner": owner,
        "repo_name": repo_name,
        "default_branch": default_branch,
        "file_tree": file_tree,
        "config_files": config_files,
        "languages": languages,
    }


def fetch_maintenance_metrics(repo: Repository) -> dict[str, Any]:
    """
    Collect maintenance + popularity metrics from a PyGithub Repository object.
    All values are best-effort; on partial failure return None or sensible defaults.
    """
    now = datetime.now(timezone.utc)
    ninety_days_ago = now - timedelta(days=90)
    one_year_ago = now - timedelta(days=365)

    result: dict[str, Any] = {
        "days_since_last_commit": None,
        "commits_last_90_days": 0,
        "total_contributors": 0,
        "top_contributor_share": None,
        "open_issues_count": 0,
        "recent_releases": [],
        "has_recent_releases": False,
        "last_commit_iso": None,
        "last_commit_message": None,
        "stars": 0,
        "forks": 0,
        "watchers": 0,
    }

    try:
        result["stars"] = repo.stargazers_count
        result["forks"] = repo.forks_count
        result["watchers"] = repo.subscribers_count
    except GithubException as exc:
        print(f"[repo_inspector] popularity metrics failed: {exc}", file=sys.stderr)

    try:
        commits_iter = iter(repo.get_commits())
        first_commit = next(commits_iter, None)
        if first_commit is not None:
            commit_date = first_commit.commit.author.date
            if commit_date.tzinfo is None:
                commit_date = commit_date.replace(tzinfo=timezone.utc)
            result["last_commit_iso"] = commit_date.isoformat()
            result["days_since_last_commit"] = (now - commit_date).days
            subject = first_commit.commit.message.split("\n", 1)[0]
            if len(subject) > 200:
                subject = subject[:200]
            result["last_commit_message"] = subject
    except GithubException as exc:
        print(f"[repo_inspector] last commit fetch failed: {exc}", file=sys.stderr)

    try:
        count = 0
        for _ in repo.get_commits(since=ninety_days_ago):
            count += 1
            if count >= 500:
                break
        result["commits_last_90_days"] = count
    except GithubException as exc:
        print(f"[repo_inspector] 90-day commit count failed: {exc}", file=sys.stderr)

    try:
        contributions: list[int] = []
        for i, contributor in enumerate(repo.get_contributors()):
            if i >= 30:
                break
            contributions.append(contributor.contributions)
        if contributions:
            result["total_contributors"] = len(contributions)
            total = sum(contributions)
            if total > 0:
                result["top_contributor_share"] = max(contributions) / total
    except GithubException as exc:
        print(f"[repo_inspector] contributors fetch failed: {exc}", file=sys.stderr)

    try:
        result["open_issues_count"] = repo.open_issues_count
    except GithubException as exc:
        print(f"[repo_inspector] open issues count failed: {exc}", file=sys.stderr)

    try:
        recent_releases: list[dict[str, Any]] = []
        any_recent = False
        for i, release in enumerate(repo.get_releases()):
            if i >= 5:
                break
            published = release.created_at
            published_iso: str | None = None
            if published is not None:
                if published.tzinfo is None:
                    published = published.replace(tzinfo=timezone.utc)
                published_iso = published.isoformat()
                if published >= one_year_ago:
                    any_recent = True
            recent_releases.append(
                {
                    "tag_name": release.tag_name,
                    "published_at_iso": published_iso,
                    "name": release.title,
                }
            )
        result["recent_releases"] = recent_releases
        result["has_recent_releases"] = any_recent
    except GithubException as exc:
        print(f"[repo_inspector] releases fetch failed: {exc}", file=sys.stderr)

    return result


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python -m agent.utils.repo_inspector <github_repo_url>")
        sys.exit(1)

    url = sys.argv[1]
    structure = fetch_repo_structure(url)

    if "error" in structure:
        print(f"❌ Error: {structure['error']}")
        sys.exit(1)

    print(f"📦 {structure['owner']}/{structure['repo_name']}")
    print(f"   default branch: {structure['default_branch']}")
    languages_str = ", ".join(structure["languages"]) if structure["languages"] else "(none detected)"
    print(f"   languages:      {languages_str}")
    print()
    print("── File tree ─────────────────────")
    print(structure["file_tree"])
    print()
    print("── Config files ──────────────────")
    if not structure["config_files"]:
        print("(no recognized config files found)")
    else:
        for path, content in structure["config_files"].items():
            print(f"### {path}")
            print(content)
            print()

    print("── Maintenance metrics ───────────")
    try:
        token = os.getenv("GITHUB_TOKEN")
        gh = Github(token) if token else Github()
        repo = gh.get_repo(f"{structure['owner']}/{structure['repo_name']}")
        metrics = fetch_maintenance_metrics(repo)
        print(json.dumps(metrics, indent=2, default=str))
    except GithubException as exc:
        print(f"❌ Maintenance metrics failed: {exc}")
