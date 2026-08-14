import pdfFonts from "./pdfFonts";

describe("pdfFonts (embedded Geist vfs)", () => {
  it("exposes the four font weights as base64", () => {
    expect(Object.keys(pdfFonts).sort()).toEqual([
      "Geist-Bold",
      "Geist-Regular",
      "GeistMono-Bold",
      "GeistMono-Regular",
    ]);
  });
  it.each(["Geist-Regular", "Geist-Bold", "GeistMono-Regular", "GeistMono-Bold"])(
    "%s is a non-trivial base64 blob",
    (name) => {
      expect(pdfFonts[name]).toEqual(expect.any(String));
      expect(pdfFonts[name].length).toBeGreaterThan(100000);
    },
  );
});
