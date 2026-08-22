<template>
  <aside ref="panelRef" class="memory-panel" aria-label="JVM 内存结构">
    <header class="panel-header">
      <div>
        <span class="eyebrow">LIVE MEMORY</span>
        <h2>JVM 内存结构</h2>
      </div>
      <span class="active-thread">活动线程：{{ activeThread?.name || '无' }}</span>
    </header>

    <section class="overview" aria-label="内存占用概览">
      <div v-for="meterItem in meters" :key="meterItem.key" class="meter">
        <div class="meter-head">
          <span>{{ meterItem.label }}</span>
          <strong>{{ meterItem.used }}/{{ meterItem.capacity }}</strong>
        </div>
        <div class="meter-track">
          <span :class="[`meter-fill`, `fill-${meterItem.key}`]" :style="{ width: `${meterItem.percent}%` }"></span>
        </div>
      </div>
    </section>

    <section class="memory-section method-section">
      <div class="section-title-row">
        <h3><span class="section-dot method-dot"></span>方法区</h3>
        <span>{{ classes.length }} 个类 · 线程共享</span>
      </div>
      <p class="section-note">类信息、常量和静态变量</p>

      <div v-if="!classes.length" class="empty-state">使用 class load 加载第一个类</div>
      <article v-for="classInfo in classes" :key="classInfo.name" class="memory-card class-card">
        <div class="card-title">
          <strong>{{ classInfo.name }}</strong>
          <span>{{ classInfo.size }} 单位</span>
        </div>

        <div class="value-group">
          <span class="group-label">常量池</span>
          <div v-if="!recordEntries(classInfo.constants).length" class="mini-empty">空</div>
          <div v-for="[name, value] in recordEntries(classInfo.constants)" :key="name" class="value-row">
            <span>{{ name }}</span>
            <code>{{ formatJvmValue(value) }}</code>
          </div>
        </div>

        <div class="value-group">
          <span class="group-label">静态变量 <em>GC Root</em></span>
          <div v-if="!recordEntries(classInfo.staticVariables).length" class="mini-empty">空</div>
          <div v-for="[name, value] in recordEntries(classInfo.staticVariables)" :key="name" class="value-row">
            <span>{{ name }}</span>
            <button
              v-if="value.kind === 'reference'"
              type="button"
              class="reference-link"
              @click="selectReference(value.value)"
            >
              {{ value.value }}
            </button>
            <code v-else>{{ formatJvmValue(value) }}</code>
          </div>
        </div>
      </article>
    </section>

    <section class="memory-section stack-section">
      <div class="section-title-row">
        <h3><span class="section-dot stack-dot"></span>虚拟机栈</h3>
        <span>{{ threads.length }} 个线程 · 相互隔离</span>
      </div>
      <p class="section-note">每个线程独享栈帧，顶部栈帧接收局部变量和操作数</p>

      <div v-if="!threads.length" class="empty-state">当前没有线程</div>
      <article
        v-for="thread in threads"
        :key="thread.id"
        class="thread-card"
        :class="{ active: thread.id === state.activeThreadId }"
      >
        <div class="thread-title">
          <div>
            <strong>{{ thread.name }}</strong>
            <span>{{ thread.id }}</span>
          </div>
          <span>{{ stackUsage[thread.id] || 0 }}/{{ state.capacities.stackPerThread }}</span>
        </div>
        <div v-if="thread.id === state.activeThreadId" class="active-badge">ACTIVE</div>
        <div v-if="!thread.frames.length" class="mini-empty stack-empty">空栈</div>

        <article v-for="(frame, frameIndex) in topFrames(thread)" :key="frame.id" class="frame-card">
          <div class="card-title">
            <strong>{{ frame.className }}.{{ frame.methodName }}</strong>
            <span>{{ frame.id }} · {{ frame.size }}</span>
          </div>
          <span v-if="frameIndex === 0" class="top-label">栈顶</span>

          <div class="value-group">
            <span class="group-label">局部变量表 <em>GC Root</em></span>
            <div v-if="!recordEntries(frame.localVariables).length" class="mini-empty">空</div>
            <div v-for="[name, value] in recordEntries(frame.localVariables)" :key="name" class="value-row">
              <span>{{ name }}</span>
              <button
                v-if="value.kind === 'reference'"
                type="button"
                class="reference-link"
                @click="selectReference(value.value)"
              >
                {{ value.value }}
              </button>
              <code v-else>{{ formatJvmValue(value) }}</code>
            </div>
          </div>

          <div class="value-group">
            <span class="group-label">操作数栈 <em>GC Root</em></span>
            <div v-if="!frame.operandStack.length" class="mini-empty">空</div>
            <div v-for="item in operandValues(frame)" :key="item.index" class="value-row">
              <span>#{{ item.index }} <small v-if="item.top">TOP</small></span>
              <button
                v-if="item.value.kind === 'reference'"
                type="button"
                class="reference-link"
                @click="selectReference(item.value.value)"
              >
                {{ item.value.value }}
              </button>
              <code v-else>{{ formatJvmValue(item.value) }}</code>
            </div>
          </div>
        </article>
      </article>
    </section>

    <section class="memory-section heap-section">
      <div class="section-title-row">
        <h3><span class="section-dot heap-dot"></span>堆内存</h3>
        <span>{{ heapEntries.length }} 个条目 · 线程共享</span>
      </div>
      <p class="section-note">对象与数组由标记-清除垃圾回收器管理</p>

      <div v-if="!heapEntries.length" class="empty-state">使用 new object 或 new array 分配堆内存</div>
      <article
        v-for="entry in heapEntries"
        :key="entry.id"
        :data-heap-id="entry.id"
        class="memory-card heap-card"
        :class="{ selected: selectedReference === entry.id }"
      >
        <div class="card-title">
          <div>
            <strong>{{ entry.id }}</strong>
            <span class="kind-badge">{{ entry.kind === 'object' ? 'OBJECT' : 'ARRAY' }}</span>
          </div>
          <span>{{ entry.size }} 单位</span>
        </div>

        <template v-if="entry.kind === 'object'">
          <p class="entry-type">{{ entry.className }}</p>
          <div v-if="!recordEntries(entry.fields).length" class="mini-empty">暂无字段</div>
          <div v-for="[name, value] in recordEntries(entry.fields)" :key="name" class="value-row">
            <span>{{ name }}</span>
            <button
              v-if="value.kind === 'reference'"
              type="button"
              class="reference-link"
              @click="selectReference(value.value)"
            >
              {{ value.value }}
            </button>
            <code v-else>{{ formatJvmValue(value) }}</code>
          </div>
        </template>

        <template v-else>
          <p class="entry-type">{{ entry.elementType }}[{{ entry.length }}] · 元素 {{ entry.elementSize }} 单位</p>
          <div v-if="!entry.elements.length" class="mini-empty">空数组</div>
          <div v-for="item in arrayValues(entry)" :key="item.index" class="value-row">
            <span>[{{ item.index }}]</span>
            <button
              v-if="item.value.kind === 'reference'"
              type="button"
              class="reference-link"
              @click="selectReference(item.value.value)"
            >
              {{ item.value.value }}
            </button>
            <code v-else>{{ formatJvmValue(item.value) }}</code>
          </div>
          <div v-if="entry.elements.length > ARRAY_PREVIEW_LIMIT" class="preview-note">
            其余 {{ entry.elements.length - ARRAY_PREVIEW_LIMIT }} 个元素可用 inspect {{ entry.id }} 查看
          </div>
        </template>
      </article>
    </section>

    <section class="gc-card" :class="{ idle: !state.lastGc }">
      <div class="gc-title">
        <strong>垃圾回收</strong>
        <span>{{ state.lastGc ? `GC #${state.lastGc.run}` : '尚未执行' }}</span>
      </div>
      <template v-if="state.lastGc">
        <p>{{ state.lastGc.trigger === 'manual' ? '手动触发' : '堆分配压力自动触发' }}</p>
        <div class="gc-stats">
          <span
            >扫描 <strong>{{ state.lastGc.scanned }}</strong></span
          >
          <span
            >存活 <strong>{{ state.lastGc.survived }}</strong></span
          >
          <span
            >回收 <strong>{{ state.lastGc.collected }}</strong></span
          >
          <span
            >释放 <strong>{{ state.lastGc.freed }}</strong></span
          >
        </div>
      </template>
      <p v-else>输入 gc 执行一次标记-清除。</p>
    </section>
  </aside>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { formatJvmValue, getJvmUsage } from '@/terminal/jvmMemoryEngine'
import type { JvmHeapArray, JvmStackFrame, JvmState, JvmThread, JvmValue } from '@/types'

const ARRAY_PREVIEW_LIMIT = 16

const props = defineProps<{
  state: JvmState
}>()

const panelRef = ref<HTMLElement | null>(null)
const selectedReference = ref<string | null>(null)
const usage = computed(() => getJvmUsage(props.state))
const classes = computed(() => Object.values(props.state.methodArea.classes))
const threads = computed(() => Object.values(props.state.threads))
const heapEntries = computed(() => Object.values(props.state.heap.entries))
const stackUsage = computed(() => usage.value.stacks)
const activeThread = computed(() =>
  props.state.activeThreadId ? props.state.threads[props.state.activeThreadId] || null : null
)

const meters = computed(() => {
  const activeStack = activeThread.value ? stackUsage.value[activeThread.value.id] || 0 : 0
  return [
    meter('method', '方法区', usage.value.methodArea, props.state.capacities.methodArea),
    meter('stack', '活动线程栈', activeStack, props.state.capacities.stackPerThread),
    meter('heap', '堆内存', usage.value.heap, props.state.capacities.heap)
  ]
})

function meter(key: string, label: string, used: number, capacity: number) {
  return {
    key,
    label,
    used,
    capacity,
    percent: capacity ? Math.min(100, Math.round((used / capacity) * 100)) : 0
  }
}

function recordEntries(record: Record<string, JvmValue>) {
  return Object.entries(record)
}

function topFrames(thread: JvmThread) {
  return [...thread.frames].reverse()
}

function operandValues(frame: JvmStackFrame) {
  return frame.operandStack
    .map((value, index) => ({ value, index, top: index === frame.operandStack.length - 1 }))
    .reverse()
}

function arrayValues(array: JvmHeapArray) {
  return array.elements.slice(0, ARRAY_PREVIEW_LIMIT).map((value, index) => ({ value, index }))
}

function selectReference(id: string) {
  if (!props.state.heap.entries[id]) return
  selectedReference.value = id
  nextTick(() => {
    const element = panelRef.value?.querySelector<HTMLElement>(`[data-heap-id="${id}"]`)
    element?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  })
}

watch(
  () => props.state.heap.entries,
  (entries) => {
    if (selectedReference.value && !entries[selectedReference.value]) selectedReference.value = null
  }
)
</script>

<style scoped>
.memory-panel {
  min-width: 0;
  max-height: calc(100vh - 104px);
  padding: 18px;
  overflow: auto;
  position: sticky;
  top: 80px;
  border: 1px solid #dfd3ef;
  border-radius: 14px;
  color: #30253f;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 14px 34px rgba(84, 55, 119, 0.12);
  scrollbar-color: #c9b2e4 transparent;
}

.panel-header,
.section-title-row,
.meter-head,
.card-title,
.thread-title,
.gc-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.eyebrow {
  color: #8a5abd;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 1.5px;
}
h2,
h3,
p {
  margin: 0;
}
h2 {
  margin-top: 2px;
  font-size: 19px;
}

.active-thread {
  padding: 5px 8px;
  border-radius: 999px;
  color: #7040a4;
  background: #f2e9fc;
  font-size: 11px;
  font-weight: 700;
}

.overview {
  margin: 16px 0;
  padding: 13px;
  border: 1px solid #eadff4;
  border-radius: 10px;
  background: #fcfaff;
}

.meter + .meter {
  margin-top: 10px;
}
.meter-head {
  margin-bottom: 5px;
  color: #74677f;
  font-size: 11px;
}
.meter-head strong {
  color: #473952;
  font-family: Consolas, monospace;
}

.meter-track {
  height: 6px;
  overflow: hidden;
  border-radius: 999px;
  background: #ece7f1;
}

.meter-fill {
  display: block;
  height: 100%;
  min-width: 2px;
  border-radius: inherit;
  transition: width 0.3s ease;
}

.fill-method {
  background: #7c5ce1;
}
.fill-stack {
  background: #e28443;
}
.fill-heap {
  background: #2ba889;
}
.memory-section + .memory-section {
  margin-top: 20px;
}

.section-title-row h3 {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 14px;
}

.section-title-row > span {
  color: #8b7e94;
  font-size: 10px;
}
.section-dot {
  width: 8px;
  height: 8px;
  border-radius: 3px;
}
.method-dot {
  background: #7c5ce1;
}
.stack-dot {
  background: #e28443;
}
.heap-dot {
  background: #2ba889;
}
.section-note {
  margin: 4px 0 9px;
  color: #96899e;
  font-size: 11px;
}
.empty-state,
.mini-empty {
  color: #a99eaf;
  text-align: center;
}

.empty-state {
  padding: 16px 10px;
  border: 1px dashed #dfd5e7;
  border-radius: 9px;
  font-size: 11px;
}

.mini-empty {
  padding: 5px 0;
  font-size: 10px;
}

.memory-card,
.thread-card,
.gc-card {
  position: relative;
  padding: 11px;
  border: 1px solid #e7deec;
  border-radius: 9px;
  background: #fff;
}

.memory-card + .memory-card,
.thread-card + .thread-card,
.frame-card + .frame-card {
  margin-top: 8px;
}
.class-card {
  border-left: 3px solid #8b6be5;
}
.heap-card {
  border-left: 3px solid #39aa90;
}

.heap-card.selected {
  border-color: #9c65dd;
  box-shadow: 0 0 0 3px rgba(156, 101, 221, 0.13);
}

.card-title strong,
.thread-title strong {
  color: #382944;
  font-size: 12px;
  overflow-wrap: anywhere;
}

.card-title > span,
.thread-title > span,
.thread-title div span {
  color: #8f8396;
  font:
    10px Consolas,
    monospace;
}
.value-group {
  margin-top: 9px;
}

.group-label {
  display: block;
  margin-bottom: 3px;
  color: #82758a;
  font-size: 10px;
  font-weight: 700;
}

.group-label em {
  margin-left: 4px;
  color: #a55fd0;
  font-size: 8px;
  font-style: normal;
}

.value-row {
  min-height: 25px;
  padding: 3px 6px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border-radius: 5px;
  color: #6d6075;
  background: #faf8fc;
  font-size: 10px;
}

.value-row + .value-row {
  margin-top: 3px;
}

.value-row code {
  color: #523765;
  font:
    10px Consolas,
    monospace;
  overflow-wrap: anywhere;
  text-align: right;
}

.value-row small {
  color: #d26a27;
  font-size: 7px;
  font-weight: 800;
}

.reference-link {
  padding: 2px 6px;
  border: 0;
  border-radius: 4px;
  color: #7b3eb1;
  background: #eee0fa;
  font:
    700 10px Consolas,
    monospace;
  cursor: pointer;
}

.reference-link:hover {
  color: #fff;
  background: #8b55bd;
}

.thread-card {
  overflow: hidden;
  border-top: 3px solid #dcc5ad;
  background: #fffcf9;
}

.thread-card.active {
  border-color: #e28443;
}
.thread-title div {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.active-badge,
.top-label {
  position: absolute;
  color: #fff;
  background: #e28443;
  font-size: 7px;
  font-weight: 800;
  letter-spacing: 0.6px;
}

.active-badge {
  top: 0;
  right: 10px;
  padding: 2px 6px 3px;
  border-radius: 0 0 5px 5px;
}

.stack-empty {
  padding-top: 10px;
}

.frame-card {
  position: relative;
  margin-top: 9px;
  padding: 9px;
  border: 1px solid #ecdccf;
  border-radius: 7px;
  background: #fff;
}

.top-label {
  top: -1px;
  right: 8px;
  padding: 2px 5px;
  border-radius: 0 0 4px 4px;
}

.kind-badge {
  margin-left: 5px;
  padding: 2px 5px;
  border-radius: 4px;
  color: #21836e !important;
  background: #dff5ef;
  font: 8px sans-serif !important;
  font-weight: 800 !important;
}

.entry-type {
  margin: 5px 0 7px;
  color: #6d5f74;
  font:
    10px Consolas,
    monospace;
}
.preview-note {
  margin-top: 6px;
  color: #95899c;
  font-size: 9px;
  text-align: center;
}

.gc-card {
  margin-top: 20px;
  border-color: #d8c5e8;
  background: linear-gradient(135deg, #f9f3ff, #f5fbfa);
}

.gc-card.idle {
  background: #faf8fc;
}
.gc-title strong {
  font-size: 12px;
}
.gc-title span,
.gc-card p {
  color: #897990;
  font-size: 10px;
}
.gc-card p {
  margin-top: 5px;
}

.gc-stats {
  margin-top: 8px;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 5px;
}

.gc-stats span {
  padding: 6px 3px;
  border-radius: 5px;
  color: #8a7c91;
  background: rgba(255, 255, 255, 0.75);
  font-size: 8px;
  text-align: center;
}

.gc-stats strong {
  display: block;
  color: #694187;
  font:
    12px Consolas,
    monospace;
}

@media (max-width: 1000px) {
  .memory-panel {
    max-height: none;
    position: static;
  }
}
</style>
