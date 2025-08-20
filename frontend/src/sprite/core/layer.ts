import {Layer} from './types';

export function rows(lines: string[]): Layer {
  return lines.map(l => {
    const out: string[] = [];
    for (let i=0;i<l.length;i++) {
      const c = l[i];
      if (c===' ') continue;
      if (c==='s' && /[123]/.test(l[i+1]||'')) { out.push('s'+l[++i]); continue; }
      if (c==='w' && /[12]/.test(l[i+1]||'')) { out.push('w'+l[++i]); continue; }
      out.push(c);
    }
    return out;
  });
}

export function emptyLayer(w=32,h=48): Layer {
  const r: Layer = [];
  for (let y=0;y<h;y++) r.push(new Array(w).fill('.'));
  return r;
}
