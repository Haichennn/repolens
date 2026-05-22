from __future__ import annotations

import os
import re
import sys
from pathlib import Path
from typing import TypedDict

from dotenv import load_dotenv
from github import Github
from github.GithubException import GithubException, UnknownObjectException
from langchain_anthropic import ChatAnthropic
from langchain_core.prompts import ChatPromptTemplate
from langgraph.graph import END, START, StateGraph

BACKEND_DIR = Path(__file__).resolve().parents[1]
load_dotenv(BACKEND_DIR / ".env")

GITHUB_URL_RE = re.compile(
    r"^https?://github\.com/(?P<owner>[^/\s]+)/(?P<repo>[^/\s#?]+?)(?:\.git)?/?$"
)

README_MAX_CHARS = 3000


class RepoState(TypedDict):
    repo_url: str
    owner: str
    repo_name: str
    readme_text: str
    summary: str
    error: str | None


def fetch_readme(state: RepoState) -> dict:
    url = state["repo_url"].strip()
    match = GITHUB_URL_RE.match(url)
    if not match:
        return {"error": f"Invalid GitHub URL: {url!r}"}

    owner = match.group("owner")
    repo_name = match.group("repo")

    try:
        gh = Github(os.getenv("GITHUB_TOKEN")) if os.getenv("GITHUB_TOKEN") else Github()
        repository = gh.get_repo(f"{owner}/{repo_name}")
        readme = repository.get_readme()
    except UnknownObjectException:
        return {
            "owner": owner,
            "repo_name": repo_name,
            "error": "No README found in this repo",
        }
    except GithubException as exc:
        return {
            "owner": owner,
            "repo_name": repo_name,
            "error": f"GitHub API error: {exc.data.get('message', str(exc))}",
        }

    readme_text = readme.decoded_content.decode("utf-8", errors="replace")
    if len(readme_text) > README_MAX_CHARS:
        readme_text = readme_text[:README_MAX_CHARS]

    return {
        "owner": owner,
        "repo_name": repo_name,
        "readme_text": readme_text,
    }


def summarize_readme(state: RepoState) -> dict:
    if state.get("error"):
        return {"summary": "Skipped: " + state["error"]}

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
    response = chain.invoke({"readme_text": state["readme_text"]})
    summary = response.content if isinstance(response.content, str) else str(response.content)
    return {"summary": summary}


def build_graph():
    graph = StateGraph(RepoState)
    graph.add_node("fetch", fetch_readme)
    graph.add_node("summarize", summarize_readme)
    graph.add_edge(START, "fetch")
    graph.add_edge("fetch", "summarize")
    graph.add_edge("summarize", END)
    return graph.compile()


app = build_graph()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python -m agent.graph <github_repo_url>")
        sys.exit(1)

    result = app.invoke({"repo_url": sys.argv[1]})

    if result.get("error"):
        print(f"❌ Error: {result['error']}")
        sys.exit(1)

    divider = "─────────────────────────────────"
    print(f"📦 Repository: {result['owner']}/{result['repo_name']}")
    print(divider)
    print(result["summary"])
    print(divider)
