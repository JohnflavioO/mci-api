import { describe, expect, it } from "vitest";
import { isValidCnpj, isValidIe } from "./br-docs";

describe("CNPJ", () => {
  it("aceita CNPJ com dígitos corretos", () => expect(isValidCnpj("11.222.333/0001-81")).toBe(true));
  it("rejeita dígito errado", () => expect(isValidCnpj("11.222.333/0001-82")).toBe(false));
  it("rejeita sequência repetida", () => expect(isValidCnpj("00000000000000")).toBe(false));
});

describe("Inscrição Estadual por UF", () => {
  it.each([
    ["SP", "110.042.490.114"],
    ["MG", "062.307.904/0081"],
    ["PR", "123.45678-50"],
    ["RS", "224/3658792"],
    ["BA", "123456-63"],
    ["AC", "01.004.823/001-12"],
  ])("%s %s é válida", (uf, ie) => expect(isValidIe(ie, uf)).toBe(true));

  it("rejeita IE válida de SP informada para outra UF", () => expect(isValidIe("110042490114", "RJ")).toBe(false));
  it("rejeita dígito errado", () => expect(isValidIe("110042490115", "SP")).toBe(false));
  it("aceita ISENTO", () => expect(isValidIe("isento", "SP")).toBe(true));
});
