import { requireOnboarded } from '@/lib/auth/current'
import { can } from '@/lib/auth/rbac'
import { listPolicies } from '@/lib/data/governance'
import { DEFAULT_RISK_POLICY, type RiskPolicyConfig } from '@/lib/risk/engine'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { RiskPolicyForm } from '@/components/settings/risk-policy-form'
import { PolicyToggle } from '@/components/settings/policy-toggle'
import { SeverityDot } from '@/components/risk/risk-badge'
import { Badge } from '@/components/ui/badge'
import type { RiskLevel } from '@/lib/types'

export default async function PoliciesPage() {
  const { session, tenant } = await requireOnboarded()
  const policies = await listPolicies(tenant.id)
  const policy = { ...DEFAULT_RISK_POLICY, ...((tenant.settings.risk_policy as Partial<RiskPolicyConfig>) ?? {}) }
  const canManage = can(session.role, 'policy.manage')

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Risk thresholds</CardTitle>
          <CardDescription>Changing thresholds immediately re-scores every guest. Scores: critical ≥ 75, high ≥ 50, medium ≥ 25.</CardDescription>
        </CardHeader>
        <CardContent>
          <RiskPolicyForm initial={policy} disabled={!canManage} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Detection rules</CardTitle>
          <CardDescription>Rules generate findings and recommendations. Automation (auto-disable / auto-remove) is intentionally off by default.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col divide-y">
          {policies.map((p) => (
            <div key={p.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
              <SeverityDot severity={p.severity as RiskLevel} className="mt-2" />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {p.name}
                  {p.is_system && (
                    <Badge variant="outline" className="font-normal text-muted-foreground">
                      system
                    </Badge>
                  )}
                  <Badge variant="outline" className="font-normal capitalize">
                    {String(p.action).replace(/_/g, ' ')}
                  </Badge>
                </span>
                <span className="text-muted-foreground text-xs">
                  {p.description}
                  {Object.keys(p.config ?? {}).length > 0 && <span className="ml-1 font-mono">{JSON.stringify(p.config)}</span>}
                </span>
              </div>
              <PolicyToggle policyId={p.id} enabled={p.enabled} disabled={!canManage} />
            </div>
          ))}
          {policies.length === 0 && <p className="text-muted-foreground text-sm">No policies configured. System defaults apply.</p>}
        </CardContent>
      </Card>
    </>
  )
}
