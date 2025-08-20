import {SpriteDefinition} from '../core/types';
import {body32Set} from '../parts/body32';

export const humanDef: SpriteDefinition = {
  base: body32Set,
  layers: {},
  sheet: {
    src: '/sprites/human_standard64.png', // новый 64x96 лист (8x4)
    frameW: 64,
    frameH: 96,
    columns: 8,
    total: 32,
    layout: 'variable', // авто извлечение bbox и pivot
    keyColors: ['ffffff','fff'],
    animations: {
      idle: [0,1,2,3],
      walk: [4,5,6,7,8,9,10,11],
      attack: [12,13,14,15],
      cast: [16,17,18,19],
      hurt: [20,21],
      death: [22,23,24,25,26,27],
      crit: [28,29,30,31] // расширено до 4 кадров
    }
  }
};
