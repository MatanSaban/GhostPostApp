'use client';

import { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, ChevronLeft, ChevronRight, ChevronsRight, AlertTriangle, X } from 'lucide-react';
import { WEEK_DAYS } from '../../wizardConfig';
import styles from '../../page.module.css';

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year, month) {
  return new Date(year, month, 1).getDay();
}

function isSameDay(d1, d2) {
  return d1.getDate() === d2.getDate() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getFullYear() === d2.getFullYear();
}

function toDateStr(date) {
  if (!date) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseDate(str) {
  if (!str) return null;
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Returns "HH:MM" string for 1 hour from now, clamped to 23:59 */
function getMinTimeFromNow() {
  const now = new Date();
  now.setHours(now.getHours() + 1);
  const h = String(Math.min(now.getHours(), 23)).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function timeToMinutes(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

/** Count how many days in [start..end] fall on the selected publishDays */
function countPublishDaysInRange(start, end, publishDays) {
  // Map day key to JS getDay() index
  const dayKeyToIndex = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  const allowedIndices = new Set(publishDays.map(d => dayKeyToIndex[d]));
  let count = 0;
  const current = new Date(start);
  while (current <= end) {
    if (allowedIndices.has(current.getDay())) count++;
    current.setDate(current.getDate() + 1);
  }
  return count;
}

export default function ScheduleStep({ state, dispatch, translations }) {
  const t = translations.schedule;
  const [hoverDate, setHoverDate] = useState(null);
  const [schedulePopup, setSchedulePopup] = useState(null);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = toDateStr(today);

  const [calendarMonth, setCalendarMonth] = useState(() => {
    const start = parseDate(state.startDate);
    // Never show a month before the current month
    if (start && start >= today) return new Date(start.getFullYear(), start.getMonth());
    return new Date(today.getFullYear(), today.getMonth());
  });

  const startDate = parseDate(state.startDate);
  const endDate = parseDate(state.endDate);
  const isStartToday = startDate && isSameDay(startDate, today);

  const monthNames = translations.months || [];

  /** Show popup when posts vs available publish days mismatch */
  const checkPostsVsDays = (start, end, days) => {
    if (!start || !end) return;
    const available = countPublishDaysInRange(start, end, days);
    if (state.postsCount > available) {
      setSchedulePopup(
        t.morePosts
          .replaceAll('{posts}', state.postsCount)
          .replaceAll('{days}', available)
      );
    } else if (state.postsCount < available) {
      setSchedulePopup(
        t.fewerPosts
          .replaceAll('{posts}', state.postsCount)
          .replaceAll('{days}', available)
      );
    }
  };

  // On mount: clear past dates, or set defaults (today → +1 month)
  useEffect(() => {
    if (state.startDate && state.startDate < todayStr) {
      // Past dates — reset to defaults
      const oneMonthLater = new Date(today);
      oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);
      dispatch({ type: 'SET_FIELD', field: 'startDate', value: todayStr });
      dispatch({ type: 'SET_FIELD', field: 'endDate', value: toDateStr(oneMonthLater) });
    } else if (state.endDate && state.endDate < todayStr) {
      dispatch({ type: 'SET_FIELD', field: 'endDate', value: '' });
    } else if (!state.startDate) {
      // No dates set — auto-fill defaults
      const oneMonthLater = new Date(today);
      oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);
      dispatch({ type: 'SET_FIELD', field: 'startDate', value: todayStr });
      dispatch({ type: 'SET_FIELD', field: 'endDate', value: toDateStr(oneMonthLater) });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // When start date is today, enforce publish time >= now + 1h
  useEffect(() => {
    if (!isStartToday) return;
    clampPublishTime();
  }, [state.startDate, state.publishTimeMode]); // eslint-disable-line react-hooks/exhaustive-deps

  function clampPublishTime() {
    const minTime = getMinTimeFromNow();
    const minMins = timeToMinutes(minTime);

    if (state.publishTimeMode === 'fixed') {
      if (timeToMinutes(state.publishTimeStart) < minMins) {
        dispatch({ type: 'SET_FIELD', field: 'publishTimeStart', value: minTime });
      }
    } else {
      let newStart = state.publishTimeStart;
      let newEnd = state.publishTimeEnd;
      let changed = false;
      if (timeToMinutes(newStart) < minMins) {
        newStart = minTime;
        changed = true;
      }
      if (timeToMinutes(newEnd) < timeToMinutes(newStart)) {
        newEnd = newStart;
        changed = true;
      }
      if (changed) {
        dispatch({ type: 'SET_FIELD', field: 'publishTimeStart', value: newStart });
        dispatch({ type: 'SET_FIELD', field: 'publishTimeEnd', value: newEnd });
      }
    }
  }

  const toggleDay = (day) => {
    const current = state.publishDays;
    const updated = current.includes(day)
      ? current.filter(d => d !== day)
      : [...current, day];
    if (updated.length === 0) return;
    dispatch({ type: 'SET_FIELD', field: 'publishDays', value: updated });
    // Check posts vs days after toggling
    if (startDate && endDate) {
      const available = countPublishDaysInRange(startDate, endDate, updated);
      if (state.postsCount > available) {
        setSchedulePopup(
          t.morePosts
            .replaceAll('{posts}', state.postsCount)
            .replaceAll('{days}', available)
        );
      } else if (state.postsCount < available) {
        setSchedulePopup(
          t.fewerPosts
            .replaceAll('{posts}', state.postsCount)
            .replaceAll('{days}', available)
        );
      }
    }
  };

  // --- Calendar logic ---
  const isInRange = (date) => {
    if (!startDate) return false;
    const end = endDate || hoverDate;
    if (!end) return false;
    const s = startDate < end ? startDate : end;
    const f = startDate < end ? end : startDate;
    return date >= s && date <= f;
  };

  const isStart = (date) => startDate && isSameDay(date, startDate);
  const isEnd = (date) => endDate && isSameDay(date, endDate);
  const isHoverEnd = (date) => !endDate && hoverDate && startDate && isSameDay(date, hoverDate);

  const handleDateClick = (date) => {
    // Block past dates
    if (date < today) return;

    if (!startDate || (startDate && endDate)) {
      dispatch({ type: 'SET_FIELD', field: 'startDate', value: toDateStr(date) });
      dispatch({ type: 'SET_FIELD', field: 'endDate', value: '' });
    } else {
      let newStart = startDate;
      let newEnd = date;
      if (date < startDate) {
        newEnd = startDate;
        newStart = date;
      }
      dispatch({ type: 'SET_FIELD', field: 'startDate', value: toDateStr(newStart) });
      dispatch({ type: 'SET_FIELD', field: 'endDate', value: toDateStr(newEnd) });
      // Check posts vs days after date range selected
      checkPostsVsDays(newStart, newEnd, state.publishDays);
    }
  };

  const clearDates = () => {
    dispatch({ type: 'SET_FIELD', field: 'startDate', value: '' });
    dispatch({ type: 'SET_FIELD', field: 'endDate', value: '' });
  };

  const calendarDays = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const days = [];
    for (let i = 0; i < firstDay; i++) {
      days.push({ day: null, date: null, isPast: false });
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const isPast = date < today;
      days.push({ day, date, isPast });
    }
    return days;
  }, [calendarMonth]);

  return (
    <div className={styles.stepContent}>
      <div className={styles.stepHeader}>
        <div className={styles.stepIconWrapper}>
          <Calendar className={styles.stepHeaderIcon} />
        </div>
        <div className={styles.stepInfo}>
          <h2 className={styles.stepTitle}>{t.title}</h2>
          <p className={styles.stepDescription}>{t.description}</p>
        </div>
      </div>

      {/* Publishing Days */}
      <div className={styles.scheduleDaysSection}>
        <h3 className={styles.scheduleSubtitle}>{t.publishDays}</h3>
        <p className={styles.scheduleSubdesc}>{t.publishDaysHint}</p>
        <div className={styles.scheduleDaysGrid}>
          {WEEK_DAYS.map((day) => {
            const active = state.publishDays.includes(day);
            return (
              <label
                key={day}
                className={`${styles.scheduleDayCheckbox} ${active ? styles.scheduleDayActive : ''}`}
              >
                <input
                  type="checkbox"
                  checked={active}
                  onChange={() => toggleDay(day)}
                  className={styles.hiddenInput}
                />
                <span className={styles.scheduleDayBox}>
                  {active && (
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M11.5 3.5L5.5 10.5L2.5 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </span>
                <span className={styles.scheduleDayLabel}>{t.daysFull[day]}</span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Selected Dates Display */}
      <div className={styles.selectedDatesBar}>
        <div className={styles.dateDisplayBox}>
          <label className={styles.dateDisplayLabel}>{t.startDate}</label>
          <input
            type="date"
            className={`${styles.dateDisplayInput} ${state.startDate ? styles.dateDisplayInputActive : ''}`}
            value={state.startDate}
            min={todayStr}
            onChange={(e) => {
              const val = e.target.value;
              // Prevent selecting dates before today
              if (val && val < todayStr) return;
              dispatch({ type: 'SET_FIELD', field: 'startDate', value: val });
              if (val) {
                const d = parseDate(val);
                if (d) setCalendarMonth(new Date(d.getFullYear(), d.getMonth()));
              }
            }}
          />
        </div>
        <div className={styles.dateArrowIcon}>
          <ChevronsRight size={20} />
        </div>
        <div className={styles.dateDisplayBox}>
          <label className={styles.dateDisplayLabel}>{t.endDate}</label>
          <input
            type="date"
            className={`${styles.dateDisplayInput} ${state.endDate ? styles.dateDisplayInputActive : ''}`}
            value={state.endDate}
            min={state.startDate || todayStr}
            onChange={(e) => {
              const val = e.target.value;
              if (val && val < todayStr) return;
              dispatch({ type: 'SET_FIELD', field: 'endDate', value: val });
            }}
          />
        </div>
      </div>

      {/* Calendar */}
      <div className={styles.calendarWrapper}>
        <div className={styles.calendarNav}>
          <button
            className={styles.calendarNavBtn}
            disabled={calendarMonth.getFullYear() === today.getFullYear() && calendarMonth.getMonth() <= today.getMonth()}
            onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1))}
          >
            <ChevronLeft size={18} />
          </button>
          <span className={styles.calendarMonthTitle}>
            {monthNames[calendarMonth.getMonth()] || ''} {calendarMonth.getFullYear()}
          </span>
          <button
            className={styles.calendarNavBtn}
            onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1))}
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <div className={styles.calendarDaysHeader}>
          {WEEK_DAYS.map((day) => (
            <div key={day} className={styles.calendarDayHeaderCell}>{t.days[day]}</div>
          ))}
        </div>

        <div className={styles.calendarGrid}>
          {calendarDays.map((cell, index) => (
            <div
              key={index}
              className={[
                styles.calendarCell,
                !cell.date ? styles.calendarCellEmpty : '',
                cell.isPast ? styles.calendarCellPast : '',
                cell.date && isStart(cell.date) ? styles.calendarCellStart : '',
                cell.date && isEnd(cell.date) ? styles.calendarCellEnd : '',
                cell.date && isHoverEnd(cell.date) ? styles.calendarCellHoverEnd : '',
                cell.date && isInRange(cell.date) ? styles.calendarCellInRange : '',
              ].filter(Boolean).join(' ')}
              onClick={() => cell.date && !cell.isPast && handleDateClick(cell.date)}
              onMouseEnter={() => cell.date && !cell.isPast && startDate && !endDate && setHoverDate(cell.date)}
              onMouseLeave={() => setHoverDate(null)}
            >
              <span className={styles.calendarCellDay}>{cell.day}</span>
            </div>
          ))}
        </div>

        {(startDate || endDate) && (
          <button className={styles.clearDatesBtn} onClick={clearDates}>
            {t.clearSelection}
          </button>
        )}
      </div>

      {/* Publishing Time */}
      <div className={styles.scheduleTimeSection}>
        <h3 className={styles.scheduleSubtitle}>{t.publishTime}</h3>
        <div className={styles.scheduleTimeModes}>
          <label className={`${styles.scheduleTimeMode} ${state.publishTimeMode === 'random' ? styles.scheduleTimeModeActive : ''}`}>
            <input
              type="radio"
              name="timeMode"
              value="random"
              checked={state.publishTimeMode === 'random'}
              onChange={() => dispatch({ type: 'SET_FIELD', field: 'publishTimeMode', value: 'random' })}
              className={styles.hiddenInput}
            />
            <span className={styles.scheduleTimeRadio} />
            <span>{t.randomTime}</span>
          </label>
          <label className={`${styles.scheduleTimeMode} ${state.publishTimeMode === 'fixed' ? styles.scheduleTimeModeActive : ''}`}>
            <input
              type="radio"
              name="timeMode"
              value="fixed"
              checked={state.publishTimeMode === 'fixed'}
              onChange={() => dispatch({ type: 'SET_FIELD', field: 'publishTimeMode', value: 'fixed' })}
              className={styles.hiddenInput}
            />
            <span className={styles.scheduleTimeRadio} />
            <span>{t.fixedTime}</span>
          </label>
        </div>

        {state.publishTimeMode === 'random' ? (
          <div className={styles.scheduleTimeInputs}>
            <div className={styles.scheduleTimeField}>
              <label>{t.timeStart}</label>
              <input
                type="time"
                className={styles.scheduleTimeInput}
                value={state.publishTimeStart}
                min={isStartToday ? getMinTimeFromNow() : undefined}
                onChange={(e) => {
                  const val = e.target.value;
                  if (isStartToday && timeToMinutes(val) < timeToMinutes(getMinTimeFromNow())) return;
                  dispatch({ type: 'SET_FIELD', field: 'publishTimeStart', value: val });
                }}
              />
            </div>
            <div className={styles.scheduleTimeField}>
              <label>{t.timeEnd}</label>
              <input
                type="time"
                className={styles.scheduleTimeInput}
                value={state.publishTimeEnd}
                min={isStartToday ? getMinTimeFromNow() : undefined}
                onChange={(e) => {
                  const val = e.target.value;
                  if (isStartToday && timeToMinutes(val) < timeToMinutes(getMinTimeFromNow())) return;
                  dispatch({ type: 'SET_FIELD', field: 'publishTimeEnd', value: val });
                }}
              />
            </div>
          </div>
        ) : (
          <div className={styles.scheduleFixedTime}>
            <label>{t.fixedTimeLabel}</label>
            <input
              type="time"
              className={styles.scheduleTimeInput}
              value={state.publishTimeStart}
              min={isStartToday ? getMinTimeFromNow() : undefined}
              onChange={(e) => {
                const val = e.target.value;
                if (isStartToday && timeToMinutes(val) < timeToMinutes(getMinTimeFromNow())) return;
                dispatch({ type: 'SET_FIELD', field: 'publishTimeStart', value: val });
              }}
            />
          </div>
        )}

        {state.publishTimeMode === 'random' && (
          <p className={styles.formHint}>{t.randomHint}</p>
        )}
      </div>

      {/* Days vs posts warning popup */}
      {schedulePopup && createPortal(
        <div className={styles.modalOverlay} onClick={() => setSchedulePopup(null)}>
          <div className={styles.validationPopup} onClick={(e) => e.stopPropagation()}>
            <button className={styles.validationPopupClose} onClick={() => setSchedulePopup(null)}>
              <X size={18} />
            </button>
            <div className={styles.validationPopupIcon}>
              <AlertTriangle size={28} />
            </div>
            <p className={styles.validationPopupMessage}>{schedulePopup}</p>
            <button className={styles.validationPopupBtn} onClick={() => setSchedulePopup(null)}>
              {t.gotIt}
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
