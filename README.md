# Elo — conversa por voz

Site de voz em português, com grupos criados pelos usuários e organizados em uma lista vertical. Sem grupos pré-criados, chat de texto, câmera, cadastro, banco de dados ou gravação de áudio.


## Aplicativo Windows com tudo incluído

Para usar o instalador sem Node.js e hospedar o servidor no Render, veja [GUIA-APLICATIVO-WINDOWS.md](GUIA-APLICATIVO-WINDOWS.md). No aplicativo, a conexão com o LoL acontece ao ativar a voz, sem conector separado ou código manual.

## Rodar no computador

Requer Node.js 22 ou superior.

```sh
npm install
npm start
```

Abra **http://localhost:3000**. No Windows, se o PowerShell bloquear `npm.ps1`, use `npm.cmd install` e `npm.cmd start`.

Clique em **Criar meu grupo**, escolha seu nome, dê um nome ao grupo e autorize o microfone. Outras pessoas conectadas ao mesmo servidor podem entrar pela lista ou pelo botão **Convidar**. Um convite com `localhost` só funciona no próprio computador; para compartilhar com outras pessoas, publique o site em um domínio com HTTPS.

## Comportamento

**Voz automática no LoL:** cada jogador pode ativar o microfone uma vez, parear o conector local e ser reunido automaticamente com usuários da mesma partida/time. Veja [GUIA-VOZ-AUTOMATICA.md](GUIA-VOZ-AUTOMATICA.md). Salas automáticas duram enquanto a partida está ativa; as regras de salas manuais abaixo continuam iguais.

- Grupos independentes, até 12 participantes por grupo, uma conversa por pessoa/aba.
- Microfone, desligar som (também silencia o microfone), indicador de fala e lista de participantes.
- Busca de grupos, escolha de tema e convite por link.
- Ao sair, trocar de grupo ou fechar a página, as conexões de áudio são encerradas.
- A sala desaparece quando a última pessoa sai. Conexões interrompidas são removidas pelo heartbeat em até aproximadamente 30 segundos.
- Nomes, participantes e salas existem apenas na memória do processo. Reiniciar o servidor apaga tudo. Não há localStorage, cookies de identificação, banco de dados ou histórico de conversa.
- O servidor encaminha sinalização WebRTC; o áudio circula entre navegadores ou pelo TURN configurado. O aplicativo não grava áudio. Participantes ainda podem usar ferramentas externas de gravação; o site não consegue impedir isso.
- As salas são públicas para quem acessa esta instância. O convite facilita a entrada e não funciona como senha. Não há autenticação, moderação ou salas privadas nesta versão.

## Publicar para outras pessoas

Para hospedar gratuitamente neste PC Windows com um link temporário HTTPS, veja [GUIA-HOSPEDAR-NO-PC.md](GUIA-HOSPEDAR-NO-PC.md). Os atalhos `LIGAR-SITE.cmd`, `DESLIGAR-SITE.cmd` e `VER-LINK.cmd` controlam o servidor e o túnel.

1. Use uma hospedagem com processo Node.js contínuo e suporte a WebSocket. Hospedagem apenas de arquivos estáticos ou PHP/MySQL não é suficiente.
2. Copie `.env.example` para `.env`, ajuste `PORT` e defina `PUBLIC_ORIGIN` com a origem HTTPS exata do site.
3. Configure HTTPS com um proxy reverso (Caddy, Nginx ou o proxy da hospedagem), encaminhando HTTP e WebSocket `/ws` para o Node.js. Use timeout de WebSocket superior a 30 segundos.
4. Configure `TURN_URL`, `TURN_USERNAME` e `TURN_CREDENTIAL` para permitir comunicação em redes restritas. Sem TURN, algumas combinações de redes móveis, empresariais e NAT não conseguem estabelecer áudio. O STUN padrão usa o serviço público do Google.
5. Rode uma única instância do processo: as salas ficam na memória. Múltiplas instâncias exigem uma camada compartilhada de sinalização, não incluída.

O navegador exige HTTPS para acessar o microfone fora de `localhost`. Referência: [documentação getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia).

As credenciais TURN configuradas são entregues aos navegadores para conexão. Use credenciais dedicadas, cotas e rotação; em uma publicação de amplo acesso, substitua por credenciais temporárias geradas pelo servidor. A implementação em malha cria uma conexão por par de participantes: o limite de 12 é uma proteção do aplicativo, não uma garantia de desempenho em qualquer dispositivo. Para grupos maiores, é indicado um servidor de mídia SFU.

## Verificação

```sh
npm test
npm run test:browser
```

Os testes de servidor cobrem salas isoladas, sinalização, validação, limite de participantes, limpeza e origem de WebSocket. Os testes de navegador usam Chrome instalado e microfone simulado para verificar uma conexão WebRTC real entre dois contextos, controles de áudio, convites, troca de sala, permissões e layout mobile. Para usar outro canal Chromium instalado, defina `BROWSER_CHANNEL`. Imagens da verificação ficam em `test-results/`.

## Arquivos

- `server.js`: servidor HTTP, WebSocket, sinalização e salas em memória.
- `public/`: interface sem framework e áudio WebRTC nativo.
- `test/`: testes de integração e navegador.

Referências de implementação: [WebRTC / MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Signaling_and_video_calling) e [ws](https://github.com/websockets/ws).
