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
  groupId: string;
  repoUrl: string;
  status: "running" | "complete" | "error";
  startedAt: number;

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

export type ComparisonGroup = {
  id: string;
  sessions: AuditSession[];
  createdAt: number;
};

const DIMENSIONS: DimensionName[] = ["documentation", "architecture", "maintenance", "testing", "security"];
const RISK_LEVELS: RiskLevel[] = ["critical", "high", "medium", "low"];
const MAX_COMPARISON_SIZE = 4;

// Shared className tokens — bumped contrast section labels (FINDINGS, etc.)
const SECTION_LABEL = "font-mono text-[11px] font-medium tracking-[0.1em] text-muted-foreground/80";

// ─────────── Helpers ───────────

function severityColor(severity: Severity | null): string {
  if (severity === "good") return "oklch(0.65 0.12 150)";
  if (severity === "warning") return "oklch(0.7 0.15 50)";
  if (severity === "critical") return "oklch(0.6 0.2 25)";
  return "oklch(0.5 0 0)";
}

function severityLabel(severity: Severity | null, status: AuditSession["status"]): string {
  if (severity !== null) return severity.toUpperCase();
  if (status === "error") return "ERROR";
  if (status === "running") return "RUNNING";
  return "PENDING";
}

function verdictColor(verdict: Verdict): string {
  if (verdict === "adopt") return "oklch(0.65 0.12 150)";
  if (verdict === "adopt_with_caution") return "oklch(0.7 0.15 50)";
  return "oklch(0.6 0.2 25)";
}

function verdictLabel(verdict: Verdict): string {
  if (verdict === "adopt") return "ADOPT";
  if (verdict === "adopt_with_caution") return "ADOPT WITH CAUTION";
  return "PASS";
}

function riskColor(level: RiskLevel): string {
  if (level === "low") return "oklch(0.65 0.12 150)";
  if (level === "medium") return "oklch(0.7 0.15 70)";
  if (level === "high") return "oklch(0.7 0.15 50)";
  return "oklch(0.6 0.2 25)";
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

// ─────────── Audit row (single-session view) ───────────

function ScoreBar({ score, severity, status }: { score: number | null; severity: Severity | null; status: AuditSession["status"] }) {
  if (score === null) {
    if (status === "running") return <ScanBar />;
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
          className="text-right text-[16px] tabular-nums"
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
          className="mb-1 ml-0 mt-2 border-l-2 px-5 py-4 text-[14px]"
          style={{ borderColor: color, background: "oklch(1 0 0 / 0.015)" }}
        >
          <div className="mb-3 text-[15px] leading-relaxed text-foreground/90">{result.summary}</div>

          <div className={`mb-1 ${SECTION_LABEL}`}>FINDINGS</div>
          <ul className="mb-4 space-y-1 text-[15px] leading-relaxed text-foreground/90">
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

          <div className={`mb-1 ${SECTION_LABEL}`}>RECOMMENDATIONS</div>
          <ul className="space-y-1 text-[15px] leading-relaxed text-foreground/90">
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
  const showNextSteps = memo.verdict === "adopt" || memo.verdict === "adopt_with_caution";

  return (
    <div
      className="border-l-2 px-5 py-5"
      style={{ borderLeftColor: color, background: "oklch(1 0 0 / 0.015)" }}
    >
      <div className="mb-4 flex items-center gap-3">
        <span
          className="rounded-sm px-2.5 py-1 font-mono text-[11px] tracking-[0.1em]"
          style={{ color, border: `1.5px solid ${color}`, background: "oklch(1 0 0 / 0.02)" }}
        >
          {verdictLabel(memo.verdict)}
        </span>
        <span className={SECTION_LABEL}>DECISION MEMO</span>
      </div>

      <p className="mb-6 text-[16px] italic leading-snug text-foreground/90">
        {memo.verdict_rationale}
      </p>

      <div className="mb-5">
        <div className={`mb-2 ${SECTION_LABEL}`}>STRENGTHS</div>
        <ul className="space-y-1.5 text-[15px] leading-relaxed text-foreground/90">
          {memo.strengths.map((s, i) => (
            <li key={i} className="flex gap-2">
              <span className="flex-shrink-0 select-none" style={{ color: verdictColor("adopt") }}>·</span>
              <span>{s}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mb-5">
        <div className={`mb-2 ${SECTION_LABEL}`}>CONCERNS</div>
        <ul className="space-y-1.5 text-[15px] leading-relaxed text-foreground/90">
          {memo.concerns.map((c, i) => (
            <li key={i} className="flex gap-2">
              <span className="flex-shrink-0 select-none" style={{ color: verdictColor("adopt_with_caution") }}>·</span>
              <span>{c}</span>
            </li>
          ))}
        </ul>
      </div>

      {showNextSteps && (
        <div className="mb-5">
          <div className={`mb-2 ${SECTION_LABEL}`}>NEXT STEPS IF ADOPTING</div>
          <ol className="space-y-1.5 text-[15px] leading-relaxed text-foreground/90">
            {memo.next_steps_if_adopting.map((step, i) => (
              <li key={i} className="flex gap-2">
                <span className="flex-shrink-0 select-none text-muted-foreground/40">→</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div>
        <div className={`mb-2 ${SECTION_LABEL}`}>RED FLAGS TO MONITOR</div>
        <ul className="space-y-1.5 text-[15px] leading-relaxed text-foreground/90">
          {memo.red_flags_to_monitor.map((flag, i) => (
            <li key={i} className="flex gap-2">
              <span className="flex-shrink-0 select-none" style={{ color: verdictColor("pass") }}>·</span>
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
  if (session.memo.status === "complete") return <MemoCard memo={session.memo.memo} />;

  if (session.memo.status === "loading") {
    return (
      <div className="px-5 py-4">
        <div className="mb-2 font-mono text-[14px] text-muted-foreground/80">generating decision memo...</div>
        <ScanBar />
      </div>
    );
  }

  if (session.memo.status === "error") {
    return (
      <div className="px-5 py-4 font-mono text-[14px]">
        <div className="mb-2 text-red-400/80">memo error: {session.memo.error}</div>
        <button
          type="button"
          onClick={() => onGenerateMemo(session.id)}
          className="text-muted-foreground/80 underline-offset-2 transition-colors hover:text-foreground hover:underline"
        >
          retry
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onGenerateMemo(session.id)}
      className="w-full px-5 py-4 text-left font-mono text-[14px] text-muted-foreground/85 transition-colors hover:bg-white/[0.02] hover:text-foreground apple-ease"
    >
      generate decision memo →
    </button>
  );
}

// ─────────── Due diligence ───────────

function DepRow({ dep }: { dep: DependencyAssessment }) {
  const isAbandoned = dep.days_since_last_release !== null && dep.days_since_last_release > 365;
  const downloadsLabel = dep.monthly_downloads !== null ? formatDownloads(dep.monthly_downloads) : null;
  const licenseColor: string | undefined =
    dep.license_compatible_commercial === true
      ? "oklch(0.65 0.12 150)"
      : dep.license_compatible_commercial === false
      ? "oklch(0.6 0.2 25)"
      : undefined;

  return (
    <div className="border-t border-white/[0.04] px-4 py-3">
      <div className="flex items-baseline gap-2 font-mono">
        <span className="text-[11px] tracking-[0.05em] text-muted-foreground/60">[{dep.ecosystem}]</span>
        <span className="text-[15px] text-foreground">{dep.package_name}</span>
        {dep.declared_version && (
          <span className="text-[12px] text-muted-foreground/70">{dep.declared_version}</span>
        )}
      </div>

      {dep.risk_factors.length > 0 && (
        <ul className="mt-2 space-y-1 text-[13px] leading-relaxed text-foreground/90">
          {dep.risk_factors.map((f, i) => (
            <li key={i} className="flex gap-2">
              <span className="flex-shrink-0 select-none text-muted-foreground/50">·</span>
              <span>{f}</span>
            </li>
          ))}
        </ul>
      )}

      {dep.alternative_packages.length > 0 && (
        <div className="mt-2 text-[13px] leading-relaxed text-foreground/85">
          <span className="text-muted-foreground/70">Alternatives:</span>{" "}
          <span className="font-mono text-foreground">{dep.alternative_packages.join(", ")}</span>
          {dep.alternative_reasoning && (
            <span className="text-foreground/80"> — {dep.alternative_reasoning}</span>
          )}
        </div>
      )}

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[12px] text-foreground/65 tabular-nums">
        {dep.license && (
          <span style={licenseColor ? { color: licenseColor } : undefined}>license: {dep.license}</span>
        )}
        {downloadsLabel !== null && dep.popularity_tier !== "unknown" && (
          <span>popularity: {formatPopularityTier(dep.popularity_tier)} ({downloadsLabel}/mo)</span>
        )}
        {downloadsLabel !== null && dep.popularity_tier === "unknown" && (
          <span>downloads: {downloadsLabel}/mo</span>
        )}
        {isAbandoned && (
          <span style={{ color: "oklch(0.7 0.15 50)" }}>{dep.days_since_last_release} days since release</span>
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
        className="flex w-full items-center justify-between px-4 py-3 font-mono text-[14px] font-medium tracking-[0.1em] transition-colors hover:bg-white/[0.02]"
        aria-expanded={open}
      >
        <div className="flex items-center gap-3">
          <span style={{ color: isEmpty ? "oklch(0.45 0 0)" : color }}>{level.toUpperCase()}</span>
          <span
            className="rounded-sm border px-2 py-0.5 text-[13px] tabular-nums"
            style={{
              color: isEmpty ? "oklch(0.45 0 0)" : color,
              borderColor: isEmpty ? "oklch(0.25 0 0)" : color,
            }}
          >
            {deps.length}
          </span>
        </div>
        <span className="text-muted-foreground/50">
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </span>
      </button>

      {open && (
        <div>
          {isEmpty ? (
            <div className="border-t border-white/[0.04] px-4 py-3 font-mono text-[13px] text-muted-foreground/50">none</div>
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

  const byLevel: Record<RiskLevel, DependencyAssessment[]> = {
    critical: [],
    high: [],
    medium: [],
    low: [],
  };
  for (const dep of report.dependencies) byLevel[dep.risk_level].push(dep);

  const stats: string[] = [];
  if (report.high_risk_count > 0) stats.push(`${report.high_risk_count} high risk`);
  if (report.medium_risk_count > 0) stats.push(`${report.medium_risk_count} medium risk`);
  if (report.abandoned_packages.length > 0) stats.push(`${report.abandoned_packages.length} abandoned`);
  if (report.commercial_blockers.length > 0) stats.push(`${report.commercial_blockers.length} commercial blockers`);

  return (
    <div className="px-5 py-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[12px] font-medium tracking-[0.1em] text-muted-foreground/80">
            OVERALL RISK
          </span>
          <span
            className="rounded-sm px-2.5 py-1 font-mono text-[13px] tracking-[0.1em]"
            style={{ color, border: `1.5px solid ${color}`, background: "oklch(1 0 0 / 0.02)" }}
          >
            {report.overall_risk_level.toUpperCase()}
          </span>
        </div>
        <div className="font-mono text-[13px] text-foreground/70 tabular-nums">
          {report.total_dependencies} deps · {report.python_dependencies} python · {report.node_dependencies} node
        </div>
      </div>

      <p className="mb-4 text-[15px] italic leading-relaxed text-foreground/90">{report.overall_summary}</p>

      {stats.length > 0 && (
        <div className="mb-6 font-mono text-[13px] text-foreground/70 tabular-nums">{stats.join(" · ")}</div>
      )}

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

  useEffect(() => {
    if (session.dueDiligence.status !== "loading") return;
    const id = setInterval(() => setTick((t) => t + 1), 200);
    return () => clearInterval(id);
  }, [session.dueDiligence.status]);

  if (session.dueDiligence.status === "complete") return <DueDiligenceCard report={session.dueDiligence.report} />;

  if (session.dueDiligence.status === "loading") {
    return (
      <div className="px-5 py-4">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="font-mono text-[14px] text-muted-foreground/80">investigating supply chain...</span>
          <span className="font-mono text-[12px] tabular-nums text-muted-foreground/60">
            {elapsed(session.dueDiligence.startedAt)}
          </span>
        </div>
        <ScanBar />
        <div className="mt-2 font-mono text-[12px] text-muted-foreground/55">
          fetching registry data + LLM risk assessment · typically ~45s
        </div>
      </div>
    );
  }

  if (session.dueDiligence.status === "error") {
    return (
      <div className="px-5 py-4 font-mono text-[14px]">
        <div className="mb-2 text-red-400/80">due diligence error: {session.dueDiligence.error}</div>
        <button
          type="button"
          onClick={() => onGenerateDueDiligence(session.id)}
          className="text-muted-foreground/80 underline-offset-2 transition-colors hover:text-foreground hover:underline"
        >
          retry
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onGenerateDueDiligence(session.id)}
      className="w-full px-5 py-4 text-left font-mono text-[14px] text-muted-foreground/85 transition-colors hover:bg-white/[0.02] hover:text-foreground apple-ease"
    >
      generate due diligence →
    </button>
  );
}

// ─────────── Tab control (single-session only) ───────────

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
              className={`mr-6 px-1 py-3 font-mono text-[13px] uppercase tracking-[0.05em] transition-colors ${
                isActive
                  ? "border-b-[1.5px] border-foreground text-foreground"
                  : "border-b-[1.5px] border-transparent text-muted-foreground/70 hover:text-foreground/85"
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
        <DueDiligenceContent session={session} onGenerateDueDiligence={onGenerateDueDiligence} />
      )}
    </>
  );
}

// ─────────── Add-to-comparison control ───────────

function AddComparisonControl({
  groupId,
  currentCount,
  onAddToComparison,
}: {
  groupId: string;
  currentCount: number;
  onAddToComparison: (repoUrl: string, groupId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");

  if (currentCount >= MAX_COMPARISON_SIZE) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full border-t border-white/[0.06] px-5 py-3 text-left font-mono text-[13px] text-muted-foreground/80 transition-colors hover:bg-white/[0.02] hover:text-foreground"
      >
        + add another repo to compare
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = input.trim();
        if (!trimmed) return;
        onAddToComparison(trimmed, groupId);
        setInput("");
        setOpen(false);
      }}
      autoComplete="off"
      className="flex items-center gap-2 border-t border-white/[0.06] px-5 py-3"
    >
      <input
        type="url"
        required
        autoComplete="off"
        autoFocus
        placeholder="github.com/owner/repo"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        className="h-9 flex-1 rounded-sm border border-white/[0.1] bg-white/[0.02] px-3 font-mono text-[13px] text-foreground placeholder:text-muted-foreground/40 focus:border-white/[0.25] focus:outline-none"
      />
      <button
        type="submit"
        className="h-9 rounded-sm bg-foreground px-4 font-mono text-[13px] text-background transition-colors hover:bg-foreground/90"
      >
        audit
      </button>
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          setInput("");
        }}
        className="h-9 px-2 font-mono text-[13px] text-muted-foreground/70 hover:text-foreground"
      >
        cancel
      </button>
    </form>
  );
}

// ─────────── Session panel (single-session view) ───────────

function SessionPanel({
  session,
  onGenerateMemo,
  onGenerateDueDiligence,
  onSetActiveTab,
  onAddToComparison,
}: {
  session: AuditSession;
  onGenerateMemo: (sessionId: string) => void;
  onGenerateDueDiligence: (sessionId: string) => void;
  onSetActiveTab: (sessionId: string, tab: ActiveTab) => void;
  onAddToComparison: (repoUrl: string, groupId: string) => void;
}) {
  const [expanded, setExpanded] = useState<Set<DimensionName>>(new Set());
  const [, setTick] = useState(0);

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
      <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3 font-mono text-[14px]">
        <div className="flex items-baseline gap-3">
          <span className="text-foreground/80">{shortRepoLabel(session.repoUrl)}</span>
          {session.status === "running" && (
            <span className="text-muted-foreground/70">running · {elapsed(session.startedAt)}</span>
          )}
          {session.status === "complete" && session.overallScore !== null && (
            <span className="text-[15px] tabular-nums" style={{ color: overallColor }}>
              {session.overallScore}/100 · {session.overallSeverity}
            </span>
          )}
          {session.status === "error" && <span className="text-red-400/85">error: {session.error}</span>}
        </div>
        <a
          href={session.repoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground/60 transition-colors hover:text-muted-foreground"
        >
          ↗
        </a>
      </div>

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

      {session.status === "complete" && (
        <AddComparisonControl
          groupId={session.groupId}
          currentCount={1}
          onAddToComparison={onAddToComparison}
        />
      )}

      <TabControl
        session={session}
        onGenerateMemo={onGenerateMemo}
        onGenerateDueDiligence={onGenerateDueDiligence}
        onSetActiveTab={onSetActiveTab}
      />
    </div>
  );
}

// ─────────── Comparison view (2+ sessions in group) ───────────

function ComparisonScoreCell({
  result,
  isBest,
  isWorst,
  sessionStatus,
}: {
  result: AuditDimensionResult | null;
  isBest: boolean;
  isWorst: boolean;
  sessionStatus: AuditSession["status"];
}) {
  if (result === null) {
    return (
      <div className="border-l border-white/[0.04] px-3 py-3">
        <ScoreBar score={null} severity={null} status={sessionStatus} />
      </div>
    );
  }

  const color = severityColor(result.severity);

  return (
    <div className="border-l border-white/[0.04] px-3 py-3">
      <div className="mb-1.5 flex items-baseline gap-2">
        <span className="font-mono text-[16px] tabular-nums" style={{ color }}>
          {result.score}
        </span>
        {isBest && <span style={{ color: "oklch(0.65 0.12 150)" }}>●</span>}
        {isWorst && !isBest && <span style={{ color: "oklch(0.6 0.2 25)" }}>●</span>}
      </div>
      <div className="relative h-[3px] w-full bg-white/[0.05]">
        <div
          className="absolute inset-y-0 left-0 transition-all duration-500"
          style={{ width: `${result.score}%`, background: color }}
        />
      </div>
    </div>
  );
}

function ComparisonDrilldown({
  dimension,
  sessions,
  gridCols,
}: {
  dimension: DimensionName;
  sessions: AuditSession[];
  gridCols: string;
}) {
  return (
    <div className="grid bg-white/[0.01]" style={{ gridTemplateColumns: gridCols }}>
      <div className={`border-b border-white/[0.04] px-5 py-3 ${SECTION_LABEL}`}>
        DETAILS
      </div>
      {sessions.map((s) => {
        const result = s.dimensions[dimension];
        const color = severityColor(result?.severity ?? null);
        return (
          <div
            key={s.id}
            className="border-l border-b border-white/[0.04] px-3 py-3"
            style={{ borderLeftWidth: result ? "2px" : "1px", borderLeftColor: result ? color : undefined }}
          >
            {result === null ? (
              <div className="font-mono text-[12px] text-muted-foreground/55">
                {s.status === "running" ? "still running..." : "no data"}
              </div>
            ) : (
              <>
                <div className="mb-2 text-[13px] leading-relaxed text-foreground/90">{result.summary}</div>
                <div className="mb-1 font-mono text-[11px] font-medium tracking-[0.1em] text-muted-foreground/80">FINDINGS</div>
                <ul className="mb-3 space-y-1 text-[13px] leading-relaxed text-foreground/90">
                  {result.findings.slice(0, 5).map((f, i) => {
                    const isPositive = /^(✓|✅|Positive|Excellent|Strong|Healthy|Clean|Good|Active|positive)/i.test(f);
                    return (
                      <li key={i} className="flex gap-1.5">
                        <span className="flex-shrink-0 select-none" style={{ color: isPositive ? severityColor("good") : "oklch(0.55 0 0)" }}>
                          {isPositive ? "+" : "·"}
                        </span>
                        <span>{f.replace(/^[✓✅✗✘·\-+\*]\s*/, "").replace(/^(Positive|Negative|Critical|Missing|Weakness):\s*/i, "")}</span>
                      </li>
                    );
                  })}
                </ul>
                <div className="mb-1 font-mono text-[11px] font-medium tracking-[0.1em] text-muted-foreground/80">RECOMMENDATIONS</div>
                <ul className="space-y-1 text-[13px] leading-relaxed text-foreground/90">
                  {result.recommendations.slice(0, 3).map((r, i) => (
                    <li key={i} className="flex gap-1.5">
                      <span className="flex-shrink-0 select-none text-muted-foreground/40">→</span>
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ComparisonRanking({ sessions }: { sessions: AuditSession[] }) {
  const ranked = sessions
    .filter((s) => s.status === "complete" && s.overallScore !== null)
    .map((s) => ({
      session: s,
      overall: s.overallScore!,
      wins: [] as DimensionName[],
    }));

  if (ranked.length < 2) return null;

  ranked.sort((a, b) => b.overall - a.overall);

  for (const dim of DIMENSIONS) {
    let bestScore = -1;
    let winnerId: string | null = null;
    for (const r of ranked) {
      const s = r.session.dimensions[dim]?.score ?? -1;
      if (s > bestScore) {
        bestScore = s;
        winnerId = r.session.id;
      }
    }
    if (winnerId !== null && bestScore >= 0) {
      const entry = ranked.find((r) => r.session.id === winnerId);
      entry?.wins.push(dim);
    }
  }

  return (
    <div className="border-t border-white/[0.06] px-5 py-4">
      <div className="mb-3 font-mono text-[12px] font-medium tracking-[0.1em] text-muted-foreground/80">RANKING</div>
      <div className="space-y-3">
        {ranked.map((entry, i) => (
          <div key={entry.session.id} className="font-mono">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-[15px] tabular-nums text-foreground">#{i + 1}</span>
              <a
                href={entry.session.repoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[15px] text-foreground/90 hover:underline"
              >
                {shortRepoLabel(entry.session.repoUrl)}
              </a>
              <span className="text-[16px] tabular-nums" style={{ color: severityColor(entry.session.overallSeverity) }}>
                {entry.overall}
              </span>
              {i === 0 && (
                <span className="text-[13px] text-muted-foreground/85">★ best overall</span>
              )}
            </div>
            <div className="mt-0.5 ml-6 text-[13px] text-muted-foreground/85">
              {entry.wins.length === 0
                ? "(no category wins)"
                : `wins on: ${entry.wins.join(", ")}`}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ComparisonView({
  group,
  onAddToComparison,
}: {
  group: ComparisonGroup;
  // V3 TODO: Memo and Due Diligence are not surfaced in comparison view.
  // Comparison view is its own depth layer — adding per-column memo/DD tabs
  // would require either dropdown-per-column or modal overlay; out of V1 scope.
  onAddToComparison: (repoUrl: string, groupId: string) => void;
}) {
  const sessions = group.sessions;
  const [expanded, setExpanded] = useState<Set<DimensionName>>(new Set());
  const [, setTick] = useState(0);

  useEffect(() => {
    const anyRunning = sessions.some((s) => s.status === "running");
    if (!anyRunning) return;
    const id = setInterval(() => setTick((t) => t + 1), 100);
    return () => clearInterval(id);
  }, [sessions]);

  function toggle(dim: DimensionName) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(dim)) next.delete(dim);
      else next.add(dim);
      return next;
    });
  }

  const bestPerDim: Record<DimensionName, number | null> = {
    documentation: null,
    architecture: null,
    maintenance: null,
    testing: null,
    security: null,
  };
  const worstPerDim: Record<DimensionName, number | null> = {
    documentation: null,
    architecture: null,
    maintenance: null,
    testing: null,
    security: null,
  };
  for (const dim of DIMENSIONS) {
    const scores = sessions
      .map((s) => s.dimensions[dim]?.score)
      .filter((s): s is number => typeof s === "number");
    if (scores.length >= 2) {
      bestPerDim[dim] = Math.max(...scores);
      worstPerDim[dim] = Math.min(...scores);
    } else if (scores.length === 1) {
      bestPerDim[dim] = scores[0];
    }
  }

  const gridCols = `180px ${Array(sessions.length).fill("1fr").join(" ")}`;

  return (
    <div className="border border-white/[0.06] bg-white/[0.015]">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3 font-mono text-[13px] uppercase tracking-[0.1em]">
        <span className="text-foreground/85">comparing {sessions.length} repos</span>
        <span className="text-foreground/65">
          {sessions.filter((s) => s.status === "complete").length}/{sessions.length} complete
        </span>
      </div>

      {/* Repo header row */}
      <div className="grid border-b border-white/[0.06]" style={{ gridTemplateColumns: gridCols }}>
        <div />
        {sessions.map((s) => (
          <div key={s.id} className="border-l border-white/[0.04] px-3 py-3">
            <a
              href={s.repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block truncate font-mono text-[15px] text-foreground hover:underline"
              title={shortRepoLabel(s.repoUrl)}
            >
              {shortRepoLabel(s.repoUrl)}
            </a>
            <div className="mt-1 font-mono text-[14px]">
              {s.status === "complete" && s.overallScore !== null ? (
                <span className="tabular-nums" style={{ color: severityColor(s.overallSeverity) }}>
                  {s.overallScore}/100 · {s.overallSeverity}
                </span>
              ) : s.status === "error" ? (
                <span className="text-red-400/85">error</span>
              ) : (
                <span className="text-muted-foreground/70">running · {elapsed(s.startedAt)}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Dimension rows */}
      {DIMENSIONS.map((dim) => {
        const isExpanded = expanded.has(dim);
        const anyComplete = sessions.some((s) => s.dimensions[dim] !== null);
        return (
          <div key={dim}>
            <div className="grid border-b border-white/[0.04]" style={{ gridTemplateColumns: gridCols }}>
              <button
                type="button"
                onClick={anyComplete ? () => toggle(dim) : undefined}
                disabled={!anyComplete}
                className={`flex items-center justify-between px-5 py-3 text-left font-mono text-[15px] transition-colors ${
                  anyComplete ? "cursor-pointer text-foreground hover:bg-white/[0.02]" : "text-muted-foreground/50"
                }`}
                aria-expanded={isExpanded}
              >
                <span>{dim}</span>
                {anyComplete && (
                  <span className="text-muted-foreground/50">
                    {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  </span>
                )}
              </button>
              {sessions.map((s) => {
                const result = s.dimensions[dim];
                const score = result?.score;
                const isBest =
                  bestPerDim[dim] !== null &&
                  typeof score === "number" &&
                  score === bestPerDim[dim];
                const isWorst =
                  worstPerDim[dim] !== null &&
                  typeof score === "number" &&
                  score === worstPerDim[dim] &&
                  bestPerDim[dim] !== worstPerDim[dim];
                return (
                  <ComparisonScoreCell
                    key={s.id}
                    result={result}
                    isBest={isBest}
                    isWorst={isWorst}
                    sessionStatus={s.status}
                  />
                );
              })}
            </div>
            {isExpanded && (
              <ComparisonDrilldown dimension={dim} sessions={sessions} gridCols={gridCols} />
            )}
          </div>
        );
      })}

      <AddComparisonControl
        groupId={group.id}
        currentCount={sessions.length}
        onAddToComparison={onAddToComparison}
      />

      <ComparisonRanking sessions={sessions} />
    </div>
  );
}

// ─────────── Main exported component ───────────

export function AuditDashboard({
  groups,
  onGenerateMemo,
  onGenerateDueDiligence,
  onSetActiveTab,
  onAddToComparison,
}: {
  groups: ComparisonGroup[];
  onGenerateMemo: (sessionId: string) => void;
  onGenerateDueDiligence: (sessionId: string) => void;
  onSetActiveTab: (sessionId: string, tab: ActiveTab) => void;
  onAddToComparison: (repoUrl: string, groupId: string) => void;
}) {
  if (groups.length === 0) return null;

  return (
    <div className="space-y-4">
      {groups.map((group) => {
        if (group.sessions.length === 1) {
          return (
            <SessionPanel
              key={group.id}
              session={group.sessions[0]}
              onGenerateMemo={onGenerateMemo}
              onGenerateDueDiligence={onGenerateDueDiligence}
              onSetActiveTab={onSetActiveTab}
              onAddToComparison={onAddToComparison}
            />
          );
        }
        return (
          <ComparisonView
            key={group.id}
            group={group}
            onAddToComparison={onAddToComparison}
          />
        );
      })}
    </div>
  );
}
