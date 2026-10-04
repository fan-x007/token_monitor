// 全局状态
let state = {
  platforms: [],
  keys: [],
  balances: [],
  alerts: { enabled: false, threshold: 10 },
  autoRefresh: false,
  autoRefreshTimer: null
};

const API_BASE = ''; // 同源，使用相对路径

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  init();
});

async function init() {
  await loadPlatforms();
  await loadKeys();
  await loadAlertSettings();
  
  if (state.keys.length > 0) {
    refreshAllBalances();
  }
}

// 加载支持的平台
async function loadPlatforms() {
  try {
    const res = await fetch(`${API_BASE}/api/platforms`);
    state.platforms = await res.json();
    
    const select = document.getElementById('platformSelect');
    select.innerHTML = '';
    
    state.platforms.forEach(p => {
      const option = document.createElement('option');
      option.value = p.id;
      option.textContent = p.name;
      select.appendChild(option);
    });
    
    if (state.platforms.length > 0) {
      updatePlatformInfo();
    }
  } catch (e) {
    showToast('加载平台列表失败', 'error');
  }
}

// 更新平台信息显示
function updatePlatformInfo() {
  const select = document.getElementById('platformSelect');
  const platformId = select.value;
  const platform = state.platforms.find(p => p.id === platformId);
  const infoDiv = document.getElementById('platformInfo');
  
  // 显示/隐藏对应的输入框
  const apiKeyGroup = document.getElementById('apiKeyGroup');
  const accessKeyIdGroup = document.getElementById('accessKeyIdGroup');
  const accessKeySecretGroup = document.getElementById('accessKeySecretGroup');
  
  const needsCloudKey = platform && platform.credentialType !== 'api_key';
  
  if (needsCloudKey) {
    apiKeyGroup.style.display = 'none';
    accessKeyIdGroup.style.display = 'flex';
    accessKeySecretGroup.style.display = 'flex';
    
    // 更新ID/Secret输入框的label
    const idLabel = accessKeyIdGroup.querySelector('label');
    const secretLabel = accessKeySecretGroup.querySelector('label');
    const idInput = document.getElementById('accessKeyIdInput');
    const secretInput = document.getElementById('accessKeySecretInput');
    
    if (platform.credentialType === 'aliyun_accesskey') {
      idLabel.textContent = 'AccessKey ID';
      secretLabel.textContent = 'AccessKey Secret';
      idInput.placeholder = '请输入AccessKey ID';
      secretInput.placeholder = '请输入AccessKey Secret';
    } else if (platform.credentialType === 'tencent_cloud') {
      idLabel.textContent = 'SecretId';
      secretLabel.textContent = 'SecretKey';
      idInput.placeholder = '请输入SecretId';
      secretInput.placeholder = '请输入SecretKey';
    }
  } else {
    apiKeyGroup.style.display = 'flex';
    accessKeyIdGroup.style.display = 'none';
    accessKeySecretGroup.style.display = 'none';
  }
  
  if (platform) {
    let credentialHint = '';
    if (platform.credentialType === 'aliyun_accesskey') {
      credentialHint = '<br><span style="color: #d97706;">⚠️ 注意：阿里云百炼需要使用 AccessKey（而非DashScope API Key）来查询账户余额</span>';
    } else if (platform.credentialType === 'tencent_cloud') {
      credentialHint = '<br><span style="color: #d97706;">⚠️ 注意：腾讯云混元需要使用云API密钥 SecretId/SecretKey（而非混元API Key）来查询账户余额</span>';
    } else if (platform.isTokenQuota) {
      credentialHint = '<br><span style="color: #d97706;">⚠️ 注意：该平台暂无公开余额API，通过调用免费模型获取速率限制剩余量，仅供参考</span>';
    }
    
    infoDiv.innerHTML = `
      <strong>${platform.name}</strong> - ${platform.description}
      <br>
      获取凭证: <a href="${platform.website}" target="_blank">${platform.website}</a>
      ${credentialHint}
    `;
    infoDiv.classList.add('show');
  } else {
    infoDiv.classList.remove('show');
  }
}

// 加载Keys
async function loadKeys() {
  try {
    const res = await fetch(`${API_BASE}/api/keys`);
    state.keys = await res.json();
    updateKeyCount();
    renderBalanceCards();
  } catch (e) {
    showToast('加载Key列表失败', 'error');
  }
}

// 加载告警设置
async function loadAlertSettings() {
  try {
    const res = await fetch(`${API_BASE}/api/alerts`);
    state.alerts = await res.json();
    updateAlertStatus();
  } catch (e) {
    console.error('加载告警设置失败', e);
  }
}

// 添加API Key
async function addApiKey() {
  const platform = document.getElementById('platformSelect').value;
  const platformInfo = state.platforms.find(p => p.id === platform);
  const label = document.getElementById('keyLabel').value.trim();
  
  let key = '';
  
  // 根据凭证类型获取key
  if (platformInfo && platformInfo.credentialType !== 'api_key') {
    const accessKeyId = document.getElementById('accessKeyIdInput').value.trim();
    const accessKeySecret = document.getElementById('accessKeySecretInput').value.trim();
    
    if (!accessKeyId || !accessKeySecret) {
      const idLabel = platformInfo.credentialType === 'tencent_cloud' ? 'SecretId' : 'AccessKey ID';
      const secretLabel = platformInfo.credentialType === 'tencent_cloud' ? 'SecretKey' : 'AccessKey Secret';
      showToast(`请输入 ${idLabel} 和 ${secretLabel}`, 'error');
      return;
    }
    key = `${accessKeyId}|${accessKeySecret}`;
  } else {
    key = document.getElementById('apiKeyInput').value.trim();
    if (!key) {
      showToast('请输入API Key', 'error');
      return;
    }
  }
  
  if (!platform) {
    showToast('请选择平台', 'error');
    return;
  }
  
  try {
    const res = await fetch(`${API_BASE}/api/keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform, key, label })
    });
    
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || '添加失败');
    }
    
    const newKey = await res.json();
    state.keys.push(newKey);
    
    // 清空输入
    document.getElementById('apiKeyInput').value = '';
    document.getElementById('accessKeyIdInput').value = '';
    document.getElementById('accessKeySecretInput').value = '';
    document.getElementById('keyLabel').value = '';
    
    showToast('凭证添加成功', 'success');
    updateKeyCount();
    renderBalanceCards();
    
    // 立即查询余额
    await refreshBalanceForKey(newKey.id);
    
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// 删除Key
async function deleteKey(id) {
  if (!confirm('确定要删除这个API Key吗？')) return;
  
  try {
    const res = await fetch(`${API_BASE}/api/keys/${id}`, {
      method: 'DELETE'
    });
    
    if (!res.ok) throw new Error('删除失败');
    
    state.keys = state.keys.filter(k => k.id !== id);
    state.balances = state.balances.filter(b => b.id !== id);
    
    showToast('删除成功', 'success');
    updateKeyCount();
    updateTotalBalance();
    renderBalanceCards();
    
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// 刷新所有余额
async function refreshAllBalances() {
  if (state.keys.length === 0) {
    showToast('请先添加API Key', 'info');
    return;
  }
  
  const btn = document.getElementById('refreshBtn');
  btn.classList.add('loading');
  btn.disabled = true;
  
  // 设置所有卡片为loading状态
  document.querySelectorAll('.balance-card').forEach(card => {
    card.classList.add('loading');
  });
  
  try {
    const res = await fetch(`${API_BASE}/api/balances`);
    state.balances = await res.json();
    
    updateTotalBalance();
    renderBalanceCards();
    updateLastUpdate();
    
    // 检查告警
    checkAlerts();
    
  } catch (e) {
    showToast('刷新余额失败', 'error');
  } finally {
    btn.classList.remove('loading');
    btn.disabled = false;
    document.querySelectorAll('.balance-card').forEach(card => {
      card.classList.remove('loading');
    });
  }
}

// 刷新单个Key的余额
async function refreshBalanceForKey(id) {
  const card = document.querySelector(`[data-id="${id}"]`);
  if (card) card.classList.add('loading');
  
  try {
    const res = await fetch(`${API_BASE}/api/balances/${id}`);
    const balance = await res.json();
    
    // 更新或添加到balances数组
    const idx = state.balances.findIndex(b => b.id === id);
    if (idx >= 0) {
      state.balances[idx] = balance;
    } else {
      state.balances.push(balance);
    }
    
    updateTotalBalance();
    renderBalanceCards();
    updateLastUpdate();
    checkAlerts();
    
  } catch (e) {
    showToast('刷新失败', 'error');
  } finally {
    if (card) card.classList.remove('loading');
  }
}

// 渲染余额卡片
function renderBalanceCards() {
  const grid = document.getElementById('balanceGrid');
  const emptyState = document.getElementById('emptyState');
  
  if (state.keys.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" id="emptyState">
        <div class="empty-icon">🔑</div>
        <h3>还没有添加任何API Key</h3>
        <p>添加您的第一个API Key开始监控余额</p>
      </div>
    `;
    return;
  }
  
  grid.innerHTML = state.keys.map(keyConfig => {
    const balanceData = state.balances.find(b => b.id === keyConfig.id);
    const platform = state.platforms.find(p => p.id === keyConfig.platform);
    
    return renderBalanceCard(keyConfig, balanceData, platform);
  }).join('');
}

function renderBalanceCard(keyConfig, balanceData, platform) {
  const isTokenQuota = platform?.isTokenQuota || balanceData?.data?.isTokenQuota;
  
  const isWarning = balanceData?.success && state.alerts.enabled && 
    balanceData.data.totalBalance < state.alerts.threshold && !isTokenQuota;
  
  let content = '';
  
  if (!balanceData) {
    // 还没查询过
    content = `
      <div class="balance-amount">
        <div class="balance-main"><span class="currency">--</span> --</div>
        <div class="balance-status" style="background: #f3f4f6; color: #9ca3af;">
          等待查询
        </div>
      </div>
      <div class="balance-details">
        <div class="detail-item">
          <span class="detail-label">充值余额</span>
          <span class="detail-value">--</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">赠金余额</span>
          <span class="detail-value">--</span>
        </div>
      </div>
    `;
  } else if (!balanceData.success) {
    // 查询失败
    content = `
      <div class="error-state">
        <div class="error-icon">❌</div>
        <div class="error-text">查询失败</div>
        <div class="error-hint">${escapeHtml(balanceData.error)}</div>
      </div>
    `;
  } else if (isTokenQuota) {
    // Token额度类型（如智谱AI）
    const data = balanceData.data;
    const statusClass = data.isAvailable ? 'available' : 'unavailable';
    const statusText = data.isAvailable ? '可用' : '已达上限';
    
    let tokenDisplay = '';
    if (data.remainingTokens !== null && data.remainingTokens !== undefined) {
      tokenDisplay = formatTokenCount(data.remainingTokens);
    } else {
      tokenDisplay = data.totalBalance ? formatTokenCount(data.totalBalance) : '--';
    }
    
    const extraInfo = data.note ? `<div class="token-note">${escapeHtml(data.note)}</div>` : '';
    
    let detailHtml = '';
    if (data.remainingRequests !== null && data.remainingRequests !== undefined) {
      detailHtml += `
        <div class="detail-item">
          <span class="detail-label">剩余请求数</span>
          <span class="detail-value">${formatNumber(data.remainingRequests)}</span>
        </div>
      `;
    }
    if (data.limitTokens !== null && data.limitTokens !== undefined) {
      detailHtml += `
        <div class="detail-item">
          <span class="detail-label">Token上限</span>
          <span class="detail-value">${formatTokenCount(data.limitTokens)}</span>
        </div>
      `;
    }
    if (!detailHtml) {
      detailHtml = `
        <div class="detail-item">
          <span class="detail-label">剩余Tokens</span>
          <span class="detail-value">${tokenDisplay}</span>
        </div>
      `;
    }
    
    content = `
      <div class="balance-amount">
        <div class="balance-main"><span class="currency">Tokens</span>${tokenDisplay}</div>
        <div class="balance-status ${statusClass}">
          ${data.isAvailable ? '✓' : '✗'} ${statusText}
        </div>
      </div>
      <div class="balance-details">
        ${detailHtml}
      </div>
      ${extraInfo}
    `;
  } else {
    // 查询成功 - 金额类型
    const data = balanceData.data;
    const currency = data.currency === 'CNY' ? '¥' : (data.currency === 'USD' ? '$' : data.currency + ' ');
    const statusClass = data.isAvailable ? 'available' : 'unavailable';
    const statusText = data.isAvailable ? '余额充足' : '余额不足';
    const warningClass = isWarning ? 'warning' : '';
    const finalStatusClass = isWarning ? 'warning' : statusClass;
    const finalStatusText = isWarning ? '余额偏低' : statusText;
    
    content = `
      <div class="balance-amount">
        <div class="balance-main"><span class="currency">${currency}</span>${data.totalBalance.toFixed(2)}</div>
        <div class="balance-status ${finalStatusClass}">
          ${data.isAvailable ? '✓' : '✗'} ${finalStatusText}
        </div>
      </div>
      <div class="balance-details">
        <div class="detail-item">
          <span class="detail-label">充值余额</span>
          <span class="detail-value">${currency}${data.toppedUpBalance.toFixed(2)}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">赠金余额</span>
          <span class="detail-value">${currency}${data.grantedBalance.toFixed(2)}</span>
        </div>
      </div>
    `;
  }
  
  const warningCardClass = isWarning ? 'warning' : '';
  
  return `
    <div class="balance-card ${warningCardClass}" data-id="${keyConfig.id}">
      <div class="card-header">
        <div class="card-platform">
          <div class="platform-badge">${getPlatformIcon(keyConfig.platform)}</div>
          <div>
            <div class="platform-name">${platform?.name || keyConfig.platform}</div>
            <div class="key-label">${escapeHtml(keyConfig.label)}</div>
          </div>
        </div>
        <div class="card-menu">
          <button class="menu-btn" onclick="refreshBalanceForKey('${keyConfig.id}')" title="刷新">🔄</button>
          <button class="menu-btn" onclick="deleteKey('${keyConfig.id}')" title="删除">🗑️</button>
        </div>
      </div>
      ${content}
    </div>
  `;
}

function getPlatformIcon(platformId) {
  const icons = {
    deepseek: '🧠',
    kimi: '🌙',
    bailian: '☁️',
    zhipu: '💎',
    tencent: '🐧',
    openai: '🤖',
    anthropic: '🗣️'
  };
  return icons[platformId] || '🔑';
}

// 更新统计
function updateKeyCount() {
  document.getElementById('keyCount').textContent = state.keys.length;
  
  // 统计平台数
  const platforms = new Set(state.keys.map(k => k.platform));
  document.getElementById('platformCount').textContent = platforms.size;
}

function updateTotalBalance() {
  let total = 0;
  let hasCNY = false;
  
  state.balances.forEach(b => {
    if (b.success && b.data.currency === 'CNY') {
      total += b.data.totalBalance;
      hasCNY = true;
    }
  });
  
  const totalEl = document.getElementById('totalBalance');
  if (hasCNY) {
    totalEl.textContent = `¥ ${total.toFixed(2)}`;
  } else {
    totalEl.textContent = '¥ 0.00';
  }
}

function updateLastUpdate() {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  document.getElementById('lastUpdate').textContent = `最后更新: ${timeStr}`;
}

function updateAlertStatus() {
  const statusEl = document.getElementById('alertStatus');
  const thresholdEl = document.getElementById('alertThreshold');
  
  if (state.alerts.enabled) {
    statusEl.textContent = '已开启';
    thresholdEl.textContent = `阈值: ¥${state.alerts.threshold}`;
  } else {
    statusEl.textContent = '未开启';
    thresholdEl.textContent = '点击开启';
  }
  
  // 同步弹窗中的设置
  document.getElementById('alertEnabledCheck').checked = state.alerts.enabled;
  document.getElementById('alertThresholdInput').value = state.alerts.threshold;
}

// 告警检查
function checkAlerts() {
  if (!state.alerts.enabled) return;
  
  let lowBalanceCount = 0;
  state.balances.forEach(b => {
    if (b.success && b.data.totalBalance < state.alerts.threshold) {
      lowBalanceCount++;
    }
  });
  
  if (lowBalanceCount > 0) {
    // 可以添加浏览器通知等
    console.log(`有 ${lowBalanceCount} 个平台余额低于阈值`);
  }
}

// 告警设置弹窗
function toggleAlertSettings() {
  const modal = document.getElementById('alertModal');
  if (modal.style.display === 'none') {
    modal.style.display = 'flex';
    document.getElementById('alertEnabledCheck').checked = state.alerts.enabled;
    document.getElementById('alertThresholdInput').value = state.alerts.threshold;
  } else {
    modal.style.display = 'none';
  }
}

async function saveAlertSettings() {
  const enabled = document.getElementById('alertEnabledCheck').checked;
  const threshold = parseFloat(document.getElementById('alertThresholdInput').value) || 10;
  
  try {
    const res = await fetch(`${API_BASE}/api/alerts`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled, threshold })
    });
    
    if (!res.ok) throw new Error('保存失败');
    
    state.alerts = await res.json();
    updateAlertStatus();
    toggleAlertSettings();
    renderBalanceCards(); // 重新渲染以更新警告状态
    checkAlerts();
    showToast('告警设置已保存', 'success');
    
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// 自动刷新
function toggleAutoRefresh() {
  const checkbox = document.getElementById('autoRefreshCheck');
  state.autoRefresh = checkbox.checked;
  
  if (state.autoRefresh) {
    state.autoRefreshTimer = setInterval(() => {
      if (state.keys.length > 0) {
        refreshAllBalances();
      }
    }, 5 * 60 * 1000); // 5分钟
    showToast('已开启自动刷新（每5分钟）', 'info');
  } else {
    if (state.autoRefreshTimer) {
      clearInterval(state.autoRefreshTimer);
      state.autoRefreshTimer = null;
    }
    showToast('已关闭自动刷新', 'info');
  }
}

// Toast 提示
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  const icons = {
    success: '✅',
    error: '❌',
    info: 'ℹ️'
  };
  
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || 'ℹ️'}</span>
    <span class="toast-message">${escapeHtml(message)}</span>
  `;
  
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// 工具函数
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatNumber(num) {
  if (num === null || num === undefined) return '--';
  return num.toLocaleString('zh-CN');
}

function formatTokenCount(tokens) {
  if (tokens === null || tokens === undefined) return '--';
  if (tokens >= 1000000) {
    return (tokens / 1000000).toFixed(2) + 'M';
  } else if (tokens >= 1000) {
    return (tokens / 1000).toFixed(1) + 'K';
  }
  return tokens.toLocaleString('zh-CN');
}

// 点击弹窗外部关闭
document.addEventListener('click', (e) => {
  const modal = document.getElementById('alertModal');
  if (e.target === modal) {
    toggleAlertSettings();
  }
});

// ESC键关闭弹窗
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const modal = document.getElementById('alertModal');
    if (modal.style.display !== 'none') {
      toggleAlertSettings();
    }
  }
});
