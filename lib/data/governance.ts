import 'server-only'
import { db } from '@/lib/supabase/admin'
import type { AccessReview, AuditEvent, Guest, ReviewItem, ScanJob } from '@/lib/types'

export async function listReviews(tenantId: string) {
  const supabase = db()
  const { data: reviews } = await supabase.from('access_reviews').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false })
  const { data: items } = await supabase.from('review_items').select('review_id,status,decision').eq('tenant_id', tenantId)
  return ((reviews ?? []) as AccessReview[]).map((r) => {
    const mine = (items ?? []).filter((i) => i.review_id === r.id)
    return {
      ...r,
      total: mine.length,
      pending: mine.filter((i) => i.status === 'pending').length,
      decided: mine.filter((i) => i.status !== 'pending').length,
      removals: mine.filter((i) => i.decision === 'remove').length,
    }
  })
}

export async function getReviewDetail(tenantId: string, reviewId: string) {
  const supabase = db()
  const { data: review } = await supabase.from('access_reviews').select('*').eq('tenant_id', tenantId).eq('id', reviewId).maybeSingle()
  if (!review) return null
  const { data: items } = await supabase.from('review_items').select('*, guest:guest_identities(*)').eq('tenant_id', tenantId).eq('review_id', reviewId).order('created_at')
  const { data: decisions } = await supabase.from('review_decisions').select('*').eq('tenant_id', tenantId).in('review_item_id', (items ?? []).map((i) => i.id)).order('created_at', { ascending: false })
  return {
    review: review as AccessReview,
    items: ((items ?? []) as (ReviewItem & { guest: Guest })[]).sort((a, b) => (a.status === 'pending' ? -1 : 1) - (b.status === 'pending' ? -1 : 1) || b.guest.risk_score - a.guest.risk_score),
    decisions: decisions ?? [],
  }
}

export async function listAudit(tenantId: string, f: { q?: string; action?: string; page?: number }) {
  const page = Math.max(1, f.page ?? 1)
  const size = 50
  let q = db().from('audit_events').select('*', { count: 'exact' }).eq('tenant_id', tenantId)
  if (f.q) q = q.or(`actor_email.ilike.%${f.q}%,target_label.ilike.%${f.q}%,action.ilike.%${f.q}%`)
  if (f.action && f.action !== 'all') q = q.like('action', `${f.action}%`)
  const { data, count } = await q.order('created_at', { ascending: false }).range((page - 1) * size, page * size - 1)
  return { events: (data ?? []) as AuditEvent[], total: count ?? 0, page, size }
}

export async function listScans(tenantId: string) {
  const { data } = await db().from('scan_jobs').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(30)
  return (data ?? []) as ScanJob[]
}

export async function getScan(tenantId: string, id: string) {
  const { data } = await db().from('scan_jobs').select('*').eq('tenant_id', tenantId).eq('id', id).maybeSingle()
  return (data as ScanJob | null) ?? null
}

export async function listAlerts(tenantId: string) {
  const { data } = await db().from('alerts').select('*, guest:guest_identities(id,display_name,email,domain), resource:resources(id,display_name,resource_type)').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(200)
  return data ?? []
}

export async function listPolicies(tenantId: string) {
  const { data } = await db().from('policies').select('*').eq('tenant_id', tenantId).order('severity').order('name')
  return data ?? []
}

export async function listAdministrators(tenantId: string) {
  const { data } = await db().from('administrators').select('id,role_key,created_at, user:users(id,email,display_name,last_login_at)').eq('tenant_id', tenantId).order('created_at')
  return data ?? []
}

export async function listRemediations(tenantId: string) {
  const { data } = await db().from('remediation_actions').select('*, guest:guest_identities(id,display_name,email,domain)').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(100)
  return data ?? []
}
