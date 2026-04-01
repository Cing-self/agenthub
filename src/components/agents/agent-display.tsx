import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { DetectedAgent } from "@/lib/types/agents";

export type AgentTone = {
  glow: string;
  hero: string;
  icon: string;
  deck: string;
  deckSelected: string;
};

export function getAgentTone(agent: DetectedAgent | undefined): AgentTone {
  if (!agent) {
    return {
      glow: "bg-neutral-300/35 dark:bg-white/10",
      hero: "border-white/45 bg-white/72 dark:border-white/8 dark:bg-white/[0.04]",
      icon: "bg-white/80 text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] dark:bg-white/8",
      deck: "border-white/45 bg-white/65 hover:border-white/60 hover:bg-white/80 dark:border-white/7 dark:bg-white/[0.035] dark:hover:border-white/12 dark:hover:bg-white/[0.055]",
      deckSelected: "border-white/60 bg-white/86 shadow-[0_24px_60px_-36px_rgba(83,48,26,0.32)] dark:border-white/12 dark:bg-white/[0.08]",
    };
  }

  const runtimeFamily = agent.runtime_family || agent.runtime_profile?.runtime_family || agent.agent_type;

  if (agent.id === "openclaw" || agent.id === "autoclaw") {
    return {
      glow: "bg-orange-400/28 dark:bg-orange-500/16",
      hero: "border-orange-200/70 bg-[linear-gradient(135deg,rgba(255,248,243,0.96),rgba(255,239,229,0.72))] dark:border-orange-500/15 dark:bg-[linear-gradient(135deg,rgba(52,33,24,0.6),rgba(24,19,17,0.62))]",
      icon: "bg-[linear-gradient(135deg,rgba(255,255,255,0.95),rgba(255,236,226,0.92))] text-orange-600 shadow-[0_18px_38px_-28px_rgba(232,101,51,0.52)] dark:bg-[linear-gradient(135deg,rgba(232,101,51,0.18),rgba(255,255,255,0.06))] dark:text-orange-200",
      deck: "border-orange-100/70 bg-white/72 hover:border-orange-200/90 hover:bg-white/88 dark:border-orange-500/10 dark:bg-[linear-gradient(135deg,rgba(255,255,255,0.035),rgba(232,101,51,0.03))] dark:hover:border-orange-400/18 dark:hover:bg-[linear-gradient(135deg,rgba(255,255,255,0.05),rgba(232,101,51,0.06))]",
      deckSelected: "border-orange-200/85 bg-[linear-gradient(135deg,rgba(255,255,255,0.97),rgba(255,240,232,0.9))] shadow-[0_28px_60px_-36px_rgba(232,101,51,0.32)] dark:border-orange-400/22 dark:bg-[linear-gradient(135deg,rgba(255,255,255,0.07),rgba(232,101,51,0.12))]",
    };
  }

  if (agent.id === "qclaw") {
    return {
      glow: "bg-rose-300/28 dark:bg-rose-500/14",
      hero: "border-rose-200/70 bg-[linear-gradient(135deg,rgba(255,249,250,0.96),rgba(255,236,242,0.72))] dark:border-rose-500/14 dark:bg-[linear-gradient(135deg,rgba(54,28,39,0.58),rgba(24,17,22,0.62))]",
      icon: "bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(255,232,239,0.92))] text-rose-600 shadow-[0_18px_38px_-28px_rgba(225,29,72,0.4)] dark:bg-[linear-gradient(135deg,rgba(244,63,94,0.2),rgba(255,255,255,0.06))] dark:text-rose-200",
      deck: "border-rose-100/70 bg-white/72 hover:border-rose-200/90 hover:bg-white/88 dark:border-rose-500/10 dark:bg-[linear-gradient(135deg,rgba(255,255,255,0.035),rgba(244,63,94,0.03))] dark:hover:border-rose-400/18 dark:hover:bg-[linear-gradient(135deg,rgba(255,255,255,0.05),rgba(244,63,94,0.06))]",
      deckSelected: "border-rose-200/85 bg-[linear-gradient(135deg,rgba(255,255,255,0.97),rgba(255,237,242,0.9))] shadow-[0_28px_60px_-36px_rgba(225,29,72,0.25)] dark:border-rose-400/22 dark:bg-[linear-gradient(135deg,rgba(255,255,255,0.07),rgba(244,63,94,0.12))]",
    };
  }

  if (runtimeFamily === "claude-code") {
    return {
      glow: "bg-sky-300/26 dark:bg-sky-500/14",
      hero: "border-sky-200/70 bg-[linear-gradient(135deg,rgba(247,252,255,0.96),rgba(232,245,255,0.72))] dark:border-sky-500/14 dark:bg-[linear-gradient(135deg,rgba(25,42,58,0.56),rgba(18,20,25,0.64))]",
      icon: "bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(232,245,255,0.92))] text-sky-600 shadow-[0_18px_38px_-28px_rgba(56,189,248,0.42)] dark:bg-[linear-gradient(135deg,rgba(14,165,233,0.18),rgba(255,255,255,0.06))] dark:text-sky-200",
      deck: "border-sky-100/70 bg-white/72 hover:border-sky-200/90 hover:bg-white/88 dark:border-sky-500/10 dark:bg-[linear-gradient(135deg,rgba(255,255,255,0.035),rgba(14,165,233,0.03))] dark:hover:border-sky-400/18 dark:hover:bg-[linear-gradient(135deg,rgba(255,255,255,0.05),rgba(14,165,233,0.06))]",
      deckSelected: "border-sky-200/85 bg-[linear-gradient(135deg,rgba(255,255,255,0.97),rgba(235,247,255,0.92))] shadow-[0_28px_60px_-36px_rgba(56,189,248,0.24)] dark:border-sky-400/22 dark:bg-[linear-gradient(135deg,rgba(255,255,255,0.07),rgba(14,165,233,0.12))]",
    };
  }

  if (runtimeFamily === "codex") {
    return {
      glow: "bg-amber-300/26 dark:bg-amber-500/14",
      hero: "border-amber-200/70 bg-[linear-gradient(135deg,rgba(255,252,245,0.96),rgba(252,240,216,0.75))] dark:border-amber-500/14 dark:bg-[linear-gradient(135deg,rgba(58,43,25,0.58),rgba(23,20,17,0.64))]",
      icon: "bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(252,241,219,0.92))] text-amber-700 shadow-[0_18px_38px_-28px_rgba(245,158,11,0.42)] dark:bg-[linear-gradient(135deg,rgba(245,158,11,0.16),rgba(255,255,255,0.06))] dark:text-amber-200",
      deck: "border-amber-100/70 bg-white/72 hover:border-amber-200/90 hover:bg-white/88 dark:border-amber-500/10 dark:bg-[linear-gradient(135deg,rgba(255,255,255,0.035),rgba(245,158,11,0.03))] dark:hover:border-amber-400/18 dark:hover:bg-[linear-gradient(135deg,rgba(255,255,255,0.05),rgba(245,158,11,0.06))]",
      deckSelected: "border-amber-200/85 bg-[linear-gradient(135deg,rgba(255,255,255,0.97),rgba(255,244,220,0.92))] shadow-[0_28px_60px_-36px_rgba(245,158,11,0.24)] dark:border-amber-400/22 dark:bg-[linear-gradient(135deg,rgba(255,255,255,0.07),rgba(245,158,11,0.12))]",
    };
  }

  if (runtimeFamily === "opencode") {
    return {
      glow: "bg-emerald-300/26 dark:bg-emerald-500/14",
      hero: "border-emerald-200/70 bg-[linear-gradient(135deg,rgba(247,255,251,0.96),rgba(231,248,239,0.74))] dark:border-emerald-500/14 dark:bg-[linear-gradient(135deg,rgba(22,53,43,0.58),rgba(17,23,21,0.64))]",
      icon: "bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(228,247,238,0.92))] text-emerald-700 shadow-[0_18px_38px_-28px_rgba(16,185,129,0.4)] dark:bg-[linear-gradient(135deg,rgba(16,185,129,0.17),rgba(255,255,255,0.06))] dark:text-emerald-200",
      deck: "border-emerald-100/70 bg-white/72 hover:border-emerald-200/90 hover:bg-white/88 dark:border-emerald-500/10 dark:bg-[linear-gradient(135deg,rgba(255,255,255,0.035),rgba(16,185,129,0.03))] dark:hover:border-emerald-400/18 dark:hover:bg-[linear-gradient(135deg,rgba(255,255,255,0.05),rgba(16,185,129,0.06))]",
      deckSelected: "border-emerald-200/85 bg-[linear-gradient(135deg,rgba(255,255,255,0.97),rgba(232,248,240,0.92))] shadow-[0_28px_60px_-36px_rgba(16,185,129,0.22)] dark:border-emerald-400/22 dark:bg-[linear-gradient(135deg,rgba(255,255,255,0.07),rgba(16,185,129,0.12))]",
    };
  }

  return {
    glow: "bg-neutral-300/35 dark:bg-white/10",
    hero: "border-white/45 bg-white/72 dark:border-white/8 dark:bg-white/[0.04]",
    icon: "bg-white/80 text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] dark:bg-white/8",
    deck: "border-white/45 bg-white/65 hover:border-white/60 hover:bg-white/80 dark:border-white/7 dark:bg-white/[0.035] dark:hover:border-white/12 dark:hover:bg-white/[0.055]",
    deckSelected: "border-white/60 bg-white/86 shadow-[0_24px_60px_-36px_rgba(83,48,26,0.32)] dark:border-white/12 dark:bg-white/[0.08]",
  };
}

export function getAgentRuntimeLabel(agent: DetectedAgent) {
  const runtimeFamily = agent.runtime_family || agent.runtime_profile?.runtime_family || agent.agent_type;
  if (agent.id === "workbuddy") return "Workspace Copilot";
  if (agent.id === "qclaw") return "QClaw Runtime";
  if (agent.id === "autoclaw") return "AutoClaw Runtime";
  if (runtimeFamily === "openclaw") return "OpenClaw Gateway";
  if (runtimeFamily === "claude-code") return "Claude SDK Runtime";
  if (runtimeFamily === "codex") return "Codex CLI";
  if (runtimeFamily === "opencode") return "OpenCode Runtime";
  return "Agent Runtime";
}

export function getAgentSummary(agent: DetectedAgent) {
  switch (agent.details.type) {
    case "openclaw":
      return `${agent.details.agent_count} agents · ${agent.details.workspace_count} workspaces`;
    case "claude-code":
      return `${agent.details.project_count} projects · ${agent.details.has_skills ? "skills on" : "skills off"}`;
    case "codex":
      return agent.details.has_skills ? "skills enabled · local config" : "CLI ready · minimal setup";
    case "opencode":
      return `${agent.details.has_agents ? "custom agents" : "base agents"} · ${agent.details.has_skills ? "skills on" : "skills off"}`;
    case "custom-agent":
      return `${getAgentRuntimeLabel(agent)} · ${agent.details.auth_source || "runtime auth"}${agent.details.default_model ? ` · ${agent.details.default_model}` : ""}`;
    default:
      return "ready for routing";
  }
}

export function StatusBadge({ running }: { running: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium",
        running
          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"
          : "bg-black/[0.04] text-muted-foreground dark:bg-white/[0.06]",
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          running ? "bg-emerald-500" : "bg-muted-foreground/50",
        )}
      />
      {running ? "在线" : "待机"}
    </span>
  );
}

export function MetaPill({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-black/6 bg-white/60 px-3 py-1.5 text-[11px] text-foreground/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] dark:border-white/8 dark:bg-white/[0.05] dark:text-foreground/75">
      {icon}
      {label}
    </span>
  );
}

export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-[22px] border border-black/6 bg-white/58 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] dark:border-white/8 dark:bg-white/[0.04]">
      <div className="text-[11px] tracking-[0.16em] text-muted-foreground">{label}</div>
      <div className="mt-2 text-[22px] font-semibold tracking-tight">{value}</div>
      <div className="mt-1 text-[12px] text-muted-foreground">{hint}</div>
    </div>
  );
}
