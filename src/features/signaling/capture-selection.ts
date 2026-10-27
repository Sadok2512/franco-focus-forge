type CaptureChoice = {
  capture_id: string;
  env?: string | null;
};

/**
 * Keep an explicit valid capture. On a fresh Signaling session, prefer the
 * capture whose source metadata identifies a drive: it is the one that can
 * carry proven GPS positions for the RSRP map. No capture data is loaded here.
 */
export function selectSignalingCapture(
  captures: readonly CaptureChoice[],
  selected?: string,
): string | undefined {
  if (selected && captures.some((capture) => capture.capture_id === selected)) return selected;
  return captures.find((capture) => capture.env === "incar")?.capture_id ?? captures[0]?.capture_id;
}
