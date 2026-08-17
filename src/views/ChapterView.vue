<template>
  <div v-if="chapter" class="chapter-page">
    <el-page-header @back="$router.push('/')" class="page-header">
      <template #content>
        <div class="header-title">
          <span class="chapter-index">{{ chapter.index }}</span>
          {{ chapter.title }}
        </div>
      </template>
      <template #extra>
        <el-progress
          type="circle"
          :percentage="percent"
          :width="46"
          :stroke-width="6"
          :color="chapter.color"
          :show-text="false"
        />
      </template>
    </el-page-header>

    <div class="chapter-desc">
      <div class="desc-icon" :style="{ background: chapter.color + '1a', color: chapter.color }">
        <el-icon :size="30"><component :is="chapter.icon" /></el-icon>
      </div>
      <div>
        <p class="desc-text">{{ chapter.description }}</p>
        <div class="desc-meta">
          <el-tag size="small" :style="{ color: chapter.color, borderColor: chapter.color + '55', background: chapter.color + '0d' }" effect="plain">
            {{ chapter.lessons.length }} 节课 · 约 {{ chapter.minutes }} 分钟
          </el-tag>
          <el-tag v-if="store.isChapterCompleted(chapter.id)" type="success" size="small" effect="light" round>
            本章已完成 ✓
          </el-tag>
        </div>
      </div>
    </div>

    <!-- 课程列表 -->
    <div class="lesson-list">
      <div
        v-for="(lesson, i) in chapter.lessons"
        :key="lesson.id"
        class="lesson-item"
        :class="{ done: store.isLessonCompleted(lesson.id) }"
        @click="goLesson(lesson)"
      >
        <div class="lesson-status">
          <el-icon v-if="store.isLessonCompleted(lesson.id)" class="done-icon"><CircleCheckFilled /></el-icon>
          <span v-else class="lesson-num">{{ String(i + 1).padStart(2, '0') }}</span>
        </div>
        <div class="lesson-body">
          <div class="lesson-title">
            {{ lesson.title }}
            <el-tag size="small" effect="plain" class="concept-tag">{{ lesson.concept }}</el-tag>
          </div>
          <div class="lesson-tags">
            <span v-if="lesson.terminal && lesson.terminal.enabled">
              <el-icon><Monitor /></el-icon> 含终端练习
            </span>
            <span v-if="lesson.quiz && lesson.quiz.length">
              <el-icon><QuestionFilled /></el-icon> {{ lesson.quiz.length }} 道测验
            </span>
            <span v-if="store.isLessonCompleted(lesson.id)">✓ 已学完</span>
          </div>
        </div>
        <el-icon class="lesson-arrow"><ArrowRight /></el-icon>
      </div>
    </div>

    <!-- 章节导航 -->
    <div class="chapter-nav">
      <el-button
        v-if="prevChapter"
        plain
        round
        @click="$router.push(`/chapter/${prevChapter.id}`)"
      >
        <el-icon><ArrowLeft /></el-icon>&nbsp;上一章：{{ prevChapter.title }}
      </el-button>
      <el-button
        v-if="nextChapter"
        type="primary"
        round
        @click="$router.push(`/chapter/${nextChapter.id}`)"
      >
        下一章：{{ nextChapter.title }}&nbsp;<el-icon><ArrowRight /></el-icon>
      </el-button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { chapters } from '@/data/lessons'
import { useProgressStore } from '@/stores/progress'

const route = useRoute()
const router = useRouter()
const store = useProgressStore()

const chapter = computed(() => chapters.find((c) => c.id === route.params.chapterId))
const percent = computed(() => store.chapterPercent(chapter.value?.id))

const chapterIndex = computed(() => chapters.findIndex((c) => c.id === chapter.value?.id))
const prevChapter = computed(() => chapterIndex.value > 0 ? chapters[chapterIndex.value - 1] : null)
const nextChapter = computed(() => chapterIndex.value < chapters.length - 1 ? chapters[chapterIndex.value + 1] : null)

const goLesson = (lesson) => router.push(`/lesson/${lesson.id}`)
</script>

<style scoped>
.chapter-page {
  max-width: 860px;
  margin: 0 auto;
}

.page-header {
  margin-bottom: 20px;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 19px;
  font-weight: 700;
  color: var(--text-main);
}

.chapter-index {
  font-size: 12px;
  font-weight: 800;
  color: #fff;
  background: v-bind('chapter?.color || "#2496ED"');
  padding: 3px 9px;
  border-radius: 6px;
  letter-spacing: 1px;
}

.chapter-desc {
  background: #fff;
  border-radius: 14px;
  border: 1px solid var(--border-light);
  padding: 20px;
  display: flex;
  gap: 16px;
  align-items: center;
  margin-bottom: 20px;
}

.desc-icon {
  width: 60px;
  height: 60px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.desc-text {
  margin: 0 0 8px;
  font-size: 14.5px;
  color: var(--text-main);
  line-height: 1.7;
}

.desc-meta {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.lesson-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.lesson-item {
  background: #fff;
  border-radius: 12px;
  border: 1px solid var(--border-light);
  padding: 16px 18px;
  display: flex;
  align-items: center;
  gap: 14px;
  cursor: pointer;
  transition: all 0.22s;
}

.lesson-item:hover {
  border-color: #2496ed;
  box-shadow: 0 6px 18px rgba(36, 150, 237, 0.1);
  transform: translateX(3px);
}

.lesson-item.done {
  border-left: 3px solid #67c23a;
}

.lesson-status {
  flex-shrink: 0;
}

.done-icon {
  font-size: 26px;
  color: #67c23a;
}

.lesson-num {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: #eef2f7;
  color: var(--text-sub);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
}

.lesson-body {
  flex: 1;
  min-width: 0;
}

.lesson-title {
  font-size: 15.5px;
  font-weight: 600;
  color: var(--text-main);
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.concept-tag {
  color: #1b6bb3;
  border-color: #2496ed55;
  background: #f0f6fc;
}

.lesson-tags {
  display: flex;
  gap: 14px;
  margin-top: 5px;
  font-size: 12px;
  color: #909399;
  flex-wrap: wrap;
}

.lesson-tags span {
  display: flex;
  align-items: center;
  gap: 4px;
}

.lesson-arrow {
  color: #c0c4cc;
  font-size: 16px;
  flex-shrink: 0;
}

.chapter-nav {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-top: 28px;
  flex-wrap: wrap;
}

@media (max-width: 768px) {
  .chapter-desc {
    flex-direction: column;
    text-align: center;
  }

  .chapter-nav :deep(.el-button) {
    width: 100%;
  }
}
</style>
