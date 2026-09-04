export const matchDurationFilter = (simDuration: string, filter: string): boolean => {
  // Extract numeric value from duration string
  const durationStr = String(simDuration ?? '').toLowerCase();
  const numMatch = durationStr.match(/(\d+(?:\.\d+)?)/);
  if (!numMatch) return true; // If no number found, include the simulation
  
  let mins = parseFloat(numMatch[1]);
  
  // If duration contains 'hour' or 'hr', convert to minutes
  if (/hour|hr/i.test(durationStr)) {
    mins = mins * 60;
  }
  
  // Match against new duration ranges
  if (filter === '<15 min') return mins < 15;
  if (filter === '15–30 min' || filter === '15-30 min') return mins >= 15 && mins <= 30;
  if (filter === '30–60 min' || filter === '30-60 min') return mins > 30 && mins <= 60;
  if (filter === '60+ min') return mins > 60;
  
  // Legacy support for old filter values (if needed)
  if (filter === 'Less than 10 minutes') return mins < 10;
  if (filter === '10–20 minutes' || filter === '10-20 minutes') return mins >= 10 && mins <= 20;
  if (filter === '20–30 minutes' || filter === '20-30 minutes') return mins > 20 && mins <= 30;
  if (filter === '30+ minutes') return mins > 30;
  
  return true;
}