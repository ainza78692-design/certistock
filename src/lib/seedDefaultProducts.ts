import { supabase } from "@/integrations/supabase/client";

const DEFAULT_PRODUCTS = [
  { key: "50D", name: "50 Denier", family: "DRWY", aliases: ["50 DENIER", "50 DENIER SD DRWY YARN", "50 DENIER SD DRAW YARN", "SD5048FDY", "AFL99906", "0050/048/RFDY", "50/45 RSD RFDY"] },
  { key: "70D", name: "70 Denier", family: "DRAW YARN", aliases: ["70 DENIER", "70 DENIER SD DRAW YARN", "SD7072FDY"] },
  { key: "75/72", name: "75/72", family: "DTY", aliases: ["75/72", "75/72 SD ROTO DTY R-PET", "SD7572ROTO", "AFL99909"] },
  { key: "150D", name: "150 Denier", family: "FDY", aliases: ["150 DENIER", "150 DENIER SD DRAW YARN", "SD15048FDY", "AFL99916"] },
  { key: "150/48", name: "150/48", family: "FDY", aliases: ["150/48", "150/48 SD FDY RECL", "LBSRSD0138"] },
  { key: "30D", name: "30 Denier", family: "DRWY", aliases: ["30 DENIER", "30 DENIER SD DRWY YARN", "3000SD"] },
  { key: "20/1", name: "20/1", family: "DTY", aliases: ["20/1", "20/1 SD DTY R-PET"] },
];

export const seedDefaultProducts = async (companyId: string) => {
  for (const product of DEFAULT_PRODUCTS) {
    const { data: existing } = await supabase
      .from("product_master")
      .select("id")
      .eq("company_id", companyId)
      .eq("normalized_key", product.key)
      .maybeSingle();

    const productMasterId = existing?.id ?? (await supabase
      .from("product_master")
      .insert({
        company_id: companyId,
        normalized_key: product.key,
        display_name: product.name,
        product_family: product.family,
      })
      .select("id")
      .single()).data?.id;

    if (!productMasterId) continue;

    for (const alias of product.aliases) {
      const { data: existingAlias } = await supabase
        .from("product_aliases")
        .select("id")
        .eq("company_id", companyId)
        .eq("product_master_id", productMasterId)
        .ilike("alias_text", alias)
        .maybeSingle();

      if (!existingAlias) {
        await supabase.from("product_aliases").insert({
          company_id: companyId,
          product_master_id: productMasterId,
          alias_text: alias,
        });
      }
    }
  }
};
