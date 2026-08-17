<template>
  <div v-if="lesson" class="lesson-page">
    <!-- 面包屑 -->
    <div class="lesson-crumb">
      <el-breadcrumb separator="/">
        <el-breadcrumb-item :to="{ path: '/' }">课程目录</el-breadcrumb-item>
        <el-breadcrumb-item :to="{ path: `/chapter/${chapter.id}` }">{{ chapter.title }}</el-breadcrumb-item>
        <el-breadcrumb-item>{{ lesson.title }}</el-breadcrumb-item>
      </el-breadcrumb>
    </div>

    <div class="lesson-layout">
      <!-- 左栏：教学内容 -->
      <div class="lesson-main">
        <div class="lesson-head">
          <div class="lesson-head-tags">
            <el-tag size="small" round :style="{ background: chapter.color + '14', color: chapter.color, borderColor: chapter.color + '44' }" effect="plain">
              {{ chapter.index }} · {{ lesson.concept }}
            </el-tag>
            <el-tag v-if="store.isLessonCompleted(lesson.id)" type="success" size="small" effect="light" round>已学完</el-tag>
          </div>
          <h1 class="lesson-title">{{ lesson.title }}</h1>
        </div>

        <!-- 正文内容 -->
        <el-card shadow="never" class="content-card">
          <LessonContent :blocks="lesson.content" />

          <!-- 练习任务说明（有“当前练习”面板时交由面板展示） -->
          <el-alert
            v-if="lesson.terminal && lesson.terminal.enabled && !lesson.practice"
            type="info"
            :closable="false"
            class="practice-alert"
          >
            <template #title>
              <b>✍️ 动手练习</b>：{{ lesson.terminal.task }}
            </template>
          </el-alert>

          <!-- 测验 -->
          <QuizCard
            v-if="lesson.quiz && lesson.quiz.length"
            :questions="lesson.quiz"
            @answered="onQuizAnswered"
          />
        </el-card>

        <!-- 完成按钮 + 前后导航 -->
        <div class="lesson-actions">
          <el-button size="large" round @click="goPrev" :disabled="!prevLesson">
            <el-icon><ArrowLeft /></el-icon>&nbsp;上一节
          </el-button>

          <el-button
            v-if="!store.isLessonCompleted(lesson.id)"
            size="large"
            type="primary"
            round
            @click="markDone"
          >
            <el-icon><CircleCheck /></el-icon>&nbsp;标记本节完成
          </el-button>
          <el-button v-else size="large" type="success" round disabled>
            <el-icon><CircleCheckFilled /></el-icon>&nbsp;本节已完成
          </el-button>

          <el-button size="large" round :disabled="!nextLesson" @click="goNext">
            下一节&nbsp;<el-icon><ArrowRight /></el-icon>
          </el-button>
        </div>
      </div>

      <!-- 右栏：模拟终端 -->
      <div class="lesson-side">
        <!-- 当前练习面板：任务 / 分级提示 / 卡住提示 / 完成检测 -->
        <DockerTaskPanel
          v-if="lesson.practice"
          :key="'task-' + lesson.id"
          :practice="lesson.practice"
          :lesson-id="lesson.id"
          :check-tick="checkTick"
          :error-streak="errorStreak"
          :done="store.isLessonCompleted(lesson.id)"
          @complete="onPracticeComplete"
          @auto-done="onPracticeAutoDone"
          @hint-used="onHintUsed"
        />
        <div class="terminal-widget">
          <div class="widget-head">
            <el-icon><Monitor /></el-icon>
            <span>实操终端</span>
            <el-tag size="small" type="success" effect="light" round class="live-tag">模拟环境</el-tag>
          </div>
          <SimulatedTerminal
            :key="'term-' + lesson.id"
            :suggestions="terminalCommands"
            @command-executed="onCommand"
            @snapshot-synced="onSnapshotSynced"
            @reset-environment="onResetEnvironment"
          />
          <div class="terminal-foot">
            <el-icon><InfoFilled /></el-icon>
            输入 <code>help</code> 查看所有支持的命令 · 支持 ↑↓ 历史记录 · Tab 自动补全
          </div>
        </div>
      </div>

      <!-- 右侧悬浮 Docker 拓扑视图面板 -->
      <DockerStatePanel :env="dockerEnv" :events="dockerEvents" :sync-seq="dockerSyncSeq" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, watch, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { chapters } from '@/data/lessons'
import { useProgressStore } from '@/stores/progress'
import {
  saveDockerState,
  loadDockerState,
  clearDockerState,
  restoreBaseImages,
  resetEnvironment
} from '@/terminal/simulator'
import type { DockerEnv, Lesson } from '@/types'
import LessonContent from '@/components/LessonContent.vue'
import QuizCard from '@/components/QuizCard.vue'
import SimulatedTerminal from '@/components/SimulatedTerminal.vue'
import DockerStatePanel from '@/components/DockerStatePanel.vue'
import DockerTaskPanel from '@/components/DockerTaskPanel.vue'

interface LessonWithChapter extends Lesson {
  chapterId: string
}

interface SnapshotPayload {
  env: DockerEnv
  events: any[]
  syncSeq: number
}

const route = useRoute()
const router = useRouter()
const store = useProgressStore()

// Docker 拓扑视图状态（由 SimulatedTerminal 同步上来的快照）
const dockerEnv = ref<DockerEnv>({ images: [], containers: [], volumes: [], networks: [], history: [] })
const dockerEvents = ref<any[]>([])
const dockerSyncSeq = ref(0)

// 当前练习面板联动状态
const checkTick = ref(0)
const errorStreak = ref(0)

const allLessons = computed<LessonWithChapter[]>(() =>
  chapters.flatMap((c) => c.lessons.map((l) => ({ ...l, chapterId: c.id })))
)
const index = computed(() => allLessons.value.findIndex((l) => l.id === route.params.lessonId))
const lesson = computed<LessonWithChapter | null>(() => allLessons.value[index.value] || null)
const chapter = computed(() => chapters.find((c) => c.id === lesson.value?.chapterId))
const prevLesson = computed(() => (index.value > 0 ? allLessons.value[index.value - 1] : null))
const nextLesson = computed(() =>
  index.value < allLessons.value.length - 1 ? allLessons.value[index.value + 1] : null
)

const terminalCommands = computed(() => lesson.value?.terminal?.commands || [])

watch(
  lesson,
  (l) => {
    if (l) {
      // 优先恢复本课时缓存的 Docker 状态；无缓存则保留引擎当前状态
      loadDockerState(l.id)
      // 恢复课程基准镜像库，避免上一课时 rmi 删除的镜像影响本课时
      restoreBaseImages()
      store.setLastVisited(l.id)
    }
  },
  { immediate: true }
)

function markDone() {
  if (!lesson.value) return
  store.completeLesson(lesson.value.id, lesson.value.chapterId)
  ElMessage.success('本节已标记完成，进度已保存 🎉')
}

function goPrev() {
  if (prevLesson.value) router.push(`/lesson/${prevLesson.value.id}`)
}

function goNext() {
  if (nextLesson.value) router.push(`/lesson/${nextLesson.value.id}`)
}

function onQuizAnswered({ questionIndex, correct }: { questionIndex: number; correct: boolean }) {
  if (!lesson.value || !lesson.value.quiz) return
  store.recordQuiz(lesson.value.id, questionIndex, correct, lesson.value.quiz.length)
}

function onCommand({ ok, errorStreak: streak }: { ok: boolean; errorStreak: number }) {
  // 更新连续错误计数与检测节拍，驱动“当前练习”面板自动检测
  errorStreak.value = streak || 0
  checkTick.value++
}

function onPracticeComplete() {
  if (!lesson.value) return
  store.completeLesson(lesson.value.id, lesson.value.chapterId)
  ElMessage.success('本节已标记完成，进度已保存 🎉')
}

function onPracticeAutoDone() {
  if (!lesson.value || store.isLessonCompleted(lesson.value.id)) return
  store.completeLesson(lesson.value.id, lesson.value.chapterId)
  ElMessage.success('练习已完成，本节自动标记为完成 🎉')
}

function onHintUsed(level: number) {
  if (lesson.value) store.recordHint(lesson.value.id, level)
}

function onSnapshotSynced({ env, events, syncSeq }: SnapshotPayload) {
  dockerEnv.value = env || dockerEnv.value
  dockerEvents.value = events || []
  dockerSyncSeq.value = syncSeq || 0
  // 自动持久化 Docker 模拟状态
  if (lesson.value) saveDockerState(lesson.value.id)
}

function onResetEnvironment() {
  if (!lesson.value) return
  ElMessageBox.confirm(
    '重置将清空本课时的 Docker 模拟环境（容器、卷、网络）并删除本地缓存，确定继续吗？',
    '重置 Docker 环境',
    { confirmButtonText: '确定重置', cancelButtonText: '取消', type: 'warning' }
  )
    .then(() => {
      clearDockerState(lesson.value!.id)
      resetEnvironment()
      dockerEvents.value = []
      // SimulatedTerminal 会重新挂载并触发 snapshot-synced，父组件据此刷新
      ElMessage.success('Docker 环境已重置')
    })
    .catch(() => {})
}
</script>

<style scoped>
.lesson-page {
  max-width: 1600px;
  margin: 0 auto;
}

.lesson-crumb {
  margin-bottom: 16px;
}

.lesson-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 760px;
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

.content-card :deep(.el-card__body) {
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
}

.terminal-widget {
  background: #fff;
  border-radius: 14px;
  border: 1px solid var(--border-light);
  overflow: hidden;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.06);
}

.widget-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: #f8fafc;
  border-bottom: 1px solid var(--border-light);
  font-size: 14px;
  font-weight: 700;
  color: var(--text-main);
}

.widget-head .el-icon {
  color: #2496ed;
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
  background: #f8fafc;
  border-top: 1px solid var(--border-light);
  font-size: 11.5px;
  color: #909399;
}

.terminal-foot .el-icon {
  color: #2496ed;
}

.terminal-foot code {
  background: #eef2f7;
  padding: 1px 6px;
  border-radius: 4px;
  color: #1b6bb3;
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

  .content-card :deep(.el-card__body) {
    padding: 16px 16px;
  }

  .lesson-actions :deep(.el-button) {
    flex: 1;
    margin: 0 !important;
  }

  .lesson-actions :deep(.el-button) span {
    font-size: 13px;
  }
}
</style>
