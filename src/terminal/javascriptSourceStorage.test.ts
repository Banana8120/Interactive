import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearJavaScriptSource, loadJavaScriptSource, saveJavaScriptSource } from './javascriptSourceStorage'

describe('javascriptSourceStorage', () => {
  const values = new Map<string, string>()

  beforeEach(() => {
    values.clear()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key)
    })
  })

  it('preserves JavaScript source text including an intentionally empty editor', () => {
    expect(saveJavaScriptSource('javascript-playground', '')).toBe(true)
    expect(loadJavaScriptSource('javascript-playground')).toBe('')
    expect(saveJavaScriptSource('javascript-playground', 'let value = 1')).toBe(true)
    expect(loadJavaScriptSource('javascript-playground')).toBe('let value = 1')
  })

  it('clears only the JavaScript editor source key', () => {
    values.set('javascript-editor-source-v1-javascript-playground', 'source')
    values.set('jvm-editor-source-v1-jvm-playground', 'jvm')

    expect(clearJavaScriptSource('javascript-playground')).toBe(true)
    expect(values.get('javascript-editor-source-v1-javascript-playground')).toBeUndefined()
    expect(values.get('jvm-editor-source-v1-jvm-playground')).toBe('jvm')
  })
})
