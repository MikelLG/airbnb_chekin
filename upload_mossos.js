/**
 * Robot automático para subir ficheros al portal de Mossos d'Esquadra
 * Uso: node upload_mossos.js <ruta_fichero.txt>
 */

require('dotenv').config();
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const REGISTROS_DIR = path.join(require('os').homedir(), 'Documents', 'Mossos_Registros');
if (!fs.existsSync(REGISTROS_DIR)) fs.mkdirSync(REGISTROS_DIR, { recursive: true });

const MOSSOS_LOGIN_URL = 'https://registreviatgers.mossos.gencat.cat/mossos_hotels/AppJava/login.do';
const USER       = process.env.MOSSOS_USER;
const PASS       = process.env.MOSSOS_PASS;
const TG_TOKEN   = process.env.TELEGRAM_BOT_TOKEN;
const TG_CHAT    = process.env.TELEGRAM_CHAT_ID;
const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_PASS = process.env.GMAIL_APP_PASSWORD;
const GOOGLE_ACCESS_TOKEN = process.env.GOOGLE_ACCESS_TOKEN;
const RECORD_ID = process.env.RECORD_ID;
const DASHBOARD_URL = process.env.DASHBOARD_URL || 'http://localhost:3000';
const VERCEL_BYPASS_SECRET = process.env.VERCEL_BYPASS_SECRET;

async function sendEmail(subject, text, attachments = []) {
  if (!GMAIL_USER || !GMAIL_PASS) return;
  try {
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: GMAIL_USER, pass: GMAIL_PASS }
    });
    await transporter.sendMail({
      from: `Anika's House <${GMAIL_USER}>`,
      to: GMAIL_USER,
      subject,
      text,
      attachments: attachments.filter(a => a.path && fs.existsSync(a.path))
    });
    console.log('   📧 Email enviado a', GMAIL_USER);
  } catch(e) {
    console.warn('Email error:', e.message);
  }
}

async function tg(text, filePath) {
  if (!TG_TOKEN || !TG_CHAT) return;
  try {
    if (filePath && fs.existsSync(filePath)) {
      // Send file as document using multipart (Node 18+ native fetch + FormData)
      const { FormData, File } = await import('undici').catch(() => globalThis);
      const fd = new FormData();
      fd.set('chat_id', TG_CHAT);
      fd.set('caption', text);
      fd.set('parse_mode', 'Markdown');
      const fileBytes = fs.readFileSync(filePath);
      fd.set('document', new Blob([fileBytes]), path.basename(filePath));
      await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendDocument`, { method:'POST', body:fd });
    } else {
      await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ chat_id: TG_CHAT, text, parse_mode: 'Markdown' })
      });
    }
  } catch(e) {
    console.warn('Telegram error:', e.message);
  }
}

async function notifyDashboard(recordId, pdfBase64, filename) {
  if (!RECORD_ID) {
    console.log('   ℹ️  Dashboard notification skipped (no recordId)');
    return;
  }
  const url = `${DASHBOARD_URL}/api/mossos/complete`;
  console.log(`   📡 Notifying dashboard: ${url}`);
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (VERCEL_BYPASS_SECRET) headers['x-vercel-protection-bypass'] = VERCEL_BYPASS_SECRET;
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ recordId, pdfBase64, filename, accessToken: GOOGLE_ACCESS_TOKEN }),
      redirect: 'manual',
    });
    const text = await response.text();
    const isHtml = text.trimStart().startsWith('<!') || text.trimStart().startsWith('<html');
    if (response.type === 'opaqueredirect' || response.status === 301 || response.status === 302 || response.status === 307 || response.status === 308) {
      console.warn(`   ⚠️  Dashboard notification redirected (${response.status}) — possible Vercel auth protection. URL: ${url}`);
    } else if (response.ok) {
      console.log('   📊 Dashboard notificado:', isHtml ? '[HTML response — unexpected]' : text);
    } else {
      const preview = isHtml ? `[HTML page — likely auth redirect or 404] status=${response.status}` : text.slice(0, 300);
      console.warn(`   ⚠️  Dashboard notification failed (${response.status}): ${preview}`);
    }
  } catch(e) {
    console.warn('Dashboard notification error:', e.message);
  }
}

async function uploadToMossos(filePath) {
  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) {
    console.error(`❌ Fichero no encontrado: ${absPath}`);
    process.exit(1);
  }
  if (!USER || !PASS) {
    console.error('❌ Faltan credenciales en .env');
    process.exit(1);
  }

  const baseName = path.basename(absPath, '.txt');
  const registroTxt = path.join(REGISTROS_DIR, path.basename(absPath));
  fs.copyFileSync(absPath, registroTxt);

  console.log(`\n🤖 Robot Mossos iniciando...`);
  console.log(`📄 Fichero: ${path.basename(absPath)}`);
  console.log(`📁 Guardado en registros/`);

  const isCI = process.env.CI === 'true';
  const browser = await chromium.launch({ headless: isCI, slowMo: isCI ? 0 : 600 });
  const page = await browser.newPage();

  try {
    // PASO 1: LOGIN
    console.log('\n1️⃣  Login...');
    await page.goto(MOSSOS_LOGIN_URL, { waitUntil: 'domcontentloaded' });
    await page.locator('input[type="text"]:visible').first().fill(USER);
    await page.locator('input[type="password"]:visible').first().fill(PASS);
    await page.locator('input[type="submit"]:visible, button[type="submit"]:visible').first().click();
    await page.waitForTimeout(3000);
    await page.waitForLoadState('domcontentloaded');

    const bodyAfterLogin = await page.textContent('body');
    if (!bodyAfterLogin.includes('Envío información viajeros') && !bodyAfterLogin.includes('Salir')) {
      await page.screenshot({ path: 'mossos_login_fail.png' });
      throw new Error('Login fallido. Ver mossos_login_fail.png');
    }
    console.log('   ✅ Login correcto');

    // PASO 2: CLICK MENU PRINCIPAL
    console.log('\n2️⃣  Abriendo Envío información viajeros...');
    await page.click('a:has-text("Envío información viajeros")');
    await page.waitForTimeout(2000);
    await page.waitForLoadState('domcontentloaded');

    // PASO 3: CLICK SUBMENÚ FICHEROS MASIVOS
    console.log('\n3️⃣  Navegando a Ficheros masivos...');
    const subLinks = await page.$$eval('a', els =>
      els.map(e => e.textContent.trim()).filter(t => t.length > 1)
    );
    console.log('   🔗 Enlaces:', subLinks);

    const masivo = page.locator('a:has-text("Ficheros masivos"), a:has-text("masivos"), a:has-text("Fitxers massius"), a:has-text("massius"), a:has-text("Masivos")');
    await masivo.first().click();
    await page.waitForTimeout(2000);
    await page.waitForLoadState('domcontentloaded');

    const uploadBody = await page.textContent('body');
    if (!uploadBody.includes('fichero') && !uploadBody.includes('Envío de ficheros') && !uploadBody.includes('Seleccionar')) {
      await page.screenshot({ path: 'mossos_nav_fail.png' });
      throw new Error('No se llegó a la página de subida. Ver mossos_nav_fail.png');
    }
    console.log('   ✅ En página de subida');

    // PASO 4: SUBIR FICHERO
    console.log('\n4️⃣  Seleccionando fichero...');
    const fileInput = page.locator('input[type="file"]');
    await fileInput.waitFor({ timeout: 8000 });
    await fileInput.setInputFiles(absPath);
    console.log(`   📎 ${path.basename(absPath)} seleccionado`);
    await page.waitForTimeout(800);

    // PASO 5: ACEPTAR
    console.log('\n5️⃣  Enviando...');
    await page.click('input[value="Aceptar"], button:has-text("Aceptar")');
    await page.waitForTimeout(3000);
    await page.waitForLoadState('domcontentloaded');

    // PASO 6: VERIFICAR
    console.log('\n6️⃣  Verificando resultado...');
    const result = await page.textContent('body');
    await page.screenshot({ path: 'mossos_result.png' });

    console.log('   📋 Respuesta Mossos:', result.slice(0, 500));

    // Log all links on the page to help debug comprobante selector
    const allLinks = await page.$$eval('a', els => els.map(e => e.textContent.trim() + ' → ' + e.href).filter(t => t.length > 3));
    console.log('   🔗 Enlaces en página resultado:', allLinks);

    const resultLC = result.toLowerCase();
    // Use specific Mossos phrases — avoids false positives like "Líneas con error: 0"
    const hasSuccess = [
      'operación realizada con éxito',
      'operació realitzada amb èxit',
      'el fichero ha sido enviado correctamente',
      'el fitxer s\'ha enviat correctament',
      'correctament processat',
      'correctamente procesado',
    ].some(w => resultLC.includes(w));
    const hasError = [
      'no se ha enviado',
      'no s\'ha enviat',
      'formato de línea incorrecto',
      'format de línia incorrecte',
      'número de campos',
      'nombre de camps',
    ].some(w => resultLC.includes(w));
    if (hasSuccess && !hasError) {
      console.log('\n✅✅✅ FICHERO ENVIADO CORRECTAMENTE A MOSSOS ✅✅✅');

      // Download comprobante — search main page and all frames (old Java portal uses frames)
      let pdfPath = null;

      async function findComprovant() {
        const textRe = /comprobante|comprovant|descargar comprobante|descarregar comprovant/i;
        const hrefRe = 'fitxerViatgers';
        // Check main page + all frames
        const contexts = [page, ...page.frames()];
        for (const ctx of contexts) {
          try {
            const byText = ctx.locator('a').filter({ hasText: textRe });
            if (await byText.count() > 0) return byText.first();
          } catch (_) {}
        }
        for (const ctx of contexts) {
          try {
            const byHref = ctx.locator(`a[href*="${hrefRe}"], a[href*="comprov"], a[href*="descarr"]`);
            if (await byHref.count() > 0) return byHref.first();
          } catch (_) {}
        }
        return null;
      }

      const comprovantLoc = await findComprovant();

      if (comprovantLoc) {
        const loc = comprovantLoc;
        const linkText    = await loc.textContent();
        const href        = await loc.getAttribute('href');
        const onclickAttr = await loc.getAttribute('onclick');
        console.log(`   🔗 "${linkText?.trim()}" href="${href}" onclick="${onclickAttr}"`);

        // Set up listeners BEFORE clicking
        const downloadP = page.waitForEvent('download', { timeout: 15000 })
          .then(d => ({ type: 'download', data: d })).catch(() => null);
        const newPageP = page.context().waitForEvent('page', { timeout: 15000 })
          .then(p => ({ type: 'page', data: p })).catch(() => null);

        await loc.click();

        const dlResult = await Promise.race([downloadP, newPageP,
          new Promise(r => setTimeout(() => r(null), 16000))]);

        if (dlResult?.type === 'download') {
          pdfPath = path.join(REGISTROS_DIR, 'comprovant_' + baseName + '.pdf');
          await dlResult.data.saveAs(pdfPath);
          console.log(`   📥 Comprovant (descarga directa): ${path.basename(pdfPath)}`);
        } else if (dlResult?.type === 'page') {
          const newTab = dlResult.data;
          await newTab.waitForLoadState('networkidle').catch(() => {});
          const buf = await newTab.evaluate(() =>
            fetch(location.href).then(r => r.arrayBuffer()).then(b => Array.from(new Uint8Array(b)))
          ).catch(() => null);
          await newTab.close();
          if (buf && buf.length > 500) {
            pdfPath = path.join(REGISTROS_DIR, 'comprovant_' + baseName + '.pdf');
            fs.writeFileSync(pdfPath, Buffer.from(buf));
            console.log(`   📥 Comprovant (nueva pestaña): ${path.basename(pdfPath)}`);
          } else {
            console.warn('   ⚠️  Nueva pestaña sin PDF válido');
          }
        } else {
          // Last resort: try fetching the href directly using page context
          const fetchUrl = (href && href !== '#' && !href.startsWith('javascript'))
            ? (href.startsWith('http') ? href.replace(/#$/, '') : `https://registreviatgers.mossos.gencat.cat${href.replace(/#$/, '')}`)
            : 'https://registreviatgers.mossos.gencat.cat/mossos_hotels/AppJava/establiment/fitxerViatgers.do';
          try {
              const buf = await page.evaluate(async (url) => {
                const r = await fetch(url, { credentials: 'include' });
                const ab = await r.arrayBuffer();
                return Array.from(new Uint8Array(ab));
              }, fetchUrl);
              if (buf && buf.length > 500) {
                pdfPath = path.join(REGISTROS_DIR, 'comprovant_' + baseName + '.pdf');
                fs.writeFileSync(pdfPath, Buffer.from(buf));
                console.log(`   📥 Comprovant (fetch directo): ${path.basename(pdfPath)}`);
              } else {
                console.warn('   ⚠️  Fetch directo sin PDF válido');
              }
            } catch(e) {
              console.warn('   ⚠️  Fetch directo falló:', e.message);
            }
        }
      } else {
        console.log('   ℹ️  No se encontró enlace de comprobante en la página');
        // Log all links for debugging
        const allLinks = await page.$$eval('a', els => els.map(e => `"${e.textContent.trim()}" → ${e.href}`).filter(t => t.length > 5));
        console.log('   🔗 Links en página resultado:', allLinks);
      }

      // Notify dashboard (with or without PDF)
      if (RECORD_ID) {
        const pdfBase64 = pdfPath ? fs.readFileSync(pdfPath).toString('base64') : null;
        const pdfFilename = pdfPath ? path.basename(pdfPath) : null;
        await notifyDashboard(RECORD_ID, pdfBase64, pdfFilename);
      }

      const tgMsg = pdfPath
        ? `✅ *Mossos — Subida correcta*\n📄 \`${path.basename(absPath)}\`\n📥 Comprovant adjunto`
        : `✅ *Mossos — Subida correcta*\n📄 \`${path.basename(absPath)}\`\n_(sin comprovant disponible)_`;
      await tg(tgMsg, pdfPath);

      await sendEmail(
        `✅ Mossos — ${path.basename(absPath)}`,
        `Fichero subido correctamente a Mossos.\n\nFichero: ${path.basename(absPath)}\nFecha: ${new Date().toLocaleString('es-ES')}${pdfPath ? '' : '\n\nNota: No se encontró enlace de comprovant en la página de Mossos.'}`,
        [
          { filename: path.basename(absPath), path: absPath },
          ...(pdfPath ? [{ filename: path.basename(pdfPath), path: pdfPath }] : [])
        ]
      );
    } else {
      const reason = hasError ? 'Mossos devolvió un error de validación' : 'No se pudo confirmar el envío';
      console.log(`\n⚠️  ${reason}. Ver mossos_result.png`);
      await tg(`⚠️ *Mossos — ${hasError ? 'Error de validación' : 'Sin confirmación'}*\n📄 \`${path.basename(absPath)}\`\n${hasError ? '🔴 Revisa el fichero .txt (campos, separadores)' : 'Revisa mossos_result.png'}`);
      await sendEmail(`⚠️ Mossos — ${hasError ? 'Error validación' : 'Sin confirmación'}`, `${reason}.\n\nFichero: ${path.basename(absPath)}`);
    }

  } catch (err) {
    console.error(`\n❌ Error: ${err.message}`);
    await page.screenshot({ path: 'mossos_error.png' }).catch(() => {});
    await tg(`❌ *Mossos — Error*\n📄 \`${path.basename(absPath)}\`\n🔴 ${err.message}`);
    await sendEmail(`❌ Mossos — Error`, `Error al subir fichero.\n\nFichero: ${path.basename(absPath)}\nError: ${err.message}`);
  } finally {
    await page.waitForTimeout(2000);
    await browser.close();
  }
}

const filePath = process.argv[2];
if (!filePath) {
  console.log('\nUso: node upload_mossos.js <fichero.txt>\n');
  process.exit(1);
}

uploadToMossos(filePath);
