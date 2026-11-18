import { mustWrite, type WriteTask } from '@/lib/supabase/write'

function chunk<T>(arr: T[], size: number) {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

export type GuestRiskUpdate = {
  id: string
  risk_score: number
  risk_level: string
  risk_factors: unknown
  recommended_action: string
}

export async function persistGuestRiskUpdates(
  updateOne: (row: GuestRiskUpdate) => WriteTask,
  updates: GuestRiskUpdate[],
) {
  for (const batch of chunk(updates, 200)) {
    const results = await Promise.all(batch.map((row) => updateOne(row)))
    results.forEach((result, i) => mustWrite(`guest_identities risk update ${batch[i].id}`, result))
  }
}

export type IdentityRiskUpdate = {
  id: string
  risk_score: number
  risk_level: string
  recommended_action: string
}

export async function persistIdentityRiskUpdates(
  updateOne: (row: IdentityRiskUpdate) => WriteTask,
  updates: IdentityRiskUpdate[],
) {
  for (const batch of chunk(updates, 200)) {
    const results = await Promise.all(batch.map((row) => updateOne(row)))
    results.forEach((result, i) => mustWrite(`identities risk update ${batch[i].id}`, result))
  }
}

export async function persistRiskScores(
  insertBatch: (rows: unknown[]) => WriteTask,
  scoreRows: unknown[],
) {
  for (const batch of chunk(scoreRows, 500)) {
    mustWrite('risk_scores insert', await insertBatch(batch))
  }
}

export async function persistRiskFindings(
  resolveOpen: () => WriteTask,
  insertBatch: (rows: unknown[]) => WriteTask,
  rows: unknown[],
) {
  mustWrite('risk_findings resolve open', await resolveOpen())
  for (const batch of chunk(rows, 500)) {
    mustWrite('risk_findings insert', await insertBatch(batch))
  }
}

export async function persistMembershipUpserts(
  upsertBatch: (rows: unknown[]) => WriteTask,
  removeGone: (ids: string[]) => WriteTask,
  rows: unknown[],
  removedIds: string[],
) {
  for (const batch of chunk(rows, 500)) {
    mustWrite('resource_memberships upsert', await upsertBatch(batch))
  }
  if (removedIds.length) {
    mustWrite('resource_memberships soft-remove', await removeGone(removedIds))
  }
}
