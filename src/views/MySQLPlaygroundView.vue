<template>
  <div class="playground-page">
    <MySQLTerminal :key="terminalKey" @command-executed="onCommand" @reset-environment="resetWorkspace" />
    <MySQLStatePanel :check-tick="checkTick" />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { message, confirmDialog } from '@/utils/feedback'
import MySQLTerminal from '@/components/MySQLTerminal.vue'
import MySQLStatePanel from '@/components/MySQLStatePanel.vue'
import { clearMySqlState, loadMySqlState, resetMySqlEnvironment, saveMySqlState } from '@/terminal/mysqlSimulator'

const WORKSPACE_ID = 'mysql-playground'

if (!loadMySqlState(WORKSPACE_ID)) resetMySqlEnvironment()

const terminalKey = ref(0)
const checkTick = ref(0)

function onCommand() {
  checkTick.value++
  saveMySqlState(WORKSPACE_ID)
}

function resetWorkspace() {
  confirmDialog('重置将清空当前 MySQL 模拟数据和本地缓存，确定继续吗？', '重置 MySQL 环境', {
    confirmButtonText: '确定重置',
    cancelButtonText: '取消',
    type: 'warning'
  })
    .then(() => {
      clearMySqlState(WORKSPACE_ID)
      resetMySqlEnvironment()
      checkTick.value++
      terminalKey.value++
      message.success('MySQL 模拟环境已重置')
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
