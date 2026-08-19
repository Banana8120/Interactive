<template>
  <div class="task-panel">
    <div class="task-head">
      <div class="task-title">
        <n-icon :size="16"><Goal /></n-icon>
        <span>当前练习</span>
      </div>
      <n-tag
        size="small"
        :type="done ? 'success' : 'warning'"
        :bordered="false"
        round
      >{{ done ? '已完成' : '进行中' }}</n-tag>
    </div>

    <div class="task-body">
      <div class="task-name">{{ practice.title }}</div>
      <p class="task-desc">{{ practice.desc }}</p>

      <transition name="fade">
        <n-alert
          v-if="done"
          type="success"
          :closable="false"
          class="task-success"
        >
          <template #header>{{ practice.successMsg || '练习完成！' }}</template>
        </n-alert>
      </transition>

      <transition name="fade">
        <n-alert
          v-if="stuckHint"
          type="info"
          :closable="false"
          class="task-stuck"
        >
          <template #header>
            <b>卡住了？试试：</b>{{ stuckHint }}
          </template>
        </n-alert>
      </transition>

      <div class="hint-area" v-if="practice.hints && practice.hints.length">
        <n-button
          size="small"
          round
          secondary
          :type="revealed >= practice.hints.length ? 'success' : 'primary'"
          @click="nextHint"
          :disabled="done"
        >
          <n-icon><MagicStick /></n-icon>&nbsp;
          {{ revealed === 0 ? '查看提示' : revealed >= practice.hints.length ? '提示已全部展示' : `再看一条提示（${revealed}/${practice.hints.length}）` }}
        </n-button>
        <transition-group name="hint-list" tag="div" class="hint-list">
          <div v-for="(h, i) in practice.hints.slice(0, revealed)" :key="i" class="hint-item">
            <span class="hint-num">{{ i + 1 }}</span>
            <code>{{ h }}</code>
          </div>
        </transition-group>
      </div>
    </div>

    <div class="task-foot">
      <n-button
        size="small"
        round
        :type="done ? 'success' : 'primary'"
        :disabled="done"
        @click="markDone"
      >
        <n-icon><CircleCheck /></n-icon>&nbsp;{{ done ? '已完成' : '标记本节完成' }}
      </n-button>
      <span class="task-foot-tip" v-if="!done">在终端完成操作后自动检测</span>
      <span class="task-foot-tip" v-else>任务已记录</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { message } from '@/utils/feedback'
import { getMySqlState } from '@/terminal/mysqlSimulator'
import type { MySqlPractice } from '@/types'

interface Props {
  practice: MySqlPractice
  lessonId: string
  checkTick?: number
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

const doneNow = computed(() => {
  props.checkTick
  if (!props.practice || typeof props.practice.check !== 'function') return false
  try {
    return !!props.practice.check(getMySqlState())
  } catch (e) {
    return false
  }
})

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
    message.success('本节已标记完成，进度已保存')
  } else {
    message.info('任务还未完成，再试试看，或打开提示看一眼线索。')
  }
}

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
  box-shadow: 0 6px 20px rgba(0, 55, 80, 0.06);
}

.task-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: linear-gradient(135deg, #eefcff 0%, #fff 68%);
  border-bottom: 1px solid var(--border-light);
}

.task-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 700;
  color: #00618a;
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

.task-success,
.task-stuck {
  margin-bottom: 10px;
  border-radius: 8px;
}

.task-stuck :deep(.n-alert-body__title) {
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
  background: #f6fbfd;
  border: 1px dashed #b8dce8;
  border-radius: 8px;
  padding: 7px 10px;
}

.hint-num {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #00a3c4;
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
  color: #2f4d5f;
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
  background: #fafcfd;
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
