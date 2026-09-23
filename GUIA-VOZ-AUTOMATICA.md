# Conversar por microfone com seu time do LoL

No aplicativo Windows, basta abrir o Elo e o LoL e clicar em **Ativar voz automática**. Não precisa de CMD nem de código. Veja o [tutorial com os dois caminhos](https://sitedeconversa.onrender.com/#como-usar).

Para usar pelo navegador, cada jogador faz estes passos no próprio computador:

1. Abra o site Elo e clique em **Ativar voz automática**.
2. Escolha seu nome e permita o microfone.
3. No painel do código, clique em **Baixe o conector para usar neste navegador**, extraia o ZIP e abra **CONECTAR-LOL.cmd**. Precisa de Node.js 22 ou superior, disponível em [nodejs.org](https://nodejs.org).
4. No conector, cole o endereço do site e o código que apareceu no navegador.
5. Deixe o conector, o LoL e a aba do site abertos enquanto joga.

Neste PC o conector já está pronto: pode abrir o **CONECTAR-LOL.cmd** da pasta do projeto sem baixar novamente.

## O que acontece automaticamente

- A mesma **região + partida + time** leva à mesma sala de voz, sem convite entre uma partida e outra.
- Ao iniciar a partida, o site conecta o microfone aos outros aliados que também ativaram o modo e parearam seus conectores.
- Adversários e jogadores de outras partidas vão para salas diferentes. Salas LoL não aceitam entrada manual sem um conector reportando a mesma partida e time.
- Ao fim da partida, todos saem da sala e os microfones deixam de transmitir. O modo continua aguardando a próxima partida.
- A preferência de microfone/som desligados é preservada entre partidas. Na espera, o navegador mantém o microfone autorizado, mas desabilita a faixa de áudio e fecha as conexões com os outros participantes.
- **Desativar voz automática** ou **Sair do grupo** para o microfone e desliga o modo, impedindo que o sistema recoloque você na sala. Atualizar ou fechar a aba também exige novo pareamento.
- Uma falha temporária do conector preserva a sala por até 90 segundos; se nenhum conector da partida voltar, a sala é encerrada. Voltar ao lobby por 6 segundos também remove a associação. Partidas finalizadas são encerradas assim que o cliente reporta o fim.

## Por que existe o conector

A página pública não consegue descobrir a partida de cada computador sozinha. O conector consulta somente endpoints locais de leitura do cliente LoL, e envia ao Elo o estado da sessão, região, ID da partida, time e quantidade de jogadores do time. A voz continua sendo capturada e transmitida pelo navegador.

O código de pareamento é aleatório, de uso único, vale 5 minutos e vincula o conector à aba em que você ativou o microfone. Não compartilhe esse código com outra pessoa. O token de reconexão fica só na memória; não são enviados senha Riot, credenciais do cliente local ou identificadores internos de contas. Para o painel de aliados, os campeões e posições são encaminhados pelo servidor apenas à aba/aplicativo pareado; os nomes disponíveis no jogo também são encaminhados durante a partida. Na seleção, os nomes são removidos antes do envio. Esses dados não entram na lista pública de salas nem são gravados em histórico.

Esta é uma integração por conector local, **não uma verificação oficial de identidade Riot**. Uma pessoa que modifique o próprio conector pode mentir sobre sua partida/time. Para exigir identidade oficial e resistir a esse tipo de falsificação é necessária uma integração adicional aprovada pela Riot. Não é uma garantia contra intrusos mal-intencionados.

## Painel de aliados (versão 1.0.2)

Com a voz automática ativada e o conector atualizado, o painel mostra os aliados desde a seleção de campeões. Todos os nomes ficam como **Anônimo** nessa etapa, inclusive o próprio jogador, identificado apenas pelo marcador **Você**. Os campeões são exibidos quando o cliente os fornece. Ao entrar na partida, a Live Client Data API fornece os nomes visíveis do time; se ainda estiver carregando, os cartões continuam anônimos. Os cartões não indicam que todos estão no chat de voz.

O painel consulta `/lol-champ-select/v1/session` localmente e, durante o jogo, `/liveclientdata/playerlist` e `/liveclientdata/activeplayername` em `127.0.0.1:2999`. Não consulta nomes de contas na seleção nem contorna o anonimato. Retratos e nomes de campeões vêm do Data Dragon oficial da Riot.

Quem usa o aplicativo antigo deve fechar o Elo, baixar o instalador 1.0.2 e instalar a nova versão. Quem usa CMD precisa baixar novamente o ZIP do conector. As regras de voz continuam iguais: a seleção mostra o time, e a sala de voz entra ao começar a partida.

## Compatibilidade e verificação

Compatível com partidas do LoL em que o cliente apresenta o jogador em `teamOne` ou `teamTwo`; TFT, espectador e formatos sem esse modelo não são suportados. O estado é consultado a cada 3 segundos, então a criação e o encerramento não são instantâneos.

A [Riot documenta a LCU](https://developer.riotgames.com/docs/lol#league-client-api) como interface sem suporte oficial para terceiros e exige registrar aplicativos que atendem jogadores. Atualizações do jogo podem exigir ajustes. Não alteramos arquivos do jogo, não automatizamos ações e não pedimos sua senha.

Testes automatizados: `npm test` cobre divisão por partida/time/região, segurança do pareamento, encerramento, queda de conector e salas manuais. `npm run test:auto` usa partidas e microfones simulados, mas estabelece uma conexão WebRTC real entre dois navegadores e verifica recebimento de áudio, próxima partida e interrupção do microfone. A validação com uma partida real ainda depende de jogar com dois usuários pareados.

O TURN continua pendente de credenciais. Algumas redes podem conseguir entrar na sala mas falhar ao conectar áudio; a automação das salas não substitui o TURN.

## Atualizar o conector

Após editar `lib/lol-client.js`, rode `npm run build:companion` para atualizar o ZIP e a cópia do leitor em `companion/lol-client.mjs`. O ZIP contém apenas o conector e instruções, sem `.env`, lockfile, códigos ou dados pessoais.
