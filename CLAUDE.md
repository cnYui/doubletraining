# Double Training — Rokid AIUI 健身打卡智能体(工作区说明)

> 给 Claude 的说明文件。本文件夹就是 `cnYui/doubletraining` 仓库的根目录;AIUI Studio 的导入根是其中的 `agent/` 子目录。

## 目录关系

| 位置 | 是什么 |
|---|---|
| 本文件夹 | Git 仓库根,GitHub:`https://github.com/cnYui/doubletraining`(公开,`main`) |
| `agent/` | **AIUI Studio 导入根**(直接含 `app.json`),AIUI 0.17.0,两个 Page:`pages/dates/index` 训练日历、`pages/day/index` 当日计划 |
| `agent/lib/` | 纯逻辑:`dates.js` 日期(整数天数运算)、`workout.js` 训练模型与示例计划、`store.js` localStorage 持久化、`temple.js` 镜腿输入去重 |
| `tests/` | Node 单元测试(`npm test`,Node 20+),不进 Studio |
| `D:\CodeWorkSpace\rokid-aiui-agent-skill` | `rokid-aiui-agent` Skill 仓库(含参考计时器 `skills\rokid-aiui-agent\assets\focus-timer-agent`) |
| `C:\Users\yui\.claude\skills\rokid-aiui-agent` | 已安装的 Skill,校验脚本在 `scripts/` |

## 改代码 → Studio 调试的循环

1. 本地改 `agent/`,跑 `npm test` 和
   `python C:/Users/yui/.claude/skills/rokid-aiui-agent/scripts/validate_aiui_project.py agent --repository-root . --target-version 0.17.0 --strict`
2. `git commit` + `git push origin main`
3. Studio(`https://aiui.rokid.com`)左上「新建智能体」**整个按钮**打开下拉 →「GitHub 导入」→ 填
   `https://github.com/cnYui/doubletraining/tree/main/agent` →「确认导入」。
   - **同一地址再导入会就地更新已有的 `cnYui/doubletraining` 项目**,不会产生重复项目;效果预览会自动用新代码重渲染。
   - 项目「···」菜单只有 上传云端 / 覆盖本地 / 本地导入 / 重命名 / 删除,没有"从 GitHub 拉取"。
   - 导入框会残留上一次的地址,键盘清空不可靠;用表单填值(整体替换)再确认。下拉菜单在两次操作之间会自动关闭,打开和点「GitHub 导入」要连续完成。
4. 对话框发 `/debug 模拟眼镜设备运行训练日历页面 pages/dates/index`(`/debug` 会变成标签,要点发送按钮)→ 卡片上点「进入」→ 画布进右上「效果预览」(480 × 352)。
5. 右侧「真机模拟」:镜腿四个按钮 + 语音输入;「日志」面板显示页面的 `console.log`,「查看系统日志」切换运行时日志。

## 模拟器里的输入映射(Studio 1.1.0 实测)

每个镜腿操作都先发 `GlobalHook`(keydown+keyup),再发手势键:

| 镜腿操作 | 页面依次收到 | 本项目的用法 |
|---|---|---|
| 单击 | `GlobalHook` → `Enter` | 日历:进入这天;列表:记一组并打勾 / 有氧记完成 |
| 双击 | **智能体页面收不到任何按键**(2026-09-11 页面日志确认;只有系统桌面页会响应"清空对话") | 设计上是返回日历,模拟器里测不了 |
| 向前滑动 | `GlobalHook` → `ArrowUp` | 日历:前一天;列表:上一个动作 |
| 向后滑动 | `GlobalHook` → `ArrowDown` | 日历:后一天;列表:下一个动作 |

页面只认手势键;`lib/temple.js` 让紧跟手势键的 `GlobalHook` 失效,单独出现的 `GlobalHook` 延迟 280 ms 当作一次单击(真机可能只发它)。真机的发送顺序未验证。

组间休息倒计时按用户要求暂时关闭:`pages/day/index.ink` 的 `REST_TIMER_ENABLED = false`,单击只打勾、停在列表。

## Studio 运行时的坑(都已在代码里绕开,别改回去)

- 运行时是 QuickJS,**时区 UTC(`getTimezoneOffset()` = 0)**。
- **`new Date(y, m, d)` / `setDate()` 不可靠**:同一段代码两次调用结果不同,示例计划曾被写到早一个月的日期。日期全部用整数"自 1970-01-01 的天数"运算,"今天"只从 `Date.now()` 和时区偏移推出。
- **`ink:for` 所在元素自身的属性里,循环变量不解析**(日志 `Template variable 'row.tone' is missing`)。循环一律写成 `<block ink:for ... ink:for-item="x">` 包住内层元素。
- **被 `ink:if` 销毁又重建的块,里面的 `ink:for` 行不再渲染**(从休息切回列表后动作行消失)。当日页的四个状态面板常驻,每个面板自己绑定数据驱动的 `full-on` 类来显示。
- **`<page>` 根节点上的动态类不生效**(`<page class="shell mode-{{mode}}">` 里的 `mode-*` 从未被应用,当日页因此整页黑屏)。根节点只用静态类;动态类放在普通 `view` 上(日历行、提示文字已验证可用)。
- **浏览器面板收起时页面完全停摆**:`visibilityState = hidden`、`requestAnimationFrame` 0 帧,Studio 的 GitHub 导入会卡在「正在解包归档并构建文件树」,效果预览也不渲染。测试时面板必须显示、窗口在前台。
- **「进入」后的效果预览仍是 `_current` target**,只是尺寸变成 480 × 352。紧凑布局按高度切换(`@media (max-height: 240px)`),不按 target。内联卡片实测 448 × 150。
- Ink 的 `localStorage` 不在浏览器 localStorage / IndexedDB 里,但在同一个 Studio 会话内跨重渲染保留。`store.js` 的 `SEED_VERSION` 升级会重写示例数据。

## 已验证 / 未验证

**模拟器里已验证(2026-09-11):** 导入与重新导入;日历页 5 行渲染、本周统计、前后滑动逐日移动、单击 `wx.navigateTo` 进入当日页;当日页列表渲染、单击记组进入休息倒计时、休息中滑动调下一组重量、向后滑动定位到有氧并单击记完成。

**未验证 / 待确认:** 双击(`Backspace`)是否送达页面——休息中双击没有撤销;从休息切回列表的行渲染(已改为常驻面板,待复测);被覆盖的页面是否也收到按键(已加可见性判断,待复测);完成页;语音路由和 `date` 槽位(草稿态不注册 schema);点头;一切真机行为。模拟器结论 ≠ 真机通过,Skill 的发布门槛要真机签名证据。

## 其它

- 根目录的空文件 `{s.stopPropagation()` 来路不明(不是本项目文件),未提交,也没有删除。
- 本文件夹计划改名为 `Double Training`;改名要在关闭 Claude 会话后进行(Windows 不允许重命名进程当前目录,且会话记录按路径存放)。
