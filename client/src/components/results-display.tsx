import { Card, CardContent } from "@/components/ui/card";
import { Check, X } from "lucide-react";
import { Download } from "lucide-react";

interface Result {
  imageId: number;
  similarity: number;
  matched: boolean;
  url: string;
  driveUrl: string;
}

interface ResultsDisplayProps {
  results: Result[] | null;
}

function downloadCSV(results: Result[]) {
  const matchedResults = results.filter(r => r.matched);
  const csvContent = "Photo URL,Google Drive URL,Similarity %\n" + 
    matchedResults.map(r => `${r.url},${r.driveUrl},${r.similarity.toFixed(1)}`).join("\n");

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
  if (!results) {
    return (
      <div className="text-center">
        <p className="text-muted-foreground">No results available</p>
      </div>
    );
  }

  const matchedCount = results.filter(r => r.matched).length;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold mb-2">
          Analysis Complete
        </h2>
        <p className="text-muted-foreground">
          Found {matchedCount} matches in {results.length} images
        </p>
      </div>

      <div className="grid gap-4">
        <div className="flex justify-between items-center">
          <h3 className="text-xl font-semibold mb-2">Matched Images</h3>
          <button onClick={() => downloadCSV(results)} className="bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold py-2 px-4 rounded inline-flex items-center">
            <Download className="h-5 w-5 mr-2"/>
            Download CSV
          </button>
        </div>
        {results.filter(r => r.matched).map((result) => (
          <Card key={result.imageId}>
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <a 
                  href={result.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-primary hover:underline"
                >
                  Image #{result.imageId}
                </a>
                <p className="text-sm text-muted-foreground">
                  {result.similarity.toFixed(1)}% similarity
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