'use client';

import { useState } from 'react';
import { FileText, Link2, Image, RefreshCw } from 'lucide-react';
import styles from '../page.module.css';

const iconMap = {
  FileText,
  Link2,
  Image,
  RefreshCw,
};

export function AutomationsList({ automations, translations }) {
  const [activeStates, setActiveStates] = useState(
    automations.reduce((acc, a) => ({ ...acc, [a.id]: a.active }), {})
  );

  const toggleAutomation = (id) => {
    setActiveStates(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className={styles.automationsCard}>
      <div className={styles.cardHeader}>
        <h3 className={styles.cardTitle}>{translations.yourAutomations}</h3>
      </div>
      <div className={styles.automationsList}>
        {automations.map((automation) => {
          const Icon = iconMap[automation.iconName];
          const isActive = activeStates[automation.id];
          return (
            <div key={automation.id} className={styles.automationItem}>
              <div className={`${styles.automationIcon} ${styles[automation.color]}`}>
                <Icon size={18} />
              </div>
              <div className={styles.automationInfo}>
                <span className={styles.automationName}>{automation.name}</span>
                <span className={styles.automationDescription}>{automation.description}</span>
              </div>
              <div className={styles.automationStats}>
                <span className={styles.statItem}>
                  <span className={styles.statValue}>{automation.tasksCompleted}</span> {translations.tasks}
                </span>
                <span className={styles.statItem}>
                  {translations.last} {automation.lastRun}
                </span>
              </div>
              <div 
                className={`${styles.toggleSwitch} ${isActive ? styles.active : ''}`}
                onClick={() => toggleAutomation(automation.id)}
              >
                <span className={styles.toggleKnob} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
