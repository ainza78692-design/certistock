import * as XLSX from "xlsx";

/**
 * Utility to export an array of JSON objects to an Excel (XLSX) file.
 *
 * @param filename The desired output filename without the extension (e.g. "StockLots").
 * @param data Array of objects to be converted to rows.
 */
export function exportToXlsx(filename: string, data: any[]) {
  if (!data || !data.length) return;

  // Create a new workbook
  const wb = XLSX.utils.book_new();

  // Convert the array of JSON objects to a worksheet
  const ws = XLSX.utils.json_to_sheet(data);

  // Auto-size columns slightly
  const range = XLSX.utils.decode_range(ws["!ref"] || "");
  const cols = [];
  for (let C = range.s.c; C <= range.e.c; ++C) {
    let max = 10; // min width
    for (let R = range.s.r; R <= range.e.r; ++R) {
      const cell = ws[XLSX.utils.encode_cell({ c: C, r: R })];
      if (cell && cell.v) {
        const len = String(cell.v).length;
        if (len > max) max = len;
      }
    }
    cols[C] = { wch: Math.min(max + 2, 50) }; // max width 50
  }
  ws["!cols"] = cols;

  // Append the worksheet to the workbook
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");

  // Trigger the download
  XLSX.writeFile(wb, `${filename}.xlsx`);
}
