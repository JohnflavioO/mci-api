export type ShippingProviderStatus = "ready" | "missing_credentials" | "disabled";

export type StoreShippingConfig = {
  originCep: string;
  senderCnpj: string;
  pickup: {
    enabled: boolean;
    name: string;
    address: string;
    instructions: string;
  };
  correios: {
    enabled: boolean;
    apiBaseUrl: string;
    token: string;
    serviceCodes: string[];
    contractNumber: string;
    contractDr: string;
  };
  jamef: {
    enabled: boolean;
    environment: "sandbox" | "production";
    apiBaseUrl: string;
    username: string;
    password: string;
  };
};

const digits = (value: string) => value.replace(/\D/g, "");

export function storeShippingConfig(env: NodeJS.ProcessEnv = process.env): StoreShippingConfig {
  const jamefEnvironment = env["JAMEF_ENVIRONMENT"] === "production" ? "production" : "sandbox";
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
      token: env["CORREIOS_TOKEN"] ?? "",
      serviceCodes: (env["CORREIOS_SERVICE_CODES"] ?? "").split(",").map((code) => code.trim()).filter(Boolean),
      contractNumber: env["CORREIOS_CONTRACT_NUMBER"] ?? "",
      contractDr: env["CORREIOS_CONTRACT_DR"] ?? "",
    },
    jamef: {
      enabled: env["JAMEF_ENABLED"] === "true",
      environment: jamefEnvironment,
      apiBaseUrl: (env["JAMEF_API_BASE_URL"] ?? "").replace(/\/$/, ""),
      username: env["JAMEF_USERNAME"] ?? "",
      password: env["JAMEF_PASSWORD"] ?? "",
    },
  };
}

export function shippingProviderStatus(config: StoreShippingConfig) {
  const correiosReady = config.correios.enabled
    && Boolean(config.correios.token)
    && config.correios.serviceCodes.length > 0;
  const jamefReady = config.jamef.enabled
    && Boolean(config.jamef.apiBaseUrl && config.jamef.username && config.jamef.password);
  return {
    pickup: config.pickup.enabled ? "ready" as const : "disabled" as const,
    correios: !config.correios.enabled ? "disabled" as const : correiosReady ? "ready" as const : "missing_credentials" as const,
    jamef: !config.jamef.enabled ? "disabled" as const : jamefReady ? "ready" as const : "missing_credentials" as const,
  };
}
