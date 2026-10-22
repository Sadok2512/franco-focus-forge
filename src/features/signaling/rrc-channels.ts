/**
 * Validated RRC logical-channel catalogue (message type → channel), taken from the
 * ASN.1 message-class definitions of 3GPP TS 36.331 (LTE) and TS 38.331 (NR):
 * BCCH-BCH-Message, BCCH-DL-SCH-Message, PCCH-Message, UL/DL-CCCH-Message,
 * UL-CCCH1-Message (NR), UL/DL-DCCH-Message. Lookup is exact after a controlled
 * normalisation; there is no substring matching.
 */
export type RrcTech = "LTE" | "NR";
export type ChannelSource = "DECODED_CHANNEL" | "VALIDATED_CATALOGUE" | "UNCLASSIFIED";
export type ChannelClassification = {
  technology: RrcTech;
  normalizedMessageName: string;
  logicalChannel: string | null;
  classificationSource: ChannelSource;
  /** Decoded channel that contradicts the catalogue (source kept, conflict reported). */
  conflict: string | null;
};

const LTE: Record<string, string[]> = {
  "BCCH-BCH": ["MasterInformationBlock"],
  "BCCH-DL-SCH": ["SystemInformation", "SystemInformationBlockType1"],
  PCCH: ["Paging"],
  "UL-CCCH": ["RRCConnectionRequest", "RRCConnectionReestablishmentRequest", "RRCConnectionResumeRequest"],
  "DL-CCCH": [
    "RRCConnectionSetup",
    "RRCConnectionReject",
    "RRCConnectionReestablishment",
    "RRCConnectionReestablishmentReject",
  ],
  "UL-DCCH": [
    "CSFBParametersRequestCDMA2000",
    "MeasurementReport",
    "RRCConnectionReconfigurationComplete",
    "RRCConnectionReestablishmentComplete",
    "RRCConnectionSetupComplete",
    "RRCConnectionResumeComplete",
    "SecurityModeComplete",
    "SecurityModeFailure",
    "UECapabilityInformation",
    "ULHandoverPreparationTransfer",
    "ULInformationTransfer",
    "CounterCheckResponse",
    "UEInformationResponse",
    "ProximityIndication",
    "RNReconfigurationComplete",
    "MBMSCountingResponse",
    "InterFreqRSTDMeasurementIndication",
    "UEAssistanceInformation",
    "InDeviceCoexIndication",
    "MBMSInterestIndication",
    "SCGFailureInformation",
    "SCGFailureInformationNR",
    "SidelinkUEInformation",
    "WLANConnectionStatusReport",
    "FailureInformation",
    "ULInformationTransferMRDC",
  ],
  "DL-DCCH": [
    "CSFBParametersResponseCDMA2000",
    "DLInformationTransfer",
    "HandoverFromEUTRAPreparationRequest",
    "MobilityFromEUTRACommand",
    "RRCConnectionReconfiguration",
    "RRCConnectionRelease",
    "RRCConnectionResume",
    "SecurityModeCommand",
    "UECapabilityEnquiry",
    "CounterCheck",
    "UEInformationRequest",
    "LoggedMeasurementConfiguration",
    "RNReconfiguration",
    "DLInformationTransferMRDC",
  ],
};

// Note: in TS 38.331 RRCReestablishment and RRCResume are DL-DCCH messages, not DL-CCCH.
const NR: Record<string, string[]> = {
  "BCCH-BCH": ["MIB"],
  "BCCH-DL-SCH": ["SystemInformation", "SIB1"],
  PCCH: ["Paging"],
  "UL-CCCH": ["RRCSetupRequest", "RRCResumeRequest", "RRCReestablishmentRequest", "RRCSystemInfoRequest"],
  "UL-CCCH1": ["RRCResumeRequest1"],
  "DL-CCCH": ["RRCReject", "RRCSetup"],
  "UL-DCCH": [
    "MeasurementReport",
    "RRCReconfigurationComplete",
    "RRCSetupComplete",
    "RRCReestablishmentComplete",
    "RRCResumeComplete",
    "SecurityModeComplete",
    "SecurityModeFailure",
    "ULInformationTransfer",
    "LocationMeasurementIndication",
    "UECapabilityInformation",
    "CounterCheckResponse",
    "UEAssistanceInformation",
    "FailureInformation",
    "ULInformationTransferMRDC",
    "SCGFailureInformation",
    "SCGFailureInformationEUTRA",
    "ULDedicatedMessageSegment",
    "DedicatedSIBRequest",
    "MCGFailureInformation",
    "UEInformationResponse",
    "SidelinkUEInformationNR",
    "ULInformationTransferIRAT",
    "IABOtherInformation",
  ],
  "DL-DCCH": [
    "RRCReconfiguration",
    "RRCResume",
    "RRCRelease",
    "RRCReestablishment",
    "SecurityModeCommand",
    "DLInformationTransfer",
    "UECapabilityEnquiry",
    "CounterCheck",
    "MobilityFromNRCommand",
    "DLDedicatedMessageSegment",
    "UEInformationRequest",
    "DLInformationTransferMRDC",
    "LoggedMeasurementConfiguration",
  ],
};

const index = (cat: Record<string, string[]>) => {
  const m = new Map<string, string>();
  for (const [ch, names] of Object.entries(cat)) for (const n of names) m.set(n, ch);
  return m;
};
const CATALOGUE: Record<RrcTech, Map<string, string>> = { LTE: index(LTE), NR: index(NR) };
export const CHANNEL_ORDER = [
  "BCCH-BCH",
  "BCCH-DL-SCH",
  "PCCH",
  "UL-CCCH",
  "UL-CCCH1",
  "DL-CCCH",
  "UL-DCCH",
  "DL-DCCH",
];

/**
 * Controlled normalisation: drops a " - <detail>" suffix (e.g. "SystemInformation - SIB2,SIB3"),
 * whitespace and an ASN.1 release suffix ("-r9", "_r16"). Nothing else is rewritten.
 */
export function normalizeRrcName(name: string) {
  return name
    .split(" - ")[0]!
    .replace(/\s+/g, "")
    .replace(/[-_]r\d+$/i, "");
}

/** "dl_dcch", "DL-DCCH-Message" → "DL-DCCH"; null when empty. */
export function normalizeChannel(channel: string | null | undefined) {
  const c = channel
    ?.trim()
    .toUpperCase()
    .replace(/_/g, "-")
    .replace(/-MESSAGE$/, "");
  return c || null;
}

export function classifyRrc(
  technology: RrcTech,
  messageName: string,
  decodedChannel?: string | null,
): ChannelClassification {
  const normalizedMessageName = normalizeRrcName(messageName);
  const catalogue = CATALOGUE[technology].get(normalizedMessageName) ?? null;
  const decoded = normalizeChannel(decodedChannel);
  if (decoded)
    return {
      technology,
      normalizedMessageName,
      logicalChannel: decoded,
      classificationSource: "DECODED_CHANNEL",
      conflict: catalogue && catalogue !== decoded ? catalogue : null,
    };
  return {
    technology,
    normalizedMessageName,
    logicalChannel: catalogue,
    classificationSource: catalogue ? "VALIDATED_CATALOGUE" : "UNCLASSIFIED",
    conflict: null,
  };
}
