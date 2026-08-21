# JavaScript 执行上下文面板设计

## 背景

在现有 Docker、Git、MySQL、JVM Playground 基础上新增 JavaScript Playground。第一版聚焦 JavaScript 执行上下文、作用域、堆对象和引用关系的可视化，不接入真实浏览器控制台、不执行任意用户脚本，也不实现 Promise、setTimeout 或事件循环调度。

页面采用与 JVM 编辑器一致的交互心智：左侧写简化 JavaScript 代码，右侧展示执行到当前行时的调用栈、作用域和堆内存状态。用户通过编辑代码、移动光标或点击运行按钮观察状态变化。

## 用户体验

新增顶部导航入口 `JavaScript`，路由为 `/javascript`。页面最大宽度保持 1200px，桌面端左侧为代码编辑器，右侧为固定宽度的执行上下文视图；窄屏切换为上下布局。

左侧编辑器提供：

- 内置示例代码。
- 当前执行行高亮。
- 基础语法诊断。
- 运行到当前行和运行全部。
- 格式化与重置。
- 自动保存源码到 localStorage。

右侧面板提供：

- 调用栈：展示 `global()` 和函数调用帧，标记当前活动帧。
- 作用域：第一版展示全局作用域和函数作用域中的变量绑定，并在模型中预留块级作用域。
- 堆内存：展示对象、数组和函数对象。
- 引用关系：展示变量引用如何指向堆条目。

第一版不显示课程正文、练习、题目或真实终端。

## 支持的 JavaScript 子集

第一版支持教学用简化语法：

```js
let user = { name: "Alice" }
const scores = [100, 98]

function rename(obj) {
  obj.name = "Bob"
}

rename(user)
```

支持范围：

- `let`、`const`、`var` 变量声明。
- 字符串、数字、布尔值、`null`、`undefined`。
- 对象字面量和数组字面量。
- 函数声明。
- 函数调用。
- 局部变量声明。
- 对象属性读取和写入。
- 数组下标读取和写入。
- 简单赋值。
- `if` 和块级作用域可作为第二阶段的小扩展，不进入第一版必须范围。

不支持范围：

- 任意表达式求值。
- 原型链、类、模块、this 绑定。
- 异步任务、Promise、setTimeout、事件循环。
- DOM、浏览器 API、Node.js API。
- eval、Function 构造器或真实脚本执行。

## 数据模型

执行器使用确定性模拟状态，每次从源码和目标行重新计算快照，不持久化派生状态。

核心结构：

- Program：解析后的语句、函数声明和行号映射。
- ExecutionContext：调用栈帧，包含名称、起止行、当前行和作用域链。
- ScopeRecord：变量绑定表，记录声明方式、值、可变性和所属作用域。
- HeapEntry：堆条目，包含对象、数组或函数对象。
- JsValue：基础值或堆引用。
- Diagnostic：解析或执行诊断，包含行号、级别和中文说明。

变量保存值本身或堆引用。对象、数组和函数对象只存在于堆中。函数调用时创建新的执行上下文，参数绑定进入函数作用域，函数返回后该调用帧从栈中移除，但仍被可达变量引用的堆对象继续保留。

## 执行逻辑

执行流程：

1. 编辑器源码变化后防抖解析。
2. 解析器生成 Program 和行级诊断。
3. 执行器从空状态执行到目标行。
4. 每条语句更新调用栈、作用域或堆。
5. 页面把快照传给右侧执行上下文面板。
6. 源码保存到 `javascript-editor-source-v1-javascript-playground`。

执行规则：

- 全局代码在 `global()` 执行上下文中运行。
- 函数声明在全局作用域创建函数绑定，并在堆中创建函数对象。
- 对象和数组分配到堆，变量只保存引用。
- 函数调用创建新调用帧，参数按值绑定；对象和数组参数传入的是引用值。
- 属性写入通过引用修改堆对象，不复制对象。
- `const` 禁止重新赋值，但允许修改其引用对象的属性。
- `let` 与 `const` 在当前词法作用域可见；第一版主要落在全局和函数作用域。`var` 在函数或全局作用域可见。

第一版执行到函数调用内部时，以“运行到当前源码行”为准：目标行位于函数体内时，执行器会找到第一条能触达该函数体的调用路径并展示该函数帧；目标行位于调用之后时，展示调用完成后的状态。

## 组件与文件

建议新增：

- `src/views/JavaScriptPlaygroundView.vue`：页面接线、持久化、运行目标行管理。
- `src/components/JavaScriptCodeEditor.vue`：代码编辑器、行号、当前行、诊断展示。
- `src/components/JavaScriptExecutionPanel.vue`：调用栈、作用域、堆和引用关系视图。
- `src/terminal/javascriptSourceParser.ts`：简化 JavaScript 解析和格式化。
- `src/terminal/javascriptSourceExecutor.ts`：执行到目标行并生成快照。
- `src/terminal/javascriptMemoryModel.ts`：值、作用域、堆和引用辅助逻辑。
- `src/terminal/javascriptSourceStorage.ts`：默认源码和 localStorage 持久化。

需要更新：

- `src/router/index.ts`：新增 `/javascript` 路由。
- `src/App.vue`：新增顶部导航入口和模块主题。
- `src/types/index.ts`：新增 JavaScript 模拟状态共享类型。
- `docs/architecture.md` 与 `docs/development.md`：补充 JavaScript Playground 的数据流、持久化 key 和调试说明。

## 错误处理

解析错误显示在编辑器对应行，右侧面板保留上一次可用快照或展示空状态。执行错误使用中文说明，并标记发生行，例如：

- 未声明变量。
- 不能给 `const` 重新赋值。
- 不能读取非对象的属性。
- 函数不存在或参数数量不匹配。
- 不支持的语法。

执行器不得抛出未捕获异常到页面层；未知错误转为诊断。

## 测试

新增单元测试覆盖：

- 变量声明和基础值绑定。
- 对象和数组分配到堆。
- 函数声明和函数调用帧。
- 参数传引用后修改堆对象。
- `const` 重新赋值报错。
- 未声明变量报错。
- 执行到目标行时快照稳定。
- localStorage 保存、读取和清理。

验证命令：

```bash
npm run type-check
npm run test
npm run build
```

## 非目标

第一版不做真实 JavaScript 沙箱、不执行浏览器 API、不做事件循环动画、不接入课程、练习或题目数据。事件循环只作为后续扩展方向，不占用第一版核心界面。
