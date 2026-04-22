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

    console.log('   📋 Respuesta Mossos:', result.slice(0, 300));
    const successWords = ['èxit','correctament','éxito','correcta','rebut','recibido','procesado','acceptat','aceptado','enviat','enviado','ok','registr'];
    if (successWords.some(w => result.toLowerCase().includes(w))) {
      console.log('\n✅✅✅ FICHERO ENVIADO CORRECTAMENTE A MOSSOS ✅✅✅');
      const comprovant = page.locator('a:has-text("comprovant"), a:has-text("Descarregar"), a:has-text("comprobante")');
      let pdfPath = null;
      if (await comprovant.count() > 0) {
        const [download] = await Promise.all([
          page.waitForEvent('download'),
          comprovant.first().click()
        ]);
        pdfPath = path.join(REGISTROS_DIR, 'comprovant_' + baseName + '.pdf');
        await download.saveAs(pdfPath);
        console.log(`   📥 Comprovant guardado: ${path.basename(pdfPath)}`);
      }
      await tg(`✅ *Mossos — Subida correcta*\n📄 \`${path.basename(absPath)}\`\n📥 Comprovant adjunto`, pdfPath);
      await sendEmail(
        `✅ Mossos — ${path.basename(absPath)}`,
        `Fichero subido correctamente a Mossos.\n\nFichero: ${path.basename(absPath)}\nFecha: ${new Date().toLocaleString('es-ES')}`,
        [
          { filename: path.basename(absPath), path: absPath },
          ...(pdfPath ? [{ filename: path.basename(pdfPath), path: pdfPath }] : [])
        ]
      );
    } else {
      console.log('\n⚠️  No se pudo confirmar. Ver mossos_result.png');
      await tg(`⚠️ *Mossos — Sin confirmación*\n📄 \`${path.basename(absPath)}\`\nRevisa mossos_result.png`);
      await sendEmail(`⚠️ Mossos — Sin confirmación`, `No se pudo confirmar la subida.\n\nFichero: ${path.basename(absPath)}`);
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
