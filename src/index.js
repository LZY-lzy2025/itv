const ADMIN_HTML = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>IPTV 代理管理后台</title>
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; background: #f3f4f6; color: #333; }
    .card { background: white; padding: 24px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); margin-bottom: 24px; }
    h1 { text-align: center; color: #111827; margin-bottom: 30px; }
    h3 { margin-top: 0; color: #374151; font-size: 1.2rem; margin-bottom: 16px; }
    input, textarea { width: 100%; box-sizing: border-box; margin-bottom: 16px; padding: 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 1rem; }
    input:focus, textarea:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.3); }
    button { background: #3b82f6; color: white; border: none; cursor: pointer; font-weight: bold; padding: 12px; border-radius: 8px; font-size: 1rem; width: 100%; transition: background 0.2s; }
    button:hover { background: #2563eb; }
    #result { background: #1f2937; color: #10b981; padding: 16px; border-radius: 8px; white-space: pre-wrap; word-break: break-all; font-family: monospace; min-height: 50px; }
  </style>
</head>
<body>
  <h1>📺 IPTV 代理管理后台</h1>
  
  <div class="card">
    <h3>🔑 1. 管理员认证</h3>
    <input type="password" id="adminSecret" placeholder="在此输入你在 Cloudflare 后台设置的 ADMIN_SECRET 密码">
  </div>

  <div class="card">
    <h3>📥 2. 导入 M3U 直播源</h3>
    <textarea id="m3uContent" rows="6" placeholder="#EXTM3U\n#EXTINF:-1,CCTV1\nhttp://example.com/cctv1.m3u8\n..."></textarea>
    <button onclick="importM3U()">一键导入 / 更新频道</button>
  </div>

  <div class="card">
    <h3>🎫 3. 生成播放 Token</h3>
    <label style="display:block; margin-bottom:8px; color:#4b5563;">该 Token 允许使用的独立 IP 数量：</label>
    <input type="number" id="maxIps" value="1" min="1">
    <button onclick="generateToken()">生成安全 Token</button>
  </div>

  <div class="card">
    <h3>📝 操作结果与播放链接</h3>
    <div id="result">等待操作...</div>
  </div>

  <script>
    function log(msg) {
      document.getElementById('result').innerText = typeof msg === 'object' ? JSON.stringify(msg, null, 2) : msg;
    }

    async function importM3U() {
      const secret = document.getElementById('adminSecret').value;
      const content = document.getElementById('m3uContent').value;
      if (!secret) return alert('请输入管理员密码！');
      if (!content) return alert('请输入 M3U 文本内容！');
      
      log('🔄 正在解析并导入，请稍候...');
      try {
        const res = await fetch('/admin/m3u', {
          method: 'POST',
          headers: { 'Authorization': secret },
          body: content
        });
        const data = await res.text();
        try { log(JSON.parse(data)); } catch(e) { log(data); }
      } catch(err) {
        log('❌ 请求失败: ' + err.message);
      }
    }

    async function generateToken() {
      const secret = document.getElementById('adminSecret').value;
      const maxIps = parseInt(document.getElementById('maxIps').value) || 1;
      if (!secret) return alert('请输入管理员密码！');
      
      log('🔄 正在生成 Token...');
      try {
        const res = await fetch('/admin/token', {
          method: 'POST',
          headers: { 
            'Authorization': secret,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ maxIps })
        });
        
        if (res.status === 401) {
            return log('❌ 密码错误 (Unauthorized)');
        }

        const data = await res.json();
        
        // 自动拼接出播放示例链接
        const currentUrl = window.location.origin;
        const demoLink = \`\${currentUrl}/play/你的频道ID?token=\${data.token}\`;
        
        data.demo_play_url = demoLink; // 方便用户直接复制
        log(data);

      } catch(err) {
        log('❌ 请求失败: ' + err.message);
      }
    }
  </script>
</body>
</html>
`;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // 0. 返回 Web 管理后台
    if (path === '/' || path === '/admin') {
      return new Response(ADMIN_HTML, {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
      });
    }

    // 1. 导入 M3U 接口 (管理端)
    if (path === '/admin/m3u' && method === 'POST') {
      if (!checkAdmin(request, env)) return new Response(JSON.stringify({error: 'Unauthorized'}), { status: 401 });
      
      const m3uContent = await request.text();
      const channels = parseM3U(m3uContent);
      
      let count = 0;
      for (const channel of channels) {
        await env.IPTV_KV.put(`stream:${channel.id}`, channel.url);
        count++;
      }
      return Response.json({ message: `成功导入 ${count} 个频道`, channels });
    }

    // 2. 生成 Token 接口 (管理端)
    if (path === '/admin/token' && method === 'POST') {
      if (!checkAdmin(request, env)) return new Response(JSON.stringify({error: 'Unauthorized'}), { status: 401 });
      
      const body = await request.json();
      const tokenString = body.token || generateRandomString(12);
      const maxIps = body.maxIps || 1;
      
      const tokenData = { maxIps: maxIps, ips: [] };
      
      await env.IPTV_KV.put(`token:${tokenString}`, JSON.stringify(tokenData));
      return Response.json({ message: 'Token 生成成功', token: tokenString, maxIps });
    }

    // 3. 播放/重定向 接口 (客户端)
    if (path.startsWith('/play/') && method === 'GET') {
      const channelId = decodeURIComponent(path.split('/')[2]); // 解析中文或带空格的频道名
      const tokenString = url.searchParams.get('token');
      
      if (!tokenString) return new Response('Missing Token', { status: 403 });

      const clientIp = request.headers.get('cf-connecting-ip') || 'unknown';
      const tokenRaw = await env.IPTV_KV.get(`token:${tokenString}`);
      if (!tokenRaw) return new Response('Invalid Token', { status: 403 });
      
      const tokenData = JSON.parse(tokenRaw);
      
      // IP 限制核心逻辑
      if (!tokenData.ips.includes(clientIp)) {
        if (tokenData.ips.length >= tokenData.maxIps) {
          return new Response('Token IP limit reached', { status: 403 });
        } else {
          tokenData.ips.push(clientIp);
          ctx.waitUntil(env.IPTV_KV.put(`token:${tokenString}`, JSON.stringify(tokenData)));
        }
      }

      const streamUrl = await env.IPTV_KV.get(`stream:${channelId}`);
      if (!streamUrl) return new Response('Stream not found', { status: 404 });

      return Response.redirect(streamUrl, 302);
    }

    return new Response('Not Found', { status: 404 });
  }
};

// --- 辅助函数 ---
function checkAdmin(request, env) {
  const secret = request.headers.get('Authorization');
  return secret === env.ADMIN_SECRET;
}

function parseM3U(content) {
  const lines = content.split('\n');
  const channels = [];
  let currentName = '';

  for (let line of lines) {
    line = line.trim();
    if (line.startsWith('#EXTINF')) {
      const parts = line.split(',');
      currentName = parts.length > 1 ? parts[1].trim() : 'Unknown';
    } else if (line && !line.startsWith('#')) {
      // 保留频道名作为 ID，但需要去除多余空格
      const id = currentName.replace(/\s+/g, '_');
      channels.push({ id, name: currentName, url: line });
    }
  }
  return channels;
}

function generateRandomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
