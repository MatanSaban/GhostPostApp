'use client';

import { useState } from 'react';
import { 
  Bold, 
  Italic, 
  Underline, 
  List, 
  ListOrdered,
  Link,
  Image,
  Code,
  Quote,
  Heading1,
  Heading2,
  Heading3,
  AlignLeft,
  AlignCenter,
  AlignRight,
} from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import styles from '../edit.module.css';

export function ContentEditor({ content, onChange }) {
  const { t } = useLocale();
  const [isSourceMode, setIsSourceMode] = useState(false);

  // For now, we'll use a simple textarea with HTML content
  // In production, you'd integrate a proper WYSIWYG editor like TipTap
  
  const toolbarButtons = [
    { icon: Bold, title: 'Bold', command: 'bold' },
    { icon: Italic, title: 'Italic', command: 'italic' },
    { icon: Underline, title: 'Underline', command: 'underline' },
    { type: 'separator' },
    { icon: Heading1, title: 'Heading 1', command: 'h1' },
    { icon: Heading2, title: 'Heading 2', command: 'h2' },
    { icon: Heading3, title: 'Heading 3', command: 'h3' },
    { type: 'separator' },
    { icon: List, title: 'Bullet List', command: 'ul' },
    { icon: ListOrdered, title: 'Numbered List', command: 'ol' },
    { type: 'separator' },
    { icon: AlignLeft, title: 'Align Left', command: 'left' },
    { icon: AlignCenter, title: 'Align Center', command: 'center' },
    { icon: AlignRight, title: 'Align Right', command: 'right' },
    { type: 'separator' },
    { icon: Link, title: 'Link', command: 'link' },
    { icon: Image, title: 'Image', command: 'image' },
    { icon: Quote, title: 'Quote', command: 'quote' },
    { icon: Code, title: 'Code', command: 'code' },
  ];

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <h3 className={styles.cardTitle}>{t('entities.edit.content')}</h3>
        <button
          onClick={() => setIsSourceMode(!isSourceMode)}
          className={styles.viewButton}
          style={{ padding: '0.375rem 0.75rem', fontSize: '0.75rem' }}
        >
          <Code style={{ width: '0.875rem', height: '0.875rem' }} />
          {isSourceMode ? t('entities.edit.visual') : t('entities.edit.html')}
        </button>
      </div>
      <div className={styles.wysiwygField}>
        {!isSourceMode && (
          <div className={styles.wysiwygToolbar}>
            {toolbarButtons.map((button, index) => {
              if (button.type === 'separator') {
                return (
                  <div 
                    key={index} 
                    style={{ 
                      width: '1px', 
                      height: '1.5rem', 
                      background: 'var(--border)',
                      margin: '0 0.25rem',
                    }} 
                  />
                );
              }
              const Icon = button.icon;
              return (
                <button
                  key={index}
                  title={button.title}
                  type="button"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '2rem',
                    height: '2rem',
                    borderRadius: 'var(--radius-sm)',
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--foreground)',
                    cursor: 'pointer',
                  }}
                >
                  <Icon style={{ width: '1rem', height: '1rem' }} />
                </button>
              );
            })}
          </div>
        )}
        <textarea
          value={content || ''}
          onChange={(e) => onChange(e.target.value)}
          className={styles.wysiwygContent}
          style={{
            width: '100%',
            border: 'none',
            resize: 'vertical',
            fontFamily: isSourceMode ? 'monospace' : 'inherit',
            fontSize: isSourceMode ? '0.8125rem' : '0.9375rem',
            lineHeight: '1.6',
          }}
          rows={15}
          placeholder={t('entities.edit.contentPlaceholder')}
        />
      </div>
    </div>
  );
}
