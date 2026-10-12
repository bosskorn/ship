import type { CSSProperties, ReactNode } from 'react';

/** Label + control. Plain layout wrapper (TDesign FormItem would take over controlled values). */
export function Field({ label, children, style }: { label: ReactNode; children: ReactNode; style?: CSSProperties }) {
  return (
    <label className="field" style={style}>
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

export function Fields({ children, inline }: { children: ReactNode; inline?: boolean }) {
  return <div className={inline ? 'fields fields-inline' : 'fields'}>{children}</div>;
}
