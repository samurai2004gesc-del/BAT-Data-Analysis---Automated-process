# HRSS Automatizador

App portátil para automatizar los procesos repetitivos del puesto de **HR Data Intern (HRSS)**. Es **un solo archivo HTML**: lo copias a un USB y lo abres con Edge o Chrome en la laptop del trabajo.

- **No se instala nada.** No necesita permisos de administrador, ni macros, ni Python.
- **Funciona sin internet.** Todas las librerías van dentro del archivo.
- **Tus datos no salen de la laptop.** Los archivos se procesan en la memoria del navegador y los resultados se guardan en *Descargas*.

## Cómo ponerla en el USB

1. Descarga `dist/HRSS-Automatizador.html` desde este repositorio (en GitHub: abre el archivo y usa **Download raw file**).
2. Cópialo al USB. Si quieres probar la app, copia también la carpeta `ejemplos/`.
3. En la laptop, haz doble clic en el archivo. Si no abre en el navegador, usa clic derecho → *Abrir con* → Microsoft Edge.
4. La primera vez, ve a **Configuración**, captura tu OneID y pulsa **Exportar configuración**. Guarda el `.json` en el USB: así conservas las equivalencias aunque cambies de computadora. En otra laptop usa **Importar configuración**.

## Qué hace cada módulo

### 📊 HC in BPC vs HC Approved
Sustituye a los 6 archivos con macros (Venezuela, CAR, Colombia, México Comercial, México Operaciones, CAM).

| Entrada | Salida |
|---|---|
| HR Input Report de SAP BPC, tal como se descarga (no hay que pegarlo como valores) | Comparación SOP y COPLAN por grado, con semáforo y acción requerida |
| Archivo maestro del mercado (hoja `HC_YTD (Grade) (HC Tool Approv)`) o cualquier Excel con el HC aprobado | Filtros por entidad y por función, con alertas |
| | Excel con las hojas Resumen, Detalle por función, Resumen por función, Posiciones BPC (con el motivo de cada posición), HC Aprobado y Alertas |

Aplica exactamente la regla documentada: la posición vale 0 si el FTE no es 100%; si no, vale 1 o el FTE Multiplier. Cuenta si inicia antes del 1 de enero del año siguiente y sigue viva al 31 de diciembre.

Además corrige los riesgos que la documentación marca como conocidos:
- Busca las columnas por nombre: ya no depende de H33 ni del rango H34:AG.
- El semáforo revisa grado por grado, así que un +3 y un −3 ya no se cancelan.
- Un solo filtro de Entidad/Función aplica a SOP y COPLAN.
- Muestra todos los grados, sin lista fija, y no tiene límite de filas.
- Avisa cuando una función o entidad no tiene equivalencia y cuando hay posiciones sin fecha de fin.

Las equivalencias de *For Filters* y *Entidades* se leen solas del archivo maestro y se guardan por mercado.

Además:
- **Varios mercados a la vez.** Sueltas juntos los HR Input y los maestros de todos los mercados. La app reconoce el mercado de cada archivo (por el *Planning Reporting Unit* o por el nombre) y genera un reporte consolidado: una hoja de resumen, una por mercado y otra de alertas. Antes hay que configurar cada mercado una vez en "Un mercado".
- **Qué cambió desde la corrida anterior.** Cada corrida guarda una foto por mercado y ejercicio. La siguiente muestra qué grados se corrigieron y cuáles empeoraron, y el reporte trae la hoja *Cambios vs anterior*.
- **Borrador de correo al HRBP** con las diferencias del filtro actual y el reporte adjunto.

### 🗂️ Tracker de Recobros
Lee la lista de asignaciones (una hoja por área, como en la presentación, o la hoja `People` de Estimate Benefits) y genera el Tracker H1/H2 con:
- SE Company Code, Note Title (`Recharge H2'26 Balboa M.`) y Note Text.
- Nombres de archivo (`{KEY}. Webi {Nombre}`), carpeta del empleado y rutas.
- Columnas de seguimiento: estatus, Recharge ID, aprobadores 1–3, RRB WBS/PO, JVU, BATCH ID, Accrual y FBL5N.
- Las hojas *Resumen por área* y *Datos faltantes* (IC code, Coder, etc.).
- La columna **Siguiente paso**, que se recalcula sola en Excel conforme capturas (crear Webi → seguir aprobaciones → JVU → BATCH ID → FBL5N).
- **Actualización sin perder lo capturado.** Si arrastras el Tracker anterior junto con la lista nueva, se conservan IDs, aprobadores, PO, JVU, estatus y comentarios. Las asignaciones nuevas se resaltan y las que ya no vienen quedan en gris. Cada persona conserva su KEY.

### 📤 Formatos SAP (SC / Webi / JVU / Accrual)
En Estimate Benefits elige el KEY y el tipo, guarda el archivo y arrástralo a la app. Para cada formato, la app:
- Copia la hoja como valores + formatos, elimina las filas vacías y genera el **TXT delimitado por tabulaciones** que acepta SAP.
- Aplica la nomenclatura y las carpetas `Webis/`, `JVUs/` y `Accruals/`. Los guarda directo en la carpeta de cada empleado o, si no elegiste carpeta, en un ZIP.
- Cuadra los montos: Webi contra JVU, y partidas 40 contra 50.
- Avisa si el JVU o el Accrual no tiene la fecha de hoy.
- Muestra Note Title/Text listos para copiar, el mes a marcar con "X" y los valores de *Exception* (16 / 05).

### 💱 Reclasificación de costos de movilidad (K2 / EY / Deloitte)
- **A.** Completa HRBP / Home Function / CeCo desde la hoja *Histórico K2*. Reconoce el nombre aunque venga como "Nombre Apellido" o como "Apellido, Nombre". Luego genera `Sent to HRBPs - MX15 K2.xlsx` y el texto del correo.
- **B.** Valida cada CeCo del archivo *Retrieved* contra *All CeCos - Approvers*: debe pertenecer a MX15. Arma un correo por HRBP con los CeCos a corregir.
- **C.** Calcula el tipo de cambio con el export de KSB1 y compara el cargo de SAP contra el total del proveedor. Genera `Reclasificacion por CeCo.xlsx` y las filas para pegar en *Histórico K2*.
- **D.** Checklist de las 6 evidencias. Si elegiste la carpeta Tracker, revisa directo `Suppliers\06. Junio\K2`.
- Borradores de correo con el archivo adjunto: a los HRBPs (A), a cada HRBP con CeCos por corregir (B) y a Planning con la reclasificación (C).

### 📚 Bulk: archivo anual
Aquí metes **todo lo del año de una vez**, aunque sean cientos de archivos mezclados. Hay tres formas de cargarlos, y se pueden combinar:
- arrastrar archivos o carpetas completas;
- elegir una carpeta;
- o, si ya elegiste la carpeta Tracker, el botón **Escanear mi carpeta**, que recorre `{Año}\…` con todas sus subcarpetas.

La app reconoce cada archivo por su nombre, su carpeta (mes, proveedor, H1/H2, KEY y empleado) y su contenido:

| Tipo de archivo | Cómo lo reconoce |
|---|---|
| Webi, JVU, Accrual, Shopping Cart (.xlsx y .txt) | Por la nomenclatura `{KEY}. {Tipo} {Nombre}` o por sus columnas |
| Archivos de K2 / EY / Deloitte | Por la carpeta `Suppliers\MM. Mes\Proveedor` y por tener nombre + monto |
| Sent / Retrieved from HRBPs, Reclasificación por CeCo | Por el nombre del archivo |
| Export de KSB1 | Por el nombre `mm-dd-aaaa EXPORT` o por sus columnas de importe |
| All CeCos - Approvers | Por el nombre o por sus columnas de CeCo y sociedad |
| HR Input, maestros de HC, Estimate Benefits, Trackers, ConsolidadoCharges | Por sus hojas y encabezados |
| Correos `.msg` de Outlook | Lee asunto, remitente, fecha y nombres de los adjuntos |
| Cualquier otro archivo (PDF, Word…) | Solo se registra en el inventario |

Con eso arma el **Consolidado anual**, con estas hojas:
- Resumen
- Recobros por asignación (SC / Webi / JVU / Accrual por persona y semestre)
- Documentos de recobro
- Cargos de proveedores (detalle y matriz por mes)
- CeCos asignados, validados contra el All CeCos más reciente
- Reclasificaciones
- Movimientos SAP, sin duplicar movimientos que aparecen en varias descargas
- Evidencia por mes y proveedor
- Headcount
- Trackers
- Correos
- Alertas
- Inventario de todos los archivos

**Alertas que detecta:**
- Webi sin JVU ni Accrual, o JVU sin Webi.
- Monto del Webi distinto al del JVU.
- Webi, JVU o Accrual sin su TXT para SAP.
- CeCos fuera de MX15.
- Meses con cargos de proveedor pero sin reclasificación.
- Evidencia incompleta.
- Archivos duplicados (mismo contenido aunque tengan otro nombre).
- Archivos que no se pudieron leer.

Con 800 archivos de prueba tardó 2 segundos. Con archivos reales, que pesan más, calcula de 1 a 3 minutos. Los archivos de más de 40 MB solo se registran en el inventario.

## Guardar directo en OneDrive (opcional)
En **Configuración › Dónde guardar los resultados**, elige "Directo en mi carpeta Tracker" y selecciona la carpeta `…\Gerencia HRSS-Organización - General\2026\Tracker`. También sirve la carpeta "General": la app entra sola a `{Año}\Tracker`.

Desde ahí, cada archivo se guarda en su lugar:
- `Recharges\H2'26\Webis|JVUs|Accruals\{KEY}. {Nombre}\…`
- `Recharges\H2'26\Tracker Recharges H226.xlsx`
- `Suppliers\06. Junio\K2\…`

Si un archivo ya existe, la app pregunta antes de reemplazarlo. El navegador puede pedirte permiso una vez por sesión. Esto funciona en Edge y Chrome. Si TI bloquea esta función, sigue disponible la descarga normal.

## Borradores de correo (.eml)
Los botones "✉ Borrador" descargan un archivo `.eml`. Al abrirlo con doble clic, Outlook lo muestra como un correo nuevo con destinatarios, asunto, texto y el archivo ya adjunto: solo revisas y envías.

Para llenar "Para" a partir de los nombres de HRBP, captura en **Configuración › Correos** un directorio con una persona por renglón (`Nombre; correo`) y los correos de Planning y de copia. Si Windows abre el `.eml` con otra app, usa clic derecho → *Abrir con* → Outlook.

## Qué sigue siendo manual
Descargar de SAP BPC / SAP NEO, cargar en SAP NEO, enviar los correos y guardar los `.msg`. Ese trabajo vive en sistemas a los que un archivo del USB no puede (ni debe) conectarse.

## Supuestos que hay que confirmar con archivos reales
La app se construyó a partir de los manuales. Detecta las columnas por nombre y deja corregir todo desde la pantalla, pero conviene validar con un archivo real (puede ser con datos ficticios):
- Los nombres de columna del catálogo de HC Aprobado y de *For Filters* / *Entidades* de cada mercado.
- El layout exacto de las hojas `Webi creation`, `JVU - Recharge` y `Accrual` de Estimate Benefits, y cómo exporta los números el TXT.
- Las columnas del archivo de cada proveedor (K2, EY, Deloitte) y del export KSB1.

## Ejemplos
`ejemplos/` tiene archivos **ficticios** con la estructura de los reportes reales, para probar cada pantalla. El JVU/Accrual de ejemplo trae una fecha fija, así que en otro día verás el aviso de "debe crearse y cargarse el mismo día". Es a propósito: así se ve ese aviso. Para regenerarlos: `node tests/fixtures.js`.

## Desarrollo
```bash
npm install
```
```bash
npm run build
```
```bash
npm test
```
- El código fuente está en `src/`: `index.html`, `styles.css` y `js/`. La lógica (`core.js`, `hc.js`, `recharges.js`, `reclass.js`) funciona igual en el navegador y en Node.
- `npm run build` genera `dist/HRSS-Automatizador.html`, que lleva todo incrustado.
- `npm test` corre las pruebas de lógica. `tests/e2e.js` prueba la app completa en Chromium con Playwright.
- Librerías incluidas: SheetJS 0.18.5 (lectura), ExcelJS 4.4.0 (escritura con formato) y JSZip 3.10.1.
