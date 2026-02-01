'use client';

import { useState } from 'react';
import { 
  Calendar, 
  List, 
  ChevronLeft,
  ChevronRight,
  Edit,
  Eye,
  Trash2
} from 'lucide-react';
import { StatusBadge } from '../../../components';
import styles from '../page.module.css';

export function ContentPlannerView({ translations, contentItems }) {
  const [viewMode, setViewMode] = useState('calendar');
  const [currentDate, setCurrentDate] = useState(new Date());

  const goToPrevMonth = () => {
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const getMonthName = (date) => {
    const months = translations.months;
    return months[date.getMonth()];
  };

  const generateCalendarDays = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();
    
    const days = [];
    const today = new Date();
    
    const contentDates = {
      1: ['published'],
      4: ['scheduled'],
      8: ['published', 'draft'],
      12: ['scheduled'],
      15: ['published'],
      22: ['scheduled'],
      25: ['scheduled'],
    };
    
    for (let i = firstDay - 1; i >= 0; i--) {
      days.push({ day: daysInPrevMonth - i, month: 'prev' });
    }
    
    for (let i = 1; i <= daysInMonth; i++) {
      const isToday = today.getDate() === i && 
                      today.getMonth() === month && 
                      today.getFullYear() === year;
      days.push({ 
        day: i, 
        today: isToday,
        dots: contentDates[i] || undefined
      });
    }
    
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      days.push({ day: i, month: 'next' });
    }
    
    return days;
  };

  const calendarDays = generateCalendarDays();

  return (
    <>
      <div className={styles.viewToggle}>
        <button 
          className={`${styles.viewButton} ${viewMode === 'calendar' ? styles.active : ''}`}
          onClick={() => setViewMode('calendar')}
        >
          <Calendar size={16} />
          {translations.calendar}
        </button>
        <button 
          className={`${styles.viewButton} ${viewMode === 'list' ? styles.active : ''}`}
          onClick={() => setViewMode('list')}
        >
          <List size={16} />
          {translations.list}
        </button>
      </div>

      {viewMode === 'calendar' ? (
        <div className={styles.calendarCard}>
          <div className={styles.calendarHeader}>
            <h3 className={styles.calendarTitle}>{getMonthName(currentDate)} {currentDate.getFullYear()}</h3>
            <div className={styles.calendarNav}>
              <button className={styles.calendarNavButton} onClick={goToPrevMonth}>
                <ChevronLeft size={16} />
              </button>
              <button className={styles.calendarNavButton} onClick={goToNextMonth}>
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
          <div className={styles.calendarGrid}>
            {translations.dayNames.map((day) => (
              <div key={day} className={styles.calendarDayHeader}>{day}</div>
            ))}
            {calendarDays.map((item, index) => (
              <div 
                key={index} 
                className={`${styles.calendarDay} ${item.today ? styles.today : ''} ${item.month ? styles.otherMonth : ''}`}
              >
                <span className={styles.dayNumber}>{item.day}</span>
                {item.dots && (
                  <div className={styles.dayDots}>
                    {item.dots.map((dot, i) => (
                      <span key={i} className={`${styles.dayDot} ${styles[dot]}`} />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className={styles.legend}>
            <div className={styles.legendItem}>
              <span className={`${styles.legendDot} ${styles.published}`} />
              {translations.published}
            </div>
            <div className={styles.legendItem}>
              <span className={`${styles.legendDot} ${styles.scheduled}`} />
              {translations.scheduled}
            </div>
            <div className={styles.legendItem}>
              <span className={`${styles.legendDot} ${styles.draft}`} />
              {translations.draft}
            </div>
          </div>
        </div>
      ) : (
        <div className={styles.calendarCard}>
          <div className={styles.calendarHeader}>
            <h3 className={styles.calendarTitle}>{translations.allContent}</h3>
          </div>
          <div className={styles.contentList}>
            {contentItems.map((item) => (
              <div key={item.id} className={styles.contentItem}>
                <div className={styles.contentInfo}>
                  <span className={styles.contentTitle}>{item.title}</span>
                  <span className={styles.contentMeta}>{item.type}</span>
                </div>
                <StatusBadge status={item.status === 'published' ? 'complete' : item.status === 'scheduled' ? 'pending' : 'paused'}>
                  {item.statusText}
                </StatusBadge>
                <span className={styles.contentDate}>{item.date}</span>
                <div className={styles.contentActions}>
                  <button className={styles.actionButton}>
                    <Eye size={14} />
                  </button>
                  <button className={styles.actionButton}>
                    <Edit size={14} />
                  </button>
                  <button className={styles.actionButton}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
