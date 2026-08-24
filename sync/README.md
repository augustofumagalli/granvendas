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

## Passo 2 — script de sincronização (próximo)

Com o schema em mãos, entra aqui o `sincronizar.js`: lê clientes e produtos do
Firebird e faz upsert no Supabase (clientes por CNPJ, produtos por código),
agendável no Agendador de Tarefas do Windows.

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
