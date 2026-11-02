import { describe, expect, it } from "vitest";

import { procedureIncidentLayer } from "@/features/kpi/procedure-map-layers";

describe("procedure map incident layers", () => {
  it("classifies only explicit reconstructed incidents", () => {
    expect(procedureIncidentLayer({ procedure_type: "volte_call_setup", result: "DROP" })).toBe(
      "drops",
    );
    expect(procedureIncidentLayer({ procedure_type: "lte_rlf_probable", result: "FAILURE" })).toBe(
      "rlf",
    );
    expect(
      procedureIncidentLayer({ procedure_type: "lte_ho_inter_frequency", result: "FAILURE" }),
    ).toBe("ho_failures");
    expect(procedureIncidentLayer({ procedure_type: "endc_scg_failure", result: "FAILURE" })).toBe(
      "scg_failures",
    );
  });

  it("does not turn successful or unrelated procedures into incident markers", () => {
    expect(procedureIncidentLayer({ procedure_type: "lte_ho_intra_frequency", result: "SUCCESS" })).toBeNull();
    expect(procedureIncidentLayer({ procedure_type: "lte_rach", result: "FAILURE" })).toBeNull();
    expect(procedureIncidentLayer({ procedure_type: "lte_rrc_setup", result: "UNKNOWN" })).toBeNull();
  });
});
