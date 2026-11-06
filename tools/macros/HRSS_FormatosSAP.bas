Attribute VB_Name = "HRSS_FormatosSAP"
'===============================================================================
' HRSS Automatizador - Formatos SAP para TODOS los KEY de Estimate Benefits
'
' Qué hace: para cada KEY elegido cambia Consolidado(#)!A2, recalcula y guarda,
' igual que el proceso manual (pegar valores + formatos, sin filas vacías):
'   Recharge -> Shopping Cart (.xlsx) + Webi (.xlsx y .txt)
'   JVU      -> JVU (.xlsx y .txt)        (solo KEY que ya tienen RRBPO en People)
'   Accrual  -> Accrual (.xlsx y .txt)
' Carpetas y nombres (los mismos que usa la app):
'   <carpeta del periodo>\Webis\{KEY}. {Nombre}\{KEY}. SC {Nombre}.xlsx
'   <carpeta del periodo>\Webis\{KEY}. {Nombre}\{KEY}. Webi {Nombre}.xlsx / .txt
'   <carpeta del periodo>\JVUs\{KEY}. {Nombre}\{KEY}. JVU {Nombre}.xlsx / .txt
'   <carpeta del periodo>\Accruals\{KEY}. {Nombre}\{KEY}. Accrual {Nombre}.xlsx / .txt
' Al final guarda "Resumen formatos SAP <fecha>.xlsx" con KEY, archivo, monto y estado.
' No modifica tus macros ni tus datos: al terminar regresa el KEY y el tipo que tenías.
'
' Cómo usarlo: Alt+F11 > Archivo > Importar archivo > HRSS_FormatosSAP.bas
'              Alt+F8 > GenerarFormatosSAP > Ejecutar
' IMPORTANTE: JVU y Accrual llevan fecha de HOY: genéralos el mismo día que los cargas a SAP.
'===============================================================================
Option Explicit

Private Const HOJA_KEY As String = "Consolidado(#)"
Private Const HOJA_IDX As String = "IDX"
Private Const HOJA_PEOPLE As String = "People"
Private Const HOJA_SC As String = "Vendor.Template(PO)"
Private Const HOJA_WEBI As String = "Webi creation"
Private Const HOJA_JVU As String = "JVU - Recharge"
Private Const HOJA_ACCRUAL As String = "Accrual"

Private resumen As Collection

Public Sub GenerarFormatosSAP()
    Dim keysTxt As String, opcion As String, carpeta As String
    Dim keys As Collection, k As Variant, i As Long
    Dim wsKey As Worksheet, wsIdx As Worksheet
    Dim keyOriginal As Variant, tipoOriginal As Variant
    Dim calcOriginal As Long, hechos As Long, saltados As Long, errores As Long
    Dim nombre As String, periodo As String, po As String

    ' --- Validar que el libro tenga las hojas esperadas
    If Not ExisteHoja(HOJA_KEY) Or Not ExisteHoja(HOJA_IDX) Or Not ExisteHoja(HOJA_PEOPLE) Or Not ExisteHoja(HOJA_WEBI) Then
        MsgBox "Este libro no parece Estimate Benefits: faltan las hojas " & HOJA_KEY & ", " & HOJA_IDX & ", " & HOJA_PEOPLE & " o " & HOJA_WEBI & ".", vbExclamation, "HRSS Automatizador"
        Exit Sub
    End If
    Set wsKey = ThisWorkbook.Worksheets(HOJA_KEY)
    Set wsIdx = ThisWorkbook.Worksheets(HOJA_IDX)

    ' --- 1) Qué KEY
    keysTxt = InputBox("¿Qué KEY quieres generar?" & vbCrLf & vbCrLf & _
        "Escribe TODOS, un rango o una lista. Ejemplos:" & vbCrLf & "   TODOS" & vbCrLf & "   1-10" & vbCrLf & "   2, 5, 21-25", "HRSS · Formatos SAP (1 de 3)", "TODOS")
    If Trim(keysTxt) = "" Then Exit Sub
    Set keys = LeerKeys(keysTxt)
    If keys.Count = 0 Then MsgBox "No encontré esos KEY en la hoja " & HOJA_PEOPLE & ".", vbExclamation, "HRSS Automatizador": Exit Sub

    ' --- 2) Qué formatos
    opcion = InputBox("¿Qué formatos generar?" & vbCrLf & vbCrLf & _
        "1 = Recharge: Shopping Cart + Webi" & vbCrLf & _
        "2 = JVU (solo KEY con RRBPO en People)" & vbCrLf & _
        "3 = Accrual" & vbCrLf & vbCrLf & _
        "Puedes combinar, por ejemplo 12 o 123." & vbCrLf & "Recuerda: JVU y Accrual llevan la fecha de hoy.", "HRSS · Formatos SAP (2 de 3)", "1")
    opcion = Replace(Replace(Trim(opcion), " ", ""), ",", "")
    If opcion = "" Then Exit Sub
    If opcion Like "*[!123]*" Then MsgBox "Escribe solo 1, 2 y/o 3.", vbExclamation, "HRSS Automatizador": Exit Sub

    ' --- 3) Carpeta del periodo (la que tendrá Webis, JVUs y Accruals)
    carpeta = ElegirCarpeta(ThisWorkbook.Path)
    If carpeta = "" Then Exit Sub
    If Right(carpeta, 1) <> "\" Then carpeta = carpeta & "\"

    If MsgBox("Se generarán " & keys.Count & " KEY en:" & vbCrLf & carpeta & vbCrLf & vbCrLf & _
        "Los archivos que ya existan con el mismo nombre se reemplazan." & vbCrLf & "¿Continuar?", vbQuestion + vbYesNo, "HRSS · Formatos SAP (3 de 3)") <> vbYes Then Exit Sub

    ' --- Preparar
    Set resumen = New Collection
    keyOriginal = wsKey.Range("A2").Value
    tipoOriginal = wsIdx.Range("B14").Value
    calcOriginal = Application.Calculation
    Application.ScreenUpdating = False
    Application.DisplayAlerts = False
    Application.EnableEvents = False
    Application.Calculation = xlCalculationAutomatic
    On Error GoTo Falla

    For Each k In keys
        i = i + 1
        Application.StatusBar = "HRSS · generando KEY " & k & " (" & i & " de " & keys.Count & ")…"
        DoEvents
        wsKey.Range("A2").Value = k
        Application.Calculate
        nombre = LimpiarNombre(CStr(wsKey.Range("C2").Value))
        If nombre = "" Then
            Anotar k, "", "", "", 0, "Saltado: el KEY no tiene nombre en Consolidado(#)"
            saltados = saltados + 1
            GoTo SiguienteKey
        End If

        ' Recharge: Shopping Cart + Webi
        If InStr(opcion, "1") > 0 Then
            PonerTipo wsIdx, "Recharge"
            If TotalWebi() <= 0 Then
                Anotar k, nombre, "Webi", "", 0, "Saltado: sin conceptos ni montos a recobrar"
                saltados = saltados + 1
            Else
                If ExisteHoja(HOJA_SC) Then
                    If Exportar(HOJA_SC, carpeta & "Webis\" & k & ". " & nombre & "\", k & ". SC " & nombre, False, False, k, nombre, "Shopping Cart") Then hechos = hechos + 1 Else errores = errores + 1
                End If
                If Exportar(HOJA_WEBI, carpeta & "Webis\" & k & ". " & nombre & "\", k & ". Webi " & nombre, True, True, k, nombre, "Webi") Then hechos = hechos + 1 Else errores = errores + 1
            End If
        End If

        ' JVU (solo si ya hay PO / RRB WBS en People)
        If InStr(opcion, "2") > 0 And ExisteHoja(HOJA_JVU) Then
            po = ValorPeople(k, "RRBPO")
            If po = "" Then
                Anotar k, nombre, "JVU", "", 0, "Saltado: sin RRBPO en People (el Recharge aún no está aprobado)"
                saltados = saltados + 1
            Else
                PonerTipo wsIdx, "Recharge"
                If Exportar(HOJA_JVU, carpeta & "JVUs\" & k & ". " & nombre & "\", k & ". JVU " & nombre, True, True, k, nombre, "JVU") Then hechos = hechos + 1 Else errores = errores + 1
            End If
        End If

        ' Accrual
        If InStr(opcion, "3") > 0 And ExisteHoja(HOJA_ACCRUAL) Then
            PonerTipo wsIdx, "Accrual"
            If Exportar(HOJA_ACCRUAL, carpeta & "Accruals\" & k & ". " & nombre & "\", k & ". Accrual " & nombre, True, True, k, nombre, "Accrual") Then hechos = hechos + 1 Else errores = errores + 1
        End If
SiguienteKey:
    Next k

Terminar:
    On Error Resume Next
    ' Regresar el libro como estaba
    wsKey.Range("A2").Value = keyOriginal
    wsIdx.Range("B14").Value = tipoOriginal
    Application.Calculate
    Application.Calculation = calcOriginal
    Application.StatusBar = False
    Application.EnableEvents = True
    Application.DisplayAlerts = True
    Application.ScreenUpdating = True
    GuardarResumen carpeta
    MsgBox "Listo." & vbCrLf & vbCrLf & _
        "Archivos generados: " & hechos & vbCrLf & _
        "Saltados: " & saltados & vbCrLf & _
        "Con error: " & errores & vbCrLf & vbCrLf & _
        "El detalle está en ""Resumen formatos SAP"" dentro de:" & vbCrLf & carpeta & vbCrLf & vbCrLf & _
        "Siguiente paso: arrastra la carpeta a la sección Bulk de HRSS Automatizador para revisar montos y TXT.", vbInformation, "HRSS Automatizador"
    Exit Sub

Falla:
    errores = errores + 1
    Anotar k, nombre, "", "", 0, "Error " & Err.Number & ": " & Err.Description
    Resume SiguienteKey
End Sub

'--- Copia la hoja a un libro nuevo (valores + formatos), limpia y guarda .xlsx (y .txt si se pide)
Private Function Exportar(hoja As String, ruta As String, archivo As String, conTxt As Boolean, limpiar As Boolean, k As Variant, nombre As String, formato As String) As Boolean
    Dim src As Worksheet, wb As Workbook, ws As Worksheet, origen As Range, monto As Double
    On Error GoTo FallaExport
    Set src = ThisWorkbook.Worksheets(hoja)
    Set origen = src.UsedRange
    CrearCarpeta ruta
    Set wb = Workbooks.Add(xlWBATWorksheet)
    Set ws = wb.Worksheets(1)
    ws.Name = Left(hoja, 31)
    origen.Copy
    ws.Range(origen.Cells(1, 1).Address).PasteSpecial Paste:=xlPasteValues
    ws.Range(origen.Cells(1, 1).Address).PasteSpecial Paste:=xlPasteFormats
    ws.Range(origen.Cells(1, 1).Address).PasteSpecial Paste:=xlPasteColumnWidths
    Application.CutCopyMode = False
    If limpiar Then QuitarVacios ws
    monto = MontoFormato(ws, formato)
    wb.SaveAs Filename:=ruta & archivo & ".xlsx", FileFormat:=xlOpenXMLWorkbook
    If conTxt Then wb.SaveAs Filename:=ruta & archivo & ".txt", FileFormat:=xlText
    wb.Close SaveChanges:=False
    Anotar k, nombre, formato, ruta & archivo & IIf(conTxt, ".xlsx + .txt", ".xlsx"), monto, "OK"
    Exportar = True
    Exit Function
FallaExport:
    Anotar k, nombre, formato, ruta & archivo, 0, "Error " & Err.Number & ": " & Err.Description
    On Error Resume Next
    If Not wb Is Nothing Then wb.Close SaveChanges:=False
    Application.CutCopyMode = False
    Exportar = False
End Function

'--- Quita celdas con texto vacío (""), filas vacías y columnas vacías al final (SAP rechaza líneas sin valores)
Private Sub QuitarVacios(ws As Worksheet)
    Dim r As Long, c As Long, ultimaFila As Long, ultimaCol As Long, celda As Range
    ultimaFila = ws.UsedRange.Row + ws.UsedRange.Rows.Count - 1
    ultimaCol = ws.UsedRange.Column + ws.UsedRange.Columns.Count - 1
    For Each celda In ws.Range(ws.Cells(1, 1), ws.Cells(ultimaFila, ultimaCol))
        If Not IsError(celda.Value) Then
            If Not IsEmpty(celda.Value) Then
                If Len(Trim(CStr(celda.Value))) = 0 Then celda.ClearContents
            End If
        End If
    Next celda
    For r = ultimaFila To 1 Step -1
        If Application.WorksheetFunction.CountA(ws.Rows(r)) = 0 Then ws.Rows(r).Delete
    Next r
    For c = ultimaCol To 1 Step -1
        If Application.WorksheetFunction.CountA(ws.Columns(c)) = 0 Then
            ws.Columns(c).Delete
        Else
            Exit For
        End If
    Next c
End Sub

'--- Monto para el resumen: Webi = suma de Amount; JVU/Accrual = partidas 50 (Post Key en C, Amount in DC en G)
Private Function MontoFormato(ws As Worksheet, formato As String) As Double
    Dim r As Long, ultima As Long, s As Double
    On Error Resume Next
    ultima = ws.UsedRange.Row + ws.UsedRange.Rows.Count - 1
    If formato = "Webi" Then
        For r = 2 To ultima
            If IsNumeric(ws.Cells(r, 3).Value) And Not IsEmpty(ws.Cells(r, 3).Value) Then s = s + CDbl(ws.Cells(r, 3).Value)
        Next r
    ElseIf formato = "JVU" Or formato = "Accrual" Then
        For r = 6 To ultima
            If CStr(ws.Cells(r, 3).Value) = "50" And IsNumeric(ws.Cells(r, 7).Value) Then s = s + CDbl(ws.Cells(r, 7).Value)
        Next r
    End If
    MontoFormato = Round(s, 2)
End Function

Private Function TotalWebi() As Double
    Dim ws As Worksheet, r As Long, s As Double
    Set ws = ThisWorkbook.Worksheets(HOJA_WEBI)
    For r = 2 To 40
        If IsNumeric(ws.Cells(r, 3).Value) And Not IsEmpty(ws.Cells(r, 3).Value) And CStr(ws.Cells(r, 3).Value) <> "" Then s = s + CDbl(ws.Cells(r, 3).Value)
    Next r
    TotalWebi = s
End Function

Private Sub PonerTipo(wsIdx As Worksheet, tipo As String)
    If CStr(wsIdx.Range("B14").Value) <> tipo Then
        wsIdx.Range("B14").Value = tipo
        Application.Calculate
    End If
End Sub

'--- KEY: TODOS, rangos y listas ("1-10, 15")
Private Function LeerKeys(txt As String) As Collection
    Dim todos As Collection, res As New Collection, partes() As String, p As Variant, a As Long, b As Long, x As Long, k As Variant
    Set todos = KeysPeople()
    If UCase(Trim(txt)) = "TODOS" Then Set LeerKeys = todos: Exit Function
    partes = Split(Replace(txt, ";", ","), ",")
    For Each p In partes
        p = Trim(p)
        If InStr(p, "-") > 0 Then
            a = Val(Split(p, "-")(0)): b = Val(Split(p, "-")(1))
            For x = a To b
                If EnColeccion(todos, x) Then AgregarUnico res, x
            Next x
        ElseIf p <> "" Then
            If EnColeccion(todos, Val(p)) Then AgregarUnico res, Val(p)
        End If
    Next p
    Set LeerKeys = res
End Function

Private Function KeysPeople() As Collection
    Dim ws As Worksheet, r As Long, ultima As Long, lista As New Collection, v As Variant
    Set ws = ThisWorkbook.Worksheets(HOJA_PEOPLE)
    ultima = ws.Cells(ws.Rows.Count, 1).End(xlUp).Row
    For r = 2 To ultima
        v = ws.Cells(r, 1).Value
        If IsNumeric(v) And Not IsEmpty(v) And CStr(v) <> "" Then AgregarUnico lista, CLng(v)
    Next r
    Set KeysPeople = Ordenar(lista)
End Function

Private Function ValorPeople(k As Variant, encabezado As String) As String
    Dim ws As Worksheet, col As Long, c As Long, f As Range
    Set ws = ThisWorkbook.Worksheets(HOJA_PEOPLE)
    For c = 1 To ws.UsedRange.Columns.Count
        If UCase(Trim(CStr(ws.Cells(1, c).Value))) = UCase(encabezado) Then col = c: Exit For
    Next c
    If col = 0 Then Exit Function
    Set f = ws.Columns(1).Find(What:=k, LookIn:=xlValues, LookAt:=xlWhole)
    If Not f Is Nothing Then ValorPeople = Trim(CStr(ws.Cells(f.Row, col).Value))
End Function

Private Sub AgregarUnico(col As Collection, v As Variant)
    If Not EnColeccion(col, v) Then col.Add v, CStr(v)
End Sub

Private Function EnColeccion(col As Collection, v As Variant) As Boolean
    Dim x As Variant
    On Error GoTo NoEsta
    x = col(CStr(v))
    EnColeccion = True
    Exit Function
NoEsta:
    EnColeccion = False
End Function

Private Function Ordenar(col As Collection) As Collection
    Dim arr() As Long, i As Long, j As Long, t As Long, res As New Collection
    If col.Count = 0 Then Set Ordenar = res: Exit Function
    ReDim arr(1 To col.Count)
    For i = 1 To col.Count: arr(i) = col(i): Next i
    For i = 1 To UBound(arr) - 1
        For j = i + 1 To UBound(arr)
            If arr(j) < arr(i) Then t = arr(i): arr(i) = arr(j): arr(j) = t
        Next j
    Next i
    For i = 1 To UBound(arr): res.Add arr(i), CStr(arr(i)): Next i
    Set Ordenar = res
End Function

Private Function ExisteHoja(nombre As String) As Boolean
    Dim ws As Worksheet
    On Error Resume Next
    Set ws = ThisWorkbook.Worksheets(nombre)
    ExisteHoja = Not ws Is Nothing
End Function

Private Function LimpiarNombre(s As String) As String
    Dim malos As Variant, m As Variant
    s = Trim(s)
    malos = Array("\", "/", ":", "*", "?", """", "<", ">", "|")
    For Each m In malos: s = Replace(s, m, "-"): Next m
    Do While InStr(s, "  ") > 0: s = Replace(s, "  ", " "): Loop
    LimpiarNombre = s
End Function

Private Function ElegirCarpeta(inicial As String) As String
    Dim fd As Object
    Set fd = Application.FileDialog(4) ' msoFileDialogFolderPicker
    fd.Title = "Elige la carpeta del periodo (ej. ...\Tracker\Recharges\H1'26) donde van Webis, JVUs y Accruals"
    If inicial <> "" And Left(inicial, 4) <> "http" Then fd.InitialFileName = inicial & "\"
    If fd.Show = -1 Then ElegirCarpeta = fd.SelectedItems(1)
End Function

'--- Crea la carpeta y las intermedias que falten
Private Sub CrearCarpeta(ruta As String)
    Dim partes() As String, i As Long, acumulada As String
    partes = Split(ruta, "\")
    acumulada = partes(0)
    For i = 1 To UBound(partes)
        If partes(i) <> "" Then
            acumulada = acumulada & "\" & partes(i)
            If Dir(acumulada, vbDirectory) = "" Then MkDir acumulada
        End If
    Next i
End Sub

Private Sub Anotar(k As Variant, nombre As String, formato As String, archivo As String, monto As Double, estado As String)
    If resumen Is Nothing Then Set resumen = New Collection
    resumen.Add Array(k, nombre, formato, archivo, monto, estado)
End Sub

Private Sub GuardarResumen(carpeta As String)
    Dim wb As Workbook, ws As Worksheet, i As Long, fila As Variant
    On Error Resume Next
    If resumen Is Nothing Then Exit Sub
    Set wb = Workbooks.Add(xlWBATWorksheet)
    Set ws = wb.Worksheets(1)
    ws.Name = "Resumen"
    ws.Range("A1:F1").Value = Array("KEY", "Nombre", "Formato", "Archivo", "Monto", "Estado")
    ws.Range("A1:F1").Font.Bold = True
    For i = 1 To resumen.Count
        fila = resumen(i)
        ws.Cells(i + 1, 1).Resize(1, 6).Value = fila
        If fila(5) <> "OK" Then ws.Cells(i + 1, 6).Interior.Color = RGB(255, 235, 156)
    Next i
    ws.Columns("E").NumberFormat = "#,##0.00"
    ws.Columns("A:F").AutoFit
    wb.SaveAs Filename:=carpeta & "Resumen formatos SAP " & Format(Now, "yyyy-mm-dd hhmm") & ".xlsx", FileFormat:=xlOpenXMLWorkbook
    wb.Close SaveChanges:=False
End Sub
