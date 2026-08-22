/**
 * Docker 命令模拟引擎
 * 在浏览器中模拟一个 Docker 环境：维护镜像/容器/卷/网络的状态，
 * 解析用户输入的命令并返回符合真实 Docker CLI 输出的模拟结果。
 *
 * 设计原则：所有命令输出均基于当前环境状态 + 数据源（Dockerfile / docker-compose.yml /
 * 镜像文件系统）实时推断，不使用固定写死的结果字符串。
 */

const VERSION = 'Docker version 26.1.3, build b72abbb'
const COMPOSE_VERSION = 'Docker Compose version v2.27.1'

const START_TIME = Date.now()
const pad = (n) => String(n).padStart(2, '0')
const now = (offsetMin = 0) => {
  const d = new Date(Date.now() + offsetMin * 60000)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

// 预置镜像
const IMAGE_DB = {
  'ubuntu:latest': { repo: 'ubuntu', tag: 'latest', id: 'sha256:ba6acccedd29', size: '78MB', created: '2 weeks ago', status: '已下载' },
  'ubuntu:22.04': { repo: 'ubuntu', tag: '22.04', id: 'sha256:ba6acccedd29', size: '78MB', created: '2 weeks ago', status: '已下载' },
  'nginx:latest': { repo: 'nginx', tag: 'latest', id: 'sha256:aca4567fede0', size: '187MB', created: '5 days ago', status: '已下载' },
  'node:20-alpine': { repo: 'node', tag: '20-alpine', id: 'sha256:5c42ef56b62c', size: '128MB', created: '3 days ago', status: '已下载' },
  'redis:7-alpine': { repo: 'redis', tag: '7-alpine', id: 'sha256:7e3b8c29a451', size: '42MB', created: '1 week ago', status: '已下载' },
  'mysql:8.0': { repo: 'mysql', tag: '8.0', id: 'sha256:9f3c2d77be32', size: '577MB', created: '6 days ago', status: '已下载' }
}

const REMOTE_IMAGES = {
  'alpine:3.19': { size: '7.4MB' },
  'python:3.12-slim': { size: '127MB' },
  'postgres:16-alpine': { size: '94MB' },
  'mongo:7': { size: '247MB' },
  'golang:1.22': { size: '275MB' },
  'busybox:latest': { size: '4.3MB' },
  'registry:2': { size: '26MB' },
  'wordpress:6.5': { size: '574MB' },
  'elasticsearch:8.13': { size: '577MB' },
  'traefik:v3.0': { size: '135MB' },
  'nginx:1.27-alpine': { size: '44MB' },
  'node:16-alpine': { size: '111MB' },
  'hello-world': { size: '13.3kB' },
  // 与 IMAGE_DB / docker search 保持一致，使 docker pull <repo> 无 tag 时也能命中
  'mysql:8.0': { size: '577MB' },
  'nginx:latest': { size: '187MB' },
  'redis:7-alpine': { size: '42MB' },
  'node:20-alpine': { size: '128MB' },
  'ubuntu:latest': { size: '78MB' }
}

// Playground 的基准镜像库快照，用于完整重置模拟环境。
const BASE_IMAGES = JSON.parse(JSON.stringify(IMAGE_DB))

function replaceImageDatabase(images = BASE_IMAGES) {
  for (const key of Object.keys(IMAGE_DB)) delete IMAGE_DB[key]
  for (const [key, image] of Object.entries(images)) IMAGE_DB[key] = { ...image }
}

// ---------------------------------------------------------------------------
// 镜像内模拟文件系统：repo -> { 绝对路径: 内容 }
// 供 docker run / exec / logs 等命令按容器实际镜像实时推断输出
// ---------------------------------------------------------------------------

const PROJECT_FILES = {
  '/app/app.js': "const http = require('http');\n\nconst server = http.createServer((req, res) => {\n  res.writeHead(200, { 'Content-Type': 'text/plain' });\n  res.end('Hello from Docker!\\n');\n});\n\nserver.listen(3000, () => {\n  console.log('Server running at http://localhost:3000');\n});\n",
  '/app/package.json': '{\n  "name": "docker-project",\n  "version": "1.0.0",\n  "main": "app.js"\n}\n',
  '/Dockerfile': [
    '# 使用官方 Node.js 镜像作为基础镜像',
    'FROM node:20-alpine',
    '',
    '# 设置工作目录',
    'WORKDIR /app',
    '',
    '# 复制依赖清单并安装依赖',
    'COPY package*.json ./',
    'RUN npm install',
    '',
    '# 复制项目代码',
    'COPY . .',
    '',
    '# 暴露端口',
    'EXPOSE 3000',
    '',
    '# 启动命令',
    'CMD ["node", "app.js"]'
  ].join('\n') + '\n',
  '/app/README.md': '# docker-project\n\nNode.js demo app for Docker learning.\n'
}

const IMAGE_FS = {
  nginx: {
    '/etc/nginx/nginx.conf': 'user  nginx;\nworker_processes  auto;\nerror_log  /var/log/nginx/error.log notice;\npid        /var/run/nginx.pid;\n\nevents {\n    worker_connections  1024;\n}\n\nhttp {\n    include       /etc/nginx/mime.types;\n    default_type  application/octet-stream;\n    sendfile        on;\n    server {\n        listen       80;\n        server_name  localhost;\n        location / {\n            root   /usr/share/nginx/html;\n            index  index.html index.htm;\n        }\n    }\n}\n',
    '/etc/nginx/conf.d/default.conf': 'server {\n    listen       80;\n    server_name  localhost;\n\n    location / {\n        root   /usr/share/nginx/html;\n        index  index.html index.htm;\n    }\n}\n',
    '/usr/share/nginx/html/index.html': '<!DOCTYPE html>\n<html>\n<head>\n<title>Welcome to nginx!</title>\n</head>\n<body>\n<h1>Welcome to nginx!</h1>\n<p>If you see this page, the nginx web server is successfully installed.</p>\n</body>\n</html>\n',
    '/docker-entrypoint.sh': '#!/bin/sh\n# vim:sw=4:ts=4:et\nset -e\n\nexec "$@"\n'
  },
  redis: {
    '/etc/redis/redis.conf': 'bind 127.0.0.1 0.0.0.0\nport 6379\ntimeout 0\ndatabases 16\nappendonly yes\n',
    '/data/appendonly.aof': '',
    '/usr/local/bin/redis-server': ''
  },
  mysql: {
    '/etc/mysql/my.cnf': '[mysqld]\nport=3306\ndatadir=/var/lib/mysql\ncharacter-set-server=utf8mb4\ncollation-server=utf8mb4_unicode_ci\n',
    '/var/lib/mysql/.keep': ''
  },
  node: { ...PROJECT_FILES },
  ubuntu: {
    '/etc/os-release': 'PRETTY_NAME="Ubuntu 22.04.3 LTS"\nNAME="Ubuntu"\nVERSION_ID="22.04"\nVERSION_CODENAME=jammy\n',
    '/root/.bashrc': '# ~/.bashrc: executed by bash(1) for non-login shells.\nexport PS1="\\h:\\w\\$ "\n'
  },
  alpine: {
    '/etc/os-release': 'NAME="Alpine Linux"\nVERSION_ID=3.19.1\nPRETTY_NAME="Alpine Linux v3.19"\n',
    '/root/.profile': '# ~/.profile\n'
  }
}

// 模拟项目目录（宿主机视角）：供 ls / cat / bind mount 使用
const HOST_PROJECT_FILES = {
  Dockerfile: PROJECT_FILES['/Dockerfile'],
  'app.js': PROJECT_FILES['/app/app.js'],
  'package.json': PROJECT_FILES['/app/package.json'],
  'README.md': PROJECT_FILES['/app/README.md']
}

// ---------------------------------------------------------------------------
// 随机工具
// ---------------------------------------------------------------------------

function randomId(len = 12) {
  const chars = '0123456789abcdef'
  let s = ''
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * 16)]
  return s
}

function randomLayers(count = 3) {
  return Array.from({ length: count }, () => ` ${randomId(12)}: Pull complete `)
}

const COUNTER = { container: 1, image: 1 }

function genContainerId() {
  return randomId(12)
}

let CONTAINERS = []
let VOLUMES = []
let NETWORKS = [
  { name: 'bridge', driver: 'bridge', scope: 'local' },
  { name: 'host', driver: 'host', scope: 'local' },
  { name: 'none', driver: 'null', scope: 'local' }
]
let NETWORK_COUNTER = 0
let VOLUME_COUNTER = 0
let PORTS_COUNTER = 4000
let COMMAND_HISTORY = []

function ensureImage(ref) {
  const key = IMAGE_DB[ref] ? ref : (IMAGE_DB[`${ref}:latest`] ? `${ref}:latest` : null)
  return key
}

export function resetEnvironment() {
  replaceImageDatabase()
  CONTAINERS = []
  VOLUMES = []
  NETWORKS = [
    { name: 'bridge', driver: 'bridge', scope: 'local' },
    { name: 'host', driver: 'host', scope: 'local' },
    { name: 'none', driver: 'null', scope: 'local' }
  ]
  NETWORK_COUNTER = 0
  VOLUME_COUNTER = 0
  PORTS_COUNTER = 4000
  COMMAND_HISTORY = []
}

// ---------------------------------------------------------------------------
// 本地持久化：按 Playground 作用域缓存 Docker 模拟状态
// ---------------------------------------------------------------------------

const DOCKER_STORAGE_PREFIX = 'docker-sim-state-v1'
const DOCKER_STATE_SCHEMA_VERSION = 1

function dockerStorageKey(workspaceId) {
  return `${DOCKER_STORAGE_PREFIX}-${workspaceId}`
}

function defaultDockerNetworks() {
  return [
    { name: 'bridge', driver: 'bridge', scope: 'local' },
    { name: 'host', driver: 'host', scope: 'local' },
    { name: 'none', driver: 'null', scope: 'local' }
  ]
}

function createDockerStateSnapshot() {
  return {
    images: IMAGE_DB,
    containers: CONTAINERS,
    volumes: VOLUMES,
    networks: NETWORKS,
    counters: {
      container: COUNTER.container,
      image: COUNTER.image,
      network: NETWORK_COUNTER,
      volume: VOLUME_COUNTER,
      ports: PORTS_COUNTER
    }
  }
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function migrateDockerState(saved) {
  if (!isPlainObject(saved)) return null
  if ('schemaVersion' in saved) {
    if (saved.schemaVersion !== DOCKER_STATE_SCHEMA_VERSION || !isPlainObject(saved.state)) return null
    return normalizeDockerStateSnapshot(saved.state)
  }
  return normalizeDockerStateSnapshot(saved)
}

function normalizeDockerStateSnapshot(source) {
  if (!isPlainObject(source)) return null

  const counters = isPlainObject(source.counters) ? source.counters : {}
  return {
    images: isPlainObject(source.images) ? source.images : BASE_IMAGES,
    containers: Array.isArray(source.containers) ? source.containers : [],
    volumes: Array.isArray(source.volumes) ? source.volumes : [],
    networks: Array.isArray(source.networks) && source.networks.length ? source.networks : defaultDockerNetworks(),
    counters: {
      container: Number(counters.container) || 1,
      image: Number(counters.image) || 1,
      network: Number(counters.network) || 0,
      volume: Number(counters.volume) || 0,
      ports: Number(counters.ports) || 4000
    }
  }
}

function applyDockerStateSnapshot(snapshot) {
  replaceImageDatabase(snapshot.images)
  CONTAINERS = snapshot.containers
  VOLUMES = snapshot.volumes
  NETWORKS = snapshot.networks
  COUNTER.container = snapshot.counters.container
  COUNTER.image = snapshot.counters.image
  NETWORK_COUNTER = snapshot.counters.network
  VOLUME_COUNTER = snapshot.counters.volume
  PORTS_COUNTER = snapshot.counters.ports
}

export function saveDockerState(workspaceId) {
  if (!workspaceId) return false
  try {
    if (typeof localStorage === 'undefined') return false
    const payload = {
      schemaVersion: DOCKER_STATE_SCHEMA_VERSION,
      state: createDockerStateSnapshot()
    }
    localStorage.setItem(dockerStorageKey(workspaceId), JSON.stringify(payload))
    return true
  } catch (e) {
    return false
  }
}

export function loadDockerState(workspaceId) {
  if (!workspaceId) return false
  try {
    if (typeof localStorage === 'undefined') return false
    const raw = localStorage.getItem(dockerStorageKey(workspaceId))
    if (!raw) return false
    const saved = JSON.parse(raw)
    const migrated = migrateDockerState(saved)
    if (!migrated) return false
    applyDockerStateSnapshot(migrated)
    return true
  } catch (e) {
    return false
  }
}

export function clearDockerState(workspaceId) {
  if (!workspaceId) return false
  try {
    if (typeof localStorage === 'undefined') return false
    localStorage.removeItem(dockerStorageKey(workspaceId))
    return true
  } catch (e) {
    return false
  }
}

// ---------------------------------------------------------------------------
// 时间/状态工具（实时推断）
// ---------------------------------------------------------------------------

function timeAgo(ts) {
  if (!ts) return 'just now'
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000))
  if (s < 60) return `${s} second${s === 1 ? '' : 's'} ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`
  const h = Math.floor(m / 60)
  return `${h} hour${h === 1 ? '' : 's'} ago`
}

function upTime(ts) {
  if (!ts) return 'Up Less than a second'
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000))
  if (s < 60) return `Up ${s} second${s === 1 ? '' : 's'}`
  const m = Math.floor(s / 60)
  if (m < 60) return `Up ${m} minute${m === 1 ? '' : 's'}`
  return `Up About ${Math.floor(m / 60)} hour${Math.floor(m / 60) === 1 ? '' : 's'}`
}

function containerStatusText(c) {
  if (c.status === 'running') return upTime(c.createdAt || START_TIME)
  if (c.status === 'paused') return `Up ${timeAgo(c.createdAt || START_TIME)} (Paused)`
  if (c.status === 'exited') return `Exited (0) ${timeAgo(c.exitedAt || c.createdAt || START_TIME)}`
  return 'Created'
}

// 按容器/镜像推断其“典型工作目录”
function workdirOf(c) {
  const repo = (c.image || '').split(':')[0]
  const wd = {
    nginx: '/etc/nginx',
    redis: '/data',
    mysql: '/var/lib/mysql',
    node: '/app',
    ubuntu: '/root',
    alpine: '/root'
  }
  return wd[repo] || '/'
}

// 按镜像类型推断模拟 IP 段
function containerIP(c) {
  const idx = Math.max(0, NETWORKS.findIndex((n) => n.name === (c.network || 'bridge')))
  const n = CONTAINERS.findIndex((x) => x.id === c.id)
  return `172.${18 + idx}.0.${100 + n + 1}`
}

// ---------------------------------------------------------------------------
// 文件系统查询（容器内视角）
// ---------------------------------------------------------------------------

function normalizePath(p) {
  if (!p) return '/'
  if (!p.startsWith('/')) p = '/' + p
  return p.replace(/\/+$/, '') || '/'
}

function mergedFs(c) {
  const repo = (c.image || '').split(':')[0]
  const base = IMAGE_FS[repo] || {}
  // 绑定挂载 /app 或 node 镜像：宿主项目文件可视为容器内 /app 内容
  if (repo === 'node' || (c.volume && c.volume.includes('/app'))) {
    for (const [k, v] of Object.entries(PROJECT_FILES)) base[k] = v
  }
  return { ...base, ...(c.fs || {}) }
}

// 列出容器内某目录；目录不存在返回 null
function listContainerDir(c, path) {
  const fs = mergedFs(c)
  const dir = normalizePath(path)
  const prefix = dir === '/' ? '/' : dir + '/'
  const names = new Set()
  for (const p of Object.keys(fs)) {
    if (p === dir || p === prefix) continue
    if (p.startsWith(prefix)) {
      const rest = p.slice(prefix.length)
      if (rest && !rest.includes('/')) names.add(rest)
    }
  }
  if (!names.size) return null
  return Array.from(names).sort()
}

// 读取容器内文件；不存在返回 null
function catContainerFile(c, path) {
  const fs = mergedFs(c)
  const norm = normalizePath(path)
  if (Object.prototype.hasOwnProperty.call(fs, norm)) return fs[norm]
  return null
}

// 推断 node 脚本输出（解析 console.log 与 listen 端口）
function inferNodeOutput(content) {
  const logs = []
  const re = /console\.log\(([^)]*)\)/g
  let m
  while ((m = re.exec(content))) {
    let v = m[1].trim()
    v = v.replace(/^["'`]|["'`]$/g, '')
    if (v) logs.push(v)
  }
  const listen = content.match(/\.listen\((\d+)/)
  return { logs, port: listen ? Number(listen[1]) : null }
}

// ---------------------------------------------------------------------------
// 容器日志生成（基于镜像 / 命令 / 端口实时推断）
// ---------------------------------------------------------------------------

/** 推断容器运行的基础镜像类型：优先看镜像名，其次回溯 Dockerfile 的 FROM（compose/build 产出的镜像） */
function baseRepoOf(c) {
  const repo = (c.image || '').split(':')[0]
  if (['nginx', 'redis', 'mysql', 'node'].includes(repo)) return repo
  const img = c.imageKey && IMAGE_DB[c.imageKey]
  const from = img && img.from ? String(img.from).toLowerCase() : ''
  if (from.includes('node')) return 'node'
  if (from.includes('nginx')) return 'nginx'
  if (from.includes('redis')) return 'redis'
  if (from.includes('mysql')) return 'mysql'
  return repo
}

function buildContainerLogs(c) {
  const repo = baseRepoOf(c)
  const nowT = now()
  const host = c.ports ? c.ports.split(':')[0] : null
  const containerPort = c.ports ? c.ports.split(':')[1] : (c.exposes && c.exposes[0]) || null
  const ip = containerIP(c)

  if (repo === 'nginx') {
    return [
      '/docker-entrypoint.sh: /docker-entrypoint.d/ is not empty, will attempt to perform configuration',
      '/docker-entrypoint.sh: Looking for shell scripts in /docker-entrypoint.d/',
      '/docker-entrypoint.sh: Launching /docker-entrypoint.d/10-listen-on-ipv6-by-default.sh',
      '10-listen-on-ipv6-by-default.sh: info: Getting the checksum of /etc/nginx/conf.d/default.conf',
      '/docker-entrypoint.sh: Launching /docker-entrypoint.d/20-envsubst-on-templates.sh',
      '/docker-entrypoint.sh: Launching /docker-entrypoint.d/30-tune-worker-processes.sh',
      'ready for start up',
      '',
      `${ip} - - [${nowT}] "GET / HTTP/1.1" 200 615 "-" "Mozilla/5.0"`,
      host ? `${ip} - - [${nowT}] "GET /favicon.ico HTTP/1.1" 404 153 "-" "curl/8.5.0"` : ''
    ].filter(Boolean)
  }
  if (repo === 'redis') {
    return [
      `1:C ${nowT}.123 * oO0OoO0OoO0Oo Redis is starting oO0OoO0OoO0Oo`,
      `1:C ${nowT}.124 * Redis version=7.2.4, bits=64, commit=00000000`,
      `1:C ${nowT}.125 * monotonic clock: POSIX clock_gettime`,
      `1:M ${nowT}.200 * Running mode=standalone, port=6379.`,
      `1:M ${nowT}.201 * Server initialized`,
      `1:M ${nowT}.202 * Ready to accept connections tcp`
    ]
  }
  if (repo === 'mysql') {
    return [
      `${nowT.replace(' ', 'T')}.123Z 0 [System] [MY-010116] [Server] /usr/sbin/mysqld (mysqld 8.0.36) starting as process 1`,
      `${nowT.replace(' ', 'T')}.456Z 0 [System] [MY-010931] [Server] /usr/sbin/mysqld: ready for connections. Version: '8.0.36'  socket: '/var/run/mysqld/mysqld.sock'  port: 3306  (MySQL Community Server - GPL).`
    ]
  }
  if (repo === 'node') {
    const content = catContainerFile(c, '/app/app.js') || ''
    const { logs, port } = inferNodeOutput(content)
    const base = logs.length ? logs : ['Server running at http://0.0.0.0:' + (port || containerPort || 3000)]
    if (containerPort || port) base.push(`Listening on port ${port || containerPort}`)
    return base
  }
  return [`容器 ${c.shortId} 已启动（${c.image}），当前没有更多日志输出。`]
}

// ---------------------------------------------------------------------------
// Dockerfile 解析（docker build / compose build 使用）
// ---------------------------------------------------------------------------

function parseCmdStr(rest) {
  // CMD ["node", "app.js"] 或 CMD node app.js
  const m = rest.match(/\[(.*)\]/)
  if (m) {
    const parts = []
    const re = /"((?:[^"\\]|\\.)*)"/g
    let mm
    while ((mm = re.exec(m[1]))) parts.push(mm[1])
    return parts.length ? parts.join(' ') : rest.replace(/["',]/g, '').trim()
  }
  return rest.replace(/["']/g, '').trim()
}

function parseDockerfile(lines) {
  const cfg = { from: null, workdir: null, copies: [], runs: [], exposes: [], cmd: null, entrypoint: null }
  for (const raw of lines) {
    const line = String(raw).replace(/#.*$/, '').trim()
    if (!line) continue
    const sp = line.indexOf(' ')
    const instr = (sp === -1 ? line : line.slice(0, sp)).toUpperCase()
    const rest = sp === -1 ? '' : line.slice(sp + 1).trim()
    switch (instr) {
      case 'FROM': cfg.from = rest.split(/\s+AS\s+/i)[0].trim(); break
      case 'WORKDIR': cfg.workdir = rest.replace(/["']/g, ''); break
      case 'COPY': cfg.copies.push(rest); break
      case 'ADD': cfg.copies.push(rest); break
      case 'RUN': cfg.runs.push(rest); break
      case 'EXPOSE': cfg.exposes.push(rest.split(/\s+/)[0].replace(/["']/g, '')); break
      case 'CMD': cfg.cmd = parseCmdStr(rest); break
      case 'ENTRYPOINT': cfg.entrypoint = parseCmdStr(rest); break
    }
  }
  return cfg
}

function dockerfileText() {
  return HOST_PROJECT_FILES['Dockerfile'] || ''
}

// 估算构建出的镜像体积（基础镜像 + 每层 RUN/COPY 增加量）
function estimateImageSize(fromRepo, cfg) {
  const base = fromRepo ? (IMAGE_DB[ensureImage(fromRepo)] || IMAGE_DB[fromRepo] || {}).size : '0B'
  const n = cfg.runs.length + cfg.copies.length + 1
  const extraMb = n * 12
  const baseNum = parseInt(base) || 100
  const mb = baseNum + extraMb
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)}GB` : `${mb}MB`
}

// 将 Dockerfile 解析结果构造成镜像并注册到 IMAGE_DB，返回镜像引用
function buildFromDockerfile(name) {
  const cfg = parseDockerfile(dockerfileText().split('\n'))
  const repo = name.includes(':') ? name.split(':')[0] : name
  const tag = name.includes(':') ? name.split(':')[1] : 'latest'
  if (!cfg.from) {
    IMAGE_DB[`${repo}:${tag}`] = { repo, tag, id: 'sha256:' + randomId(12), size: '24MB', created: 'just now', status: '本地构建' }
    return `${repo}:${tag}`
  }
  const cmd = cfg.entrypoint ? `${cfg.entrypoint}${cfg.cmd ? ' ' + cfg.cmd : ''}` : cfg.cmd
  IMAGE_DB[`${repo}:${tag}`] = {
    repo, tag,
    id: 'sha256:' + randomId(12),
    size: estimateImageSize(cfg.from, cfg),
    created: 'just now',
    status: '本地构建',
    cmd: cmd || '',
    exposes: cfg.exposes,
    workdir: cfg.workdir,
    from: cfg.from
  }
  return `${repo}:${tag}`
}

// ---------------------------------------------------------------------------
// 命令解析与执行
// ---------------------------------------------------------------------------

function runHelp() {
  return { lines: [
    '可用命令一览（模拟环境支持）：',
    '',
    '  docker --version / info        查看版本与环境信息',
    '  docker images / search / pull / rmi / tag    镜像操作',
    '  docker run / create / ps / start / stop / restart / rm / logs / exec / inspect / stats    容器操作',
    '  docker cp / top / diff / rename / commit / pause / unpause / kill    常用容器进阶操作',
    '  docker build / history / save / load / prune    镜像构建、导入导出与清理',
    '  docker volume ls / create / rm / prune    数据卷管理',
    '  docker network ls / create / rm / prune   网络管理',
    '  docker system df / prune         系统用量与清理',
    '  docker compose up / down / ps / logs / config    多容器编排',
    '  docker port <容器>              查看端口映射',
    '',
    '  clear        清空终端屏幕',
    '  ls / cat     查看模拟项目文件（如 cat Dockerfile）',
    '  echo / pwd   基础 shell 命令',
    '',
    '提示：支持 ↑/↓ 浏览历史命令，Tab 自动补全，点击下方命令芯片可快速执行。',
    ''
  ] }
}

export function executeCommand(rawInput) {
  const input = String(rawInput || '').trim()
  if (!input) return { type: 'empty', lines: [] }
  COMMAND_HISTORY.push(input)

  const parts = input.split(/\s+/)
  const cmd = parts[0]

  // 非 docker 命令
  const builtins = {
    help: runHelp,
    ls: () => ({ lines: ['.', '..', 'docker-compose.yml', ...Object.keys(HOST_PROJECT_FILES)] }),
    pwd: () => ({ lines: ['/home/learner/docker-project'] }),
    cat: (args) => runCat(args),
    clear: () => ({ type: 'clear' }),
    echo: (args) => ({ lines: [args.join(' ')] }),
    exit: () => ({ lines: ['(当前为浏览器内模拟终端，无需退出，可继续输入命令。)'] })
  }

  if (builtins[cmd]) {
    try {
      const res = builtins[cmd](parts.slice(1))
      // 内置命令可能返回：{ type: 'clear' }、{ lines: [...] } 或原始数组
      if (res && typeof res === 'object') {
        if (res.type) return res
        if (Array.isArray(res.lines)) return { type: 'output', lines: res.lines }
      }
      return { type: 'output', lines: res }
    } catch (e) {
      return { type: 'output', lines: [String(e.message || e)] }
    }
  }

  if (cmd === 'docker') return runDocker(parts.slice(1))
  if (cmd === 'docker-compose') return runCompose(parts.slice(1))

  return {
    type: 'error',
    lines: [`bash: ${cmd}: command not found`, `提示：输入 "help" 或 "docker help" 查看可用命令。`]
  }
}

// ---------------------------------------------------------------------------
// docker 主命令
// ---------------------------------------------------------------------------

function runDocker(args) {
  if (args.length === 0 || !args[0]) return dockerHelp()
  const [sub, ...rest] = args

  switch (sub) {
    case '--version':
    case 'version': return dockerVersion()
    case '-v': return { lines: [VERSION] }
    case 'help': return dockerHelp()
    case 'info': return dockerInfo()
    case 'images':
    case 'img': return dockerImages(rest)
    case 'image': return dockerImageSub(rest)
    case 'search': return dockerSearch(rest)
    case 'pull': return dockerPull(rest)
    case 'rmi': return dockerRmi(rest)
    case 'tag': return dockerTag(rest)
    case 'create': return dockerCreate(rest)
    case 'run': return dockerRun(rest)
    case 'ps': return dockerPs(rest)
    case 'container': return dockerContainerSub(rest)
    case 'start': return dockerStart(rest)
    case 'stop': return dockerStop(rest)
    case 'restart': return dockerRestart(rest)
    case 'kill': return dockerKill(rest)
    case 'pause': return dockerPause(rest)
    case 'unpause': return dockerUnpause(rest)
    case 'rm': return dockerRm(rest)
    case 'logs': return dockerLogs(rest)
    case 'exec': return dockerExec(rest)
    case 'cp': return dockerCp(rest)
    case 'top': return dockerTop(rest)
    case 'diff': return dockerDiff(rest)
    case 'rename': return dockerRename(rest)
    case 'commit': return dockerCommit(rest)
    case 'build': return dockerBuild(rest)
    case 'volume': return dockerVolume(rest)
    case 'network': return dockerNetwork(rest)
    case 'system': return dockerSystem(rest)
    case 'compose': return runCompose(rest)
    case 'inspect': return dockerInspect(rest)
    case 'stats': return dockerStats(rest)
    case 'port': return dockerPort(rest)
    case 'history': return dockerHistory(rest)
    case 'save': return dockerSave(rest)
    case 'load': return dockerLoad(rest)
    case 'prune': return dockerSystemPrune(rest)
    default:
      return { type: 'error', lines: [`docker: '${sub}' is not a docker command.`, `运行 'docker help' 查看可用命令。`] }
  }
}

function dockerVersion() {
  return { lines: [VERSION, `  API 1.43`, `  Go version   go1.22.2`, `  OS/Arch      linux/amd64`, '', 'Server:', ' Engine:', `  Version      ${VERSION.split(' ')[2]}`] }
}

// docker image <sub> 子命令（等价形式的支持）
function dockerImageSub(args) {
  const sub = args[0]
  if (!sub || sub === 'ls' || sub === 'list') return dockerImages(args.slice(1))
  if (sub === 'pull') return dockerPull(args.slice(1))
  if (sub === 'rm') return dockerRmi(args.slice(1))
  if (sub === 'inspect') return dockerInspect(args.slice(1))
  if (sub === 'tag') return dockerTag(args.slice(1))
  if (sub === 'build') return dockerBuild(args.slice(1))
  if (sub === 'history') return dockerHistory(args.slice(1))
  if (sub === 'save') return dockerSave(args.slice(1))
  if (sub === 'load') return dockerLoad(args.slice(1))
  if (sub === 'prune') return dockerImagePrune(args.slice(1))
  if (sub === 'help') return dockerHelp()
  return { type: 'error', lines: [`docker image: unknown command: ${sub || ''}`, `运行 'docker help' 查看可用命令。`] }
}

function dockerContainerSub(args) {
  const sub = args[0]
  if (!sub || sub === 'ls' || sub === 'list') return dockerPs(args.slice(1))
  switch (sub) {
    case 'run': return dockerRun(args.slice(1))
    case 'create': return dockerCreate(args.slice(1))
    case 'start': return dockerStart(args.slice(1))
    case 'stop': return dockerStop(args.slice(1))
    case 'restart': return dockerRestart(args.slice(1))
    case 'kill': return dockerKill(args.slice(1))
    case 'pause': return dockerPause(args.slice(1))
    case 'unpause': return dockerUnpause(args.slice(1))
    case 'rm': return dockerRm(args.slice(1))
    case 'prune': return dockerContainerPrune(args.slice(1))
    case 'logs': return dockerLogs(args.slice(1))
    case 'exec': return dockerExec(args.slice(1))
    case 'inspect': return dockerInspect(args.slice(1))
    case 'stats': return dockerStats(args.slice(1))
    case 'port': return dockerPort(args.slice(1))
    case 'cp': return dockerCp(args.slice(1))
    case 'top': return dockerTop(args.slice(1))
    case 'diff': return dockerDiff(args.slice(1))
    case 'rename': return dockerRename(args.slice(1))
    case 'commit': return dockerCommit(args.slice(1))
    case 'help': return containerHelp()
    default: return { type: 'error', lines: [`docker container: unknown command: ${sub || ''}`, `运行 'docker container help' 查看可用命令。`] }
  }
}

// --- docker help ---
function dockerHelp() {
  return { lines: [
    '',
    'Usage:  docker [OPTIONS] COMMAND',
    '',
    'A self-sufficient runtime for containers',
    '',
    'Common Commands:',
    '  run         创建并启动一个容器',
    '  create      创建一个容器但不启动',
    '  start       启动一个或多个已停止的容器',
    '  stop        停止一个或多个运行中的容器',
    '  restart     重启一个或多个容器',
    '  kill        强制停止一个或多个容器',
    '  pause       暂停一个或多个容器',
    '  unpause     恢复一个或多个暂停的容器',
    '  rm          删除一个或多个容器',
    '  ps          列出容器',
    '  cp          在容器和本地模拟项目之间复制文件',
    '  top         查看容器进程',
    '  diff        查看容器可写层变化',
    '  rename      重命名容器',
    '  commit      从容器创建新镜像',
    '  images      列出镜像',
    '  pull        从镜像仓库拉取镜像',
    '  rmi         删除一个或多个镜像',
    '  tag         标记本地镜像，将其归入某一仓库',
    '  build       从 Dockerfile 构建镜像',
    '  history     查看镜像历史层',
    '  save/load   导出或导入镜像归档',
    '  exec        在运行的容器中执行命令',
    '  logs        获取容器日志',
    '  inspect     获取容器/镜像的详细信息',
    '  volume      管理卷',
    '  network     管理网络',
    '  system      管理 Docker 磁盘用量与清理',
    '  prune       清理未使用资源',
    '  compose     Docker Compose（多容器编排）',
    '  stats       查看容器资源占用',
    '',
    "在浏览器模拟环境中，你也可以直接输入：ls、cat <文件>、clear、echo、pwd",
    ''
  ] }
}

function containerHelp() {
  return { lines: [
    '',
    'Usage:  docker container COMMAND',
    '',
    'Manage containers',
    '',
    'Commands:',
    '  create      Create a new container',
    '  run         Create and run a new container',
    '  ls          List containers',
    '  start       Start one or more stopped containers',
    '  stop        Stop one or more running containers',
    '  restart     Restart one or more containers',
    '  kill        Kill one or more running containers',
    '  pause       Pause all processes within one or more containers',
    '  unpause     Unpause all processes within one or more containers',
    '  rm          Remove one or more containers',
    '  prune       Remove all stopped containers',
    '  logs        Fetch the logs of a container',
    '  exec        Execute a command in a running container',
    '  cp          Copy files/folders between a container and local filesystem',
    '  top         Display the running processes of a container',
    '  diff        Inspect changes to files or directories on a container filesystem',
    '  rename      Rename a container',
    '  commit      Create a new image from a container',
    ''
  ] }
}

function dockerInfo() {
  return { lines: [
    'Client:',
    ` Version:     ${VERSION.split(' ')[2]}`,
    ' Context:     default',
    ' Debug Mode:  false',
    '',
    'Server:',
    ` Containers:  ${CONTAINERS.length}`,
    `  Running:     ${CONTAINERS.filter(c => c.status === 'running').length}`,
    `  Paused:      0`,
    `  Stopped:     ${CONTAINERS.filter(c => c.status === 'exited').length}`,
    ` Images:       ${Object.keys(IMAGE_DB).length}`,
    ' Server Version: 26.1.3',
    ' Storage Driver: overlay2',
    ' Logging Driver: json-file',
    ' Cgroup Driver: cgroupfs',
    '',
    ' Kernel Version: 6.5.0-44-generic',
    ' Operating System: Ubuntu 24.04 LTS',
    ' OSType: linux',
    ' Architecture: x86_64',
    ' CPUs: 8',
    ' Total Memory: 15.6GiB',
    ' Name: docker-desktop',
    ' Docker Root Dir: /var/lib/docker',
    ''
  ] }
}

// --- docker images ---
function dockerImages(args) {
  const all = Object.entries(IMAGE_DB).map(([key, img]) => ({ ...img, full: key }))
  if (args[0] && args[0] !== '--format') {
    const ref = args[0]
    const found = all.filter(i => i.full === ref || i.repo === ref.split(':')[0])
    if (found.length === 0) return { type: 'error', lines: [`No such image: ${ref}`] }
    return renderImages(found)
  }
  return renderImages(all)
}

function renderImages(list) {
  const header = 'REPOSITORY    TAG       IMAGE ID         CREATED       SIZE'
  const rows = list.map(i => {
    const repo = i.repo.padEnd(12, ' ')
    const tag = (i.tag || 'latest').padEnd(8, ' ')
    const id = i.id.slice(7, 19)
    const created = (i.created || '').padEnd(13, ' ')
    return ` ${repo} ${tag} ${id}   ${created} ${i.size}`
  })
  return { lines: [header, ...rows] }
}

// --- docker search ---
function dockerSearch(args) {
  const term = args.find(a => !a.startsWith('-')) || ''
  const db = {
    nginx: { name: 'nginx', desc: 'Official build of Nginx.', stars: 19241, official: true, auto: true },
    ubuntu: { name: 'ubuntu', desc: 'Ubuntu is a Debian-based Linux operating system.', stars: 17389, official: true, auto: true },
    redis: { name: 'redis', desc: 'Redis is an open source key-value store.', stars: 12367, official: true, auto: true },
    mysql: { name: 'mysql', desc: 'MySQL is a widely used, open-source relational database.', stars: 15235, official: true, auto: true },
    node: { name: 'node', desc: 'Node.js is a JavaScript runtime built on Chrome V8.', stars: 11322, official: true, auto: true },
    python: { name: 'python', desc: 'Python is an interpreted, high-level language.', stars: 9867, official: true, auto: true },
    alpine: { name: 'alpine', desc: 'A minimal Docker image based on Alpine Linux.', stars: 9765, official: true, auto: true },
    postgres: { name: 'postgres', desc: 'The PostgreSQL object-relational database system.', stars: 11012, official: true, auto: true },
    mongo: { name: 'mongo', desc: 'MongoDB document databases provide high availability.', stars: 8514, official: true, auto: true },
    hello: { name: 'hello-world', desc: 'Hello World! image.', stars: 3421, official: true, auto: true }
  }
  const results = Object.values(db).filter(r => r.name.includes(term) || (term && r.desc.toLowerCase().includes(term.toLowerCase())))
  if (results.length === 0) {
    return { type: 'error', lines: [`No results found for '${term || ''}'`] }
  }
  const header = 'NAME              DESCRIPTION                                     STARS     OFFICIAL   AUTOMATED'
  const rows = results.map(r => {
    const name = r.name.padEnd(16, ' ')
    const desc = r.desc.slice(0, 45).padEnd(45, ' ')
    const stars = String(r.stars).padStart(6, ' ')
    return ` ${name} ${desc} ${stars}  ${r.official ? '[OK]' : ''}  ${r.auto ? '[OK]' : ''}`
  })
  return { lines: [header, ...rows] }
}

// --- docker pull ---
/** 在本地镜像库中解析引用：精确匹配 → ref:latest → 同仓库名回退 */
function findLocalImage(ref) {
  if (IMAGE_DB[ref]) return IMAGE_DB[ref]
  if (IMAGE_DB[`${ref}:latest`]) return IMAGE_DB[`${ref}:latest`]
  const repo = ref.split(':')[0]
  const match = Object.keys(IMAGE_DB).find((k) => k.split(':')[0] === repo)
  if (match) return IMAGE_DB[match]
  return null
}

/** 在远程镜像仓库中解析引用：精确匹配 → ref:latest → 按仓库名回退；
 *  返回 { ref: 带 tag 的完整引用, size }，保证无 tag 输入也能命中同仓库已有 tag */
function resolveRemoteImage(ref) {
  if (REMOTE_IMAGES[ref]) return { ref, size: REMOTE_IMAGES[ref].size }
  if (REMOTE_IMAGES[`${ref}:latest`]) return { ref: `${ref}:latest`, size: REMOTE_IMAGES[`${ref}:latest`].size }
  const repo = ref.split(':')[0]
  const match = Object.keys(REMOTE_IMAGES).find((k) => k.split(':')[0] === repo)
  if (match) return { ref: match, size: REMOTE_IMAGES[match].size }
  return null
}

function dockerPull(args) {
  const ref = args.find(a => !a.startsWith('-'))
  if (!ref) return { type: 'error', lines: ['"docker pull" requires exactly 1 argument.', "See 'docker pull --help'."] }

  const img = findLocalImage(ref)
  if (img) {
    const tag = (img.tag || 'latest')
    return { lines: [
      `Using default tag: ${tag}`,
      `${tag}: Pulling from library/${img.repo}`,
      ...randomLayers(),
      `Status: Image is up to date for ${img.repo}:${tag}`,
      `docker.io/library/${img.repo}:${tag}`
    ], delay: 800 }
  }

  const remote = resolveRemoteImage(ref)
  if (!remote) {
    return {
      type: 'error',
      delay: 600,
      lines: [
        `Error response from daemon: pull access denied for ${ref}`,
        `repository does not exist or may require 'docker login': denied: requested access to the resource is denied`,
        `提示：镜像仓库中不存在 ${ref}。可尝试 docker search 查找可用镜像。`
      ]
    }
  }

  // 拉取成功后加入本地镜像库（无 tag 输入时使用远程匹配到的 tag，避免生成重复的 :latest）
  const repo = remote.ref.split(':')[0]
  const tag = remote.ref.includes(':') ? remote.ref.split(':')[1] : 'latest'
  IMAGE_DB[`${repo}:${tag}`] = { repo, tag, id: 'sha256:' + randomId(12), size: remote.size, created: 'just now', status: '已下载' }

  return {
    lines: [
      `Using default tag: ${tag}`,
      `${tag}: Pulling from library/${repo}`,
      ...randomLayers(),
      `Digest: sha256:${randomId(64)}`,
      `Status: Downloaded newer image for ${repo}:${tag}`,
      `docker.io/library/${repo}:${tag}`
    ],
    delay: 1500
  }
}

// --- docker rmi ---
function dockerRmi(args) {
  const ref = args.find(a => !a.startsWith('-'))
  if (!ref) return { type: 'error', lines: ['"docker rmi" requires at least 1 argument.', "See 'docker rmi --help'."] }
  const key = ensureImage(ref)
  if (!key) return { type: 'error', lines: [`Error: No such image: ${ref}`] }

  const image = IMAGE_DB[key]
  const used = CONTAINERS.some(c => c.imageKey === key)
  if (used) {
    return { type: 'error', lines: [`Error response from daemon: conflict: unable to remove repository reference "${key}" (must force) - container is using its referenced image`] }
  }
  delete IMAGE_DB[key]
  return { lines: [`Untagged: ${key}`, `Untagged: ${key}@sha256:${randomId(64)}`, `Deleted: sha256:${randomId(64)}`, `Deleted: sha256:${randomId(64)}`] }
}

// --- docker tag ---
function dockerTag(args) {
  const [src, dest] = args.filter(a => !a.startsWith('-'))
  if (!src || !dest) return { type: 'error', lines: ['"docker tag" requires exactly 2 arguments.', "See 'docker tag --help'."] }
  const key = ensureImage(src)
  if (!key) return { type: 'error', lines: [`Error: No such image: ${src}`] }
  const img = IMAGE_DB[key]
  IMAGE_DB[dest] = { ...img, repo: dest.split(':')[0], tag: dest.includes(':') ? dest.split(':')[1] : 'latest' }
  return { lines: [`镜像 ${key} 已标记为 ${dest}（tag 只是引用，不会复制镜像数据）`] }
}

// --- 端口映射解析 ---
function resolvePortMap(flag, exposes) {
  if (!flag) return null
  const parts = flag.split(':')
  if (parts.length >= 2) {
    return { host: parts[0], container: parts[1], text: `${parts[0]}:${parts[1]}` }
  }
  // 只写了容器端口（-p 3000）或 -P：宿主端口随机分配
  const host = String(++PORTS_COUNTER)
  const container = parts[0]
  return { host, container, text: `${host}:${container}` }
}

// --- docker run ---
function dockerRun(args) {
  const flags = { detach: false, name: null, portMap: null, publishAll: false, volume: null, env: [], rm: false, interactive: false, network: null, createOnly: false }
  const positional = []

  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--__create-only') flags.createOnly = true
    else if (a === '-d' || a === '--detach') flags.detach = true
    else if (a === '-it') flags.interactive = true
    else if (a === '-i' || a === '--interactive') flags.interactive = true
    else if (a === '-t') { /* tty */ }
    else if (a === '--rm') flags.rm = true
    else if (a === '-P' || a === '--publish-all') flags.publishAll = true
    else if (a === '--name') flags.name = args[++i]
    else if (a.startsWith('--name=')) flags.name = a.slice(7)
    else if (a === '-p' || a === '--publish') flags.portMap = args[++i]
    else if (a.startsWith('-p=')) flags.portMap = a.slice(3)
    else if (a === '-v' || a === '--volume') flags.volume = args[++i]
    else if (a.startsWith('-v=')) flags.volume = a.slice(3)
    else if (a === '-e' || a === '--env') flags.env.push(args[++i])
    else if (a.startsWith('-e=')) flags.env.push(a.slice(3))
    else if (a === '--net' || a === '--network') flags.network = args[++i]
    else if (a.startsWith('--network=')) flags.network = a.slice(10)
    else if (a.startsWith('-')) { /* 忽略其他 flag */ }
    else positional.push(a)
  }

  const imageRef = positional[0]
  if (!imageRef) return { type: 'error', lines: ['"docker run" requires at least 1 argument.', "See 'docker run --help'."] }
  let key = ensureImage(imageRef)
  // 与真实 Docker 一致：本地没有时自动 pull（仅限仓库中存在的镜像，tag 可任意）
  if (!key && resolveRemoteImage(imageRef)) {
    const repo = imageRef.split(':')[0]
    const tag = imageRef.includes(':') ? imageRef.split(':')[1] : 'latest'
    IMAGE_DB[`${repo}:${tag}`] = {
      repo, tag,
      id: 'sha256:' + randomId(12),
      size: resolveRemoteImage(imageRef).size,
      created: 'just now',
      status: '已下载'
    }
    key = `${repo}:${tag}`
  }
  if (!key) {
    return {
      type: 'error',
      lines: [
        `Unable to find image '${imageRef.split(':')[0]}:${imageRef.includes(':') ? imageRef.split(':')[1] : 'latest'}' locally`,
        `docker: Error response from daemon: manifest for ${imageRef} not found: manifest unknown: manifest unknown.`,
        `提示：镜像不存在，先执行 docker pull ${imageRef} 拉取该镜像。`
      ]
    }
  }

  const image = IMAGE_DB[key]
  const exposes = image.exposes || []
  const imgCmd = image.cmd || ''
  // -P：映射镜像 EXPOSE 声明端口；无声明时退化为 80
  if (flags.publishAll && !flags.portMap) {
    const cp = (exposes && exposes[0]) || '80'
    flags.portMap = `${++PORTS_COUNTER}:${cp}`
  }
  const portMap = resolvePortMap(flags.portMap, exposes)

  const cmd = positional.slice(1).join(' ') || ''
  const id = genContainerId()
  const isHello = key.startsWith('hello-world')
  const repo = image.repo

  // 端口冲突检测：运行中的容器已占用宿主端口时报错（与真实 Docker 一致）
  if (portMap) {
    const conflict = CONTAINERS.some(
      (c) => c.status === 'running' && c.ports && c.ports.split(':')[0] === portMap.host
    )
    if (conflict) {
      return {
        type: 'error',
        lines: [
          `docker: Error response from daemon: driver failed programming external connectivity on endpoint: Bind for 0.0.0.0:${portMap.host} failed: port is already allocated`,
          `提示：宿主机 ${portMap.host} 端口已被其他运行中的容器占用。换一个端口，或先停止/删除占用该端口的容器。`
        ]
      }
    }
  }

  // 判断前台命令是否会“长驻”（server 类）还是“立即退出”
  // 无命令时按镜像默认：node 官方镜像若容器内有 /app/app.js，视为待启动的 Node 服务
  const nodeApp = repo === 'node' && !cmd && !imgCmd && !!PROJECT_FILES['/app/app.js']
  const longRunning = ['node', 'npm', 'nginx', 'redis-server', 'mysqld', 'python', 'java', 'gunicorn', 'uwsgi', 'serve'].some(k => cmd.includes(k) || imgCmd.includes(k)) || nodeApp
  const shortCmd = cmd && !longRunning

  const container = {
    id,
    shortId: id.slice(0, 12),
    image: image.repo + ':' + (image.tag || 'latest'),
    imageKey: key,
    command: cmd || imgCmd || (isHello ? '/hello' : (repo === 'ubuntu' || repo === 'alpine' ? '/bin/bash' : '')),
    created: now(),
    createdAt: Date.now(),
    status: flags.createOnly ? 'created' : (isHello ? 'exited' : (flags.detach || (longRunning && !cmd) || flags.interactive ? 'running' : (shortCmd ? 'exited' : 'running'))),
    exitedAt: null,
    name: flags.name || (repo + '_' + randomId(4) + '_' + COUNTER.container),
    ports: portMap ? portMap.text : null,
    volume: flags.volume || null,
    env: flags.env,
    rm: flags.rm,
    network: flags.network && NETWORKS.some(n => n.name === flags.network) ? flags.network : null,
    exposes,
    fs: {}
  }
  if (container.status === 'exited') container.exitedAt = Date.now()

  if (flags.volume && !flags.volume.includes(':')) {
    // 匿名卷
    const vname = randomId(12)
    VOLUMES.push({ name: vname, driver: 'local', mountpoint: `/var/lib/docker/volumes/${vname}/_data` })
  } else if (flags.volume && flags.volume.includes(':')) {
    const vname = flags.volume.split(':')[0]
    if (!vname.startsWith('/') && !VOLUMES.some(v => v.name === vname)) {
      VOLUMES.push({ name: vname, driver: 'local', mountpoint: `/var/lib/docker/volumes/${vname}/_data` })
    }
  }

  container.logs = buildContainerLogs(container)
  COUNTER.container++
  CONTAINERS.unshift(container)

  if (flags.createOnly) {
    return { lines: [container.shortId], delay: 300 }
  }

  if (isHello) {
    if (container.rm) {
      const idx = CONTAINERS.indexOf(container)
      if (idx > -1) CONTAINERS.splice(idx, 1)
    }
    return {
      lines: [
        `Unable to find image 'hello-world:latest' locally`,
        'latest: Pulling from library/hello-world',
        ...randomLayers(),
        'Status: Downloaded newer image for hello-world:latest',
        '',
        'Hello from Docker!',
        'This message shows that your installation appears to be working correctly.',
        '',
        'To generate this message, Docker took the following steps:',
        ' 1. The Docker client contacted the Docker daemon.',
        ' 2. The Docker daemon pulled the "hello-world" image from the Docker Hub.',
        ' 3. The Docker daemon created a new container from that image which runs the',
        '    executable that produces the output you are currently reading.',
        ' 4. The Docker daemon streamed that output to the Docker client.',
        '',
        container.rm ? '（使用了 --rm，容器运行结束后已自动删除）' : `（容器 ${container.shortId} 已创建并退出，可运行 docker ps -a 查看）`
      ],
      delay: 900
    }
  }

  if (flags.detach) {
    return {
      lines: [portMap ? `${portMap.container}/tcp -> 0.0.0.0:${portMap.host}` : '', container.shortId],
      delay: 500
    }
  }

  if (cmd && shortCmd) {
    // 前台执行短命令：按容器文件系统智能推断结果
    return { lines: runContainerCommand(container, cmd), delay: 400 }
  }

  if (flags.interactive) {
    return {
      lines: [
        `root@${container.shortId}:/#`,
        '',
        '提示：这是交互式终端效果。真实环境输入 exit 可退出容器。',
        `容器 ${container.shortId} 已创建（名称为 ${container.name}），可运行 docker ps 查看。`
      ],
      delay: 500
    }
  }

  if (longRunning) {
    // 长驻服务容器：输出启动日志
    return { lines: container.logs.slice(0, 3), delay: 500 }
  }

  return { lines: [container.shortId], delay: 500 }
}

function dockerCreate(args) {
  return dockerRun(['--__create-only', ...args])
}

// docker run 前台命令的智能推断（基于容器文件系统）
function runContainerCommand(c, cmdStr) {
  const cArr = cmdStr.split(/\s+/)
  const head = cArr[0]
  const argsRest = cArr.slice(1)
  const repo = (c.image || '').split(':')[0]

  if (head === 'echo') return [argsRest.join(' ').replace(/"/g, '')]
  if (head === 'cat') {
    const content = catContainerFile(c, argsRest[0] || '')
    if (content !== null) return content.replace(/\n$/, '').split('\n')
    return [`cat: ${argsRest[0]}: No such file or directory`]
  }
  if (head === 'ls') {
    const dir = listContainerDir(c, argsRest[argsRest.length - 1] || workdirOf(c))
    if (dir) return [dir.join('  ')]
    return [`ls: cannot access '${argsRest[argsRest.length - 1]}': No such file or directory`]
  }
  if (head === 'env') {
    return [
      'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
      `HOSTNAME=${c.shortId}`,
      'HOME=/root',
      ...(c.env || [])
    ]
  }
  if (head === 'node') {
    const file = argsRest.find(a => a.includes('.'))
    const content = file ? catContainerFile(c, file) || catContainerFile(c, '/app/' + file) : null
    if (content !== null) {
      const { logs } = inferNodeOutput(content)
      return logs.length ? logs : [`${file} 执行完成（退出码 0）`]
    }
    return ['Welcome to Node.js v20.11.0.', 'Type ".help" for more information.']
  }
  if (head === 'uname') return ['Linux']
  if (head === 'whoami') return ['root']
  if (head === 'pwd') return [workdirOf(c)]
  return [
    `运行结果（模拟）：${cmdStr}`,
    repo === 'ubuntu' || repo === 'alpine'
      ? `（容器内 ${repo} 环境已执行命令 ${cmdStr}，退出码 0）`
      : '（真实环境中输出取决于容器内程序）'
  ]
}

// --- docker ps ---
function psPortsText(c) {
  // 将容器端口映射格式化为真实 docker ps 样式：0.0.0.0:8080->80/tcp
  if (!c.ports) return ''
  const parts = String(c.ports).split(':')
  if (parts.length === 2) return `0.0.0.0:${parts[0]}->${parts[1]}/tcp `
  return `${c.ports} `
}

function dockerPs(args) {
  const all = args.includes('-a') || args.includes('--all')
  const list = all ? CONTAINERS : CONTAINERS.filter(c => c.status === 'running')
  if (list.length === 0) {
    return { lines: ['CONTAINER ID   IMAGE     COMMAND   CREATED   STATUS   PORTS     NAMES', ''] }
  }
  const header = 'CONTAINER ID   IMAGE           COMMAND                  CREATED              STATUS              PORTS               NAMES'
  const rows = list.map(c => {
    const id = c.shortId
    const img = (c.image || '').padEnd(13, ' ')
    const cmdStr = (c.command || '').slice(0, 20).padEnd(21, ' ')
    const created = timeAgo(c.createdAt)
    const status = containerStatusText(c).padEnd(20, ' ')
    const ports = psPortsText(c)
    const name = c.name
    return ` ${id}   ${img} ${cmdStr} ${created}  ${status} ${ports}${name}`
  })
  return { lines: [header, ...rows] }
}

// --- docker start ---
function dockerStart(args) {
  const target = args.find(a => !a.startsWith('-'))
  if (!target) return { type: 'error', lines: ['"docker start" requires at least 1 argument.'] }
  const c = CONTAINERS.find(x => x.name === target || x.shortId.startsWith(target))
  if (!c) return { type: 'error', lines: [`Error response from daemon: No such container: ${target}`] }
  if (c.status === 'running') return { lines: [`容器 ${target} 已在运行中。`] }
  c.status = 'running'
  c.createdAt = Date.now()
  return { lines: [c.shortId], delay: 300 }
}

// --- docker stop ---
function dockerStop(args) {
  const target = args.find(a => !a.startsWith('-'))
  if (!target) return { type: 'error', lines: ['"docker stop" requires at least 1 argument.'] }
  const c = CONTAINERS.find(x => x.name === target || x.shortId.startsWith(target))
  if (!c) return { type: 'error', lines: [`Error response from daemon: No such container: ${target}`] }
  if (c.status === 'exited') return { lines: [`容器 ${target} 已经处于停止状态。`] }
  c.status = 'exited'
  c.exitedAt = Date.now()
  return { lines: [c.shortId], delay: 500 }
}

function dockerRestart(args) {
  const target = args.find(a => !a.startsWith('-'))
  if (!target) return { type: 'error', lines: ['"docker restart" requires at least 1 argument.'] }
  const c = CONTAINERS.find(x => x.name === target || x.shortId.startsWith(target))
  if (!c) return { type: 'error', lines: [`Error response from daemon: No such container: ${target}`] }
  c.status = 'running'
  c.createdAt = Date.now()
  c.exitedAt = null
  return { lines: [c.shortId], delay: 600 }
}

// --- docker rm ---
function dockerRm(args) {
  const targets = args.filter(a => !a.startsWith('-'))
  const force = args.includes('-f') || args.includes('--force')
  if (targets.length === 0) return { type: 'error', lines: ['"docker rm" requires at least 1 argument.'] }
  const out = []
  for (const t of targets) {
    const idx = CONTAINERS.findIndex(x => x.name === t || x.shortId.startsWith(t))
    if (idx === -1) {
      out.push(`Error: No such container: ${t}`)
      continue
    }
    if (CONTAINERS[idx].status === 'running' && !force) {
      out.push(`Error response from daemon: you cannot remove a running container ${t}. Stop the container before attempting removal or force remove`)
      continue
    }
    CONTAINERS.splice(idx, 1)
    out.push(t)
  }
  return { lines: out, delay: 300 }
}

function dockerKill(args) {
  const targets = args.filter(a => !a.startsWith('-'))
  if (targets.length === 0) return { type: 'error', lines: ['"docker kill" requires at least 1 argument.'] }
  const out = []
  for (const t of targets) {
    const c = CONTAINERS.find(x => x.name === t || x.shortId.startsWith(t))
    if (!c) out.push(`Error response from daemon: No such container: ${t}`)
    else if (c.status === 'exited') out.push(`Error response from daemon: Container ${t} is not running`)
    else {
      c.status = 'exited'
      c.exitedAt = Date.now()
      c.exitCode = 137
      out.push(c.shortId)
    }
  }
  return { lines: out, delay: 250 }
}

function dockerPause(args) {
  const targets = args.filter(a => !a.startsWith('-'))
  if (targets.length === 0) return { type: 'error', lines: ['"docker pause" requires at least 1 argument.'] }
  const out = []
  for (const t of targets) {
    const c = CONTAINERS.find(x => x.name === t || x.shortId.startsWith(t))
    if (!c) out.push(`Error response from daemon: No such container: ${t}`)
    else if (c.status !== 'running') out.push(`Error response from daemon: Container ${t} is not running`)
    else {
      c.status = 'paused'
      out.push(c.shortId)
    }
  }
  return { lines: out, delay: 250 }
}

function dockerUnpause(args) {
  const targets = args.filter(a => !a.startsWith('-'))
  if (targets.length === 0) return { type: 'error', lines: ['"docker unpause" requires at least 1 argument.'] }
  const out = []
  for (const t of targets) {
    const c = CONTAINERS.find(x => x.name === t || x.shortId.startsWith(t))
    if (!c) out.push(`Error response from daemon: No such container: ${t}`)
    else if (c.status !== 'paused') out.push(`Error response from daemon: Container ${t} is not paused`)
    else {
      c.status = 'running'
      out.push(c.shortId)
    }
  }
  return { lines: out, delay: 250 }
}

function parseContainerPath(spec) {
  const m = String(spec || '').match(/^([^:]+):(.+)$/)
  if (!m) return null
  const c = CONTAINERS.find(x => x.name === m[1] || x.shortId.startsWith(m[1]))
  if (!c) return { error: `Error: No such container:path: ${spec}` }
  return { container: c, path: normalizePath(m[2]) }
}

function hostFileName(path) {
  const clean = String(path || '').replace(/^\.?[\\/]/, '')
  const parts = clean.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] || 'copied-file'
}

function readHostFile(path) {
  const name = hostFileName(path)
  return HOST_PROJECT_FILES[name] ?? HOST_PROJECT_FILES[path]
}

function dockerCp(args) {
  const operands = args.filter(a => !a.startsWith('-'))
  const [src, dest] = operands
  if (!src || !dest) return { type: 'error', lines: ['"docker cp" requires SRC_PATH and DEST_PATH.'] }

  const srcC = parseContainerPath(src)
  const destC = parseContainerPath(dest)
  if (srcC && srcC.error) return { type: 'error', lines: [srcC.error] }
  if (destC && destC.error) return { type: 'error', lines: [destC.error] }

  if (srcC && !destC) {
    const content = catContainerFile(srcC.container, srcC.path)
    if (content === null) return { type: 'error', lines: [`Error: No such file or directory in container: ${srcC.path}`] }
    const name = hostFileName(dest === '.' ? srcC.path : dest)
    HOST_PROJECT_FILES[name] = content
    return { lines: [`已从容器 ${srcC.container.name}:${srcC.path} 复制到模拟项目文件 ${name}`], delay: 250 }
  }

  if (!srcC && destC) {
    const content = readHostFile(src)
    if (content === undefined) return { type: 'error', lines: [`Error: lstat ${src}: no such file or directory`] }
    if (!destC.container.fs) destC.container.fs = {}
    const destPath = destC.path.endsWith('/') ? normalizePath(destC.path + hostFileName(src)) : destC.path
    destC.container.fs[destPath] = content
    return { lines: [`已复制模拟项目文件 ${hostFileName(src)} 到容器 ${destC.container.name}:${destPath}`], delay: 250 }
  }

  if (srcC && destC) {
    const content = catContainerFile(srcC.container, srcC.path)
    if (content === null) return { type: 'error', lines: [`Error: No such file or directory in container: ${srcC.path}`] }
    if (!destC.container.fs) destC.container.fs = {}
    destC.container.fs[destC.path] = content
    return { lines: [`已在容器间复制 ${srcC.container.name}:${srcC.path} -> ${destC.container.name}:${destC.path}`], delay: 250 }
  }

  return { type: 'error', lines: ['Error: docker cp 需要至少一侧是 CONTAINER:PATH。'] }
}

function dockerTop(args) {
  const target = args.find(a => !a.startsWith('-'))
  if (!target) return { type: 'error', lines: ['"docker top" requires at least 1 argument.'] }
  const c = CONTAINERS.find(x => x.name === target || x.shortId.startsWith(target))
  if (!c) return { type: 'error', lines: [`Error: No such container: ${target}`] }
  if (c.status !== 'running' && c.status !== 'paused') return { type: 'error', lines: [`Error response from daemon: Container ${target} is not running`] }
  const proc = c.command || (baseRepoOf(c) === 'nginx' ? 'nginx -g daemon off;' : 'sh')
  return { lines: [
    'UID                 PID                 PPID                C                   STIME               TTY                 TIME                CMD',
    `root                1                   0                   0                   ${now().slice(11, 16)}               ?                   00:00:00            ${proc}`,
    'root                17                  1                   0                   ' + now().slice(11, 16) + '               ?                   00:00:00            ps -ef'
  ], delay: 200 }
}

function dockerDiff(args) {
  const target = args.find(a => !a.startsWith('-'))
  if (!target) return { type: 'error', lines: ['"docker diff" requires exactly 1 argument.'] }
  const c = CONTAINERS.find(x => x.name === target || x.shortId.startsWith(target))
  if (!c) return { type: 'error', lines: [`Error: No such container: ${target}`] }
  const changed = Object.keys(c.fs || {}).sort()
  if (!changed.length) return { lines: ['（容器可写层没有变化）'] }
  return { lines: changed.map(p => `C ${p}`), delay: 200 }
}

function dockerRename(args) {
  const [oldName, newName] = args.filter(a => !a.startsWith('-'))
  if (!oldName || !newName) return { type: 'error', lines: ['用法: docker rename <old_name> <new_name>'] }
  const c = CONTAINERS.find(x => x.name === oldName || x.shortId.startsWith(oldName))
  if (!c) return { type: 'error', lines: [`Error: No such container: ${oldName}`] }
  if (CONTAINERS.some(x => x.name === newName)) return { type: 'error', lines: [`Error response from daemon: Conflict. The container name "${newName}" is already in use.`] }
  c.name = newName
  return { lines: [newName], delay: 200 }
}

function dockerCommit(args) {
  const operands = args.filter(a => !a.startsWith('-') && !args[args.indexOf(a) - 1]?.startsWith('-'))
  const target = operands[0]
  const repoTag = operands[1] || `committed-${randomId(4)}:latest`
  if (!target) return { type: 'error', lines: ['用法: docker commit <container> [repository[:tag]]'] }
  const c = CONTAINERS.find(x => x.name === target || x.shortId.startsWith(target))
  if (!c) return { type: 'error', lines: [`Error: No such container: ${target}`] }
  const repo = repoTag.includes(':') ? repoTag.split(':')[0] : repoTag
  const tag = repoTag.includes(':') ? repoTag.split(':')[1] : 'latest'
  const full = `${repo}:${tag}`
  IMAGE_DB[full] = {
    repo,
    tag,
    id: 'sha256:' + randomId(12),
    size: '128MB',
    created: 'just now',
    status: '本地提交',
    cmd: c.command || '',
    from: c.image,
    fs: { ...(c.fs || {}) }
  }
  return { lines: [`sha256:${IMAGE_DB[full].id.replace(/^sha256:/, '')}`, `已从容器 ${c.name} 创建镜像 ${full}`], delay: 400 }
}

// --- docker logs ---
function dockerLogs(args) {
  const target = args.find(a => !a.startsWith('-'))
  if (!target) return { type: 'error', lines: ['"docker logs" requires exactly 1 argument.'] }
  const c = CONTAINERS.find(x => x.name === target || x.shortId.startsWith(target))
  if (!c) return { type: 'error', lines: [`Error: No such container: ${target}`] }

  let logs = Array.isArray(c.logs) && c.logs.length ? [...c.logs] : buildContainerLogs(c)
  if (args.includes('-f') || args.includes('--follow')) {
    logs.push('（--follow 模式：日志持续输出中，模拟环境仅展示当前内容）')
  }
  const tailIdx = args.indexOf('--tail')
  if (tailIdx !== -1) {
    const n = Math.max(1, Number(args[tailIdx + 1]) || 10)
    logs = logs.slice(-n)
  }
  return { lines: logs, delay: 400 }
}

// --- docker exec ---
function dockerExec(args) {
  const target = args.find(a => !a.startsWith('-') && !['-it', '-i', '-t'].includes(a))
  const restIdx = args.indexOf(target)
  const cmdArgs = args.slice(restIdx + 1)
  if (!target) return { type: 'error', lines: ['"docker exec" requires at least 2 arguments.'] }
  const c = CONTAINERS.find(x => x.name === target || x.shortId.startsWith(target))
  if (!c) return { type: 'error', lines: [`Error: No such container: ${target}`] }
  if (c.status !== 'running') return { type: 'error', lines: [`Error response from daemon: Container ${target} is not running`] }
  const cmd = cmdArgs.join(' ')
  if (!cmd) return { type: 'error', lines: ['"docker exec" requires at least 2 arguments.'] }

  const head = cmdArgs[0]
  const rest = cmdArgs.slice(1)
  const repo = (c.image || '').split(':')[0]

  if (head === 'ls') {
    const path = rest[rest.length - 1] || workdirOf(c)
    const dir = listContainerDir(c, path)
    if (dir) return { lines: [dir.join('  ')], delay: 200 }
    return { type: 'error', lines: [`ls: cannot access '${path}': No such file or directory`], delay: 200 }
  }
  if (head === 'cat') {
    const content = catContainerFile(c, rest[0] || '')
    if (content !== null) return { lines: content.replace(/\n$/, '').split('\n'), delay: 200 }
    return { type: 'error', lines: [`cat: ${rest[0]}: No such file or directory`], delay: 200 }
  }
  if (head === 'echo') {
    // 支持重定向写容器内文件（容器可写层）
    const redirIdx = cmdArgs.indexOf('>')
    if (redirIdx !== -1) {
      const file = cmdArgs[redirIdx + 1]
      const text = cmdArgs.slice(1, redirIdx).join(' ').replace(/"/g, '')
      if (!c.fs) c.fs = {}
      c.fs[normalizePath(file)] = text + '\n'
      return { lines: [], delay: 200 }
    }
    const text = rest.join(' ').replace(/"/g, '')
    return { lines: [text], delay: 200 }
  }
  if (head === 'env') {
    return { lines: [
      'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
      'HOSTNAME=' + c.shortId,
      'HOME=/root',
      ...(c.env || [])
    ], delay: 200 }
  }
  if (head === 'node') {
    const file = rest.find(a => a.includes('.'))
    const content = file ? catContainerFile(c, file) || catContainerFile(c, '/app/' + file) : null
    if (content !== null) {
      const { logs } = inferNodeOutput(content)
      return { lines: logs.length ? logs : [`${file} 执行完成（退出码 0）`], delay: 300 }
    }
    return { lines: ['Welcome to Node.js v20.11.0.', 'Type ".help" for more information.'], delay: 300 }
  }
  if (head === 'ping') {
    const host = rest[0]
    // 智能推断：同一网络（或 bridge）内是否存在该名字的容器
    const netName = c.network || 'bridge'
    const peer = CONTAINERS.find(x => x.id !== c.id && (x.network || 'bridge') === netName && x.name === host)
    if (!peer) {
      return { type: 'error', lines: [`ping: ${host}: Name or service not known`], delay: 300 }
    }
    const ip = containerIP(peer)
    const lines = [
      `PING ${host} (${ip}): 56 data bytes`,
      ...Array.from({ length: 3 }, () => `64 bytes from ${ip}: seq=${Math.floor(Math.random() * 100)} ttl=64 time=${(Math.random() * 0.4 + 0.02).toFixed(3)} ms`),
      '',
      `--- ${host} ping statistics ---`,
      '3 packets transmitted, 3 packets received, 0% packet loss',
      `round-trip min/avg/max = ${(Math.random() * 0.1 + 0.02).toFixed(3)}/${(Math.random() * 0.2 + 0.05).toFixed(3)}/${(Math.random() * 0.3 + 0.1).toFixed(3)} ms`
    ]
    return { lines, delay: 600 }
  }
  if (head === 'ps' && rest[0] === 'aux') {
    return { lines: ['PID   USER     TIME  COMMAND', '    1 root      0:00 ' + (c.command || 'nginx'), '   12 root      0:00 ps aux'], delay: 200 }
  }
  if (head === 'sh' || head === 'bash') {
    return { lines: ['（已进入容器交互终端，真实环境输入 exit 退出）'], delay: 300 }
  }
  if (head === 'uname') return { lines: ['Linux'], delay: 100 }
  if (head === 'whoami') return { lines: ['root'], delay: 100 }
  if (head === 'pwd') return { lines: [workdirOf(c)], delay: 100 }
  if (head === 'npm') {
    return { lines: ['npm notice Logging in to registry.npmjs.org', 'up to date, audited 42 packages in 1.2s', 'found 0 vulnerabilities'], delay: 300 }
  }
  return {
    lines: [
      `exec 执行结果（模拟）：${cmd}`,
      `（在 ${c.image} 容器内执行 ${head}，退出码 0）`
    ],
    delay: 300
  }
}

// --- docker build ---
function dockerBuild(args) {
  const tagIdx = args.findIndex(a => a === '-t' || a === '--tag')
  let tag = null
  if (tagIdx !== -1) tag = args[tagIdx + 1]
  else {
    const eq = args.find(a => a.startsWith('--tag='))
    if (eq) tag = eq.slice(6)
  }
  const context = args[args.length - 1] && !args[args.length - 1].startsWith('-') ? args[args.length - 1] : '.'
  const name = tag || (context === '.' ? 'docker-project:latest' : context.replace(/\//g, '-') + ':latest')

  // 从 Dockerfile 内容解析构建步骤（数据驱动）
  const cfg = parseDockerfile(dockerfileText().split('\n'))
  const from = cfg.from || 'node:20-alpine'
  const baseId = randomId(12)

  const steps = []
  const add = (txt, dur = 0.1) => steps.push({ txt, dur })
  // 编号步骤 = FROM + 可选 WORKDIR + COPY/ADD×N + RUN×N + EXPOSE×N + CMD（与真实 BuildKit 一致）
  const numberedSteps = 1 + (cfg.workdir ? 1 : 0) + cfg.copies.length + cfg.runs.length + cfg.exposes.length + (cfg.cmd ? 1 : 0)
  add(`[internal] load build definition from Dockerfile`, 0)
  add(`=> => transferring dockerfile: ${dockerfileText().length}B`, 0)
  add(`[internal] load metadata for docker.io/library/${from}`, 0.4)
  add(`[1/${numberedSteps}] FROM docker.io/library/${from}@sha256:${randomId(64)}`, 0.5)
  let idx = 2
  if (cfg.workdir) {
    add(`[${idx}/${numberedSteps}] WORKDIR ${cfg.workdir}`, 0.1)
    idx++
  }
  for (const c of cfg.copies) {
    add(`[${idx}/${numberedSteps}] COPY ${c}`, 0.2)
    idx++
  }
  for (const r of cfg.runs) {
    add(`[${idx}/${numberedSteps}] RUN ${r}`, 2.8)
    idx++
  }
  for (const e of cfg.exposes) {
    add(`[${idx}/${numberedSteps}] EXPOSE ${e}`, 0.1)
    idx++
  }
  if (cfg.cmd) {
    add(`[${idx}/${numberedSteps}] CMD ${JSON.stringify(cfg.cmd.split(/\s+/))}`, 0.1)
    idx++
  }
  add(`exporting to image`, 0.2)
  add(`=> => exporting layers`, 0.1)
  add(`=> => writing image sha256:${baseId}`, 0.1)
  add(`=> => naming to docker.io/library/${name.replace(/^[a-zA-Z0-9]+:\/\//, '')}`, 0)

  const total = steps.length
  const dur = 3.2 + cfg.runs.length * 2.2
  const lines = [
    `[+] Building ${dur.toFixed(1)}s (${total}/${total}) FINISHED`
  ]
  for (let i = 0; i < steps.length; i++) {
    lines.push(` => ${steps[i].txt.padEnd(72, ' ')}${steps[i].dur.toFixed(1)}s`)
  }
  lines.push('')
  lines.push(`View build details: docker-desktop://dashboard/build/desktop-linux/desktop-linux/${randomId(8)}`)
  lines.push('')
  const taggedName = name.includes(':') ? name : `${name}:latest`
  lines.push(`Successfully built ${baseId}`)
  lines.push(`Successfully tagged ${taggedName}`)
  lines.push(`镜像构建成功：${name}`)
  lines.push(`提示：运行 docker images 可查看新构建的镜像。`)

  buildFromDockerfile(name)
  return { lines, delay: 2000 }
}

function dockerHistory(args) {
  const target = args.find(a => !a.startsWith('-'))
  if (!target) return { type: 'error', lines: ['"docker history" requires exactly 1 argument.'] }
  const key = ensureImage(target)
  if (!key) return { type: 'error', lines: [`Error response from daemon: No such image: ${target}`] }
  const img = IMAGE_DB[key]
  const lines = [
    'IMAGE          CREATED        CREATED BY                                      SIZE      COMMENT',
    `${String(img.id || '').replace(/^sha256:/, '').slice(0, 12).padEnd(14, ' ')} ${String(img.created || 'just now').padEnd(14, ' ')} CMD ${String(img.cmd || 'sh').padEnd(38, ' ')} 0B`,
    `${randomId(12).padEnd(14, ' ')} 2 weeks ago     COPY project files /app                       24MB`,
    `${randomId(12).padEnd(14, ' ')} 2 weeks ago     RUN install dependencies                       86MB`,
    `${randomId(12).padEnd(14, ' ')} 2 weeks ago     FROM ${img.from || img.repo}                              ${img.size || '0B'}`
  ]
  return { lines, delay: 200 }
}

function dockerSave(args) {
  const outputIdx = args.findIndex(a => a === '-o' || a === '--output')
  const output = outputIdx !== -1 ? args[outputIdx + 1] : (args.find(a => a.startsWith('--output=')) || '').replace(/^--output=/, '')
  const images = args.filter((a, i) => !a.startsWith('-') && i !== outputIdx + 1)
  if (!images.length) return { type: 'error', lines: ['"docker save" requires at least 1 image name.'] }
  const missing = images.find(img => !ensureImage(img))
  if (missing) return { type: 'error', lines: [`Error response from daemon: reference does not exist: ${missing}`] }
  const file = output || 'stdout.tar'
  HOST_PROJECT_FILES[file] = `Docker image archive (simulated): ${images.join(', ')}\n`
  return { lines: [`已将镜像 ${images.join(', ')} 导出到模拟项目文件 ${file}`, '提示：真实 Docker 中可用 docker load -i <file> 导入。'], delay: 500 }
}

function dockerLoad(args) {
  const inputIdx = args.findIndex(a => a === '-i' || a === '--input')
  const input = inputIdx !== -1 ? args[inputIdx + 1] : (args.find(a => a.startsWith('--input=')) || '').replace(/^--input=/, '')
  const file = input || 'stdin.tar'
  const content = readHostFile(file)
  if (input && content === undefined) return { type: 'error', lines: [`open ${file}: no such file or directory`] }
  const repo = file && file !== 'stdin.tar' ? hostFileName(file).replace(/\.(tar|tgz|gz)$/i, '').replace(/[^a-zA-Z0-9_.-]/g, '-') || 'loaded-image' : 'loaded-image'
  const full = `${repo}:latest`
  IMAGE_DB[full] = { repo, tag: 'latest', id: 'sha256:' + randomId(12), size: '96MB', created: 'just now', status: '已导入' }
  return { lines: [`Loaded image: ${full}`], delay: 500 }
}

function dockerImagePrune(args) {
  const all = args.includes('-a') || args.includes('--all')
  const used = new Set(CONTAINERS.map(c => c.image))
  const removable = Object.keys(IMAGE_DB).filter(k => all ? !used.has(k) : !used.has(k) && !BASE_IMAGES[k])
  for (const k of removable) delete IMAGE_DB[k]
  return { lines: [
    'Deleted Images:',
    ...removable.map(k => `untagged: ${k}`),
    '',
    `Total reclaimed space: ${removable.length ? removable.length * 24 + 'MB' : '0B'}`
  ], delay: 400 }
}

function dockerContainerPrune(args) {
  const removable = CONTAINERS.filter(c => c.status !== 'running' && c.status !== 'paused')
  for (const c of removable) {
    const idx = CONTAINERS.indexOf(c)
    if (idx !== -1) CONTAINERS.splice(idx, 1)
  }
  return { lines: [
    'Deleted Containers:',
    ...removable.map(c => c.shortId),
    '',
    `Total reclaimed space: ${removable.length ? removable.length * 8 + 'MB' : '0B'}`
  ], delay: 400 }
}

function dockerSystem(args) {
  const sub = args[0]
  if (!sub || sub === 'help') return { lines: [
    '',
    'Usage:  docker system COMMAND',
    '',
    'Manage Docker',
    '',
    'Commands:',
    '  df          Show docker disk usage',
    '  prune       Remove unused data',
    ''
  ] }
  if (sub === 'df') return dockerSystemDf(args.slice(1))
  if (sub === 'prune') return dockerSystemPrune(args.slice(1))
  return { type: 'error', lines: [`docker system: unknown command: ${sub}`] }
}

function dockerSystemDf(args) {
  const verbose = args.includes('-v') || args.includes('--verbose')
  const images = Object.keys(IMAGE_DB).length
  const containers = CONTAINERS.length
  const running = CONTAINERS.filter(c => c.status === 'running' || c.status === 'paused').length
  const volumes = VOLUMES.length
  const lines = [
    'TYPE            TOTAL     ACTIVE    SIZE      RECLAIMABLE',
    `Images          ${String(images).padEnd(8, ' ')} ${String(new Set(CONTAINERS.map(c => c.image)).size).padEnd(8, ' ')} ${String(images * 96 + 'MB').padEnd(9, ' ')} ${Math.max(0, images - running) * 32}MB (simulated)`,
    `Containers      ${String(containers).padEnd(8, ' ')} ${String(running).padEnd(8, ' ')} ${String(containers * 8 + 'MB').padEnd(9, ' ')} ${Math.max(0, containers - running) * 8}MB (simulated)`,
    `Local Volumes   ${String(volumes).padEnd(8, ' ')} ${String(VOLUMES.filter(v => CONTAINERS.some(c => String(c.volume || '').startsWith(v.name + ':'))).length).padEnd(8, ' ')} ${String(volumes * 12 + 'MB').padEnd(9, ' ')} ${volumes * 4}MB (simulated)`,
    'Build Cache     3        0         42MB      42MB'
  ]
  if (verbose) {
    lines.push('', 'Images space usage:', 'REPOSITORY          TAG       SIZE      IN USE')
    for (const [k, v] of Object.entries(IMAGE_DB)) lines.push(`${String(v.repo).padEnd(19, ' ')} ${String(v.tag).padEnd(9, ' ')} ${String(v.size).padEnd(9, ' ')} ${CONTAINERS.some(c => c.image === k) ? 'true' : 'false'}`)
  }
  return { lines, delay: 250 }
}

function dockerSystemPrune(args) {
  const all = args.includes('-a') || args.includes('--all')
  const oldContainers = CONTAINERS.length
  dockerContainerPrune([])
  const removedContainers = oldContainers - CONTAINERS.length
  const oldImages = Object.keys(IMAGE_DB).length
  dockerImagePrune(all ? ['-a'] : [])
  const removedImages = oldImages - Object.keys(IMAGE_DB).length
  const removableNets = NETWORKS.filter(n => !['bridge', 'host', 'none'].includes(n.name) && !CONTAINERS.some(c => c.network === n.name))
  NETWORKS = NETWORKS.filter(n => !removableNets.includes(n))
  return { lines: [
    'Deleted Containers:',
    `  ${removedContainers} stopped container(s)`,
    'Deleted Networks:',
    ...removableNets.map(n => `  ${n.name}`),
    'Deleted Images:',
    `  ${removedImages} unused image(s)`,
    '',
    `Total reclaimed space: ${removedContainers * 8 + removedImages * 24 + removableNets.length * 2}MB`
  ], delay: 500 }
}

// --- docker volume ---
function dockerVolume(args) {
  const sub = args[0]
  if (!sub) return volumeHelp()
  switch (sub) {
    case 'ls': return volumeLs(args)
    case 'create': {
      const name = args[1]
      const n = name || ('volume_' + (++VOLUME_COUNTER).toString().padStart(4, '0'))
      if (name && VOLUMES.some(v => v.name === name)) return { type: 'error', lines: [`Error response from daemon: create ${name}: volume already exists`] }
      VOLUMES.push({ name: n, driver: 'local', mountpoint: `/var/lib/docker/volumes/${n}/_data` })
      return { lines: [n], delay: 200 }
    }
    case 'inspect': {
      const name = args[1]
      const v = VOLUMES.find(x => x.name === name)
      if (!v) return { type: 'error', lines: [`Error: No such volume: ${name}`] }
      return { lines: [`[`, `    {`, `        "CreatedAt": "${now(-5)}",`, `        "Driver": "local",`, `        "Labels": null,`, `        "Mountpoint": "${v.mountpoint}",`, `        "Name": "${v.name}",`, `        "Options": null,`, `        "Scope": "local"`, `    }`, `]`] }
    }
    case 'rm': {
      const targets = args.slice(1)
      if (targets.length === 0) return { type: 'error', lines: ['"docker volume rm" requires at least 1 argument.'] }
      const out = []
      for (const t of targets) {
        const idx = VOLUMES.findIndex(v => v.name === t)
        if (idx === -1) out.push(`Error: No such volume: ${t}`)
        else { VOLUMES.splice(idx, 1); out.push(t) }
      }
      return { lines: out, delay: 200 }
    }
    case 'prune': return { lines: ['Total reclaimed space: 0B', '（模拟环境：没有可清理的悬空卷）'], delay: 300 }
    case 'help': return volumeHelp()
    default: return { type: 'error', lines: [`docker volume: unknown command: ${sub}`] }
  }
}

function volumeLs() {
  const header = 'DRIVER    VOLUME NAME'
  const rows = VOLUMES.map(v => ` local     ${v.name}`)
  return { lines: [header, ...rows, ''] }
}

function volumeHelp() {
  return { lines: [
    '',
    'Usage:  docker volume COMMAND',
    '',
    'Manage volumes',
    '',
    'Commands:',
    '  create      Create a volume',
    '  inspect     Display detailed information on one or more volumes',
    '  ls          List volumes',
    '  prune       Remove all unused local volumes',
    '  rm          Remove one or more volumes',
    ''
  ] }
}

// --- docker network ---
function dockerNetwork(args) {
  const sub = args[0]
  if (!sub) return networkHelp()
  switch (sub) {
    case 'ls': return networkLs()
    case 'create': {
      const name = args[1]
      if (!name) return { type: 'error', lines: ['"docker network create" requires exactly 1 argument.', "See 'docker network create --help'."] }
      if (NETWORKS.some(n => n.name === name)) return { type: 'error', lines: [`Error response from daemon: network with name ${name} already exists`] }
      NETWORK_COUNTER++
      NETWORKS.push({ name, driver: 'bridge', scope: 'local' })
      return { lines: [randomId(16)], delay: 300 }
    }
    case 'inspect': {
      const name = args[1]
      const n = NETWORKS.find(x => x.name === name)
      if (!n) return { type: 'error', lines: [`Error: No such network: ${name}`] }
      const members = CONTAINERS.filter(c => c.network === name || (name === 'bridge' && !c.network))
      const memberLines = members.map(c => `            "${c.shortId}": {"Name": "${c.name}", "IPv4Address": "${containerIP(c)}/16"},`)
      return { lines: [
        `[`, `    {`, `        "Name": "${n.name}",`,
        `        "Id": "${randomId(32)}",`,
        `        "Driver": "${n.driver}",`,
        `        "Scope": "local"`,
        `        "Containers": {`,
        ...memberLines,
        `        }`, `    }`, `]`
      ] }
    }
    case 'connect': {
      const [net, cont] = args.slice(1)
      const n = NETWORKS.find(x => x.name === net)
      const c = CONTAINERS.find(x => x.name === cont || x.shortId.startsWith(cont))
      if (!n) return { type: 'error', lines: [`Error response from daemon: network ${net} not found`] }
      if (!c) return { type: 'error', lines: [`Error response from daemon: container ${cont} not found`] }
      c.network = net
      return { lines: [''], delay: 300 }
    }
    case 'disconnect': return { lines: [''], delay: 200 }
    case 'rm': {
      const targets = args.slice(1)
      const out = []
      for (const t of targets) {
        const idx = NETWORKS.findIndex(n => n.name === t)
        if (idx === -1) out.push(`Error: No such network: ${t}`)
        else if (['bridge', 'host', 'none'].includes(t)) out.push(`Error response from daemon: ${t} is a pre-defined network and cannot be removed`)
        else { NETWORKS.splice(idx, 1); out.push(t) }
      }
      return { lines: out, delay: 200 }
    }
    case 'prune': return { lines: ['Deleted Networks:', '', 'Total reclaimed space: 0B'], delay: 300 }
    case 'help': return networkHelp()
    default: return { type: 'error', lines: [`docker network: unknown command: ${sub}`] }
  }
}

function networkLs() {
  const header = 'NETWORK ID     NAME      DRIVER    SCOPE'
  const rows = NETWORKS.map(n => ` ${randomId(10)}   ${(n.name || '').padEnd(8, ' ')} ${(n.driver || '').padEnd(8, ' ')} ${n.scope}`)
  return { lines: [header, ...rows, ''] }
}

function networkHelp() {
  return { lines: [
    '',
    'Usage:  docker network COMMAND',
    '',
    'Manage networks',
    '',
    'Commands:',
    '  connect      Connect a container to a network',
    '  create       Create a network',
    '  disconnect   Disconnect a container from a network',
    '  inspect      Display detailed information on one or more networks',
    '  ls           List networks',
    '  prune        Remove all unused networks',
    '  rm           Remove one or more networks',
    ''
  ] }
}

// --- docker inspect ---
function dockerInspect(args) {
  const target = args.find(a => !a.startsWith('-'))
  if (!target) return { type: 'error', lines: ['"docker inspect" requires at least 1 argument.'] }
  const c = CONTAINERS.find(x => x.name === target || x.shortId.startsWith(target))
  const img = ensureImage(target)
  if (c) {
    // 挂载信息：从 -v 参数实时解析
    let mounts = 'null'
    if (c.volume) {
      const parts = c.volume.split(':')
      if (parts.length >= 2) {
        const src = parts[0].startsWith('/') ? parts[0] : parts[0]
        const dst = parts[1]
        const type = src.startsWith('/') ? 'bind' : 'volume'
        mounts = `[{"Type": "${type}", "Source": "${src}", "Destination": "${dst}", "Mode": "", "RW": true}]`
      } else {
        mounts = `[{"Type": "volume", "Name": "${parts[0]}", "Destination": "/data", "RW": true}]`
      }
    }
    return { lines: [
      `[`,
      `    {`,
      `        "Id": "${c.id}",`,
      `        "Created": "${c.created}",`,
      `        "Path": "${c.command ? c.command.split(' ')[0] : 'sh'}",`,
      `        "Args": [${c.command ? `"${c.command.split(' ').slice(1).join('", "')}"` : ''}],`,
      `        "State": {`,
      `            "Status": "${c.status}",`,
      `            "Running": ${c.status === 'running'},`,
      `            "ExitCode": ${c.status === 'exited' ? 0 : 0}`,
      `        },`,
      `        "Image": "${c.image}",`,
      `        "Name": "/${c.name}",`,
      `        "Mounts": ${mounts},`,
      `        "Config": { "Env": [${(c.env || []).map(e => `"${e}"`).join(', ')}] },`,
      `        "NetworkSettings": { "Networks": { "${c.network || 'bridge'}": { "IPAddress": "${containerIP(c)}" } } }`,
      `    }`,
      `]`
    ] }
  }
  if (img) {
    const image = IMAGE_DB[img]
    return { lines: [
      `[`,
      `    {`,
      `        "Id": "${image.id}...",`,
      `        "RepoTags": ["${img}"],`,
      `        "Created": "2026-08-01T08:00:00.000Z",`,
      `        "Size": ${parseInt(image.size) * 1024 * 1024 || 78000000},`,
      `        "Architecture": "amd64",`,
      `        "Os": "linux",`,
      `        "DockerVersion": "26.1.3",`,
      `        "Config": { "Cmd": ${image.cmd ? `["${image.cmd.split(' ').join('", "')}"]` : 'null'} }`,
      `    }`,
      `]`
    ] }
  }
  return { type: 'error', lines: [`Error: No such object: ${target}`] }
}

// --- docker stats ---
function dockerStats(args) {
  const running = CONTAINERS.filter(c => c.status === 'running')
  if (running.length === 0) return { lines: ['（当前没有运行中的容器，先使用 docker run -d 启动一个再查看）'], delay: 300 }
  const header = 'CONTAINER ID   NAME            CPU %     MEM USAGE / LIMIT     MEM %     NET I/O           BLOCK I/O'
  const rows = running.map(c => {
    const cpu = (Math.random() * 0.5).toFixed(2)
    const mem = (Math.random() * 30 + 5).toFixed(1)
    return ` ${c.shortId}   ${(c.name || '').padEnd(14, ' ')} ${cpu.padStart(6, ' ')}   ${mem}MiB / 15.6GiB   ${((mem / 15974) * 100).toFixed(2).padStart(5, ' ')}%   ${(Math.random() * 5).toFixed(1)}kB / ${(Math.random() * 10).toFixed(1)}kB   ${(Math.random() * 5).toFixed(1)}MB / 0B`
  })
  return { lines: [header, ...rows], delay: 400 }
}

function dockerPort(args) {
  const target = args[0]
  const c = CONTAINERS.find(x => x.name === target || x.shortId.startsWith(target))
  if (!c) return { type: 'error', lines: [`Error: No such container: ${target}`] }
  if (!c.ports) return { lines: ['（容器未映射端口）'] }
  const [host, container] = c.ports.split(':')
  return { lines: [`${container}/tcp -> 0.0.0.0:${host}`] }
}

// ---------------------------------------------------------------------------
// docker compose：从 docker-compose.yml 解析服务定义，动态编排
// ---------------------------------------------------------------------------

function composeFileText() {
  const files = {
    'docker-compose.yml': [
      'version: "3.8"',
      '',
      'services:',
      '  web:',
      '    build: .',
      '    ports:',
      '      - "8080:3000"',
      '    depends_on:',
      '      - db',
      '',
      '  db:',
      '    image: mysql:8.0',
      '    environment:',
      '      MYSQL_ROOT_PASSWORD: "123456"',
      '    volumes:',
      '      - db_data:/var/lib/mysql',
      '',
      'volumes:',
      '  db_data:'
    ]
  }
  return (files['docker-compose.yml'] || []).join('\n')
}

function parseComposeYaml(text) {
  const services = {}
  const volumes = []
  let section = null      // 'services' | 'volumes' | null
  let curSvc = null
  let svcField = null     // 当前服务下的字段（image/ports/environment/...）
  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/#.*$/, '').replace(/\s+$/, '')
    if (!line.trim()) continue
    const indent = (line.match(/^\s*/) || [''])[0].length
    const content = line.trim()
    if (indent === 0) {
      section = content.replace(/:$/, '')
      curSvc = null
      svcField = null
      continue
    }
    if (section === 'services' && indent === 2 && /^[a-zA-Z0-9_-]+:\s*$/.test(content)) {
      curSvc = content.replace(/:$/, '')
      if (!services[curSvc]) services[curSvc] = { image: null, build: null, ports: [], env: [], volumes: [], depends: [], cmd: null }
      svcField = null
      continue
    }
    if (section === 'volumes' && indent === 2 && /^[a-zA-Z0-9_.-]+:\s*$/.test(content)) {
      volumes.push(content.replace(/:$/, ''))
      continue
    }
    if (curSvc && indent === 4) {
      const m = content.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/)
      if (m) {
        svcField = m[1]
        const val = m[2].trim()
        if (svcField === 'image' && val) services[curSvc].image = val.replace(/["']/g, '')
        if (svcField === 'build' && val) services[curSvc].build = val.replace(/["']/g, '') || '.'
        if (svcField === 'command' && val) services[curSvc].cmd = val.replace(/["']/g, '')
        if (svcField === 'container_name' && val) services[curSvc].containerName = val.replace(/["']/g, '')
        continue
      }
    }
    if (curSvc && svcField && indent >= 6) {
      // 列表项
      const item = content.replace(/^-\s*/, '').replace(/["']/g, '')
      if (!item) continue
      if (svcField === 'ports') services[curSvc].ports.push(item)
      else if (svcField === 'volumes') services[curSvc].volumes.push(item)
      else if (svcField === 'depends_on') services[curSvc].depends.push(item.split(':')[0])
      else if (svcField === 'environment') services[curSvc].env.push(item.includes('=') ? item : `${item.split(':')[0]}=${(item.split(':')[1] || '').trim()}`)
      else if (svcField === 'command') services[curSvc].cmd = item
    }
  }
  return { services, volumes }
}

const COMPOSE_PROJECT = 'docker-project'

function composeServices() {
  return parseComposeYaml(composeFileText())
}

function composeContainers() {
  return CONTAINERS.filter(c => c.composeProject === COMPOSE_PROJECT)
}

function runCompose(args) {
  if (args.length === 0 || ['help', '-h'].includes(args[0])) {
    return { lines: [
      '',
      'Usage:  docker compose [OPTIONS] COMMAND',
      '',
      'Define and run multi-container applications with Docker',
      '',
      'Commands:',
      '  up         Create and start containers',
      '  down       Stop and remove containers, networks',
      '  ps         List containers',
      '  logs       View output from containers',
      '  build      Build or rebuild services',
      '  pull       Pull service images',
      '  restart    Restart services',
      '  stop       Stop services',
      '  config     Parse, resolve and render compose file in canonical format',
      '',
      `版本：${COMPOSE_VERSION}`
    ] }
  }

  const sub = args[0]
  const { services, volumes } = composeServices()
  const names = Object.keys(services)

  switch (sub) {
    case 'up': {
      const netName = COMPOSE_PROJECT + '_default'
      if (!NETWORKS.some(n => n.name === netName)) {
        NETWORKS.push({ name: netName, driver: 'bridge', scope: 'local' })
      }
      const out = []
      const upserted = []
      let i = 0
      for (const name of names) {
        const svc = services[name]
        i++
        // 服务镜像：build 服务从 Dockerfile 构建，image 服务确保本地存在
        let imageRef = null
        if (svc.build) {
          imageRef = buildFromDockerfile(`${COMPOSE_PROJECT}-${name}:latest`)
        } else if (svc.image) {
          const ref = svc.image.includes(':') ? svc.image : svc.image + ':latest'
          if (!IMAGE_DB[ref] && REMOTE_IMAGES[svc.image] || !IMAGE_DB[ref] && REMOTE_IMAGES[ref]) {
            const repo = ref.split(':')[0]
            const tag = ref.split(':')[1] || 'latest'
            IMAGE_DB[ref] = { repo, tag, id: 'sha256:' + randomId(12), size: (REMOTE_IMAGES[ref] || REMOTE_IMAGES[svc.image] || { size: '100MB' }).size, created: 'just now', status: '已下载' }
          } else if (!IMAGE_DB[ref] && !REMOTE_IMAGES[ref] && !REMOTE_IMAGES[svc.image]) {
            IMAGE_DB[ref] = { repo: ref.split(':')[0], tag: ref.split(':')[1] || 'latest', id: 'sha256:' + randomId(12), size: '100MB', created: 'just now', status: '已下载' }
          }
          imageRef = ref
        } else {
          imageRef = 'busybox:latest'
        }
        const cname = svc.containerName || `${COMPOSE_PROJECT}-${name}-1`
        let c = CONTAINERS.find(x => x.name === cname)
        if (!c) {
          const id = genContainerId()
          c = {
            id,
            shortId: id.slice(0, 12),
            image: imageRef,
            imageKey: imageRef,
            command: svc.cmd || '',
            created: now(),
            createdAt: Date.now(),
            status: 'running',
            name: cname,
            ports: svc.ports.length ? svc.ports[0].replace(/^\[|\]$/g, '') : null,
            volume: svc.volumes.length ? svc.volumes[0].replace(/^\[|\]$/g, '') : null,
            env: svc.env,
            network: netName,
            composeProject: COMPOSE_PROJECT,
            fs: {}
          }
          CONTAINERS.unshift(c)
        } else {
          c.status = 'running'
          c.createdAt = Date.now()
        }
        upserted.push(c)
        c.logs = buildContainerLogs(c)
        out.push(`[+] Running ${i}/${names.length}${' '.repeat(50 - String(i).length - String(names.length).length)}✔ Container ${cname}  Started`)
      }
      // 声明卷
      for (const v of volumes) {
        if (!VOLUMES.some(x => x.name === v)) {
          VOLUMES.push({ name: v, driver: 'local', mountpoint: `/var/lib/docker/volumes/${v}/_data` })
        }
      }
      return {
        lines: [
          `[+] Running ${names.length}/${names.length}`,
          ` ✔ Network ${netName}          Created`,
          ...volumes.map(v => ` ✔ Volume "${v}"         Created`),
          ...out,
          '',
          `提示：docker compose ps 可查看服务状态；docker compose down 可停止并删除。`
        ],
        delay: 1600
      }
    }
    case 'down': {
      const rmVols = args.includes('-v')
      const cs = composeContainers()
      const lines = [`[+] Running ${cs.length + 1}/${cs.length + 1}`]
      for (const c of cs) {
        lines.push(` ✔ Container ${c.name}      Removed`)
        const idx = CONTAINERS.indexOf(c)
        if (idx > -1) CONTAINERS.splice(idx, 1)
      }
      const netName = COMPOSE_PROJECT + '_default'
      const nIdx = NETWORKS.findIndex(n => n.name === netName)
      if (nIdx > -1) {
        lines.push(` ✔ Network ${netName}      Removed`)
        NETWORKS.splice(nIdx, 1)
      }
      if (rmVols) {
        for (const v of (composeServices().volumes)) {
          const vIdx = VOLUMES.findIndex(x => x.name === v)
          if (vIdx > -1) {
            lines.push(` ✔ Volume "${v}"         Removed`)
            VOLUMES.splice(vIdx, 1)
          }
        }
      }
      lines.push('')
      return { lines, delay: 800 }
    }
    case 'ps': {
      const cs = composeContainers()
      if (!cs.length) {
        return { lines: ['NAME                IMAGE     COMMAND   SERVICE   CREATED   STATUS', '（先执行 docker compose up -d 启动服务）'], delay: 300 }
      }
      const header = 'NAME                 IMAGE          COMMAND                  SERVICE   CREATED          STATUS'
      const rows = cs.map(c => {
        const svc = c.name.replace(new RegExp(`^${COMPOSE_PROJECT}-`), '').replace(/-\d+$/, '')
        const img = (c.image || '').padEnd(13, ' ')
        const cmdStr = (c.command || '').slice(0, 21).padEnd(22, ' ')
        const created = timeAgo(c.createdAt)
        const status = containerStatusText(c)
        return ` ${c.name.padEnd(18, ' ')} ${img} ${cmdStr} ${svc.padEnd(8, ' ')} ${created}  ${status}`
      })
      return { lines: [header, ...rows], delay: 300 }
    }
    case 'config': {
      const out = ['name: ' + COMPOSE_PROJECT, 'services:']
      for (const name of names) {
        const svc = services[name]
        out.push(`  ${name}:`)
        out.push(`    image: ${svc.build ? `${COMPOSE_PROJECT}-${name}:latest` : svc.image || ''}`)
        if (svc.build) out.push(`    build:`)
        if (svc.ports.length) {
          out.push('    ports:')
          for (const p of svc.ports) out.push(`      - ${p}`)
        }
        if (svc.env.length) {
          out.push('    environment:')
          for (const e of svc.env) out.push(`      ${e}`)
        }
        if (svc.volumes.length) {
          out.push('    volumes:')
          for (const v of svc.volumes) out.push(`      - ${v}`)
        }
        if (svc.depends.length) {
          out.push('    depends_on:')
          for (const d of svc.depends) out.push(`      - ${d}`)
        }
      }
      out.push('networks:')
      out.push(`  default:`)
      out.push(`    name: ${COMPOSE_PROJECT}_default`)
      if (composeServices().volumes.length) {
        out.push('volumes:')
        for (const v of composeServices().volumes) out.push(`  ${v}:`)
      }
      return { lines: out, delay: 300 }
    }
    case 'logs': {
      const svcName = args[1]
      const cs = composeContainers()
      if (!cs.length) return { lines: ['（先执行 docker compose up -d 启动服务）'], delay: 300 }
      const targets = svcName ? cs.filter(c => c.name.includes('-' + svcName + '-')) : cs
      if (!targets.length) return { type: 'error', lines: [`no such service: ${svcName}`] }
      const out = []
      for (const c of targets) {
        const svc = c.name.replace(new RegExp(`^${COMPOSE_PROJECT}-`), '').replace(/-\d+$/, '')
        for (const l of (c.logs || buildContainerLogs(c))) out.push(`${svc}-1  | ${l}`)
      }
      return { lines: out, delay: 400 }
    }
    case 'build': {
      const out = []
      for (const name of names) {
        if (!services[name].build) continue
        const ref = `${COMPOSE_PROJECT}-${name}:latest`
        buildFromDockerfile(ref)
        out.push(`[+] Building ${(2 + Math.random() * 2).toFixed(1)}s (${7}/${7}) FINISHED`)
        out.push(`${name}-1  Built`)
      }
      if (!out.length) out.push('（没有需要构建的 build 服务）')
      return { lines: out, delay: 800 }
    }
    case 'stop': {
      for (const c of composeContainers()) { c.status = 'exited'; c.exitedAt = Date.now() }
      return { lines: ['[+] Running 1/1', ' ✔ Container stopped'], delay: 500 }
    }
    default: return { type: 'error', lines: [`docker compose: unknown command: ${sub}`] }
  }
}

// --- 文件相关 ---
function runCat(args) {
  const file = args[0]
  if (!file) return { type: 'error', lines: ['cat: missing operand'] }
  let content
  if (file === 'docker-compose.yml') content = composeFileText()
  else content = HOST_PROJECT_FILES[file]
  if (content === undefined) return { type: 'error', lines: [`cat: ${file}: No such file or directory`] }
  return { lines: content.replace(/\n$/, '').split('\n') }
}

// ---------------------------------------------------------------------------
// 环境查询（供 UI 显示状态）
// ---------------------------------------------------------------------------

export function getEnvironment() {
  return {
    images: Object.entries(IMAGE_DB).map(([k, v]) => ({ full: k, ...v })),
    containers: CONTAINERS.map(c => ({ ...c })),
    volumes: VOLUMES.map(v => ({ ...v })),
    networks: NETWORKS.map(n => ({ ...n })),
    history: [...COMMAND_HISTORY]
  }
}

export default { executeCommand, getEnvironment, resetEnvironment, VERSION }
