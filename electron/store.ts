import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'

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

export class TokenStore {
  private keys: KeyConfig[] = []
  private filePath: string

  constructor() {
    const userDataPath = app.getPath('userData')
    this.filePath = path.join(userDataPath, 'token-keys.json')
    this.load()
  }

  private load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const data = fs.readFileSync(this.filePath, 'utf-8')
        const parsed = JSON.parse(data)
        this.keys = Array.isArray(parsed) ? parsed : []
      }
    } catch (e) {
      console.error('Failed to load token keys:', e)
      this.keys = []
    }
  }

  private save() {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.keys, null, 2), 'utf-8')
    } catch (e) {
      console.error('Failed to save token keys:', e)
    }
  }

  getKeys(): KeyConfig[] {
    return this.keys
  }

  getKey(id: string): KeyConfig | undefined {
    return this.keys.find(k => k.id === id)
  }

  addKey(platform: string, key: string, label: string): KeyConfig {
    const newKey: KeyConfig = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2, 9),
      platform,
      key,
      label: label || `${platform}-${this.keys.filter(k => k.platform === platform).length + 1}`,
      createdAt: Date.now(),
    }
    this.keys.push(newKey)
    this.save()
    return newKey
  }

  deleteKey(id: string): boolean {
    const index = this.keys.findIndex(k => k.id === id)
    if (index !== -1) {
      this.keys.splice(index, 1)
      this.save()
      return true
    }
    return false
  }

  setBalance(id: string, balance: BalanceResult): void {
    const key = this.keys.find(k => k.id === id)
    if (key) {
      key.balance = balance
      this.save()
    }
  }
}

export class SettingsStore {
  private settings: AppSettings
  private filePath: string

  constructor() {
    const userDataPath = app.getPath('userData')
    this.filePath = path.join(userDataPath, 'token-settings.json')
    this.settings = {
      toggleShortcut: 'CommandOrControl+Shift+T',
      alertThreshold: 10,
      autoRefresh: true,
    }
    this.load()
  }

  private load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const data = fs.readFileSync(this.filePath, 'utf-8')
        const parsed = JSON.parse(data)
        this.settings = { ...this.settings, ...parsed }
      }
    } catch (e) {
      console.error('Failed to load settings:', e)
    }
  }

  private save() {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.settings, null, 2), 'utf-8')
    } catch (e) {
      console.error('Failed to save settings:', e)
    }
  }

  get(): AppSettings {
    return { ...this.settings }
  }

  getToggleShortcut(): string {
    return this.settings.toggleShortcut
  }

  setToggleShortcut(shortcut: string): void {
    this.settings.toggleShortcut = shortcut
    this.save()
  }

  getAlertThreshold(): number {
    return this.settings.alertThreshold
  }

  setAlertThreshold(threshold: number): void {
    this.settings.alertThreshold = threshold
    this.save()
  }

  getAutoRefresh(): boolean {
    return this.settings.autoRefresh
  }

  setAutoRefresh(enabled: boolean): void {
    this.settings.autoRefresh = enabled
    this.save()
  }
}
