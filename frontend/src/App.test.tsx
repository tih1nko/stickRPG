import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

// Smoke test: проверяем, что базовые кнопки футера отображаются
test('renders main footer buttons', () => {
  render(<App />);
  expect(screen.getByRole('button', { name: /Инвентарь/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Поход/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Персонаж/i })).toBeInTheDocument();
});
