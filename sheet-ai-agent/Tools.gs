/**
 * Tools.gs — kisi bhi sheet ke liye general tools
 * (aapki apni banayi hui sheets par bhi kaam karte hain)
 */

const MAX_ROWS_READ = 300; // AI ko ek baar mein kitni rows dikhani hain

function sheetTools_() {
  return [
    {
      name: 'list_sheets',
      description: 'List all sheets (tabs) with row and column counts.',
      params: {},
      run: function () {
        return getSpreadsheet_().getSheets().map(function (s) {
          return { name: s.getName(), rows: s.getLastRow(), columns: s.getLastColumn() };
        });
      },
    },
    {
      name: 'read_sheet',
      description: 'Read values from any sheet. Without range it reads all data. Row 1 is usually headers.',
      params: {
        sheet: { type: 'string' },
        range: { type: 'string', description: 'Optional A1 range like "A1:D20"' },
      },
      required: ['sheet'],
      run: function (a) {
        const sh = getSheet_(a.sheet);
        const range = a.range ? sh.getRange(a.range) : sh.getDataRange();
        const values = range.getDisplayValues();
        return {
          range: range.getA1Notation(),
          rows: values.slice(0, MAX_ROWS_READ),
          note: values.length > MAX_ROWS_READ ? 'Only first ' + MAX_ROWS_READ + ' rows shown. Read a smaller range.' : undefined,
        };
      },
    },
    {
      name: 'search_rows',
      description: 'Find rows in a sheet that contain some text (not case-sensitive). Returns row numbers.',
      params: { sheet: { type: 'string' }, text: { type: 'string' } },
      required: ['sheet', 'text'],
      run: function (a) {
        const values = getSheet_(a.sheet).getDataRange().getDisplayValues();
        const needle = String(a.text).toLowerCase();
        const matches = [];
        values.forEach(function (row, i) {
          if (row.join(' ').toLowerCase().indexOf(needle) !== -1) matches.push({ row: i + 1, values: row });
        });
        return { headers: values[0], total: matches.length, matches: matches.slice(0, 100) };
      },
    },
    {
      name: 'append_row',
      description: 'Add one row at the bottom of any sheet.',
      params: { sheet: { type: 'string' }, values: { type: 'array', items: { type: 'string' } } },
      required: ['sheet', 'values'],
      run: function (a) {
        const sh = getSheet_(a.sheet);
        sh.appendRow(a.values);
        log_('Row added', a.sheet + ' | ' + a.values.join(', '));
        return { ok: true, row: sh.getLastRow() };
      },
    },
    {
      name: 'write_cells',
      description: 'Write a block of values starting at a cell. Formulas like "=SUM(B2:B9)" are allowed.',
      params: {
        sheet: { type: 'string' },
        start_cell: { type: 'string', description: 'Top-left cell, e.g. "B2"' },
        values: { type: 'array', items: { type: 'array', items: { type: 'string' } } },
      },
      required: ['sheet', 'start_cell', 'values'],
      run: function (a) {
        const width = Math.max.apply(null, a.values.map(function (r) { return r.length; }));
        const rows = a.values.map(function (r) { return r.concat(new Array(width - r.length).fill('')); });
        const range = getSheet_(a.sheet).getRange(a.start_cell).offset(0, 0, rows.length, width);
        range.setValues(rows);
        log_('Cells written', a.sheet + '!' + range.getA1Notation());
        return { ok: true, range: range.getA1Notation() };
      },
    },
    {
      name: 'create_sheet',
      description: 'Create a new sheet (tab), optionally with a header row.',
      params: { name: { type: 'string' }, headers: { type: 'array', items: { type: 'string' } } },
      required: ['name'],
      run: function (a) {
        const sh = getSpreadsheet_().insertSheet(a.name);
        if (a.headers && a.headers.length) styleHeader_(sh, a.headers);
        log_('Sheet created', a.name);
        return { ok: true, name: a.name };
      },
    },
    {
      name: 'delete_row',
      description: 'Delete one row by row number. Only after the owner confirms.',
      params: { sheet: { type: 'string' }, row: { type: 'integer' } },
      required: ['sheet', 'row'],
      run: function (a) {
        const sh = getSheet_(a.sheet);
        const old = sh.getRange(a.row, 1, 1, sh.getLastColumn()).getDisplayValues()[0];
        sh.deleteRow(a.row);
        log_('Row deleted', a.sheet + ' row ' + a.row + ' | ' + old.join(', '));
        return { ok: true, deleted: old };
      },
    },
  ];
}

/** Header row likh ke bold + freeze karna */
function styleHeader_(sheet, headers) {
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#eef0ff');
  sheet.setFrozenRows(1);
}
