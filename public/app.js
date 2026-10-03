import { champions, championVersion } from './champions.js';
const $ = selector => document.querySelector(selector);
function revealGuideTopic() {
  const topic = document.getElementById(location.hash.slice(1));
  if (topic?.matches('details.guide-topic')) topic.open = true;
}
window.addEventListener('hashchange', revealGuideTopic);
revealGuideTopic();
const desktop = window.eloDesktop;
const desktopConfig = desktop ? await desktop.getConfig() : null;
if (desktop) {
  document.body.classList.add('desktop-app');
  const settings = document.createElement('button');
  settings.className = 'secondary'; settings.textContent = 'Comunidade';
  settings.onclick = () => desktop.settings();
  document.querySelector('.topbar').append(settings);
}
const icons = {
  activity:'M3 12h4l3-8 4 16 3-8h4', coffee:'M4 8h12v7a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zm12 1h2a3 3 0 0 1 0 6h-2M7 2v2m5-2v2M2 22h18',
  game:'M7 6h10a4 4 0 0 1 4 4l1 8a2 2 0 0 1-3 2l-4-3H9l-4 3a2 2 0 0 1-3-2l1-8a4 4 0 0 1 4-4zM6 12h4m-2-2v4m8-3h.01m3 3h.01', music:'M9 18V5l11-2v13M9 8l11-2M9 18a3 3 0 1 1-3-3c2 0 3 1 3 3m11-2a3 3 0 1 1-3-3c2 0 3 1 3 3', spark:'m12 3 2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6z',
  plus:'M12 5v14M5 12h14', grid:'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  shield:'M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6zM8 12l3 3 5-6', edit:'m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15z',
  headphones:'M4 14v-3a8 8 0 0 1 16 0v3M4 12H3v8h4v-8zm16 0h1v8h-4v-8z', mic:'M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0zM5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8',
  'mic-off':'m3 3 18 18M9 9v3a3 3 0 0 0 5 2M9 5a3 3 0 0 1 6 0v4M5 10v2a7 7 0 0 0 12 5M19 12v-2M12 19v3M8 22h8',
  'phone-off':'M3 16c5-6 13-6 18 0l-2 4-5-2v-3h-4v3l-5 2z', link:'m10 13 4-4M8 16l-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0M16 8l2-2a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0',
  search:'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14m5 12 6 6', arrow:'M4 12h16m-6-6 6 6-6 6', close:'m6 6 12 12M6 18 18 6', volume:'m11 4-6 5H2v6h3l6 5zM15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14'
};
function icon(name) { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${icons[name] || icons.headphones}"/></svg>`; }
document.querySelectorAll('[data-icon]').forEach(el => el.innerHTML = icon(el.dataset.icon));
const themes = {coffee:['☕','Resenha'],game:['🎮','Jogatina'],music:['🎵','Música'],work:['💡','Foco']};
const state = { id:null, name:'', rooms:[], roomId:null, stream:null, muted:false, deafened:false, ready:false, busy:false, iceServers:[], started:0 };
state.lol = { state:'waiting', roomId:null };
state.auto = false;
state.roster = null;
state.pairCode = null;
let socket, reconnectTimer, toastTimer, audioContext, meterTimer, joinTimer, reconnectDeadline;
let mediaRequest=0;
let participantMarkup='';
let rawMicrophone, microphoneSource, microphoneGain;
const volumes = { mic:100, headphones:100, members:new Map() };
try {
  const saved=JSON.parse(localStorage.getItem('elo-audio-volumes'));
  for(const key of ['mic','headphones']) if(Number.isFinite(saved?.[key])) volumes[key]=Math.max(0,Math.min(200,saved[key]));
} catch {}
function volumeControl(kind, label, value, member='') {
  return `<label class="volume-control"><span>${escape(label)}<output>${value}%</output></span><input type="range" min="0" max="200" step="5" value="${value}" data-volume="${kind}" data-volume-member="${escape(member)}" aria-label="${escape(label)}"></label>`;
}
function applyVolumes() {
  if(microphoneGain) microphoneGain.gain.value=volumes.mic/100;
  for(const [id,peer] of peers) if(peer.gain) peer.gain.gain.value=state.deafened ? 0 : (volumes.headphones/100)*(volumes.members.get(id) ?? 100)/100;
}
document.addEventListener('input',event=>{
  const input=event.target.closest('[data-volume]');
  if(!input) return;
  if(!['mic','headphones','member'].includes(input.dataset.volume)) return;
  const value=Math.max(0,Math.min(200,Number(input.value)));
  if(!Number.isFinite(value)) return;
  if(input.dataset.volume==='member') volumes.members.set(input.dataset.volumeMember,value);
  else volumes[input.dataset.volume]=value;
  input.closest('label').querySelector('output').textContent=value+'%';
  applyVolumes();
  try { localStorage.setItem('elo-audio-volumes',JSON.stringify({mic:volumes.mic,headphones:volumes.headphones})); } catch {}
});
let sessionToken=null, lastMessage=Date.now();
let activeFilter='all';
const peers = new Map();
const meters = new Map();
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const initials = name => String(name).match(/\d+$/)?.[0] || '#';
function toast(message) { $('#toast').textContent=message; $('#toast').hidden=false; clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('#toast').hidden=true,6500); }
function send(data) { if (socket?.readyState !== WebSocket.OPEN || !state.ready) throw new Error('A conexão caiu. Aguarde a reconexão.'); socket.send(JSON.stringify(data)); }
function setBusy(value) { state.busy=value; document.querySelectorAll('[data-create], [data-join], #create-submit').forEach(el=>el.disabled=value); }
function renderRooms() {
  const search = $('#search').value.trim().toLocaleLowerCase('pt-BR');
  const visible = state.rooms.filter(r=>r.name.toLocaleLowerCase('pt-BR').includes(search) && (activeFilter==='all' || r.theme===activeFilter));
  $('#room-count').textContent=state.rooms.length;
  $('#active-rooms').textContent=state.rooms.length;
  $('#active-people').textContent=state.rooms.reduce((count,r)=>count+r.members.length,0);
  $('#empty-state').hidden=state.rooms.length>0;
  $('#no-results').hidden=!state.rooms.length || !!visible.length;
  $('#sidebar-rooms').innerHTML=state.rooms.length ? state.rooms.map(r=>`<button class="sidebar-room ${r.id===state.roomId?'current':''}" data-join="${r.id}">${icon('volume')}<span class="room-label">${escape(r.name)}</span><span class="mini-count">${r.members.length}</span></button>`).join('') : '<div class="sidebar-empty">Nenhum grupo por enquanto.<br>Que tal começar uma conversa?</div>';
  $('#room-list').innerHTML=visible.map(r=>`<article class="room-card ${r.id===state.roomId?'current':''}" data-theme="${r.theme}"><span class="room-symbol">${icon(r.theme==='work'?'spark':r.theme)}</span><div class="room-details"><h3>${escape(r.name)}<span class="room-live">AO VIVO</span></h3><p><span class="room-theme">${themes[r.theme][1]}</span><span class="room-divider">·</span>${r.members.length}/${r.capacity} pessoas</p></div><div class="room-people" aria-hidden="true">${r.members.slice(0,3).map(m=>`<span class="avatar">${escape(initials(m.name))}</span>`).join('')}</div><button class="join-button" data-join="${r.id}" ${state.busy || (r.members.length>=r.capacity && r.id!==state.roomId)?'disabled':''}>${r.id===state.roomId?'Você está aqui':'Entrar no grupo'}${icon(r.id===state.roomId?'headphones':'arrow')}</button></article>`).join('');
  const self=state.rooms.find(r=>r.id===state.roomId)?.members.find(m=>m.id===state.id);
  $('#profile-name').textContent=self?.name || 'Número automático';
  $('#profile-avatar').textContent=self?.number || '#';
  renderCall();
  renderLol();
}
function renderLol() {
  const room = state.rooms.find(r=>r.id===state.lol.roomId && r.kind==='lol');
  const labels = {
    disabled:['Converse com seu time pelo microfone.','Ative a voz e conecte seu LoL. Quem estiver na mesma partida e no mesmo time entra junto.'],
    waiting:['Conecte seu LoL para entrar automaticamente','Abra o conector no seu PC e use o código abaixo.'],
    offline:['Aguardando seu LoL ou seu conector','Deixe o conector aberto no mesmo PC em que você joga.'],
    idle:['Voz automática ativada. Aguardando sua partida.','Microfone sem transmitir. Você entra junto dos aliados conectados quando a partida começar.'],
    ended:['GG! A sala da partida foi encerrada.','A próxima partida ganha uma nova sala e um novo convite.'],
    unsupported:['Sem partida de equipe compatível','Abra uma partida do LoL como jogador. Espectador e TFT não criam salas.'],
    limit:['Limite de salas atingido','Aguardando uma sala ficar disponível.'],
    unavailable:['Não foi possível ler a partida agora','Tentando novamente. O cliente pode estar abrindo ou atualizando.'],
    reconnecting:['Reconectando ao LoL…','A sala será preservada por até 90 segundos enquanto o cliente reconecta.'],
    checking:['Confirmando o fim da partida…','Aguardando o cliente confirmar a volta ao lobby.']
  };
  let [title,description] = labels[state.lol.state] || labels.waiting;
  if (desktop && ['waiting', 'offline'].includes(state.lol.state)) {
    title = 'Aguardando seu League of Legends';
    description = 'Abra o LoL neste PC. O Elo conecta automaticamente quando sua partida começar.';
  }
  if(room && state.lol.state==='playing') {
    title=`Partida ${room.match.region} ${room.match.gameId} · Time ${room.match.teamId===100?'Azul':'Vermelho'}`;
    description=`${room.members.length}/${room.capacity} na voz · A sala encerra automaticamente quando a partida terminar.`;
  }
  if(!state.auto) [title,description]=labels.disabled;
  if(!state.ready) { title='Conectando ao servidor…'; description='Aguardando a conexão com o servidor de voz.'; }
  $('#lol-title').textContent=title;
  $('#lol-description').textContent=description;
  $('#lol-panel').classList.toggle('match-active',Boolean(room));
  $('#auto-button').innerHTML=icon(state.auto?'phone-off':'mic')+(state.auto?'Desativar voz automática':'Ativar voz automática');
  $('#auto-button').disabled=state.busy || !state.ready;
  $('#auto-button').setAttribute('aria-pressed',String(state.auto));
  $('#pair-panel').hidden=Boolean(desktop) || !state.auto || !state.pairCode;
  $('#pair-code').textContent=state.pairCode || '';
  renderAllies();
}
let rosterMarkup = '';
function renderAllies() {
  const roster = state.auto ? state.roster : null;
  $('#allies-section').hidden = !roster?.players?.length;
  if (!roster?.players?.length) { $('#allies-list').replaceChildren(); rosterMarkup = ''; return; }
  const live = roster.stage === 'live';
  $('#allies-stage').textContent = live ? 'EM PARTIDA' : roster.stage === 'select' ? 'SELEÇÃO DE CAMPEÕES' : 'CARREGANDO PARTIDA';
  $('#allies-description').textContent = live ? 'Nomes disponíveis na partida. Boa conversa e bom jogo.' : 'Os nomes ficam anônimos até a partida disponibilizar os jogadores.';
  const markup = JSON.stringify(roster);
  if (rosterMarkup === markup) return;
  rosterMarkup = markup;
  const roles = { TOP:'Topo', JUNGLE:'Selva', MIDDLE:'Meio', BOTTOM:'Atirador', UTILITY:'Suporte' };
  $('#allies-list').innerHTML = roster.players.map((player, index) => {
    const champion = champions[player.championId] || Object.values(champions).find(c => (player.championKey && c.slug.toLowerCase() === player.championKey.toLowerCase()) || (player.championName && c.name === player.championName));
    const title = live ? player.name || 'Nome indisponível' : 'Anônimo';
    const championLabel = champion?.name || player.championName || 'Escolhendo campeão';
    const art = champion ? 'https://ddragon.leagueoflegends.com/cdn/img/champion/loading/' + champion.slug + '_0.jpg' : '';
    const portrait = champion ? 'https://ddragon.leagueoflegends.com/cdn/' + championVersion + '/img/champion/' + champion.slug + '.png' : '';
    return '<article class="ally-card' + (player.isSelf ? ' ally-self' : '') + '">' +
      (art ? '<img class="ally-art" src="' + art + '" alt="" referrerpolicy="no-referrer">' : '') +
      '<div class="ally-content"><span class="ally-position">' + escape(roles[player.role] || 'Aliado ' + (index + 1)) + '</span>' +
      '<h3 title="' + escape(title) + '">' + escape(title) + '</h3><span class="ally-self-label">' + (player.isSelf ? 'VOCÊ' : live ? 'NO SEU TIME' : 'IDENTIDADE OCULTA') + '</span>' +
      '<div class="ally-portrait">' + (portrait ? '<img src="' + portrait + '" alt="" referrerpolicy="no-referrer">' : icon('shield')) + '</div>' +
      '<strong class="ally-champion">' + escape(championLabel) + '</strong><span class="ally-status">' + (live ? 'Em partida' : roster.stage === 'loading' ? 'Aguardando o jogo' : !champion ? 'Aguardando escolha' : player.locked ? 'Campeão escolhido' : 'Escolha em andamento') + '</span></div></article>';
  }).join('');
}
function renderCall() {
  const room=state.rooms.find(r=>r.id===state.roomId);
  document.body.classList.toggle('in-call',Boolean(room));
  $('#call-section').hidden=!room;
  $('#page-label').textContent=room ? 'Em conversa' : 'Explorar grupos';
  if (!room) return;
  $('#call-name').textContent=room.name;
  if(!$('#audio-volumes')) {
    const controls=document.createElement('div'); controls.id='audio-volumes'; controls.className='audio-volumes';
    controls.innerHTML=volumeControl('mic','Seu microfone',volumes.mic)+volumeControl('headphones','Seu fone',volumes.headphones);
    $('#participants').after(controls);
  }
  const markup=room.members.map(m=>`<div class="participant" data-member="${m.id}"><span class="avatar">${escape(initials(m.name))}</span><strong>${escape(m.name)}${m.id===state.id?' <span>(você)</span>':''}</strong><small>${m.deafened?'Som desligado':m.muted?'Microfone desligado':m.id===state.id?'Pode falar':'Conectando…'}</small>${m.muted?`<span class="muted-icon">${icon('mic-off')}</span>`:''}${m.id===state.id?'':volumeControl('member','Volume de '+m.name,volumes.members.get(m.id) ?? 100,m.id)}</div>`).join('');
  const markupKey=JSON.stringify([room.id,state.id,room.members]);
  if(markupKey!==participantMarkup) { $('#participants').innerHTML=markup; participantMarkup=markupKey; }
  updateConnectionStatus();
}
function updateConnectionStatus() {
  let connected=0;
  for (const [id,peer] of peers) {
    const member=state.rooms.find(r=>r.id===state.roomId)?.members.find(m=>m.id===id);
    const el=document.querySelector(`[data-member="${id}"] small`);
    if(peer.pc.connectionState==='connected') connected++;
    if(el && member && !member.muted && !member.deafened) el.textContent=peer.pc.connectionState==='connected'?'Na conversa':peer.pc.connectionState==='failed'?'Falha na conexão':'Conectando…';
  }
  $('#call-status').textContent=peers.size ? connected===peers.size?'Áudio conectado':`${connected}/${peers.size} conexões de áudio`:'Esperando a galera chegar';
}
function clearPeers() {
  for(const peer of peers.values()) { clearTimeout(peer.recoveryTimer); peer.pc.close(); peer.source?.disconnect(); peer.gain?.disconnect(); peer.audio?.remove(); }
  peers.clear();
  for(const meter of meters.values()) meter.source.disconnect();
  meters.clear(); clearInterval(meterTimer); meterTimer=null;
}
function cleanup() {
  clearTimeout(reconnectDeadline); reconnectDeadline=null;
  desktop?.disconnectLol().catch(()=>{});
  state.roster=null;
  state.auto=false; state.pairCode=null; state.lol={state:'disabled',roomId:null};
  mediaRequest++;
  clearTimeout(joinTimer); clearPeers();
  state.stream?.getTracks().forEach(track=>track.stop()); state.stream=null;
  rawMicrophone?.getTracks().forEach(track=>track.stop()); rawMicrophone=null;
  microphoneSource?.disconnect(); microphoneGain?.disconnect(); microphoneSource=null; microphoneGain=null;
  volumes.members.clear();
  state.roomId=null; state.started=0; state.muted=false; state.deafened=false;
  if(audioContext) { audioContext.close().catch(()=>{}); audioContext=null; }
  $('#resume-audio').hidden=true; setBusy(false); updateControls(); renderRooms();
}
function setMicrophoneEnabled(enabled) {
  for(const stream of [rawMicrophone,state.stream]) stream?.getAudioTracks().forEach(track=>track.enabled=enabled);
}
function waitForAuto() {
  clearTimeout(joinTimer); clearPeers(); state.roomId=null; state.started=0;
  setMicrophoneEnabled(false);
  setBusy(false); renderRooms();
}
async function microphone() {
  if(state.stream?.active) return;
  const request=++mediaRequest;
  if(!navigator.mediaDevices?.getUserMedia) throw new Error('Para usar o microfone, abra o site com HTTPS ou em localhost.');
  const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
  if(!state.ready || request!==mediaRequest) { stream.getTracks().forEach(t=>t.stop()); throw new Error('A entrada foi interrompida. Tente entrar novamente.'); }
  try {
    audioContext ||= new AudioContext(); await audioContext.resume();
    if(!state.ready || request!==mediaRequest) throw new Error('A entrada foi interrompida. Tente entrar novamente.');
    rawMicrophone=stream;
    microphoneSource=audioContext.createMediaStreamSource(stream);
    microphoneGain=audioContext.createGain();
    const destination=audioContext.createMediaStreamDestination();
    microphoneSource.connect(microphoneGain); microphoneGain.connect(destination);
    state.stream=destination.stream; applyVolumes();
  } catch(error) { stream.getTracks().forEach(track=>track.stop()); throw error; }
  for (const track of stream.getTracks()) track.onended=()=>{ if(state.roomId || state.auto) { leaveRoom(); toast('O microfone foi desconectado. Conecte-o e entre novamente.'); } };
}
function meter(id, stream) {
  if(!audioContext) return;
  meters.get(id)?.source.disconnect();
  const source=audioContext.createMediaStreamSource(stream), analyser=audioContext.createAnalyser();
  analyser.fftSize=256; source.connect(analyser);
  meters.set(id,{source,analyser,data:new Uint8Array(analyser.fftSize)});
  if(!meterTimer) meterTimer=setInterval(()=>{
    for(const [key,m] of meters) {
      m.analyser.getByteTimeDomainData(m.data);
      const level=Math.sqrt(m.data.reduce((s,v)=>s+(v-128)**2,0)/m.data.length);
      const member=state.rooms.find(r=>r.id===state.roomId)?.members.find(p=>p.id===key);
      document.querySelector(`[data-member="${key}"]`)?.classList.toggle('speaking',level>4 && !member?.muted);
    }
  },120);
}
function getPeer(id) {
  if(peers.has(id)) return peers.get(id);
  const pc=new RTCPeerConnection({iceServers:state.iceServers});
  const peer={pc,candidates:[],queue:Promise.resolve(),audio:null,recoveryAttempts:0}; peers.set(id,peer);
  state.stream.getTracks().forEach(track=>pc.addTrack(track,state.stream));
  pc.onicecandidate=({candidate})=>{ if(candidate && state.ready && state.roomId && socket?.readyState===WebSocket.OPEN) send({type:'signal',to:id,data:{candidate}}); };
  pc.ontrack=event=>{
    peer.source?.disconnect(); peer.gain?.disconnect(); peer.audio?.remove();
    const audio=document.createElement('audio'); audio.autoplay=true; audio.playsInline=true; audio.muted=true;
    const stream=event.streams[0] || new MediaStream([event.track]); audio.srcObject=stream;
    $('#audio-container').append(audio); peer.audio=audio;
    peer.source=audioContext.createMediaStreamSource(stream); peer.gain=audioContext.createGain();
    peer.source.connect(peer.gain); peer.gain.connect(audioContext.destination); applyVolumes(); meter(id,stream);
    audio.play().catch(()=>$('#resume-audio').hidden=false);
  };
  pc.onconnectionstatechange=()=>{
    updateConnectionStatus();
    if(pc.connectionState==='connected') { clearTimeout(peer.recoveryTimer); peer.recoveryTimer=null; peer.recoveryAttempts=0; }
    else if(['failed','disconnected'].includes(pc.connectionState)) scheduleRecovery(id);
  };
  scheduleRecovery(id);
  return peer;
}
function scheduleRecovery(id) {
  const peer=peers.get(id);
  if(!peer || peer.recoveryTimer || peer.recoveryAttempts>=4) return;
  peer.recoveryTimer=setTimeout(()=>{
    peer.recoveryTimer=null;
    if(peers.get(id)!==peer || peer.pc.connectionState==='connected') return;
    if(!state.ready) { scheduleRecovery(id); return; }
    peer.recoveryAttempts++;
    // Only one end restarts ICE, avoiding simultaneous offers.
    if(state.id<id) offer(id,true);
    else send({type:'signal',to:id,data:{recover:true}});
    if(peer.recoveryAttempts>=4) toast('O áudio não reconectou. Confira sua internet e tente entrar na sala novamente.');
    else scheduleRecovery(id);
  },5000);
}
function offer(id,restart=false) {
  const peer=getPeer(id);
  peer.queue=peer.queue.then(async()=>{
    if(peers.get(id)!==peer || !state.ready) return;
    // Both ends may request recovery together; keep one ICE restart in flight.
    if(restart && Date.now()-(peer.lastRestart || 0)<4000) return;
    if(restart) peer.lastRestart=Date.now();
    if(restart && peer.pc.signalingState==='have-local-offer') await peer.pc.setLocalDescription({type:'rollback'});
    if(peer.pc.signalingState!=='stable') return;
    await peer.pc.setLocalDescription(await peer.pc.createOffer({iceRestart:restart}));
    if(peers.get(id)===peer && state.ready) send({type:'signal',to:id,data:{description:peer.pc.localDescription}});
  }).catch(()=>{ if(peers.get(id)===peer) scheduleRecovery(id); });
}
function reconcilePeers() {
  const room=state.rooms.find(r=>r.id===state.roomId);
  for(const id of peers.keys()) if(!room?.members.some(m=>m.id===id)) removePeer(id);
  for(const member of room?.members || []) if(member.id!==state.id) {
    if(!peers.has(member.id)) { getPeer(member.id); if(state.id<member.id) offer(member.id); }
    else if(peers.get(member.id).pc.connectionState!=='connected') scheduleRecovery(member.id);
  }
}
function removePeer(id) {
  const p=peers.get(id); clearTimeout(p?.recoveryTimer); p?.pc.close(); p?.source?.disconnect(); p?.gain?.disconnect(); p?.audio?.remove(); peers.delete(id);
  meters.get(id)?.source.disconnect(); meters.delete(id); updateConnectionStatus();
}
function handleSignal(id,data) {
  if(!state.roomId || !state.stream) return;
  const peer=getPeer(id);
  if(data.recover) { if(state.id<id) offer(id,true); return; }
  peer.queue=peer.queue.then(async()=>{
    if(peers.get(id)!==peer) return;
    if(data.description) {
      await peer.pc.setRemoteDescription(data.description);
      for(const candidate of peer.candidates.splice(0)) await peer.pc.addIceCandidate(candidate);
      if(data.description.type==='offer') { await peer.pc.setLocalDescription(await peer.pc.createAnswer()); send({type:'signal',to:id,data:{description:peer.pc.localDescription}}); }
    } else if(data.candidate) {
      if(peer.pc.remoteDescription) await peer.pc.addIceCandidate(data.candidate); else peer.candidates.push(data.candidate);
    }
  }).catch(()=>{ if(peers.get(id)===peer) scheduleRecovery(id); });
}
function connect() {
  state.ready=false;
  socket=new WebSocket(`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}/ws`);
  socket.onmessage=event=>{
    lastMessage=Date.now();
    const msg=JSON.parse(event.data);
    if(msg.type==='welcome') {
      if(msg.protocol===2 && !msg.confirmed) { socket.send(JSON.stringify({type:'hello',token:sessionToken})); return; }
      if(sessionToken && !msg.resumed) { cleanup(); toast('O servidor reiniciou ou a sessão expirou. Entre novamente em um grupo ou ative a voz automática.'); }
      clearTimeout(reconnectDeadline); reconnectDeadline=null;
      sessionToken=msg.token || null;
      state.ready=true; state.id=msg.id; state.rooms=msg.rooms; state.iceServers=msg.iceServers;
      state.lol=msg.lol || {state:'disabled',roomId:null};
      $('#server-status').textContent='Tudo pronto para conectar'; $('#connection-dot').classList.add('connected'); $('#connection-label').textContent='Disponível para conversar';
      if(msg.resumed) {
        if(state.roomId!==msg.roomId) { clearPeers(); state.roomId=msg.roomId; state.started=msg.roomId?Date.now():0; }
        if(state.roomId && !state.stream?.active) { send({type:'leave'}); cleanup(); }
        else {
          state.auto=Boolean(msg.lol?.enabled);
          if(state.auto && !msg.lol?.paired) send({type:'auto-enable'});
          setMicrophoneEnabled(Boolean(state.roomId) && !state.muted && !state.deafened);
          if(state.roomId) { meter(state.id,state.stream); reconcilePeers(); send({type:'state',muted:state.muted || state.deafened,deafened:state.deafened}); }
        }
      }
      renderRooms();
      const invite=new URL(location.href).searchParams.get('grupo');
      if(invite) { history.replaceState(null,'',location.pathname); const room=state.rooms.find(r=>r.id===invite); if(room) whenReady(()=>enterRoom({type:'join',roomId:invite})); else toast('Este convite expirou porque o grupo já foi encerrado. Crie um novo grupo.'); }
    } else if(msg.type==='rooms') { state.rooms=msg.rooms; state.lol=msg.lol || state.lol; renderRooms(); }
    else if(msg.type==='joined') {
      if(!state.stream?.active) { send({type:'leave'}); cleanup(); toast('Ative novamente o microfone para entrar.'); return; }
      clearTimeout(joinTimer); clearPeers(); state.roomId=msg.room.id; state.started=Date.now();
      if(!state.rooms.some(r=>r.id===msg.room.id)) state.rooms.push(msg.room);
      meter(state.id,state.stream); setBusy(false); $('#create-dialog').close(); renderRooms();
      setMicrophoneEnabled(!state.muted && !state.deafened);
      for(const peer of msg.peers) offer(peer.id);
      send({type:'state',muted:state.muted || state.deafened,deafened:state.deafened});
      $('#call-section').scrollIntoView({behavior:'smooth',block:'center'});
    } else if(msg.type==='peer-joined') {
      // Only the newcomer offers. This prevents simultaneous offer collisions.
    } else if(msg.type==='signal') handleSignal(msg.from,msg.data);
    else if(msg.type==='peer-left') removePeer(msg.id);
    else if(msg.type==='peer-resumed') { if(state.roomId && state.stream) { const existed=peers.has(msg.id); const peer=getPeer(msg.id); if(!existed && state.id<msg.id) offer(msg.id); else if(peer.pc.connectionState!=='connected') scheduleRecovery(msg.id); } }
    else if(msg.type==='left') cleanup();
    else if(msg.type==='room-closed' && msg.roomId===state.roomId) { if(state.auto) waitForAuto(); else cleanup(); toast(msg.message); }
    else if(msg.type==='auto-pair') {
      state.auto=true; state.pairCode=msg.code; renderLol();
      if(desktop && msg.code) desktop.connectLol(msg.code).catch(()=>toast('Não foi possível conectar o LoL. Desative e ative a voz novamente.'));
    }
    else if(msg.type==='lol-roster') { state.roster=state.auto ? msg.roster : null; renderAllies(); }
    else if(msg.type==='auto-paired') { state.pairCode=null; renderLol(); toast('LoL conectado. Você entrará na voz quando sua partida começar.'); }
    else if(msg.type==='auto-wait') { if(state.auto) waitForAuto(); }
    else if(msg.type==='auto-expired') { cleanup(); toast('O código expirou. Ative a voz automática novamente para gerar outro.'); }
    else if(msg.type==='auto-notice') toast(msg.message);
    else if(msg.type==='error') { clearTimeout(joinTimer); setBusy(false); if(!state.roomId) cleanup(); toast(msg.message); }
  };
  socket.onclose=()=>{
    state.ready=false; clearTimeout(joinTimer); setBusy(false);
    // A signaling outage need not interrupt an established peer-to-peer call.
    if(!sessionToken) { cleanup(); state.rooms=[]; }
    else if(!reconnectDeadline) reconnectDeadline=setTimeout(()=>{ reconnectDeadline=null; sessionToken=null; cleanup(); state.rooms=[]; renderRooms(); toast('A conexão não voltou. Entre novamente quando o servidor estiver disponível.'); },90000);
    renderRooms();
    $('#server-status').textContent='Reconectando…'; $('#connection-dot').classList.remove('connected'); $('#connection-label').textContent='Reconectando…';
    clearTimeout(reconnectTimer); reconnectTimer=setTimeout(connect,2500);
  };
  socket.onerror=()=>{};
}
function whenReady(action) {
  if(!state.ready) { toast('Aguarde a conexão com o servidor.'); return; }
  action();
}
async function enterRoom(message) {
  if(state.busy) return;
  if(message.roomId && state.roomId===message.roomId) { $('#call-section').scrollIntoView({behavior:'smooth'}); return; }
  setBusy(true);
  try {
    await microphone(); send(message);
    joinTimer=setTimeout(()=>{ if(state.busy) { socket.close(); toast('A entrada no grupo demorou demais. Reconectando para tentar novamente.'); } },12000);
  } catch(error) {
    if(!state.roomId) cleanup(); else setBusy(false);
    const messages={NotAllowedError:'Permita o acesso ao microfone no navegador para conversar.',NotFoundError:'Nenhum microfone foi encontrado. Conecte um e tente novamente.',NotReadableError:'Não foi possível acessar o microfone. Confira se ele está disponível.'};
    toast(messages[error.name] || error.message);
  }
}
function leaveRoom() { if(state.ready) send({type:'leave'}); else sessionToken=null; cleanup(); }
function updateControls() {
  const muted=state.muted || state.deafened;
  $('#mute-button').setAttribute('aria-pressed',String(muted)); $('#mute-button').setAttribute('aria-label',muted?'Ligar microfone':'Desligar microfone'); $('#mute-button').innerHTML=icon(muted?'mic-off':'mic');
  $('#deafen-button').setAttribute('aria-pressed',String(state.deafened)); $('#deafen-button').setAttribute('aria-label',state.deafened?'Ligar som':'Desligar som');
}
function syncAudioState() {
  setMicrophoneEnabled(Boolean(state.roomId) && !state.muted && !state.deafened);
  applyVolumes();
  updateControls(); if(state.ready) send({type:'state',muted:state.muted || state.deafened,deafened:state.deafened});
}
document.addEventListener('click',event=>{
  const filter=event.target.closest('[data-filter]');
  if(filter) {
    activeFilter=filter.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach(button=>{ const active=button===filter; button.classList.toggle('active',active); button.setAttribute('aria-pressed',String(active)); });
    renderRooms();
  }
  if(event.target.closest('[data-create]')) { if(state.auto) { toast('Desative a voz automática para usar grupos manuais.'); return; } whenReady(()=>{ $('#create-dialog').showModal(); $('#room-name').focus(); }); }
  const join=event.target.closest('[data-join]');
  if(join) {
    const room=state.rooms.find(r=>r.id===join.dataset.join);
    if(room?.kind==='lol' && (!state.auto || state.lol.roomId!==room.id)) {
      toast('Ative a voz automática e conecte seu LoL. A entrada acontece quando você estiver na mesma partida e no mesmo time.');
      $('#lol-panel').scrollIntoView({behavior:'smooth',block:'center'}); return;
    }
    whenReady(()=>enterRoom({type:'join',roomId:join.dataset.join}));
  }
});
$('#cancel-create').onclick=()=>{ if(!state.busy) $('#create-dialog').close(); };
$('#create-dialog').addEventListener('cancel',event=>{if(state.busy)event.preventDefault();});
$('#create-form').addEventListener('submit',event=>{
  event.preventDefault(); const name=$('#room-name').value.trim();
  if(!name) { $('#room-name').setCustomValidity('Digite um nome para o grupo.'); $('#room-name').reportValidity(); return; }
  enterRoom({type:'create',name,theme:new FormData(event.currentTarget).get('theme')});
});
$('#room-name').addEventListener('input',()=>$('#room-name').setCustomValidity(''));
$('#search').addEventListener('input',renderRooms);
$('#mute-button').onclick=()=>{ if(state.deafened) state.deafened=false; state.muted=!state.muted; syncAudioState(); };
$('#deafen-button').onclick=()=>{ state.deafened=!state.deafened; syncAudioState(); };
$('#leave-button').onclick=leaveRoom;
$('#home-button').onclick=()=>$('.groups-section').scrollIntoView({behavior:'smooth'});
$('#invite-button').onclick=async()=>{
  await copyInvite(state.roomId);
};
$('#auto-button').onclick=()=>{
  if(state.auto) { if(state.ready) send({type:'auto-disable'}); cleanup(); return; }
  whenReady(async()=>{
    if(state.busy) return;
    setBusy(true);
    try {
      await microphone();
      state.auto=true; state.pairCode=null;
      waitForAuto();
      send({type:'auto-enable'});
    } catch { cleanup(); toast('Permita o microfone para ativar a voz automática.'); }
  });
};
$('#copy-pair').onclick=async()=>{
  try { await navigator.clipboard.writeText(state.pairCode); toast('Código copiado. Cole no conector do seu PC.'); }
  catch { window.prompt('Copie este código para o conector:',state.pairCode); }
};
async function copyInvite(roomId) {
  if(!roomId) return;
  const automatic = state.rooms.find(r=>r.id===roomId)?.kind==='lol';
  const url=new URL(desktopConfig?.serverUrl || location.href);
  if(automatic) url.searchParams.delete('grupo'); else url.searchParams.set('grupo',roomId);
  try { await navigator.clipboard.writeText(url.href); toast(automatic?'Link do site copiado! Seus aliados devem ativar a voz automática e conectar o próprio LoL.':'Convite copiado! Envie para a galera enquanto o grupo estiver aberto.'); }
  catch { window.prompt('Copie o link do grupo:',url.href); }
}
$('#resume-audio').onclick=async()=>{ try { await audioContext?.resume(); await Promise.all([...peers.values()].filter(p=>p.audio).map(p=>p.audio.play())); $('#resume-audio').hidden=true; } catch { toast('O navegador ainda está bloqueando o áudio. Verifique as permissões.'); } };
setInterval(()=>{ if(state.started) { const seconds=Math.floor((Date.now()-state.started)/1000); $('#elapsed').textContent=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`; } },1000);
setInterval(()=>{
  if(socket?.readyState!==WebSocket.OPEN || !state.ready) return;
  if(Date.now()-lastMessage>65000) { socket.close(); return; }
  send({type:'ping'});
},20000);
window.addEventListener('pagehide',()=>{ clearTimeout(reconnectTimer); socket.onclose=null; socket.close(); cleanup(); });
window.addEventListener('pageshow',event=>{ if(event.persisted) connect(); });
renderRooms(); connect();
