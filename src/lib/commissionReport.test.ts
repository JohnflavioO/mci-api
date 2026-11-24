import { describe, expect, it } from "vitest";
import { commissionStage, toCsv } from "./commissionReport";

const base = { status: "pending", payout_id: null, reversed_at: null, payout_status: null };

describe("commissionStage", () => {
  it("segue o ciclo em liberação -> disponível -> em saque -> paga", () => {
    expect(commissionStage(base)).toBe("pending");
    expect(commissionStage({ ...base, status: "available" })).toBe("available");
    expect(commissionStage({ ...base, status: "available", payout_id: "p", payout_status: "requested" })).toBe("in_payout");
    expect(commissionStage({ ...base, status: "available", payout_id: "p", payout_status: "rejected" })).toBe("available");
    expect(commissionStage({ ...base, status: "paid", payout_id: "p" })).toBe("paid");
  });
  it("separa estorno antes e depois do saque", () => {
    expect(commissionStage({ ...base, status: "reversed", reversed_at: "2026-11-27" })).toBe("reversed");
    expect(commissionStage({ ...base, status: "paid", payout_id: "p", reversed_at: "2026-11-27" })).toBe("reversed_after_payout");
  });
});

describe("toCsv", () => {
  it("usa ponto e vírgula, vírgula decimal e neutraliza fórmulas", () => {
    const csv = toCsv(["Afiliado", "Valor"], [["=HYPERLINK(1)", 12.5], ['Ana "A"; B', 3]]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain("'=HYPERLINK(1);12,50");
    expect(csv).toContain('"Ana ""A""; B";3,00');
  });
});
