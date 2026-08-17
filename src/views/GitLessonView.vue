<template>
  <div v-if="lesson" class="git-lesson-page">
    <!-- 面包屑 -->
    <div class="lesson-crumb">
      <el-breadcrumb separator="/">
        <el-breadcrumb-item :to="{ path: '/git' }">Git 学习</el-breadcrumb-item>
        <el-breadcrumb-item :to="{ path: '/git', query: { ch: chapter.id } }">{{ chapter.title }}</el-breadcrumb-item>
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

          <!-- 练习任务说明 -->
          <el-alert
            v-if="lesson.practice"
            type="info"
            :closable="false"
            class="practice-alert"
          >
            <template #title>
              <b>✍️ 动手练习</b>：{{ lesson.practice.title }}
            </template>
          </el-alert>
        </el-card>

        <!-- 前后导航 -->
        <div class="lesson-actions">
          <el-button size="large" round @click="goPrev" :disabled="!prevLesson">
            <el-icon><ArrowLeft /></el-icon>&nbsp;上一节
          </el-button>

          <el-button
            size="large"
            :type="store.isLessonCompleted(lesson.id) ? 'success' : 'primary'"
            round
            @click="markDone"
          >
            <el-icon><CircleCheck /></el-icon>&nbsp;{{ store.isLessonCompleted(lesson.id) ? '本节已完成' : '标记本节完成' }}
          </el-button>

          <el-button size="large" round :disabled="!nextLesson" @click="goNext">
            下一节&nbsp;<el-icon><ArrowRight /></el-icon>
          </el-button>
        </div>
      </div>

      <!-- 右栏：任务面板 + 模拟终端 -->
      <div class="lesson-side">
        <GitTaskPanel
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
            <el-icon><Monitor /></el-icon>
            <span>实操终端</span>
            <el-tag size="small" type="success" effect="light" round class="live-tag">模拟环境</el-tag>
          </div>
          <GitTerminal
            :key="'term-' + lesson.id"
            :suggestions="practiceCommands"
            @command-executed="onCommand"
            @reset-environment="resetPractice"
          />
          <div class="terminal-foot">
            <el-icon><InfoFilled /></el-icon>
            输入 <code>help</code> 查看所有命令 · ↑↓ 历史 · Tab 补全 · 任务完成自动检测
          </div>
        </div>
      </div>

      <!-- 右侧悬浮仓库状态面板 -->
      <GitStatePanel :check-tick="checkTick" />
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { gitChapters } from '@/data/gitLessons'
import { useGitProgressStore } from '@/stores/gitProgress'
import { resetGitEnvironment, loadGitState, saveGitState, clearGitState } from '@/terminal/gitSimulator'
import LessonContent from '@/components/LessonContent.vue'
import GitTerminal from '@/components/GitTerminal.vue'
import GitTaskPanel from '@/components/GitTaskPanel.vue'
import GitStatePanel from '@/components/GitStatePanel.vue'

const route = useRoute()
const router = useRouter()
const store = useGitProgressStore()

const allLessons = computed(() => gitChapters.flatMap((c) => c.lessons.map((l) => ({ ...l, chapterId: c.id }))))
const index = computed(() => allLessons.value.findIndex((l) => l.id === route.params.lessonId))
const lesson = computed(() => allLessons.value[index.value] || null)
const chapter = computed(() => gitChapters.find((c) => c.id === lesson.value?.chapterId))
const prevLesson = computed(() => index.value > 0 ? allLessons.value[index.value - 1] : null)
const nextLesson = computed(() => index.value < allLessons.value.length - 1 ? allLessons.value[index.value + 1] : null)

const practiceCommands = computed(() => lesson.value?.practice?.commands || [])

// 命令执行计数（每次执行 +1，触发任务面板自动检测）与连续错误次数
const checkTick = ref(0)
const errorStreak = ref(0)

watch(lesson, (l) => {
  if (l) {
    // 切换课时：优先恢复本课时缓存的仓库状态；无缓存则重置为初始状态
    const restored = loadGitState(l.id)
    if (!restored) resetGitEnvironment()
    checkTick.value++
    errorStreak.value = 0
    store.setLastVisited(l.id)
  }
}, { immediate: true })

onMounted(() => {
  checkTick.value++
})

function onCommand({ ok, errorStreak: streak }) {
  errorStreak.value = streak || 0
  checkTick.value++
  // 命令执行后自动保存仓库状态到 localStorage
  if (lesson.value) saveGitState(lesson.value.id)
}

function onAutoDone() {
  if (!lesson.value) return
  store.completeLesson(lesson.value.id)
  ElMessage.success('🎉 任务完成！本节已自动记录')
}

function onComplete() {
  if (!lesson.value) return
  store.completeLesson(lesson.value.id)
}

function onHintUsed(level) {
  if (!lesson.value) return
  store.recordHint(lesson.value.id, level)
}

function markDone() {
  if (!lesson.value) return
  const done = store.isLessonCompleted(lesson.value.id)
  store.completeLesson(lesson.value.id)
  ElMessage.success(done ? '本节已完成' : '本节已标记完成，进度已保存 🎉')
}

function goPrev() {
  if (prevLesson.value) router.push(`/git/lesson/${prevLesson.value.id}`)
}

function goNext() {
  if (nextLesson.value) router.push(`/git/lesson/${nextLesson.value.id}`)
}

function resetPractice() {
  if (!lesson.value) return
  ElMessageBox.confirm(
    '重置将清空当前课时的仓库缓存，回到初始练习状态。确定要继续吗？',
    '重置当前练习',
    { confirmButtonText: '重置', cancelButtonText: '取消', type: 'warning' }
  )
    .then(() => {
      clearGitState(lesson.value.id)
      resetGitEnvironment()
      checkTick.value++
      ElMessage.success('当前练习已重置')
    })
    .catch(() => {})
}
</script>

<style scoped>
.git-lesson-page {
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
  display: flex;
  flex-direction: column;
  gap: 16px;
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
  color: #f05032;
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
  color: #f05032;
}

.terminal-foot code {
  background: #eef2f7;
  padding: 1px 6px;
  border-radius: 4px;
  color: #c9472c;
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
