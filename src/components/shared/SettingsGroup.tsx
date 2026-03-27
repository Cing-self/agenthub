import React from "react";

interface SettingsGroupProps {
  title?: string;
  description?: string;
  children: React.ReactNode;
}

export function SettingsGroup({ title, description, children }: SettingsGroupProps) {
  return (
    <div>
      {title && (
        <div className="mb-2 px-1">
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{title}</div>
          {description && <div className="text-[11px] text-muted-foreground mt-0.5">{description}</div>}
        </div>
      )}
      <div className="glass rounded-2xl divide-y divide-foreground/5 px-4">
        {children}
      </div>
    </div>
  );
}

export default SettingsGroup;
