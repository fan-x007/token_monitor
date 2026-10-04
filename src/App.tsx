import { useState, useEffect, useRef } from 'react'

declare global {
  interface Window {
    tokenApi: any
  }
}

interface BalanceData {
  isAvailable: boolean
  currency: string
  totalBalance: number
  grantedBalance: number
  toppedUpBalance: number
  isTokenQuota?: boolean
  remainingRequests?: number
  remainingTokens?: number
  note?: string
}

interface BalanceResult {
  success: boolean
  data?: BalanceData
  error?: string
}

interface KeyConfig {
  id: string
  platform: string
  key: string
  label: string
  createdAt: number
  balance?: BalanceResult
}

interface PlatformInfo {
  id: string
  name: string
  description: string
  website: string
  currency: string
  credentialType: string
  credentialHint: string
  isTokenQuota: boolean
  note?: string
}

interface AppSettings {
  toggleShortcut: string
  alertThreshold: number
  autoRefresh: boolean
}

function App() {
  const [platforms, setPlatforms] = useState<PlatformInfo[]>([])
  const [keys, setKeys] = useState<KeyConfig[]>([])
  const [settings, setSettings] = useState<AppSettings>({
    toggleShortcut: 'CommandOrControl+Shift+T',
    alertThreshold: 10,
    autoRefresh: true,
  })
  const [selectedPlatform, setSelectedPlatform] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [accessKeyId, setAccessKeyId] = useState('')
  const [accessKeySecret, setAccessKeySecret] = useState('')
  const [label, setLabel] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [shortcutInput, setShortcutInput] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [recordingKeys, setRecordingKeys] = useState<string[]>([])
  const [thresholdInput, setThresholdInput] = useState(10)
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const toastTimerRef = useRef<NodeJS.Timeout | null>(null)
  const isRecordingRef = useRef(false)

  useEffect(() => {
    isRecordingRef.current = isRecording
  }, [isRecording])

  useEffect(() => {
    loadData()

    if (window.tokenApi?.onBalancesUpdated) {
      window.tokenApi.onBalancesUpdated((updatedKeys: KeyConfig[]) => {
        setKeys(updatedKeys)
      })
    }

    if (window.tokenApi?.onShortcutRecordingKeys) {
      window.tokenApi.onShortcutRecordingKeys((keys: string[]) => {
        setRecordingKeys(keys)
      })
    }

    if (window.tokenApi?.onShortcutRecorded) {
      window.tokenApi.onShortcutRecorded((accelerator: string, cancelled: boolean) => {
        setIsRecording(false)
        setRecordingKeys([])
        if (cancelled) return
        if (accelerator) {
          setShortcutInput(accelerator)
        } else {
          showToast('快捷键需要至少一个修饰键（Ctrl/Alt/Shift）+ 一个普通键', 'error')
        }
      })
    }

    // ESC 关闭窗口（录制中由主进程处理，不隐藏窗口）
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isRecordingRef.current) {
        window.tokenApi?.hideWindow()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const formatShortcutDisplay = (accelerator: string): string => {
    return accelerator
      .replace(/CommandOrControl/g, 'Ctrl')
      .replace(/\+/g, ' + ')
  }

  const formatKeyForDisplay = (key: string): string =>
    key === 'CommandOrControl' ? 'Ctrl' : key

  const startRecording = () => {
    setRecordingKeys([])
    setIsRecording(true)
    window.tokenApi?.startShortcutRecording()
  }

  const loadData = async () => {
    try {
      const [plats, keyList, sets] = await Promise.all([
        window.tokenApi?.getPlatforms() || [],
        window.tokenApi?.getKeys() || [],
        window.tokenApi?.getSettings() || { toggleShortcut: 'CommandOrControl+Shift+T', alertThreshold: 10, autoRefresh: true },
      ])
      setPlatforms(plats)
      setKeys(keyList)
      setSettings(sets)
      setShortcutInput(sets.toggleShortcut)
      setThresholdInput(sets.alertThreshold)
      if (plats.length > 0 && !selectedPlatform) {
        setSelectedPlatform(plats[0].id)
      }
    } catch (e) {
      console.error('Load data failed:', e)
    }
  }

  const showToast = (msg: string, type = 'success') => {
    setToast({ msg, type })
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => setToast(null), 2500)
  }

  const handleAddKey = async () => {
    if (!selectedPlatform) {
      showToast('请选择平台', 'error')
      return
    }
    
    const platform = platforms.find(p => p.id === selectedPlatform)
    let keyValue = ''
    
    if (platform && platform.credentialType !== 'api_key') {
      if (!accessKeyId || !accessKeySecret) {
        const idLabel = platform.credentialType === 'tencent_cloud' ? 'SecretId' : 'AccessKey ID'
        const secretLabel = platform.credentialType === 'tencent_cloud' ? 'SecretKey' : 'AccessKey Secret'
        showToast(`请输入 ${idLabel} 和 ${secretLabel}`, 'error')
        return
      }
      keyValue = `${accessKeyId}|${accessKeySecret}`
    } else {
      if (!apiKey.trim()) {
        showToast('请输入 API Key', 'error')
        return
      }
      keyValue = apiKey.trim()
    }
    
    setLoading(true)
    try {
      const result = await window.tokenApi?.addKey(selectedPlatform, keyValue, label.trim())
      if (result) {
        showToast('添加成功，正在查询余额...')
        setApiKey('')
        setAccessKeyId('')
        setAccessKeySecret('')
        setLabel('')
      }
    } catch (e) {
      showToast(`添加失败: ${(e as Error).message}`, 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteKey = async (id: string) => {
    try {
      await window.tokenApi?.deleteKey(id)
      showToast('已删除')
    } catch (e) {
      showToast('删除失败', 'error')
    }
  }

  const handleRefreshBalance = async (id: string) => {
    try {
      await window.tokenApi?.refreshBalance(id)
    } catch (e) {
      showToast('刷新失败', 'error')
    }
  }

  const handleRefreshAll = async () => {
    try {
      await window.tokenApi?.refreshAllBalances()
      showToast('已刷新所有余额')
    } catch (e) {
      showToast('刷新失败', 'error')
    }
  }

  const handleOpenRecharge = (platformId: string) => {
    window.tokenApi?.openRecharge(platformId)
  }

  const handleSaveShortcut = async () => {
    try {
      const success = await window.tokenApi?.setToggleShortcut(shortcutInput)
      if (success) {
        setSettings(s => ({ ...s, toggleShortcut: shortcutInput }))
        showToast('快捷键已更新')
      } else {
        showToast('快捷键设置失败，请换一个', 'error')
      }
    } catch (e) {
      showToast('设置失败', 'error')
    }
  }

  const handleSaveThreshold = async () => {
    try {
      await window.tokenApi?.setAlertThreshold(thresholdInput)
      setSettings(s => ({ ...s, alertThreshold: thresholdInput }))
      showToast('告警阈值已更新')
    } catch (e) {
      showToast('设置失败', 'error')
    }
  }

  const handleToggleAutoRefresh = async () => {
    try {
      const newVal = !settings.autoRefresh
      await window.tokenApi?.setAutoRefresh(newVal)
      setSettings(s => ({ ...s, autoRefresh: newVal }))
      showToast(newVal ? '已开启自动刷新' : '已关闭自动刷新')
    } catch (e) {
      showToast('设置失败', 'error')
    }
  }

  const getPlatformIcon = (platformId: string) => {
    const icons: Record<string, string> = {
      deepseek: '🧠',
      kimi: '🌙',
      zhipu: '💎',
      bailian: '☁️',
      tencent: '🐧',
      openai: '🤖',
      anthropic: '🗣️',
    }
    return icons[platformId] || '🔑'
  }

  const formatTokenCount = (tokens: number | null | undefined) => {
    if (tokens === null || tokens === undefined) return '--'
    if (tokens >= 1000000) return (tokens / 1000000).toFixed(2) + 'M'
    if (tokens >= 1000) return (tokens / 1000).toFixed(1) + 'K'
    return tokens.toLocaleString('zh-CN')
  }

  const currentPlatform = platforms.find(p => p.id === selectedPlatform)
  const needsCloudKey = currentPlatform && currentPlatform.credentialType !== 'api_key'
  const isTencent = currentPlatform?.credentialType === 'tencent_cloud'
  
  const idLabel = isTencent ? 'SecretId' : 'AccessKey ID'
  const secretLabel = isTencent ? 'SecretKey' : 'AccessKey Secret'

  // 计算总余额（仅CNY）
  const totalCny = keys
    .filter(k => k.balance?.success && k.balance.data?.currency === 'CNY')
    .reduce((sum, k) => sum + (k.balance!.data!.totalBalance || 0), 0)
  
  const availableCount = keys.filter(k => k.balance?.success && k.balance.data?.isAvailable).length
  const warningCount = keys.filter(k => {
    if (!k.balance?.success || !k.balance.data) return false
    const d = k.balance.data
    if (d.isTokenQuota) return false
    return d.currency === 'CNY' && d.totalBalance < settings.alertThreshold
  }).length

  return (
    <div className="app">
      {/* Header */}
      <div className="header drag-region">
        <div className="header-content">
          <div className="logo">
            <div className="logo-icon">💰</div>
            <div className="logo-text">
              <h1>Token Monitor</h1>
              <p>全平台AI余额监控</p>
            </div>
          </div>
          <div className="header-actions no-drag">
            <button className="btn btn-icon" title="刷新" onClick={handleRefreshAll}>
              <span className="icon">🔄</span>
            </button>
            <button className="btn btn-icon" title="设置" onClick={() => setShowSettings(!showSettings)}>
              <span className="icon">⚙️</span>
            </button>
            <button className="btn btn-icon" title="关闭" onClick={() => window.tokenApi?.hideWindow()}>
              <span className="icon">✕</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main */}
      <div className="main">
        {/* Overview */}
        <div className="overview-section">
          <div className="overview-cards">
            <div className="overview-card total">
              <div className="overview-label">总余额</div>
              <div className="overview-value">¥ {totalCny.toFixed(2)}</div>
              <div className="overview-sub">所有平台合计</div>
            </div>
            <div className="overview-card">
              <div className="overview-label">已接入平台</div>
              <div className="overview-value">{new Set(keys.map(k => k.platform)).size}</div>
              <div className="overview-sub">个平台</div>
            </div>
            <div className="overview-card">
              <div className="overview-label">API Key</div>
              <div className="overview-value">{keys.length}</div>
              <div className="overview-sub">个密钥</div>
            </div>
            <div className={`overview-card ${warningCount > 0 ? 'warning' : ''}`}>
              <div className="overview-label">余额告警</div>
              <div className="overview-value">{warningCount}</div>
              <div className="overview-sub">低于 ¥{settings.alertThreshold}</div>
            </div>
          </div>
        </div>

        {/* Add Key */}
        {!showSettings && (
          <div className="add-key-section">
            <div className="section-header">
              <h2>添加 API Key</h2>
              <p>添加您的AI平台API Key以监控余额</p>
            </div>
            
            <div className="form-group">
              <label>选择平台</label>
              <select
                value={selectedPlatform}
                onChange={(e) => setSelectedPlatform(e.target.value)}
                className="input"
              >
                {platforms.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            {needsCloudKey ? (
              <>
                <div className="form-group">
                  <label>{idLabel}</label>
                  <input
                    type="password"
                    value={accessKeyId}
                    onChange={(e) => setAccessKeyId(e.target.value)}
                    placeholder={`请输入${idLabel}`}
                    className="input"
                  />
                </div>
                <div className="form-group">
                  <label>{secretLabel}</label>
                  <input
                    type="password"
                    value={accessKeySecret}
                    onChange={(e) => setAccessKeySecret(e.target.value)}
                    placeholder={`请输入${secretLabel}`}
                    className="input"
                  />
                </div>
              </>
            ) : (
              <div className="form-group">
                <label>API Key</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="请输入您的API Key"
                  className="input"
                />
              </div>
            )}

            <div className="form-group">
              <label>备注名称（可选）</label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="例如：工作号、个人号"
                className="input"
              />
            </div>

            <button
              className="btn btn-primary btn-full"
              onClick={handleAddKey}
              disabled={loading}
            >
              {loading ? '添加中...' : '添加 Key'}
            </button>

            {currentPlatform && (
              <div className="platform-info">
                <strong>{currentPlatform.name}</strong> - {currentPlatform.description}
                <br />
                获取凭证: <a href={currentPlatform.website} onClick={(e) => e.preventDefault()}>{currentPlatform.website}</a>
                {currentPlatform.credentialType === 'aliyun_accesskey' && (
                  <><br /><span style={{ color: '#d97706' }}>⚠️ 注意：阿里云百炼需要使用 AccessKey（而非DashScope API Key）来查询账户余额</span></>
                )}
                {currentPlatform.credentialType === 'tencent_cloud' && (
                  <><br /><span style={{ color: '#d97706' }}>⚠️ 注意：腾讯云混元需要使用云API密钥 SecretId/SecretKey（而非混元API Key）来查询账户余额</span></>
                )}
              </div>
            )}
          </div>
        )}

        {/* Settings */}
        {showSettings && (
          <div className="add-key-section">
            <div className="section-header">
              <h2>设置</h2>
              <p>自定义 Token Monitor</p>
            </div>

            <div className="form-group">
              <label>唤醒快捷键</label>
              <div className={`shortcut-recorder ${isRecording ? 'recording' : ''}`} onClick={startRecording}>
                {isRecording ? (
                  <div className="recording-indicator">
                    <span className="recording-dot"></span>
                    {recordingKeys.length > 0
                      ? recordingKeys.map(formatKeyForDisplay).join(' + ')
                      : '按下你想要的快捷键（Esc 取消）'
                    }
                  </div>
                ) : (
                  <div className="shortcut-display">
                    <span className="shortcut-keys">
                      {shortcutInput ? formatShortcutDisplay(shortcutInput) : '未设置'}
                    </span>
                    <span className="shortcut-hint">点击录制</span>
                  </div>
                )}
              </div>
              <button className="btn btn-secondary btn-full" onClick={handleSaveShortcut} style={{ marginTop: 8 }} disabled={!shortcutInput || shortcutInput === settings.toggleShortcut}>
                保存快捷键
              </button>
            </div>

            <div className="form-group">
              <label>余额告警阈值 (元)</label>
              <input
                type="number"
                value={thresholdInput}
                onChange={(e) => setThresholdInput(parseFloat(e.target.value) || 0)}
                className="input"
              />
              <button className="btn btn-secondary btn-full" onClick={handleSaveThreshold} style={{ marginTop: 8 }}>
                保存阈值
              </button>
            </div>

            <div className="form-group">
              <label>自动刷新（每5分钟）</label>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={settings.autoRefresh}
                  onChange={handleToggleAutoRefresh}
                />
                <span className="slider"></span>
              </label>
            </div>

            <div className="platform-info" style={{ marginTop: 12 }}>
              <strong>使用说明</strong><br />
              • 按 <code>{formatShortcutDisplay(settings.toggleShortcut)}</code> 快速唤起窗口<br />
              • 点击托盘图标或右键菜单也可以显示窗口<br />
              • 窗口失焦会自动隐藏<br />
              • 按 ESC 键关闭窗口
            </div>
          </div>
        )}

        {/* Balance List */}
        <div className="balance-section">
          <div className="section-header">
            <h2>余额监控</h2>
            <div className="section-actions">
              <label className="auto-refresh">
                <input
                  type="checkbox"
                  checked={settings.autoRefresh}
                  onChange={handleToggleAutoRefresh}
                />
                自动刷新
              </label>
            </div>
          </div>

          {keys.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📭</div>
              <div className="empty-text">还没有添加任何 Key</div>
              <div className="empty-hint">添加您的第一个 API Key 开始监控</div>
            </div>
          ) : (
            <div className="balance-list">
              {keys.map(keyConfig => {
                const platform = platforms.find(p => p.id === keyConfig.platform)
                const balance = keyConfig.balance
                const isTokenQuota = platform?.isTokenQuota || balance?.data?.isTokenQuota
                const isWarning = balance?.success && !isTokenQuota &&
                  balance.data!.currency === 'CNY' &&
                  balance.data!.totalBalance < settings.alertThreshold
                
                const d = balance?.data
                
                return (
                  <div key={keyConfig.id} className={`balance-card ${isWarning ? 'warning' : ''} ${balance?.success === false ? 'error' : ''}`}>
                    <div className="balance-header">
                      <div className="platform-info-row">
                        <span className="platform-icon">{getPlatformIcon(keyConfig.platform)}</span>
                        <div className="platform-name">
                          <div className="platform-title">{platform?.name || keyConfig.platform}</div>
                          <div className="key-label">{keyConfig.label}</div>
                        </div>
                      </div>
                      <div className="balance-actions">
                        <button className="icon-btn" title="刷新" onClick={() => handleRefreshBalance(keyConfig.id)}>🔄</button>
                        <button className="icon-btn" title="删除" onClick={() => handleDeleteKey(keyConfig.id)}>🗑️</button>
                      </div>
                    </div>
                    
                    {!balance ? (
                      <div className="balance-amount">
                        <div className="balance-main"><span className="currency">--</span> --</div>
                        <div className="balance-status" style={{ background: '#f3f4f6', color: '#9ca3af' }}>等待查询</div>
                      </div>
                    ) : !balance.success ? (
                      <div className="error-state">
                        <div className="error-icon">❌</div>
                        <div className="error-text">查询失败</div>
                        <div className="error-hint">{balance.error}</div>
                      </div>
                    ) : isTokenQuota ? (
                      <div className="balance-amount">
                        <div className="balance-main">
                          <span className="currency">Tokens</span>
                          {formatTokenCount(d?.remainingTokens ?? d?.totalBalance)}
                        </div>
                        <div className={`balance-status ${d?.isAvailable ? 'available' : 'unavailable'}`}>
                          {d?.isAvailable ? '✓' : '✗'} {d?.isAvailable ? '可用' : '已达上限'}
                        </div>
                        <div className="balance-details">
                          {d?.remainingRequests !== undefined && (
                            <div className="detail-item">
                              <span className="detail-label">剩余请求数</span>
                              <span className="detail-value">{d.remainingRequests.toLocaleString()}</span>
                            </div>
                          )}
                        </div>
                        {d?.note && <div className="token-note">{d.note}</div>}
                      </div>
                    ) : (
                      <div className="balance-amount">
                        <div className="balance-main">
                          <span className="currency">¥</span>
                          {d?.totalBalance.toFixed(2)}
                        </div>
                        <div className={`balance-status ${isWarning ? 'warning' : (d?.isAvailable ? 'available' : 'unavailable')}`}>
                          {isWarning ? '⚠ 余额偏低' : (d?.isAvailable ? '✓ 余额充足' : '✗ 余额不足')}
                        </div>
                        <div className="balance-details">
                          <div className="detail-item">
                            <span className="detail-label">充值余额</span>
                            <span className="detail-value">¥{d?.toppedUpBalance.toFixed(2)}</span>
                          </div>
                          <div className="detail-item">
                            <span className="detail-label">赠金余额</span>
                            <span className="detail-value">¥{d?.grantedBalance.toFixed(2)}</span>
                          </div>
                        </div>
                        <button
                          className="recharge-btn"
                          onClick={(e) => { e.stopPropagation(); handleOpenRecharge(keyConfig.platform) }}
                        >
                          💳 快速充值
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`toast toast-${toast.type}`}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}

export default App
