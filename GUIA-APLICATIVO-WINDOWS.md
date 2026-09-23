# Elo no Windows e no Render

O aplicativo Windows inclui a interface, o runtime e o conector do LoL. Os jogadores não instalam Node.js e não copiam códigos. Ativam a voz no aplicativo e mantêm o LoL aberto no mesmo PC.

O servidor compartilhado ainda é necessário para reunir pessoas e sinalizar as conexões. Quando ele está no Render, o PC do organizador pode ficar desligado. GitHub distribui código e instaladores; GitHub Pages não executa este servidor.

## Comunidade publicada

Abra https://sitedeconversa.onrender.com e clique em **Baixar aplicativo**. O instalador 1.0.3 já inclui esse endereço. Instale, abra o aplicativo e escolha seu nome; para o LoL, ative a voz automática.

## Publicar outro servidor gratuitamente

1. No Render, escolha **New > Blueprint** e selecione `Jpdezoito/sitedeconversa`. O arquivo `render.yaml` configura um único Web Service no plano **Free**.
2. Confirme que o plano é Free. Não adicione banco de dados nem disco.
3. Aguarde o deploy e copie o endereço HTTPS exibido pelo Render.
4. Abra esse endereço e confira se o site conecta. `/health` deve retornar `{"ok":true}`.

Alternativa: **New > Web Service**, repositório acima, runtime Node, build `npm ci --omit=dev`, start `npm start`, plano Free, variável `NODE_VERSION=24.19.0`.

O endereço do serviço é público; não é necessário compartilhar senhas ou tokens para incluí-lo no aplicativo.

## Gerar o instalador com a comunidade incluída

No GitHub, abra **Actions > Instalador Windows > Run workflow**, informe o endereço HTTPS do Render e execute. Ao concluir, baixe o artefato **Elo-Voice-Windows**. Ele contém o instalador `.exe`. Para oferecer download público aos amigos, publique esse `.exe` nos anexos de uma **Release** do GitHub; não coloque o binário no histórico Git.

No computador de desenvolvimento (PowerShell):

```powershell
npm.cmd ci
$env:ELO_SERVER_URL = 'https://SEU-SERVICO.onrender.com'
npm.cmd run build:desktop
```

O instalador será gerado em `dist/`. Sem `ELO_SERVER_URL`, o build usa `eloServerUrl` do `package.json`, atualmente `https://sitedeconversa.onrender.com`. Se ambos estiverem vazios, o aplicativo abre uma tela para informar a comunidade. A opção **Comunidade** permite mudar o endereço depois. Todos devem usar o mesmo endereço.

O instalador é para Windows x64, não é um APK Android. Não possui certificado comercial de assinatura de código; o Windows pode exibir um aviso de editor desconhecido.

## Conversar

Instale, abra o Elo e escolha um nome. Crie um grupo ou entre em um grupo existente. Para LoL, clique **Ativar voz automática**: o Elo lê o cliente local e reúne usuários com a voz ativada que estejam na mesma partida, região e time. O microfone fica sem transmitir enquanto aguarda. Ao terminar a partida, a sala encerra; a próxima partida gera outra sala.

Nomes, salas, códigos e associação com a partida ficam em memória. O aplicativo não grava áudio. Apenas o endereço da comunidade é salvo na configuração local. Fechar o Elo encerra a participação; abrir novamente requer ativar a voz.

## Limites reais

- O plano gratuito do Render pode adormecer após 15 minutos sem tráfego e levar cerca de um minuto para reabrir. Há cotas de horas e tráfego; não é uma garantia de disponibilidade contínua. Veja a [documentação do Render](https://render.com/docs/free). Para manter custo zero, não habilite upgrades ou cobrança adicional.
- Reinícios/deploys apagam as salas e exigem reativar a voz automática.
- O áudio usa WebRTC. Ainda é preciso um serviço TURN para redes que bloqueiam conexão direta. Este projeto aceita `TURN_URL`, `TURN_USERNAME` e `TURN_CREDENTIAL` nas variáveis privadas do Render, mas não inclui um TURN público próprio nem credenciais gratuitas garantidas.
- Não há autenticação oficial da Riot. A associação usa o cliente local; um cliente modificado pode mentir sobre a partida. TFT e espectador não criam salas.
- A leitura real do cliente foi verificada fora de partida; o ciclo de partidas e encerramento foi testado com dados simulados. Validar com uma partida real entre PCs/redes diferentes continua necessário.

## Verificação de desenvolvimento

```powershell
npm.cmd test
npm.cmd run test:desktop
npm.cmd run test:auto
```

O teste desktop abre duas instâncias com microfones simulados, verifica o pareamento integrado, o isolamento do renderer, os pacotes de áudio recebidos e a tela de comunidade. Não grava o microfone real.
