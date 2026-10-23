'use client'

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'

const config = {
  critical: { label: 'Critical', color: 'var(--destructive)' },
  high: { label: 'High', color: 'var(--warning)' },
  inactive_90: { label: 'Inactive 90d+', color: 'var(--primary)' },
} satisfies ChartConfig

export type TrendPoint = { date: string; critical: number; high: number; inactive_90: number }

export function TrendChart({ series }: { series: TrendPoint[] }) {
  const sameDay = new Set(series.map((s) => new Date(s.date).toDateString())).size < series.length
  const data = series.map((s) => {
    const d = new Date(s.date)
    const day = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    return { ...s, label: sameDay ? `${day} ${time}` : day, full: d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) }
  })

  return (
    <ChartContainer config={config} className="h-56 w-full">
      <LineChart data={data} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} fontSize={11} />
        <YAxis tickLine={false} axisLine={false} width={36} fontSize={11} allowDecimals={false} />
        <ChartTooltip content={<ChartTooltipContent indicator="line" labelFormatter={(_, payload) => (payload?.[0]?.payload as { full?: string } | undefined)?.full ?? ''} />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Line type="monotone" dataKey="inactive_90" stroke="var(--color-inactive_90)" strokeWidth={1.5} dot={{ r: 3 }} activeDot={{ r: 4 }} isAnimationActive={false} />
        <Line type="monotone" dataKey="high" stroke="var(--color-high)" strokeWidth={1.5} dot={{ r: 3 }} activeDot={{ r: 4 }} isAnimationActive={false} />
        <Line type="monotone" dataKey="critical" stroke="var(--color-critical)" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 4 }} isAnimationActive={false} />
      </LineChart>
    </ChartContainer>
  )
}
