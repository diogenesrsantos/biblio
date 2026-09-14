const test = require('node:test');
const assert = require('node:assert/strict');
const { cleanContent, escapedContent } = require('../lib/content');

test('sanitiza scripts e preserva os recursos seguros do editor', () => {
  const value = '<script>alert(1)</script><div class="text-columns-2"><p style="text-align:justify;line-height:1.6">Texto</p><table><thead><tr><th>Título</th></tr></thead></table></div>';
  const clean = cleanContent(value);
  assert.doesNotMatch(clean, /script|alert/);
  assert.match(clean, /text-columns-2/);
  assert.match(clean, /text-align:justify/);
  assert.match(clean, /<table>/);
});

test('normaliza links e remove imagens externas', () => {
  const clean = cleanContent('<a href="https://example.com">site</a><img src="https://example.com/a.png"><img src="/media/a.png">');
  assert.match(clean, /target="_blank"/);
  assert.match(clean, /rel="noopener noreferrer"/);
  assert.doesNotMatch(clean, /https:\/\/example.com\/a.png/);
  assert.match(clean, /\/media\/a.png/);
});

test('remove do conteúdo a figura de um anexo excluído', () => {
  const clean = cleanContent('<p>Antes</p><figure><img src="/media/foto.png"></figure><p>Depois</p>', 'foto.png');
  assert.doesNotMatch(clean, /foto\.png/);
  assert.match(clean, /Antes/);
  assert.match(clean, /Depois/);
});

test('escapa conteúdo legado em texto simples', () => {
  assert.equal(escapedContent('<b>A & B</b>'), '&lt;b&gt;A &amp; B&lt;/b&gt;');
});
