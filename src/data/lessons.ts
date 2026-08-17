/**
 * 课程数据：参考《Docker 从入门到实践》（yeasy.gitbook.io/docker_practice）
 * 章节划分：走进 Docker / 镜像 / 容器 / Dockerfile / 数据卷 / 网络 / Compose / 实战
 *
 * 内容块类型：
 *  - text     段落文本（支持 HTML 标签与 <code> 行内代码）
 *  - code     代码块 { lang, code }
 *  - tip      提示 { title?, text }
 *  - warning  注意 { title?, text }
 *  - table    表格 { headers, rows }
 *  - list     列表 { items }
 *  - practice 练习区 { title, desc, commands }
 */

import type { Chapter, CourseStats, DockerEnv } from '@/types'

// 练习校验辅助函数
const hasRunAny = (cmds: string[]) => (env: DockerEnv) => cmds.some(cmd => env.history.some(h => h.trim().startsWith(cmd)))
const hasImage = (name: string) => (env: DockerEnv) => env.images.some(img => img.full.includes(name))
const hasContainerByName = (name: string) => (env: DockerEnv) => env.containers.some(c => c.name === name)
const hasContainerByImage = (name: string) => (env: DockerEnv) => env.containers.some(c => c.image.includes(name))
const hasRunningContainer = (name: string) => (env: DockerEnv) => env.containers.some(c => c.name === name && c.status === 'running')
const hasVolume = (name: string) => (env: DockerEnv) => env.volumes.some(v => v.name === name)
const hasNetwork = (name: string) => (env: DockerEnv) => env.networks.some(n => n.name === name)
const hasComposeProject = (name: string) => (env: DockerEnv) => env.containers.some(c => c.composeProject === name)

export const chapters: Chapter[] = [
  {
    id: 'intro',
    index: '01',
    title: '走进 Docker',
    icon: 'Ship',
    color: '#2496ED',
    minutes: 10,
    lessonsCount: 3,
    description: '认识 Docker 是什么、为什么需要它，以及容器与虚拟机的区别。',
    lessons: [
      {
        id: 'intro-1',
        title: '为什么需要 Docker',
        concept: '背景与价值',
        content: [
          { type: 'text', html: '在传统开发中，你经常听到这句话：<b>“在我电脑上明明可以运行啊！”</b>。这是因为你的程序依赖了特定版本的环境——比如 Node.js 18、Python 3.12、MySQL 8.0。换一台机器，环境不一样，程序就“水土不服”。' },
          { type: 'text', html: '<b>Docker 的解决方案</b>：把“程序 + 它需要的环境”一起打包成一个标准化的盒子（<code>镜像 Image</code>），这个盒子可以在任何装了 Docker 的机器上运行，结果完全一致。' },
          { type: 'list', items: [
            '环境一致性：开发、测试、生产环境完全一致，告别“在我电脑上能跑”',
            '快速交付：一条命令即可部署整个应用，不用手动安装各种依赖',
            '资源隔离：多个应用互不干扰，可以安全地运行在同一台服务器上',
            '轻量高效：容器共享操作系统内核，比虚拟机更省资源、启动更快'
          ] },
          { type: 'warning', title: '先理解两个核心概念', text: '<b>镜像（Image）</b>是只读的“打包好的文件”，相当于程序的“安装包”或“模板”；<b>容器（Container）</b>是镜像运行起来的实例，相当于“正在运行的进程”。后面我们会反复用到这两个词。' }
        ],
        terminal: {
          enabled: true,
          task: '体验一下环境。输入 docker --version 查看模拟环境中的 Docker 版本；输入 docker info 查看环境概况。',
          commands: ['docker --version', 'docker info']
        },
        practice: {
          title: '体验一下环境。输入 docker --version 查看模拟环境中的 Docker 版本；输入 docker info 查看环境概况。',
          desc: '请在右侧终端完成以下操作：体验一下环境。输入 docker --version 查看模拟环境中的 Docker 版本；输入 docker info 查看环境概况。',
          commands: ['docker --version', 'docker info'],
          check: hasRunAny(['docker --version', 'docker info']),
          successMsg: '练习完成！你已经掌握了本节的实操要点。',
          hints: ['第一步可以尝试输入：docker --version', '接着输入：docker info']
        },
        quiz: [
          { question: 'Docker 解决了传统开发中的哪个核心痛点？', options: ['程序运行速度慢', '环境不一致导致的“在我电脑上能跑”问题', '代码编写效率低', '网络速度慢'], answer: 1, explain: 'Docker 将程序与运行环境一起打包，保证在任何机器上运行结果一致。' },
          { question: '下列关于“镜像”和“容器”的关系，描述正确的是？', options: ['两者完全相同', '容器是镜像的只读副本', '镜像是模板，容器是镜像运行起来的实例', '镜像运行起来后容器就消失了'], answer: 2, explain: '镜像是只读的打包模板，容器是镜像的运行时实例。' }
        ]
      },
      {
        id: 'intro-2',
        title: '容器 vs 虚拟机',
        concept: '架构对比',
        content: [
          { type: 'text', html: '虚拟机（VM）和容器都能实现环境隔离，但底层机制完全不同：<b>虚拟机虚拟化硬件</b>，而<b>容器共享宿主机内核</b>，只做进程级隔离。' },
          { type: 'table', headers: ['对比项', '虚拟机', '容器'], rows: [
            ['隔离级别', '硬件级（完整操作系统）', '进程级（共享内核）'],
            ['启动速度', '分钟级', '秒级'],
            ['占用空间', 'GB 级', 'MB 级'],
            ['性能损耗', '较高', '几乎为零'],
            ['资源利用率', '低', '高'],
            ['典型代表', 'VMware、VirtualBox', 'Docker、containerd']
          ] },
          { type: 'tip', title: '类比理解', text: '虚拟机像“搬家”——每个租户住一栋独立的房子（完整系统）；容器像“住酒店”——大家共用大楼的电梯水电（内核），但各自有独立的房间（隔离空间）。' }
        ],
        terminal: {
          enabled: true,
          task: '试着查看 Docker 运行环境的内核与操作系统信息，感受“共享内核”的含义。',
          commands: ['docker info']
        },
        practice: {
          title: '试着查看 Docker 运行环境的内核与操作系统信息，感受“共享内核”的含义。',
          desc: '请在右侧终端完成以下操作：试着查看 Docker 运行环境的内核与操作系统信息，感受“共享内核”的含义。',
          commands: ['docker info'],
          check: hasRunAny(['docker info']),
          successMsg: '练习完成！你已经掌握了本节的实操要点。',
          hints: ['第一步可以尝试输入：docker info']
        },
        quiz: [
          { question: '容器相比虚拟机的主要优势是？', options: ['隔离更彻底', '启动更快、资源占用更小', '安全性更高', '不需要操作系统'], answer: 1, explain: '容器共享内核、进程级隔离，启动秒级、占用 MB 级，比虚拟机轻量得多。' },
          { question: '容器的隔离是哪种级别？', options: ['硬件级', '进程级', '网络级', '文件级'], answer: 1, explain: '容器与宿主机共享操作系统内核，做的是进程级隔离。' }
        ]
      },
      {
        id: 'intro-3',
        title: 'Docker 的架构与工作流程',
        concept: '基本原理',
        content: [
          { type: 'text', html: 'Docker 采用 <b>C/S（客户端/服务器）架构</b>：你敲的 <code>docker</code> 命令是客户端（Client），它把指令发送给后台的 <b>Docker 守护进程（Daemon）</b>，由 Daemon 真正负责拉取镜像、创建容器等操作。' },
          { type: 'text', html: '一个典型的 Docker 工作流分为四步：' },
          { type: 'list', items: [
            '<b>写</b>：编写 Dockerfile（描述应用的构建步骤）或直接指定镜像',
            '<b>建</b>：docker build 构建出镜像',
            '<b>拉/存</b>：镜像可 push 到仓库（如 Docker Hub）或从仓库 pull',
            '<b>跑</b>：docker run 运行镜像，产生容器'
          ] },
          { type: 'code', lang: 'bash', code: '# 核心命令一览\ndocker pull nginx      # 从仓库拉取镜像\ndocker images          # 查看本地镜像\ndocker run -d nginx    # 运行镜像创建容器\ndocker ps              # 查看运行中的容器' },
          { type: 'tip', text: '本教程内置了一个<b>模拟 Docker 环境</b>，你在页面右侧的终端里输入的命令都会被真实解析并返回模拟结果，可以放心大胆地尝试！' }
        ],
        terminal: {
          enabled: true,
          task: '感受完整的“拉取→查看→运行”流程：拉取 nginx 镜像并运行它。',
          commands: ['docker pull nginx', 'docker images', 'docker run -d --name my-nginx nginx', 'docker ps']
        },
        practice: {
          title: '感受完整的“拉取→查看→运行”流程：拉取 nginx 镜像并运行它。',
          desc: '请在右侧终端完成以下操作：感受完整的“拉取→查看→运行”流程：拉取 nginx 镜像并运行它。',
          commands: ['docker pull nginx', 'docker images', 'docker run -d --name my-nginx nginx', 'docker ps'],
          check: hasRunAny(['docker pull nginx', 'docker images', 'docker run -d --name my-nginx nginx', 'docker ps']),
          successMsg: '练习完成！你已经掌握了本节的实操要点。',
          hints: ['第一步可以尝试输入：docker pull nginx', '接着输入：docker images', '接着输入：docker run -d --name my-nginx nginx']
        },
        quiz: [
          { question: 'Docker 采用的是什么架构？', options: ['B/S 架构', 'C/S（客户端/服务器）架构', 'P2P 架构', '单机架构'], answer: 1, explain: 'docker 命令是客户端，Docker Daemon 是服务器端，负责实际执行。' },
          { question: '下面哪个命令用于“拉取镜像”？', options: ['docker run', 'docker pull', 'docker push', 'docker build'], answer: 1, explain: 'pull 从仓库拉取镜像，run 是运行镜像，build 是构建镜像，push 是推送镜像。' }
        ]
      }
    ]
  },
  {
    id: 'images',
    index: '02',
    title: '镜像入门',
    icon: 'Picture',
    color: '#FF8C42',
    minutes: 14,
    lessonsCount: 3,
    description: '学习镜像的查看、拉取、搜索与删除，理解镜像分层的原理。',
    lessons: [
      {
        id: 'images-1',
        title: '查看与搜索镜像',
        concept: 'images / search',
        content: [
          { type: 'text', html: '<b>镜像</b>是 Docker 世界的“程序安装包”。学会查看本地有哪些镜像、搜索仓库里有什么镜像，是第一步。' },
          { type: 'code', lang: 'bash', code: 'docker images        # 列出本地所有镜像\ndocker search nginx  # 在 Docker Hub 上搜索镜像\ndocker search --stars=1000 redis  # 按 star 数筛选' },
          { type: 'table', headers: ['字段', '含义'], rows: [
            ['REPOSITORY', '镜像名，形如 ubuntu / nginx'],
            ['TAG', '版本标签，如 latest、22.04'],
            ['IMAGE ID', '镜像唯一标识'],
            ['SIZE', '镜像占用空间']
          ] },
          { type: 'tip', text: '完整的镜像名格式是 <code>仓库名:标签</code>，如 <code>ubuntu:22.04</code>。省略标签时默认使用 <code>latest</code>。' }
        ],
        terminal: {
          enabled: true,
          task: '查看当前模拟环境中的镜像列表，并尝试搜索镜像。',
          commands: ['docker images', 'docker search nginx', 'docker search mysql']
        },
        practice: {
          title: '查看当前模拟环境中的镜像列表，并尝试搜索镜像。',
          desc: '请在右侧终端完成以下操作：查看当前模拟环境中的镜像列表，并尝试搜索镜像。',
          commands: ['docker images', 'docker search nginx', 'docker search mysql'],
          check: hasRunAny(['docker images', 'docker search nginx', 'docker search mysql']),
          successMsg: '练习完成！你已经掌握了本节的实操要点。',
          hints: ['第一步可以尝试输入：docker images', '接着输入：docker search nginx', '接着输入：docker search mysql']
        },
        quiz: [
          { question: '哪个命令可以查看本地已有的镜像？', options: ['docker ps', 'docker images', 'docker search', 'docker pull'], answer: 1, explain: 'docker images 列出本地镜像；ps 是容器，search 是搜索远程，pull 是拉取。' },
          { question: '省略标签时，Docker 默认拉取哪个标签？', options: ['stable', 'latest', 'newest', 'default'], answer: 1, explain: '省略 TAG 时默认使用 latest 标签。' }
        ]
      },
      {
        id: 'images-2',
        title: '拉取与删除镜像',
        concept: 'pull / rmi',
        content: [
          { type: 'text', html: '<b>docker pull</b> 从镜像仓库（默认 Docker Hub）下载镜像；<b>docker rmi</b> 删除本地镜像。<code>rmi</code> 是 “remove image” 的缩写。' },
          { type: 'code', lang: 'bash', code: 'docker pull alpine:3.19     # 拉取指定版本镜像\ndocker pull python          # 拉取最新版 python\n\ndocker rmi python           # 删除镜像\n# 注意：被容器使用的镜像无法直接删除' },
          { type: 'text', html: '拉取过程你会看到一层层 <code>Pull complete</code>，这正是<b>镜像分层</b>的体现——镜像由多个只读层叠加而成，相同层可以跨镜像复用，既节省空间又加速下载。' },
          { type: 'warning', title: '删除失败场景', text: '如果有容器基于该镜像创建（即使已停止），直接 rmi 会报 conflict 错误，需先删除容器或使用 -f 强制删除。' }
        ],
        terminal: {
          enabled: true,
          task: '拉取一个全新镜像，查看镜像列表，然后删除一个镜像观察分层与删除效果。',
          commands: ['docker pull alpine:3.19', 'docker pull busybox', 'docker images', 'docker rmi busybox']
        },
        practice: {
          title: '拉取一个全新镜像，查看镜像列表，然后删除一个镜像观察分层与删除效果。',
          desc: '请在右侧终端完成以下操作：拉取一个全新镜像，查看镜像列表，然后删除一个镜像观察分层与删除效果。',
          commands: ['docker pull alpine:3.19', 'docker pull busybox', 'docker images', 'docker rmi busybox'],
          check: hasRunAny(['docker pull alpine:3.19', 'docker pull busybox', 'docker images', 'docker rmi busybox']),
          successMsg: '练习完成！你已经掌握了本节的实操要点。',
          hints: ['第一步可以尝试输入：docker pull alpine:3.19', '接着输入：docker pull busybox', '接着输入：docker images']
        },
        quiz: [
          { question: '删除本地镜像使用哪个命令？', options: ['docker rm', 'docker rmi', 'docker del', 'docker remove'], answer: 1, explain: 'rmi = remove image，rm 是删除容器。' },
          { question: '镜像拉取时出现多个 Pull complete 是因为？', options: ['下载了多个镜像', '镜像由多层组成，逐层下载', '网络不稳定', '镜像损坏'], answer: 1, explain: '镜像由多个只读层构成，Pull complete 代表每一层下载完成。' }
        ]
      },
      {
        id: 'images-3',
        title: '镜像的命名与标签',
        concept: 'tag / 命名规范',
        content: [
          { type: 'text', html: '完整镜像名格式为 <code>仓库地址/仓库名:标签</code>，例如 <code>docker.io/library/nginx:latest</code>。省略仓库地址表示 Docker Hub 官方仓库。' },
          { type: 'code', lang: 'bash', code: 'docker tag nginx mynginx:v1   # 为镜像打新标签\ndocker images                  # 同一个镜像 ID 可出现多个标签\n\ndocker tag mynginx:v1 registry.example.com/apps/mynginx:v1  # 自定义仓库地址' },
          { type: 'tip', text: '<code>docker tag</code> 只是给镜像创建新的“引用名”，不会复制镜像数据。多个标签指向同一个镜像 ID。' },
          { type: 'text', html: '<b>版本选择建议</b>：生产环境不要依赖 <code>latest</code>（内容随时会变），应固定到具体版本如 <code>nginx:1.27-alpine</code>。alpine 后缀表示基于 Alpine Linux 的精简镜像，体积小、适合生产。' }
        ],
        terminal: {
          enabled: true,
          task: '为 nginx 镜像打一个自定义标签，再删除原标签，观察两个标签的关系。',
          commands: ['docker tag nginx mynginx:v1', 'docker images', 'docker rmi nginx:latest']
        },
        practice: {
          title: '为 nginx 镜像打一个自定义标签，再删除原标签，观察两个标签的关系。',
          desc: '请在右侧终端完成以下操作：为 nginx 镜像打一个自定义标签，再删除原标签，观察两个标签的关系。',
          commands: ['docker tag nginx mynginx:v1', 'docker images', 'docker rmi nginx:latest'],
          check: hasRunAny(['docker tag nginx mynginx:v1', 'docker images', 'docker rmi nginx:latest']),
          successMsg: '练习完成！你已经掌握了本节的实操要点。',
          hints: ['第一步可以尝试输入：docker tag nginx mynginx:v1', '接着输入：docker images', '接着输入：docker rmi nginx:latest']
        },
        quiz: [
          { question: 'docker tag nginx mynginx:v1 的作用是？', options: ['复制一份新的镜像', '为镜像创建新标签（引用）', '重命名镜像文件', '推送镜像到仓库'], answer: 1, explain: 'tag 只是新增引用名，镜像 ID 相同，不复制数据。' },
          { question: '生产环境更推荐使用哪种镜像标签？', options: ['latest', '固定具体版本如 1.27-alpine', '随便选', '不写标签'], answer: 1, explain: 'latest 会随仓库更新而变化，固定版本才能保证环境可复现。' }
        ]
      }
    ]
  },
  {
    id: 'containers',
    index: '03',
    title: '容器管理',
    icon: 'Cpu',
    color: '#00B96B',
    minutes: 18,
    lessonsCount: 4,
    description: '掌握容器的创建、查看、启停、删除与日志查看，理解前台与后台运行。',
    lessons: [
      {
        id: 'containers-1',
        title: '创建并运行第一个容器',
        concept: 'docker run',
        content: [
          { type: 'text', html: '<b>docker run</b> 是使用频率最高的命令：根据镜像创建并启动容器。最经典的入门命令是运行 <code>hello-world</code>。' },
          { type: 'code', lang: 'bash', code: 'docker run hello-world\n# 输出 "Hello from Docker!" 表示环境一切正常' },
          { type: 'text', html: '如果本地没有该镜像，<code>docker run</code> 会自动先执行 <code>pull</code>，再创建容器运行。整个过程对应：<b>检查本地镜像 → 拉取 → 创建容器 → 启动 → 执行入口命令</b>。' },
          { type: 'warning', text: 'hello-world 执行完就退出，因为它的任务是打印一段欢迎信息。容器会保持运行的前提是<b>有前台进程持续运行</b>（如 nginx、node 服务）。' }
        ],
        terminal: {
          enabled: true,
          task: '运行 hello-world 容器，然后看看发生了什么。',
          commands: ['docker run hello-world', 'docker ps -a']
        },
        practice: {
          title: '运行 hello-world 容器，然后看看发生了什么。',
          desc: '请在右侧终端完成以下操作：运行 hello-world 容器，然后看看发生了什么。',
          commands: ['docker run hello-world', 'docker ps -a'],
          check: hasRunAny(['docker run hello-world', 'docker ps -a']),
          successMsg: '练习完成！你已经掌握了本节的实操要点。',
          hints: ['第一步可以尝试输入：docker run hello-world', '接着输入：docker ps -a']
        },
        quiz: [
          { question: 'docker run 的执行流程正确的是？', options: ['直接运行，不做检查', '检查本地镜像→拉取→创建容器→启动', '先删除旧容器再运行', '只创建不启动'], answer: 1, explain: 'run 会检查镜像是否存在，不存在则自动 pull，然后创建并启动容器。' },
          { question: '容器保持运行的前提是？', options: ['必须指定 -d 参数', '有前台进程持续运行', '内存足够大', '挂载数据卷'], answer: 1, explain: '容器内前台进程退出，容器就停止。hello-world 打印完即退出。' }
        ]
      },
      {
        id: 'containers-2',
        title: '后台运行与端口映射',
        concept: '-d / -p / --name',
        content: [
          { type: 'text', html: '想让容器像服务器一样常驻后台，需要三个关键参数：<code>-d</code> 后台运行、<code>-p</code> 端口映射、<code>--name</code> 指定名称。' },
          { type: 'code', lang: 'bash', code: 'docker run -d --name web -p 8080:80 nginx\n# -d           后台运行（detach）\n# --name web   容器命名为 web\n# -p 8080:80   宿主机 8080 端口 -> 容器 80 端口\n\ndocker ps            # 查看运行中的容器\ndocker port web      # 查看端口映射关系' },
          { type: 'text', html: '为什么需要 <code>-p</code>？容器有自己独立的网络命名空间，宿主机默认访问不到容器内的端口。端口映射把宿主机端口“接到”容器端口上，这样浏览器访问 <code>http://localhost:8080</code> 就能看到 nginx 页面。' },
          { type: 'tip', text: '<code>-p 宿主机端口:容器端口</code>，两边的端口可以不同，如 <code>-p 3000:80</code> 表示访问宿主机 3000 端口时转发到容器 80 端口。' }
        ],
        terminal: {
          enabled: true,
          task: '后台运行一个 nginx 容器并映射端口，然后查看容器与端口状态。',
          commands: ['docker run -d --name web -p 8080:80 nginx', 'docker ps', 'docker port web']
        },
        practice: {
          title: '后台运行一个 nginx 容器并映射端口，然后查看容器与端口状态。',
          desc: '请在右侧终端完成以下操作：后台运行一个 nginx 容器并映射端口，然后查看容器与端口状态。',
          commands: ['docker run -d --name web -p 8080:80 nginx', 'docker ps', 'docker port web'],
          check: hasRunAny(['docker run -d --name web -p 8080:80 nginx', 'docker ps', 'docker port web']),
          successMsg: '练习完成！你已经掌握了本节的实操要点。',
          hints: ['第一步可以尝试输入：docker run -d --name web -p 8080:80 nginx', '接着输入：docker ps', '接着输入：docker port web']
        },
        quiz: [
          { question: 'docker run -d -p 8080:80 nginx 中，8080 指什么？', options: ['容器内部端口', '宿主机端口', '镜像端口', '网络端口'], answer: 1, explain: '-p 宿主端口:容器端口，8080 是宿主机上访问的端口。' },
          { question: '-d 参数的含义是？', options: ['调试模式', '后台运行', '删除容器', '守护进程模式'], answer: 1, explain: '-d / --detach 表示后台运行，终端不会阻塞。' }
        ]
      },
      {
        id: 'containers-3',
        title: '查看、启停与删除容器',
        concept: 'ps / start / stop / rm',
        content: [
          { type: 'text', html: '容器的生命周期管理：<code>docker ps</code> 查看、<code>start/stop/restart</code> 启停、<code>rm</code> 删除。' },
          { type: 'code', lang: 'bash', code: 'docker ps            # 只看运行中的容器\ndocker ps -a         # 查看所有容器（含已停止的）\n\ndocker stop web      # 停止容器\ndocker start web     # 重新启动\ndocker restart web   # 重启\n\ndocker rm web        # 删除容器（需先停止）\ndocker rm -f web     # 强制删除运行中的容器' },
          { type: 'table', headers: ['命令', '作用'], rows: [
            ['docker ps', '列出运行中的容器'],
            ['docker ps -a', '列出所有容器'],
            ['docker stop', '优雅停止容器（发 SIGTERM）'],
            ['docker kill', '强制杀死容器（发 SIGKILL）'],
            ['docker rm', '删除已停止的容器'],
            ['docker rm -f', '强制删除（含运行中的）']
          ] },
          { type: 'tip', text: 'stop 会给容器内主进程发送停止信号，让它“体面地退出”；kill 则是直接“拔电源”。一般优先用 stop。' }
        ],
        terminal: {
          enabled: true,
          task: '完整走一遍容器的生命周期：创建 → 查看 → 停止 → 查看 → 删除。',
          commands: ['docker run -d --name web -p 8080:80 nginx', 'docker ps', 'docker stop web', 'docker ps -a', 'docker rm web', 'docker ps -a']
        },
        practice: {
          title: '完整走一遍容器的生命周期：创建 → 查看 → 停止 → 查看 → 删除。',
          desc: '请在右侧终端完成以下操作：完整走一遍容器的生命周期：创建 → 查看 → 停止 → 查看 → 删除。',
          commands: ['docker run -d --name web -p 8080:80 nginx', 'docker ps', 'docker stop web', 'docker ps -a', 'docker rm web', 'docker ps -a'],
          check: hasRunAny(['docker run -d --name web -p 8080:80 nginx', 'docker ps', 'docker stop web', 'docker ps -a', 'docker rm web', 'docker ps -a']),
          successMsg: '练习完成！你已经掌握了本节的实操要点。',
          hints: ['第一步可以尝试输入：docker run -d --name web -p 8080:80 nginx', '接着输入：docker ps', '接着输入：docker stop web']
        },
        quiz: [
          { question: 'docker ps -a 与 docker ps 的区别是？', options: ['没有区别', '-a 显示所有容器包括已停止的', '-a 只显示已停止的', '-a 显示更多字段'], answer: 1, explain: 'ps 只显示运行中的，ps -a 显示全部。' },
          { question: '删除一个运行中的容器，正确的做法是？', options: ['直接 docker rm', 'docker rm -f 或先 stop 再 rm', 'docker kill 后自动删除', '无法删除'], answer: 1, explain: '运行中的容器需 -f 强制删除，或先 stop 再 rm。' }
        ]
      },
      {
        id: 'containers-4',
        title: '查看日志与进入容器',
        concept: 'logs / exec',
        content: [
          { type: 'text', html: '<b>docker logs</b> 查看容器输出日志（排查问题的第一手段）；<b>docker exec</b> 进入正在运行的容器内部执行命令（像 SSH 进一台机器）。' },
          { type: 'code', lang: 'bash', code: 'docker logs web             # 查看容器全部日志\ndocker logs -f web          # 实时跟踪日志（follow）\ndocker logs --tail 10 web   # 只看最后 10 行\n\ndocker exec web ls /etc/nginx      # 在容器内执行命令\ndocker exec -it web bash           # 进入容器交互终端\n# 退出容器终端：输入 exit 回车' },
          { type: 'text', html: '<code>exec -it</code> 中的 <code>-i</code> 保持标准输入打开（可以输入），<code>-t</code> 分配伪终端（界面更像真实终端）。两者通常组合使用。' },
          { type: 'warning', text: 'exec 只能对<b>运行中</b>的容器使用。容器已停止时需先 docker start。' }
        ],
        terminal: {
          enabled: true,
          task: '运行 nginx 容器后查看其日志，再进入容器执行命令。',
          commands: ['docker run -d --name web -p 8080:80 nginx', 'docker logs web', 'docker exec web ls /etc/nginx', 'docker exec -it web bash']
        },
        practice: {
          title: '运行 nginx 容器后查看其日志，再进入容器执行命令。',
          desc: '请在右侧终端完成以下操作：运行 nginx 容器后查看其日志，再进入容器执行命令。',
          commands: ['docker run -d --name web -p 8080:80 nginx', 'docker logs web', 'docker exec web ls /etc/nginx', 'docker exec -it web bash'],
          check: hasRunAny(['docker run -d --name web -p 8080:80 nginx', 'docker logs web', 'docker exec web ls /etc/nginx', 'docker exec -it web bash']),
          successMsg: '练习完成！你已经掌握了本节的实操要点。',
          hints: ['第一步可以尝试输入：docker run -d --name web -p 8080:80 nginx', '接着输入：docker logs web', '接着输入：docker exec web ls /etc/nginx']
        },
        quiz: [
          { question: '查看容器日志使用哪个命令？', options: ['docker log', 'docker logs', 'docker tail', 'docker output'], answer: 1, explain: 'docker logs 查看容器日志，-f 可实时跟踪。' },
          { question: 'docker exec -it web bash 的作用是？', options: ['重启容器', '进入运行中的容器执行交互命令', '删除容器', '查看容器配置'], answer: 1, explain: 'exec 在运行中的容器内执行命令，-it 进入交互式 shell。' }
        ]
      }
    ]
  },
  {
    id: 'dockerfile-basic',
    index: '04',
    title: 'Dockerfile 基础',
    icon: 'Document',
    color: '#7B61FF',
    minutes: 16,
    lessonsCount: 3,
    description: '学会编写 Dockerfile 并用 docker build 构建自己的镜像。',
    lessons: [
      {
        id: 'df-basic-1',
        title: '什么是 Dockerfile',
        concept: '构建原理',
        content: [
          { type: 'text', html: '<b>Dockerfile</b> 是一个文本文件，里面一条条指令描述了“如何一步步把应用打包成镜像”。它就是镜像的<b>配方/菜谱</b>。' },
          { type: 'text', html: '先看一下项目的经典结构（模拟环境里的 docker-project 目录）：' },
          { type: 'code', lang: 'bash', code: 'docker-project/\n├── Dockerfile      # 构建配方\n├── app.js          # 应用代码\n└── package.json    # 依赖清单' },
          { type: 'code', lang: 'bash', code: '# 使用 cat 查看模拟环境中的 Dockerfile\ncat Dockerfile' },
          { type: 'text', html: '构建命令：<code>docker build -t 镜像名:标签 .</code>，最后的 <code>.</code> 是<b>构建上下文</b>（把当前目录发给 Docker 引擎用于构建）。' }
        ],
        terminal: {
          enabled: true,
          task: '查看项目文件和 Dockerfile 内容，了解构建输入是什么。',
          commands: ['ls', 'cat Dockerfile', 'cat app.js']
        },
        practice: {
          title: '查看项目文件和 Dockerfile 内容，了解构建输入是什么。',
          desc: '请在右侧终端完成以下操作：查看项目文件和 Dockerfile 内容，了解构建输入是什么。',
          commands: ['ls', 'cat Dockerfile', 'cat app.js'],
          check: hasRunAny(['ls', 'cat Dockerfile', 'cat app.js']),
          successMsg: '练习完成！你已经掌握了本节的实操要点。',
          hints: ['第一步可以尝试输入：ls', '接着输入：cat Dockerfile', '接着输入：cat app.js']
        },
        quiz: [
          { question: 'Dockerfile 是什么？', options: ['一个容器', '描述镜像构建步骤的文本文件', '一个镜像', '一个配置文件库'], answer: 1, explain: 'Dockerfile 是构建镜像的指令文件，即“菜谱”。' },
          { question: 'docker build -t myapp . 最后的 "." 表示？', options: ['构建版本号', '构建上下文目录', '工作目录', '日志输出位置'], answer: 1, explain: '点号表示将当前目录作为构建上下文发送给 Docker。' }
        ]
      },
      {
        id: 'df-basic-2',
        title: '核心指令：FROM / RUN / CMD',
        concept: '第一条镜像',
        content: [
          { type: 'text', html: '最基础的三个指令：<code>FROM</code> 指定基础镜像（必须第一行）、<code>RUN</code> 在构建时执行命令、<code>CMD</code> 定义容器启动时运行的命令。' },
          { type: 'code', lang: 'bash', code: '# 基于 Ubuntu 的 Dockerfile\nFROM ubuntu:22.04\nRUN apt-get update && apt-get install -y curl\nCMD ["echo", "Hello Docker!"]\n\n# 构建并运行\n# docker build -t myubuntu .\n# docker run myubuntu' },
          { type: 'table', headers: ['指令', '执行时机', '作用'], rows: [
            ['FROM', '构建开始', '指定基础镜像，一切构建的起点'],
            ['RUN', '构建过程中', '执行命令并保存结果到镜像层'],
            ['CMD', '容器启动时', '指定默认启动命令（可被 run 后参数覆盖）']
          ] },
          { type: 'tip', text: '<code>CMD</code> 的推荐写法是 JSON 数组形式 <code>CMD ["可执行文件", "参数1"]</code>，它不会经过 shell 解析，更规范。' }
        ],
        terminal: {
          enabled: true,
          task: '使用环境中的 Dockerfile 构建一个镜像，然后运行它。',
          commands: ['docker build -t myapp .', 'docker images', 'docker run myapp']
        },
        practice: {
          title: '使用环境中的 Dockerfile 构建一个镜像，然后运行它。',
          desc: '请在右侧终端完成以下操作：使用环境中的 Dockerfile 构建一个镜像，然后运行它。',
          commands: ['docker build -t myapp .', 'docker images', 'docker run myapp'],
          check: hasRunAny(['docker build -t myapp .', 'docker images', 'docker run myapp']),
          successMsg: '练习完成！你已经掌握了本节的实操要点。',
          hints: ['第一步可以尝试输入：docker build -t myapp .', '接着输入：docker images', '接着输入：docker run myapp']
        },
        quiz: [
          { question: 'Dockerfile 中必须第一行出现的指令是？', options: ['RUN', 'CMD', 'FROM', 'COPY'], answer: 2, explain: 'FROM 指定基础镜像，必须放在第一行。' },
          { question: 'RUN 指令在什么时候执行？', options: ['容器启动时', '镜像构建时', 'docker push 时', '每次运行时'], answer: 1, explain: 'RUN 在 docker build 过程中执行，结果会固化到镜像层。' }
        ]
      },
      {
        id: 'df-basic-3',
        title: 'ENTRYPOINT 与 CMD 的区别',
        concept: '启动指令',
        content: [
          { type: 'text', html: '<code>ENTRYPOINT</code> 定义容器的主命令，<code>CMD</code> 提供默认参数。核心区别：<b>docker run 后面的参数能覆盖 CMD，但不能覆盖 ENTRYPOINT</b>。' },
          { type: 'code', lang: 'bash', code: '# 方式一：只用 CMD（可被覆盖）\nCMD ["nginx", "-g", "daemon off;"]\ndocker run img nginx -h   # 替换成 nginx -h\n\n# 方式二：ENTRYPOINT + CMD（参数拼接，推荐）\nENTRYPOINT ["nginx"]\nCMD ["-g", "daemon off;"]\ndocker run img -h         # 变成 nginx -h' },
          { type: 'table', headers: ['指令', '可否被 run 参数覆盖', '典型用法'], rows: [
            ['CMD', '可以', '提供默认命令/参数'],
            ['ENTRYPOINT', '不可以', '固定容器主进程'],
            ['ENTRYPOINT + CMD', 'CMD 部分可覆盖', '主命令固定，参数可调整']
          ] },
          { type: 'warning', text: '一个 Dockerfile 中 ENTRYPOINT 或 CMD 出现多次时，只有最后一个生效。' }
        ],
        terminal: {
          enabled: true,
          task: '构建一个使用 ENTRYPOINT 的镜像并观察行为，然后尝试用 run 参数覆盖。',
          commands: ['cat Dockerfile', 'docker build -t myapp .', 'docker run myapp', 'docker run myapp echo 123']
        },
        practice: {
          title: '构建一个使用 ENTRYPOINT 的镜像并观察行为，然后尝试用 run 参数覆盖。',
          desc: '请在右侧终端完成以下操作：构建一个使用 ENTRYPOINT 的镜像并观察行为，然后尝试用 run 参数覆盖。',
          commands: ['cat Dockerfile', 'docker build -t myapp .', 'docker run myapp', 'docker run myapp echo 123'],
          check: hasRunAny(['cat Dockerfile', 'docker build -t myapp .', 'docker run myapp', 'docker run myapp echo 123']),
          successMsg: '练习完成！你已经掌握了本节的实操要点。',
          hints: ['第一步可以尝试输入：cat Dockerfile', '接着输入：docker build -t myapp .', '接着输入：docker run myapp']
        },
        quiz: [
          { question: 'docker run myimage 后接的参数，可以覆盖哪个指令？', options: ['ENTRYPOINT', 'CMD', 'FROM', 'RUN'], answer: 1, explain: 'run 后参数会覆盖 CMD（整体替换），ENTRYPOINT 固定不可覆盖。' },
          { question: '更推荐哪种组合方式？', options: ['只用 CMD', 'ENTRYPOINT 固定主命令 + CMD 提供参数', '只用 ENTRYPOINT', '都不用'], answer: 1, explain: 'ENTRYPOINT 固定主进程、CMD 给默认参数，既稳定又灵活，是官方推荐用法。' }
        ]
      }
    ]
  },
  {
    id: 'dockerfile-adv',
    index: '05',
    title: 'Dockerfile 进阶',
    icon: 'Tools',
    color: '#E65C5C',
    minutes: 16,
    lessonsCount: 3,
    description: '掌握 COPY、ENV、EXPOSE、WORKDIR 等指令与多阶段构建、构建优化技巧。',
    lessons: [
      {
        id: 'df-adv-1',
        title: 'COPY / ADD / WORKDIR / EXPOSE',
        concept: '常用指令',
        content: [
          { type: 'code', lang: 'bash', code: 'FROM node:20-alpine\n\nWORKDIR /app                # 设置工作目录（后续命令都在此目录）\nCOPY package*.json ./       # 复制文件到镜像\nCOPY . .                    # 复制整个上下文\n\nEXPOSE 3000                 # 声明容器监听端口（文档性说明）\nCMD ["node", "app.js"]' },
          { type: 'table', headers: ['指令', '作用', '注意'], rows: [
            ['COPY', '复制文件进镜像', '推荐，语义清晰'],
            ['ADD', '复制文件/自动解压', '带自动解压 tar、支持 URL，用不到尽量用 COPY'],
            ['WORKDIR', '设置工作目录', '目录不存在会自动创建'],
            ['EXPOSE', '声明端口', '仅文档作用，真正映射靠 -p'],
            ['ENV', '设置环境变量', '容器运行时可用']
          ] },
          { type: 'tip', text: '注意 <code>EXPOSE</code> 只是“声明”，并不会自动让外部访问到。端口映射仍需要运行时的 <code>-p</code> 参数。' }
        ],
        terminal: {
          enabled: true,
          task: '查看带完整指令的 Dockerfile，构建并运行，然后通过 -p 映射端口。',
          commands: ['cat Dockerfile', 'docker build -t myapp .', 'docker run -d -p 3000:3000 --name app myapp', 'docker ps']
        },
        practice: {
          title: '查看带完整指令的 Dockerfile，构建并运行，然后通过 -p 映射端口。',
          desc: '请在右侧终端完成以下操作：查看带完整指令的 Dockerfile，构建并运行，然后通过 -p 映射端口。',
          commands: ['cat Dockerfile', 'docker build -t myapp .', 'docker run -d -p 3000:3000 --name app myapp', 'docker ps'],
          check: hasRunAny(['cat Dockerfile', 'docker build -t myapp .', 'docker run -d -p 3000:3000 --name app myapp', 'docker ps']),
          successMsg: '练习完成！你已经掌握了本节的实操要点。',
          hints: ['第一步可以尝试输入：cat Dockerfile', '接着输入：docker build -t myapp .', '接着输入：docker run -d -p 3000:3000 --name app myapp']
        },
        quiz: [
          { question: 'EXPOSE 3000 的作用是？', options: ['真正对外暴露端口', '声明容器监听端口，供文档/联动使用', '映射宿主端口', '开启防火墙'], answer: 1, explain: 'EXPOSE 仅作声明，端口真正映射靠运行时的 -p。' },
          { question: 'ENV 指令的作用是？', options: ['定义环境变量', '设置环境', '加密配置', '连接数据库'], answer: 0, explain: 'ENV 用于在镜像/容器中设置环境变量。' }
        ]
      },
      {
        id: 'df-adv-2',
        title: '构建优化：缓存与 .dockerignore',
        concept: '构建效率',
        content: [
          { type: 'text', html: 'Docker 构建有<b>分层缓存</b>：某层指令没变化时，直接复用缓存，构建飞快。要让缓存高效命中，应把<b>不易变化的步骤放前面</b>。' },
          { type: 'code', lang: 'bash', code: '# 好的顺序：先复制依赖清单（很少变），再安装依赖（重），最后复制代码（经常变）\nCOPY package*.json ./\nRUN npm install          # 只要 package.json 没变，这层就命中缓存\nCOPY . .                 # 代码改了只重建这层\n\n# .dockerignore 文件：排除不需要进镜像的文件\nnode_modules\n.git\n*.log\ndist' },
          { type: 'warning', text: '如果把 <code>COPY . .</code> 放在 <code>RUN npm install</code> 之前，那么任何代码改动都会使依赖安装层缓存失效，每次都要重装依赖——这是新手最常见的性能坑。' },
          { type: 'tip', text: '<code>.dockerignore</code> 的作用类似 <code>.gitignore</code>：告诉 Docker 构建时忽略哪些文件，既减小上下文体积，也避免把 <code>node_modules</code>、敏感文件打包进镜像。' }
        ],
        terminal: {
          enabled: true,
          task: '连续构建两次同一个镜像，体会分层缓存带来的速度差异。',
          commands: ['docker build -t myapp .', 'docker build -t myapp .']
        },
        practice: {
          title: '连续构建两次同一个镜像，体会分层缓存带来的速度差异。',
          desc: '请在右侧终端完成以下操作：连续构建两次同一个镜像，体会分层缓存带来的速度差异。',
          commands: ['docker build -t myapp .', 'docker build -t myapp .'],
          check: hasRunAny(['docker build -t myapp .', 'docker build -t myapp .']),
          successMsg: '练习完成！你已经掌握了本节的实操要点。',
          hints: ['第一步可以尝试输入：docker build -t myapp .', '接着输入：docker build -t myapp .']
        },
        quiz: [
          { question: '下列哪种 Dockerfile 指令顺序最能利用构建缓存？', options: ['COPY . . 放在最前面', '先 COPY 依赖清单再安装依赖，最后 COPY 代码', '所有指令随意排列', '不使用缓存'], answer: 1, explain: '变化频率低的在前、变化频繁的在后，缓存命中率最高。' },
          { question: '.dockerignore 文件的作用是？', options: ['忽略 git 提交', '排除构建上下文中不需要的文件', '加速 docker pull', '跳过安全检查'], answer: 1, explain: '类似 .gitignore，指定构建时忽略的文件。' }
        ]
      },
      {
        id: 'df-adv-3',
        title: '多阶段构建',
        concept: '镜像瘦身',
        content: [
          { type: 'text', html: '<b>多阶段构建（multi-stage build）</b>：一个 Dockerfile 里用多个 <code>FROM</code>，前一个阶段负责“编译”，后一个阶段只拷贝编译产物，最终镜像不包含编译器等多余内容，体积大幅减小。' },
          { type: 'code', lang: 'bash', code: '# Go 应用多阶段构建示例\n# ---- 阶段 1：编译 ----\nFROM golang:1.22 AS builder\nWORKDIR /app\nCOPY . .\nRUN CGO_ENABLED=0 go build -o myapp .\n\n# ---- 阶段 2：运行（仅需可执行文件）----\nFROM alpine:3.19\nWORKDIR /app\nCOPY --from=builder /app/myapp .   # 从 builder 阶段拷贝\nEXPOSE 8080\nCMD ["./myapp"]' },
          { type: 'text', html: '最终镜像只包含 <code>alpine + myapp</code>，可能只有十几 MB；而如果不做多阶段构建，golang 镜像本身就有几百 MB。这是生产环境镜像瘦身的核心手段。' }
        ],
        terminal: {
          enabled: true,
          task: '尝试用多阶段构建的写法为项目重新构建镜像。',
          commands: ['docker build -t myapp:multistage .', 'docker images']
        },
        practice: {
          title: '尝试用多阶段构建的写法为项目重新构建镜像。',
          desc: '请在右侧终端完成以下操作：尝试用多阶段构建的写法为项目重新构建镜像。',
          commands: ['docker build -t myapp:multistage .', 'docker images'],
          check: hasRunAny(['docker build -t myapp:multistage .', 'docker images']),
          successMsg: '练习完成！你已经掌握了本节的实操要点。',
          hints: ['第一步可以尝试输入：docker build -t myapp:multistage .', '接着输入：docker images']
        },
        quiz: [
          { question: '多阶段构建的最大好处是？', options: ['构建更快', '最终镜像体积更小', '不需要基础镜像', '支持多个应用'], answer: 1, explain: '编译工具链只存在于中间阶段，最终镜像只含运行所需文件。' },
          { question: '多阶段构建用哪个指令把前阶段产物拷入后阶段？', options: ['COPY --from=builder /path /dest', 'RUN cp', 'ADD 全部', 'FROM 引用'], answer: 0, explain: 'COPY --from=阶段名 可从指定构建阶段拷贝文件。' }
        ]
      }
    ]
  },
  {
    id: 'volumes',
    index: '06',
    title: '数据卷与持久化',
    icon: 'FolderOpened',
    color: '#F7A600',
    minutes: 14,
    lessonsCount: 3,
    description: '理解容器数据为什么“会丢”，学会用 volume 与 bind mount 持久化数据。',
    lessons: [
      {
        id: 'volumes-1',
        title: '为什么数据会丢失',
        concept: '容器文件系统',
        content: [
          { type: 'text', html: '容器是<b>临时</b>的：它的文件系统基于镜像层 + 可写层。当你 <code>docker rm</code> 删除容器时，可写层里的所有数据（数据库记录、上传文件、日志）会<b>一并删除</b>。' },
          { type: 'list', items: [
            '容器被删除 → 容器内写的数据全部丢失',
            '容器重建 → 一切从镜像初始状态重新开始',
            '多个容器之间默认无法共享文件'
          ] },
          { type: 'text', html: '解决办法就是<b>数据卷（Volume）</b>：把数据存放在容器之外、由 Docker 管理的独立区域，容器删除后数据依然存在。' },
          { type: 'warning', text: '只要删除容器（docker rm），容器内所有非卷数据都会丢失，与镜像是否还在无关。理解这一点是学习持久化的关键。' }
        ],
        terminal: {
          enabled: true,
          task: '创建一个容器并向里面写入数据（模拟），然后删除容器体会数据丢失。',
          commands: ['docker run -d --name tmp alpine:3.19 sleep 100', 'docker exec tmp echo "hello" > /tmp/data.txt', 'docker rm -f tmp', 'docker ps -a']
        },
        practice: {
          title: '创建一个容器并向里面写入数据（模拟），然后删除容器体会数据丢失。',
          desc: '请在右侧终端完成以下操作：创建一个容器并向里面写入数据（模拟），然后删除容器体会数据丢失。',
          commands: ['docker run -d --name tmp alpine:3.19 sleep 100', 'docker exec tmp echo hello > /tmp/data.txt', 'docker rm -f tmp', 'docker ps -a'],
          check: hasRunAny(['docker run -d --name tmp alpine:3.19 sleep 100', 'docker exec tmp echo hello > /tmp/data.txt', 'docker rm -f tmp', 'docker ps -a']),
          successMsg: '练习完成！你已经掌握了本节的实操要点。',
          hints: ['第一步可以尝试输入：docker run -d --name tmp alpine:3.19 sleep 100', '接着输入：docker exec tmp echo hello > /tmp/data.txt', '接着输入：docker rm -f tmp']
        },
        quiz: [
          { question: '删除容器后，容器内写入的数据会？', options: ['保留在镜像中', '一并丢失', '自动备份', '移到宿主机'], answer: 1, explain: '容器可写层随容器删除而消失，所以需要数据卷持久化。' },
          { question: '容器之间默认能否共享文件？', options: ['能', '不能', '同一网络下能', '取决于镜像'], answer: 1, explain: '默认容器文件系统相互隔离，需通过卷挂载才能共享。' }
        ]
      },
      {
        id: 'volumes-2',
        title: '使用数据卷 Volume',
        concept: 'docker volume',
        content: [
          { type: 'code', lang: 'bash', code: '# 1. 创建数据卷\ndocker volume create data-vol\ndocker volume ls\n\n# 2. 将卷挂载到容器目录（-v 卷名:容器内路径）\ndocker run -d --name db -v data-vol:/var/lib/mysql mysql:8.0\n\n# 3. 数据卷生命周期独立于容器\n# 删除容器：\ndocker rm -f db\n# 数据仍在，可挂载到新容器继续使用：\ndocker run -d --name db2 -v data-vol:/var/lib/mysql mysql:8.0' },
          { type: 'table', headers: ['方式', '写法', '数据位置', '适用场景'], rows: [
            ['命名卷', '-v data-vol:/data', 'Docker 管理目录', '数据库等关键数据（推荐）'],
            ['匿名卷', '-v /data', 'Docker 管理目录（随机名）', '临时数据'],
            ['绑定挂载', '-v /宿主机路径:/data', '宿主机任意目录', '开发调试、配置热更新']
          ] },
          { type: 'tip', text: '最推荐的持久化方式：<b>命名卷</b>。数据由 Docker 统一管理，备份、迁移都很方便。' }
        ],
        terminal: {
          enabled: true,
          task: '创建数据卷，用带卷的容器写入数据，删除容器后挂载同一卷重新启动，验证数据持久化。',
          commands: ['docker volume create data-vol', 'docker volume ls', 'docker run -d --name db -v data-vol:/var/lib/mysql mysql:8.0', 'docker rm -f db', 'docker run -d --name db2 -v data-vol:/var/lib/mysql mysql:8.0', 'docker ps']
        },
        practice: {
          title: '创建数据卷，用带卷的容器写入数据，删除容器后挂载同一卷重新启动，验证数据持久化。',
          desc: '请在右侧终端完成以下操作：创建数据卷，用带卷的容器写入数据，删除容器后挂载同一卷重新启动，验证数据持久化。',
          commands: ['docker volume create data-vol', 'docker volume ls', 'docker run -d --name db -v data-vol:/var/lib/mysql mysql:8.0', 'docker rm -f db', 'docker run -d --name db2 -v data-vol:/var/lib/mysql mysql:8.0', 'docker ps'],
          check: hasRunAny(['docker volume create data-vol', 'docker volume ls', 'docker run -d --name db -v data-vol:/var/lib/mysql mysql:8.0', 'docker rm -f db', 'docker run -d --name db2 -v data-vol:/var/lib/mysql mysql:8.0', 'docker ps']),
          successMsg: '练习完成！你已经掌握了本节的实操要点。',
          hints: ['第一步可以尝试输入：docker volume create data-vol', '接着输入：docker volume ls', '接着输入：docker run -d --name db -v data-vol:/var/lib/mysql mysql:8.0']
        },
        quiz: [
          { question: '创建数据卷的命令是？', options: ['docker create volume', 'docker volume create', 'docker volume new', 'docker mkvol'], answer: 1, explain: 'docker volume create <名字> 创建命名卷。' },
          { question: '-v data-vol:/var/lib/mysql 的含义是？', options: ['把容器目录挂到宿主机', '把名为 data-vol 的卷挂载到容器 /var/lib/mysql', '复制目录', '设置环境变量'], answer: 1, explain: '-v 卷名:容器内路径，将卷挂到容器指定目录。' }
        ]
      },
      {
        id: 'volumes-3',
        title: '绑定挂载 Bind Mount',
        concept: '宿主机目录',
        content: [
          { type: 'text', html: '<b>绑定挂载</b>直接把宿主机目录映射进容器。开发时最常用：代码改动即时生效，无需重建镜像；也可以用宿主机配置文件覆盖容器配置。' },
          { type: 'code', lang: 'bash', code: '# 把当前代码目录挂载到容器 /app\ndocker run -d -p 3000:3000 \\\n  -v /home/learner/docker-project:/app \\\n  --name dev myapp\n\n# 挂载单个配置文件\ndocker run -d -v /home/learner/nginx.conf:/etc/nginx/nginx.conf:ro nginx\n# :ro 表示只读挂载，容器内无法修改宿主机文件' },
          { type: 'table', headers: ['对比', '命名卷', '绑定挂载'], rows: [
            ['管理方式', 'Docker 管理', '用户指定宿主机路径'],
            ['适合场景', '生产持久化数据', '开发调试、配置文件'],
            ['备份迁移', '方便', '需自行处理'],
            ['跨主机', '卷插件可扩展', '不支持']
          ] },
          { type: 'warning', text: '绑定挂载时，如果宿主机目录为空，可能会“覆盖”容器内同名目录的内容（镜像里原本的文件被隐藏）。生产环境用命名卷更稳妥。' }
        ],
        terminal: {
          enabled: true,
          task: '用绑定挂载方式运行一个开发容器，查看挂载情况。',
          commands: ['docker run -d --name dev -v /home/learner/docker-project:/app myapp', 'docker ps', 'docker inspect dev']
        },
        practice: {
          title: '用绑定挂载方式运行一个开发容器，查看挂载情况。',
          desc: '请在右侧终端完成以下操作：用绑定挂载方式运行一个开发容器，查看挂载情况。',
          commands: ['docker run -d --name dev -v /home/learner/docker-project:/app myapp', 'docker ps', 'docker inspect dev'],
          check: hasRunAny(['docker run -d --name dev -v /home/learner/docker-project:/app myapp', 'docker ps', 'docker inspect dev']),
          successMsg: '练习完成！你已经掌握了本节的实操要点。',
          hints: ['第一步可以尝试输入：docker run -d --name dev -v /home/learner/docker-project:/app myapp', '接着输入：docker ps', '接着输入：docker inspect dev']
        },
        quiz: [
          { question: '绑定挂载与命名卷的主要区别是？', options: ['没有区别', '绑定挂载直接映射宿主机任意目录，命名卷由 Docker 管理', '绑定挂载更快', '命名卷只能用于数据库'], answer: 1, explain: '绑定挂载指定宿主机路径，适合开发调试；命名卷由 Docker 管理，适合生产数据。' },
          { question: '-v /path:/data:ro 中的 ro 表示？', options: ['运行模式', '只读挂载', '递归挂载', '远程挂载'], answer: 1, explain: ':ro 表示 read-only 只读，容器内无法修改。' }
        ]
      }
    ]
  },
  {
    id: 'networks',
    index: '07',
    title: '网络配置',
    icon: 'Connection',
    color: '#0FB5BA',
    minutes: 16,
    lessonsCount: 3,
    description: '理解 Docker 网络模型，学会容器互联与自定义网络，掌握端口映射。',
    lessons: [
      {
        id: 'networks-1',
        title: 'Docker 网络模型',
        concept: 'bridge / host / none',
        content: [
          { type: 'text', html: 'Docker 默认提供三种网络：<code>bridge</code>（默认，容器间通过虚拟网桥通信）、<code>host</code>（容器直接使用宿主机网络）、<code>none</code>（无网络）。' },
          { type: 'code', lang: 'bash', code: 'docker network ls\n# NETWORK ID     NAME      DRIVER    SCOPE\n# ...            bridge    bridge    local\n# ...            host      host      local\n# ...            none      null      local' },
          { type: 'table', headers: ['网络', '特点', '适用'], rows: [
            ['bridge', '默认，容器有自己的 IP，通过网桥互访，可做端口映射', '大多数单机应用'],
            ['host', '容器直接占用宿主机端口，性能最好，无独立 IP', '追求性能/极简部署'],
            ['none', '无网络，完全隔离', '安全敏感、无需网络的任务']
          ] },
          { type: 'tip', text: '默认 bridge 网络下，容器之间可以互通，但只能通过 <b>IP 地址</b>访问——IP 会变，所以生产上更推荐用<b>自定义网络</b>（支持容器名直接访问）。' }
        ],
        terminal: {
          enabled: true,
          task: '查看当前网络的三种默认类型，再创建一个自定义网络。',
          commands: ['docker network ls', 'docker network create my-net', 'docker network ls']
        },
        practice: {
          title: '查看当前网络的三种默认类型，再创建一个自定义网络。',
          desc: '请在右侧终端完成以下操作：查看当前网络的三种默认类型，再创建一个自定义网络。',
          commands: ['docker network ls', 'docker network create my-net', 'docker network ls'],
          check: hasRunAny(['docker network ls', 'docker network create my-net', 'docker network ls']),
          successMsg: '练习完成！你已经掌握了本节的实操要点。',
          hints: ['第一步可以尝试输入：docker network ls', '接着输入：docker network create my-net', '接着输入：docker network ls']
        },
        quiz: [
          { question: 'Docker 默认网络是？', options: ['host', 'bridge', 'none', 'overlay'], answer: 1, explain: '默认使用 bridge 网络，容器通过网桥通信。' },
          { question: 'host 网络模式下，容器？', options: ['有独立 IP', '直接使用宿主机网络栈', '无法联网', '只能内网通信'], answer: 1, explain: 'host 模式共享宿主机网络，无独立 IP，直接占用宿主机端口。' }
        ]
      },
      {
        id: 'networks-2',
        title: '容器互联与自定义网络',
        concept: '容器通信',
        content: [
          { type: 'text', html: '业务上最常用的做法：<b>创建自定义网络，把相关容器加入同一网络，容器之间用“容器名”互相访问</b>。Docker 内置 DNS 会解析容器名。' },
          { type: 'code', lang: 'bash', code: 'docker network create app-net\n\ndocker run -d --name web --network app-net nginx\ndocker run -d --name db --network app-net mysql:8.0\n\n# 在 web 容器内可以直接访问 db 名字（Docker DNS 解析）\ndocker exec web ping db\n# 注意：不同网络、或默认 bridge 下不能用容器名，只能用 IP' },
          { type: 'list', items: [
            '同一自定义网络内：容器名 = 主机名，可互相访问',
            '默认 bridge 网络：只能通过 IP 访问，容器重建后 IP 会变',
            '不同网络之间默认隔离，不能互通'
          ] },
          { type: 'warning', text: '容器互联推荐总是使用自定义网络。默认 bridge 不支持容器名解析，会带来“IP 变了服务就挂”的隐患。' }
        ],
        terminal: {
          enabled: true,
          task: '创建自定义网络，运行两个容器加入该网络，并测试容器间联通性。',
          commands: ['docker network create app-net', 'docker run -d --name web --network app-net nginx', 'docker run -d --name db --network app-net mysql:8.0', 'docker network inspect app-net', 'docker exec web ping db']
        },
        practice: {
          title: '创建自定义网络，运行两个容器加入该网络，并测试容器间联通性。',
          desc: '请在右侧终端完成以下操作：创建自定义网络，运行两个容器加入该网络，并测试容器间联通性。',
          commands: ['docker network create app-net', 'docker run -d --name web --network app-net nginx', 'docker run -d --name db --network app-net mysql:8.0', 'docker network inspect app-net', 'docker exec web ping db'],
          check: hasRunAny(['docker network create app-net', 'docker run -d --name web --network app-net nginx', 'docker run -d --name db --network app-net mysql:8.0', 'docker network inspect app-net', 'docker exec web ping db']),
          successMsg: '练习完成！你已经掌握了本节的实操要点。',
          hints: ['第一步可以尝试输入：docker network create app-net', '接着输入：docker run -d --name web --network app-net nginx', '接着输入：docker run -d --name db --network app-net mysql:8.0']
        },
        quiz: [
          { question: '在自定义网络中，容器之间如何互相访问？', options: ['只能用 IP', '用容器名即可（Docker DNS 解析）', '需要设置 hosts', '无法互相访问'], answer: 1, explain: '自定义网络内置 DNS，容器名可解析为对应 IP。' },
          { question: '默认 bridge 网络不支持容器名解析，这意味着？', options: ['容器不能通信', '只能靠 IP 访问，IP 变化会导致连接失败', '必须用 host 网络', '需要 NAT 配置'], answer: 1, explain: '默认 bridge 下容器通过 IP 通信，容器重建 IP 变化会破坏连接。' }
        ]
      },
      {
        id: 'networks-3',
        title: '端口映射实战',
        concept: '发布端口',
        content: [
          { type: 'text', html: '端口映射是“对外暴露服务”的手段。前面学过 <code>-p 宿主机端口:容器端口</code>，这里再补充几种常用写法。' },
          { type: 'code', lang: 'bash', code: '# 常用端口映射写法\n-p 8080:80            # 指定宿主机端口 -> 容器端口\n-p 80:80 -p 443:443   # 同时映射多个端口\n-P                    # 随机映射容器暴露的所有端口（EXPOSE 声明过的）\n\n# 查看映射关系\ndocker port web\n# 80/tcp -> 0.0.0.0:8080' },
          { type: 'text', html: '端口冲突时 Docker 会直接报错 <code>port is already allocated</code>。解决办法：换端口、停止占用端口的容器，或让 Docker 自动分配（<code>-P</code> 或 <code>-p 80</code> 省略宿主端口）。' },
          { type: 'tip', text: '开发时也可以只写容器端口 <code>-p 3000</code>，让 Docker 随机分配宿主机端口，然后用 docker port 查看实际端口。' }
        ],
        terminal: {
          enabled: true,
          task: '尝试多种端口映射写法，并处理端口冲突的场景。',
          commands: ['docker run -d --name web1 -p 8080:80 nginx', 'docker run -d --name web2 -p 8081:80 nginx', 'docker run -d --name web3 -P nginx', 'docker port web3']
        },
        practice: {
          title: '尝试多种端口映射写法，并处理端口冲突的场景。',
          desc: '请在右侧终端完成以下操作：尝试多种端口映射写法，并处理端口冲突的场景。',
          commands: ['docker run -d --name web1 -p 8080:80 nginx', 'docker run -d --name web2 -p 8081:80 nginx', 'docker run -d --name web3 -P nginx', 'docker port web3'],
          check: hasRunAny(['docker run -d --name web1 -p 8080:80 nginx', 'docker run -d --name web2 -p 8081:80 nginx', 'docker run -d --name web3 -P nginx', 'docker port web3']),
          successMsg: '练习完成！你已经掌握了本节的实操要点。',
          hints: ['第一步可以尝试输入：docker run -d --name web1 -p 8080:80 nginx', '接着输入：docker run -d --name web2 -p 8081:80 nginx', '接着输入：docker run -d --name web3 -P nginx']
        },
        quiz: [
          { question: '端口被占用时会怎样？', options: ['自动换端口', '报错 port is already allocated', '覆盖旧容器', '忽略该映射'], answer: 1, explain: 'Docker 会拒绝启动并报端口已被分配的错误。' },
          { question: '-P 参数（大写）的含义是？', options: ['发布到宿主机随机端口', '使用默认端口', '禁止发布端口', '发布到公网'], answer: 0, explain: '大写 -P 将容器 EXPOSE 的端口随机映射到宿主机端口。' }
        ]
      }
    ]
  },
  {
    id: 'compose',
    index: '08',
    title: 'Docker Compose',
    icon: 'Files',
    color: '#9C36B5',
    minutes: 16,
    lessonsCount: 3,
    description: '用一份 YAML 文件编排多容器应用，一键启动整套服务。',
    lessons: [
      {
        id: 'compose-1',
        title: '为什么需要 Compose',
        concept: '多容器编排',
        content: [
          { type: 'text', html: '真实应用往往由多个容器组成：前端 + 后端 + 数据库 + 缓存。如果每个都用 docker run 手动启动，命令又长又容易出错，还难以管理依赖关系。' },
          { type: 'text', html: '<b>Docker Compose</b> 通过一份 <code>docker-compose.yml</code> 文件描述整个应用：有哪些服务、用什么镜像、映射什么端口、挂载什么卷、谁依赖谁。然后一条命令搞定全部。' },
          { type: 'code', lang: 'bash', code: '# 对比：手动启动三个容器 vs Compose\n\n# 手动方式（繁琐且无统一管理）\ndocker run -d --name web -p 8080:3000 web-image\ndocker run -d --name db -v db_data:/var/lib/mysql mysql:8.0\ndocker run -d --name cache redis\n\n# Compose 方式（一条命令）\ndocker compose up -d' },
          { type: 'tip', text: 'Compose 文件中的每个“服务（service）”就对应一个容器。Compose 会自动创建专属网络，服务间用服务名互相访问。' }
        ],
        terminal: {
          enabled: true,
          task: '查看模拟环境中的 docker-compose.yml 文件，了解编排结构。',
          commands: ['cat docker-compose.yml', 'docker compose config']
        },
        practice: {
          title: '查看模拟环境中的 docker-compose.yml 文件，了解编排结构。',
          desc: '请在右侧终端完成以下操作：查看模拟环境中的 docker-compose.yml 文件，了解编排结构。',
          commands: ['cat docker-compose.yml', 'docker compose config'],
          check: hasRunAny(['cat docker-compose.yml', 'docker compose config']),
          successMsg: '练习完成！你已经掌握了本节的实操要点。',
          hints: ['第一步可以尝试输入：cat docker-compose.yml', '接着输入：docker compose config']
        },
        quiz: [
          { question: 'Docker Compose 主要用于？', options: ['管理镜像', '编排多个容器的启动与依赖', '加速构建', '远程部署'], answer: 1, explain: 'Compose 用 YAML 描述并管理多容器应用。' },
          { question: 'Compose 文件中的 service（服务）对应什么？', options: ['镜像', '容器', '网络', '卷'], answer: 1, explain: '一个 service 在运行时就是一个（或一组）容器。' }
        ]
      },
      {
        id: 'compose-2',
        title: '编写 docker-compose.yml',
        concept: 'YAML 结构',
        content: [
          { type: 'code', lang: 'yaml', code: 'services:\n  web:\n    build: .                # 用当前目录 Dockerfile 构建\n    image: myapp:latest\n    ports:\n      - "8080:3000"          # 端口映射\n    depends_on:\n      - db                  # 依赖 db 服务\n    environment:\n      - DB_HOST=db          # 用服务名访问数据库\n\n  db:\n    image: mysql:8.0\n    environment:\n      MYSQL_ROOT_PASSWORD: "123456"\n    volumes:\n      - db_data:/var/lib/mysql   # 数据持久化\n\nvolumes:\n  db_data:                  # 声明命名卷\n' },
          { type: 'table', headers: ['配置项', '作用'], rows: [
            ['services', '定义所有服务（顶层必需）'],
            ['image / build', '指定镜像或从 Dockerfile 构建'],
            ['ports', '端口映射 "宿主:容器"'],
            ['environment', '环境变量'],
            ['volumes', '数据卷挂载'],
            ['depends_on', '控制启动顺序与依赖'],
            ['networks', '加入指定网络（默认自动建专属网络）']
          ] },
          { type: 'warning', text: 'YAML 对缩进极其敏感：<b>必须用空格缩进</b>（通常 2 个），不能用 Tab。缩进错了文件就无法解析。' }
        ],
        terminal: {
          enabled: true,
          task: '编写并校验一份 Compose 文件，再启动整个应用。',
          commands: ['cat docker-compose.yml', 'docker compose config', 'docker compose up -d', 'docker compose ps']
        },
        practice: {
          title: '编写并校验一份 Compose 文件，再启动整个应用。',
          desc: '请在右侧终端完成以下操作：编写并校验一份 Compose 文件，再启动整个应用。',
          commands: ['cat docker-compose.yml', 'docker compose config', 'docker compose up -d', 'docker compose ps'],
          check: hasRunAny(['cat docker-compose.yml', 'docker compose config', 'docker compose up -d', 'docker compose ps']),
          successMsg: '练习完成！你已经掌握了本节的实操要点。',
          hints: ['第一步可以尝试输入：cat docker-compose.yml', '接着输入：docker compose config', '接着输入：docker compose up -d']
        },
        quiz: [
          { question: 'YAML 文件缩进使用什么？', options: ['Tab', '空格（不能用 Tab）', '都可以', '无要求'], answer: 1, explain: 'YAML 要求空格缩进，Tab 会导致解析错误。' },
          { question: 'depends_on 的作用是？', options: ['依赖网络', '控制服务启动顺序与依赖关系', '限制资源', '设置端口'], answer: 1, explain: 'depends_on 声明服务间的依赖关系，控制启动顺序。' }
        ]
      },
      {
        id: 'compose-3',
        title: 'Compose 常用命令',
        concept: 'up / down / ps / logs',
        content: [
          { type: 'code', lang: 'bash', code: 'docker compose up -d          # 构建并后台启动全部服务\ndocker compose up -d web      # 只启动指定服务\n\ndocker compose ps             # 查看服务状态\ndocker compose logs -f        # 跟踪所有服务日志\ndocker compose logs web       # 查看指定服务日志\n\ndocker compose down           # 停止并删除容器/网络\ndocker compose down -v        # 同时删除数据卷（小心！数据丢失）\n\ndocker compose build          # 重新构建镜像\ndocker compose pull           # 拉取最新镜像' },
          { type: 'table', headers: ['命令', '作用'], rows: [
            ['docker compose up', '创建并启动（-d 后台）'],
            ['docker compose down', '停止并移除容器与网络'],
            ['docker compose ps', '查看服务状态'],
            ['docker compose logs', '查看服务日志'],
            ['docker compose build', '重新构建镜像'],
            ['docker compose exec <svc> <cmd>', '进入服务容器执行命令']
          ] },
          { type: 'warning', text: '<code>down -v</code> 会连数据卷一起删除——生产数据将永久丢失，务必谨慎！' }
        ],
        terminal: {
          enabled: true,
          task: '完整走一遍 Compose 的生命周期：启动 → 查看 → 日志 → 停止。',
          commands: ['docker compose up -d', 'docker compose ps', 'docker compose logs web', 'docker compose down']
        },
        practice: {
          title: '完整走一遍 Compose 的生命周期：启动 → 查看 → 日志 → 停止。',
          desc: '请在右侧终端完成以下操作：完整走一遍 Compose 的生命周期：启动 → 查看 → 日志 → 停止。',
          commands: ['docker compose up -d', 'docker compose ps', 'docker compose logs web', 'docker compose down'],
          check: hasRunAny(['docker compose up -d', 'docker compose ps', 'docker compose logs web', 'docker compose down']),
          successMsg: '练习完成！你已经掌握了本节的实操要点。',
          hints: ['第一步可以尝试输入：docker compose up -d', '接着输入：docker compose ps', '接着输入：docker compose logs web']
        },
        quiz: [
          { question: 'docker compose down 会做什么？', options: ['只停止容器', '停止并删除容器与网络', '删除镜像', '停止 Docker'], answer: 1, explain: 'down 移除容器与网络，加 -v 才会删数据卷。' },
          { question: 'docker compose up -d 中的 -d 表示？', options: ['调试', '后台运行', '删除', '开发模式'], answer: 1, explain: '同 docker run -d，后台运行全部服务。' }
        ]
      }
    ]
  },
  {
    id: 'practice',
    index: '09',
    title: '综合实战',
    icon: 'Rocket',
    color: '#E91E63',
    minutes: 20,
    lessonsCount: 3,
    description: '把前八章知识串起来：从零部署一个完整的多容器应用。',
    lessons: [
      {
        id: 'practice-1',
        title: '实战：部署 Node.js 应用',
        concept: '镜像构建 → 运行',
        content: [
          { type: 'text', html: '目标：把 docker-project 里的 Node.js 应用打包成镜像并运行。完整步骤：' },
          { type: 'list', items: [
            '<b>1.</b> 确认 Dockerfile 内容正确（FROM / WORKDIR / COPY / RUN / EXPOSE / CMD）',
            '<b>2.</b> docker build -t myapp . 构建镜像',
            '<b>3.</b> docker images 确认镜像已生成',
            '<b>4.</b> docker run -d --name app -p 3000:3000 myapp 启动',
            '<b>5.</b> docker logs app 确认应用正常输出',
            '<b>6.</b> docker exec app ls /app 检查容器内文件'
          ] },
          { type: 'code', lang: 'bash', code: '# 一键走完（在模拟终端里逐条尝试）\ncat Dockerfile\ndocker build -t myapp .\ndocker images\ndocker run -d --name app -p 3000:3000 myapp\ndocker ps\ndocker logs app' },
          { type: 'tip', text: '如果 run 时报端口冲突，说明 3000 被占用，换一个宿主端口如 <code>-p 3001:3000</code> 即可。' }
        ],
        terminal: {
          enabled: true,
          task: '完整走一遍：构建 → 运行 → 日志 → 进入容器检查。',
          commands: ['cat Dockerfile', 'docker build -t myapp .', 'docker run -d --name app -p 3000:3000 myapp', 'docker ps', 'docker logs app', 'docker exec app ls /app']
        },
        practice: {
          title: '完整走一遍：构建 → 运行 → 日志 → 进入容器检查。',
          desc: '请在右侧终端完成以下操作：完整走一遍：构建 → 运行 → 日志 → 进入容器检查。',
          commands: ['cat Dockerfile', 'docker build -t myapp .', 'docker run -d --name app -p 3000:3000 myapp', 'docker ps', 'docker logs app', 'docker exec app ls /app'],
          check: hasRunAny(['cat Dockerfile', 'docker build -t myapp .', 'docker run -d --name app -p 3000:3000 myapp', 'docker ps', 'docker logs app', 'docker exec app ls /app']),
          successMsg: '练习完成！你已经掌握了本节的实操要点。',
          hints: ['第一步可以尝试输入：cat Dockerfile', '接着输入：docker build -t myapp .', '接着输入：docker run -d --name app -p 3000:3000 myapp']
        },
        quiz: [
          { question: '部署一个应用的正确顺序是？', options: ['run → build → pull', 'build → run → 验证', 'pull → build → run 的顺序', 'run → ps → build'], answer: 1, explain: '先构建镜像，再运行容器，最后用 logs/exec 验证。' },
          { question: '如何确认容器内应用已正常启动？', options: ['docker images', 'docker logs <容器>', 'docker network ls', 'docker volume ls'], answer: 1, explain: '查看容器日志是确认应用运行状态最直接的手段。' }
        ]
      },
      {
        id: 'practice-2',
        title: '实战：多容器应用编排',
        concept: 'Compose 全流程',
        content: [
          { type: 'text', html: '目标：用 Compose 一次启动 <b>web（Node.js）+ db（MySQL）+ redis（缓存）</b> 三个服务。' },
          { type: 'code', lang: 'yaml', code: 'services:\n  web:\n    build: .\n    image: myapp:latest\n    ports:\n      - "8080:3000"\n    environment:\n      DB_HOST: db\n      REDIS_HOST: redis\n    depends_on:\n      - db\n      - redis\n\n  db:\n    image: mysql:8.0\n    environment:\n      MYSQL_ROOT_PASSWORD: "123456"\n      MYSQL_DATABASE: app\n    volumes:\n      - db_data:/var/lib/mysql\n\n  redis:\n    image: redis:7-alpine\n\nvolumes:\n  db_data:' },
          { type: 'text', html: '应用内通过环境变量 <code>DB_HOST=db</code> 连接数据库——注意这里用的是<b>服务名 db</b>，Compose 自动创建的网络会让服务名可解析。' },
          { type: 'warning', text: '容器内应用连接数据库时，不能写 localhost（那是容器自己），必须写数据库服务名，如 db。' }
        ],
        terminal: {
          enabled: true,
          task: '用 Compose 启动三服务应用，验证服务都正常运行后停止。',
          commands: ['docker compose up -d', 'docker compose ps', 'docker compose logs web', 'docker compose down']
        },
        practice: {
          title: '用 Compose 启动三服务应用，验证服务都正常运行后停止。',
          desc: '请在右侧终端完成以下操作：用 Compose 启动三服务应用，验证服务都正常运行后停止。',
          commands: ['docker compose up -d', 'docker compose ps', 'docker compose logs web', 'docker compose down'],
          check: hasRunAny(['docker compose up -d', 'docker compose ps', 'docker compose logs web', 'docker compose down']),
          successMsg: '练习完成！你已经掌握了本节的实操要点。',
          hints: ['第一步可以尝试输入：docker compose up -d', '接着输入：docker compose ps', '接着输入：docker compose logs web']
        },
        quiz: [
          { question: 'web 容器内要连接 MySQL，应该访问什么地址？', options: ['localhost', 'db（服务名）', '127.0.0.1', '宿主机 IP'], answer: 1, explain: '容器内 localhost 是容器自身，需用 Compose 服务名 db 访问数据库服务。' },
          { question: 'Compose 网络下服务名解析由谁提供？', options: ['宿主 DNS', 'Compose 自动创建的网络内置 DNS', '手动配置', '路由表'], answer: 1, explain: 'Compose 创建的网络支持服务名 DNS 解析。' }
        ]
      },
      {
        id: 'practice-3',
        title: '学习路线与 FAQ',
        concept: '总结提升',
        content: [
          { type: 'text', html: '恭喜！你已经掌握了 Docker 的核心知识体系。回顾一下这条主线：' },
          { type: 'list', items: [
            '<b>镜像</b>：images / pull / rmi / tag，理解分层',
            '<b>容器</b>：run / ps / stop / rm / logs / exec，掌握生命周期',
            '<b>Dockerfile</b>：FROM / RUN / CMD / ENTRYPOINT / COPY / EXPOSE，多阶段构建',
            '<b>数据卷</b>：volume / bind mount，理解持久化',
            '<b>网络</b>：bridge / host，自定义网络与容器互联',
            '<b>Compose</b>：YAML 编排多容器应用'
          ] },
          { type: 'table', headers: ['常见问题', '答案'], rows: [
            ['容器启动后立即退出？', '入口进程在前台退出导致，检查 CMD 是否被覆盖或服务是否启动失败'],
            ['端口冲突怎么办？', '换端口、停旧容器或用 -P 随机端口'],
            ['rmi 删不掉镜像？', '有容器引用，先删容器或用 -f'],
            ['容器里连不上数据库？', '别用 localhost，用服务名/容器名'],
            ['数据丢失了？', '容器可写层随容器删除，需用数据卷持久化']
          ] },
          { type: 'tip', title: '下一步建议', text: '深入学习可以看《Docker 从入门到实践》原书的镜像加速、仓库私有化、Swarm/Kubernetes 编排等章节。也可以学习 docker inspect、docker stats 等运维命令，以及镜像安全扫描（docker scout）。' }
        ],
        terminal: {
          enabled: true,
          task: '自由复习：把本教程学过的命令再练一遍，巩固记忆。',
          commands: ['docker images', 'docker ps -a', 'docker volume ls', 'docker network ls', 'docker compose ps', 'docker info']
        },
        practice: {
          title: '自由复习：把本教程学过的命令再练一遍，巩固记忆。',
          desc: '请在右侧终端完成以下操作：自由复习：把本教程学过的命令再练一遍，巩固记忆。',
          commands: ['docker images', 'docker ps -a', 'docker volume ls', 'docker network ls', 'docker compose ps', 'docker info'],
          check: hasRunAny(['docker images', 'docker ps -a', 'docker volume ls', 'docker network ls', 'docker compose ps', 'docker info']),
          successMsg: '练习完成！你已经掌握了本节的实操要点。',
          hints: ['第一步可以尝试输入：docker images', '接着输入：docker ps -a', '接着输入：docker volume ls']
        },
        quiz: [
          { question: '容器启动后立即退出，最常见原因是？', options: ['镜像损坏', '入口命令在前台执行完就退出', '网络不通', '磁盘满'], answer: 1, explain: '容器主进程退出容器就停止，需保证前台常驻进程。' },
          { question: '以下哪项不属于 Docker 核心知识体系？', options: ['镜像与容器', 'Dockerfile', '数据卷与网络', 'JavaScript 语法'], answer: 3, explain: 'Docker 体系涵盖镜像、容器、构建、数据、网络、编排等，JS 语法不属于。' }
        ]
      }
    ]
  }
]

/** 章节总数 / 课时总数 / 练习总数 */
export const stats: CourseStats = chapters.reduce(
  (acc, ch) => {
    acc.chapters++
    acc.lessons += ch.lessons.length
    acc.practices += ch.lessons.filter(l => l.terminal && l.terminal.enabled).length
    acc.quizzes += ch.lessons.reduce((s, l) => s + (l.quiz ? l.quiz.length : 0), 0)
    return acc
  },
  { chapters: 0, lessons: 0, practices: 0, quizzes: 0 }
)

// 供 stores / 组件复用本模块涉及的共享类型
export type { Chapter, Lesson, ContentBlock, Practice, Quiz, TerminalConfig, CourseStats } from '@/types'
