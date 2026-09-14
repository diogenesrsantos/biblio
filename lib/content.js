const sanitizeHtml = require('sanitize-html');

const decoded = value => { try { return decodeURIComponent(value); } catch { return ''; } };
const escapedContent = value => String(value || '').slice(0, 1000000).replace(/[&<>]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[character]);

const contentOptions = removedStorage => ({
  allowedTags: ['p', 'div', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'font', 'h2', 'h3', 'ul', 'ol', 'li', 'blockquote', 'a', 'img', 'figure', 'figcaption', 'pre', 'code', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
  allowedAttributes: { a: ['href', 'target', 'rel'], div: ['style'], p: ['style'], h2: ['style'], h3: ['style'], blockquote: ['style'], li: ['style'], font: ['color', 'size'], figure: ['class'], img: ['src', 'alt', 'title', 'data-attachment-id', 'style'] },
  allowedClasses: { figure: ['image-wrap-left', 'image-wrap-right'], div: ['text-columns-2', 'text-columns-3'] },
  allowedStyles: { '*': { 'text-align': [/^(?:left|center|right|justify)$/], 'line-height': [/^(?:1\.25|1\.6|1\.85|2\.2)$/] }, img: { width: [/^(?:25|50|75|100)%$/], height: [/^auto$/] } },
  allowedSchemes: ['http', 'https', 'mailto'],
  transformTags: { a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer' }) },
  exclusiveFilter: frame => frame.tag === 'img' && (!/^\/media\/[a-zA-Z0-9._%-]+$/.test(frame.attribs.src || '') || (removedStorage && decoded(frame.attribs.src.slice(7)) === removedStorage))
});

function cleanContent(value, removedStorage) {
  let content = String(value || '').slice(0, 1000000);
  if (removedStorage) {
    const mediaPath = ('/media/' + encodeURIComponent(removedStorage)).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    content = content.replace(new RegExp(`<figure\\b[^>]*>(?:(?!<\\/figure>)[\\s\\S])*?<img\\b[^>]*\\bsrc=(["'])${mediaPath}\\1[^>]*>(?:(?!<\\/figure>)[\\s\\S])*?<\\/figure>`, 'gi'), '');
  }
  return sanitizeHtml(content, contentOptions(removedStorage));
}

module.exports = { cleanContent, decoded, escapedContent };
