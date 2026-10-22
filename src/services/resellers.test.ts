import { describe, expect, it } from "vitest";
import { checkReview } from "./resellers";

describe("revisão de revendedor", () => {
  it("bloqueia aprovação sem confirmar documentos", () => expect(checkReview("aprovar", "", false)).not.toBeNull());
  it("permite aprovação com documentos confirmados", () => expect(checkReview("aprovar", "", true)).toBeNull());
  it("exige justificativa para rejeitar", () => expect(checkReview("rejeitar", "  ", true)).not.toBeNull());
  it("exige justificativa para pedir documentação", () => expect(checkReview("solicitar_documentos", "ok", false)).not.toBeNull());
  it("aceita rejeição justificada", () => expect(checkReview("rejeitar", "CNPJ inapto", false)).toBeNull());
});

import { validateReseller } from "./index";
const ok = { "Razão social": "Empresa X", CNPJ: "11.222.333/0001-81", UF: "SP", "Inscrição Estadual": "110.042.490.114", "Responsável": "Ana", Telefone: "(11) 98888-7777" };
describe("formulário de revendedor", () => {
  it("aceita dados válidos", () => expect(validateReseller(ok)).toBeNull());
  it("rejeita CNPJ inválido", () => expect(validateReseller({ ...ok, CNPJ: "11222333000182" })).toBe("CNPJ inválido."));
  it("rejeita IE de outra UF", () => expect(validateReseller({ ...ok, UF: "RJ" })).toContain("RJ"));
});
