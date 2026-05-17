import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { existsSync, mkdirSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT = join(__dirname, '..', '..');
const IMAGE = join(PROJECT, 'spritesheet (10).png');
const OUT = join(PROJECT, 'tests', 'e2e', 'test-results');
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

function startApp() {
  return new Promise((resolve, reject) => {
    const server = spawn('npm', ['start'], { cwd: PROJECT, shell: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) { resolved = true; reject(new Error('Server timeout')); }
    }, 90000);
    server.stdout.on('data', (d) => {
      const t = d.toString();
      if (t.includes('http://localhost:42') && !resolved) {
        resolved = true;
        clearTimeout(timeout);
        setTimeout(() => resolve(server), 2000);
      }
    });
    server.stderr.on('data', (d) => { /* ignore */ });
    server.on('error', (e) => { if (!resolved) { resolved = true; clearTimeout(timeout); reject(e); } });
  });
}

async function run() {
  console.log('Starting Ember server...');
  const server = await startApp();
  console.log('Server ready');

  const browser = await chromium.launch({ headless: true, executablePath: '/usr/bin/google-chrome' });
  const ctx = await browser.newContext({ acceptDownloads: true });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.error('[PAGE ERROR]', e.message));

  try {
    await page.goto('http://localhost:4200', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    console.log('Page loaded');

    // Upload image
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(IMAGE);
    await page.waitForTimeout(3000);
    console.log('Image uploaded');

    // Auto detect
    await page.getByRole('button', { name: '⚡ Detectar' }).click();
    await page.waitForTimeout(3000);
    console.log('Auto-detect clicked');

    // Wait for frames to appear
    await page.waitForSelector('.fi', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1000);

    // Read first frame dims
    const firstFrame = page.locator('.fi').first();
    const name1 = await firstFrame.locator('.fm-n').textContent().catch(() => '?');
    const size1 = await firstFrame.locator('.fm-s').textContent().catch(() => '?');
    console.log(`FIRST FRAME: ${name1} — ${size1}`);
    const m1 = size1.match(/(\d+)×(\d+)/);
    if (!m1) throw new Error('Could not parse frame size');
    const fw1 = +m1[1], fh1 = +m1[2];
    console.log(`MEASUREMENT 1: w=${fw1} h=${fh1}`);

    // Auto Escalado
    await page.locator('button', { hasText: 'Auto Escalado' }).click();
    await page.waitForTimeout(3000);
    console.log('Auto Escalado done');

    // Open scale modal
    await page.locator('button', { hasText: 'Previsualizar' }).click();
    await page.waitForTimeout(2000);
    console.log('Scale modal open');

    // Sugerir tamaño
    await page.locator('button', { hasText: 'Sugerir' }).click();
    await page.waitForTimeout(2000);
    console.log('Sugerir tamaño done');

    // Read cell dims
    const cw = await page.locator('#mCW').inputValue();
    const ch = await page.locator('#mCH').inputValue();
    console.log(`CELL DIMS: ${cw} × ${ch}`);

    // Download PNG+JSON
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 10000 }),
      page.locator('button', { hasText: 'Descargar PNG' }).click()
    ]);
    const dlPath = join(OUT, download.suggestedFilename());
    await download.saveAs(dlPath);
    console.log(`DOWNLOADED: ${dlPath}`);

    // Close modal
    await page.locator('button', { hasText: 'Cancelar' }).click().catch(() => {});
    await page.waitForTimeout(500);

    const outFiles = readdirSync(OUT);
    console.log('Downloaded files:', outFiles.filter(f => !f.startsWith('.')));

    // Clear any leftover frames by clicking ✕ Todo
    const clearBtn = page.locator('button', { hasText: 'Todo' });
    if (await clearBtn.isVisible().catch(() => false)) {
      page.once('dialog', d => d.accept());
      await clearBtn.click().catch(() => {});
      await page.waitForTimeout(1000);
    }

    // Now load the downloaded PNG back
    const fileInput2 = page.locator('input[type="file"]').first();
    const pngDl = outFiles.find(f => f.endsWith('.png') && f.includes('scaled'));
    if (pngDl) {
      const dlImage = join(OUT, pngDl);
      console.log(`Re-loading: ${dlImage}`);
      await fileInput2.setInputFiles(dlImage);
      await page.waitForTimeout(3000);

      // Auto detect
      await page.getByRole('button', { name: '⚡ Detectar' }).click();
      await page.waitForTimeout(3000);
      await page.waitForSelector('.fi', { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(1000);

      // Read first frame
      const firstFrame2 = page.locator('.fi').first();
      const size2 = await firstFrame2.locator('.fm-s').textContent().catch(() => '?');
      console.log(`RE-DETECT FIRST FRAME: ${size2}`);
      const m2 = size2.match(/(\d+)×(\d+)/);
      if (m2) {
        const fw2 = +m2[1], fh2 = +m2[2];
        console.log(`MEASUREMENT 2: w=${fw2} h=${fh2}`);

        console.log('');
        console.log('========== RESULTS ==========');
        console.log(`Frame 1 (initial detect): ${fw1} × ${fh1}`);
        console.log(`Frame 1 (re-detect):      ${fw2} × ${fh2}`);
        console.log(`Cell dimensions in modal: ${cw} × ${ch}`);
        if (fw1 === fw2 && fh1 === fh2) {
          console.log('✅ PASS: Dimensions match!');
        } else {
          console.log('❌ FAIL: Dimensions differ');
          const dw = fw2 - fw1, dh = fh2 - fh1;
          if (dw > 0 || dh > 0) console.log(`  Grew by: w=${dw > 0 ? '+' + dw : dw} h=${dh > 0 ? '+' + dh : dh}`);
        }
        console.log('============================');
      }
    } else {
      console.log('No downloaded PNG found, skipping re-test');
      console.log('Files:', outFiles);
    }

    await page.waitForTimeout(1000);
  } catch (err) {
    console.error('ERROR:', err.message);
    await page.screenshot({ path: join(OUT, 'error.png') }).catch(() => {});
  } finally {
    await browser.close();
    server.kill();
    console.log('Done');
  }
}

run();
