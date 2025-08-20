import {Palette} from './types';

export const skinPalettes: Record<string,[string,string,string]> = {
  light: ['#F6D7B5','#E6B989','#C98E61'],
  tan: ['#E8C49A','#D3A877','#AF7C48'],
  dark: ['#C18F5E','#9E6B3F','#774721']
};

export function buildBasePalette(opts:{skin:'light'|'tan'|'dark', hair?:string, eye?:string}): Palette {
  const [s1,s2,s3] = skinPalettes[opts.skin];
  return {
    o:'#111', s1, s2, s3,
    q:'#D29A6F', w:'#B07A52', w2:'#8E5D37', // w2 = дальняя нога/рука темнее
    f:'#E6D0B5', m:'#5E3B2E', i: opts.eye||'#3A7ACF',
    h: opts.hair||'#35964A',
    a:'#5F6E78', A:'#8FA2AF', d:'#3E4A52',
    t:'#2E9F5D', T:'#37B96E',
    r:'#C6263E', R:'#F0455F'
  };
}
