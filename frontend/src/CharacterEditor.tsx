import React, { useRef, useState } from 'react';

const CANVAS_W = 128;
const CANVAS_H = 128;
const SCALE = 4;

export interface CharacterEditorProps {
  onSave: (dataUrl: string) => void;
}

export const CharacterEditor: React.FC<CharacterEditorProps> = ({ onSave }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [color, setColor] = useState('#222');
  const [isDrawing, setIsDrawing] = useState(false);

  // Рисование пикселя
  const handleDraw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / SCALE);
    const y = Math.floor((e.clientY - rect.top) / SCALE);
    const ctx = canvasRef.current!.getContext('2d')!;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, 1, 1);
  };

  // Сохранить картинку
  const handleSave = () => {
    const dataUrl = canvasRef.current!.toDataURL();
    onSave(dataUrl);
  };

  // Очистить
  const handleClear = () => {
    const ctx = canvasRef.current!.getContext('2d')!;
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  };

  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ marginBottom: 8 }}>
        <input type="color" value={color} onChange={e => setColor(e.target.value)} />
        <button onClick={handleClear} style={{ marginLeft: 8 }}>Очистить</button>
        <button onClick={handleSave} style={{ marginLeft: 8 }}>Сохранить</button>
      </div>
      <canvas
        ref={canvasRef}
        width={CANVAS_W}
        height={CANVAS_H}
        style={{ border: '1px solid #888', background: '#fff', width: CANVAS_W * SCALE, height: CANVAS_H * SCALE, cursor: 'crosshair' }}
        onMouseDown={e => { setIsDrawing(true); handleDraw(e); }}
        onMouseUp={() => setIsDrawing(false)}
        onMouseLeave={() => setIsDrawing(false)}
        onMouseMove={e => { if (isDrawing) handleDraw(e); }}
      />
  <div style={{ fontSize: 12, marginTop: 8 }}>Нарисуйте своего персонажа (128×128 пикселей)</div>
    </div>
  );
};
