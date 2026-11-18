'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { explainGuestRecommendation } from '@/lib/actions/ai'

export function ExplainRecommendation({
  guestId,
  enabled,
  initial,
}: {
  guestId: string
  enabled: boolean
  initial: { explanation: string; created_at: string } | null
}) {
  const [pending, startTransition] = useTransition()
  const [text, setText] = useState(initial?.explanation ?? null)

  if (!enabled && !text) return null

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">Recommendation explanation</p>
        {enabled && (
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const res = await explainGuestRecommendation(guestId)
                if (res.ok) {
                  setText(res.body)
                  toast.success('Explanation recorded. No access was changed.')
                } else {
                  toast.error(res.error)
                }
              })
            }
          >
            <Sparkles data-icon="inline-start" />
            Explain
          </Button>
        )}
      </div>
      {text ? (
        <p className="text-muted-foreground text-sm text-pretty">{text}</p>
      ) : (
        <p className="text-muted-foreground text-xs">
          On demand. Cites the current score factors. A human still has to approve any access change.
        </p>
      )}
    </div>
  )
}
