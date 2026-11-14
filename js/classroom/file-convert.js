/* =========================================================
   PaisleyFileConvert — open any handed-in file for ink marking
   -----------------------------------------------------------
   Loaded on demand by ink-grader.js. Decides what a file REALLY is
   from its bytes (never trusting the name or the stored fileType:
   a renamed .docx, a phone photo saved as ".pdf" or a broken upload
   used to fail with "Invalid PDF structure"), then gives the grader
   either a PDF (pdf.js document + bytes) or a single image.

     PaisleyFileConvert.prepare(u8, { type, name, pdfjsLib, PDFLib, onStep })
       -> { kind: 'pdf',   bytes, pdf, note }
        | { kind: 'image', bytes, imageKind: 'png' | 'jpg' | 'webp', note }
        | { kind: 'none',  message }

   PDF      opened as is; if pdf.js refuses it, leading junk is cut off and
            pdf-lib rebuilds the file (broken cross-reference tables etc.).
   Images   PNG / JPEG / WEBP directly; GIF, BMP, SVG, AVIF through the
            browser; HEIC / HEIF (iPhone) through heic2any; TIFF (also
            multi-page scans) through UTIF.
   Word     .docx via mammoth; .odt text; .rtf text.
   Excel    .xlsx / .xls / .ods / .csv via SheetJS, one table per sheet.
   Slides   .pptx / .odp: each slide's text and pictures.
   Text     .txt, code, .md, .json, .html (shown as text, never run).
   Converted documents are laid out on A4 pages and drawn into a PDF in
   the browser (html2canvas + pdf-lib), so the usual pen, rotate, crop
   and Grade all work. Nothing is uploaded anywhere while converting.
   Old binary Word / PowerPoint (.doc / .ppt, 1997-2003) cannot be read
   in a browser: the grader offers the download instead.
   Libraries: CDN only (cdnjs / jsDelivr), pinned, loaded only when needed.
========================================================= */
var PaisleyFileConvert = (function () {
  'use strict';
  var LIB = {
    mammoth: ['https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js', 'mammoth'],
    xlsx: ['https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js', 'XLSX'],
    jszip: ['https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js', 'JSZip'],
    h2c: ['https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js', 'html2canvas'],
    heic: ['https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js', 'heic2any'],
    utif: ['https://cdn.jsdelivr.net/npm/utif@3.1.0/UTIF.js', 'UTIF']
  };
  var PAGE_W = 794, PAGE_H = 1123, PAD = 56;   /* A4 at 96 dpi, ~15 mm margins */
  var MAX_PAGES = 200, MAX_SHEET_ROWS = 3000;
  var loading = {};

  function load(key) {
    var l = LIB[key];
    if (window[l[1]]) return Promise.resolve(window[l[1]]);
    if (!loading[key]) {
      loading[key] = new Promise(function (res, rej) {
        var s = document.createElement('script');
        s.src = l[0]; s.async = true;
        s.onload = function () { window[l[1]] ? res(window[l[1]]) : rej(new Error('Could not start the ' + key + ' reader.')); };
        s.onerror = function () { delete loading[key]; rej(new Error('Could not load the file reader (' + key + '). Check the connection and try again.')); };
        document.head.appendChild(s);
      });
    }
    return loading[key];
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function latin1(u8, a, b) {
    var out = '', end = Math.min(u8.length, b);
    for (var i = Math.max(0, a); i < end; i += 8192) out += String.fromCharCode.apply(null, u8.subarray(i, Math.min(end, i + 8192)));
    return out;
  }
  function ext(name) { var m = /\.([a-z0-9]+)$/i.exec(String(name || '')); return m ? m[1].toLowerCase() : ''; }
  function abOf(u8) { return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength); }

  /* ---------------- what is it really? ---------------- */
  function sniff(u8, name, type) {
    var head = latin1(u8, 0, 1024), e = ext(name);
    var pdfAt = head.indexOf('%PDF-');
    if (pdfAt !== -1) return { kind: 'pdf', offset: pdfAt };
    var b = u8;
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return { kind: 'png' };
    if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return { kind: 'jpg' };
    if (head.slice(0, 4) === 'RIFF' && head.slice(8, 12) === 'WEBP') return { kind: 'webp' };
    if (head.slice(0, 4) === 'GIF8') return { kind: 'gif' };
    if (head.slice(0, 2) === 'BM' && u8.length > 26) return { kind: 'bmp' };
    if (head.slice(0, 4) === 'II*\x00' || head.slice(0, 4) === 'MM\x00*') return { kind: 'tiff' };
    if (head.slice(4, 8) === 'ftyp') {
      var brand = head.slice(8, 12), brands = head.slice(8, 64);
      if (/avif|avis/.test(brand)) return { kind: 'avif' };
      if (/heic|heix|hevc|hevx|heim|heis|mif1|msf1/.test(brand) || /heic|mif1/.test(brands)) return { kind: 'heic' };
    }
    if (head.slice(0, 4) === 'PK\x03\x04') {
      var zipText = latin1(u8, 0, 65536) + latin1(u8, u8.length - 262144, u8.length);
      if (/mimetype\s*application\/vnd\.oasis\.opendocument\.text/.test(zipText) || e === 'odt') return { kind: 'odt' };
      if (/application\/vnd\.oasis\.opendocument\.spreadsheet/.test(zipText) || e === 'ods') return { kind: 'sheet' };
      if (/application\/vnd\.oasis\.opendocument\.presentation/.test(zipText) || e === 'odp') return { kind: 'odp' };
      if (zipText.indexOf('word/') !== -1) return { kind: 'docx' };
      if (zipText.indexOf('xl/') !== -1) return { kind: 'sheet' };
      if (zipText.indexOf('ppt/') !== -1) return { kind: 'pptx' };
      if (e === 'docx') return { kind: 'docx' };
      if (e === 'xlsx' || e === 'xlsm') return { kind: 'sheet' };
      if (e === 'pptx') return { kind: 'pptx' };
      return { kind: 'zip' };
    }
    if (b[0] === 0xD0 && b[1] === 0xCF && b[2] === 0x11 && b[3] === 0xE0) {
      var ole = latin1(u8, 0, Math.min(u8.length, 1048576)).replace(/\x00/g, '');
      if (/Workbook|Book/.test(ole) && !/WordDocument/.test(ole) || /^xl/.test(e)) return { kind: 'sheet' };
      if (/WordDocument/.test(ole) || e === 'doc') return { kind: 'doc' };
      if (/PowerPoint Document/.test(ole) || e === 'ppt') return { kind: 'ppt' };
      return { kind: 'ole' };
    }
    if (/^\s*\{\\rtf/.test(head)) return { kind: 'rtf' };
    var trimmed = head.replace(/^﻿|^\xEF\xBB\xBF/, '').replace(/^\s+/, '').slice(0, 200).toLowerCase();
    if (/^<svg|^<\?xml[^>]*>\s*(<!--[\s\S]*?-->\s*)*<svg/.test(trimmed) || (e === 'svg' && /<svg/.test(head))) return { kind: 'svg' };
    if (/^<!doctype html|^<html|^<head|^<body/.test(trimmed)) return { kind: 'html' };
    if (looksText(u8)) return { kind: e === 'csv' || /csv/.test(type) ? 'csv' : 'text' };
    return { kind: 'unknown' };
  }
  function looksText(u8) {
    var n = Math.min(u8.length, 8192), bad = 0;
    if (!n) return false;
    for (var i = 0; i < n; i++) { var c = u8[i]; if (c === 0) return false; if (c < 9 || (c > 13 && c < 32)) bad++; }
    return bad / n < 0.02;
  }
  function decodeText(u8) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(u8); } catch (e) { return new TextDecoder('windows-1252').decode(u8); }
  }

  /* ---------------- PDF: open, or repair and open ---------------- */
  /* A cut-off or badly saved PDF (upload interrupted, phone app bug) often has every page object
     but a missing or wrong cross-reference table / trailer. Index the "N G obj" objects, find the
     catalog and append a fresh xref table + trailer after the last complete object. */
  function rebuildXref(u8) {
    var s = latin1(u8, 0, u8.length);
    var lastEnd = s.lastIndexOf('endobj');
    if (lastEnd === -1) return null;
    var body = s.slice(0, lastEnd + 6);
    var re = /(?:^|[\r\n\s>])(\d{1,7})\s+(\d{1,5})\s+obj\b/g, m, offs = {}, max = 0;
    while ((m = re.exec(body))) {
      var n = Number(m[1]), at = m.index + (m[0].length - m[0].replace(/^[\r\n\s>]/, '').length);
      offs[n] = { off: at, gen: Number(m[2]) };   // a later copy of an object wins (incremental saves)
      if (n > max) max = n;
    }
    var root = null, cre = /(\d{1,7})\s+(\d{1,5})\s+obj\s*<<((?:(?!endobj)[\s\S]){0,4000}?)\/Type\s*\/Catalog\b/g, c;
    while ((c = cre.exec(body))) root = c[1] + ' ' + c[2] + ' R';
    if (!root || !max) return null;
    var pad = function (v, w) { v = String(v); while (v.length < w) v = '0' + v; return v; };
    var xrefAt = body.length + 1, xref = 'xref\n0 ' + (max + 1) + '\n0000000000 65535 f \n';
    for (var i = 1; i <= max; i++) xref += offs[i] ? pad(offs[i].off, 10) + ' ' + pad(offs[i].gen, 5) + ' n \n' : '0000000000 65535 f \n';
    var tail = '\n' + xref + 'trailer\n<< /Size ' + (max + 1) + ' /Root ' + root + ' >>\nstartxref\n' + xrefAt + '\n%%EOF\n';
    var out = new Uint8Array(body.length + tail.length);
    out.set(u8.subarray(0, body.length), 0);
    for (var k = 0; k < tail.length; k++) out[body.length + k] = tail.charCodeAt(k);
    return out;
  }
  async function openPdf(u8, offset, pdfjsLib, PDFLib, onStep) {
    var bytes = offset > 0 ? u8.slice(offset) : u8;
    var first;
    try { return { bytes: bytes, pdf: await pdfjsLib.getDocument({ data: bytes.slice() }).promise, note: offset > 0 ? 'The file had extra data in front of the PDF; it was trimmed so it opens.' : '' }; }
    catch (e) { first = e; }
    if (first && first.name === 'PasswordException') throw new Error('This PDF is password-protected, so it cannot be opened for marking. Ask the student to hand it in again without a password.');
    onStep && onStep('Repairing the PDF…');
    var NOTE = 'This PDF was damaged and has been repaired for marking. Check it against the original if anything looks wrong.';
    var tries = [];
    // 1. Rebuild the cross-reference table from the objects in the file.
    try {
      var rebuilt = rebuildXref(bytes);
      if (rebuilt) {
        var p1 = await pdfjsLib.getDocument({ data: rebuilt.slice() }).promise;
        if (p1.numPages) { await p1.getPage(1); return { bytes: rebuilt, pdf: p1, note: NOTE }; }
      }
    } catch (e1) { tries.push(e1); }
    // 2. Let pdf-lib parse what it can and write a clean copy.
    try {
      var doc = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true, throwOnInvalidObject: false, updateMetadata: false });
      if (!doc.getPageCount()) throw new Error('no pages');
      var fixed = await doc.save({ useObjectStreams: false });
      return { bytes: fixed, pdf: await pdfjsLib.getDocument({ data: fixed.slice() }).promise, note: NOTE };
    } catch (e2) { tries.push(e2); }
    console.warn('pdf repair failed:', first, tries);
    throw new Error('This PDF is damaged (' + ((first && first.message) || 'unreadable') + ') and could not be repaired. Download the original to check it, or ask the student to hand it in again.');
  }

  /* ---------------- images ---------------- */
  function decodeImage(blob) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(blob), im = new Image();
      im.onload = function () { res({ im: im, url: url }); };
      im.onerror = function () { URL.revokeObjectURL(url); rej(new Error('The browser could not read this picture.')); };
      im.src = url;
    });
  }
  function canvasPng(cv) {
    return new Promise(function (res, rej) { cv.toBlob(function (b) { b ? b.arrayBuffer().then(function (a) { res(new Uint8Array(a)); }) : rej(new Error('Could not prepare the picture.')); }, 'image/png'); });
  }
  function canvasJpg(cv) {
    return new Promise(function (res, rej) { cv.toBlob(function (b) { b ? b.arrayBuffer().then(function (a) { res(new Uint8Array(a)); }) : rej(new Error('Could not prepare the page.')); }, 'image/jpeg', 0.9); });
  }
  async function imageToPng(blob, fallbackW, fallbackH) {
    var d = await decodeImage(blob);
    try {
      var w = d.im.naturalWidth || fallbackW || 1200, h = d.im.naturalHeight || fallbackH || 1600;
      var k = Math.min(1, 4096 / Math.max(w, h));
      var cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(w * k)); cv.height = Math.max(1, Math.round(h * k));
      var ctx = cv.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.drawImage(d.im, 0, 0, cv.width, cv.height);
      return await canvasPng(cv);
    } finally { URL.revokeObjectURL(d.url); }
  }
  async function heicToJpg(u8, onStep) {
    try { return { bytes: await imageToPng(new Blob([u8], { type: 'image/heic' })), imageKind: 'png' }; } catch (e) { /* not Safari: convert */ }
    onStep && onStep('Converting the iPhone photo (HEIC)…');
    var heic2any = await load('heic');
    var out = await heic2any({ blob: new Blob([u8], { type: 'image/heic' }), toType: 'image/jpeg', quality: 0.92 });
    var blob = Array.isArray(out) ? out[0] : out;
    return { bytes: new Uint8Array(await blob.arrayBuffer()), imageKind: 'jpg' };
  }
  async function tiffToPdf(u8, PDFLib, onStep) {
    onStep && onStep('Reading the scanned pages (TIFF)…');
    var UTIF = await load('utif');
    var buf = abOf(u8), ifds = UTIF.decode(buf);
    var doc = await PDFLib.PDFDocument.create();
    for (var i = 0; i < ifds.length && i < MAX_PAGES; i++) {
      UTIF.decodeImage(buf, ifds[i]);
      var w = ifds[i].width, h = ifds[i].height;
      if (!w || !h) continue;
      var rgba = UTIF.toRGBA8(ifds[i]);
      var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      var id = cv.getContext('2d').createImageData(w, h); id.data.set(rgba); cv.getContext('2d').putImageData(id, 0, 0);
      var img = await doc.embedJpg(await canvasJpg(cv));
      var pw = 595.28, ph = pw * h / w;
      doc.addPage([pw, ph]).drawImage(img, { x: 0, y: 0, width: pw, height: ph });
    }
    if (!doc.getPageCount()) throw new Error('This TIFF has no readable pages.');
    return doc.save();
  }

  /* ---------------- documents -> HTML ---------------- */
  async function docxHtml(u8) {
    var mammoth = await load('mammoth');
    var r = await mammoth.convertToHtml({ arrayBuffer: abOf(u8) });
    return r.value || '<p><i>This document is empty.</i></p>';
  }
  async function sheetHtml(u8, isCsv) {
    var XLSX = await load('xlsx');
    var wb = isCsv ? XLSX.read(decodeText(u8), { type: 'string' }) : XLSX.read(u8, { type: 'array', cellDates: true });
    var out = '';
    wb.SheetNames.forEach(function (sn, i) {
      var ws = wb.Sheets[sn]; if (!ws || !ws['!ref']) return;
      var range = XLSX.utils.decode_range(ws['!ref']), cut = false;
      if (range.e.r - range.s.r + 1 > MAX_SHEET_ROWS) { range.e.r = range.s.r + MAX_SHEET_ROWS - 1; ws['!ref'] = XLSX.utils.encode_range(range); cut = true; }
      var t = XLSX.utils.sheet_to_html(ws, { header: '', footer: '' });
      var table = (/<table[\s\S]*<\/table>/i.exec(t) || [t])[0];
      out += (i ? '<div class="pfc-break"></div>' : '') + (wb.SheetNames.length > 1 || sn ? '<h3>' + esc(sn) + '</h3>' : '') + table +
        (cut ? '<p><i>Only the first ' + MAX_SHEET_ROWS + ' rows are shown. Download the original for the rest.</i></p>' : '');
    });
    return out || '<p><i>This spreadsheet is empty.</i></p>';
  }
  function xmlTexts(xml, paraTag, textTag) {
    var doc = new DOMParser().parseFromString(xml, 'application/xml');
    var paras = doc.getElementsByTagName(paraTag), out = [];
    for (var i = 0; i < paras.length; i++) {
      var ts = paras[i].getElementsByTagName(textTag), line = '';
      for (var j = 0; j < ts.length; j++) line += ts[j].textContent;
      if (!ts.length && paraTag.indexOf('text:') === 0) line = paras[i].textContent;
      out.push(line);
    }
    return out;
  }
  async function pptxHtml(u8) {
    var JSZip = await load('jszip');
    var zip = await JSZip.loadAsync(abOf(u8));
    var slides = Object.keys(zip.files).filter(function (f) { return /^ppt\/slides\/slide\d+\.xml$/.test(f); })
      .sort(function (a, b) { return Number(/(\d+)\.xml$/.exec(a)[1]) - Number(/(\d+)\.xml$/.exec(b)[1]); });
    var out = '';
    for (var i = 0; i < slides.length && i < MAX_PAGES; i++) {
      var xml = await zip.file(slides[i]).async('string');
      var lines = xmlTexts(xml, 'a:p', 'a:t').filter(function (l) { return l.trim(); });
      var pics = '';
      var relPath = slides[i].replace('slides/', 'slides/_rels/') + '.rels', rel = zip.file(relPath);
      if (rel) {
        var rx = await rel.async('string'), m, re = /Target="\.\.\/media\/([^"]+)"/g;
        while ((m = re.exec(rx))) {
          var f = zip.file('ppt/media/' + m[1]), mt = /\.png$/i.test(m[1]) ? 'image/png' : /\.jpe?g$/i.test(m[1]) ? 'image/jpeg' : /\.gif$/i.test(m[1]) ? 'image/gif' : /\.webp$/i.test(m[1]) ? 'image/webp' : '';
          if (f && mt) pics += '<img src="data:' + mt + ';base64,' + (await f.async('base64')) + '" alt="">';
        }
      }
      out += (i ? '<div class="pfc-break"></div>' : '') + '<h3>Slide ' + (i + 1) + '</h3>' +
        lines.map(function (l) { return '<p>' + esc(l) + '</p>'; }).join('') + pics + (!lines.length && !pics ? '<p><i>(no text on this slide)</i></p>' : '');
    }
    return out || '<p><i>No slides found.</i></p>';
  }
  async function odfHtml(u8, slides) {
    var JSZip = await load('jszip');
    var zip = await JSZip.loadAsync(abOf(u8));
    var f = zip.file('content.xml');
    if (!f) throw new Error('This OpenDocument file has no content.');
    var xml = await f.async('string');
    if (slides) {
      var doc = new DOMParser().parseFromString(xml, 'application/xml'), pages = doc.getElementsByTagName('draw:page'), out = '';
      for (var i = 0; i < pages.length; i++) {
        var ps = pages[i].getElementsByTagName('text:p'), body = '';
        for (var j = 0; j < ps.length; j++) if (ps[j].textContent.trim()) body += '<p>' + esc(ps[j].textContent) + '</p>';
        out += (i ? '<div class="pfc-break"></div>' : '') + '<h3>Slide ' + (i + 1) + '</h3>' + (body || '<p><i>(no text on this slide)</i></p>');
      }
      return out;
    }
    return xmlTexts(xml.replace(/<text:h\b/g, '<text:p').replace(/<\/text:h>/g, '</text:p>'), 'text:p', 'text:span')
      .map(function (l) { return l.trim() ? '<p>' + esc(l) + '</p>' : '<p>&nbsp;</p>'; }).join('');
  }
  function rtfText(src) {
    var s = src.replace(/\{\\\*[^{}]*(\{[^{}]*\}[^{}]*)*\}/g, '')              // destinations ({\*\...})
      .replace(/\{\\(fonttbl|colortbl|stylesheet|info|pict)[\s\S]*?\}\s*(?=[\\{}]|$)/g, '')
      .replace(/\\par[d]?\b ?/g, '\n').replace(/\\line\b ?/g, '\n').replace(/\\tab\b ?/g, '\t')
      .replace(/\\'([0-9a-f]{2})/gi, function (m, h) { return String.fromCharCode(parseInt(h, 16)); })
      .replace(/\\u(-?\d+)\??/g, function (m, n) { n = Number(n); return String.fromCharCode(n < 0 ? n + 65536 : n); })
      .replace(/\\[a-z]+-?\d* ?/gi, '').replace(/\\([{}\\])/g, '$1').replace(/[{}]/g, '');
    return s.replace(/\n{3,}/g, '\n\n').trim();
  }
  function textHtml(text) {
    var lines = String(text).replace(/\r\n?/g, '\n').split('\n'), out = '';
    for (var i = 0; i < lines.length; i += 40) out += '<pre>' + esc(lines.slice(i, i + 40).join('\n')) + '</pre>';
    return out || '<p><i>This file is empty.</i></p>';
  }

  /* ---------------- HTML -> A4 pages -> PDF ---------------- */
  var CSS = '.pfc-page{width:' + PAGE_W + 'px;height:' + PAGE_H + 'px;padding:' + PAD + 'px;box-sizing:border-box;background:#fff;overflow:hidden;color:#1d2726;' +
    'font:14px/1.5 Calibri,Carlito,"Segoe UI",Arial,sans-serif;position:relative}' +
    '.pfc-page *{max-width:100%;box-sizing:border-box}.pfc-page img{max-height:' + (PAGE_H - PAD * 2 - 40) + 'px;height:auto;display:block;margin:6px 0}' +
    '.pfc-page table{border-collapse:collapse;font-size:12px;margin:6px 0;table-layout:auto}.pfc-page td,.pfc-page th{border:1px solid #b9c6c4;padding:3px 6px;vertical-align:top;word-break:break-word}' +
    '.pfc-page pre{font:12px/1.45 Consolas,"Courier New",monospace;white-space:pre-wrap;word-break:break-word;margin:0}' +
    '.pfc-page h1{font-size:24px}.pfc-page h2{font-size:20px}.pfc-page h3{font-size:17px;color:#245F5A}.pfc-page p{margin:0 0 8px}';
  function clean(html) {
    var box = document.createElement('div');
    box.innerHTML = html;
    box.querySelectorAll('script,style,iframe,object,embed,link,meta,form,input,button,video,audio').forEach(function (n) { n.remove(); });
    box.querySelectorAll('*').forEach(function (n) {
      Array.prototype.slice.call(n.attributes).forEach(function (a) {
        if (/^on/i.test(a.name) || (/^(src|href)$/i.test(a.name) && !/^data:image\//i.test(a.value) && n.tagName === 'IMG')) n.removeAttribute(a.name);
        else if (/^href$/i.test(a.name)) n.removeAttribute(a.name);
      });
    });
    return box;
  }
  async function htmlToPdf(html, PDFLib, onStep) {
    var html2canvas = await load('h2c');
    var style = document.createElement('style'); style.textContent = CSS;
    var host = document.createElement('div');
    host.setAttribute('aria-hidden', 'true');
    host.style.cssText = 'position:fixed;left:-20000px;top:0;width:' + PAGE_W + 'px;pointer-events:none;z-index:-1';
    host.appendChild(style);
    document.body.appendChild(host);
    try {
      var src = clean(html);
      var imgs = Array.prototype.slice.call(src.querySelectorAll('img'));
      await Promise.all(imgs.map(function (im) { return im.complete ? 0 : new Promise(function (r) { im.onload = im.onerror = r; }); }));
      var queue = Array.prototype.slice.call(src.childNodes).filter(function (n) { return n.nodeType === 1 || (n.nodeType === 3 && n.textContent.trim()); });
      var pages = [], page = null, limit = PAGE_H - PAD * 2;
      function newPage() { page = document.createElement('div'); page.className = 'pfc-page'; page.inner = document.createElement('div'); page.appendChild(page.inner); host.appendChild(page); pages.push(page); }
      function over() { return page.inner.offsetHeight > limit; }
      function parts(node) {
        if (node.nodeType !== 1) return null;
        var t = node.tagName;
        if (t === 'TABLE') { var body = node.tBodies[0] || node; return { list: Array.prototype.slice.call(body.children).filter(function (r) { return r.tagName === 'TR'; }), shell: function () { var c = node.cloneNode(false); if (node.tHead) c.appendChild(node.tHead.cloneNode(true)); var b = document.createElement('tbody'); c.appendChild(b); return { el: c, add: b }; } }; }
        if (t === 'UL' || t === 'OL') return { list: Array.prototype.slice.call(node.children), shell: function () { var c = node.cloneNode(false); return { el: c, add: c }; } };
        if (t === 'PRE') return { lines: node.textContent.split('\n') };
        if (t === 'DIV' && node.children.length > 1 && !node.classList.contains('pfc-break')) return { list: Array.prototype.slice.call(node.childNodes), shell: function () { var c = node.cloneNode(false); return { el: c, add: c }; } };
        return null;
      }
      /* Move the tail of an overflowing node onto a continuation; returns it, or null if nothing could move. */
      function split(node) {
        var p = parts(node); if (!p) return null;
        if (p.lines) {
          if (p.lines.length < 2) return null;
          var keep = p.lines.slice(), moved = [];
          while (keep.length > 1 && over()) { moved.unshift(keep.pop()); node.textContent = keep.join('\n'); }
          if (!moved.length) return null;
          var c = node.cloneNode(false); c.textContent = moved.join('\n'); return c;
        }
        if (p.list.length < 2) return null;
        var sh = p.shell(), n = 0;
        while (p.list.length - n > 1 && over()) { var it = p.list[p.list.length - 1 - n]; sh.add.insertBefore(it, sh.add.firstChild); n++; }
        return n ? sh.el : null;
      }
      newPage();
      while (queue.length) {
        if (pages.length > MAX_PAGES) break;
        var node = queue.shift();
        if (node.nodeType === 1 && node.classList.contains('pfc-break')) { if (page.inner.childNodes.length) newPage(); continue; }
        page.inner.appendChild(node);
        if (!over()) continue;
        var rest = split(node);
        if (rest) { queue.unshift(rest); newPage(); continue; }
        if (page.inner.childNodes.length > 1) { page.inner.removeChild(node); newPage(); page.inner.appendChild(node); }
        // A single item taller than a page stays on its own page (clipped at the margin).
      }
      if (pages.length > 1 && !pages[pages.length - 1].inner.childNodes.length) { pages.pop().remove(); }
      var doc = await PDFLib.PDFDocument.create();
      for (var i = 0; i < pages.length; i++) {
        onStep && onStep('Preparing page ' + (i + 1) + ' of ' + pages.length + '…');
        var cv = await html2canvas(pages[i], { scale: 2, backgroundColor: '#ffffff', logging: false, useCORS: false, width: PAGE_W, height: PAGE_H, windowWidth: PAGE_W });
        var img = await doc.embedJpg(await canvasJpg(cv));
        doc.addPage([595.28, 841.89]).drawImage(img, { x: 0, y: 0, width: 595.28, height: 841.89 });
      }
      return doc.save();
    } finally { host.remove(); }
  }

  var LABEL = { docx: 'Word document', odt: 'OpenDocument text', rtf: 'Rich Text document', sheet: 'spreadsheet', csv: 'CSV spreadsheet', pptx: 'PowerPoint presentation', odp: 'OpenDocument presentation', text: 'text file', html: 'web page (shown as its code)', svg: 'SVG picture', tiff: 'TIFF scan' };

  async function prepare(u8, o) {
    o = o || {};
    var pdfjsLib = o.pdfjsLib, PDFLib = o.PDFLib, step = o.onStep;
    if (!u8 || !u8.length) return { kind: 'none', message: 'The handed-in file is empty (0 bytes). Ask the student to upload it again.' };
    var k = sniff(u8, o.name, o.type);
    var claimed = /pdf|image|word|excel|sheet|presentation|officedocument/.test(String(o.type || '') + ' ' + ext(o.name));
    async function asPdf(bytes, note) { return { kind: 'pdf', bytes: bytes, pdf: await pdfjsLib.getDocument({ data: bytes.slice() }).promise, note: note || '' }; }
    var conv = 'Converted from a ' + (LABEL[k.kind] || k.kind) + ' so it can be marked. The layout may differ a little from the original.';
    switch (k.kind) {
      case 'pdf': {
        var p = await openPdf(u8, k.offset, pdfjsLib, PDFLib, step);
        var named = /pdf/.test(String(o.type || '')) || ext(o.name) === 'pdf';
        return { kind: 'pdf', bytes: p.bytes, pdf: p.pdf, note: p.note || (!named ? 'This file is a PDF, although its name says otherwise.' : '') };
      }
      case 'png': case 'jpg': case 'webp': {
        var renamed = /pdf/.test(String(o.type || '')) || ext(o.name) === 'pdf';
        return { kind: 'image', bytes: u8, imageKind: k.kind, note: renamed ? 'This file is a picture saved with a .pdf name. It is shown as the picture.' : '' };
      }
      case 'gif': case 'bmp': case 'avif':
        step && step('Reading the picture…');
        return { kind: 'image', bytes: await imageToPng(new Blob([u8], { type: 'image/' + k.kind })), imageKind: 'png', note: '' };
      case 'svg':
        step && step('Reading the picture…');
        return { kind: 'image', bytes: await imageToPng(new Blob([u8], { type: 'image/svg+xml' }), 1200, 1600), imageKind: 'png', note: '' };
      case 'heic': { var h = await heicToJpg(u8, step); return { kind: 'image', bytes: h.bytes, imageKind: h.imageKind, note: 'iPhone photo (HEIC) converted so it can be marked.' }; }
      case 'tiff': return asPdf(await tiffToPdf(u8, PDFLib, step), conv);
      case 'docx': step && step('Reading the Word document…'); return asPdf(await htmlToPdf(await docxHtml(u8), PDFLib, step), conv);
      case 'odt': step && step('Reading the document…'); return asPdf(await htmlToPdf(await odfHtml(u8, false), PDFLib, step), conv);
      case 'odp': step && step('Reading the slides…'); return asPdf(await htmlToPdf(await odfHtml(u8, true), PDFLib, step), conv);
      case 'pptx': step && step('Reading the slides…'); return asPdf(await htmlToPdf(await pptxHtml(u8), PDFLib, step), 'Converted from PowerPoint: each slide\'s text and pictures are shown, not its exact design.');
      case 'sheet': case 'csv': step && step('Reading the spreadsheet…'); return asPdf(await htmlToPdf(await sheetHtml(u8, k.kind === 'csv'), PDFLib, step), conv);
      case 'rtf': return asPdf(await htmlToPdf(textHtml(rtfText(decodeText(u8))), PDFLib, step), conv);
      case 'html':
        if (claimed) return { kind: 'none', message: 'The download returned a web page instead of the student\'s file, so the stored link has probably expired or the file was deleted. Ask the student to upload the work again.' };
        return asPdf(await htmlToPdf(textHtml(decodeText(u8)), PDFLib, step), conv);
      case 'text': return asPdf(await htmlToPdf(textHtml(decodeText(u8)), PDFLib, step), conv);
      case 'doc': return { kind: 'none', message: 'This is an old Word 97-2003 file (.doc). Browsers cannot read that format. Download it to read it, or ask the student to save it as .docx or PDF and hand it in again.' };
      case 'ppt': return { kind: 'none', message: 'This is an old PowerPoint 97-2003 file (.ppt). Browsers cannot read that format. Download it, or ask the student to save it as .pptx or PDF and hand it in again.' };
      case 'zip': return { kind: 'none', message: 'This is a ZIP archive, not a single document. Download it to open the files inside.' };
      default: return { kind: 'none', message: 'This file is not a format that can be shown here' + (o.name ? ' (' + o.name + ')' : '') + '. Download it to open it on this device.' };
    }
  }

  return { prepare: prepare, sniff: sniff, _rtfText: rtfText };
})();
