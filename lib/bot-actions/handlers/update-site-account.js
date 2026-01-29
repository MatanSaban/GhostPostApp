/**
 * Update Site Account Handler
 * 
 * Updates fields on an existing site account.
 */

export async function updateSiteAccount(params, context) {
  const { siteId, fields } = params;
  
  // Use provided siteId or get from interview
  const targetSiteId = siteId || context.interview?.siteId;
  
  if (!targetSiteId) {
    return {
      success: false,
      error: 'No site account ID provided or found in interview'
    };
  }
  
  if (!fields || typeof fields !== 'object' || Object.keys(fields).length === 0) {
    return {
      success: false,
      error: 'No fields provided to update'
    };
  }
  
  try {
    // Verify site exists
    const site = await context.prisma.site.findUnique({
      where: { id: targetSiteId }
    });
    
    if (!site) {
      return {
        success: false,
        error: 'Site not found'
      };
    }
    
    // Filter allowed fields
    const allowedFields = ['name', 'domain', 'language', 'timezone', 'settings'];
    const updateData = {};
    
    for (const [key, value] of Object.entries(fields)) {
      if (allowedFields.includes(key)) {
        updateData[key] = value;
      } else if (key === 'phone' || key === 'email' || key === 'address' || key === 'platform') {
        // Store these in settings
        updateData.settings = {
          ...(site.settings || {}),
          ...(updateData.settings || {}),
          [key]: value
        };
      }
    }
    
    if (Object.keys(updateData).length === 0) {
      return {
        success: false,
        error: 'No valid fields to update'
      };
    }
    
    // Update site
    await context.prisma.site.update({
      where: { id: targetSiteId },
      data: updateData
    });
    
    return {
      success: true,
      siteId: targetSiteId,
      updatedFields: Object.keys(updateData)
    };
    
  } catch (error) {
    console.error('Update site account error:', error);
    return {
      success: false,
      error: error.message || 'Failed to update site account'
    };
  }
}
