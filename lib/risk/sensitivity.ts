import type { SensitivityCategory } from '@/lib/types'

const RULES: { category: SensitivityCategory; patterns: RegExp }[] = [
  { category: 'finance', patterns: /\b(finance|financial|payroll|accounting|treasury|budget|audit|tax|invoice|ap\b|ar\b|controller)/i },
  { category: 'hr', patterns: /\b(hr|human resources|people ops|people team|talent|recruit|compensation|benefits|salary|personnel)/i },
  { category: 'clinical', patterns: /\b(clinical|patient|phi|hipaa|medical|health record|pharma|trial)/i },
  { category: 'executive', patterns: /\b(exec|executive|leadership|board|c-suite|ceo|cfo|strategy|m&a|acquisition)/i },
  { category: 'legal', patterns: /\b(legal|counsel|contract|litigation|compliance|privacy|gdpr|nda)/i },
  { category: 'rnd', patterns: /\b(r&d|research|engineering secrets|roadmap|product strategy|patent|source code|security team|secops|incident)/i },
  { category: 'other', patterns: /\b(confidential|restricted|secret|internal only|sensitive|pii|customer data)/i },
]

export function detectSensitivity(name: string, description?: string | null, overrides?: Record<string, SensitivityCategory | null>) {
  if (overrides && name in overrides) {
    const cat = overrides[name]
    return { isSensitive: cat !== null, category: cat }
  }
  const text = `${name} ${description ?? ''}`
  for (const rule of RULES) {
    if (rule.patterns.test(text)) return { isSensitive: true, category: rule.category }
  }
  return { isSensitive: false, category: null as SensitivityCategory | null }
}
