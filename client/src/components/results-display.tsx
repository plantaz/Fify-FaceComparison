import { Card, CardContent } from "@/components/ui/card";
import { Check, X } from "lucide-react";
import { Download } from "lucide-react";
import { useLanguage } from "@/lib/language-context";
import { getTranslation } from "@shared/translations";
import { useMemo } from "react";

interface Result {
  imageId: number;
  similarity: number;
  matched: boolean;
  url?: string;
  driveUrl?: string;
  error?: string;
}

interface ResultsDisplayProps {
  results: Result[] | null;
}

// Deduplicate results, keeping only one entry per imageId (with highest similarity)
function getUniqueResults(results: Result[]): Result[] {
  if (!results || !Array.isArray(results)) return [];
  
  // Use a Map to track unique results by imageId
  const uniqueResults = new Map<number, Result>();
  
  // Keep only one result per imageId, favoring higher similarity scores
  for (const result of results) {
    if (!result.imageId) continue; // Skip invalid results
    
    const existingResult = uniqueResults.get(result.imageId);
    
    // Add if not exists, or replace if the similarity is higher
    if (!existingResult || (result.similarity > existingResult.similarity)) {
      uniqueResults.set(result.imageId, result);
    }
  }
  
  // Convert back to array
  return Array.from(uniqueResults.values());
}

function downloadCSV(results: Result[]) {
  const matchedResults = results.filter(r => r.matched);
  const csvContent = "Photo URL,Google Drive URL,Similarity %\n" + 
    matchedResults.map(r => `${r.url || ''},${r.driveUrl || ''},${r.similarity.toFixed(1)}`).join("\n");

  const blob = new Blob([csvContent], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'matched_faces.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

export default function ResultsDisplay({ results }: ResultsDisplayProps) {
  const { language } = useLanguage();
  
  // Use memoized deduplicated results
  const uniqueResults = useMemo(() => {
    return results ? getUniqueResults(results) : null;
  }, [results]);
  
  if (!uniqueResults) {
    return (
      <div className="text-center">
        <p className="text-muted-foreground">
          {getTranslation("results.noResultsAvailable", language)}
        </p>
      </div>
    );
  }

  const matchedCount = uniqueResults.filter(r => r.matched).length;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold mb-2">
          {getTranslation("results.analysisComplete", language)}
        </h2>
        <p className="text-muted-foreground">
          {getTranslation("results.foundMatches", language, {
            matchCount: matchedCount,
            totalCount: uniqueResults.length
          })}
        </p>
      </div>

      <div className="grid gap-4">
        <div className="flex justify-between items-center">
          <h3 className="text-xl font-semibold mb-2">
            {getTranslation("results.matchedImages", language)}
          </h3>
          <button 
            onClick={() => downloadCSV(uniqueResults)} 
            className="bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold py-2 px-4 rounded inline-flex items-center"
          >
            <Download className="h-5 w-5 mr-2"/>
            {getTranslation("results.downloadCSV", language)}
          </button>
        </div>
        {uniqueResults.filter(r => r.matched).map((result) => (
          <Card key={result.imageId}>
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <a 
                  href={result.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-primary hover:underline"
                >
                  {getTranslation("results.image", language, { id: result.imageId })}
                </a>
                <p className="text-sm text-muted-foreground">
                  {getTranslation("results.similarityPercentage", language, { value: result.similarity.toFixed(1) })}
                </p>
              </div>
              <Check className="h-6 w-6 text-green-500" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}