const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

test('API cobre autenticação, artigos, segurança e diagnóstico', async t => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'biblio-api-test-'));
  const port = 20000 + process.pid % 20000;
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, DATA_DIR: dataDir, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
  let errors = '';
  child.stderr.on('data', chunk => { errors += chunk; });
  t.after(async () => {
    if (child.exitCode === null) {
      child.kill();
      await new Promise(resolve => child.once('exit', resolve));
    }
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
  for (let attempt = 0; attempt < 240; attempt++) {
    try { if ((await fetch(origin + '/api/health')).ok) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 50));
    if (attempt === 239) throw new Error('Servidor de teste não iniciou: ' + errors);
  }

  const health = await fetch(origin + '/api/health');
  assert.equal(health.headers.get('x-frame-options'), 'DENY');
  assert.match(health.headers.get('content-security-policy'), /frame-ancestors 'none'/);

  const setup = await fetch(origin + '/api/auth/setup', { method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify({ username: 'teste', password: 'senha-segura-123' }) });
  assert.equal(setup.status, 201);
  const cookie = setup.headers.get('set-cookie').split(';')[0];
  const headers = { 'content-type': 'application/json', cookie, origin };
  const appearancePng = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(24)]);
  const appearanceUpload = await fetch(origin + '/api/settings/images/banner', { method: 'POST', headers: { ...headers, 'content-type': 'application/octet-stream', 'x-mime-type': 'image/png' }, body: appearancePng });
  assert.equal(appearanceUpload.status, 200);
  assert.match((await fetch(origin + '/api/settings', { headers }).then(response => response.json())).banner_image, /^data:image\/png;base64,/);
  const bible = await fetch(origin + '/api/bible', { headers }).then(response => response.json());
  assert.equal(bible.books.length, 66);
  assert.equal(bible.books.filter(book => book.testament === 'old').length, 39);
  assert.equal(bible.books.filter(book => book.testament === 'new').length, 27);
  const john316 = await fetch(origin + '/api/bible/books/JHN/chapters/3', { headers }).then(response => response.json());
  assert.match(john316.verses.find(verse => verse.verse === '16').text, /Deus amou/);
  const bibleSearch = await fetch(origin + '/api/bible/search?q=' + encodeURIComponent('Deus amou'), { headers }).then(response => response.json());
  assert.ok(bibleSearch.results.length > 0);
  const home = await fetch(origin + '/api/home', { headers }).then(response => response.json());
  assert.equal(home.is_library_home, 1);
  assert.match(home.content, /Bem-vindo/);
  const updatedHome = await fetch(origin + '/api/articles/' + home.id, { method: 'PUT', headers, body: JSON.stringify({ title: 'Início personalizado', content: '<h2>Minha biblioteca</h2><p>Conteúdo próprio.</p>' }) }).then(response => response.json());
  assert.equal(updatedHome.title, 'Início personalizado');
  assert.equal(updatedHome.theme, null);
  assert.equal((await fetch(origin + '/api/articles/' + home.id, { method: 'DELETE', headers })).status, 400);
  const themes = await fetch(origin + '/api/themes', { headers }).then(response => response.json());
  const article = await fetch(origin + '/api/articles', { method: 'POST', headers, body: JSON.stringify({ title: 'Artigo', theme_id: themes[0].id, title_size: 2.5, title_margin_top: 12, title_margin_bottom: 24, content: '<script>não</script><p style="text-align:justify">Sim</p>', authors: 'Autora', tags: 'Teste' }) }).then(response => response.json());
  assert.equal(article.title, 'Artigo');
  assert.equal(article.title_size, 2.5);
  assert.equal(article.title_margin_top, 12);
  assert.equal(article.title_margin_bottom, 24);
  assert.doesNotMatch(article.content, /script/);
  assert.match(article.content, /text-align:justify/);

  const fakeUpload = await fetch(`${origin}/api/articles/${article.id}/attachments`, { method: 'POST', headers, body: JSON.stringify({ name: 'falsa.png', dataUrl: 'data:image/png;base64,ZmFsc2E=' }) });
  assert.equal(fakeUpload.status, 400);
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(24)]);
  const uploaded = await fetch(`${origin}/api/articles/${article.id}/attachments`, { method: 'POST', headers: { ...headers, 'content-type': 'application/octet-stream', 'x-file-name': encodeURIComponent('imagem.png'), 'x-mime-type': 'image/png' }, body: png });
  assert.equal(uploaded.status, 201);
  const attachment = await uploaded.json();
  assert.equal(attachment.size_bytes, png.length);
  const diagnostics = await fetch(origin + '/api/diagnostics', { headers }).then(response => response.json());
  assert.equal(diagnostics.ok, true);
  assert.deepEqual(diagnostics.database, ['ok']);
  assert.deepEqual(diagnostics.media, { missing: [], orphaned: [] });
  assert.deepEqual(diagnostics.bible, { books: 66, verses: 31102 });
  const backup = await fetch(origin + '/api/backup', { headers });
  assert.equal(backup.status, 200);
  assert.equal(backup.headers.get('content-type'), 'application/zip');
  assert.ok((await backup.arrayBuffer()).byteLength > 0);

  const foreign = await fetch(origin + '/api/themes', { method: 'POST', headers: { ...headers, origin: 'http://example.com' }, body: JSON.stringify({ name: 'Bloqueado' }) });
  assert.equal(foreign.status, 403);
});
