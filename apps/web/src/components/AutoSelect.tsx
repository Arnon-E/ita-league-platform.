'use client';
import type { CSSProperties, ReactNode } from 'react';

/** A select inside a GET form that applies its choice at once, so the form needs no filter button. */
export function AutoSelect({ name, defaultValue, children, style, 'aria-label': ariaLabel }: { name: string; defaultValue?: string; children: ReactNode; style?: CSSProperties; 'aria-label'?: string }) {
  return <select name={name} defaultValue={defaultValue} style={style} aria-label={ariaLabel} onChange={(e) => e.currentTarget.form?.requestSubmit()}>{children}</select>;
}
