export type ProviderConfigStatus = {
  configured: boolean;
  detail?: string;
  displayName: string;
  missing: string[];
  providerId: string;
  required: string[];
};

export function getNetworkProviderConfigStatus(env: NodeJS.ProcessEnv = process.env): ProviderConfigStatus[] {
  return [
    getStatus({
      detail: "Essentials/free read-only telemetry first",
      displayName: "Omada",
      providerId: "omada",
      required: [
        "OMADA_SERVICE_TIER",
        "OMADA_API_BASE_URL",
        "OMADA_CONTROLLER_ID",
        "OMADA_SITE_ID",
        "OMADA_USERNAME",
        "OMADA_PASSWORD"
      ],
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
  detail,
  displayName,
  env,
  providerId,
  required
}: {
  detail?: string;
  displayName: string;
  env: NodeJS.ProcessEnv;
  providerId: string;
  required: string[];
}): ProviderConfigStatus {
  const missing = required.filter((key) => !env[key]);

  return {
    configured: missing.length === 0,
    detail,
    displayName,
    missing,
    providerId,
    required
  };
}
