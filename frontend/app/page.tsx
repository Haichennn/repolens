"use client";

import { useState } from "react";
import { AuditDashboard, type AuditSession } from "@/components/AuditDashboard";
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
    const newSession: AuditSession = {
      id: sessionId,
      repoUrl: url,
      status: "running",
      startedAt: Date.now(),
      fullReport: null,
    };

    setAudits((prev) => [newSession, ...prev]);
    setUrl("");

    try {
      const res = await fetch(`${API_BASE}/audit?repo_url=${encodeURIComponent(newSession.repoUrl)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const report = await res.json();
      setAudits((prev) =>
        prev.map((a) =>
          a.id === sessionId ? { ...a, status: "complete", fullReport: report } : a
        )
      );
    } catch (err) {
      setAudits((prev) =>
        prev.map((a) =>
          a.id === sessionId
            ? { ...a, status: "error", error: err instanceof Error ? err.message : "unknown error" }
            : a
        )
      );
    }
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
          <AuditDashboard audits={audits} />
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
