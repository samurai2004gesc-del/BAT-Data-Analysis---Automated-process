const PQP = require('@microsoft/powerquery-parser');
const fs = require('fs');
(async () => {
  let bad = 0, n = 0;
  for (const f of process.argv.slice(2)) {
    const bim = JSON.parse(fs.readFileSync(f, 'utf8'));
    for (const t of bim.model.tables) {
      const text = t.partitions[0].source.expression.join('\n');
      const r = await PQP.TaskUtils.tryLexParse(PQP.DefaultSettings, text);
      n++;
      if (!PQP.TaskUtils.isParseStageOk(r)) { bad++; console.log('FAIL', t.name, JSON.stringify(r.error && r.error.message || r).slice(0, 300)); }
    }
    // Control: una expresión rota debe fallar
    const broken = await PQP.TaskUtils.tryLexParse(PQP.DefaultSettings, 'let Origen = Table.FromRows( in Origen');
    if (PQP.TaskUtils.isParseStageOk(broken)) { console.log('El analizador no detectó la expresión rota'); bad++; }
  }
  console.log(n + ' expresiones M analizadas · ' + (bad ? bad + ' con error' : 'todas válidas'));
  process.exit(bad ? 1 : 0);
})();
