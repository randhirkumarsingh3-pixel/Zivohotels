/** "Air Conditioning: Centralized AC" -> "Air Conditioning"; no repeats (cards and filters). */
export const amenityLabels = (list) => [...new Set((Array.isArray(list) ? list : []).map((a) => String(a).split(':')[0].trim()).filter(Boolean))];
