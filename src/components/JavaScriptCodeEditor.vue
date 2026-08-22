<template>
  <section class="editor-shell" aria-label="简化 JavaScript 代码编辑器">
    <header class="editor-bar">
      <div class="dots" aria-hidden="true">
        <span class="dot red"></span>
        <span class="dot yellow"></span>
        <span class="dot green"></span>
      </div>
      <span class="editor-title">
        <n-icon><JavaScriptIcon /></n-icon>
        JavaScript 执行代码编辑器
      </span>
      <div class="editor-actions">
        <button type="button" class="action-btn primary" @click="emit('run-all')">
          <n-icon><ArrowRight /></n-icon>
          运行全部
        </button>
        <button type="button" class="action-btn" @click="emit('format-source')">
          <n-icon><Sort /></n-icon>
          格式化
        </button>
        <button type="button" class="icon-btn" aria-label="重置示例代码" @click="emit('reset-source')">
          <n-icon><Refresh /></n-icon>
        </button>
      </div>
    </header>

    <div class="editor-status">
      <span class="status-pill" :class="`status-${status}`">{{ statusLabel }}</span>
      <span class="status-message">{{ statusMessage }}</span>
      <span class="line-position">执行行 {{ executionLine || 0 }}</span>
    </div>

    <div class="editor-layout">
      <div ref="gutterRef" class="line-gutter" aria-hidden="true">
        <div class="gutter-inner">
          <span
            v-for="line in lineCount"
            :key="line"
            :class="{
              current: line === executionLine,
              error: diagnosticLines.has(line)
            }"
            >{{ line }}</span
          >
        </div>
      </div>

      <div class="code-viewport">
        <pre ref="highlightRef" class="highlight-layer" aria-hidden="true"><span
          v-for="line in highlightedLines"
          :key="line.number"
          class="code-line"
          :class="{
            current: line.number === executionLine,
            error: diagnosticLines.has(line.number)
          }"
          v-html="line.html"
        ></span></pre>
        <textarea
          ref="textareaRef"
          :value="modelValue"
          class="code-input"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          aria-label="简化 JavaScript 源码"
          @input="onInput"
          @click="updateCursorLine"
          @keyup="updateCursorLine"
          @select="updateCursorLine"
          @scroll="syncScroll"
          @keydown.tab.prevent="insertIndent"
        ></textarea>
      </div>
    </div>

    <footer class="diagnostic-bar" :class="{ clean: !diagnostics.length }">
      <template v-if="diagnostics.length">
        <span class="diagnostic-count">{{ diagnostics.length }} 个问题</span>
        <button
          v-for="diagnostic in diagnostics.slice(0, 2)"
          :key="`${diagnostic.line}-${diagnostic.message}`"
          type="button"
          class="diagnostic-item"
          @click="jumpToLine(diagnostic.line)"
        >
          第 {{ diagnostic.line }} 行：{{ diagnostic.message }}
        </button>
      </template>
      <template v-else>
        <span class="clean-mark">✓</span>
        代码有效，移动光标可查看对应执行上下文
      </template>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import type { JavaScriptExecutionStatus } from '@/terminal/javascriptSourceExecutor'
import type { JavaScriptSourceDiagnostic } from '@/terminal/javascriptSourceParser'

const props = defineProps<{
  modelValue: string
  diagnostics: JavaScriptSourceDiagnostic[]
  executionLine: number
  status: JavaScriptExecutionStatus
  statusMessage: string
}>()

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
  (event: 'cursor-line-change', line: number): void
  (event: 'run-all'): void
  (event: 'format-source'): void
  (event: 'reset-source'): void
}>()

const textareaRef = ref<HTMLTextAreaElement | null>(null)
const highlightRef = ref<HTMLElement | null>(null)
const gutterRef = ref<HTMLElement | null>(null)
const lineCount = computed(() => props.modelValue.split('\n').length)
const diagnosticLines = computed(() => new Set(props.diagnostics.map((item) => item.line)))
const highlightedLines = computed(() =>
  props.modelValue.split('\n').map((line, index) => ({
    number: index + 1,
    html: highlightLine(line) || '&nbsp;'
  }))
)
const statusLabel = computed(
  () =>
    ({
      paused: '已暂停',
      completed: '已运行',
      error: '有错误'
    })[props.status]
)

watch(
  () => props.modelValue,
  () => nextTick(syncScroll)
)

function onInput(event: Event) {
  emit('update:modelValue', (event.target as HTMLTextAreaElement).value)
  nextTick(updateCursorLine)
}

function updateCursorLine() {
  const textarea = textareaRef.value
  if (!textarea) return
  const line = textarea.value.slice(0, textarea.selectionStart).split('\n').length
  emit('cursor-line-change', line)
}

function syncScroll() {
  const textarea = textareaRef.value
  if (!textarea) return
  if (highlightRef.value) {
    highlightRef.value.style.transform = `translate(${-textarea.scrollLeft}px, ${-textarea.scrollTop}px)`
  }
  const gutterInner = gutterRef.value?.firstElementChild as HTMLElement | null
  if (gutterInner) gutterInner.style.transform = `translateY(${-textarea.scrollTop}px)`
}

function insertIndent() {
  const textarea = textareaRef.value
  if (!textarea) return
  const start = textarea.selectionStart
  const end = textarea.selectionEnd
  const value = `${textarea.value.slice(0, start)}    ${textarea.value.slice(end)}`
  emit('update:modelValue', value)
  nextTick(() => {
    textarea.setSelectionRange(start + 4, start + 4)
    updateCursorLine()
  })
}

function jumpToLine(targetLine: number) {
  const textarea = textareaRef.value
  if (!textarea) return
  const lines = textarea.value.split('\n')
  const offset = lines.slice(0, Math.max(0, targetLine - 1)).reduce((total, line) => total + line.length + 1, 0)
  textarea.focus()
  textarea.setSelectionRange(offset, offset)
  emit('cursor-line-change', targetLine)
  textarea.scrollTop = Math.max(0, (targetLine - 3) * 22)
  syncScroll()
}

function highlightLine(line: string) {
  let result = ''
  let index = 0
  while (index < line.length) {
    if (line[index] === '/' && line[index + 1] === '/') {
      result += `<span class="token-comment">${escapeHtml(line.slice(index))}</span>`
      break
    }
    if (line[index] === '"' || line[index] === "'") {
      const quote = line[index]
      let end = index + 1
      let escaped = false
      while (end < line.length) {
        const character = line[end]
        if (escaped) escaped = false
        else if (character === '\\') escaped = true
        else if (character === quote) {
          end++
          break
        }
        end++
      }
      result += `<span class="token-string">${escapeHtml(line.slice(index, end))}</span>`
      index = end
      continue
    }
    const word = line.slice(index).match(/^[A-Za-z_$][\w$]*/)?.[0]
    if (word) {
      const tokenClass = KEYWORDS.has(word) ? 'token-keyword' : LITERALS.has(word) ? 'token-literal' : ''
      result += tokenClass ? `<span class="${tokenClass}">${escapeHtml(word)}</span>` : escapeHtml(word)
      index += word.length
      continue
    }
    const number = line.slice(index).match(/^-?(?:\d+\.\d*|\.\d+|\d+)/)?.[0]
    if (number) {
      result += `<span class="token-number">${number}</span>`
      index += number.length
      continue
    }
    result += escapeHtml(line[index])
    index++
  }
  return result
}

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const KEYWORDS = new Set(['let', 'const', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'class', 'new'])
const LITERALS = new Set(['true', 'false', 'null', 'undefined'])

onMounted(() => {
  syncScroll()
})
</script>

<style scoped>
.editor-shell {
  min-width: 0;
  overflow: hidden;
  border: 1px solid #323426;
  border-radius: 14px;
  background: #121417;
  box-shadow: 0 14px 34px rgba(86, 79, 35, 0.16);
}

.editor-bar {
  min-height: 48px;
  padding: 0 12px;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  background: #1f231f;
  border-bottom: 1px solid #353824;
}

.dots {
  display: flex;
  gap: 7px;
}
.dot {
  width: 11px;
  height: 11px;
  border-radius: 50%;
}
.dot.red {
  background: #ff5f57;
}
.dot.yellow {
  background: #febc2e;
}
.dot.green {
  background: #28c840;
}

.editor-title {
  display: flex;
  align-items: center;
  gap: 7px;
  color: #f5df63;
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
}

.editor-actions {
  display: flex;
  justify-content: flex-end;
  gap: 5px;
}

.action-btn,
.icon-btn {
  height: 30px;
  border: 0;
  border-radius: 7px;
  color: #d9d0a2;
  background: rgba(255, 255, 255, 0.06);
  cursor: pointer;
  transition: 0.2s ease;
}

.action-btn {
  padding: 0 9px;
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
}

.action-btn.primary {
  color: #1d2117;
  background: #f0db4f;
}
.action-btn:hover,
.icon-btn:hover {
  color: #fff;
  background: #405343;
}
.icon-btn {
  width: 30px;
  display: grid;
  place-items: center;
}

.editor-status {
  height: 34px;
  padding: 0 13px;
  display: flex;
  align-items: center;
  gap: 9px;
  color: #9ea18d;
  background: #171a1b;
  border-bottom: 1px solid #2c3025;
  font-size: 10px;
}

.status-pill {
  padding: 3px 7px;
  border-radius: 999px;
  font-weight: 700;
}

.status-paused {
  color: #f3de69;
  background: rgba(240, 219, 79, 0.14);
}
.status-completed {
  color: #89e0ba;
  background: rgba(63, 181, 132, 0.14);
}
.status-error {
  color: #ff9cab;
  background: rgba(236, 85, 107, 0.14);
}
.status-message {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.line-position {
  margin-left: auto;
  flex-shrink: 0;
  font-family: Consolas, monospace;
}

.editor-layout {
  height: 520px;
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr);
  overflow: hidden;
}

.line-gutter {
  overflow: hidden;
  color: #656853;
  background: #101213;
  border-right: 1px solid #2b2f24;
  font:
    12px/22px Consolas,
    'Cascadia Code',
    monospace;
  text-align: right;
  user-select: none;
}

.gutter-inner {
  padding: 14px 9px 18px 0;
  will-change: transform;
}
.gutter-inner span {
  display: block;
  height: 22px;
}
.gutter-inner span.current {
  color: #f0db4f;
  font-weight: 700;
}
.gutter-inner span.error {
  color: #ff7187;
}

.code-viewport {
  min-width: 0;
  position: relative;
  overflow: hidden;
  background: #121417;
}

.highlight-layer,
.code-input {
  margin: 0;
  border: 0;
  font:
    13px/22px Consolas,
    'Cascadia Code',
    'SFMono-Regular',
    monospace;
  tab-size: 4;
  white-space: pre;
}

.highlight-layer {
  min-width: 100%;
  width: max-content;
  min-height: 100%;
  padding: 14px 0 18px;
  position: absolute;
  top: 0;
  left: 0;
  color: #d8d9cf;
  pointer-events: none;
  will-change: transform;
}

.code-line {
  display: block;
  min-width: 100%;
  height: 22px;
  padding: 0 16px;
}

.code-line.current {
  background: rgba(240, 219, 79, 0.12);
}
.code-line.error {
  background: rgba(225, 70, 94, 0.12);
  box-shadow: inset 2px 0 #e84d67;
}
.code-line :deep(.token-keyword) {
  color: #f0db4f;
  font-weight: 700;
}
.code-line :deep(.token-string) {
  color: #8bd7a6;
}
.code-line :deep(.token-number) {
  color: #79c8ff;
}
.code-line :deep(.token-literal) {
  color: #ef8eaa;
}
.code-line :deep(.token-comment) {
  color: #6f7d70;
  font-style: italic;
}

.code-input {
  width: 100%;
  height: 100%;
  padding: 14px 16px 18px;
  position: absolute;
  inset: 0;
  z-index: 1;
  resize: none;
  outline: none;
  color: transparent;
  -webkit-text-fill-color: transparent;
  caret-color: #f0db4f;
  background: transparent;
  overflow: auto;
  scrollbar-color: #4d513d transparent;
}

.code-input::selection {
  background: rgba(240, 219, 79, 0.26);
}

.diagnostic-bar {
  min-height: 38px;
  padding: 7px 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  overflow: hidden;
  color: #ffc1ca;
  background: #24151f;
  border-top: 1px solid #4a2632;
  font-size: 10px;
}

.diagnostic-bar.clean {
  color: #8fcdb8;
  background: #14211e;
  border-color: #24453c;
}
.diagnostic-count {
  flex-shrink: 0;
  font-weight: 700;
}
.clean-mark {
  font-size: 13px;
  font-weight: 800;
}

.diagnostic-item {
  min-width: 0;
  padding: 3px 7px;
  overflow: hidden;
  border: 0;
  border-radius: 4px;
  color: inherit;
  background: rgba(255, 255, 255, 0.05);
  font: inherit;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}

@media (max-width: 700px) {
  .editor-bar {
    grid-template-columns: auto 1fr;
    gap: 8px;
    padding: 7px 9px;
  }
  .dots {
    display: none;
  }
  .editor-title {
    justify-self: start;
  }
  .editor-actions {
    min-width: 0;
  }
  .action-btn {
    padding: 0 7px;
  }
  .action-btn .n-icon {
    display: none;
  }
  .editor-layout {
    height: 430px;
    grid-template-columns: 40px minmax(0, 1fr);
  }
  .highlight-layer,
  .code-input {
    font-size: 12px;
  }
  .diagnostic-item:nth-of-type(n + 2) {
    display: none;
  }
}
</style>
