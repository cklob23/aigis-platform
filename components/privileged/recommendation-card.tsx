import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PRIVILEGED_RECOMMENDATION_NOTE } from '@/lib/privileged/copy'
import { ASSIGNMENT_CHANGE_LABEL, type PrivilegedIdentityProfile } from '@/lib/privileged/profile'
import { RECOMMENDATION_LABELS, RECOMMENDATION_SUMMARY } from '@/lib/risk/recommendation'

export function RecommendationCard({ profile }: { profile: PrivilegedIdentityProfile }) {
  const assignmentChanges = profile.assignments.filter((row) => row.recommendedChange)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recommendation</CardTitle>
        <CardDescription>{PRIVILEGED_RECOMMENDATION_NOTE}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <p>
          Recommended action:{' '}
          <span className="font-medium">{RECOMMENDATION_LABELS[profile.recommendedAction]}</span>
        </p>
        <p className="text-muted-foreground text-pretty">{RECOMMENDATION_SUMMARY[profile.recommendedAction]}</p>
        {assignmentChanges.length > 0 && (
          <ul className="flex flex-col gap-1">
            {assignmentChanges.map((row) => (
              <li key={row.id}>
                {row.roleName}: {ASSIGNMENT_CHANGE_LABEL[row.recommendedChange!]}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
