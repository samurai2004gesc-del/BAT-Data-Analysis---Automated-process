using System;
using System.IO;
using System.Linq;
using Microsoft.AnalysisServices.Tabular;

// Carga model.bim con el Tabular Object Model oficial (el mismo motor de Power BI / Analysis Services)
// y además lo convierte a TMDL para confirmar que la estructura completa es válida.
class P {
  static int Main(string[] args) {
    int fails = 0;
    foreach (var path in args) {
      try {
        var json = File.ReadAllText(path);
        var db = JsonSerializer.DeserializeDatabase(json, new DeserializeOptions { });
        var m = db.Model;
        Console.WriteLine($"OK  {path}");
        Console.WriteLine($"    compat {db.CompatibilityLevel} · tablas {m.Tables.Count} · columnas {m.Tables.Sum(t => t.Columns.Count)} · medidas {m.Tables.Sum(t => t.Measures.Count)} · relaciones {m.Relationships.Count}");
        foreach (var t in m.Tables) foreach (var c in t.Columns.OfType<DataColumn>()) if (c.SortByColumn != null && c.SortByColumn.Table != t) { Console.WriteLine("    sortBy fuera de tabla " + c.Name); fails++; }
        foreach (SingleColumnRelationship r in m.Relationships) Console.WriteLine($"    rel {r.FromTable.Name}[{r.FromColumn.Name}] -> {r.ToTable.Name}[{r.ToColumn.Name}] ({r.FromCardinality}:{r.ToCardinality})");
        var outDir = Path.Combine(Path.GetDirectoryName(path)!, "tmdl-check");
        if (Directory.Exists(outDir)) Directory.Delete(outDir, true);
        TmdlSerializer.SerializeDatabaseToFolder(db, outDir);
        var back = TmdlSerializer.DeserializeDatabaseFromFolder(outDir);
        Console.WriteLine($"    TMDL ida y vuelta: {back.Model.Tables.Count} tablas");
      } catch (Exception e) { Console.WriteLine($"FAIL {path}: {e.GetType().Name}: {e.Message}"); fails++; }
    }
    return fails == 0 ? 0 : 1;
  }
}
