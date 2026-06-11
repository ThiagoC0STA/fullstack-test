# Crash Game 🎮 — Jungle Gaming Challenge

Crash game multiplayer em tempo real: dois microsserviços NestJS (DDD/hexagonal) comunicando por RabbitMQ com outbox/inbox transacional, provably fair verificável **no navegador**, frontend Next.js com gráfico canvas a 60fps e precisão monetária integral (dinheiro jamais passa por ponto flutuante).

## Quick start

Pré-requisitos: Docker + Docker Compose + Bun >= 1.x.

```bash
bun install
bun run docker:up   # sobe TUDO: Postgres, RabbitMQ, Keycloak, Kong, services, frontend
```

| O quê | Onde | Credenciais |
| --- | --- | --- |
| **Jogo** | http://localhost:3000 | `player` / `player123` (saldo inicial $ 1000.00) |
| API via Kong | http://localhost:8000 | — |
| Swagger games | http://localhost:4001/docs | — |
| Swagger wallets | http://localhost:4002/docs | — |
| Keycloak admin | http://localhost:8080 | `admin` / `admin` |
| RabbitMQ UI | http://localhost:15672 | `admin` / `admin` |

Zero passos manuais: realm do Keycloak importado no boot (usuário de teste com id fixo), migrations rodam na subida dos services, carteira do `player` semeada com saldo via migration.

## O que está implementado

**Obrigatórios**
- Ciclo completo: fase de apostas (10s) → multiplicador sobe → cashout/crash → liquidação via saga
- Dois services separados comunicando **assincronamente** via RabbitMQ (tópico `crash.events`)
- Sincronização em tempo real via socket.io (abra duas abas — mesmo estado)
- Precisão monetária: centavos inteiros de ponta a ponta, saldo nunca negativo
- JWT do Keycloak validado nos dois services via JWKS (`jose`)
- Provably fair com hash chain + endpoint de verificação
- Testes unitários (domínio) + E2E

**Bônus**
- ✅ **Outbox/Inbox transacional** nos dois services (at-least-once delivery, exactly-once processing)
- ✅ **Auto cashout** (multiplicador alvo na UI)
- ✅ **Efeitos sonoros** sintetizados via WebAudio (zero assets de áudio)
- ✅ **Fórmula da curva exibida na UI** (`m(t) = ⌊100·e^(0.00006t)⌋`)
- ✅ **Verificação provably fair no navegador** via WebCrypto (clique em qualquer rodada do histórico)

## Arquitetura

```
            ┌───────────────────────────┐
            │   Frontend (Next.js 16)   │
            │ Zustand + TanStack Query  │
            └──────┬──────────┬─────────┘
              REST │          │ WebSocket (socket.io, só server→client)
            ┌──────▼──────────▼─────────┐         ┌──────────────┐
            │       Kong (:8000)        │         │   Keycloak   │
            └──────┬──────────┬─────────┘         │ (OIDC+PKCE)  │
              /games          /wallets            └──────▲───────┘
            ┌──────▼─────┐  ┌─────▼──────┐   JWKS        │ login no browser
            │   Games    │  │  Wallets   │◄──────────────┘
            │  (NestJS)  │  │  (NestJS)  │
            └──┬───┬─────┘  └──┬───┬─────┘
               │   │ outbox    │   │ outbox
        ┌──────▼┐  │  ┌────────▼┐  │
        │  PG   │  │  │   PG    │  │      RabbitMQ (topic crash.events)
        │ games │  └──┼─────────┼──┴──► wallet.debit.requested
        └───────┘     │ wallets │ ◄──── wallet.debit.settled
                      └─────────┘  ...  wallet.credit.requested/settled
```

Cada service segue a separação `domain → application → infrastructure → presentation`:

- **domain/** — agregados puros, sem nenhuma dependência de framework ou ORM. `Round` é a state machine (`betting → running → crashed`) e dono de todas as invariantes de aposta; `Wallet` garante saldo não negativo; o relógio é sempre injetado (`now`), então o domínio é 100% determinístico sob teste.
- **application/** — use cases dependem apenas de **ports** (interfaces): `TransactionalRunner`, `RoundRepository`, `Outbox`, `Inbox`, `Clock`, `GameBroadcast`, `SeedChain`. O engine do jogo (`RoundEngine`) é uma classe sem framework dirigida por `tick()`.
- **infrastructure/** — adapters: MikroORM 7 (EntitySchema mapeia as classes de domínio **de fora**, sem decorators no domínio), RabbitMQ (@golevelup), gateway socket.io, guard JWT, publisher do outbox.
- **presentation/** — controllers REST (Swagger) e consumers do broker.

### A saga de aposta (consistência entre services sem transação distribuída)

```
POST /games/bet
  └─ TX games: bet(pending_debit) + outbox(wallet.debit.requested)   ← mesma transação
       └─ publisher → RabbitMQ → wallets
            └─ TX wallets: inbox dedup + débito + ledger + outbox(wallet.debit.settled)
                 └─ publisher → RabbitMQ → games
                      └─ TX games: inbox dedup + bet confirmada (active) ou rejeitada
                           └─ WS bet.settled → todos os clients
```

**Compensações** (o que mantém os dois lados consistentes):
- Débito falhou (saldo insuficiente) → bet `rejected`, jogador pode apostar de novo.
- Débito **confirmado depois** da rodada travar/crashar → games emite `wallet.credit.requested(bet_refund)` e rejeita a bet. Dinheiro volta sozinho.
- Restart no meio de uma rodada → recovery no boot: rodada anulada, apostas já debitadas são reembolsadas pela mesma saga.

**Exactly-once:** todo consumo passa pela tabela `inbox_messages` (PK = `messageId`); INSERT `ON CONFLICT DO NOTHING` na mesma transação do efeito. Redelivery do broker vira no-op. O outbox é drenado com `FOR UPDATE SKIP LOCKED` — seguro com múltiplas instâncias.

## Decisões e trade-offs

| Decisão | Racional | Trade-off aceito |
| --- | --- | --- |
| **Dinheiro como string de centavos inteiros** (`"1050"` = $10.50) em todo JSON, BigInt na aritmética, BIGINT no Postgres | JSON number é IEEE-754; serializar como string garante que dinheiro **nunca** passa por float em nenhuma camada. CHECK constraints no banco são a terceira linha de defesa | Parse/format explícitos em todas as bordas (helpers em `@crash/contracts`) |
| **Multiplicador como inteiro em centésimos** (254 = 2.54x) | Payout = `floor(aposta × mult / 100)` em BigInt puro — exato ao centavo | A curva de EXIBIÇÃO usa `Math.exp` (multiplicador não é dinheiro); o floor pra centésimos acontece num único ponto determinístico |
| **Outbox/inbox transacional** em vez de publish direto | Evento e mudança de estado commitam juntos; sem mensagens fantasma nem perdidas | Latência extra de até 500ms (poll do publisher) |
| **Engine single-instance com estado em memória** + Postgres como registro durável | Loop de 100ms com invariantes checadas em memória = latência mínima; recovery no boot reconstrói/compensa | Não escala horizontalmente o engine sem trabalho extra (locks/leader election) — documentado como evolução |
| **EntitySchema (MikroORM) na infraestrutura** em vez de decorators nas entidades | Domínio sem nenhum import de ORM — testável puro, arguição de DDD limpa | Mapeamento duplicado (classe + schema), ~30 linhas por agregado |
| **WebSocket só server→client; ações via REST** | Exigência do desafio que também simplifica auth (JWT no header REST) e auditoria | Cashout tem RTT de uma chamada HTTP (mitigado: multiplicador é resolvido server-side no instante do request) |
| **Cashout autoritativo no servidor** | O multiplicador pago vem do relógio do servidor no momento do request; cliente nunca manda o valor | Latência de rede do jogador afeta o multiplicador obtido (igual em qualquer crash game real) |
| **Bun runtime + tsc só como typechecker** | Bun roda TS direto (sem build step nos services); `migrationsList` explícita contorna a falta de `fs.glob withFileTypes` no Bun | Acoplamento ao Bun (aceitável: é a stack do desafio) |
| **Frontend interpola a curva localmente a 60fps** entre ticks de 10Hz do servidor, com skew de relógio medido | Animação fluida sem flood de eventos; fórmula é pública e determinística | Divergência visual de ±1 frame; dinheiro nunca depende do valor local |

## Provably fair 🔐

- Cadeia de seeds: `chain[i] = sha256(chain[i-1])`, 2000 posições, consumida **da última pra primeira**. O seed revelado da rodada N+1 é a pré-imagem do seed da rodada N — revelou um, travou toda a história.
- `sha256(seed)` é publicado **antes** da janela de apostas (aparece no gráfico).
- Crash point: `h` = primeiros 52 bits de `HMAC_SHA256(key=seed, msg="jungle-crash-game-v1")`; `h % 33 == 0` → crash instantâneo 1.00x (~3% house edge); senão `floor((100·2^52 − h)/(2^52 − h))` em centésimos, cap 10000x. Tudo BigInt.
- Verificação: `GET /games/rounds/:roundId/verify` devolve seed, hash e algoritmo — ou clique em qualquer rodada do histórico na UI e aperte **"Verificar neste navegador"**: o recomputo roda em WebCrypto na sua máquina.

## Testes

```bash
cd packages/contracts && bun test tests    # dinheiro (BigInt) + curva
cd services/games && bun test tests/unit   # Round/Bet, engine, saga, provably fair
cd services/wallets && bun test tests/unit # Wallet, ledger, use cases exactly-once
cd frontend && bun test tests              # verificação WebCrypto (mesmos snapshots do backend)
cd services/games && bun test tests/e2e    # requer docker:up
```

Cobertura de comportamento: transições e violações de invariantes do Round, cashout exato ao centavo, crash instantâneo, dedup de redelivery (exactly-once), compensação de refund, recovery pós-restart, encadeamento da hash chain, snapshots congelados do algoritmo.

Cobertura medida (`bun test --coverage`): **games 93% / wallets 90% / contracts 100%** de linhas.

## Estrutura

```
packages/contracts/      # @crash/contracts: dinheiro, curva, eventos broker/WS, views
packages/platform/       # @crash/platform: guard JWT/JWKS, outbox publisher,
                         #   inbox/outbox records, clock e helpers de config
services/games/          # engine, rounds, bets, provably fair, WS, saga (lado game)
services/wallets/        # carteira, ledger append-only, saga (lado wallet)
frontend/                # Next.js 16: jogo, OIDC PKCE, verificação no browser
docker/                  # kong.yml, realm do Keycloak, init do Postgres
```

## Segurança

- **JWT validado por JWKS** nos dois services (`jose`): assinatura conferida contra as chaves do realm + issuer; o `sub` do token vira o playerId. Nenhuma rota autenticada confia em header sem verificar a assinatura.
- **Sem float em dinheiro** em nenhuma camada (centavos string → BigInt → BIGINT + CHECK `>= 0`).
- **Provably fair**: o seed só é revelado APÓS o crash; antes, só o hash de compromisso.
- **Queries parametrizadas** em todo lugar (MikroORM + placeholders no SQL cru). Sem concatenação de string em query.
- **CORS restrito** ao frontend; **rate limiting** por IP no Kong (20/s, 600/min); **security headers** no Next (`nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`).

**Trade-off consciente — tokens OIDC em `localStorage`:** o oidc-client-ts guarda os tokens no `localStorage`, o que os expõe a roubo via XSS. O padrão ouro para dinheiro real é o **BFF pattern**: um backend-for-frontend guarda o token e entrega ao browser apenas um cookie de sessão `httpOnly` + `SameSite`, inacessível a JavaScript. Não foi feito aqui porque é uma re-arquitetura do fluxo de auth (proxy de sessão, CSRF token, refresh server-side) que ultrapassa o escopo do desafio. A mitigação atual é a superfície de XSS reduzida (React escapa output por padrão, sem `dangerouslySetInnerHTML`, security headers). **Em produção, BFF seria obrigatório.**

## Limitações conhecidas / evolução

- Engine single-instance (ver trade-offs). Caminho: leader election ou particionamento de rodadas.
- Sem DLQ: mensagem malformada é descartada com log (`nack` sem requeue). Caminho: DLX + alarme.
- Auto cashout dispara do cliente (latência de rede). Caminho: alvo registrado na aposta e executado pelo engine.
- Sem CSP estrita com nonce por request (security headers básicos aplicados). Caminho: middleware Next com nonce.
- Credenciais de infra hardcoded (`admin/admin`, `player123`) — valores de dev local do enunciado; produção usaria secrets manager.
