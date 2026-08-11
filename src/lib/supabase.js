const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

export const cloudEnabled = Boolean(url && key)

function queryBuilder(table) {
  let params = new URLSearchParams()
  let method = 'GET'
  let body

  const builder = {
    select(columns = '*') { params.set('select', columns); return builder },
    order(column, options = {}) { params.set('order', `${column}.${options.ascending === false ? 'desc' : 'asc'}`); return builder },
    eq(column, value) { params.set(column, `eq.${value}`); return builder },
    insert(value) { method = 'POST'; body = value; return execute() },
    update(value) { method = 'PATCH'; body = value; return builder },
    delete() { method = 'DELETE'; return builder },
    then(resolve, reject) { return execute().then(resolve, reject) }
  }

  async function execute() {
    if (!cloudEnabled) return { data: null, error: null }
    const response = await fetch(`${url}/rest/v1/${table}?${params}`, {
      method,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: method === 'POST' ? 'return=representation' : 'return=minimal'
      },
      body: body ? JSON.stringify(body) : undefined
    })
    if (!response.ok) throw new Error(await response.text())
    const text = await response.text()
    return { data: text ? JSON.parse(text) : null, error: null }
  }

  return builder
}

export const supabase = cloudEnabled ? { from: queryBuilder } : null
