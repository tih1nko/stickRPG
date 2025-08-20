import {AnimationSet, ComposeOptions, Palette, SpriteDefinition} from '../core/types';
import {buildBasePalette} from '../core/palette';

const SPRITE_W=32, SPRITE_H=48, BODY_OFFSET_Y=0;

export function compose(def: SpriteDefinition, opts: ComposeOptions): HTMLCanvasElement {
  // Sheet shortcut: if sheet provided and has requested animation
  if (def.sheet) {
    const {sheet} = def;
    const animFrames = sheet.animations[opts.anim as string];
    if (animFrames) {
      const idx = animFrames[opts.frame % animFrames.length];
      const layout = sheet.layout || 'fixed';
      (window as any).__SPR_SHEET_CACHE = (window as any).__SPR_SHEET_CACHE || {};
      const cache = (window as any).__SPR_SHEET_CACHE as Record<string, HTMLImageElement>;
      let img = cache[sheet.src];
      // Авто-генерация frames для variable если ещё нет
      const ensureVariableFrames = (imgEl: HTMLImageElement) => {
        if (layout !== 'variable') return;
        if (sheet.frames && sheet.frames.length) return;
        const frames: any[] = [];
        // проходим по всем индексам 0..total-1 на сетке
        for (let fi=0; fi<sheet.total; fi++) {
          const col = fi % sheet.columns; const row = Math.floor(fi / sheet.columns);
          // копируем исходный квадрат
          const t = document.createElement('canvas'); t.width = sheet.frameW; t.height = sheet.frameH; const tctx = t.getContext('2d')!;
            tctx.drawImage(imgEl, col*sheet.frameW, row*sheet.frameH, sheet.frameW, sheet.frameH, 0,0,sheet.frameW,sheet.frameH);
          const idata = tctx.getImageData(0,0,sheet.frameW,sheet.frameH);
          let minX=sheet.frameW, minY=sheet.frameH, maxX=-1, maxY=-1;
          for (let y=0;y<sheet.frameH;y++) {
            for (let x=0;x<sheet.frameW;x++) {
              const i=(y*sheet.frameW + x)*4; if (idata.data[i+3]>10) { // непрозрачный
                if (x<minX) minX=x; if (y<minY) minY=y; if (x>maxX) maxX=x; if (y>maxY) maxY=y;
              }
            }
          }
          if (maxX<minX || maxY<minY) { // пусто
            minX=0; minY=0; maxX=sheet.frameW-1; maxY=sheet.frameH-1;
          }
          // padding
          const pad=1; minX=Math.max(0,minX-pad); minY=Math.max(0,minY-pad); maxX=Math.min(sheet.frameW-1,maxX+pad); maxY=Math.min(sheet.frameH-1,maxY+pad);
          const w=maxX-minX+1, h=maxY-minY+1;
          // baseline вычислим как самая нижняя непрозрачная точка (maxY)
          const pivotX = Math.round((minX+maxX)/2) - minX; // центр bbox
          const pivotY = h - 1 - ( (sheet.frameH-1 - maxY) ); // локальная координата baseline (нижняя точка bbox)
          // Определяем к какой анимации принадлежит fi
          let animName='';
          for (const k of Object.keys(sheet.animations)) {
            if (sheet.animations[k].includes(fi)) { animName=k; break; }
          }
          frames.push({ id: animName+'_'+fi, x: col*sheet.frameW + minX, y: row*sheet.frameH + minY, w, h, pivotX, pivotY, anim: animName, ord: (sheet.animations[animName]||[]).indexOf(fi) });
        }
        sheet.frames = frames;
      };
      const keyProcess = (srcCtx: CanvasRenderingContext2D) => {
        const keyColors = (sheet.keyColors && sheet.keyColors.length ? sheet.keyColors : (() => {
          const d = srcCtx.getImageData(0,0,srcCtx.canvas.width,srcCtx.canvas.height);
          const W = srcCtx.canvas.width, H = srcCtx.canvas.height;
          const pick = (x:number,y:number) => { const i=(y*W + x)*4; return [d.data[i],d.data[i+1],d.data[i+2],d.data[i+3]]; };
          const toHex=(r:number,g:number,b:number)=> r.toString(16).padStart(2,'0')+g.toString(16).padStart(2,'0')+b.toString(16).padStart(2,'0');
          const corners = [pick(0,0), pick(W-1,0), pick(0,H-1), pick(W-1,H-1)].map(([r,g,b])=> toHex(r,g,b));
          return Array.from(new Set(corners));
        })()).map((c:string)=> c.replace('#','').toLowerCase());
        if (keyColors.length) {
          const id = srcCtx.getImageData(0,0,srcCtx.canvas.width,srcCtx.canvas.height);
          for (let i=0;i<id.data.length;i+=4) {
            const r=id.data[i], g=id.data[i+1], b=id.data[i+2];
            const hex=(r.toString(16).padStart(2,'0')+g.toString(16).padStart(2,'0')+b.toString(16).padStart(2,'0')).toLowerCase();
            if (keyColors.includes(hex)) id.data[i+3]=0;
          }
          srcCtx.putImageData(id,0,0);
        }
      };
      const drawFixed = () => {
        const crop = sheet.crop || {x:0,y:0,w:sheet.frameW,h:sheet.frameH};
        const targetLogicalH = crop.h;
        const baseScale = opts.targetHeight ? (opts.targetHeight / targetLogicalH) : (opts.scale || 1);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(crop.w * baseScale); canvas.height = Math.round(crop.h * baseScale);
        const ctx = canvas.getContext('2d')!;
        const col = idx % sheet.columns; const row = Math.floor(idx / sheet.columns);
        const tmp = document.createElement('canvas'); tmp.width = sheet.frameW; tmp.height = sheet.frameH; const tctx = tmp.getContext('2d')!;
        tctx.drawImage(img!, col*sheet.frameW, row*sheet.frameH, sheet.frameW, sheet.frameH, 0,0,sheet.frameW,sheet.frameH);
        keyProcess(tctx);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(tmp, crop.x, crop.y, crop.w, crop.h, 0,0,canvas.width,canvas.height);
        return canvas;
      };
      const drawVariable = () => {
        if (!sheet.frames) return drawFixed();
        const animName = opts.anim as string;
        const frames = sheet.frames.filter(f=> f.anim===animName).sort((a,b)=> a.ord-b.ord);
        const vf = frames[opts.frame % frames.length];
        if (!vf) return drawFixed();
        const targetLogicalH = vf.h;
        const baseScale = opts.targetHeight ? (opts.targetHeight / targetLogicalH) : (opts.scale || 1);
  const canvas = document.createElement('canvas');
  // Выравниваем по pivot: pivotY → нижняя линия
  const outH = Math.round(targetLogicalH * baseScale);
  const outW = Math.round(vf.w * baseScale);
  canvas.width = outW; canvas.height = outH; // простой вариант пока
  const ctx = canvas.getContext('2d')!;
        const tmp = document.createElement('canvas'); tmp.width = vf.w; tmp.height = vf.h; const tctx = tmp.getContext('2d')!;
        tctx.drawImage(img!, vf.x, vf.y, vf.w, vf.h, 0,0,vf.w,vf.h);
        keyProcess(tctx);
        ctx.imageSmoothingEnabled = false;
  // Отрисуем так, чтобы pivotY попал на низ outH
  ctx.drawImage(tmp, 0,0,vf.w,vf.h, 0, Math.round(outH - vf.h*baseScale), outW, Math.round(vf.h*baseScale));
        return canvas;
      };
      const perform = () => layout==='variable'? drawVariable(): drawFixed();
      if (!img) {
  img = new Image(); img.src = sheet.src; cache[sheet.src]=img; const ph=document.createElement('canvas'); ph.width=1;ph.height=1; img.onload=()=>{ ensureVariableFrames(img!); }; return ph;
      } else if (img.complete) {
  ensureVariableFrames(img);
        return perform();
      } else {
  const ph=document.createElement('canvas'); ph.width=1;ph.height=1; img.onload=()=>{ ensureVariableFrames(img!); }; return ph;
      }
    }
  }
  const {frame, anim} = opts;
  const merged: any = {...def.base};
  if (opts.overrides) {
    for (const k of Object.keys(opts.overrides)) {
      const v = (opts.overrides as any)[k];
      if (v) merged[k]=v;
    }
  }
  const set: AnimationSet = merged;
  const animFrames = set[anim] || set.idle;
  const baseFrame = animFrames[frame % animFrames.length];
  const layers = [baseFrame];
  if (opts.equipped) for (const key of opts.equipped) {
    const l = def.layers[key];
    if (!l) continue;
    if (Array.isArray(l[0])) { // animation
      const animL = l as any as AnimationSet[keyof AnimationSet];
      layers.push(animL[frame % animL.length]);
    } else layers.push(l as any);
  }
  const palette: Palette = buildBasePalette({skin: opts.skin||'light', hair: opts.hair, eye: opts.eye});
  const canvas = document.createElement('canvas');
  canvas.width = SPRITE_W; canvas.height = SPRITE_H;
  const ctx = canvas.getContext('2d')!;
  for (const layer of layers) {
    for (let y=0;y<layer.length;y++) {
      const row = layer[y]; if (!row) continue;
      for (let x=0;x<row.length;x++) {
        const tk = row[x]; if (!tk || tk==='.') continue;
        const col = palette[tk] || palette.s1;
        ctx.fillStyle = col;
        ctx.fillRect(x, BODY_OFFSET_Y + y, 1, 1);
      }
    }
  }
  return canvas;
}
