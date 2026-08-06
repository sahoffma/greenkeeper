/** Generic label OCR fragments with a full composition block for enrichment readiness tests. */
export const GENERIC_LABEL_COMPOSITION_TEXT_FRAGMENTS = [
  'NPK 0-0-30',
  'Zusammensetzung: 30 % Kaliumoxid (K2O), 10,2 % Schwefel (S), 0,1 % Kupfer (Cu), 3,0 % Eisen (Fe), 0,1 % Mangan (Mn), 0,1 % Zink (Zn)',
] as const

export const GENERIC_LABEL_COMPOSITION_DECLARATION_COMPLETE = [
  ...GENERIC_LABEL_COMPOSITION_TEXT_FRAGMENTS,
  'Declaration section complete',
] as const

export function buildFullEnglishMatrixLabelFragments(input: {
  nitrogen: number
  phosphate: number
  potash: number
}): string[] {
  return [
    `NPK ${input.nitrogen}-${input.phosphate}-${input.potash}`,
    'Nutrient declaration (% by weight):',
    `Nitrogen (N): ${input.nitrogen}%`,
    `Phosphate (P2O5): ${input.phosphate}%`,
    `Potash (K2O): ${input.potash}%`,
    'Magnesium (MgO): 2%',
    'Calcium (CaO): 0%',
    'Sulfur (SO3): 0%',
    'Iron (Fe): 0%',
    'Manganese (Mn): 0%',
    'Copper (Cu): 0%',
    'Zinc (Zn): 0%',
    'Boron (B): 0%',
    'Molybdenum (Mo): 0%',
    'Nitrate nitrogen: 0%',
    'Ammonium nitrogen: 0%',
    'Urea nitrogen: 0%',
    'Organic nitrogen: 0%',
    'Declaration section complete',
  ]
}
