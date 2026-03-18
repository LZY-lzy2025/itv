export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // 1. 导入 M3U 接口 (管理端)
    if (path === '/admin/m3u' && method === 'POST') {
      if (!checkAdmin(request, env)) return new Response('Unauthorized', { status: 401 });
      
      const m3uContent = await request.text();
      const channels = parseM3U(m3uContent);
      
      let count = 0;
      for (const channel of channels) {
        // 将频道 ID 和 URL 存入 KV
        await env.IPTV_KV.put(`stream:${channel.id}`, channel.url);
        count++;
      }
      return Response.json({ message: `Successfully imported ${count} channels`, channels });
    }

    // 2. 生成 Token 接口 (管理端)
    if (path === '/admin/token' && method === 'POST') {
      if (!checkAdmin(request, env)) return new Response('Unauthorized', { status: 401 });
      
      const body = await request.json();
      const tokenString = body.token || generateRandomString(16);
      const maxIps = body.maxIps || 1; // 默认限制 1 个 IP
      
      const tokenData = {
        maxIps: maxIps,
        ips: [] // 记录已访问的 IP
      };
      
      await env.IPTV_KV.put(`token:${tokenString}`, JSON.stringify(tokenData));
      return Response.json({ message: 'Token created', token: tokenString, maxIps });
    }

    // 3. 播放/重定向 接口 (客户端)
    // 路由示例: /play/CCTV1?token=your_token
    if (path.startsWith('/play/') && method === 'GET') {
      const channelId = path.split('/')[2];
      const tokenString = url.searchParams.get('token');
      
      if (!tokenString) return new Response('Missing Token', { status: 403 });

      // 获取客户端真实 IP
      const clientIp = request.headers.get('cf-connecting-ip') || 'unknown';

      // 验证 Token 和 IP
      const tokenRaw = await env.IPTV_KV.get(`token:${tokenString}`);
      if (!tokenRaw) return new Response('Invalid Token', { status: 403 });
      
      const tokenData = JSON.parse(tokenRaw);
      
      // IP 限制逻辑
      if (!tokenData.ips.includes(clientIp)) {
        if (tokenData.ips.length >= tokenData.maxIps) {
          return new Response('Token IP limit reached', { status: 403 });
        } else {
          // 这是一个新 IP，且未达到上限，加入列表并更新 KV
          tokenData.ips.push(clientIp);
          // 使用 ctx.waitUntil 避免阻塞当前请求响应
          ctx.waitUntil(env.IPTV_KV.put(`token:${tokenString}`, JSON.stringify(tokenData)));
        }
      }

      // 获取原始直播源 URL
      const streamUrl = await env.IPTV_KV.get(`stream:${channelId}`);
      if (!streamUrl) return new Response('Stream not found', { status: 404 });

      // 302 重定向到原始直播源
      return Response.redirect(streamUrl, 302);
    }

    return new Response('Not Found', { status: 404 });
  }
};

// --- 辅助函数 ---

// 校验管理员密码
function checkAdmin(request, env) {
  const secret = request.headers.get('Authorization');
  return secret === env.ADMIN_SECRET;
}

// 简单的 M3U 解析器
function parseM3U(content) {
  const lines = content.split('\n');
  const channels = [];
  let currentName = '';

  for (let line of lines) {
    line = line.trim();
    if (line.startsWith('#EXTINF')) {
      // 提取频道名称 (简单按逗号分割)
      const parts = line.split(',');
      currentName = parts.length > 1 ? parts[1].trim() : 'Unknown';
    } else if (line && !line.startsWith('#')) {
      // 生成安全的 ID (去除空格和特殊字符)
      const id = encodeURIComponent(currentName.replace(/\s+/g, '_'));
      channels.push({ id, name: currentName, url: line });
    }
  }
  return channels;
}

// 生成随机 Token 字符串
function generateRandomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
