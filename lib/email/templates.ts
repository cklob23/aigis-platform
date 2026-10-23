import type { RiskLevel } from '@/lib/types'

function esc(s: string | null | undefined) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)
}

const SEVERITY_COLOR: Record<RiskLevel, string> = { critical: '#b42318', high: '#c4320a', medium: '#b54708', low: '#027a48' }

type LayoutOpts = { title: string; eyebrow?: string; tenantName: string; intro?: string; body: string; cta?: { label: string; href: string }; footer?: string }

export function layout(o: LayoutOpts) {
  return `<!doctype html>
<html><body style="margin:0;background:#f4f5f7;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1a1d21;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f5f7;padding:24px 0;">
<tr><td align="center">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e3e6ea;border-radius:8px;overflow:hidden;">
<tr><td style="padding:20px 28px;border-bottom:1px solid #e3e6ea;">
  <div style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#5b6572;">AIGIS · ${esc(o.tenantName)}</div>
</td></tr>
<tr><td style="padding:28px;">
  ${o.eyebrow ? `<div style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#5b6572;margin-bottom:6px;">${esc(o.eyebrow)}</div>` : ''}
  <h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;">${esc(o.title)}</h1>
  ${o.intro ? `<p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:#3b4350;">${o.intro}</p>` : ''}
  ${o.body}
  ${o.cta ? `<p style="margin:24px 0 0;"><a href="${esc(o.cta.href)}" style="display:inline-block;background:#1a1d21;color:#ffffff;text-decoration:none;font-size:14px;padding:10px 16px;border-radius:6px;">${esc(o.cta.label)}</a></p>` : ''}
</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid #e3e6ea;font-size:12px;line-height:1.5;color:#7a8594;">
  ${o.footer ?? 'You are receiving this because you are listed as a recipient in AIGIS. Manage alert rules and review workflow under Settings.'}
</td></tr>
</table>
</td></tr></table>
</body></html>`
}

export function table(rows: { label: string; value: string }[]) {
  return `<table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;font-size:14px;border-collapse:collapse;">${rows
    .map((r) => `<tr><td style="padding:6px 0;color:#5b6572;width:38%;vertical-align:top;">${esc(r.label)}</td><td style="padding:6px 0;vertical-align:top;">${r.value}</td></tr>`)
    .join('')}</table>`
}

export function severityChip(level: RiskLevel) {
  return `<span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:12px;font-weight:600;color:#fff;background:${SEVERITY_COLOR[level]};">${esc(level.toUpperCase())}</span>`
}

export type AlertEmailItem = { title: string; detail?: string | null; href?: string | null }

export function alertDigest(o: { tenantName: string; ruleName: string; severity: RiskLevel; triggerLabel: string; items: AlertEmailItem[]; origin: string }) {
  const shown = o.items.slice(0, 25)
  const more = o.items.length - shown.length
  const list = `<ul style="margin:0;padding-left:18px;font-size:14px;line-height:1.6;">${shown
    .map((i) => `<li>${i.href ? `<a href="${esc(o.origin + i.href)}" style="color:#1a1d21;">${esc(i.title)}</a>` : esc(i.title)}${i.detail ? ` <span style="color:#5b6572;">— ${esc(i.detail)}</span>` : ''}</li>`)
    .join('')}${more > 0 ? `<li style="color:#5b6572;">and ${more} more</li>` : ''}</ul>`
  return {
    subject: `[AIGIS ${o.severity.toUpperCase()}] ${o.ruleName}: ${o.items.length} ${o.items.length === 1 ? 'match' : 'matches'}`,
    html: layout({
      tenantName: o.tenantName,
      eyebrow: o.triggerLabel,
      title: o.ruleName,
      intro: `${severityChip(o.severity)}&nbsp; ${o.items.length} ${o.items.length === 1 ? 'identity matched' : 'identities matched'} this rule during the latest evaluation.`,
      body: list,
      cta: o.origin ? { label: 'Open alerts in AIGIS', href: `${o.origin}/alerts` } : undefined,
    }),
  }
}

export function reviewApprovalRequest(o: { tenantName: string; reviewName: string; requestedBy: string; guestCount: number; dueAt: string | null; description?: string | null; origin: string; reviewId: string }) {
  return {
    subject: `Approval needed: ${o.reviewName}`,
    html: layout({
      tenantName: o.tenantName,
      eyebrow: 'Access review approval',
      title: o.reviewName,
      intro: `${esc(o.requestedBy)} requested an access review that needs an administrator's approval before reviewers are notified.`,
      body: table([
        { label: 'Identities in scope', value: String(o.guestCount) },
        { label: 'Due', value: o.dueAt ? esc(new Date(o.dueAt).toLocaleDateString('en-US', { dateStyle: 'medium' })) : 'Not set' },
        { label: 'Purpose', value: esc(o.description) || '—' },
      ]),
      cta: o.origin ? { label: 'Review and approve', href: `${o.origin}/settings/reviews` } : undefined,
    }),
  }
}

export function reviewAssigned(o: { tenantName: string; reviewName: string; guestCount: number; dueAt: string | null; description?: string | null; origin: string; reviewId: string; approvedBy?: string | null }) {
  return {
    subject: `Access review assigned: ${o.reviewName}`,
    html: layout({
      tenantName: o.tenantName,
      eyebrow: 'Access review',
      title: o.reviewName,
      intro: `You have been asked to certify external access for ${o.guestCount} ${o.guestCount === 1 ? 'identity' : 'identities'}.${o.approvedBy ? ` Approved by ${esc(o.approvedBy)}.` : ''}`,
      body: table([
        { label: 'Due', value: o.dueAt ? esc(new Date(o.dueAt).toLocaleDateString('en-US', { dateStyle: 'medium' })) : 'Not set' },
        { label: 'Purpose', value: esc(o.description) || '—' },
        { label: 'Decisions', value: 'Approve, extend, investigate, or remove — per identity, with the resource snapshot shown inline.' },
      ]),
      cta: o.origin ? { label: 'Start reviewing', href: `${o.origin}/reviews/${o.reviewId}` } : undefined,
    }),
  }
}

export function reviewReminder(o: { tenantName: string; reviewName: string; pending: number; dueAt: string | null; overdue: boolean; origin: string; reviewId: string }) {
  return {
    subject: `${o.overdue ? 'Overdue' : 'Reminder'}: ${o.reviewName} (${o.pending} pending)`,
    html: layout({
      tenantName: o.tenantName,
      eyebrow: o.overdue ? 'Overdue access review' : 'Access review reminder',
      title: o.reviewName,
      intro: `${o.pending} ${o.pending === 1 ? 'decision is' : 'decisions are'} still pending.${o.dueAt ? ` This review ${o.overdue ? 'was due' : 'is due'} ${esc(new Date(o.dueAt).toLocaleDateString('en-US', { dateStyle: 'medium' }))}.` : ''}`,
      body: '',
      cta: o.origin ? { label: 'Finish the review', href: `${o.origin}/reviews/${o.reviewId}` } : undefined,
    }),
  }
}

export function reviewDecision(o: { tenantName: string; reviewName: string; approved: boolean; by: string; note?: string | null; origin: string; reviewId: string }) {
  return {
    subject: `${o.approved ? 'Approved' : 'Rejected'}: ${o.reviewName}`,
    html: layout({
      tenantName: o.tenantName,
      eyebrow: 'Access review approval',
      title: `${o.reviewName} was ${o.approved ? 'approved' : 'rejected'}`,
      intro: `${esc(o.by)} ${o.approved ? 'approved this review. Reviewers have been notified and decisions can now be recorded.' : 'rejected this review. No reviewers were notified.'}`,
      body: o.note ? table([{ label: 'Note', value: esc(o.note) }]) : '',
      cta: o.origin ? { label: 'Open review', href: `${o.origin}/reviews/${o.reviewId}` } : undefined,
    }),
  }
}

export function testMessage(o: { tenantName: string; sender: string; origin: string }) {
  return {
    subject: 'AIGIS email delivery test',
    html: layout({
      tenantName: o.tenantName,
      eyebrow: 'Delivery test',
      title: 'Email delivery is working',
      intro: `This message was sent through Microsoft Graph as <strong>${esc(o.sender)}</strong> using the AIGIS app registration's Mail.Send permission.`,
      body: '',
      cta: o.origin ? { label: 'Back to settings', href: `${o.origin}/settings/alerts` } : undefined,
    }),
  }
}
