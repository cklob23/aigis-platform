import Link from 'next/link'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { RiskBadge } from '@/components/risk/risk-badge'
import { TierBadge } from '@/components/privileged/tier-badge'
import { AssignmentsTable } from '@/components/privileged/assignments-table'
import { ActivationHistory } from '@/components/privileged/activation-history'
import { RiskFactorList } from '@/components/privileged/risk-factor-list'
import { ActivityOwnership } from '@/components/privileged/activity-ownership'
import { RequestsReviews } from '@/components/privileged/requests-reviews'
import { RecommendationCard } from '@/components/privileged/recommendation-card'
import { ExplainRecommendation } from '@/components/guests/explain-recommendation'
import { OPEN_IN_ENTRA } from '@/lib/privileged/copy'
import type { PrivilegedIdentityProfile } from '@/lib/privileged/profile'

export function IdentityProfile({
  profile,
  aiEnabled,
  explainError = false,
}: {
  profile: PrivilegedIdentityProfile
  aiEnabled: boolean
  explainError?: boolean
}) {
  return (
    <>
      <div>
        <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/privileged?tab=holders" />}>
          <ArrowLeft data-icon="inline-start" /> Privileged access
        </Button>
      </div>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {profile.displayName ?? profile.identifier}
            <TierBadge tier={profile.privilegeTier} />
            <RiskBadge level={profile.riskLevel} score={profile.riskScore} className="text-sm" />
          </span>
        }
        description={<span className="font-mono text-xs">{profile.identifier}</span>}
        actions={
          profile.entraUrl ? (
            <Button variant="outline" nativeButton={false} render={<a href={profile.entraUrl} target="_blank" rel="noreferrer" />}>
              <ExternalLink data-icon="inline-start" />
              {OPEN_IN_ENTRA}
            </Button>
          ) : null
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <RiskFactorList factors={profile.factors}>
          <ExplainRecommendation
            identityId={profile.identityId}
            enabled={aiEnabled}
            initial={profile.explanation}
            initialError={explainError}
          />
        </RiskFactorList>
        <RecommendationCard profile={profile} />
      </div>

      <AssignmentsTable assignments={profile.assignments} pimAvailable={profile.pimAvailable} />
      {profile.pimAvailable ? <ActivationHistory activations={profile.activations} /> : null}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <ActivityOwnership profile={profile} />
        </div>
        <div className="lg:col-span-2">
          <RequestsReviews profile={profile} />
        </div>
      </div>
    </>
  )
}
