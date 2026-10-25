/** Page length in eighths -> "2 3/8", "5/8", "3". */
export function pagesText(eighths: number | null | undefined): string {
  if (!eighths) return "0";
  const whole = Math.floor(eighths / 8);
  const rem = eighths % 8;
  return `${whole ? whole + " " : ""}${rem ? rem + "/8" : ""}`.trim();
}
