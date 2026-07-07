import { describe, expect, it } from "vitest";
import { cleanCompositionForMassBalance } from "./productName.js";

describe("cleanCompositionForMassBalance", () => {
  it("removes only a leading uploaded Excel code", () => {
    expect(cleanCompositionForMassBalance("2616 65% RECYCLE POLYESTER DYED FABRIC"))
      .toBe("65% RECYCLE POLYESTER DYED FABRIC");
    expect(cleanCompositionForMassBalance("3914 100% Recycled Post-Consumer Polyester"))
      .toBe("100% Recycled Post-Consumer Polyester");
  });

  it("preserves manual percentage composition text", () => {
    expect(cleanCompositionForMassBalance("100% Recycled Post-Consumer Polyester"))
      .toBe("100% Recycled Post-Consumer Polyester");
  });

  it("does not replace outward composition with inward product names", () => {
    expect(cleanCompositionForMassBalance("Greige Yarns (PC0030) - Filament (PD0069) - 100% Recycled Post-Consumer Polyester (RM0189)"))
      .toBe("Greige Yarns (PC0030) - Filament (PD0069) - 100% Recycled Post-Consumer Polyester (RM0189)");
  });
});