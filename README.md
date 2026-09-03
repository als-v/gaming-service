# gaming-service

Processador distribuído de transações de jogo com saldo consistente sob concorrência real, idempotência via outbox/inbox transacional e observabilidade via Prometheus/Grafana.

As decisões de arquitetura (autenticação, ORM, concorrência, idempotência, outbox/inbox, taxonomia de erros, representação de dinheiro, diagramas, trade-offs e resultado do teste de carga) estão consolidadas em [`ARCHITECTURE.md`](./ARCHITECTURE.md). Este arquivo cobre apenas **como rodar o projeto**.

## Pré-requisitos

- [Bun](https://bun.sh/) — runtime e test runner usados em todo o projeto.
- Docker + Docker Compose — para Postgres, LocalStack (SQS), e opcionalmente Prometheus/Grafana.

## 1. Configurar variáveis de ambiente

```bash
cp .env.example .env
```

Preencha os valores em `.env` (ou use os do exemplo abaixo, que é o mesmo conjunto usado em desenvolvimento e batem com os defaults do `docker-compose.yml`):

```bash
NODE_ENV=development
PORT=3000

DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USER=postgres
DATABASE_PASSWORD=postgres
DATABASE_NAME=gaming_develop
DATABASE_SSL=false
DATABASE_LOGGING=false

AWS_REGION=us-east-1
AWS_ENDPOINT_URL=http://localhost:4566
AWS_ACCESS_KEY_ID=access_key_id
AWS_SECRET_ACCESS_KEY=secret_access_key
LOCALSTACK_PORT=4566

SQS_WAGER_TRANSACTIONS_QUEUE_NAME=wager-transactions.fifo
SQS_WAGER_TRANSACTIONS_DLQ_QUEUE_NAME=wager-transactions-dlq.fifo
SQS_WAGER_TRANSACTION_EVENTS_QUEUE_NAME=wager-transaction-events.fifo
SQS_WAGER_TRANSACTION_EVENTS_DLQ_QUEUE_NAME=wager-transaction-events-dlq.fifo
```

| Variável | Uso |
|---|---|
| `PORT` | Porta HTTP da API (múltiplas instâncias locais precisam de portas diferentes — ver seção 5). |
| `DATABASE_*` | Conexão com o Postgres (usadas tanto pela aplicação quanto pelo `docker-compose.yml` para provisionar o container). |
| `AWS_ENDPOINT_URL` | Endpoint do LocalStack; aponta o SDK da AWS para o SQS local em vez de um SQS real. |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | Credenciais fake exigidas pelo SDK; o LocalStack não valida essas credenciais. |
| `SQS_*_QUEUE_NAME` | Nomes das 4 filas (comandos + DLQ, eventos + DLQ) — devem bater com o que `docker/localstack/init-queues.sh` provisiona. |

## 2. Subir a infraestrutura

```bash
docker compose up -d postgres localstack
```

Isso sobe Postgres (com healthcheck via `pg_isready`) e LocalStack com SQS, provisionando automaticamente as 4 filas (`wager-transactions.fifo` + DLQ, `wager-transaction-events.fifo` + DLQ, cada uma com redrive policy `maxReceiveCount=5`) via `docker/localstack/init-queues.sh`. Não há um serviço `app` no compose — a aplicação roda diretamente com Bun na máquina host (ver seção 4), o que também é o que permite simular múltiplas instâncias facilmente (seção 5).

Para subir também o stack de observabilidade opcional (Prometheus + Grafana):

```bash
docker compose up -d
```

- Prometheus: http://localhost:9090
- Grafana: http://localhost:3001 (login anônimo habilitado como Admin; dashboard "Gaming Service — Wagering" já provisionado com 4 painéis: transações por status, latência p50/p95/p99, outbox lag, tamanho da DLQ)

## 3. Instalar dependências e rodar migrations

```bash
bun install
bun run migration:run
```

## 4. Rodar a API

```bash
bun run dev     # com --watch, para desenvolvimento
# ou
bun run build && bun run start   # build de produção (tsc + bun dist/main.js)
```

A API sobe em `http://localhost:${PORT}` (padrão `3000`). Endpoints principais:

- `POST /wallets` — cria wallet com saldo inicial.
- `GET /wallets/:walletId` — consulta wallet.
- `GET /wallets/:walletId/ledger` — extrato paginado (cursor).
- `POST /wallets/:walletId/reconciliation` — recalcula saldo a partir do ledger e compara com o saldo armazenado.
- `POST /wagering/transactions` — submete uma transação financeira de jogo; exige header `idempotency-key`.
- `GET /wagering/transactions/:transactionId` — consulta por id interno.
- `GET /providers/:providerId/wagering/transactions/:externalTransactionId` — consulta por id externo do provedor.
- `GET /health/live`, `GET /health/ready` — liveness (fixo) e readiness (checa Postgres e SQS de verdade; retorna `503` com a causa específica se algum dos dois estiver indisponível).
- `GET /metrics` — métricas Prometheus.

O consumer de comandos (`WagerTransactionsConsumer`) e os dois workers de background (`OutboxPublisherWorker`, `PendingReferenceResolverWorker`) sobem automaticamente junto com a aplicação — não há processo separado para eles.

## 5. Simular múltiplas instâncias (cenário de concorrência)

O cenário de concorrência pode ser exercitado com **3 ou mais instâncias simultâneas** contra o mesmo Postgres/SQS. Como não há orquestração de container para a app, isso é feito localmente com várias portas:

```bash
PORT=3000 bun run dev
PORT=3001 bun run dev
PORT=3002 bun run dev
```

As três instâncias apontam para o mesmo Postgres e o mesmo LocalStack (definidos em `.env`), competem pela mesma fila `wager-transactions.fifo` (cada mensagem é entregue a só uma delas) e pelas mesmas linhas de `outbox_messages` (particionadas entre workers via `SELECT ... FOR UPDATE SKIP LOCKED`, ver `ARCHITECTURE.md` seção 5). Envie requisições HTTP para qualquer uma das três portas — o comportamento observável (saldo, status das transações) deve ser idêntico independente de qual instância atendeu cada requisição.

Os testes de integração em `test/integration/concorrencia-multiprocesso.spec.ts` automatizam exatamente esse cenário (via `spawnApp()`/`stopApp()`, subindo processos reais `bun src/main.ts`), incluindo injeção determinística de crash entre commit e ack (`WAGER_CONSUMER_CRASH_AFTER_COMMIT=1`) e verificação de recuperação por redelivery — não é necessário reproduzir manualmente para validar isso, mas a instrução acima serve para inspeção/demonstração manual.

## 6. Testes

```bash
bun test                    # suíte completa (unidade + integração), 1 processo bun test v1.x
bun run test:unit           # só src/**/*.spec.ts (unidade, sem dependências externas)
bun run test:integration    # só test/integration/**/*.spec.ts (Postgres + LocalStack reais — nenhum mock de banco/fila)
```

Os testes de integração assumem Postgres e LocalStack já no ar (seção 2) e migrations já aplicadas (seção 3). Não usam containers efêmeros próprios — rodam contra a mesma infraestrutura usada em desenvolvimento.

> Nota de higiene de ambiente: os testes de outbox/pending-reference (`mensageria-outbox-inbox.spec.ts`) leem lotes limitados por tempo (`BATCH_SIZE`/backoff dos workers). Um Postgres/LocalStack de desenvolvimento muito poluído por execuções manuais repetidas de `test:load` ou por processos `bun src/main.ts` esquecidos rodando em background pode fazer esses testes específicos falharem por volume de dados alheio à execução atual, não por regressão de código — se isso acontecer, confirme que não há uma instância de `bun src/main.ts` órfã ainda rodando (`ps aux | grep main.ts`) antes de investigar mais a fundo.

Outros comandos úteis:

```bash
bun run lint        # eslint em src/test/scripts
bun run format      # prettier --write em src/test/scripts
bun run build       # tsc -p tsconfig.build.json
```

## 7. Teste de carga (diferencial)

```bash
LOAD_TEST_WALLETS=10 LOAD_TEST_CONCURRENCY=10 LOAD_TEST_DURATION_SECONDS=20 bun run test:load
```

Requer a API já rodando (seção 4). Variáveis de ambiente (todas opcionais, com default entre parênteses): `LOAD_TEST_BASE_URL` (`http://localhost:3000`), `LOAD_TEST_WALLETS` (`20`), `LOAD_TEST_CONCURRENCY` (`20`), `LOAD_TEST_DURATION_SECONDS` (`20`), `LOAD_TEST_INITIAL_BALANCE` (`1000000.00`). Ao final, imprime throughput, taxa de sucesso, percentis de latência e o delta de métricas (`/metrics`) observado durante a janela — resultado de referência e metodologia completa em `ARCHITECTURE.md`, seção 10.

## 8. Derrubar o ambiente

```bash
docker compose down          # mantém os volumes (dados persistem)
docker compose down -v       # remove também os volumes (Postgres e LocalStack voltam zerados)
```
