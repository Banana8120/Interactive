import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearJvmSource, loadJvmSource, saveJvmSource } from './jvmSourceStorage'

describe('jvmSourceStorage', () => {
  const values = new Map<string, string>()

  beforeEach(() => {
    values.clear()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key)
    })
  })

  it('preserves source text including an intentionally empty editor', () => {
    expect(saveJvmSource('jvm-playground', '')).toBe(true)
    expect(loadJvmSource('jvm-playground')).toBe('')
    expect(saveJvmSource('jvm-playground', 'class Main {}')).toBe(true)
    expect(loadJvmSource('jvm-playground')).toBe('class Main {}')
  })

  it('clears editor source and the legacy command-state key', () => {
    values.set('jvm-editor-source-v1-jvm-playground', 'source')
    values.set('jvm-sim-state-v1-jvm-playground', 'legacy')

    expect(clearJvmSource('jvm-playground')).toBe(true)
    expect(values.size).toBe(0)
  })
})
