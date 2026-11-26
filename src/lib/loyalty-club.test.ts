import { describe, expect, it } from "vitest";
import { initialClubConfiguration, clubCapabilities } from "./loyalty-club";

const existing = { enabled: true, points_per_real: 0.01, real_per_100_points: 100,
  max_redeem_pct: 20, min_redeem_points: 1, grace_days: 7, expiry_months: 12 };

describe("club foundation", () => {
  it("preserves existing customer rules and keeps reseller and gifts disabled", () => {
    const config = initialClubConfiguration(existing);
    expect(config.customer).toEqual({ ...existing, discount_enabled: true, gifts_enabled: false });
    expect(clubCapabilities(config, "reseller", true)).toEqual({ earn: false, discount: false, gifts: false });
  });
  it("allows gifts without purchase discounts and respects global pause", () => {
    const config = initialClubConfiguration(existing);
    config.reseller.enabled = true;
    config.reseller.gifts_enabled = true;
    expect(clubCapabilities(config, "reseller", true)).toEqual({ earn: true, discount: false, gifts: true });
    expect(clubCapabilities(config, "reseller", false)).toEqual({ earn: false, discount: false, gifts: false });
  });
});
