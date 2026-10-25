// Windows system voices (SAPI, the "Microsoft David / Zira…" voices) rendered
// to WAV audio in a long-running PowerShell helper, so the game can play the
// audio itself and shape it (pitch, intonation, emotion) like its built-in voice.
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const SCRIPT = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
[Console]::Out.WriteLine('READY')
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($line -eq $null) { break }
  $j = $null
  try {
    $j = $line | ConvertFrom-Json
    if ($j.cmd -eq 'voices') {
      $names = ($s.GetInstalledVoices() | Where-Object { $_.Enabled } | ForEach-Object { $_.VoiceInfo.Name }) -join '|'
      [Console]::Out.WriteLine('VOICES ' + $names)
      continue
    }
    $s.SelectVoice([string]$j.voice)
    $s.Rate = [int]$j.rate
    $s.SetOutputToWaveFile([string]$j.out)
    $s.Speak([string]$j.text)
    $s.SetOutputToNull()
    [Console]::Out.WriteLine('OK ' + $j.id)
  } catch {
    try { $s.SetOutputToNull() } catch {}
    [Console]::Out.WriteLine('ERR ' + $(if ($j) { $j.id } else { 0 }) + ' ' + $_.Exception.Message)
  }
}
`;

let proc = null;
let buf = '';
let waiters = [];
let voices = null;
let seq = 0;

function start() {
  if (proc || process.platform !== 'win32') return proc;
  const file = path.join(os.tmpdir(), 'friendlife-sapi.ps1');
  fs.writeFileSync(file, SCRIPT, 'utf8');
  proc = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', file], { windowsHide: true });
  proc.stdout.setEncoding('utf8');
  proc.stdout.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      const w = waiters.find((x) => x.match(line));
      if (w) { waiters = waiters.filter((x) => x !== w); w.resolve(line); }
    }
  });
  const dead = () => { proc = null; for (const w of waiters) w.resolve('ERR 0 helper stopped'); waiters = []; };
  proc.on('exit', dead);
  proc.on('error', dead);
  return proc;
}

function request(obj, match, timeout = 15000) {
  const p = start();
  if (!p) return Promise.resolve('ERR 0 not windows');
  return new Promise((resolve) => {
    const w = { match, resolve };
    waiters.push(w);
    setTimeout(() => { if (waiters.includes(w)) { waiters = waiters.filter((x) => x !== w); resolve('ERR 0 timeout'); } }, timeout);
    p.stdin.write(`${JSON.stringify(obj)}\n`);
  });
}

async function listVoices() {
  if (voices) return voices;
  const line = await request({ cmd: 'voices' }, (l) => l.startsWith('VOICES') || l.startsWith('ERR'), 20000);
  voices = line.startsWith('VOICES') ? line.slice(7).split('|').filter(Boolean) : [];
  return voices;
}

/** "Microsoft David - English (United States)" (browser name) → installed SAPI voice name. */
async function matchVoice(name) {
  const list = await listVoices();
  if (!list.length) return null;
  if (!name) return list[0];
  const n = name.toLowerCase();
  const exact = list.find((v) => v.toLowerCase() === n);
  if (exact) return exact;
  const words = n.replace(/\(.*\)/, '').split(/[\s-]+/).filter((w) => w && !['microsoft', 'desktop', 'english', 'online', 'natural'].includes(w));
  return list.find((v) => words.length && words.every((w) => v.toLowerCase().includes(w))) || null;
}

/** jobs: [{text, voice, rate(-10..10)}] → [Uint8Array wav | null] (null: voice not available). */
async function render(jobs) {
  const out = [];
  for (const j of jobs) {
    const voice = await matchVoice(j.voice);
    if (!voice) { out.push(null); continue; }
    const id = ++seq;
    const file = path.join(os.tmpdir(), `friendlife-tts-${process.pid}-${id}.wav`);
    const line = await request({ id, voice, rate: Math.max(-10, Math.min(10, Math.round(j.rate || 0))), text: String(j.text || '').slice(0, 400), out: file }, (l) => l.startsWith(`OK ${id}`) || l.startsWith(`ERR ${id}`) || l.startsWith('ERR 0'));
    if (line.startsWith('OK')) {
      try { out.push(fs.readFileSync(file)); } catch { out.push(null); }
    } else out.push(null);
    fs.rm(file, { force: true }, () => {});
  }
  return out;
}

function stop() { try { proc?.kill(); } catch { /* gone */ } proc = null; }

module.exports = { render, listVoices, stop };
