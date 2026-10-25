// Fairytale day palette. One character per colour so art rows stay readable.
export const PALETTE = {
  o: '#3b2416', // outline: dark brown, never pure black
  k: '#2a1a2e', // eyes, deep shadow
  w: '#ffffff',
  s: '#ffd8b0', // skin
  S: '#eaa878',
  r: '#e8503a', // red
  R: '#a8322a',
  u: '#ff8a68', // red highlight
  O: '#f5902e', // orange roof
  Q: '#b8581c',
  b: '#4a86e0', // blue
  B: '#2e56a0',
  i: '#8cc0ff', // blue highlight
  j: '#c8f27a', // grass highlight
  g: '#8fd64e', // grass
  G: '#56a832', // leaf
  F: '#2f6e28', // deep leaf
  y: '#ffd23f', // gold
  Y: '#d8961c',
  n: '#f2b85c', // wood light
  N: '#c47a32', // wood
  M: '#7a4420', // wood dark
  h: '#9a5a2a', // brown hair / cloth
  H: '#5e3418',
  c: '#fff4d6', // cream paper
  C: '#ecd3a0',
  p: '#f582b8', // fairy pink
  P: '#c04e8a',
  v: '#9a66e0', // spell violet
  V: '#5e3aa8',
  z: '#eef2f6', // steel light / bone
  x: '#b4c0cc', // steel
  X: '#76849a', // stone dark
  a: '#7fd8f8', // water
  A: '#3a92d8',
  t: '#e6c47e', // dirt path
  T: '#bf9550',
  d: '#5a2a66', // demon
  D: '#d03a4e', // demon red
  L: '#7a7088', // wolf / hood grey
  l: '#463c56',
};

// Which colour a pixel turns into when it sits on a shadowed edge.
export const SHADE = {
  s: 'S', r: 'R', u: 'r', O: 'Q', b: 'B', i: 'b', j: 'g', g: 'G', G: 'F', y: 'Y', n: 'N', N: 'M',
  h: 'H', c: 'C', p: 'P', v: 'V', z: 'x', x: 'X', a: 'A', t: 'T', L: 'l', w: 'c', d: 'k', D: 'R',
};
