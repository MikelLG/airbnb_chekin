#!/usr/bin/env python3
"""
Generador de fitxers per al Registre de Viatgers dels Mossos d'Esquadra
Anika's House - ID50044239

Uso:
  python mossos_generator.py                    # Modo interactivo (introducir datos manualmente)
  python mossos_generator.py --foto dni.jpg     # Extrae datos de foto DNI via Claude Vision
  python mossos_generator.py --listar           # Lista ficheros generados
"""

import json
import os
import sys
import base64
import argparse
from datetime import datetime, date

# Load .env if present
def _load_env():
    env_path = os.path.join(os.path.dirname(__file__), ".env")
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip())
_load_env()

# ─── CONFIGURACIÓN DEL ESTABLECIMIENTO ───────────────────────────────────────
ESTABLECIMIENTO = {
    "id_policial": "ID50044239",
    "nombre": "ANIKA'S HOUSE",
}

TIPO_PAGO_DEFAULT = "PLATF"   # Airbnb = plataforma de pagament
TIPO_CONTRATO_DEFAULT = "C"   # C = Contracte en curs, R = Reserva

# ─── CONTADORES DE FICHEROS ──────────────────────────────────────────────────
CONTADOR_FILE = "contador_mossos.json"

def get_next_counter():
    if os.path.exists(CONTADOR_FILE):
        with open(CONTADOR_FILE) as f:
            data = json.load(f)
        count = data.get("count", 0) + 1
    else:
        count = 1
    with open(CONTADOR_FILE, "w") as f:
        json.dump({"count": count}, f)
    return count

# ─── NOMBRE DEL FICHERO ───────────────────────────────────────────────────────
def get_filename(counter):
    seq = str(counter % 999 or 999).zfill(3)
    return f"{ESTABLECIMIENTO['id_policial']}.{seq}.txt"

# ─── GENERAR FICHERO TXT ─────────────────────────────────────────────────────
def generar_fichero(viatgers: list, tipo_contrato: str = TIPO_CONTRATO_DEFAULT):
    now = datetime.now()
    # Use yesterday's date for confeccio to avoid future date rejection
    fecha_confeccio = now.strftime("%Y%m%d")
    hora_confeccio = "0900"  # Fixed morning time to avoid future time rejection
    num_viatgers = len(viatgers)

    linies = []

    # NO línia 0 (agrupació) — only one establishment
    # Línia establiment (tipus 1)
    linia1 = "|".join([
        "1",
        ESTABLECIMIENTO["id_policial"],
        ESTABLECIMIENTO["nombre"],
        fecha_confeccio,
        hora_confeccio,
        str(num_viatgers),
        "V24"
    ])
    linies.append(linia1)

    # Línia per cada viatger (tipus 2)
    for v in viatgers:
        # Camps 1-32 separats per |
        tipus_doc = v.get("tipus_doc", "P")  # D=DNI, P=Passaport, N=NIE, O=Altres
        
        # Doc espanyol o estranger
        doc_espanyol = ""
        doc_estranger = ""
        if tipus_doc == "D":
            doc_espanyol = v.get("num_doc", "")
        else:
            doc_estranger = v.get("num_doc", "")

        data_entrada = v.get("data_entrada", date.today().strftime("%Y%m%d"))
        hora_entrada = v.get("hora_entrada", "1200")
        data_sortida = v.get("data_sortida", "")
        hora_sortida = v.get("hora_sortida", "1200")
        data_contracte = v.get("data_contracte", date.today().strftime("%Y%m%d"))

        # Número de contrato: usamos fecha + num_doc abreviado
        num_contracte = v.get("num_contracte", f"AIRBNB{date.today().strftime('%Y%m%d')}")

        camps = [
            "2",                                        # 1. Tipus registre
            doc_espanyol,                               # 2. Num doc espanyol
            doc_estranger,                              # 3. Num doc estranger
            tipus_doc,                                  # 4. Tipus document
            v.get("data_expedicio", ""),                # 5. Data expedició
            v.get("primer_cognom", "").upper(),         # 6. Primer cognom
            v.get("segon_cognom", "").upper(),          # 7. Segon cognom
            v.get("nom", "").upper(),                   # 8. Nom
            v.get("sexe", ""),                          # 9. Sexe (M/F/O)
            v.get("data_naixement", ""),                # 10. Data naixement
            v.get("pais_nacionalitat", "ESP"),          # 11. País nacionalitat ISO-3
            data_entrada,                               # 12. Data entrada
            hora_entrada,                               # 13. Hora entrada
            data_sortida,                               # 14. Data sortida
            hora_sortida,                               # 15. Hora sortida
            data_contracte,                             # 16. Data contracte
            tipo_contrato,                              # 17. Tipus contracte
            num_contracte,                              # 18. Número contracte
            str(v.get("num_viatgers", 1)),              # 19. Número viatgers
            str(v.get("num_habitacions", 1)),           # 20. Número habitacions
            "N",                                        # 21. Internet (S/N)
            v.get("tipus_pagament", TIPO_PAGO_DEFAULT), # 22. Tipus pagament
            v.get("telefon", ""),                       # 23. Telèfon
            v.get("parentesc", ""),                     # 24. Parentesc
            v.get("email", ""),                         # 25. Email
            v.get("num_suport", ""),                    # 26. Núm suport doc
            v.get("adreca", ""),                        # 27. Adreça
            v.get("provincia", ""),                     # 28. Província
            v.get("municipi", ""),                      # 29. Municipi
            v.get("localitat", ""),                     # 30. Localitat
            v.get("pais_postal", ""),                   # 31. País postal
            v.get("codi_postal", ""),                   # 32. Codi postal
        ]
        linies.append("|".join(camps))

    return "\r\n".join(linies)

# ─── MODO INTERACTIVO ─────────────────────────────────────────────────────────
def input_manual():
    print("\n" + "="*60)
    print("  REGISTRE VIATGERS - Anika's House")
    print("="*60)

    viatgers = []
    num_total = int(input("\n¿Cuántos huéspedes vas a registrar? "))

    for i in range(num_total):
        print(f"\n── Huésped {i+1} de {num_total} ──")
        v = {}

        print("Tipo documento: D=DNI, P=Pasaporte, N=NIE, O=Otros")
        v["tipus_doc"] = input("  Tipo doc: ").upper().strip()
        v["num_doc"] = input("  Número doc: ").strip()
        v["num_suport"] = input("  Núm soporte (solo DNI/NIE, 9 chars, o vacío): ").strip()

        v["primer_cognom"] = input("  Primer apellido: ").strip()
        v["segon_cognom"] = input("  Segundo apellido (vacío si no tiene): ").strip()
        v["nom"] = input("  Nombre: ").strip()

        print("  Sexo: M=Masculino, F=Femenino, O=Otro")
        v["sexe"] = input("  Sexo: ").upper().strip()

        naix = input("  Fecha nacimiento (DD/MM/AAAA): ").strip()
        if naix:
            d, m, a = naix.split("/")
            v["data_naixement"] = f"{a}{m}{d}"

        exp = input("  Fecha expedición doc (DD/MM/AAAA, o vacío): ").strip()
        if exp:
            d, m, a = exp.split("/")
            v["data_expedicio"] = f"{a}{m}{d}"

        v["pais_nacionalitat"] = input("  País nacionalidad ISO-3 (ESP, FRA, GBR...): ").upper().strip() or "ESP"

        entrada = input("  Fecha entrada (DD/MM/AAAA): ").strip()
        d, m, a = entrada.split("/")
        v["data_entrada"] = f"{a}{m}{d}"
        v["hora_entrada"] = input("  Hora entrada (HHmm, ej: 1400): ").strip() or "1200"

        sortida = input("  Fecha salida (DD/MM/AAAA): ").strip()
        d, m, a = sortida.split("/")
        v["data_sortida"] = f"{a}{m}{d}"
        v["hora_sortida"] = input("  Hora salida (HHmm, ej: 1200): ").strip() or "1200"

        v["telefon"] = input("  Teléfono huésped (o vacío): ").strip()
        v["email"] = input("  Email huésped (o vacío): ").strip()
        v["num_contracte"] = input("  Nº reserva Airbnb (ej: HMXXXXXXXX): ").strip()
        v["num_viatgers"] = num_total
        v["num_habitacions"] = 1

        # Dirección postal (obligatoria para contrato en curso)
        print("\n  Dirección postal del huésped:")
        v["adreca"] = input("  Calle y número: ").strip()
        v["pais_postal"] = input("  País (ESP, FRA, GBR...): ").upper().strip() or "ESP"
        if v["pais_postal"] == "ESP":
            v["provincia"] = input("  Código provincia INE (ej: 08 Barcelona): ").strip()
            v["municipi"] = input("  Código municipio INE (6 dígitos): ").strip()
            v["localitat"] = ""
        else:
            v["localitat"] = input("  Localidad: ").strip()
            v["provincia"] = ""
            v["municipi"] = ""
        v["codi_postal"] = input("  Código postal: ").strip()

        viatgers.append(v)

    return viatgers

# ─── EXTRACCIÓN VIA CLAUDE VISION ────────────────────────────────────────────
def extract_from_photo(image_path: str):
    try:
        import urllib.request
        import urllib.error
    except ImportError:
        print("Error: urllib no disponible")
        return None

    print(f"\n📷 Procesando imagen: {image_path}")

    # Leer y codificar imagen
    with open(image_path, "rb") as f:
        image_data = base64.standard_b64encode(f.read()).decode("utf-8")

    ext = image_path.lower().split(".")[-1]
    media_types = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp"}
    media_type = media_types.get(ext, "image/jpeg")

    prompt = """Analiza este documento de identidad y extrae TODOS los datos visibles.
Responde SOLO con un JSON válido con estos campos exactos (usa "" si no encuentras el dato):
{
  "tipus_doc": "D para DNI/NIF, P para Pasaporte, N para NIE, O para otros",
  "num_doc": "número del documento",
  "num_suport": "número de soporte (solo DNI español, 9 chars exactos)",
  "primer_cognom": "primer apellido en mayúsculas",
  "segon_cognom": "segundo apellido en mayúsculas",
  "nom": "nombre en mayúsculas",
  "sexe": "M o F",
  "data_naixement": "fecha nacimiento formato YYYYMMDD",
  "data_expedicio": "fecha expedición formato YYYYMMDD",
  "pais_nacionalitat": "código ISO-3 del país (ESP, FRA, GBR, DEU, ITA, USA...)"
}
No incluyas ningún texto adicional, solo el JSON."""

    payload = json.dumps({
        "model": "claude-sonnet-4-6",
        "max_tokens": 1000,
        "messages": [{
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": media_type,
                        "data": image_data
                    }
                },
                {"type": "text", "text": prompt}
            ]
        }]
    }).encode("utf-8")

    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        print("❌ Falta ANTHROPIC_API_KEY en el fichero .env")
        return None

    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01"
        }
    )

    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        text = data["content"][0]["text"].strip()
        # Limpiar markdown si hay
        text = text.replace("```json", "").replace("```", "").strip()
        extracted = json.loads(text)
        print("✅ Datos extraídos del documento:")
        for k, v in extracted.items():
            if v:
                print(f"   {k}: {v}")
        return extracted
    except Exception as e:
        print(f"❌ Error al procesar imagen: {e}")
        return None

# ─── MAIN ─────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="Generador ficheros Mossos - Anika's House")
    parser.add_argument("--foto", help="Ruta a foto del DNI/pasaporte para extraer datos automáticamente")
    parser.add_argument("--listar", action="store_true", help="Listar ficheros generados")
    parser.add_argument("--reserva", action="store_true", help="Tipo reserva en lugar de contrato en curso")
    args = parser.parse_args()

    if args.listar:
        txts = [f for f in os.listdir(".") if f.startswith("ID50044239") and f.endswith(".txt")]
        if txts:
            print("\nFicheros generados:")
            for f in sorted(txts):
                print(f"  📄 {f}")
        else:
            print("No hay ficheros generados todavía.")
        return

    if args.foto:
        # Modo automático con foto
        datos_doc = extract_from_photo(args.foto)
        if not datos_doc:
            print("No se pudieron extraer datos. Cambiando a modo manual...")
            viatgers = input_manual()
        else:
            print("\n¿Los datos son correctos? Completa la información de la estancia:")
            v = datos_doc.copy()

            entrada = input("Fecha entrada (DD/MM/AAAA): ").strip()
            d, m, a = entrada.split("/")
            v["data_entrada"] = f"{a}{m}{d}"
            v["hora_entrada"] = input("Hora entrada (HHmm, ej: 1400): ").strip() or "1200"

            sortida = input("Fecha salida (DD/MM/AAAA): ").strip()
            d, m, a = sortida.split("/")
            v["data_sortida"] = f"{a}{m}{d}"
            v["hora_sortida"] = input("Hora salida (HHmm): ").strip() or "1200"

            v["num_contracte"] = input("Nº reserva Airbnb: ").strip()
            v["telefon"] = input("Teléfono huésped (o vacío): ").strip()
            v["email"] = input("Email huésped (o vacío): ").strip()
            v["num_viatgers"] = int(input("Total huéspedes en esta reserva: ").strip() or "1")
            v["num_habitacions"] = 1

            print("\nDirección postal del huésped:")
            v["adreca"] = input("  Calle y número: ").strip()
            v["pais_postal"] = input("  País ISO-3 (ESP, FRA, GBR...): ").upper().strip() or "ESP"
            if v["pais_postal"] == "ESP":
                v["provincia"] = input("  Código provincia (ej: 08): ").strip()
                v["municipi"] = input("  Código municipio (6 dígitos): ").strip()
                v["localitat"] = ""
            else:
                v["localitat"] = input("  Localidad: ").strip()
                v["provincia"] = ""
                v["municipi"] = ""
            v["codi_postal"] = input("  Código postal: ").strip()

            viatgers = [v]
    else:
        # Modo manual
        viatgers = input_manual()

    # Auto-detect tipo_contrato based on first traveler's entry date
    if args.reserva:
        tipo_contrato = "R"
    else:
        try:
            entrada_date = datetime.strptime(viatgers[0].get("data_entrada", ""), "%Y%m%d").date()
            tipo_contrato = "R" if entrada_date > date.today() else "C"
        except:
            tipo_contrato = "C"

    # Generar fichero
    contador = get_next_counter()
    filename = get_filename(contador)
    contenido = generar_fichero(viatgers, tipo_contrato)

    with open(filename, "w", encoding="utf-8") as f:
        f.write(contenido)

    print(f"\n{'='*60}")
    print(f"✅ Fichero generado: {filename}")
    print(f"   Huéspedes registrados: {len(viatgers)}")
    print(f"\n📤 SIGUIENTE PASO:")
    print(f"   1. Ve a mossos.gencat.cat")
    print(f"   2. Entra con tu usuario y contraseña")
    print(f"   3. Ve a 'Enviament informació viatgers' > 'Fitxers massius'")
    print(f"   4. Sube el fichero: {filename}")
    print(f"{'='*60}\n")

if __name__ == "__main__":
    main()
