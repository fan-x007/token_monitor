const https = require('https');

const PLATFORM_ID = 'deepseek';
const PLATFORM_NAME = 'DeepSeek';
const API_BASE = 'api.deepseek.com';

module.exports = {
  id: PLATFORM_ID,
  name: PLATFORM_NAME,
  description: '深度求索 DeepSeek 开放平台',
  website: 'https://platform.deepseek.com/api_keys',
  currency: 'CNY',
  
  async getBalance(apiKey) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: API_BASE,
        path: '/user/balance',
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        timeout: 10000
      };
      
      const req = https.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const result = JSON.parse(data);
            
            if (res.statusCode === 200) {
              // 格式化返回数据
              const balanceInfo = result.balance_infos && result.balance_infos[0] 
                ? result.balance_infos[0] 
                : { currency: 'CNY', total_balance: '0', granted_balance: '0', topped_up_balance: '0' };
              
              resolve({
                isAvailable: result.is_available,
                currency: balanceInfo.currency,
                totalBalance: parseFloat(balanceInfo.total_balance),
                grantedBalance: parseFloat(balanceInfo.granted_balance),
                toppedUpBalance: parseFloat(balanceInfo.topped_up_balance),
                raw: result
              });
            } else if (res.statusCode === 401) {
              reject(new Error('API Key无效，请检查您的Key是否正确'));
            } else {
              reject(new Error(`请求失败 (${res.statusCode}): ${result.error?.message || data}`));
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
