/**
 * AI Service for Interview System
 * 
 * This module provides a unified interface for AI chat completions.
 * Uses Vercel AI SDK with Google Gemini for all AI operations.
 */

import { generateText } from 'ai';
import { getTextModel, MODELS } from './gemini.js';

/**
 * Convert bot actions to Vercel AI SDK tools format
 */
function botActionsToTools(botActions) {
  const tools = {};
  
  for (const action of botActions) {
    tools[action.name] = {
      description: action.description || `Execute ${action.name} action`,
      parameters: action.parameters || { type: 'object', properties: {} },
    };
  }
  
  return tools;
}

/**
 * Send a message to the AI and get a response
 * 
 * @param {Object} options
 * @param {Array} options.messages - Conversation history
 * @param {string} options.systemPrompt - System prompt for the AI
 * @param {Array} options.botActions - Available bot actions for tool calling
 * @returns {Promise<{content: string, toolCall: Object|null}>}
 */
export async function chat({ messages, systemPrompt, botActions = [] }) {
  try {
    const model = getTextModel();
    const tools = botActions.length > 0 ? botActionsToTools(botActions) : undefined;
    
    const result = await generateText({
      model,
      system: systemPrompt,
      messages: messages.map(m => ({
        role: m.role,
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
      })),
      tools,
      maxTokens: 1024,
      temperature: 0.7,
    });

    // Check for tool calls
    if (result.toolCalls && result.toolCalls.length > 0) {
      const toolCall = result.toolCalls[0];
      return {
        content: result.text || '',
        toolCall: {
          name: toolCall.toolName,
          arguments: toolCall.args,
          id: toolCall.toolCallId,
        },
      };
    }

    return {
      content: result.text,
      toolCall: null,
    };
  } catch (error) {
    console.error('AI service error:', error);
    throw error;
  }
}

/**
 * Continue a conversation after a tool call with the result
 * 
 * @param {Object} options
 * @param {Array} options.messages - Conversation history
 * @param {string} options.systemPrompt - System prompt for the AI
 * @param {Object} options.toolCall - The tool call that was made
 * @param {Object} options.toolResult - The result of the tool call
 * @param {Array} options.botActions - Available bot actions for tool calling
 * @returns {Promise<{content: string, toolCall: Object|null}>}
 */
export async function continueWithToolResult({ messages, systemPrompt, toolCall, toolResult, botActions = [] }) {
  // Add tool call and result to messages using Vercel AI SDK format
  const updatedMessages = [
    ...messages,
    {
      role: 'assistant',
      content: [
        {
          type: 'tool-call',
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          args: toolCall.arguments,
        },
      ],
    },
    {
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          result: toolResult,
        },
      ],
    },
  ];

  return await chat({ messages: updatedMessages, systemPrompt, botActions });
}

/**
 * Build interview system prompt
 * 
 * @param {Object} question - Current interview question
 * @param {Object} context - Interview context (responses, externalData)
 * @param {string} userName - User's name
 * @returns {string}
 */
export function buildInterviewSystemPrompt(question, context, userName = 'User') {
  let prompt = `You are a friendly and professional AI assistant helping ${userName} complete an onboarding interview for their business website setup.

CURRENT QUESTION:
Translation Key: ${question.translationKey}
Question Type: ${question.questionType}
${question.aiPromptHint ? `Special Instructions: ${question.aiPromptHint}` : ''}

YOUR RESPONSIBILITIES:
1. Help the user understand and answer the current question
2. Use available tools/actions when appropriate to gather information
3. Be concise, friendly, and guide the conversation naturally
4. After gathering information via tools, present it to the user for confirmation
5. When the user provides a valid answer, suggest they submit it

RESPONSE GUIDELINES:
- Keep responses short (2-3 sentences when possible)
- Use the user's language (detect from their messages)
- Be encouraging and supportive
- If using a tool, explain what you're doing
- Format data nicely when presenting tool results

`;

  if (question.inputConfig) {
    prompt += `\nINPUT CONFIGURATION:\n${JSON.stringify(question.inputConfig, null, 2)}\n`;
  }

  if (question.validation) {
    prompt += `\nVALIDATION RULES:\n${JSON.stringify(question.validation, null, 2)}\n`;
  }

  if (context.responses && Object.keys(context.responses).length > 0) {
    prompt += `\nPREVIOUS ANSWERS:\n`;
    for (const [key, value] of Object.entries(context.responses)) {
      prompt += `- ${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}\n`;
    }
  }

  if (context.externalData && Object.keys(context.externalData).length > 0) {
    prompt += `\nGATHERED DATA:\n${JSON.stringify(context.externalData, null, 2)}\n`;
  }

  return prompt;
}
