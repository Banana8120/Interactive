const STORAGE_PREFIX = 'javascript-editor-source-v1'

export const DEFAULT_JAVASCRIPT_SOURCE = `let user = { name: "Alice", role: "member" }
const scores = [100, 98]

function rename(obj) {
    obj.name = "Bob"
}

rename(user)
scores[1] = 99`

function storageKey(workspaceId: string) {
  return `${STORAGE_PREFIX}-${workspaceId}`
}

export function saveJavaScriptSource(workspaceId: string, source: string): boolean {
  if (!workspaceId) return false
  try {
    if (typeof localStorage === 'undefined') return false
    localStorage.setItem(storageKey(workspaceId), source)
    return true
  } catch {
    return false
  }
}

export function loadJavaScriptSource(workspaceId: string): string | null {
  if (!workspaceId) return null
  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage.getItem(storageKey(workspaceId))
  } catch {
    return null
  }
}

export function clearJavaScriptSource(workspaceId: string): boolean {
  if (!workspaceId) return false
  try {
    if (typeof localStorage === 'undefined') return false
    localStorage.removeItem(storageKey(workspaceId))
    return true
  } catch {
    return false
  }
}
