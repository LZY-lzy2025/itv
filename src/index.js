// ==========================================
// 1. 用户端 UI (极简风格，供普通用户获取订阅)
// ==========================================
const USER_HTML = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>IPTV 专属订阅中心</title>
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 500px; margin: 50px auto; padding: 20px; background: #f9fafb; color: #333; text-align: center; }
    .card { background: white; padding: 30px; border-radius: 16px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); }
    h1 { color: #111827; margin-bottom: 10px; }
    p { color: #6b7280; margin-bottom: 24px; }
    input { width: 100%; box-sizing: border-box; margin-bottom: 20px; padding: 14px; border: 2px solid #e5e7eb; border-radius: 8px; font-size: 1.1rem; text-align: center; font-family: monospace; }
    input:focus { outline: none; border-color: #3b82f6; }
    button { background: #3b82f6; color: white; border: none; cursor: pointer; font-weight: bold; padding: 14px; border-radius: 8px; font-size: 1.1rem; width: 100%; transition: background 0.2s; }
    button:hover { background: #2563eb; }
    #resultBox { margin-top: 20px; display: none; background: #ecfdf5; border: 1px solid #10b981; padding: 15px; border-radius: 8px; color: #065f46; word-break: break-all;}
  </style>
</head>
<body>
  <div class="card">
    <h1>📺 获取专属订阅</h1>
    <p>请输入管理员发给您的 Token 凭证</p>
    <input type="text" id="userToken" placeholder="例如: abc123XYZ">
    <button onclick="getSubLink()">生成我的 M3U 链接</button>
    <div id="resultBox"></div>
  </div>
  <script>
    function getSubLink() {
      const token = document.getElementById('userToken').value.trim();
      if(!token) return alert('请输入 Token！');
      const link = window.location.origin + '/subscribe?token=' + token;
      const box = document.getElementById('resultBox');
      box.style.display = 'block';
      box.innerHTML = \`<strong>✅ 您的专属订阅链接：</strong><br><br><a href="\${link}" target="_blank" style="color:#059669;">\${link}</a><br><br><button onclick="navigator.clipboard.writeText('\${link}').then(()=>alert('已复制！'))" style="margin-top:10px; background:#10b981;">一键复制链接</button>\`;
    }
  </script>
</body>
</html>
`;

// ==========================================
// 2. 管理端 UI (带自动化配置面板)
// ==========================================
const ADMIN_HTML = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>IPTV 中枢控制台</title>
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; background: #f3f4f6; color: #333; }
    .card { background: white; padding: 24px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); margin-bottom: 24px; }
    h1 { text-align: center; color: #111827; }
    h3 { margin-top: 0; color: #374151; font-size: 1.2rem; margin-bottom: 16px; border-bottom: 2px solid #f3f4f6; padding-bottom: 8px;}
    input { width: 100%; box-sizing: border-box; margin-bottom: 16px; padding: 10px; border: 1px solid #d1d5db; border-radius: 6px; }
    button { background: #3b82f6; color: white; border: none; cursor: pointer; font-weight: bold; padding: 10px 16px; border-radius: 6px; transition: 0.2s; }
    button:hover { background: #2563eb; }
    .btn-green { background: #10b981; } .btn-green:hover { background: #059669; }
    .btn-red { background: #ef4444; } .btn-red:hover { background: #dc2626; }
    .status-box { background: #1f2937; color: #10b981; padding: 12px; border-radius: 6px; font-family: monospace; font-size: 0.9rem;}
    table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 0.9rem; }
    th, td { padding: 10px; text-align: left; border-bottom: 1px solid #e5e7eb; }
    th { background-color: #f9fafb; }
  </style>
</head>
<body>
  <h1>⚙️ IPTV 中枢控制台</h1>
  
  <div class="card">
    <h3>🔑 身份验证</h3>
    <input type="password" id="adminSecret" placeholder="输入 ADMIN_SECRET 密码">
  </div>

  <div class="card">
    <h3>🤖 自动化抓取设置 (Cron)</h3>
    <p style="font-size: 0.9rem; color: #6b7280;">设置一个主订阅源，系统将在后台定时静默拉取并覆盖更新。</p>
    <input type="text" id="autoSubUrl" placeholder="输入主 M3U 订阅链接">
    <button class="btn-green" onclick="saveConfig()">保存配置并立即抓取一次</button>
    <div id="syncStatus" class="status-box" style="margin-top: 12px;">正在查询同步状态...</div>
  </div>

  <div class="card">
    <h3>🎫 Token 分发管理</h3>
    <div style="display: flex; gap: 10px; margin-bottom: 16px;">
        <input type="number" id="maxIps" value="1" min="1" placeholder="允许最大IP数" style="margin:0; width: 150px;">
        <button onclick="generateToken()">+ 新建 Token</button>
        <button class="btn-green" onclick="loadData()">刷新数据</button>
    </div>
    <div id="tokenTableContainer" style="overflow-x: auto;">加载中...</div>
  </div>

  <script>
    async function apiCall(path, method, body = null) {
      const secret = document.getElementById('adminSecret').value;
      if (!secret) { alert('请输入密码！'); throw new Error('No password'); }
      const options = { method, headers: { 'Authorization': secret, 'Content-Type': 'application/json' } };
      if (body) options.body = JSON.stringify(body);
      const res = await fetch(path, options);
      if (res.status === 401) { alert('密码错误'); throw new Error('Unauthorized'); }
      return res.json();
    }

    async function saveConfig() {
      const url = document.getElementById('autoSubUrl').value;
      if (!url) return alert('请输入订阅链接');
      document.getElementById('syncStatus').innerText = '🔄 正在保存并触发后台同步...';
      try {
        const data = await apiCall('/api/admin/config', 'POST', { url });
        alert(data.message);
        loadData();
      } catch(e) {}
    }

    async function generateToken() {
      const maxIps = parseInt(document.getElementById('maxIps').value) || 1;
      try {
        await apiCall('/api/admin/token', 'POST', { maxIps });
        loadData();
      } catch(e) {}
    }

    async function deleteToken(token) {
      if(!confirm('确定要注销此 Token 吗？用户将立即断开连接。')) return;
      try {
        await apiCall('/api/admin/token', 'DELETE', { token });
        loadData();
      } catch(e) {}
    }

    async function loadData() {
      if(!document.getElementById('adminSecret').value) return;
      try {
        const data = await apiCall('/api/admin/dashboard', 'GET');
        
        // 更新同步状态面板
        document.getElementById('autoSubUrl').value = data.config.url || '';
        let statusText = data.config.url ? \`✅ 目标源: \${data.config.url}\\n\` : '⚠️ 未设置自动抓取源\\n';
        statusText += \`🕒 最后同步: \${data.config.lastSync || '从未同步'}\\n\`;
        statusText += \`📺 当前库中频道数: \${data.channelCount}\`;
        document.getElementById('syncStatus').innerText = statusText;

        // 更新 Token 表格
        if (data.tokens.length === 0) {
            document.getElementById('tokenTableContainer').innerHTML = '<p>暂无 Token</p>';
        } else {
            let html = \`<table><tr><th>Token</th><th>IP限制</th><th>当前占用IP</th><th>操作</th></tr>\`;
            data.tokens.forEach(t => {
                html += \`<tr>
                    <td><strong>\${t.token}</strong></td>
                    <td>\${t.data.maxIps}</td>
                    <td><span style="color:\${t.data.ips.length >= t.data.maxIps ? 'red' : 'green'}">\${t.data.ips.length}</span></td>
                    <td><button class="btn-red" style="padding: 4px 8px; font-size: 0.8rem;" onclick="deleteToken('\${t.token}')">注销</button></td>
                </tr>\`;
            });
            html += '</table>';
            document.getElementById('tokenTableContainer').innerHTML = html;
        }
      } catch(e) {}
    }
  </script>
</body>
</html>
`;

// ==========================================
// 3. Worker 核心逻辑 (支持 fetch 与 scheduled)
// ==========================================
export default {
  // 处理常规 HTTP 请求
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // --- 页面路由 ---
    if (path === '/') return new Response(USER_HTML, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
    if (path === '/admin') return new Response(ADMIN_HTML, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });

    // --- API 路由 (管理端) ---
    if (path.startsWith('/api/admin/')) {
      if (!checkAdmin(request, env)) return new Response(JSON.stringify({error: 'Unauthorized'}), { status: 401 });

      // 获取大盘数据
      if (path === '/api/admin/dashboard' && method === 'GET') {
        const subUrl = await env.IPTV_KV.get('config:sub_url');
        const lastSync = await env.IPTV_KV.get('config:last_sync');
        const playlistRaw = await env.IPTV_KV.get('playlist:data');
        const channels = playlistRaw ? JSON.parse(playlistRaw) : [];
        
        const listed = await env.IPTV_KV.list({ prefix: 'token:' });
        const tokens = [];
        for (const key of listed.keys) {
          const val = await env.IPTV_KV.get(key.name);
          if (val) tokens.push({ token: key.name.replace('token:', ''), data: JSON.parse(val) });
        }

        return Response.json({
          config: { url: subUrl, lastSync: lastSync },
          channelCount: channels.length,
          tokens: tokens
        });
      }

      // 设置自动抓取源并立即执行一次
      if (path === '/api/admin/config' && method === 'POST') {
        const body = await request.json();
        await env.IPTV_KV.put('config:sub_url', body.url);
        // 手动调用抓取逻辑
        const syncResult = await performSync(env);
        if(syncResult.success) {
            return Response.json({ message: `配置已保存！成功拉取 ${syncResult.count} 个频道。` });
        } else {
            return Response.json({ message: `配置已保存，但抓取失败: ${syncResult.error}` }, { status: 500 });
        }
      }

      // Token 管理
      if (path === '/api/admin/token' && method === 'POST') {
        const body = await request.json();
        const tokenString = generateRandomString(8); // 生成8位简短Token方便用户输入
        await env.IPTV_KV.put(`token:${tokenString}`, JSON.stringify({ maxIps: body.maxIps || 1, ips: [] }));
        return Response.json({ message: 'Token generated' });
      }
      if (path === '/api/admin/token' && method === 'DELETE') {
        const body = await request.json();
        await env.IPTV_KV.delete(`token:${body.token}`);
        return Response.json({ message: 'Token deleted' });
      }
    }

    // --- 核心业务路由 (客户端) ---
    
    // 生成专属 M3U 文件
    if (path === '/subscribe' && method === 'GET') {
      const tokenString = url.searchParams.get('token');
      if (!tokenString) return new Response('Missing Token', { status: 403 });
      
      const tokenRaw = await env.IPTV_KV.get(`token:${tokenString}`);
      if (!tokenRaw) return new Response('Invalid or Expired Token', { status: 403 });

      const playlistRaw = await env.IPTV_KV.get('playlist:data');
      const channels = playlistRaw ? JSON.parse(playlistRaw) : [];
      
      let m3uContent = '#EXTM3U\n';
      for (const ch of channels) {
        let extinf = '#EXTINF:-1';
        if (ch.logo) extinf += ` tvg-logo="${ch.logo}"`;
        if (ch.group) extinf += ` group-title="${ch.group}"`;
        extinf += `,${ch.name}\n${url.origin}/play/${ch.id}?token=${tokenString}\n`;
      }
      return new Response(m3uContent, {
        headers: { 'Content-Type': 'application/vnd.apple.mpegurl; charset=utf-8', 'Content-Disposition': 'attachment; filename="my_tv.m3u"', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // 播放鉴权与重定向
    if (path.startsWith('/play/') && method === 'GET') {
      const channelId = path.split('/')[2];
      const tokenString = url.searchParams.get('token');
      if (!tokenString) return new Response('Missing Token', { status: 403 });

      const tokenRaw = await env.IPTV_KV.get(`token:${tokenString}`);
      if (!tokenRaw) return new Response('Invalid Token', { status: 403 });
      
      const tokenData = JSON.parse(tokenRaw);
      const clientIp = request.headers.get('cf-connecting-ip') || 'unknown';
      
      if (!tokenData.ips.includes(clientIp)) {
        if (tokenData.ips.length >= tokenData.maxIps) {
          return new Response('IP Limit Reached', { status: 403 });
        } else {
          tokenData.ips.push(clientIp);
          ctx.waitUntil(env.IPTV_KV.put(`token:${tokenString}`, JSON.stringify(tokenData)));
        }
      }

      const playlistRaw = await env.IPTV_KV.get('playlist:data');
      if (!playlistRaw) return new Response('No data', { status: 404 });
      const targetChannel = JSON.parse(playlistRaw).find(c => c.id === channelId);
      if (!targetChannel) return new Response('Stream not found', { status: 404 });

      return Response.redirect(targetChannel.url, 302);
    }

    return new Response('Not Found', { status: 404 });
  },

  // 处理定时触发任务 (Cron)
  async scheduled(event, env, ctx) {
    // waitUntil 确保 Worker 不会在后台任务执行完之前被意外杀死
    ctx.waitUntil(performSync(env));
  }
};

// ==========================================
// 4. 辅助函数区
// ==========================================

// 后台拉取并覆盖数据的核心逻辑 (供 API 和 Cron 共同调用)
async function performSync(env) {
    try {
        const subUrl = await env.IPTV_KV.get('config:sub_url');
        if (!subUrl) return { success: false, error: 'No subscription URL configured' };

        const res = await fetch(subUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        
        const content = await res.text();
        const channels = parseM3U(content);
        
        // 彻底覆盖旧数据
        await env.IPTV_KV.put('playlist:data', JSON.stringify(channels));
        // 记录最后同步时间 (东八区时间)
        const timeString = new Date(new Date().getTime() + 8 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
        await env.IPTV_KV.put('config:last_sync', timeString);
        
        return { success: true, count: channels.length };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

function checkAdmin(request, env) { return request.headers.get('Authorization') === env.ADMIN_SECRET; }

function parseM3U(content) {
  const lines = content.split('\n'); const channels = [];
  let name = 'Unknown', group = '未分组', logo = '';
  for (let line of lines) {
    line = line.trim();
    if (line.startsWith('#EXTINF')) {
      const commaIndex = line.lastIndexOf(',');
      name = commaIndex > -1 ? line.substring(commaIndex + 1).trim() : 'Unknown';
      const gm = line.match(/group-title="([^"]+)"/); group = gm ? gm[1] : '未分组';
      const lm = line.match(/tvg-logo="([^"]+)"/); logo = lm ? lm[1] : '';
    } else if (line && (line.startsWith('http://') || line.startsWith('https://'))) {
      channels.push({ id: 'ch_' + Math.random().toString(36).substring(2, 10), name, group, logo, url: line });
      name = 'Unknown'; group = '未分组'; logo = '';
    }
  }
  return channels;
}

function generateRandomString(length) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'; // 去除了易混淆字符
  let result = '';
  for (let i = 0; i < length; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
  return result;
}
