import { FileJson, Clock, Cpu } from "lucide-react";
import { useAgentsStore } from "@/stores/agents-store";

export function StatusBar() {
  const { totalDetected, totalRunning } = useAgentsStore();

  return (
    <footer className="flex items-center justify-between px-4 py-1.5 border-t border-border bg-sidebar text-[11px] text-muted-foreground">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <Cpu size={12} />
          <span>
            {totalDetected} agent{totalDetected !== 1 ? "s" : ""} detected,{" "}
            {totalRunning} running
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <FileJson size={12} />
          <span>~/.agenthub/</span>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <Clock size={12} />
          <span>Auto-scan: 15s</span>
        </div>
      </div>
    </footer>
  );
}
