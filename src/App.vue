<template>
  <n-layout class="app-shell">
    <n-layout-header class="app-header" style="height: 56px">
      <div class="header-inner">
        <router-link to="/" class="brand">
          <img src="/favicon.svg" alt="模拟终端 Playground" class="brand-logo" />
          <span class="brand-text">
            <span class="brand-sub">模拟终端 Playground</span>
          </span>
        </router-link>

        <nav class="header-nav">
          <router-link
            v-for="item in navItems"
            :key="item.path"
            :to="item.path"
            class="nav-link"
            :class="{
              active: isActive(item.path),
              'git-active': item.kind === 'git' && isActive(item.path),
              'mysql-active': item.kind === 'mysql' && isActive(item.path),
              'jvm-active': item.kind === 'jvm' && isActive(item.path),
              'javascript-active': item.kind === 'javascript' && isActive(item.path)
            }"
          >
            <n-icon><component :is="item.icon" /></n-icon>
            <span>{{ item.label }}</span>
          </router-link>
        </nav>
      </div>
    </n-layout-header>

    <n-layout-content class="app-main" :class="mainClass">
      <router-view v-slot="{ Component }">
        <transition name="fade" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </n-layout-content>
  </n-layout>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()

type NavKind = 'docker' | 'git' | 'mysql' | 'jvm' | 'javascript'

interface NavItem {
  path: string
  label: string
  icon: string
  kind: NavKind
}

const navItems: NavItem[] = [
  { path: '/', label: 'Docker', icon: 'Monitor', kind: 'docker' },
  { path: '/git', label: 'Git', icon: 'Share', kind: 'git' },
  { path: '/mysql', label: 'MySQL', icon: 'Database', kind: 'mysql' },
  { path: '/jvm', label: 'JVM', icon: 'Cpu', kind: 'jvm' },
  { path: '/javascript', label: 'JavaScript', icon: 'JavaScriptIcon', kind: 'javascript' }
]

const isGitModule = computed(() => route.path.startsWith('/git'))
const isMySqlModule = computed(() => route.path.startsWith('/mysql'))
const isJvmModule = computed(() => route.path.startsWith('/jvm'))
const isJavaScriptModule = computed(() => route.path.startsWith('/javascript'))

const mainClass = computed(() => ({
  'git-main': isGitModule.value,
  'mysql-main': isMySqlModule.value,
  'jvm-main': isJvmModule.value,
  'javascript-main': isJavaScriptModule.value
}))

const isActive = (path: string) => (path === '/' ? route.path === '/' : route.path.startsWith(path))
</script>

<style scoped>
.app-shell {
  height: 100%;
}

.app-header {
  background: #fff;
  border-bottom: 1px solid var(--border-light);
  padding: 0 20px;
  position: sticky;
  top: 0;
  z-index: 100;
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.04);
}

.header-inner {
  max-width: 1200px;
  margin: 0 auto;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
  flex-shrink: 0;
}

.brand-logo {
  width: 34px;
  height: 34px;
}

.brand-text {
  font-size: 18px;
  font-weight: 700;
  color: #1b6bb3;
  letter-spacing: 0.5px;
}

.brand-sub {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-sub);
  margin-left: 2px;
}

.header-nav {
  display: flex;
  gap: 6px;
}

.nav-link {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 16px;
  border-radius: 8px;
  text-decoration: none;
  color: var(--text-sub);
  font-size: 14px;
  transition: all 0.2s;
}

.nav-link:hover {
  background: #f0f6fc;
  color: #1b6bb3;
}

.nav-link.active {
  background: rgba(36, 150, 237, 0.1);
  color: #1b6bb3;
  font-weight: 600;
}

.nav-link.git-active.active {
  background: rgba(240, 80, 50, 0.1);
  color: #f05032;
}

.nav-link.mysql-active.active {
  background: rgba(0, 97, 138, 0.1);
  color: #00618a;
}

.nav-link.jvm-active.active {
  background: rgba(126, 74, 184, 0.11);
  color: #7e4ab8;
}

.nav-link.javascript-active.active {
  background: rgba(224, 190, 42, 0.16);
  color: #8a7400;
}

.app-main {
  padding: 24px 20px 40px;
  background: var(--docker-bg);
  overflow-y: auto;
  min-height: calc(100vh - 56px);
}

.app-main.git-main {
  background: #fff6f3;
}

.app-main.mysql-main {
  background: #f0fbff;
}

.app-main.jvm-main {
  background: #f8f3fc;
}

.app-main.javascript-main {
  background: #fff9df;
}

@media (max-width: 768px) {
  .brand-text {
    font-size: 15px;
  }

  .brand-sub {
    display: none;
  }

  .nav-link span {
    display: none;
  }

  .nav-link {
    padding: 7px 10px;
  }

  .app-header {
    padding: 0 12px;
  }

  .app-main {
    padding: 16px 12px 24px;
  }
}
</style>
