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
let socket, reconnectTimer, toastTimer, audioContext, meterTimer, pendingAction, joinTimer;
let mediaRequest=0;
let activeFilter='all';
const peers = new Map();
const meters = new Map();
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const initials = name => name.trim().split(/\s+/).map(s=>[...s][0]).slice(0,2).join('').toUpperCase();
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
  $('#participants').innerHTML=room.members.map(m=>`<div class="participant" data-member="${m.id}"><span class="avatar">${escape(initials(m.name))}</span><strong>${escape(m.name)}${m.id===state.id?' <span>(você)</span>':''}</strong><small>${m.deafened?'Som desligado':m.muted?'Microfone desligado':m.id===state.id?'Pode falar':'Conectando…'}</small>${m.muted?`<span class="muted-icon">${icon('mic-off')}</span>`:''}</div>`).join('');
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
  for(const peer of peers.values()) { peer.pc.close(); peer.audio?.remove(); }
  peers.clear();
  for(const meter of meters.values()) meter.source.disconnect();
  meters.clear(); clearInterval(meterTimer); meterTimer=null;
}
function cleanup() {
  desktop?.disconnectLol().catch(()=>{});
  state.roster=null;
  state.auto=false; state.pairCode=null; state.lol={state:'disabled',roomId:null};
  mediaRequest++;
  clearTimeout(joinTimer); clearPeers();
  state.stream?.getTracks().forEach(track=>track.stop()); state.stream=null;
  state.roomId=null; state.started=0; state.muted=false; state.deafened=false;
  if(audioContext) { audioContext.close().catch(()=>{}); audioContext=null; }
  $('#resume-audio').hidden=true; setBusy(false); updateControls(); renderRooms();
}
function waitForAuto() {
  clearTimeout(joinTimer); clearPeers(); state.roomId=null; state.started=0;
  state.stream?.getAudioTracks().forEach(t=>t.enabled=false);
  setBusy(false); renderRooms();
}
async function microphone() {
  if(state.stream?.active) return;
  const request=++mediaRequest;
  if(!navigator.mediaDevices?.getUserMedia) throw new Error('Para usar o microfone, abra o site com HTTPS ou em localhost.');
  const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
  if(!state.ready || request!==mediaRequest) { stream.getTracks().forEach(t=>t.stop()); throw new Error('A entrada foi interrompida. Tente entrar novamente.'); }
  state.stream=stream;
  for (const track of stream.getTracks()) track.onended=()=>{ if(state.roomId || state.auto) { leaveRoom(); toast('O microfone foi desconectado. Conecte-o e entre novamente.'); } };
  try { audioContext ||= new AudioContext(); await audioContext.resume(); } catch {}
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
  const peer={pc,candidates:[],queue:Promise.resolve(),audio:null}; peers.set(id,peer);
  state.stream.getTracks().forEach(track=>pc.addTrack(track,state.stream));
  pc.onicecandidate=({candidate})=>{ if(candidate && state.ready && state.roomId) send({type:'signal',to:id,data:{candidate}}); };
  pc.ontrack=event=>{
    peer.audio?.remove();
    const audio=document.createElement('audio'); audio.autoplay=true; audio.playsInline=true; audio.muted=state.deafened;
    const stream=event.streams[0] || new MediaStream([event.track]); audio.srcObject=stream;
    $('#audio-container').append(audio); peer.audio=audio; meter(id,stream);
    audio.play().catch(()=>$('#resume-audio').hidden=false);
  };
  pc.onconnectionstatechange=()=>{
    updateConnectionStatus();
    if(pc.connectionState==='failed') toast('Não foi possível conectar a uma pessoa. Tente entrar novamente; algumas redes precisam de um servidor TURN.');
  };
  return peer;
}
async function offer(id) {
  const peer=getPeer(id);
  try { await peer.pc.setLocalDescription(await peer.pc.createOffer()); if(peers.get(id)===peer) send({type:'signal',to:id,data:{description:peer.pc.localDescription}}); }
  catch { if(peers.get(id)===peer) toast('Não foi possível iniciar o áudio. Saia e entre novamente.'); }
}
function handleSignal(id,data) {
  if(!state.roomId || !state.stream) return;
  const peer=getPeer(id);
  peer.queue=peer.queue.then(async()=>{
    if(peers.get(id)!==peer) return;
    if(data.description) {
      await peer.pc.setRemoteDescription(data.description);
      for(const candidate of peer.candidates.splice(0)) await peer.pc.addIceCandidate(candidate);
      if(data.description.type==='offer') { await peer.pc.setLocalDescription(await peer.pc.createAnswer()); send({type:'signal',to:id,data:{description:peer.pc.localDescription}}); }
    } else if(data.candidate) {
      if(peer.pc.remoteDescription) await peer.pc.addIceCandidate(data.candidate); else peer.candidates.push(data.candidate);
    }
  }).catch(()=>{ if(peers.get(id)===peer) toast('Houve uma falha ao conectar o áudio. Tente entrar novamente.'); });
}
function connect() {
  state.ready=false;
  socket=new WebSocket(`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}/ws`);
  socket.onmessage=event=>{
    const msg=JSON.parse(event.data);
    if(msg.type==='welcome') {
      state.ready=true; state.id=msg.id; state.rooms=msg.rooms; state.iceServers=msg.iceServers;
      state.lol=msg.lol || {state:'disabled',roomId:null};
      $('#server-status').textContent='Tudo pronto para conectar'; $('#connection-dot').classList.add('connected'); $('#connection-label').textContent='Disponível para conversar';
      if(state.name) send({type:'identify',name:state.name});
      renderRooms();
      const invite=new URL(location.href).searchParams.get('grupo');
      if(invite) { history.replaceState(null,'',location.pathname); const room=state.rooms.find(r=>r.id===invite); if(room) requireName(()=>enterRoom({type:'join',roomId:invite})); else toast('Este convite expirou porque o grupo já foi encerrado. Crie um novo grupo.'); }
    } else if(msg.type==='rooms') { state.rooms=msg.rooms; state.lol=msg.lol || state.lol; renderRooms(); }
    else if(msg.type==='joined') {
      if(!state.stream?.active) { send({type:'leave'}); cleanup(); toast('Ative novamente o microfone para entrar.'); return; }
      clearTimeout(joinTimer); clearPeers(); state.roomId=msg.room.id; state.started=Date.now();
      if(!state.rooms.some(r=>r.id===msg.room.id)) state.rooms.push(msg.room);
      meter(state.id,state.stream); setBusy(false); $('#create-dialog').close(); renderRooms();
      state.stream.getAudioTracks().forEach(t=>t.enabled=!state.muted && !state.deafened);
      for(const peer of msg.peers) offer(peer.id);
      send({type:'state',muted:state.muted || state.deafened,deafened:state.deafened});
      $('#call-section').scrollIntoView({behavior:'smooth',block:'center'});
    } else if(msg.type==='peer-joined') {
      // Only the newcomer offers. This prevents simultaneous offer collisions.
    } else if(msg.type==='signal') handleSignal(msg.from,msg.data);
    else if(msg.type==='peer-left') { const p=peers.get(msg.id); p?.pc.close(); p?.audio?.remove(); peers.delete(msg.id); meters.get(msg.id)?.source.disconnect(); meters.delete(msg.id); updateConnectionStatus(); }
    else if(msg.type==='left') cleanup();
    else if(msg.type==='room-closed' && msg.roomId===state.roomId) { if(state.auto) waitForAuto(); else cleanup(); toast(msg.message); }
    else if(msg.type==='auto-pair') {
      state.auto=true; state.pairCode=msg.code; renderLol();
      if(desktop) desktop.connectLol(msg.code).catch(()=>toast('Não foi possível conectar o LoL. Desative e ative a voz novamente.'));
    }
    else if(msg.type==='lol-roster') { state.roster=state.auto ? msg.roster : null; renderAllies(); }
    else if(msg.type==='auto-paired') { state.pairCode=null; renderLol(); toast('LoL conectado. Você entrará na voz quando sua partida começar.'); }
    else if(msg.type==='auto-wait') { if(state.auto) waitForAuto(); }
    else if(msg.type==='auto-expired') { cleanup(); toast('O código expirou. Ative a voz automática novamente para gerar outro.'); }
    else if(msg.type==='auto-notice') toast(msg.message);
    else if(msg.type==='error') { clearTimeout(joinTimer); setBusy(false); if(!state.roomId) cleanup(); toast(msg.message); }
  };
  socket.onclose=()=>{
    state.ready=false; cleanup(); state.rooms=[]; renderRooms();
    $('#server-status').textContent='Reconectando…'; $('#connection-dot').classList.remove('connected'); $('#connection-label').textContent='Reconectando…';
    clearTimeout(reconnectTimer); reconnectTimer=setTimeout(connect,2500);
  };
  socket.onerror=()=>{};
}
function requireName(action) {
  if(!state.ready) { toast('Aguarde a conexão com o servidor.'); return; }
  if(state.name) { action(); return; }
  pendingAction=action; $('#name-dialog').showModal(); $('#name-input').focus();
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
function leaveRoom() { if(state.ready) send({type:'leave'}); cleanup(); }
function updateControls() {
  const muted=state.muted || state.deafened;
  $('#mute-button').setAttribute('aria-pressed',String(muted)); $('#mute-button').setAttribute('aria-label',muted?'Ligar microfone':'Desligar microfone'); $('#mute-button').innerHTML=icon(muted?'mic-off':'mic');
  $('#deafen-button').setAttribute('aria-pressed',String(state.deafened)); $('#deafen-button').setAttribute('aria-label',state.deafened?'Ligar som':'Desligar som');
}
function syncAudioState() {
  state.stream?.getAudioTracks().forEach(track=>track.enabled=!state.muted && !state.deafened);
  peers.forEach(p=>{ if(p.audio) p.audio.muted=state.deafened; });
  updateControls(); send({type:'state',muted:state.muted || state.deafened,deafened:state.deafened});
}
document.addEventListener('click',event=>{
  const filter=event.target.closest('[data-filter]');
  if(filter) {
    activeFilter=filter.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach(button=>{ const active=button===filter; button.classList.toggle('active',active); button.setAttribute('aria-pressed',String(active)); });
    renderRooms();
  }
  if(event.target.closest('[data-create]')) { if(state.auto) { toast('Desative a voz automática para usar grupos manuais.'); return; } requireName(()=>{ $('#create-dialog').showModal(); $('#room-name').focus(); }); }
  const join=event.target.closest('[data-join]');
  if(join) {
    const room=state.rooms.find(r=>r.id===join.dataset.join);
    if(room?.kind==='lol' && (!state.auto || state.lol.roomId!==room.id)) {
      toast('Ative a voz automática e conecte seu LoL. A entrada acontece quando você estiver na mesma partida e no mesmo time.');
      $('#lol-panel').scrollIntoView({behavior:'smooth',block:'center'}); return;
    }
    requireName(()=>enterRoom({type:'join',roomId:join.dataset.join}));
  }
});
$('#name-form').addEventListener('submit',event=>{
  event.preventDefault(); const name=$('#name-input').value.trim(); if(!name) { $('#name-input').setCustomValidity('Digite seu nome.'); $('#name-input').reportValidity(); return; }
  if(!state.ready) { toast('Aguarde a conexão com o servidor.'); return; }
  state.name=name; send({type:'identify',name}); $('#profile-name').textContent=name; $('#profile-avatar').textContent=initials(name); $('#name-dialog').close();
  const action=pendingAction; pendingAction=null; action?.();
});
$('#name-input').addEventListener('input',()=>$('#name-input').setCustomValidity(''));
$('#cancel-name').onclick=()=>$('#name-dialog').close();
$('#name-dialog').addEventListener('close',()=>pendingAction=null);
$('#profile-button').onclick=()=>{ $('#name-input').value=state.name; $('#name-dialog').showModal(); };
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
  if(state.auto) { send({type:'auto-disable'}); cleanup(); return; }
  requireName(async()=>{
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
window.addEventListener('pagehide',()=>{ clearTimeout(reconnectTimer); socket.onclose=null; socket.close(); cleanup(); });
window.addEventListener('pageshow',event=>{ if(event.persisted) connect(); });
renderRooms(); connect();
