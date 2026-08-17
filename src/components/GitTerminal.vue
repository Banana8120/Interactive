<template>
  <div class="terminal-shell">
    <!-- 终端标题栏 -->
    <div class="terminal-bar">
      <div class="dots">
        <span class="dot red"></span>
        <span class="dot yellow"></span>
        <span class="dot green"></span>
      </div>
      <span class="terminal-title">
        <el-icon><Monitor /></el-icon>
        git 模拟终端
      </span>
      <div class="terminal-actions">
        <el-tooltip content="清空屏幕" placement="bottom">
          <button class="icon-btn" @click="clearScreen"><el-icon><Delete /></el-icon></button>
        </el-tooltip>
        <el-tooltip content="重置仓库环境" placement="bottom">
          <button class="icon-btn" @click="resetEnv"><el-icon><Refresh /></el-icon></button>
        </el-tooltip>
      </div>
    </div>

    <!-- 终端输出区 -->
    <div ref="outputRef" class="terminal-output" @click="focusInput">
      <div v-for="(block, i) in history" :key="i" class="term-block">
        <div class="term-prompt-line" v-if="block.input !== undefined">
          <span class="term-prompt">learner@git:~$</span>
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
        <span class="term-prompt">learner@git:~$</span>
        <input
          ref="inputRef"
          v-model="current"
          class="term-input"
          type="text"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          placeholder="输入 git 命令，如 git status"
          @keydown.enter.prevent="submit"
          @keydown.up.prevent="historyBack"
          @keydown.down.prevent="historyForward"
          @keydown.tab.prevent="autocomplete"
        />
        <span class="term-cursor static"></span>
      </div>
    </div>

    <!-- 建议命令 -->
    <div class="term-suggest" v-if="suggestions.length">
      <div class="suggest-label">本练习建议命令：</div>
      <div class="suggest-chips">
        <button
          v-for="(s, i) in suggestions"
          :key="i"
          class="chip"
          @click="quickRun(s)"
        >{{ s }}</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, watch, onMounted } from 'vue'
import { executeGitCommand, getGitState } from '@/terminal/gitSimulator'

interface TermBlock {
  input?: string
  error?: boolean
  lines?: string[]
  typing?: boolean
}

type ExecuteResult = ReturnType<typeof executeGitCommand>

interface Props {
  suggestions?: string[]
  task?: string
}

const props = withDefaults(defineProps<Props>(), {
  suggestions: () => [],
  task: ''
})

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
let errorStreak = 0

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
  current.value = ''
  historyStack.value.push(input)
  historyIndex.value = -1

  const result: ExecuteResult = executeGitCommand(input)
  pushBlock({ input, error: result.type === 'error', lines: [] })

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

  setTimeout(() => {
    if (result.delay > 0 && history.value.length) {
      const last = history.value[history.value.length - 1]
      if (last && last.typing) history.value.pop()
    }

    const lines = Array.isArray(result.lines) ? result.lines : [String(result.lines)]
    pushBlock({ input: undefined, error: result.type === 'error', lines })

    busy.value = false
    typingLines.value = []
    const ok = result.type !== 'error'
    // 连续错误计数：用于“卡住”检测（触发任务面板自动提示）
    errorStreak = ok ? 0 : errorStreak + 1
    emit('command-executed', { input, ok, errorStreak })
    scrollToBottom()
  }, Math.min(delay, 2000))
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

const GIT_SUBS = [
  'git init', 'git status', 'git add ', 'git commit -m ', 'git log --oneline',
  'git diff', 'git branch ', 'git checkout ', 'git switch ', 'git merge ',
  'git remote add origin ', 'git push', 'git pull', 'git tag -a ',
  'git stash', 'git stash list', 'git stash pop', 'git reset --hard ',
  'git revert ', 'git cherry-pick ', 'git reflog', 'git rm ', 'git mv ',
  'git config --global user.name ', 'git config --global user.email ', 'git show '
]

function autocomplete() {
  const base = current.value.trim()
  if (!base) return
  // 补全 git 子命令
  const hit = GIT_SUBS.find((c) => c.startsWith(base) && c !== base)
  if (hit) { current.value = hit; return }
  // 补全分支名
  const m = base.match(/^(git (?:checkout|switch|merge|branch -d|branch)\s+)(\S*)$/)
  if (m) {
    const s = getGitState()
    const names = Object.keys(s.branches).filter((n) => n.startsWith(m[2]))
    if (names.length === 1) current.value = m[1] + names[0]
  }
}

function quickRun(cmd: string) {
  current.value = cmd
  submit()
}

function resetEnv() {
  // 由父组件统一处理缓存清除与状态重置，确保 localStorage 同步清理
  emit('reset-environment')
}

// 简单语法高亮
const highlight = (line: string): string => {
  if (!line) return '&nbsp;'
  let s = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  s = s.replace(/\b[0-9a-f]{7,40}\b/g, '<span class="hl-hash">$&</span>')
  s = s.replace(/\b(git|git commit|git add|git checkout)\b/g, '<span class="hl-cmd">$&</span>')
  s = s.replace(/(Error|error|fatal|CONFLICT|denied|not found|No such)/g, '<span class="hl-err">$&</span>')
  return s
}

function focusInput() {
  if (inputRef.value) inputRef.value.focus()
}

watch(() => props.suggestions, () => { focusInput() })

onMounted(() => {
  const welcome = [
    '                _ _   ',
    '               (_) |  ',
    '     __ _  __ _ _| |_ ',
    '    / _` |/ _` | | __|',
    '   | (_| | (_| | | |_ ',
    '    \\__, |\\__, |_|\\__|',
    '     __/ | __/ |      ',
    '    |___/ |___/       ',
    '',
    '欢迎使用 Git 模拟终端！这是一个在浏览器中模拟的 Git 仓库环境，',
    '你可以输入真实的 git 命令，在内存仓库中完成各种操作。',
    '',
    '常用命令：git status / git add . / git commit -m "说明" / git log --oneline',
    '输入 "help" 或 "git help" 查看全部命令，输入 "clear" 清屏。',
    '',
    '--------------------------------------------------------------',
    ''
  ]
  history.value.push({ input: undefined, lines: welcome })
  scrollToBottom()
})
</script>

<style scoped>
.terminal-shell {
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid #2c3542;
  background: #1b222c;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
  display: flex;
  flex-direction: column;
  font-family: 'SF Mono', 'JetBrains Mono', Consolas, 'Courier New', monospace;
}

.terminal-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: #232c3a;
  border-bottom: 1px solid #2e3949;
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

.dot.red { background: #ff5f57; }
.dot.yellow { background: #febc2e; }
.dot.green { background: #28c840; }

.terminal-title {
  color: #9fb3c8;
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
  color: #7d8fa3;
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
  color: #d6e2f0;
  cursor: text;
}

.term-block {
  margin-bottom: 2px;
}

.term-prompt-line {
  display: flex;
  gap: 8px;
  margin-top: 6px;
}

.term-prompt {
  color: #ffb648;
  white-space: nowrap;
  flex-shrink: 0;
}

.term-input-text {
  color: #e8eef7;
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

.term-input-line {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}

.term-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: #e8eef7;
  font-family: inherit;
  font-size: 13px;
  caret-color: #ffb648;
  min-width: 0;
}

.term-input::placeholder {
  color: #5a6b80;
}

.term-cursor {
  display: inline-block;
  width: 8px;
  height: 15px;
  background: #ffb648;
  animation: blink 1s steps(1) infinite;
}

.term-cursor.static {
  animation: none;
  opacity: 0;
}

@keyframes blink {
  50% { opacity: 0; }
}

.hl-cmd { color: #7db9ff; }
.hl-err { color: #ff8a8a; font-weight: 600; }
.hl-hash { color: #c7a6ff; }

.typing-line {
  color: #8fa5bd;
}

.term-suggest {
  padding: 10px 14px;
  background: #202935;
  border-top: 1px solid #2e3949;
}

.suggest-label {
  color: #7d8fa3;
  font-size: 12px;
  margin-bottom: 8px;
}

.suggest-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.chip {
  background: rgba(240, 80, 50, 0.12);
  border: 1px solid rgba(240, 80, 50, 0.35);
  color: #ffab93;
  font-size: 12px;
  font-family: inherit;
  padding: 4px 12px;
  border-radius: 999px;
  cursor: pointer;
  transition: all 0.2s;
}

.chip:hover {
  background: rgba(240, 80, 50, 0.28);
  color: #fff;
  border-color: #f05032;
}

@media (max-width: 768px) {
  .terminal-output {
    height: 300px;
    font-size: 12px;
    padding: 12px;
  }

  .term-input {
    font-size: 12px;
  }
}
</style>
