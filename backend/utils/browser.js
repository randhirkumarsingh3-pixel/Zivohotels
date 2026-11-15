import fs from 'fs';
import puppeteer from 'puppeteer';

/**
 * One shared headless browser for PDF rendering (invoices, vouchers).
 *
 * Puppeteer's bundled Chrome needs a recent OS (it won't start on macOS 12), so if it fails we
 * fall back to PUPPETEER_EXECUTABLE_PATH or an installed Chrome / Chromium. In production (Linux
 * container) the bundled browser is used.
 */
const FALLBACK_PATHS = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

const ARGS = ['--no-sandbox', '--disable-setuid-sandbox'];
let instance = null;
let launching = null;

const launch = async () => {
  const preferred = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (preferred) return puppeteer.launch({ headless: true, args: ARGS, executablePath: preferred });
  try {
    return await puppeteer.launch({ headless: true, args: ARGS });
  } catch (err) {
    const path = FALLBACK_PATHS.find((p) => fs.existsSync(p));
    if (!path) throw err;
    console.warn(`[browser] Bundled Chrome failed to start (${err.message.split('\n')[0]}); using ${path}`);
    return puppeteer.launch({ headless: true, args: ARGS, executablePath: path });
  }
};

export const getBrowser = async () => {
  if (instance && instance.connected) return instance;
  if (!launching) {
    launching = launch().then((b) => { instance = b; return b; }).finally(() => { launching = null; });
  }
  return launching;
};

export const closeBrowser = async () => {
  if (instance) await instance.close().catch(() => {});
  instance = null;
};
