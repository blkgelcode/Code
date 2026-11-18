const { _electron } = require('playwright-core');
const fs = require('fs'); const path = require('path');
// Mac app smoke test: launches Electron, imports a folder through the (stubbed) native picker,
// kills the server mid-session and checks the app restarts it with nothing lost.
// Run: npm run test:electron   (on Linux it needs xvfb-run; macOS runs it directly)
const { execFileSync } = require('child_process');
const os = require('os');
const APP = path.resolve(__dirname, '..');
const S = fs.mkdtempSync(path.join(os.tmpdir(), 'blkedit-electron-'));
fs.mkdirSync(S + '/footage/day2', { recursive: true });
execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=1920x1080:d=3:r=60', '-f', 'lavfi', '-i', 'sine=f=330:d=3', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', S + '/footage/day2/DJI_0245.MP4']);
execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=1080x1920:d=2:r=30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', S + '/footage/IMG_4555.MOV']);
const check = (ok, what) => { console.log(`${ok ? '✓' : '✗'} ${what}`); if (!ok) process.exitCode = 1; };
const proj = S + '/proj', footage = S + '/footage';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const app = await _electron.launch({ executablePath: APP + '/node_modules/electron/dist/electron', args: [APP, ...(process.platform === 'linux' ? ['--no-sandbox'] : []), '--project', proj], env: { ...process.env, PORT: '5320' } });
  const win = await app.firstWindow();
  await win.waitForSelector('.topbar', { timeout: 30000 });
  check(await win.evaluate(() => typeof window.blkedit?.pickMedia === 'function' && typeof window.blkedit?.pathsForFiles === 'function'), 'native bridge (pickers + Finder paths) is available');
  // stand in for the macOS folder picker: return the footage folder
  await app.evaluate(({ dialog }, dir) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dir] }); }, footage);
  await win.click('text=+ Folder');
  await win.waitForSelector('.media-bin li >> nth=1', { timeout: 20000 });
  const tl = JSON.parse(fs.readFileSync(proj + '/timeline.json', 'utf8'));
  check(tl.media.length === 2 && tl.media.every(m => m.path.startsWith(footage)), 'folder imported by path (subfolders included)');
  check(!fs.existsSync(proj + '/media/DJI_0245.MP4'), 'nothing copied into the project');
  // add a clip, then crash the server
  await win.locator('.media-bin li').first().dblclick(); await sleep(700);
  const lock = JSON.parse(fs.readFileSync(proj + '/.history/server.lock', 'utf8'));
  process.kill(lock.pid, 'SIGKILL');
  // wait for a NEW server process to take the project lock, then for the page to reconnect
  let lock2 = lock;
  for (let i = 0; i < 100 && lock2.pid === lock.pid; i++) { await sleep(200); try { lock2 = JSON.parse(fs.readFileSync(proj + '/.history/server.lock', 'utf8')); } catch {} }
  await win.waitForSelector('.conn.on', { timeout: 20000 }); await sleep(800);
  check(lock2.pid !== lock.pid, 'server restarted by itself after being killed');
  check(await win.locator('.clip').count() === 1, 'the clip added before the crash is still there');
  // edits work after the restart
  await win.click('button[title="Add a text clip at the playhead"]'); await sleep(800);
  const t2 = JSON.parse(fs.readFileSync(proj + '/timeline.json', 'utf8'));
  check(t2.sequences[0].tracks.flatMap(t => t.clips).length === 2, 'editing works after the restart');
  await app.close(); await sleep(500);
  check(!fs.existsSync(proj + '/.history/server.lock'), 'project lock released on quit');
})().catch(e => { console.error('FAIL', e); process.exit(1); });
