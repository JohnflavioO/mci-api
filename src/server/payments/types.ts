/** Contrato independente do provedor. Só roda no servidor. */
export type NormalizedStatus = "pending" | "paid" | "failed" | "canceled" | "refunded" | "chargedback";

export interface ChargeSnapshot {
  chargeId: string;
  /** ID do pedido MCI enviado ao provedor como código do pedido. */
  orderId: string | null;
  status: NormalizedStatus | null;
  /** Valor em reais (o provedor usa centavos; o adaptador converte). */
  amount: number;
}

export interface PaymentProvider {
  name: string;
  /** Consulta o estado REAL da cobrança na API do provedor. */
  getCharge(chargeId: string): Promise<ChargeSnapshot>;
  /** Pede o estorno com chave de idempotência fixa; não confirma nada. */
  requestRefund(chargeId: string, idempotencyKey: string): Promise<void>;
}

/** Funções da migração 0005, chamadas com a chave privada do banco (service_role). */
export interface OrdersDb {
  applyPaymentStatus(a: {
    orderId: string; provider: string; chargeId: string; status: NormalizedStatus; eventId: string; amount: number;
  }): Promise<string>;
  claimRefund(leaseSeconds: number): Promise<{ orderId: string; chargeId: string; idempotencyKey: string; attempt: number } | null>;
  recordRefundFailure(orderId: string, error: string): Promise<void>;
}
