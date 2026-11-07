/** Educational estimates from publicly reported TraffiTech schedules.
 * The amount printed on an official notice controls. This is not a bill. */

export interface FineEstimate {
  amountGhs: number | null;
  band: string;
  basis: string;
}

export function estimateSpeedFine(overKph: number): FineEstimate {
  const over = Math.round(overKph);
  const basis =
    "Educational estimate from the graduated speeding bands publicly reported against Regulation 242 and the Thirteenth Schedule. One penalty unit has been publicly treated as GH₵12. Confirm the figure on your notice.";
  if (over < 5) {
    return {
      amountGhs: null,
      band: "Under 5 km/h over",
      basis: `${basis} The published bands used here begin at 5 km/h over the limit.`,
    };
  }
  if (over <= 20) return { amountGhs: 240, band: "5–20 km/h over", basis };
  if (over <= 30) return { amountGhs: 300, band: "21–30 km/h over", basis };
  if (over <= 40) return { amountGhs: 360, band: "31–40 km/h over", basis };
  if (over <= 50) return { amountGhs: 420, band: "41–50 km/h over", basis };
  return { amountGhs: 480, band: "More than 50 km/h over", basis };
}

export function estimateAutomatedFine(priorOffencesInScale: number): FineEstimate {
  const n = Math.max(1, Math.round(priorOffencesInScale));
  const basis =
    "Educational estimate for non-speed automated offences, from public reporting of the GH₵120 scale. A sixth offence is described as moving to a court process. This is not a quote.";
  if (n <= 3) return { amountGhs: 120, band: `Offence ${n} on the reported scale`, basis };
  if (n === 4) return { amountGhs: 180, band: "Fourth offence on the reported scale", basis };
  if (n === 5) return { amountGhs: 240, band: "Fifth offence on the reported scale", basis };
  return {
    amountGhs: null,
    band: "Sixth offence within the reported 24-month pattern",
    basis: `${basis} Nokware will not invent a fine for that step.`,
  };
}

export function estimateLateAddition(amountGhs: number, daysLate: number): number {
  if (daysLate <= 0 || amountGhs <= 0) return 0;
  return Math.round(amountGhs * 0.01 * daysLate * 100) / 100;
}

export const OFFICIAL_FINE_CHANNELS = {
  portal: "https://traffitech-ghpay.nib.com.gh/",
  policeFaq: "https://police.gov.gh/en/index.php/traffitech-gh/",
  payShortCode: "*710*0#",
  checkShortCode: "*220#",
  insuranceCheck: "*920*57#",
  reportedCallCentre: "059 692 2402",
  emergency: "191",
  tollFree: "18555",
} as const;
