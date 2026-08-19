import { defineStore } from 'pinia'
import { mysqlChapters } from '@/data/mysqlLessons'
import type { MySqlChapter, MySqlLesson } from '@/types'

const STORAGE_KEY = 'mysql-tutorial-progress-v1'

export interface MySqlProgressState {
  completedLessons: string[]
  hintsUsed: Record<string, number>
  lastVisited: string | null
  lastVisitedAt: number
  startedAt: number
}

function loadState(): MySqlProgressState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const state = JSON.parse(raw) as Partial<MySqlProgressState>
      return {
        completedLessons: state.completedLessons || [],
        hintsUsed: state.hintsUsed || {},
        lastVisited: state.lastVisited || null,
        lastVisitedAt: state.lastVisitedAt || 0,
        startedAt: state.startedAt || Date.now()
      }
    }
  } catch (e) {
    /* ignore */
  }
  return { completedLessons: [], hintsUsed: {}, lastVisited: null, lastVisitedAt: 0, startedAt: Date.now() }
}

export const useMySqlProgressStore = defineStore('mysqlProgress', {
  state: (): MySqlProgressState => loadState(),

  getters: {
    totalLessons: () => mysqlChapters.reduce((s: number, c: MySqlChapter) => s + c.lessons.length, 0),
    totalChapters: () => mysqlChapters.length,
    completedCount: (state): number => state.completedLessons.length,
    overallPercent: (state): number => {
      const total = mysqlChapters.reduce((s, c) => s + c.lessons.length, 0)
      return total ? Math.round((state.completedLessons.length / total) * 100) : 0
    },
    isLessonCompleted: (state) => (lessonId: string): boolean => state.completedLessons.includes(lessonId),
    chapterProgress(state) {
      return mysqlChapters.map((ch) => {
        const done = ch.lessons.filter((l) => state.completedLessons.includes(l.id)).length
        return {
          id: ch.id,
          done,
          total: ch.lessons.length,
          percent: Math.round((done / ch.lessons.length) * 100)
        }
      })
    },
    chapterPercent: (state) => (chapterId: string): number => {
      const ch = mysqlChapters.find((c) => c.id === chapterId)
      if (!ch) return 0
      const done = ch.lessons.filter((l) => state.completedLessons.includes(l.id)).length
      return Math.round((done / ch.lessons.length) * 100)
    },
    recommendedLesson(state): (MySqlLesson & { chapter: MySqlChapter }) | null {
      for (const ch of mysqlChapters) {
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
        lastVisitedAt: this.lastVisitedAt,
        startedAt: this.startedAt
      }))
    },

    completeLesson(lessonId: string) {
      if (!this.completedLessons.includes(lessonId)) {
        this.completedLessons.push(lessonId)
      }
      this.persist()
    },

    recordHint(lessonId: string, level: number) {
      if (level > (this.hintsUsed[lessonId] || 0)) {
        this.hintsUsed[lessonId] = level
        this.persist()
      }
    },

    hintLevel(lessonId: string): number {
      return this.hintsUsed[lessonId] || 0
    },

    setLastVisited(lessonId: string | null) {
      this.lastVisited = lessonId
      this.lastVisitedAt = lessonId ? Date.now() : 0
      this.persist()
    },

    resetProgress() {
      this.completedLessons = []
      this.hintsUsed = {}
      this.lastVisited = null
      this.lastVisitedAt = 0
      this.startedAt = Date.now()
      this.persist()
    }
  }
})
