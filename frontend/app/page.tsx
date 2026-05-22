"use client";

import { useState } from "react";
import {
  AuditDashboard,
  type ActiveTab,
  type AuditDimensionResult,
  type AuditSession,
  type DecisionMemo,
  type DimensionName,
  type DueDiligenceReport,
} from "@/components/AuditDashboard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "https://repolens-production-61e0.up.railway.app";

export default function Home() {
  const [url, setUrl] = useState("");
  const [audits, setAudits] = useState<AuditSession[]>([]);

  async function runAudit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;

    const sessionId = crypto.randomUUID();
    const repoUrl = url;
    const newSession: AuditSession = {
      id: sessionId,
      repoUrl,
      status: "running",
      startedAt: Date.now(),
      repoMeta: null,
      dimensions: {
        documentation: null,
        architecture: null,
        maintenance: null,
        testing: null,
        security: null,
      },
      overallScore: null,
      overallSeverity: null,
      memo: { status: "idle" },
      dueDiligence: { status: "idle" },
      activeTab: "memo",
    };

    setAudits((prev) => [newSession, ...prev]);
    setUrl("");

    const streamUrl = `${API_BASE}/audit/stream?repo_url=${encodeURIComponent(repoUrl)}`;
    const eventSource = new EventSource(streamUrl);

    const updateSession = (patch: Partial<AuditSession>) => {
      setAudits((prev) =>
        prev.map((a) => (a.id === sessionId ? { ...a, ...patch } : a))
      );
    };

    const updateDimension = (dim: DimensionName, result: AuditDimensionResult) => {
      setAudits((prev) =>
        prev.map((a) =>
          a.id === sessionId
            ? { ...a, dimensions: { ...a.dimensions, [dim]: result } }
            : a
        )
      );
    };

    eventSource.addEventListener("node_complete", (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data);
        const node = data.node as string;
        const { node: _drop, ...rest } = data;
        void _drop;

        if (node === "fetch") {
          updateSession({
            repoMeta: { owner: rest.owner, repo_name: rest.repo_name },
          });
        } else if (node === "aggregate") {
          updateSession({
            overallScore: rest.overall_score,
            overallSeverity: rest.overall_severity,
            status: "complete",
          });
          eventSource.close();
        } else if (
          node === "documentation" ||
          node === "architecture" ||
          node === "maintenance" ||
          node === "testing" ||
          node === "security"
        ) {
          updateDimension(node as DimensionName, rest as AuditDimensionResult);
        }
      } catch (err) {
        console.error("Failed to parse node_complete event:", err);
      }
    });

    eventSource.addEventListener("error", (e) => {
      // Backend-emitted error frame (event: error\ndata: {...}).
      // Custom-named events do NOT fire the built-in onerror handler — they
      // only land here.
      try {
        const data = JSON.parse((e as MessageEvent).data ?? "{}");
        updateSession({
          status: "error",
          error: data.error || "Audit failed",
        });
      } catch {
        updateSession({ status: "error", error: "Stream error" });
      }
      eventSource.close();
    });

    // Connection-level errors (TCP drop, server crash). Distinct from the
    // server-emitted "error" event above. Close immediately to suppress the
    // browser's default auto-retry.
    eventSource.onerror = () => {
      if (eventSource.readyState === EventSource.CLOSED) return;
      setAudits((prev) => {
        const current = prev.find((a) => a.id === sessionId);
        if (current?.status === "running") {
          return prev.map((a) =>
            a.id === sessionId
              ? { ...a, status: "error" as const, error: "Connection lost" }
              : a
          );
        }
        return prev;
      });
      eventSource.close();
    };
  }

  async function runMemo(sessionId: string) {
    const session = audits.find((a) => a.id === sessionId);
    if (!session || session.status !== "complete") return;
    if (session.overallScore === null || session.overallSeverity === null) return;

    setAudits((prev) =>
      prev.map((a) =>
        a.id === sessionId ? { ...a, memo: { status: "loading" } } : a
      )
    );

    const report = {
      repo_url: session.repoUrl,
      owner: session.repoMeta?.owner ?? "",
      repo_name: session.repoMeta?.repo_name ?? "",
      documentation: session.dimensions.documentation,
      architecture: session.dimensions.architecture,
      maintenance: session.dimensions.maintenance,
      testing: session.dimensions.testing,
      security: session.dimensions.security,
      overall_score: session.overallScore,
      overall_severity: session.overallSeverity,
    };

    try {
      const res = await fetch(`${API_BASE}/memo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(report),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const memo = (await res.json()) as DecisionMemo;
      setAudits((prev) =>
        prev.map((a) =>
          a.id === sessionId ? { ...a, memo: { status: "complete", memo } } : a
        )
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setAudits((prev) =>
        prev.map((a) =>
          a.id === sessionId
            ? { ...a, memo: { status: "error", error: message } }
            : a
        )
      );
    }
  }

  async function runDueDiligence(sessionId: string) {
    const current = audits.find((a) => a.id === sessionId);
    if (!current || current.status !== "complete") return;
    if (current.overallScore === null || current.overallSeverity === null) return;

    setAudits((prev) =>
      prev.map((a) =>
        a.id === sessionId
          ? { ...a, dueDiligence: { status: "loading", startedAt: Date.now() } }
          : a
      )
    );

    const payload = {
      repo_url: current.repoUrl,
      owner: current.repoMeta?.owner ?? "",
      repo_name: current.repoMeta?.repo_name ?? "",
      documentation: current.dimensions.documentation,
      architecture: current.dimensions.architecture,
      maintenance: current.dimensions.maintenance,
      testing: current.dimensions.testing,
      security: current.dimensions.security,
      overall_score: current.overallScore,
      overall_severity: current.overallSeverity,
    };

    try {
      const res = await fetch(`${API_BASE}/due-diligence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const report = (await res.json()) as DueDiligenceReport;
      setAudits((prev) =>
        prev.map((a) =>
          a.id === sessionId
            ? { ...a, dueDiligence: { status: "complete", report } }
            : a
        )
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setAudits((prev) =>
        prev.map((a) =>
          a.id === sessionId
            ? { ...a, dueDiligence: { status: "error", error: message } }
            : a
        )
      );
    }
  }

  function setActiveTab(sessionId: string, tab: ActiveTab) {
    setAudits((prev) =>
      prev.map((a) => (a.id === sessionId ? { ...a, activeTab: tab } : a))
    );
  }

  return (
    <div className="relative min-h-screen">
      {/* Subtle grid texture, no orbs, no gradient noise */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.025]"
        style={{
          backgroundImage:
            "linear-gradient(to right, oklch(0.7 0 0) 1px, transparent 1px), linear-gradient(to bottom, oklch(0.7 0 0) 1px, transparent 1px)",
          backgroundSize: "80px 80px",
        }}
      />

      {/* Top bar */}
      <header className="relative z-10 border-b border-white/[0.06]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-base tracking-tight text-foreground">repolens</span>
          </div>
          <div className="flex items-center gap-6 font-mono text-sm">
            <a
              href="https://github.com/Haichennn/repolens"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              github
            </a>
            <a
              href={`${API_BASE}/docs`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              api
            </a>
          </div>
        </div>
      </header>

      {/* Hero region — collapses when audits exist */}
      <section className={`relative z-10 mx-auto max-w-6xl px-6 transition-all duration-500 ${audits.length === 0 ? "py-24 md:py-32" : "py-12"}`}>
        <div className="grid grid-cols-1 gap-12 md:grid-cols-[1.2fr_1fr]">
          {/* Left: title + form */}
          <div className="flex flex-col justify-center">
            <p className="mb-6 font-mono text-xs uppercase tracking-[0.15em] text-muted-foreground/70">
              REPOLENS · v0.1
            </p>
            <h1 className="mb-6 font-mono text-4xl font-medium leading-[1.1] tracking-tight md:text-5xl">
              See what you&apos;re committing to.
            </h1>
            <p className="mb-10 max-w-md text-sm leading-relaxed text-muted-foreground">
              Repolens turns any GitHub URL into a structured read. Today: five-dimensional audit. Next: decision memos, dependency due diligence.
            </p>

            <form onSubmit={runAudit} autoComplete="off" className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                type="url"
                required
                autoComplete="off"
                placeholder="paste any github repo url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="h-12 flex-1 rounded-md border-white/[0.1] bg-white/[0.02] font-mono text-sm placeholder:text-muted-foreground/40 focus-visible:border-white/[0.25] focus-visible:ring-0"
              />
              <Button
                type="submit"
                size="lg"
                className="h-12 rounded-md bg-foreground px-6 font-mono text-sm text-background hover:bg-foreground/90"
              >
                run audit
                <ArrowRight className="ml-2 h-3.5 w-3.5" />
              </Button>
            </form>
          </div>

          {/* Right: meta / specs */}
          <div className="hidden md:flex md:flex-col md:justify-center md:gap-6 md:border-l md:border-white/[0.06] md:pl-12">
            <div className="font-mono text-xs">
              <div className="mb-2 text-muted-foreground/50">DIMENSIONS</div>
              <div className="space-y-1 text-foreground/80">
                <div>documentation</div>
                <div>architecture</div>
                <div>maintenance</div>
                <div>testing</div>
                <div>security</div>
              </div>
            </div>
            <div className="font-mono text-xs">
              <div className="mb-2 text-muted-foreground/50">ROADMAP</div>
              <div className="space-y-1 text-foreground/80">
                <div>decision memos</div>
                <div>due diligence</div>
                <div>comparative ranking</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Audit dashboard — only shown when audits exist */}
      {audits.length > 0 && (
        <section className="relative z-10 mx-auto max-w-6xl px-6 pb-32">
          <AuditDashboard
            audits={audits}
            onGenerateMemo={runMemo}
            onGenerateDueDiligence={runDueDiligence}
            onSetActiveTab={setActiveTab}
          />
        </section>
      )}

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/[0.06]">
        <div className="mx-auto flex max-w-6xl items-center justify-end px-6 py-6 font-mono text-[11px] text-muted-foreground/50">
          <span>joan duan · 2026</span>
        </div>
      </footer>
    </div>
  );
}
