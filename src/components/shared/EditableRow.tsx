import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

interface EditableRowProps {
  label: string;
  value: string;
  mono?: boolean;
  onSave?: (newValue: string) => void;
  placeholder?: string;
  type?: "text" | "number" | "toggle";
  hint?: string;
}

export function EditableRow({ label, value, mono, onSave, placeholder, type = "text", hint }: EditableRowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setDraft(value); }, [value]);
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const handleConfirm = () => {
    if (draft !== value && onSave) onSave(draft);
    setEditing(false);
  };

  if (type === "toggle") {
    const isOn = value === "true" || value === "enabled";
    return (
      <div className="flex items-center justify-between min-h-[44px] px-1">
        <div className="flex-1 pr-4">
          <div className="text-[13px]">{label}</div>
          {hint && <div className="text-[11px] text-muted-foreground mt-0.5 leading-tight">{hint}</div>}
        </div>
        <button
          onClick={() => onSave?.(isOn ? "false" : "true")}
          disabled={!onSave}
          className={cn(
            "relative inline-flex h-[22px] w-[40px] shrink-0 items-center rounded-full transition-colors duration-200",
            isOn ? "bg-foreground/80" : "bg-foreground/10",
            !onSave && "opacity-30 cursor-not-allowed"
          )}
        >
          <span className={cn(
            "inline-block h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-transform duration-200",
          )} style={{ transform: isOn ? "translateX(20px)" : "translateX(2px)" }} />
        </button>
      </div>
    );
  }

  if (!onSave) {
    return (
      <div className="flex items-center justify-between min-h-[44px] px-1">
        <div className="flex-1 pr-4">
          <div className="text-[13px]">{label}</div>
          {hint && <div className="text-[11px] text-muted-foreground mt-0.5 leading-tight">{hint}</div>}
        </div>
        <div className={cn("text-[13px] text-muted-foreground", mono && "font-mono text-[12px]")}>{value || "—"}</div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between min-h-[44px] px-1">
      <div className="shrink-0 pr-4">
        <div className="text-[13px]">{label}</div>
        {hint && <div className="text-[11px] text-muted-foreground mt-0.5 leading-tight max-w-[200px]">{hint}</div>}
      </div>
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleConfirm();
            if (e.key === "Escape") { setDraft(value); setEditing(false); }
          }}
          onBlur={handleConfirm}
          placeholder={placeholder}
          className={cn(
            "text-right bg-transparent border-none outline-none text-[13px] w-[240px]",
            "placeholder:text-muted-foreground",
            mono && "font-mono text-[12px]"
          )}
        />
      ) : (
        <button
          onClick={() => setEditing(true)}
          className={cn(
            "text-right text-[13px] rounded-md px-2 py-1 -mr-2 transition-colors",
            "hover:bg-foreground/5",
            mono && "font-mono text-[12px]",
            value ? "text-foreground/80" : "text-muted-foreground"
          )}
        >
          {value || placeholder || "设置"}
        </button>
      )}
    </div>
  );
}

export default EditableRow;
