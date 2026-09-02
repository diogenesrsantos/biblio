# Instalação da Biblio em VPS com SQLite e Nginx

Este manual instala a versão atual da Biblio em uma VPS Ubuntu 24.04 LTS ou Debian 12, usando SQLite, serviço `systemd`, Nginx e HTTPS.

Essa é a modalidade recomendada para uma biblioteca particular com uma a três pessoas. Ela executa uma única instância da aplicação e não requer PostgreSQL.

## 1. Estrutura da instalação

| Item | Local ou valor usado |
|---|---|
| Domínio de exemplo | `biblio.exemplo.com.br` |
| Código da aplicação | `/opt/biblio` |
| Dados persistentes | `/var/lib/biblio/data` |
| Configuração privada | `/etc/biblio/biblio.env` |
| Usuário do serviço | `biblio` |
| Porta interna | `8080` |

Os dados ficam separados do código:

```text
/var/lib/biblio/data/
├── biblio.db
└── media/
```

Isso permite atualizar a aplicação sem substituir o banco ou as mídias.

Antes de começar, crie no provedor DNS um registro `A` para o domínio apontando para o IPv4 da VPS. Caso utilize IPv6, crie também um registro `AAAA`.

Execute os comandos administrativos como `root` ou prefixe-os com `sudo`.

## 2. Atualizar a VPS e instalar os pacotes básicos

```bash
apt update
apt upgrade -y
apt install -y ca-certificates curl xz-utils git nginx certbot python3-certbot-nginx ufw
```

Ative o Nginx:

```bash
systemctl enable --now nginx
systemctl status nginx --no-pager
```

## 3. Instalar o Node.js 22

O exemplo instala o binário oficial x64 do Node.js 22. Em uma VPS ARM64, troque `linux-x64` por `linux-arm64` em todos os comandos desta seção.

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

O primeiro comando deve mostrar uma versão `v22.x`.

## 4. Criar o usuário e os diretórios

```bash
adduser --system --group --home /var/lib/biblio biblio
install -d -o biblio -g biblio -m 0750 /var/lib/biblio/data
install -d -o biblio -g biblio -m 0750 /var/lib/biblio/data/media
```

O usuário `biblio` será usado somente pelo serviço e não terá acesso interativo normal.

## 5. Baixar a Biblio

O exemplo instala a versão marcada como `v0.1.3`:

```bash
git clone https://github.com/diogenesrsantos/biblio.git /opt/biblio
git -C /opt/biblio checkout v0.1.3
cd /opt/biblio
npm ci --omit=dev
```

O código pode permanecer sob propriedade de `root`; o serviço precisa apenas lê-lo. Confirme a versão:

```bash
git -C /opt/biblio describe --tags --exact-match
```

A saída esperada é `v0.1.3`.

## 6. Criar a configuração privada

```bash
install -d -o root -g biblio -m 0750 /etc/biblio
install -o root -g biblio -m 0640 /dev/null /etc/biblio/biblio.env
nano /etc/biblio/biblio.env
```

Conteúdo:

```dotenv
PORT=8080
DATA_DIR=/var/lib/biblio/data
PUBLIC_HTTPS=true
```

Não coloque senhas ou esse arquivo dentro do repositório Git.

## 7. Criar o serviço systemd

Crie o arquivo:

```bash
nano /etc/systemd/system/biblio.service
```

Conteúdo:

```ini
[Unit]
Description=Biblio - biblioteca pessoal
After=network.target

[Service]
Type=simple
User=biblio
Group=biblio
WorkingDirectory=/opt/biblio
EnvironmentFile=/etc/biblio/biblio.env
ExecStart=/usr/local/bin/node /opt/biblio/server.js
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/biblio

[Install]
WantedBy=multi-user.target
```

O código de saída usado pela restauração é tratado como falha pelo `systemd`; dessa forma, o serviço reinicia automaticamente e aplica o backup enviado pela interface.

Ative e inicie:

```bash
systemctl daemon-reload
systemctl enable --now biblio
systemctl status biblio --no-pager
```

Valide diretamente na VPS:

```bash
curl -fsS http://127.0.0.1:8080/api/health
```

Resposta esperada:

```json
{"ok":true,"database":"sqlite"}
```

Se houver erro:

```bash
journalctl -u biblio -n 100 --no-pager
```

## 8. Configurar o firewall

Antes de ativar o UFW, confirme a porta SSH usada pela VPS. O exemplo considera a porta padrão `22`:

```bash
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw enable
ufw status verbose
```

Não libere a porta `8080`. A versão atual da Biblio escuta apenas em `127.0.0.1`; o acesso externo será feito exclusivamente pelo Nginx.

## 9. Configurar o Nginx

Crie o arquivo do site:

```bash
nano /etc/nginx/sites-available/biblio.exemplo.com.br
```

Conteúdo:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name biblio.exemplo.com.br;

    # O ZIP restaurado pode ter até 180 MB e cresce ao ser enviado em Base64.
    client_max_body_size 260m;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 10s;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
```

Substitua `biblio.exemplo.com.br` pelo domínio real. Ative o site:

```bash
ln -s /etc/nginx/sites-available/biblio.exemplo.com.br /etc/nginx/sites-enabled/biblio.exemplo.com.br
nginx -t
systemctl reload nginx
```

Teste antes de ativar HTTPS:

```bash
curl -I http://biblio.exemplo.com.br
```

## 10. Ativar HTTPS

Com o DNS propagado e as portas 80 e 443 liberadas:

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

O HTTPS é obrigatório porque a configuração usa `PUBLIC_HTTPS=true`, fazendo o cookie de autenticação exigir conexão segura.

## 11. Criar a primeira conta

Abra no navegador:

```text
https://biblio.exemplo.com.br
```

No primeiro acesso, crie o usuário pessoal e uma senha com pelo menos 12 caracteres. A criação inicial deixa de estar disponível assim que a primeira conta é cadastrada.

## 12. Fazer backup pela interface

Depois de entrar:

1. Clique em **Fazer cópia**.
2. Escolha onde salvar o ZIP no computador.
3. Guarde outra cópia em HD externo ou armazenamento seguro.

O ZIP contém:

- uma cópia consistente de `biblio.db`;
- todas as imagens e vídeos de `media/`;
- manifesto com formato, data e versão da aplicação.

O download do backup é feito para o computador que está acessando a Biblio, não para o disco da VPS.

## 13. Fazer backup pela VPS

Para gravar diretamente em um disco ou diretório montado na VPS, conceda ao usuário `biblio` permissão de escrita no destino e execute:

```bash
sudo -u biblio env DATA_DIR=/var/lib/biblio/data npm run backup --prefix /opt/biblio -- /CAMINHO/DO/BACKUP
```

O comando cria um arquivo `biblio-backup-DATA-HORA.zip`.

Teste periodicamente a restauração em uma instalação separada. Um arquivo mantido somente na mesma VPS não protege contra perda da máquina.

## 14. Restaurar pela interface

1. Entre na Biblio.
2. Clique em **Restaurar cópia**.
3. Selecione um ZIP criado pela Biblio.
4. Confirme a substituição.
5. Aguarde o serviço reiniciar e recarregue a página, se necessário.

Antes de substituir os dados, a aplicação move a pasta anterior para um diretório com nome semelhante a:

```text
/var/lib/biblio/data.antes-da-restauracao-AAAA-MM-DDTHH-MM-SS
```

Não apague essa pasta até conferir artigos, conta e mídias restaurados.

## 15. Restaurar pelo terminal

Pare o serviço e execute a restauração como o usuário `biblio`:

```bash
systemctl stop biblio
sudo -u biblio env DATA_DIR=/var/lib/biblio/data npm run restore --prefix /opt/biblio -- /CAMINHO/biblio-backup.zip
systemctl start biblio
curl -fsS http://127.0.0.1:8080/api/health
```

Confira a restauração antes de remover a pasta anterior preservada automaticamente.

## 16. Redefinir a senha

O comando precisa de um terminal interativo:

```bash
sudo -u biblio env DATA_DIR=/var/lib/biblio/data npm run reset-password --prefix /opt/biblio
```

Ele solicita e confirma a nova senha sem exibi-la e encerra todas as sessões anteriores.

## 17. Atualizar a Biblio

Faça um backup antes de cada atualização. Para instalar uma nova tag, substitua `vNOVA` pela versão desejada:

```bash
sudo -u biblio env DATA_DIR=/var/lib/biblio/data npm run backup --prefix /opt/biblio -- /CAMINHO/DO/BACKUP
systemctl stop biblio
git -C /opt/biblio fetch --tags
git -C /opt/biblio checkout vNOVA
cd /opt/biblio
npm ci --omit=dev
systemctl start biblio
systemctl status biblio --no-pager
curl -fsS http://127.0.0.1:8080/api/health
```

Não substitua nem apague `/var/lib/biblio/data` durante a atualização.

## 18. Diagnóstico rápido

```bash
systemctl status biblio nginx --no-pager
journalctl -u biblio -n 100 --no-pager
curl -fsS http://127.0.0.1:8080/api/health
nginx -t
ss -lntp
ufw status verbose
df -h
```

Verifique especialmente:

- Biblio ativa e ouvindo somente em `127.0.0.1:8080`;
- Nginx ouvindo nas portas 80 e 443;
- resposta `database: sqlite` no endpoint de saúde;
- espaço livre suficiente para o banco, mídias e uma restauração;
- certificado HTTPS válido;
- permissões de `/var/lib/biblio` pertencentes a `biblio:biblio`.

## 19. Limitações operacionais

- Execute somente uma instância da Biblio usando esse banco.
- Não coloque `biblio.db` em NFS ou outro sistema de arquivos de rede.
- Não use múltiplos contêineres ou réplicas apontando para o mesmo arquivo.
- Para muitos usuários gravando simultaneamente, prefira a edição PostgreSQL.
- Monitore espaço em disco, principalmente quando houver vídeos.
