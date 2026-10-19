'use client';
import type { ReactNode } from 'react';

/** A select inside a GET form that applies its choice at once, so the form needs no filter button. */
export function AutoSelect({ name, defaultValue, children }: { name: string; defaultValue?: string; children: ReactNode }) {
  return <select name={name} defaultValue={defaultValue} onChange={(e) => e.currentTarget.form?.requestSubmit()}>{children}</select>;
}
