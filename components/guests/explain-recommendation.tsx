'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { explainGuestRecommendation, explainIdentityRecommendation } from '@/lib/actions/ai'
import { EXPLAIN_FAILED, EXPLAIN_GENERATED_CAPTION } from '@/lib/privileged/copy'
import { formatDateTimeEt } from '@/lib/format'

const AI_OFF_PREFIX = 'AI explanations are off'

export function ExplainRecommendation({
  enabled,
  initial,
  guestId,
  identityId,
  initialError = false,
}: {
  enabled: boolean
  initial: { explanation: string; created_at: string } | null
  guestId?: string
  identityId?: string
  initialError?: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [text, setText] = useState(initial?.explanation ?? null)
  const [createdAt, setCreatedAt] = useState(initial?.created_at ?? null)
  const [error, setError] = useState<string | null>(initialError ? EXPLAIN_FAILED : null)
  const [unavailable, setUnavailable] = useState(false)

  const show = enabled && !unavailable
  if (!show && !text) return null

  const state = error ? 'error' : text ? 'ready' : 'empty'
  const actionLabel = error ? 'Try again' : text ? 'Regenerate' : 'Explain'

  function run() {
    startTransition(async () => {
      const res = identityId
        ? await explainIdentityRecommendation(identityId)
        : guestId
          ? await explainGuestRecommendation(guestId)
          : { ok: false as const, error: 'Identity not found' }
      if (res.ok) {
        setError(null)
        setText(res.body)
        setCreatedAt(res.createdAt)
        toast.success('Explanation recorded. No access was changed.')
        return
      }
      if (res.error.startsWith(AI_OFF_PREFIX)) {
        setUnavailable(true)
        setError(null)
        return
      }
      setError(EXPLAIN_FAILED)
      toast.error(EXPLAIN_FAILED)
    })
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed p-3" data-explain-state={state}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">Recommendation explanation</p>
        {show && (
          <Button size="sm" variant="outline" disabled={pending} onClick={run}>
            <Sparkles data-icon="inline-start" />
            {actionLabel}
          </Button>
        )}
      </div>
      {error ? (
        <p className="text-muted-foreground text-sm text-pretty">{error}</p>
      ) : text ? (
        <>
          <p className="text-muted-foreground text-xs">
            {EXPLAIN_GENERATED_CAPTION}
            {createdAt ? ` · ${formatDateTimeEt(createdAt)}` : ''}
          </p>
          <p className="text-muted-foreground text-sm text-pretty">{text}</p>
        </>
      ) : (
        <p className="text-muted-foreground text-xs">
          On demand. Cites the current score factors. A human still has to approve any access change. AIGIS never takes the
          action.
        </p>
      )}
    </div>
  )
}
