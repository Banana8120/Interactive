<template>
  <div class="state-drawer" :class="{ open: isOpen }">
    <!-- 展开/收起触发按钮（始终可见） -->
    <button class="state-toggle" @click="toggle" :title="isOpen ? '收起仓库状态' : '展开仓库状态'">
      <n-icon :size="18"><View /></n-icon>
      <span class="toggle-label">仓库状态</span>
      <n-icon v-if="isOpen" :size="14"><ArrowRight /></n-icon>
      <n-icon v-else :size="14"><ArrowLeft /></n-icon>
    </button>

    <!-- 面板内容 -->
    <div class="state-drawer-card">
      <div class="state-drawer-head">
        <div class="state-drawer-title">
          <n-icon><View /></n-icon>
          <span>仓库状态</span>
        </div>
        <button class="state-close" @click="isOpen = false" title="收起">
          <n-icon><ArrowRight /></n-icon>
        </button>
      </div>

      <div class="state-drawer-body">
        <!-- 用户与 HEAD -->
        <div class="state-section">
          <div class="state-section-title">
            <n-icon><User /></n-icon>
            <span>用户与 HEAD</span>
          </div>
          <div class="state-grid two">
            <div class="state-item">
              <span class="state-label">user.name</span>
              <span class="state-value" :class="{ muted: !env.config.user.name }">{{
                env.config.user.name || '未配置'
              }}</span>
            </div>
            <div class="state-item">
              <span class="state-label">user.email</span>
              <span class="state-value" :class="{ muted: !env.config.user.email }">{{
                env.config.user.email || '未配置'
              }}</span>
            </div>
            <div class="state-item">
              <span class="state-label">当前分支</span>
              <span class="state-value branch">
                <n-tag size="small" :bordered="false" :type="env.detached ? 'info' : 'error'" round>
                  <n-icon><Connection /></n-icon>
                  {{ headText }}
                </n-tag>
              </span>
            </div>
            <div class="state-item">
              <span class="state-label">提交总数</span>
              <span class="state-value">{{ commitCount }}</span>
            </div>
          </div>
        </div>

        <!-- 三区域状态 -->
        <div class="state-section">
          <div class="state-section-title">
            <n-icon><Sort /></n-icon>
            <span>工作区 / 暂存区 / 版本库</span>
          </div>
          <div class="areas-flow">
            <div class="area-box">
              <div class="area-title">工作区 Working Directory</div>
              <div class="area-body">
                <div v-if="workingFiles.length" class="area-files">
                  <n-tag
                    v-for="f in workingFiles"
                    :key="'wd-' + f.path"
                    size="small"
                    :bordered="false"
                    class="area-tag"
                    :type="f.status === 'untracked' ? 'info' : f.status === 'deleted' ? 'error' : 'warning'"
                  >
                    {{ f.path }}
                  </n-tag>
                </div>
                <div v-else class="area-empty">工作区无改动</div>
              </div>
            </div>

            <div class="area-arrow">
              <n-icon><ArrowRight /></n-icon>
              <span>git add</span>
            </div>

            <div class="area-box staged-box">
              <div class="area-title">暂存区 Staging Area</div>
              <div class="area-body">
                <div v-if="stagedFiles.length" class="area-files">
                  <n-tag
                    v-for="f in stagedFiles"
                    :key="'st-' + f.path"
                    size="small"
                    :bordered="false"
                    :type="f.status === 'new' ? 'success' : f.status === 'deleted' ? 'error' : 'warning'"
                    class="area-tag"
                  >
                    {{ f.path }}
                  </n-tag>
                </div>
                <div v-else class="area-empty">暂存区为空</div>
              </div>
            </div>

            <div class="area-arrow">
              <n-icon><ArrowRight /></n-icon>
              <span>git commit</span>
            </div>

            <div class="area-box repo-box">
              <div class="area-title">版本库 Repository</div>
              <div class="area-body">
                <div v-if="headCommit" class="repo-commit">
                  <div class="repo-hash">{{ headCommit.hash }}</div>
                  <div class="repo-msg">{{ headCommit.msg }}</div>
                </div>
                <div v-else class="area-empty">尚无提交</div>
              </div>
            </div>
          </div>
        </div>

        <!-- 分支 -->
        <div class="state-section">
          <div class="state-section-title">
            <n-icon><Share /></n-icon>
            <span>本地分支</span>
          </div>
          <div class="branch-list">
            <div v-for="b in branchList" :key="b.name" class="branch-chip" :class="{ active: b.active }">
              <n-icon v-if="b.active"><Flag /></n-icon>
              <span>{{ b.name }}</span>
              <span v-if="b.hash" class="branch-hash">@{{ b.hash }}</span>
            </div>
          </div>
        </div>

        <!-- 提交历史 -->
        <div class="state-section">
          <div class="state-section-title">
            <n-icon><Timer /></n-icon>
            <span>最近提交</span>
          </div>
          <div class="commit-list">
            <div v-for="c in recentCommits" :key="c.hash" class="commit-row">
              <div class="commit-dot" />
              <div class="commit-line" />
              <div class="commit-info">
                <div class="commit-hash">{{ c.hash }}</div>
                <div class="commit-msg">{{ c.msg }}</div>
                <div class="commit-meta">{{ c.author }} · {{ c.date }}</div>
              </div>
            </div>
            <div v-if="!recentCommits.length" class="area-empty">暂无提交</div>
          </div>
        </div>

        <!-- 远程与 Stash -->
        <div class="state-grid two state-section">
          <div class="state-section no-border">
            <div class="state-section-title">
              <n-icon><Link /></n-icon>
              <span>远程仓库</span>
            </div>
            <div v-if="remoteList.length" class="remote-list">
              <div v-for="r in remoteList" :key="r.name" class="remote-item">
                <div class="remote-name">{{ r.name }}</div>
                <div class="remote-url">{{ r.url }}</div>
                <div v-if="r.branches.length" class="remote-branches">
                  <n-tag v-for="br in r.branches" :key="br" size="small" :bordered="true" type="info">{{ br }}</n-tag>
                </div>
              </div>
            </div>
            <div v-else class="area-empty">未配置远程仓库</div>
          </div>

          <div class="state-section no-border">
            <div class="state-section-title">
              <n-icon><Box /></n-icon>
              <span>Stash</span>
            </div>
            <div v-if="env.stash.length" class="stash-list">
              <div v-for="(s, i) in env.stash" :key="i" class="stash-item">
                <span class="stash-index">{{ 'stash@{' + i + '}' }}</span>
                <span class="stash-msg">{{ s.msg }}</span>
              </div>
            </div>
            <div v-else class="area-empty">没有 stash 记录</div>
          </div>
        </div>

        <!-- 标签 -->
        <div v-if="tagList.length" class="state-section">
          <div class="state-section-title">
            <n-icon><PriceTag /></n-icon>
            <span>标签</span>
          </div>
          <div class="tag-list">
            <n-tag v-for="t in tagList" :key="t.name" size="small" :bordered="false" type="warning" round>{{
              t.name
            }}</n-tag>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { getGitState, getStatusMap } from '@/terminal/gitSimulator'
import type { GitState } from '@/types'

interface Props {
  /** 命令执行次数，变化时重新读取引擎状态 */
  checkTick?: number
}

const props = withDefaults(defineProps<Props>(), {
  checkTick: 0
})

const STORAGE_KEY = 'git-state-panel-open'

const isOpen = ref(false)

// 恢复展开状态
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

// 每次 checkTick 变化都重新抓取引擎状态（强制响应式刷新）
const env = computed(() => {
  // eslint-disable-next-line no-unused-expressions
  props.checkTick
  // 返回 state 的浅拷贝：避免 Vue computed 因同一对象引用而跳过下游依赖刷新
  return { ...getGitState() }
})

const headText = computed(() => {
  if (!env.value.initialized) return '未初始化'
  if (env.value.detached) return `HEAD @ ${env.value.detachedAt || '?'}`
  return env.value.head
})

const commitCount = computed(() => Object.keys(env.value.commits).length)

const headCommit = computed(() => {
  if (!env.value.initialized) return null
  const head = env.value.detached ? env.value.detachedAt : env.value.branches[env.value.head]
  return head ? env.value.commits[head] : null
})

// 工作区/暂存区文件（调用引擎状态工具）
const statusMap = computed(() => getStatusMap(env.value))

const workingFiles = computed(() => {
  return statusMap.value
    .filter((s) => s.working !== ' ')
    .map((s) => ({
      path: s.path,
      status: s.working === '?' ? 'untracked' : s.working === 'D' ? 'deleted' : 'modified'
    }))
})

// 暂存区：直接从引擎的 staged 对象读取，而不是 status 过滤后的结果。
// 这样即使文件与 HEAD 无变化，也能看到当前已 add 的内容。
const stagedFiles = computed(() => {
  if (!env.value.initialized) return []
  const headHash = env.value.detached ? env.value.detachedAt : env.value.branches[env.value.head]
  const tree = headHash ? env.value.commits[headHash]?.files || {} : {}
  return Object.entries(env.value.staged).map(([path, content]) => {
    let status: 'new' | 'modified' | 'deleted' = 'modified'
    if (content === null) status = 'deleted'
    else if (!Object.prototype.hasOwnProperty.call(tree, path)) status = 'new'
    return { path, status }
  })
})

const branchList = computed(() => {
  return Object.entries(env.value.branches).map(([name, hash]) => ({
    name,
    hash,
    active: !env.value.detached && env.value.head === name
  }))
})

const recentCommits = computed(() => {
  const list = []
  const seen = new Set()
  let cur = env.value.detached ? env.value.detachedAt : env.value.branches[env.value.head]
  while (cur && !seen.has(cur) && list.length < 5) {
    seen.add(cur)
    const c = env.value.commits[cur]
    if (!c) break
    list.push(c)
    cur = c.parent
  }
  return list
})

const remoteList = computed(() => {
  return Object.entries(env.value.remotes).map(([name, r]) => ({
    name,
    url: r.url,
    branches: Object.keys(r.branches || {})
  }))
})

const tagList = computed(() => {
  return Object.entries(env.value.tags).map(([name, hash]) => ({ name, hash }))
})
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

/* 展开/收起触发按钮 */
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
  box-shadow: -4px 4px 16px rgba(0, 0, 0, 0.08);
  cursor: pointer;
  color: #f05032;
  font-size: 12px;
  font-weight: 700;
  transition: all 0.25s cubic-bezier(0.22, 1, 0.36, 1);
  pointer-events: auto;
  z-index: 101;
}

.state-toggle:hover {
  background: #fff5f0;
  padding-right: 12px;
}

.state-drawer.open .state-toggle {
  right: 360px;
}

.toggle-label {
  writing-mode: vertical-rl;
  letter-spacing: 2px;
  padding: 4px 0;
}

/* 抽屉卡片 */
.state-drawer-card {
  width: 360px;
  height: calc(100vh - 64px);
  background: #fff;
  border-left: 1px solid var(--border-light);
  box-shadow: -8px 0 32px rgba(0, 0, 0, 0.1);
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
  background: #fafbfc;
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
  color: #f05032;
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
  background: #f0f2f5;
  color: #f05032;
}

.state-drawer-body {
  flex: 1;
  overflow-y: auto;
  padding-bottom: 20px;
}

.state-drawer-body::-webkit-scrollbar {
  width: 6px;
}

.state-drawer-body::-webkit-scrollbar-thumb {
  background: #d1d5db;
  border-radius: 3px;
}

/* 内部状态展示样式 */
.state-section {
  padding: 14px 16px;
  border-bottom: 1px solid #f0f2f5;
}

.state-section.no-border {
  border-bottom: none;
  padding: 0;
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
  color: #3c4a5c;
  margin-bottom: 10px;
}

.state-section-title .n-icon {
  color: #f05032;
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
  background: #f8fafc;
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

.state-value.muted {
  color: #c0c4cc;
  font-weight: 500;
}

.branch .n-tag {
  font-weight: 600;
}

.areas-flow {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.area-box {
  background: #f8fafc;
  border: 1px solid #ebeef5;
  border-radius: 10px;
  padding: 10px 12px;
}

.area-title {
  font-size: 12px;
  font-weight: 700;
  color: #606266;
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.staged-box {
  background: #f6ffed;
  border-color: #b7eb8f;
}

.repo-box {
  background: #fff2e8;
  border-color: #ffbb96;
}

.area-body {
  min-height: 34px;
}

.area-files {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.area-tag {
  font-family: 'SF Mono', Consolas, monospace;
}

.area-empty {
  font-size: 12px;
  color: #c0c4cc;
  text-align: center;
  padding: 6px 0;
}

.area-arrow {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: #909399;
  font-size: 11px;
}

.area-arrow .n-icon {
  font-size: 14px;
}

.repo-commit {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.repo-hash {
  font-family: 'SF Mono', Consolas, monospace;
  font-size: 12px;
  color: #f05032;
  font-weight: 700;
}

.repo-msg {
  font-size: 13px;
  color: var(--text-main);
  font-weight: 600;
}

.branch-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.branch-chip {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  border-radius: 20px;
  background: #f0f2f5;
  color: #606266;
  font-size: 12px;
  font-weight: 500;
}

.branch-chip.active {
  background: #fdece8;
  color: #c9472c;
  font-weight: 700;
}

.branch-hash {
  font-family: 'SF Mono', Consolas, monospace;
  font-size: 10px;
  opacity: 0.7;
}

.commit-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  position: relative;
}

.commit-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding-left: 10px;
  position: relative;
}

.commit-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #f05032;
  margin-top: 5px;
  flex-shrink: 0;
}

.commit-line {
  position: absolute;
  left: 14px;
  top: 12px;
  bottom: -10px;
  width: 2px;
  background: #f0f2f5;
}

.commit-row:last-child .commit-line {
  display: none;
}

.commit-info {
  flex: 1;
  min-width: 0;
  padding-bottom: 10px;
}

.commit-hash {
  font-family: 'SF Mono', Consolas, monospace;
  font-size: 11px;
  color: #f05032;
  font-weight: 700;
}

.commit-msg {
  font-size: 12.5px;
  color: var(--text-main);
  font-weight: 600;
  line-height: 1.5;
}

.commit-meta {
  font-size: 11px;
  color: #909399;
  margin-top: 2px;
}

.remote-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.remote-item {
  background: #f8fafc;
  border-radius: 8px;
  padding: 8px 10px;
}

.remote-name {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-main);
}

.remote-url {
  font-size: 11px;
  color: #909399;
  word-break: break-all;
  margin-top: 2px;
}

.remote-branches {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
}

.stash-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.stash-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  background: #f8fafc;
  border-radius: 6px;
  padding: 6px 8px;
}

.stash-index {
  font-family: 'SF Mono', Consolas, monospace;
  color: #f05032;
  font-weight: 700;
}

.stash-msg {
  color: var(--text-main);
  flex: 1;
}

.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

@media (max-width: 1200px) {
  .state-grid.two {
    grid-template-columns: 1fr;
  }

  .state-drawer-card {
    width: 320px;
  }

  .state-drawer.open .state-toggle {
    right: 320px;
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
