import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

interface Props {
  config: Record<string, unknown> | null;
  onSave?: (config: Record<string, unknown>) => Promise<void>;
}

export default function RawTab({ config, onSave }: Props) {
  const originalJson = config ? JSON.stringify(config, null, 2) : "{}";
  const [text, setText] = useState(originalJson);
  const [parseError, setParseError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setText(originalJson); setParseError(null); }, [originalJson]);

  const isDirty = text !== originalJson;

  const handleChange = (val: string) => {
    setText(val);
    try { JSON.parse(val); setParseError(null); } catch (e) { setParseError((e as Error).message); }
  };

  const handleSave = async () => {
    if (!onSave || parseError) return;
    setSaving(true);
    try { await onSave(JSON.parse(text)); } catch (e) { setParseError((e as Error).message); }
    setSaving(false);
  };

  return (
    <div className="space-y-4 max-w-3xl pb-8">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-medium">openclaw.json</span>
          {isDirty && <span className="text-[11px] text-primary">已修改</span>}
        </div>
        <div className="flex items-center gap-2">
          {isDirty && (
            <button onClick={() => { setText(originalJson); setParseError(null); }}
              className="text-[12px] text-muted-foreground hover:text-foreground">重置</button>
          )}
          {onSave && (
            <button onClick={handleSave}
              disabled={!isDirty || !!parseError || saving}
              className={cn("text-[12px] px-3 py-1 rounded-lg transition-colors",
                isDirty && !parseError ? "bg-foreground text-background hover:bg-foreground/90" : "text-muted-foreground opacity-40")}>
              {saving ? "保存中..." : "保存"}
            </button>
          )}
        </div>
      </div>

      {parseError && (
        <div className="glass-subtle rounded-xl px-3 py-2 text-[12px] text-red-500">{parseError}</div>
      )}

      <div className="glass rounded-2xl overflow-hidden">
        <textarea
          value={text}
          onChange={(e) => handleChange(e.target.value)}
          spellCheck={false}
          className={cn(
            "w-full min-h-[500px] max-h-[700px] p-4 text-[12px] font-mono leading-relaxed",
            "bg-transparent text-foreground/80 outline-none resize-y",
          )}
        />
      </div>
    </div>
  );
}
