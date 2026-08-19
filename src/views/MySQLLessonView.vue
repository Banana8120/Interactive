<template>
  <div v-if="lesson && chapter" class="mysql-lesson-page">
    <div class="lesson-crumb">
      <n-breadcrumb separator="/">
        <n-breadcrumb-item>
          <router-link to="/mysql">MySQL 学习</router-link>
        </n-breadcrumb-item>
        <n-breadcrumb-item>
          <router-link :to="{ path: '/mysql', query: { ch: chapter.id } }">{{ chapter.title }}</router-link>
        </n-breadcrumb-item>
        <n-breadcrumb-item>{{ lesson.title }}</n-breadcrumb-item>
      </n-breadcrumb>
    </div>

    <div class="lesson-layout">
      <div class="lesson-main">
        <div class="lesson-head">
          <div class="lesson-head-tags">
            <n-tag size="small" round :style="{ background: chapter.color + '14', color: chapter.color, borderColor: chapter.color + '44' }" :bordered="true">
              {{ chapter.index }} · {{ lesson.concept }}
            </n-tag>
            <n-tag v-if="store.isLessonCompleted(lesson.id)" type="success" size="small" :bordered="false" round>已学完</n-tag>
          </div>
          <h1 class="lesson-title">{{ lesson.title }}</h1>
        </div>

        <n-card :bordered="true" class="content-card">
          <LessonContent :blocks="lesson.content" />

          <n-alert
            v-if="lesson.practice"
            type="info"
            :closable="false"
            class="practice-alert"
          >
            <template #header>
              <b>动手练习</b>：{{ lesson.practice.title }}
            </template>
          </n-alert>
        </n-card>

        <div class="lesson-actions">
          <n-button size="large" round @click="goPrev" :disabled="!prevLesson">
            <n-icon><ArrowLeft /></n-icon>&nbsp;上一节
          </n-button>

          <n-button
            size="large"
            :type="store.isLessonCompleted(lesson.id) ? 'success' : 'primary'"
            round
            @click="markDone"
          >
            <n-icon><CircleCheck /></n-icon>&nbsp;{{ store.isLessonCompleted(lesson.id) ? '本节已完成' : '标记本节完成' }}
          </n-button>

          <n-button size="large" round :disabled="!nextLesson" @click="goNext">
            下一节&nbsp;<n-icon><ArrowRight /></n-icon>
          </n-button>
        </div>
      </div>

      <div class="lesson-side">
        <MySQLTaskPanel
          v-if="lesson.practice"
          :key="'task-' + lesson.id"
          :practice="lesson.practice"
          :lesson-id="lesson.id"
          :check-tick="checkTick"
          :error-streak="errorStreak"
          :done="store.isLessonCompleted(lesson.id)"
          @complete="onComplete"
          @auto-done="onAutoDone"
          @hint-used="onHintUsed"
        />
        <div class="terminal-widget">
          <div class="widget-head">
            <n-icon><Monitor /></n-icon>
            <span>实操终端</span>
            <n-tag size="small" type="success" :bordered="false" round class="live-tag">模拟环境</n-tag>
          </div>
          <MySQLTerminal
            :key="'term-' + lesson.id"
            :suggestions="practiceCommands"
            @command-executed="onCommand"
            @reset-environment="resetPractice"
          />
          <div class="terminal-foot">
            <n-icon><InfoFilled /></n-icon>
            输入 <code>help</code> 查看示例 · ↑↓ 历史 · Tab 补全 · 数据面板实时刷新
          </div>
        </div>
      </div>

      <MySQLStatePanel :check-tick="checkTick" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { message, confirmDialog } from '@/utils/feedback'
import { mysqlChapters } from '@/data/mysqlLessons'
import { useMySqlProgressStore } from '@/stores/mysqlProgress'
import { clearMySqlState, loadMySqlState, resetMySqlEnvironment, saveMySqlState } from '@/terminal/mysqlSimulator'
import type { MySqlChapter, MySqlLesson } from '@/types'
import LessonContent from '@/components/LessonContent.vue'
import MySQLTerminal from '@/components/MySQLTerminal.vue'
import MySQLTaskPanel from '@/components/MySQLTaskPanel.vue'
import MySQLStatePanel from '@/components/MySQLStatePanel.vue'

const route = useRoute()
const router = useRouter()
const store = useMySqlProgressStore()

interface FlatLesson extends MySqlLesson {
  chapterId: string
}

const allLessons = computed<FlatLesson[]>(() =>
  mysqlChapters.flatMap((c: MySqlChapter) => c.lessons.map((l) => ({ ...l, chapterId: c.id })))
)
const index = computed(() => allLessons.value.findIndex((l) => l.id === route.params.lessonId))
const lesson = computed<FlatLesson | null>(() => allLessons.value[index.value] || null)
const chapter = computed(() => mysqlChapters.find((c) => c.id === lesson.value?.chapterId))
const prevLesson = computed(() => index.value > 0 ? allLessons.value[index.value - 1] : null)
const nextLesson = computed(() => index.value < allLessons.value.length - 1 ? allLessons.value[index.value + 1] : null)

const practiceCommands = computed(() => lesson.value?.practice?.commands || [])
const checkTick = ref(0)
const errorStreak = ref(0)

watch(lesson, (l) => {
  if (l) {
    const restored = loadMySqlState(l.id)
    if (!restored) resetMySqlEnvironment()
    checkTick.value++
    errorStreak.value = 0
    store.setLastVisited(l.id)
  }
}, { immediate: true })

onMounted(() => {
  checkTick.value++
})

function onCommand({ errorStreak: streak }: { ok: boolean; errorStreak: number }) {
  errorStreak.value = streak || 0
  checkTick.value++
  if (lesson.value) saveMySqlState(lesson.value.id)
}

function onAutoDone() {
  if (!lesson.value) return
  store.completeLesson(lesson.value.id)
  message.success('任务完成！本节已自动记录')
}

function onComplete() {
  if (!lesson.value) return
  store.completeLesson(lesson.value.id)
}

function onHintUsed(level: number) {
  if (!lesson.value) return
  store.recordHint(lesson.value.id, level)
}

function markDone() {
  if (!lesson.value) return
  const done = store.isLessonCompleted(lesson.value.id)
  store.completeLesson(lesson.value.id)
  message.success(done ? '本节已完成' : '本节已标记完成，进度已保存')
}

function goPrev() {
  if (prevLesson.value) router.push(`/mysql/lesson/${prevLesson.value.id}`)
}

function goNext() {
  if (nextLesson.value) router.push(`/mysql/lesson/${nextLesson.value.id}`)
}

function resetPractice() {
  if (!lesson.value) return
  confirmDialog(
    '重置将清空当前课时的 MySQL 模拟数据，回到初始练习状态。确定要继续吗？',
    '重置当前练习',
    { confirmButtonText: '重置', cancelButtonText: '取消', type: 'warning' }
  )
    .then(() => {
      clearMySqlState(lesson.value!.id)
      resetMySqlEnvironment()
      checkTick.value++
      message.success('当前练习已重置')
    })
    .catch(() => {})
}
</script>

<style scoped>
.mysql-lesson-page {
  max-width: 1600px;
  margin: 0 auto;
}

.lesson-crumb {
  margin-bottom: 16px;
}

.lesson-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 720px;
  gap: 24px;
  align-items: start;
}

.lesson-main {
  min-width: 0;
}

.lesson-head {
  margin-bottom: 16px;
}

.lesson-head-tags {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
  align-items: center;
}

.lesson-title {
  font-size: 24px;
  font-weight: 800;
  margin: 0;
  color: var(--text-main);
  line-height: 1.4;
}

.content-card {
  border-radius: 14px;
  border: 1px solid var(--border-light);
}

.content-card :deep(.n-card__content) {
  padding: 22px 26px;
}

.practice-alert {
  margin: 18px 0 6px;
  border-radius: 8px;
}

.lesson-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-top: 20px;
  flex-wrap: wrap;
}

.lesson-side {
  position: sticky;
  top: 72px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.terminal-widget {
  background: #fff;
  border-radius: 14px;
  border: 1px solid var(--border-light);
  overflow: hidden;
  box-shadow: 0 6px 20px rgba(0, 55, 80, 0.06);
}

.widget-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: #f8fbfd;
  border-bottom: 1px solid var(--border-light);
  font-size: 14px;
  font-weight: 700;
  color: var(--text-main);
}

.widget-head .n-icon {
  color: #00618a;
  font-size: 17px;
}

.live-tag {
  margin-left: auto;
}

.terminal-foot {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 9px 14px;
  background: #f8fbfd;
  border-top: 1px solid var(--border-light);
  font-size: 11.5px;
  color: #909399;
}

.terminal-foot .n-icon {
  color: #00618a;
}

.terminal-foot code {
  background: #eefcff;
  padding: 1px 6px;
  border-radius: 4px;
  color: #00618a;
}

@media (max-width: 1200px) {
  .lesson-layout {
    grid-template-columns: 1fr;
  }

  .lesson-side {
    position: static;
    order: 2;
  }

  .lesson-main {
    order: 1;
  }
}

@media (max-width: 768px) {
  .lesson-title {
    font-size: 20px;
  }

  .content-card :deep(.n-card__content) {
    padding: 16px 16px;
  }

  .lesson-actions :deep(.n-button) {
    flex: 1;
    margin: 0 !important;
  }

  .lesson-actions :deep(.n-button) span {
    font-size: 13px;
  }
}
</style>
