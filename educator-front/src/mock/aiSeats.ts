export interface AISeatBreakdown {
  id: string;
  label: string;
  icon: 'purchase' | 'package';
  value: number;
}

export interface AISeats {
  label: string;
  used: number;
  total: number;
  progressPercent: number;
  breakdown: AISeatBreakdown[];
  totalAvailable: number;
  totalAvailableLabel: string;
}

export interface AISeatsResponse {
  aiSeats: AISeats;
}

export const aiSeatsData: AISeatsResponse = {
  aiSeats: {
    label: 'AI Seats',
    used: 80,
    total: 100,
    progressPercent: 80,
    breakdown: [
      {
        id: 'purchased',
        label: 'Purchased',
        icon: 'purchase',
        value: 7000,
      },
      {
        id: 'bundled',
        label: 'Bundled',
        icon: 'package',
        value: 4500,
      },
    ],
    totalAvailable: 12500,
    totalAvailableLabel: 'Total Available',
  },
};
