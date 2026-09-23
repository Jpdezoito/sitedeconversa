const { WebSocket } = require('ws');

// Credentials for the League client stay inside the local reader. Only match metadata travels.
function connectLol({ endpoint, code, read, interval = 3000 }) {
  let socket, timer, token, stopped = false;
  function connect() {
    if (stopped) return;
    const current = socket = new WebSocket(endpoint, { handshakeTimeout: 15000 });
    let paired = false;
    current.on('open', () => current.send(JSON.stringify(token ? { token } : { code })));
    current.on('error', () => {});
    current.on('message', async raw => {
      let message;
      try { message = JSON.parse(raw); } catch { return; }
      if (message.type !== 'paired' || paired) return;
      paired = true;
      token = message.token;
      async function poll() {
        let snapshot;
        try { snapshot = await read(); } catch { snapshot = { state: 'unavailable' }; }
        if (stopped || socket !== current || current.readyState !== WebSocket.OPEN) return;
        current.send(JSON.stringify({ type: 'snapshot', snapshot }));
        timer = setTimeout(poll, interval);
      }
      await poll();
    });
    current.on('close', status => {
      clearTimeout(timer);
      if (!stopped && ![1000, 1008].includes(status)) timer = setTimeout(connect, interval);
    });
  }
  connect();
  return () => { stopped = true; clearTimeout(timer); socket?.terminate(); };
}
module.exports = { connectLol };
