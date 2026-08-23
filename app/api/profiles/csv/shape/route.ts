import { NextResponse } from "next/server";
import { parseCsvIdentitySnapshot, type CsvIdentityProviderConfig } from "@/lib/integrations/identity/csv";

const config: CsvIdentityProviderConfig = {
  displayName: "CSV / Manual Import",
  id: "csv-shape",
  type: "csv"
};

const sample = `name,email,company,profile_type,status
Example Guest,guest@example.test,Example Team,guest,registered
Example Member,member@example.test,Example Studio,customer,active
Example Volunteer,volunteer@example.test,Operator,staff,active`;

export async function GET() {
  return NextResponse.json({
    provider: config,
    snapshot: parseCsvIdentitySnapshot(config, sample)
  });
}
