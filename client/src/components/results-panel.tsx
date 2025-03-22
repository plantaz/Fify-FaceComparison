import React, { useMemo } from 'react';
import { cn } from '../lib/utils';

// Fix any potential duplication in the displayed results
const getUniqueResults = (results: ScanResult[]) => {
  if (!results || !Array.isArray(results)) return [];
  
  // Use a Map to track unique results by imageId
  const uniqueResults = new Map<number, ScanResult>();
  
  // Keep only one result per imageId, favoring higher similarity scores
  for (const result of results) {
    const existingResult = uniqueResults.get(result.imageId);
    
    // Add if not exists, or replace if the similarity is higher
    if (!existingResult || (result.similarity > existingResult.similarity)) {
      uniqueResults.set(result.imageId, result);
    }
  }
  
  // Convert back to array and sort
  return Array.from(uniqueResults.values()).sort((a, b) => {
    if (b.matched === a.matched) {
      // For matched items, sort by similarity (descending)
      if (a.matched) {
        return b.similarity - a.similarity;
      }
      // For non-matched items, sort by imageId
      return a.imageId - b.imageId;
    }
    // Always show matches first
    return b.matched ? 1 : -1;
  });
};

// Use the deduplicated results in the render function
const sortedResults = useMemo(() => {
  return getUniqueResults(scanJob?.results || []);
}, [scanJob?.results]);

// Replace the existing sortedResults in the render function
return (
  <div className="flex flex-col gap-4 mt-4">
    {/* Existing code... */}
    {sortedResults.map((result) => (
      <div
        key={result.imageId} // Ensure we use a unique key
        className={cn(
          "flex items-center justify-between p-4 border rounded-md",
          result.matched
            ? "border-green-500 bg-green-50 dark:bg-green-950 dark:border-green-900"
            : "border-gray-200 dark:border-gray-800"
        )}
      >
        {/* Rest of the component... */}
      </div>
    ))}
  </div>
); 