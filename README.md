# Biblio

Biblioteca pessoal para registrar artigos, autores, fontes, etiquetas e anexos de imagem ou vídeo. Foi desenhada para uso local de uma a três pessoas.

O conteúdo dos artigos possui editor visual com títulos, listas, ênfase, links, citações e imagens inseridas diretamente no texto. As imagens também podem ser coladas da área de transferência ou reutilizadas a partir do painel de mídias.

## Executar localmente

Requer Node.js 22 ou superior.

Configure `DATABASE_URL` em `.env` apontando para PostgreSQL. Consulte [OPERATIONS.md](OPERATIONS.md) para a configuração local, implantação na VPS, backup e recuperação.

```bash
npm install
npm start
```

Abra `http://localhost:8080`. No primeiro acesso, crie sua conta pessoal e uma senha com ao menos 12 caracteres. Os dados ficam em `data/biblio.db` e os anexos em `data/media`.

Para desenvolvimento com reinício automático:

```bash
npm run dev
```

## Redefinir a senha

Se a senha da conta for esquecida, ela não pode ser recuperada a partir do hash armazenado. Redefina-a em um terminal no diretório da aplicação:

```bash
npm run reset-password
```

O comando não exibe a senha digitada, exige ao menos 12 caracteres e encerra todas as sessões anteriores da conta. Na VPS, carregue a configuração privada e execute-o como o usuário do serviço:

```bash
set -a
. /etc/biblio/biblio.env
set +a
sudo --preserve-env=DATABASE_URL -u biblio npm run reset-password --prefix /var/www/biblio
```

## Executar com Docker

Após instalar Docker Desktop (Windows) ou Docker Engine (Linux):

```bash
docker compose up -d --build
```

Pare com `docker compose down`. Os dados persistem na pasta `data/`.

## Acesso pela rede local e remoto privado

Em outro dispositivo da mesma rede, acesse `http://IP-DO-SERVIDOR:8080`. Configure firewall e IP local fixo antes de expor o serviço.

Para acesso remoto privado, use uma VPN pessoal, como Tailscale ou WireGuard. Não abra a porta 8080 diretamente para a internet. Caso publique o sistema com HTTPS em VPS, defina `PUBLIC_HTTPS=true` para que o cookie de acesso exija conexão segura.

## PWA

No Chrome/Edge para computador ou Android, abra o menu do navegador e escolha **Instalar aplicativo** ou **Adicionar à tela inicial**. A interface e seus arquivos estáticos permanecem disponíveis offline; os artigos exigem conexão com o servidor local.

## Backup para HD externo

Conecte o HD externo e execute, substituindo o caminho pelo ponto de montagem dele:

```bash
npm run backup -- /media/SEU_HD_EXTERNO
```

No Windows, um exemplo seria:

```powershell
npm run backup -- E:\Backups
```

O comando cria uma pasta datada com uma cópia consistente do banco e todas as mídias. Recomenda-se executar semanalmente e testar a restauração em uma cópia do projeto.

## Escopo atual

- Uma única conta local, protegida por senha e sessão de 30 dias.
- A aplicação utiliza PostgreSQL; o SQLite em `data/biblio.db` é a origem histórica preservada da migração inicial.
- Vídeos e imagens são limitados a 25 MB por arquivo.
- O HTML produzido pelo editor é sanitizado no servidor antes de ser armazenado.
