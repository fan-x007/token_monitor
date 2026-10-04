const https = require('https');

const PLATFORM_ID = 'kimi';
const PLATFORM_NAME = 'Kimi';
const API_BASE = 'api.moonshot.cn';

module.exports = {
  id: PLATFORM_ID,
  name: PLATFORM_NAME,
  description: '月之暗面 Kimi 开放平台',
  website: 'https://platform.kimi.com/console/api-keys',
  currency: 'CNY',
  
  async getBalance(apiKey) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: API_BASE,
        path: '/v1/users/me/balance',
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
            
            if (res.statusCode === 200 && result.code === 0) {
              const balanceData = result.data || {};
              const availableBalance = balanceData.available_balance || 0;
              const voucherBalance = balanceData.voucher_balance || 0;
              const cashBalance = balanceData.cash_balance || 0;
              
              resolve({
                isAvailable: availableBalance > 0,
                currency: 'CNY',
                totalBalance: availableBalance,
                grantedBalance: voucherBalance,
                toppedUpBalance: cashBalance,
                raw: result
              });
            } else if (res.statusCode === 401) {
              reject(new Error('API Key无效，请检查您的Key是否正确（注意国内站和国际站Key不通用）'));
            } else {
              const errorMsg = result.error?.message || result.message || data;
              reject(new Error(`请求失败 (${res.statusCode}): ${errorMsg}`));
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
