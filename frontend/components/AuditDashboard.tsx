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

export type Ecosystem = "pypi" | "npm";
export type RiskLevel = "low" | "medium" | "high" | "critical";
export type PopularityTier = "very_high" | "high" | "medium" | "low" | "unknown";

export type DependencyAssessment = {
  package_name: string;
  ecosystem: Ecosystem;
  declared_version: string | null;
  last_release_date: string | null;
  days_since_last_release: number | null;
  monthly_downloads: number | null;
  popularity_tier: PopularityTier;
  license: string | null;
  license_compatible_commercial: boolean | null;
  risk_level: RiskLevel;
  risk_factors: string[];
  alternative_packages: string[];
  alternative_reasoning: string | null;
};

export type DueDiligenceReport = {
  repo_url: string;
  total_dependencies: number;
  python_dependencies: number;
  node_dependencies: number;
  dependencies: DependencyAssessment[];
  overall_risk_level: RiskLevel;
  overall_summary: string;
  high_risk_count: number;
  medium_risk_count: number;
  abandoned_packages: string[];
  commercial_blockers: string[];
};

export type DueDiligenceState =
  | { status: "idle" }
  | { status: "loading"; startedAt: number }
  | { status: "complete"; report: DueDiligenceReport }
  | { status: "error"; error: string };

export type ActiveTab = "memo" | "due_diligence";

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
  dueDiligence: DueDiligenceState;
  activeTab: ActiveTab;

  error?: string;
};

const DIMENSIONS: DimensionName[] = ["documentation", "architecture", "maintenance", "testing", "security"];
const RISK_LEVELS: RiskLevel[] = ["critical", "high", "medium", "low"];

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

function riskColor(level: RiskLevel): string {
  if (level === "low") return "oklch(0.65 0.12 150)"; // sage green
  if (level === "medium") return "oklch(0.7 0.15 70)"; // amber
  if (level === "high") return "oklch(0.7 0.15 50)"; // burnt orange
  return "oklch(0.6 0.2 25)"; // red — critical
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

function formatDownloads(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatPopularityTier(tier: PopularityTier): string {
  return tier.replace("_", " ");
}

// ─────────── Reusable bits ───────────

function ScanBar() {
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

// ─────────── Audit row ───────────

function ScoreBar({ score, severity, status }: { score: number | null; severity: Severity | null; status: AuditSession["status"] }) {
  if (score === null) {
    if (status === "running") {
      return <ScanBar />;
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

// ─────────── Memo ───────────

function MemoCard({ memo }: { memo: DecisionMemo }) {
  const color = verdictColor(memo.verdict);
  const showNextSteps =
    memo.verdict === "adopt" || memo.verdict === "adopt_with_caution";

  return (
    <div
      className="border-l-2 px-5 py-5"
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

function MemoContent({
  session,
  onGenerateMemo,
}: {
  session: AuditSession;
  onGenerateMemo: (sessionId: string) => void;
}) {
  if (session.memo.status === "complete") {
    return <MemoCard memo={session.memo.memo} />;
  }

  if (session.memo.status === "loading") {
    return (
      <div className="px-5 py-4">
        <div className="mb-2 font-mono text-[13px] text-muted-foreground/70">
          generating decision memo...
        </div>
        <ScanBar />
      </div>
    );
  }

  if (session.memo.status === "error") {
    return (
      <div className="px-5 py-4 font-mono text-[13px]">
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
      className="w-full px-5 py-4 text-left font-mono text-[13px] text-muted-foreground/80 transition-colors hover:bg-white/[0.02] hover:text-foreground apple-ease"
    >
      generate decision memo →
    </button>
  );
}

// ─────────── Due diligence ───────────

function DepRow({ dep }: { dep: DependencyAssessment }) {
  const isAbandoned =
    dep.days_since_last_release !== null && dep.days_since_last_release > 365;
  const downloadsLabel = dep.monthly_downloads !== null ? formatDownloads(dep.monthly_downloads) : null;
  const licenseColor: string | undefined =
    dep.license_compatible_commercial === true
      ? "oklch(0.65 0.12 150)"
      : dep.license_compatible_commercial === false
      ? "oklch(0.6 0.2 25)"
      : undefined;

  return (
    <div className="border-t border-white/[0.04] px-4 py-3">
      {/* Header line: ecosystem tag · package name · declared version */}
      <div className="flex items-baseline gap-2 font-mono">
        <span className="text-[11px] tracking-[0.05em] text-muted-foreground/40">
          [{dep.ecosystem}]
        </span>
        <span className="text-[14px] text-foreground">{dep.package_name}</span>
        {dep.declared_version && (
          <span className="text-[12px] text-muted-foreground/50">
            {dep.declared_version}
          </span>
        )}
      </div>

      {/* Risk factors */}
      {dep.risk_factors.length > 0 && (
        <ul className="mt-2 space-y-1 text-[12px] leading-relaxed text-foreground/80">
          {dep.risk_factors.map((f, i) => (
            <li key={i} className="flex gap-2">
              <span className="flex-shrink-0 select-none text-muted-foreground/40">·</span>
              <span>{f}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Alternatives */}
      {dep.alternative_packages.length > 0 && (
        <div className="mt-2 text-[12px] leading-relaxed text-foreground/70">
          <span className="text-muted-foreground/50">Alternatives:</span>{" "}
          <span className="font-mono text-foreground/85">
            {dep.alternative_packages.join(", ")}
          </span>
          {dep.alternative_reasoning && (
            <span className="text-muted-foreground/70"> — {dep.alternative_reasoning}</span>
          )}
        </div>
      )}

      {/* Metadata: license · popularity · freshness */}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-muted-foreground/60 tabular-nums">
        {dep.license && (
          <span style={licenseColor ? { color: licenseColor } : undefined}>
            license: {dep.license}
          </span>
        )}
        {downloadsLabel !== null && dep.popularity_tier !== "unknown" && (
          <span>
            popularity: {formatPopularityTier(dep.popularity_tier)} ({downloadsLabel}/mo)
          </span>
        )}
        {downloadsLabel !== null && dep.popularity_tier === "unknown" && (
          <span>downloads: {downloadsLabel}/mo</span>
        )}
        {isAbandoned && (
          <span style={{ color: "oklch(0.7 0.15 50)" }}>
            {dep.days_since_last_release} days since release
          </span>
        )}
      </div>
    </div>
  );
}

function RiskSection({
  level,
  deps,
  defaultOpen,
}: {
  level: RiskLevel;
  deps: DependencyAssessment[];
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const color = riskColor(level);
  const isEmpty = deps.length === 0;

  return (
    <div
      className="mb-3 border-l-2"
      style={{
        borderLeftColor: isEmpty ? "oklch(0.3 0 0)" : color,
        background: "oklch(1 0 0 / 0.015)",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 font-mono text-[11px] tracking-[0.1em] transition-colors hover:bg-white/[0.02]"
        aria-expanded={open}
      >
        <div className="flex items-center gap-3">
          <span style={{ color: isEmpty ? "oklch(0.4 0 0)" : color }}>
            {level.toUpperCase()}
          </span>
          <span
            className="rounded-sm border px-2 py-0.5 tabular-nums"
            style={{
              color: isEmpty ? "oklch(0.4 0 0)" : color,
              borderColor: isEmpty ? "oklch(0.25 0 0)" : color,
            }}
          >
            {deps.length}
          </span>
        </div>
        <span className="text-muted-foreground/40">
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </span>
      </button>

      {open && (
        <div>
          {isEmpty ? (
            <div className="border-t border-white/[0.04] px-4 py-3 font-mono text-[12px] text-muted-foreground/40">
              none
            </div>
          ) : (
            deps.map((dep) => <DepRow key={`${dep.ecosystem}:${dep.package_name}`} dep={dep} />)
          )}
        </div>
      )}
    </div>
  );
}

function DueDiligenceCard({ report }: { report: DueDiligenceReport }) {
  const color = riskColor(report.overall_risk_level);

  // Group deps by risk level
  const byLevel: Record<RiskLevel, DependencyAssessment[]> = {
    critical: [],
    high: [],
    medium: [],
    low: [],
  };
  for (const dep of report.dependencies) {
    byLevel[dep.risk_level].push(dep);
  }

  // Build quick-stats line — only non-zero items
  const stats: string[] = [];
  if (report.high_risk_count > 0) stats.push(`${report.high_risk_count} high risk`);
  if (report.medium_risk_count > 0) stats.push(`${report.medium_risk_count} medium risk`);
  if (report.abandoned_packages.length > 0)
    stats.push(`${report.abandoned_packages.length} abandoned`);
  if (report.commercial_blockers.length > 0)
    stats.push(`${report.commercial_blockers.length} commercial blockers`);

  return (
    <div className="px-5 py-5">
      {/* Header strip: overall risk pill + counts */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] tracking-[0.1em] text-muted-foreground/50">
            OVERALL RISK
          </span>
          <span
            className="rounded-sm px-2.5 py-1 font-mono text-[11px] tracking-[0.1em]"
            style={{
              color,
              border: `1px solid ${color}`,
              background: "oklch(1 0 0 / 0.02)",
            }}
          >
            {report.overall_risk_level.toUpperCase()}
          </span>
        </div>
        <div className="font-mono text-[11px] text-muted-foreground/60 tabular-nums">
          {report.total_dependencies} deps · {report.python_dependencies} python ·{" "}
          {report.node_dependencies} node
        </div>
      </div>

      {/* Summary */}
      <p className="mb-4 text-[14px] italic leading-relaxed text-foreground/85">
        {report.overall_summary}
      </p>

      {/* Quick stats */}
      {stats.length > 0 && (
        <div className="mb-6 font-mono text-[12px] text-muted-foreground/70 tabular-nums">
          {stats.join(" · ")}
        </div>
      )}

      {/* Risk sections — critical/high open by default, medium/low closed */}
      {RISK_LEVELS.map((level) => (
        <RiskSection
          key={level}
          level={level}
          deps={byLevel[level]}
          defaultOpen={level === "critical" || level === "high"}
        />
      ))}
    </div>
  );
}

function DueDiligenceContent({
  session,
  onGenerateDueDiligence,
}: {
  session: AuditSession;
  onGenerateDueDiligence: (sessionId: string) => void;
}) {
  const [, setTick] = useState(0);

  // Tick while DD is loading so the elapsed timer updates
  useEffect(() => {
    if (session.dueDiligence.status !== "loading") return;
    const id = setInterval(() => setTick((t) => t + 1), 200);
    return () => clearInterval(id);
  }, [session.dueDiligence.status]);

  if (session.dueDiligence.status === "complete") {
    return <DueDiligenceCard report={session.dueDiligence.report} />;
  }

  if (session.dueDiligence.status === "loading") {
    return (
      <div className="px-5 py-4">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="font-mono text-[13px] text-muted-foreground/70">
            investigating supply chain...
          </span>
          <span className="font-mono text-[11px] tabular-nums text-muted-foreground/40">
            {elapsed(session.dueDiligence.startedAt)}
          </span>
        </div>
        <ScanBar />
        <div className="mt-2 font-mono text-[11px] text-muted-foreground/40">
          fetching registry data + LLM risk assessment · typically ~45s
        </div>
      </div>
    );
  }

  if (session.dueDiligence.status === "error") {
    return (
      <div className="px-5 py-4 font-mono text-[13px]">
        <div className="mb-2 text-red-400/80">
          due diligence error: {session.dueDiligence.error}
        </div>
        <button
          type="button"
          onClick={() => onGenerateDueDiligence(session.id)}
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
      onClick={() => onGenerateDueDiligence(session.id)}
      className="w-full px-5 py-4 text-left font-mono text-[13px] text-muted-foreground/80 transition-colors hover:bg-white/[0.02] hover:text-foreground apple-ease"
    >
      generate due diligence →
    </button>
  );
}

// ─────────── Tab control ───────────

function TabControl({
  session,
  onGenerateMemo,
  onGenerateDueDiligence,
  onSetActiveTab,
}: {
  session: AuditSession;
  onGenerateMemo: (sessionId: string) => void;
  onGenerateDueDiligence: (sessionId: string) => void;
  onSetActiveTab: (sessionId: string, tab: ActiveTab) => void;
}) {
  if (session.status !== "complete") return null;

  const tabs: { id: ActiveTab; label: string }[] = [
    { id: "memo", label: "Memo" },
    { id: "due_diligence", label: "Due Diligence" },
  ];

  return (
    <>
      <div className="flex border-t border-white/[0.06] px-5">
        {tabs.map((tab) => {
          const isActive = session.activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSetActiveTab(session.id, tab.id)}
              className={`mr-6 px-1 py-3 font-mono text-[12px] uppercase tracking-[0.05em] transition-colors ${
                isActive
                  ? "border-b-[1.5px] border-foreground text-foreground"
                  : "border-b-[1.5px] border-transparent text-muted-foreground/60 hover:text-foreground/80"
              }`}
              aria-pressed={isActive}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {session.activeTab === "memo" ? (
        <MemoContent session={session} onGenerateMemo={onGenerateMemo} />
      ) : (
        <DueDiligenceContent
          session={session}
          onGenerateDueDiligence={onGenerateDueDiligence}
        />
      )}
    </>
  );
}

// ─────────── Session panel ───────────

function SessionPanel({
  session,
  onGenerateMemo,
  onGenerateDueDiligence,
  onSetActiveTab,
}: {
  session: AuditSession;
  onGenerateMemo: (sessionId: string) => void;
  onGenerateDueDiligence: (sessionId: string) => void;
  onSetActiveTab: (sessionId: string, tab: ActiveTab) => void;
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

      {/* Tab bar + content (memo or due diligence) */}
      <TabControl
        session={session}
        onGenerateMemo={onGenerateMemo}
        onGenerateDueDiligence={onGenerateDueDiligence}
        onSetActiveTab={onSetActiveTab}
      />
    </div>
  );
}

// ─────────── Main exported component ───────────

export function AuditDashboard({
  audits,
  onGenerateMemo,
  onGenerateDueDiligence,
  onSetActiveTab,
}: {
  audits: AuditSession[];
  onGenerateMemo: (sessionId: string) => void;
  onGenerateDueDiligence: (sessionId: string) => void;
  onSetActiveTab: (sessionId: string, tab: ActiveTab) => void;
}) {
  if (audits.length === 0) return null;

  return (
    <div className="space-y-4">
      {audits.map((session) => (
        <SessionPanel
          key={session.id}
          session={session}
          onGenerateMemo={onGenerateMemo}
          onGenerateDueDiligence={onGenerateDueDiligence}
          onSetActiveTab={onSetActiveTab}
        />
      ))}
    </div>
  );
}
