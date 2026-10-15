const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function backupUI(window = {}) {
  const source = fs.readFileSync(require.resolve('../public/app.js'), 'utf8');
  const elements = new Map();
  const $ = selector => {
    if (!elements.has(selector)) elements.set(selector, { textContent: '', disabled: false });
    return elements.get(selector);
  };
  let downloads = 0, requests = 0;
  const context = vm.createContext({
    $, window, AbortController, Blob, Date, Uint8Array,
    URL: { createObjectURL: () => 'blob:backup', revokeObjectURL() {} },
    setTimeout: callback => callback(), toast() {},
    document: { createElement: () => ({ click: () => downloads++ }) },
    fetch: async () => {
      requests++;
      return { ok: true, headers: new Map(), arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer };
    }
  });
  vm.runInContext(`let backupDirectory, backupFile, backupWritable, backupBusy, backupCompleted, backupController;\n` +
    source.slice(source.indexOf('function backupFilename()'), source.indexOf("$('#toggleLibrary').onclick")) +
    source.slice(source.indexOf("$('#chooseBackupFolder').onclick"), source.indexOf("$('#startBackup').onclick")), context);
  context.resetBackupDialog();
  return { $, context, choose: () => $('#chooseBackupFolder').onclick(), downloads: () => downloads, requests: () => requests };
}

test('backup sem seletor oferece download direto e permite repetir', async () => {
  const ui = backupUI();
  assert.equal(ui.$('#chooseBackupFolder').textContent, 'Baixar cópia');
  assert.equal(ui.$('#startBackup').disabled, false);
  await ui.choose();
  assert.equal(ui.downloads(), 1);
  assert.match(ui.$('#backupDetail').textContent, /enviado ao navegador/);
  await ui.choose();
  assert.equal(ui.downloads(), 2);
});

test('backup abre seletor de pasta no clique e grava no destino escolhido', async () => {
  let selected = 0, writes = 0, closed = 0;
  const ui = backupUI({ showDirectoryPicker: async options => {
    selected++;
    assert.equal(options.mode, 'readwrite');
    return { name: 'Cópias', getFileHandle: async () => ({ createWritable: async () => ({ write: async () => writes++, close: async () => closed++ }) }) };
  } });
  assert.equal(ui.$('#startBackup').disabled, true);
  await ui.choose();
  assert.equal(selected, 1);
  assert.equal(ui.requests(), 0);
  assert.match(ui.$('#backupDestinationLabel').textContent, /Cópias/);
  await ui.context.runBackup();
  assert.equal(writes, 1);
  assert.equal(closed, 1);
  assert.equal(ui.downloads(), 0);
});

test('backup respeita cancelamento do seletor sem iniciar download', async () => {
  const ui = backupUI({ showDirectoryPicker: async () => { throw Object.assign(new Error(), { name: 'AbortError' }); } });
  await ui.choose();
  assert.equal(ui.requests(), 0);
  assert.equal(ui.$('#startBackup').disabled, true);
});

test('backup oferece download quando o navegador bloqueia o seletor', async () => {
  const ui = backupUI({ showDirectoryPicker: async () => { throw Object.assign(new Error(), { name: 'SecurityError' }); } });
  await ui.choose();
  assert.equal(ui.requests(), 0);
  assert.match(ui.$('#backupStatus').textContent, /não permitiu/);
  await ui.choose();
  assert.equal(ui.downloads(), 1);
});

test('backup usa seletor de arquivo quando somente ele está disponível', async () => {
  let selected = 0;
  const ui = backupUI({ showSaveFilePicker: async options => {
    selected++;
    assert.match(options.suggestedName, /\.zip$/);
    return {};
  } });
  await ui.choose();
  assert.equal(selected, 1);
  assert.equal(ui.$('#startBackup').disabled, false);
  assert.equal(ui.requests(), 0);
});
