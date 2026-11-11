/* MediaCopia — calendar helpers and .ics export. */
window.MC = window.MC || {};

MC.daysUntil = iso => {
  const d = MC.parseDate(iso); if (!d) return null;
  const t = MC.parseDate(MC.today());
  return Math.round((d - t) / 86400000);
};

MC.countdownLabel = iso => {
  const n = MC.daysUntil(iso);
  if (n === null) return '';
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n < 0) return `${-n}d ago`;
  if (n < 14) return `in ${n} days`;
  if (n < 60) return `in ${Math.round(n / 7)} wks`;
  return `in ${Math.round(n / 30)} mo`;
};

MC.fmtDate = (iso, opts = { month: 'short', day: 'numeric', year: 'numeric' }) => {
  const d = MC.parseDate(iso); return d ? d.toLocaleDateString(undefined, opts) : '';
};

MC.buildICS = events => {
  const esc = s => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
  const fold = line => line.length <= 74 ? line : line.match(/.{1,74}/g).join('\r\n ');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//MediaCopia//Drops//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:MediaCopia Drops'];
  events.forEach(e => {
    const start = e.date.replace(/-/g, '');
    const endD = MC.parseDate(e.date); endD.setDate(endD.getDate() + 1);
    const end = MC.isoDate(endD).replace(/-/g, '');
    const t = MC.TYPE[e.type];
    lines.push('BEGIN:VEVENT', `UID:${e.id}@mediacopia`, `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${start}`, `DTEND;VALUE=DATE:${end}`,
      fold(`SUMMARY:${esc(`${t?.icon || ''} ${e.title}${e.creator ? ' — ' + e.creator : ''}`)}`),
      fold(`DESCRIPTION:${esc([t?.label, e.dateConfidence === 'estimated' ? 'Date is an estimate' : '', e.notes, e.link].filter(Boolean).join('\n'))}`));
    if (e.link) lines.push(fold(`URL:${e.link}`));
    lines.push(`CATEGORIES:${esc(t?.label || 'Media')}`, 'END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
};
