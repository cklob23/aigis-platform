import { publicActivation, type PrivilegedActivation } from '@/lib/privileged/profile'

/** Demo-only PIM activations. Live tenants have no activation table in this PR. */
export const DEMO_ACTIVATIONS_BY_EMAIL: Record<string, PrivilegedActivation[]> = {
  'adele.admin@contoso.example': [
    publicActivation({
      id: 'act-adele-1',
      roleName: 'Privileged Role Administrator',
      activatedAt: '2026-11-18T10:04:00.000Z',
      durationMinutes: 90,
      result: 'success',
      ticket: 'CHG-2044',
      approval: 'Approved',
      justification: 'Do not cite this justification',
    }),
  ],
  'megan.bowen@contoso.example': [
    publicActivation({
      id: 'act-megan-1',
      roleName: 'User Administrator',
      activatedAt: '2026-11-12T14:20:00.000Z',
      durationMinutes: 45,
      result: 'success',
      ticket: null,
      approval: 'Approved',
      justification: 'Hidden from explain',
    }),
  ],
}
