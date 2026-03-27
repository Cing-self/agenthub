import { cn } from "@/lib/utils";

interface Option {
  value: string;
  label: string;
}

interface SelectRowProps {
  label: string;
  value: string;
  options: Option[];
  onSave?: (newValue: string) => void;
  placeholder?: string;
  hint?: string;
}

export function SelectRow({ label, value, options, onSave, placeholder, hint }: SelectRowProps) {
  const displayValue = options.find(o => o.value === value)?.label || value || placeholder || "—";

  if (!onSave) {
    return (
      <div className="flex items-center justify-between min-h-[44px] px-1">
        <div className="flex-1 pr-4">
          <div className="text-[13px]">{label}</div>
          {hint && <div className="text-[11px] text-muted-foreground mt-0.5 leading-tight">{hint}</div>}
        </div>
        <div className="text-[13px] text-muted-foreground">{displayValue}</div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between min-h-[44px] px-1">
      <div className="shrink-0 pr-4">
        <div className="text-[13px]">{label}</div>
        {hint && <div className="text-[11px] text-muted-foreground/50 mt-0.5 leading-tight max-w-[200px]">{hint}</div>}
      </div>
      <div className="flex items-center gap-1 text-foreground/70 hover:text-foreground cursor-pointer">
        <select
          value={value}
          onChange={(e) => onSave(e.target.value)}
          style={{
            WebkitAppearance: "none",
            MozAppearance: "none",
            appearance: "none",
            border: "none",
            outline: "none",
            background: "none",
            boxShadow: "none",
            padding: "0",
            margin: "0",
            font: "inherit",
            color: "inherit",
            lineHeight: "inherit",
            textAlignLast: "right",
            direction: "rtl",
          }}
          className="cursor-pointer text-[13px]"
        >
          {placeholder && <option value="" style={{ direction: "ltr" }}>{placeholder}</option>}
          {options.map(o => (
            <option key={o.value} value={o.value} style={{ direction: "ltr" }}>{o.label}</option>
          ))}
        </select>
        <svg className="shrink-0 text-muted-foreground/30" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </div>
    </div>
  );
}

export default SelectRow;
