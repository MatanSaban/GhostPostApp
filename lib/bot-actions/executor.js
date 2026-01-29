/**
 * Bot Action Executor
 * 
 * Validates parameters against the action schema and executes the handler.
 */

import prisma from '@/lib/prisma';
import { getHandler } from './index';

/**
 * Validate parameters against a JSON schema
 * This is a simple validator - for production, consider using ajv
 */
function validateParameters(params, schema) {
  const errors = [];
  
  if (schema.type !== 'object') {
    return { valid: true, errors: [] };
  }
  
  // Check required fields
  if (schema.required) {
    for (const field of schema.required) {
      if (params[field] === undefined || params[field] === null) {
        errors.push(`Missing required field: ${field}`);
      }
    }
  }
  
  // Check property types
  if (schema.properties) {
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      const value = params[key];
      if (value !== undefined && value !== null) {
        if (propSchema.type === 'string' && typeof value !== 'string') {
          errors.push(`Field ${key} must be a string`);
        } else if (propSchema.type === 'number' && typeof value !== 'number') {
          errors.push(`Field ${key} must be a number`);
        } else if (propSchema.type === 'boolean' && typeof value !== 'boolean') {
          errors.push(`Field ${key} must be a boolean`);
        } else if (propSchema.type === 'array' && !Array.isArray(value)) {
          errors.push(`Field ${key} must be an array`);
        } else if (propSchema.type === 'object' && (typeof value !== 'object' || Array.isArray(value))) {
          errors.push(`Field ${key} must be an object`);
        }
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Execute a bot action
 * 
 * @param {string} actionName - The name of the action (e.g., "CRAWL_WEBSITE")
 * @param {object} parameters - The parameters to pass to the handler
 * @param {object} context - Execution context { interviewId, userId }
 * @returns {Promise<object>} - The handler result
 */
export async function executeAction(actionName, parameters, context) {
  // Fetch the action definition from the database
  const action = await prisma.botAction.findUnique({
    where: { name: actionName }
  });
  
  if (!action) {
    return {
      success: false,
      error: `Unknown action: ${actionName}`
    };
  }
  
  if (!action.isActive) {
    return {
      success: false,
      error: `Action is disabled: ${actionName}`
    };
  }
  
  // Get the handler function
  const handler = getHandler(action.handler);
  
  if (!handler) {
    console.error(`Handler not found for action: ${actionName} (handler: ${action.handler})`);
    return {
      success: false,
      error: `Handler not implemented: ${action.handler}`
    };
  }
  
  // Validate parameters against schema
  const validation = validateParameters(parameters || {}, action.parameters);
  
  if (!validation.valid) {
    return {
      success: false,
      error: `Invalid parameters: ${validation.errors.join(', ')}`
    };
  }
  
  // Fetch interview if interviewId provided, or use the one from context
  let interview = context.interview || null;
  if (!interview && context.interviewId) {
    interview = await prisma.userInterview.findUnique({
      where: { id: context.interviewId }
    });
  }
  
  console.log('[Executor] Interview available:', !!interview, interview?.id);
  
  // Execute the handler
  try {
    const result = await handler(parameters, {
      ...context,
      interview,
      prisma
    });
    
    // Log the action execution
    if (context.interviewId) {
      await prisma.interviewMessage.create({
        data: {
          interviewId: context.interviewId,
          role: 'FUNCTION',
          content: `Executed ${actionName}`,
          functionCall: { name: actionName, parameters },
          functionResult: result
        }
      });
    }
    
    return result;
  } catch (error) {
    console.error(`Error executing action ${actionName}:`, error);
    return {
      success: false,
      error: error.message || 'Action execution failed'
    };
  }
}

/**
 * Get all active actions formatted for AI function calling
 */
export async function getActionsForAI() {
  const actions = await prisma.botAction.findMany({
    where: { isActive: true },
    select: {
      name: true,
      description: true,
      parameters: true,
      example: true
    }
  });
  
  return actions.map(action => ({
    name: action.name,
    description: action.description,
    parameters: action.parameters,
    example: action.example
  }));
}

/**
 * Get specific actions by name formatted for AI
 */
export async function getActionsByName(names) {
  const actions = await prisma.botAction.findMany({
    where: {
      name: { in: names },
      isActive: true
    },
    select: {
      name: true,
      description: true,
      parameters: true,
      example: true
    }
  });
  
  return actions.map(action => ({
    name: action.name,
    description: action.description,
    parameters: action.parameters,
    example: action.example
  }));
}
