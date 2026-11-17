// EDITORIAL METADATA, not API data.
// Appearance per species (shape archetype, height and spread in metres, bloom colour) from
// general horticultural knowledge, so the garden is recognisable. Shown in the UI as "illustrative".
// Shrubs are sized as young plants (all were planted in 2026).
//
// archetypes: spike | umbel | daisy | cup | bell | globe | mat | tuft | shrub   (+ seedling for stage "seed")

const SPECIES = {
  'Filipendula ulmaria':      { a: 'umbel', h: 1.2,  w: 0.55, bloom: '#f3ecd2' },
  'Verbena bonariensis':      { a: 'umbel', h: 1.4,  w: 0.4,  bloom: '#8b5fc7' },
  'Cichorium intybus':        { a: 'daisy', h: 1.0,  w: 0.45, bloom: '#7fa7e8' },
  'Helianthus annuus':        { a: 'daisy', h: 1.8,  w: 0.5,  bloom: '#f5c518' },
  'Verbascum nigrum':         { a: 'spike', h: 1.0,  w: 0.4,  bloom: '#f2d23c' },
  'Lythrum salicaria':        { a: 'spike', h: 1.2,  w: 0.5,  bloom: '#c2408f' },
  'Malva sylvestris':         { a: 'cup'  , h: 0.9,  w: 0.55, bloom: '#b765b8' },
  'Dipsacus fullonum':        { a: 'globe', h: 1.6,  w: 0.5,  bloom: '#b39ad6' },
  'Thymus serpyllum':         { a: 'mat',   h: 0.08, w: 0.35, bloom: '#c88ac9' },
  'Echium vulgare':           { a: 'spike', h: 0.7,  w: 0.4,  bloom: '#4f73d9' },
  'Geranium pratense':        { a: 'cup'  , h: 0.6,  w: 0.5,  bloom: '#8f8fe0' },
  'Aster ageratoides':        { a: 'daisy', h: 0.7,  w: 0.45, bloom: '#b7a6e6' },
  'Tanacetum vulgare':        { a: 'umbel', h: 1.0,  w: 0.5,  bloom: '#f0c419' },
  'Viburnum opulus':          { a: 'shrub', h: 1.5,  w: 1.1,  bloom: '#f4f1e6' },
  'Tropaeolum majus':         { a: 'cup'  , h: 0.3,  w: 0.5,  bloom: '#f07a1f' },
  'Leucanthemum vulgare':     { a: 'daisy', h: 0.6,  w: 0.4,  bloom: '#fafafa' },
  'Papaver rhoeas':           { a: 'cup'  , h: 0.6,  w: 0.3,  bloom: '#e0301e' },
  'Centaurea scabiosa':       { a: 'daisy', h: 0.9,  w: 0.45, bloom: '#b0469a' },
  'Limonium vulgare':         { a: 'mat',   h: 0.3,  w: 0.4,  bloom: '#a58ad8' },
  'Veronica longifolia':      { a: 'spike', h: 0.9,  w: 0.4,  bloom: '#6a7fe0' },
  'Dianthus carthusianorum':  { a: 'cup'  , h: 0.45, w: 0.3,  bloom: '#d42c7a' },
  'Juncus inflexus':          { a: 'tuft',  h: 0.8,  w: 0.45, bloom: '#8a7350' },
  'Saponaria officinalis':    { a: 'cup'  , h: 0.7,  w: 0.45, bloom: '#f2c6d6' },
  'Echinops bannaticus':      { a: 'globe', h: 1.1,  w: 0.5,  bloom: '#6d8fe0' },
  'Foeniculum vulgare':       { a: 'umbel', h: 1.7,  w: 0.55, bloom: '#d8d43a' },
  'Salvia pratensis':         { a: 'spike', h: 0.6,  w: 0.4,  bloom: '#5b55c9' },
  'Galium verum':             { a: 'mat',   h: 0.35, w: 0.4,  bloom: '#f1dc4a' },
  'Geum rivale':              { a: 'bell',  h: 0.4,  w: 0.35, bloom: '#c26a5a' },
  'Althaea officinalis':      { a: 'spike', h: 1.4,  w: 0.55, bloom: '#f1d3dd' },
  'Amaranthus caudatus':      { a: 'spike', h: 1.0,  w: 0.5,  bloom: '#a3243f' },
  'Catananche caerulea':      { a: 'daisy', h: 0.6,  w: 0.35, bloom: '#7d8fe6' },
  'Cornus mas':               { a: 'shrub', h: 1.8,  w: 1.1,  bloom: '#e9cf3a' },
  'Frangula alnus':           { a: 'shrub', h: 1.6,  w: 1.0,  bloom: '#cfe0a0' },
  'Eryngium planum':          { a: 'globe', h: 0.8,  w: 0.4,  bloom: '#7f9ad8' },
  'Sedum album':              { a: 'mat',   h: 0.1,  w: 0.3,  bloom: '#f6f3ea' },
  'Thymus pulegioides':       { a: 'mat',   h: 0.15, w: 0.35, bloom: '#d48bc6' },
  'Thymus praecox':           { a: 'mat',   h: 0.06, w: 0.35, bloom: '#c4357a' },
  'Euonymus europaeus':       { a: 'shrub', h: 1.6,  w: 1.0,  bloom: '#e8578f' },
  'Helianthemum nummularium': { a: 'mat',   h: 0.2,  w: 0.4,  bloom: '#fafaf2' },
  'Campanula trachelium':     { a: 'bell',  h: 0.8,  w: 0.4,  bloom: '#7a6bd0' },
  'Primula elatior':          { a: 'bell',  h: 0.25, w: 0.25, bloom: '#f3e27a' },
  'Scabiosa columbaria':      { a: 'daisy', h: 0.5,  w: 0.35, bloom: '#a9a2e3' },
  'Centaurea jacea':          { a: 'daisy', h: 0.6,  w: 0.4,  bloom: '#b8468e' },
  'Allium':                   { a: 'globe', h: 0.5,  w: 0.3,  bloom: '#9b5bd0' },
  'Campanula persicifolia':   { a: 'bell',  h: 0.8,  w: 0.35, bloom: '#8c97e8' },
  'Silene flos-cuculi':       { a: 'cup'  , h: 0.6,  w: 0.35, bloom: '#e58ab3' },
  'Symphytum grandiflorum':   { a: 'bell',  h: 0.3,  w: 0.45, bloom: '#8fa8e8' },
  'Daucus carota':            { a: 'umbel', h: 0.8,  w: 0.4,  bloom: '#f5f3ea' },
};

const FALLBACK = { a: 'daisy', h: 0.6, w: 0.4, bloom: '#c8c8c8' };

/** Splits "Echinops bannaticus 'Blue Globe'" into base name and cultivar. */
function parseName(name) {
  const m = String(name).match(/^(.*?)\s*'([^']+)'\s*$/);
  return m ? { base: m[1].trim(), cultivar: m[2] } : { base: String(name).trim(), cultivar: null };
}

export function lookupSpecies(name) {
  const { base, cultivar } = parseName(name);
  const found = SPECIES[base] || SPECIES[base.split(' ').slice(0, 2).join(' ')];
  if (!found) console.warn(`[species] geen uiterlijk bekend voor "${name}", standaardvorm gebruikt`);
  return { ...(found || FALLBACK), base, cultivar, known: !!found };
}

// How attractive a plant is to a (future) butterfly: 0..1. Editorial.
export const NECTAR = { umbel: 0.9, spike: 0.8, daisy: 0.85, cup: 0.8, globe: 0.9, bell: 0.5, mat: 0.6, tuft: 0, shrub: 0.3, seedling: 0 };
