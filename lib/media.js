const fs = require('node:fs');
const path = require('node:path');

const SIGNATURES = {
  'image/jpeg': buffer => buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
  'image/png': buffer => buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/gif': buffer => /^GIF8[79]a/.test(buffer.subarray(0, 6).toString('ascii')),
  'image/webp': buffer => buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP',
  'video/mp4': buffer => buffer.subarray(4, 8).toString('ascii') === 'ftyp',
  'video/quicktime': buffer => buffer.subarray(4, 8).toString('ascii') === 'ftyp',
  'video/webm': buffer => buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
};

function validMediaSignature(mimeType, buffer) {
  return Boolean(SIGNATURES[mimeType]?.(buffer));
}

async function mediaDiagnostics(query, mediaDir) {
  const rows = (await query('SELECT storage_name FROM attachments')).rows;
  const registered = new Set(rows.map(row => row.storage_name));
  const disk = fs.existsSync(mediaDir) ? fs.readdirSync(mediaDir, { withFileTypes: true }).filter(item => item.isFile()).map(item => item.name) : [];
  return {
    missing: [...registered].filter(name => !fs.existsSync(path.join(mediaDir, name))),
    orphaned: disk.filter(name => !registered.has(name))
  };
}

module.exports = { mediaDiagnostics, validMediaSignature };
