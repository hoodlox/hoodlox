// Lays the voice-over lines end to end into scenes: video/build/timeline.json with each scene's start,
// length, voice start and word times (seconds, scene-local). usage: node video/timeline.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { FFPROBE } from './ff.mjs';

const lines = JSON.parse(readFileSync('video/vo.json', 'utf8'));
const LEAD = { intro: 2.2 }, TAIL = { outro: 4.5 };
let t = 0;
// A "silent" line has no voice: its words are paced at a reading speed for the captions and animations.
const READ = 0.36; // s per word
const scenes = lines.map((l, i) => {
  const lead = LEAD[l.id] ?? 0.55, tail = TAIL[l.id] ?? 0.45;
  let file = null, vo, words;
  if (l.silent) {
    words = l.text.split(' ').map((w, j) => ({ w, t: +(lead + j * READ).toFixed(3), d: READ - 0.04 }));
    vo = words.length * READ + 0.6;
  } else {
    file = `video/build/vo/${String(i).padStart(2, '0')}.mp3`;
    vo = +execFileSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' });
    const meta = JSON.parse(readFileSync(file.replace('.mp3', '.words.json'), 'utf8')).Metadata;
    words = meta.filter((m) => m.Type === 'WordBoundary').map((m) => ({ w: m.Data.text.Text, t: +(lead + m.Data.Offset / 1e7).toFixed(3), d: +(m.Data.Duration / 1e7).toFixed(3) }));
  }
  const s = { id: l.id, start: +t.toFixed(3), dur: +(lead + vo + tail).toFixed(3), vo: lead, voDur: vo, file, words };
  t += s.dur;
  return s;
});
writeFileSync('video/build/timeline.json', JSON.stringify({ total: +t.toFixed(3), scenes }, null, 1));
console.log('total', t.toFixed(1), 's,', scenes.length, 'scenes');
