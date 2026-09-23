import { createVoiceServer } from '../server.js';

// Only the local tunnel can reach this listener. No router port forwarding needed.
const app = createVoiceServer();
app.server.listen(3100, '127.0.0.1', () => console.log('Elo online: origem local em 127.0.0.1:3100'));
app.server.on('error', error => { console.error(error.message); process.exitCode = 1; app.close(); });
