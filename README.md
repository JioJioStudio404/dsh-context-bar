# dsh-context-bar

DeepSeek Harness 对话输入框下方状态栏里的上下文占用条：20 格分段条、百分比和已用 / 上限，所有模型线路通用。

```
▮▮▮▮▮▯▯▯▯▯▯▯▯▯▯│▯▯▯▯  上下文 23% · 230K / 1M
```

## 功能

- 分段条每格 5%，竖线标出 DeepSeek Harness 大约开始自动压缩的位置
- 接近自动压缩点时变为橙色，用到上限的 95% 时变为红色
- 线路没有报告 Token 用量时，按 DeepSeek Harness 自己的估算显示，并标注「估算」
- 悬停查看用量与上限、数字来源、组成（系统提示词 / 工具定义 / 对话消息）和自动压缩点
- 与 DeepSeek Harness 自带的上下文圆环读取同一组数据，不额外发请求，不读写文件，不需要 Key

## 安装

需要 Node.js 24.9 或更高版本（DeepSeek Harness 0.2.2 的最低要求）。

```bash
git clone https://github.com/JioJioStudio404/dsh-context-bar.git
dsh plugin --profile desktop add "/path/to/dsh-context-bar"
```

安装后重启 DeepSeek Harness。

## 许可证

MIT
