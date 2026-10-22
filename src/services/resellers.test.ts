import { describe, expect, it } from "vitest";
import { checkReview } from "./resellers";

describe("revisão de revendedor", () => {
  it("bloqueia aprovação sem confirmar documentos", () => expect(checkReview("aprovar", "", false)).not.toBeNull());
  it("permite aprovação com documentos confirmados", () => expect(checkReview("aprovar", "", true)).toBeNull());
  it("exige justificativa para rejeitar", () => expect(checkReview("rejeitar", "  ", true)).not.toBeNull());
  it("exige justificativa para pedir documentação", () => expect(checkReview("solicitar_documentos", "ok", false)).not.toBeNull());
  it("aceita rejeição justificada", () => expect(checkReview("rejeitar", "CNPJ inapto", false)).toBeNull());
});
