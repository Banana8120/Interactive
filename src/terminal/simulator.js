/**
 * Docker 命令模拟引擎
 * 在浏览器中模拟一个 Docker 环境：维护镜像/容器/卷/网络的状态，
 * 解析用户输入的命令并返回符合真实 Docker CLI 输出的模拟结果。
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
  'hello-world': { size: '13.3kB' }
}

// 课程内置的“基准镜像库”快照：rmi 会从 IMAGE_DB 删除镜像，
// 但教程的镜像属于课程资源，进入每个课时时应恢复，避免上一课时删除的镜像污染后续课时。
const BASE_IMAGES = JSON.parse(JSON.stringify(IMAGE_DB))

const REMOTE_LAYERS = ['digest: sha256:xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 'status: Downloaded newer image for ']

// 随机生成若干 "层: Pull complete" 行，模拟真实拉取输出
function randomLayers(count = 3) {
  return Array.from({ length: count }, () => ` ${randomId(12)}: Pull complete `)
}

function randomId(len = 12) {
  const chars = '0123456789abcdef'
  let s = ''
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * 16)]
  return s
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
// 本地持久化：按课时缓存 Docker 模拟状态
// ---------------------------------------------------------------------------

const DOCKER_STORAGE_PREFIX = 'docker-sim-state-v1'

function dockerStorageKey(lessonId) {
  return `${DOCKER_STORAGE_PREFIX}-${lessonId}`
}

export function saveDockerState(lessonId) {
  if (!lessonId) return false
  try {
    if (typeof localStorage === 'undefined') return false
    const payload = {
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
    localStorage.setItem(dockerStorageKey(lessonId), JSON.stringify(payload))
    return true
  } catch (e) {
    return false
  }
}

export function loadDockerState(lessonId) {
  if (!lessonId) return false
  try {
    if (typeof localStorage === 'undefined') return false
    const raw = localStorage.getItem(dockerStorageKey(lessonId))
    if (!raw) return false
    const saved = JSON.parse(raw)
    if (saved && typeof saved === 'object') {
      CONTAINERS = Array.isArray(saved.containers) ? saved.containers : []
      VOLUMES = Array.isArray(saved.volumes) ? saved.volumes : []
      NETWORKS = Array.isArray(saved.networks) ? saved.networks : [
        { name: 'bridge', driver: 'bridge', scope: 'local' },
        { name: 'host', driver: 'host', scope: 'local' },
        { name: 'none', driver: 'null', scope: 'local' }
      ]
      const c = saved.counters || {}
      COUNTER.container = c.container || COUNTER.container
      COUNTER.image = c.image || COUNTER.image
      NETWORK_COUNTER = c.network || 0
      VOLUME_COUNTER = c.volume || 0
      PORTS_COUNTER = c.ports || 4000
      return true
    }
    return false
  } catch (e) {
    return false
  }
}

/**
 * 恢复课程基准镜像库（被 rmi 删除的内置镜像会在进入新课时重新可用）。
 * 注意：仅补充缺失的基准镜像，不会移除用户在本课时内自行 pull 的镜像。
 */
export function restoreBaseImages() {
  try {
    for (const k of Object.keys(BASE_IMAGES)) {
      if (!IMAGE_DB[k]) IMAGE_DB[k] = { ...BASE_IMAGES[k] }
    }
  } catch (e) {
    /* ignore */
  }
}

export function clearDockerState(lessonId) {
  if (!lessonId) return false
  try {
    if (typeof localStorage === 'undefined') return false
    localStorage.removeItem(dockerStorageKey(lessonId))
    return true
  } catch (e) {
    return false
  }
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
    '  docker run / ps / start / stop / restart / rm / logs / exec / inspect / stats    容器操作',
    '  docker build                    从 Dockerfile 构建镜像',
    '  docker volume ls / create / rm  数据卷管理',
    '  docker network ls / create / rm 网络管理',
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
    ls: () => ({ lines: ['.', '..', 'Dockerfile', 'app.js', 'package.json'] }),
    pwd: () => ({ lines: ['/home/learner/docker-project'] }),
    cat: (args) => runCat(args),
    clear: () => ({ type: 'clear' }),
    echo: (args) => ({ lines: [args.join(' ')] }),
    exit: () => ({ lines: ['(学习环境为模拟终端，无需退出。可继续输入命令或通过侧边栏切换章节。)'] })
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
    case 'run': return dockerRun(rest)
    case 'ps': return dockerPs(rest)
    case 'start': return dockerStart(rest)
    case 'stop': return dockerStop(rest)
    case 'restart': return dockerRestart(rest)
    case 'rm': return dockerRm(rest)
    case 'logs': return dockerLogs(rest)
    case 'exec': return dockerExec(rest)
    case 'build': return dockerBuild(rest)
    case 'volume': return dockerVolume(rest)
    case 'network': return dockerNetwork(rest)
    case 'compose': return runCompose(rest)
    case 'inspect': return dockerInspect(rest)
    case 'stats': return dockerStats(rest)
    case 'port': return dockerPort(rest)
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
  if (sub === 'help') return dockerHelp()
  return { type: 'error', lines: [`docker image: unknown command: ${sub || ''}`, `运行 'docker help' 查看可用命令。`] }
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
    '  start       启动一个或多个已停止的容器',
    '  stop        停止一个或多个运行中的容器',
    '  restart     重启一个或多个容器',
    '  rm          删除一个或多个容器',
    '  ps          列出容器',
    '  images      列出镜像',
    '  pull        从镜像仓库拉取镜像',
    '  rmi         删除一个或多个镜像',
    '  tag         标记本地镜像，将其归入某一仓库',
    '  build       从 Dockerfile 构建镜像',
    '  exec        在运行的容器中执行命令',
    '  logs        获取容器日志',
    '  inspect     获取容器/镜像的详细信息',
    '  volume      管理卷',
    '  network     管理网络',
    '  compose     Docker Compose（多容器编排）',
    '  stats       查看容器资源占用',
    '',
    "在浏览器模拟环境中，你也可以直接输入：ls、cat <文件>、clear、echo、pwd",
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
    ` Images:       ${Object.keys(IMAGE_DB).length + COUNTER.image - 1}`,
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
  const header = 'REPOSITORY    TAG       IMAGE ID       CREATED         SIZE'
  const rows = list.map(i => {
    const repo = i.repo.padEnd(12, ' ')
    const tag = (i.tag || 'latest').padEnd(8, ' ')
    const id = i.id.slice(7, 19)
    const created = (i.created || '').padEnd(14, ' ')
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
function dockerPull(args) {
  const ref = args.find(a => !a.startsWith('-'))
  if (!ref) return { type: 'error', lines: ['"docker pull" requires exactly 1 argument.', "See 'docker pull --help'."] }

  // 模拟拉取动画由前端处理（progress 提示）
  const img = IMAGE_DB[ref] || IMAGE_DB[`${ref}:latest`]
  if (img) {
    return { lines: [
      `Using default tag: latest`,
      `latest: Pulling from library/${img.repo}`,
      ...randomLayers(),
      `Status: Image is up to date for ${img.repo}:latest`,
      `docker.io/library/${ref}: what you pulled is already in local. 提示：镜像已存在，无需重复拉取。`
    ], delay: 800 }
  }

  const remote = REMOTE_IMAGES[ref] || REMOTE_IMAGES[`${ref}:latest`]
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

  // 拉取成功后加入本地镜像库
  const repo = ref.split(':')[0]
  const tag = ref.includes(':') ? ref.split(':')[1] : 'latest'
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

// --- docker run ---
function dockerRun(args) {
  const flags = { detach: false, name: null, portMap: null, publishAll: false, volume: null, env: [], rm: false, interactive: false, network: null }
  const positional = []

  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '-d' || a === '--detach') flags.detach = true
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
  // 与真实 Docker 一致：本地没有时自动 pull（仅限仓库中存在的镜像）
  if (!key && (REMOTE_IMAGES[imageRef] || REMOTE_IMAGES[`${imageRef}:latest`])) {
    const repo = imageRef.split(':')[0]
    const tag = imageRef.includes(':') ? imageRef.split(':')[1] : 'latest'
    IMAGE_DB[`${repo}:${tag}`] = {
      repo, tag,
      id: 'sha256:' + randomId(12),
      size: (REMOTE_IMAGES[imageRef] || REMOTE_IMAGES[`${imageRef}:latest`]).size,
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

  if (flags.publishAll && !flags.portMap) {
    flags.portMap = `${++PORTS_COUNTER}:80`
  }

  const cmd = positional.slice(1).join(' ') || ''
  const image = IMAGE_DB[key]
  const id = genContainerId()
  const isHello = key.startsWith('hello-world')

  // 端口冲突检测：运行中的容器已占用宿主端口时报错（与真实 Docker 一致）
  if (flags.portMap) {
    const hostPort = flags.portMap.split(':')[0]
    const conflict = CONTAINERS.some(
      (c) => c.status === 'running' && c.ports && c.ports.split(':')[0] === hostPort
    )
    if (conflict) {
      return {
        type: 'error',
        lines: [
          `docker: Error response from daemon: driver failed programming external connectivity on endpoint: Bind for 0.0.0.0:${hostPort} failed: port is already allocated`,
          `提示：宿主机 ${hostPort} 端口已被其他运行中的容器占用。换一个端口，或先停止/删除占用该端口的容器。`
        ]
      }
    }
  }

  const container = {
    id,
    shortId: id.slice(0, 12),
    image: image.repo + ':' + (image.tag || 'latest'),
    imageKey: key,
    command: cmd || (isHello ? '/hello' : image.repo === 'ubuntu' || image.repo === 'alpine' ? '/bin/bash' : image.repo === 'nginx' ? '/docker-entrypoint.sh nginx -g "daemon off;"' : ''),
    created: now(),
    status: isHello ? 'exited' : (flags.detach || !cmd ? 'running' : 'exited'),
    name: flags.name || (image.repo + '_' + randomId(4) + '_' + COUNTER.container),
    ports: flags.portMap || null,
    volume: flags.volume || null,
    env: flags.env,
    rm: flags.rm,
    network: flags.network && NETWORKS.some(n => n.name === flags.network) ? flags.network : null
  }

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

  if (flags.portMap) {
    const hostPort = flags.portMap.split(':')[0]
    container.ports = `${hostPort}:${flags.portMap.split(':')[1]}`
  }

  COUNTER.container++
  CONTAINERS.unshift(container)

  // 端口计算
  let hostPort = null
  if (flags.portMap) {
    hostPort = flags.portMap.split(':')[0]
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
      lines: [hostPort ? `${hostPort}->80/tcp, :::${hostPort}->80/tcp` : '', container.shortId],
      delay: 500
    }
  }

  if (cmd) {
    // 前台执行用户给的命令
    return { lines: runContainerCommand(image.repo, cmd), delay: 400 }
  }

  // 交互式容器
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

  return { lines: [container.shortId], delay: 500 }
}

function runContainerCommand(repo, cmd) {
  const c = cmd.split(' ')
  if (c[0] === 'echo') return [c.slice(1).join(' ')]
  if (c[0] === 'cat') return ['# ' + c[1] + ' 文件内容（模拟）', '']
  if (c[0] === 'ls') return ['Dockerfile  app.js  package.json  README.md']
  if (c[0] === 'env') return ['PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', 'HOSTNAME=abc123', 'HOME=/root']
  if (c[0] === 'node' && c[1] && c[1].includes('.')) return ['Hello from Node.js in Docker!']
  return [`运行结果（模拟）：${cmd}`, '（真实环境中输出取决于容器内程序）']
}

// --- docker ps ---
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
    const created = '3 seconds ago'
    const status = c.status === 'running' ? `Up ${Math.floor((Date.now() - START_TIME) / 1000) % 60 || 2} seconds` : 'Exited (0) 2 seconds ago'
    const ports = c.ports ? `${c.ports} ` : ''
    const name = c.name
    return ` ${id}   ${img} ${cmdStr} ${created}  ${status.padEnd(20, ' ')} ${ports}${name}`
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
  return { lines: [c.shortId], delay: 500 }
}

function dockerRestart(args) {
  const target = args.find(a => !a.startsWith('-'))
  if (!target) return { type: 'error', lines: ['"docker restart" requires at least 1 argument.'] }
  const c = CONTAINERS.find(x => x.name === target || x.shortId.startsWith(target))
  if (!c) return { type: 'error', lines: [`Error response from daemon: No such container: ${target}`] }
  c.status = 'running'
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

// --- docker logs ---
function dockerLogs(args) {
  const target = args.find(a => !a.startsWith('-'))
  if (!target) return { type: 'error', lines: ['"docker logs" requires exactly 1 argument.'] }
  const c = CONTAINERS.find(x => x.name === target || x.shortId.startsWith(target))
  if (!c) return { type: 'error', lines: [`Error: No such container: ${target}`] }
  const sample = {
    nginx: ['/docker-entrypoint.sh: /docker-entrypoint.d/ is not empty, will attempt to perform configuration', '/docker-entrypoint.sh: Looking for shell scripts in /docker-entrypoint.d/', '/docker-entrypoint.sh: Launching /docker-entrypoint.d/10-listen-on-ipv6-by-default.sh', '10-listen-on-ipv6-by-default.sh: info: Getting the checksum of /etc/nginx/conf.d/default.conf', '/docker-entrypoint.sh: Launching /docker-entrypoint.d/20-envsubst-on-templates.sh', 'ready for start up'],
    redis: ['1:C 17 Aug 2026 11:30:01.000 * oO0OoO0OoO0Oo Redis is starting oO0OoO0OoO0Oo', '1:C 17 Aug 2026 11:30:01.000 * Redis version=7.2.4, bits=64, commit=00000000', '1:C 17 Aug 2026 11:30:01.000 * monotonic clock: POSIX clock_gettime', '1:M 17 Aug 2026 11:30:01.001 * Running mode=standalone, port=6379.', '1:M 17 Aug 2026 11:30:01.001 * Ready to accept connections tcp'],
    ubuntu: ['（ubuntu 容器默认无前台进程，可能没有日志输出。可以先用 docker start 启动再查看）'],
    node: ['Example app listening at http://0.0.0.0:3000'],
    mysql: ['2026-08-17T11:30:01.123Z 0 [System] [MY-010116] [Server] /usr/sbin/mysqld (mysqld 8.0.36) starting as process 1', '2026-08-17T11:30:01.456Z 0 [System] [MY-010931] [Server] /usr/sbin/mysqld: ready for connections.']
  }
  const logs = sample[c.image.split(':')[0]] || [`容器 ${c.shortId} 无日志输出。`]
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
  if (cmdArgs[0] === 'ls') return { lines: ['app.js  Dockerfile  package.json  node_modules  public'], delay: 200 }
  if (cmdArgs[0] === 'echo') {
    const redirIdx = cmdArgs.indexOf('>')
    const text = redirIdx > -1 ? cmdArgs.slice(1, redirIdx) : cmdArgs.slice(1)
    return { lines: [text.join(' ').replace(/"/g, '')], delay: 200 }
  }
  if (cmdArgs[0] === 'env') return { lines: ['PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', 'HOSTNAME=' + c.shortId, 'HOME=/root'], delay: 200 }
  if (cmdArgs[0] === 'cat') return { lines: ['# 容器内 ' + cmdArgs[1] + ' 的内容（模拟）', ''], delay: 200 }
  if (cmdArgs[0] === 'node') return { lines: ['Hello from Node.js inside container!'], delay: 300 }
  if (cmdArgs[0] === 'ps' && cmdArgs[1] === 'aux') return { lines: ['PID   USER     TIME  COMMAND', '    1 root      0:00 ' + (c.command || 'nginx'), '   12 root      0:00 ps aux'], delay: 200 }
  if (cmdArgs[0] === 'sh' || cmdArgs[0] === 'bash') return { lines: ['（已进入容器交互终端，真实环境输入 exit 退出）'], delay: 300 }
  return { lines: [`exec 执行结果（模拟）：${cmd}`, '（真实环境中将输出命令在容器内的实际结果）'], delay: 300 }
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

  const steps = [
    { from: 'node:20-alpine', run: 'RUN npm install', cmd: 'CMD ["node", "app.js"]' }
  ]
  const baseId = randomId(12)

  const lines = [
    `[+] Building 4.2s (9/9) FINISHED`,
    ` => [internal] load build definition from Dockerfile               0.0s`,
    ` => => transferring dockerfile: 512B                           0.0s`,
    ` => [internal] load metadata for docker.io/library/node:20-alpine    0.4s`,
    ` => [1/4] FROM docker.io/library/node:20-alpine@sha256:${randomId(64)}   0.5s`,
    ` => [2/4] WORKDIR /app                                              0.1s`,
    ` => [3/4] COPY package*.json ./                                     0.2s`,
    ` => [4/4] RUN npm install                                           2.8s`,
    ` => exporting to image                                              0.2s`,
    ` => => exporting layers                                             0.1s`,
    ` => => writing image sha256:${baseId}                    0.0s`,
    ` => => naming to docker.io/library/${name.replace(/^[a-zA-Z0-9]+:\/\//, '')}                   0.0s`,
    '',
    `View build details: docker-desktop://dashboard/build/desktop-linux/desktop-linux/${randomId(8)}`,
    '',
    `镜像构建成功：${name}`,
    `提示：运行 docker images 可查看新构建的镜像。`
  ]

  const repo = name.includes(':') ? name.split(':')[0] : name
  const tagPart = name.includes(':') ? name.split(':')[1] : 'latest'
  if (!IMAGE_DB[`${repo}:${tagPart}`]) {
    IMAGE_DB[`${repo}:${tagPart}`] = { repo, tag: tagPart, id: 'sha256:' + baseId, size: '214MB', created: 'just now', status: '本地构建' }
  }
  return { lines, delay: 2000 }
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
      return { lines: [`[`, `    {`, `        "Name": "${n.name}",`, `        "Driver": "${n.driver}",`, `        "Scope": "local"`, `        "Containers": {`, ...members.map(c => `            "${c.shortId}": {"Name": "${c.name}"},`), `        }`, `    }`, `]`] }
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
      `        "Mounts": [${c.volume ? `{"Type": "volume", "Name": "${c.volume}", "Destination": "/data"}` : ''}],`,
      `        "NetworkSettings": { "Networks": { "${c.network || 'bridge'}": {} } }`,
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
      `        "Config": { "Cmd": null }`,
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
  return { lines: [`80/tcp -> 0.0.0.0:${c.ports.split(':')[0]}`] }
}

// --- docker compose ---
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
  switch (sub) {
    case 'up': {
      const names = ['web', 'db', 'redis']
      const out = names.map((n, i) => {
        const port = 3000 + i
        return `[+] Running ${i + 1}/${names.length}                                                      ✔ Container project-${n}-1  Started`
      })
      return {
        lines: [
          `[+] Running 3/3`,
          ` ✔ Network project_default          Created`,
          ` ✔ Volume "project_db_data"         Created`,
          ...out,
          '',
          `提示：docker compose ps 可查看服务状态；docker compose down 可停止并删除。`
        ],
        delay: 1600
      }
    }
    case 'down': {
      return { lines: [`[+] Running 2/2`, ` ✔ Container project-web-1      Removed`, ` ✔ Network project_default      Removed`, ''], delay: 800 }
    }
    case 'ps': {
      return { lines: ['NAME                 IMAGE          COMMAND                  SERVICE   CREATED          STATUS', 'project-web-1         nginx:latest   "/docker-entrypoint.…"   web       2 minutes ago   Up 2 minutes', 'project-db-1          mysql:8.0      "docker-entrypoint.s…"   db        2 minutes ago   Up 2 minutes'], delay: 300 }
    }
    case 'config': return { lines: ['services:', '  web:', '    image: nginx:latest', '    ports:', '      - "8080:80"', '  db:', '    image: mysql:8.0', '    environment:', '      MYSQL_ROOT_PASSWORD: 123456'], delay: 300 }
    case 'logs': return { lines: ['web-1  | ready for start up', 'db-1   | ready for connections.'], delay: 400 }
    case 'build': return { lines: ['[+] Building 2.0s (7/7) FINISHED', 'web-1  Built'], delay: 800 }
    default: return { type: 'error', lines: [`docker compose: unknown command: ${sub}`] }
  }
}

// --- 文件相关 ---
function runCat(args) {
  const file = args[0]
  if (!file) return { type: 'error', lines: ['cat: missing operand'] }
  const files = {
    'Dockerfile': [
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
    ],
    'app.js': [
      "const http = require('http');",
      '',
      "const server = http.createServer((req, res) => {",
      "  res.writeHead(200, { 'Content-Type': 'text/plain' });",
      "  res.end('Hello from Docker!\\n');",
      '});',
      '',
      'server.listen(3000, () => {',
      "  console.log('Server running at http://localhost:3000');",
      '});'
    ],
    'package.json': ['{', '  "name": "docker-project",', '  "version": "1.0.0",', '  "main": "app.js"', '}'],
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
  const content = files[file]
  if (!content) return { type: 'error', lines: [`cat: ${file}: No such file or directory`] }
  return { lines: content }
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
