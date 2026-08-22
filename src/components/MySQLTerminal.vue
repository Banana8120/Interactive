<template>
  <div class="terminal-shell">
    <div class="terminal-bar">
      <div class="dots">
        <span class="dot red"></span>
        <span class="dot yellow"></span>
        <span class="dot green"></span>
      </div>
      <span class="terminal-title">
        <n-icon><Monitor /></n-icon>
        mysql 模拟终端
      </span>
      <div class="terminal-actions">
        <n-tooltip placement="bottom">
          <template #trigger>
            <button class="icon-btn" @click="clearScreen">
              <n-icon><Delete /></n-icon>
            </button>
          </template>
          清空屏幕
        </n-tooltip>
        <n-tooltip placement="bottom">
          <template #trigger>
            <button class="icon-btn" @click="resetEnv">
              <n-icon><Refresh /></n-icon>
            </button>
          </template>
          重置数据库环境
        </n-tooltip>
      </div>
    </div>

    <div ref="outputRef" class="terminal-output" @click="focusInput">
      <div v-for="(block, i) in history" :key="i" class="term-block">
        <div class="term-prompt-line" v-if="block.input !== undefined">
          <span class="term-prompt">{{ block.prompt || promptText }}</span>
          <span class="term-input-text" :class="{ 'has-error': block.error }">{{ block.input }}</span>
        </div>
        <div class="term-output-lines" v-if="block.lines && block.lines.length">
          <div
            v-for="(line, j) in block.lines"
            :key="j"
            class="term-line"
            :class="{ 'line-error': block.error && j === 0 }"
            v-html="highlight(line)"
          ></div>
        </div>
        <div class="term-output-lines" v-if="block.typing">
          <div class="term-line typing-line" v-for="(t, j) in typingLines" :key="'t' + j">{{ t }}</div>
          <span class="term-cursor"></span>
        </div>
      </div>

      <div class="term-input-line">
        <span class="term-prompt">{{ promptText }}</span>
        <input
          ref="inputRef"
          v-model="current"
          class="term-input"
          type="text"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          placeholder="输入 SQL，如 SHOW DATABASES;"
          @keydown.enter.prevent="submit"
          @keydown.up.prevent="historyBack"
          @keydown.down.prevent="historyForward"
          @keydown.tab.prevent="autocomplete"
        />
        <span class="term-cursor static"></span>
      </div>

      <div class="smart-suggest" v-if="smartSuggestions.length">
        <button v-for="s in smartSuggestions" :key="s" class="smart-chip" @click.stop="applySuggestion(s)">
          {{ s }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { executeMySqlCommand, getMySqlState } from '@/terminal/mysqlSimulator'

interface TermBlock {
  input?: string
  prompt?: string
  error?: boolean
  lines?: string[]
  typing?: boolean
}

type ExecuteResult = ReturnType<typeof executeMySqlCommand>

const emit = defineEmits<{
  (e: 'command-executed', payload: { input: string; ok: boolean; errorStreak: number }): void
  (e: 'reset-environment'): void
}>()

const outputRef = ref<HTMLElement | null>(null)
const inputRef = ref<HTMLInputElement | null>(null)
const current = ref('')
const history = ref<TermBlock[]>([])
const historyStack = ref<string[]>([])
const historyIndex = ref(-1)
const typingLines = ref<string[]>([])
const busy = ref(false)
const refreshTick = ref(0)
let errorStreak = 0

const promptText = computed(() => {
  refreshTick.value
  const state = getMySqlState()
  if (!state.connected) return 'learner@mysql:~$'
  return state.currentDatabase ? `mysql [${state.currentDatabase}]>` : 'mysql>'
})

const baseCommands = computed(() => {
  refreshTick.value
  const state = getMySqlState()
  const dbs = Object.keys(state.databases).filter((name) => !state.databases[name].system)
  const currentDb = state.currentDatabase ? state.databases[state.currentDatabase] : null
  const tables = currentDb ? Object.keys(currentDb.tables) : []
  const dynamic = [
    ...dbs.map((db) => `USE ${db};`),
    ...tables.map((table) => `DESC ${table};`),
    ...tables.map((table) => `SELECT * FROM ${table};`),
    ...tables.map((table) => `SELECT COUNT(*) FROM ${table};`),
    ...(tables.length ? ['SHOW TABLES;'] : [])
  ]
  return uniq([
    'mysql --version',
    'mysql -u root -p',
    'SHOW DATABASES;',
    'CREATE DATABASE shop;',
    'USE shop;',
    'SELECT DATABASE();',
    'CREATE TABLE users (id INT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(50) NOT NULL, age INT);',
    "INSERT INTO users (name, age) VALUES ('Ada', 18);",
    'SELECT * FROM users;',
    'SELECT name, age FROM users WHERE age >= 18 ORDER BY id DESC LIMIT 2;',
    'SELECT COUNT(*), AVG(age) FROM users;',
    'SELECT age, COUNT(*) FROM users GROUP BY age ORDER BY COUNT(*) DESC;',
    "UPDATE users SET age = 20 WHERE name = 'Ada';",
    "DELETE FROM users WHERE name = 'Ada';",
    'ALTER TABLE users ADD COLUMN email VARCHAR(80);',
    'TRUNCATE TABLE users;',
    'DROP TABLE users;',
    'help',
    'clear',
    ...dynamic
  ])
})

const smartSuggestions = computed(() => {
  const base = current.value.trim().toLowerCase()
  if (!base) return []
  return baseCommands.value
    .filter((cmd) => cmd.toLowerCase().startsWith(base) && cmd.toLowerCase() !== base)
    .slice(0, 6)
})

function uniq(list: string[]) {
  return Array.from(new Set(list.filter(Boolean)))
}

function scrollToBottom() {
  nextTick(() => {
    if (outputRef.value) outputRef.value.scrollTop = outputRef.value.scrollHeight
  })
}

function clearScreen() {
  history.value = []
  scrollToBottom()
}

function pushBlock(block: TermBlock) {
  history.value.push(block)
  if (history.value.length > 300) history.value.splice(0, history.value.length - 300)
  scrollToBottom()
}

async function submit() {
  const input = current.value.trim()
  if (!input || busy.value) return
  const usedPrompt = promptText.value
  current.value = ''
  historyStack.value.push(input)
  historyIndex.value = -1

  const result: ExecuteResult = executeMySqlCommand(input)
  refreshTick.value++
  pushBlock({ input, prompt: usedPrompt, error: result.type === 'error', lines: [] })

  if (result.type === 'clear') {
    clearScreen()
    emit('command-executed', { input, ok: true, errorStreak })
    return
  }

  busy.value = true
  const delay = result.delay || 0
  if (delay > 0) {
    typingLines.value = [result.lines[0] || '']
    pushBlock({ typing: true, lines: [] })
  }

  setTimeout(
    () => {
      if (result.delay && history.value.length) {
        const last = history.value[history.value.length - 1]
        if (last && last.typing) history.value.pop()
      }

      const lines = Array.isArray(result.lines) ? result.lines : [String(result.lines)]
      pushBlock({ input: undefined, error: result.type === 'error', lines })

      busy.value = false
      typingLines.value = []
      const ok = result.type !== 'error'
      errorStreak = ok ? 0 : errorStreak + 1
      emit('command-executed', { input, ok, errorStreak })
      scrollToBottom()
    },
    Math.min(delay, 2000)
  )
}

function historyBack() {
  if (!historyStack.value.length) return
  if (historyIndex.value === -1) historyIndex.value = historyStack.value.length - 1
  else historyIndex.value = Math.max(0, historyIndex.value - 1)
  current.value = historyStack.value[historyIndex.value]
}

function historyForward() {
  if (historyIndex.value === -1) return
  historyIndex.value++
  if (historyIndex.value >= historyStack.value.length) {
    historyIndex.value = -1
    current.value = ''
  } else {
    current.value = historyStack.value[historyIndex.value]
  }
}

function autocomplete() {
  const hit = smartSuggestions.value[0]
  if (hit) current.value = hit
}

function applySuggestion(cmd: string) {
  current.value = cmd
  focusInput()
}

function resetEnv() {
  emit('reset-environment')
}

const highlight = (line: string): string => {
  if (!line) return '&nbsp;'
  let s = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  s = s.replace(
    /\b(SELECT|FROM|WHERE|GROUP BY|ORDER BY|LIMIT|COUNT|SUM|AVG|MIN|MAX|INSERT INTO|VALUES|UPDATE|SET|DELETE FROM|CREATE|DATABASE|TABLE|USE|SHOW|DESC|ALTER|TRUNCATE|DROP|PRIMARY KEY|AUTO_INCREMENT|VARCHAR|INT|NOT NULL)\b/gi,
    '<span class="hl-sql">$&</span>'
  )
  s = s.replace(
    /\b(ERROR|Unknown|Duplicate|syntax|No database selected|not supported)\b/gi,
    '<span class="hl-err">$&</span>'
  )
  s = s.replace(/\b(Query OK|Database changed|Welcome|Empty set)\b/g, '<span class="hl-ok">$&</span>')
  return s
}

function focusInput() {
  if (inputRef.value) inputRef.value.focus()
}

onMounted(() => {
  history.value.push({
    input: undefined,
    lines: [
      ' __  __       ____   ___  _     ',
      '|  \\/  |_   _/ ___| / _ \\| |    ',
      '| |\\/| | | | \\___ \\| | | | |    ',
      '| |  | | |_| |___) | |_| | |___ ',
      '|_|  |_|\\__, |____/ \\__\\_\\_____|',
      '        |___/                   ',
      '',
      '欢迎使用 MySQL 模拟终端。这里不会连接真实数据库，所有数据只保存在浏览器内。',
      '常用命令：SHOW DATABASES; / CREATE DATABASE shop; / USE shop; / CREATE TABLE ...',
      '输入 help 查看示例，输入 clear 清屏，Tab 补全，↑↓ 浏览历史。',
      '',
      '--------------------------------------------------------------',
      ''
    ]
  })
  scrollToBottom()
})
</script>

<style scoped>
.terminal-shell {
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid #21384a;
  background: #152230;
  box-shadow: 0 8px 24px rgba(0, 55, 80, 0.18);
  display: flex;
  flex-direction: column;
  font-family: 'SF Mono', 'JetBrains Mono', Consolas, 'Courier New', monospace;
}

.terminal-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: #1d3142;
  border-bottom: 1px solid #28465d;
}

.dots {
  display: flex;
  gap: 6px;
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

.terminal-title {
  color: #a7c8d9;
  font-size: 12.5px;
  display: flex;
  align-items: center;
  gap: 5px;
  flex: 1;
}

.terminal-actions {
  display: flex;
  gap: 6px;
}

.icon-btn {
  background: transparent;
  border: none;
  color: #86a7b9;
  cursor: pointer;
  padding: 3px;
  border-radius: 5px;
  display: flex;
  transition: all 0.2s;
}

.icon-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.terminal-output {
  height: 650px;
  overflow-y: auto;
  padding: 14px 16px;
  font-size: 13px;
  line-height: 1.65;
  color: #d9ecf2;
  cursor: text;
}

.term-block {
  margin-bottom: 2px;
}

.term-prompt-line,
.term-input-line {
  display: flex;
  gap: 8px;
  margin-top: 6px;
}

.term-prompt {
  color: #49d2e5;
  white-space: nowrap;
  flex-shrink: 0;
}

.term-input-text {
  color: #f2fbff;
  word-break: break-all;
}

.term-input-text.has-error {
  color: #ff9b9b;
}

.term-output-lines {
  white-space: pre-wrap;
  word-break: break-all;
}

.term-line {
  min-height: 1.4em;
  white-space: pre-wrap;
  word-break: break-all;
}

.line-error {
  color: #ff8080;
}

.term-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: #f2fbff;
  font-family: inherit;
  font-size: 13px;
  caret-color: #49d2e5;
  min-width: 0;
}

.term-input::placeholder {
  color: #637e91;
}

.term-cursor {
  display: inline-block;
  width: 8px;
  height: 15px;
  background: #49d2e5;
  animation: blink 1s steps(1) infinite;
}

.term-cursor.static {
  animation: none;
  opacity: 0;
}

@keyframes blink {
  50% {
    opacity: 0;
  }
}

.typing-line {
  color: #86a7b9;
}

.smart-suggest {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  padding-top: 10px;
}

.smart-chip {
  background: rgba(73, 210, 229, 0.08);
  border: 1px solid rgba(73, 210, 229, 0.22);
  color: #96eaf4;
  border-radius: 6px;
  padding: 3px 8px;
  font-size: 11.5px;
  font-family: inherit;
  cursor: pointer;
}

.smart-chip:hover {
  background: rgba(73, 210, 229, 0.18);
  color: #fff;
}

.hl-sql {
  color: #8fe5ff;
  font-weight: 700;
}
.hl-err {
  color: #ff8a8a;
  font-weight: 700;
}
.hl-ok {
  color: #91f2bc;
}

@media (max-width: 768px) {
  .terminal-output {
    height: 320px;
    font-size: 12px;
    padding: 12px;
  }

  .term-input {
    font-size: 12px;
  }
}
</style>
