const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const platforms = require('./platforms');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// 确保数据目录存在
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// 读取配置
function readConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    return { keys: [], alerts: { enabled: false, threshold: 10 } };
  }
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
  } catch (e) {
    return { keys: [], alerts: { enabled: false, threshold: 10 } };
  }
}

// 保存配置
function saveConfig(config) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

// 获取所有支持的平台列表
app.get('/api/platforms', (req, res) => {
  const platformList = platforms.getSupportedPlatforms();
  res.json(platformList);
});

// 获取所有已配置的API Key
app.get('/api/keys', (req, res) => {
  const config = readConfig();
  // 不返回完整的key，只返回掩码后的
  const maskedKeys = config.keys.map(k => ({
    id: k.id,
    platform: k.platform,
    label: k.label,
    keyMasked: maskKey(k.key),
    createdAt: k.createdAt
  }));
  res.json(maskedKeys);
});

// 添加API Key
app.post('/api/keys', (req, res) => {
  const { platform, key, label } = req.body;
  
  if (!platform || !key) {
    return res.status(400).json({ error: '平台和API Key不能为空' });
  }
  
  if (!platforms.isPlatformSupported(platform)) {
    return res.status(400).json({ error: '不支持的平台' });
  }
  
  const config = readConfig();
  const newKey = {
    id: Date.now().toString(),
    platform,
    key,
    label: label || `${platform} - ${config.keys.length + 1}`,
    createdAt: new Date().toISOString()
  };
  
  config.keys.push(newKey);
  saveConfig(config);
  
  res.json({
    id: newKey.id,
    platform: newKey.platform,
    label: newKey.label,
    keyMasked: maskKey(newKey.key),
    createdAt: newKey.createdAt
  });
});

// 删除API Key
app.delete('/api/keys/:id', (req, res) => {
  const config = readConfig();
  config.keys = config.keys.filter(k => k.id !== req.params.id);
  saveConfig(config);
  res.json({ success: true });
});

// 查询所有key的余额
app.get('/api/balances', async (req, res) => {
  const config = readConfig();
  const results = [];
  
  for (const keyConfig of config.keys) {
    try {
      const balance = await platforms.getBalance(keyConfig.platform, keyConfig.key);
      results.push({
        id: keyConfig.id,
        platform: keyConfig.platform,
        label: keyConfig.label,
        success: true,
        data: balance
      });
    } catch (error) {
      results.push({
        id: keyConfig.id,
        platform: keyConfig.platform,
        label: keyConfig.label,
        success: false,
        error: error.message
      });
    }
  }
  
  res.json(results);
});

// 查询单个key的余额
app.get('/api/balances/:id', async (req, res) => {
  const config = readConfig();
  const keyConfig = config.keys.find(k => k.id === req.params.id);
  
  if (!keyConfig) {
    return res.status(404).json({ error: 'Key不存在' });
  }
  
  try {
    const balance = await platforms.getBalance(keyConfig.platform, keyConfig.key);
    res.json({
      id: keyConfig.id,
      platform: keyConfig.platform,
      label: keyConfig.label,
      success: true,
      data: balance
    });
  } catch (error) {
    res.json({
      id: keyConfig.id,
      platform: keyConfig.platform,
      label: keyConfig.label,
      success: false,
      error: error.message
    });
  }
});

// 获取/更新告警配置
app.get('/api/alerts', (req, res) => {
  const config = readConfig();
  res.json(config.alerts || { enabled: false, threshold: 10 });
});

app.put('/api/alerts', (req, res) => {
  const config = readConfig();
  config.alerts = {
    enabled: req.body.enabled !== undefined ? req.body.enabled : false,
    threshold: req.body.threshold || 10
  };
  saveConfig(config);
  res.json(config.alerts);
});

function maskKey(key) {
  if (!key || key.length <= 8) return '****';
  return key.substring(0, 4) + '****' + key.substring(key.length - 4);
}

app.listen(PORT, () => {
  console.log(`Token Monitor 服务已启动: http://localhost:${PORT}`);
});
