# Instalação da Biblio em VPS com PostgreSQL e Nginx

Este manual instala a edição servidor da Biblio em uma VPS Ubuntu 24.04 LTS ou Debian 12, usando PostgreSQL local, serviço `systemd`, Nginx e HTTPS.

> **Importante:** a branch `master` atual é a distribuição pessoal com SQLite. Para PostgreSQL, este manual fixa o código no commit `df8065e`. Não execute `git pull origin master` nessa instalação: isso mudaria o mecanismo de banco de dados.

## 1. Informações que serão usadas

Substitua os exemplos conforme seu ambiente:

| Item | Valor usado no manual |
|---|---|
| Domínio | `biblio.exemplo.com.br` |
| Diretório da aplicação | `/var/www/biblio` |
| Usuário Linux do serviço | `biblio` |
| Banco PostgreSQL | `biblio` |
| Usuário PostgreSQL | `biblio_app` |
| Porta interna | `8080` |

Antes de começar, crie no provedor DNS um registro `A` para o domínio apontando para o IPv4 da VPS. Se usar IPv6, crie também o registro `AAAA`.

Execute os comandos administrativos como `root` ou prefixe-os com `sudo`.

## 2. Atualizar a VPS e instalar os pacotes básicos

```bash
apt update
apt upgrade -y
apt install -y ca-certificates curl xz-utils git nginx postgresql postgresql-contrib certbot python3-certbot-nginx ufw
```

Confirme os serviços:

```bash
systemctl enable --now postgresql nginx
systemctl status postgresql nginx --no-pager
```

## 3. Instalar o Node.js 22

O exemplo abaixo instala o binário oficial x64 do Node.js 22. Em VPS ARM64, troque `linux-x64` por `linux-arm64`.

```bash
cd /tmp
NODE_VERSION=v22.23.2
curl -fsSLO "https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-linux-x64.tar.xz"
curl -fsSLO "https://nodejs.org/dist/${NODE_VERSION}/SHASUMS256.txt"
grep " node-${NODE_VERSION}-linux-x64.tar.xz$" SHASUMS256.txt | sha256sum -c -
tar -xJf "node-${NODE_VERSION}-linux-x64.tar.xz"
mv "node-${NODE_VERSION}-linux-x64" "/opt/node-${NODE_VERSION}"
ln -sfn "/opt/node-${NODE_VERSION}/bin/node" /usr/local/bin/node
ln -sfn "/opt/node-${NODE_VERSION}/bin/npm" /usr/local/bin/npm
ln -sfn "/opt/node-${NODE_VERSION}/bin/npx" /usr/local/bin/npx
```

Valide:

```bash
node --version
npm --version
```

O primeiro comando deve exibir uma versão `v22.x`.

## 4. Criar o banco e o usuário PostgreSQL

Abra o console administrativo:

```bash
sudo -u postgres psql
```

No prompt do PostgreSQL, execute:

```sql
CREATE ROLE biblio_app LOGIN;
\password biblio_app
CREATE DATABASE biblio OWNER biblio_app ENCODING 'UTF8';
\q
```

O comando `\password` solicita a senha sem gravá-la no histórico do shell. Use uma senha longa e exclusiva.

O PostgreSQL deve permanecer acessível apenas localmente. Não abra a porta `5432` no firewall.

## 5. Criar o usuário do serviço e baixar a Biblio

```bash
adduser --system --group --home /var/www/biblio biblio
git clone https://github.com/diogenesrsantos/biblio.git /var/www/biblio
cd /var/www/biblio
git checkout df8065e
chown -R biblio:biblio /var/www/biblio
sudo -u biblio npm ci --omit=dev
install -d -o biblio -g biblio -m 0750 /var/www/biblio/data/media
```

Confirme que o commit correto está instalado:

```bash
git -C /var/www/biblio rev-parse --short HEAD
```

A saída deve ser `df8065e`.

## 6. Criar a configuração privada

```bash
install -d -o root -g biblio -m 0750 /etc/biblio
install -o root -g biblio -m 0640 /dev/null /etc/biblio/biblio.env
nano /etc/biblio/biblio.env
```

Conteúdo:

```dotenv
DATABASE_URL=postgresql://biblio_app:SENHA_URL_ENCODED@127.0.0.1:5432/biblio
PORT=8080
PUBLIC_HTTPS=true
```

Substitua `SENHA_URL_ENCODED` pela senha do banco. Se ela contiver caracteres reservados de URL, como `@`, `:`, `/`, `?`, `#` ou `%`, esses caracteres precisam ser codificados. Para simplificar, pode-se usar uma senha longa formada apenas por letras e números.

Não coloque esse arquivo dentro do repositório.

## 7. Criar o serviço systemd

Crie o arquivo:

```bash
nano /etc/systemd/system/biblio.service
```

Conteúdo:

```ini
[Unit]
Description=Biblio - biblioteca pessoal
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=biblio
Group=biblio
WorkingDirectory=/var/www/biblio
EnvironmentFile=/etc/biblio/biblio.env
ExecStart=/usr/local/bin/node /var/www/biblio/server.js
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/www/biblio/data

[Install]
WantedBy=multi-user.target
```

Ative e inicie:

```bash
systemctl daemon-reload
systemctl enable --now biblio
systemctl status biblio --no-pager
```

Valide a aplicação diretamente na VPS:

```bash
curl -fsS http://127.0.0.1:8080/api/health
```

Resposta esperada:

```json
{"ok":true,"database":"postgresql"}
```

Se houver erro:

```bash
journalctl -u biblio -n 100 --no-pager
```

## 8. Configurar o firewall

Antes de ativar o UFW, libere a porta SSH usada pela VPS. O exemplo considera a porta padrão `22`:

```bash
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw enable
ufw status verbose
```

Não libere as portas `8080` nem `5432`. A porta 8080 é interna entre Nginx e Biblio; a 5432 é interna entre Biblio e PostgreSQL.

## 9. Configurar o Nginx

Crie:

```bash
nano /etc/nginx/sites-available/biblio.exemplo.com.br
```

Conteúdo inicial:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name biblio.exemplo.com.br;

    client_max_body_size 30m;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 10s;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }
}
```

Substitua `biblio.exemplo.com.br` pelo domínio real. Ative o site:

```bash
ln -s /etc/nginx/sites-available/biblio.exemplo.com.br /etc/nginx/sites-enabled/biblio.exemplo.com.br
nginx -t
systemctl reload nginx
```

Teste antes do HTTPS:

```bash
curl -I http://biblio.exemplo.com.br
```

## 10. Ativar HTTPS

Com o DNS já propagado e as portas 80 e 443 liberadas:

```bash
certbot --nginx -d biblio.exemplo.com.br
```

Escolha o redirecionamento automático de HTTP para HTTPS. Depois valide:

```bash
nginx -t
systemctl reload nginx
curl -fsS https://biblio.exemplo.com.br/api/health
certbot renew --dry-run
```

## 11. Fazer a configuração inicial

Abra no navegador:

```text
https://biblio.exemplo.com.br
```

No primeiro acesso, crie a conta pessoal com nome de usuário de pelo menos 3 caracteres e senha de pelo menos 12 caracteres. A primeira conta só pode ser criada enquanto a tabela de usuários estiver vazia.

## 12. Importar uma biblioteca SQLite existente (opcional)

Faça antes um backup do banco PostgreSQL. Copie `biblio.db` e a pasta `media/` para `/var/www/biblio/data/`, ajuste a propriedade e execute a migração:

```bash
chown -R biblio:biblio /var/www/biblio/data
set -a
. /etc/biblio/biblio.env
set +a
sudo --preserve-env=DATABASE_URL -u biblio npm run migrate:postgres --prefix /var/www/biblio
```

O script usa uma transação e ignora registros já existentes. Não o execute durante atualizações normais.

## 13. Backup do PostgreSQL e das mídias

Banco e mídias formam uma única cópia lógica; guarde os dois arquivos juntos:

```bash
install -d -m 0700 /root/backups/biblio
sudo -u postgres pg_dump -Fc biblio > /root/backups/biblio/biblio-$(date +%F-%H%M).dump
tar -C /var/www/biblio/data -czf /root/backups/biblio/media-$(date +%F-%H%M).tar.gz media
```

Copie os arquivos para outro servidor ou disco. Um backup mantido somente na mesma VPS não protege contra perda da máquina.

## 14. Restaurar um backup

Pare a aplicação:

```bash
systemctl stop biblio
```

Restaure o banco em uma base vazia:

```bash
sudo -u postgres dropdb --if-exists biblio
sudo -u postgres createdb --owner=biblio_app --encoding=UTF8 biblio
sudo -u postgres pg_restore --dbname=biblio --no-owner /CAMINHO/biblio-AAAA-MM-DD-HHMM.dump
```

Restaure as mídias e reinicie:

```bash
tar -C /var/www/biblio/data -xzf /CAMINHO/media-AAAA-MM-DD-HHMM.tar.gz
chown -R biblio:biblio /var/www/biblio/data
systemctl start biblio
curl -fsS http://127.0.0.1:8080/api/health
```

## 15. Redefinir a senha da Biblio

```bash
set -a
. /etc/biblio/biblio.env
set +a
sudo --preserve-env=DATABASE_URL -u biblio npm run reset-password --prefix /var/www/biblio
```

O comando é interativo, redefine a senha e encerra as sessões anteriores.

## 16. Diagnóstico rápido

```bash
systemctl status biblio nginx postgresql --no-pager
journalctl -u biblio -n 100 --no-pager
curl -fsS http://127.0.0.1:8080/api/health
nginx -t
ss -lntp
ufw status verbose
```

Verifique especialmente:

- `biblio` ativo e ouvindo na porta 8080;
- Nginx ouvindo nas portas 80 e 443;
- PostgreSQL sem exposição pública;
- resposta `database: postgresql` no endpoint de saúde;
- certificado HTTPS válido.

## 17. Atualizações

Essa instalação está fixada no commit PostgreSQL `df8065e`. Não atualize diretamente para `master`, pois ela utiliza SQLite. Para atualizar com segurança, deve existir antes uma branch ou versão de servidor que mantenha suporte PostgreSQL; faça backup do banco e das mídias antes de cada atualização.
