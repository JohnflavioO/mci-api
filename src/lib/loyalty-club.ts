import type { LoyaltySettings } from "./loyalty";

export type ClubAudience = "customer" | "reseller";
export type ClubRules = LoyaltySettings & {
  discount_enabled: boolean;
  gifts_enabled: boolean;
};
export type ClubConfiguration = Record<ClubAudience, ClubRules>;

/** Compatibility foundation only; not yet used to authorize transactions. */
export function initialClubConfiguration(current: LoyaltySettings): ClubConfiguration {
  return {
    customer: { ...current, discount_enabled: true, gifts_enabled: false },
    reseller: { ...current, enabled: false, points_per_real: 0.01,
      real_per_100_points: 100, min_redeem_points: 1,
      discount_enabled: false, gifts_enabled: false },
  };
}

export function clubCapabilities(config: ClubConfiguration, audience: ClubAudience, programEnabled: boolean) {
  const rules = config[audience];
  const enabled = programEnabled && rules.enabled;
  return { earn: enabled, discount: enabled && rules.discount_enabled,
    gifts: enabled && rules.gifts_enabled };
}
