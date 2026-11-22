'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { explainGuestRecommendation, explainIdentityRecommendation } from '@/lib/actions/ai'

export function ExplainRecommendation({
  enabled,
  initial,
  guestId,
  identityId,
}: {
  enabled: boolean
  initial: { explanation: string; created_at: string } | null
  guestId?: string
  identityId?: string
}) {
  const [pending, startTransition] = useTransition()
  const [text, setText] = useState(initial?.explanation ?? null)
  const [error, setError] = useState<string | null>(null)

  if (!enabled && !text) return null

  const state = error ? 'error' : text ? 'ready' : 'empty'

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed p-3" data-explain-state={state}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">Recommendation explanation</p>
        {enabled && (
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const res = identityId
                  ? await explainIdentityRecommendation(identityId)
                  : guestId
                    ? await explainGuestRecommendation(guestId)
                    : { ok: false as const, error: 'Identity not found' }
                if (res.ok) {
                  setError(null)
                  setText(res.body)
                  toast.success('Explanation recorded. No access was changed.')
                } else {
                  setError(res.error)
                  toast.error(res.error)
                }
              })
            }
          >
            <Sparkles data-icon="inline-start" />
            Explain with AI
          </Button>
        )}
      </div>
      {error ? (
        <p className="text-destructive text-sm text-pretty">{error}</p>
      ) : text ? (
        <p className="text-muted-foreground text-sm text-pretty">{text}</p>
      ) : (
        <p className="text-muted-foreground text-xs">
          On demand. Cites the current score factors. A human still has to approve any access change. AIGIS never takes the action.
        </p>
      )}
    </div>
  )
}
