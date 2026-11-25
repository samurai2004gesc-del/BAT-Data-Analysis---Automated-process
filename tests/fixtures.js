/* Genera archivos de ejemplo FICTICIOS con la misma estructura que los reportes reales.
 * Se usan en las pruebas y se copian a /ejemplos para probar la app.
 * Uso: node tests/fixtures.js [carpeta_destino] */
'use strict';
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const d = (y, m, dd) => Math.round((Date.UTC(y, m - 1, dd) - Date.UTC(1899, 11, 30)) / 86400000);
const HR_HEAD = ['New / existing / planned', 'Planning Reporting Unit', 'Budgetary Cost Centre', 'Contractual Cost Centre', 'Cost Centre Function',
  'Position Function', 'Home Function', 'Sub-function ID', 'Sub-function', 'Job Code', 'Job Grade', 'Position Code & Position Title',
  'Regular / Temporary', 'Employee Class', 'Employee Name', 'Local / IA', 'Location', 'Pay Grade', 'Cost Centre Currency', 'Salary',
  'FTE % (month independent)', 'Full / Part Time', 'Start Date', 'End Date', 'FTE Multiplier', 'Date Check'];

function setDateFormat(ws, cols, firstRow, lastRow) {
  for (let r = firstRow; r <= lastRow; r++) for (const c of cols) {
    const ref = XLSX.utils.encode_cell({ r, c });
    if (ws[ref] && typeof ws[ref].v === 'number') ws[ref].z = 'dd/mm/yyyy';
  }
}

/** HR Input Report (CAR, multi-entidad): metadatos filas 1-32, encabezado en H33, datos desde H34. */
function hrInput() {
  const rows = [];
  rows.push(['HR Input Report']);
  rows.push(['Current Filters']);
  rows.push(['Category', 'BHI']);
  rows.push(['Entity', 'CAR (ejemplo ficticio)']);
  while (rows.length < 32) rows.push([]);
  const header = ['HIDDEN', 'HIDDEN', 'HIDDEN', 'HIDDEN', 'HIDDEN', 'HIDDEN', null].concat(HR_HEAD); // A..G + H..AG
  rows.push(header);
  // [unidad, homeFunc, subFunc, grade, fte, start, end, mult]
  const P = [
    ['GYC00L_GY10_X', 'Finance', 'Finance - Controlling', 'Grade 35', 1, d(2020, 1, 1), d(9999, 12, 31), null],
    ['GYC00L_GY10_X', 'Finance', 'Finance - Controlling', 'Grade 33', 1, d(2024, 5, 1), d(9999, 12, 31), 0],
    ['GYC00L_GY10_X', 'Marketing', 'Marketing - Trade Marketing & Distribution - Field', 'Grade 31', 1, d(2023, 1, 1), d(9999, 12, 31), null],
    ['GYC00L_GY10_X', 'Marketing', 'Marketing - Brand', 'Grade 31', 1, d(2023, 1, 1), d(2026, 6, 30), null], // termina antes de fin de año
    ['JMC00L_JM10_X', 'HR', 'HR - Generalist', 'Grade 34', 1, d(2026, 3, 1), d(9999, 12, 31), null],
    ['JMC00L_JM10_X', 'HR', 'HR - Generalist', 'Grade 34', 0.5, d(2026, 3, 1), d(9999, 12, 31), null], // tiempo parcial
    ['JMC00L_JM10_X', 'Operations', 'Operations - Supply', 'Grade 32', 1, d(2027, 2, 1), d(9999, 12, 31), null], // solo COPLAN
    ['TTC00L_TT10_X', 'Finance', 'Finance - Tax', 'Grade 36', 1, d(2019, 1, 1), d(9999, 12, 31), 2], // multiplicador 2
    ['TTC00L_TT10_X', 'Marketing', 'Marketing - Trade Marketing & Distribution - Field', 'Grade 26', 1, d(2025, 1, 1), d(9999, 12, 31), null],
    ['TTO02L_TT20_X', 'Operations', 'Operations - Manufacturing', 'Grade 30', 1, d(2018, 1, 1), d(9999, 12, 31), null],
    ['TTO02L_TT20_X', 'Operations', 'Operations - Manufacturing', 'Grade 30', 1, d(2018, 1, 1), null, null], // sin fecha de fin
    ['ZZC00L_ZZ10_X', 'Legal', 'Legal - Corporate', 'Grade 37', 1, d(2022, 1, 1), d(9999, 12, 31), null] // unidad sin entidad
  ];
  P.forEach((p, i) => {
    const r = [null, null, null, null, null, null, null];
    r.push(i % 3 === 0 ? 'Existing' : 'Planned', p[0], 'CC' + (100 + i), 'CC' + (100 + i), p[1], p[1], p[1], 'SF' + i, p[2], 'JC' + i,
      p[3], 'POS' + (1000 + i) + ' Puesto ficticio ' + (i + 1), 'Regular', 'Employee', 'Empleado Ficticio ' + (i + 1), 'Local', 'Ciudad',
      p[3], 'USD', 1000 * (i + 1), p[4], p[4] === 1 ? 'Full Time' : 'Part Time', p[5], p[6], p[7], 'OK');
    rows.push(r);
  });
  const ws = XLSX.utils.aoa_to_sheet(rows);
  setDateFormat(ws, [29, 30], 33, 33 + P.length);
  return ws;
}

/** Catálogo de HC Aprobado (como la hoja HC_YTD (Grade) (HC Tool Approv)) + For Filters + Entidades */
function masterWorkbook() {
  const wb = XLSX.utils.book_new();
  const cat = [['Category', 'Country', 'Function', 'Grade', 'Type', "2.3 - COPLAN'26", "SOP9'26", "COPLAN'27"]];
  const A = [
    ['BHI', 'GY', 'FIN', 'Grade 35', 'Local', 1, 1, 1],
    ['BHI', 'GY', 'FIN', 'Grade 33', 'Local', 1, 1, 1],
    ['BHI', 'GY', 'MKT', 'Grade 31', 'Local', 2, 2, 1],
    ['BHI', 'JM', 'HR', 'Grade 34', 'Local', 1, 2, 2],
    ['BHI', 'JM', 'OPS', 'Grade 32', 'Local', 0, 0, 1],
    ['BHI', 'TT', 'FIN', 'Grade 36', 'Local', 2, 2, 2],
    ['BHI', 'TT', 'MKT', 'Grade 26', 'Local', 1, 1, 1],
    ['BHI', 'TTO', 'OPS', 'Grade 30', 'Local', 2, 2, 2]
  ];
  A.forEach((a) => cat.push(a));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Instrucciones (ejemplo)']]), 'Instructions');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(cat), 'HC_YTD (Grade) (HC Tool Approv)');
  const ff = [['HFSlicer', null, null, 'HCAppSlicer'], ['Home Function', 'Function', null, 'Function Approved', 'Function'],
    ['Finance', 'FIN', null, 'FIN', 'FIN'], ['Marketing', 'MKT', null, 'MKT', 'MKT'], ['HR', 'HR', null, 'HR', 'HR'], ['Operations', 'OPS', null, 'OPS', 'OPS'], ['Legal', 'LEGAL', null, 'LEG', 'LEGAL']];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ff), 'For Filters');
  const ent = [['Codigo Entidad', 'Descripcion', 'Entidad'], ['GYC00L_GY10', 'Guyana Comercial', 'Guyana'], ['JMC00L_JM10', 'Jamaica Comercial', 'Jamaica'],
    ['TTC00L_TT10', 'Trinidad Comercial', 'Trinidad Comercial'], ['TTO02L_TT20', 'Trinidad Operación', 'Trinidad Operación']];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ent), 'Entidades');
  return wb;
}

/** Lista de asignaciones por área (como la presentación de Recharges). */
function assignmentsWorkbook() {
  const wb = XLSX.utils.book_new();
  const H = ['Nombre', 'Payroll Num.', 'Sociedad', 'CeCo', 'Grade', 'Host Country', 'Tipo asignación', 'Desde', 'Hasta', 'IC code', 'Coder'];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([H,
    ['Perez Lopez Juan Carlos', '90000001', 'MX15', 'MXCB0E1B07', 36, 'Colombia', 'LTA', 'Julio', 'Dic', 'IC-00-CO14', 'Coder Ficticio Uno'],
    ['Garcia Ruiz Ana', '90000002', 'MX15', 'MXCB0E1B07', 37, 'UK', 'LTA', 'Julio', 'Dic', 'IC-00-GB51', 'Coder Ficticio Dos'],
    ['Lopez Diaz Maria Fernanda', '90000003', 'MX10', 'MXMA1D3H33', 35, 'USA', 'STA', 'Julio', 'Dic', '', '']
  ]), 'OPERACIONES');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([H,
    ['Martinez De La Torre Luis', '90000004', 'MX15', 'MXCB0E1B07', 38, 'Honduras', 'LTA', 'Ago', 'Dic', 'IC-00-HN12', 'Coder Ficticio Tres']
  ]), 'MARKETING');
  return wb;
}

/** Estimate Benefits con las hojas que usa el proceso (valores ya calculados, fecha de hoy en JVU/Accrual). */
function estimateBenefits(dateStr) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Key', 'NumNom', 'Nombre', 'Ce.coste', 'Receiving Entity Coder', 'Receiving Entity Coder email2', 'RRBPO'],
    [1, 90000001, 'Perez Lopez Juan Carlos', 'MXCB0E1B07', 'Coder Ficticio Uno', 'coder.uno@example.com', 'RRBP.MX15CO14/6000000001'],
    [2, 90000002, 'Garcia Ruiz Ana', 'MXCB0E1B07', 'Coder Ficticio Dos', 'coder.dos@example.com', '']
  ]), 'People');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Key', 'NumNom', 'Nombre', 'Area'], [1, 90000001, 'Perez Lopez Juan Carlos', 'Finance']]), 'Consolidado(#)');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[], [null, 'Name:', 'Perez Lopez Juan Carlos'], [], [null, 'Date:', '12-Aug-26'], [], [null, 'Currency:', 'USD'], [],
    [null, 'Reference:', 'Recharge H2 2026 Perez Lopez Juan Carlos'], [], [null, 'Cost Center:', 'MXCB0E1B07'], [], [null, 'PO', 'RRBP.MX15CO14/6000000001'], [], [null, 'Recharge', 'CO14'], [null, 'IC-00-CO14']]), 'IDX');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Shopping Cart'], ['Concepto', 'Monto', 'Moneda'], ['BENEFITS AND INSURANCES H2 2026', 9057.03, 'USD'], ['SOCIAL SECURITY H2 2026', 5858.17, 'USD'], ['PENSION PLAN H2 2026', 7671.03, 'USD'], ['Total', 22586.23, 'USD']]), 'Vendor.Template(PO)');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['PO Indicator', 'RRB Material', 'Amount', 'Currency', 'Receiving Entity IC code', 'Receiving Entity Coder email', 'PO short text', 'Invoice text', 'Markup amount', 'Markup %'],
    ['X', 'R011', 9057.03, 'USD', 'IC-00-CO14', 'coder.uno@example.com', 'BENEFITS AND INSURANCES H2 2026', 'BENEFITS AND INSURANCES H2 2026', null, 0],
    [null, 'R013', 5858.17, 'USD', 'IC-00-CO14', 'coder.uno@example.com', 'SOCIAL SECURITY H2 2026', 'SOCIAL SECURITY H2 2026', null, 0],
    [null, 'R014', 7671.03, 'USD', 'IC-00-CO14', 'coder.uno@example.com', 'PENSION PLAN H2 2026', 'PENSION PLAN H2 2026', null, 0],
    [], [], []
  ]), 'Webi creation');
  const jvu = [
    ['Serial Number', 'Simulation', 'Document Date', 'Document Type', 'Company Code', 'Posting Date', 'Period', 'Ledger Group', 'Currency', 'Reference', 'Header Text'],
    ['<New Serial No>', 'X', 'BLDAT', 'BLART', 'BUKRS', 'BUDAT', 'MONAT', 'LDGRP', 'WAERS', 'XBLNR', 'BKTXT'],
    [null, null, 'Post Key', 'Account(GL, AP, AR)', 'Special GL Indicator', 'Transaction Type', 'Amount in DC', 'Trading Partner', 'Tax Code', 'Calculate Tax', 'Profit Center'],
    [null, 'NEWDOC', 'BSCHL', 'NEWKO', 'UMSKZ', 'BEWAR', 'WRBTR', 'VBUND', 'MWSKZ', 'XMWST', 'PRCTR'],
    [null, 'X', dateStr, 'AB', 'MX15', dateStr, 8, null, 'USD', 'Recharge H2', 'Recharge H2 2026 Perez Lopez Juan Carlos'],
    [1, null, 50, 5003120100, null, null, 9057.03, null, 'Y0', null, 'MXC00L'],
    [2, null, 40, 5003120100, null, null, 9057.03, null, 'Y0', null, 'MXC00L'],
    [3, null, 50, 5020101100, null, null, 5858.17, null, 'Y0', null, 'MXC00L'],
    [4, null, 40, 5020101100, null, null, 5858.17, null, 'Y0', null, 'MXC00L'],
    [5, null, 50, 5040106100, null, null, 7671.03, null, 'Y0', null, 'MXC00L'],
    [6, null, 40, 5040106100, null, null, 7671.03, null, 'Y0', null, 'MXC00L'],
    [], [], []
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(jvu), 'JVU - Recharge');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(jvu.map((r) => r.slice())), 'Accrual');
  return wb;
}

/** Reporte del proveedor (K2) */
function supplierK2() {
  return XLSX.utils.aoa_to_sheet([
    ['Assignee Name', 'K2 Number', 'Invoice Number', 'Regional Manager', 'GMSP Contact', 'Service', 'Gross Amount (GBP)', 'Currency'],
    ['Juan Carlos Perez Lopez', 'K2-100001', 'SIUS0001', 'Manager Ficticio', 'Contacto Ficticio', 'Tax return', 437.25, 'GBP'],
    ['Ana Garcia Ruiz', 'K2-100002', 'SIUS0002', 'Manager Ficticio', 'Contacto Ficticio', 'Change of circumstances notification', 1266.77, 'GBP'],
    ['Maria Fernanda Lopez Diaz', 'K2-100003', 'SIUS0003', 'Manager Ficticio', 'N/A', 'Disbursements', 885.86, 'GBP'],
    ['Persona Nueva Sin Historico', 'K2-100004', 'SIUS0004', 'Manager Ficticio', 'N/A', 'Permanent residence', 300, 'GBP']
  ]);
}
/** Consolidado con hoja Histórico K2 */
function consolidado() {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Nombre', 'Gross Amount (GBP)', 'Ceco', 'Tipo', 'Servicio', 'ExRate', 'Gross Amount MXN', 'Mes', 'Year', 'HRBP', 'Home Function'],
    ['Perez Lopez, Juan Carlos', 400, 'MXCB2H2001', 'K2', 'Tax return', 23.1, 9240, 3, 2026, 'Laura Mendez Ruiz', 'Finance'],
    ['Perez Lopez, Juan Carlos', 400, 'MXCB2H2011', 'K2', 'Tax return', 23.1, 9240, 5, 2026, 'Laura Mendez Ruiz', 'Finance'],
    ['Garcia Ruiz, Ana', 200, 'MXCB8D0045', 'Deloitte', 'Disbursements', 23.1, 4620, 4, 2026, 'Carlos Ortega Paz', 'Exec & Corp Services'],
    ['Lopez Diaz, Maria Fernanda', 150, 'MXMA1D3H33', 'K2', 'Disbursements', 23.1, 3465, 4, 2026, 'Sofia Navarro Gil', 'Marketing Office']
  ]), 'Histórico K2');
  return wb;
}
function allCecos() {
  return XLSX.utils.aoa_to_sheet([
    ['Controlling Area', 'Company Code', 'Description', 'Approver', 'Function', 'Valid', 'Cost Center'],
    ['BAT1', 'MX15', 'Finance', 'Aprobador A', 'FIN', 'X', 'MXCB2H2001'],
    ['BAT1', 'MX15', 'Finance', 'Aprobador A', 'FIN', 'X', 'MXCB2H2011'],
    ['BAT1', 'MX15', 'Exec', 'Aprobador B', 'EXE', 'X', 'MXCB8D0045'],
    ['BAT1', 'MX10', 'Operations', 'Aprobador C', 'OPS', 'X', 'MXMA1D3H33'],
    ['BAT1', 'MX15', 'HR Recharges', 'Aprobador D', 'HR', 'X', 'MXCB7B0016']
  ]);
}
function ksb1() {
  return XLSX.utils.aoa_to_sheet([
    ['Document Number', 'Document Header Text', 'Name', 'Cost Center', 'Posting Date', 'Value TranCurr', 'TCurr', 'Val/ObjCur', 'ObjCur'],
    ['1455053954', 'K2 June', 'BAT (Holdings)', 'MXCB7B0016', d(2026, 6, 19), 2589.88, 'GBP', 59826.23, 'MXN'],
    ['1455056544', 'Otro cargo', 'Oth Staff Costs', 'MXCB7B0016', d(2026, 6, 19), 31480.52, 'GBP', 723798.54, 'MXN'],
    ['1455058679', 'Reclas mayo', 'Oth Staff Costs', 'MXCB7B0016', d(2026, 6, 20), -12679.7, 'MXN', -12679.7, 'MXN']
  ]);
}

/** Archivo de Deloitte (formato real: "Apellidos, Nombres", Success Factors ID, periodo) con personas ficticias. */
function supplierDeloitte() {
  return XLSX.utils.aoa_to_sheet([
    ['Billing Country', 'Deloitte Number', 'Success Factors ID', 'Assignee Name\n(Surname, first name)', 'Relationship', 'HOST SUCCES FACTOR ID', 'Fee Type as per rate card', 'Total Amount(inc.VAT) in GBP', 'Invoice Perioud'],
    ['Mexico', 'B886.1.1.1.C', 90000001, 'Perez Lopez, Juan Carlos', 'PRINCIPAL', 10000001, 'Tax return', 437.25, 'Sept'],
    ['Mexico', 'B886.2.1.1.C', 90000002, 'Garcia Ruiz, Ana', 'PRINCIPAL', 'N/A', 'Assessment - CREDIT', -120.5, 'August'],
    ['Mexico', 'B886.3.1.1.C', 90000003, 'Sin Historico, Persona Nueva', 'PRINCIPAL', 10000004, 'Permanent Residence', 1564.46, 'August'],
    ['Mexico', 'B886.4.1.1.C', 90000004, 'Romero Diaz, Pedro', 'PRINCIPAL', 'TBC', 'Work Permit', 300, 'August'],
    ['Mexico', 'B886.1.2.1.C', 90000001, 'Perez Lopez, Juan Carlos', 'PRINCIPAL', 10000001, 'Disbursements', 130.99, 'August']
  ]);
}
/** MAE ficticia con las mismas columnas que el reporte de SAP HR. Los datos sensibles llevan valores falsos (la app no los debe leer). */
function mae() {
  const H = ['Nº pers.', 'Número de personal', 'Grado', 'Posición', 'Posición', 'Función', 'Función', 'Grupo de personal', 'Clase de contrato', 'Ce.coste', 'Centro de coste', 'Un.org.', 'Unidad organizativa',
    'Á.liq.', 'Área de nómina', 'Soc.', 'Sociedad', 'División de personal', 'Área de personal', 'Número ID', 'NIF', 'Cuenta bancaria', 'Registro Patronal', 'NIMSS', 'Subdivisión de persona', 'Nombre del superior',
    'Nombre Posicion Report', 'Reporta a', 'Nombre Persona Reporta', 'Reporta a', 'Clave banco', 'Clave de banco', 'Nombre', 'Apellido Pat', 'Segundo apellido', 'Sexo', 'Clave para el estado c', 'Clase de identificació',
    'Fecha nac.', 'Edad del empleado', 'Alta'];
  const p = (id, ap1, ap2, nom, ceco, desc, uo, sub) => {
    const r = H.map(() => '');
    Object.assign(r, { 0: id, 1: [ap1, ap2, nom].filter(Boolean).join(' '), 2: '34', 3: '70000000', 4: 'Puesto ficticio', 5: '00000000', 9: ceco, 10: desc, 11: '70000001', 12: uo, 15: 'MX05', 16: 'BAT Servicios (ejemplo)',
      19: 'XAXX010101000', 20: 'XEXX010101HNEXXXA4', 21: '000000000000000000', 24: sub, 32: nom, 33: ap1, 34: ap2 });
    return r;
  };
  return XLSX.utils.aoa_to_sheet([H,
    p('10000001', 'Perez', 'Lopez', 'Juan Carlos', 'MXCB2H2011', 'MKT Fin BP', 'MARKETING FINANCE', 'Administración'),
    p('10000002', 'Garcia', 'Ruiz', 'Ana', 'MXCB8D0045', '', 'MEXICO DIRECTORY', 'Administración'),
    p('10000003', 'Robles', 'Garcia', 'Ana', 'MXCC2E4001', 'DSS Centro', 'LEON 73_X35', 'TM&D-BAT'), // homónima parcial: no debe confundirse con "Garcia Ruiz, Ana"
    p('10000004', 'Sin', 'Historico', 'Persona Nueva', 'MXCB2J0001', 'MKT Human Resources', 'TM&D HUMAN RESOURCES', 'Administración'),
    p('10000005', 'Lopez', 'Diaz', 'Maria Fernanda', 'MXCB2E4070', 'RTM', 'TM&D', 'Administración')
  ]);
}
/** "Sent to HRBPs" ya corregido de un mes anterior: función/HRBP/CeCo por persona y la tabla Función → HRBP en otra hoja. */
function sentAnterior() {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Assignee Name', 'Home Function', 'HRBP', 'CeCo', 'Ceco Oficial', 'K2 Number', 'Service', 'Gross Amount (GBP)', 'Success Factors ID'],
    ['Perez Lopez, Juan Carlos', 'FIN', 'Laura Mendez Ruiz', 'MXCB2H2011', 'MXCB2H2011', 'K2-090001', 'Tax return', 410, '90000001'],
    ['Garcia Ruiz, Ana', 'EXEC', 'Carlos Ortega Paz', 'MXCB8D0045', 'MXCB8D0045', 'K2-090002', 'Disbursements', 120, '']
  ]), 'MX15');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    [null, 'Homefunction', 'HRBP'], [null, 'HR', 'Elena Torres Vega'], [null, 'FIN', 'Laura Mendez Ruiz'], [null, 'EXEC', 'Carlos Ortega Paz'],
    [null, 'OPS', 'Mario Diaz Soto'], [null, 'MKT Office', 'Sofia Navarro Gil']
  ]), 'Sheet1');
  return wb;
}

function writeAll(dir, dateStr) {
  fs.mkdirSync(dir, { recursive: true });
  const save = (wb, name) => XLSX.writeFile(wb, path.join(dir, name));
  const one = (ws, sheet) => { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, sheet); return wb; };
  save(one(hrInput(), 'HR Input'), '01 HR Input Report CAR (ejemplo).xlsx');
  save(masterWorkbook(), '02 Maestro HC CAR - catalogo aprobado (ejemplo).xlsx');
  save(assignmentsWorkbook(), '03 Asignaciones a recobrar (ejemplo).xlsx');
  save(estimateBenefits(dateStr), '04 Estimate Benefits (ejemplo).xlsx');
  save(one(supplierK2(), 'MX15'), '05 K2 MX15 (ejemplo).xlsx');
  save(consolidado(), '06 ConsolidadoCharges (ejemplo).xlsx');
  save(one(allCecos(), 'Sheet1'), '07 All CeCos - Approvers (ejemplo).xlsx');
  save(one(ksb1(), 'Sheet1'), '08 KSB1 EXPORT (ejemplo).xlsx');
  save(one(supplierDeloitte(), 'MX15'), '10 Deloitte MX15 (ejemplo).xlsx');
  save(one(mae(), 'Sheet1'), '11 MAE dd.mm.aaaa_Sin (ejemplo).xlsx');
  save(sentAnterior(), '12 Sent to HRBPs mes anterior (ejemplo).xlsx');
  fs.writeFileSync(path.join(dir, '09 K2 costs - Non-PO billing MX15 (ejemplo).msg'), msgFile('K2 costs - Non-PO billing MX15 — June 2026', 'Global Mobility (ejemplo)', Date.UTC(2026, 5, 24, 13), ['K2 MX15.xlsx']));
}

module.exports = { hrInput, masterWorkbook, assignmentsWorkbook, estimateBenefits, supplierK2, consolidado, allCecos, ksb1, supplierDeloitte, mae, sentAnterior, writeAll, d };

if (require.main === module) {
  const t = new Date();
  const ds = String(t.getFullYear()) + String(t.getMonth() + 1).padStart(2, '0') + String(t.getDate()).padStart(2, '0');
  const out = process.argv[2] || path.join(__dirname, '..', 'ejemplos');
  writeAll(out, ds);
  console.log('Ejemplos generados en', out);
}

/** Correo .msg de Outlook (formato CFB) con asunto, remitente, fecha y adjuntos. */
function msgFile(subject, from, dateUtcMs, attachments) {
  const CFB = XLSX.CFB;
  const cfb = CFB.utils.cfb_new();
  const u16 = (s) => Buffer.from(s, 'utf16le');
  CFB.utils.cfb_add(cfb, '/__substg1.0_0037001F', u16(subject));
  CFB.utils.cfb_add(cfb, '/__substg1.0_0C1A001F', u16(from));
  const props = Buffer.alloc(48);
  props.writeUInt16LE(0x0040, 32); props.writeUInt16LE(0x0E06, 34);
  props.writeBigUInt64LE((BigInt(dateUtcMs) + 11644473600000n) * 10000n, 40);
  CFB.utils.cfb_add(cfb, '/__properties_version1.0', props);
  (attachments || []).forEach((a, i) => CFB.utils.cfb_add(cfb, '/__attach_version1.0_#' + String(i).padStart(8, '0') + '/__substg1.0_3707001F', u16(a)));
  return CFB.write(cfb, { type: 'buffer' });
}
module.exports.msgFile = msgFile;
