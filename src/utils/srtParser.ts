// src/utils/srtParser.ts

export interface SubtitleCue {
  start: number; // in seconds
  end: number;   // in seconds
  text: string;
}

// Converts SRT timestamp format (HH:MM:SS,mmm) to seconds
function parseTimestamp(timeString: string): number {
  const parts = timeString.trim().replace(',', '.').split(':');
  if (parts.length !== 3) return 0;
  
  const hours = parseFloat(parts[0]);
  const minutes = parseFloat(parts[1]);
  const seconds = parseFloat(parts[2]);
  
  return hours * 3600 + minutes * 60 + seconds;
}

export function parseSRT(srtText: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  // Normalize line endings
  const cleanText = srtText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const blocks = cleanText.split('\n\n');

  for (const block of blocks) {
    const lines = block.split('\n').map(line => line.trim()).filter(Boolean);
    if (lines.length < 3) continue;

    // Line 0 is usually the index (e.g. "1")
    // Line 1 is the timing (e.g. "00:01:20,000 --> 00:01:23,000")
    // Subsequent lines are the text
    const timingLine = lines[1];
    if (!timingLine || !timingLine.includes('-->')) continue;

    const timeParts = timingLine.split('-->');
    if (timeParts.length !== 2) continue;

    const start = parseTimestamp(timeParts[0]);
    const end = parseTimestamp(timeParts[1]);
    const text = lines.slice(2).join('\n');

    cues.push({ start, end, text });
  }

  return cues.sort((a, b) => a.start - b.start);
}
