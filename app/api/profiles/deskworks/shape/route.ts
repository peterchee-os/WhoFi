import { NextResponse } from "next/server";
import {
  normalizeDeskworksAccount,
  normalizeDeskworksEntitlement,
  normalizeDeskworksMember,
  type DeskworksProviderConfig
} from "@/lib/integrations/identity/deskworks";

const config: DeskworksProviderConfig = {
  displayName: "Deskworks",
  id: "deskworks-shape",
  type: "deskworks"
};

export async function GET() {
  const company = normalizeDeskworksAccount(config, {
    accountId: "dw-account-demo",
    companyName: "Example Studio",
    locationId: "main",
    status: "active"
  });
  const person = normalizeDeskworksMember(config, {
    accountId: "dw-account-demo",
    email: "member@example.test",
    fullName: "Example Member",
    memberId: "dw-member-demo",
    status: "active"
  });
  const entitlement = normalizeDeskworksEntitlement(config, {
    accountId: "dw-account-demo",
    endDate: "2026-12-31",
    locationId: "main",
    memberId: "dw-member-demo",
    planId: "dw-plan-demo",
    startDate: "2026-01-01",
    status: "active"
  });

  return NextResponse.json({
    provider: config,
    snapshot: {
      companies: company ? [company] : [],
      entitlements: entitlement ? [entitlement] : [],
      people: person ? [person] : []
    }
  });
}
