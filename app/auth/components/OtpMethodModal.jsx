'use client';

import { Smartphone, Mail, X } from 'lucide-react';
import styles from '../auth.module.css';

export function OtpMethodModal({ translations, onSelect, onClose }) {
  return (
    <div className={styles.modalOverlay}>
      <div className={styles.otpMethodModal}>
        <button className={styles.modalCloseBtn} onClick={onClose}>
          <X size={20} />
        </button>
        
        <h3 className={styles.otpMethodTitle}>{translations.chooseMethod}</h3>
        
        <div className={styles.otpMethodOptions}>
          <button 
            className={styles.otpMethodOption}
            onClick={() => onSelect('sms')}
          >
            <div className={styles.otpMethodIcon}>
              <Smartphone size={24} />
            </div>
            <span className={styles.otpMethodLabel}>{translations.viaSms}</span>
          </button>
          
          <button 
            className={styles.otpMethodOption}
            onClick={() => onSelect('email')}
          >
            <div className={styles.otpMethodIcon}>
              <Mail size={24} />
            </div>
            <span className={styles.otpMethodLabel}>{translations.viaEmail}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
