# sync — agente de sincronização SiSCom → GranVendas

Scripts que rodam **num PC da empresa** (não fazem parte do app). Leem o banco
Firebird do SiSCom e mandam clientes/produtos para o Supabase do GranVendas.
Só conexão de saída — nada de abrir porta ou IP fixo.

## Passo 1 — descobrir a estrutura do banco (estamos aqui)

No PC que acessa o SiSCom (com o [Node.js](https://nodejs.org) instalado):

```
cd sync
npm install
node descobrir-schema.js --host gransalus --db "C:\Siscom\DADOS.FDB"
```

- `--host` é a máquina onde o Firebird roda (provavelmente `gransalus`, dona do drive Y:).
- `--db` é o caminho do arquivo `.FDB`/`.GDB` **no servidor**. Onde achar:
  - abra o `SiscomHttpSvr.ini` (na pasta do SiSCom) — costuma ter o caminho do banco;
  - ou a tela de login/sobre do SiSCom;
  - ou procure por `*.FDB` / `*.GDB` na pasta do servidor.
- Usuário/senha padrão do Firebird: `SYSDBA` / `masterkey` (se foi trocada, use `--user` e `--senha`).

O script gera `schema-siscom.txt` com **apenas nomes de tabelas e colunas**
(nenhum dado, nenhum valor financeiro). É esse arquivo que deve ser enviado no
chat para montarmos o passo 2.

Para espiar o conteúdo de uma tabela (mostra 5 linhas só no console):

```
node descobrir-schema.js --host gransalus --db "C:\Siscom\DADOS.FDB" --amostra CLIENTES
```

## Passo 2 — sincronizar (`sincronizar.js`)

Lê `TCADCLIENTE` (clientes), `TCADPRODUTO` + `TBSALDOATUAL` (produtos/estoque)
e `TBPRODUTOPRECO` (listas de preço) do Firebird e faz upsert no Supabase:
clientes por CNPJ, produtos por código. Campos vazios no SiSCom não apagam o
que já está preenchido no app (GPS, observação etc.).

1. Copie `config.exemplo.json` para `config.json` e preencha:
   - `firebird`: já vem com host/banco da Grantubos (`SERVISOFT`, `D:\Siscom\TabelasAds\DBSISCOM.FDB`);
   - `supabase.url` e `supabase.anonKey`: os mesmos do `.env` do app (`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`);
   - `supabase.email` / `supabase.senha`: um login válido do GranVendas (o script entra como esse usuário).
2. Descubra as listas de preço: `node sincronizar.js --listas` e preencha
   `listaPreco` no config com o código da lista usada nos orçamentos
   (na Grantubos: 5 = VAREJO CNPJ; linha 1 = a prazo, linha 2 = à vista).
   `node sincronizar.js --precos CODIGO` mostra todos os preços de um
   produto para conferir.
3. Ensaio sem gravar nada: `node sincronizar.js --teste`
4. Valendo: `node sincronizar.js` (ou `--so-clientes` / `--so-produtos`)
5. Uma vez (ou quando quiser): `node sincronizar.js --geocodificar` — acha a
   localização no mapa dos clientes sem coordenada pelo endereço
   (Nominatim/OpenStreetMap, 1 consulta/segundo — a carteira toda leva
   alguns minutos). Habilita o GPS do Roteiro para esses clientes.

Observações:
- Clientes pessoa física (CPF) e sem CNPJ ficam de fora por enquanto (o app
  exige CNPJ de 14 dígitos); o script mostra quantos foram pulados.
- Clientes inativos no SiSCom não são enviados; produtos inativos são enviados
  com `ativo = false` (somem da venda sem sumir do histórico).

### Agendar no Windows (opcional)

Dê **duplo clique em `agendar.bat`** (uma vez só): cria a tarefa
"GranVendas Sincronizacao", que roda todo dia às 07:00 no PC ligado.
Cada rodada fica registrada em `sincronizacao.log`. Para mudar o horário,
edite o `/ST 07:00` dentro do `agendar.bat` e rode de novo; para remover:
`schtasks /Delete /TN "GranVendas Sincronizacao"`.

## Alternativa a investigar: API do SiSCom

Na pasta do SiSCom existe um `SiscomHttpSvr.exe` — um servidor HTTP do próprio
sistema. Vale abrir o `SiscomHttpSvr.ini` e perguntar ao suporte do SiSCom
(Servisoft) se ele expõe consulta de clientes/produtos. Se sim, o agente pode
usar essa API em vez de ler o banco direto.

## Segurança

- Nunca exponha a porta do Firebird (3050) na internet.
- O agente só precisa de leitura no Firebird; a escrita é só no Supabase.
- Não envie backup do banco (`.fbk`/`.fdb`) para fora da empresa — ele contém
  todos os dados, inclusive financeiros. O `schema-siscom.txt` resolve sem isso.
