export type ShippingProviderStatus = "ready" | "missing_credentials" | "disabled";

export type StoreShippingConfig = {
  originCep: string;
  senderCnpj: string;
  pickup: { enabled: boolean; name: string; address: string; instructions: string };
  correios: {
    enabled: boolean;
    apiBaseUrl: string;
    usuario: string;
    codigoAcesso: string;
    cartaoPostagem: string;
    contrato: string;
    dr: string;
    serviceCodes: string[];
  };
  jamef: {
    enabled: boolean;
    environment: "sandbox" | "production";
    apiBaseUrl: string;
    username: string;
    password: string;
    originBranch: { name: string; cnpj: string; cep: string; address: string; district: string; city: string; state: string };
  };
};

const digits = (value: string) => value.replace(/\D/g, "");

export function storeShippingConfig(env: NodeJS.ProcessEnv = process.env): StoreShippingConfig {
  return {
    originCep: digits(env["SHIPPING_ORIGIN_CEP"] ?? "88313000"),
    senderCnpj: digits(env["SHIPPING_SENDER_CNPJ"] ?? "05502390000200"),
    pickup: {
      enabled: env["PICKUP_ENABLED"] !== "false",
      name: env["PICKUP_NAME"] ?? "Armazém Sanco",
      address: env["PICKUP_ADDRESS"] ?? "",
      instructions: env["PICKUP_INSTRUCTIONS"] ?? "",
    },
    correios: {
      enabled: env["CORREIOS_ENABLED"] === "true",
      apiBaseUrl: (env["CORREIOS_API_BASE_URL"] ?? "https://api.correios.com.br").replace(/\/$/, ""),
      usuario: env["CORREIOS_USUARIO"] ?? "",
      codigoAcesso: env["CORREIOS_CODIGO_ACESSO"] ?? "",
      cartaoPostagem: digits(env["CORREIOS_CARTAO_POSTAGEM"] ?? ""),
      contrato: digits(env["CORREIOS_CONTRATO"] ?? ""),
      dr: digits(env["CORREIOS_DR"] ?? ""),
      serviceCodes: (env["CORREIOS_SERVICE_CODES"] ?? "").split(",").map((code) => code.trim()).filter(Boolean),
    },
    jamef: {
      enabled: env["JAMEF_ENABLED"] === "true",
      environment: env["JAMEF_ENVIRONMENT"] === "production" ? "production" : "sandbox",
      apiBaseUrl: (env["JAMEF_API_BASE_URL"] ?? "").replace(/\/$/, ""),
      username: env["JAMEF_USERNAME"] ?? "",
      password: env["JAMEF_PASSWORD"] ?? "",
      originBranch: {
        name: "Itajaí", cnpj: "20147617005615", cep: "88318112",
        address: "Rodovia Antônio Heil, 6250, KM 06, Galpão B, Blocos 29 e 30",
        district: "Itaipava", city: "Itajaí", state: "SC",
      },
    },
  };
}

export function shippingProviderStatus(config: StoreShippingConfig) {
  const correiosReady = config.correios.enabled
    && Boolean(config.correios.usuario && config.correios.codigoAcesso && config.correios.cartaoPostagem && config.correios.contrato && config.correios.dr && config.correios.serviceCodes.length);
  const jamefReady = config.jamef.enabled
    && config.jamef.environment === "sandbox"
    && Boolean(config.jamef.apiBaseUrl && config.jamef.username && config.jamef.password);
  return {
    pickup: config.pickup.enabled ? "ready" as const : "disabled" as const,
    correios: !config.correios.enabled ? "disabled" as const : correiosReady ? "ready" as const : "missing_credentials" as const,
    jamef: !config.jamef.enabled ? "disabled" as const : jamefReady ? "ready" as const : "missing_credentials" as const,
  };
}
