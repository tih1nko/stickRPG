// Core sprite types
export type Token = string; // '.' transparent or symbolic up to 3 chars (e.g. s1, w2)
export type Layer = string[][]; // rows of tokens
export type Frame = Layer; // one composite logical layer matrix (pre-merge)
export type Animation = Frame[];

export interface AnimationSet {
  idle: Animation;
  walk: Animation;
  [key: string]: Animation;
}

export interface Palette {
  [token: string]: string; // token -> hex color
}

export interface SpriteDefinition {
  base: AnimationSet; // core body animations
  layers: Record<string, Layer | Animation>; // cosmetic or equipment layers
  sheet?: SpriteSheet; // optional pre-baked sheet
}

export interface ComposeOptions {
  frame: number;
  anim: keyof AnimationSet;
  scale?: number;
  targetHeight?: number; // желаемая высота в пикселях (логическая) — переопределяет scale
  skin?: 'light'|'tan'|'dark';
  hair?: string;
  eye?: string;
  equipped?: string[]; // keys from definition.layers
  overrides?: Partial<AnimationSet>; // pose / override animations
}

// Sprite sheet (pre-baked) support
export interface SpriteSheet {
  src: string; // image path
  frameW: number;
  frameH: number;
  animations: Record<string, number[]>; // anim name -> list of frame indices
  columns: number; // frames per row in sheet
  total: number; // total frames present
  paletteAware?: boolean; // if true will attempt recolor by sampling -> (not implemented yet)
  // Uniform обрезка каждой ячейки (если нужно уменьшить поле вокруг персонажа)
  crop?: { x: number; y: number; w: number; h: number };
  // Список цветов (hex без # или с #) которые нужно сделать прозрачными.
  // Если не указан, берём цвета углов кадра (1-4) и делаем их прозрачными.
  keyColors?: string[];
  // Режим размещения
  layout?: 'fixed' | 'variable';
  // Базовая линия для fixed (Y координата внутри исходного кадра). Если не задано, берём frameH-2
  baseline?: number;
  // Переменные фреймы для variable layout
  frames?: VariableFrame[];
}

export interface VariableFrame {
  id: string;
  x: number; y: number; w: number; h: number;
  pivotX: number; // точка опоры относительно локального фрейма
  pivotY: number; // baseline относительно локального фрейма
  anim: string; // имя анимации
  ord: number; // порядок внутри анимации
}
