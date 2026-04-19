# Anika's House — Check-in & Mossos

Portal web de check-in para huéspedes de Airbnb con envío automático al registro de viatgers dels Mossos d'Esquadra (Catalunya).

---

## URLs

- **Portal web huéspedes:** https://mikellg.github.io/airbnb_chekin/
- **Portal Mossos:** https://registreviatgers.mossos.gencat.cat/mossos_hotels/AppJava/login.do
- **GitHub repo:** https://github.com/MikelLG/airbnb_chekin

---

## Flujo completo

```
Huésped abre el portal
  → Selecciona habitación (Hab 1 o Hab 2)
  → Se cargan las reservas del iCal de Airbnb
  → Selecciona su reserva
  → Foto del DNI/pasaporte (IA extrae los datos)
  → Revisa y completa datos + dirección postal
  → Descarga el fichero .txt
  → Tú subes el .txt a Mossos (30 seg) o lo sube el robot automáticamente
```

---

## Archivos clave

| Archivo | Qué hace |
|---------|----------|
| `index.html` | Portal web del huésped (GitHub Pages) |
| `mossos_generator.py` | Genera el .txt manualmente desde terminal |
| `upload_mossos.js` | Robot que sube el .txt a Mossos automáticamente |
| `cloudflare-worker.js` | Proxy CORS para cargar iCal de Airbnb (deploy en Cloudflare) |
| `.env` | Credenciales locales (nunca sube a GitHub) |
| `.github/workflows/deploy.yml` | CI/CD — inyecta secrets y despliega a GitHub Pages |

---

## .env (local)

```
ANTHROPIC_API_KEY=sk-ant-...
MOSSOS_USER=ID50044239
MOSSOS_PASS=tu_password
AIRBNB_ICAL_URL=https://www.airbnb.es/calendar/ical/50050101.ics?t=...
AIRBNB_ICAL_URL_2=https://www.airbnb.es/calendar/ical/50886202.ics?t=...
```

---

## GitHub Secrets (para el deploy)

Configurados en repo → Settings → Secrets → Actions:

- `ANTHROPIC_API_KEY`
- `AIRBNB_ICAL_URL` — iCal Habitación 1
- `AIRBNB_ICAL_URL_2` — iCal Habitación 2

---

## Uso diario

### Opción A — El huésped lo hace solo
Manda este mensaje por Airbnb antes del check-in:
> "Para completar tu check-in, accede a: https://mikellg.github.io/airbnb_chekin/"

El huésped descarga el `.txt` y tú lo subes a Mossos.

### Opción B — Generar .txt manualmente
```powershell
cd C:\Users\Mikel\Documents\airbnb_chekin
python mossos_generator.py
```

### Opción C — Subir .txt a Mossos automáticamente (robot)
```powershell
cd C:\Users\Mikel\Documents\airbnb_chekin
node upload_mossos.js ID50044239.001.txt
```

---

## Test local del portal

```powershell
cd C:\Users\Mikel\Documents\airbnb_chekin

# Genera local-test.html con los secrets inyectados
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
html=html.replace('__ANTHROPIC_API_KEY__',os.environ.get('ANTHROPIC_API_KEY',''))
html=html.replace('__ICAL_URL__',os.environ.get('AIRBNB_ICAL_URL',''))
html=html.replace('__ICAL_URL_2__',os.environ.get('AIRBNB_ICAL_URL_2',''))
with open('local-test.html','w') as f: f.write(html)
print('OK')
"

# Abre con Live Server en VSCode (clic derecho → Open with Live Server)
# O con Python:
python -m http.server 8080
# → http://localhost:8080/local-test.html
```

---

## Pendiente

- [ ] Cloudflare Worker desplegado para CORS (iCal Habitación 2 falla sin él)
- [ ] Renombrar "Habitación 1" / "Habitación 2" con los nombres reales en `index.html`
- [ ] Probar `upload_mossos.js` con un fichero real (necesita contraseña en `.env`)
