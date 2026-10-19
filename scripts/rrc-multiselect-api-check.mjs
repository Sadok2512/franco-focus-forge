import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import assert from "node:assert/strict";
const out = "rrc-points-evidence";
fs.mkdirSync(out, { recursive: true });
// Credentials remain in the API container; neither credentials nor session are logged/saved.
const session = JSON.parse(
  execFileSync(
    "docker",
    [
      "exec",
      "bc4-api-1",
      "python",
      "-c",
      `
import os,json,httpx
c=httpx.Client(base_url="http://localhost:8000")
r=c.post("/auth/login",json={"email":os.environ["BC4_ADMIN_EMAIL"],"password":os.environ["BC4_ADMIN_PASSWORD"]})
r.raise_for_status()
s=r.json()
s["user"]=c.get("/auth/me",headers={"Authorization":"Bearer "+s["token"]}).json()
print(json.dumps(s))
`,
    ],
    { encoding: "utf8" },
  ),
);

const prefix = "rrcConnectionRelease/rrcConnectionRelease-r8/idleModeMobilityControlInfo/";
for (const names of [
  ["freqPriorityListEUTRA/carrierFreq", "t320"],
  [
    "freqPriorityListGERAN/carrierFreqs/bandIndicator",
    "freqPriorityListGERAN/carrierFreqs/followingARFCNs/explicitListOfARFCNs",
    "t320",
  ],
]) {
  for (const endpoint of ["distribution", "map"]) {
    const query = new URLSearchParams({ keys: names.map((n) => prefix + n).join(",") });
    if (endpoint === "distribution") query.set("group_by", "operator_band");
    const start = Date.now();
    const r = await fetch(
      "http://localhost:5174/api/projects/4b7bfd50ddb6/dict/v2/" + endpoint + "?" + query,
      { headers: { Authorization: "Bearer " + session.token }, signal: AbortSignal.timeout(65000) },
    );
    const data = await r.json();
    console.log(
      JSON.stringify({
        parameters: names.length,
        endpoint,
        status: r.status,
        milliseconds: Date.now() - start,
        blocks: data.blocks?.length,
        points: data.points?.length,
      }),
    );
  }
}
