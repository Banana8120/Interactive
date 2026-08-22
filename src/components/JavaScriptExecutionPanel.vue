<template>
  <aside ref="panelRef" class="execution-panel" aria-label="JavaScript 执行上下文">
    <header class="panel-header">
      <div>
        <span class="eyebrow">LIVE CONTEXT</span>
        <h2>JS 执行上下文</h2>
      </div>
      <span class="active-frame">活动帧：{{ activeContext?.name || '无' }}</span>
    </header>

    <section class="overview" aria-label="执行状态概览">
      <div class="overview-item stack">
        <span>调用栈</span>
        <strong>{{ contexts.length }}</strong>
      </div>
      <div class="overview-item scope">
        <span>活动作用域</span>
        <strong>{{ visibleScopes.length }}</strong>
      </div>
      <div class="overview-item heap">
        <span>堆条目</span>
        <strong>{{ heapEntries.length }}</strong>
      </div>
    </section>

    <section class="memory-section stack-section">
      <div class="section-title-row">
        <h3><span class="section-dot stack-dot"></span>调用栈</h3>
        <span>后进先出</span>
      </div>
      <p class="section-note">函数调用会压入新执行上下文，返回后弹出。</p>

      <article
        v-for="(context, index) in stackFrames"
        :key="context.id"
        class="context-card"
        :class="{ active: context.id === state.activeContextId }"
      >
        <div class="card-title">
          <strong>{{ context.name }}</strong>
          <span>{{ context.id }} · 第 {{ context.activeLine }} 行</span>
        </div>
        <span v-if="index === 0" class="top-label">栈顶</span>
        <div class="scope-chain">
          <span v-for="scopeId in context.scopeIds" :key="scopeId">{{ scopeName(scopeId) }}</span>
        </div>
      </article>
    </section>

    <section class="memory-section scope-section">
      <div class="section-title-row">
        <h3><span class="section-dot scope-dot"></span>作用域</h3>
        <span>{{ visibleScopes.length }} 个活动记录</span>
      </div>
      <p class="section-note">变量绑定保存基础值或堆引用。</p>

      <article v-for="scope in visibleScopes" :key="scope.id" class="memory-card scope-card">
        <div class="card-title">
          <strong>{{ scope.name }}</strong>
          <span>{{ scope.kind === 'global' ? '全局' : '函数' }}</span>
        </div>

        <div v-if="!bindingEntries(scope).length" class="empty-state compact">暂无变量</div>
        <div v-for="binding in bindingEntries(scope)" :key="binding.name" class="value-row">
          <span>
            {{ binding.name }}
            <em>{{ binding.declaration }}</em>
          </span>
          <button
            v-if="binding.value.kind === 'reference'"
            type="button"
            class="reference-link"
            @click="selectReference(binding.value.value)"
          >
            {{ binding.value.value }}
          </button>
          <code v-else>{{ formatJavaScriptValue(binding.value) }}</code>
        </div>
      </article>
    </section>

    <section class="memory-section heap-section">
      <div class="section-title-row">
        <h3><span class="section-dot heap-dot"></span>堆内存</h3>
        <span>{{ heapEntries.length }} 个条目</span>
      </div>
      <p class="section-note">对象、数组和函数对象都分配在堆中。</p>

      <div v-if="!heapEntries.length" class="empty-state">声明对象、数组或函数后会出现堆条目</div>
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
            <span class="kind-badge">{{ heapKindLabel(entry.kind) }}</span>
          </div>
          <span>{{ entry.size }} 单位</span>
        </div>

        <template v-if="entry.kind === 'object'">
          <p class="entry-type">{{ entry.label }}</p>
          <div v-if="!recordEntries(entry.properties).length" class="empty-state compact">空对象</div>
          <div v-for="[name, value] in recordEntries(entry.properties)" :key="name" class="value-row">
            <span>{{ name }}</span>
            <button
              v-if="value.kind === 'reference'"
              type="button"
              class="reference-link"
              @click="selectReference(value.value)"
            >
              {{ value.value }}
            </button>
            <code v-else>{{ formatJavaScriptValue(value) }}</code>
          </div>
        </template>

        <template v-else-if="entry.kind === 'array'">
          <p class="entry-type">{{ entry.label }}[{{ entry.elements.length }}]</p>
          <div v-if="!entry.elements.length" class="empty-state compact">空数组</div>
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
            <code v-else>{{ formatJavaScriptValue(item.value) }}</code>
          </div>
        </template>

        <template v-else>
          <p class="entry-type">function {{ entry.name }}({{ entry.params.join(', ') }})</p>
          <div class="value-row">
            <span>声明行</span>
            <code>{{ entry.line }}</code>
          </div>
          <div class="value-row">
            <span>闭包作用域</span>
            <code>{{ entry.closureScopeIds.map(scopeName).join(' → ') }}</code>
          </div>
        </template>
      </article>
    </section>

    <section class="memory-section reference-section">
      <div class="section-title-row">
        <h3><span class="section-dot reference-dot"></span>引用关系</h3>
        <span>{{ state.references.length }} 条边</span>
      </div>
      <p class="section-note">变量或堆属性保存引用，引用指向堆条目。</p>

      <div v-if="!state.references.length" class="empty-state">当前没有引用边</div>
      <button
        v-for="edge in state.references"
        :key="`${edge.fromId}-${edge.slot}-${edge.toId}`"
        type="button"
        class="edge-row"
        @click="selectReference(edge.toId)"
      >
        <span>{{ edge.fromLabel }}.{{ edge.slot }}</span>
        <strong>→</strong>
        <code>{{ edge.toId }}</code>
      </button>
    </section>
  </aside>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { formatJavaScriptValue } from '@/terminal/javascriptMemoryModel'
import type {
  JavaScriptHeapArray,
  JavaScriptHeapEntry,
  JavaScriptScopeRecord,
  JavaScriptState,
  JavaScriptValue
} from '@/types'

const props = defineProps<{
  state: JavaScriptState
}>()

const ARRAY_PREVIEW_LIMIT = 16
const panelRef = ref<HTMLElement | null>(null)
const selectedReference = ref<string | null>(null)

const contexts = computed(() => props.state.callStack)
const stackFrames = computed(() => [...props.state.callStack].reverse())
const activeContext = computed(
  () => props.state.callStack.find((item) => item.id === props.state.activeContextId) || null
)
const visibleScopes = computed(() => {
  const scopeIds = activeContext.value?.scopeIds || props.state.callStack.at(-1)?.scopeIds || []
  return scopeIds.map((id) => props.state.scopes[id]).filter(Boolean)
})
const heapEntries = computed(() => Object.values(props.state.heap.entries))

function bindingEntries(scope: JavaScriptScopeRecord) {
  return Object.values(scope.bindings)
}

function recordEntries(record: Record<string, JavaScriptValue>) {
  return Object.entries(record)
}

function arrayValues(array: JavaScriptHeapArray) {
  return array.elements.slice(0, ARRAY_PREVIEW_LIMIT).map((value, index) => ({ value, index }))
}

function heapKindLabel(kind: JavaScriptHeapEntry['kind']) {
  return {
    object: 'OBJECT',
    array: 'ARRAY',
    function: 'FUNCTION'
  }[kind]
}

function scopeName(scopeId: string) {
  return props.state.scopes[scopeId]?.name || scopeId
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
.execution-panel {
  min-width: 0;
  max-height: calc(100vh - 104px);
  padding: 18px;
  overflow: auto;
  position: sticky;
  top: 80px;
  border: 1px solid #e4d78a;
  border-radius: 14px;
  color: #2f3025;
  background: rgba(255, 255, 255, 0.95);
  box-shadow: 0 14px 34px rgba(99, 91, 35, 0.11);
  scrollbar-color: #d7c75c transparent;
}

.panel-header,
.section-title-row,
.card-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.eyebrow {
  color: #9b8610;
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

.active-frame {
  padding: 5px 8px;
  border-radius: 999px;
  color: #695900;
  background: #fff4b8;
  font-size: 11px;
  font-weight: 700;
}

.overview {
  margin: 16px 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.overview-item {
  padding: 10px;
  border-radius: 9px;
  border: 1px solid #eee5aa;
  background: #fffdf1;
}

.overview-item span {
  display: block;
  color: #837a48;
  font-size: 10px;
}

.overview-item strong {
  display: block;
  margin-top: 4px;
  color: #292c21;
  font:
    18px Consolas,
    monospace;
}

.overview-item.stack {
  border-left: 3px solid #5a8f7b;
}
.overview-item.scope {
  border-left: 3px solid #f0db4f;
}
.overview-item.heap {
  border-left: 3px solid #4f9fd7;
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
  color: #8b8461;
  font-size: 10px;
}
.section-dot {
  width: 8px;
  height: 8px;
  border-radius: 3px;
}
.stack-dot {
  background: #5a8f7b;
}
.scope-dot {
  background: #f0db4f;
}
.heap-dot {
  background: #4f9fd7;
}
.reference-dot {
  background: #d28b30;
}
.section-note {
  margin: 4px 0 9px;
  color: #918b70;
  font-size: 11px;
}

.empty-state {
  padding: 16px 10px;
  border: 1px dashed #ddd4a1;
  border-radius: 9px;
  color: #a2986a;
  font-size: 11px;
  text-align: center;
}

.empty-state.compact {
  padding: 7px 0;
  border: 0;
  font-size: 10px;
}

.memory-card,
.context-card {
  position: relative;
  padding: 11px;
  border: 1px solid #e8e0ba;
  border-radius: 9px;
  background: #fff;
}

.memory-card + .memory-card,
.context-card + .context-card {
  margin-top: 8px;
}
.context-card {
  border-left: 3px solid #5a8f7b;
  background: #fbfffc;
}
.context-card.active {
  border-color: #32775f;
  box-shadow: 0 0 0 3px rgba(70, 143, 114, 0.12);
}
.scope-card {
  border-left: 3px solid #f0db4f;
}
.heap-card {
  border-left: 3px solid #4f9fd7;
}

.heap-card.selected {
  border-color: #d7b92c;
  box-shadow: 0 0 0 3px rgba(240, 219, 79, 0.2);
}

.card-title strong {
  color: #303223;
  font-size: 12px;
  overflow-wrap: anywhere;
}

.card-title span {
  color: #8f885f;
  font:
    10px Consolas,
    monospace;
}

.top-label {
  position: absolute;
  top: -1px;
  right: 8px;
  padding: 2px 5px;
  border-radius: 0 0 4px 4px;
  color: #fff;
  background: #32775f;
  font-size: 7px;
  font-weight: 800;
  letter-spacing: 0.6px;
}

.scope-chain {
  margin-top: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.scope-chain span {
  padding: 3px 6px;
  border-radius: 5px;
  color: #476b5e;
  background: #e8f5ef;
  font-size: 9px;
}

.value-row {
  min-height: 25px;
  padding: 3px 6px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border-radius: 5px;
  color: #716b52;
  background: #fbfaf2;
  font-size: 10px;
}

.value-row + .value-row {
  margin-top: 3px;
}
.value-row span {
  overflow-wrap: anywhere;
}

.value-row em {
  margin-left: 4px;
  color: #a28d14;
  font-size: 8px;
  font-style: normal;
  font-weight: 800;
}

.value-row code {
  color: #3d544c;
  font:
    10px Consolas,
    monospace;
  overflow-wrap: anywhere;
  text-align: right;
}

.reference-link {
  padding: 2px 6px;
  border: 0;
  border-radius: 4px;
  color: #2f7360;
  background: #dff4ec;
  font:
    700 10px Consolas,
    monospace;
  cursor: pointer;
}

.reference-link:hover {
  color: #fff;
  background: #32775f;
}

.kind-badge {
  margin-left: 5px;
  padding: 2px 5px;
  border-radius: 4px;
  color: #286f9e !important;
  background: #dff1fb;
  font: 8px sans-serif !important;
  font-weight: 800 !important;
}

.entry-type {
  margin: 5px 0 7px;
  color: #6d6750;
  font:
    10px Consolas,
    monospace;
}

.edge-row {
  width: 100%;
  min-height: 28px;
  padding: 4px 7px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 8px;
  border: 0;
  border-radius: 6px;
  color: #665f42;
  background: #fffaf0;
  font: inherit;
  cursor: pointer;
  text-align: left;
}

.edge-row + .edge-row {
  margin-top: 5px;
}
.edge-row span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.edge-row strong {
  color: #b57a27;
}
.edge-row code {
  color: #2f7360;
  font:
    10px Consolas,
    monospace;
}

@media (max-width: 1000px) {
  .execution-panel {
    max-height: none;
    position: static;
  }
}
</style>
