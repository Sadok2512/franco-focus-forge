import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  Activity, ArrowLeftRight, CheckCheck, CircleCheck, CircleX, Download,
  FileCheck, FilePlus, Globe, MessageSquare, PhoneCall, PhoneIncoming,
  PhoneOff, RadioTower, Repeat, Route, Settings, TriangleAlert, Upload,
  type LucideIcon,
} from "lucide-react";
import type { RfEvent } from "@/lib/api/signaling";

type IconRole = "info" | "success" | "warning" | "error" | "event" | "scg";
export function eventIcon(event: RfEvent): { icon: LucideIcon; role: IconRole } {
  const track = event.attrs.track ?? "";
  const name = `${event.type} ${event.label}`.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  const failure = event.attrs.status === "FAILURE" || /failure|failed|drop|\brlf\b/.test(name);
  if (failure) return { icon: track === "mobility" && /handover|\bho\b/.test(name) ? CircleX : TriangleAlert, role: "error" };
  if (/scg/.test(name)) return { icon: RadioTower, role: /release|remov/.test(name) ? "warning" : track === "mobility" ? "scg" : "event" };
  if (track === "mobility") {
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