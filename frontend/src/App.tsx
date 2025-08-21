import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import './App.css';
import { StickmanCombinedEditor } from './StickmanCombinedEditor';

// Типы предметов
export type Item = {
  id: string;
  name: string;
  type: 'weapon' | 'shield';
  attackBonus: number; // бонус урона (для shield может быть 0, в будущем можно добавить защиту)
  rarity: 'common' | 'uncommon' | 'rare';
};

// Пул предметов
const ITEM_POOL: Item[] = [
  { id: 'sword', name: 'Меч', type: 'weapon', attackBonus: 1, rarity: 'common' },
  { id: 'sabre', name: 'Сабля', type: 'weapon', attackBonus: 2, rarity: 'uncommon' },
  { id: 'axe', name: 'Топор', type: 'weapon', attackBonus: 3, rarity: 'rare' },
  { id: 'bow', name: 'Лук', type: 'weapon', attackBonus: 2, rarity: 'uncommon' },
  { id: 'dagger', name: 'Кинжал', type: 'weapon', attackBonus: 1, rarity: 'common' },
  { id: 'shield', name: 'Щит', type: 'shield', attackBonus: 0, rarity: 'uncommon' },
];

const rarityColor: Record<Item['rarity'], string> = {
  common: '#bbb',
  uncommon: '#6cf',
  rare: '#fa6',
};


interface AdventureProps {
  onExit: () => void;
  onLoot: (item: Item) => void;
  onKill: (xpGained: number) => void;
  attackBonus: number;
  playerSprite: React.ReactNode;
  onFightChange: (fight: boolean) => void;
  embedded?: boolean; // если true – встраиваем в stage главного экрана
  stageRef?: React.RefObject<HTMLDivElement>; // ref основного stage для обновления CSS переменных параллакса
}

function Adventure({ onExit, onLoot, onKill, attackBonus, playerSprite, onFightChange, embedded, stageRef }: AdventureProps) {
  const [bgOffset, setBgOffset] = useState(0); // бесконечный фон (накапливаем без modulo для плавности)
  const [mobVisible, setMobVisible] = useState(false);
  const [mob, setMob] = useState<{ name: string; hp: number; max: number; xp: number; color: string } | null>(null);
  // Декорации (облака / объекты на земле) для ощущения движения
  type Cloud = { id:string; x:number; y:number; speed:number; scale:number; opacity:number };
  type PropKind = 'rock'|'bush'|'skull'|'stump'|'crystal'|'mushroom'|'sign'|'crate';
  type PropObj = { id:string; x:number; kind:PropKind };
  const PROP_DEFS = useMemo<Record<PropKind,{w:number;minGap:number;}>>(()=>({
    rock:{ w:32, minGap:50 },
    bush:{ w:36, minGap:54 },
    skull:{ w:22, minGap:40 },
    stump:{ w:30, minGap:50 },
    crystal:{ w:20, minGap:48 },
    mushroom:{ w:18, minGap:40 },
    sign:{ w:26, minGap:54 },
    crate:{ w:28, minGap:50 }
  }), []);
  const [clouds, setClouds] = useState<Cloud[]>([]);
  const [props, setProps] = useState<PropObj[]>([]);
  const [nextSpawnTime, setNextSpawnTime] = useState<number | null>(() => Date.now() + (1500 + Math.random() * 2500));
  const [approach, setApproach] = useState<{ mob: { name: string; hp: number; xp: number; color: string }; distance: number; total: number } | null>(null);
  // Убрали foundSignal над игроком – теперь восклицательный знак появляется над мобом, когда он уже близко
  const [fight, setFight] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [xpFlash, setXpFlash] = useState<{ xp:number; key:number }|null>(null);
  const deathHandledRef = useRef(false);
  // RAF цикл вместо setInterval для более плавной анимации
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [viewW, setViewW] = useState<number>(0);
  // Постоянная скорость прокрутки (px/сек)
  const TRAVEL_SPEED = 100;
  const PATTERN = 360; // ширина повторяемого паттерна (кратно 40 и 36 для бесшовного wrap)
  const dtSmoothRef = useRef<number | null>(null); // для сглаживания FPS колебаний
  const baseDamage = 1;
  // --- Система критов (как было) ---
  type TapTarget = { id: string; x: number; y: number; expires: number; };
  const [tapTargets, setTapTargets] = useState<TapTarget[]>([]);
  const sequenceRef = useRef<{ required: number; done: number; failed: boolean; active: boolean } | null>(null);

  const createMobData = () => {
    const variants = [
      { name: 'Слизень', base: 5, color: '#5c9' },
      { name: 'Паук', base: 7, color: '#9c5' },
      { name: 'Гоблин', base: 10, color: '#c95' },
      { name: 'Скелет', base: 14, color: '#ccc' },
      { name: 'Орк', base: 18, color: '#8a5' },
    ];
    const pick = variants[Math.floor(Math.random() * variants.length)];
    const variance = 0.7 + Math.random() * 0.6;
    const max = Math.round(pick.base * variance);
    const xp = Math.max(5, Math.round(max * (1.2 + Math.random() * 0.6)));
    return { name: pick.name, hp: max, max, xp, color: pick.color };
  };

  // Быстрый спавн после убийства моба
  const scheduleImmediateSpawn = () => setNextSpawnTime(Date.now() + 100);

  // Основной цикл движения / подхода
  useEffect(() => {
    const cloudRate = 0.66; // спавнов/сек
    const propRate = 1.2;  // спавнов/сек
    const loop = (ts: number) => {
      rafRef.current = requestAnimationFrame(loop);
      if (lastTsRef.current == null) { lastTsRef.current = ts; return; }
  const rawDt = (ts - lastTsRef.current) / 1000;
  lastTsRef.current = ts;
  const clamped = rawDt > 0.25 ? 0.25 : rawDt;
  if (dtSmoothRef.current == null) dtSmoothRef.current = clamped;
  else dtSmoothRef.current = dtSmoothRef.current * 0.85 + clamped * 0.15; // экспоненц. сглаживание
  const dt = Math.min(0.05, dtSmoothRef.current); // ограничим до 50мс для равномерности
  // Убрали паузу при бое: фон и окружение продолжают движение для динамики

  // Если начался бой – останавливаем движение окружения (фон "замирает")
  if (fight) return;
  // Движение земли с безопасным циклом по PATTERN (повторяемый фон) без вспышек
  setBgOffset(o => (o + TRAVEL_SPEED * dt) % PATTERN);

      // Обновление и спавн облаков одним setState
      setClouds(cs => {
  const moved = cs.map(c => ({ ...c, x: c.x - c.speed * dt })).filter(c => c.x > -190);
  if (moved.length < 8 && Math.random() < cloudRate * dt) {
          const id = Date.now().toString(36)+Math.random().toString(36).slice(2);
          moved.push({ id, x: 520 + Math.random()*140, y: 40+Math.random()*70, speed: 24 + Math.random()*12, scale: 0.6 + Math.random()*0.9, opacity: 0.25 + Math.random()*0.4 });
        }
        return moved;
      });

      // Обновление и спавн объектов земли
        setProps(ps => {
          const moved = ps.map(p => ({ ...p, x: p.x - TRAVEL_SPEED * dt })).filter(p => p.x > -90);
          if (moved.length < 7 && Math.random() < propRate * dt) {
            const variants: PropKind[] = ['rock','bush','skull','stump','crystal','mushroom','sign','crate'];
            const kind = variants[Math.floor(Math.random()*variants.length)];
            const def = PROP_DEFS[kind];
            // Подбираем позицию без пересечений
            let attempts = 6;
            let xCandidate:number|undefined;
            while (attempts-- > 0) {
              const trial = 520 + Math.random()*200; // чуть шире диапазон
              const ok = moved.every(p => Math.abs(trial - p.x) > Math.max(def.minGap, (PROP_DEFS[p.kind].w + def.w)/2 + 20));
              if (ok) { xCandidate = trial; break; }
            }
            if (xCandidate !== undefined) {
              const id = Date.now().toString(36)+Math.random().toString(36).slice(2);
              moved.push({ id, x: xCandidate, kind });
            }
          }
          return moved;
        });

      // Спавн моба (таймер)
      if (!approach && !mob && nextSpawnTime && Date.now() >= nextSpawnTime) {
        const m = createMobData();
        const dist = 480 + Math.random() * 520;
        setApproach({ mob: m, distance: dist, total: dist });
  if (showDebug && process.env.NODE_ENV !== 'production') console.log('[ADV] Spawn', m.name, 'dist', dist);
      }
      // Подход моба
      if (approach) {
        setApproach(a => {
          if (!a) return a;
          const newDist = a.distance - TRAVEL_SPEED * dt;
          if (newDist <= 0) {
            // Мгновенно фиксируем бой: убираем задержку, исключаем ощущение продолжения движения
            setMob(a.mob as any);
            setMobVisible(true);
            setFight(true);
            onFightChange(true);
            if (showDebug && process.env.NODE_ENV !== 'production') console.log('[ADV] Fight start', a.mob.name);
            return null;
          }
          return { ...a, distance: newDist };
        });
      }
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); lastTsRef.current = null; };
  }, [fight, approach, mob, nextSpawnTime, onFightChange, showDebug, PROP_DEFS]);

  // Обновление CSS переменных для параллакса (только embedded режим)
  useEffect(() => {
    if (!embedded || !stageRef?.current) return;
  // Прокрутка переведена на CSS анимации, обновление переменных больше не требуется
  }, [bgOffset, embedded, stageRef]);

  //----------------- Крит система (адаптация) -----------------
  const applyDamage = useCallback((crit: boolean) => {
    setMob(prev => {
      if (!prev) return prev;
      const dmgBase = baseDamage + attackBonus;
      const dealt = dmgBase * (crit ? 2.5 : 1);
      const newHp = Math.max(0, prev.hp - dealt);
      // Смерть моба: запускаем обработку один раз
      if (newHp === 0 && prev.hp > 0 && !deathHandledRef.current) {
        deathHandledRef.current = true;
        const mobSnapshot = prev; // для xp/лут
  // Показать всплывающий XP
  setXpFlash({ xp: mobSnapshot.xp, key: Date.now() });
        setTimeout(() => {
          setMobVisible(false);
          setFight(false); onFightChange(false);
          onKill(mobSnapshot.xp);
          if (Math.random() < 0.45) {
            const item = rollDrop();
            if (item) onLoot(item);
          }
          setMob(null);
          setApproach(null);
          scheduleImmediateSpawn();
          deathHandledRef.current = false; // готово к следующему
          if (showDebug && process.env.NODE_ENV !== 'production') console.log('[ADV] Death cleanup');
        }, 350);
  if (showDebug && process.env.NODE_ENV !== 'production') console.log('[ADV] Death scheduled');
      }
      return { ...prev, hp: newHp };
    });
  }, [attackBonus, onFightChange, onKill, onLoot, showDebug]);

  const finishSequence = useCallback((success: boolean) => {
    if (!sequenceRef.current) return;
    sequenceRef.current.active = false;
    const crit = success && !sequenceRef.current.failed && sequenceRef.current.done >= sequenceRef.current.required;
    applyDamage(crit);
  }, [applyDamage]);

  const spawnNextTarget = useCallback(() => {
    if (!sequenceRef.current || !sequenceRef.current.active) return;
    if (sequenceRef.current.done >= sequenceRef.current.required) {
      finishSequence(true);
      return;
    }
    const lifeMs = 450;
    const c = containerRef.current;
    const bounds = c ? c.getBoundingClientRect() : { width: 300, height: 200 } as any;
    const pad = 24;
    const x = pad + Math.random() * (bounds.width - pad * 2);
    const y = 40 + Math.random() * (bounds.height - 80);
    const tgt: TapTarget = { id: Date.now() + '_' + Math.random().toString(36).slice(2), x, y, expires: Date.now() + lifeMs };
    setTapTargets(prev => [...prev.filter(p => p.id !== tgt.id), tgt]);
    setTimeout(() => {
      setTapTargets(prev => prev.filter(p => p.id !== tgt.id));
      if (!sequenceRef.current || sequenceRef.current.failed) return;
      if (sequenceRef.current.done < sequenceRef.current.required) {
        sequenceRef.current.failed = true;
        finishSequence(false);
      }
    }, lifeMs);
  }, [finishSequence]);

  const startAttackSequence = useCallback(() => {
    if (!mob || mob.hp <= 0) return;
    const required = 2 + Math.min(3, Math.floor(attackBonus / 2));
    sequenceRef.current = { required, done: 0, failed: false, active: true };
    setTapTargets([]);
    spawnNextTarget();
  }, [attackBonus, spawnNextTarget, mob]);

  const tapTarget = useCallback((id: string) => {
    if (!sequenceRef.current || sequenceRef.current.failed) return;
    setTapTargets(prev => prev.filter(p => p.id !== id));
    if (!sequenceRef.current.active) return;
    sequenceRef.current.done += 1;
    setTimeout(spawnNextTarget, 60);
  }, [spawnNextTarget]);

  // Запуск последовательности когда бой активен
  useEffect(() => {
    if (fight && mob && mob.hp > 0) {
      if (!sequenceRef.current || !sequenceRef.current.active) startAttackSequence();
    }
  }, [fight, mob, startAttackSequence]);

  // Очистка целей при окончательной смерти (уже инициируется в applyDamage)
  useEffect(() => {
    if (mob && mob.hp === 0) {
      sequenceRef.current = null;
      setTapTargets([]);
    }
  }, [mob]);

  // Очистка xp флеша
  useEffect(()=>{ if (xpFlash) { const t = setTimeout(()=> setXpFlash(null), 1100); return ()=> clearTimeout(t); } }, [xpFlash]);

  // Тоггл отладки по клавише D
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key.toLowerCase() === 'd') setShowDebug(s => !s); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const rollDrop = (): Item | null => {
    const weighted: { item: Item; w: number }[] = ITEM_POOL.map(it => ({ item: it, w: it.rarity === 'common' ? 60 : it.rarity === 'uncommon' ? 30 : 10 }));
    const total = weighted.reduce((s, x) => s + x.w, 0);
    let r = Math.random() * total;
    for (const rec of weighted) { if (r < rec.w) return rec.item; r -= rec.w; }
    return null;
  };

  const showUpcoming = approach && !mob && !fight;
  // Прогресс приближения 0..1 на основе индивидуальной дистанции
  const upcomingProgress = showUpcoming && approach ? 1 - Math.max(0, approach.distance) / approach.total : 0;
  // Определяем опасную близость моба (порог 88% пути)
  const dangerNear = showUpcoming && upcomingProgress > 0.88;
  const PLAYER_LEFT = 40;
  const PLAYER_WIDTH = 64;
  const MOB_GAP = 20; // ещё ближе (ещё -15px от предыдущего 35)
  const OFFSCREEN_GAP = 60;
  const safeW = viewW || 460;
  const endX = Math.min(safeW - 60, PLAYER_LEFT + PLAYER_WIDTH + MOB_GAP);
  const startX = safeW + OFFSCREEN_GAP;
  const endPercent = (endX / safeW) * 100;
  const startPercent = (startX / safeW) * 100;

  useEffect(() => {
    const upd = () => {
      const el = embedded ? stageRef?.current : containerRef.current;
      if (el) setViewW(el.clientWidth);
    };
    upd();
    window.addEventListener('resize', upd);
    return () => window.removeEventListener('resize', upd);
  }, [embedded, stageRef]);

  // Если встроено – рендерим только слои без контейнера; используем stageRef как контейнер
  // Привязка контейнера для embedded режима (параллакс stage)
  useEffect(() => { if (embedded && stageRef?.current) containerRef.current = stageRef.current; }, [embedded, stageRef]);
  if (embedded) {
    return (
      <>
        {playerSprite}
        {/* Облака (за игроком) */}
        {clouds.map(c => (
          <div key={c.id} style={{ position:'absolute', left: c.x, top: c.y, width: 120*c.scale, height: 50*c.scale, opacity:c.opacity, filter:'blur(0.4px)', pointerEvents:'none' }}>
            <div style={{ position:'absolute', inset:0, background:'radial-gradient(circle at 30% 40%, #fff, rgba(255,255,255,0) 70%)', borderRadius: 60, mixBlendMode:'screen' }} />
            <div style={{ position:'absolute', inset:'10% 5% 15% 15%', background:'radial-gradient(circle at 50% 50%, #fff, rgba(255,255,255,0) 65%)', borderRadius: 60 }} />
          </div>
        ))}
        {/* Объекты на земле (перед фоном, позади игрока) */}
        {props.map(p => {
          const common:React.CSSProperties = { position:'absolute', left:p.x, bottom:72, transform:'translate(-50%,0)', pointerEvents:'none', zIndex:1 };
          return (
            <div key={p.id} style={common}>
              {p.kind === 'rock' && <div style={{ width:32, height:20, background:'linear-gradient(145deg,#5a656b,#3a454b)', borderRadius:6, boxShadow:'0 2px 4px -2px #000 inset, 0 0 4px #0007' }} />}
              {p.kind === 'bush' && <div style={{ width:34, height:24, background:'radial-gradient(circle at 30% 40%, #4f7d46, #2f4d2a)', borderRadius:12, boxShadow:'0 0 6px -2px #0f0 inset, 0 0 4px #0007' }} />}
              {p.kind === 'skull' && <div style={{ width:20, height:18, position:'relative' }}>
                <div style={{ position:'absolute', inset:0, background:'#ddd', borderRadius:4, boxShadow:'0 0 0 1px #555 inset' }} />
                <div style={{ position:'absolute', left:4, top:6, width:4, height:5, background:'#222', borderRadius:2 }} />
                <div style={{ position:'absolute', right:4, top:6, width:4, height:5, background:'#222', borderRadius:2 }} />
                <div style={{ position:'absolute', left:8, bottom:3, width:4, height:3, background:'#444', borderRadius:2 }} />
              </div>}
              {p.kind === 'stump' && <div style={{ width:30, height:18, background:'linear-gradient(180deg,#7a5a38,#4d321c)', borderRadius:'4px 4px 6px 6px', boxShadow:'0 0 0 1px #2d1a0e inset, 0 2px 4px -2px #000' }} />}
              {p.kind === 'crystal' && <div style={{ width:20, height:28, background:'linear-gradient(135deg,#6ff,#3ad)', clipPath:'polygon(50% 0,90% 30%,70% 100%,30% 100%,10% 30%)', filter:'drop-shadow(0 0 4px #5cf)', marginBottom:-8 }} />}
              {p.kind === 'mushroom' && <div style={{ width:22, height:20, position:'relative' }}>
                <div style={{ position:'absolute', left:8, bottom:0, width:6, height:10, background:'#dcd6c8', borderRadius:3 }} />
                <div style={{ position:'absolute', left:0, bottom:8, width:22, height:12, background:'radial-gradient(circle at 50% 55%,#ff6464,#c83030)', borderRadius:12, boxShadow:'0 0 0 1px #802020 inset' }} />
                <div style={{ position:'absolute', left:5, bottom:11, width:4, height:4, background:'#ffe0e0', borderRadius:'50%' }} />
                <div style={{ position:'absolute', right:5, bottom:10, width:4, height:4, background:'#ffe0e0', borderRadius:'50%' }} />
              </div>}
              {p.kind === 'sign' && <div style={{ width:26, height:26, position:'relative' }}>
                <div style={{ position:'absolute', left:11, bottom:0, width:4, height:16, background:'#6d5132', boxShadow:'0 0 0 1px #3a2612 inset' }} />
                <div style={{ position:'absolute', left:0, bottom:12, width:26, height:12, background:'linear-gradient(180deg,#9b7446,#6d5132)', borderRadius:3, boxShadow:'0 0 0 1px #3a2612 inset' }} />
                <div style={{ position:'absolute', left:4, bottom:15, width:6, height:2, background:'#3a2612', opacity:.6 }} />
                <div style={{ position:'absolute', right:4, bottom:15, width:6, height:2, background:'#3a2612', opacity:.6 }} />
              </div>}
              {p.kind === 'crate' && <div style={{ width:28, height:24, background:'linear-gradient(145deg,#8b6234,#583b1d)', border:'2px solid #3a2612', boxShadow:'0 0 0 1px #000 inset', position:'relative' }}>
                <div style={{ position:'absolute', inset:4, border:'2px solid #3a2612' }} />
              </div>}
            </div>
          );
        })}
        {showUpcoming && (()=>{
          const prog = upcomingProgress;
          // Визуальный easing (ускоряемся к концу) и лёгкий пульс масштаба
          const eased = prog*prog; // easeInQuad
          const leftPct = startPercent + (endPercent - startPercent) * eased;
          const opacity = Math.min(1, eased * 1.15);
          const t = performance.now()/1000;
          const pulse = Math.sin(t*8 + prog*5) * 0.035 * prog; // амплитуда растёт с прогрессом
          const scale = (0.9 + 0.1 * eased) * (1 + pulse);
          return (
            <div className="mob-upcoming slide" style={{ '--mobColor': approach.mob.color, left: leftPct + '%', opacity, transform:`translate(-50%,0) scale(${scale})` } as any}>
              <div className="mob-upcoming-icon" />
              {dangerNear && (<div className="mob-danger-exclaim">!</div>)}
            </div>
          );
        })()}
        {mobVisible && mob && (
          <div style={{ position: 'absolute', left: endPercent + '%', bottom: 70, transform: 'translateX(-50%)', zIndex: 3, display:'flex', flexDirection:'column', alignItems:'center' }}>
            <div style={{ width: 60, marginBottom: 14, transform:'translateY(-4px)', position:'relative' }}>
              <div style={{ fontSize: 10, textAlign: 'center', opacity: .9, fontWeight:600 }}>{mob.name}</div>
              <div style={{ height: 6, background: '#333', borderRadius: 4, overflow: 'hidden', boxShadow:'0 0 4px #000 inset', marginTop:2 }}>
                <div style={{ height: '100%', width: `${(mob.hp / mob.max) * 100}%`, background: 'linear-gradient(90deg,#f55,#faa)', transition: 'width .25s' }} />
              </div>
              <div style={{ fontSize: 9, textAlign: 'center', opacity: .65, marginTop:1 }}>{mob.hp}/{mob.max} HP</div>
              {xpFlash && mob.hp===0 && (
                <div className="xp-float" key={xpFlash.key} style={{ position:'absolute', left:'50%', top:-14, transform:'translate(-50%,-100%)', fontSize:12, fontWeight:600, color:'#6cf', textShadow:'0 0 6px #39c' }}>+{xpFlash.xp} XP</div>
              )}
            </div>
            <div style={{ width: 44, height: 44, background: mob.color, borderRadius: 10 }} />
          </div>
        )}
        {sequenceRef.current?.active && (
          <div style={{ position: 'absolute', left: 8, top: 8, fontSize: 11, background: '#0006', padding: '2px 6px', borderRadius: 6, color: '#ccc', zIndex: 10 }}>
            Крит: {sequenceRef.current.done}/{sequenceRef.current.required}
          </div>
        )}
        {tapTargets.map(t => (
          <div key={t.id} onClick={() => tapTarget(t.id)} style={{ position: 'absolute', left: t.x, top: t.y, width: 28, height: 28, marginLeft: -14, marginTop: -14, borderRadius: '50%', background: 'radial-gradient(circle at 35% 35%, #fff, #6cf)', boxShadow: '0 0 8px #6cf', zIndex: 12, cursor: 'pointer', animation: 'popIn .15s', border: '2px solid #0af' }} />
        ))}
  {/* Победный флеш заменён XP над именем */}
      </>
    );
  }
  // Невстроенный режим (если понадобится отдельно)
  const baseStyle: React.CSSProperties = { position: 'relative', width: '100%', height: 240, overflow: 'hidden', background: 'repeating-linear-gradient(90deg, #444 0 40px, #333 40px 80px)', backgroundPositionX: -bgOffset, backgroundRepeat: 'repeat' };
  return (
    <div ref={containerRef} className="adventure-container" style={baseStyle}>
      {playerSprite}
      {clouds.map(c => (
        <div key={c.id} style={{ position:'absolute', left: c.x, top: c.y, width: 110*c.scale, height: 48*c.scale, opacity:c.opacity, filter:'blur(0.4px)', pointerEvents:'none' }}>
          <div style={{ position:'absolute', inset:0, background:'radial-gradient(circle at 30% 40%, #fff, rgba(255,255,255,0) 70%)', borderRadius: 60, mixBlendMode:'screen' }} />
          <div style={{ position:'absolute', inset:'12% 8% 18% 18%', background:'radial-gradient(circle at 50% 50%, #fff, rgba(255,255,255,0) 65%)', borderRadius: 60 }} />
        </div>
      ))}
      {props.map(p => {
        const wrap:React.CSSProperties = { position:'absolute', left:p.x, bottom:72, transform:'translate(-50%,0)', pointerEvents:'none', opacity:.9, zIndex:1, display:'flex', alignItems:'flex-end', justifyContent:'center' };
        return (
          <div key={p.id} style={wrap}>
            {p.kind === 'rock' && <div style={{ width:32, height:22, background:'linear-gradient(145deg,#5a656b,#3a454b)', borderRadius:6, boxShadow:'0 2px 4px -2px #000 inset, 0 0 4px #0007' }} />}
            {p.kind === 'bush' && <div style={{ width:34, height:26, background:'radial-gradient(circle at 30% 40%, #4f7d46, #2f4d2a)', borderRadius:12, boxShadow:'0 0 6px -2px #0f0 inset, 0 0 4px #0007' }} />}
            {p.kind === 'skull' && <div style={{ width:22, height:20, position:'relative' }}>
              <div style={{ position:'absolute', inset:0, background:'#ddd', borderRadius:4, boxShadow:'0 0 0 1px #555 inset' }} />
              <div style={{ position:'absolute', left:4, top:6, width:4, height:5, background:'#222', borderRadius:2 }} />
              <div style={{ position:'absolute', right:4, top:6, width:4, height:5, background:'#222', borderRadius:2 }} />
              <div style={{ position:'absolute', left:9, bottom:3, width:4, height:3, background:'#444', borderRadius:2 }} />
            </div>}
            {p.kind === 'stump' && <div style={{ width:30, height:20, background:'linear-gradient(180deg,#7a5a38,#4d321c)', borderRadius:'4px 4px 6px 6px', boxShadow:'0 0 0 1px #2d1a0e inset, 0 2px 4px -2px #000' }} />}
            {p.kind === 'crystal' && <div style={{ width:20, height:30, background:'linear-gradient(135deg,#6ff,#3ad)', clipPath:'polygon(50% 0,90% 30%,70% 100%,30% 100%,10% 30%)', filter:'drop-shadow(0 0 4px #5cf)', marginBottom:-6 }} />}
            {p.kind === 'mushroom' && <div style={{ width:24, height:22, position:'relative' }}>
              <div style={{ position:'absolute', left:9, bottom:0, width:6, height:11, background:'#dcd6c8', borderRadius:3 }} />
              <div style={{ position:'absolute', left:1, bottom:9, width:22, height:13, background:'radial-gradient(circle at 50% 55%,#ff6464,#c83030)', borderRadius:12, boxShadow:'0 0 0 1px #802020 inset' }} />
              <div style={{ position:'absolute', left:6, bottom:12, width:4, height:4, background:'#ffe0e0', borderRadius:'50%' }} />
              <div style={{ position:'absolute', right:6, bottom:11, width:4, height:4, background:'#ffe0e0', borderRadius:'50%' }} />
            </div>}
            {p.kind === 'sign' && <div style={{ width:28, height:30, position:'relative' }}>
              <div style={{ position:'absolute', left:12, bottom:0, width:4, height:18, background:'#6d5132', boxShadow:'0 0 0 1px #3a2612 inset' }} />
              <div style={{ position:'absolute', left:0, bottom:14, width:28, height:14, background:'linear-gradient(180deg,#9b7446,#6d5132)', borderRadius:3, boxShadow:'0 0 0 1px #3a2612 inset' }} />
              <div style={{ position:'absolute', left:5, bottom:18, width:6, height:2, background:'#3a2612', opacity:.6 }} />
              <div style={{ position:'absolute', right:5, bottom:18, width:6, height:2, background:'#3a2612', opacity:.6 }} />
            </div>}
            {p.kind === 'crate' && <div style={{ width:30, height:26, background:'linear-gradient(145deg,#8b6234,#583b1d)', border:'2px solid #3a2612', boxShadow:'0 0 0 1px #000 inset', position:'relative' }}>
              <div style={{ position:'absolute', inset:4, border:'2px solid #3a2612' }} />
            </div>}
          </div>
        );
      })}
      {showUpcoming && (()=>{
        const prog = upcomingProgress;
  const eased = prog*prog;
  const leftPct = startPercent + (endPercent - startPercent) * eased;
  const opacity = Math.min(1, eased * 1.15);
  const t = performance.now()/1000;
  const pulse = Math.sin(t*8 + prog*5) * 0.035 * prog;
  const scale = (0.9 + 0.1 * eased) * (1 + pulse);
        return (
          <div className="mob-upcoming non-embedded slide" style={{ '--mobColor': approach.mob.color, top: '60%', bottom: 'auto', left: leftPct+'%', opacity, transform:`translate(-50%, -50%) scale(${scale})` } as any}>
            <div className="mob-upcoming-icon" />
            {dangerNear && (<div className="mob-danger-exclaim">!</div>)}
          </div>
        );
      })()}
      {mobVisible && mob && (
        <div style={{ position: 'absolute', left: endPercent + '%', top: '60%', transform: 'translate(-50%, -50%)', zIndex: 3, display:'flex', flexDirection:'column', alignItems:'center' }}>
          <div style={{ width: 52, marginBottom: 12, transform:'translateY(-4px)', position:'relative' }}>
            <div style={{ fontSize: 10, textAlign: 'center', opacity: .9, fontWeight:600 }}>{mob.name}</div>
            <div style={{ height: 6, background: '#333', borderRadius: 4, overflow: 'hidden', boxShadow:'0 0 4px #000 inset', marginTop:2 }}>
              <div style={{ height: '100%', width: `${(mob.hp / mob.max) * 100}%`, background: 'linear-gradient(90deg,#f55,#faa)', transition: 'width .25s' }} />
            </div>
            <div style={{ fontSize: 9, textAlign: 'center', opacity: .65, marginTop:1 }}>{mob.hp}/{mob.max} HP</div>
            {xpFlash && mob.hp===0 && (
              <div className="xp-float" key={xpFlash.key} style={{ position:'absolute', left:'50%', top:-14, transform:'translate(-50%,-100%)', fontSize:12, fontWeight:600, color:'#6cf', textShadow:'0 0 6px #39c' }}>+{xpFlash.xp} XP</div>
            )}
          </div>
          <div style={{ width: 40, height: 40, background: mob.color, borderRadius: 8 }} />
        </div>
      )}
      {sequenceRef.current?.active && (
        <div style={{ position: 'absolute', left: 8, top: 8, fontSize: 11, background: '#0006', padding: '2px 6px', borderRadius: 6, color: '#ccc', zIndex: 10 }}>
          Крит: {sequenceRef.current.done}/{sequenceRef.current.required}
        </div>
      )}
      {tapTargets.map(t => (
        <div key={t.id} onClick={() => tapTarget(t.id)} style={{ position: 'absolute', left: t.x, top: t.y, width: 28, height: 28, marginLeft: -14, marginTop: -14, borderRadius: '50%', background: 'radial-gradient(circle at 35% 35%, #fff, #6cf)', boxShadow: '0 0 8px #6cf', zIndex: 12, cursor: 'pointer', animation: 'popIn .15s', border: '2px solid #0af' }} />
      ))}
      {fight && mobVisible && mob && mob.hp <= 0 && (
        <div style={{ position: 'absolute', left: '55%', top: '45%', color: '#6cf', fontSize: 14, zIndex: 4 }}>Победа +{mob.xp}xp</div>
      )}
      <button style={{ position: 'absolute', right: 12, top: 12, zIndex: 20 }} onClick={onExit}>Завершить поход</button>
    </div>
  );
}

interface Customization {
  skinTone: 'light'|'tan'|'dark';
  hairStyle: 'short'|'long';
  hairColor: string;
  eyeColor: string;
  top: 'leaf'|null;
  bottom: 'leaf'|null;
  accessory: 'flower'|null;
  armor: 'plate'|null;
  cloak: 'cape'|null;
}

function App() {
  // Состояние боя для управления анимацией
  const [isFight, setIsFight] = useState(false);
  const stageRef = useRef<HTMLDivElement|null>(null);
  // ...existing code...
  const [screen, setScreen] = useState<'main' | 'adventure' | 'inventory' | 'combo'>('main');
  // customSprite убран вместе со старыми редакторами
  const [stickmanAnim, setStickmanAnim] = useState<{ walk: {x:number,y:number}[][], attack: {x:number,y:number}[][], overlay?: string[], attachments?: {jointIndex:number,itemId:string}[] } | null>(null);
  const [stickmanFrame, setStickmanFrame] = useState(0);
  const [currentAnim, setCurrentAnim] = useState<'walk'|'attack'>('walk');
  // Кастомизация (перемещено вверх)
  const [custom, setCustom] = useState<Customization>({
    skinTone: 'light', hairStyle: 'short', hairColor: '#35964A', eyeColor: '#3A7ACF', top: 'leaf', bottom: 'leaf', accessory: 'flower', armor: 'plate', cloak: null
  });
  const [inventory, setInventory] = useState<Item[]>([]);
  const [equipped, setEquipped] = useState<Item | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [level, setLevel] = useState(1);
  const [coins, setCoins] = useState(0);
  const [xp, setXp] = useState(0);
  const [userId, setUserId] = useState<string>('');
  const [tgUser, setTgUser] = useState<any | null>(null);
  const [saveStatus, setSaveStatus] = useState<{ status: 'idle' | 'saving' | 'ok' | 'error'; lastSuccess?: number; error?: string }>({ status: 'idle' });
  // Party
  const [party, setParty] = useState<any|null>(null);
  const [partyModal, setPartyModal] = useState(false);
  const [partySearch, setPartySearch] = useState('');
  const [partyResults, setPartyResults] = useState<any[]>([]);
  const [partyInvites, setPartyInvites] = useState<any[]>([]);
  const [partySentInvites, setPartySentInvites] = useState<any[]>([]);
  const [adventurePrompt, setAdventurePrompt] = useState<any|null>(null); // данные о запросе от другого
  const [acceptedAdventure, setAcceptedAdventure] = useState<{partyId:string; requesterId:string; createdAt:number}|null>(null);
  // Toast notifications
  type Toast = { id:string; body:string; type?:'good'|'bad'; ttl?:string; fade?:boolean };
  const [toasts, setToasts] = useState<Toast[]>([]);
  const pushToast = useCallback((body:string, opts?:{ type?:'good'|'bad'; ttl?:string; timeout?:number })=>{
    const id = Date.now().toString(36)+Math.random().toString(36).slice(2,7);
    const toast:Toast = { id, body, type: opts?.type, ttl: opts?.ttl };
    setToasts(prev => [...prev.slice(-4), toast]); // максимум 5 (новый + 4 предыдущих)
    const timeout = opts?.timeout ?? 4000;
    // Планируем исчезновение
    setTimeout(()=>{
      setToasts(prev => prev.map(t=> t.id===id ? { ...t, fade:true }: t));
      setTimeout(()=> setToasts(prev => prev.filter(t=> t.id!==id)), 520);
    }, timeout);
  }, []);
  const flashMsg = useCallback((txt: string) => {
    let type: 'good'|'bad'|undefined;
    if (/ошиб|сбой|fail|нет |не /i.test(txt)) type = 'bad';
    else if (/(\+\d+)|(уровень)|(в пати)|(отправлено)|(дроп)/i.test(txt)) type = 'good';
    let ttl: string | undefined;
    if (/afk/i.test(txt)) ttl = 'AFK';
    else if (/уровень/i.test(txt)) ttl = 'Level';
    else if (/пати|приглаш/i.test(txt)) ttl = 'Пати';
    else if (/поход/i.test(txt)) ttl = 'Поход';
    else if (/монет/i.test(txt)) ttl = 'Монеты';
    else if (/предмет|дроп/i.test(txt)) ttl = 'Лут';
    pushToast(txt, { type, ttl });
    setMessage(txt);
    setTimeout(() => setMessage(null), 2000);
  }, [pushToast]);
  const partyLoadingRef = useRef(false);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const initDataRef = useRef<string | null>(null);
  const devModeRef = useRef<boolean>(false);
  const noTelegramRef = useRef<boolean>(false); // когда запущено вне Telegram при выключенном DEV_MODE
  const dirtyRef = useRef(false);
  const loadingRef = useRef(false);
  const retryTimerRef = useRef<NodeJS.Timeout | null>(null);
  const backoffRef = useRef<number>(0);

  // Универсальный резолвер API (query ?api= / runtime config / env / dev localhost)
  const getApi = useCallback((path: string): string => {
    const w: any = window as any;
    const dyn = (w.__API_BASE__ || '').trim();
    if (dyn) return dyn.replace(/\/$/, '') + path;
    const envBase = (process.env.REACT_APP_API_BASE || '').replace(/\/$/, '');
    if (envBase) return envBase + path;
    if (devModeRef.current) return `http://localhost:3001${path}`;
    return path; // относительный (same-origin)
  }, []);

  // Захват initData из объекта Telegram WebApp
  useEffect(() => {
    // @ts-ignore
    const tg = (window as any).Telegram?.WebApp;
    if (tg && tg.initData) {
      initDataRef.current = tg.initData;
    } else {
      // Определим, хотим ли мы разрешить локальный dev fallback: если есть ?dev=1 или hostname содержит localhost
      const urlHasDev = /[?&]dev=1/.test(window.location.search) || /localhost/.test(window.location.hostname);
      if (urlHasDev) {
        devModeRef.current = true; // позволим локальные тесты
      } else {
        noTelegramRef.current = true; // заблокируем сетевые вызовы — нужно открыть через Telegram
      }
    }
  }, []);

  // Стабильная ссылка на функцию получения API (чтобы не ругался линтер хуков)
  const getApiRef = useRef<(path: string) => string>(() => '/api');
  getApiRef.current = getApi; // обновляем на каждое рендер, ref стабилен

  // Аутентификация + загрузка (используем getApi чтобы избежать относительных путей на GH Pages)
  useEffect(() => {
    (async () => {
      if (noTelegramRef.current) {
        setMessage('Открой через Telegram бота, чтобы играть');
        return; // не пытаемся auth/load
      }
      try {
        let uid: string | null = null;
        let userObj: any | null = null;
        if (initDataRef.current) {
          const resp = await fetch(getApiRef.current('/auth'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ initData: initDataRef.current })
          });
          const authJson = await resp.json();
          if (authJson.success && authJson.user?.id) {
            uid = String(authJson.user.id);
            userObj = authJson.user;
          } else {
            if (process.env.NODE_ENV !== 'production') console.warn('Auth fallback dev', authJson);
            devModeRef.current = true;
          }
        }
        if (!uid) {
          uid = 'dev-user';
          userObj = { id: 'dev-user', first_name: 'Dev', username: 'dev' };
        }
        setUserId(uid);
        setTgUser(userObj);
  // после загрузки пользователя подтянем состояние party
  try { await refreshParty(); } catch {}
  const loadResp = await fetch(getApiRef.current(`/load/${uid}`), {
          headers: initDataRef.current ? { 'x-telegram-init': initDataRef.current } : { 'x-dev-user': uid }
        });
        const json = await loadResp.json();
        if (json?.data) {
          const d = json.data;
          if (Array.isArray(d.inventory)) setInventory(d.inventory);
          if (typeof d.coins === 'number') setCoins(d.coins);
          if (d.equipped) setEquipped(d.equipped);
          if (typeof d.level === 'number') setLevel(d.level);
          if (typeof d.xp === 'number') setXp(d.xp);
          if (d.animations && typeof d.animations === 'object') {
            try {
              const anim = d.animations;
              if (anim.walk) {
                setStickmanAnim({
                  walk: anim.walk,
                  attack: anim.attack || anim.walk,
                  overlay: Array.isArray(anim.overlay)? anim.overlay : undefined,
                  attachments: Array.isArray(anim.attachments)? anim.attachments : []
                });
                try {
                  const wCount = Array.isArray(anim.walk)? anim.walk.length:0;
                  const aCount = Array.isArray(anim.attack)? anim.attack.length:0;
                  const atCount = Array.isArray(anim.attachments)? anim.attachments.length:0;
                  if (process.env.NODE_ENV !== 'production') console.log('[CLIENT LOAD] anim walk=%d attack=%d att=%d', wCount, aCount, atCount);
                } catch {}
              }
            } catch (e) { if (process.env.NODE_ENV !== 'production') console.warn('Anim parse failed', e); }
          }
          if (d.customization) {
            const cu = d.customization;
            const norm: Customization = {
              skinTone: (['light','tan','dark'].includes(cu.skinTone)? cu.skinTone : 'light') as any,
              hairStyle: (['short','long'].includes(cu.hairStyle)? cu.hairStyle : 'short') as any,
              hairColor: cu.hairColor || '#35964A',
              eyeColor: cu.eyeColor || '#3A7ACF',
              top: cu.top === 'leaf' ? 'leaf' : null,
              bottom: cu.bottom === 'leaf' ? 'leaf' : null,
              accessory: cu.accessory === 'flower' ? 'flower' : null,
              armor: cu.armor === 'plate' ? 'plate' : null,
              cloak: cu.cloak === 'cape' ? 'cape' : null,
            };
            setCustom(norm);
          }
          if (json.idle) {
            const idle = json.idle;
            if (idle.items?.length) {}
            flashMsg(`AFK +${idle.gainedXp}xp`);
          } else {
            flashMsg('Данные загружены');
          }
        }
      } catch (e) {
        if (process.env.NODE_ENV !== 'production') console.warn('Load/auth failed', e);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshInvitations = useCallback(async ()=>{
    if (!initDataRef.current && !devModeRef.current) return;
    try {
      const headers: Record<string,string> = initDataRef.current
        ? { 'x-telegram-init': initDataRef.current }
        : { 'x-dev-user': userId || 'dev-user' };
      const r = await fetch(getApi('/party/invitations'), { headers });
      const js = await r.json(); if (js.success) setPartyInvites(js.invitations||[]);
    } catch{}
  }, [getApi, userId]);

  const refreshSentInvitations = useCallback(async ()=>{
    if (!initDataRef.current && !devModeRef.current) return;
    try {
      const headers: Record<string,string> = initDataRef.current
        ? { 'x-telegram-init': initDataRef.current }
        : { 'x-dev-user': userId || 'dev-user' };
      const r = await fetch(getApi('/party/sent'), { headers });
      const js = await r.json(); if (js.success) setPartySentInvites(js.invitations||[]);
    } catch{}
  }, [getApi, userId]);

  const refreshParty = useCallback(async ()=>{
    if (!initDataRef.current && !devModeRef.current) return;
    try {
      const headers: Record<string,string> = initDataRef.current
        ? { 'x-telegram-init': initDataRef.current }
        : { 'x-dev-user': userId || 'dev-user' };
      const r = await fetch(getApi('/party/state'), { headers });
      const js = await r.json(); if (js.success) setParty(js.party);
    } catch{}
  }, [getApi, userId]);

  // периодический поллинг party и приглашений
  useEffect(()=>{
    if (!initDataRef.current) return;
    let stop=false;
    const loop=async()=>{
      if(stop) return;
  await Promise.all([refreshParty(), refreshInvitations(), refreshSentInvitations()]);
      setTimeout(loop, 6000);
    };
    loop();
    return ()=>{ stop=true; };
  }, [refreshParty, refreshInvitations, refreshSentInvitations]);

  const searchPartyUsers = useCallback(async (q:string)=>{
    if (!q) { setPartyResults([]); return; }
    if (!initDataRef.current && !devModeRef.current) { setPartyResults([]); return; }
    if (partyLoadingRef.current) return; partyLoadingRef.current=true;
    try {
      const headers: Record<string,string> = initDataRef.current
        ? { 'x-telegram-init': initDataRef.current }
        : { 'x-dev-user': userId || 'dev-user' };
      const r = await fetch(getApi('/party/search?q='+encodeURIComponent(q)), { headers });
      const js = await r.json(); if (js.success) setPartyResults(js.results||[]); else setPartyResults([]);
    } catch{ setPartyResults([]); } finally { partyLoadingRef.current=false; }
  }, [getApi, userId]);

  const inviteUser = useCallback(async (username:string)=>{
    if(!initDataRef.current && !devModeRef.current) { flashMsg('Нет авторизации'); return; }
    try {
      let u = username.trim();
      if (u.startsWith('@')) u = u.slice(1);
      if (!u) { flashMsg('Пустой username'); return; }
      const headers: Record<string,string> = initDataRef.current
        ? { 'Content-Type':'application/json','x-telegram-init': initDataRef.current }
        : { 'Content-Type':'application/json','x-dev-user': userId || 'dev-user' };
      const r = await fetch(getApi('/party/invite'), { method:'POST', headers, body: JSON.stringify({ username: u }) });
      const js = await r.json();
      if(js.success){
        flashMsg('Приглашение отправлено');
  refreshParty();
  refreshInvitations();
  refreshSentInvitations();
      } else {
        flashMsg('Не удалось: '+(js.error||'ошибка'));
      }
    } catch(e){ console.warn('[inviteUser] error', e); flashMsg('Сбой приглашения'); }
  }, [getApi, refreshParty, refreshInvitations, refreshSentInvitations, userId, flashMsg]);

  const acceptInvite = useCallback(async (id:string)=>{
    if(!initDataRef.current && !devModeRef.current) { flashMsg('Нет авторизации'); return; }
    try {
      const headers: Record<string,string> = initDataRef.current
        ? { 'Content-Type':'application/json','x-telegram-init': initDataRef.current }
        : { 'Content-Type':'application/json','x-dev-user': userId || 'dev-user' };
      const r = await fetch(getApi('/party/accept'), { method:'POST', headers, body: JSON.stringify({ invitationId:id }) });
  const js = await r.json(); if(js.success){ flashMsg('В пати'); refreshParty(); refreshInvitations(); refreshSentInvitations(); } else flashMsg('Ошибка принятия');
    } catch(e){ console.warn('[acceptInvite] error', e); flashMsg('Сбой принятия'); }
  }, [getApi, refreshParty, refreshInvitations, refreshSentInvitations, userId, flashMsg]);

  const declineInvite = useCallback(async (id:string)=>{
    if(!initDataRef.current && !devModeRef.current) { flashMsg('Нет авторизации'); return; }
    try {
      const headers: Record<string,string> = initDataRef.current
        ? { 'Content-Type':'application/json','x-telegram-init': initDataRef.current }
        : { 'Content-Type':'application/json','x-dev-user': userId || 'dev-user' };
      const r = await fetch(getApi('/party/decline'), { method:'POST', headers, body: JSON.stringify({ invitationId:id }) });
  const js = await r.json(); if(js.success){ refreshInvitations(); refreshSentInvitations(); flashMsg('Отклонено'); } else flashMsg('Ошибка отклонения');
    } catch(e){ console.warn('[declineInvite] error', e); flashMsg('Сбой отклонения'); }
  }, [getApi, refreshInvitations, refreshSentInvitations, userId, flashMsg]);

  const authHeaders = useCallback((): Record<string,string> => {
    const base: Record<string,string> = initDataRef.current
      ? { 'Content-Type': 'application/json', 'x-telegram-init': initDataRef.current }
      : { 'Content-Type': 'application/json', 'x-dev-user': (userId || 'dev-user') };
    // localtunnel (loca.lt) иногда показывает interstitial с 401 без custom header – добавим обходной заголовок
    try {
      const w:any = window as any;
      const apiBase = (w.__API_BASE__ || process.env.REACT_APP_API_BASE || '').toString();
      if (apiBase.includes('.loca.lt')) {
        base['bypass-tunnel-reminder'] = '1';
      }
    } catch {}
    return base;
  }, [userId]);

  // getApi определён выше, здесь удалён дубликат

  const saveAll = useCallback(async () => {
  if (loadingRef.current || !userId) return;
  if (noTelegramRef.current) return; // блокируем сохранение вне Telegram в проде
    if (!navigator.onLine) return; // не пытаться пока оффлайн
    loadingRef.current = true;
    setSaveStatus(s => ({ ...s, status: 'saving', error: undefined }));
    try {
  const resp = await fetch(getApi('/save'), {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          userId: userId,
          data: { inventory, equipped, level, xp, coins, customization: custom, animations: stickmanAnim }
        }),
      });
      if (!resp.ok) {
        let detail: any = null;
        try { detail = await resp.json(); } catch {}
        throw new Error(`HTTP ${resp.status} ${(detail && (detail.error||detail.message)) || resp.statusText}`);
      }
      dirtyRef.current = false;
      setSaveStatus({ status: 'ok', lastSuccess: Date.now() });
      if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
      backoffRef.current = 0;
    } catch (e: any) {
  if (process.env.NODE_ENV !== 'production') console.warn('Save failed', e);
      setSaveStatus({ status: 'error', error: e?.message });
      // Планируем ретрай с экспоненциальной задержкой
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      const delays = [1000, 3000, 7000, 15000];
      const delay = delays[Math.min(backoffRef.current, delays.length - 1)];
      backoffRef.current += 1;
      retryTimerRef.current = setTimeout(() => { if (dirtyRef.current) saveAll(); }, delay);
    } finally {
      loadingRef.current = false;
    }
  }, [inventory, equipped, level, xp, coins, userId, authHeaders, custom, stickmanAnim, getApi]);

  // После изменения состояний — debounce автосейв
  useEffect(() => {
    if (!userId) return;
    dirtyRef.current = true;
    const t = setTimeout(() => { if (dirtyRef.current) saveAll(); }, 1500);
    return () => clearTimeout(t);
  }, [inventory, equipped, level, xp, coins, stickmanAnim, saveAll, userId]);

  // Heartbeat
  useEffect(() => {
    if (!userId) return;
    const iv = setInterval(() => { if (dirtyRef.current) saveAll(); }, 10000);
    return () => clearInterval(iv);
  }, [saveAll, userId]);

  const xpForLevel = (lvl: number) => 50 + (lvl - 1) * 60; // простая линейно-растущая формула
  const nextLevelXp = xpForLevel(level);
  const progressPct = Math.min(100, (xp / nextLevelXp) * 100);

  const addItem = (item: Item) => {
    setInventory(prev => [
      ...prev,
      { ...item, id: item.id + '_' + (prev.filter(i => i.id.startsWith(item.id)).length + 1), _new: true as any },
    ]);
  // Лут: item.name
    flashMsg(`Предмет: ${item.name}`);
    // Небольшой бонус монет за дроп
    setCoins(c => c + 5);
  };

  const handleKill = (xpGained: number) => {
    setXp(prev => {
      let total = prev + xpGained;
      let lvl = level;
      let leveled = false;
      while (total >= xpForLevel(lvl)) {
        total -= xpForLevel(lvl);
        lvl += 1;
        leveled = true;
      }
      if (leveled) {
        setLevel(lvl);
        flashMsg(`Уровень ${lvl}!`);
      }
      return total;
    });
  };

  // Функции экипировки удалены из UI инвентаря (теперь только статус)

  // (flashMsg определён выше)

  // Состояния модального окна продажи
  const [sellModalItem, setSellModalItem] = useState<Item|null>(null);
  const [selling, setSelling] = useState(false);

  const computeSellPrice = (it: Item) => {
    const base = 10 + (it.attackBonus || 0) * 5;
    const mult = it.rarity === 'rare' ? 4 : it.rarity === 'uncommon' ? 2 : 1;
    return Math.max(1, Math.round(base * mult));
  };

  const sellItem = async (itemId: string) => {
    const it = inventory.find(i => i.id === itemId);
    if (!it) { setSellModalItem(null); return; }
    if (equipped?.id === itemId) { flashMsg('Снят предмет перед продажей'); setSellModalItem(null); return; }
    try {
      setSelling(true);
  const resp = await fetch(getApi('/sell'), {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ userId, itemId })
      });
      const js = await resp.json();
      if (!resp.ok || !js.success) throw new Error(js.error||'sell_failed');
      setInventory(inv => inv.filter(x => x.id !== itemId));
      setCoins(js.coins);
      flashMsg(`+${js.price} монет`);
      setSellModalItem(null);
    } catch (e:any) {
      flashMsg('Ошибка продажи');
  if (process.env.NODE_ENV !== 'production') console.warn('Sell failed', e);
    } finally {
      setSelling(false);
    }
  };

  // Лог отключён

  // Суммарный бонус атаки из всех прикреплённых к суставам предметов (оружия и т.п.)
  const attachmentsAttackBonus = useMemo(() => {
    if (!stickmanAnim || !stickmanAnim.attachments) return 0;
    let sum = 0;
    const counted = new Set<string>();
    for (const att of stickmanAnim.attachments) {
      const item = inventory.find(i => i.id === att.itemId);
      if (item && !counted.has(item.id)) {
        sum += item.attackBonus || 0;
        counted.add(item.id);
      }
    }
    return sum;
  }, [stickmanAnim, inventory]);
  // Если отдельно экипован предмет, который не прикреплён, добавим его бонус отдельно
  const totalAttackBonus = attachmentsAttackBonus + ((equipped && !(stickmanAnim?.attachments||[]).some(a=> a.itemId===equipped.id)) ? (equipped.attackBonus||0) : 0);

  const EquippedBadge = () => (
    equipped ? (
      <div style={{ position: 'absolute', left: 8, top: 70, background: '#262e', padding: '6px 10px', borderRadius: 12, fontSize: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, boxShadow: '0 0 6px #0008' }}>
        <span style={{ color: rarityColor[equipped.rarity], fontWeight: 600 }}>{equipped.name}</span>
        <span style={{ fontSize: 11 }}>+{equipped.attackBonus} dmg</span>
  {/* кнопка снятия убрана */}
      </div>
    ) : null
  );

  const InventoryScreen = () => (
    <>
      <header className="header">
        <img src={avatarUrl} alt="avatar" className="avatar" />
        <div className="nickname">{displayName}</div>
        <div className="level-bar">
          <div className="level-fill" style={{ width: `${progressPct}%` }} />
          <div className="level-overlay">
            <span>Ур. {level}</span>
            <span>{xp}/{nextLevelXp}</span>
          </div>
        </div>
        <div style={{ marginLeft: 'auto', fontSize:12, display:'flex', alignItems:'center', gap:6 }}>
          <span style={{ background:'#2a333b', padding:'4px 10px 5px', borderRadius:12, boxShadow:'0 0 0 1px #314049, 0 2px 4px -2px #000a', display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ width:14, height:14, background:'radial-gradient(circle at 30% 30%,#ffe9a6,#f7c94f)', borderRadius:'50%', boxShadow:'0 0 0 1px #6d5520, 0 0 6px -1px #f7c94f' }} />
            {coins}
          </span>
        </div>
      </header>
      <main className="main main-stage inventory-stage">
        <div className="stage-bg-main" />
        <div className="stage-ground-main" />
  {/* Центрированная сетка 3xN */}
  <div className="inv-grid-3" role="list">
          {inventory.length === 0 && (
            <div style={{ opacity:.6, fontSize:14 }}>Пусто</div>
          )}
          {inventory.map(it => (
            <div
              key={it.id}
              role="listitem"
              className={`inv-item big ${equipped?.id === it.id ? 'equipped' : ''} rarity-${it.rarity} ${(it as any)._new ? 'new-drop' : ''}`}
              onAnimationEnd={() => { delete (it as any)._new; }}
            >
        <div className={`inv-icon type-${it.type}`} />
        <div className="inv-name" style={{ color: rarityColor[it.rarity] }}>{it.name}</div>
        <div className="inv-bonus">Урон +{it.attackBonus}</div>
              {(() => {
                const attached = (stickmanAnim?.attachments||[]).some(a => a.itemId === it.id);
                const isEquipped = equipped?.id === it.id;
                const status = isEquipped ? 'Экипировано' : (attached ? 'На персонаже' : null);
                return (
                  <div style={{ display:'flex', flexDirection:'column', gap:6, width:'100%', alignItems:'center' }}>
                    {status && (
                      <div style={{ fontSize:11, padding:'3px 10px 4px', background:'#26313a', borderRadius:14, boxShadow:'0 0 0 1px #314049', letterSpacing:.3 }}>
                        {status}
                      </div>
                    )}
                    <button className="btn btn-small btn-wide"
                      onClick={() => { if (!(attached||isEquipped)) setSellModalItem(it); }}
                      disabled={attached || isEquipped}
                      title={attached? 'Предмет привязан (в редакторе персонажа)' : (isEquipped ? 'Снят в персонаже чтобы продать' : 'Продать')}
                      style={(attached||isEquipped) ? { opacity:.45, cursor:'not-allowed' } : undefined}
                    >Продать{!attached && !isEquipped ? ` (+${computeSellPrice(it)})` : ''}</button>
                  </div>
                );
              })()}
            </div>
          ))}
  </div>
        {/* Не показываем персонажа на экране инвентаря */}
      </main>
      <footer className="footer single">
        <button onClick={() => setScreen('main')}>Назад</button>
      </footer>
    </>
  );

  const displayName = tgUser ? (tgUser.first_name || tgUser.username || tgUser.id) + (tgUser.last_name ? ' ' + tgUser.last_name : '') : '...';
  const avatarUrl = tgUser?.photo_url || 'https://placehold.co/40x40';
  // (saveIndicator / onlineBadge UI перенесены в status-dock снизу)

  useEffect(() => {
    // Ensure setter referenced even if events not triggered yet
    setIsOnline(v => v);
  }, []);

  useEffect(() => {
    if (!stickmanAnim || screen !== 'adventure') { setStickmanFrame(0); setCurrentAnim('walk'); return; }
    // Переключение анимации по состоянию боя
    setCurrentAnim(isFight ? 'attack' : 'walk');
    let raf: number;
    const frameDuration = 160;
    let last = 0;
    const loop = (ts: number) => {
      if (!last) last = ts;
      if (ts - last >= frameDuration) {
        const frames = stickmanAnim[isFight ? 'attack' : 'walk'] || [];
        setStickmanFrame(f => frames.length ? (f+1)%frames.length : 0);
        last = ts;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [stickmanAnim, screen, isFight]);

  // Новый playerSprite:
  const playerSprite = useMemo(() => {
  if (stickmanAnim && stickmanAnim[currentAnim] && stickmanAnim[currentAnim].length) {
      const frames = stickmanAnim[currentAnim];
      let pose = frames[stickmanFrame] || frames[0];
      // Если кадр вдруг оказался объектом с joints, используем его
      if (pose && (pose as any).joints) pose = (pose as any).joints;
      if (!pose || !Array.isArray(pose) || pose.length < 9) return null;
      const canvas = document.createElement('canvas');
      canvas.width = 128; canvas.height = 128;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      const bones = [[0,1],[1,2],[1,3],[1,4],[2,5],[2,6],[3,7],[4,8]];
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#222';
      bones.forEach(([a,b]) => {
        if (pose[a] && pose[b]) {
          ctx.beginPath();
          ctx.moveTo(pose[a].x, pose[a].y);
          ctx.lineTo(pose[b].x, pose[b].y);
          ctx.stroke();
        }
      });
      if (pose[0]) {
        ctx.beginPath();
        ctx.arc(pose[0].x, pose[0].y, 16, 0, 2*Math.PI);
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 3;
        ctx.stroke();
      }
      // Overlay pixels (если есть)
      if (stickmanAnim.overlay && Array.isArray(stickmanAnim.overlay) && stickmanAnim.overlay.length === 128) {
        for (let y=0;y<stickmanAnim.overlay.length;y++) {
          const row = stickmanAnim.overlay[y];
          for (let x=0;x<row.length;x++) {
            const col = row[x];
            if (col==='.' ) continue;
            ctx.fillStyle = col === '#' ? '#000' : col; // поддержка #RRGGBB символов
            ctx.fillRect(x,y,1,1);
          }
        }
      }
      // Attachments (простая визуализация оружия)
      if (stickmanAnim.attachments && stickmanAnim.attachments.length) {
        stickmanAnim.attachments.forEach(att => {
          const joint = pose[att.jointIndex];
          if (!joint) return;
          const item = inventory.find(i => i.id === att.itemId);
            if (!item) return;
            if (item.type === 'weapon') {
              ctx.strokeStyle = '#c33';
              ctx.lineWidth = 3;
              ctx.beginPath();
              ctx.moveTo(joint.x, joint.y);
              ctx.lineTo(joint.x + 18, joint.y - 4);
              ctx.stroke();
              ctx.strokeStyle = '#fff';
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.moveTo(joint.x + 10, joint.y - 2);
              ctx.lineTo(joint.x + 18, joint.y - 4);
              ctx.stroke();
            } else if (item.type === 'shield') {
              ctx.fillStyle = '#888';
              ctx.beginPath();
              ctx.arc(joint.x + 10, joint.y, 10, 0, Math.PI*2);
              ctx.fill();
              ctx.strokeStyle = '#444';
              ctx.stroke();
            }
        });
      }
      const style: React.CSSProperties = screen === 'main'
        ? { imageRendering: 'pixelated', position: 'absolute', left: '50%', bottom: 12, width: 128, height: 128, transform: 'translateX(-50%) scale(1.75)', transformOrigin: 'bottom center', zIndex: 2 }
        : { imageRendering: 'pixelated', position: 'absolute', left: 40, bottom: 12, width: 64, height: 96, zIndex: 2 };
  return <img alt="stickman" className="stage-player" style={style} src={canvas.toDataURL()} />;
    }
    return null;
  }, [stickmanAnim, stickmanFrame, currentAnim, inventory, screen]);

  const partySprites = useMemo(()=>{
    if(!party || !party.members) return null;
    // Располагаем игроков в ряд начиная левее центра
    const others = party.members.filter((m:any)=> m.id !== userId).slice(0,3);
    return others.map((m:any, idx:number)=>{
      const initials = (m.first_name||m.username||m.id).slice(0,2).toUpperCase();
      return <div key={m.id} style={{ position:'absolute', left:`calc(50% + ${(-90 + idx*70)}px)`, bottom: 12, width:52, height:52, borderRadius:'50%', background:'#24333c', display:'flex', alignItems:'center', justifyContent:'center', color:'#6cf', fontSize:14, fontWeight:600, boxShadow:'0 0 0 2px #1b262d, 0 0 6px #000' }}>{initials}</div>;
    });
  }, [party, userId]);

  // Модальное окно подтверждения похода
  const adventurePromptModal = adventurePrompt ? (
    <div className="modal-backdrop" style={{zIndex:300}}>
      <div className="modal" style={{maxWidth:300}}>
        <h3 style={{marginTop:0}}>Поход</h3>
        <div style={{fontSize:13, lineHeight:1.4, marginBottom:14}}>Игрок хочет пойти в поход. Присоединиться?</div>
        <div style={{display:'flex', gap:8, justifyContent:'flex-end'}}>
          <button onClick={()=> respondAdventure(false)}>Нет</button>
          <button onClick={()=> { respondAdventure(true); setScreen('adventure'); }} style={{background:'#2e5532'}}>Да</button>
        </div>
      </div>
    </div>
  ) : null;

  // Поллинг статуса adventure request
  useEffect(()=>{
    if(!initDataRef.current && !devModeRef.current) return;
    let stop=false;
    const loop=async()=>{
      if(stop) return;
      try {
        const headers: Record<string,string> = initDataRef.current ? { 'x-telegram-init': initDataRef.current } : { 'x-dev-user': userId||'dev-user' };
        const r = await fetch(getApi('/party/adventure/status'), { headers });
        const js = await r.json();
        if(js.success){
          const req = js.request;
          if(req && req.requester_id !== userId && req.status==='pending') {
            // Если уже приняли (сохранили createdAt) или уже на экране похода — не показываем снова
            if(acceptedAdventure && acceptedAdventure.createdAt === req.created_at && screen==='adventure') {
              setAdventurePrompt(null);
            } else if (!acceptedAdventure || acceptedAdventure.createdAt !== req.created_at) {
              if(screen!== 'adventure') setAdventurePrompt(req); // показываем только если не в походе
            }
          } else if(req && req.status==='ready') {
            // Все согласились: авто старт у всех
            setAdventurePrompt(null);
            if(screen!=='adventure') setScreen('adventure');
          } else {
            setAdventurePrompt(null);
          }
          if(js.request && js.request.status==='declined' && js.request.requester_id===userId){
            flashMsg('Поход отклонён');
          }
        }
      } catch{}
      setTimeout(loop, 4000);
    };
    loop();
    return ()=>{ stop=true; };
  }, [getApi, userId, flashMsg, acceptedAdventure, screen]);

  const requestAdventure = useCallback(async ()=>{
    if(!party) { flashMsg('Нет пати'); return; }
    const me = party.members?.find((m:any)=> m.id === userId);
    if(!me || me.role !== 'leader'){ flashMsg('Только лидер может начинать поход'); return; }
    try {
      const headers: Record<string,string> = initDataRef.current ? { 'Content-Type':'application/json','x-telegram-init': initDataRef.current } : { 'Content-Type':'application/json','x-dev-user': userId||'dev-user' };
      const r = await fetch(getApi('/party/adventure/request'), { method:'POST', headers, body: JSON.stringify({}) });
      const js = await r.json(); if(js.success){ flashMsg('Ожидание ответа пати'); setScreen('adventure'); } else if(js.error==='not_leader'){ flashMsg('Вы не лидер'); } else flashMsg('Ошибка запроса');
    } catch{ flashMsg('Сбой'); }
  }, [party, getApi, userId, flashMsg, setScreen]);

  const respondAdventure = useCallback(async (accept:boolean)=>{
    try {
      const headers: Record<string,string> = initDataRef.current ? { 'Content-Type':'application/json','x-telegram-init': initDataRef.current } : { 'Content-Type':'application/json','x-dev-user': userId||'dev-user' };
      const r = await fetch(getApi('/party/adventure/respond'), { method:'POST', headers, body: JSON.stringify({ accept }) });
    const js = await r.json(); if(js.success){ if(!accept) flashMsg('Отказано'); setAdventurePrompt(null); if(accept){ flashMsg(js.ready? 'Начинаем!':'Принято'); // сохраняем чтобы не спамить модал
          // сохраняем отпечаток запроса (берём текущее adventurePrompt либо вытащим через последний статус если нужно)
          if(adventurePrompt){ setAcceptedAdventure({ partyId: adventurePrompt.party_id || (party?.partyId||''), requesterId: adventurePrompt.requester_id, createdAt: adventurePrompt.created_at }); }
      if(js.ready || adventurePrompt?.requester_id === userId) setScreen('adventure');
        } }
    } catch{ flashMsg('Сбой ответа'); }
  }, [getApi, userId, flashMsg, adventurePrompt, party, setScreen]);

  const leaveParty = useCallback(async ()=>{
    try {
      const headers: Record<string,string> = initDataRef.current ? { 'Content-Type':'application/json','x-telegram-init': initDataRef.current } : { 'Content-Type':'application/json','x-dev-user': userId||'dev-user' };
      const r = await fetch(getApi('/party/leave'), { method:'POST', headers, body: JSON.stringify({}) });
      const js = await r.json(); if(js.success){ flashMsg('Пати покинута'); refreshParty(); }
    } catch{ flashMsg('Сбой выхода'); }
  }, [getApi, refreshParty, userId, flashMsg]);


  return (
    <div className="container">
      {/* API indicator */}
      <div style={{position:'fixed', right:6, bottom:6, fontSize:10, background:'#18232b', color:'#6da8c9', padding:'4px 8px', borderRadius:6, opacity:0.85, zIndex:100}}>
        {(() => { const w:any=window as any; return 'API: '+ (w.__API_BASE__||'relative'); })()}
      </div>
      {screen === 'main' && (
        <>
          <header className="header">
            <img src={avatarUrl} alt="avatar" className="avatar" />
            <div className="nickname">{displayName}</div>
            <div className="level-bar">
              <div className="level-fill" style={{ width: `${progressPct}%` }} />
              <div className="level-overlay">
                <span>Ур. {level}</span>
                <span>{xp}/{nextLevelXp}</span>
              </div>
            </div>
            <div style={{ marginLeft: 'auto', fontSize:12, display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ background:'#2a333b', padding:'4px 10px 5px', borderRadius:12, boxShadow:'0 0 0 1px #314049, 0 2px 4px -2px #000a', display:'flex', alignItems:'center', gap:6 }}>
                <span style={{ width:14, height:14, background:'radial-gradient(circle at 30% 30%,#ffe9a6,#f7c94f)', borderRadius:'50%', boxShadow:'0 0 0 1px #6d5520, 0 0 6px -1px #f7c94f' }} />
                {coins}
              </span>
            </div>
          </header>
          <main className={`main main-stage`}>
            <div className="stage-bg-main" />
            <div className="stage-ground-main" />
            <div className="toasts-container">
              {toasts.map(t => (
                <div key={t.id} className={`toast ${t.type||''} ${t.fade? 'fade-out':''}`}>
                  {t.ttl && <div className="ttl">{t.ttl}</div>}
                  <div className="body">{t.body}</div>
                </div>
              ))}
            </div>
            {playerSprite}
            {partySprites}
            <EquippedBadge />
          </main>
          <footer className="footer">
            <button onClick={() => setScreen('inventory')}>Инвентарь</button>
            {!party && <button onClick={() => setScreen('adventure')}>Поход</button>}
            {party && party.members?.find((m:any)=> m.id===userId && m.role==='leader') && (
              <button onClick={requestAdventure}>Начать поход (пати)</button>
            )}
            {party && !party.members?.find((m:any)=> m.id===userId && m.role==='leader') && (
              <button disabled style={{opacity:.55}}>Ждём лидера</button>
            )}
            <button onClick={() => setScreen('combo')}>Персонаж</button>
            <button onClick={() => setPartyModal(true)}>Пати</button>
          </footer>
          <div className="screen">
            {message && <div style={{ animation: 'fadeIn 0.3s', color: '#6cf', marginTop:4 }}>{message}</div>}
          </div>
        </>
      )}
    {screen === 'adventure' && (
        <>
      {/** ref для параллакса */}
      {/** вынесен вне header чтобы не ломать структуру; сам ref на main-stage */}
          <header className="header">
            <img src={avatarUrl} alt="avatar" className="avatar" />
            <div className="nickname">{displayName}</div>
            <div className="level-bar">
              <div className="level-fill" style={{ width: `${progressPct}%` }} />
              <div className="level-overlay">
                <span>Ур. {level}</span>
                <span>{xp}/{nextLevelXp}</span>
              </div>
            </div>
            <div style={{ marginLeft: 'auto', fontSize:12, display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ background:'#2a333b', padding:'4px 10px 5px', borderRadius:12, boxShadow:'0 0 0 1px #314049, 0 2px 4px -2px #000a', display:'flex', alignItems:'center', gap:6 }}>
                <span style={{ width:14, height:14, background:'radial-gradient(circle at 30% 30%,#ffe9a6,#f7c94f)', borderRadius:'50%', boxShadow:'0 0 0 1px #6d5520, 0 0 6px -1px #f7c94f' }} />
                {coins}
              </span>
            </div>
          </header>
  <main className={`main main-stage${isFight ? ' fight' : ' travel'}`} ref={stageRef as any}>
            <div className="stage-bg-main" />
            <div className="stage-ground-main" />
            <div className="toasts-container">
              {toasts.map(t => (
                <div key={t.id} className={`toast ${t.type||''} ${t.fade? 'fade-out':''}`}>
                  {t.ttl && <div className="ttl">{t.ttl}</div>}
                  <div className="body">{t.body}</div>
                </div>
              ))}
            </div>
            <Adventure
              embedded
              onExit={() => setScreen('main')}
              onLoot={addItem}
              onKill={xp => { handleKill(xp); }}
              attackBonus={totalAttackBonus}
              playerSprite={playerSprite}
              onFightChange={setIsFight}
        stageRef={stageRef as any}
            />
          </main>
          <footer className="footer">
            <button onClick={() => setScreen('main')}>Закончить поход</button>
          </footer>
        </>
      )}
  {screen === 'inventory' && <InventoryScreen />}
      {screen === 'combo' && (
        <StickmanCombinedEditor
          inventory={inventory}
          initialAnimations={stickmanAnim ? { walk: stickmanAnim.walk, attack: stickmanAnim.attack } : undefined}
          initialOverlay={stickmanAnim?.overlay}
          initialAttachments={stickmanAnim?.attachments}
           onSave={async (data) => {
             const newAnim = { walk: data.animations.walk, attack: data.animations.attack, overlay: data.overlay, attachments: data.attachments };
             setStickmanAnim(newAnim);
             // Ждем сохранения чтобы гарантировать запись перед выходом
             try {
               if (userId) {
                 setSaveStatus(s => ({ ...s, status: 'saving' }));
                 const resp = await fetch('/save', {
                   method: 'POST',
                   headers: authHeaders(),
                   body: JSON.stringify({
                     userId,
                     data: { inventory, equipped, level, xp, customization: custom, animations: newAnim }
                   })
                 });
                 if (!resp.ok) throw new Error('save_failed');
                 dirtyRef.current = false;
                 setSaveStatus({ status: 'ok', lastSuccess: Date.now() });
               } else {
                 dirtyRef.current = true;
               }
             } catch (e) {
               dirtyRef.current = true;
               setSaveStatus(s => ({ ...s, status: 'error', error: 'anim_save_failed' }));
             }
             setScreen('main');
           }}
          onCancel={() => setScreen('main')}
        />
      )}
      {sellModalItem && (
        <div className="modal-backdrop" onMouseDown={(e)=>{ if(e.target===e.currentTarget) setSellModalItem(null); }}>
          <div className="modal" role="dialog" aria-modal="true">
            <h3 style={{marginTop:0}}>Продажа предмета</h3>
            <div style={{fontSize:13, lineHeight:1.4, marginBottom:12}}>
              Продать «<span style={{color:rarityColor[sellModalItem.rarity]}}>{sellModalItem.name}</span>» за <b>{computeSellPrice(sellModalItem)}</b> монет?
            </div>
            <div style={{display:'flex', gap:8, justifyContent:'flex-end'}}>
              <button className="btn btn-outline" disabled={selling} onClick={()=>setSellModalItem(null)}>Отмена</button>
              <button className="btn btn-danger" disabled={selling} onClick={()=> sellItem(sellModalItem.id)}>
                {selling ? '...' : 'Продать'}
              </button>
            </div>
          </div>
        </div>
      )}
      {partyModal && (
        <div className="modal-backdrop" onMouseDown={(e)=>{ if(e.target===e.currentTarget) setPartyModal(false); }}>
          <div className="modal" style={{ maxWidth:360 }}>
            <h3 style={{marginTop:0}}>Пати</h3>
            {party && <div style={{marginBottom:8, display:'flex', justifyContent:'flex-end'}}><button onClick={leaveParty} style={{background:'#523', fontSize:12}}>Покинуть пати</button></div>}
            <div style={{display:'flex', gap:6, marginBottom:10}}>
              <input value={partySearch} onChange={e=>{ setPartySearch(e.target.value); searchPartyUsers(e.target.value); }} placeholder="Поиск по username" style={{flex:1}} />
              <button onClick={()=> searchPartyUsers(partySearch)}>Поиск</button>
            </div>
            <div style={{maxHeight:120, overflowY:'auto', marginBottom:10, border:'1px solid #233038', padding:6, borderRadius:6}}>
              {partyResults.length===0 && <div style={{opacity:.5, fontSize:12}}>Нет результатов</div>}
              {partyResults.map(u=>(
                <div key={u.id} style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'4px 2px', borderBottom:'1px solid #1f2a31'}}>
                  <span style={{fontSize:12}}>@{u.username||'—'} {(u.first_name||'')}</span>
                  <button onClick={()=> inviteUser(u.username)} style={{fontSize:11, padding:'4px 8px'}}>+</button>
                </div>
              ))}
            </div>
            <div style={{fontSize:12, fontWeight:600, margin:'10px 0 4px'}}>Входящие приглашения</div>
            <div style={{maxHeight:100, overflowY:'auto', border:'1px solid #233038', padding:6, borderRadius:6}}>
              {partyInvites.length===0 && <div style={{opacity:.5, fontSize:12}}>Нет приглашений</div>}
              {partyInvites.map(inv=>(
                <div key={inv.id} style={{display:'flex', alignItems:'center', justifyContent:'space-between', gap:6, padding:'4px 2px', borderBottom:'1px solid #1f2a31'}}>
                  <span style={{fontSize:12}}>от @{inv.from?.username||inv.from?.id}</span>
                  <div style={{display:'flex', gap:4}}>
                    <button onClick={()=> acceptInvite(inv.id)} style={{fontSize:11, padding:'3px 8px'}}>OK</button>
                    <button onClick={()=> declineInvite(inv.id)} style={{fontSize:11, padding:'3px 8px'}}>X</button>
                  </div>
                </div>
              ))}
            </div>
            <div style={{fontSize:12, fontWeight:600, margin:'12px 0 4px'}}>Отправленные приглашения</div>
            <div style={{maxHeight:80, overflowY:'auto', border:'1px solid #233038', padding:6, borderRadius:6}}>
              {partySentInvites.length===0 && <div style={{opacity:.5, fontSize:12}}>Нет отправленных</div>}
              {partySentInvites.map(inv=>(
                <div key={inv.id} style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'4px 2px', borderBottom:'1px solid #1f2a31'}}>
                  <span style={{fontSize:12}}>@{inv.to?.username||inv.to?.id}</span>
                  <span style={{fontSize:10, opacity:.6}}>ожидание</span>
                </div>
              ))}
            </div>
            <div style={{display:'flex', justifyContent:'flex-end', marginTop:12}}>
              <button onClick={()=> setPartyModal(false)}>Закрыть</button>
            </div>
          </div>
        </div>
      )}
  {adventurePromptModal}
      {/* Status dock */}
      <div className="status-dock">
        <div className="status-pill">
          <div className={`dot ${isOnline? 'dot-online':'dot-offline'}`}></div>
          <span className="label">{isOnline? 'Online':'Offline'}</span>
          <span>{saveStatus.status==='saving' ? 'Сохранение...' : saveStatus.status==='error' ? 'Ошибка' : saveStatus.status==='ok' ? 'OK' : ''}</span>
        </div>
      </div>
    </div>
  );
}

export default App;
