# Video: Log on to SAP BPC (Line Managers)

Video en inglés (~4.5 min, 1920×1080) que explica a los Line Managers los 5 pasos para entrar a SAP BPC y les pide **una captura de pantalla** como evidencia:

1. Curso **BPC HR Online Learning** en SuccessFactors (4 módulos, hasta 3 h, certificado → HRSS).
2. **Acceso en SAP (NEO)**: revisar con IDLookup si ya existe `bat-sapRoles-P52`; si no, Access Request Creation → System `P52 Client 100` → Role del mercado → User Details → User Group `*País*` → HR → Submit.
3. Instalar **SAP Analysis for Office** desde BAT Company Portal (32/64 bits igual que Excel) y reiniciar.
4. Reemplazar **Connections.xml** en `C:\Users\<OneID>\AppData\Local\EPMOfficeClient`.
5. Abrir Analysis y EPM add-in → EPM → Log On → `P52 - BAT_HCT - HCT (SSO)` → Set as Default → Log On.

Hecho con [Remotion](https://www.remotion.dev/) (React). Voz: ElevenLabs (`Brian`, id `nPczCjzI2devNBz1zQrb`, modelo `eleven_multilingual_v2`). NEO, SAP y BAT se pronuncian como palabra y BPC se deletrea (función `speak` en `src/script.ts`). Íconos: Lucide. Música y efectos sintetizados aquí mismo (`scripts/sfx.py`), sin licencias de terceros.

## Cambiar el contacto de la escena final
En `src/Root.tsx`, cambia `contact: 'HRSS Team'` por tu nombre o correo y vuelve a renderizar.

## Cómo se arma
```bash
npm install
```
```bash
npm run studio
```
```bash
npm run render
```
```bash
npm run master
```
- `src/script.ts`: guion por escena. Cada segmento tiene el texto de subtítulos (`t`), la pronunciación (`say`) y un `cue` con el que se sincronizan las animaciones.
- `scripts/voice.mjs`: genera la voz con timestamps (`src/voice/en.json`, `public/voice/en/*.mp3`). Solo vuelve a llamar a la API si cambió el texto. Necesita la variable `ELEVENLABS_API_KEY` (en Node ≥ 22.21 detrás de proxy: `NODE_USE_ENV_PROXY=1`).
- `scripts/pace.py`: da el ritmo pausado. Busca el silencio real entre frases en la onda y solo ahí inserta la pausa (corte a nivel de muestra con microfundidos); si la frase sigue de corrido no la toca. Genera `public/voice/en-paced/*.mp3` y `src/voice/en.paced.json`, que es lo que usa el video. Hay que correrlo después de `npm run voice`.
- `scripts/sfx.py`: efectos y música. La música es una sola pista continua (sin loop) con acordes cruzados a potencia constante y nivelada (variación < 3 dB).
- `scripts/master.py`: después del render sube el volumen a -16 LUFS con una ganancia fija (no usar `loudnorm` de una pasada: sube y baja la música) y recomprime.
- `scripts/crops.py`: recorta las capturas de las guías PDF (páginas rasterizadas a 2×) y difumina fotos/OneIDs. Las pantallas con datos personales (IDLookup, formulario de solicitud, User Details, certificado, ruta con OneID) están **recreadas con datos ficticios** (`src/components/Mock.tsx`).
- `public/shots/` y el logo no se suben al repositorio (material interno). Para regenerarlos:
  `pdftoppm -scale-to-x 2912 -scale-to-y -1 -png <guía>.pdf <prefijo>` (2666 para SAP Access Request) y `npm run crops`.

## Licencias a tener en cuenta
- **Remotion** es gratis para personas y empresas de hasta 3 empleados; una empresa más grande necesita la *Company License* (remotion.pro). El video ya renderizado se puede usar; la licencia aplica a usar Remotion para producirlo.
- **ElevenLabs** en plan gratuito pide atribución (incluida en la escena final) y uso no comercial; con plan de pago no hay restricción.
