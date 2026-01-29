'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSite } from '@/app/context/site-context';
import { useLocale } from '@/app/context/locale-context';
import { locales } from '@/i18n/config';
import styles from './SiteLocaleSync.module.css';

// Loading messages in different languages
const loadingMessages = {
  en: 'Switching to',
  he: 'עובר אל',
};

/**
 * This component syncs the user's language preference with the selected site.
 * When a user switches sites, it fetches their language preference for that site
 * and applies it to the locale context.
 */
export function SiteLocaleSync() {
  const { selectedSite } = useSite();
  const { setLocale, locale } = useLocale();
  const router = useRouter();
  const lastSiteIdRef = useRef(null);
  const currentLocaleRef = useRef(locale);
  const isInitialMount = useRef(true);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [targetSiteName, setTargetSiteName] = useState('');

  // Keep track of current locale without causing re-renders
  useEffect(() => {
    currentLocaleRef.current = locale;
  }, [locale]);

  // Fetch user's language preference for a site
  const fetchUserLanguagePreference = async (siteId) => {
    try {
      const response = await fetch(`/api/user-preferences?siteId=${siteId}`);
      if (response.ok) {
        const data = await response.json();
        return data.language;
      }
    } catch (error) {
      console.error('Failed to fetch user language preference:', error);
    }
    return null;
  };

  // Handle site change
  useEffect(() => {
    if (!selectedSite?.id) return;
    
    // Skip if same site (no change)
    if (lastSiteIdRef.current === selectedSite.id) {
      return;
    }

    // Check if this is initial mount (don't show loading on first load)
    const showLoading = !isInitialMount.current;
    isInitialMount.current = false;
    
    lastSiteIdRef.current = selectedSite.id;

    // Show loading immediately when switching sites
    if (showLoading) {
      setTargetSiteName(selectedSite.name);
      setLoadingMessage(loadingMessages[currentLocaleRef.current] || loadingMessages.en);
      setIsLoading(true);
    }

    const startTime = Date.now();
    const minLoadingTime = 2000; // Minimum 2 seconds

    // Fetch and apply user's language preference for this site
    fetchUserLanguagePreference(selectedSite.id).then((language) => {
      // Normalize to lowercase for comparison
      const normalizedLanguage = language?.toLowerCase();
      
      if (normalizedLanguage && locales.includes(normalizedLanguage)) {
        // Update loading message to target language
        if (showLoading) {
          setLoadingMessage(loadingMessages[normalizedLanguage] || loadingMessages.en);
        }
        
        // Only update locale if different from current
        if (normalizedLanguage !== currentLocaleRef.current) {
          setLocale(normalizedLanguage);
        }
      }
      
      // Calculate remaining time to meet minimum loading duration
      const elapsed = Date.now() - startTime;
      const remainingTime = Math.max(0, minLoadingTime - elapsed);
      
      // Delay to ensure cookie is set and meet minimum loading time
      setTimeout(() => {
        router.refresh();
        // Hide loading after refresh
        setTimeout(() => {
          setIsLoading(false);
        }, 100);
      }, remainingTime);
    });
  }, [selectedSite?.id, selectedSite?.name, setLocale, router]);

  return (
    <div className={`${styles.overlay} ${isLoading ? styles.visible : ''}`}>
      <div className={styles.spinner} />
      <p className={styles.text}>
        {loadingMessage} <span className={styles.siteName}>{targetSiteName}</span>
      </p>
    </div>
  );
}
