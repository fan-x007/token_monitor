import { contextBridge, ipcRenderer } from 'electron'

export interface BalanceData {
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

export interface BalanceResult {
  success: boolean
  data?: BalanceData
  error?: string
}

export interface KeyConfig {
  id: string
  platform: string
  key: string
  label: string
  createdAt: number
  balance?: BalanceResult
}

export interface PlatformInfo {
  id: string
  name: string
  description: string
  website: string
  rechargeUrl: string
  currency: string
  credentialType: string
  credentialHint: string
  isTokenQuota: boolean
  note?: string
}

export interface AppSettings {
  toggleShortcut: string
  alertThreshold: number
  autoRefresh: boolean
}

export const tokenApi = {
  getPlatforms: (): Promise<PlatformInfo[]> => ipcRenderer.invoke('get-platforms'),
  getKeys: (): Promise<KeyConfig[]> => ipcRenderer.invoke('get-keys'),
  addKey: (platform: string, key: string, label: string): Promise<KeyConfig | null> => 
    ipcRenderer.invoke('add-key', platform, key, label),
  deleteKey: (id: string): Promise<boolean> => ipcRenderer.invoke('delete-key', id),
  refreshBalance: (id: string): Promise<KeyConfig | null> => ipcRenderer.invoke('refresh-balance', id),
  refreshAllBalances: (): Promise<boolean> => ipcRenderer.invoke('refresh-all-balances'),
  openRecharge: (platformId: string): Promise<boolean> => ipcRenderer.invoke('open-recharge', platformId),
  hideWindow: (): Promise<boolean> => ipcRenderer.invoke('hide-window'),
  startShortcutRecording: (): Promise<boolean> => ipcRenderer.invoke('start-shortcut-recording'),
  stopShortcutRecording: (): Promise<boolean> => ipcRenderer.invoke('stop-shortcut-recording'),

  onShortcutRecordingKeys: (callback: (keys: string[]) => void) => {
    ipcRenderer.on('shortcut-recording-keys', (_event, keys) => callback(keys))
  },

  onShortcutRecorded: (callback: (accelerator: string, cancelled: boolean) => void) => {
    ipcRenderer.on('shortcut-recorded', (_event, accelerator, cancelled) => callback(accelerator, cancelled))
  },
  
  onBalancesUpdated: (callback: (keys: KeyConfig[]) => void) => {
    ipcRenderer.on('balances-updated', (_event, keys) => callback(keys))
  },
  
  // Settings
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke('get-settings'),
  setToggleShortcut: (shortcut: string): Promise<boolean> => ipcRenderer.invoke('set-toggle-shortcut', shortcut),
  setAlertThreshold: (threshold: number): Promise<boolean> => ipcRenderer.invoke('set-alert-threshold', threshold),
  setAutoRefresh: (enabled: boolean): Promise<boolean> => ipcRenderer.invoke('set-auto-refresh', enabled),
}

contextBridge.exposeInMainWorld('tokenApi', tokenApi)
