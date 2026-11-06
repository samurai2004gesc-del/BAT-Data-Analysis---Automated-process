# Validación adicional de los proyectos de Power BI

`npm test` ya valida el reporte (PBIR) y el tema contra los esquemas oficiales de Microsoft, y revisa la coherencia del modelo. Estas dos herramientas opcionales validan además con el software oficial de Microsoft:

## 1. Modelo semántico con TOM (Tabular Object Model)
Carga `model.bim` con `Microsoft.AnalysisServices` (el mismo motor de Power BI / Analysis Services) y lo convierte a TMDL de ida y vuelta.

```bash
cd tools/validar-powerbi
```
```bash
dotnet run -- "/ruta/Mi reporte.SemanticModel/model.bim"
```
Requiere el SDK de .NET 8.

## 2. Expresiones de Power Query (M)
Analiza la sintaxis M de cada tabla con el analizador oficial `@microsoft/powerquery-parser`.

```bash
npm install --no-save @microsoft/powerquery-parser
```
```bash
node tools/validar-powerbi/mcheck.js "/ruta/Mi reporte.SemanticModel/model.bim"
```

Para generar proyectos de prueba en disco: `PBI_OUT=/ruta npm test`.
