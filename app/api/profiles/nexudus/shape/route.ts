import { NextResponse } from "next/server";
import {
  normalizeNexudusCompany,
  normalizeNexudusCustomer,
  normalizeNexudusMembership,
  type NexudusProviderConfig
} from "@/lib/integrations/identity/nexudus";

const config: NexudusProviderConfig = {
  accountName: "example",
  displayName: "Nexudus",
  id: "nexudus-shape",
  type: "nexudus"
};

export async function GET() {
  const company = normalizeNexudusCompany(config, {
    Id: "nx-team-demo",
    LocationId: "main",
    Name: "Example Team",
    Status: "active"
  });
  const person = normalizeNexudusCustomer(config, {
    Email: "member@example.test",
    FullName: "Example Member",
    Id: "nx-customer-demo",
    Status: "active",
    TeamId: "nx-team-demo"
  });
  const entitlement = normalizeNexudusMembership(config, {
    CustomerId: "nx-customer-demo",
    EndDate: "2026-12-31",
    Id: "nx-membership-demo",
    LocationId: "main",
    StartDate: "2026-01-01",
    Status: "active",
    TeamId: "nx-team-demo"
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
