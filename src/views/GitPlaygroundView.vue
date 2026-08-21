<template>
  <div class="playground-page">
    <GitTerminal
      :key="terminalKey"
      @command-executed="onCommand"
      @reset-environment="resetWorkspace"
    />
    <GitStatePanel :check-tick="checkTick" />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { message, confirmDialog } from '@/utils/feedback'
import GitTerminal from '@/components/GitTerminal.vue'
import GitStatePanel from '@/components/GitStatePanel.vue'
import {
  clearGitState,
  loadGitState,
  resetGitEnvironment,
  saveGitState
} from '@/terminal/gitSimulator'

const WORKSPACE_ID = 'git-playground'

if (!loadGitState(WORKSPACE_ID)) resetGitEnvironment()

const terminalKey = ref(0)
const checkTick = ref(0)

function onCommand() {
  checkTick.value++
  saveGitState(WORKSPACE_ID)
}

function resetWorkspace() {
  confirmDialog(
    '重置将清空当前 Git 模拟仓库和本地缓存，确定继续吗？',
    '重置 Git 环境',
    { confirmButtonText: '确定重置', cancelButtonText: '取消', type: 'warning' }
  )
    .then(() => {
      clearGitState(WORKSPACE_ID)
      resetGitEnvironment()
      checkTick.value++
      terminalKey.value++
      message.success('Git 模拟环境已重置')
    })
    .catch(() => {})
}
</script>

<style scoped>
.playground-page {
  max-width: 1200px;
  min-width: 0;
  margin: 0 auto;
}
</style>
