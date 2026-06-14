import fs from "node:fs/promises";
import path from "node:path";
import { getDocumentProxy, extractText } from "unpdf";
import { parseSimpleTcExtraction } from "./src/extraction/simpleParser.js";

async function analyzePdfs(folderPath) {
  try {
    const files = await fs.readdir(folderPath);
    const pdfFiles = files.filter(f => f.toLowerCase().endsWith('.pdf'));

    if (pdfFiles.length === 0) {
      console.log(`No PDFs found in ${folderPath}`);
      return;
    }

    console.log(`Found ${pdfFiles.length} PDFs. Analyzing...\n`);

    const unmappedPatterns = new Set();
    let totalProducts = 0;
    let totalUnmapped = 0;

    for (const file of pdfFiles) {
      const filePath = path.join(folderPath, file);
      try {
        const bytes = await fs.readFile(filePath);
        const pdf = await getDocumentProxy(new Uint8Array(bytes));
        const { text } = await extractText(pdf, { mergePages: true });

        if (!text) continue;

        const extracted = parseSimpleTcExtraction(text);
        
        extracted.products.forEach(p => {
          totalProducts++;
          if (p.needs_manual_review) {
            totalUnmapped++;
            const searchString = [
              p.article_no, 
              p.yarn_count_raw, 
              p.additional_info_raw, 
              p.product_category, 
              p.product_detail
            ].filter(Boolean).join(" ");
            unmappedPatterns.add(searchString);
            
            console.log(`[UNMAPPED in ${file}]`);
            console.log(`  Article: ${p.article_no || 'N/A'}`);
            console.log(`  Yarn/Info: ${p.yarn_count_raw || p.additional_info_raw || 'N/A'}`);
            console.log(`  Category: ${p.product_category || 'N/A'}`);
            console.log(`  Detail: ${p.product_detail || 'N/A'}\n`);
          }
        });
      } catch (err) {
        console.error(`Failed to process ${file}:`, err.message);
      }
    }

    console.log(`\n--- SUMMARY ---`);
    console.log(`Total Products Found: ${totalProducts}`);
    console.log(`Unmapped Products: ${totalUnmapped}`);
    console.log(`\nUnique unmapped search strings to support:`);
    unmappedPatterns.forEach(p => console.log(`- ${p}`));

  } catch (error) {
    console.error("Error analyzing PDFs:", error);
  }
}

const targetFolder = "D:\\CertiStock-Office-Package\\test pdfs";
analyzePdfs(targetFolder);
