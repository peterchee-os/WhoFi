export type ProviderConfigStatus = {
  configured: boolean;
  detail?: string;
  displayName: string;
  liveSourceTokenRequired?: boolean;
  liveSnapshotsEnabled?: boolean;
  missing: string[];
  providerId: string;
  required: string[];
};

export function getNetworkProviderConfigStatus(env: NodeJS.ProcessEnv = process.env): ProviderConfigStatus[] {
  const liveSnapshotsEnabled = env.WHOFI_ENABLE_LIVE_DEVICE_SOURCES === "true";
  const liveSourceTokenRequired = Boolean(env.WHOFI_LIVE_DEVICE_SOURCE_TOKEN);

  return [
    getStatus({
      detail: "Essentials/free read-only telemetry first",
      displayName: "Omada",
      liveSourceTokenRequired,
      liveSnapshotsEnabled,
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
      detail: "Optional Printing Press collector path",
      displayName: "Omada Printing Press CLI",
      liveSourceTokenRequired,
      liveSnapshotsEnabled,
      providerId: "omada-printing-press",
      required: [
        "OMADA_PP_CLI_PATH",
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
  liveSourceTokenRequired,
  liveSnapshotsEnabled,
  providerId,
  required
}: {
  detail?: string;
  displayName: string;
  env: NodeJS.ProcessEnv;
  liveSourceTokenRequired?: boolean;
  liveSnapshotsEnabled?: boolean;
  providerId: string;
  required: string[];
}): ProviderConfigStatus {
  const missing = required.filter((key) => !env[key]);

  return {
    configured: missing.length === 0,
    detail,
    displayName,
    liveSourceTokenRequired,
    liveSnapshotsEnabled,
    missing,
    providerId,
    required
  };
}
