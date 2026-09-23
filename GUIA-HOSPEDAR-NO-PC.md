# Deixar o Elo online pelo seu PC

## Usar

1. Abra **LIGAR-SITE.cmd** com dois cliques e aguarde o link HTTPS aparecer.
2. Copie o endereço de **LINK-DO-SITE.txt** e envie aos amigos.
3. Acesse esse mesmo endereço para conversar. Autorize o microfone.
4. Para tirar o site do ar, abra **DESLIGAR-SITE.cmd**.

**VER-LINK.cmd** mostra o link da sessão atual. Pode fechar a janela do comando: o servidor e o túnel continuam em segundo plano. Eles não iniciam automaticamente com o Windows; abra LIGAR-SITE.cmd novamente depois de reiniciar o PC.

Não precisa de GitHub, MySQL, domínio pago, conta Cloudflare ou abrir portas no roteador. O Node.js escuta apenas em `127.0.0.1:3100` e o túnel publica este aplicativo via HTTPS. Os arquivos do projeto, `.env` e controles locais não são servidos pelo aplicativo.

## O que manter ligado

O computador precisa ficar ligado, com internet e **sem entrar em suspensão**. Desligar, hibernar ou suspender interrompe o acesso. O setup não altera suas configurações de energia. No Windows, ajuste manualmente o tempo de suspensão se quiser manter o site acessível por mais tempo. Continuam existindo seus custos normais de energia e internet; não contratamos serviços pagos.

## Limites desta opção gratuita

- O Quick Tunnel é temporário, voltado a testes, sem garantia de disponibilidade; o link muda ao criar outro túnel. Não substitui uma hospedagem com disponibilidade garantida.
- Até 200 requisições simultâneas no túnel, segundo a documentação da Cloudflare. O limite do aplicativo permanece em 12 pessoas por sala; chamadas grandes dependem dos computadores e conexões dos participantes.
- Qualquer pessoa com acesso ao endereço pode ver os grupos e entrar. Não há senha de sala nesta versão.
- O túnel publica a página e a sinalização. **Ele não é um servidor TURN**: o áudio WebRTC tenta conectar os participantes diretamente. Algumas redes móveis, de empresas ou NAT restritivo podem impedir áudio. Sem um TURN configurado, não há garantia de voz entre todas as redes. Se houver falha, tente outra rede; as opções TURN continuam em `.env.example`.
- Grupos e nomes só ficam na memória. Ao desligar o servidor, as salas desaparecem. Os arquivos em `.runtime` guardam apenas dados técnicos de execução e logs dos processos, não áudio nem histórico da conversa.

Referência: [Quick Tunnels gratuitos da Cloudflare](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/).

## Se copiar o projeto para outro computador

Instale Node.js 22+, execute `npm.cmd install` e baixe o executável Windows 64-bit do cloudflared pela [página oficial](https://developers.cloudflare.com/tunnel/downloads/). Salve como `.tools/cloudflared.exe` na pasta do projeto. `.tools` não vai para o GitHub. Os comandos deste projeto não instalam serviços nem mudam o firewall.

Se houver uma variável `PUBLIC_ORIGIN` de uma hospedagem antiga no `.env`, remova-a para usar os links variáveis do Quick Tunnel. O servidor continuará verificando a origem contra o host solicitado.

## Diagnóstico

- Se o link acabou de ser gerado, aguarde alguns segundos para a conexão se estabelecer.
- Confira `.runtime/tunnel.err.log` quando o túnel não conecta e `.runtime/server.err.log` quando o servidor não inicia.
- Os comandos conferem PID e horário de início antes de parar processos, para não encerrar um processo diferente que tenha reutilizado o PID.
- Em caso de conexão interrompida: execute DESLIGAR-SITE.cmd e LIGAR-SITE.cmd, e compartilhe o novo link.
