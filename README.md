# Double Training

Rokid Glasses 上的健身打卡智能体(AIUI 0.17.0,单色绿 480 × 352)。按日期看训练计划,镜腿单击完成一组,自动开始组间休息倒计时;重量、次数、有氧分钟都记在眼镜本地。

## 导入 AIUI Studio

AIUI 工程根是仓库里的 `agent/` 子目录(它直接包含 `app.json`),不是仓库根:

```text
Repository: https://github.com/cnYui/doubletraining
Ref: main
AIUI project directory: agent
```

Studio 左上角「GitHub 导入」填:`https://github.com/cnYui/doubletraining/tree/main/agent`

## 两个页面

| Page | 内容 | 镜腿操作 |
| --- | --- | --- |
| `pages/dates/index` 训练日历 | 滚轮式日期选择,选中日放大,上下各露两天,显示部位与完成度 | 向前滑动 = 前一天,向后滑动 = 后一天,单击 = 进入这天,双击 = 退出 |
| `pages/day/index` 当日计划 | 动作列表与每组方框;组间休息;完成总结 | 见下表 |

当日计划的三种状态:

| 状态 | 单击 | 双击 | 向前 / 向后滑动 |
| --- | --- | --- | --- |
| 列表 | 当前动作按计划记一组,自动进入休息;有氧项单击记为完成 | 返回训练日历 | 上一个 / 下一个动作 |
| 组间休息 | 跳过休息(点头也可以) | 撤销刚记的这一组 | 下一组重量 + / − 一个步进 |
| 完成 | 返回训练日历 | 返回训练日历 | — |

完成页显示组数、总量(Σ 重量 × 次数)、用时、有氧分钟,以及与上一次同部位训练的重量对比。

## 镜腿按键(Studio 真机模拟实测)

模拟器里每个镜腿操作都先发 `GlobalHook`,再发手势键:单击 → `Enter`,双击 → `Backspace`,向前滑动 → `ArrowUp`,向后滑动 → `ArrowDown`。页面只认手势键;单独出现的 `GlobalHook`(真机可能只发它)在 280 ms 后按一次单击处理,紧跟手势键的 `GlobalHook` 会被忽略,见 `agent/lib/temple.js`。真机上的发送顺序还没有验证。

## 目录

```text
agent/                  AIUI Studio 导入根
  AGENTS.md             智能体身份、语音路由规则、能力边界
  app.json              pages: dates, day
  pages/dates/index.ink 训练日历
  pages/day/index.ink   当日计划(列表 / 休息 / 完成)
  lib/                  纯逻辑:日期、训练模型、存储、镜腿输入
  aiui-audit-claims.json
tests/                  Node 单元测试(不进 Studio)
```

## 开发

```bash
npm test
```

需要 Node 20+。测试覆盖 `agent/lib/` 的全部纯逻辑;页面行为需要在 Studio 模拟器和真机上验证。

## 现状

- 已在 Studio 模拟器里验证的内容记录在提交历史和审计文件里;真机(光学、按键顺序、点头、存储持久化)都还没有验证。
- 语音只负责打开页面并传日期;"记 80 公斤 6 个"这类语音记录还没有做,因为草稿态智能体的槽位抽取在模拟器里不生效,需要先经过 Studio「构建与提审」。
- 首次打开写入示例计划(胸 / 背 / 腿 / 肩 / 休息),数据只存在眼镜本地 `localStorage`。
