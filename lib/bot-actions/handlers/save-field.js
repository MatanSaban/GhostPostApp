/**
 * Save Field Handler
 * 
 * Saves a user response to a specific field in the interview data.
 */

export async function saveField(params, context) {
  const { field, value } = params;
  
  if (!context.interview) {
    return {
      success: false,
      error: 'No active interview session'
    };
  }
  
  try {
    // Get existing responses
    const existingResponses = context.interview.responses || {};
    
    // Update the field
    const updatedResponses = {
      ...existingResponses,
      [field]: value
    };
    
    // Save to database
    await context.prisma.userInterview.update({
      where: { id: context.interview.id },
      data: {
        responses: updatedResponses
      }
    });
    
    return {
      success: true,
      field,
      value
    };
    
  } catch (error) {
    console.error('Save field error:', error);
    return {
      success: false,
      error: error.message || 'Failed to save field'
    };
  }
}
