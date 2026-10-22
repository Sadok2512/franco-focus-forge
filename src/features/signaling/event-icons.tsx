import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  Activity, ArrowLeftRight, CheckCheck, CircleCheck, CircleDot, CircleX,
  Download, FileCheck, FilePlus, Flag, Globe, MessageSquare, PhoneCall,
  PhoneIncoming, PhoneOff, Radar, RadioTower, Repeat, Route, Send, Settings,
  TriangleAlert, Upload, type LucideIcon,
} from "lucide-react";
import type { RfEvent } from "@/lib/api/signaling";
import { eventTrack } from "./event-track";

type IconRole = "info" | "success" | "warning" | "error" | "event" | "scg";
export function eventIcon(event: RfEvent): { icon: LucideIcon; role: IconRole } {
  const track = eventTrack(event);
  const name = `${event.type} ${event.label}`.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  const failure =
    event.outcome === "fail" ||
    event.attrs.status === "FAILURE" ||
    /failure|failed|drop|\brlf\b/.test(name);
  if (failure) return { icon: track === "mobility" && /handover|\bho\b/.test(name) ? CircleX : TriangleAlert, role: "error" };
  if (/scg/.test(name)) return { icon: RadioTower, role: /release|remov/.test(name) ? "warning" : track === "mobility" ? "scg" : "event" };
  if (track === "mobility") {
    // VM mobility codes (HOA/HOS/HOI/MEI marks and `ho` procedure bars) arrive
    // without a name, so each keeps its own glyph and the lane stays readable.
    const code = event.type.toUpperCase();
    if (code === "HOA") return { icon: Flag, role: "info" };
    if (code === "HOS") return { icon: CircleCheck, role: "info" };
    if (code === "HOI") return { icon: CircleDot, role: "info" };
    if (code === "MEI") return { icon: Radar, role: "info" };
    if (/inter.?rat/.test(name)) return { icon: Route, role: "event" };
    if (/inter.?freq|inter.*\bho\b/.test(name)) return { icon: Repeat, role: "warning" };
    if (/success/.test(name)) return { icon: CircleCheck, role: "success" };
    return { icon: ArrowLeftRight, role: "info" };
  }
  if (/call.*(end|stop)|release/.test(name)) return { icon: PhoneOff, role: "error" };
  if (/call.*start/.test(name)) return { icon: PhoneIncoming, role: "success" };
  if (track === "dl") return { icon: Download, role: "info" };
  if (track === "ul") return { icon: Upload, role: "warning" };
  if (track === "volte" || track === "vonr") return { icon: PhoneCall, role: "success" };
  if (track === "sms") return { icon: MessageSquare, role: "info" };
  if (track === "ping" || /measurement|report/.test(name)) return { icon: Activity, role: "info" };
  if (/http|ftp|video/.test(name)) return { icon: Globe, role: "info" };
  if (/reconfig/.test(name)) return { icon: /complete/.test(name) ? CheckCheck : Settings, role: /complete/.test(name) ? "success" : "info" };
  if (/complete/.test(name)) return { icon: CircleCheck, role: "success" };
  if (/request|\breq\b|\brra\b/.test(name)) return { icon: FilePlus, role: "info" };
  if (/setup/.test(name)) return { icon: FileCheck, role: "success" };
  return { icon: Activity, role: "info" };
}

const images = new Map<LucideIcon, string>();
export function iconImage(icon: LucideIcon, foreground: string): string {
  // Lucide SVGs are used by ECharts as images so they retain the event hit target.
  const cached = images.get(icon);
  const svg = cached ?? renderToStaticMarkup(createElement(icon, { size: 24, strokeWidth: 2, color: "currentColor" }));
  if (!cached) images.set(icon, svg);
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg.replace(/currentColor/g, foreground))}`;
}