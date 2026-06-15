import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { extractText, getDocumentProxy } from "unpdf";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_DIR = path.resolve(__dirname, '..', '..', 'certistock testing');

const firstMatch = (text, patterns) => {
  for (const pattern of patterns) {
    const m = text.match(pattern);
    if (m && m[1]) return m[1].replace(/\s+/g, ' ').trim();
  }
  return null;
};

const cleanInvoiceReference = (value) => {
  if (!value) return null;
  const cleaned = value
    .replace(/\s+/g, ' ')
    .replace(/^(?:Invoice References?|Invoice No\.?)\s*[:\-]?\s*/i, '')
    .replace(/\s+(?:Consignee(?:\s+name\s+and\s+address|\s+Name)?|TE-ID|Shipment No\.?|Shipment Date|Gross Shipping Weight)\b.*$/i, '')
    .trim();
  const token = cleaned.match(/\b[A-Z0-9][A-Z0-9/.\-]{4,}[A-Z0-9](?:\s*\(\s*\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}\s*\))?/i)?.[0];
  return token || cleaned || null;
};

const extractInvoiceFromBlock = (text) => {
  return cleanInvoiceReference(firstMatch(text, [
    /Invoice References?\s*[:\-]?\s*(.+?)(?:\s+Shipment No\.?|\s+Transaction Certificate Number|\s+10\.?\s*Certified Products|$)/i,
    /([A-Z0-9\/\.\-]{6,})(?:\s*\(\s*\d{4}[\/\-\s]\d{1,2}[\/\-\s]\d{1,2}\s*\))?(?=\s+(?:Consignee|Consignee Name|TE-ID|Shipment No\.?|$))/i,
    /Invoice No\.?\s*[:\-]?\s*(.+?)(?:\s+Consignee|\s+Shipment No\.?|$)/i,
  ]));
};

const tcRegexes = [
  /Transaction Certificate Number\s*[:\-]?\s*([A-Z]{2,4}(?:-[A-Z]+)*[- ]?[A-Z]?[- ]?\d{2,7}[- ]?\d{4,8})/i,
  /\b((?:IDF|IDFL|CUI|ITS)(?:-[A-Z]+)*[- ]?[A-Z]?[- ]?\d{2,7}[- ]?\d{4,8})\b/i,
];

async function processFile(filePath) {
  const data = fs.readFileSync(filePath);
  let text = '';
  try {
    const doc = await getDocumentProxy(new Uint8Array(data));
    const res = await extractText(doc, { mergePages: true });
    text = (res.text || '').replace(/\s+/g, ' ').trim();
  } catch (err) {
    console.error('Failed to parse PDF', filePath, err.message || err);
    return;
  }

  const tcNumber = firstMatch(text, tcRegexes) || null;

  // attempt to find invoice-like tokens near 'Consignee' or in the document
  const invoice = extractInvoiceFromBlock(text) || null;

  console.log('---');
  console.log('File:', path.relative(process.cwd(), filePath));
  console.log('TC number:', tcNumber);
  console.log('Invoice detected:', invoice);
}

async function main() {
  const args = process.argv.slice(2);
  let files = [];
  if (args.length) {
    files = args.map(a => path.resolve(a));
  } else {
    // process all PDFs in test dir
    files = fs.readdirSync(TEST_DIR).filter(f => f.toLowerCase().endsWith('.pdf')).map(f => path.join(TEST_DIR, f));
  }

  for (const f of files) {
    if (!fs.existsSync(f)) {
      console.warn('Not found:', f);
      continue;
    }
    await processFile(f);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
