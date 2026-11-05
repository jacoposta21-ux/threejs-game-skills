export type ChapterId = 'bedroom' | 'kitchen' | 'attic';

export const CHAPTERS: { id: ChapterId; numeral: string; title: string }[] = [
  { id: 'bedroom', numeral: 'I', title: 'The Bedroom' },
  { id: 'kitchen', numeral: 'II', title: 'The Kitchen' },
  { id: 'attic', numeral: 'III', title: 'The Attic' },
];

export type Surface = 'wood' | 'carpet' | 'tile' | 'fabric' | 'metal';
