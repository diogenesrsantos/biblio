const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createDatabase } = require('./database');
const sanitizeHtml = require('sanitize-html');
const { backupName, createBackup } = require('./backup-service');
const { restoreBackup } = require('./restore-service');

const ROOT = __dirname;
for (const line of fs.existsSync(path.join(ROOT, '.env')) ? fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/) : []) { const [key, ...value] = line.split('='); if (key && !process.env[key]) process.env[key] = value.join('='); }
const PORT = Number(process.env.PORT || 8080);
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'biblio.db');
const RESTORE_FILE = path.join(DATA_DIR, '.biblio-restore-pending.zip');
if (fs.existsSync(RESTORE_FILE)) {
  restoreBackup(fs.readFileSync(RESTORE_FILE), DATA_DIR);
  fs.rmSync(RESTORE_FILE, { force: true });
}
const MEDIA_DIR = path.join(DATA_DIR, 'media');
fs.mkdirSync(MEDIA_DIR, { recursive: true });
const pool = createDatabase(DB_FILE);
const query = (text, values = []) => pool.query(text, values);
const textValue = (value, max = 1000000) => String(value || '').trim().slice(0, max);
const list = value => [...new Set(String(value || '').split(',').map(v => v.trim()).filter(Boolean))];
const decoded = value => { try { return decodeURIComponent(value); } catch { return ''; } };
const escapedContent = value => String(value || '').slice(0, 1000000).replace(/[&<>]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[character]);
const contentOptions = removedStorage => ({
  allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'h2', 'h3', 'ul', 'ol', 'li', 'blockquote', 'a', 'img', 'figure', 'figcaption', 'pre', 'code'],
  allowedAttributes: { a: ['href', 'target', 'rel'], img: ['src', 'alt', 'title', 'data-attachment-id'] },
  allowedSchemes: ['http', 'https', 'mailto'],
  transformTags: { a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer' }) },
  exclusiveFilter: frame => frame.tag === 'img' && (!/^\/media\/[a-zA-Z0-9._%-]+$/.test(frame.attribs.src || '') || (removedStorage && decoded(frame.attribs.src.slice(7)) === removedStorage))
});
const cleanContent = (value, removedStorage) => {
  let content = String(value || '').slice(0, 1000000);
  if (removedStorage) {
    const mediaPath = ('/media/' + encodeURIComponent(removedStorage)).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    content = content.replace(new RegExp(`<figure\\b[^>]*>(?:(?!<\\/figure>)[\\s\\S])*?<img\\b[^>]*\\bsrc=(["'])${mediaPath}\\1[^>]*>(?:(?!<\\/figure>)[\\s\\S])*?<\\/figure>`, 'gi'), '');
  }
  return sanitizeHtml(content, contentOptions(removedStorage));
};

async function init() {
  await query(`CREATE TABLE IF NOT EXISTS themes (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS articles (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, summary TEXT NOT NULL DEFAULT '', content TEXT NOT NULL DEFAULT '', content_format TEXT NOT NULL DEFAULT 'html', written_date TEXT, language TEXT NOT NULL DEFAULT 'pt-BR', theme_id INTEGER REFERENCES themes(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS authors (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE);
    CREATE TABLE IF NOT EXISTS article_authors (article_id INTEGER REFERENCES articles(id) ON DELETE CASCADE, author_id INTEGER REFERENCES authors(id) ON DELETE CASCADE, PRIMARY KEY(article_id,author_id));
    CREATE TABLE IF NOT EXISTS tags (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE);
    CREATE TABLE IF NOT EXISTS article_tags (article_id INTEGER REFERENCES articles(id) ON DELETE CASCADE, tag_id INTEGER REFERENCES tags(id) ON DELETE CASCADE, PRIMARY KEY(article_id,tag_id));
    CREATE TABLE IF NOT EXISTS sources (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, url TEXT, publisher TEXT, source_date TEXT);
    CREATE TABLE IF NOT EXISTS article_sources (article_id INTEGER REFERENCES articles(id) ON DELETE CASCADE, source_id INTEGER REFERENCES sources(id) ON DELETE CASCADE, PRIMARY KEY(article_id,source_id));
    CREATE TABLE IF NOT EXISTS attachments (id INTEGER PRIMARY KEY AUTOINCREMENT, article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE, original_name TEXT NOT NULL, storage_name TEXT NOT NULL UNIQUE, mime_type TEXT NOT NULL, size_bytes INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`);
  const articleColumns = (await query('PRAGMA table_info(articles)')).rows.map(column => column.name);
  if (!articleColumns.includes('content_format')) await query("ALTER TABLE articles ADD COLUMN content_format TEXT NOT NULL DEFAULT 'plain'");
  for (const name of ['Teologia', 'Filosofia', 'Culinária', 'Pensamentos']) await query('INSERT INTO themes(name) VALUES($1) ON CONFLICT DO NOTHING', [name]);
}
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) { return `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`; }
function validPassword(password, stored) { const [salt, expected] = String(stored).split(':'); if (!salt || !expected) return false; const actual = crypto.scryptSync(String(password), salt, 64).toString('hex'); return actual.length === expected.length && crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected)); }
function cookies(req) { return Object.fromEntries(String(req.headers.cookie || '').split(';').map(x => x.trim().split('=').map(decodeURIComponent)).filter(x => x.length === 2)); }
async function userFor(req) { const id = cookies(req).biblio_session; if (!id) return null; await query('DELETE FROM sessions WHERE expires_at < now()'); return (await query('SELECT u.id,u.username FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.id=$1 AND s.expires_at>now()', [id])).rows[0] || null; }
async function createSession(res, userId) { const id = crypto.randomBytes(32).toString('hex'); await query(`INSERT INTO sessions(id,user_id,expires_at) VALUES($1,$2,now()+interval '30 days')`, [id, userId]); res.setHeader('set-cookie', `biblio_session=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000${process.env.PUBLIC_HTTPS === 'true' ? '; Secure' : ''}`); }
async function details(id) {
  const article = (await query('SELECT a.*,t.name theme_name FROM articles a LEFT JOIN themes t ON t.id=a.theme_id WHERE a.id=$1', [id])).rows[0]; if (!article) return null;
  article.content = article.content_format === 'html' ? cleanContent(article.content) : escapedContent(article.content);
  const [authors,tags,sources,attachments] = await Promise.all([
    query('SELECT a.id,a.name FROM authors a JOIN article_authors x ON x.author_id=a.id WHERE x.article_id=$1 ORDER BY a.name',[id]),
    query('SELECT t.id,t.name FROM tags t JOIN article_tags x ON x.tag_id=t.id WHERE x.article_id=$1 ORDER BY t.name',[id]),
    query('SELECT s.* FROM sources s JOIN article_sources x ON x.source_id=s.id WHERE x.article_id=$1 ORDER BY s.title',[id]),
    query('SELECT * FROM attachments WHERE article_id=$1 ORDER BY id DESC',[id])
  ]); article.theme = article.theme_id ? { id: article.theme_id, name: article.theme_name } : null; delete article.theme_name; article.authors=authors.rows; article.tags=tags.rows; article.sources=sources.rows; article.attachments=attachments.rows; return article;
}
async function saveArticle(id, payload) {
  const fields={title:textValue(payload.title,300),summary:textValue(payload.summary,2000),content:cleanContent(payload.content),written_date:textValue(payload.written_date,30)||null,language:textValue(payload.language,20)||'pt-BR',theme_id:Number(payload.theme_id)};
  if(!fields.title) throw new Error('O título é obrigatório.'); if(!Number.isInteger(fields.theme_id)||(await query('SELECT 1 FROM themes WHERE id=$1',[fields.theme_id])).rowCount===0) throw new Error('Escolha um tema para o artigo.');
  const client=await pool.connect(); try { await client.query('BEGIN'); let articleId=id;
    if(id){const r=await client.query("UPDATE articles SET title=$1,summary=$2,content=$3,content_format='html',written_date=$4,language=$5,theme_id=$6,updated_at=now() WHERE id=$7",[fields.title,fields.summary,fields.content,fields.written_date,fields.language,fields.theme_id,id]);if(!r.rowCount)throw new Error('Artigo não encontrado.');}
    else articleId=(await client.query("INSERT INTO articles(title,summary,content,content_format,written_date,language,theme_id) VALUES($1,$2,$3,'html',$4,$5,$6) RETURNING id",[fields.title,fields.summary,fields.content,fields.written_date,fields.language,fields.theme_id])).rows[0].id;
    await Promise.all(['article_authors','article_tags','article_sources'].map(table=>client.query(`DELETE FROM ${table} WHERE article_id=$1`,[articleId])));
    for(const name of list(payload.authors)){const r=await client.query('INSERT INTO authors(name) VALUES($1) ON CONFLICT(name) DO UPDATE SET name=EXCLUDED.name RETURNING id',[name]);await client.query('INSERT INTO article_authors(article_id,author_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[articleId,r.rows[0].id]);}
    for(const name of list(payload.tags)){const r=await client.query('INSERT INTO tags(name) VALUES($1) ON CONFLICT(name) DO UPDATE SET name=EXCLUDED.name RETURNING id',[name]);await client.query('INSERT INTO article_tags(article_id,tag_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[articleId,r.rows[0].id]);}
    for(const source of Array.isArray(payload.sources)?payload.sources:[]){if(!textValue(source.title,300))continue;const r=await client.query('INSERT INTO sources(title,url,publisher,source_date) VALUES($1,$2,$3,$4) RETURNING id',[textValue(source.title,300),textValue(source.url,2000),textValue(source.publisher,300),textValue(source.source_date,30)]);await client.query('INSERT INTO article_sources(article_id,source_id) VALUES($1,$2)',[articleId,r.rows[0].id]);}
    await client.query('COMMIT');return articleId;
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
function json(res,status,body){res.writeHead(status,{'content-type':'application/json; charset=utf-8'});res.end(JSON.stringify(body));}
function body(req){return new Promise((resolve,reject)=>{let raw='';req.on('data',c=>{raw+=c;if(raw.length>250*1024*1024)reject(new Error('Arquivo muito grande (máximo de 180 MB).'));});req.on('end',()=>{try{resolve(raw?JSON.parse(raw):{});}catch{reject(new Error('JSON inválido.'));}});req.on('error',reject);});}
function staticFile(res,pathname){const file=pathname==='/'?'index.html':pathname.slice(1);const target=path.resolve(ROOT,'public',file);if(!target.startsWith(path.resolve(ROOT,'public')+path.sep)||!fs.existsSync(target))return false;const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};res.writeHead(200,{'content-type':types[path.extname(target)]||'application/octet-stream'});fs.createReadStream(target).pipe(res);return true;}
const server=http.createServer(async(req,res)=>{const url=new URL(req.url,`http://${req.headers.host||'localhost'}`);try{
  if(req.method==='GET'&&url.pathname==='/api/auth/status'){const user=await userFor(req);return json(res,200,{authenticated:Boolean(user),configured:(await query('SELECT 1 FROM users LIMIT 1')).rowCount>0,user});}
  if(req.method==='POST'&&url.pathname==='/api/auth/setup'){if((await query('SELECT 1 FROM users LIMIT 1')).rowCount)return json(res,409,{error:'A conta inicial já foi configurada.'});const p=await body(req),username=textValue(p.username,60),password=String(p.password||'');if(username.length<3||password.length<12)return json(res,400,{error:'Use usuário com ao menos 3 caracteres e senha com ao menos 12.'});const r=await query('INSERT INTO users(username,password_hash) VALUES($1,$2) RETURNING id',[username,hashPassword(password)]);await createSession(res,r.rows[0].id);return json(res,201,{username});}
  if(req.method==='POST'&&url.pathname==='/api/auth/login'){const p=await body(req),u=(await query('SELECT * FROM users WHERE lower(username)=lower($1)',[textValue(p.username,60)])).rows[0];if(!u||!validPassword(p.password,u.password_hash))return json(res,401,{error:'Usuário ou senha inválidos.'});await createSession(res,u.id);return json(res,200,{username:u.username});}
  if(req.method==='POST'&&url.pathname==='/api/auth/logout'){const id=cookies(req).biblio_session;if(id)await query('DELETE FROM sessions WHERE id=$1',[id]);res.setHeader('set-cookie','biblio_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return json(res,204,{});}
  if((url.pathname.startsWith('/api/')||url.pathname.startsWith('/media/'))&&url.pathname!=='/api/health'&&!(await userFor(req)))return json(res,401,{error:'Autenticação necessária.'});
  if(req.method==='GET'&&url.pathname==='/api/health')return json(res,200,{ok:true,database:'sqlite'});
  if(req.method==='GET'&&url.pathname==='/api/backup'){pool.checkpoint();const archive=await createBackup(DATA_DIR);res.writeHead(200,{'content-type':'application/zip','content-disposition':`attachment; filename="${backupName()}"`,'content-length':archive.length,'cache-control':'no-store'});return res.end(archive);}
  if(req.method==='POST'&&url.pathname==='/api/restore'){const payload=await body(req),match=String(payload.dataUrl||'').match(/^data:application\/(zip|x-zip-compressed);base64,(.+)$/);if(!match)return json(res,400,{error:'Selecione um arquivo ZIP de backup da Biblio.'});const archive=Buffer.from(match[2],'base64');if(archive.length>180*1024*1024)return json(res,400,{error:'Arquivo muito grande (máximo de 180 MB).'});const check=new (require('adm-zip'))(archive);if(!check.getEntry('manifest.json')||!check.getEntry('data/biblio.db'))return json(res,400,{error:'Esta não é uma cópia válida da Biblio.'});fs.writeFileSync(RESTORE_FILE,archive,{flag:'w',mode:0o600});json(res,202,{ok:true});return setTimeout(()=>process.exit(75),150);}
  if(url.pathname.startsWith('/media/')){const storage=path.basename(decoded(url.pathname));const attachment=(await query('SELECT mime_type FROM attachments WHERE storage_name=$1',[storage])).rows[0];const file=path.join(MEDIA_DIR,storage);if(!attachment||!fs.existsSync(file))return json(res,404,{error:'Arquivo não encontrado.'});res.writeHead(200,{'content-type':attachment.mime_type,'content-disposition':'inline','x-content-type-options':'nosniff'});return fs.createReadStream(file).pipe(res);}
  if(req.method==='GET'&&url.pathname==='/api/themes')return json(res,200,(await query('SELECT t.id,t.name,t.created_at,count(a.id)::int article_count FROM themes t LEFT JOIN articles a ON a.theme_id=t.id GROUP BY t.id ORDER BY t.name')).rows);
  if(req.method==='POST'&&url.pathname==='/api/themes'){const name=textValue((await body(req)).name,80);if(name.length<2)return json(res,400,{error:'Informe um tema com pelo menos 2 caracteres.'});const r=await query('INSERT INTO themes(name) VALUES($1) RETURNING id,name,created_at',[name]);return json(res,201,{...r.rows[0],article_count:0});}
  if(req.method==='GET'&&url.pathname==='/api/articles'){const q=textValue(url.searchParams.get('q'),200),theme=Number(url.searchParams.get('theme'));let sql='SELECT id FROM articles',args=[];if(q){args.push('%'+q+'%');sql+=' WHERE title ILIKE $1 OR summary ILIKE $1 OR content ILIKE $1';}else if(Number.isInteger(theme)&&theme>0){args.push(theme);sql+=' WHERE theme_id=$1';}sql+=' ORDER BY updated_at DESC LIMIT 100';const ids=(await query(sql,args)).rows.map(x=>x.id);return json(res,200,await Promise.all(ids.map(details)));}
  const match=url.pathname.match(/^\/api\/articles\/(\d+)$/);if(req.method==='GET'&&match){const a=await details(Number(match[1]));return a?json(res,200,a):json(res,404,{error:'Artigo não encontrado.'});}if(req.method==='POST'&&url.pathname==='/api/articles')return json(res,201,await details(await saveArticle(null,await body(req))));if(req.method==='PUT'&&match)return json(res,200,await details(await saveArticle(Number(match[1]),await body(req))));if(req.method==='DELETE'&&match){const files=(await query('SELECT storage_name FROM attachments WHERE article_id=$1',[Number(match[1])])).rows;await query('DELETE FROM articles WHERE id=$1',[Number(match[1])]);for(const item of files)fs.rmSync(path.join(MEDIA_DIR,item.storage_name),{force:true});return json(res,204,{});}
  const upload=url.pathname.match(/^\/api\/articles\/(\d+)\/attachments$/);if(req.method==='POST'&&upload){const articleId=Number(upload[1]);if(!(await query('SELECT 1 FROM articles WHERE id=$1',[articleId])).rowCount)return json(res,404,{error:'Artigo não encontrado.'});const p=await body(req),raw=String(p.dataUrl||''),parts=raw.match(/^data:([^;]+);base64,(.+)$/);if(!parts||!/^image\/(jpeg|png|gif|webp)$|^video\/(mp4|webm|quicktime)$/.test(parts[1]))return json(res,400,{error:'Envie uma imagem ou vídeo compatível.'});const buffer=Buffer.from(parts[2],'base64');if(buffer.length>25*1024*1024)return json(res,400,{error:'Arquivo muito grande (máximo de 25 MB).'});const storage=`${crypto.randomUUID()}-${path.basename(String(p.name||'arquivo')).replace(/[^a-zA-Z0-9._-]/g,'_')}`,file=path.join(MEDIA_DIR,storage);fs.writeFileSync(file,buffer);try{const r=await query('INSERT INTO attachments(article_id,original_name,storage_name,mime_type,size_bytes) VALUES($1,$2,$3,$4,$5) RETURNING *',[articleId,path.basename(String(p.name||'arquivo')),storage,parts[1],buffer.length]);return json(res,201,r.rows[0]);}catch(error){fs.rmSync(file,{force:true});throw error;}}
  const attachmentMatch=url.pathname.match(/^\/api\/attachments\/(\d+)$/);if(req.method==='DELETE'&&attachmentMatch){const item=(await query('SELECT * FROM attachments WHERE id=$1',[Number(attachmentMatch[1])])).rows[0];if(!item)return json(res,404,{error:'Anexo não encontrado.'});const article=(await query('SELECT content,content_format FROM articles WHERE id=$1',[item.article_id])).rows[0];await query('DELETE FROM attachments WHERE id=$1',[item.id]);await query('UPDATE articles SET content=$1,updated_at=now() WHERE id=$2',[article?.content_format==='html'?cleanContent(article.content,item.storage_name):(article?.content||''),item.article_id]);fs.rmSync(path.join(MEDIA_DIR,item.storage_name),{force:true});return json(res,204,{});}
  if(staticFile(res,url.pathname))return;json(res,404,{error:'Rota não encontrada.'});
}catch(error){json(res,400,{error:error.message||'Erro inesperado.'});}});
init().then(()=>server.listen(PORT,'127.0.0.1',()=>console.log(`Biblio disponível em http://127.0.0.1:${PORT} (SQLite local)`))).catch(error=>{console.error(error);process.exit(1);});
