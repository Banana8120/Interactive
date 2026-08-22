<template>
  <div class="playground-page">
    <JavaScriptCodeEditor
      :key="editorKey"
      :model-value="source"
      :diagnostics="execution.diagnostics"
      :execution-line="execution.stoppedLine || execution.targetLine"
      :status="execution.status"
      :status-message="execution.message"
      @update:model-value="onSourceChange"
      @cursor-line-change="onCursorLineChange"
      @run-all="runAll"
      @format-source="formatSource"
      @reset-source="resetWorkspace"
    />
    <JavaScriptExecutionPanel :state="execution.state" />

    <n-modal v-model:show="showResetConfirm" :mask-closable="false">
      <section
        class="reset-confirm"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="reset-confirm-title"
        aria-describedby="reset-confirm-description"
      >
        <button class="reset-confirm__close" type="button" aria-label="关闭" @click="cancelReset">×</button>
        <div class="reset-confirm__heading">
          <span class="reset-confirm__icon" aria-hidden="true">!</span>
          <h2 id="reset-confirm-title">重置 JavaScript 代码</h2>
        </div>
        <p id="reset-confirm-description">重置将清空当前源码并恢复内置示例，确定继续吗？</p>
        <div class="reset-confirm__actions">
          <button class="reset-confirm__button reset-confirm__button--cancel" type="button" @click="cancelReset">
            取消
          </button>
          <button class="reset-confirm__button reset-confirm__button--confirm" type="button" @click="confirmReset">
            确定重置
          </button>
        </div>
      </section>
    </n-modal>

    <transition name="reset-toast">
      <div v-if="showResetNotice" class="reset-success" role="status" aria-live="polite">
        <span aria-hidden="true">✓</span>
        JavaScript 示例代码已重置
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import JavaScriptCodeEditor from '@/components/JavaScriptCodeEditor.vue'
import JavaScriptExecutionPanel from '@/components/JavaScriptExecutionPanel.vue'
import { executeJavaScriptSource } from '@/terminal/javascriptSourceExecutor'
import { formatJavaScriptSource, parseJavaScriptSource } from '@/terminal/javascriptSourceParser'
import {
  clearJavaScriptSource,
  DEFAULT_JAVASCRIPT_SOURCE,
  loadJavaScriptSource,
  saveJavaScriptSource
} from '@/terminal/javascriptSourceStorage'
import { message } from '@/utils/feedback'

const WORKSPACE_ID = 'javascript-playground'
const loadedSource = loadJavaScriptSource(WORKSPACE_ID)
const source = ref(loadedSource === null ? DEFAULT_JAVASCRIPT_SOURCE : loadedSource)
const initialProgram = parseJavaScriptSource(source.value)
const initialTarget = initialProgram.executableLines.at(-1) || initialProgram.lineCount
const execution = ref(executeJavaScriptSource(initialProgram, initialTarget))
const cursorLine = ref(initialTarget)
const editorKey = ref(0)
const showResetConfirm = ref(false)
const showResetNotice = ref(false)
let executionTimer: ReturnType<typeof setTimeout> | null = null
let resetNoticeTimer: ReturnType<typeof setTimeout> | null = null

function runAtLine(line: number) {
  if (executionTimer) clearTimeout(executionTimer)
  executionTimer = null
  const program = parseJavaScriptSource(source.value)
  execution.value = executeJavaScriptSource(program, line)
}

function scheduleRun(line = cursorLine.value) {
  if (executionTimer) clearTimeout(executionTimer)
  executionTimer = setTimeout(() => runAtLine(line), 300)
}

function onSourceChange(value: string) {
  source.value = value
  saveJavaScriptSource(WORKSPACE_ID, value)
  cursorLine.value = Math.min(cursorLine.value, value.split('\n').length)
  scheduleRun()
}

function onCursorLineChange(line: number) {
  cursorLine.value = line
  scheduleRun(line)
}

function runAll() {
  const program = parseJavaScriptSource(source.value)
  const target = program.executableLines.at(-1) || program.lineCount
  cursorLine.value = target
  runAtLine(target)
}

function formatSource() {
  source.value = formatJavaScriptSource(source.value)
  saveJavaScriptSource(WORKSPACE_ID, source.value)
  editorKey.value++
  runAll()
  message.success('代码格式已整理')
}

function resetWorkspace() {
  showResetConfirm.value = true
}

function cancelReset() {
  showResetConfirm.value = false
}

function confirmReset() {
  if (executionTimer) clearTimeout(executionTimer)
  executionTimer = null
  clearJavaScriptSource(WORKSPACE_ID)
  source.value = DEFAULT_JAVASCRIPT_SOURCE
  editorKey.value++
  runAll()
  showResetConfirm.value = false
  showResetNotice.value = true
  if (resetNoticeTimer) clearTimeout(resetNoticeTimer)
  resetNoticeTimer = setTimeout(() => {
    showResetNotice.value = false
    resetNoticeTimer = null
  }, 2400)
}

onBeforeUnmount(() => {
  if (executionTimer) clearTimeout(executionTimer)
  if (resetNoticeTimer) clearTimeout(resetNoticeTimer)
})
</script>

<style scoped>
.playground-page {
  width: 100%;
  max-width: 1200px;
  min-width: 0;
  margin: 0 auto;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 460px;
  align-items: start;
  gap: 24px;
}

.reset-confirm {
  position: relative;
  width: min(446px, calc(100vw - 32px));
  box-sizing: border-box;
  padding: 20px 28px 18px;
  color: #2d2d35;
  background: #fff;
  border-radius: 4px;
  box-shadow: 0 8px 32px rgb(20 15 35 / 24%);
}

.reset-confirm__close {
  position: absolute;
  top: 14px;
  right: 20px;
  padding: 0;
  color: #73737b;
  font:
    28px/1 Arial,
    sans-serif;
  background: transparent;
  border: 0;
  cursor: pointer;
}

.reset-confirm__heading {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-right: 34px;
}

.reset-confirm__heading h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 500;
}

.reset-confirm__icon {
  display: inline-grid;
  flex: 0 0 24px;
  width: 24px;
  height: 24px;
  place-items: center;
  color: #1f2316;
  font-weight: 700;
  background: #f0db4f;
  border-radius: 50%;
}

.reset-confirm p {
  margin: 12px 0 18px;
  font-size: 14px;
  line-height: 1.6;
}

.reset-confirm__actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.reset-confirm__button {
  min-height: 32px;
  padding: 0 12px;
  font: inherit;
  border-radius: 3px;
  cursor: pointer;
}

.reset-confirm__button--cancel {
  color: #2080f0;
  background: #fff;
  border: 1px solid #d9d9df;
}

.reset-confirm__button--confirm {
  color: #1f2316;
  background: #f0db4f;
  border: 1px solid #f0db4f;
}

.reset-confirm__close:focus-visible,
.reset-confirm__button:focus-visible {
  outline: 2px solid #a28d14;
  outline-offset: 2px;
}

.reset-success {
  position: fixed;
  z-index: 5000;
  top: 72px;
  left: 50%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  color: #226b45;
  font-size: 14px;
  background: #f0fff7;
  border: 1px solid #a8dfbf;
  border-radius: 6px;
  box-shadow: 0 8px 24px rgb(27 50 39 / 16%);
  transform: translateX(-50%);
}

.reset-success span {
  display: inline-grid;
  width: 18px;
  height: 18px;
  place-items: center;
  color: #fff;
  font-size: 12px;
  background: #36ad6a;
  border-radius: 50%;
}

.reset-toast-enter-active,
.reset-toast-leave-active {
  transition:
    opacity 160ms ease,
    transform 160ms ease;
}

.reset-toast-enter-from,
.reset-toast-leave-to {
  opacity: 0;
  transform: translate(-50%, -8px);
}

@media (max-width: 1000px) {
  .playground-page {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
