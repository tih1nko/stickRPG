// Sprite generation utilities (original, not copied from external IP)
// Upgraded logical resolution: 32x48 (старые 16x24 кадры центрируются)

export const SPRITE_W = 32;
export const SPRITE_H = 48;
// Смещение по вертикали для размещения старого 24px роста в 48px канве (оставляем запас сверху/снизу)
const BODY_OFFSET_Y = 12; // пустое пространство сверху для будущих головных уборов

export type Layer = string[][]; // each row is array of tokens ('.' transparent)
export type AnimationFrames = Layer[][]; // array of frames

// New high-level animation registry (incremental extension without breaking old API)
export interface AnimationSet {
  idle: AnimationFrames;
  walk: AnimationFrames;
}

// Helper to convert multiline string with spaces into tokens (1-2 char tokens)
function rows(lines: string[]): string[][] {
  return lines.map(l => {
    const out: string[] = [];
    for (let i = 0; i < l.length; i++) {
      const c = l[i];
      if (c === ' ') continue; // ignore spaces
      if (c === 's') { // possible s1/s2/s3
        if (l[i+1] && /[123]/.test(l[i+1])) { out.push('s'+l[i+1]); i++; continue; }
      }
      out.push(c);
    }
    return out;
  });
}

// Base body (outline 'o', skin shades s1/s2/s3)
// Frame 0 (stand) – более человекоподобный силуэт 16x24, центрируется позже
export const baseBody: Layer = rows([
  '................',
  '.......oo.......',
  '......oS1o......',
  '.....oS1S1o.....',
  '.....oS2S1o.....',
  '......oS3o......',
  '.......oo.......',
  '......s1s1......',
  '.....s1s1s1.....',
  '....s1s1s1s1....',
  '....s1s1s1s1....',
  '....s1s1s1s1....',
  '.....s1s1s1.....',
  '.....s1s1s1.....',
  '.....s1..s1.....',
  '....s1....s1....',
  '....s1....s1....',
  '....s1....s1....',
  '.....s1..s1.....',
  '.....s1..s1.....',
  '......s1s1......',
  '......s1s1......',
  '.......s1.......',
  '................'
]);

// Frame 1 (left step)
const bodyFrame1: Layer = rows([
  '................',
  '.......oo.......',
  '......oS1o......',
  '.....oS1S1o.....',
  '.....oS2S1o.....',
  '......oS3o......',
  '......s1s1......',
  '.....s1s1s1.....',
  '....s1s1s1s1....',
  '....s1s1s1s1....',
  '....s1s1s1s1....',
  '.....s1s1s1.....',
  '.....s1s1s1.....',
  '.....s1s1s1.....',
  '.....s1s1s1.....',
  '....s1.. ..s1....',
  '...s1..s1..s1....',
  '...s1..s1..s1....',
  '...s1..s1..s1....',
  '...s1..s1..s1....',
  '....s1.s1.s1.....',
  '.....s1..s1......',
  '......s1s1.......',
  '......s1s1.......',
  '.......s1........'
]);

// Frame 2 (return / passing) slightly narrower
const bodyFrame2: Layer = rows([
  '................',
  '.......oo.......',
  '......oS1o......',
  '.....oS1S1o.....',
  '.....oS2S1o.....',
  '......oS3o......',
  '......s1s1......',
  '.....s1s1s1.....',
  '....s1s1s1s1....',
  '....s1s1s1s1....',
  '....s1s1s1s1....',
  '.....s1s1s1.....',
  '.....s1s1s1.....',
  '.....s1s1s1.....',
  '.....s1s1s1.....',
  '....s1.. ..s1....',
  '...s1..... .s1...',
  '...s1..... .s1...',
  '...s1..... .s1...',
  '...s1..... .s1...',
  '....s1....s1.....',
  '.....s1..s1......',
  '.....s1..s1......',
  '......s1s1.......',
  '.......s1........'
]);

// Frame 3 (right step) mirror of frame1 pattern
const bodyFrame3: Layer = rows([
  '................',
  '.......oo.......',
  '......oS1o......',
  '.....oS1S1o.....',
  '.....oS2S1o.....',
  '......oS3o......',
  '......s1s1......',
  '.....s1s1s1.....',
  '....s1s1s1s1....',
  '....s1s1s1s1....',
  '....s1s1s1s1....',
  '.....s1s1s1.....',
  '.....s1s1s1.....',
  '.....s1s1s1.....',
  '.....s1s1s1.....',
  '....s1.. ..s1....',
  '....s1..s1..s1...',
  '....s1..s1..s1...',
  '....s1..s1..s1...',
  '....s1..s1..s1...',
  '.....s1.s1.s1....',
  '......s1..s1.....',
  '.......s1s1......',
  '.......s1s1......',
  '........s1.......'
]);

export const bodyFrames: Layer[] = [baseBody, bodyFrame1, bodyFrame2, bodyFrame3];

// Idle breathing (reuse base + slight variant)
// Idle breathing alt frame (легкое поднятие)
const bodyIdleFrame2: Layer = rows([
  '................',
  '.......oo.......',
  '......oS1o......',
  '.....oS1S1o.....',
  '.....oS2S1o.....',
  '......oS3o......',
  '.......oo.......',
  '......s1s1......',
  '.....s1s1s1.....',
  '....s1s1s1s1....',
  '....s1s1s1s1....',
  '....s1s1s1s1....',
  '.....s1s1s1.....',
  '.....s1s1s1.....',
  '.....s1..s1.....',
  '....s1....s1....',
  '....s1....s1....',
  '....s1....s1....',
  '.....s1..s1.....',
  '.....s1..s1.....',
  '......s1s1......',
  '......s1s1......',
  '.......s1.......',
  '................'
]);

// (bootsLayer defined later with full shape)

// Hooded race assets (correct definitions)
export const hoodedIdle: Layer = rows([
  '................',
  '......kkkKkk.....',
  '.....kkKKKKkk....',
  '....kkKKKKKKkk...',
  '....kkKKKKKKkk...',
  '.....kKKKKKk.....',
  '......kKKKk......',
  '.......kKk.......',
  '.......kKk.......',
  '.......kKk.......',
  '......kKKKk......',
  '......kKKKk......',
  '......kKKKk......',
  '......kKKKk......',
  '......kKKKk......',
  '......kKKKk......',
  '.....kKKKKKk.....',
  '.....kKKKKKk.....',
  '.....kKKKKKk.....',
  '......kKKKk......',
  '......kKKKk......',
  '.......kKk.......',
  '........k........',
  '................'
]);

export const hoodedWalkFrames: Layer[] = [
  hoodedIdle,
  rows([
    '................','......kkkKkk.....','.....kkKKKKkk....','....kkKKKKKKkk...','....kkKKKKKKkk...','.....kKKKKKk.....','......kKKKk......','.......kKk.......','.......kKk.......','.......kKk.......','......kKKKk......','......kKKKk......','......kKKKk......','......kKKKk......','......kKKKk......','......kKKKk......','.....kKKKKKk.....','.....kKKKKKk.....','.....kKKKKKk.....','......kKKKk......','......kKKKk......','.......kKk.......','......kK.k.......','................'
  ]),
  rows([
    '................','......kkkKkk.....','.....kkKKKKkk....','....kkKKKKKKkk...','....kkKKKKKKkk...','.....kKKKKKk.....','......kKKKk......','.......kKk.......','.......kKk.......','.......kKk.......','......kKKKk......','......kKKKk......','......kKKKk......','......kKKKk......','......kKKKk......','......kKKKk......','.....kKKKKKk.....','.....kKKKKKk.....','.....kKKKKKk.....','......kKKKk......','......kKKKk......','......kK.k.......','.......kKk.......','................'
  ]),
  rows([
    '................','......kkkKkk.....','.....kkKKKKkk....','....kkKKKKKKkk...','....kkKKKKKKkk...','.....kKKKKKk.....','......kKKKk......','.......kKk.......','.......kKk.......','.......kKk.......','......kKKKk......','......kKKKk......','......kKKKk......','......kKKKk......','......kKKKk......','......kKKKk......','.....kKKKKKk.....','.....kKKKKKk.....','.....kKKKKKk.....','......kKKKk......','......kKKKk......','.......kKk.......','........k........','................'
  ])
];

export const hoodedEyesLayer: Layer = rows([
  '................',
  '................',
  '................',
  '................',
  '......ee.ee.....',
  '......EE.EE.....',
  '......ee.ee.....',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................'
]);

// Simple cloak back layer (c/C shading)
const cloakBack: Layer = rows([
  '................',
  '................',
  '................',
  '...... cCc ......',
  '..... cCCCc .....',
  '..... cCCCc .....',
  '..... cCCCc .....',
  '..... cCCCc .....',
  '..... cCCCc .....',
  '..... cCCCc .....',
  '..... cCCCc .....',
  '..... cCCCc .....',
  '..... cCCCc .....',
  '..... cCCCc .....',
  '..... cCCCc .....',
  '..... cCCCc .....',
  '...... cCc ......',
  '....... c .......',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................'
]);

// Simple plate armor torso overlay (16x24 region) using a/A/d shades
const armorTorsoPlate: Layer = rows([
  '................',
  '................',
  '................',
  '................',
  '.......aAa......',
  '......aAAAAa.....',
  '......aAAAAa.....',
  '......aAAAAa.....',
  '......aAAAAa.....',
  '......aAAAAa.....',
  '......aAddAa.....',
  '......aAddAa.....',
  '......aAAAAa.....',
  '.......aAAa......',
  '........aa.......',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................'
]);

// Animation set prototype (idle + walk) still at 16x24; future: widen to 32x48
export const defaultAnimationSet: AnimationSet = {
  idle: [baseBody, bodyIdleFrame2].map(f => [f]),
  walk: bodyFrames.map(f => [f])
};

export const eyes: Layer = rows([
  '................',
  '...... . . ......',
  '..... .i i. .....',
  '..... .i i. .....',
  '...... . . ......',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................'
]);

// Big body prototype (32x48 logical, но храним как 48 строк 32 пикселей; лишние точки = прозрачность)
// На основе присланного варианта: пока статичный (idle); для walk можно позже сделать расщепление ног
export const baseBodyBig: Layer = rows([
  '................................',
  '............oooooo..............',
  '..........oo.s1s1s1s1.oo........',
  '.........o.s1.i.i.s1.o..........',
  '.........o.s2s1s1s2.o...........',
  '..........oo.s3oo................',
  '............oooo................',
  '.......s2....TT....s2...........',
  '......s2...TTTTTT...s2..........',
  '......s2..TTTTTTTT..s2..........',
  '.......oTTTTTTTTTTo............',
  '.......oTTTTTTTTTTo............',
  '.......oTTTTTTTTTTo............',
  '.......oTTTTTTTTTTo............',
  '........oTTTTTTTTo.............',
  '.........oTTTTTo...............',
  '..........oooo.................',
  '.........oBBBBBo...............',
  '........oBBBBBBBBBo............',
  '........oBBBBBBBBBo............',
  '........oBBBBBBBBBo............',
  '.........oBBBBBBo..............',
  '..........oBBBBo...............',
  '..........oaaaao...............',
  '.........oaaaaaa.o.............',
  '.........oaaaaaa.o.............',
  '..........oooooo...............',
  '..........s1..s1...............',
  '..........s1..s1...............',
  '..........s1..s1...............',
  '..........s1..s1...............',
  '..........s1..s1...............',
  '..........s1..s1...............',
  '..........s1..s1...............',
  '..........s1..s1...............',
  '..........s1..s1...............',
  '..........s1..s1...............',
  '..........s1..s1...............',
  '..........s1..s1...............',
  '..........s1..s1...............',
  '..........s1..s1...............',
  '..........s1..s1...............',
  '..........s1..s1...............',
  '...........s1s1................',
  '...........s1s1................',
  '............s1.................',
  '............s1.................',
  '................................'
]);

export const hairShort: Layer = rows([
  '................',
  '....hhhhhhhh....',
  '...hhhhhhhhhh...',
  '...hhh hhhhhh...',
  '...hhh hhhhhh...',
  '....hhh hhhh....',
  '....hh  hhhh....',
  '....hh  hhhh....',
  '....hhh hhhh....',
  '.....hhhhhhh....',
  '......hhhhh.....',
  '.......hhh......',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................'
]);

export const hairLongBraid: Layer = rows([
  '....hhhhhhhh....',
  '...hhhhhhhhhh...',
  '...hhhhhhhhhhh..',
  '...hhh hhhhhhh..',
  '...hhh hhhhhhh..',
  '....hhh hhhhh...',
  '....hh  hhhhh...',
  '....hh  hhhhh...',
  '....hhh hhhhh...',
  '.....hhhhhhhh...',
  '......hhhhhhh...',
  '.......hhhhhh...',
  '........hhh.h...',
  '........hhh.h...',
  '........hhh.h...',
  '........hhh.h...',
  '.........hh.h...',
  '.........hh.h...',
  '.........hh.h...',
  '.........hh.h...',
  '..........h.h...',
  '..........h.h...',
  '..........h.h...',
  '..........h.h...'
]);

export const topLeaf: Layer = rows([
  '................',
  '................',
  '................',
  '................',
  '................',
  '......tttt......',
  '.....tttTTt.....',
  '....ttTTTTtt....',
  '....ttTTTTtt....',
  '....tttTTttt....',
  '.....tttttt.....',
  '......tttt......',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................'
]);

export const bottomLeaf: Layer = rows([
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '......bbbbb.....',
  '.....bBBBBBb....',
  '.....bBBBBBb....',
  '.....bBBBBBb....',
  '......bbbbb.....',
  '......bb.bb.....',
  '......bb.bb.....',
  '......bb.bb.....',
  '......bb.bb.....',
  '.......b..b.....',
  '................',
  '................',
  '................',
  '................'
]);

export const accessoryFlower: Layer = rows([
  '................',
  '.......rRr......',
  '......RrrR......',
  '.......rRr......',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................'
]);

export interface SpriteOptions {
  skinTone?: 'light'|'tan'|'dark';
  hairStyle?: 'short'|'long';
  hairColor?: string; // hex
  eyeColor?: string; // hex
  top?: 'leaf'|null;
  bottom?: 'leaf'|null;
  accessory?: 'flower'|null;
  armor?: 'plate'|null; // new optional armor
  cloak?: 'cape'|null; // new optional cloak
  beard?: boolean; // борода
  hood?: boolean;  // капюшон
  race?: 'human'|'hooded';
  scale?: number; // output scale
}

const skinPalettes: Record<string,[string,string,string]> = {
  light: ['#F6D7B5','#E6B989','#C98E61'],
  tan: ['#E8C49A','#D3A877','#AF7C48'],
  dark: ['#C18F5E','#9E6B3F','#774721']
};

const defaultOpts: Required<SpriteOptions> = {
  skinTone: 'light', hairStyle: 'short', hairColor: '#35964A', eyeColor: '#3A7ACF', top: 'leaf', bottom: 'leaf', accessory: 'flower', armor: 'plate', cloak: null, beard: true, hood: true, race: 'human', scale: 3
};

// ---------------- Дополнительные слои для chibi-персонажа с бородой и капюшоном ----------------
// Размер базовых слоёв по-прежнему 16x24 (будут центрированы внутри 32x48)
export const hoodLayer: Layer = rows([
  '................',
  '.......hh.......',
  '......hhHh......',
  '.....hhHHHh.....',
  '.....hhHHHh.....',
  '......hHHh......',
  '.......hh.......',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................'
]);

export const beardLayer: Layer = rows([
  '................',
  '................',
  '......dddd......',
  '.....dDDDDd.....',
  '.....dDDDDd.....',
  '......dDDd......',
  '.......dd.......',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................'
]);

export const beltLayer: Layer = rows([
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '.....lllllll....',
  '.....lGGGl l....',
  '.....lllllll....',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................'
]);

export const pantsLayer: Layer = rows([
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '.....p1..p1.....',
  '.....p1..p1.....',
  '.....p1..p1.....',
  '.....p1..p1.....',
  '.....p1..p1.....',
  '.....p1..p1.....',
  '......p1p1......',
  '......p1p1......',
  '.......p1.......',
  '................'
]);

export const bootsLayer: Layer = rows([
  '................',
  '......kkkKkk.....',
  '.....kkKKKKkk....',
  '....kkKKKKKKkk...',
  '....kkKKKKKKkk...',
  '.....kKKKKKk.....',
  '......kKKKk......',
  '.......kKk.......',
  '.......kKk.......',
  '.......kKk.......',
  '......kKKKk......',
  '......kKKKk......',
  '......kKKKk......',
  '......kKKKk......',
  '......kKKKk......',
  '......kKKKk......',
  '.....kKKKKKk.....',
  '.....kKKKKKk.....',
  '.....kKKKKKk.....',
  '......kKKKk......',
  '......kKKKk......',
  '.......kKk.......',
  '........k........',
  '................'
]);

function resolveLayers(o: Required<SpriteOptions>, frame = 0, anim: 'idle'|'walk' = 'walk'): Layer[] {
  let base: Layer;
  if (o.race === 'hooded') {
    base = anim === 'walk' ? hoodedWalkFrames[frame % hoodedWalkFrames.length] : hoodedIdle;
    const layers: Layer[] = [base, hoodedEyesLayer]; // glowing eyes above
    if (o.cloak === 'cape') layers.unshift(cloakBack);
    return layers;
  }

  if (anim === 'idle' && o.armor === 'plate') {
    base = baseBodyBig; // bigger idle pose
  } else {
    const bodyArray = anim === 'walk' ? bodyFrames : [baseBody, bodyIdleFrame2];
    base = bodyArray[frame % bodyArray.length];
  }

  const layers: Layer[] = [base, eyes];
  if (o.cloak === 'cape') layers.unshift(cloakBack); // backmost
  if (o.hood) layers.push(hoodLayer); // optional hood (behind hair but above body)
  if (o.armor === 'plate') layers.push(armorTorsoPlate);
  layers.push(pantsLayer);
  layers.push(beltLayer);
  if (o.beard) layers.push(beardLayer);
  layers.push(bootsLayer);
  if (o.hairStyle === 'short') layers.push(hairShort); else layers.push(hairLongBraid);
  if (o.top === 'leaf') layers.push(topLeaf);
  if (o.bottom === 'leaf') layers.push(bottomLeaf);
  if (o.accessory === 'flower') layers.push(accessoryFlower);
  return layers;
}

export function composeSprite(opts: SpriteOptions = {}, frame = 0, anim: 'idle'|'walk' = 'walk'): HTMLCanvasElement {
  const o: Required<SpriteOptions> = { ...defaultOpts, ...opts } as any;
  const layers = resolveLayers(o, frame, anim);
  const w = SPRITE_W, h = SPRITE_H;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const [skin1, skin2, skin3] = skinPalettes[o.skinTone];
  const colorMap: Record<string,string> = {
    o: '#111111',
    s1: o.race==='hooded' ? '#1E1E26' : skin1,
    s2: o.race==='hooded' ? '#18181F' : skin2,
    s3: o.race==='hooded' ? '#141419' : skin3,
    h: o.hairColor,
    t: '#2E9F5D',
    T: '#37B96E',
    b: '#2E9F5D',
    B: '#37B96E',
    r: '#C6263E',
    R: '#F0455F',
    i: o.eyeColor,
    e: '#FFFFFF',
    a: '#5F6E78', // armor mid
    A: '#8FA2AF', // armor light
    d: '#3E4A52', // armor dark (и тень бороды / plate shadow)
    c: '#6A1D23', // cloak mid
    C: '#8F2A32', // cloak light
    // hood / cloth (reuse hairColor tinted or fixed palette)
    H: '#6E8FBF', // hood highlight
    D: '#49606D', // hood mid
    l: '#5A4022', // belt leather
    G: '#D7B449', // belt buckle gold
    p1: '#4E8655', // pants
    k1: '#2F2334'
  };
  if (o.race === 'hooded') {
    colorMap.e = '#CBE4FF';
    colorMap.E = '#FFFFFF';
    colorMap.k = '#222633';
    colorMap.K = '#30394A';
  }

  // Draw layers
  for (const layer of layers) {
    const layerHeight = layer.length;
    const layerWidth = layer.reduce((m,r)=> Math.max(m, r? r.length : 0), 0);
    const offsetX = Math.floor((w - layerWidth)/2);
    for (let y=0;y<layerHeight;y++) {
      const row = layer[y]; if (!row) continue;
      for (let x=0;x<layerWidth;x++) {
        const token = row[x]; if (!token || token === '.') continue;
        const key = token;
        const col = colorMap[key] || colorMap['s1'];
        if (!col) continue;
        ctx.fillStyle = col;
        ctx.fillRect(offsetX + x, BODY_OFFSET_Y + y, 1, 1);
      }
    }
  }
  return canvas;
}

// Simple in-memory cache to avoid regenerating identical frames repeatedly
const cache = new Map<string,string>();

export function spriteDataUrl(opts: SpriteOptions = {}): string {
  return composeSprite(opts, 0, 'idle').toDataURL();
}

export function spriteDataUrlFrame(opts: SpriteOptions = {}, frame = 0, anim: 'idle'|'walk'='walk'): string {
  const key = JSON.stringify({opts, frame, anim});
  const hit = cache.get(key); if (hit) return hit;
  const url = composeSprite(opts, frame, anim).toDataURL();
  cache.set(key, url);
  return url;
}

export function getSpriteFrame(opts: SpriteOptions = {}, anim: 'idle'|'walk', frame: number): string {
  return spriteDataUrlFrame(opts, frame, anim);
}

// --- ГЕНЕРАТОР ПРОГРАММНОГО СПРАЙТА ---
// Пример: drawGeneratedSprite(canvas.getContext('2d'), { x: 16, y: 24, angle: Math.PI/180*25, pose: 'walk', frame: 0, colors: {...} })

export interface GeneratedSpriteOptions {
  x: number;
  y: number;
  angle: number; // угол наклона (радианы)
  pose: 'idle'|'walk';
  frame: number; // номер кадра для анимации
  colors: {
    body: string;
    head: string;
    arms: string;
    legs: string;
    eyes: string;
  };
}

export function drawGeneratedSprite(ctx: CanvasRenderingContext2D, opts: GeneratedSpriteOptions) {
  ctx.save();
  ctx.translate(opts.x, opts.y);
  ctx.rotate(opts.angle);

  // Анимация шага (простая синусоида)
  const t = opts.frame;
  const legSwing = opts.pose === 'walk' ? Math.sin(t * 0.2) * 12 : 0;
  const armSwing = opts.pose === 'walk' ? Math.sin(t * 0.2 + Math.PI) * 10 : 0;

  // Тело
  ctx.fillStyle = opts.colors.body;
  ctx.fillRect(-8, -24, 16, 32);

  // Голова
  ctx.beginPath();
  ctx.arc(0, -32, 10, 0, Math.PI*2);
  ctx.fillStyle = opts.colors.head;
  ctx.fill();

  // Глаза
  ctx.beginPath();
  ctx.arc(-4, -34, 2, 0, Math.PI*2);
  ctx.arc(4, -34, 2, 0, Math.PI*2);
  ctx.fillStyle = opts.colors.eyes;
  ctx.fill();

  // Левая рука
  ctx.save();
  ctx.rotate(armSwing * Math.PI/180);
  ctx.fillStyle = opts.colors.arms;
  ctx.fillRect(-14, -18, 6, 20);
  ctx.restore();

  // Правая рука
  ctx.save();
  ctx.rotate(-armSwing * Math.PI/180);
  ctx.fillStyle = opts.colors.arms;
  ctx.fillRect(8, -18, 6, 20);
  ctx.restore();

  // Левая нога
  ctx.save();
  ctx.rotate(legSwing * Math.PI/180);
  ctx.fillStyle = opts.colors.legs;
  ctx.fillRect(-6, 8, 6, 18);
  ctx.restore();

  // Правая нога
  ctx.save();
  ctx.rotate(-legSwing * Math.PI/180);
  ctx.fillStyle = opts.colors.legs;
  ctx.fillRect(0, 8, 6, 18);
  ctx.restore();

  ctx.restore();
}
// --- конец генератора ---
