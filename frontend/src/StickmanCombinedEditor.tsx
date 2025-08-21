import React, { useEffect, useRef, useState } from 'react';
import { Item } from './App'; // предполагаем экспорт Item (если нет, можно продублировать тип)

/*
 Объединённый редактор:
 - Редактирование скелетных кадров (walk/attack) как в StickmanEditor
 - Пиксельный слой (доп. дорисовки поверх скелета) 128x128
 - Привязка предмета из инвентаря к суставу (например, правая рука index=4)
 - Сохранение: возвращает { animations, overlayPixels, attachments }
 overlayPixels: Uint8 RGBA в base64 (или массив строк), для простоты: массив строк длиной 128 со 128 символами (#RRGGBB или '.' пусто)
 attachments: { jointIndex: number, itemId: string }[]
*/

const CANVAS_W = 128;
const CANVAS_H = 128;
// Базовый масштаб канвы (динамически адаптируем под ширину экрана)
// Физический размер канвы остаётся 128x128, отображаем через CSS width/height


interface Joint { x:number; y:number; }
interface Frame { joints: Joint[]; }
interface AnimPack { walk: Joint[][]; attack: Joint[][]; }
interface Attachment { jointIndex: number; itemId: string; }
export interface CombinedSave {
  animations: AnimPack;
  overlay: string[]; // 128 строк
  attachments: Attachment[];
}

const defaultJoints: Joint[] = [
  { x: 64, y: 24 }, //0 голова центр
  { x: 64, y: 48 }, //1 грудь
  { x: 64, y: 80 }, //2 таз
  { x: 40, y: 60 }, //3 левая рука
  { x: 88, y: 60 }, //4 правая рука
  { x: 32, y: 100 }, //5 левая нога
  { x: 96, y: 100 }, //6 правая нога
  { x: 32, y: 80 }, //7 лев. колено верхняя часть
  { x: 96, y: 80 }, //8 прав. колено верхняя часть
];
const bones = [ [0,1],[1,2],[1,3],[1,4],[2,5],[2,6],[3,7],[4,8] ];
// Допустимые суставы для разных типов предметов (вынесено вне компонента для стабильных ссылок)
const HAND_JOINTS = [7,8];
const BODY_JOINTS = [0,1,2];

export interface StickmanCombinedEditorProps {
  inventory: Item[];
  initialAnimations?: AnimPack | null;
  initialOverlay?: string[] | null;
  initialAttachments?: Attachment[] | null;
  onSave: (data: CombinedSave) => void;
  onCancel: () => void;
}

function makeEmptyOverlay(): string[] {
  return Array.from({ length: CANVAS_H }, () => '.'.repeat(CANVAS_W));
}

export const StickmanCombinedEditor: React.FC<StickmanCombinedEditorProps> = ({ inventory, initialAnimations, initialOverlay, initialAttachments, onSave, onCancel }) => {
  const [scale, setScale] = useState(3); // визуальный масштаб (теперь влияет не напрямую на ширину, а на maxWidth)
  const rootRef = useRef<HTMLDivElement|null>(null);
  const [rootW, setRootW] = useState<number>(window.innerWidth);
  useEffect(() => {
    const upd = () => { if (rootRef.current) setRootW(rootRef.current.clientWidth); else setRootW(window.innerWidth); };
    upd();
    let ro: ResizeObserver | null = null;
    if ((window as any).ResizeObserver) {
      ro = new ResizeObserver(() => upd());
      if (rootRef.current) ro.observe(rootRef.current);
    }
    window.addEventListener('resize', upd);
    const el = rootRef.current;
    return () => {
      window.removeEventListener('resize', upd);
      if (ro && el) ro.unobserve(el);
      if (ro) ro.disconnect();
    };
  }, []);
  // Инициализация начального масштаба от ширины + возможность ручного управления
  useEffect(() => {
    const w = rootW;
    if (w <= 360) setScale(2);
    else if (w <= 420) setScale(2.2);
    else if (w <= 520) setScale(2.6);
    else setScale(3.2);
  }, [rootW]);
  const adjustScale = (delta:number) => setScale(s => Math.min(5, Math.max(1.4, +(s+delta).toFixed(2))));
  const [mode, setMode] = useState<'walk'|'attack'>('walk');
  const [framesWalk, setFramesWalk] = useState<Frame[]>(() => (initialAnimations?.walk || [defaultJoints.map(j=>({...j}))]).map(joints => ({ joints: joints.map(j=>({...j})) })));
  const [framesAttack, setFramesAttack] = useState<Frame[]>(() => (initialAnimations?.attack || [defaultJoints.map(j=>({...j}))]).map(joints => ({ joints: joints.map(j=>({...j})) })));
  const [currentFrame, setCurrentFrame] = useState(0);
  const [dragIdx, setDragIdx] = useState<number|null>(null);
  const [overlay, setOverlay] = useState<string[]>(() => initialOverlay || makeEmptyOverlay());
  const [drawColor, setDrawColor] = useState<string>('#ff0000');
  const [tool, setTool] = useState<'pen'|'erase'>('pen');
  const [attachments, setAttachments] = useState<Attachment[]>(() => initialAttachments || []);
  const [selectedItem, setSelectedItem] = useState<string>('');
  const [hoverJoint, setHoverJoint] = useState<number | null>(null);
  const longPressRef = useRef<{ tid:any; joint:number|null; startX:number; startY:number; active:boolean }>({ tid:null, joint:null, startX:0, startY:0, active:false });
  // Touch drag (mobile) для перетаскивания предметов как на ПК
  const [touchDrag, setTouchDrag] = useState<{active:boolean; itemId:string|null; x:number; y:number; startX:number; startY:number;}>({active:false,itemId:null,x:0,y:0,startX:0,startY:0});
  const cancelTouchDrag = () => setTouchDrag(d=> ({...d, active:false, itemId:null}));
  // Long-press detection for inventory item drag (to allow horizontal scroll without immediate drag)
  const touchHoldRef = useRef<{timer:any; started:boolean; itemId:string|null; startX:number; startY:number; cancelled:boolean}>({timer:null, started:false, itemId:null, startX:0, startY:0, cancelled:false});
  // Candidate joint detach (tap without move)
  const jointDetachRef = useRef<{jointIndex:number; moved:boolean}|null>(null);
  // Панорамирование и рисование
  const [pan, setPan] = useState({ x:0, y:0 });
  const panState = useRef<{active:boolean; startX:number; startY:number; baseX:number; baseY:number; moved:boolean}>({active:false,startX:0,startY:0,baseX:0,baseY:0,moved:false});
  function startPan(clientX:number, clientY:number) {
    panState.current.active = true;
    panState.current.startX = clientX;
    panState.current.startY = clientY;
    panState.current.baseX = pan.x;
    panState.current.baseY = pan.y;
    panState.current.moved = false;
  }
  function computePanLimits() {
    // динамический бокс по суставам текущего кадра, чтобы не уводить модель далеко
    const frameObj = (mode==='walk'? framesWalk: framesAttack)[currentFrame] || (mode==='walk'? framesWalk: framesAttack)[0];
    const js = frameObj?.joints || [];
    if (!js.length) return { minX:-64, maxX:64, minY:-64, maxY:64 };
    let minJX=Infinity,maxJX=-Infinity,minJY=Infinity,maxJY=-Infinity;
    js.forEach(j=>{ if (j.x<minJX) minJX=j.x; if (j.x>maxJX) maxJX=j.x; if (j.y<minJY) minJY=j.y; if (j.y>maxJY) maxJY=j.y; });
    const margin = 20; // запас вокруг
    // хотим чтобы (minJX+pan.x) >= -margin и (maxJX+pan.x) <= CANVAS_W+margin
    const minX = -margin - minJX;
    const maxX = CANVAS_W + margin - maxJX;
    const minY = -margin - minJY;
    const maxY = CANVAS_H + margin - maxJY;
    // Если диапазон инверсный (фигура шире канвы) — центрируем, даём небольшой люфт
    const fix = (a:number,b:number)=> a>b ? {a:(a+b)/2 - 10, b:(a+b)/2 + 10} : {a,b};
    const fx = fix(minX,maxX); const fy = fix(minY,maxY);
    return { minX:fx.a, maxX:fx.b, minY:fy.a, maxY:fy.b };
  }
  function updatePan(clientX:number, clientY:number) {
    const dx = clientX - panState.current.startX;
    const dy = clientY - panState.current.startY;
    if (Math.abs(dx)>2 || Math.abs(dy)>2) panState.current.moved = true;
    const scalePx = canvasRef.current ? (canvasRef.current.getBoundingClientRect().width / CANVAS_W) : 1;
    const nx = panState.current.baseX + dx/scalePx;
    const ny = panState.current.baseY + dy/scalePx;
    const lim = computePanLimits();
    setPan({ x: Math.min(lim.maxX, Math.max(lim.minX, nx)), y: Math.min(lim.maxY, Math.max(lim.minY, ny)) });
  }
  function finishPan(e?: React.MouseEvent, allowDetach:boolean=false) {
    if (!panState.current.active) return;
    if (allowDetach && !panState.current.moved && e) {
      const rect = canvasRef.current!.getBoundingClientRect();
      const effScale = rect.width / CANVAS_W;
      const mx = (e.clientX - rect.left) / effScale - pan.x;
      const my = (e.clientY - rect.top) / effScale - pan.y;
      const idx = findJointAt(mx,my,12);
      if (idx>=0 && jointHasAttachment(idx)) detachAttachment(idx);
    }
    panState.current.active = false;
  }
  const [drawEnabled, setDrawEnabled] = useState(false); // включение режима рисования по кнопке ✏️
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragItemIdRef = useRef<string | null>(null); // текущий перетаскиваемый предмет
  // Ограничения слотов: оружие/щит только на руки (7,8), броня/одежда на тело (0,1,2) — константы вынесены выше
  const getAllowedJoints = React.useCallback((item: Item | undefined) => {
    if (!item) return [] as number[];
    if (item.type === 'weapon' || item.type === 'shield') return HAND_JOINTS;
    if ((item as any).type === 'armor' || (item as any).type === 'clothes') return BODY_JOINTS;
    return [] as number[];
  }, []);
  const activeItemId = dragItemIdRef.current || selectedItem || null;

  // Текущий набор кадров и сеттер в зависимости от режима — перенесено выше функций-хелперов, чтобы они могли использовать
  const frames = mode === 'walk' ? framesWalk : framesAttack;
  const setFrames = mode === 'walk' ? setFramesWalk : setFramesAttack;

  // Преобразование координат указателя в координаты канвы с учётом панорамирования
  const pointerToCanvas = React.useCallback((e: { clientX:number; clientY:number }) => {
    if (!canvasRef.current) return { mx:0, my:0 };
    const rect = canvasRef.current.getBoundingClientRect();
    const effScale = rect.width / CANVAS_W;
    const mx = (e.clientX - rect.left) / effScale - pan.x;
    const my = (e.clientY - rect.top) / effScale - pan.y;
    return { mx, my };
  }, [pan.x, pan.y]);

  // Поиск сустава в координатах канвы
  const findJointAt = React.useCallback((x:number,y:number, radius=10) => {
    const joints = frames[currentFrame]?.joints || [];
    for (let i=0;i<joints.length;i++) {
      const j = joints[i];
      if (Math.hypot(j.x - x, j.y - y) <= radius) return i;
    }
    return -1;
  }, [frames, currentFrame]);

  const jointUnderScreenPoint = React.useCallback((clientX:number, clientY:number): number => {
    if (!canvasRef.current) return -1;
    const { mx, my } = pointerToCanvas({ clientX, clientY });
    return findJointAt(mx, my, 14);
  }, [pointerToCanvas, findJointAt]);

  // Глобальные pointer события для мобильного перетаскивания (чтобы тащить за пределы инвентаря)
  useEffect(() => {
    if (!touchDrag.active) return;
    const move = (e: PointerEvent) => {
      if (e.pointerType === 'touch') e.preventDefault();
      setTouchDrag(d => (d.active ? { ...d, x: e.clientX, y: e.clientY } : d));
      const ji = jointUnderScreenPoint(e.clientX, e.clientY);
      setHoverJoint(ji >= 0 ? ji : null);
    };
    const up = (e: PointerEvent) => {
      const ji = jointUnderScreenPoint(e.clientX, e.clientY);
      setHoverJoint(null);
      setTouchDrag(d => {
        if (d.active && d.itemId && ji >= 0) {
          const item = inventory.find(i => i.id === d.itemId);
          const allowed = getAllowedJoints(item);
          if (item && allowed.includes(ji)) {
            setAttachments(prev => {
              const filtered = prev.filter(a => a.jointIndex !== ji);
              return [...filtered, { jointIndex: ji, itemId: d.itemId! }];
            });
            if (navigator.vibrate) try { navigator.vibrate(25); } catch {}
          } else if (navigator.vibrate) try { navigator.vibrate([12,40,12]); } catch {}
        }
        return { ...d, active: false, itemId: null };
      });
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up, { passive: false });
    window.addEventListener('pointercancel', up, { passive: false });
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [touchDrag.active, inventory, getAllowedJoints, jointUnderScreenPoint]);

  // frames / setFrames уже определены выше

  // Рендер
  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0,0,CANVAS_W,CANVAS_H);
  ctx.save();
  ctx.translate(pan.x, pan.y);
    // нарисуем пиксельный слой с учётом панорамирования
    for (let y=0;y<CANVAS_H;y++) {
      const row = overlay[y];
      for (let x=0;x<CANVAS_W;x++) {
        const ch = row[x];
        if (ch === '.') continue;
        ctx.fillStyle = ch === '#' ? '#000' : ch;
        ctx.fillRect(x,y,1,1);
      }
    }
  const frameObj = frames[currentFrame] || frames[0];
  if (!frameObj) return;
  const joints = frameObj.joints;
    // кости
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#333';
    bones.forEach(([a,b]) => { ctx.beginPath(); ctx.moveTo(joints[a].x,joints[a].y); ctx.lineTo(joints[b].x,joints[b].y); ctx.stroke(); });
    // суставы
    joints.forEach((j,i)=>{
      ctx.beginPath();
      ctx.arc(j.x,j.y,5,0,Math.PI*2);
      ctx.fillStyle = dragIdx===i? '#6cf':'#fa6';
      ctx.fill();
      ctx.strokeStyle = '#222';
      ctx.stroke();
    });
    // attachments визуализация
  attachments.forEach(att => {
      const j = joints[att.jointIndex];
      if (!j) return;
      const item = inventory.find(i => i.id === att.itemId);
      ctx.save();
      ctx.translate(j.x, j.y);
      // фон бейджа
      ctx.fillStyle = 'rgba(100,150,255,0.35)';
      ctx.beginPath();
      ctx.arc(0,0,10,0,Math.PI*2);
      ctx.fill();
      // иконка по типу
      if (item) {
        ctx.strokeStyle = '#123';
        ctx.lineWidth = 2;
        if (item.type === 'weapon') {
          ctx.rotate(-0.4);
          ctx.beginPath();
          ctx.moveTo(-2,5); ctx.lineTo(2,-6); // клинок
          ctx.stroke();
          ctx.beginPath(); // перекладина
          ctx.moveTo(-4,0); ctx.lineTo(4,0);
          ctx.stroke();
        } else if (item.type === 'shield') {
          ctx.beginPath(); ctx.arc(0,0,7,0,Math.PI*2); ctx.stroke();
        }
      }
      ctx.restore();
    });
    // Hover highlight
    if (hoverJoint!=null) {
      const j = joints[hoverJoint];
      if (j) {
        ctx.beginPath();
        ctx.arc(j.x, j.y, 14, 0, Math.PI*2);
        ctx.strokeStyle = 'rgba(80,200,255,0.9)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
    ctx.restore();
  // (подсветка допустимых суставов убрана вместе с кнопками)
  }, [frames, currentFrame, dragIdx, overlay, attachments, hoverJoint, inventory, activeItemId, pan]);

  // Перетаскивание суставов
  // pointerToCanvas перенесён выше и мемоизирован
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    // Отключаем жесты прокрутки при работе
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const { mx, my } = pointerToCanvas(e);
    const isRight = e.button === 2 && e.pointerType !== 'touch';
    const joints = frames[currentFrame].joints;
    if (isRight) {
      startPan(e.clientX, e.clientY);
      e.preventDefault();
      return;
    }
    // Попали в сустав? (радиус 10)
    for (let i = 0; i < joints.length; i++) {
      const j = joints[i];
      if (Math.hypot(j.x - mx, j.y - my) < 11) {
        panState.current.active = false;
        // Если выбран предмет и не режим рисования — прикрепляем вместо перемещения
        if (selectedItem && !drawEnabled) {
          const item = inventory.find(it=> it.id===selectedItem);
          if (item) {
            const allowed = getAllowedJoints(item);
            if (allowed.includes(i)) {
              setAttachments(prev => {
                const filtered = prev.filter(a=> a.jointIndex!==i);
                return [...filtered, { jointIndex:i, itemId:selectedItem }];
              });
              // лёгкая вибрация если есть поддержка
              if (navigator.vibrate) try { navigator.vibrate(15); } catch {}
              return; // завершаем без drag
            }
          }
        }
        // Если есть attachment и нет выбранного предмета — пометим для возможного отсоединения (если не будет движения)
        if (!selectedItem && !drawEnabled && attachments.some(a=> a.jointIndex===i)) {
          jointDetachRef.current = { jointIndex: i, moved: false };
        }
        // Долгий тап для отсоединения (только touch)
        if (e.pointerType==='touch') {
          if (attachments.some(a=> a.jointIndex===i)) {
            longPressRef.current.active = true;
            longPressRef.current.joint = i;
            longPressRef.current.startX = e.clientX;
            longPressRef.current.startY = e.clientY;
            longPressRef.current.tid = setTimeout(()=>{
              if (longPressRef.current.active && longPressRef.current.joint===i) {
                detachAttachment(i);
                if (navigator.vibrate) try { navigator.vibrate([10,40,20]); } catch {}
              }
            }, 550);
          }
        }
        setDragIdx(i);
        return;
      }
    }
    // Если тач и не попали по суставу — сразу пан
    if (e.pointerType === 'touch' && !drawEnabled) {
      startPan(e.clientX, e.clientY);
      return;
    }
    if (drawEnabled) paintPixel(mx, my);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    // Если активен touch-drag предмета, просто подсвечиваем возможный сустав
    if (touchDrag.active) {
      setTouchDrag(d=> ({...d, x:e.clientX, y:e.clientY }));
      const ji = jointUnderScreenPoint(e.clientX, e.clientY);
      setHoverJoint(ji>=0? ji:null);
      return;
    }
    if (panState.current.active) { updatePan(e.clientX, e.clientY); return; }
    const { mx, my } = pointerToCanvas(e);
    // Отменяем long press если ушли далеко
    if (longPressRef.current.active) {
      if (Math.hypot(e.clientX - longPressRef.current.startX, e.clientY - longPressRef.current.startX) > 14) {
        longPressRef.current.active = false; clearTimeout(longPressRef.current.tid); longPressRef.current.tid=null;
      }
    }
    if (dragIdx === null) {
      if (e.buttons === 1 && drawEnabled) paintPixel(mx, my);
      return;
    }
    if (jointDetachRef.current && jointDetachRef.current.jointIndex === dragIdx) {
      jointDetachRef.current.moved = true;
    }
    setFrames(list => list.map((f, idx) => idx === currentFrame ? { joints: f.joints.map((j, i) => i === dragIdx ? { x: mx, y: my } : j) } : f));
  };
  const onPointerUp = (e?: React.PointerEvent<HTMLCanvasElement>) => {
    if (e && (e.target as HTMLElement).hasPointerCapture?.(e.pointerId)) {
      try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
    }
    finishPan(e as any, true); setDragIdx(null);
    if (jointDetachRef.current && !jointDetachRef.current.moved && !selectedItem && !drawEnabled) {
      detachAttachment(jointDetachRef.current.jointIndex);
      if (navigator.vibrate) try { navigator.vibrate(12); } catch {}
    }
    jointDetachRef.current = null;
  if (longPressRef.current.active) { longPressRef.current.active=false; clearTimeout(longPressRef.current.tid); longPressRef.current.tid=null; }
    if (touchDrag.active) {
      // Завершение дропа
      const ji = jointUnderScreenPoint(touchDrag.x, touchDrag.y);
      if (ji>=0 && touchDrag.itemId) {
        const item = inventory.find(i=> i.id===touchDrag.itemId);
        const allowed = getAllowedJoints(item);
        if (item && allowed.includes(ji)) {
          setAttachments(prev => {
            const filtered = prev.filter(a=> a.jointIndex!==ji);
            return [...filtered, { jointIndex: ji, itemId: touchDrag.itemId! }];
          });
          if (navigator.vibrate) try { navigator.vibrate(25); } catch {}
        } else if (navigator.vibrate) try { navigator.vibrate([10,40,10]); } catch {}
      }
      cancelTouchDrag();
      setHoverJoint(null);
    }
  };

  // Wrapper pointer handlers (пан по пустой зоне вне канвы ПКМ / тач)
  const onWrapPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Не запускаем pan немедленно, если тач пришёл по самой канве (даём canvas обработать сустав)
    if (touchDrag.active) return; // уже тянем предмет
    if (e.button === 2) { startPan(e.clientX, e.clientY); e.preventDefault(); return; }
    if (e.pointerType === 'touch') {
      const el = e.target as HTMLElement;
      // Если касание внутри инвентаря или на предмет — не панорамируем
      if (el.closest('.inv-hstrip') || el.closest('.editor-item')) return;
      if (el.tagName === 'CANVAS') return; // canvas сам решит: сустав или pan
      startPan(e.clientX, e.clientY); e.preventDefault();
    }
  };
  const onWrapPointerMove = (e: React.PointerEvent<HTMLDivElement>) => { if (panState.current.active) updatePan(e.clientX, e.clientY); };
  const onWrapPointerUp = () => { finishPan(undefined, false); };

  function paintPixel(x:number,y:number) {
    const px = Math.floor(x); const py = Math.floor(y);
    if (px<0||py<0||px>=CANVAS_W||py>=CANVAS_H) return;
    setOverlay(prev => prev.map((row,ry)=> ry!==py ? row : row.substring(0,px) + (tool==='erase'? '.': drawColor) + row.substring(px+1)));
  }

  // Frames ops
  const addFrame = () => { const base = frames[currentFrame].joints.map(j=>({...j})); setFrames(fr=>[...fr,{ joints: base }]); setCurrentFrame(frames.length); };
  const removeFrame = () => { if (frames.length<=1) return; setFrames(fr=> fr.filter((_,i)=>i!==currentFrame)); setCurrentFrame(f=> Math.max(0,f-1)); };
  const resetPose = () => { setFrames(fr=> fr.map((f,i)=> i===currentFrame? { joints: defaultJoints.map(j=>({...j})) }: f)); };

  // Автогенерация упрощённо
  const autoGen = () => {
    const rnd = (min:number,max:number)=> min + Math.random()*(max-min);
    const rInt = (min:number,max:number)=> Math.round(rnd(min,max));
    const clamp = (v:number,min:number,max:number)=> v<min?min: v>max?max:v;
    const base = defaultJoints.map(j=>({...j}));
    // Кол-во кадров случайно 4..8
    const walkCount = rInt(4,8);
    const attackCount = rInt(4,8);
    // Диапазоны смещений для групп
    const legSwingX = rnd(4,10);
    const legSwingY = rnd(4,12);
    const armSwingX = rnd(4,10);
    const armSwingY = rnd(2,8);
    const jitter = (amp:number)=> rnd(-amp,amp);
    const makeFrameFromPrev = (prev: Joint[], tNorm:number, phase:number, type:'walk'|'attack'): Joint[] => {
      const js = prev.map(j=>({...j}));
      // Ноги (5,6) + колени (7,8)
      if (type==='walk') {
        const swingA = Math.sin(phase + tNorm*Math.PI*2);
        const swingB = Math.sin(phase + Math.PI + tNorm*Math.PI*2);
        // Бедра остаются (2), колени (7,8) чуть смещаем по иксу и игреку
        js[5].x = base[5].x + swingA*legSwingX*0.4 + jitter(2);
        js[5].y = clamp(base[5].y + swingA*legSwingY + jitter(2), 60, 118);
        js[6].x = base[6].x + swingB*legSwingX*0.4 + jitter(2);
        js[6].y = clamp(base[6].y + swingB*legSwingY + jitter(2), 60, 118);
        js[7].x = base[7].x + swingA*legSwingX*0.5 + jitter(2);
        js[7].y = clamp(base[7].y + swingA*legSwingY*0.5 + jitter(2), 40, 118);
        js[8].x = base[8].x + swingB*legSwingX*0.5 + jitter(2);
        js[8].y = clamp(base[8].y + swingB*legSwingY*0.5 + jitter(2), 40, 118);
        // Руки (3,4) колышутся
        js[3].x = base[3].x + swingB*armSwingX + jitter(2);
        js[3].y = clamp(base[3].y + swingB*armSwingY*0.6 + jitter(2), 20, 110);
        js[4].x = base[4].x + swingA*armSwingX + jitter(2);
        js[4].y = clamp(base[4].y + swingA*armSwingY*0.6 + jitter(2), 20, 110);
      } else { // attack
        // Поднятие правой руки + вариативность
        const raise = tNorm; // 0..1
        js[4].y = clamp(base[4].y - raise* rnd(25,45) + jitter(3), 0, 120);
        js[4].x = base[4].x + jitter(6);
        // Левая может чуть уходить назад
        js[3].x = base[3].x + jitter(6) - raise*armSwingX*0.3;
        js[3].y = clamp(base[3].y + raise*armSwingY*0.4 + jitter(3), 10, 120);
        // Лёгкий наклон корпуса
        js[1].x = base[1].x + jitter(2);
        js[2].x = base[2].x + jitter(2);
      }
      // Голова плавно шатается
      js[0].x = base[0].x + Math.sin(tNorm*Math.PI*2 + phase)*2 + jitter(1);
      js[0].y = clamp(base[0].y + Math.cos(tNorm*Math.PI*2 + phase)*1 + jitter(1), 0, 40);
      return js;
    };
    const genWalk: Frame[] = [];
    let prevWalk = base;
    const walkPhase = Math.random()*Math.PI*2;
    for (let i=0;i<walkCount;i++) {
      const t = i/(walkCount);
      const frameJ = makeFrameFromPrev(prevWalk, t, walkPhase,'walk');
      prevWalk = frameJ;
      genWalk.push({ joints: frameJ });
    }
    // Замыкаем цикл – делаем последний кадр ближе к первому
    if (genWalk.length>2) {
      const first = genWalk[0].joints;
      const last = genWalk[genWalk.length-1].joints;
      last.forEach((j,idx)=> { j.x = (j.x*3 + first[idx].x)/4; j.y = (j.y*3 + first[idx].y)/4; });
    }
    setFramesWalk(genWalk);
    const genAttack: Frame[] = [];
    let prevAttack = base;
    const attackPhase = Math.random()*Math.PI*2;
    for (let i=0;i<attackCount;i++) {
      const t = i/(attackCount-1||1);
      const frameJ = makeFrameFromPrev(prevAttack, t, attackPhase,'attack');
      prevAttack = frameJ;
      genAttack.push({ joints: frameJ });
    }
    // Финальный кадр: лёгкий откат
    if (genAttack.length>1) {
      const fin = genAttack[genAttack.length-1].joints;
      fin[4].y += rnd(6,12); // опускаем руку
    }
    setFramesAttack(genAttack);
  };

  // Attach item to selected joint
  function detachAttachment(jointIndex:number) {
    setAttachments(prev => prev.filter(a=> a.jointIndex!==jointIndex));
  }
  function jointHasAttachment(idx:number) { return attachments.some(a=> a.jointIndex===idx); }

  const saveAll = () => {
    onSave({
      animations: { walk: framesWalk.map(f=>f.joints), attack: framesAttack.map(f=>f.joints) },
      overlay,
      attachments,
    });
  };

  // Drag & Drop предметов из инвентаря на суставы
  function onDragStartItem(e: React.DragEvent<HTMLDivElement>, itemId: string) {
    dragItemIdRef.current = itemId;
    e.dataTransfer.setData('text/item-id', itemId);
  }
  function onDragEndItem() {
    dragItemIdRef.current = null;
  }
  // findJointAt перенесён выше
  function handleCanvasDragOver(e: React.DragEvent<HTMLCanvasElement>) {
    e.preventDefault(); // разрешаем drop
  const rect = canvasRef.current!.getBoundingClientRect();
  const effScale = rect.width / CANVAS_W;
    const mx = (e.clientX - rect.left) / effScale - pan.x;
    const my = (e.clientY - rect.top) / effScale - pan.y;
    const idx = findJointAt(mx,my,12);
    setHoverJoint(idx>=0? idx : null);
  }
  function handleCanvasDrop(e: React.DragEvent<HTMLCanvasElement>) {
    e.preventDefault();
  const rect = canvasRef.current!.getBoundingClientRect();
  const effScale = rect.width / CANVAS_W;
    const mx = (e.clientX - rect.left) / effScale - pan.x;
    const my = (e.clientY - rect.top) / effScale - pan.y;
    const jointIdx = findJointAt(mx,my,10);
    const itemId = e.dataTransfer.getData('text/item-id') || dragItemIdRef.current;
    if (jointIdx>=0 && itemId) {
      const item = inventory.find(i=> i.id===itemId);
      const allowed = getAllowedJoints(item);
      if (item && allowed.includes(jointIdx)) {
        setAttachments(prev => {
          const filtered = prev.filter(a=> a.jointIndex !== jointIdx); // заменяем существующий
          return [...filtered, { jointIndex: jointIdx, itemId }];
        });
      } else {
        // краткая красная вспышка (обводка)
        const ctx = canvasRef.current?.getContext('2d');
        if (ctx) {
          const j = frames[currentFrame].joints[jointIdx];
          if (j) {
            ctx.beginPath(); ctx.arc(j.x,j.y,20,0,Math.PI*2);
            ctx.strokeStyle='rgba(255,80,80,0.9)'; ctx.lineWidth=3; ctx.stroke();
          }
        }
      }
    }
    setHoverJoint(null);
  }

  return (
  <div className="editor-root" ref={rootRef}>
      <div className="editor-toolbar">
        <div className="editor-mode">
          <button className={mode==='walk'? 'ed-btn active':'ed-btn'} onClick={()=> setMode('walk')}>Ходьба</button>
          <button className={mode==='attack'? 'ed-btn active':'ed-btn'} onClick={()=> setMode('attack')}>Атака</button>
        </div>
        <div className="editor-actions">
          <button className="ed-btn" onClick={autoGen}>Автоген</button>
          <button className="ed-btn" onClick={resetPose}>Сброс</button>
          <button className="ed-btn" onClick={addFrame}>+Кадр</button>
          <button className="ed-btn" onClick={removeFrame} disabled={frames.length<=1}>-Кадр</button>
          <button className={drawEnabled? 'ed-btn active':'ed-btn'} onClick={()=> setDrawEnabled(v=> !v)} title="Режим рисования">✏️</button>
          {drawEnabled && (
            <>
              <button className="ed-btn" onClick={()=> setTool(t=> t==='pen'?'erase':'pen')}>{tool==='pen'? 'Ластик':'Кисть'}</button>
              <button className="ed-btn" onClick={()=> setOverlay(makeEmptyOverlay())}>Очистить</button>
            </>
          )}
        </div>
      </div>
      <div className="editor-frames">
        {frames.map((_,i)=>(
          <button key={i} className={i===currentFrame? 'frame-btn current':'frame-btn'} onClick={()=> setCurrentFrame(i)}>{i+1}</button>
        ))}
      </div>
      <div className="editor-zoom">
        <span className="zoom-label">Масштаб</span>
        <button className="ed-btn" onClick={()=> adjustScale(-0.2)}>-</button>
        <input
          type="range"
          min={1.5}
          max={5}
          step={0.1}
          value={scale}
          onChange={e=> setScale(parseFloat(e.target.value))}
        />
        <button className="ed-btn" onClick={()=> adjustScale(+0.2)}>+</button>
        <span className="zoom-val">{scale.toFixed(1)}x</span>
      </div>
      <div className="editor-canvas-col">
  <div className="editor-canvas-wrap" onPointerDown={onWrapPointerDown} onPointerMove={onWrapPointerMove} onPointerUp={onWrapPointerUp} onPointerLeave={onWrapPointerUp} onContextMenu={e=> e.preventDefault()}>
          {/** Динамический размер: базовая 128px канва * scale, но ограничиваем шириной экрана и максимумом */}
          {(() => {
            // Стабильное положение: базовый слой 128x128, масштабируем transform'ом без изменения layout,
            // чтобы не "уплывал" персонаж при изменении scale.
            // Ограничим эффективный масштаб так, чтобы не выходить за пределы ширины корневого контейнера.
            const maxContentW = Math.min(rootW - 32, 640); // запас по бокам
            const maxScaleByWidth = Math.max(1, maxContentW / 128);
            const effScale = Math.min(scale, maxScaleByWidth);
            return (
              <div className="canvas-scale-holder" style={{ width:128, height:128 + 12, margin:'0 auto', position:'relative', display:'flex', alignItems:'flex-start', justifyContent:'center' }}>
                <div className="canvas-scale-inner" style={{ width:128, height:128, transform:`translateY(6px) scale(${effScale})`, transformOrigin:'center top', pointerEvents:'none' }}>
                  <canvas
                    ref={canvasRef}
                    width={CANVAS_W}
                    height={CANVAS_H}
                    style={{ cursor: dragIdx!==null? 'grabbing':'crosshair', width:128, height:128, touchAction: 'none' as any, pointerEvents:'auto' }}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerLeave={onPointerUp}
                    onDragOver={handleCanvasDragOver}
                    onDrop={handleCanvasDrop}
                    onContextMenu={(e)=> { e.preventDefault(); }}
                  />
                </div>
              </div>
            );
          })()}
          <div className="inv-hstrip-wrapper">
            <h4 className="editor-side-title compact">Инвентарь</h4>
            <div className="inv-hstrip" onWheel={(e)=>{ if (e.deltaY!==0) { (e.currentTarget as HTMLDivElement).scrollLeft += e.deltaY; }}}>
              {inventory.map(it => {
                const attachedJoints = attachments.filter(a=> a.itemId===it.id).map(a=> a.jointIndex);
                const rarityColor = it.rarity==='rare' ? '#fa6' : it.rarity==='uncommon'? '#6cf':'#bbb';
                const allowed = getAllowedJoints(it);
                return (
                  <div key={it.id}
                       draggable
                       onDragStart={(e)=> onDragStartItem(e,it.id)}
                       onDragEnd={onDragEndItem}
                       onClick={()=> setSelectedItem(it.id)}
                       onPointerDown={(e)=> {
                          if (e.pointerType==='touch') {
                            touchHoldRef.current.cancelled=false;
                            touchHoldRef.current.started=false;
                            touchHoldRef.current.itemId=it.id;
                            touchHoldRef.current.startX=e.clientX;
                            touchHoldRef.current.startY=e.clientY;
                            if (touchHoldRef.current.timer) clearTimeout(touchHoldRef.current.timer);
                            touchHoldRef.current.timer = setTimeout(()=>{
                              if (!touchHoldRef.current.cancelled && touchHoldRef.current.itemId===it.id) {
                                touchHoldRef.current.started=true;
                                setSelectedItem('');
                                setTouchDrag({ active:true, itemId:it.id, x:e.clientX, y:e.clientY, startX:e.clientX, startY:e.clientY });
                                if (navigator.vibrate) try { navigator.vibrate(12); } catch {}
                              }
                            },260);
                          }
                        }}
                       onPointerMove={(e)=> {
                          if (e.pointerType==='touch' && !touchHoldRef.current.started && touchHoldRef.current.itemId===it.id) {
                            const dx=Math.abs(e.clientX-touchHoldRef.current.startX);
                            const dy=Math.abs(e.clientY-touchHoldRef.current.startY);
                            if (dx>8||dy>8) { touchHoldRef.current.cancelled=true; if (touchHoldRef.current.timer) { clearTimeout(touchHoldRef.current.timer); touchHoldRef.current.timer=null; } }
                          }
                        }}
                       onPointerUp={(e)=> {
                          if (e.pointerType==='touch') {
                            if (touchHoldRef.current.timer) { clearTimeout(touchHoldRef.current.timer); touchHoldRef.current.timer=null; }
                            if (!touchHoldRef.current.started && !touchHoldRef.current.cancelled) {
                              setSelectedItem(it.id);
                            }
                          }
                        }}
                       className={`editor-item inv-mini ${selectedItem===it.id? 'selected':''} ${attachedJoints.length? 'attached':''}`}
                       title={attachedJoints.length? `Прикреплено: ${attachedJoints.join(',')}`:`Суставы: ${allowed.length? allowed.join(', '):'нет'}` }>
                    <div className="mini-row">
                      <span className="rarity-dot" style={{ background:rarityColor }} />
                      <span className="mini-name">{it.name}</span>
                    </div>
                    <div className="mini-bonus">+{it.attackBonus}</div>
                  </div>
                );
              })}
            </div>
            <div className="editor-mini-hint">Перетащи (ПК) или: выбери предмет → клик/тап сустав. Клик/тап по суставу без выбора — снять.</div>
          <div className="editor-mini-hint" style={{ marginTop:4, fontSize:10, opacity:.55 }}>Тач: 1) Тап по предмету 2) Тап по суставу (прикрепить). Просто тап по суставу с предметом — снять. Долгий тап тоже работает.</div>
          </div>
        </div>
        <div className="editor-hint">ЛКМ сустав — двигать{drawEnabled? ', фон — рисование':''}. ПКМ удерживать — панорама. Короткий ПКМ по суставу — снять предмет.</div>
        {drawEnabled && (
          <div className="editor-drawing">
            <input type="color" value={drawColor} onChange={e=> setDrawColor(e.target.value)} />
            <span style={{ fontSize:11, opacity:.7 }}>Инструмент: {tool==='pen'? 'кисть':'ластик'}</span>
          </div>
        )}
        {attachments.length>0 && (
          <div className="editor-attachments">
            <div className="ea-title">Привязки</div>
            {attachments.map(a=> { const it = inventory.find(i=> i.id===a.itemId); return <div key={a.jointIndex} className="ea-row">J{a.jointIndex} → {it? it.name: a.itemId}</div>; })}
          </div>
        )}
        <div className="editor-tip">Оружие/щит: J7,J8. Броня/одежда: J0,J1,J2.</div>
        <div className="editor-save-row">
          <button className="ed-btn primary" onClick={saveAll}>Сохранить</button>
          <button className="ed-btn" onClick={onCancel}>Отмена</button>
        </div>
      </div>
      {touchDrag.active && touchDrag.itemId && (
        <div style={{ position:'fixed', left: touchDrag.x, top: touchDrag.y, transform:'translate(-50%, -50%)', pointerEvents:'none', zIndex:9999, background:'#22333b', padding:'6px 10px', borderRadius:12, fontSize:11, boxShadow:'0 4px 12px -4px #000a, 0 0 0 1px #2a333b', opacity:.95 }}>
          {inventory.find(i=> i.id===touchDrag.itemId)?.name || '...'}
        </div>
      )}
    </div>
  );
};
