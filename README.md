# Fortune Tiger Bot — Discord Slot Machine

Bot de Discord que simula o slot **Fortune Tiger** da PG Soft com moeda virtual própria (Créulas).

## Funcionalidades

- **/slot** — Gire o Fortune Tiger (grid 3x3, 5 linhas de pagamento, Wild, feature de respin com multiplicador x10)
- **/work** — Trabalhe para ganhar Créulas (cooldown de 1h)
- **/daily** — Recompensa diária com streak crescente (cooldown de 24h)
- **/pay** — Transfira Créulas para outros usuários
- **/saldo** — Consulte seu saldo ou o de outro usuário
- **/leaderboard** — Ranking dos usuários mais ricos

## Pré-requisitos

- Node.js 18+ (LTS recomendado)
- Bot do Discord criado no [Discord Developer Portal](https://discord.com/developers/applications)

## Instalação

1. Clone o repositório e entre na pasta:

```bash
cd fortune-tiger-bot
```

2. Instale as dependências:

```bash
npm install
```

3. Configure o arquivo `.env`:

```env
DISCORD_TOKEN=seu_token_aqui
CLIENT_ID=seu_client_id_aqui
GUILD_ID=seu_guild_id_aqui
```

4. **(Opcional)** Coloque um arquivo `big_win.mp3` em `assets/audio/` para o som de prêmio grande.

5. Registre os comandos slash no Discord:

```bash
npm run deploy
```

6. Inicie o bot:

```bash
npm start
```

## Emojis Customizados

O bot usa emojis existentes no servidor. Certifique-se de que os seguintes emojis existem:

- `<:Carta:1520541157816401950>`
- `<:CartasDeMoedas:1520542648308338779>`
- `<:FogosDeArtificio:1520542435527229601>`
- `<:JoiasVerdes:1520542591727173802>`
- `<:Laranja:1520542088410824844>`
- `<:ObjetosDourados:1520542538476290121>`
- `<:SacoDeMoedas:1520542480137978097>`
- `<:Wild:1520541444849270965>`
- `<:x10:1520541230314946660>`

Se precisar trocar os IDs, edite o arquivo `utils/emojis.js`.

## Configuração

Edite `config.json` para ajustar:

- Valores de aposta mínima/máxima
- Chance de ativação da feature (3% padrão)
- Probabilidades de respin
- Recompensas de /work e /daily
- Threshold de prêmio grande para som

## Estrutura do Projeto

```
├── assets/audio/          # Arquivos de áudio
├── commands/              # Comandos slash
│   ├── slot.js
│   ├── work.js
│   ├── daily.js
│   ├── pay.js
│   ├── saldo.js
│   └── leaderboard.js
├── database/
│   └── db.js              # Módulo SQLite
├── events/
│   ├── ready.js
│   └── interactionCreate.js
├── utils/
│   ├── emojis.js          # Emojis e utilitários
│   ├── format.js          # Formatação de moeda
│   ├── slot.js            # Lógica do slot
│   └── voice.js           # Sistema de áudio
├── .env                   # Token e IDs (não versionar)
├── config.json            # Parâmetros ajustáveis
├── deploy-commands.js     # Script de registro de comandos
├── index.js               # Ponto de entrada
└── package.json
```

## Licença

Este projeto é para fins educacionais e de entretenimento.
