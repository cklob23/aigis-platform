import type { ReactNode } from 'react'

export function PageHeader({ title, description, actions, eyebrow }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div className="flex flex-col gap-1">
        {eyebrow && <div className="font-mono text-muted-foreground text-xs uppercase tracking-wide">{eyebrow}</div>}
        <h1 className="text-balance font-semibold text-2xl tracking-tight">{title}</h1>
        {description && <p className="max-w-2xl text-pretty text-muted-foreground text-sm">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}
