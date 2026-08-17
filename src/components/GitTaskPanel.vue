<template>
  <div class="task-panel">
    <!-- 任务头部 -->
    <div class="task-head">
      <div class="task-title">
        <el-icon :size="16"><Goal /></el-icon>
        <span>当前练习</span>
      </div>
      <el-tag
        size="small"
        :type="done ? 'success' : 'warning'"
        effect="light"
        round
      >{{ done ? '已完成' : '进行中' }}</el-tag>
    </div>

    <!-- 任务描述 -->
    <div class="task-body">
      <div class="task-name">{{ practice.title }}</div>
      <p class="task-desc">{{ practice.desc }}</p>

      <!-- 完成提示 -->
      <transition name="fade">
        <el-alert
          v-if="done"
          type="success"
          :closable="false"
          class="task-success"
        >
          <template #title>{{ practice.successMsg || '练习完成！' }}</template>
        </el-alert>
      </transition>

      <!-- 卡住自动提示 -->
      <transition name="fade">
        <el-alert
          v-if="stuckHint"
          type="info"
          :closable="false"
          class="task-stuck"
        >
          <template #title>
            <b>💡 卡住了？试试：</b>{{ stuckHint }}
          </template>
        </el-alert>
      </transition>

      <!-- 分级提示 -->
      <div class="hint-area" v-if="practice.hints && practice.hints.length">
        <el-button
          size="small"
          round
          plain
          :type="revealed >= practice.hints.length ? 'success' : 'primary'"
          @click="nextHint"
          :disabled="done"
        >
          <el-icon><MagicStick /></el-icon>&nbsp;
          {{ revealed === 0 ? '查看提示' : revealed >= practice.hints.length ? '提示已全部展示' : `再看一条提示（${revealed}/${practice.hints.length}）` }}
        </el-button>
        <transition-group name="hint-list" tag="div" class="hint-list">
          <div v-for="(h, i) in practice.hints.slice(0, revealed)" :key="i" class="hint-item">
            <span class="hint-num">{{ i + 1 }}</span>
            <code>{{ h }}</code>
          </div>
        </transition-group>
      </div>
    </div>

    <!-- 底部操作 -->
    <div class="task-foot">
      <el-button
        size="small"
        round
        :type="done ? 'success' : 'primary'"
        :disabled="done"
        @click="markDone"
      >
        <el-icon><CircleCheck /></el-icon>&nbsp;{{ done ? '已完成' : '标记本节完成' }}
      </el-button>
      <span class="task-foot-tip" v-if="!done">在终端完成操作后自动检测</span>
      <span class="task-foot-tip" v-else>干得漂亮！🎉</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { getGitState } from '@/terminal/gitSimulator'
import type { GitPractice } from '@/types'

interface Props {
  practice: GitPractice
  lessonId: string
  /** 命令执行次数（每次命令后 +1，触发自动检测） */
  checkTick?: number
  /** 连续错误次数（触发卡住提示） */
  errorStreak?: number
  done?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  checkTick: 0,
  errorStreak: 0,
  done: false
})

const emit = defineEmits<{
  (e: 'complete'): void
  (e: 'auto-done'): void
  (e: 'hint-used', revealed: number): void
}>()

const revealed = ref(0)

// 任务完成检测（由父组件基于 checkTick 触发，或本组件直接调用）
const doneNow = computed(() => {
  // eslint-disable-next-line no-unused-expressions
  props.checkTick
  if (!props.practice || typeof props.practice.check !== 'function') return false
  try {
    return !!props.practice.check(getGitState())
  } catch (e) {
    return false
  }
})

// 卡住提示：连续错误 >= 2 次，且还没看过提示
const stuckHint = computed(() => {
  if (props.errorStreak < 2) return ''
  if (!props.practice.hints || !props.practice.hints.length) return ''
  return props.practice.hints[0]
})

function nextHint() {
  if (revealed.value >= props.practice.hints.length) return
  revealed.value++
  emit('hint-used', revealed.value)
}

function markDone() {
  if (doneNow.value || props.done) {
    emit('complete')
    ElMessage.success('本节已标记完成，进度已保存 🎉')
  } else {
    ElMessage.info('任务还未完成，再试试看？或点击“查看提示”获取线索。')
  }
}

// 每次命令执行后重新检测（父组件 watch checkTick 调用）
watch(() => props.checkTick, () => {
  if (doneNow.value) emit('auto-done')
})
</script>

<style scoped>
.task-panel {
  background: #fff;
  border: 1px solid var(--border-light);
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.06);
}

.task-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: linear-gradient(135deg, #fff5f0 0%, #fff 60%);
  border-bottom: 1px solid var(--border-light);
}

.task-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 700;
  color: #c9472c;
  flex: 1;
}

.task-body {
  padding: 14px 16px;
}

.task-name {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-main);
  margin-bottom: 8px;
}

.task-desc {
  font-size: 13px;
  color: var(--text-sub);
  line-height: 1.75;
  margin: 0 0 12px;
}

.task-desc :deep(code) {
  background: #fdf0eb;
  color: #c9472c;
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 12px;
}

.task-success {
  margin-bottom: 10px;
  border-radius: 8px;
}

.task-stuck {
  margin-bottom: 10px;
  border-radius: 8px;
}

.task-stuck :deep(.el-alert__title) {
  font-size: 12.5px;
  line-height: 1.6;
}

.hint-area {
  margin-top: 4px;
}

.hint-list {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.hint-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  background: #f6f8fb;
  border: 1px dashed #c9d6e5;
  border-radius: 8px;
  padding: 7px 10px;
}

.hint-num {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #f05032;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 1px;
}

.hint-item code {
  font-size: 12px;
  color: #3c4a5c;
  line-height: 1.6;
  word-break: break-all;
  white-space: pre-wrap;
  font-family: 'SF Mono', Consolas, monospace;
}

.task-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 16px;
  background: #fafbfc;
  border-top: 1px solid var(--border-light);
}

.task-foot-tip {
  font-size: 11.5px;
  color: #909399;
}

.hint-list-enter-active {
  transition: all 0.3s cubic-bezier(0.22, 1, 0.36, 1);
}
.hint-list-enter-from {
  opacity: 0;
  transform: translateY(-6px);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
