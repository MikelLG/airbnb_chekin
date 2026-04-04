/**
 * Robot automático para subir ficheros al portal de Mossos d'Esquadra
 * Uso: node upload_mossos.js <ruta_fichero.txt>
 */

require('dotenv').config();
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const MOSSOS_LOGIN_URL = 'https://registreviatgers.mossos.gencat.cat/mossos_hotels/AppJava/login.do';
const USER = process.env.MOSSOS_USER;
const PASS = process.env.MOSSOS_PASS;

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

  console.log(`\n🤖 Robot Mossos iniciando...`);
  console.log(`📄 Fichero: ${path.basename(absPath)}`);

  const browser = await chromium.launch({ headless: false, slowMo: 600 });
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

    if (result.includes('èxit') || result.includes('correctament') || result.includes('éxito') || result.includes('correcta')) {
      console.log('\n✅✅✅ FICHERO ENVIADO CORRECTAMENTE A MOSSOS ✅✅✅');
      const comprovant = page.locator('a:has-text("comprovant"), a:has-text("Descarregar"), a:has-text("comprobante")');
      if (await comprovant.count() > 0) {
        const [download] = await Promise.all([
          page.waitForEvent('download'),
          comprovant.first().click()
        ]);
        const savePath = path.join(path.dirname(absPath), 'comprovant_' + path.basename(absPath, '.txt') + '.pdf');
        await download.saveAs(savePath);
        console.log(`   📥 Comprovant guardado: ${path.basename(savePath)}`);
      }
    } else {
      console.log('\n⚠️  No se pudo confirmar. Ver mossos_result.png');
    }

  } catch (err) {
    console.error(`\n❌ Error: ${err.message}`);
    await page.screenshot({ path: 'mossos_error.png' }).catch(() => {});
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
