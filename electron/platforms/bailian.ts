import * as https from 'https'
import * as crypto from 'crypto'

const PLATFORM_ID = 'bailian'
const PLATFORM_NAME = '阿里云百炼'
const API_HOST = 'business.aliyuncs.com'
const API_VERSION = '2017-12-14'
const API_ACTION = 'QueryAccountBalance'

function hmac(type: string, key: string | Buffer, content: string): Buffer {
  return crypto.createHmac(type, key).update(content, 'utf8').digest()
}

function encodeRfc3986(str: string): string {
  return encodeURIComponent(str)
    .replace(/!/g, '%21')
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/\*/g, '%2A')
}

const adapter = {
  id: PLATFORM_ID,
  name: PLATFORM_NAME,
  description: '阿里云百炼大模型平台（查询阿里云账户余额）',
  website: 'https://bailian.console.aliyun.com/#/api-key',
  rechargeUrl: 'https://billing-cost.console.aliyun.com/fortune/fund-management/recharge',
  currency: 'CNY',
  credentialType: 'aliyun_accesskey',
  credentialHint: '需要阿里云 AccessKey ID 和 AccessKey Secret，格式：AccessKeyId|AccessKeySecret',
  isTokenQuota: false,
  
  getBalance(apiKey: string): Promise<any> {
    const parts = apiKey.split('|')
    if (parts.length !== 2) {
      return Promise.reject(new Error('凭证格式错误，请使用格式：AccessKeyId|AccessKeySecret'))
    }
    
    const accessKeyId = parts[0].trim()
    const accessKeySecret = parts[1].trim()
    
    if (!accessKeyId || !accessKeySecret) {
      return Promise.reject(new Error('AccessKey ID 和 AccessKey Secret 不能为空'))
    }
    
    return new Promise((resolve, reject) => {
      const timestamp = new Date().toISOString().replace(/\.\d+Z$/, 'Z')
      
      // 构建请求参数
      const params: Record<string, string> = {
        Format: 'JSON',
        Version: API_VERSION,
        AccessKeyId: accessKeyId,
        SignatureMethod: 'HMAC-SHA1',
        Timestamp: timestamp,
        SignatureVersion: '1.0',
        SignatureNonce: crypto.randomBytes(16).toString('hex'),
        Action: API_ACTION,
      }
      
      // 排序参数
      const sortedKeys = Object.keys(params).sort()
      
      // 构造规范化字符串
      const canonicalizedQueryString = sortedKeys
        .map(key => `${encodeRfc3986(key)}=${encodeRfc3986(params[key])}`)
        .join('&')
      
      const stringToSign = `GET&${encodeRfc3986('/')}&${encodeRfc3986(canonicalizedQueryString)}`
      
      // 计算签名
      const signature = hmac('sha1', accessKeySecret + '&', stringToSign).toString('base64')
      
      // 构建最终URL
      const queryString = sortedKeys
        .map(key => `${encodeRfc3986(key)}=${encodeRfc3986(params[key])}`)
        .join('&')
      
      const fullPath = `/?${queryString}&Signature=${encodeRfc3986(signature)}`
      
      const options = {
        hostname: API_HOST,
        path: fullPath,
        method: 'GET',
        timeout: 10000
      }
      
      const req = https.request(options, (res) => {
        let data = ''
        
        res.on('data', (chunk) => {
          data += chunk
        })
        
        res.on('end', () => {
          try {
            const result = JSON.parse(data)
            
            if (res.statusCode === 200 && result.Success === true) {
              const dataObj = result.Data || {}
              const availableAmount = parseFloat(dataObj.AvailableAmount || 0)
              const availableCashAmount = parseFloat(dataObj.AvailableCashAmount || 0)
              const creditAmount = parseFloat(dataObj.CreditAmount || 0)
              const mybankCreditAmount = parseFloat(dataObj.MybankCreditAmount || 0)
              const couponAmount = parseFloat(dataObj.CouponAmount || 0)
              const voucherAmount = parseFloat(dataObj.VoucherAmount || 0)

              const grantedBalance = couponAmount + voucherAmount + creditAmount + mybankCreditAmount

              resolve({
                isAvailable: availableAmount > 0,
                currency: 'CNY',
                totalBalance: availableAmount,
                grantedBalance: grantedBalance,
                toppedUpBalance: availableCashAmount,
                raw: result
              })
            } else {
              const errorCode = result.Code || result.code || 'Unknown'
              const errorMsg = result.Message || result.message || result.RequestId || data

              if (errorCode === 'InvalidAccessKeyId.NotFound' ||
                  errorCode === 'SignatureDoesNotMatch' ||
                  errorCode === 'IncompleteSignature' ||
                  errorCode === 'InvalidAccessKeyId' ||
                  res.statusCode === 401 ||
                  res.statusCode === 403) {
                reject(new Error(`AccessKey无效 (${errorCode})，请检查 AccessKey ID 和 Secret 是否正确`))
              } else if (errorCode === 'Forbidden' || errorCode === 'NoPermission') {
                reject(new Error('权限不足，请确保该AccessKey拥有查询账户余额的权限'))
              } else {
                reject(new Error(`请求失败 (${errorCode}): ${errorMsg}`))
              }
            }
          } catch (e) {
            reject(new Error(`解析响应失败: ${(e as Error).message}`))
          }
        })
      })
      
      req.on('error', (e) => {
        reject(new Error(`网络错误: ${e.message}`))
      })
      
      req.on('timeout', () => {
        req.destroy()
        reject(new Error('请求超时，请检查网络连接'))
      })
      
      req.end()
    })
  }
}

export default adapter
