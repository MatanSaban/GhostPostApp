'use client';

import { useState, useEffect } from 'react';
import { 
  Check, 
  Sparkles,
  Building2,
  Users,
  Target,
  Wrench,
  PenTool,
  Lightbulb,
  CheckCircle2,
  AlertCircle,
  Circle,
  ExternalLink,
  Loader2,
  Pencil,
  X,
  Save,
  RefreshCw,
  Plus,
  MessageSquare,
  SkipForward,
  Send
} from 'lucide-react';
import { InterviewWizard } from '@/app/components/ui/interview-wizard';
import { useSite } from '@/app/context/site-context';
import { useLocale } from '@/app/context/locale-context';
import styles from '../page.module.css';

const iconMap = {
  Building2,
  Users,
  Target,
  Wrench,
  PenTool,
};

const sectionIconMap = {
  business: Building2,
  audience: Users,
  seo: Target,
  content: PenTool,
  technical: Wrench,
};

// Helper to normalize URLs for comparison
const normalizeUrl = (url) => {
  if (!url) return '';
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '') + u.pathname.replace(/\/$/, '');
  } catch {
    return url.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
  }
};

// Helper to check if two articles match by URL
const articlesMatch = (a, b) => {
  if (a.url && b.url) {
    return normalizeUrl(a.url) === normalizeUrl(b.url);
  }
  return (a.id || a.url) === (b.id || b.url);
};

export function InterviewContent({ translations }) {
  const [showWizard, setShowWizard] = useState(false);
  const [profileData, setProfileData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [editingField, setEditingField] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isFetchingPosts, setIsFetchingPosts] = useState(false);
  const [selectedArticles, setSelectedArticles] = useState([]);
  const [newKeyword, setNewKeyword] = useState('');
  const [newCompetitor, setNewCompetitor] = useState('');
  const [savingInline, setSavingInline] = useState(null); // Tracks which field is being saved inline
  
  // Push Questions state
  const [pushQuestions, setPushQuestions] = useState([]);
  const [pushQuestionAnswers, setPushQuestionAnswers] = useState({}); // { questionId: answer }
  const [submittingQuestion, setSubmittingQuestion] = useState(null); // ID of question being submitted
  
  const { selectedSite } = useSite();
  const { locale } = useLocale();

  // Get available posts from profile data
  const availablePosts = profileData?.availablePosts || [];

  // Fetch interview profile when site changes
  useEffect(() => {
    async function fetchProfile() {
      if (!selectedSite?.id) {
        setIsLoading(false);
        setProfileData(null);
        return;
      }

      setIsLoading(true);
      try {
        const response = await fetch(`/api/sites/${selectedSite.id}/interview-profile`);
        if (response.ok) {
          const data = await response.json();
          setProfileData(data);
        } else {
          setProfileData(null);
        }
      } catch (error) {
        console.error('[InterviewContent] Error fetching profile:', error);
        setProfileData(null);
      } finally {
        setIsLoading(false);
      }
    }

    fetchProfile();
  }, [selectedSite?.id]);

  const refreshProfile = async () => {
    if (selectedSite?.id) {
      try {
        const res = await fetch(`/api/sites/${selectedSite.id}/interview-profile`);
        if (res.ok) {
          const data = await res.json();
          setProfileData(data);
        }
      } catch (err) {
        console.error('Failed to refresh profile:', err);
      }
    }
  };

  // Fetch push questions when site changes
  useEffect(() => {
    async function fetchPushQuestions() {
      if (!selectedSite?.id) {
        setPushQuestions([]);
        return;
      }

      try {
        // Get language from locale context - map to API format (uppercase)
        const langParam = locale?.toUpperCase() || 'EN';
        const response = await fetch(`/api/sites/${selectedSite.id}/push-questions?lang=${langParam}`);
        if (response.ok) {
          const data = await response.json();
          setPushQuestions(data.questions || []);
        } else {
          setPushQuestions([]);
        }
      } catch (error) {
        console.error('[InterviewContent] Error fetching push questions:', error);
        setPushQuestions([]);
      }
    }

    fetchPushQuestions();
  }, [selectedSite?.id, locale]);

  // Handle push question answer submission
  const handleSubmitPushQuestion = async (question, skipped = false) => {
    if (!selectedSite?.id || !question.id) return;
    
    const answer = pushQuestionAnswers[question.id] || '';
    
    // Validate required questions
    if (question.required && !skipped && !answer.trim()) {
      alert('יש למלא תשובה לשאלה זו');
      return;
    }
    
    setSubmittingQuestion(question.id);
    try {
      const response = await fetch(`/api/sites/${selectedSite.id}/push-questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionId: question.id,
          answer: answer.trim() || null,
          skipped,
        }),
      });

      if (response.ok) {
        // Remove the answered question from the list
        setPushQuestions(prev => prev.filter(q => q.id !== question.id));
        // Clear the answer from state
        setPushQuestionAnswers(prev => {
          const newAnswers = { ...prev };
          delete newAnswers[question.id];
          return newAnswers;
        });
      } else {
        const error = await response.json();
        console.error('Failed to submit answer:', error);
      }
    } catch (error) {
      console.error('Error submitting push question:', error);
    } finally {
      setSubmittingQuestion(null);
    }
  };

  // Get input element for push question based on type
  const renderPushQuestionInput = (question) => {
    const value = pushQuestionAnswers[question.id] || '';
    const onChange = (e) => setPushQuestionAnswers(prev => ({
      ...prev,
      [question.id]: e.target.value,
    }));
    const onMultiChange = (option) => {
      const currentValues = value ? value.split(',').map(v => v.trim()) : [];
      let newValues;
      if (currentValues.includes(option)) {
        newValues = currentValues.filter(v => v !== option);
      } else {
        newValues = [...currentValues, option];
      }
      setPushQuestionAnswers(prev => ({
        ...prev,
        [question.id]: newValues.join(', '),
      }));
    };

    switch (question.questionType) {
      case 'TEXT':
        return (
          <input
            type="text"
            className={styles.answerInput}
            style={{ minHeight: 'auto', padding: '0.75rem 1rem' }}
            value={value}
            onChange={onChange}
            placeholder="הקלד את התשובה שלך..."
          />
        );
      case 'TEXTAREA':
        return (
          <textarea
            className={styles.answerInput}
            value={value}
            onChange={onChange}
            placeholder="הקלד את התשובה שלך..."
            rows={4}
          />
        );
      case 'NUMBER':
        return (
          <input
            type="number"
            className={styles.answerInput}
            style={{ minHeight: 'auto', padding: '0.75rem 1rem' }}
            value={value}
            onChange={onChange}
            placeholder="הזן מספר..."
          />
        );
      case 'URL':
        return (
          <input
            type="url"
            className={styles.answerInput}
            style={{ minHeight: 'auto', padding: '0.75rem 1rem' }}
            value={value}
            onChange={onChange}
            placeholder="https://..."
          />
        );
      case 'CHOICE':
        const choiceOptions = question.options || [];
        return (
          <div className={styles.choiceOptions}>
            {choiceOptions.map((option, idx) => (
              <label key={idx} className={styles.choiceOption}>
                <input
                  type="radio"
                  name={`push-question-${question.id}`}
                  value={option}
                  checked={value === option}
                  onChange={onChange}
                />
                <span>{option}</span>
              </label>
            ))}
          </div>
        );
      case 'MULTI_CHOICE':
        const multiOptions = question.options || [];
        const selectedValues = value ? value.split(',').map(v => v.trim()) : [];
        return (
          <div className={styles.choiceOptions}>
            {multiOptions.map((option, idx) => (
              <label key={idx} className={styles.choiceOption}>
                <input
                  type="checkbox"
                  checked={selectedValues.includes(option)}
                  onChange={() => onMultiChange(option)}
                />
                <span>{option}</span>
              </label>
            ))}
          </div>
        );
      default:
        return (
          <textarea
            className={styles.answerInput}
            value={value}
            onChange={onChange}
            placeholder="הקלד את התשובה שלך..."
          />
        );
    }
  };

  const handleStartInterview = () => {
    setShowWizard(true);
  };

  const handleCloseWizard = () => {
    setShowWizard(false);
    refreshProfile();
  };

  const handleCompleteInterview = (data) => {
    console.log('Interview completed:', data);
    setShowWizard(false);
    refreshProfile();
  };

  // Edit handlers
  const handleStartEdit = (item) => {
    if (!item.editable || !item.fieldKey) return;
    setEditingField(item.fieldKey);
    // Use rawValue if available (for selects), otherwise use value
    // Handle null/undefined by defaulting to empty string
    if (item.type === 'tags' && Array.isArray(item.value)) {
      setEditValue(item.value.join(', '));
    } else if (item.type === 'competitors' && Array.isArray(item.value)) {
      // For competitors, join URLs with newlines for easier editing
      setEditValue(item.value.join('\n'));
    } else if (item.type === 'slider') {
      // For sliders, use numeric value or default to min
      const val = item.rawValue !== undefined ? item.rawValue : item.value;
      setEditValue(val ?? item.min ?? 0);
    } else if (item.type === 'articles') {
      // For articles, set selected articles from current value
      setSelectedArticles(item.value || []);
    } else {
      const val = item.rawValue !== undefined ? item.rawValue : item.value;
      setEditValue(val ?? '');
    }
  };

  const handleCancelEdit = () => {
    setEditingField(null);
    setEditValue('');
    setSelectedArticles([]);
  };

  // Inline add/remove handlers for keywords
  const handleAddKeyword = async (currentValues = []) => {
    const keyword = newKeyword.trim();
    if (!keyword || !selectedSite?.id) return;
    
    // Check if already exists (case-insensitive)
    if (currentValues.some(k => k.toLowerCase() === keyword.toLowerCase())) {
      setNewKeyword('');
      return;
    }
    
    setSavingInline('keywords');
    try {
      const newValues = [...currentValues, keyword];
      const response = await fetch(`/api/sites/${selectedSite.id}/interview-profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field: 'keywords', value: newValues }),
      });
      
      if (response.ok) {
        await refreshProfile();
        setNewKeyword('');
      }
    } catch (error) {
      console.error('Error adding keyword:', error);
    } finally {
      setSavingInline(null);
    }
  };

  const handleRemoveKeyword = async (keywordToRemove, currentValues = []) => {
    if (!selectedSite?.id) return;
    
    setSavingInline('keywords');
    try {
      const newValues = currentValues.filter(k => k !== keywordToRemove);
      const response = await fetch(`/api/sites/${selectedSite.id}/interview-profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field: 'keywords', value: newValues }),
      });
      
      if (response.ok) {
        await refreshProfile();
      }
    } catch (error) {
      console.error('Error removing keyword:', error);
    } finally {
      setSavingInline(null);
    }
  };

  // Inline add/remove handlers for competitors
  const handleAddCompetitor = async (currentValues = []) => {
    let url = newCompetitor.trim();
    if (!url || !selectedSite?.id) return;
    
    // Add https:// if missing
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }
    
    // Validate URL
    try {
      new URL(url);
    } catch {
      alert('כתובת לא תקינה');
      return;
    }
    
    // Check if already exists by domain
    const newDomain = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    const exists = currentValues.some(comp => {
      try {
        const existingDomain = new URL(comp).hostname.replace(/^www\./, '').toLowerCase();
        return existingDomain === newDomain;
      } catch {
        return false;
      }
    });
    
    if (exists) {
      setNewCompetitor('');
      return;
    }
    
    setSavingInline('competitors');
    try {
      const newValues = [...currentValues, url];
      const response = await fetch(`/api/sites/${selectedSite.id}/interview-profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field: 'competitors', value: newValues }),
      });
      
      if (response.ok) {
        await refreshProfile();
        setNewCompetitor('');
      }
    } catch (error) {
      console.error('Error adding competitor:', error);
    } finally {
      setSavingInline(null);
    }
  };

  const handleRemoveCompetitor = async (urlToRemove, currentValues = []) => {
    if (!selectedSite?.id) return;
    
    setSavingInline('competitors');
    try {
      const newValues = currentValues.filter(url => url !== urlToRemove);
      const response = await fetch(`/api/sites/${selectedSite.id}/interview-profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field: 'competitors', value: newValues }),
      });
      
      if (response.ok) {
        await refreshProfile();
      }
    } catch (error) {
      console.error('Error removing competitor:', error);
    } finally {
      setSavingInline(null);
    }
  };

  // Fetch posts from website
  const handleFetchPosts = async () => {
    if (!selectedSite?.id) return;
    
    setIsFetchingPosts(true);
    try {
      const response = await fetch(`/api/sites/${selectedSite.id}/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 20 }),
      });

      if (response.ok) {
        // Refresh profile to get updated available posts
        await refreshProfile();
      } else {
        const error = await response.json();
        console.error('Failed to fetch posts:', error.error);
        alert(error.error || 'שגיאה בשליפת המאמרים');
      }
    } catch (error) {
      console.error('Error fetching posts:', error);
      alert('שגיאה בשליפת המאמרים מהאתר');
    } finally {
      setIsFetchingPosts(false);
    }
  };

  // Toggle article selection
  const handleToggleArticle = (article, maxSelection) => {
    setSelectedArticles(prev => {
      const isSelected = prev.some(a => articlesMatch(a, article));
      if (isSelected) {
        return prev.filter(a => !articlesMatch(a, article));
      } else if (prev.length < maxSelection) {
        return [...prev, article];
      }
      return prev;
    });
  };

  const handleSaveEdit = async (item) => {
    if (!selectedSite?.id || !item.fieldKey) return;
    
    setIsSaving(true);
    try {
      let valueToSave = editValue;
      
      // Handle tags - convert comma-separated string to array
      if (item.type === 'tags') {
        valueToSave = editValue.split(',').map(s => s.trim()).filter(Boolean);
      }
      // Handle competitors - convert newline-separated URLs to array
      if (item.type === 'competitors') {
        valueToSave = editValue.split('\n').map(s => s.trim()).filter(Boolean);
      }
      // Handle slider - convert to number
      if (item.type === 'slider') {
        valueToSave = Number(editValue);
      }
      // Handle articles - use selectedArticles state
      if (item.type === 'articles') {
        valueToSave = selectedArticles;
      }

      const response = await fetch(`/api/sites/${selectedSite.id}/interview-profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field: item.fieldKey, value: valueToSave }),
      });

      if (response.ok) {
        await refreshProfile();
        setEditingField(null);
        setEditValue('');
        setSelectedArticles([]);
      } else {
        console.error('Failed to save:', await response.text());
      }
    } catch (error) {
      console.error('Error saving field:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'complete':
        return <CheckCircle2 size={24} className={styles.sectionIcon} />;
      case 'in-progress':
        return <AlertCircle size={24} className={`${styles.sectionIcon} ${styles.inProgress}`} />;
      default:
        return <Circle size={24} className={`${styles.sectionIcon} ${styles.pending}`} />;
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'complete':
        return translations.statusComplete || 'הושלם';
      case 'in-progress':
        return translations.statusInProgress || 'בתהליך';
      default:
        return translations.statusPending || 'ממתין';
    }
  };

  const progress = profileData?.progress || 0;
  const sections = profileData?.sections || [];
  const interviewStatus = profileData?.status || 'NOT_STARTED';
  const responses = profileData?.responses || {};

  // Check if a response field has a valid value
  const hasValue = (field) => {
    const val = responses[field];
    if (Array.isArray(val)) return val.length > 0;
    if (typeof val === 'object' && val !== null) return Object.keys(val).length > 0;
    return val !== null && val !== undefined && val !== '';
  };

  // Section fields - which response fields belong to each section
  // A section is complete when ALL its fields have values
  const sectionFields = {
    business: ['websiteUrl', 'contentLanguage', 'businessInfo'],
    seo: ['keywords', 'competitors'],
    audience: ['targetLocations'],
    content: ['writingStyle', 'favoriteArticles'],
    technical: ['websitePlatform'], // wordpressPlugin and googleIntegration are optional/conditional
  };

  // Check if a section is complete (all its required fields have values)
  const isSectionComplete = (sectionId) => {
    const fields = sectionFields[sectionId] || [];
    return fields.every(field => hasValue(field));
  };

  // Display order of sections
  const displayOrder = ['business', 'seo', 'audience', 'content', 'technical'];

  // Find the first incomplete section in display order
  const getFirstIncompleteIndex = () => {
    for (let i = 0; i < displayOrder.length; i++) {
      if (!isSectionComplete(displayOrder[i])) {
        return i;
      }
    }
    return displayOrder.length; // All complete
  };

  // Get sequential status - steps flow in order: completed → active → pending
  const getSequentialStatus = (sectionId) => {
    // If interview is completed, show all as completed
    if (interviewStatus === 'COMPLETED') {
      return 'completed';
    }

    const firstIncompleteIndex = getFirstIncompleteIndex();
    const sectionIndex = displayOrder.indexOf(sectionId);

    if (sectionIndex < firstIncompleteIndex) {
      return 'completed';
    } else if (sectionIndex === firstIncompleteIndex) {
      return 'active';
    } else {
      return 'pending';
    }
  };

  // Build progress steps - sequential order maintained
  const interviewSteps = [
    { id: 1, label: 'פרטי העסק', status: getSequentialStatus('business'), iconName: 'Building2' },
    { id: 2, label: 'מילות מפתח', status: getSequentialStatus('seo'), iconName: 'Target' },
    { id: 3, label: 'קהל יעד', status: getSequentialStatus('audience'), iconName: 'Users' },
    { id: 4, label: 'סגנון תוכן', status: getSequentialStatus('content'), iconName: 'PenTool' },
    { id: 5, label: 'פרטים טכניים', status: getSequentialStatus('technical'), iconName: 'Wrench' },
  ];

  // Render edit input based on field type
  const renderEditInput = (item) => {
    switch (item.type) {
      case 'select':
        return (
          <select
            className={styles.editSelect}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
          >
            {item.options?.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        );
      case 'slider':
        return (
          <div className={styles.editSliderContainer}>
            <input
              type="range"
              className={styles.editSlider}
              min={item.min || 0}
              max={item.max || 10}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
            />
            <span className={styles.sliderValue}>{editValue}</span>
          </div>
        );
      case 'tags':
        return (
          <input
            type="text"
            className={styles.editInput}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            placeholder="הפרד בפסיקים"
          />
        );
      case 'competitors':
        return (
          <textarea
            className={styles.editTextarea}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            rows={4}
            placeholder="הזן כתובת URL של מתחרה בכל שורה"
          />
        );
      case 'articles':
        // Show available posts as selectable cards
        const posts = item.options || availablePosts;
        const maxSelection = item.maxSelection || 3;
        
        if (posts.length === 0) {
          return (
            <div className={styles.articlesEditContainer}>
              <p className={styles.noPostsMessage}>
                לא נמצאו מאמרים. לחץ על הכפתור למטה לשליפת המאמרים מהאתר.
              </p>
              <button
                type="button"
                className={styles.fetchPostsButton}
                onClick={handleFetchPosts}
                disabled={isFetchingPosts}
              >
                {isFetchingPosts ? (
                  <>
                    <Loader2 size={16} className={styles.spinning} />
                    <span>שולף מאמרים...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw size={16} />
                    <span>שלוף מאמרים מהאתר</span>
                  </>
                )}
              </button>
            </div>
          );
        }
        
        return (
          <div className={styles.articlesEditContainer}>
            <p className={styles.articlesSelectionInfo}>
              בחר עד {maxSelection} מאמרים ({selectedArticles.length}/{maxSelection})
            </p>
            <div className={styles.articlesEditGrid}>
              {posts.map((post, i) => {
                const isSelected = selectedArticles.some(a => articlesMatch(a, post));
                return (
                  <div
                    key={post.id || post.url || i}
                    className={`${styles.articleEditCard} ${isSelected ? styles.selected : ''}`}
                    onClick={() => handleToggleArticle(post, maxSelection)}
                  >
                    <div className={styles.articleCheckbox}>
                      {isSelected && <Check size={14} />}
                    </div>
                    <div className={styles.articleEditContent}>
                      <span className={styles.articleEditTitle}>{post.title}</span>
                      {post.excerpt && (
                        <span className={styles.articleEditExcerpt}>
                          {post.excerpt.substring(0, 80)}...
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              className={styles.fetchPostsButtonSmall}
              onClick={handleFetchPosts}
              disabled={isFetchingPosts}
            >
              {isFetchingPosts ? (
                <Loader2 size={14} className={styles.spinning} />
              ) : (
                <RefreshCw size={14} />
              )}
              <span>רענן רשימה</span>
            </button>
          </div>
        );
      case 'text':
        return (
          <textarea
            className={styles.editTextarea}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            rows={3}
          />
        );
      case 'url':
        return (
          <input
            type="url"
            className={styles.editInput}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            placeholder="https://..."
          />
        );
      default:
        return (
          <input
            type="text"
            className={styles.editInput}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
          />
        );
    }
  };

  // Render a field value based on its type
  const renderFieldValue = (item) => {
    // Handle empty values
    if (!item.value || (Array.isArray(item.value) && item.value.length === 0)) {
      return <span className={styles.incomplete}>לא צוין</span>;
    }

    // Handle object values - convert to readable format
    if (typeof item.value === 'object' && !Array.isArray(item.value)) {
      // Try to extract meaningful string from object
      const obj = item.value;
      if (obj.name) return obj.name;
      if (obj.title) return obj.title;
      if (obj.businessName) return obj.businessName;
      if (obj.label) return obj.label;
      // If no known string field, show key-value pairs
      const entries = Object.entries(obj).filter(([_, v]) => v && typeof v !== 'object');
      if (entries.length > 0) {
        return (
          <div className={styles.objectValue}>
            {entries.map(([key, value]) => (
              <div key={key} className={styles.objectField}>
                <span className={styles.objectKey}>{key}:</span>
                <span className={styles.objectVal}>{String(value)}</span>
              </div>
            ))}
          </div>
        );
      }
      return <span className={styles.incomplete}>לא צוין</span>;
    }

    switch (item.type) {
      case 'url':
        return (
          <a href={item.value} target="_blank" rel="noopener noreferrer" className={styles.urlLink}>
            {item.value}
            <ExternalLink size={14} />
          </a>
        );
      case 'tags':
        // For keywords, show inline editing with X buttons and add input
        const keywords = Array.isArray(item.value) ? item.value : [];
        const isKeywordsField = item.fieldKey === 'keywords';
        return (
          <div className={styles.inlineEditContainer}>
            <div className={styles.tagsContainer}>
              {keywords.map((tag, i) => {
                const tagText = typeof tag === 'object' ? (tag.name || tag.label || JSON.stringify(tag)) : tag;
                return (
                  <span key={i} className={`${styles.tag} ${item.editable ? styles.removable : ''}`}>
                    {tagText}
                    {item.editable && isKeywordsField && (
                      <button
                        type="button"
                        className={styles.tagRemoveButton}
                        onClick={() => handleRemoveKeyword(tagText, keywords)}
                        disabled={savingInline === 'keywords'}
                        title="הסר"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </span>
                );
              })}
            </div>
            {item.editable && isKeywordsField && (
              <div className={styles.inlineAddRow}>
                <input
                  type="text"
                  className={styles.inlineAddInput}
                  value={newKeyword}
                  onChange={(e) => setNewKeyword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddKeyword(keywords);
                    }
                  }}
                  placeholder="הוסף מילת מפתח..."
                  disabled={savingInline === 'keywords'}
                />
                <button
                  type="button"
                  className={styles.inlineAddButton}
                  onClick={() => handleAddKeyword(keywords)}
                  disabled={savingInline === 'keywords' || !newKeyword.trim()}
                >
                  {savingInline === 'keywords' ? (
                    <Loader2 size={14} className={styles.spinning} />
                  ) : (
                    <Plus size={14} />
                  )}
                  <span>הוסף</span>
                </button>
              </div>
            )}
          </div>
        );
      case 'articles':
        if (Array.isArray(item.value)) {
          return (
            <div className={styles.articlesContainer}>
              {item.value.map((article, i) => (
                <a key={i} href={article.url || article} target="_blank" rel="noopener noreferrer" className={styles.articleLink}>
                  {article.title || article.url || (typeof article === 'string' ? article : '')}
                  <ExternalLink size={12} />
                </a>
              ))}
            </div>
          );
        }
        return String(item.value);
      case 'competitors':
        // Use displayValue if available (has full objects), otherwise fall back to value (URLs)
        const competitors = item.displayValue || item.value || [];
        const competitorUrls = item.value || []; // Always use value for URLs when adding/removing
        return (
          <div className={styles.inlineEditContainer}>
            {Array.isArray(competitors) && competitors.length > 0 && (
              <div className={styles.competitorsContainer}>
                {competitors.map((comp, i) => {
                  const url = typeof comp === 'string' ? comp : comp.url;
                  const name = typeof comp === 'string' ? comp : (comp.name || comp.domain || comp.url);
                  return (
                    <div key={i} className={`${styles.competitorTag} ${item.editable ? styles.removable : ''}`}>
                      <a href={url} target="_blank" rel="noopener noreferrer" className={styles.competitorTagLink}>
                        <span className={styles.competitorName}>{name}</span>
                        <ExternalLink size={12} />
                      </a>
                      {item.editable && (
                        <button
                          type="button"
                          className={styles.tagRemoveButton}
                          onClick={() => handleRemoveCompetitor(url, competitorUrls)}
                          disabled={savingInline === 'competitors'}
                          title="הסר"
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {item.editable && (
              <div className={styles.inlineAddRow}>
                <input
                  type="text"
                  className={styles.inlineAddInput}
                  value={newCompetitor}
                  onChange={(e) => setNewCompetitor(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddCompetitor(competitorUrls);
                    }
                  }}
                  placeholder="הוסף כתובת מתחרה..."
                  disabled={savingInline === 'competitors'}
                />
                <button
                  type="button"
                  className={styles.inlineAddButton}
                  onClick={() => handleAddCompetitor(competitorUrls)}
                  disabled={savingInline === 'competitors' || !newCompetitor.trim()}
                >
                  {savingInline === 'competitors' ? (
                    <Loader2 size={14} className={styles.spinning} />
                  ) : (
                    <Plus size={14} />
                  )}
                  <span>הוסף</span>
                </button>
              </div>
            )}
          </div>
        );
      case 'text':
        return <p className={styles.textValue}>{String(item.value)}</p>;
      default:
        return String(item.value);
    }
  };

  return (
    <>
      {showWizard && (
        <InterviewWizard 
          onClose={handleCloseWizard} 
          onComplete={handleCompleteInterview}
          site={selectedSite}
        />
      )}

      {/* Interview Progress - 5 Steps */}
      <div className={styles.progressOverview}>
        <div className={styles.progressGlow}></div>
        <div className={styles.progressContent}>
          <div className={styles.progressHeader}>
            <div>
              <h3 className={styles.progressTitle}>{translations.interviewProgress}</h3>
              <p className={styles.progressSubtitle}>{translations.helpGhost}</p>
            </div>
            <button className={styles.startButton} onClick={handleStartInterview}>
              <Sparkles className={styles.startButtonIcon} />
              <span>
                {interviewStatus === 'COMPLETED' 
                  ? 'ערוך פרופיל' 
                  : interviewStatus === 'IN_PROGRESS' 
                    ? 'המשך ראיון' 
                    : translations.startInterview}
              </span>
            </button>
          </div>
          
          {/* Progress Bar */}
          <div className={styles.progressBarSection}>
            <div className={styles.progressBarHeader}>
              <span className={styles.progressLabel}>{translations.completion}</span>
              <span className={styles.progressValue}>{progress}%</span>
            </div>
            <div className={styles.progressBar}>
              <div 
                className={styles.progressBarFill} 
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* 5 Progress Steps */}
          <div className={styles.progressSteps}>
            {interviewSteps.map((step) => {
              const Icon = step.status === 'completed' ? Check : iconMap[step.iconName];
              return (
                <div 
                  key={step.id} 
                  className={`${styles.progressStep} ${styles[step.status]}`}
                >
                  <div className={`${styles.stepIcon} ${styles[step.status]}`}>
                    <Icon size={14} />
                  </div>
                  <div className={styles.stepContent}>
                    <div className={styles.stepLabel}>{step.label}</div>
                    <div className={styles.stepStatus}>{getStatusLabel(step.status === 'completed' ? 'complete' : step.status === 'active' ? 'in-progress' : 'pending')}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className={styles.loadingContainer}>
          <Loader2 className={styles.loadingIcon} size={32} />
          <p>טוען נתוני פרופיל...</p>
        </div>
      )}

      {/* No Site Selected */}
      {!isLoading && !selectedSite && (
        <div className={styles.emptyState}>
          <p>בחר אתר כדי לראות את הפרופיל שלו</p>
        </div>
      )}

      {/* No Interview Data */}
      {!isLoading && selectedSite && sections.length === 0 && pushQuestions.length === 0 && (
        <div className={styles.emptyState}>
          <Lightbulb size={48} className={styles.emptyIcon} />
          <h3>טרם מילאת את הראיון</h3>
          <p>התחל את הראיון כדי שנלמד על העסק שלך ונוכל ליצור תוכן מותאם</p>
          <button className={styles.startButton} onClick={handleStartInterview}>
            <Sparkles className={styles.startButtonIcon} />
            <span>{translations.startInterview}</span>
          </button>
        </div>
      )}

      {/* Push Questions Section - First! */}
      {!isLoading && selectedSite && pushQuestions.length > 0 && (
        <div className={styles.pushQuestionsSection}>
          <div className={styles.pushQuestionsHeader}>
            <div className={styles.pushQuestionsTitle}>
              <MessageSquare size={20} />
              <h3>שאלות נוספות</h3>
            </div>
            <span className={styles.pushQuestionsCount}>
              {pushQuestions.length} שאלות ממתינות
            </span>
          </div>
          
          <div className={styles.pushQuestionsList}>
            {pushQuestions.map((question, index) => (
              <div key={question.id} className={styles.questionCard}>
                <div className={styles.questionGlow}></div>
                <div className={styles.questionContent}>
                  <div className={styles.questionHeader}>
                    <span className={styles.questionNumber}>{index + 1}</span>
                    {question.category && (
                      <span className={styles.questionCategory}>{question.category}</span>
                    )}
                    {question.required && (
                      <span className={styles.requiredBadge}>חובה</span>
                    )}
                  </div>
                  
                  <p className={styles.questionText}>{question.question}</p>
                  
                  {question.description && (
                    <p className={styles.questionDescription}>{question.description}</p>
                  )}
                  
                  {renderPushQuestionInput(question)}
                  
                  <div className={styles.questionActions}>
                    {!question.required && (
                      <button
                        type="button"
                        className={styles.skipButton}
                        onClick={() => handleSubmitPushQuestion(question, true)}
                        disabled={submittingQuestion === question.id}
                      >
                        <SkipForward size={16} />
                        <span>דלג</span>
                      </button>
                    )}
                    <button
                      type="button"
                      className={styles.nextButton}
                      onClick={() => handleSubmitPushQuestion(question, false)}
                      disabled={submittingQuestion === question.id}
                    >
                      {submittingQuestion === question.id ? (
                        <Loader2 size={16} className={styles.spinning} />
                      ) : (
                        <Send size={16} />
                      )}
                      <span>שלח</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Interview Sections */}
      {!isLoading && sections.map((section) => {
        const SectionIcon = sectionIconMap[section.id] || Building2;
        return (
          <div key={section.id} className={styles.sectionCard}>
            <div className={styles.sectionGlow}></div>
            <div className={styles.sectionContent}>
              {/* Section Header */}
              <div className={styles.sectionHeader}>
                <div className={styles.sectionTitleGroup}>
                  {getStatusIcon(section.status)}
                  <h3 className={styles.sectionTitle}>{section.title}</h3>
                </div>
                <span className={`${styles.sectionStatus} ${styles[section.status === 'in-progress' ? 'inProgress' : section.status]}`}>
                  {getStatusLabel(section.status)}
                </span>
              </div>

              {/* Fields */}
              <div className={styles.questionsList}>
                {section.items.map((item, index) => {
                  // Only consider editing if fieldKey exists and matches
                  const isEditing = item.fieldKey && editingField === item.fieldKey;
                  // Keywords and competitors use inline editing - no edit button needed
                  const usesInlineEdit = (item.type === 'tags' && item.fieldKey === 'keywords') || item.type === 'competitors';
                  const showEditButton = item.editable && item.fieldKey && !isEditing && !usesInlineEdit;
                  
                  return (
                    <div key={index} className={`${styles.questionItem} ${isEditing ? styles.editing : ''}`}>
                      <div className={styles.questionLabel}>
                        {item.label}
                        {showEditButton && (
                          <button 
                            className={styles.editButton}
                            onClick={() => handleStartEdit(item)}
                            title="ערוך"
                          >
                            <Pencil size={14} />
                          </button>
                        )}
                      </div>
                      <div className={`${styles.questionAnswer} ${!item.value ? styles.incomplete : ''}`}>
                        {isEditing ? (
                          <div className={styles.editContainer}>
                            {renderEditInput(item)}
                            <div className={styles.editActions}>
                              <button 
                                className={styles.saveButton}
                                onClick={() => handleSaveEdit(item)}
                                disabled={isSaving}
                              >
                                {isSaving ? <Loader2 size={14} className={styles.spinning} /> : <Save size={14} />}
                                <span>שמור</span>
                              </button>
                              <button 
                                className={styles.cancelButton}
                                onClick={handleCancelEdit}
                                disabled={isSaving}
                              >
                                <X size={14} />
                                <span>ביטול</span>
                              </button>
                            </div>
                          </div>
                        ) : (
                          renderFieldValue(item)
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}
