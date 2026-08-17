import { defineStore } from 'pinia'
import { gitChapters } from '@/data/gitLessons'

const STORAGE_KEY = 'git-tutorial-progress-v1'

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch (e) {
    /* ignore */
  }
  return { completedLessons: [], hintsUsed: {}, lastVisited: null, startedAt: Date.now() }
}

export const useGitProgressStore = defineStore('gitProgress', {
  state: () => loadState(),

  getters: {
    totalLessons: () => gitChapters.reduce((s, c) => s + c.lessons.length, 0),
    totalChapters: () => gitChapters.length,
    completedCount: (state) => state.completedLessons.length,
    overallPercent: (state) => {
      const total = gitChapters.reduce((s, c) => s + c.lessons.length, 0)
      return total ? Math.round((state.completedLessons.length / total) * 100) : 0
    },
    isLessonCompleted: (state) => (lessonId) => state.completedLessons.includes(lessonId),
    chapterProgress(state) {
      return gitChapters.map((ch) => {
        const done = ch.lessons.filter((l) => state.completedLessons.includes(l.id)).length
        return {
          id: ch.id,
          done,
          total: ch.lessons.length,
          percent: Math.round((done / ch.lessons.length) * 100)
        }
      })
    },
    chapterPercent: (state) => (chapterId) => {
      const ch = gitChapters.find((c) => c.id === chapterId)
      if (!ch) return 0
      const done = ch.lessons.filter((l) => state.completedLessons.includes(l.id)).length
      return Math.round((done / ch.lessons.length) * 100)
    },
    /** 推荐下一课时：第一个未完成的课时 */
    recommendedLesson(state) {
      for (const ch of gitChapters) {
        for (const l of ch.lessons) {
          if (!state.completedLessons.includes(l.id)) return { ...l, chapter: ch }
        }
      }
      return null
    }
  },

  actions: {
    persist() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        completedLessons: this.completedLessons,
        hintsUsed: this.hintsUsed,
        lastVisited: this.lastVisited,
        startedAt: this.startedAt
      }))
    },

    completeLesson(lessonId) {
      if (!this.completedLessons.includes(lessonId)) {
        this.completedLessons.push(lessonId)
      }
      this.persist()
    },

    /** 记录某个课时使用提示的次数（用于“卡住”检测与推荐） */
    recordHint(lessonId, level) {
      if (level > (this.hintsUsed[lessonId] || 0)) {
        this.hintsUsed[lessonId] = level
        this.persist()
      }
    },

    hintLevel(lessonId) {
      return this.hintsUsed[lessonId] || 0
    },

    setLastVisited(lessonId) {
      this.lastVisited = lessonId
      this.persist()
    },

    resetProgress() {
      this.completedLessons = []
      this.hintsUsed = {}
      this.lastVisited = null
      this.startedAt = Date.now()
      this.persist()
    }
  }
})
