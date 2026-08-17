<template>
  <div class="docker-drawer" :class="{ open: isOpen }">
    <!-- 展开/收起触发按钮（始终可见） -->
    <button class="docker-toggle" @click="toggle" :title="isOpen ? '收起拓扑视图' : '展开拓扑视图'">
      <el-icon :size="18"><DataLine /></el-icon>
      <span class="toggle-label">拓扑视图</span>
      <el-icon v-if="isOpen" :size="14"><ArrowRight /></el-icon>
      <el-icon v-else :size="14"><ArrowLeft /></el-icon>
    </button>

    <!-- 抽屉面板 -->
    <div class="docker-drawer-card">
      <div class="docker-drawer-head">
        <div class="docker-drawer-title">
          <el-icon><DataLine /></el-icon>
          <span>Docker 拓扑视图</span>
        </div>
        <button class="docker-close" @click="isOpen = false" title="收起">
          <el-icon><ArrowRight /></el-icon>
        </button>
      </div>

      <div class="docker-drawer-body">
        <DockerVisualizer :env="env" :events="events" :sync-seq="syncSeq" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import DockerVisualizer from './DockerVisualizer.vue'

const props = defineProps({
  env: { type: Object, required: true },
  events: { type: Array, default: () => [] },
  syncSeq: { type: Number, default: 0 }
})

const STORAGE_KEY = 'docker-viz-panel-open'

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
</script>

<style scoped>
.docker-drawer {
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

.docker-drawer.open {
  pointer-events: auto;
}

/* 展开/收起触发按钮 */
.docker-toggle {
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
  color: #2496ed;
  font-size: 12px;
  font-weight: 700;
  transition: all 0.25s cubic-bezier(0.22, 1, 0.36, 1);
  pointer-events: auto;
  z-index: 101;
}

.docker-toggle:hover {
  background: #f0f8ff;
  padding-right: 12px;
}

.docker-drawer.open .docker-toggle {
  right: 460px;
}

.toggle-label {
  writing-mode: vertical-rl;
  letter-spacing: 2px;
  padding: 4px 0;
}

/* 抽屉卡片 */
.docker-drawer-card {
  width: 460px;
  height: calc(100vh - 64px);
  background: #f7f9fc;
  border-left: 1px solid var(--border-light);
  box-shadow: -8px 0 32px rgba(0, 0, 0, 0.1);
  transform: translateX(100%);
  transition: transform 0.3s cubic-bezier(0.22, 1, 0.36, 1);
  display: flex;
  flex-direction: column;
  pointer-events: auto;
}

.docker-drawer.open .docker-drawer-card {
  transform: translateX(0);
}

.docker-drawer-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-light);
  background: #fff;
  flex-shrink: 0;
}

.docker-drawer-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 800;
  color: var(--text-main);
}

.docker-drawer-title .el-icon {
  color: #2496ed;
  font-size: 18px;
}

.docker-close {
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

.docker-close:hover {
  background: #f0f2f5;
  color: #2496ed;
}

.docker-drawer-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* 覆盖 DockerVisualizer 内部样式以适配抽屉 */
.docker-drawer-body :deep(.viz-panel) {
  border-radius: 0;
  border: none;
  height: 100%;
}

@media (max-width: 1200px) {
  .docker-drawer-card {
    width: 380px;
  }

  .docker-drawer.open .docker-toggle {
    right: 380px;
  }
}

@media (max-width: 768px) {
  .docker-drawer-card {
    width: 100vw;
    top: 56px;
    height: calc(100vh - 56px);
  }

  .docker-drawer.open .docker-toggle {
    right: 100vw;
  }
}
</style>
