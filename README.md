# Token Monitor

全平台 AI Token 余额监控桌面应用。一个快捷键唤起，一眼看完所有平台余额，再也不用担心 API Key 欠费了。

## ✨ 解决什么问题

平时用各种 AI 平台（DeepSeek、Kimi、智谱、阿里云百炼、腾讯云混元等），每个平台都有自己的余额，每次想知道还剩多少钱要一个个登录后台去查，麻烦又容易忘。Token Monitor 把所有平台的余额集中在一个悬浮窗里，按一下快捷键就能看。

## 🎯 主要功能

- **多平台余额查询** — 支持 DeepSeek、Kimi、智谱AI、阿里云百炼、腾讯云混元
- **全局快捷键唤起** — 默认 `Ctrl+Shift+T`，支持自定义，录制式设置
- **系统托盘常驻** — 后台静默运行，托盘图标显示总余额
- **余额告警** — 可设置阈值，余额偏低时红色高亮提醒
- **自动刷新** — 每 5 分钟自动刷新所有余额
- **快速充值** — 每个平台卡片直达充值页面
- **本地存储** — API Key 存在本地，不上传任何服务器
- **多 Key 管理** — 同一个平台可以添加多个 Key，支持备注名称

## 🖼️ 界面预览

```
┌─────────────────────────────────┐
│ 💰 余额概览          ⚙️  ↻     │
│ 总余额: ¥128.50   平台: 4 个   │
├─────────────────────────────────┤
│ 🧠 DeepSeek - 主号       🔄 🗑️ │
│       ¥56.80                   │
│       ✓ 余额充足                │
│   充值余额 ¥50.00  赠金 ¥6.80   │
│       [ 💳 快速充值 ]           │
├─────────────────────────────────┤
│ 🌙 Kimi - 工作号          🔄 🗑️ │
│       ¥32.70                   │
│       ✓ 余额充足                │
│       [ 💳 快速充值 ]           │
└─────────────────────────────────┘
```

## 📦 安装

### 环境要求

- Node.js >= 18
- Windows / macOS / Linux

### 开发运行

```bash
# 安装依赖
npm install

# 开发模式运行（编译 + 启动 Electron）
npm run electron:dev
```

### 打包发布

```bash
# 打包 Windows 安装包
npm run dist:win

# 打包当前平台
npm run dist
```

打包产物在 `release/` 目录下。

## 🚀 使用方法

### 1. 唤起窗口

- **快捷键**：按 `Ctrl + Shift + T`（默认）
- **托盘图标**：点击系统托盘里的 Token Monitor 图标
- **右键菜单**：托盘图标右键 → 显示余额监控

> 窗口失焦或按 `ESC` 会自动隐藏。

### 2. 添加 API Key

1. 唤起窗口后，在顶部选择平台
2. 输入对应的凭证（API Key / AccessKey 等）
3. 可选：填写备注名称方便区分
4. 点击「添加 Key」，自动查询余额

各平台需要的凭证：

| 平台 | 凭证类型 | 获取地址 |
|------|---------|---------|
| DeepSeek | API Key | https://platform.deepseek.com/api_keys |
| Kimi | API Key | https://platform.kimi.com/console/api-keys |
| 智谱AI | API Key | https://open.bigmodel.cn/usercenter/apikeys |
| 阿里云百炼 | AccessKey ID + Secret | https://ram.console.aliyun.com/manage/ak |
| 腾讯云混元 | SecretId + SecretKey | https://console.cloud.tencent.com/cam/capi |

> 💡 **安全建议**：阿里云和腾讯云建议使用 RAM/子账号的密钥，并只授予账单只读权限。

### 3. 设置

点击右上角 ⚙️ 进入设置：

- **唤醒快捷键**：点击录制框，按下想要的组合键，300ms 后自动确认
- **余额告警阈值**：余额低于此值时卡片红色高亮
- **自动刷新**：开关自动刷新（每 5 分钟）

### 4. 快速充值

每个余额卡片底部都有「💳 快速充值」按钮，点击直达对应平台的充值页面。

## 🔒 数据安全

- 所有 API Key 都保存在本地 `userData` 目录下（`%APPDATA%\Token Monitor\token-keys.json`）
- 不会上传到任何服务器
- 只有调用各平台官方余额查询接口时才会使用 Key
- 项目目录本身不存储任何真实密钥，`server/data/config.json` 已加入 `.gitignore`

## 📁 项目结构

```
token_monitor/
├── electron/                 # Electron 主进程（TypeScript）
│   ├── main.ts              # 主入口：窗口、托盘、快捷键
│   ├── preload.ts           # IPC 桥接
│   ├── store.ts             # 数据持久化
│   ├── platforms.ts         # 平台加载器
│   └── platforms/           # 各平台适配器
│       ├── deepseek.ts
│       ├── kimi.ts
│       ├── zhipu.ts
│       ├── bailian.ts
│       └── tencent.ts
├── src/                     # 渲染进程（React + TypeScript）
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── server/                  # 旧版网页服务端（保留参考）
│   ├── index.js
│   └── platforms/
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tsconfig.electron.json
└── .gitignore
```

## 🔧 添加新平台

在 `electron/platforms/` 下新建一个 `.ts` 文件，实现 `getBalance` 方法即可，系统会自动加载：

```typescript
import * as https from 'https'

const adapter = {
  id: 'your-platform',
  name: '你的平台',
  description: '平台描述',
  website: 'https://example.com/api-keys',
  rechargeUrl: 'https://example.com/recharge',
  currency: 'CNY',
  credentialType: 'api_key',     // 或 'aliyun_accesskey' / 'tencent_cloud'
  credentialHint: '',
  isTokenQuota: false,           // 是金额余额还是Token额度

  getBalance(apiKey: string): Promise<any> {
    return new Promise((resolve, reject) => {
      // 调用平台余额查询接口
      // 返回格式:
      // {
      //   isAvailable: boolean,
      //   currency: 'CNY',
      //   totalBalance: number,
      //   grantedBalance: number,
      //   toppedUpBalance: number,
      //   isTokenQuota?: boolean,
      //   remainingTokens?: number,
      //   note?: string
      // }
    })
  }
}

export default adapter
```

## 📝 License

MIT License
