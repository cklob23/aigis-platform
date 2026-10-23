import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ShieldCheck, ScanSearch, ClipboardCheck, FileSearch } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { Logo } from '@/components/brand/logo'
import { getSession } from '@/lib/auth/current'
import { demoEnabled, microsoftConfigured } from '@/lib/env'
import { DemoSignIn } from '@/components/auth/demo-sign-in'

const ERRORS: Record<string, string> = {
  not_configured: 'Microsoft sign-in is not configured yet. Add MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET to the project environment.',
  demo_disabled: 'The demo tenant is disabled for this deployment. Sign in with Microsoft, or set GUESTSWEEP_DEMO=true to re-enable it.',
  invalid_state: 'The sign-in request expired or was tampered with. Please try again.',
  not_an_administrator: 'Your account is not a AIGIS administrator for this tenant. Ask an existing administrator to invite you.',
  tenant_missing: 'Your tenant record could not be found. Please sign in again.',
  demo_failed: 'The demo tenant could not be prepared. Please try again in a moment.',
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const session = await getSession()
  if (session) redirect('/dashboard')
  const { error } = await searchParams
  const configured = microsoftConfigured()
  const demo = demoEnabled()
  const errorText = error ? ERRORS[error] ?? decodeURIComponent(error) : null

  return (
    <main className="grid min-h-svh lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden flex-col justify-between border-r bg-sidebar p-10 lg:flex">
        <Logo />
        <div className="flex flex-col gap-8">
          <h1 className="max-w-md text-balance font-semibold text-4xl leading-tight tracking-tight">
            Every external identity in Microsoft 365, accounted for.
          </h1>
          <ul className="flex max-w-md flex-col gap-4 text-muted-foreground text-sm">
            <li className="flex gap-3">
              <ScanSearch className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>Continuous discovery of external identities and the organizations behind them across Entra ID, Teams, SharePoint, M365 Groups, and enterprise apps.</span>
            </li>
            <li className="flex gap-3">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>Explainable risk scores: inactivity, sponsorship, domain trust, sensitive-resource exposure.</span>
            </li>
            <li className="flex gap-3">
              <ClipboardCheck className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>Access reviews and guarded removal workflows with a complete audit trail.</span>
            </li>
            <li className="flex gap-3">
              <FileSearch className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>Compliance-ready exports for SOC 2, ISO 27001, HIPAA, and internal audit.</span>
            </li>
          </ul>
        </div>
        <p className="font-mono text-muted-foreground text-xs">Read-only by default · Admin consent · Least-privilege Graph scopes</p>
      </section>

      <section className="flex items-center justify-center p-6 sm:p-10">
        <div className="flex w-full max-w-sm flex-col gap-6">
          <Logo className="lg:hidden" />
          <div className="flex flex-col gap-1.5">
            <h2 className="font-semibold text-2xl tracking-tight">Sign in</h2>
            <p className="text-muted-foreground text-sm">Use a Microsoft work account with Global or Security Administrator rights to connect a tenant.</p>
          </div>

          {errorText && (
            <Alert variant="destructive">
              <AlertTitle>Sign-in problem</AlertTitle>
              <AlertDescription>{errorText}</AlertDescription>
            </Alert>
          )}

          <Button size="lg" className="w-full" nativeButton={false} render={<a href={configured ? '/api/auth/microsoft/login' : '/auth/login?error=not_configured'} target="_top" />}>
            <svg aria-hidden viewBox="0 0 21 21" className="size-4" data-icon="inline-start">
              <rect x="1" y="1" width="9" height="9" fill="#f25022" />
              <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
              <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
              <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
            </svg>
            Continue with Microsoft
          </Button>

          <p className="font-mono text-muted-foreground text-xs lg:hidden">Read-only by default · Admin consent · Least-privilege Graph scopes</p>

          {demo && (
            <>
              <div className="flex items-center gap-3">
                <Separator className="flex-1" />
                <span className="text-muted-foreground text-xs">or</span>
                <Separator className="flex-1" />
              </div>
              <DemoSignIn />
            </>
          )}

          <p className="text-pretty text-muted-foreground text-xs leading-relaxed">
            By continuing you agree to the{' '}
            <Link href="#" className="underline underline-offset-4">
              terms
            </Link>{' '}
            and{' '}
            <Link href="#" className="underline underline-offset-4">
              privacy policy
            </Link>
            . AIGIS never stores guest passwords or message content.
          </p>
        </div>
      </section>
    </main>
  )
}
