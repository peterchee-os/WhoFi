export type ProviderConfigStatus = {
  configured: boolean;
  displayName: string;
  missing: string[];
  providerId: string;
  required: string[];
};

export function getNetworkProviderConfigStatus(env: NodeJS.ProcessEnv = process.env): ProviderConfigStatus[] {
  return [
    getStatus({
      displayName: "Omada",
      providerId: "omada",
      required: ["OMADA_BASE_URL", "OMADA_SITE_ID", "OMADA_USERNAME", "OMADA_PASSWORD"],
      env
    }),
    getStatus({
      displayName: "Cisco Meraki",
      providerId: "meraki",
      required: ["MERAKI_NETWORK_ID", "MERAKI_API_KEY"],
      env
    })
  ];
}

function getStatus({
  displayName,
  env,
  providerId,
  required
}: {
  displayName: string;
  env: NodeJS.ProcessEnv;
  providerId: string;
  required: string[];
}): ProviderConfigStatus {
  const missing = required.filter((key) => !env[key]);

  return {
    configured: missing.length === 0,
    displayName,
    missing,
    providerId,
    required
  };
}
