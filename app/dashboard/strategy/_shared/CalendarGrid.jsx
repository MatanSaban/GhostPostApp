'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, GripVertical } from 'lucide-react';
import styles from './CalendarGrid.module.css';

// Map dotStatus → letter icon SVG path
const STATUS_ICON = {
  published:      '/icons/letter-p.svg',
  scheduled:      '/icons/letter-s.svg',
  processing:     '/icons/letter-l.svg',
  readyToPublish: '/icons/letter-r.svg',
  failed:         '/icons/letter-f.svg',
  draft:          '/icons/letter-d.svg',
};

/**
 * Portal-based tooltip - avoids overflow:hidden clipping from day cells.
 */
function PortalTooltip({ text, rect }) {
  if (!text || !rect) return null;
  return createPortal(
    <div
      className={styles.portalTooltip}
      style={{
        top: rect.top - 6,
        left: rect.left + rect.width / 2,
      }}
    >
      {text}
    </div>,
    document.body
  );
}

/**
 * Shared calendar grid used by content-planner and ai-content-wizard.
 *
 * @param {string}   monthLabel    - e.g. "March 2026"
 * @param {string[]} dayNames      - e.g. ['Sun','Mon',…]
 * @param {Array}    calendarDays  - 42 cells: { day, month?, today?, inRange?, posts?[] }
 * @param {Function} onPrevMonth   - navigate to previous month
 * @param {Function} onNextMonth   - navigate to next month
 * @param {Function} onPostClick   - (post, event) when a post is clicked
 * @param {Function} [onDrop]      - (draggedPost, targetCell) when a post is dropped; enables DnD
 * @param {Array}    legendItems   - [{ icon, alt, label }]
 * @param {Object}   statusLabels  - { published:'Published', scheduled:'Scheduled', … }
 * @param {string}   [cardClassName] - extra CSS class for the wrapper card
 */
export default function CalendarGrid({
  monthLabel,
  dayNames,
  calendarDays,
  onPrevMonth,
  onNextMonth,
  onPostClick,
  onDrop,
  legendItems = [],
  statusLabels = {},
  deletedLabel = 'deleted',
  cardClassName,
}) {
  const [tooltip, setTooltip] = useState(null);
  const [dragPost, setDragPost] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);

  const canDrag = (post) => {
    if (!onDrop) return false;
    if (post.source !== 'plan' && post.source !== 'pipeline' && post.source !== 'entity') return false;
    return true;
  };

  const handleDragStart = (post, e) => {
    setDragPost(post);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', post.id);
  };

  const handleDragOver = useCallback((idx, e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(idx);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverIndex(null);
  }, []);

  const handleDropInternal = useCallback((cell, idx, e) => {
    e.preventDefault();
    setDragOverIndex(null);
    if (!dragPost || !onDrop) return;
    onDrop(dragPost, cell);
    setDragPost(null);
  }, [dragPost, onDrop]);

  const handleDragEnd = () => {
    setDragPost(null);
    setDragOverIndex(null);
  };

  const sentinelRef = useRef(null);
  const [isStuck, setIsStuck] = useState(false);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsStuck(!entry.isIntersecting),
      { threshold: 0 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  return (
    <div className={`${styles.calendarCard} ${cardClassName || ''}`}>
      <div ref={sentinelRef} className={styles.stickySentinel} />
      <div className={`${styles.calendarHeader} ${isStuck ? styles.stuck : ''}`}>
        <h3 className={styles.calendarTitle}>{monthLabel}</h3>
        <div className={styles.calendarNav}>
          <button className={styles.calendarNavBtn} onClick={onPrevMonth}>
            <ChevronLeft size={14} />
          </button>
          <button className={styles.calendarNavBtn} onClick={onNextMonth}>
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      <div className={styles.calendarGrid}>
        {dayNames.map((name) => (
          <div key={name} className={styles.calendarDayHeader}>{name}</div>
        ))}

        {calendarDays.map((cell, index) => {
          const isOther = !!cell.month || cell.other;
          return (
            <div
              key={index}
              className={[
                styles.calendarDay,
                cell.today ? styles.today : '',
                isOther ? styles.otherMonth : '',
                cell.inRange ? styles.inRange : '',
                dragOverIndex === index && !isOther ? styles.calendarDayDragOver : '',
              ].filter(Boolean).join(' ')}
              onDragOver={!isOther && onDrop ? (e) => handleDragOver(index, e) : undefined}
              onDragLeave={!isOther && onDrop ? handleDragLeave : undefined}
              onDrop={!isOther && onDrop ? (e) => handleDropInternal(cell, index, e) : undefined}
            >
              <span className={styles.dayNumber}>{cell.day}</span>
              {cell.posts && cell.posts.length > 0 && (
                <div className={styles.dayPosts}>
                  {cell.posts.map((post) => {
                    const draggable = canDrag(post);
                    return (
                      <div
                        key={post.id}
                        className={[
                          styles.dayPostItem,
                          draggable ? styles.dayPostDraggable : '',
                          dragPost?.id === post.id ? styles.dayPostDragging : '',
                        ].filter(Boolean).join(' ')}
                        draggable={draggable}
                        onDragStart={draggable ? (e) => handleDragStart(post, e) : undefined}
                        onDragEnd={draggable ? handleDragEnd : undefined}
                        onClick={(e) => onPostClick?.(post, e)}
                      >
                        {draggable && (
                          <GripVertical size={8} className={styles.dayPostGrip} />
                        )}
                        {post.campaignColor && (
                          <span
                            className={`${styles.dayPostCampaignDot} ${post.campaignDeleted ? styles.dayPostCampaignDeleted : ''}`}
                            style={{ background: post.campaignColor }}
                            onMouseEnter={(e) => {
                              if (!post.campaignName) return;
                              const rect = e.currentTarget.getBoundingClientRect();
                              const text = post.campaignDeleted
                                ? `${post.campaignName} (${deletedLabel})`
                                : post.campaignName;
                              setTooltip({ text, rect });
                            }}
                            onMouseLeave={() => setTooltip(null)}
                          />
                        )}
                        {STATUS_ICON[post.dotStatus] && (
                          <img
                            src={STATUS_ICON[post.dotStatus]}
                            alt={statusLabels[post.dotStatus] || post.dotStatus}
                            className={styles.dayPostStatusIcon}
                            onMouseEnter={(e) => {
                              const rect = e.currentTarget.getBoundingClientRect();
                              setTooltip({ text: statusLabels[post.dotStatus] || post.dotStatus, rect });
                            }}
                            onMouseLeave={() => setTooltip(null)}
                          />
                        )}
                        <span
                          className={styles.dayPostTitle}
                          onMouseEnter={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            setTooltip({ text: post.title, rect });
                          }}
                          onMouseLeave={() => setTooltip(null)}
                        >{post.title}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {legendItems.length > 0 && (
        <div className={styles.legend}>
          {legendItems.map((item, i) => (
            <div key={i} className={styles.legendItem}>
              {item.icon ? (
                <img src={item.icon} alt={item.alt || ''} className={styles.legendIcon} />
              ) : item.color ? (
                <span className={styles.legendDot} style={{ background: item.color }} />
              ) : null}
              {item.label}
            </div>
          ))}
        </div>
      )}

      <PortalTooltip text={tooltip?.text} rect={tooltip?.rect} />
    </div>
  );
}
