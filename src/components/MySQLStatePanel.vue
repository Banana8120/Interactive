<template>
  <div class="state-drawer" :class="{ open: isOpen }">
    <button class="state-toggle" @click="toggle" :title="isOpen ? '收起数据面板' : '展开数据面板'">
      <n-icon :size="18"><Database /></n-icon>
      <span class="toggle-label">数据面板</span>
      <n-icon v-if="isOpen" :size="14"><ArrowRight /></n-icon>
      <n-icon v-else :size="14"><ArrowLeft /></n-icon>
    </button>

    <div class="state-drawer-card">
      <div class="state-drawer-head">
        <div class="state-drawer-title">
          <n-icon><Database /></n-icon>
          <span>MySQL 数据面板</span>
        </div>
        <button class="state-close" @click="isOpen = false" title="收起">
          <n-icon><ArrowRight /></n-icon>
        </button>
      </div>

      <div class="state-drawer-body">
        <div class="state-section">
          <div class="state-section-title">
            <n-icon><Monitor /></n-icon>
            <span>连接与当前数据库</span>
          </div>
          <div class="state-grid two">
            <div class="state-item">
              <span class="state-label">连接状态</span>
              <span class="state-value">
                <n-tag size="small" :type="env.connected ? 'success' : 'warning'" :bordered="false" round>
                  {{ env.connected ? '已连接' : '未连接' }}
                </n-tag>
              </span>
            </div>
            <div class="state-item">
              <span class="state-label">当前数据库</span>
              <span class="state-value" :class="{ muted: !env.currentDatabase }">{{
                env.currentDatabase || '未选择'
              }}</span>
            </div>
            <div class="state-item">
              <span class="state-label">数据库数</span>
              <span class="state-value">{{ databases.length }}</span>
            </div>
            <div class="state-item">
              <span class="state-label">当前库表数</span>
              <span class="state-value">{{ tableNames.length }}</span>
            </div>
          </div>
        </div>

        <div class="state-section">
          <div class="state-section-title">
            <n-icon><Server /></n-icon>
            <span>数据库</span>
          </div>
          <div class="db-list">
            <n-tag
              v-for="db in databases"
              :key="db.name"
              size="small"
              :type="db.name === env.currentDatabase ? 'info' : db.system ? 'default' : 'success'"
              :bordered="db.name !== env.currentDatabase"
              round
            >
              {{ db.name }}<span v-if="db.system" class="sys-flag"> system</span>
            </n-tag>
          </div>
        </div>

        <div class="state-section">
          <div class="state-section-title">
            <n-icon><TableCells /></n-icon>
            <span>当前库中的表</span>
          </div>
          <div v-if="!currentDb" class="area-empty">尚未选择数据库</div>
          <div v-else-if="!tableNames.length" class="area-empty">当前数据库还没有表</div>
          <div v-else class="table-list">
            <button
              v-for="name in tableNames"
              :key="name"
              class="table-chip"
              :class="{ active: selectedTableName === name }"
              @click="selectedTableName = name"
            >
              <n-icon><TableCells /></n-icon>
              <span>{{ name }}</span>
              <small>{{ currentDb?.tables[name]?.rows.length || 0 }} 行</small>
            </button>
          </div>
        </div>

        <div class="state-section" v-if="selectedTable">
          <div class="state-section-title">
            <n-icon><Key /></n-icon>
            <span>{{ selectedTable.name }} 表结构</span>
          </div>
          <div class="schema-table-wrap">
            <table class="schema-table">
              <thead>
                <tr>
                  <th>字段</th>
                  <th>类型</th>
                  <th>约束</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="column in selectedTable.columns" :key="column.name">
                  <td>{{ column.name }}</td>
                  <td>{{ column.type }}</td>
                  <td>
                    <span v-if="column.primaryKey">PK</span>
                    <span v-if="column.autoIncrement">AI</span>
                    <span v-if="!column.nullable">NOT NULL</span>
                    <span v-if="column.nullable && !column.primaryKey">NULL</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="state-section" v-if="selectedTable">
          <div class="state-section-title">
            <n-icon><List /></n-icon>
            <span>{{ selectedTable.name }} 行数据</span>
          </div>
          <div v-if="!selectedTable.rows.length" class="area-empty">暂无数据</div>
          <div v-else class="data-table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th v-for="column in selectedTable.columns" :key="column.name">{{ column.name }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, index) in previewRows" :key="index">
                  <td v-for="column in selectedTable.columns" :key="column.name">
                    <span :class="{ muted: row[column.name] === null }">{{ row[column.name] ?? 'NULL' }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
            <div v-if="selectedTable.rows.length > previewRows.length" class="table-note">
              仅显示前 {{ previewRows.length }} 行，共 {{ selectedTable.rows.length }} 行
            </div>
          </div>
        </div>

        <div class="state-section">
          <div class="state-section-title">
            <n-icon><Timer /></n-icon>
            <span>最近命令</span>
          </div>
          <div v-if="recentHistory.length" class="history-list">
            <code v-for="(cmd, index) in recentHistory" :key="index + '-' + cmd">{{ cmd }}</code>
          </div>
          <div v-else class="area-empty">还没有执行命令</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { getMySqlState } from '@/terminal/mysqlSimulator'
import type { MySqlDatabase, MySqlState, MySqlTable } from '@/types'

interface Props {
  checkTick?: number
}

const props = withDefaults(defineProps<Props>(), {
  checkTick: 0
})

const STORAGE_KEY = 'mysql-state-panel-open'
const isOpen = ref(false)
const selectedTableName = ref('')

try {
  if (typeof localStorage !== 'undefined') {
    isOpen.value = localStorage.getItem(STORAGE_KEY) === '1'
  }
} catch (e) {
  isOpen.value = false
}

watch(isOpen, (v) => {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, v ? '1' : '0')
    }
  } catch (e) {}
})

function toggle() {
  isOpen.value = !isOpen.value
}

const env = computed<MySqlState>(() => {
  props.checkTick
  const state = getMySqlState()
  return {
    ...state,
    databases: { ...state.databases },
    history: [...state.history]
  }
})

const databases = computed(() =>
  Object.values(env.value.databases).sort((a, b) => Number(a.system) - Number(b.system) || a.name.localeCompare(b.name))
)

const currentDb = computed<MySqlDatabase | null>(() => {
  if (!env.value.currentDatabase) return null
  return env.value.databases[env.value.currentDatabase] || null
})

const tableNames = computed(() => (currentDb.value ? Object.keys(currentDb.value.tables).sort() : []))

const selectedTable = computed<MySqlTable | null>(() => {
  if (!currentDb.value || !selectedTableName.value) return null
  return currentDb.value.tables[selectedTableName.value] || null
})

const previewRows = computed(() => (selectedTable.value ? selectedTable.value.rows.slice(0, 10) : []))
const recentHistory = computed(() => env.value.history.slice(-6).reverse())

watch(
  () => [props.checkTick, env.value.currentDatabase, tableNames.value.join('|')],
  () => {
    if (!tableNames.value.length) {
      selectedTableName.value = ''
      return
    }
    if (!selectedTableName.value || !tableNames.value.includes(selectedTableName.value)) {
      selectedTableName.value = tableNames.value[0]
    }
  },
  { immediate: true }
)
</script>

<style scoped>
.state-drawer {
  position: fixed;
  top: 64px;
  right: 0;
  bottom: 0;
  z-index: 100;
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  pointer-events: none;
}

.state-drawer.open {
  pointer-events: auto;
}

.state-toggle {
  position: fixed;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 14px 8px;
  background: #fff;
  border: 1px solid var(--border-light);
  border-right: none;
  border-radius: 10px 0 0 10px;
  box-shadow: -4px 4px 16px rgba(0, 55, 80, 0.08);
  cursor: pointer;
  color: #00618a;
  font-size: 12px;
  font-weight: 700;
  transition: all 0.25s cubic-bezier(0.22, 1, 0.36, 1);
  pointer-events: auto;
  z-index: 101;
}

.state-toggle:hover {
  background: #eefcff;
  padding-right: 12px;
}

.state-drawer.open .state-toggle {
  right: 400px;
}

.toggle-label {
  writing-mode: vertical-rl;
  letter-spacing: 2px;
  padding: 4px 0;
}

.state-drawer-card {
  width: 400px;
  height: calc(100vh - 64px);
  background: #fff;
  border-left: 1px solid var(--border-light);
  box-shadow: -8px 0 32px rgba(0, 55, 80, 0.1);
  transform: translateX(100%);
  transition: transform 0.3s cubic-bezier(0.22, 1, 0.36, 1);
  display: flex;
  flex-direction: column;
  pointer-events: auto;
}

.state-drawer.open .state-drawer-card {
  transform: translateX(0);
}

.state-drawer-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-light);
  background: #fafcfd;
  flex-shrink: 0;
}

.state-drawer-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 800;
  color: var(--text-main);
}

.state-drawer-title .n-icon {
  color: #00618a;
  font-size: 18px;
}

.state-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: #909399;
  cursor: pointer;
  transition: all 0.2s;
}

.state-close:hover {
  background: #eefcff;
  color: #00618a;
}

.state-drawer-body {
  flex: 1;
  overflow-y: auto;
  padding-bottom: 20px;
}

.state-section {
  padding: 14px 16px;
  border-bottom: 1px solid #f0f2f5;
}

.state-section:last-child {
  border-bottom: none;
}

.state-section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 700;
  color: #2f4d5f;
  margin-bottom: 10px;
}

.state-section-title .n-icon {
  color: #00618a;
}

.state-grid {
  display: grid;
  gap: 10px;
}

.state-grid.two {
  grid-template-columns: repeat(2, 1fr);
}

.state-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: #f8fbfd;
  border-radius: 8px;
  padding: 8px 10px;
}

.state-label {
  font-size: 11.5px;
  color: #909399;
}

.state-value {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-main);
  word-break: break-all;
}

.muted {
  color: #c0c4cc;
}

.db-list,
.table-list,
.history-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.sys-flag {
  opacity: 0.6;
  font-size: 10px;
}

.table-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  border: 1px solid #d7e9ef;
  background: #f8fbfd;
  color: #2f4d5f;
  border-radius: 8px;
  padding: 7px 10px;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 12px;
}

.table-chip small {
  color: #7a8c99;
}

.table-chip.active,
.table-chip:hover {
  border-color: #00a3c4;
  background: #eefcff;
  color: #00618a;
}

.schema-table-wrap,
.data-table-wrap {
  overflow-x: auto;
  border: 1px solid #e5edf1;
  border-radius: 8px;
}

.schema-table,
.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.schema-table th,
.schema-table td,
.data-table th,
.data-table td {
  border-bottom: 1px solid #edf2f5;
  padding: 7px 9px;
  text-align: left;
  white-space: nowrap;
}

.schema-table th,
.data-table th {
  background: #f4fbfd;
  color: #00618a;
  font-weight: 700;
}

.schema-table tr:last-child td,
.data-table tr:last-child td {
  border-bottom: none;
}

.schema-table td:last-child {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.schema-table td:last-child span {
  background: #eefcff;
  border: 1px solid #c8eaf1;
  color: #00618a;
  border-radius: 4px;
  padding: 1px 4px;
  font-size: 10.5px;
}

.data-table td {
  font-family: 'SF Mono', Consolas, monospace;
}

.table-note {
  padding: 7px 9px;
  font-size: 11.5px;
  color: #909399;
  background: #fafcfd;
}

.history-list {
  flex-direction: column;
}

.history-list code {
  display: block;
  background: #f4fbfd;
  border: 1px solid #d7e9ef;
  border-radius: 6px;
  color: #2f4d5f;
  font-size: 11.5px;
  line-height: 1.5;
  padding: 6px 8px;
  word-break: break-all;
  white-space: pre-wrap;
}

.area-empty {
  font-size: 12px;
  color: #c0c4cc;
  text-align: center;
  padding: 8px 0;
}

@media (max-width: 1200px) {
  .state-grid.two {
    grid-template-columns: 1fr;
  }

  .state-drawer-card {
    width: 340px;
  }

  .state-drawer.open .state-toggle {
    right: 340px;
  }
}

@media (max-width: 768px) {
  .state-drawer-card {
    width: 100vw;
    top: 56px;
    height: calc(100vh - 56px);
  }

  .state-drawer.open .state-toggle {
    right: 100vw;
  }
}
</style>
