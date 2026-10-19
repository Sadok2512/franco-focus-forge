// -----------------------------------------------------------------------
// 1.20.0 — RF Modules : registre typé (contrat §3 de la spec).
// Chaque entrée déclare ses capacités, ses sources requises et son
// status (AVAILABLE | PARTIAL | UNVALIDATED | UNAVAILABLE) + raison.
// Jamais de capacité annoncée sans preuve back.
// -----------------------------------------------------------------------

export type RFAvailability = "AVAILABLE" | "PARTIAL" | "UNVALIDATED" | "UNAVAILABLE";

export type RFSettingField = {
  key: string;
  label: string;
  type: "number" | "text" | "select";
  default: number | string;
  min?: number;
  max?: number;
  unit?: string;
  options?: readonly string[];
  description: string;
};

export type RFSubview = {
  id: string;
  label: string;
  description: string;
  available: boolean;
  reason_if_unavailable?: string;
};

export type RFModule = {
  module_id: string;
  version: string;
  title: string;
  description: string;
  capabilities: readonly string[];
  required_sources: readonly string[];
  required_fields: readonly string[];
  supported_dimensions: readonly string[];
  settings_schema: readonly RFSettingField[];
  evidence_schema: readonly string[];
  availability_status: RFAvailability;
  availability_reason: string;
  subviews: readonly RFSubview[];
};

// 1.20.0 — 4 modules initiaux. Overshooting est AVAILABLE (contrat
// implémenté côté front, mock adapter si back incomplet). Les 3 autres
// sont déclarés UNVALIDATED avec la méthodologie et les prérequis.
// Jamais claim AVAILABLE sans preuve de disponibilité des sources.
export const RF_MODULES: readonly RFModule[] = [
  {
    module_id: "overshooting",
    version: "0.1.0",
    title: "Overshooting Detection",
    description:
      "Identifie les observations où la cellule serveuse est démontrablement inférieure à une alternative mesurée éligible. Distingue BETTER_CELL_CANDIDATE (preuve directe) de OVERSHOOTING_CONFIRMED (critère validé séparé). Jamais de conclusion sans preuve pairée.",
    capabilities: [
      "candidate_detection",
      "serving_vs_better",
      "margin_statistics",
      "geographic_distribution",
    ],
    required_sources: [
      "measurement_points (serving cell + rsrp)",
      "param_occurrence (MeasurementReport neighbors) OU CELLMEAS neighbors",
    ],
    required_fields: ["ecgi", "rsrp", "capture_id", "seq", "rat", "band"],
    supported_dimensions: ["operator", "band", "dor", "rat"],
    settings_schema: [
      {
        key: "margin_db",
        label: "Marge RSRP candidate vs serving",
        type: "number",
        default: 3,
        min: 1,
        max: 20,
        unit: "dB",
        description:
          "Un voisin n'est marqué BETTER_CELL_CANDIDATE que si son RSRP mesuré est supérieur au serving d'au moins `margin_db`. 3 dB = seuil conservateur ; 6 dB = seuil robuste. Non universellement validé.",
      },
      {
        key: "min_samples",
        label: "Nombre minimal d'observations",
        type: "number",
        default: 5,
        min: 1,
        max: 100,
        unit: "obs",
        description:
          "Nombre minimum de paires (serving, candidate) requises par cellule serveuse pour la retenir dans les résultats. Évite les singletons non statistiquement signifiants.",
      },
      {
        key: "pairing",
        label: "Règle de pairage",
        type: "select",
        default: "capture_seq",
        options: ["capture_seq", "capture_only"],
        description:
          "`capture_seq` : paire serving/neighbor dans la même ligne CELLMEAS. `capture_only` : fenêtre glissante dans la même capture. L'ordre canonique `(capture_id, seq)` est obligatoire — jamais `ts`.",
      },
    ],
    evidence_schema: [
      "capture_id",
      "seq",
      "serving_ecgi",
      "serving_rsrp_dbm",
      "candidate_ecgi",
      "candidate_rsrp_dbm",
      "margin_db",
      "status",
      "status_reason",
    ],
    availability_status: "PARTIAL",
    availability_reason:
      "Pairage serving/neighbor non encore implémenté côté back (contrat défini, mock adapter actif pour le prototype UI). Les projets avec mp.rsrp non-NULL et au moins 1 MeasurementReport neighbor rempli pourront être traités dès que la route POST /rf/modules/overshooting/runs est câblée.",
    subviews: [
      {
        id: "detection",
        label: "Détection",
        description: "Résumé par cellule serveuse : n candidats, marge médiane.",
        available: true,
      },
      {
        id: "candidates",
        label: "Candidats",
        description: "Table détaillée des paires serving/candidate avec marge.",
        available: true,
      },
      {
        id: "serving-vs-better",
        label: "Serving vs Better Cell",
        description: "Comparaison statistique par cellule.",
        available: true,
      },
      {
        id: "geographic",
        label: "Distribution géographique",
        description: "Carte des sites concernés — nécessite GPS + cell_ref géo-attribué.",
        available: false,
        reason_if_unavailable:
          "cell_ref.lat/lng vides pour la majorité des cellules de REF. Activer après upload du référentiel complet avec géom.",
      },
      {
        id: "results",
        label: "Résultats",
        description: "Export CSV + evidence_id persisté.",
        available: true,
      },
    ],
  },
  {
    module_id: "interference",
    version: "0.1.0",
    title: "Interference Detector",
    description:
      "Screening SINR/BLER/CQI/débit comme indicateurs POSSIBLES. Ne conclut jamais à une interférence confirmée sans preuve spectrum ou corrélation voisin pairée.",
    capabilities: ["radio_quality_screening", "cochannel_candidates", "adjacent_candidates"],
    required_sources: [
      "measurement_points (sinr, rsrq, band, earfcn)",
      "param_occurrence (MeasurementReport neighbors — pour overlap)",
    ],
    required_fields: ["sinr", "rsrq", "band", "earfcn", "ecgi"],
    supported_dimensions: ["operator", "band", "dor"],
    settings_schema: [
      {
        key: "sinr_poor_db",
        label: "Seuil SINR dégradé",
        type: "number",
        default: 0,
        min: -20,
        max: 20,
        unit: "dB",
        description:
          "Observation marquée SCREENING_POOR_SINR si SINR mp ≤ seuil. 0 dB = seuil conservateur ; 3 dB = plus large. Pas une preuve d'interférence.",
      },
    ],
    evidence_schema: ["capture_id", "seq", "ecgi", "sinr_dbm", "rsrq_db", "band", "classification"],
    availability_status: "UNVALIDATED",
    availability_reason:
      "Classification Co-channel / Adjacent / External non validée en l'absence de données spectrum. Le module peut sortir du screening (observations à SINR dégradé) mais ne doit pas étiqueter 'confirmed interference'.",
    subviews: [
      {
        id: "screening",
        label: "Radio Quality Screening",
        description: "Observations à SINR/CQI dégradés — pas de conclusion causale.",
        available: true,
      },
      {
        id: "cochannel",
        label: "Co-channel Candidates",
        description: "Chevauchement EARFCN + voisins forts observés.",
        available: false,
        reason_if_unavailable: "Pairage voisin EARFCN non validé pour les projets actuels.",
      },
      {
        id: "adjacent",
        label: "Adjacent-channel Candidates",
        description: "Détection par EARFCN adjacent + ratio puissance.",
        available: false,
        reason_if_unavailable:
          "Nécessite table de proximité EARFCN par bande + preuve spectrum. Non câblé.",
      },
      {
        id: "time-freq",
        label: "Time/Frequency Analysis",
        description: "Signature temporelle sur spectrum.",
        available: false,
        reason_if_unavailable: "Aucune source spectrum ingérée (bc4-decoder 2.1.x).",
      },
      {
        id: "results",
        label: "Résultats",
        description: "Export + evidence_id des observations.",
        available: true,
      },
    ],
  },
  {
    module_id: "rach",
    version: "0.1.0",
    title: "RACH Performance",
    description:
      "Attempts / Success / Failure / Latency. L'ensemble RACHSM seul ne certifie ni attempt ni success — contrat de pairage à valider par event codes certifiés.",
    capabilities: ["attempts_count", "success_rate", "latency_hist", "power_ramping"],
    required_sources: [
      "stg_event (RACHSM certifié — pairage attempt/success)",
      "stg_event_raw (TXPC pour power ramping)",
    ],
    required_fields: [
      "RACHSM.attempt_timestamp",
      "RACHSM.success_timestamp",
      "RACHSM.preamble_tx",
      "TXPC.pwr_rampup_db",
    ],
    supported_dimensions: ["operator", "band", "rat"],
    settings_schema: [
      {
        key: "window_ms",
        label: "Fenêtre de corrélation attempt→success",
        type: "number",
        default: 200,
        min: 50,
        max: 2000,
        unit: "ms",
        description:
          "Taille max entre un attempt et son success au sein de la MÊME capture. Hors fenêtre = attempt non apparié (counted mais pas success rate).",
      },
    ],
    evidence_schema: ["capture_id", "seq_attempt", "seq_success", "preamble_tx", "latency_ms"],
    availability_status: "UNVALIDATED",
    availability_reason:
      "Les event codes Nemo RACHSM n'ont pas de contrat attempt/success/failure certifié dans le décodeur 2.1.0. Les comptes de RACHSM observés peuvent être exposés comme événements bruts (UNVALIDATED) mais pas comme taux de succès.",
    subviews: [
      {
        id: "attempts",
        label: "RACH Attempts",
        description: "Comptage brut RACHSM par capture — UNVALIDATED comme 'attempts'.",
        available: true,
      },
      {
        id: "success",
        label: "RACH Success Rate",
        description: "Nécessite contrat pairage certifié decoder.",
        available: false,
        reason_if_unavailable: "Pas de certification success/failure dans bc4-decoder 2.1.0.",
      },
      {
        id: "failures",
        label: "RACH Failures",
        description: "Classification causes (preamble, no response, max retries).",
        available: false,
        reason_if_unavailable: "Dépend du contrat success/failure — même écart decoder.",
      },
      {
        id: "preamble",
        label: "Preamble Analysis",
        description: "Nécessite champ TXPC pwr_rampup_db validé.",
        available: false,
        reason_if_unavailable: "Mapping TXPC → power ramping non prouvé sur REF.",
      },
      {
        id: "latency",
        label: "RACH Latency",
        description: "Delta attempt→success (fenêtre capture).",
        available: false,
        reason_if_unavailable: "Dépend du contrat success — bloqué par le même écart.",
      },
      {
        id: "results",
        label: "Résultats",
        description: "Export brut UNVALIDATED.",
        available: true,
      },
    ],
  },
  {
    module_id: "throughput",
    version: "0.1.0",
    title: "DL / UL Throughput Analysis",
    description:
      "DL / UL séparés, couches APP / PHY / MAC / RLC / PDCP distinctes. Jamais mélanger les débits inter-couches. CA activée vs utilisée distinctes.",
    capabilities: [
      "app_throughput",
      "layer_separation",
      "dl_ul_compare",
      "distribution",
    ],
    required_sources: [
      "stg_event_raw (DSUMMARY+CMDREQ pour APP, MACRATE/RLCRATE/PDCPRATE pour couches basses)",
    ],
    required_fields: [
      "DSUMMARY.bytes_transferred",
      "CMDREQ.service_action (StartTransfer/StopTransfer)",
      "MACRATE.c4_bits (si prouvé)",
    ],
    supported_dimensions: ["operator", "band", "rat", "dor"],
    settings_schema: [
      {
        key: "min_duration_s",
        label: "Durée min du transfert pour APP throughput",
        type: "number",
        default: 2,
        min: 0.5,
        max: 60,
        unit: "s",
        description:
          "Les transferts < seuil sont exclus (ratio bytes/dt trop volatile). Impacte uniquement APP throughput (compute_transfers).",
      },
    ],
    evidence_schema: [
      "capture_id",
      "transfer_start_seq",
      "transfer_stop_seq",
      "dt_s",
      "bytes_sum",
      "thrpt_mbps",
      "verdict",
    ],
    availability_status: "PARTIAL",
    availability_reason:
      "APP throughput disponible (compute_transfers back 0.45.x+ : 91 transferts proven sur REF). Couches PHY/MAC/RLC/PDCP non câblées (mapping fields non prouvés pour MCS/CQI/BLER). CA/EN-DC contribution bloqué (pas de mesure NR séparée).",
    subviews: [
      {
        id: "application",
        label: "Application Throughput",
        description: "DSUMMARY + CMDREQ paired. Source : compute_transfers back.",
        available: true,
      },
      {
        id: "layers",
        label: "PHY / MAC / RLC / PDCP",
        description: "Nécessite mapping validé par couche.",
        available: false,
        reason_if_unavailable: "Mapping MACRATE/RLCRATE/PDCPRATE → couche non certifié.",
      },
      {
        id: "mcs",
        label: "MCS / 256QAM / RI",
        description: "Modulation+coding, 256QAM, Rank Indicator (MIMO).",
        available: false,
        reason_if_unavailable: "MIMOMEAS/CQI mapping non prouvé sur REF (voir audit G0-G11).",
      },
      {
        id: "spectral",
        label: "Spectral Efficiency",
        description: "bits/s/Hz par cellule à partir de PRB + throughput MAC.",
        available: false,
        reason_if_unavailable: "Nécessite PRB_count validé par couche MAC (non câblé).",
      },
      {
        id: "ran-compare",
        label: "RAN Comparison",
        description: "Compare vendor Nokia/Ericsson/Huawei quand prouvé par cell_ref.",
        available: false,
        reason_if_unavailable: "cell_ref.vendor présent pour Orange nat., non croisé avec mesure.",
      },
      {
        id: "results",
        label: "Résultats",
        description: "Export + evidence_id des transferts proven.",
        available: true,
      },
    ],
  },
];

export function getModule(id: string): RFModule | undefined {
  return RF_MODULES.find((m) => m.module_id === id);
}
