import React, { useRef, useState } from 'react';

const CANVAS_W = 128;
const CANVAS_H = 128;
const SCALE = 4;

const defaultJoints = [
  { x: 64, y: 24 },
  { x: 64, y: 48 },
  { x: 64, y: 80 },
  { x: 40, y: 60 },
  { x: 88, y: 60 },
  { x: 32, y: 100 },
  { x: 96, y: 100 },
  { x: 32, y: 80 },
  { x: 96, y: 80 },
];
const bones = [
  [0,1],[1,2],[1,3],[1,4],[2,5],[2,6],[3,7],[4,8]
];

export interface StickmanEditorProps {
  onSave: (animations: { walk: {x:number,y:number}[][], attack: {x:number,y:number}[][] }) => void;
}

export const StickmanEditor: React.FC<StickmanEditorProps> = ({ onSave }) => {
  // Автогенерация кадров с простыми вариациями
  function autoGenerateFrames() {
    // walk: шаги (движение ног и рук)
    const walkFrames = [];
    for (let i = 0; i < 5; i++) {
      // Копируем базовые суставы
      const joints = defaultJoints.map(j => ({ ...j }));
      // Анимация шага: ноги и руки двигаются синусоидально
      const t = i / 5 * Math.PI * 2;
      // Левая нога (5)
      joints[5].y += Math.sin(t) * 10;
      joints[5].x += Math.cos(t) * 6;
      // Правая нога (6)
      joints[6].y += Math.sin(t + Math.PI) * 10;
      joints[6].x += Math.cos(t + Math.PI) * 6;
      // Левая рука (3)
      joints[3].y += Math.sin(t + Math.PI) * 8;
      joints[3].x += Math.cos(t + Math.PI) * 5;
      // Правая рука (4)
      joints[4].y += Math.sin(t) * 8;
      joints[4].x += Math.cos(t) * 5;
      walkFrames.push({ joints });
    }
    // attack: взмах руки
    const attackFrames = [];
    for (let i = 0; i < 5; i++) {
      const joints = defaultJoints.map(j => ({ ...j }));
      // Правая рука (4) поднимается вверх
      joints[4].y -= i * 8;
      joints[4].x += i * 2;
      // Левая рука (3) чуть назад
      joints[3].y += i * 2;
      joints[3].x -= i * 2;
      attackFrames.push({ joints });
    }
    setFramesWalk(walkFrames);
    setFramesAttack(attackFrames);
    setMode('walk');
    setCurrentFrame(0);
  }
  const [mode, setMode] = useState<'walk'|'attack'>('walk');
  const [framesWalk, setFramesWalk] = useState([{ joints: defaultJoints.map(j=>({...j})) }]);
  const [framesAttack, setFramesAttack] = useState([{ joints: defaultJoints.map(j=>({...j})) }]);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [dragIdx, setDragIdx] = useState<number|null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Выбор текущего набора кадров
  const frames = mode === 'walk' ? framesWalk : framesAttack;
  const setFrames = mode === 'walk' ? setFramesWalk : setFramesAttack;

  // Перерисовка
  React.useEffect(() => {
    const ctx = canvasRef.current!.getContext('2d')!;
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    const joints = frames[currentFrame].joints;
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#222';
    bones.forEach(([a,b]) => {
      ctx.beginPath();
      ctx.moveTo(joints[a].x, joints[a].y);
      ctx.lineTo(joints[b].x, joints[b].y);
      ctx.stroke();
    });
    joints.forEach((j,i) => {
      ctx.beginPath();
      ctx.arc(j.x, j.y, 7, 0, 2*Math.PI);
      ctx.fillStyle = dragIdx===i ? '#6cf' : '#fa6';
      ctx.fill();
      ctx.strokeStyle = '#333';
      ctx.stroke();
    });
    ctx.beginPath();
    ctx.arc(joints[0].x, joints[0].y, 16, 0, 2*Math.PI);
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 3;
    ctx.stroke();
  }, [frames, currentFrame, dragIdx]);

  // Перетаскивание суставов
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / SCALE;
    const my = (e.clientY - rect.top) / SCALE;
    const joints = frames[currentFrame].joints;
    for (let i=0;i<joints.length;i++) {
      const j = joints[i];
      if (Math.hypot(j.x-mx, j.y-my) < 12) {
        setDragIdx(i);
        return;
      }
    }
  };
  const handleMouseUp = () => setDragIdx(null);
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragIdx===null) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / SCALE;
    const my = (e.clientY - rect.top) / SCALE;
    setFrames(frames => frames.map((f,idx) => idx===currentFrame ? { joints: f.joints.map((j,i)=> i===dragIdx? {x:mx,y:my} : j) } : f));
  };

  // Добавить кадр
  const addFrame = () => {
    const base = frames[currentFrame].joints.map(j=>({...j}));
    setFrames(frames => [...frames, { joints: base }]);
    setCurrentFrame(frames.length);
  };
  // Удалить кадр
  const removeFrame = () => {
    if (frames.length <= 1) return;
    setFrames(frames => frames.filter((_,idx)=> idx!==currentFrame));
    setCurrentFrame(f => Math.max(0, f-1));
  };
  // Сбросить позу
  const resetPose = () => {
    setFrames(frames => frames.map((f,idx)=> idx===currentFrame ? { joints: defaultJoints.map(j=>({...j})) } : f));
  };

  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ marginBottom: 8 }}>
        <button onClick={()=> setMode('walk')} style={{ fontWeight: mode==='walk'?600:400 }}>Ходьба</button>
        <button onClick={()=> setMode('attack')} style={{ fontWeight: mode==='attack'?600:400, marginLeft: 8 }}>Атака</button>
  <button onClick={autoGenerateFrames} style={{ marginLeft: 8, background: '#e6f', color: '#222' }}>Автогенерация кадров</button>
        <button onClick={resetPose} style={{ marginLeft: 8 }}>Сбросить позу</button>
        <button onClick={addFrame} style={{ marginLeft: 8 }}>Добавить кадр</button>
        <button onClick={removeFrame} style={{ marginLeft: 8 }}>Удалить кадр</button>
        <button onClick={()=> onSave({ walk: framesWalk.map(f=>f.joints), attack: framesAttack.map(f=>f.joints) })} style={{ marginLeft: 8 }}>Сохранить анимации</button>
      </div>
      <div style={{ marginBottom: 8 }}>
        Кадр:
        {frames.map((_,idx)=>(
          <button key={idx} style={{ marginLeft: 4, fontWeight: idx===currentFrame?600:400 }} onClick={()=>setCurrentFrame(idx)}>{idx+1}</button>
        ))}
      </div>
      <canvas
        ref={canvasRef}
        width={CANVAS_W}
        height={CANVAS_H}
        style={{ border: '1px solid #888', background: '#fff', width: CANVAS_W * SCALE, height: CANVAS_H * SCALE, cursor: 'pointer' }}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onMouseMove={handleMouseMove}
      />
      <div style={{ fontSize: 12, marginTop: 8 }}>Двигайте суставы, чтобы задать позу Stickman. Можно добавить несколько кадров для анимации!</div>
    </div>
  );
};
