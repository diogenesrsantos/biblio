const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { Writable } = require('node:stream');
const { createDatabase } = require('../database');

const root = path.join(__dirname, '..');
const envFile = path.join(root, '.env');

if (process.argv.includes('--help')) {
  console.log('Uso: npm run reset-password');
  console.log('Redefine interativamente a senha de uma conta e encerra suas sessões existentes.');
  process.exit(0);
}

if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const separator = line.indexOf('=');
    if (separator < 1 || line.trimStart().startsWith('#')) continue;
    const key = line.slice(0, separator).trim();
    if (key && !process.env[key]) process.env[key] = line.slice(separator + 1).trim();
  }
}

if (!process.stdin.isTTY || !process.stdout.isTTY) {
  console.error('Execute este comando em um terminal interativo.');
  process.exit(1);
}

let muted = false;
const quietOutput = new Writable({
  write(chunk, encoding, callback) {
    if (!muted) process.stdout.write(chunk, encoding);
    callback();
  }
});
const terminal = readline.createInterface({ input: process.stdin, output: quietOutput, terminal: true });
terminal.on('SIGINT', () => { process.stdout.write('\nOperação cancelada.\n'); terminal.close(); process.exit(130); });

const ask = prompt => new Promise(resolve => terminal.question(prompt, answer => resolve(answer.trim())));
const askHidden = prompt => new Promise(resolve => {
  muted = false;
  terminal.question(prompt, answer => {
    muted = false;
    process.stdout.write('\n');
    resolve(answer);
  });
  muted = true;
});
const hashPassword = password => {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
};

async function main() {
  const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(root, 'data');
  const pool = createDatabase(path.join(dataDir, 'biblio.db'));
  try {
    const users = (await pool.query('SELECT id,username FROM users ORDER BY id')).rows;
    if (!users.length) throw new Error('Nenhuma conta foi configurada nesta instalação.');

    let user = users[0];
    if (users.length > 1) {
      console.log('Contas disponíveis: ' + users.map(item => item.username).join(', '));
      const username = await ask('Usuário: ');
      user = users.find(item => item.username.toLowerCase() === username.toLowerCase());
      if (!user) throw new Error('Usuário não encontrado.');
    } else {
      console.log(`Redefinindo a senha de: ${user.username}`);
    }

    const password = await askHidden('Nova senha (mínimo de 12 caracteres): ');
    if (password.length < 12) throw new Error('A senha precisa ter pelo menos 12 caracteres.');
    const confirmation = await askHidden('Confirme a nova senha: ');
    if (password !== confirmation) throw new Error('As senhas não coincidem.');

    try {
      await pool.query('BEGIN');
      await pool.query('UPDATE users SET password_hash=$1 WHERE id=$2', [hashPassword(password), user.id]);
      await pool.query('DELETE FROM sessions WHERE user_id=$1', [user.id]);
      await pool.query('COMMIT');
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
    console.log('Senha redefinida. Todas as sessões anteriores foram encerradas.');
  } finally {
    terminal.close();
    pool.close();
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
