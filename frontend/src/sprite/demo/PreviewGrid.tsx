import React from 'react';
import {humanDef} from '../anim/animSets';
import {compose} from '../render/compose';

export const PreviewGrid: React.FC = () => {
  const frames = humanDef.base.walk.length;
  const items: string[] = [];
  for (let f=0; f<frames; f++) {
    const canvas = compose(humanDef, {frame:f, anim:'walk', skin:'light'});
    items.push(canvas.toDataURL());
  }
  return <div style={{display:'flex', gap:8}}>{items.map((src,i)=>(<img key={i} src={src} alt={`walk frame ${i}`} width={64} height={96}/>))}</div>;
};
