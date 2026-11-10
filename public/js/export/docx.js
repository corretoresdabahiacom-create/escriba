// Gerador de DOCX (Office Open XML) mínimo, mas válido: capa, folha de rosto, sumário, capítulos com
// estilos Heading1/2/3 (painel de navegação do Word), listas reais, citações. Página 6x9" (padrão KDP brochura).

import { zip } from '../zip.js';
import { parseBlocks, escXml, xmlSafe } from '../md.js';
import { labelsFor, pngSize } from './common.js';

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const NS = `${W} xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"`;

const run = (r, extra = '') => {
  const rpr = `${r.b ? '<w:b/>' : ''}${r.i ? '<w:i/>' : ''}${extra}`;
  return `<w:r>${rpr ? `<w:rPr>${rpr}</w:rPr>` : ''}<w:t xml:space="preserve">${escXml(xmlSafe(r.t))}</w:t></w:r>`;
};
const para = (runs, { style, numId, align, pageBreakBefore, keepNext } = {}) => {
  const ppr = `${style ? `<w:pStyle w:val="${style}"/>` : ''}${keepNext ? '<w:keepNext/>' : ''}${pageBreakBefore ? '<w:pageBreakBefore/>' : ''}${numId ? `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="${numId}"/></w:numPr>` : ''}${align ? `<w:jc w:val="${align}"/>` : ''}`;
  return `<w:p>${ppr ? `<w:pPr>${ppr}</w:pPr>` : ''}${runs.map((r) => run(r)).join('')}</w:p>`;
};
const text = (t, opts) => para([{ t }], opts);

function imageParagraph(size) {
  // largura útil: 6" - 2*0.75" = 4.5"
  const widthEmu = Math.round(4.5 * 914400);
  const heightEmu = Math.round((widthEmu * size.h) / size.w);
  const maxH = Math.round(7.0 * 914400);
  const scale = heightEmu > maxH ? maxH / heightEmu : 1;
  const cx = Math.round(widthEmu * scale), cy = Math.round(heightEmu * scale);
  return `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="1" name="Capa" descr="Capa do livro"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="cover.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdCover"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles ${W}>
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia" w:cs="Georgia" w:eastAsia="Georgia"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="pt-BR"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="312" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:jc w:val="center"/><w:spacing w:before="2400" w:after="200"/></w:pPr><w:rPr><w:b/><w:sz w:val="56"/><w:szCs w:val="56"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:jc w:val="center"/><w:spacing w:after="600"/></w:pPr><w:rPr><w:i/><w:sz w:val="30"/><w:szCs w:val="30"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:pageBreakBefore/><w:spacing w:before="480" w:after="280"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="40"/><w:szCs w:val="40"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="360" w:after="120"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="30"/><w:szCs w:val="30"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="100"/><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:i/><w:sz w:val="25"/><w:szCs w:val="25"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="ChapterLabel"><w:name w:val="Chapter Label"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:pageBreakBefore/><w:spacing w:before="1200" w:after="0"/></w:pPr><w:rPr><w:caps/><w:color w:val="666666"/><w:spacing w:val="40"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:ind w:left="567" w:right="567"/></w:pPr><w:rPr><w:i/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="80"/><w:ind w:left="720"/></w:pPr></w:style>
</w:styles>`;

export function buildDocx(book) {
  const lang = book.language || 'pt-BR';
  const L = labelsFor(lang);
  const chapters = (book.chapters || []).filter((c) => c && (c.text || '').trim());
  const body = [];
  const nums = []; // instâncias de numeração decimal (reinicia a cada lista ordenada)
  const files = [];
  const size = pngSize(book.coverPng);

  if (book.coverPng?.length && size) {
    body.push(imageParagraph(size));
    body.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>');
  }
  body.push(text(xmlSafe(book.title || 'Sem título'), { style: 'Title' }));
  if (book.subtitle) body.push(text(xmlSafe(book.subtitle), { style: 'Subtitle' }));
  body.push(text(`${L.by} ${xmlSafe(book.author || 'Autor')}`, { align: 'center' }));

  body.push(para([{ t: L.contents, b: true }], { style: 'ChapterLabel' }));
  chapters.forEach((c, i) => body.push(text(`${i + 1}. ${xmlSafe(c.title)}`)));

  chapters.forEach((c, i) => {
    body.push(text(`${L.chapter} ${i + 1}`, { style: 'ChapterLabel' }));
    // Heading1 também tem pageBreakBefore → evita página em branco: sobrescreve com <w:pageBreakBefore w:val="0"/>
    body.push(`<w:p><w:pPr><w:pStyle w:val="Heading1"/><w:pageBreakBefore w:val="0"/><w:spacing w:before="120"/></w:pPr>${run({ t: xmlSafe(c.title) })}</w:p>`);
    for (const b of parseBlocks(c.text)) {
      if (b.t === 'h2') body.push(para(b.runs, { style: 'Heading2' }));
      else if (b.t === 'h3') body.push(para(b.runs, { style: 'Heading3' }));
      else if (b.t === 'p') body.push(para(b.runs));
      else if (b.t === 'quote') body.push(para(b.runs, { style: 'Quote' }));
      else if (b.t === 'hr') body.push(text('* * *', { align: 'center' }));
      else if (b.t === 'ul' || b.t === 'ol') {
        let numId = 1;
        if (b.t === 'ol') { nums.push(nums.length + 3); numId = nums[nums.length - 1]; }
        b.items.forEach((it) => body.push(para(it, { style: 'ListParagraph', numId })));
      }
    }
  });

  const sect = `<w:sectPr><w:pgSz w:w="8640" w:h="12960"/><w:pgMar w:top="1200" w:right="1080" w:bottom="1200" w:left="1080" w:header="600" w:footer="600" w:gutter="0"/></w:sectPr>`;
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document ${NS}><w:body>${body.join('')}${sect}</w:body></w:document>`;

  const numbering = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering ${W}>
<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum>
<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum>
<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
<w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>
${nums.map((id) => `<w:num w:numId="${id}"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>`).join('\n')}
</w:numbering>`;

  const hasCover = book.coverPng?.length && size;
  files.push({ name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${hasCover ? '<Default Extension="png" ContentType="image/png"/>' : ''}<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>` });
  files.push({ name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>` });
  files.push({ name: 'word/_rels/document.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdNum" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>${hasCover ? '<Relationship Id="rIdCover" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/cover.png"/>' : ''}</Relationships>` });
  files.push({ name: 'word/document.xml', data: document });
  files.push({ name: 'word/styles.xml', data: STYLES });
  files.push({ name: 'word/numbering.xml', data: numbering });
  files.push({ name: 'docProps/core.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${escXml(xmlSafe(book.title || ''))}</dc:title><dc:creator>${escXml(xmlSafe(book.author || ''))}</dc:creator><dc:language>${escXml(lang)}</dc:language></cp:coreProperties>` });
  if (hasCover) files.push({ name: 'word/media/cover.png', data: book.coverPng });

  return zip(files, { date: book.date });
}
