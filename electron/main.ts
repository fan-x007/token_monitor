import { app, BrowserWindow, ipcMain, globalShortcut, Tray, Menu, nativeImage, screen, shell } from 'electron'
import * as path from 'path'
import { TokenStore, SettingsStore, KeyConfig, BalanceResult, PlatformInfo } from './store'
import { loadPlatforms, getBalance, getSupportedPlatforms } from './platforms'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let tokenStore: TokenStore | null = null
let settingsStore: SettingsStore | null = null
let platforms: PlatformInfo[] = []
let currentShortcut: string = ''
let recordingShortcut = false
let recordConfirmTimer: NodeJS.Timeout | null = null

// Token monitor SVG icon for tray
const TRAY_ICON_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="12" cy="12" r="10"/>
  <path d="M12 6v6l4 2"/>
  <path d="M2 12h2M20 12h2M12 2v2M12 20v2"/>
</svg>
`

function createTrayIcon() {
  try {
    const img = nativeImage.createFromDataURL(
      'data:image/svg+xml;base64,' + Buffer.from(TRAY_ICON_SVG).toString('base64')
    )
    return img.resize({ width: 16, height: 16 })
  } catch {
    return nativeImage.createEmpty()
  }
}

function isValidAccelerator(accel: string): boolean {
  const parts = accel.split('+')
  if (parts.length < 2) return false
  const modifiers = ['CommandOrControl', 'Ctrl', 'Control', 'Alt', 'Shift', 'Super', 'Meta', 'Command', 'Option']
  return parts.some(p => !modifiers.includes(p))
}

function codeToAcceleratorKey(code: string): string {
  if (!code) return ''
  if (/^Key[A-Z]$/.test(code)) return code.slice(3)
  if (/^Digit[0-9]$/.test(code)) return code.slice(5)
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code
  const map: Record<string, string> = {
    Space: 'Space', Tab: 'Tab',
    ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
    Comma: 'Comma', Period: 'Period', Slash: 'Slash', Backslash: 'Backslash',
    Semicolon: 'Semicolon', Quote: 'Quote',
    BracketLeft: 'BracketLeft', BracketRight: 'BracketRight',
    Minus: 'Minus', Equal: 'Equal', Backquote: 'Backquote',
    Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown',
    Insert: 'Insert', Delete: 'Delete', Enter: 'Enter', Backspace: 'Backspace',
  }
  return map[code] || ''
}

let currentCombo: string[] = []

function clearRecordTimer() {
  if (recordConfirmTimer) {
    clearTimeout(recordConfirmTimer)
    recordConfirmTimer = null
  }
}

function confirmShortcutRecording() {
  clearRecordTimer()
  recordingShortcut = false
  if (currentShortcut) {
    globalShortcut.register(currentShortcut, () => toggleWindow())
  }
  const hasNormal = currentCombo.some(k => !['CommandOrControl', 'Alt', 'Shift'].includes(k))
  const hasModifier = currentCombo.includes('CommandOrControl') || currentCombo.includes('Alt') || currentCombo.includes('Shift')
  const accelerator = (currentCombo.length >= 2 && hasNormal && hasModifier) ? currentCombo.join('+') : ''
  currentCombo = []
  mainWindow?.webContents.send('shortcut-recorded', accelerator, false)
}

function cancelShortcutRecording() {
  clearRecordTimer()
  recordingShortcut = false
  currentCombo = []
  if (currentShortcut) {
    globalShortcut.register(currentShortcut, () => toggleWindow())
  }
  mainWindow?.webContents.send('shortcut-recorded', '', true)
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 600,
    frame: false,
    transparent: true,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  const indexPath = path.join(__dirname, '../dist/index.html')
  mainWindow.loadFile(indexPath)

  // 主进程捕获键盘录制，只用 keydown + 防抖确认，完全不依赖 keyup
  // 防抖方案：每次按下新键重置计时器，300ms 内无新按键则确认组合
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (!recordingShortcut) return
    if (input.type !== 'keyDown') return
    if (input.isAutoRepeat) return
    event.preventDefault()

    if (input.key === 'Escape') {
      cancelShortcutRecording()
      return
    }

    // 组装当前按下的组合（基于修饰键状态 + 物理键码）
    const keys: string[] = []
    if (input.control) keys.push('CommandOrControl')
    if (input.alt) keys.push('Alt')
    if (input.shift) keys.push('Shift')
    // Win 键组合 Electron 全局快捷键注册不了，忽略
    if (!input.meta) {
      const normal = codeToAcceleratorKey(input.code)
      if (normal) keys.push(normal)
    }
    currentCombo = keys
    mainWindow?.webContents.send('shortcut-recording-keys', keys)

    // 重置确认计时器：300ms 内没有新的 keydown 就确认
    clearRecordTimer()
    // 只有组合里包含普通键时才启动确认计时
    const hasNormal = keys.some(k => !['CommandOrControl', 'Alt', 'Shift'].includes(k))
    if (hasNormal && keys.length >= 2) {
      recordConfirmTimer = setTimeout(() => {
        confirmShortcutRecording()
      }, 300)
    }
  })

  mainWindow.on('blur', () => {
    if (recordingShortcut) {
      // 录制中失焦：如果已有有效组合就确认，否则取消
      const hasNormal = currentCombo.some(k => !['CommandOrControl', 'Alt', 'Shift'].includes(k))
      const hasModifier = currentCombo.includes('CommandOrControl') || currentCombo.includes('Alt') || currentCombo.includes('Shift')
      if (currentCombo.length >= 2 && hasNormal && hasModifier) {
        confirmShortcutRecording()
      } else {
        cancelShortcutRecording()
      }
      return
    }
    mainWindow?.hide()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function createTray() {
  const icon = createTrayIcon()
  tray = new Tray(icon)
  tray.setToolTip('Token Monitor - AI余额监控')

  const contextMenu = Menu.buildFromTemplate([
    { label: '显示余额监控', click: () => toggleWindow() },
    { label: '刷新所有余额', click: () => refreshAllBalances() },
    { type: 'separator' },
    { label: '退出', click: () => { app.quit() } },
  ])

  tray.setContextMenu(contextMenu)
  tray.on('click', () => toggleWindow())
}

function toggleWindow() {
  if (!mainWindow) return

  if (mainWindow.isVisible()) {
    mainWindow.hide()
  } else {
    // Position near cursor
    const cursor = screen.getCursorScreenPoint()
    const [width, height] = mainWindow.getSize()

    let x = cursor.x - Math.floor(width / 2)
    let y = cursor.y - height - 10

    // Clamp to screen bounds
    const display = screen.getDisplayNearestPoint(cursor)
    const bounds = display.workArea
    x = Math.max(bounds.x, Math.min(x, bounds.x + bounds.width - width))
    y = Math.max(bounds.y, Math.min(y, bounds.y + bounds.height - height))

    mainWindow.setPosition(x, y)
    mainWindow.show()
    mainWindow.focus()
  }
}

async function refreshAllBalances() {
  if (!tokenStore) return
  const keys = tokenStore.getKeys()
  for (const key of keys) {
    try {
      const balance = await getBalance(key.platform, key.key)
      tokenStore.setBalance(key.id, { success: true, data: balance })
    } catch (e) {
      tokenStore.setBalance(key.id, { success: false, error: (e as Error).message })
    }
  }
  mainWindow?.webContents.send('balances-updated', tokenStore.getKeys())
  updateTrayTooltip()
}

function updateTrayTooltip() {
  if (!tray || !tokenStore) return
  const keys = tokenStore.getKeys()
  const totalCny = keys
    .filter(k => k.balance?.success && k.balance.data?.currency === 'CNY')
    .reduce((sum, k) => sum + (k.balance!.data!.totalBalance || 0), 0)
  const availableCount = keys.filter(k => k.balance?.success && k.balance.data?.isAvailable).length
  tray.setToolTip(`Token Monitor - ¥${totalCny.toFixed(2)} | ${availableCount}/${keys.length} 个可用`)
}

function registerIpcHandlers() {
  ipcMain.handle('get-platforms', () => {
    return platforms
  })

  ipcMain.handle('get-keys', () => {
    return tokenStore?.getKeys() || []
  })

  ipcMain.handle('add-key', async (_event, platform: string, key: string, label: string) => {
    if (!tokenStore) return null
    const keyConfig = tokenStore.addKey(platform, key, label)
    
    // 异步查询余额
    try {
      const balance = await getBalance(platform, key)
      tokenStore.setBalance(keyConfig.id, { success: true, data: balance })
    } catch (e) {
      tokenStore.setBalance(keyConfig.id, { success: false, error: (e as Error).message })
    }
    
    mainWindow?.webContents.send('balances-updated', tokenStore.getKeys())
    updateTrayTooltip()
    return tokenStore.getKey(keyConfig.id)
  })

  ipcMain.handle('delete-key', (_event, id: string) => {
    tokenStore?.deleteKey(id)
    mainWindow?.webContents.send('balances-updated', tokenStore?.getKeys() || [])
    updateTrayTooltip()
    return true
  })

  ipcMain.handle('refresh-balance', async (_event, id: string) => {
    if (!tokenStore) return null
    const keyConfig = tokenStore.getKey(id)
    if (!keyConfig) return null
    
    try {
      const balance = await getBalance(keyConfig.platform, keyConfig.key)
      tokenStore.setBalance(id, { success: true, data: balance })
    } catch (e) {
      tokenStore.setBalance(id, { success: false, error: (e as Error).message })
    }
    
    mainWindow?.webContents.send('balances-updated', tokenStore.getKeys())
    updateTrayTooltip()
    return tokenStore.getKey(id)
  })

  ipcMain.handle('refresh-all-balances', async () => {
    await refreshAllBalances()
    return true
  })

  ipcMain.handle('open-recharge', (_event, platformId: string) => {
    const platform = platforms.find(p => p.id === platformId)
    if (platform?.rechargeUrl) {
      shell.openExternal(platform.rechargeUrl)
    }
    return true
  })

  ipcMain.handle('hide-window', () => {
    mainWindow?.hide()
    return true
  })

  ipcMain.handle('start-shortcut-recording', () => {
    if (recordingShortcut) return true
    if (currentShortcut) {
      globalShortcut.unregister(currentShortcut)
    }
    currentCombo = []
    clearRecordTimer()
    recordingShortcut = true
    return true
  })

  ipcMain.handle('stop-shortcut-recording', () => {
    if (recordingShortcut) {
      cancelShortcutRecording()
    }
    return true
  })

  // Settings handlers
  ipcMain.handle('get-settings', () => {
    const s = settingsStore?.get() || { toggleShortcut: 'CommandOrControl+Shift+T', alertThreshold: 10, autoRefresh: true }
    if (!isValidAccelerator(s.toggleShortcut)) {
      s.toggleShortcut = 'CommandOrControl+Shift+T'
    }
    return s
  })

  ipcMain.handle('set-toggle-shortcut', (_event, shortcut: string) => {
    return updateToggleShortcut(shortcut)
  })

  ipcMain.handle('set-alert-threshold', (_event, threshold: number) => {
    settingsStore?.setAlertThreshold(threshold)
    return true
  })

  ipcMain.handle('set-auto-refresh', (_event, enabled: boolean) => {
    settingsStore?.setAutoRefresh(enabled)
    return true
  })
}

function registerShortcuts() {
  let shortcut = settingsStore?.getToggleShortcut() || 'CommandOrControl+Shift+T'
  if (!isValidAccelerator(shortcut)) {
    shortcut = 'CommandOrControl+Shift+T'
    settingsStore?.setToggleShortcut(shortcut)
  }
  updateToggleShortcut(shortcut)
}

function updateToggleShortcut(newShortcut: string): boolean {
  if (currentShortcut) {
    globalShortcut.unregister(currentShortcut)
  }

  const ret = globalShortcut.register(newShortcut, () => {
    toggleWindow()
  })

  if (ret) {
    currentShortcut = newShortcut
    settingsStore?.setToggleShortcut(newShortcut)
    return true
  } else {
    console.error('Shortcut registration failed:', newShortcut)
    if (currentShortcut) {
      globalShortcut.register(currentShortcut, () => toggleWindow())
    }
    return false
  }
}

// 自动刷新定时器
let autoRefreshTimer: NodeJS.Timeout | null = null

function setupAutoRefresh() {
  if (autoRefreshTimer) {
    clearInterval(autoRefreshTimer)
    autoRefreshTimer = null
  }
  
  if (settingsStore?.getAutoRefresh()) {
    // 每5分钟刷新一次
    autoRefreshTimer = setInterval(() => {
      refreshAllBalances()
    }, 5 * 60 * 1000)
  }
}

app.whenReady().then(async () => {
  // 加载平台适配器
  platforms = await loadPlatforms()
  
  settingsStore = new SettingsStore()
  tokenStore = new TokenStore()
  
  createWindow()
  createTray()
  registerIpcHandlers()
  registerShortcuts()
  setupAutoRefresh()
  
  // 启动时刷新所有余额
  refreshAllBalances()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  if (autoRefreshTimer) {
    clearInterval(autoRefreshTimer)
  }
})
