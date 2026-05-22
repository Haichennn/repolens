# Captured Ideas — to evaluate after V1 ships

## Source: May 22, 2026 brainstorm during V1 build sprint

### Workflow-level features
- Comparative ranking (find alternatives to a seed repo)
- Beginner-friendliness audit (quickstart, examples, "good first issue" signals)
- API design audit (routing, surface quality, internal architecture)
- Decision Memo Generator (paste-ready markdown comparing N repos)
- Dependency Due-Diligence (audit by package name, not repo URL)
- Onboarding Tour Guide (reading-order roadmap for unfamiliar repos)
- Maintainer Culture Audit (response time, welcome posture, bus factor)

### Distribution channel ideas  
- Package as a Claude Skill — investigate after V1 ship
- (other channels to brainstorm: VS Code extension, CLI tool, GitHub App)

### Cross-cutting improvements
- Beginner-friendliness signals folded into Documentation audit
- API design signals folded into Architecture audit

---

## Process rule

No idea evaluation during V1 sprint (May 22 - June 5).
After V1 ships, re-read this file, re-prioritize, pick top 2 for V2.

---

## Fixed bug (closed Day 4 night)

- **Large-repo file tree truncation**: GitHub API truncates `get_git_tree` results on repos with thousands of files (e.g. fastapi). Testing audit currently miscounts test files for such repos. Fix options:
  1. Implement pagination via `git/trees/{sha}?recursive=1` with multiple calls
  2. Add a fallback that uses GitHub's search API for test file count
  3. Detect truncation and warn the user in the audit output
