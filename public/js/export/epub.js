// Gerador de EPUB 3 (reflowable) — é o formato aceito pela Amazon KDP (o MOBI foi descontinuado).
// Estrutura: mimetype (1º, sem compressão) · container.xml · content.opf · nav.xhtml · toc.ncx (compat.) ·
// capa · folha de rosto · um XHTML por capítulo · style.css.

import { zip } from '../zip.js';
import { parseBlocks, blocksToHtml, escXml, xmlSafe } from '../md.js';
import { labelsFor, uuid, isoNow } from './common.js';

const CSS = `body{font-family:serif;line-height:1.5;margin:0 1em;}
h1{font-size:1.7em;line-height:1.2;margin:2.2em 0 .8em;text-align:left;page-break-before:always;}
h2{font-size:1.25em;margin:1.6em 0 .5em;}
h3{font-size:1.05em;margin:1.3em 0 .4em;}
p{margin:0 0 .9em;text-align:left;orphans:2;widows:2;}
ul,ol{margin:0 0 1em 1.4em;padding:0;}
li{margin:0 0 .35em;}
blockquote{margin:1.2em 1.2em;font-style:italic;border-left:3px solid #999;padding-left:.8em;}
hr{border:0;text-align:center;margin:1.6em 0;}
hr:after{content:"* * *";}
.chapter-number{text-transform:uppercase;letter-spacing:.12em;font-size:.8em;margin:3em 0 0;color:#666;}
.title-page{text-align:center;margin-top:30%;}
.title-page h1{page-break-before:auto;text-align:center;font-size:2.2em;margin:0 0 .4em;}
.title-page .sub{font-size:1.2em;font-style:italic;margin:0 0 2em;}
.title-page .author{font-size:1.1em;}
.cover{text-align:center;margin:0;padding:0;}
.cover img{max-width:100%;max-height:100%;}
nav ol{list-style:none;margin-left:0;}
nav li{margin:.5em 0;}`;

const xhtml = ({ lang, title, body, cls = '' }) => `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${escXml(lang)}" xml:lang="${escXml(lang)}">
<head>
<meta charset="utf-8"/>
<title>${escXml(xmlSafe(title))}</title>
<link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body${cls ? ` class="${cls}"` : ''}>
${body}
</body>
</html>`;

/**
 * @param {{title:string, subtitle?:string, author?:string, language?:string, id?:string,
 *          chapters:{title:string,text:string}[], coverPng?:Uint8Array, date?:Date}} book
 * @returns {Uint8Array}
 */
export function buildEpub(book) {
  const lang = book.language || 'pt-BR';
  const L = labelsFor(lang);
  const id = book.id || `urn:uuid:${uuid()}`;
  const title = xmlSafe(book.title || 'Sem título');
  const author = xmlSafe(book.author || 'Autor');
  const fullTitle = book.subtitle ? `${title}: ${xmlSafe(book.subtitle)}` : title;
  const chapters = (book.chapters || []).filter((c) => c && (c.text || '').trim());
  const files = [];
  const manifest = [];
  const spine = [];
  const navItems = [];

  files.push({ name: 'mimetype', data: 'application/epub+zip' });
  files.push({
    name: 'META-INF/container.xml',
    data: `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`,
  });
  files.push({ name: 'OEBPS/style.css', data: CSS });
  manifest.push('<item id="css" href="style.css" media-type="text/css"/>');

  if (book.coverPng?.length) {
    files.push({ name: 'OEBPS/images/cover.png', data: book.coverPng });
    manifest.push('<item id="cover-image" href="images/cover.png" media-type="image/png" properties="cover-image"/>');
    files.push({ name: 'OEBPS/cover.xhtml', data: xhtml({ lang, title: L.cover, cls: 'cover', body: `<div class="cover"><img src="images/cover.png" alt="${escXml(L.cover)}"/></div>` }) });
    manifest.push('<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>');
    spine.push('<itemref idref="cover" linear="yes"/>');
  }

  files.push({
    name: 'OEBPS/titlepage.xhtml',
    data: xhtml({
      lang, title: L.title,
      body: `<section epub:type="titlepage" class="title-page"><h1>${escXml(title)}</h1>${book.subtitle ? `<p class="sub">${escXml(xmlSafe(book.subtitle))}</p>` : ''}<p class="author">${escXml(author)}</p></section>`,
    }),
  });
  manifest.push('<item id="titlepage" href="titlepage.xhtml" media-type="application/xhtml+xml"/>');
  spine.push('<itemref idref="titlepage"/>');

  chapters.forEach((c, i) => {
    const n = i + 1;
    const file = `chapter${String(n).padStart(2, '0')}.xhtml`;
    const body = `<section epub:type="chapter" id="c${n}"><p class="chapter-number">${escXml(L.chapter)} ${n}</p><h1>${escXml(xmlSafe(c.title))}</h1>\n${blocksToHtml(parseBlocks(c.text))}</section>`;
    files.push({ name: `OEBPS/${file}`, data: xhtml({ lang, title: c.title, body }) });
    manifest.push(`<item id="ch${n}" href="${file}" media-type="application/xhtml+xml"/>`);
    spine.push(`<itemref idref="ch${n}"/>`);
    navItems.push({ file, title: xmlSafe(c.title), n });
  });

  files.push({
    name: 'OEBPS/nav.xhtml',
    data: xhtml({
      lang, title: L.contents,
      body: `<nav epub:type="toc" id="toc"><h1>${escXml(L.contents)}</h1><ol>${navItems.map((x) => `<li><a href="${x.file}">${escXml(x.title)}</a></li>`).join('')}</ol></nav>
<nav epub:type="landmarks" hidden="hidden"><ol>${book.coverPng?.length ? `<li><a epub:type="cover" href="cover.xhtml">${escXml(L.cover)}</a></li>` : ''}<li><a epub:type="toc" href="nav.xhtml">${escXml(L.contents)}</a></li><li><a epub:type="bodymatter" href="${navItems[0]?.file || 'titlepage.xhtml'}">${escXml(L.chapter)} 1</a></li></ol></nav>`,
    }),
  });
  manifest.push('<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>');
  // nav logo após capa/rosto no spine (linear="no" para não aparecer como página de leitura)
  spine.splice(book.coverPng?.length ? 2 : 1, 0, '<itemref idref="nav"/>');

  files.push({
    name: 'OEBPS/toc.ncx',
    data: `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
<head><meta name="dtb:uid" content="${escXml(id)}"/><meta name="dtb:depth" content="1"/><meta name="dtb:totalPageCount" content="0"/><meta name="dtb:maxPageNumber" content="0"/></head>
<docTitle><text>${escXml(title)}</text></docTitle>
<navMap>${navItems.map((x, i) => `<navPoint id="np${x.n}" playOrder="${i + 1}"><navLabel><text>${escXml(x.title)}</text></navLabel><content src="${x.file}"/></navPoint>`).join('')}</navMap>
</ncx>`,
  });
  manifest.push('<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>');

  files.push({
    name: 'OEBPS/content.opf',
    data: `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="${escXml(lang)}">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="bookid">${escXml(id)}</dc:identifier>
<dc:title>${escXml(fullTitle)}</dc:title>
<dc:creator>${escXml(author)}</dc:creator>
<dc:language>${escXml(lang)}</dc:language>
<meta property="dcterms:modified">${isoNow(book.date)}</meta>
${book.coverPng?.length ? '<meta name="cover" content="cover-image"/>' : ''}
</metadata>
<manifest>
${manifest.join('\n')}
</manifest>
<spine toc="ncx">
${spine.join('\n')}
</spine>
</package>`,
  });

  return zip(files, { date: book.date });
}
