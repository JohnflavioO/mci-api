import { describe, expect, it } from "vitest";
import { deliveryLabel, shippingOptionLabel } from "./ShippingEstimate";

describe("shippingOptionLabel", () => {
  it("junta transportadora e serviço sem o ponto inicial do provedor", () => {
    expect(shippingOptionLabel({ provider: "Jadlog", service: ".Package" })).toBe("Jadlog Package");
  });
  it("não repete a transportadora quando ela já está no serviço", () => {
    expect(shippingOptionLabel({ provider: "Correios", service: "Correios SEDEX" })).toBe("Correios SEDEX");
  });
  it("nomeia a retirada no local", () => {
    expect(shippingOptionLabel({ provider: "pickup", service: "Retirada no local" })).toBe("Retirada no local");
  });
});

describe("deliveryLabel", () => {
  it("formata o prazo em dias úteis", () => {
    expect(deliveryLabel(1)).toBe("Chega em até 1 dia útil");
    expect(deliveryLabel(6)).toBe("Chega em até 6 dias úteis");
    expect(deliveryLabel(null)).toBeNull();
  });
});
