/**
 * Web Worker for Parallel Schedule Generation
 * 
 * Handles CPU-intensive foursome generation tasks in a separate thread
 * to avoid blocking the main UI thread.
 */

// Worker message handler
self.onmessage = function(event) {
  const { id, type, data } = event.data;
  
  try {
    switch (type) {
      case 'ping':
        handlePing(id);
        break;
      
      case 'generateFoursomes':
        handleGenerateFoursomes(id, data);
        break;
      
      default:
        sendError(id, `Unknown task type: ${type}`);
    }
  } catch (error) {
    sendError(id, error.message || 'Unknown worker error');
  }
};

/**
 * Handle ping test for worker initialization
 */
function handlePing(id) {
  sendResult(id, { status: 'pong', timestamp: Date.now() });
}

/**
 * Handle foursome generation task
 */
function handleGenerateFoursomes(id, playerChunks) {
  const startTime = Date.now();
  const results = [];
  
  try {
    // Process each player chunk
    for (const chunk of playerChunks) {
      const foursomes = generateFoursomesForChunk(chunk);
      
      results.push({
        foursomes: foursomes,
        processingTime: Date.now() - startTime,
        chunkId: chunk.chunkId,
        timeSlot: chunk.timeSlot
      });
    }
    
    sendResult(id, results);
  } catch (error) {
    sendError(id, `Foursome generation failed: ${error.message}`);
  }
}

/**
 * Generate foursomes for a single chunk of players
 */
function generateFoursomesForChunk(chunk) {
  const { players, timeSlot, chunkId, seasonId } = chunk;
  const foursomes = [];
  let position = 0;
  
  // Create complete foursomes (groups of 4)
  for (let i = 0; i < Math.floor(players.length / 4); i++) {
    const startIndex = i * 4;
    const foursomePlayers = players.slice(startIndex, startIndex + 4);
    
    const foursome = createFoursome(foursomePlayers, timeSlot, position++);
    foursomes.push(foursome);
  }
  
  // Handle remaining players (less than 4)
  const remainingCount = players.length % 4;
  if (remainingCount > 0) {
    const startIndex = Math.floor(players.length / 4) * 4;
    const remainingPlayers = players.slice(startIndex);
    
    const foursome = createFoursome(remainingPlayers, timeSlot, position++);
    foursomes.push(foursome);
  }
  
  return foursomes;
}

/**
 * Create a foursome object
 */
function createFoursome(players, timeSlot, position) {
  // Generate a unique ID for the foursome
  const id = `foursome-${timeSlot}-${position}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  return {
    id: id,
    players: players.map(player => ({
      id: player.id,
      firstName: player.firstName,
      lastName: player.lastName,
      timePreference: player.timePreference,
      seasonId: player.seasonId
    })),
    timeSlot: timeSlot,
    position: position,
    createdAt: new Date().toISOString()
  };
}

/**
 * Send successful result back to main thread
 */
function sendResult(id, result) {
  self.postMessage({
    id: id,
    result: result,
    error: null
  });
}

/**
 * Send error back to main thread
 */
function sendError(id, errorMessage) {
  self.postMessage({
    id: id,
    result: null,
    error: errorMessage
  });
}

/**
 * Utility function to validate player data
 */
function validatePlayer(player) {
  return player && 
         typeof player.id === 'string' && 
         typeof player.firstName === 'string' && 
         typeof player.lastName === 'string' &&
         ['AM', 'PM', 'Either'].includes(player.timePreference);
}

/**
 * Utility function to validate chunk data
 */
function validateChunk(chunk) {
  return chunk &&
         Array.isArray(chunk.players) &&
         typeof chunk.timeSlot === 'string' &&
         ['morning', 'afternoon'].includes(chunk.timeSlot) &&
         typeof chunk.chunkId === 'string' &&
         chunk.players.every(validatePlayer);
}

// Handle worker errors
self.onerror = function(error) {
  console.error('[ScheduleWorker] Worker error:', error);
};

// Log worker initialization
console.log('[ScheduleWorker] Schedule generation worker initialized');