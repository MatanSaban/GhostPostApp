import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { 
  getNextQuestion, 
  shouldShowQuestion, 
  validateResponse, 
  executeAutoActions,
  getInterviewProgress,
  completeInterview 
} from '@/lib/interview/flow-engine';

const SESSION_COOKIE = 'user_session';

// Get authenticated user with account info
async function getAuthenticatedUser() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;

    if (!userId) {
      return null;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { 
        id: true, 
        email: true, 
        firstName: true, 
        lastName: true,
        lastSelectedAccountId: true,
        accountMemberships: {
          select: {
            accountId: true,
            role: { select: { key: true } },
          },
          take: 1, // Get primary account
        },
      },
    });

    return user;
  } catch (error) {
    console.error('Auth error:', error);
    return null;
  }
}

// GET - Get the user's current interview or start a new one
export async function GET(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if a siteId was provided (for site-specific interviews)
    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('siteId');
    
    // If siteId provided, get the site info
    let site = null;
    if (siteId) {
      site = await prisma.site.findUnique({
        where: { id: siteId },
        select: { id: true, url: true, name: true, platform: true }
      });
    }

    // Find existing interview for this user (and optionally for this site)
    let interview = await prisma.userInterview.findFirst({
      where: { 
        userId: user.id,
        status: { in: ['NOT_STARTED', 'IN_PROGRESS'] },
        ...(siteId ? { siteId } : {}),
      },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          take: 50, // Limit to last 50 messages
        },
      },
    });

    // If no interview exists, create one
    if (!interview) {
      interview = await prisma.userInterview.create({
        data: {
          userId: user.id,
          status: 'NOT_STARTED',
          responses: site ? { websiteUrl: site.url } : {},
          externalData: {},
          aiContext: {},
          ...(siteId ? { siteId } : {}),
        },
        include: {
          messages: true,
        },
      });
    }

    // Get all active questions
    const questions = await prisma.interviewQuestion.findMany({
      where: { isActive: true },
      orderBy: { order: 'asc' },
    });

    // Determine current question based on responses
    const currentQuestionIndex = interview.currentStep || 0;
    const currentQuestion = questions[currentQuestionIndex] || null;

    return NextResponse.json({
      interview: {
        id: interview.id,
        status: interview.status,
        currentQuestionIndex,
        responses: interview.responses,
        externalData: interview.externalData,
      },
      questions: questions.map(q => ({
        id: q.id,
        translationKey: q.translationKey,
        questionType: q.questionType,
        inputConfig: q.inputConfig,
        validation: q.validation,
        dependsOn: q.dependsOn,
        showCondition: q.showCondition,
      })),
      currentQuestion: currentQuestion ? {
        id: currentQuestion.id,
        translationKey: currentQuestion.translationKey,
        questionType: currentQuestion.questionType,
        inputConfig: currentQuestion.inputConfig,
        validation: currentQuestion.validation,
        allowedActions: currentQuestion.allowedActions,
        autoActions: currentQuestion.autoActions,
      } : null,
      messages: interview.messages.map(m => ({
        id: m.id,
        role: m.role,
        content: m.content,
        uiComponent: m.uiComponent,
        createdAt: m.createdAt,
      })),
    });
  } catch (error) {
    console.error('Error fetching interview:', error);
    return NextResponse.json(
      { error: 'Failed to fetch interview' },
      { status: 500 }
    );
  }
}

// POST - Submit a response to the current question
export async function POST(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { questionId, response, skipValidation } = await request.json();

    if (!questionId) {
      return NextResponse.json(
        { error: 'Question ID is required' },
        { status: 400 }
      );
    }

    // Find the user's active interview
    const interview = await prisma.userInterview.findFirst({
      where: { 
        userId: user.id,
        status: { in: ['NOT_STARTED', 'IN_PROGRESS'] },
      },
    });

    if (!interview) {
      return NextResponse.json(
        { error: 'No active interview found' },
        { status: 404 }
      );
    }

    // Get the question
    const question = await prisma.interviewQuestion.findUnique({
      where: { id: questionId },
    });

    if (!question) {
      return NextResponse.json(
        { error: 'Question not found' },
        { status: 404 }
      );
    }

    // Validate response using flow engine
    if (!skipValidation) {
      const validationResult = await validateResponse(question, response);
      if (!validationResult.isValid) {
        return NextResponse.json(
          { 
            error: validationResult.error, 
            validationError: true,
            suggestion: validationResult.suggestion,
            canAutoCorrect: validationResult.canAutoCorrect,
          },
          { status: 400 }
        );
      }
    }

    // Update responses
    const updatedResponses = {
      ...(interview.responses || {}),
      [questionId]: response,
    };

    // If there's a saveToField, also save to that field name
    if (question.saveToField) {
      updatedResponses[question.saveToField] = response;
    }

    // Check if the website URL changed - if so, reset all subsequent data
    let resetExternalData = false;
    let clearCompetitorSuggestions = false;
    
    if (question.saveToField === 'websiteUrl') {
      const previousUrl = interview.responses?.websiteUrl;
      if (previousUrl && previousUrl !== response) {
        console.log(`[Interview] Website URL changed from ${previousUrl} to ${response} - resetting interview data`);
        resetExternalData = true;
        
        // Clear all responses except websiteUrl
        Object.keys(updatedResponses).forEach(key => {
          if (key !== questionId && key !== 'websiteUrl') {
            delete updatedResponses[key];
          }
        });
      }
    }
    
    // If keywords changed, clear competitor suggestions so they get regenerated
    if (question.saveToField === 'keywords') {
      const previousKeywords = interview.responses?.keywords || [];
      const newKeywords = Array.isArray(response) ? response : [];
      const keywordsChanged = JSON.stringify(previousKeywords.sort()) !== JSON.stringify(newKeywords.sort());
      if (keywordsChanged) {
        console.log(`[Interview] Keywords changed - clearing competitor suggestions`);
        clearCompetitorSuggestions = true;
      }
    }

    // Add user message
    await prisma.interviewMessage.create({
      data: {
        interviewId: interview.id,
        role: 'USER',
        content: typeof response === 'string' ? response : JSON.stringify(response),
      },
    });

    // Build the update data
    let updateData = {
      status: 'IN_PROGRESS',
      responses: updatedResponses,
      currentStep: resetExternalData ? 0 : undefined, // Reset to first question
    };
    
    // Reset external data if URL changed
    if (resetExternalData) {
      updateData.externalData = {};
    }
    // Clear competitor suggestions if keywords changed
    else if (clearCompetitorSuggestions) {
      const currentExternalData = interview.externalData || {};
      delete currentExternalData.competitorSuggestions;
      delete currentExternalData.competitorSearchedAt;
      updateData.externalData = currentExternalData;
    }

    // Update interview with responses
    await prisma.userInterview.update({
      where: { id: interview.id },
      data: updateData,
    });

    // Execute auto-actions for this question if any
    if (question.autoActions && question.autoActions.length > 0) {
      try {
        // Get accountId from user's membership or selected account
        const accountId = user.lastSelectedAccountId || 
                          user.accountMemberships?.[0]?.accountId || 
                          null;
        
        await executeAutoActions(question, {
          interview,
          responses: updatedResponses,
          user,
          userId: user.id,
          accountId, // For credits tracking
          siteId: interview.siteId || null,
          prisma, // Pass prisma client for database operations
        });
      } catch (actionError) {
        console.error('Auto-action error:', actionError);
        // Continue even if auto-actions fail
      }
    }

    // Get next question using flow engine
    const nextQuestionResult = await getNextQuestion(interview.id);
    
    // Find the index of the next question (0-based)
    const allQuestions = await prisma.interviewQuestion.findMany({
      where: { isActive: true },
      orderBy: { order: 'asc' },
    });
    const nextQuestionIndex = nextQuestionResult 
      ? allQuestions.findIndex(q => q.id === nextQuestionResult.id)
      : interview.currentStep;
    
    // Update interview with new question index or complete status
    const updatedInterview = await prisma.userInterview.update({
      where: { id: interview.id },
      data: {
        status: nextQuestionResult ? 'IN_PROGRESS' : 'COMPLETED',
        currentStep: nextQuestionIndex >= 0 ? nextQuestionIndex : interview.currentStep,
        completedAt: nextQuestionResult ? undefined : new Date(),
      },
    });

    // If interview is complete, run completion logic
    if (!nextQuestionResult) {
      // Get accountId from user's membership or selected account
      const accountIdForCompletion = user.lastSelectedAccountId || 
                        user.accountMemberships?.[0]?.accountId || 
                        null;
      
      await completeInterview(interview.id, {
        responses: updatedResponses,
        user,
        userId: user.id,
        accountId: accountIdForCompletion, // For credits tracking
        siteId: interview.siteId || null,
        prisma, // Pass prisma client for database operations
        interview, // Pass interview object
      });
    }

    // Get progress
    const progress = await getInterviewProgress(interview.id);

    return NextResponse.json({
      success: true,
      interview: {
        id: updatedInterview.id,
        status: updatedInterview.status,
        currentQuestionIndex: updatedInterview.currentStep,
        responses: updatedInterview.responses,
        progress,
      },
      nextQuestion: nextQuestionResult ? {
        id: nextQuestionResult.id,
        translationKey: nextQuestionResult.translationKey,
        questionType: nextQuestionResult.questionType,
        inputConfig: nextQuestionResult.inputConfig,
        validation: nextQuestionResult.validation,
        allowedActions: nextQuestionResult.allowedActions,
        autoActions: nextQuestionResult.autoActions,
      } : null,
      isComplete: !nextQuestionResult,
    });
  } catch (error) {
    console.error('Error submitting response:', error);
    return NextResponse.json(
      { error: 'Failed to submit response' },
      { status: 500 }
    );
  }
}

// DELETE - Abandon the current interview
export async function DELETE(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Find the user's active interview
    const interview = await prisma.userInterview.findFirst({
      where: { 
        userId: user.id,
        status: { in: ['NOT_STARTED', 'IN_PROGRESS'] },
      },
    });

    if (!interview) {
      return NextResponse.json(
        { error: 'No active interview found' },
        { status: 404 }
      );
    }

    // Update status to abandoned
    await prisma.userInterview.update({
      where: { id: interview.id },
      data: { status: 'ABANDONED' },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error abandoning interview:', error);
    return NextResponse.json(
      { error: 'Failed to abandon interview' },
      { status: 500 }
    );
  }
}

// PUT - Revert interview to a specific question (for edit/retry functionality)
export async function PUT(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { questionIndex, questionId } = await request.json();

    if (questionIndex === undefined && !questionId) {
      return NextResponse.json(
        { error: 'Either questionIndex or questionId is required' },
        { status: 400 }
      );
    }

    // Find the user's active interview
    const interview = await prisma.userInterview.findFirst({
      where: { 
        userId: user.id,
        status: { in: ['NOT_STARTED', 'IN_PROGRESS'] },
      },
    });

    if (!interview) {
      return NextResponse.json(
        { error: 'No active interview found' },
        { status: 404 }
      );
    }

    // Get all questions to validate and find the correct index
    const questions = await prisma.interviewQuestion.findMany({
      where: { isActive: true },
      orderBy: { order: 'asc' },
    });

    // Determine the target question index
    let targetIndex = questionIndex;
    if (questionId) {
      targetIndex = questions.findIndex(q => q.id === questionId);
      if (targetIndex === -1) {
        return NextResponse.json(
          { error: 'Question not found' },
          { status: 404 }
        );
      }
    }

    if (targetIndex < 0 || targetIndex >= questions.length) {
      return NextResponse.json(
        { error: 'Invalid question index' },
        { status: 400 }
      );
    }

    // Get the list of questions that will be cleared
    const questionsToKeep = questions.slice(0, targetIndex);
    const questionsToClear = questions.slice(targetIndex);
    
    // Build new responses - keep only responses for questions before the target
    const newResponses = {};
    const currentResponses = interview.responses || {};
    
    for (const q of questionsToKeep) {
      // Keep response by question ID
      if (currentResponses[q.id] !== undefined) {
        newResponses[q.id] = currentResponses[q.id];
      }
      // Keep response by saveToField
      if (q.saveToField && currentResponses[q.saveToField] !== undefined) {
        newResponses[q.saveToField] = currentResponses[q.saveToField];
      }
    }

    // Determine which externalData fields to clear based on questions being reverted
    const externalData = { ...interview.externalData } || {};
    const fieldsToCheck = questionsToClear.map(q => q.saveToField).filter(Boolean);
    
    // Clear specific external data based on which questions are being reverted
    for (const field of fieldsToCheck) {
      // Clear related external data
      if (field === 'keywords') {
        delete externalData.keywordSuggestions;
        delete externalData.competitorSuggestions;
        delete externalData.competitorSearchedAt;
      }
      if (field === 'competitors') {
        delete externalData.competitorSuggestions;
        delete externalData.competitorSearchedAt;
      }
      if (field === 'websiteUrl') {
        // If reverting to URL, clear everything
        Object.keys(externalData).forEach(key => {
          if (key !== 'crawledData') delete externalData[key];
        });
      }
    }

    // Update the interview
    const updatedInterview = await prisma.userInterview.update({
      where: { id: interview.id },
      data: {
        currentStep: targetIndex,
        responses: newResponses,
        externalData: externalData,
        status: 'IN_PROGRESS',
      },
    });

    console.log(`[Interview] Reverted interview ${interview.id} to question ${targetIndex} for user ${user.id}`);

    return NextResponse.json({ 
      success: true, 
      interview: {
        id: updatedInterview.id,
        currentQuestionIndex: targetIndex,
        responses: newResponses,
        externalData: externalData,
      },
      message: `Reverted to question ${targetIndex + 1}` 
    });
  } catch (error) {
    console.error('Error reverting interview:', error);
    return NextResponse.json(
      { error: 'Failed to revert interview' },
      { status: 500 }
    );
  }
}

// PATCH - Reset the current interview (clear all data and start fresh)
export async function PATCH(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Find the user's active interview
    const interview = await prisma.userInterview.findFirst({
      where: { 
        userId: user.id,
        status: { in: ['NOT_STARTED', 'IN_PROGRESS'] },
      },
    });

    if (!interview) {
      // Create a new one if none exists
      const newInterview = await prisma.userInterview.create({
        data: {
          userId: user.id,
          status: 'NOT_STARTED',
          responses: {},
          externalData: {},
          aiContext: {},
          currentStep: 0,
        },
      });

      return NextResponse.json({ 
        success: true, 
        interview: { id: newInterview.id },
        message: 'New interview created' 
      });
    }

    // Delete existing messages
    await prisma.interviewMessage.deleteMany({
      where: { interviewId: interview.id },
    });

    // Reset the interview
    const resetInterview = await prisma.userInterview.update({
      where: { id: interview.id },
      data: {
        status: 'NOT_STARTED',
        responses: {},
        externalData: {},
        aiContext: {},
        currentStep: 0,
        completedAt: null,
      },
    });

    console.log(`[Interview] Interview ${interview.id} reset for user ${user.id}`);

    return NextResponse.json({ 
      success: true, 
      interview: { id: resetInterview.id },
      message: 'Interview reset successfully' 
    });
  } catch (error) {
    console.error('Error resetting interview:', error);
    return NextResponse.json(
      { error: 'Failed to reset interview' },
      { status: 500 }
    );
  }
}
