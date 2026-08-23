import type { RiskState } from "@/lib/types";

const labelMap: Record<RiskState, string> = {
  normal: "Normal",
  watch: "Watch",
  automation_like: "Automation-like",
  possible_bot: "Possible bot",
  known_agent: "Known agent",
  needs_review: "Needs review"
};

export function StatusBadge({ state }: { state: RiskState }) {
  return <span className={`badge ${state}`}>{labelMap[state]}</span>;
}
