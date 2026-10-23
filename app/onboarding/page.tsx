import { redirect } from 'next/navigation'
import { Check, ShieldCheck, KeyRound, RadarIcon, Flag, Building2 } from 'lucide-react'
import { requireContext } from '@/lib/auth/current'
import { microsoftConfigured } from '@/lib/env'
import { GraphClient } from '@/lib/graph/client'
import { verifyPermissions } from '@/lib/graph/queries'
import { db } from '@/lib/supabase/admin'
import { Logo } from '@/components/brand/logo'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { ScanButton } from '@/components/scans/scan-button'
import { completeOnboarding, setOnboardingStep } from '@/lib/actions/settings'
import { cn } from '@/lib/utils'

export const metadata = { title: 'Connect your tenant' }

const STEPS = [
  { n: 1, label: 'Account', icon: Building2 },
  { n: 2, label: 'Admin consent', icon: KeyRound },
  { n: 3, label: 'Verify access', icon: ShieldCheck },
  { n: 4, label: 'First scan', icon: RadarIcon },
  { n: 5, label: 'Done', icon: Flag },
]

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ step?: string; consent?: string; reason?: string }> }) {
  const { session, tenant } = await requireContext()
  if (tenant.onboarding_completed_at) redirect('/dashboard')
  const sp = await searchParams
  const step = Math.min(5, Math.max(1, Number(sp.step ?? tenant.onboarding_step ?? 1)))
  const configured = microsoftConfigured()

  let checks: { name: string; ok: boolean; detail?: string }[] = []
  if (step === 3 && tenant.connection_status === 'connected' && !tenant.is_demo) {
    try {
      checks = await verifyPermissions(new GraphClient(tenant.ms_tenant_id))
    } catch (err) {
      checks = [{ name: 'Token acquisition', ok: false, detail: err instanceof Error ? err.message : 'failed' }]
    }
  }
  const { data: lastScan } = await db().from('scan_jobs').select('id,status,summary').eq('tenant_id', tenant.id).order('created_at', { ascending: false }).limit(1).maybeSingle()

  const next = async (n: number) => {
    'use server'
    await setOnboardingStep(n)
    redirect(`/onboarding?step=${n}`)
  }

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-3xl flex-col gap-8 p-6 md:p-10">
      <Logo />
      <ol className="grid grid-cols-5 gap-2" aria-label="Setup progress">
        {STEPS.map((s) => (
          <li key={s.n} className={cn('flex flex-col items-center gap-1.5 rounded-md border p-2 text-center text-xs', s.n === step && 'border-primary bg-primary/5', s.n < step && 'text-muted-foreground')}>
            <span className={cn('grid size-6 place-items-center rounded-full', s.n < step ? 'bg-success text-success-foreground' : s.n === step ? 'bg-primary text-primary-foreground' : 'bg-muted')}>{s.n < step ? <Check className="size-3.5" /> : <s.icon className="size-3.5" />}</span>
            {s.label}
          </li>
        ))}
      </ol>

      <section className="flex flex-col gap-5 rounded-lg border bg-card p-6">
        {step === 1 && (
          <>
            <h1 className="font-semibold text-xl tracking-tight">Welcome, {session.name.split(' ')[0]}</h1>
            <p className="text-pretty text-muted-foreground text-sm leading-relaxed">
              You signed in from Microsoft tenant <span className="font-mono text-foreground">{tenant.ms_tenant_id}</span>. AIGIS will create an isolated workspace for this tenant. You are its first administrator; you can invite auditors and analysts later.
            </p>
            <ul className="flex flex-col gap-2 text-sm">
              {['Read-only discovery by default — nothing changes in Microsoft 365 until an administrator explicitly remediates.', 'Guest, group and app metadata is stored encrypted at rest and scoped to your tenant.', 'Every action is written to a tamper-evident audit log.'].map((t) => (
                <li key={t} className="flex gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-success" /> {t}
                </li>
              ))}
            </ul>
            <form action={next.bind(null, 2)}>
              <Button type="submit">Continue</Button>
            </form>
          </>
        )}

        {step === 2 && (
          <>
            <h1 className="font-semibold text-xl tracking-tight">Grant admin consent</h1>
            <p className="text-pretty text-muted-foreground text-sm leading-relaxed">
              A Global Administrator must approve application permissions once for the whole tenant. You will be redirected to Microsoft and back.
            </p>
            {sp.consent === 'denied' && (
              <Alert variant="destructive">
                <AlertTitle>Consent was not granted</AlertTitle>
                <AlertDescription>{sp.reason ?? 'Please try again with a Global Administrator account.'}</AlertDescription>
              </Alert>
            )}
            {(sp.consent === 'granted' || tenant.connection_status === 'connected') && (
              <Alert>
                <ShieldCheck />
                <AlertTitle>Consent recorded</AlertTitle>
                <AlertDescription>Application permissions are active for {tenant.display_name}.</AlertDescription>
              </Alert>
            )}
            <div className="grid gap-1 rounded-md border bg-muted/30 p-3 font-mono text-xs">
              {['User.Read.All', 'Group.Read.All', 'Sites.Read.All', 'Application.Read.All', 'AuditLog.Read.All', 'Organization.Read.All'].map((s) => (
                <span key={s}>{s}</span>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {tenant.connection_status !== 'connected' ? (
                <Button disabled={!configured} nativeButton={!configured} render={configured ? <a href="/api/auth/microsoft/consent" target="_top" /> : undefined}>
                  <KeyRound data-icon="inline-start" /> Open Microsoft consent
                </Button>
              ) : (
                <form action={next.bind(null, 3)}>
                  <Button type="submit">Continue</Button>
                </form>
              )}
              {!configured && <span className="self-center text-muted-foreground text-xs">MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET are not set.</span>}
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h1 className="font-semibold text-xl tracking-tight">Verify Graph access</h1>
            <p className="text-muted-foreground text-sm">AIGIS probes each permission with a minimal read so you know exactly what the first scan can see.</p>
            <ul className="flex flex-col divide-y rounded-md border">
              {checks.map((c) => (
                <li key={c.name} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className={cn('size-2 rounded-full', c.ok ? 'bg-success' : 'bg-destructive')} />
                  <span className="font-mono text-xs">{c.name}</span>
                  <span className="ml-auto text-muted-foreground text-xs">{c.ok ? 'OK' : c.detail}</span>
                </li>
              ))}
              {checks.length === 0 && <li className="px-3 py-4 text-muted-foreground text-sm">{tenant.is_demo ? 'Demo tenant — Graph access is simulated.' : 'Consent is not active yet. Go back and grant admin consent.'}</li>}
            </ul>
            {checks.some((c) => !c.ok && c.name === 'AuditLog.Read.All') && (
              <Alert>
                <AlertTitle>Sign-in activity unavailable</AlertTitle>
                <AlertDescription>Without AuditLog.Read.All (requires Entra ID P1/P2), inactivity scoring falls back to account age and invitation state.</AlertDescription>
              </Alert>
            )}
            <div className="flex gap-2">
              <form action={next.bind(null, 2)}>
                <Button type="submit" variant="ghost">
                  Back
                </Button>
              </form>
              <form action={next.bind(null, 4)}>
                <Button type="submit" disabled={!tenant.is_demo && (checks.length === 0 || !checks.find((c) => c.name === 'User.Read.All')?.ok)}>
                  Continue
                </Button>
              </form>
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <h1 className="font-semibold text-xl tracking-tight">Run the initial scan</h1>
            <p className="text-muted-foreground text-sm">The first full scan inventories every guest, group, site and app assignment. Large tenants (10k+ guests) can take several minutes; you can leave this page.</p>
            <div className="flex items-center gap-3">
              <ScanButton initialJobId={lastScan && ['queued', 'running'].includes(lastScan.status) ? lastScan.id : null} label="Start initial scan" />
              {lastScan?.status === 'completed' && (
                <Badge variant="outline" className="border-success/40 text-success">
                  Last scan: {lastScan.summary?.guests ?? 0} guests
                </Badge>
              )}
            </div>
            <div className="flex gap-2">
              <form action={next.bind(null, 3)}>
                <Button type="submit" variant="ghost">
                  Back
                </Button>
              </form>
              <form action={next.bind(null, 5)}>
                <Button type="submit" variant={lastScan?.status === 'completed' ? 'default' : 'outline'}>
                  {lastScan?.status === 'completed' ? 'Continue' : 'Skip for now'}
                </Button>
              </form>
            </div>
          </>
        )}

        {step === 5 && (
          <>
            <h1 className="font-semibold text-xl tracking-tight">You&apos;re set</h1>
            <p className="text-muted-foreground text-sm">Next steps we recommend: classify your top external domains, mark sensitive resources, and invite an auditor.</p>
            <form action={completeOnboarding}>
              <Button type="submit">Open dashboard</Button>
            </form>
          </>
        )}
      </section>
    </main>
  )
}
