// OpenClaw Gateway WebSocket chat client
// Usage: node openclaw-chat.mjs <port> <token> <agentId> <message>
import http from 'http';
import crypto from 'crypto';

const [,, port, token, agentId, ...msgParts] = process.argv;
const message = msgParts.join(' ');

if (!port || !token || !message) {
  console.log(JSON.stringify({ error: "Usage: openclaw-chat.mjs <port> <token> <agentId> <message>" }));
  process.exit(1);
}

function wsConnect(port, token) {
  return new Promise((resolve, reject) => {
    const key = crypto.randomBytes(16).toString('base64');
    const req = http.request({
      hostname: '127.0.0.1', port: parseInt(port),
      path: `/?token=${token}`,
      headers: { Upgrade: 'websocket', Connection: 'Upgrade', 'Sec-WebSocket-Key': key, 'Sec-WebSocket-Version': '13' }
    });
    req.on('upgrade', (_, socket) => resolve(socket));
    req.on('error', reject);
    req.end();
  });
}

function wsSend(socket, data) {
  const payload = Buffer.from(JSON.stringify(data));
  const mask = crypto.randomBytes(4);
  let header;
  if (payload.length < 126) {
    header = Buffer.alloc(6);
    header[0] = 0x81; header[1] = 0x80 | payload.length;
    mask.copy(header, 2);
  } else if (payload.length < 65536) {
    header = Buffer.alloc(8);
    header[0] = 0x81; header[1] = 0x80 | 126;
    header.writeUInt16BE(payload.length, 2);
    mask.copy(header, 4);
  } else {
    header = Buffer.alloc(14);
    header[0] = 0x81; header[1] = 0x80 | 127;
    header.writeBigUInt64BE(BigInt(payload.length), 2);
    mask.copy(header, 10);
  }
  const masked = Buffer.alloc(payload.length);
  for (let i = 0; i < payload.length; i++) masked[i] = payload[i] ^ mask[i % 4];
  socket.write(Buffer.concat([header, masked]));
}

function wsRead(socket, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('read timeout')), timeoutMs);
    let buf = Buffer.alloc(0);
    const onData = (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      if (buf.length < 2) return;
      let payloadLen = buf[1] & 0x7f;
      let offset = 2;
      if (payloadLen === 126) { if (buf.length < 4) return; payloadLen = buf.readUInt16BE(2); offset = 4; }
      else if (payloadLen === 127) { if (buf.length < 10) return; payloadLen = Number(buf.readBigUInt64BE(2)); offset = 10; }
      if (buf.length >= offset + payloadLen) {
        clearTimeout(timer);
        const text = buf.slice(offset, offset + payloadLen).toString();
        socket.removeListener('data', onData);
        try { resolve(JSON.parse(text)); } catch { resolve({ raw: text }); }
      }
    };
    socket.on('data', onData);
  });
}

try {
  const socket = await wsConnect(port, token);

  // Read connect challenge
  await wsRead(socket, 5000);

  // Send agent.turn RPC
  const rpcId = crypto.randomUUID();
  wsSend(socket, {
    type: 'rpc',
    id: rpcId,
    method: 'agent.turn',
    params: { message, agentId: agentId || 'main' }
  });

  // Collect response - wait for rpc.result or stream chunks
  let response = '';
  const deadline = setTimeout(() => {
    console.log(JSON.stringify({ response: response || '（超时）' }));
    socket.destroy(); process.exit(0);
  }, 90000);

  while (true) {
    try {
      const msg = await wsRead(socket, 85000);
      if (msg.type === 'rpc.result' && msg.id === rpcId) {
        response = msg.result?.response || msg.result?.text || msg.result?.content || JSON.stringify(msg.result);
        break;
      } else if (msg.type === 'rpc.error' && msg.id === rpcId) {
        response = `错误: ${msg.error?.message || JSON.stringify(msg.error)}`;
        break;
      } else if (msg.type === 'event') {
        // Streaming chunks
        if (msg.event?.includes('chunk') || msg.event?.includes('stream')) {
          response += msg.payload?.text || msg.payload?.content || '';
        } else if (msg.event?.includes('done') || msg.event?.includes('complete')) {
          if (msg.payload?.response) response = msg.payload.response;
          break;
        }
      }
    } catch (e) {
      if (response) break;
      response = `错误: ${e.message}`;
      break;
    }
  }

  clearTimeout(deadline);
  console.log(JSON.stringify({ response }));
  socket.destroy();
  process.exit(0);
} catch (e) {
  console.log(JSON.stringify({ error: e.message }));
  process.exit(1);
}
