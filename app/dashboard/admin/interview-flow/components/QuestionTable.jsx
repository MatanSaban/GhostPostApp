'use client';

import {
  ChevronUp,
  ChevronDown,
  MessageSquareMore,
  Edit2,
  Copy,
  Trash2,
  Eye,
  EyeOff,
  Type,
  CheckCircle,
  List,
  Zap,
  FileText,
  Upload,
  Sliders,
  Bot,
} from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { TableSkeleton } from '@/app/dashboard/components';
import { getTypeLabel } from './useInterviewFlow';
import styles from '../../admin.module.css';

// Question type icons
const typeIcons = {
  GREETING: MessageSquareMore,
  INPUT: Type,
  CONFIRMATION: CheckCircle,
  SELECTION: List,
  MULTI_SELECTION: List,
  DYNAMIC: Zap,
  EDITABLE_DATA: FileText,
  FILE_UPLOAD: Upload,
  SLIDER: Sliders,
  AI_SUGGESTION: Bot,
};

export default function QuestionTable({
  filteredQuestions,
  isLoading,
  onMove,
  onToggleActive,
  onEdit,
  onDuplicate,
  onDelete,
}) {
  const { t } = useLocale();
  
  // Get type icon
  const getTypeIcon = (type) => {
    const Icon = typeIcons[type] || MessageSquareMore;
    return <Icon size={16} />;
  };
  
  if (isLoading) {
    return <TableSkeleton rows={8} columns={7} hasActions />;
  }
  
  if (filteredQuestions.length === 0) {
    return (
      <div className={styles.emptyState}>
        <MessageSquareMore className={styles.emptyIcon} />
        <h3 className={styles.emptyTitle}>{t('admin.interviewFlow.noQuestions')}</h3>
        <p className={styles.emptyMessage}>{t('admin.common.noResults')}</p>
      </div>
    );
  }
  
  return (
    <table className={styles.table}>
      <thead className={styles.tableHeader}>
        <tr>
          <th style={{ width: '40px' }}></th>
          <th style={{ width: '40px' }}>#</th>
          <th>{t('admin.interviewFlow.columns.key')}</th>
          <th style={{ width: '150px' }}>{t('admin.interviewFlow.columns.type')}</th>
          <th style={{ width: '120px' }}>{t('admin.interviewFlow.columns.actions')}</th>
          <th style={{ width: '100px' }}>{t('admin.interviewFlow.columns.status')}</th>
          <th style={{ width: '140px' }}>{t('admin.common.actions')}</th>
        </tr>
      </thead>
      <tbody>
        {filteredQuestions.map((question, index) => (
          <tr key={question.id} className={!question.isActive ? styles.inactiveRow : ''}>
            <td>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <button
                  className={styles.moveButton}
                  onClick={() => onMove(question.id, 'up')}
                  disabled={index === 0}
                  title="Move up"
                >
                  <ChevronUp size={14} />
                </button>
                <button
                  className={styles.moveButton}
                  onClick={() => onMove(question.id, 'down')}
                  disabled={index === filteredQuestions.length - 1}
                  title="Move down"
                >
                  <ChevronDown size={14} />
                </button>
              </div>
            </td>
            <td style={{ fontWeight: 500, color: 'var(--muted-foreground)' }}>
              {question.order + 1}
            </td>
            <td>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontWeight: 500, fontFamily: 'monospace', fontSize: '0.875rem' }}>
                  {question.translationKey}
                </span>
                {question.saveToField && (
                  <span style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>
                    → {question.saveToField}
                  </span>
                )}
              </div>
            </td>
            <td>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {getTypeIcon(question.questionType)}
                <span style={{ fontSize: '0.875rem' }}>
                  {getTypeLabel(t, question.questionType)}
                </span>
              </div>
            </td>
            <td>
              {question.allowedActions?.length > 0 && (
                <span className={styles.badge} style={{ background: 'var(--primary)', color: 'white' }}>
                  {question.allowedActions.length} actions
                </span>
              )}
              {question.autoActions?.length > 0 && (
                <span className={styles.badge} style={{ background: 'var(--warning)', color: 'var(--warning-foreground)', marginLeft: '4px' }}>
                  {question.autoActions.length} auto
                </span>
              )}
            </td>
            <td>
              <button
                onClick={() => onToggleActive(question)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  background: question.isActive ? 'var(--success-bg)' : 'var(--muted)',
                  color: question.isActive ? 'var(--success)' : 'var(--muted-foreground)',
                }}
              >
                {question.isActive ? <Eye size={12} /> : <EyeOff size={12} />}
                {question.isActive ? t('admin.common.active') : t('admin.common.inactive')}
              </button>
            </td>
            <td>
              <div className={styles.actionButtons}>
                <button
                  className={styles.actionButton}
                  onClick={() => onEdit(question)}
                  title="Edit"
                >
                  <Edit2 size={14} />
                </button>
                <button
                  className={styles.actionButton}
                  onClick={() => onDuplicate(question)}
                  title="Duplicate"
                >
                  <Copy size={14} />
                </button>
                <button
                  className={`${styles.actionButton} ${styles.deleteButton}`}
                  onClick={() => onDelete(question)}
                  title="Delete"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
