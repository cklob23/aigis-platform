import 'server-only'
import { getAppOnlyToken, invalidateAppToken } from '@/lib/auth/microsoft'

const GRAPH = 'https://graph.microsoft.com/v1.0'
const GRAPH_BETA = 'https://graph.microsoft.com/beta'

export class GraphError extends Error {
  status: number
  code?: string
  constructor(message: string, status: number, code?: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

export type GraphPage<T> = { value: T[]; '@odata.nextLink'?: string; '@odata.count'?: number }

export class GraphClient {
  constructor(private msTenantId: string) {}

  private async token() {
    return getAppOnlyToken(this.msTenantId)
  }

  /** Fetch with throttling (429/503) retry honoring Retry-After. */
  async request<T>(url: string, init: RequestInit = {}, attempt = 0): Promise<T> {
    const token = await this.token()
    const res = await fetch(url, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        ConsistencyLevel: 'eventual',
        ...(init.headers ?? {}),
      },
      cache: 'no-store',
    })
    if (res.status === 429 || res.status === 503 || res.status === 504) {
      if (attempt >= 5) throw new GraphError('Graph throttling persisted after retries', res.status)
      const retryAfter = Number(res.headers.get('retry-after') ?? 0)
      const wait = retryAfter > 0 ? retryAfter * 1000 : Math.min(30_000, 1000 * 2 ** attempt)
      await new Promise((r) => setTimeout(r, wait))
      return this.request<T>(url, init, attempt + 1)
    }
    if (res.status === 401 && attempt === 0) {
      invalidateAppToken(this.msTenantId)
      return this.request<T>(url, init, attempt + 1)
    }
    if (res.status === 204) return undefined as T
    const text = await res.text()
    const json = text ? JSON.parse(text) : {}
    if (!res.ok) {
      throw new GraphError(json?.error?.message ?? `Graph request failed (${res.status})`, res.status, json?.error?.code)
    }
    return json as T
  }

  get<T>(path: string, beta = false) {
    const base = beta ? GRAPH_BETA : GRAPH
    return this.request<T>(path.startsWith('http') ? path : `${base}${path}`)
  }

  async getAll<T>(path: string, beta = false, onPage?: (count: number) => void): Promise<T[]> {
    const out: T[] = []
    let next: string | undefined = path.startsWith('http') ? path : `${beta ? GRAPH_BETA : GRAPH}${path}`
    while (next) {
      const page: GraphPage<T> = await this.request<GraphPage<T>>(next)
      out.push(...page.value)
      onPage?.(out.length)
      next = page['@odata.nextLink']
    }
    return out
  }

  post<T>(path: string, body: unknown) {
    return this.request<T>(`${GRAPH}${path}`, { method: 'POST', body: JSON.stringify(body) })
  }

  patch<T>(path: string, body: unknown) {
    return this.request<T>(`${GRAPH}${path}`, { method: 'PATCH', body: JSON.stringify(body) })
  }

  delete(path: string) {
    return this.request<void>(`${GRAPH}${path}`, { method: 'DELETE' })
  }

  /** JSON batch (max 20 requests per call). */
  async batch<T = unknown>(requests: { id: string; method: 'GET' | 'POST' | 'PATCH' | 'DELETE'; url: string; body?: unknown }[]) {
    const results: Record<string, { status: number; body: T }> = {}
    for (let i = 0; i < requests.length; i += 20) {
      const chunk = requests.slice(i, i + 20).map((r) => ({
        ...r,
        headers: r.body ? { 'content-type': 'application/json' } : undefined,
      }))
      const res = await this.request<{ responses: { id: string; status: number; body: T }[] }>(`${GRAPH}/$batch`, {
        method: 'POST',
        body: JSON.stringify({ requests: chunk }),
      })
      for (const r of res.responses) results[r.id] = { status: r.status, body: r.body }
    }
    return results
  }
}
