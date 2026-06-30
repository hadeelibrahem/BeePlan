import type { ReactNode } from 'react'

type PageHeaderProps = {
  title: string
  subtitle: string
  /** The shared TopActionBar — identical on every page. */
  toolbar?: ReactNode
  /** Page-specific controls (Sort, Filter, View toggle, ...), rendered as a
   * separate row below the title. Only pages that need them should pass this. */
  pageActions?: ReactNode
}

export function PageHeader({ title, subtitle, toolbar, pageActions }: PageHeaderProps) {
  return (
    <header className="mb-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-3xl font-black text-[var(--bp-text)]">{title}</h2>
          <p className="text-sm text-slate-400">{subtitle}</p>
        </div>
        {toolbar && <div className="flex flex-wrap items-center gap-4">{toolbar}</div>}
      </div>
      {pageActions && <div className="mt-4 flex flex-wrap items-center gap-3">{pageActions}</div>}
    </header>
  )
}
