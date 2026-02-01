'use client';

import { useState } from 'react';
import { 
  Check, 
  Sparkles,
  Building2,
  Users,
  Target,
  Megaphone,
  PenTool,
  Lightbulb,
  CheckCircle2,
  AlertCircle,
  Circle
} from 'lucide-react';
import { InterviewWizard } from '@/app/components/ui/interview-wizard';
import { ArrowIcon } from '@/app/components/ui/arrow-icon';
import styles from '../page.module.css';

const iconMap = {
  Building2,
  Users,
  Target,
  Megaphone,
  PenTool,
};

export function InterviewContent({ translations, interviewSteps, sections, aiInsights }) {
  const [currentAnswer, setCurrentAnswer] = useState('');
  const [showWizard, setShowWizard] = useState(false);
  const progress = 60;

  const handleStartInterview = () => {
    setShowWizard(true);
  };

  const handleCloseWizard = () => {
    setShowWizard(false);
  };

  const handleCompleteInterview = (data) => {
    console.log('Interview completed:', data);
    setShowWizard(false);
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

  return (
    <>
      {showWizard && (
        <InterviewWizard 
          onClose={handleCloseWizard} 
          onComplete={handleCompleteInterview} 
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
              <span>{translations.startInterview}</span>
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
                    <div className={styles.stepStatus}>{step.statusLabel}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Grid - Question Card + AI Insights */}
      <div className={styles.mainGrid}>
        {/* Left Column - Current Question + Previous Answers */}
        <div className={styles.leftColumn}>
          {/* Goals & Objectives Question Card */}
          <div className={styles.questionCard}>
            <div className={styles.questionGlow}></div>
            <div className={styles.questionContent}>
              <div className={styles.questionHeader}>
                <span className={styles.questionNumber}>3</span>
                <span className={styles.questionCategory}>{translations.goalsObjectives}</span>
              </div>
              <h2 className={styles.questionText}>
                {translations.businessGoalsQuestion}
              </h2>
              <textarea
                className={styles.answerInput}
                placeholder={translations.goalsPlaceholder}
                value={currentAnswer}
                onChange={(e) => setCurrentAnswer(e.target.value)}
              />
              <div className={styles.questionActions}>
                <button className={styles.skipButton}>{translations.skipForNow}</button>
                <button className={styles.nextButton}>
                  <span>{translations.nextQuestion}</span>
                  <ArrowIcon size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column - AI Insights */}
        <div className={styles.rightColumn}>
          <div className={styles.insightsCard}>
            <div className={styles.insightsHeader}>
              <div className={styles.insightsIcon}>
                <Lightbulb size={20} />
              </div>
              <h3 className={styles.insightsTitle}>{translations.aiInsights}</h3>
            </div>
            <div className={styles.insightsList}>
              {aiInsights.map((insight, index) => (
                <div key={index} className={styles.insightItem}>
                  <div className={styles.insightDot} />
                  <p className={styles.insightText}>{insight}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Interview Sections */}
      {sections.map((section, index) => (
        <div key={index} className={styles.sectionCard}>
          <div className={styles.sectionGlow}></div>
          <div className={styles.sectionContent}>
            {/* Section Header */}
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitleGroup}>
                {getStatusIcon(section.status)}
                <h3 className={styles.sectionTitle}>{section.title}</h3>
              </div>
              <span className={`${styles.sectionStatus} ${styles[section.status === 'in-progress' ? 'inProgress' : section.status]}`}>
                {section.statusLabel}
              </span>
            </div>

            {/* Questions */}
            <div className={styles.questionsList}>
              {section.questions.map((item, qIndex) => (
                <div key={qIndex} className={styles.questionItem}>
                  <div className={styles.questionLabel}>{item.q}</div>
                  <div className={`${styles.questionAnswer} ${item.incomplete ? styles.incomplete : ''}`}>
                    {item.a}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </>
  );
}
