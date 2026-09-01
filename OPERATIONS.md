# Operação e evolução da Biblio

Este documento registra a configuração atual do sistema. Não armazene senhas, chaves ou URLs com credenciais neste repositório.

## Arquitetura

- Aplicação Node.js 22, sem framework, iniciada por `npm start` (`server.js`).
- Dados de negócio em PostgreSQL; a aplicação cria as tabelas necessárias ao iniciar.
- Anexos de imagens e vídeos em `data/media/`; os metadados desses anexos ficam na tabela `attachments`.
- Interface estática em `public/` e API HTTP no mesmo processo Node.
- A aplicação usa `DATABASE_URL`, `PORT` e `PUBLIC_HTTPS` definidos em `.env` localmente ou pelo serviço na VPS.

## Ambiente local

- PostgreSQL local: banco `biblio`, configurado em `.env` e atendendo em `localhost:5432`.
- Aplicação: `npm start`, disponível em `http://localhost:8080`.
- O arquivo SQLite histórico e seus arquivos WAL ficam em `data/biblio.db*`. Eles foram mantidos como origem de recuperação, mas não são o banco utilizado pela aplicação atual.
- Para migrar novamente a origem SQLite para um PostgreSQL vazio ou recuperado, inicie primeiro a aplicação para criar o esquema e então execute `npm run migrate:postgres`. O script é transacional e pode ser repetido sem duplicar registros.

## Produção / VPS

- Domínio: `https://biblio.provizi.net.br`.
- Código e mídias: `/var/www/biblio`.
- Anexos: `/var/www/biblio/data/media/`.
- Serviço: `biblio.service`, executado pelo usuário de sistema `biblio`, atendendo na porta interna `8080`.
- Configuração privada: `/etc/biblio/biblio.env` (propriedade de root; contém `DATABASE_URL`, `PORT=8080` e `PUBLIC_HTTPS=true`).
- Banco e papel da aplicação: `biblio` e `biblio_app` no PostgreSQL local da VPS.
- Nginx: `/etc/nginx/sites-available/biblio.provizi.net.br`, com link em `sites-enabled`; encaminha HTTPS para `127.0.0.1:8080`.
- Certificado: Let's Encrypt gerenciado pelo Certbot, com renovação automática. O certificado atual está em `/etc/letsencrypt/live/biblio.provizi.net.br/`.
- A porta PostgreSQL `5432` está liberada no UFW para IPv4 e IPv6 por decisão de ambiente de testes. Não remover essa regra sem uma solicitação explícita.

## Atualização da VPS

Execute como root na VPS ou a partir da máquina de desenvolvimento. Preserve sempre `data/media/` e `/etc/biblio/biblio.env`.

```bash
rsync -az --exclude=node_modules --exclude=.env --exclude='.git' ./ root@provizi.net.br:/var/www/biblio/
ssh root@provizi.net.br 'chown -R biblio:biblio /var/www/biblio && sudo -u biblio npm ci --omit=dev --prefix /var/www/biblio && systemctl restart biblio'
```

Depois da atualização, valide:

```bash
systemctl status biblio --no-pager
curl -fsS https://biblio.provizi.net.br/api/health
```

Não execute a migração SQLite durante atualizações normais: ela é destinada apenas a uma carga inicial ou restauração deliberada da base histórica.

## Backup e recuperação

O script `npm run backup` é voltado ao SQLite histórico e não substitui o backup da produção PostgreSQL.

Na VPS, faça backup de banco e mídias juntos:

```bash
install -d -m 0700 /root/backups/biblio
sudo -u postgres pg_dump -Fc biblio > /root/backups/biblio/biblio-$(date +%F).dump
tar -C /var/www/biblio/data -czf /root/backups/biblio/media-$(date +%F).tar.gz media
```

Para restaurar em uma base vazia, restaure primeiro o dump com `pg_restore`, depois as mídias no diretório `data/media/`, ajuste a propriedade para `biblio:biblio` e reinicie `biblio.service`.

## Diagnóstico rápido

```bash
systemctl status biblio nginx postgresql --no-pager
journalctl -u biblio -n 100 --no-pager
curl -fsS http://127.0.0.1:8080/api/health
nginx -t
```

O endpoint `/api/health` deve retornar `{"ok":true,"database":"postgresql"}`.

## Redefinição de senha

A senha armazenada não é recuperável. Para definir uma nova senha e invalidar todas as sessões da conta:

```bash
set -a
. /etc/biblio/biblio.env
set +a
sudo --preserve-env=DATABASE_URL -u biblio npm run reset-password --prefix /var/www/biblio
```

O comando deve ser executado em um terminal interativo. Ele usa o `DATABASE_URL` configurado no ambiente do processo ou no arquivo `.env` local.
