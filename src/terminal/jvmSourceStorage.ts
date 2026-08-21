const STORAGE_PREFIX = 'jvm-editor-source-v1'
const LEGACY_STORAGE_PREFIX = 'jvm-sim-state-v1'

export const DEFAULT_JVM_SOURCE = `class User {
    static final String TYPE = "member";
    static User current;

    int id;
    String name;
}

class Main {
    static void main() {
        User user = new User();
        user.id = 1;
        user.name = "Alice";

        int[] scores = new int[3];
        scores[0] = 100;

        User.current = user;

        thread worker {
            User copy = new User();
        }

        gc();
    }
}`

function storageKey(workspaceId: string) {
  return `${STORAGE_PREFIX}-${workspaceId}`
}

export function saveJvmSource(workspaceId: string, source: string): boolean {
  if (!workspaceId) return false
  try {
    if (typeof localStorage === 'undefined') return false
    localStorage.setItem(storageKey(workspaceId), source)
    return true
  } catch {
    return false
  }
}

export function loadJvmSource(workspaceId: string): string | null {
  if (!workspaceId) return null
  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage.getItem(storageKey(workspaceId))
  } catch {
    return null
  }
}

export function clearJvmSource(workspaceId: string): boolean {
  if (!workspaceId) return false
  try {
    if (typeof localStorage === 'undefined') return false
    localStorage.removeItem(storageKey(workspaceId))
    localStorage.removeItem(`${LEGACY_STORAGE_PREFIX}-${workspaceId}`)
    return true
  } catch {
    return false
  }
}
