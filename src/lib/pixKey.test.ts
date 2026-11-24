import { describe, expect, it } from "vitest";
import { maskPixKey, normalizePixKey, payoutError } from "./pixKey";

describe("normalizePixKey", () => {
  it("aceita CPF e CNPJ válidos, com ou sem pontuação", () => {
    expect(normalizePixKey("529.982.247-25")).toEqual({ ok: true, key: "52998224725", type: "cpf" });
    expect(normalizePixKey("11.222.333/0001-81")).toEqual({ ok: true, key: "11222333000181", type: "cnpj" });
  });
  it("recusa CPF com dígito errado ou repetido", () => {
    expect(normalizePixKey("529.982.247-26").ok).toBe(false);
    expect(normalizePixKey("111.111.111-11").ok).toBe(false);
  });
  it("aceita e-mail, celular e chave aleatória", () => {
    expect(normalizePixKey(" Pessoa@Exemplo.com ")).toEqual({ ok: true, key: "pessoa@exemplo.com", type: "email" });
    expect(normalizePixKey("+55 (11) 98765-4321")).toEqual({ ok: true, key: "+5511987654321", type: "phone" });
    expect(normalizePixKey("11987654321")).toEqual({ ok: true, key: "+5511987654321", type: "phone" });
    expect(normalizePixKey("123E4567-E89B-12D3-A456-426614174000")).toEqual({ ok: true, key: "123e4567-e89b-12d3-a456-426614174000", type: "random" });
  });
  it("recusa vazio e formatos desconhecidos", () => {
    expect(normalizePixKey("").ok).toBe(false);
    expect(normalizePixKey(null).ok).toBe(false);
    expect(normalizePixKey("abc").ok).toBe(false);
    expect(normalizePixKey("pessoa@").ok).toBe(false);
  });
});

describe("helpers", () => {
  it("mascara a chave", () => expect(maskPixKey("pessoa@exemplo.com")).toBe("pes…com"));
  it("traduz erros do banco", () => {
    expect(payoutError('AFF_BELOW_MINIMUM')?.status).toBe(400);
    expect(payoutError("erro qualquer")).toBeNull();
  });
});
