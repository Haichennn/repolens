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

export type AuditSession = {
  id: string;
  repoUrl: string;
  status: "running" | "complete" | "error";
  startedAt: number;
  fullReport: RepoAuditReport | null;
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
  if (status === "running") return "RUNNING";
  if (status === "error") return "ERROR";
  if (severity === null) return "PENDING";
  return severity.toUpperCase();
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
  if (status === "running" || score === null) {
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
  const isComplete = session.status === "complete" && result !== null;
  const isError = session.status === "error";

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

function SessionPanel({ session }: { session: AuditSession }) {
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

  const report = session.fullReport;
  const overallColor = severityColor(report?.overall_severity ?? null);

  return (
    <div className="border border-white/[0.06] bg-white/[0.015]">
      {/* Panel header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3 font-mono text-[13px]">
        <div className="flex items-baseline gap-3">
          <span className="text-muted-foreground/60">{shortRepoLabel(session.repoUrl)}</span>
          {session.status === "running" && (
            <span className="text-muted-foreground/40">running · {elapsed(session.startedAt)}</span>
          )}
          {session.status === "complete" && report && (
            <span className="tabular-nums" style={{ color: overallColor }}>
              {report.overall_score}/100 · {report.overall_severity}
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
            result={report?.[dim] ?? null}
            session={session}
            expanded={expanded.has(dim)}
            onToggle={() => toggle(dim)}
          />
        ))}
      </div>
    </div>
  );
}

// ─────────── Main exported component ───────────

export function AuditDashboard({ audits }: { audits: AuditSession[] }) {
  if (audits.length === 0) return null;

  return (
    <div className="space-y-4">
      {audits.map((session) => (
        <SessionPanel key={session.id} session={session} />
      ))}
    </div>
  );
}
