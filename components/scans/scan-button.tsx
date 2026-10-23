'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { toast } from 'sonner'
import { RadarIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Progress } from '@/components/ui/progress'
import type { ScanJob } from '@/lib/types'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function ScanButton({ disabled, initialJobId, variant = 'default', label = 'Run scan' }: { disabled?: boolean; initialJobId?: string | null; variant?: 'default' | 'outline' | 'secondary'; label?: string }) {
  const router = useRouter()
  const [jobId, setJobId] = useState<string | null>(initialJobId ?? null)
  const [starting, setStarting] = useState(false)
  const { data: job } = useSWR<ScanJob>(jobId ? `/api/scans/${jobId}` : null, fetcher, {
    refreshInterval: (latest) => (latest && ['completed', 'failed', 'cancelled'].includes(latest.status) ? 0 : 1200),
  })

  useEffect(() => {
    if (!job) return
    if (job.status === 'completed') {
      toast.success('Scan complete', { description: `${job.summary?.guests ?? ''} guests inventoried, ${job.summary?.critical ?? 0} critical.` })
      setJobId(null)
      router.refresh()
    } else if (job.status === 'failed') {
      toast.error('Scan failed', { description: job.error ?? 'Unknown error' })
      setJobId(null)
      router.refresh()
    }
  }, [job, router])

  const start = async () => {
    setStarting(true)
    try {
      const res = await fetch('/api/scans', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to start scan')
      setJobId(json.id)
      if (json.alreadyRunning) toast.info('A scan is already running')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to start scan')
    } finally {
      setStarting(false)
    }
  }

  const running = Boolean(jobId) && job?.status !== 'completed' && job?.status !== 'failed'
  return (
    <div className="flex items-center gap-3">
      {running && (
        <div className="hidden w-44 flex-col gap-1 sm:flex">
          <span className="truncate text-muted-foreground text-xs">{job?.progress?.message ?? 'Starting…'}</span>
          <Progress value={job?.progress?.percent ?? 0} className="h-1" />
        </div>
      )}
      <Button onClick={start} disabled={disabled || starting || running} variant={variant}>
        {running || starting ? <Spinner data-icon="inline-start" /> : <RadarIcon data-icon="inline-start" />}
        {running ? 'Scanning…' : label}
      </Button>
    </div>
  )
}
