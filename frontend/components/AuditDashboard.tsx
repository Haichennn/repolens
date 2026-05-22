"use client";

import { useState, useEffect } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

// ─────────── Types ───────────

export type DimensionName = "documentation" | "architecture" | "maintenance" | "testing" | "security";

export type Severity = "good" | "warning" | "critical";

export type AuditDimensionResult = {
  dimension: string;
  score: number;
  severity: Severity;
  summary: string;
  findings: string[];
  recommendations: string[];
};

export type RepoAuditReport = {
  repo_url: string;
  owner: string;
  repo_name: string;
  overall_score: number;
  overall_severity: Severity;
  documentation: AuditDimensionResult | null;
  architecture: AuditDimensionResult | null;
  maintenance: AuditDimensionResult | null;
  testing: AuditDimensionResult | null;
  security: AuditDimensionResult | null;
};

export type Verdict = "adopt" | "adopt_with_caution" | "pass";

export type DecisionMemo = {
  repo_url: string;
  overall_score: number;
  verdict: Verdict;
  verdict_rationale: string;
  strengths: string[];
  concerns: string[];
  next_steps_if_adopting: string[];
  red_flags_to_monitor: string[];
};

export type MemoState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "complete"; memo: DecisionMemo }
  | { status: "error"; error: string };

export type AuditSession = {
  id: string;
  repoUrl: string;
  status: "running" | "complete" | "error";
  startedAt: number;

  // Populated incrementally as SSE events arrive:
  repoMeta: { owner: string; repo_name: string } | null;
  dimensions: {
    documentation: AuditDimensionResult | null;
    architecture: AuditDimensionResult | null;
    maintenance: AuditDimensionResult | null;
    testing: AuditDimensionResult | null;
    security: AuditDimensionResult | null;
  };
  overallScore: number | null;
  overallSeverity: Severity | null;

  memo: MemoState;

  error?: string;
};

const DIMENSIONS: DimensionName[] = ["documentation", "architecture", "maintenance", "testing", "security"];

// ─────────── Helpers ───────────

function severityColor(severity: Severity | null): string {
  if (severity === "good") return "oklch(0.65 0.12 150)"; // sage green
  if (severity === "warning") return "oklch(0.7 0.15 50)"; // burnt orange
  if (severity === "critical") return "oklch(0.6 0.2 25)"; // red
  return "oklch(0.5 0 0)"; // neutral
}

function severityLabel(severity: Severity | null, status: AuditSession["status"]): string {
  // Prefer per-row severity if the dimension has landed — even while the
  // overall session is still running.
  if (severity !== null) return severity.toUpperCase();
  if (status === "error") return "ERROR";
  if (status === "running") return "RUNNING";
  return "PENDING";
}

function verdictColor(verdict: Verdict): string {
  if (verdict === "adopt") return "oklch(0.65 0.12 150)"; // sage green
  if (verdict === "adopt_with_caution") return "oklch(0.7 0.15 50)"; // burnt orange
  return "oklch(0.6 0.2 25)"; // red — pass
}

function verdictLabel(verdict: Verdict): string {
  if (verdict === "adopt") return "ADOPT";
  if (verdict === "adopt_with_caution") return "ADOPT WITH CAUTION";
  return "PASS";
}

function shortRepoLabel(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname.replace(/^\//, "").replace(/\.git$/, "");
  } catch {
    return url;
  }
}

function elapsed(startedAt: number): string {
  const ms = Date.now() - startedAt;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ─────────── Components ───────────

function ScoreBar({ score, severity, status }: { score: number | null; severity: Severity | null; status: AuditSession["status"] }) {
  if (score === null) {
    if (status === "running") {
      return (
        <div className="relative h-[3px] w-full overflow-hidden bg-white/[0.05]">
          <div
            className="absolute inset-y-0 w-1/3"
            style={{
              background: "linear-gradient(90deg, transparent, oklch(0.7 0 0 / 0.6), transparent)",
              animation: "scan 1.6s linear infinite",
            }}
          />
        </div>
      );
    }
    // Errored or complete but missing — show static empty bar
    return <div className="h-[3px] w-full bg-white/[0.05]" />;
  }

  return (
    <div className="relative h-[3px] w-full bg-white/[0.05]">
      <div
        className="absolute inset-y-0 left-0 transition-all duration-500 apple-ease"
        style={{
          width: `${score}%`,
          background: severityColor(severity),
        }}
      />
    </div>
  );
}

function AuditRow({
  dimension,
  result,
  session,
  expanded,
  onToggle,
}: {
  dimension: DimensionName;
  result: AuditDimensionResult | null;
  session: AuditSession;
  expanded: boolean;
  onToggle: () => void;
}) {
  const isRunning = session.status === "running";
  // Per-row completion: the dim is done as soon as its result lands, even if
  // siblings are still streaming.
  const isComplete = result !== null;

  const color = severityColor(result?.severity ?? null);
  const label = severityLabel(result?.severity ?? null, session.status);

  const clickable = isComplete;

  return (
    <div>
      <button
        type="button"
        onClick={clickable ? onToggle : undefined}
        disabled={!clickable}
        className={`grid w-full grid-cols-[130px_1fr_50px_80px_20px] items-center gap-4 py-3 text-left font-mono text-[15px] apple-ease ${
          clickable ? "cursor-pointer hover:bg-white/[0.02]" : ""
        }`}
        aria-expanded={expanded}
      >
        <span
          className="truncate transition-colors"
          style={{ color: isComplete || isRunning ? "var(--color-foreground)" : "oklch(0.4 0 0)" }}
        >
          {dimension}
        </span>
        <ScoreBar score={result?.score ?? null} severity={result?.severity ?? null} status={session.status} />
        <span
          className="text-right tabular-nums"
          style={{ color: isComplete ? color : "oklch(0.3 0 0)" }}
        >
          {isComplete ? result!.score : "—"}
        </span>
        <span
          className="text-right text-[11px] tracking-[0.1em]"
          style={{ color: isComplete ? color : "oklch(0.4 0 0)" }}
        >
          {label}
        </span>
        <span className="flex justify-end text-muted-foreground/40">
          {clickable && (expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />)}
        </span>
      </button>

      {expanded && result && (
        <div
          className="mb-1 ml-0 mt-2 border-l-2 px-5 py-4 text-[13px]"
          style={{
            borderColor: color,
            background: "oklch(1 0 0 / 0.015)",
          }}
        >
          <div className="mb-3 text-[14px] leading-relaxed text-muted-foreground/90">{result.summary}</div>

          <div className="mb-1 font-mono text-[11px] tracking-[0.1em] text-muted-foreground/50">FINDINGS</div>
          <ul className="mb-4 space-y-1 text-[14px] leading-relaxed text-foreground/80">
            {result.findings.map((f, i) => {
              const isPositive = /^(✓|✅|Positive|Excellent|Strong|Healthy|Clean|Good|Active|positive)/i.test(f);
              return (
                <li key={i} className="flex gap-2">
                  <span className="flex-shrink-0 select-none" style={{ color: isPositive ? severityColor("good") : "oklch(0.55 0 0)" }}>
                    {isPositive ? "+" : "·"}
                  </span>
                  <span>{f.replace(/^[✓✅✗✘·\-+\*]\s*/, "").replace(/^(Positive|Negative|Critical|Missing|Weakness):\s*/i, "")}</span>
                </li>
              );
            })}
          </ul>

          <div className="mb-1 font-mono text-[11px] tracking-[0.1em] text-muted-foreground/50">RECOMMENDATIONS</div>
          <ul className="space-y-1 text-[14px] leading-relaxed text-foreground/80">
            {result.recommendations.map((r, i) => (
              <li key={i} className="flex gap-2">
                <span className="flex-shrink-0 select-none text-muted-foreground/40">→</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function MemoCard({ memo }: { memo: DecisionMemo }) {
  const color = verdictColor(memo.verdict);
  const showNextSteps =
    memo.verdict === "adopt" || memo.verdict === "adopt_with_caution";

  return (
    <div
      className="border-t border-white/[0.06] border-l-2 px-5 py-5"
      style={{
        borderLeftColor: color,
        background: "oklch(1 0 0 / 0.015)",
      }}
    >
      {/* Verdict pill + section label */}
      <div className="mb-4 flex items-center gap-3">
        <span
          className="rounded-sm px-2.5 py-1 font-mono text-[11px] tracking-[0.1em]"
          style={{
            color: color,
            border: `1px solid ${color}`,
            background: "oklch(1 0 0 / 0.02)",
          }}
        >
          {verdictLabel(memo.verdict)}
        </span>
        <span className="font-mono text-[11px] tracking-[0.1em] text-muted-foreground/50">
          DECISION MEMO
        </span>
      </div>

      {/* Verdict rationale — the punch line */}
      <p className="mb-6 text-[15px] italic leading-relaxed text-foreground/85">
        {memo.verdict_rationale}
      </p>

      {/* Strengths */}
      <div className="mb-5">
        <div className="mb-2 font-mono text-[11px] tracking-[0.1em] text-muted-foreground/50">
          STRENGTHS
        </div>
        <ul className="space-y-1.5 text-[14px] leading-relaxed text-foreground/80">
          {memo.strengths.map((s, i) => (
            <li key={i} className="flex gap-2">
              <span
                className="flex-shrink-0 select-none"
                style={{ color: verdictColor("adopt") }}
              >
                ·
              </span>
              <span>{s}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Concerns */}
      <div className="mb-5">
        <div className="mb-2 font-mono text-[11px] tracking-[0.1em] text-muted-foreground/50">
          CONCERNS
        </div>
        <ul className="space-y-1.5 text-[14px] leading-relaxed text-foreground/80">
          {memo.concerns.map((c, i) => (
            <li key={i} className="flex gap-2">
              <span
                className="flex-shrink-0 select-none"
                style={{ color: verdictColor("adopt_with_caution") }}
              >
                ·
              </span>
              <span>{c}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Next steps if adopting — only shown for adopt or adopt_with_caution */}
      {showNextSteps && (
        <div className="mb-5">
          <div className="mb-2 font-mono text-[11px] tracking-[0.1em] text-muted-foreground/50">
            NEXT STEPS IF ADOPTING
          </div>
          <ol className="space-y-1.5 text-[14px] leading-relaxed text-foreground/80">
            {memo.next_steps_if_adopting.map((step, i) => (
              <li key={i} className="flex gap-2">
                <span className="flex-shrink-0 select-none text-muted-foreground/40">→</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Red flags to monitor */}
      <div>
        <div className="mb-2 font-mono text-[11px] tracking-[0.1em] text-muted-foreground/50">
          RED FLAGS TO MONITOR
        </div>
        <ul className="space-y-1.5 text-[14px] leading-relaxed text-foreground/80">
          {memo.red_flags_to_monitor.map((flag, i) => (
            <li key={i} className="flex gap-2">
              <span
                className="flex-shrink-0 select-none"
                style={{ color: verdictColor("pass") }}
              >
                ·
              </span>
              <span>{flag}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function MemoControl({
  session,
  onGenerateMemo,
}: {
  session: AuditSession;
  onGenerateMemo: (sessionId: string) => void;
}) {
  if (session.status !== "complete") return null;

  if (session.memo.status === "complete") {
    return <MemoCard memo={session.memo.memo} />;
  }

  if (session.memo.status === "loading") {
    return (
      <div className="border-t border-white/[0.06] px-5 py-4">
        <div className="mb-2 font-mono text-[13px] text-muted-foreground/70">
          generating decision memo...
        </div>
        <div className="relative h-[3px] w-full overflow-hidden bg-white/[0.05]">
          <div
            className="absolute inset-y-0 w-1/3"
            style={{
              background:
                "linear-gradient(90deg, transparent, oklch(0.7 0 0 / 0.6), transparent)",
              animation: "scan 1.6s linear infinite",
            }}
          />
        </div>
      </div>
    );
  }

  if (session.memo.status === "error") {
    return (
      <div className="border-t border-white/[0.06] px-5 py-4 font-mono text-[13px]">
        <div className="mb-2 text-red-400/80">
          memo error: {session.memo.error}
        </div>
        <button
          type="button"
          onClick={() => onGenerateMemo(session.id)}
          className="text-muted-foreground/70 underline-offset-2 transition-colors hover:text-foreground hover:underline"
        >
          retry
        </button>
      </div>
    );
  }

  // idle
  return (
    <button
      type="button"
      onClick={() => onGenerateMemo(session.id)}
      className="w-full border-t border-white/[0.06] px-5 py-4 text-left font-mono text-[13px] text-muted-foreground/80 transition-colors hover:bg-white/[0.02] hover:text-foreground apple-ease"
    >
      generate decision memo →
    </button>
  );
}

function SessionPanel({
  session,
  onGenerateMemo,
}: {
  session: AuditSession;
  onGenerateMemo: (sessionId: string) => void;
}) {
  const [expanded, setExpanded] = useState<Set<DimensionName>>(new Set());
  const [, setTick] = useState(0);

  // Re-render every 100ms while the session is running so elapsed() updates.
  useEffect(() => {
    if (session.status !== "running") return;
    const id = setInterval(() => setTick((t) => t + 1), 100);
    return () => clearInterval(id);
  }, [session.status]);

  function toggle(dim: DimensionName) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(dim)) next.delete(dim);
      else next.add(dim);
      return next;
    });
  }

  const overallColor = severityColor(session.overallSeverity);

  return (
    <div className="border border-white/[0.06] bg-white/[0.015]">
      {/* Panel header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3 font-mono text-[13px]">
        <div className="flex items-baseline gap-3">
          <span className="text-muted-foreground/60">{shortRepoLabel(session.repoUrl)}</span>
          {session.status === "running" && (
            <span className="text-muted-foreground/40">running · {elapsed(session.startedAt)}</span>
          )}
          {session.status === "complete" && session.overallScore !== null && (
            <span className="tabular-nums" style={{ color: overallColor }}>
              {session.overallScore}/100 · {session.overallSeverity}
            </span>
          )}
          {session.status === "error" && <span className="text-red-400/80">error: {session.error}</span>}
        </div>
        <a
          href={session.repoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground/40 transition-colors hover:text-muted-foreground"
        >
          ↗
        </a>
      </div>

      {/* Audit rows */}
      <div className="divide-y divide-white/[0.04] px-5">
        {DIMENSIONS.map((dim) => (
          <AuditRow
            key={dim}
            dimension={dim}
            result={session.dimensions[dim]}
            session={session}
            expanded={expanded.has(dim)}
            onToggle={() => toggle(dim)}
          />
        ))}
      </div>

      {/* Memo control — button, loading, error, or rendered memo */}
      <MemoControl session={session} onGenerateMemo={onGenerateMemo} />
    </div>
  );
}

// ─────────── Main exported component ───────────

export function AuditDashboard({
  audits,
  onGenerateMemo,
}: {
  audits: AuditSession[];
  onGenerateMemo: (sessionId: string) => void;
}) {
  if (audits.length === 0) return null;

  return (
    <div className="space-y-4">
      {audits.map((session) => (
        <SessionPanel
          key={session.id}
          session={session}
          onGenerateMemo={onGenerateMemo}
        />
      ))}
    </div>
  );
}
