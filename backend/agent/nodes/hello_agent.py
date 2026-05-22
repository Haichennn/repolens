from __future__ import annotations

import os
import re
import sys
from pathlib import Path

from dotenv import load_dotenv
from github import Github
from github.GithubException import UnknownObjectException
from langchain_anthropic import ChatAnthropic
from langchain_core.prompts import ChatPromptTemplate

BACKEND_DIR = Path(__file__).resolve().parents[2]
load_dotenv(BACKEND_DIR / ".env")

GITHUB_URL_RE = re.compile(
    r"^https?://github\.com/(?P<owner>[^/\s]+)/(?P<repo>[^/\s#?]+?)(?:\.git)?/?$"
)

README_MAX_CHARS = 3000


def parse_github_url(url: str) -> tuple[str, str]:
    match = GITHUB_URL_RE.match(url.strip())
    if not match:
        raise ValueError(
            f"Invalid GitHub URL: {url!r}. Expected https://github.com/{{owner}}/{{repo}}"
        )
    return match.group("owner"), match.group("repo")


def fetch_readme(owner: str, repo: str, token: str | None) -> str | None:
    gh = Github(token) if token else Github()
    repository = gh.get_repo(f"{owner}/{repo}")
    try:
        readme = repository.get_readme()
    except UnknownObjectException:
        return None
    return readme.decoded_content.decode("utf-8", errors="replace")


def summarize_readme(readme_text: str) -> str:
    llm = ChatAnthropic(model="claude-sonnet-4-5-20250929", temperature=0)
    prompt = ChatPromptTemplate.from_messages(
        [
            ("system", "You are Repolens, an expert repository auditor."),
            (
                "human",
                "Read this README excerpt and tell me in exactly 3 sentences "
                "what this repository does, who it's for, and what tech stack "
                "it uses.\n\nREADME:\n{readme_text}",
            ),
        ]
    )
    chain = prompt | llm
    response = chain.invoke({"readme_text": readme_text})
    return response.content if isinstance(response.content, str) else str(response.content)


def run(url: str) -> None:
    owner, repo = parse_github_url(url)
    readme_text = fetch_readme(owner, repo, os.getenv("GITHUB_TOKEN"))

    if readme_text is None:
        print("No README found in this repo")
        return

    if len(readme_text) > README_MAX_CHARS:
        readme_text = readme_text[:README_MAX_CHARS]

    summary = summarize_readme(readme_text)

    divider = "─────────────────────────────────"
    print(f"📦 Repository: {owner}/{repo}")
    print(divider)
    print(summary)
    print(divider)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python -m agent.nodes.hello_agent <github_repo_url>")
        sys.exit(1)
    run(sys.argv[1])
