import * as crypto from 'crypto'
import { app } from 'electron'
import * as os from 'os'
import * as path from 'path'
import * as fs from 'fs'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const SALT_LENGTH = 16
const TAG_LENGTH = 16
const KEY_LENGTH = 32
const ITERATIONS = 100000

// 应用级固定盐值（与机器标识混合派生密钥）
const APP_SALT = 'token-monitor-v1-app-salt'

// 机器标识文件（首次运行生成并保存在 userData 下）
let cachedMachineKey: Buffer | null = null

function getMachineKeyPath(): string {
  return path.join(app.getPath('userData'), '.machine-key')
}

/**
 * 获取或生成机器密钥
 * 首次运行时生成并保存，后续从文件读取
 * 这样即使重装系统，只要 userData 还在就能解密
 */
function getMachineKey(): Buffer {
  if (cachedMachineKey) {
    return cachedMachineKey
  }

  const keyPath = getMachineKeyPath()

  if (fs.existsSync(keyPath)) {
    try {
      const keyHex = fs.readFileSync(keyPath, 'utf-8').trim()
      cachedMachineKey = Buffer.from(keyHex, 'hex')
      return cachedMachineKey
    } catch (e) {
      console.error('Failed to read machine key, regenerating:', e)
    }
  }

  // 生成新的机器密钥（结合主机名 + 随机数，确保唯一性）
  const randomBytes = crypto.randomBytes(32)
  const hostname = os.hostname()
  const keyMaterial = crypto
    .createHash('sha256')
    .update(randomBytes)
    .update(hostname)
    .update(APP_SALT)
    .digest()

  try {
    // 确保目录存在
    const dir = path.dirname(keyPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(keyPath, keyMaterial.toString('hex'), 'utf-8')
    // 尝试设置隐藏属性（Windows）
    try {
      fs.chmodSync(keyPath, 0o600)
    } catch {}
  } catch (e) {
    console.error('Failed to save machine key:', e)
  }

  cachedMachineKey = keyMaterial
  return cachedMachineKey
}

/**
 * 派生加密密钥
 * 使用 PBKDF2 从机器密钥 + 随机盐派生 AES-256 密钥
 */
function deriveKey(salt: Buffer): Buffer {
  const machineKey = getMachineKey()
  return crypto.pbkdf2Sync(machineKey, salt, ITERATIONS, KEY_LENGTH, 'sha256')
}

/**
 * 加密字符串
 * 返回格式: base64(salt + iv + tag + ciphertext)
 */
export function encrypt(plaintext: string): string {
  const salt = crypto.randomBytes(SALT_LENGTH)
  const iv = crypto.randomBytes(IV_LENGTH)
  const key = deriveKey(salt)

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()])
  const tag = cipher.getAuthTag()

  // salt(16) + iv(12) + tag(16) + ciphertext(...)
  const result = Buffer.concat([salt, iv, tag, encrypted])
  return result.toString('base64')
}

/**
 * 解密字符串
 * 输入格式: base64(salt + iv + tag + ciphertext)
 */
export function decrypt(ciphertextBase64: string): string {
  try {
    const data = Buffer.from(ciphertextBase64, 'base64')

    if (data.length < SALT_LENGTH + IV_LENGTH + TAG_LENGTH) {
      throw new Error('Invalid encrypted data format')
    }

    let offset = 0
    const salt = data.subarray(offset, offset + SALT_LENGTH)
    offset += SALT_LENGTH
    const iv = data.subarray(offset, offset + IV_LENGTH)
    offset += IV_LENGTH
    const tag = data.subarray(offset, offset + TAG_LENGTH)
    offset += TAG_LENGTH
    const encrypted = data.subarray(offset)

    const key = deriveKey(salt)

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(tag)

    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
    return decrypted.toString('utf-8')
  } catch (e) {
    console.error('Decryption failed:', e)
    throw new Error('解密失败，密钥数据可能已损坏或不是本机器生成')
  }
}

/**
 * 判断字符串是否像是已加密的数据（base64 格式 + 长度合理）
 * 用于兼容旧版未加密的数据
 */
export function isEncrypted(data: string): boolean {
  if (!data || data.length < 50) return false
  // 加密后 base64 长度约为: (16+12+16 + 原始长度) * 4/3
  // API Key 一般 20~100 字符，加密后 base64 大约 80~200 字符
  // 用正则判断是否是纯 base64 字符
  if (!/^[A-Za-z0-9+/=]+$/.test(data)) return false
  // 尝试解码并检查长度是否符合加密数据结构
  try {
    const buf = Buffer.from(data, 'base64')
    return buf.length >= SALT_LENGTH + IV_LENGTH + TAG_LENGTH + 8
  } catch {
    return false
  }
}
