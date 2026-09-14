const fs = require('node:fs');

function receiveFile(req, target, maximumBytes) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let settled = false;
    const output = fs.createWriteStream(target, { flags: 'wx', mode: 0o600 });
    const fail = error => {
      if (settled) return;
      settled = true;
      req.unpipe(output);
      output.destroy();
      fs.rm(target, { force: true }, () => reject(error));
    };
    output.on('error', fail);
    req.on('error', fail);
    req.on('aborted', () => fail(new Error('Envio cancelado.')));
    req.on('data', chunk => {
      size += chunk.length;
      if (size > maximumBytes) fail(new Error(`Arquivo muito grande (máximo de ${Math.floor(maximumBytes / 1024 / 1024)} MB).`));
    });
    output.on('finish', () => {
      if (settled) return;
      settled = true;
      resolve(size);
    });
    req.pipe(output);
  });
}

module.exports = { receiveFile };
