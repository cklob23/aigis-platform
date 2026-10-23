/**
 * Derive a company name from an email domain when Microsoft Graph has none.
 * Consumer / public mail providers never map to a company, so identities on
 * gmail.com, outlook.com, etc. are left without one.
 */

const CONSUMER_PROVIDERS = new Set([
  'gmail.com', 'googlemail.com',
  'outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'passport.com',
  'yahoo.com', 'ymail.com', 'rocketmail.com',
  'icloud.com', 'me.com', 'mac.com',
  'aol.com', 'aim.com',
  'proton.me', 'protonmail.com', 'protonmail.ch', 'pm.me',
  'gmx.com', 'gmx.net', 'gmx.de', 'gmx.at', 'gmx.ch',
  'mail.com', 'email.com', 'usa.com', 'post.com',
  'zoho.com', 'zohomail.com',
  'fastmail.com', 'fastmail.fm',
  'tutanota.com', 'tuta.io', 'tuta.com',
  'hey.com', 'duck.com', 'mailinator.com',
  'yandex.com', 'yandex.ru', 'mail.ru', 'bk.ru', 'inbox.ru', 'list.ru', 'rambler.ru',
  'qq.com', '163.com', '126.com', 'sina.com', 'sohu.com', 'foxmail.com',
  'naver.com', 'daum.net', 'hanmail.net',
  'web.de', 't-online.de', 'freenet.de',
  'orange.fr', 'wanadoo.fr', 'free.fr', 'laposte.net', 'sfr.fr',
  'libero.it', 'virgilio.it', 'tiscali.it', 'alice.it',
  'btinternet.com', 'sky.com', 'talktalk.net', 'virginmedia.com', 'blueyonder.co.uk', 'ntlworld.com',
  'comcast.net', 'verizon.net', 'att.net', 'sbcglobal.net', 'bellsouth.net', 'cox.net', 'charter.net', 'earthlink.net', 'optonline.net',
  'shaw.ca', 'rogers.com', 'sympatico.ca', 'telus.net', 'videotron.ca',
  'bigpond.com', 'optusnet.com.au', 'iinet.net.au', 'telstra.com',
  'xtra.co.nz',
  'rediffmail.com', 'yahoo.co.in', 'yahoo.co.uk', 'yahoo.ca', 'yahoo.com.au', 'yahoo.fr', 'yahoo.de', 'yahoo.es', 'yahoo.it', 'yahoo.co.jp',
  'hotmail.co.uk', 'hotmail.fr', 'hotmail.de', 'hotmail.es', 'hotmail.it', 'hotmail.ca', 'hotmail.com.au', 'live.co.uk', 'live.ca', 'live.com.au', 'live.fr', 'live.de', 'live.nl', 'outlook.co.uk', 'outlook.fr', 'outlook.de', 'outlook.es',
])

/** Country-code second-level domains such as co.uk, com.au, co.jp. */
const CC_SLD = /^(co|com|net|org|gov|edu|ac|or|ne|go|gob|mil|ltd|plc|me|biz|info|nom|firm|gen|ind|web|asn|id|sch|nhs|police)$/i

const ACRONYM_LENGTH = 3

export function isConsumerEmailDomain(domain: string | null | undefined) {
  if (!domain) return false
  const d = domain.trim().toLowerCase()
  if (CONSUMER_PROVIDERS.has(d)) return true
  // Any subdomain of a known consumer provider is still consumer (e.g. mx.gmail.com).
  return Array.from(CONSUMER_PROVIDERS).some((p) => d.endsWith(`.${p}`))
}

/** The registrable part of a hostname, e.g. mail.acme-corp.co.uk -> acme-corp. */
export function registrableLabel(domain: string) {
  const parts = domain.trim().toLowerCase().split('.').filter(Boolean)
  if (parts.length < 2) return parts[0] ?? ''
  const tld = parts[parts.length - 1]
  const sld = parts[parts.length - 2]
  // Two-part public suffix (co.uk, com.au, ...): label is one further left.
  if (parts.length >= 3 && tld.length === 2 && CC_SLD.test(sld)) return parts[parts.length - 3]
  return sld
}

/**
 * Human-friendly company name from a domain: "acme-corp.co.uk" -> "Acme Corp",
 * "ibm.com" -> "IBM". Returns null for consumer providers or unusable input.
 */
export function companyFromDomain(domain: string | null | undefined): string | null {
  if (!domain) return null
  const d = domain.trim().toLowerCase()
  if (!d.includes('.') || isConsumerEmailDomain(d)) return null
  const label = registrableLabel(d)
  if (!label || /^\d+$/.test(label)) return null
  const words = label.split(/[-_]+/).filter(Boolean)
  if (words.length === 0) return null
  const pretty = words
    .map((w) => (w.length <= ACRONYM_LENGTH && !/[aeiou]/i.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')
  return pretty
}

/**
 * Resolve the company for an identity: Graph companyName wins; otherwise the
 * domain-derived name when the domain is corporate. Source is recorded so the
 * UI can show provenance.
 */
export function resolveCompany(graphCompanyName: string | null | undefined, domain: string | null | undefined): { name: string | null; source: 'graph' | 'domain' | null } {
  const fromGraph = graphCompanyName?.trim()
  if (fromGraph) return { name: fromGraph, source: 'graph' }
  const derived = companyFromDomain(domain)
  return derived ? { name: derived, source: 'domain' } : { name: null, source: null }
}
