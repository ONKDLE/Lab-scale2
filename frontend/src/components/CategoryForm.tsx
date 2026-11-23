import { FormEvent, useEffect, useState } from 'react';
import type { CategoryInput } from '../api/categories';

interface Props {
  initial?: CategoryInput;
  submitLabel: string;
  busy?: boolean;
  onSubmit: (value: CategoryInput) => void;
  onCancel: () => void;
}

const DEFAULT_COLOR = '#4472C4';

export default function CategoryForm({ initial, submitLabel, busy = false, onSubmit, onCancel }: Props) {
  const [name, setName] = useState(initial?.name ?? '');
  const [color, setColor] = useState(initial?.color ?? DEFAULT_COLOR);
  const [icon, setIcon] = useState(initial?.icon ?? '');

  useEffect(() => {
    setName(initial?.name ?? '');
    setColor(initial?.color ?? DEFAULT_COLOR);
    setIcon(initial?.icon ?? '');
  }, [initial?.name, initial?.color, initial?.icon]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onSubmit({
      name: trimmed,
      color: /^#[0-9A-Fa-f]{6}$/.test(color) ? color : DEFAULT_COLOR,
      icon: icon.trim() || null,
    });
  };

  return (
    <form className="category-form" onSubmit={submit}>
      <div className="field">
        <label htmlFor="category-name">카테고리명</label>
        <input
          id="category-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={50}
          required
          autoFocus
        />
      </div>
      <div className="category-form-row">
        <div className="field">
          <label htmlFor="category-color">색상</label>
          <input
            id="category-color"
            className="color-input"
            type="color"
            value={/^#[0-9A-Fa-f]{6}$/.test(color) ? color : DEFAULT_COLOR}
            onChange={(event) => setColor(event.target.value)}
            aria-label="카테고리 색상"
          />
        </div>
        <div className="field">
          <label htmlFor="category-icon">아이콘 <span className="field-hint">(선택)</span></label>
          <input
            id="category-icon"
            value={icon}
            onChange={(event) => setIcon(event.target.value)}
            maxLength={20}
            placeholder="☕"
          />
        </div>
      </div>
      <div className="modal-actions">
        <button type="button" className="secondary-button" onClick={onCancel} disabled={busy}>취소</button>
        <button type="submit" className="primary-button" disabled={busy || !name.trim()}>
          {busy ? '처리 중…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
