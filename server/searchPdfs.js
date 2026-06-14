import fs from "node:fs/promises";
import path from "node:path";
import { getDocumentProxy, extractText } from "unpdf";

const folderPath = "D:\\CertiStock-Office-Package\\test pdfs";
const targets = [
  "24183000158686", 
  "24183000157701",
  "AT1517/25-26", 
  "JKSR/25-26/08728", 
  "AT0216", 
  "OD/2025000706", 
  "SY008"
];

async function run() {
  const files = await fs.readdir(folderPath);
  const pdfFiles = files.filter(f => f.toLowerCase().endsWith('.pdf'));

  const results = {};
  targets.forEach(t => results[t] = []);

  for (const file of pdfFiles) {
    try {
      const bytes = await fs.readFile(path.join(folderPath, file));
      const pdf = await getDocumentProxy(new Uint8Array(bytes));
      const { text } = await extractText(pdf, { mergePages: true });

      for (const t of targets) {
        if (text && text.includes(t)) {
          results[t].push(file);
        }
      }
    } catch(e) {
      console.error(file, e.message);
    }
  }

  console.log(results);
}
run();
