import {
  CORE_GRAPH_READ_PERMISSIONS,
  GRAPH_PERMISSION_PLAIN_PURPOSE,
  PRIVILEGED_READ_PERMISSIONS,
} from '@/lib/graph/permissions'

function PermissionGroup({
  title,
  names,
}: {
  title: string
  names: readonly (keyof typeof GRAPH_PERMISSION_PLAIN_PURPOSE)[]
}) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-medium">{title}</h2>
      <ul className="grid gap-2 rounded-md border bg-muted/30 p-3 text-xs">
        {names.map((name) => (
          <li key={name} className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2">
            <span className="font-mono">{name}</span>
            <span className="text-muted-foreground">{GRAPH_PERMISSION_PLAIN_PURPOSE[name]}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function OnboardingPermissionList() {
  return (
    <div className="flex flex-col gap-4">
      <PermissionGroup title="Core" names={CORE_GRAPH_READ_PERMISSIONS} />
      <PermissionGroup title="Used by the Privileged access module" names={PRIVILEGED_READ_PERMISSIONS} />
      <p className="text-muted-foreground text-xs">All permissions are read-only. AIGIS never changes your tenant.</p>
    </div>
  )
}
