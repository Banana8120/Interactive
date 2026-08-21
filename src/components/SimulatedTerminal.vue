<template>
    <div class="terminal-host">
        <div class="terminal-wrap">
            <div class="terminal-shell">
                <!-- 终端标题栏 -->
                <div class="terminal-bar">
                    <div class="dots">
                        <span class="dot red"></span>
                        <span class="dot yellow"></span>
                        <span class="dot green"></span>
                    </div>
                    <span class="terminal-title">
                        <n-icon><Monitor /></n-icon>
                        docker 模拟终端
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
                            重置环境
                        </n-tooltip>
                    </div>
                </div>

                <!-- 终端输出区 -->
                <div ref="outputRef" class="terminal-output" @click="focusInput">
                    <div v-for="(block, i) in history" :key="i" class="term-block">
                        <div class="term-prompt-line" v-if="block.input !== undefined">
                            <span class="term-prompt">learner@docker:~$</span>
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
                            <div class="term-line typing-line" v-for="(t, j) in typingLines" :key="'t' + j">
                                {{ t }}
                            </div>
                            <span class="term-cursor"></span>
                        </div>
                    </div>

                    <div class="term-input-line">
                        <span class="term-prompt">learner@docker:~$</span>
                        <input
                            ref="inputRef"
                            v-model="current"
                            class="term-input"
                            type="text"
                            autocomplete="off"
                            autocapitalize="off"
                            spellcheck="false"
                            placeholder="输入 docker 命令，如 docker images"
                            @keydown.enter.prevent="submit"
                            @keydown.up.prevent="historyBack"
                            @keydown.down.prevent="historyForward"
                            @keydown.tab.prevent="autocomplete"
                        />
                        <span class="term-cursor static"></span>
                    </div>
                </div>

            </div>

        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { executeCommand, getEnvironment } from '@/terminal/simulator'
import type { DockerEnv } from '@/types'

interface TermBlock {
  input?: string
  error?: boolean
  lines?: string[]
  typing?: boolean
}

interface TermEvent {
  seq: number
  input: string
  ok: boolean
  time: string
}

const emit = defineEmits<{
  (e: 'command-executed', payload: { input: string; ok: boolean; errorStreak: number }): void
  (e: 'snapshot-synced', payload: { env: DockerEnv; events: TermEvent[]; syncSeq: number }): void
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
// 连续错误次数（连续命令失败时递增，成功时归零），用于触发“卡住提示”
const errorStreak = ref(0)

// ---- 拓扑视图联动状态 ----
const envSnapshot = ref<DockerEnv>({ images: [], containers: [], volumes: [], networks: [], history: [] })
const recentEvents = ref<TermEvent[]>([])
const syncSeq = ref(0)
let eventSeq = 0

/**
 * 同步快照：在终端输出渲染完成的同一时刻调用，
 * 将当前环境状态 emit 给父组件，由右侧悬浮抽屉渲染拓扑视图。
 */
function syncSnapshot(input?: string, ok = true) {
    envSnapshot.value = getEnvironment()
    if (input !== undefined) {
        const d = new Date()
        const t = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
        recentEvents.value.unshift({ seq: ++eventSeq, input, ok, time: t })
        if (recentEvents.value.length > 8) recentEvents.value.length = 8
    }
    syncSeq.value++
    emit('snapshot-synced', {
        env: envSnapshot.value,
        events: [...recentEvents.value],
        syncSeq: syncSeq.value
    })
}

const MAX_LINES = 2000

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
    // 限制输出行数防止卡顿
    if (history.value.length > 300) history.value.splice(0, history.value.length - 300)
    scrollToBottom()
}

async function submit() {
    const input = current.value.trim()
    if (!input || busy.value) return
    current.value = ''
    historyStack.value.push(input)
    historyIndex.value = -1

    // 命令结果形状多样（含 type / lines / delay），用 any 接收以兼容模拟引擎的宽松返回
    const result: any = executeCommand(input)
    const isError = result.type === 'error'
    errorStreak.value = isError ? errorStreak.value + 1 : 0
    const ok = !isError
    pushBlock({ input, error: isError, lines: [] })

    if (result.type === 'clear') {
        clearScreen()
        emit('command-executed', { input, ok, errorStreak: errorStreak.value })
        syncSnapshot(input, true)
        return
    }

    busy.value = true
    const delay = result.delay || 0
    if (delay > 0) {
        // 模拟执行中的打字效果
        typingLines.value = [result.lines[0] || '']
        pushBlock({ typing: true, lines: [] })
    }

    setTimeout(
        async () => {
            // 移除 typing 占位块
            if (result.delay > 0 && history.value.length) {
                const last = history.value[history.value.length - 1]
                if (last && last.typing) history.value.pop()
            }

            const lines = Array.isArray(result.lines) ? result.lines : [String(result.lines)]
            pushBlock({ input: undefined, error: result.type === 'error', lines })

            busy.value = false
            typingLines.value = []
            emit('command-executed', { input, ok, errorStreak: errorStreak.value })
            // 输出渲染完成的同时刷新面板，保证同步
            syncSnapshot(input, ok)
            scrollToBottom()
        },
        Math.min(delay, 2000),
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
    const base = current.value.trim()
    if (!base) return
    const candidates = [
        'docker images',
        'docker ps -a',
        'docker create --name ',
        'docker pull ',
        'docker run -d -p 8080:80 nginx',
        'docker stop ',
        'docker kill ',
        'docker pause ',
        'docker unpause ',
        'docker rm ',
        'docker logs ',
        'docker exec -it ',
        'docker cp ',
        'docker top ',
        'docker diff ',
        'docker rename ',
        'docker commit ',
        'docker container ls -a',
        'docker container prune',
        'docker volume ls',
        'docker volume prune',
        'docker network ls',
        'docker build -t myapp .',
        'docker history ',
        'docker save -o myapp.tar ',
        'docker load -i myapp.tar',
        'docker system df',
        'docker system prune',
        'docker compose up -d',
        'docker info',
        'docker search ',
        'docker rmi ',
        'docker tag ',
        'docker inspect ',
    ]
    const hit = candidates.find((c) => c.startsWith(base) && c !== base)
    if (hit) current.value = hit
}

function resetEnv() {
    // 由父组件统一处理：清除本地缓存并调用 resetEnvironment，再触发同步
    emit('reset-environment')
}

// 简单语法高亮：字符串/数字/命令着色
const highlight = (line: string): string => {
    if (!line) return '&nbsp;'
    let s = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    s = s.replace(/sha256:[0-9a-f]{6,}/g, '<span class="hl-hash">$&</span>')
    s = s.replace(/(docker|docker-compose|bash|root@)/g, '<span class="hl-cmd">$1</span>')
    s = s.replace(/(Error|error|denied|conflict|not found|No such)/g, '<span class="hl-err">$1</span>')
    return s
}

function focusInput() {
    inputRef.value && inputRef.value.focus()
}

onMounted(() => {
    // 初始化面板快照，使面板与引擎初始状态一致
    syncSnapshot()
    // 欢迎信息
    const welcome = [
        '   __        ___   _   _  ___ _ __ _   _ ',
        '   \\ \\      / / \\ | | | |/ (_) |__ \\ | | |',
        "    \\ \\ /\\ / / _ \\| |_| | / /| | '_ \\ | | |",
        '     \\ V  V / ___ \\  _  | \\ \\| | | | | |_| |',
        '      \\_/\\_/ \\_/  \\_\\_| \\_|_|_| |_|\\__, |',
        '                                   __/ |',
        '                                  |___/ ',
        '',
        '欢迎使用 Docker 模拟终端！这是一个在浏览器中模拟的 Docker 环境，',
        '你可以输入真实的 docker 命令并查看模拟执行结果。',
        '',
        '常用命令：docker --version / docker images / docker pull nginx / docker ps -a',
        '输入 "help" 或 "docker help" 查看全部命令，输入 "clear" 清屏。',
        '',
        '----------------------------------------------------------------',
        '',
    ]
    history.value.push({ input: undefined, lines: welcome })
    scrollToBottom()
})

onBeforeUnmount(() => {
    window.removeEventListener('resize', () => {})
})
</script>

<style scoped>
.terminal-host {
    container-type: inline-size;
}

.terminal-wrap {
    display: flex;
    gap: 12px;
    align-items: stretch;
}

.terminal-wrap .terminal-shell {
    flex: 1;
    min-width: 0;
}

.viz-aside {
    width: 360px;
    flex-shrink: 0;
    border: 1px solid #dfe6f0;
    border-radius: 12px;
    overflow: hidden;
    background: #f7f9fc;
    box-shadow: 0 8px 24px rgba(30, 50, 90, 0.08);
}

/* 容器查询：外层容器较窄时上下堆叠 */
@container (max-width: 699px) {
    .terminal-wrap {
        flex-direction: column;
    }
    .terminal-wrap.with-viz .terminal-shell {
        border-radius: 12px 12px 0 0;
    }
    .viz-aside {
        width: 100%;
        max-height: 420px;
        border-radius: 0 0 12px 12px;
        border-left: none;
        border-top: 1px solid #dfe6f0;
    }
}

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

.icon-btn.active {
    background: rgba(36, 150, 237, 0.25);
    color: #7db9ff;
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
    color: #2fdf84;
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
    padding-left: 0;
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
    caret-color: #2fdf84;
    min-width: 0;
}

.term-input::placeholder {
    color: #5a6b80;
}

.term-cursor {
    display: inline-block;
    width: 8px;
    height: 15px;
    background: #2fdf84;
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

.hl-cmd {
    color: #7db9ff;
}
.hl-err {
    color: #ff8a8a;
    font-weight: 600;
}
.hl-hash {
    color: #c7a6ff;
}

.typing-line {
    color: #8fa5bd;
}

/* 移动端 */
@media (max-width: 768px) {
    .terminal-wrap {
        flex-direction: column;
    }

    .terminal-wrap.with-viz .terminal-shell {
        border-radius: 12px 12px 0 0;
    }

    .viz-aside {
        width: 100%;
        max-height: 380px;
        border-radius: 0 0 12px 12px;
        border-left: none;
        border-top: 1px solid #dfe6f0;
    }

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


