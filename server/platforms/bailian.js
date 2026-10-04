const https = require('https');
const crypto = require('crypto');

const PLATFORM_ID = 'bailian';
const PLATFORM_NAME = '阿里云百炼';
const API_HOST = 'business.aliyuncs.com';
const API_VERSION = '2017-12-14';
const ACTION = 'QueryAccountBalance';

// 阿里云 RPC 签名方法（V1）
function sign(parameters, accessKeySecret) {
  // 1. 按参数名排序
  const sortedKeys = Object.keys(parameters).sort();
  
  // 2. 构造规范化查询字符串（使用 RFC 3986 编码）
  const canonicalizedQueryString = sortedKeys
    .map(key => {
      const encodedKey = percentEncode(key);
      const encodedValue = percentEncode(parameters[key]);
      return `${encodedKey}=${encodedValue}`;
    })
    .join('&');
  
  // 3. 构造待签名字符串
  const stringToSign = `GET&${percentEncode('/')}&${percentEncode(canonicalizedQueryString)}`;
  
  // 4. HMAC-SHA1 签名（Key后面要加&）
  const signature = crypto
    .createHmac('sha1', accessKeySecret + '&')
    .update(stringToSign, 'utf8')
    .digest('base64');
  
  return signature;
}

// RFC 3986 编码
function percentEncode(str) {
  return encodeURIComponent(str)
    .replace(/!/g, '%21')
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/\*/g, '%2A');
}

module.exports = {
  id: PLATFORM_ID,
  name: PLATFORM_NAME,
  description: '阿里云百炼大模型服务平台（查询阿里云账户余额）',
  website: 'https://billing-cost.console.aliyun.com/home',
  currency: 'CNY',
  credentialType: 'aliyun_accesskey',
  credentialHint: '需要阿里云 AccessKey ID 和 AccessKey Secret，格式：AccessKeyID|AccessKeySecret',
  
  async getBalance(apiKey) {
    // apiKey 格式: AccessKeyID|AccessKeySecret
    const parts = apiKey.split('|');
    if (parts.length !== 2) {
      throw new Error('凭证格式错误，请使用格式：AccessKeyID|AccessKeySecret');
    }
    
    const accessKeyId = parts[0].trim();
    const accessKeySecret = parts[1].trim();
    
    if (!accessKeyId || !accessKeySecret) {
      throw new Error('AccessKey ID 和 AccessKey Secret 不能为空');
    }
    
    return new Promise((resolve, reject) => {
      // 构造公共参数
      const params = {
        Action: ACTION,
        Version: API_VERSION,
        Format: 'JSON',
        AccessKeyId: accessKeyId,
        SignatureMethod: 'HMAC-SHA1',
        SignatureVersion: '1.0',
        SignatureNonce: crypto.randomBytes(16).toString('hex'),
        Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
      };
      
      // 签名
      const signature = sign(params, accessKeySecret);
      params.Signature = signature;
      
      // 构造查询字符串
      const queryString = Object.keys(params)
        .sort()
        .map(key => `${percentEncode(key)}=${percentEncode(params[key])}`)
        .join('&');
      
      const options = {
        hostname: API_HOST,
        path: `/?${queryString}`,
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'x-acs-action': ACTION,
          'x-acs-version': API_VERSION
        },
        timeout: 15000
      };
      
      const req = https.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const result = JSON.parse(data);
            
            if (res.statusCode === 200 && result.Success === true) {
              const dataObj = result.Data || {};
              const availableAmount = parseFloat(dataObj.AvailableAmount || 0);
              const availableCashAmount = parseFloat(dataObj.AvailableCashAmount || 0);
              const creditAmount = parseFloat(dataObj.CreditAmount || 0);
              const mybankCreditAmount = parseFloat(dataObj.MybankCreditAmount || 0);
              const couponAmount = parseFloat(dataObj.CouponAmount || 0);
              const voucherAmount = parseFloat(dataObj.VoucherAmount || 0);
              
              // 赠金/代金券总额
              const grantedBalance = couponAmount + voucherAmount + creditAmount + mybankCreditAmount;
              
              resolve({
                isAvailable: availableAmount > 0,
                currency: 'CNY',
                totalBalance: availableAmount,
                grantedBalance: grantedBalance,
                toppedUpBalance: availableCashAmount,
                raw: result
              });
            } else {
              const errorCode = result.Code || result.code || 'Unknown';
              const errorMsg = result.Message || result.message || result.RequestId || data;
              
              if (errorCode === 'InvalidAccessKeyId.NotFound' || 
                  errorCode === 'SignatureDoesNotMatch' ||
                  errorCode === 'IncompleteSignature' ||
                  errorCode === 'InvalidAccessKeyId' ||
                  res.statusCode === 401 ||
                  res.statusCode === 403) {
                reject(new Error(`AccessKey无效 (${errorCode})，请检查 AccessKey ID 和 Secret 是否正确`));
              } else if (errorCode === 'Forbidden' || errorCode === 'NoPermission') {
                reject(new Error('权限不足，请确保该AccessKey拥有查询账户余额的权限'));
              } else {
                reject(new Error(`请求失败 (${errorCode}): ${errorMsg}`));
              }
            }
          } catch (e) {
            reject(new Error(`解析响应失败: ${e.message}`));
          }
        });
      });
      
      req.on('error', (e) => {
        reject(new Error(`网络错误: ${e.message}`));
      });
      
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('请求超时，请检查网络连接'));
      });
      
      req.end();
    });
  }
};
