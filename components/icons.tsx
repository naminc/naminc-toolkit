import {
  Binary,
  Braces,
  CalendarClock,
  Clock3,
  Fingerprint,
  FileJson2,
  KeyRound,
  Link2,
  Palette,
  Regex,
  ShieldCheck,
  SendHorizontal,
  TimerReset,
  type LucideIcon,
} from "lucide-react";

const icons: Record<string, LucideIcon> = {
  Binary,
  Braces,
  CalendarClock,
  Clock3,
  Fingerprint,
  FileJson2,
  KeyRound,
  Link2,
  Palette,
  Regex,
  ShieldCheck,
  SendHorizontal,
  TimerReset,
};

export function ToolIcon({ name, size = 20 }: { name: string; size?: number }) {
  const Icon = icons[name] ?? Braces;
  return <Icon aria-hidden="true" size={size} strokeWidth={1.8} />;
}
