const fs = require('fs');
const path = require('path');

const platforms = {};
const platformDir = __dirname;

// 自动加载所有平台适配器
fs.readdirSync(platformDir).forEach(file => {
  if (file === 'index.js' || !file.endsWith('.js')) return;
  
  const platformName = file.replace('.js', '');
  const platformModule = require(path.join(platformDir, file));
  
  if (platformModule && platformModule.name && platformModule.getBalance) {
    platforms[platformName] = platformModule;
  }
});

function getSupportedPlatforms() {
  return Object.values(platforms).map(p => ({
    id: p.id,
    name: p.name,
    description: p.description,
    website: p.website,
    currency: p.currency,
    credentialType: p.credentialType || 'api_key',
    credentialHint: p.credentialHint || '',
    isTokenQuota: p.isTokenQuota || false,
    note: p.note || ''
  }));
}

function isPlatformSupported(platformId) {
  return !!platforms[platformId];
}

async function getBalance(platformId, apiKey) {
  const platform = platforms[platformId];
  if (!platform) {
    throw new Error(`不支持的平台: ${platformId}`);
  }
  return await platform.getBalance(apiKey);
}

module.exports = {
  getSupportedPlatforms,
  isPlatformSupported,
  getBalance
};
