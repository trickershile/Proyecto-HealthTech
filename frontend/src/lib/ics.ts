export type ReminderUnit = "hours" | "days";

const pad2 = (n: number) => String(n).padStart(2, "0");

const formatLocalFloating = (d: Date) => {
  const yyyy = d.getFullYear();
  const mm = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  const hh = pad2(d.getHours());
  const mi = pad2(d.getMinutes());
  const ss = pad2(d.getSeconds());
  return `${yyyy}${mm}${dd}T${hh}${mi}${ss}`;
};

const formatUtcStamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");

const safeFile = (s: string) =>
  (s || "recordatorio")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "recordatorio";

export const downloadIcs = (ics: string, fileBaseName: string) => {
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeFile(fileBaseName)}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

export const buildMedicationReminderIcs = ({
  medicationName,
  startLocal,
  interval,
  unit,
  durationDays,
}: {
  medicationName: string;
  startLocal: Date;
  interval: number;
  unit: ReminderUnit;
  durationDays: number;
}) => {
  const start = new Date(startLocal.getTime());
  const end = new Date(startLocal.getTime() + 15 * 60 * 1000);
  const totalUnits = unit === "hours" ? durationDays * 24 : durationDays;
  const count = Math.max(1, Math.floor(totalUnits / Math.max(1, interval)) + 1);

  const uid = `${Math.random().toString(16).slice(2)}-${Date.now()}@healthtech.duoc`;
  const summary = `Recordatorio de Toma: ${String(medicationName || "Medicamento").trim() || "Medicamento"}`;
  const desc = "Recordatorio educativo. No reemplaza indicación médica.";
  const dtstamp = formatUtcStamp(new Date());
  const dtstart = formatLocalFloating(start);
  const dtend = formatLocalFloating(end);
  const rrule =
    unit === "hours"
      ? `RRULE:FREQ=HOURLY;INTERVAL=${Math.max(1, interval)};COUNT=${count}`
      : `RRULE:FREQ=DAILY;INTERVAL=${Math.max(1, interval)};COUNT=${count}`;

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    "PRODID:-//Duoc UC//HealthTech//ES",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${dtstart}`,
    `DTEND:${dtend}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${desc}`,
    rrule,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "TRIGGER:-PT0M",
    `DESCRIPTION:${summary}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.join("\r\n") + "\r\n";
};
