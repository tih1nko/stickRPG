// --- Новые примитивы ---
function drawCircle(png, cx, cy, r, col){
  for(let y=-r; y<=r; y++)
    for(let x=-r; x<=r; x++)
      if(x*x + y*y <= r*r) px(png, cx+x, cy+y, col);
}

function drawEllipse(png, cx, cy, rx, ry, col){
  for(let y=-ry; y<=ry; y++){
    const xr = Math.round(rx * Math.sqrt(1 - (y*y)/(ry*ry)));
    for(let x=-xr; x<=xr; x++) px(png, cx+x, cy+y, col);
  }
}

function drawEllipseO(png, cx, cy, rx, ry, fill, outline){
  for(let a=0; a<360; a+=2){
    const rad = a*Math.PI/180;
    const x = Math.round(cx + rx*Math.cos(rad));
    const y = Math.round(cy + ry*Math.sin(rad));
    px(png, x, y, outline);
  }
  drawEllipse(png, cx, cy, Math.max(0,rx-1), Math.max(0,ry-1), fill);
}

function drawCapsule(png, x1,y1, x2,y2, r, col){
  drawLineThick(png, x1,y1, x2,y2, r*2, col);
  drawCircle(png, Math.round(x1), Math.round(y1), r, col);
  drawCircle(png, Math.round(x2), Math.round(y2), r, col);
}

function drawCapsuleO(png, x1,y1, x2,y2, r, fill, outline){
  drawCapsule(png, x1,y1, x2,y2, r+1, outline);
  drawCapsule(png, x1,y1, x2,y2, r,   fill);
}

function drawTaperedBone(png, x1,y1, x2,y2, rStart, rEnd, fill, outline, steps= Math.max(6, Math.hypot(x2-x1, y2-y1)|0)){
  for(let i=0;i<=steps;i++){
    const t = i/steps;
    const x = x1 + (x2-x1)*t;
    const y = y1 + (y2-y1)*t;
    const r = Math.max(1, Math.round(rStart + (rEnd - rStart)*t));
    drawCircle(png, Math.round(x), Math.round(y), r+1, outline);
    drawCircle(png, Math.round(x), Math.round(y), r,   fill);
  }
}

function limb2(x0,y0, len1,len2, angDeg, bendDeg){
  const knee = polar(x0,y0, len1, angDeg + bendDeg);
  const foot = polar(knee.x, knee.y, len2, angDeg - bendDeg);
  return { knee, foot };
}

function drawHead(png, cx, topY, wNear, wFar, h, pal, nearFn, farFn){
  const cy = topY + Math.round(h/2);
  drawEllipseO(png, cx-3, cy, Math.round((wFar)/2), Math.round(h/2), farFn(pal.skin), pal.outline);
  drawEllipseO(png, cx+3, cy, Math.round((wNear)/2), Math.round(h/2), nearFn(pal.skin), pal.outline);
  drawEllipse(png, cx, topY+2, Math.round((wNear+wFar)/2), 2, nearFn(pal.hair));
  rect(png, cx - Math.round(wNear*0.4), topY+1, Math.round(wNear*0.8), 1, shade(pal.hair,1.25));
  px(png, cx-4, cy+1, [40,28,18,255]);
  px(png, cx+3, cy,   [0,0,0,255]);
}

function drawTorsoTapered(png, cx, topY, h, wTopNear, wTopFar, wBotNear, wBotFar, pal, nearFn, farFn){
  for(let i=0;i<h;i++){
    const y = topY + i;
    const t = i/(h-1);
    const wFar  = Math.round((wTopFar  + (wBotFar  - wTopFar )*t));
    const wNear = Math.round((wTopNear + (wBotNear - wTopNear)*t));
    rect(png, cx-1 - wFar, y, wFar, 1, farFn(pal.cloth));
    rect(png, cx, y, wNear, 1, nearFn(pal.cloth));
    if (i > h*0.55){
      rect(png, cx-1 - wFar, y, wFar + wNear+1, 1, shade(pal.cloth,0.93));
    }
  }
  for(let i=0;i<h;i++){
    const y = topY + i;
    const t = i/(h-1);
    const wFar  = Math.round((wTopFar  + (wBotFar  - wTopFar )*t));
    const wNear = Math.round((wTopNear + (wBotNear - wTopNear)*t));
    px(png, cx-1 - wFar, y, pal.outline);
    px(png, cx + wNear,  y, pal.outline);
  }
}

function groundShadow(png, x,y, w,h, col){ drawEllipse(png, Math.round(x), Math.round(y), w, h, col); }
/* human_standard64.png (32 frames, 64x96 each) — stylized half-turn with key poses */
const { PNG } = require('pngjs');
const fs = require('fs');

const FRAME_W = 64, FRAME_H = 96;
const COLS = 8, ROWS = 4, TOTAL = 32;
const OUT_W = FRAME_W * COLS, OUT_H = FRAME_H * ROWS;

// Animation groups by index:
// idle 0-3, walk 4-11, attack 12-15, cast 16-19, hurt 20-21, death 22-27, crit 28-31

// Palette
const colors = {
  skin:   [210,160,120],
  cloth:  [180,180,185],
  hair:   [90,55,25],
  metal:  [200,210,230],
  fx:     [255,230,120],
  outline:[70,40,20]
};

function shade([r,g,b], k){ return [Math.min(255, r*k)|0, Math.min(255, g*k)|0, Math.min(255, b*k)|0]; }
function px(png,x,y,col){
  if(x<0||y<0||x>=png.width||y>=png.height) return;
  const i=(y*png.width+x)*4;
  png.data[i]=col[0]; png.data[i+1]=col[1]; png.data[i+2]=col[2]; png.data[i+3]=col[3]??255;
}
function rect(png,x,y,w,h,col){ for(let yy=0; yy<h; yy++) for(let xx=0; xx<w; xx++) px(png, x+xx, y+yy, col); }
function rectO(png,x,y,w,h,fill,outline){
  rect(png,x,y,w,h,fill);
  for(let xx=0; xx<w; xx++){ px(png,x+xx,y,outline); px(png,x+xx,y+h-1,outline); }
  for(let yy=0; yy<h; yy++){ px(png,x,y+yy,outline); px(png,x+w-1,y+yy,outline); }
}
function drawLineThick(png, x1,y1, x2,y2, thick, col){
  const dx = x2-x1, dy = y2-y1;
  const steps = Math.max(Math.abs(dx), Math.abs(dy))|0;
  const r = Math.max(0, (thick/2)|0);
  for(let s=0; s<=steps; s++){
    const t = steps===0 ? 0 : s/steps;
    const x = Math.round(x1 + dx*t);
    const y = Math.round(y1 + dy*t);
    rect(png, x-r, y-r, r*2+1, r*2+1, col);
  }
}
// outline-first, then fill (fake stroke)
function drawBone(png, x1,y1, x2,y2, thick, fill, outline){
  drawLineThick(png, x1,y1, x2,y2, Math.max(1,thick+2), outline);
  drawLineThick(png, x1,y1, x2,y2, thick, fill);
}

// Small rounded joint embellishment
function roundedJoint(png, x, y, col){
  px(png, x, y, col);
  px(png, x+1, y, shade(col,0.9));
  px(png, x-1, y, shade(col,0.9));
  px(png, x, y+1, shade(col,0.9));
  px(png, x, y-1, shade(col,0.9));
}

function deg(a){ return a * Math.PI / 180; }
function polar(x,y, len, angDeg){
  const a = deg(angDeg);
  return { x: x + Math.sin(a)*len, y: y + Math.cos(a)*len };
}

// High-level body drawing in half-turn with layering
function drawCharacter(png, cx, baseY, pose, k, pal){
  // --- Новые пропорции и функции ---
  const torsoH = 40, headH = 16, thighLen=14, shinLen=12, armLen=14;
  const near = c=>shade(c,1.12), far = c=>shade(c,0.88);
  const hipY = baseY - shinLen;
  const shoulderY = hipY - torsoH + 12;
  const farHipX = cx - 6, nearHipX = cx + 5;
  const torsoTopY = shoulderY;

  // Контртилт плеч/таза
  const P = poseParams(pose, k);
  const shoulderYNear = shoulderY + (P.shoulderTilt||0);
  const shoulderYFar  = shoulderY - (P.shoulderTilt||0);

  // --- Ноги ---
  const nearLeg = limb2(nearHipX, hipY + (P.legNearLift||0), thighLen, shinLen, P.legNearAng||88, P.kneeNearBend||12);
  const farLeg  = limb2(farHipX,  hipY + (P.legFarLift||0),  thighLen, shinLen, P.legFarAng||92,  P.kneeFarBend||12);
  drawTaperedBone(png, farHipX, hipY, farLeg.knee.x, farLeg.knee.y, 3, 2, far(pal.skin), pal.outline);
  drawTaperedBone(png, farLeg.knee.x, farLeg.knee.y, farLeg.foot.x, farLeg.foot.y, 2, 2, far(pal.skin), pal.outline);
  roundedJoint(png, Math.round(farLeg.knee.x), Math.round(farLeg.knee.y), far(pal.skin));
  drawTaperedBone(png, nearHipX, hipY, nearLeg.knee.x, nearLeg.knee.y, 4, 3, near(pal.skin), pal.outline);
  drawTaperedBone(png, nearLeg.knee.x, nearLeg.knee.y, nearLeg.foot.x, nearLeg.foot.y, 3, 2, near(pal.skin), pal.outline);
  roundedJoint(png, Math.round(nearLeg.knee.x), Math.round(nearLeg.knee.y), near(pal.skin));

  // --- Торс ---
  drawTorsoTapered(png, cx, torsoTopY, torsoH, 8,7, 6,5, pal, near, far);

  // --- Голова ---
  const headY = torsoTopY - headH + P.headLift;
  drawHead(png, cx, headY, 10, 8, headH, pal, near, far);

  // --- Руки ---
  const farShX = cx - 7 + P.torsoTwistXFar;
  const nearShX = cx + 7 + P.torsoTwistXNear;
  const farHand  = polar(farShX,  shoulderYFar  + (P.armFarLift||0),  armLen, P.armFarAng||95);
  const nearHand = polar(nearShX, shoulderYNear + (P.armNearLift||0), armLen, P.armNearAng||85);
  drawTaperedBone(png, farShX, shoulderYFar, farHand.x, farHand.y, 3, 2, far(pal.skin), pal.outline);
  drawTaperedBone(png, nearShX, shoulderYNear, nearHand.x, nearHand.y, 3, 2, near(pal.skin), pal.outline);

  // --- Тень под ногами ---
  const shadowCol = shade(colors.outline, 0.5);
  groundShadow(png, nearLeg.foot.x, nearLeg.foot.y+1, 6,2, shade(shadowCol,0.6));
  groundShadow(png, farLeg.foot.x,  farLeg.foot.y+1,  5,2, shade(shadowCol,0.5));

  // --- Оружие/эффекты/смерть ---
  if (P.weapon){
    drawWeapon(png, nearHand.x, nearHand.y, P.weaponAng, P.weaponLen, pal);
    const tip = polar(nearHand.x, nearHand.y, P.weaponLen, P.weaponAng);
    px(png, Math.round(tip.x), Math.round(tip.y), shade(pal.metal,1.4));
  }
  if (P.fx){
    const jittered = P.fx.map(f=>({
      x: f.x + (Math.random()<0.5?-1:1),
      y: f.y + (Math.random()<0.5?-1:1),
      col: f.col
    }));
    drawFX(png, jittered);
  }
  if (P.lie){
    drawDeathLying(png, cx, baseY, pal);
  }
}

function drawWeapon(png, hx, hy, ang, len, pal){
  const hilt = 3;
  // Outline pass
  drawBone(png, hx, hy, polar(hx,hy, len, ang).x, polar(hx,hy, len, ang).y, 5, pal.outline, pal.outline);
  // Blade
  drawBone(png, hx, hy, polar(hx,hy, len, ang).x, polar(hx,hy, len, ang).y, 3, shade(pal.metal,1.05), pal.outline);
  // Hilt
  rect(png, Math.round(hx)-hilt, Math.round(hy)-hilt, hilt*2+1, hilt*2+1, shade(pal.metal,0.9));
}

function drawFX(png, fxList){
  for(const f of fxList){
    px(png, Math.round(f.x), Math.round(f.y), f.col || colors.fx);
  }
}

function drawDeathLying(png, cx, baseY, pal){
  // simple flat silhouette (top-most)
  const y = baseY - 6;
  rect(png, cx-20, y, 40, 6, shade(pal.cloth,0.95));
  rect(png, cx-16, y-6, 12, 6, pal.hair);
  rectO(png, cx-18, y-12, 16, 6, pal.skin, pal.outline);
}

function poseParams(pose, k){
  // k: absolute frame index; derive local frame inside group
  let f=0, t=0;
  switch(pose){
    case 'idle':  f = k%4; t = f/4;
      return {
        torsoTwistXFar: -1, torsoTwistXNear: 1,
        torsoLeanY: Math.sin(t*2*Math.PI)*1,
        headLift: Math.sin(t*2*Math.PI+Math.PI/2)*1,
        legFarAng: -4, legNearAng: 4, legFarLift: 0, legNearLift: 0,
        armFarAng: -10 + Math.sin(t*2*Math.PI)*4, armNearAng: 12 - Math.sin(t*2*Math.PI)*4,
        armFarLift: 0, armNearLift: 0
      };
    case 'walk': f = (k-4)%8; t = f/8; {
      const phase = Math.sin(t*2*Math.PI);
      const opp   = Math.sin(t*2*Math.PI + Math.PI);
      const bob   = Math.sin(t*4*Math.PI)*1.6; // stronger bob
      return {
        torsoTwistXFar: -1.5, torsoTwistXNear: 1.5,
        torsoLeanY: bob,
        headLift: -bob*0.65,
        legFarAng:  18*phase, legNearAng: 18*opp,
        legFarLift: -Math.abs(phase)*1.2, legNearLift: -Math.abs(opp)*1.2,
        armFarAng: -22*opp, armNearAng: -22*phase,
        armFarLift: -Math.abs(opp)*1.2, armNearLift: -Math.abs(phase)*1.2,
        nearEnlarge: 0.5
      };
    }
  case 'attack': f = (k-12)%4; {
      // 0: windup, 1: strike, 2: follow, 3: settle
      const table = [
    { armNearAng: -50, armNearLift: -3, weapon: true, weaponAng: -55, weaponLen: 26, torsoTwistXNear: 3, torsoTwistXFar:-3, torsoLeanY: 0, armFarAng: 24, armFarLift:3, legNearAng:8, legFarAng:-8 },
    { armNearAng:  48, armNearLift: -5, weapon: true, weaponAng:  40, weaponLen: 29, torsoTwistXNear: 4, torsoTwistXFar:-4, torsoLeanY: 1, armFarAng:-14, armFarLift:2, legNearAng:-5, legFarAng:5 },
    { armNearAng:  24, armNearLift: -1, weapon: true, weaponAng:  24, weaponLen: 29, torsoTwistXNear: 3, torsoTwistXFar:-3, torsoLeanY: 1, armFarAng:-8,  armFarLift:1, legNearAng:-2, legFarAng:2 },
    { armNearAng:  12, armNearLift:  0, weapon: true, weaponAng:  18, weaponLen: 26, torsoTwistXNear: 2, torsoTwistXFar:-2, torsoLeanY: 0, armFarAng:-3,  armFarLift:0, legNearAng: 0, legFarAng:0 },
      ];
      return Object.assign({
    headLift: 0, legFarLift: 0, legNearLift: 0, nearEnlarge: 1
      }, table[f]);
    }
    case 'cast': f = (k-16)%4; t = f/3; {
      const raise = -12; // lift hands upward
      const up = -3;
      const spark = (step)=>[
        {x:+8, y:-42, col: colors.fx},
        {x:+10,y:-40, col: shade(colors.fx,0.9)},
        {x:+6, y:-38, col: shade(colors.fx,1.1)},
      ].map(p=>({x:p.x, y:p.y - step, col:p.col}));
      const base = {
        torsoTwistXNear: 1, torsoTwistXFar:-1,
        torsoLeanY: up, headLift: -1,
        armNearAng: -60, armFarAng: 60, armNearLift: raise, armFarLift: raise,
        legNearAng: 2, legFarAng:-2, legNearLift:0, legFarLift:0
      };
      if (f===0) return Object.assign({}, base, { fx: spark(0) });
      if (f===1) return Object.assign({}, base, { fx: spark(1) });
      if (f===2) return Object.assign({}, base, { fx: spark(2) });
      return Object.assign({}, base, { fx: spark(1) });
    }
    case 'hurt': f = (k-20)%2;
      return {
        torsoTwistXNear: -1, torsoTwistXFar:1,
        torsoLeanY: 2, headLift: 2,
        armNearAng: 25, armFarAng: -25, armNearLift: 1, armFarLift: 1,
        legNearAng: -6, legFarAng: 6, legNearLift: 1, legFarLift: 1
      };
    case 'death': f = (k-22)%6; {
      if (f<=2){
        // stagger -> collapse
        return {
          torsoTwistXNear: -2+f, torsoTwistXFar:2-f,
          torsoLeanY: 2+f*1.5, headLift: 3+f,
          armNearAng: 30, armFarAng: -30, armNearLift: 2, armFarLift: 2,
          legNearAng: -8, legFarAng: 8, legNearLift: 2, legFarLift: 2
        };
      } else if (f<=4){
        // fall down
        const drop = (f-2)*6;
        return {
          torsoTwistXNear: 0, torsoTwistXFar:0,
          torsoLeanY: drop, headLift: drop,
          armNearAng: 50, armFarAng: -50, armNearLift: 4, armFarLift: 4,
          legNearAng: 0, legFarAng: 0, legNearLift: 4, legFarLift: 4
        };
      } else {
        // lie on ground
        return { lie:true,
          torsoTwistXNear: 0, torsoTwistXFar:0,
          torsoLeanY: 40, headLift: 40,
          armNearAng: 0, armFarAng: 0, armNearLift: 0, armFarLift: 0,
          legNearAng: 0, legFarAng: 0, legNearLift: 0, legFarLift: 0
        };
      }
    }
    case 'crit': f = (k-28)%4; {
      const spark = i => ([
        {x:+14, y:-40, col: colors.fx},
        {x:+15, y:-41, col: shade(colors.fx,0.85)},
        {x:+16, y:-39, col: shade(colors.fx,1.1)},
      ]).map(p=>({x:p.x, y:p.y - i, col:p.col}));
      const table = [
        { armNearAng:-30, armNearLift:-2, weapon:true, weaponAng:-25, weaponLen:30, torsoTwistXNear:3, torsoTwistXFar:-3, torsoLeanY:0, armFarAng:14, armFarLift:0, fx: spark(0) },
        { armNearAng: 35, armNearLift:-4, weapon:true, weaponAng: 35, weaponLen:32, torsoTwistXNear:4, torsoTwistXFar:-4, torsoLeanY:1, armFarAng:-8, armFarLift:0, fx: spark(1) },
        { armNearAng: 20, armNearLift:-2, weapon:true, weaponAng: 20, weaponLen:32, torsoTwistXNear:3, torsoTwistXFar:-3, torsoLeanY:1, armFarAng:-4, armFarLift:0, fx: spark(2) },
        { armNearAng: 10, armNearLift: 0, weapon:true, weaponAng: 10, weaponLen:30, torsoTwistXNear:2, torsoTwistXFar:-2, torsoLeanY:0, armFarAng:-2, armFarLift:0, fx: spark(1) },
      ];
      return table[f];
    }
    default: return {};
  }
}

function groupForIndex(i){
  if(i>=4 && i<=11) return 'walk';
  if(i>=12 && i<=15) return 'attack';
  if(i>=16 && i<=19) return 'cast';
  if(i>=20 && i<=21) return 'hurt';
  if(i>=22 && i<=27) return 'death';
  if(i>=28) return 'crit';
  return 'idle';
}

// Compose sheet
const sheet = new PNG({ width: OUT_W, height: OUT_H, filterType: 0 });
for(let i=0; i<TOTAL; i++){
  const fx = i % COLS, fy = Math.floor(i / COLS);
  const baseX = fx*FRAME_W, baseY = fy*FRAME_H + FRAME_H - 1;
  const cx = baseX + (FRAME_W>>1);

  const grp = groupForIndex(i);
  drawCharacter(sheet, cx, baseY, grp, i, colors);
}

const outPath = './public/sprites/human_standard64.png';
sheet.pack().pipe(fs.createWriteStream(outPath)).on('finish', ()=>{
  console.log('Generated styled human_standard64.png');
});
