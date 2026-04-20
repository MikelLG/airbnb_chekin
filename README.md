# Anika's House — Check-in & Mossos

Portal web de check-in para huéspedes de Airbnb con envío automático al registro de viatgers dels Mossos d'Esquadra (Catalunya).

---

## URLs

- **Portal web huéspedes:** https://mikellg.github.io/airbnb_chekin/
- **Portal Mossos:** https://registreviatgers.mossos.gencat.cat/mossos_hotels/AppJava/login.do
- **GitHub repo:** https://github.com/MikelLG/airbnb_chekin

---

## Flujo completo (automático)

```
Huésped abre el portal
  → Selecciona habitación (Hab 1 o Hab 2)
  → Se cargan las reservas del iCal de Airbnb
  → Selecciona su reserva
  → Indica cuántas personas hay en la reserva
  → Foto delantera + trasera del DNI/pasaporte de cada persona (IA extrae los datos)
  → Revisa y completa datos + dirección postal
  → Descarga el fichero .txt
      → Telegram: te llega notificación + fichero .txt adjunto
      → GitHub Actions: arranca robot automáticamente
          → Sube el .txt a Mossos
          → Telegram: te llega el PDF comprobante
```

---

## Archivos clave

| Archivo | Qué hace |
|---------|----------|
| `index.html` | Portal web del huésped (GitHub Pages) |
| `upload_mossos.js` | Robot que sube el .txt a Mossos (corre en GitHub Actions) |
| `mossos_generator.py` | Genera el .txt manualmente desde terminal (backup) |
| `cloudflare-worker.js` | Proxy CORS para cargar iCal de Airbnb (pendiente deploy) |
| `.env` | Credenciales locales (nunca sube a GitHub) |
| `.github/workflows/deploy.yml` | CI/CD — inyecta secrets y despliega a GitHub Pages |
| `.github/workflows/upload_mossos.yml` | Se dispara automáticamente al recibir un nuevo .txt |

---

## .env (local)

```
MOSSOS_USER=<usuario mossos>
MOSSOS_PASS=<contraseña mossos>
TELEGRAM_BOT_TOKEN=<token del bot>
TELEGRAM_CHAT_ID=<chat id del grupo>
```

---

## GitHub Secrets (todos configurados)

| Secret | Descripción |
|--------|-------------|
| `ANTHROPIC_API_KEY` | API key de Claude (IA para leer DNIs) |
| `AIRBNB_ICAL_URL` | iCal Habitación 1 |
| `AIRBNB_ICAL_URL_2` | iCal Habitación 2 |
| `TELEGRAM_BOT_TOKEN` | Token del bot @AirbnbCheckinBot |
| `TELEGRAM_CHAT_ID` | ID del grupo de Telegram (número negativo) |
| `GH_DISPATCH_PAT` | Personal Access Token para disparar GitHub Actions |
| `MOSSOS_USER` | Usuario Mossos |
| `MOSSOS_PASS` | Contraseña Mossos |

---

## Uso diario

### Opción A — Automático (recomendado)
Manda este mensaje por Airbnb antes del check-in:
> "Para completar tu check-in, accede a: https://mikellg.github.io/airbnb_chekin/"

El huésped completa el portal → todo lo demás es automático.

### Opción B — Subir .txt manualmente al robot local
```powershell
cd C:\Users\Mikel\Documents\airbnb_chekin
node upload_mossos.js ID50044239.001.txt
```

### Opción C — Generar .txt desde terminal
```powershell
cd C:\Users\Mikel\Documents\airbnb_chekin
python mossos_generator.py
```

---

## Test local del portal

Genera `local-test.html` con los secrets inyectados y ábrelo con Live Server:

```powershell
cd C:\Users\Mikel\Documents\airbnb_chekin
python3 -c "
import os
def load_env():
    with open('.env') as f:
        for line in f:
            line=line.strip()
            if line and not line.startswith('#') and '=' in line:
                k,v=line.split('=',1); os.environ[k.strip()]=v.strip()
load_env()
with open('index.html') as f: html=f.read()
for k,v in [('__ANTHROPIC_API_KEY__','ANTHROPIC_API_KEY'),('__ICAL_URL__','AIRBNB_ICAL_URL'),('__ICAL_URL_2__','AIRBNB_ICAL_URL_2'),('__TELEGRAM_BOT_TOKEN__','TELEGRAM_BOT_TOKEN'),('__TELEGRAM_CHAT_ID__','TELEGRAM_CHAT_ID'),('__GH_DISPATCH_PAT__','GH_DISPATCH_PAT')]:
    html=html.replace(k,os.environ.get(v,''))
with open('local-test.html','w') as f: f.write(html)
print('OK')
"
```
Clic derecho en `local-test.html` → Open with Live Server.

