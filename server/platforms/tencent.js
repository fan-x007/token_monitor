const https = require('https');
const crypto = require('crypto');

const PLATFORM_ID = 'tencent';
const PLATFORM_NAME = '腾讯云混元';
const API_HOST = 'billing.tencentcloudapi.com';
const SERVICE = 'billing';
const VERSION = '2018-07-09';
const ACTION = 'DescribeAccountBalance';

// 腾讯云 TC3-HMAC-SHA256 签名算法
function sha256(message) {
  return crypto.createHash('sha256').update(message).digest('hex');
}

function hmacSha256(key, message) {
  return crypto.createHmac('sha256', key).update(message).digest();
}

function getDate(timestamp) {
  const date = new Date(timestamp * 1000);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function signTC3(secretId, secretKey, service, host, payload, timestamp) {
  const date = getDate(timestamp);
  
  // 步骤1：拼接规范请求串
  const httpRequestMethod = 'POST';
  const canonicalUri = '/';
  const canonicalQueryString = '';
  const canonicalHeaders = `content-type:application/json\nhost:${host}\n`;
  const signedHeaders = 'content-type;host';
  const hashedRequestPayload = sha256(payload);
  
  const canonicalRequest = `${httpRequestMethod}\n${canonicalUri}\n${canonicalQueryString}\n${canonicalHeaders}\n${signedHeaders}\n${hashedRequestPayload}`;
  
  // 步骤2：拼接待签名字符串
  const credentialScope = `${date}/${service}/tc3_request`;
  const hashedCanonicalRequest = sha256(canonicalRequest);
  const stringToSign = `TC3-HMAC-SHA256\n${timestamp}\n${credentialScope}\n${hashedCanonicalRequest}`;
  
  // 步骤3：计算签名
  const secretDate = hmacSha256(`TC3${secretKey}`, date);
  const secretService = hmacSha256(secretDate, service);
  const secretSigning = hmacSha256(secretService, 'tc3_request');
  const signature = crypto.createHmac('sha256', secretSigning).update(stringToSign).digest('hex');
  
  // 步骤4：拼接Authorization
  const authorization = `TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  
  return authorization;
}

module.exports = {
  id: PLATFORM_ID,
  name: PLATFORM_NAME,
  description: '腾讯云混元大模型（查询腾讯云账户余额）',
  website: 'https://console.cloud.tencent.com/tokenhub/apikey',
  currency: 'CNY',
  credentialType: 'tencent_cloud',
  credentialHint: '需要腾讯云 SecretId 和 SecretKey，格式：SecretId|SecretKey',
  
  async getBalance(apiKey) {
    // apiKey 格式: SecretId|SecretKey
    const parts = apiKey.split('|');
    if (parts.length !== 2) {
      throw new Error('凭证格式错误，请使用格式：SecretId|SecretKey');
    }
    
    const secretId = parts[0].trim();
    const secretKey = parts[1].trim();
    
    if (!secretId || !secretKey) {
      throw new Error('SecretId 和 SecretKey 不能为空');
    }
    
    return new Promise((resolve, reject) => {
      const timestamp = Math.floor(Date.now() / 1000);
      const payload = JSON.stringify({});
      
      const authorization = signTC3(secretId, secretKey, SERVICE, API_HOST, payload, timestamp);
      
      const options = {
        hostname: API_HOST,
        path: '/',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Host': API_HOST,
          'X-TC-Action': ACTION,
          'X-TC-Version': VERSION,
          'X-TC-Timestamp': timestamp.toString(),
          'Authorization': authorization
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
            
            if (res.statusCode === 200 && result.Response && !result.Response.Error) {
              const response = result.Response;
              
              // 余额单位是分，转换为元
              const realBalance = (response.RealBalance || 0) / 100;
              const cashBalance = (response.CashAccountBalance || 0) / 100;
              const presentBalance = (response.PresentAccountBalance || 0) / 100;
              const incomeBalance = (response.IncomeIntoAccountBalance || 0) / 100;
              const creditAmount = (response.CreditAmount || 0) / 100;
              const oweAmount = (response.OweAmount || 0) / 100;
              
              // 赠金 = 赠送账户 + 收益转入
              const grantedBalance = presentBalance + incomeBalance;
              
              resolve({
                isAvailable: realBalance > 0,
                currency: 'CNY',
                totalBalance: realBalance,
                grantedBalance: grantedBalance,
                toppedUpBalance: cashBalance,
                creditAmount: creditAmount,
                oweAmount: oweAmount,
                raw: response
              });
            } else {
              const error = result.Response?.Error || {};
              const errorCode = error.Code || result.code || 'Unknown';
              const errorMsg = error.Message || result.message || data;
              
              if (errorCode === 'AuthFailure.SignatureFailure' ||
                  errorCode === 'AuthFailure.SecretIdNotFound' ||
                  errorCode === 'AuthFailure.InvalidSecretId' ||
                  errorCode === 'UnauthorizedOperation' ||
                  res.statusCode === 401 ||
                  res.statusCode === 403) {
                reject(new Error(`SecretId无效或签名错误 (${errorCode})，请检查 SecretId 和 SecretKey 是否正确`));
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
      
      req.write(payload);
      req.end();
    });
  }
};
